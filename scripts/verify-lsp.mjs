#!/usr/bin/env node
/**
 * End-to-end verification of the LSP integration (src/lsp.ts + Rust transport
 * contract). Runs the REAL client code — transpiled from TypeScript — against:
 *
 *   1. `scripts/fake-lsp.mjs`: protocol conformance — handshake, server→client
 *      request answered, split/batched frames, incremental didChange encoding,
 *      diagnostics → store mapping, graceful shutdown, crash recovery.
 *   2. The real `clangd` on PATH (when installed): a broken C file must yield
 *      real diagnostics through the whole pipeline.
 *   3. Optional `rust-analyzer` smoke test (skipped politely when absent).
 *
 * The Tauri `invoke`/`listen` surface is backed by a small in-process shim
 * that spawns real child processes — the same contract the Rust backend
 * implements (`lsp_probe`, `lsp_start`, `lsp_write`, `lsp_stop`,
 * `neo:lsp-bytes`, `neo:lsp-exit`).
 *
 * Usage: node scripts/verify-lsp.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "scripts", ".lsp-tmp");

// ─── assertion helpers ───────────────────────────────────────────────────────
let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  PASS ${msg}`);
  } else {
    failures.push(msg);
    console.log(`  FAIL ${msg}`);
  }
}
function section(name) {
  console.log(`\n== ${name}`);
}
async function waitFor(cond, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 30));
  }
}
const readJsonl = (p) =>
  fs.existsSync(p)
    ? fs
        .readFileSync(p, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

// ─── transpile the real client ───────────────────────────────────────────────
const ts = require("typescript");
function compile(srcRel, outRel) {
  const src = fs.readFileSync(path.join(root, srcRel), "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const dest = path.join(tmp, outRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}

fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(path.join(tmp, "components"), { recursive: true });
// The repo is `"type": "module"`; inside the sandbox plain `.js` must be CJS
// so Node's extension-less resolution (`./components/logBus`) finds our files.
fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"commonjs"}\n');
compile("src/lsp.ts", "lsp.js");
compile("src/diagnostics.ts", "diagnostics.js");
compile("src/components/highlight.ts", "components/highlight.js");

// logBus shim — records entries so tests can assert on client logging.
fs.writeFileSync(
  path.join(tmp, "components", "logBus.js"),
  `const entries = [];
function logToBus(channel, message) { entries.push({ channel, message, time: Date.now() }); }
module.exports = {
  logToBus,
  entries,
  subscribeLogs(fn) { entries.forEach(fn); return () => {}; },
  clearLog() { entries.length = 0; },
};
`
);

// ─── module hooks: react + @tauri-apps/api backed by the harness ─────────────
const Module = require("module");

const eventBus = new Map(); // event name → Set<cb>
function emitEvent(name, payload) {
  for (const cb of eventBus.get(name) ?? []) cb({ payload });
}
const busListen = (name, cb) => {
  if (!eventBus.has(name)) eventBus.set(name, new Set());
  eventBus.get(name).add(cb);
  return () => eventBus.get(name)?.delete(cb);
};

/** In-process stand-in for the Rust commands (same contract). */
const procs = new Map(); // id → ChildProcess
const probeOverride = new Map(); // command → resolved path | null (forced)

function realProbe(command, wsRoot) {
  const exts =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const dirs = [];
  if (wsRoot) dirs.push(path.join(wsRoot, "node_modules", ".bin"));
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, "npm"));
  if (process.env.USERPROFILE)
    dirs.push(path.join(process.env.USERPROFILE, ".cargo", "bin"));
  dirs.push(...(process.env.PATH || "").split(path.delimiter));
  for (const d of dirs) {
    if (!d) continue;
    for (const e of exts) {
      const p = path.join(d, command + e);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

async function backendInvoke(cmd, args) {
  // Trace transport calls so hangs are diagnosable after the fact.
  try {
    fs.appendFileSync(
      path.join(tmp, "invoke-log.jsonl"),
      JSON.stringify({
        t: Date.now(),
        cmd,
        id: args?.id,
        command: args?.command,
        textLen: args?.text?.length,
        procsNow: [...procs.keys()],
      }) + "\n"
    );
  } catch {
    /* tracing is best-effort */
  }
  switch (cmd) {
    case "lsp_probe": {
      if (probeOverride.has(args.command)) return probeOverride.get(args.command);
      return realProbe(args.command, args.root);
    }
    case "lsp_start": {
      let prog = args.command;
      let a = [...(args.args ?? [])];
      if (/\.(mjs|cjs)$/.test(prog)) {
        a = [prog, ...a];
        prog = process.execPath;
      }
      const child = spawn(prog, a, {
        cwd: args.cwd && fs.existsSync(args.cwd) ? args.cwd : undefined,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, FAKE_LSP_LOG: path.join(tmp, "fake-lsp-log.jsonl") },
      });
      procs.set(args.id, child);
      try {
        fs.appendFileSync(
          path.join(tmp, "invoke-log.jsonl"),
          JSON.stringify({ t: Date.now(), event: "spawn", id: args.id, pid: child.pid }) + "\n"
        );
      } catch {
        /* ignore */
      }
      child.stdout.on("data", (b) =>
        emitEvent("neo:lsp-bytes", {
          id: args.id,
          data: Array.from(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)),
        })
      );
      let errTail = "";
      child.stderr.on("data", (b) => {
        errTail = (errTail + b.toString("utf8")).slice(-4000);
      });
      const reportExit = () => {
        if (!procs.has(args.id)) return;
        procs.delete(args.id);
        try {
          fs.appendFileSync(
            path.join(tmp, "invoke-log.jsonl"),
            JSON.stringify({ t: Date.now(), event: "exit", id: args.id, pid: child.pid }) + "\n"
          );
        } catch {
          /* ignore */
        }
        emitEvent("neo:lsp-exit", {
          id: args.id,
          detail: `The server exited.${errTail ? ` stderr:\n${errTail}` : ""}`,
        });
      };
      child.on("close", reportExit);
      child.on("error", reportExit);
      // Mirror Rust's `Command::spawn()`: don't report success until the child
      // is actually up. Otherwise a fast follow-up write can race a child that
      // never exec'd (ERR_STREAM_DESTROYED) — which the real backend can't do.
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", (e) => reject(new Error(`spawn failed: ${e.message}`)));
      });
      return null;
    }
    case "lsp_write": {
      const child = procs.get(args.id);
      if (!child) throw new Error(`LSP server ${args.id} is not running`);
      try {
        child.stdin.write(args.text, "utf8");
      } catch (e) {
        try {
          fs.appendFileSync(
            path.join(tmp, "invoke-log.jsonl"),
            JSON.stringify({
              t: Date.now(),
              event: "write-throw",
              id: args.id,
              pid: child.pid,
              code: e?.code ?? null,
              message: String(e?.message ?? e),
              destroyed: child.stdin.destroyed,
              exitCode: child.exitCode,
              killed: child.killed,
            }) + "\n"
          );
        } catch {
          /* ignore */
        }
        throw e;
      }
      return null;
    }
    case "lsp_stop": {
      const child = procs.get(args.id);
      if (child) {
        procs.delete(args.id);
        child.kill();
      }
      return null;
    }
    default:
      throw new Error(`unimplemented invoke in harness: ${cmd}`);
  }
}

const reactShim = {
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (v) => ({ current: v }),
  useState: (v) => [typeof v === "function" ? v() : v, () => {}],
  useMemo: (fn) => fn(),
  useSyncExternalStore: (_sub, get) => get(),
  useDeferredValue: (v) => v,
  default: {},
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "react") return reactShim;
  if (request === "@tauri-apps/api/core")
    return { invoke: (cmd, args) => backendInvoke(cmd, args ?? {}) };
  if (request === "@tauri-apps/api/event") return { listen: busListen };
  return origLoad.apply(this, arguments);
};

const diag = require(path.join(tmp, "diagnostics.js"));
const lsp = require(path.join(tmp, "lsp.js"));
const logBus = require(path.join(tmp, "components", "logBus.js"));

const lspItems = (file) =>
  diag.getFileDiagnostics(file).filter((d) => d.source === "lsp");
const neoItems = (file) =>
  diag.getFileDiagnostics(file).filter((d) => d.source === "neo");
const statusOf = (id) => lsp.getLspStatuses().find((s) => s.id === id) ?? null;

// ─── scenarios ───────────────────────────────────────────────────────────────
const FAKE = path.join(root, "scripts", "fake-lsp.mjs");
const work = path.join(tmp, "ws");
fs.mkdirSync(work, { recursive: true });

async function uriRoundTripTests() {
  section("file:// URI round-trips");
  const cases = [
    ["C:\\proj\\src\\app.ts", "file:///c:/proj/src/app.ts"],
    ["/home/me/x.rs", "file:///home/me/x.rs"],
    ["C:\\my dir\\a b.ts", "file:///c:/my%20dir/a%20b.ts"],
    ["\\\\srv\\share\\f.go", "file://srv/share/f.go"],
  ];
  // Normalize like the store: separators and drive-letter case must not
  // distinguish two spellings of the same path.
  const normPath = (s) =>
    s.replace(/\//g, "\\").replace(/^([A-Za-z]:)/, (m, d) => d.toLowerCase());
  for (const [p, uri] of cases) {
    ok(lsp.pathToUri(p) === uri, `pathToUri(${JSON.stringify(p)}) = ${uri}`);
    const back = lsp.uriToPath(uri);
    ok(normPath(back) === normPath(p),
      `uriToPath round-trips ${JSON.stringify(p)} → ${JSON.stringify(back)}`);
  }
}

/** Phase 1+2: full lifecycle against scripts/fake-lsp.mjs. */
async function fakeServerScenario() {
  section("fake server: handshake, sync, diagnostics, shutdown");
  const fakeLog = path.join(tmp, "fake-lsp-log.jsonl");
  fs.rmSync(fakeLog, { force: true });
  probeOverride.set("typescript-language-server", FAKE);

  const file = path.join(work, "main.ts");
  const text1 = "const x = 1\n";
  fs.writeFileSync(file, text1, "utf8");

  // Structural findings present BEFORE the server attaches — didOpen must
  // retire them once the server takes the file over.
  diag.publishDiagnostics(
    file,
    [{ line: 1, col: 1, severity: "error", code: "neo-unclosed-bracket", message: "local", source: "neo" }],
    "neo"
  );
  ok(neoItems(file).length === 1, "structural (neo) finding published before open");

  lsp.lspSetWorkspace(work);
  const managed = await lsp.lspDocOpen(file, text1);
  ok(managed === true, "lspDocOpen resolves true (fake server took the file)");
  ok(lsp.lspManages(file) === true, "lspManages → true while ready");
  ok(neoItems(file).length === 0, "didOpen retired the structural fallback");
  const st = statusOf("ts");
  ok(st?.state === "ready", `status store shows ts server ready (got ${st?.state})`);

  const entries = () => readJsonl(fakeLog);
  const find = (fn) => entries().find(fn);

  // initialize handshake
  const init = find((e) => e.received?.method === "initialize");
  ok(!!init, "server received initialize");
  ok(
    init?.received?.params?.rootUri === lsp.pathToUri(work),
    `initialize rootUri = ${init?.received?.params?.rootUri}`
  );
  ok(
    find((e) => e.received?.method === "initialized") !== undefined,
    "server received initialized notification"
  );
  // The notify is fire-and-forget — wait until the server actually receives.
  const didOpen = await waitFor(
    () => find((e) => e.received?.method === "textDocument/didOpen") ?? null,
    5000,
    "didOpen at server"
  );
  ok(
    didOpen?.received?.params?.textDocument?.languageId === "typescript" &&
      didOpen?.received?.params?.textDocument?.version === 1 &&
      didOpen?.received?.params?.textDocument?.text === text1,
    "didOpen carries languageId/version/text"
  );

  // server→client request must be answered with the same id
  const reg = await waitFor(
    () => find((e) => e.sentRegisterId !== undefined) ?? null,
    5000,
    "registerCapability sent by server"
  );
  ok(!!reg, "server sent client/registerCapability request");
  const answered = await waitFor(
    () =>
      entries().find(
        (e) =>
          e.clientResponse !== undefined &&
          e.clientResponse.id === reg.sentRegisterId &&
          "result" in e.clientResponse
      ) ?? null,
    5000,
    "client response to registerCapability"
  );
  ok(!!answered, "client answered the server's registerCapability request");

  // diagnostics published via SPLIT writes (header torn mid-line)
  await waitFor(() => lspItems(file).length === 1, 5000, "lsp diagnostics from split frame");
  const d1 = lspItems(file)[0];
  ok(
    d1.line === 1 && d1.col === 1 && d1.severity === "error" &&
      d1.code === "FAKE1" && d1.message === "fake error",
    `diagnostic mapped: L${d1.line}:C${d1.col} ${d1.severity} ${d1.code} "${d1.message}"`
  );

  // didChange: incremental encoding must cover the whole previous buffer
  const text2 = "const x = 1 // MORE"; // 19 chars, no trailing newline
  lsp.lspDocChange(file, text2);
  await waitFor(
    () => find((e) => e.received?.method === "textDocument/didChange") !== undefined,
    5000,
    "debounced didChange"
  );
  const change = find((e) => e.received?.method === "textDocument/didChange");
  const cc = change?.received?.params?.contentChanges ?? [];
  ok(cc.length === 1, "didChange sent a single content change");
  ok(
    cc[0]?.range !== undefined &&
      cc[0].range.start.line === 0 && cc[0].range.start.character === 0 &&
      cc[0].range.end.line === 1 && cc[0].range.end.character === 0 &&
      cc[0]?.text === text2,
    `incremental range covers previous buffer: ${JSON.stringify(cc[0]?.range)}`
  );
  ok(
    change?.received?.params?.textDocument?.version === 2,
    "didChange bumps version to 2"
  );
  // diagnostics echo (chars:19) proves change → server → store round trip
  await waitFor(
    () => lspItems(file)[0]?.message === "chars:19",
    5000,
    "post-change diagnostic"
  );
  ok(
    logBus.entries.some((e) => e.message.includes("fake: deliberate error line")),
    "batched window/logMessage frames both processed (error line logged)"
  );

  // didSave / didClose
  lsp.lspDocSave(file);
  await waitFor(
    () => find((e) => e.received?.method === "textDocument/didSave") !== undefined,
    5000,
    "didSave"
  );
  ok(true, "server received didSave");
  lsp.lspDocClose(file);
  await waitFor(
    () => find((e) => e.received?.method === "textDocument/didClose") !== undefined,
    5000,
    "didClose"
  );
  ok(true, "server received didClose");

  // graceful shutdown: shutdown request → exit notification
  lsp.lspSetWorkspace(null);
  await waitFor(
    () =>
      find((e) => e.received?.method === "shutdown") !== undefined &&
      find((e) => e.received?.method === "exit") !== undefined,
    5000,
    "shutdown + exit"
  );
  ok(true, "graceful shutdown sequence (shutdown → exit) received");
  await waitFor(() => procs.size === 0, 5000, "server process gone");
  ok(true, "server process stopped");
  ok(
    lspItems(file).length === 0,
    "lsp findings cleared after workspace switch"
  );
}

/** Phase: server crash must clear findings, explain itself, and back off. */
async function crashScenario() {
  section("fake server: crash clears findings + status");
  const file = path.join(work, "crash.ts");
  const text = "let a = 1\n";
  fs.writeFileSync(file, text, "utf8");
  lsp.lspSetWorkspace(work);
  const managed = await lsp.lspDocOpen(file, text);
  const tsStatus = statusOf("ts");
  ok(
    managed === true,
    `server attached for crash-test file (status=${tsStatus?.state} detail=${tsStatus?.detail ?? "none"})`
  );
  if (managed !== true) {
    console.log(
      "  last log lines:",
      JSON.stringify(logBus.entries.slice(-6), null, 2)
    );
    return;
  }
  await waitFor(() => lspItems(file).length === 1, 5000, "diagnostics before crash");
  ok(true, "diagnostics present before crash");

  // Process ids are per-instance (`ts#N`) — find ours by prefix.
  const entry = [...procs.entries()].find(([k]) => k.startsWith("ts#"));
  const child = entry?.[1];
  ok(!!child, `fake process handle available (${entry?.[0]})`);
  child?.kill(); // simulate a hard crash
  await waitFor(() => statusOf("ts")?.state === "failed", 5000, "status → failed");
  ok(true, "status store reports failed after crash");
  ok(lspItems(file).length === 0, "lsp findings cleared after crash");
  ok(lsp.lspManages(file) === false, "lspManages → false after crash");
  ok(
    logBus.entries.some((e) => e.message.includes("server stopped")),
    "crash reason logged to the Problems bus"
  );

  // The auto-restart timer must not fire after the workspace changes.
  lsp.lspSetWorkspace(null);
  await new Promise((r) => setTimeout(r, 1800));
  ok(procs.size === 0, "no restart after workspace shutdown (epoch guard)");
}

/** Phase: language with no server installed degrades gracefully. */
async function missingServerScenario() {
  section("missing server: graceful fallback + install hint");
  probeOverride.set("pyright-langserver", null);
  probeOverride.set("jedi-language-server", null);
  probeOverride.set("pylsp", null);
  lsp.lspSetWorkspace(work);
  const file = path.join(work, "script.py");
  const text = "def f(:\n";
  fs.writeFileSync(file, text, "utf8");
  const managed = await lsp.lspDocOpen(file, text);
  ok(managed === false, "lspDocOpen resolves false when no server installed");
  const st = statusOf("python");
  ok(st?.state === "missing", `status = missing (got ${st?.state})`);
  ok(st?.detail === "npm i -g pyright", `install hint attached (${st?.detail})`);
  ok(lsp.lspHintFor(file) === "npm i -g pyright", "lspHintFor returns install hint");
  ok(
    logBus.entries.some((e) => e.message.includes("No Python language server")),
    "missing-server hint logged to the Problems bus"
  );
  // The structural fallback still covers the file (publish is the app's job;
  // here we only prove LSP did not take ownership).
  ok(lsp.lspManages(file) === false, "lspManages → false (quickScan stays active)");
  lsp.lspSetWorkspace(null);
}

/** Phase: the real clangd on PATH, end to end. */
async function clangdScenario() {
  section("real clangd (installed on this machine)");
  if (process.env.ONLY_FAKE) {
    console.log("  SKIP (ONLY_FAKE=1)");
    return;
  }
  const clangd = realProbe("clangd", null);
  if (!clangd) {
    console.log("  SKIP clangd not found on PATH");
    return;
  }
  const dir = path.join(tmp, "cws");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "bad.c");
  const text = "int main(void) {\n  int x = 1\n  retrun 0;\n}\n";
  fs.writeFileSync(file, text, "utf8");
  lsp.lspSetWorkspace(dir);
  try {
    const managed = await lsp.lspDocOpen(file, text);
    ok(managed === true, `clangd took the file (${clangd})`);
    const items = await waitFor(
      () => (lspItems(file).length > 0 ? lspItems(file) : null),
      30_000,
      "clangd diagnostics"
    );
    ok(items.length >= 1, `clangd produced ${items.length} diagnostic(s)`);
    const msgs = items.map((i) => i.message).join(" | ");
    ok(
      /expected|undeclared|use of|extraneous/i.test(msgs),
      `real C errors surfaced: ${msgs.slice(0, 140)}`
    );
    ok(statusOf("c-cpp")?.state === "ready", "c-cpp status ready");
    ok(lsp.lspManages(file) === true, "lspManages → true under clangd");
  } catch (e) {
    ok(false, `clangd flow failed: ${e.message}`);
  }
  lsp.lspSetWorkspace(null);
}

/** Phase: rust-analyzer smoke test — optional, never fails the run. */
async function rustAnalyzerScenario() {
  section("real rust-analyzer (optional smoke)");
  if (process.env.ONLY_FAKE) {
    console.log("  SKIP (ONLY_FAKE=1)");
    return;
  }
  const ra = realProbe("rust-analyzer", null);
  if (!ra) {
    console.log("  SKIP rust-analyzer not found");
    return;
  }
  const dir = path.join(tmp, "rws");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "bad.rs");
  const text = "fn main() {\n    let x = ;\n}\n";
  fs.writeFileSync(file, text, "utf8");
  lsp.lspSetWorkspace(dir);
  try {
    const managed = await lsp.lspDocOpen(file, text);
    const st = statusOf("rust");
    if (!managed && st?.state === "failed") {
      // e.g. a rustup shim whose toolchain lacks the rust-analyzer component.
      console.log(`  SKIP rust-analyzer unavailable: ${st.detail}`);
      return;
    }
    ok(managed === true, `rust-analyzer took the file (${ra})`);
    const items = await waitFor(
      () => (lspItems(file).length > 0 ? lspItems(file) : null),
      45_000,
      "rust-analyzer diagnostics"
    );
    ok(items.length >= 1, `rust-analyzer produced ${items.length} diagnostic(s)`);
    const msgs = items.map((i) => i.message).join(" | ");
    ok(
      /expected|syntax|missing/i.test(msgs),
      `real Rust errors surfaced: ${msgs.slice(0, 140)}`
    );
  } catch (e) {
    console.log(`  SKIP rust-analyzer smoke failed (non-fatal): ${e.message}`);
  }
  lsp.lspSetWorkspace(null);
}

// ─── run ─────────────────────────────────────────────────────────────────────
async function main() {
  try {
    await uriRoundTripTests();
    await fakeServerScenario();
    await crashScenario();
    await missingServerScenario();
    await clangdScenario();
    await rustAnalyzerScenario();
  } catch (e) {
    failures.push(`unexpected error: ${e instanceof Error ? e.message : String(e)}`);
    console.error(e);
  }

  // Teardown: kill survivors, then report.
  lsp.lspShutdown();
  await new Promise((r) => setTimeout(r, 300));
  for (const [, c] of procs) {
    try {
      c.kill();
    } catch {
      /* already dead */
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  FAIL: ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

await main();

