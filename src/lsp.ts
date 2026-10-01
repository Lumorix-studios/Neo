/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
/**
 * Language Server Protocol client.
 * Division of labour with the backend (`src-tauri/src/lib.rs`):
 *   • Backend spawns the server on stdio and streams raw stdout bytes as
 *     `neo:lsp-bytes` events; writes go through `lsp_write` as exact strings.
 *   • This module owns everything protocol-shaped: Content-Length framing,
 *     JSON-RPC, the initialize handshake, document sync, and mapping
 *     `textDocument/publishDiagnostics` into the diagnostics store.
 *
 * Servers are discovered at runtime (`lsp_probe`); a language with no server
 * installed degrades gracefully — the instant structural `quickScan` findings
 * (source `"neo"`) keep covering the file, and the status store surfaces an
 * install hint.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logToBus } from "./components/logBus";
import {
  normalizePath,
  publishDiagnostics,
  type FileDiagnostic,
} from "./diagnostics";
import { langOf } from "./components/highlight";

// ─── Server registry ─────────────────────────────────────────────────────────

interface ServerVariant {
  command: string;
  args: string[];
}

interface ServerSpec {
  /** Stable id — also the process id shared with the backend. */
  id: string;
  /** Human label for status chips / logs. */
  label: string;
  /** Candidate executables, probed in order (first installed wins). */
  variants: ServerVariant[];
  /** Shown when no variant is installed. */
  hint: string;
}

function spec(
  id: string,
  label: string,
  variants: ServerVariant[],
  hint: string
): ServerSpec {
  return { id, label, variants, hint };
}

const TS_SPEC = spec(
  "ts",
  "TypeScript",
  [{ command: "typescript-language-server", args: ["--stdio"] }],
  "npm i -g typescript-language-server"
);
const PY_SPEC = spec(
  "python",
  "Python",
  [
    { command: "pyright-langserver", args: ["--stdio"] },
    { command: "jedi-language-server", args: [] },
    { command: "pylsp", args: [] },
  ],
  "npm i -g pyright"
);
const RUST_SPEC = spec(
  "rust",
  "Rust",
  [{ command: "rust-analyzer", args: [] }],
  "rustup component add rust-analyzer"
);
const GO_SPEC = spec(
  "go",
  "Go",
  [{ command: "gopls", args: [] }],
  "go install golang.org/x/tools/gopls@latest"
);
const C_SPEC = spec(
  "c-cpp",
  "C/C++",
  [{ command: "clangd", args: [] }],
  "Install LLVM/clangd (https://llvm.org)"
);
const SHELL_SPEC = spec(
  "shell",
  "Shell",
  [{ command: "bash-language-server", args: ["start"] }],
  "npm i -g bash-language-server"
);
const YAML_SPEC = spec(
  "yaml",
  "YAML",
  [{ command: "yaml-language-server", args: ["--stdio"] }],
  "npm i -g yaml-language-server"
);
const JSON_SPEC = spec(
  "json",
  "JSON",
  [{ command: "vscode-json-languageserver", args: ["--stdio"] }],
  "npm i -g vscode-langservers-extracted"
);
const CSS_SPEC = spec(
  "css",
  "CSS",
  [{ command: "vscode-css-languageserver", args: ["--stdio"] }],
  "npm i -g vscode-langservers-extracted"
);
const HTML_SPEC = spec(
  "html",
  "HTML",
  [{ command: "vscode-html-language-server", args: ["--stdio"] }],
  "npm i -g vscode-langservers-extracted"
);
const PHP_SPEC = spec(
  "php",
  "PHP",
  [{ command: "intelephense", args: ["--stdio"] }],
  "npm i -g intelephense"
);
const MD_SPEC = spec(
  "markdown",
  "Markdown",
  [
    { command: "marksman", args: ["server"] },
    { command: "vscode-markdown-languageserver", args: ["--stdio"] },
  ],
  "winget install marksman  (or: npm i -g vscode-markdown-languageserver)"
);
const RUBY_SPEC = spec(
  "ruby",
  "Ruby",
  [{ command: "ruby-lsp", args: [] }],
  "gem install ruby-lsp"
);

/** Language (as reported by `langOf`) → server spec. */
const SERVERS: Record<string, ServerSpec> = {
  typescript: TS_SPEC,
  javascript: TS_SPEC,
  json: JSON_SPEC,
  jsonc: JSON_SPEC,
  css: CSS_SPEC,
  scss: CSS_SPEC,
  less: CSS_SPEC,
  html: HTML_SPEC,
  python: PY_SPEC,
  rust: RUST_SPEC,
  go: GO_SPEC,
  c: C_SPEC,
  cpp: C_SPEC,
  shell: SHELL_SPEC,
  yaml: YAML_SPEC,
  markdown: MD_SPEC,
  php: PHP_SPEC,
  ruby: RUBY_SPEC,
};

/** File extension → LSP `languageId` (differs from `langOf` for TSX/JSX). */
const LANG_ID_BY_EXT: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascriptreact",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  py: "python",
  pyw: "python",
  rs: "rust",
  go: "go",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  markdown: "markdown",
  php: "php",
  rb: "ruby",
};

function specFor(path: string): ServerSpec | null {
  return SERVERS[langOf(path)] ?? null;
}

function lspLangId(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANG_ID_BY_EXT[ext] ?? langOf(path);
}

// ─── Status store (mirrors the diagnostics-store pattern) ────────────────────

export type LspServerState =
  | "starting"
  | "ready"
  | "missing"
  | "failed"
  | "stopped";

export interface LspServerStatus {
  id: string;
  label: string;
  state: LspServerState;
  /** Failure detail or install hint, whichever applies. */
  detail?: string;
  /** Number of open documents this server manages. */
  docs: number;
}

const statusById = new Map<string, LspServerStatus>();
const statusListeners = new Set<() => void>();
let statusCache: LspServerStatus[] = [];

function setStatus(s: LspServerStatus): void {
  statusById.set(s.id, s);
  statusCache = [...statusById.values()];
  for (const l of statusListeners) l();
}

function patchStatus(id: string, patch: Partial<LspServerStatus>): void {
  const cur = statusById.get(id);
  if (cur) setStatus({ ...cur, ...patch });
}

/** Subscribe to status changes (used with `useSyncExternalStore`). */
export function subscribeLspStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}

/** Stable snapshot of all known language-server states. */
export function getLspStatuses(): LspServerStatus[] {
  return statusCache;
}

// ─── Content-Length framing ──────────────────────────────────────────────────

const utf8 = new TextDecoder("utf-8");

/**
 * Incremental `Content-Length` frame parser. Feed it raw chunks in whatever
 * size the pipe delivers — frames may be split across chunks or several
 * frames may arrive at once.
 */
class FrameParser {
  // Explicit `Uint8Array` annotation: bare `new Uint8Array(0)` would infer
  // `Uint8Array<ArrayBuffer>`, which rejects chunks typed `ArrayBufferLike`.
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    if (this.buf.length === 0) {
      this.buf = chunk;
    } else {
      const next = new Uint8Array(this.buf.length + chunk.length);
      next.set(this.buf);
      next.set(chunk, this.buf.length);
      this.buf = next;
    }
    const out: unknown[] = [];
    for (;;) {
      const hdr = this.findHeaderEnd();
      if (!hdr) break;
      const headerText = utf8.decode(this.buf.subarray(0, hdr.end));
      let length = -1;
      for (const line of headerText.split(/\r?\n/)) {
        const m = /^content-length:\s*(\d+)\s*$/i.exec(line);
        if (m) length = parseInt(m[1], 10);
      }
      if (length < 0) {
        // Not a valid frame — drop the header block and resync rather than
        // poisoning every message after it.
        this.buf = this.buf.subarray(hdr.end);
        continue;
      }
      if (this.buf.length < hdr.body + length) break; // body incomplete
      const body = utf8.decode(
        this.buf.subarray(hdr.body, hdr.body + length)
      );
      this.buf = this.buf.subarray(hdr.body + length);
      try {
        out.push(JSON.parse(body));
      } catch {
        // A malformed body must not take down the connection.
      }
    }
    return out;
  }

  /** Locate the end of the header block (`\r\n\r\n` or `\n\n`). */
  private findHeaderEnd(): { end: number; body: number } | null {
    const b = this.buf;
    for (let i = 0; i < b.length; i++) {
      if (b[i] !== 10) continue;
      if (i + 1 >= b.length) return null; // need more bytes
      if (b[i + 1] === 10) return { end: i + 2, body: i + 2 }; // \n\n
      if (b[i + 1] === 13) {
        if (i + 2 >= b.length) return null; // need more bytes
        if (b[i + 2] === 10) return { end: i + 3, body: i + 3 }; // \n\r\n
        // Lone CR not followed by LF — keep scanning.
      }
      // Single LF (end of one header line) — keep scanning for the blank line.
    }
    return null;
  }
}



const enc = (seg: string): string =>
  encodeURIComponent(seg).replace(/%3A/gi, ":").replace(/%2F/gi, "/");

/** Absolute filesystem path → `file://` URI (Windows drives lower-cased). */
export function pathToUri(p: string): string {
  let s = p.replace(/\\/g, "/");
  if (s.startsWith("//")) {
    // UNC: //server/share/… → file://server/share/…
    const rest = s.slice(2);
    const i = rest.indexOf("/");
    const host = i === -1 ? rest : rest.slice(0, i);
    const tail = i === -1 ? "" : rest.slice(i);
    return `file://${host}${tail.split("/").map(enc).join("/")}`;
  }
  const drive = /^([A-Za-z]):(?=\/|$)/.exec(s);
  if (drive) s = `/${drive[1].toLowerCase()}${s.slice(1)}`;
  return `file://${s.split("/").map(enc).join("/")}`;
}

// ─── file:// URI conversion ──────────────────────────────────────────────────

/** `file://` URI → absolute filesystem path (best effort, never throws). */
export function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  let rest = uri.slice("file://".length);
  let host = "";
  const slash = rest.indexOf("/");
  if (slash > 0) {
    host = rest.slice(0, slash);
    rest = rest.slice(slash);
  }
  let path: string;
  try {
    path = decodeURIComponent(rest);
  } catch {
    path = rest;
  }
  if (/^\/[A-Za-z]:/.test(path)) return path.slice(1); // /c:/ → c:/
  if (host) return `//${host}${path}`; // UNC
  return path;
}

// ─── Server connection ───────────────────────────────────────────────────────

type Timer = ReturnType<typeof setTimeout>;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: Timer;
}

interface JsonRpcMessage {
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspDiagnostic {
  range: LspRange;
  severity?: number; // 1 Error, 2 Warning, 3 Information, 4 Hint
  code?: string | number;
  source?: string;
  message: string;
}

/** Trailing debounce for didChange — one update per pause in typing. */
const CHANGE_DEBOUNCE_MS = 250;
/** Cold-starting servers (tsserver, pyright) can take a while on big repos. */
const INITIALIZE_TIMEOUT_MS = 45_000;

class ServerConn {
  readonly spec: ServerSpec;
  /**
   * Unique id for this server *instance*. Process ids are namespaced per
   * connection (not per language) so a teardown that arrives late can never
   * kill a newer server started for the same language — e.g. switching
   * workspaces twice while the first shutdown is still in flight.
   */
  readonly procId: string;
  state: "starting" | "ready" | "dead" = "starting";
  /** Set while a graceful shutdown is in flight (see `stopConn`). */
  stopping = false;
  /** textDocumentSync declared by the server: 1 = Full, 2 = Incremental. */
  syncKind = 1;
  rootPath: string | null = null;
  rootUri: string | null = null;
  /** Paths (normalized) this connection has published diagnostics for —
   *  used to clear stale findings when the server dies. */
  readonly published = new Set<string>();
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private parser = new FrameParser();

  constructor(spec: ServerSpec, procId: string) {
    this.spec = spec;
    this.procId = procId;
  }

  /** Send one framed message. Body bytes are what `Content-Length` counts. */
  private send(obj: unknown): Promise<void> {
    const json = JSON.stringify(obj);
    const bodyLen = new TextEncoder().encode(json).length;
    const frame = `Content-Length: ${bodyLen}\r\n\r\n${json}`;
    return invoke<void>("lsp_write", { id: this.procId, text: frame });
  }

  request<T = unknown>(
    method: string,
    params: unknown,
    timeoutMs = 15_000
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.send({ jsonrpc: "2.0", id, method, params }).catch((e: unknown) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params }).catch(() => {
      /* write failures surface through the neo:lsp-exit event */
    });
  }

  feed(chunk: Uint8Array | number[]): void {
    if (this.state === "dead") return;
    const bytes =
      chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk);
    for (const msg of this.parser.push(bytes)) {
      this.dispatch(msg as JsonRpcMessage);
    }
  }

  rejectAllPending(reason: string): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private dispatch(msg: JsonRpcMessage): void {
    if (!msg || typeof msg !== "object") return;
    if (msg.id !== undefined && msg.id !== null && msg.method !== undefined) {
      // Server → client request: must be answered or the server stalls.
      const result = this.handleServerRequest(msg.method, msg.params);
      this.send({ jsonrpc: "2.0", id: msg.id, result }).catch(() => {});
      return;
    }
    if (msg.id !== undefined && msg.id !== null) {
      const p = this.pending.get(msg.id as number);
      if (p) {
        this.pending.delete(msg.id as number);
        clearTimeout(p.timer);
        if (msg.error) {
          p.reject(
            new Error(
              `${msg.error.code !== undefined ? msg.error.code + " " : ""}${
                msg.error.message ?? "LSP error"
              }`.trim()
            )
          );
        } else {
          p.resolve(msg.result);
        }
      }
      return;
    }
    if (msg.method !== undefined) this.handleNotification(msg.method, msg.params);
  }

  /** Answer a server→client request. Anything left unanswered stalls the
   *  server, so every known method gets a concrete result and unknown ones
   *  get `null` — the least surprising value across the servers we target. */
  private handleServerRequest(method: string, params: unknown): unknown {
    switch (method) {
      case "client/registerCapability":
      case "client/unregisterCapability":
      case "window/workDoneProgress/create":
        return null;
      case "workspace/configuration": {
        const items = (params as { items?: unknown[] } | null)?.items;
        return Array.isArray(items) ? items.map(() => ({})) : [];
      }
      case "workspace/workspaceFolders":
        return this.rootUri
          ? [{ uri: this.rootUri, name: this.rootPath ?? "workspace" }]
          : null;
      case "workspace/applyEdit":
        return { applied: false };
      default:
        return null;
    }
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case "textDocument/publishDiagnostics":
        this.onPublishDiagnostics(params);
        break;
      case "window/logMessage":
      case "window/showMessage": {
        // Only errors/warnings hit the log — info/log chatter would flood it.
        const p = params as { type?: number; message?: string } | null;
        if (p && (p.type === 1 || p.type === 2) && p.message) {
          logToBus("Problems", `[LSP ${this.spec.label}] ${p.message}`);
        }
        break;
      }
      default:
        break; // $/progress, telemetry/event, …
    }
  }

  private onPublishDiagnostics(params: unknown): void {
    const p = params as {
      uri?: string;
      diagnostics?: LspDiagnostic[];
    } | null;
    if (!p?.uri) return;
    const path = uriToPath(p.uri);
    const items: FileDiagnostic[] = (p.diagnostics ?? []).map((d) => ({
      line: d.range.start.line + 1,
      col: d.range.start.character + 1,
      // The server's end position is exclusive and 0-based; an end before the
      // start means a zero-width range (caret-style marker) — leave endCol unset
      // so the editor underlines the single character it points at.
      ...(d.range.end.line > d.range.start.line ||
      (d.range.end.line === d.range.start.line &&
        d.range.end.character > d.range.start.character)
        ? { endLine: d.range.end.line + 1, endCol: d.range.end.character + 1 }
        : { endCol: d.range.start.character + 2 }),
      severity:
        d.severity === 2
          ? "warning"
          : d.severity === 3 || d.severity === 4
            ? "info"
            : "error",
      code: d.code !== undefined && d.code !== null ? String(d.code) : (d.source ?? ""),
      message: d.message,
      source: "lsp",
    }));
    this.published.add(normalizePath(path));
    publishDiagnostics(path, items, "lsp");
  }

  /** Apply `initialize` result: mainly the text-document sync kind.
   *  Per spec, capabilities live under `result.capabilities`. */
  applyCapabilities(result: unknown): void {
    const caps = (
      result as {
        capabilities?: { textDocumentSync?: number | { change?: number } };
      } | null
    )?.capabilities;
    const tds = caps?.textDocumentSync;
    if (typeof tds === "number") this.syncKind = tds;
    else if (tds && typeof tds === "object" && typeof tds.change === "number") {
      this.syncKind = tds.change;
    }
    if (this.syncKind < 1) this.syncKind = 1; // servers declaring 0 still get full text
  }

  /** End position of `text` — used to express a full rewrite as one
   *  range edit when the server only accepts incremental changes. */
  private endPosition(text: string): { line: number; character: number } {
    let line = 0;
    let lastStart = 0;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        line++;
        lastStart = i + 1;
      }
    }
    return { line, character: text.length - lastStart };
  }

  didOpen(doc: OpenDoc): void {
    doc.opened = true;
    doc.sentText = doc.text;
    doc.version = 1;
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri: doc.uri,
        languageId: doc.langId,
        version: doc.version,
        text: doc.text,
      },
    });
    // The server owns this file now — retire the instant structural fallback
    // so the two sources never fight over the same buffer.
    publishDiagnostics(doc.path, [], "neo");
  }

  didChange(doc: OpenDoc): void {
    if (!doc.opened || doc.sentText === doc.text) return;
    const prev = doc.sentText ?? "";
    doc.version += 1;
    doc.sentText = doc.text;
    const contentChanges =
      this.syncKind === 2
        ? [
            {
              range: {
                start: { line: 0, character: 0 },
                end: this.endPosition(prev),
              },
              text: doc.text,
            },
          ]
        : [{ text: doc.text }];
    this.notify("textDocument/didChange", {
      textDocument: { uri: doc.uri, version: doc.version },
      contentChanges,
    });
  }

  didSave(doc: OpenDoc): void {
    this.notify("textDocument/didSave", { textDocument: { uri: doc.uri } });
  }

  didClose(doc: OpenDoc): void {
    this.notify("textDocument/didClose", { textDocument: { uri: doc.uri } });
  }
}

// ─── Client orchestration ────────────────────────────────────────────────────

interface OpenDoc {
  path: string;
  uri: string;
  langId: string;
  /** Registry id of the server that owns this file (null = none available). */
  serverId: string | null;
  /** Latest buffer text. */
  text: string;
  /** Last text acknowledged by the server (null until didOpen). */
  sentText: string | null;
  version: number;
  opened: boolean;
  changeTimer: Timer | null;
}

const docs = new Map<string, OpenDoc>(); // normalizePath(path) → doc
const conns = new Map<string, ServerConn>(); // spec.id → live connection
const connsByProc = new Map<string, ServerConn>(); // procId → connection
const starting = new Map<string, Promise<ServerConn | null>>(); // dedupe races
const restarts = new Map<string, number>(); // spec.id → restart attempts
const missed = new Set<string>(); // spec.id with no installed server (this workspace)
const notifiedMiss = new Set<string>(); // spec.id already logged a hint
let workspaceRoot: string | null = null;
/** Bumped whenever the workspace changes so stale timers/events bail out. */
let epoch = 0;
let listenersInstalled = false;
/** Monotonic counter for unique process ids (`<lang>#<n>`). */
let procSeq = 0;

/** Install the two process-level event listeners exactly once. */
function ensureListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  void listen<{ id: string; data: number[] }>("neo:lsp-bytes", (e) => {
    const conn = connsByProc.get(e.payload.id);
    if (conn) conn.feed(e.payload.data);
  });
  void listen<{ id: string; detail: string }>("neo:lsp-exit", (e) => {
    const conn = connsByProc.get(e.payload.id);
    if (conn) handleExit(conn, e.payload.detail);
  });
}

/** First installed candidate for `spec`, resolved against the workspace. */
async function probeVariant(
  s: ServerSpec
): Promise<{ command: string; args: string[] } | null> {
  for (const v of s.variants) {
    try {
      const found = await invoke<string | null>("lsp_probe", {
        command: v.command,
        root: workspaceRoot,
      });
      if (found) return { command: found, args: v.args };
    } catch {
      /* probe failure = treat as not installed */
    }
  }
  return null;
}

/**
 * Start (or reuse) the server for `spec`. Resolves with the ready connection,
 * or `null` when no server is installed or startup failed — in which case the
 * caller falls back to the structural scan and the status store explains why.
 */
function ensureServer(s: ServerSpec): Promise<ServerConn | null> {
  const live = conns.get(s.id);
  if (live && live.state !== "dead") return Promise.resolve(live);
  const pending = starting.get(s.id);
  if (pending) return pending;
  if (missed.has(s.id)) return Promise.resolve(null);

  const task = (async (): Promise<ServerConn | null> => {
    const myEpoch = epoch;
    setStatus({ id: s.id, label: s.label, state: "starting", docs: countDocs(s.id) });
    const resolved = await probeVariant(s);
    if (myEpoch !== epoch) return null; // workspace changed mid-probe
    if (!resolved) {
      missed.add(s.id);
      setStatus({
        id: s.id,
        label: s.label,
        state: "missing",
        detail: s.hint,
        docs: 0,
      });
      if (!notifiedMiss.has(s.id)) {
        notifiedMiss.add(s.id);
        logToBus(
          "Problems",
          `No ${s.label} language server found — install hint: ${s.hint}`
        );
      }
      return null;
    }

    const root = workspaceRoot;
    const procId = `${s.id}#${++procSeq}`;
    const conn = new ServerConn(s, procId);
    conn.rootPath = root;
    conn.rootUri = root ? pathToUri(root) : null;
    ensureListeners();
    try {
      await invoke<void>("lsp_start", {
        id: procId,
        command: resolved.command,
        args: resolved.args,
        cwd: root,
      });
    } catch (e) {
      setStatus({
        id: s.id,
        label: s.label,
        state: "failed",
        detail: e instanceof Error ? e.message : String(e),
        docs: 0,
      });
      logToBus(
        "Problems",
        `Failed to start ${s.label} server: ${e instanceof Error ? e.message : String(e)}`
      );
      return null;
    }
    conns.set(s.id, conn);
    connsByProc.set(procId, conn);

    const initParams = {
      processId: null,
      clientInfo: { name: "Neo", version: "1.11.0" },
      locale: "en",
      rootPath: root,
      rootUri: conn.rootUri,
      workspaceFolders: root
        ? [{ uri: conn.rootUri, name: root.split(/[\\/]/).filter(Boolean).pop() ?? root }]
        : null,
      capabilities: {
        workspace: { workspaceFolders: true },
        textDocument: {
          synchronization: { didSave: true },
          publishDiagnostics: { versionSupport: true },
        },
      },
      initializationOptions: {},
      trace: "off",
    };
    try {
      const result = await conn.request<unknown>(
        "initialize",
        initParams,
        INITIALIZE_TIMEOUT_MS
      );
      if (myEpoch !== epoch) {
        // Workspace changed while the server was warming up — shut it down.
        void stopConn(conn);
        return null;
      }
      conn.applyCapabilities(result);
      conn.notify("initialized", {});
      conn.state = "ready";
      setStatus({ id: s.id, label: s.label, state: "ready", docs: countDocs(s.id) });
      logToBus("Problems", `Language server ready: ${s.label} (${resolved.command})`);
      flushOpens(conn);
      return conn;
    } catch (e) {
      void stopConn(conn);
      conns.delete(s.id);
      if (myEpoch === epoch) {
        const detail = e instanceof Error ? e.message : String(e);
        setStatus({ id: s.id, label: s.label, state: "failed", detail, docs: 0 });
        logToBus("Problems", `${s.label} language server failed: ${detail}`);
      }
      return null;
    }
  })().finally(() => {
    starting.delete(s.id);
  });
  starting.set(s.id, task);
  return task;
}

function countDocs(serverId: string): number {
  let n = 0;
  for (const d of docs.values()) if (d.serverId === serverId) n++;
  return n;
}

/** Send didOpen for every tracked document this server doesn't know yet. */
function flushOpens(conn: ServerConn): void {
  if (conn.state !== "ready") return;
  for (const doc of docs.values()) {
    if (doc.serverId === conn.spec.id && !doc.opened) conn.didOpen(doc);
  }
}

/** The server died: clear its findings, explain why, maybe restart once.
 *  A death during a deliberate stop (`stopping`) is expected and silent —
 *  `stopConn` owns status and findings in that case. */
function handleExit(conn: ServerConn, detail: string): void {
  if (conn.state === "dead") return;
  const graceful = conn.stopping;
  // Only a server that had reached "ready" is worth retrying; one that dies
  // during startup (missing component, bad binary) would just respawn-loop.
  const everReady = conn.state === "ready";
  conn.state = "dead";
  // Only evict the language slot if it still points at *this* connection —
  // a restart may already have installed a newer one.
  if (conns.get(conn.spec.id) === conn) conns.delete(conn.spec.id);
  connsByProc.delete(conn.procId);
  conn.rejectAllPending("LSP server exited");
  if (graceful) return;
  for (const path of conn.published) {
    publishDiagnostics(path, [], "lsp");
  }
  const openCount = countDocs(conn.spec.id);
  const attempts = restarts.get(conn.spec.id) ?? 0;
  patchStatus(conn.spec.id, {
    state: "failed",
    detail,
    docs: openCount,
  });
  logToBus("Problems", `${conn.spec.label} server stopped — ${detail}`);

  // A transient crash with files still open deserves one (then two) retries;
  // deliberate stops, startup failures and crash loops do not.
  if (everReady && openCount > 0 && attempts < 2) {
    restarts.set(conn.spec.id, attempts + 1);
    const myEpoch = epoch;
    setTimeout(() => {
      if (myEpoch !== epoch) return;
      void ensureServer(conn.spec).then((re) => {
        if (re) logToBus("Problems", `${conn.spec.label} server restarted`);
      });
    }, 1500);
  }
}

/** Graceful shutdown of one server: shutdown → exit → kill. */
async function stopConn(conn: ServerConn): Promise<void> {
  // Stay registered (and therefore feedable — the reader only routes bytes
  // to connections in `connsByProc`) until the shutdown exchange completes;
  // `stopping` tells handleExit this death is deliberate.
  conn.stopping = true;
  try {
    await conn.request("shutdown", null, 800);
    conn.notify("exit", {});
    // Give the exit notification a beat to flush before the pipe dies.
    await new Promise((r) => setTimeout(r, 60));
  } catch {
    /* unresponsive or already gone — the kill below is enough */
  }
  conn.state = "dead";
  conn.rejectAllPending("LSP server stopped");
  if (conns.get(conn.spec.id) === conn) conns.delete(conn.spec.id);
  connsByProc.delete(conn.procId);
  try {
    await invoke<void>("lsp_stop", { id: conn.procId });
  } catch {
    /* already stopped */
  }
}

function clearPublished(conn: ServerConn): void {
  for (const path of conn.published) publishDiagnostics(path, [], "lsp");
}

async function stopAllServers(): Promise<void> {
  // NOTE: don't clear `conns` up front — stopConn needs each connection
  // registered while it trades shutdown/exit with the server.
  const all = [...conns.values()];
  await Promise.all(
    all.map(async (conn) => {
      clearPublished(conn);
      await stopConn(conn);
    })
  );
}

// ─── Public API (called from IdeWindowApp) ───────────────────────────────────

/** Track a newly opened buffer. Resolves `true` when an LSP server took the
 *  file over (the caller may then skip the structural fallback scan). */
export function lspDocOpen(path: string, text: string): Promise<boolean> {
  const s = specFor(path);
  if (!s) return Promise.resolve(false);
  const key = normalizePath(path);
  const existing = docs.get(key);
  if (existing) {
    if (existing.text !== text) lspDocChange(path, text);
    return Promise.resolve(
      existing.serverId !== null &&
        conns.get(existing.serverId)?.state === "ready"
    );
  }
  const doc: OpenDoc = {
    path,
    uri: pathToUri(path),
    langId: lspLangId(path),
    serverId: s.id,
    text,
    sentText: null,
    version: 0,
    opened: false,
    changeTimer: null,
  };
  docs.set(key, doc);
  return ensureServer(s).then((conn) => {
    if (!conn) {
      doc.serverId = null;
      return false;
    }
    // A newer connection may have taken over this language meanwhile (workspace
    // switch + restart) — only open the document on the live one.
    if (conns.get(conn.spec.id) !== conn) return false;
    doc.serverId = conn.spec.id;
    flushOpens(conn); // no-op if already flushed for this conn
    return true;
  });
}

/** Buffer changed — debounce a `textDocument/didChange` after the pause. */
export function lspDocChange(path: string, text: string): void {
  const doc = docs.get(normalizePath(path));
  if (!doc) return;
  doc.text = text;
  if (doc.changeTimer) return; // trailing debounce: the timer reads doc.text
  doc.changeTimer = setTimeout(() => {
    doc.changeTimer = null;
    const conn = doc.serverId ? conns.get(doc.serverId) : undefined;
    if (conn && conn.state === "ready" && doc.opened) conn.didChange(doc);
  }, CHANGE_DEBOUNCE_MS);
}

/** Buffer saved — flush pending changes, then didSave. */
export function lspDocSave(path: string): void {
  const doc = docs.get(normalizePath(path));
  if (!doc) return;
  if (doc.changeTimer) {
    clearTimeout(doc.changeTimer);
    doc.changeTimer = null;
  }
  const conn = doc.serverId ? conns.get(doc.serverId) : undefined;
  if (!conn || conn.state !== "ready" || !doc.opened) return;
  const wasDirty = doc.sentText !== doc.text;
  if (wasDirty) conn.didChange(doc);
  conn.didSave(doc);
}

/** Tab closed — tell the server (diagnostics stay until it clears them). */
export function lspDocClose(path: string): void {
  const key = normalizePath(path);
  const doc = docs.get(key);
  if (!doc) return;
  docs.delete(key);
  if (doc.changeTimer) clearTimeout(doc.changeTimer);
  const conn = doc.serverId ? conns.get(doc.serverId) : undefined;
  if (conn && conn.state === "ready" && doc.opened) conn.didClose(doc);
}

/** True when a ready server manages this file — callers use it to gate the
 *  structural `quickScan` fallback (LSP supersedes it for that language). */
export function lspManages(path: string): boolean {
  const doc = docs.get(normalizePath(path));
  if (!doc || !doc.serverId) return false;
  return conns.get(doc.serverId)?.state === "ready";
}

/** Install hint for a language that has no server, for UI hints. */
export function lspHintFor(path: string): string | null {
  const s = specFor(path);
  if (!s) return null;
  const st = statusById.get(s.id);
  if (st && (st.state === "missing" || st.state === "failed")) {
    return st.detail ?? s.hint;
  }
  return missed.has(s.id) ? s.hint : null;
}

/** Point the client at a new workspace: stop every server and forget docs. */
export function lspSetWorkspace(root: string | null): void {
  if (root === workspaceRoot) return;
  workspaceRoot = root;
  epoch++;
  restarts.clear();
  missed.clear();
  notifiedMiss.clear();
  for (const s of [...statusById.values()]) {
    setStatus({ ...s, state: "stopped", docs: 0, detail: undefined });
  }
  for (const doc of docs.values()) {
    if (doc.changeTimer) clearTimeout(doc.changeTimer);
  }
  docs.clear();
  void stopAllServers();
}

/** Tear everything down (workspace closed / window going away). */
export function lspShutdown(): void {
  epoch++;
  for (const doc of docs.values()) {
    if (doc.changeTimer) clearTimeout(doc.changeTimer);
  }
  docs.clear();
  void stopAllServers();
}






