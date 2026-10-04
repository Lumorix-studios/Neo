#!/usr/bin/env node
/**
 * Unit checks for the editor's undo/redo timelines
 * (src/components/editorHistory.ts).
 *
 * The editor used to lean on the webview's native textarea undo stack, which is
 * exactly the thing that differs between the two platforms Neo ships on:
 * WebView2 (Windows) keeps a stack across `execCommand("insertText")`, while
 * WebKitGTK (Linux) discards it the moment React writes `.value`. Rather than
 * test two webviews, Neo now owns its history — so that is what these checks
 * cover: step bookkeeping, typing coalescing, redo invalidation, caret
 * restoration, per-file isolation and bounded growth.
 *
 * Usage: node scripts/verify-editor-history.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "scripts", ".history-tmp");

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
function eq(actual, expected, msg) {
  ok(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`
  );
}

// ─── transpile the real module (type-only exports are erased) ─────────────────
const ts = require("typescript");
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"commonjs"}\n');
const src = fs.readFileSync(
  path.join(root, "src", "components", "editorHistory.ts"),
  "utf8"
);
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dest = path.join(tmp, "editorHistory.js");
fs.writeFileSync(dest, out);
const eh = require(dest);

const snap = (content, selStart = 0, selEnd = selStart) => ({ content, selStart, selEnd });

/** Type `text` into `path` starting from `from`, one keystroke at a time. */
function type(path_, from, text) {
  let buffer = from;
  for (const ch of text) {
    const caret = buffer.length;
    const next = buffer + ch;
    eh.recordEdit(path_, snap(buffer, caret), snap(next, caret + 1), true);
    buffer = next;
  }
  return buffer;
}

// ─── basic undo / redo ────────────────────────────────────────────────────────
console.log("\n== undo / redo basics");
{
  const p = "/proj/a.ts";
  eh.historyFor(p).reset(snap("let a = 1;\n"));
  ok(!eh.historyAvailability(p).canUndo, "a freshly reset file cannot undo");

  eh.recordEdit(p, snap("let a = 1;\n", 11), snap("let a = 12;\n", 12), false);
  ok(eh.historyAvailability(p).canUndo, "an edit enables undo");
  ok(!eh.historyAvailability(p).canRedo, "a fresh edit leaves nothing to redo");

  const u = eh.undoHistory(p);
  eq(u && u.content, "let a = 1;\n", "undo restores the previous buffer");
  eq(u && [u.selStart, u.selEnd], [11, 11], "undo restores the pre-edit caret");
  ok(eh.historyAvailability(p).canRedo, "undo makes redo available");

  const r = eh.redoHistory(p);
  eq(r && r.content, "let a = 12;\n", "redo replays the edit");
  eq(r && [r.selStart, r.selEnd], [12, 12], "redo restores the post-edit caret");

  ok(eh.undoHistory(p) !== null, "second undo works");
  ok(eh.undoHistory(p) === null, "undo stops at the bottom of the timeline");
  ok(eh.redoHistory(p) !== null, "redo walks back out to the tip");
  ok(eh.redoHistory(p) === null, "redo stops at the tip");
}

// ─── typing coalescing ────────────────────────────────────────────────────────
console.log("\n== typing coalescing");
{
  const p = "/proj/type.ts";
  eh.historyFor(p).reset(snap(""));
  type(p, "", "hello");

  eq(eh.undoHistory(p).content, "", "a burst of typing undoes in one step");
  ok(eh.undoHistory(p) === null, "the whole burst was a single undo step");

  // A structural edit (typing=false) must break the coalescing run.
  eh.historyFor(p).reset(snap("abc"));
  type(p, "abc", "d");
  eh.recordEdit(p, snap("abcd", 4), snap("abcd\n", 5), false);
  type(p, "abcd\n", "e");
  eq(eh.undoHistory(p).content, "abcd\n", "typing after a structural edit undoes alone");
  eq(eh.undoHistory(p).content, "abcd", "then the typing run before it");
  eq(eh.undoHistory(p).content, "abc", "then the earlier typing run");
}

// ─── redo invalidation ────────────────────────────────────────────────────────
console.log("\n== redo invalidation");
{
  const p = "/proj/branch.ts";
  eh.historyFor(p).reset(snap("one"));
  eh.recordEdit(p, snap("one"), snap("two"), false);
  eh.recordEdit(p, snap("two"), snap("three"), false);
  eh.undoHistory(p);

// ─── re-seeding on an external rewrite ────────────────────────────────────────
console.log("\n== re-seed after an external rewrite");
{
  const p = "/proj/agent.ts";
  eh.historyFor(p).reset(snap("original"));
  eh.recordEdit(p, snap("original"), snap("mine"), false);
  // The agent rewrites the file on disk; the editor re-seeds from what is on
  // screen rather than letting undo walk through text nobody typed.
  eh.historyFor(p).reset(snap("agent wrote this"));
  ok(!eh.historyAvailability(p).canUndo, "a re-seeded file starts with no undo depth");
  ok(eh.undoHistory(p) === null, "undo cannot cross an external rewrite");
}

// ─── bounded growth ───────────────────────────────────────────────────────────
console.log("\n== bounded growth");
{
  const p = "/proj/big.ts";
  const base = "x".repeat(50_000);
  eh.historyFor(p).reset(snap(base));
  for (let i = 0; i < 5_000; i++) {
    const next = base + "y".repeat(i + 1);
    eh.recordEdit(p, snap(base + "y".repeat(i), i), snap(next, i + 1), false);
  }
  // Walk to the bottom; the timeline must have dropped the oldest states rather
  // than pinning every one of those 50 KB buffers in memory.
  let steps = 0;
  while (eh.undoHistory(p) !== null) steps++;
  ok(steps > 0 && steps < 5_000, `timeline is capped, not unbounded (${steps} steps kept)`);
}

// ─── presenter wiring ─────────────────────────────────────────────────────────
console.log("\n== presenter wiring");
{
  const p = "/proj/present.ts";
  const applied = [];
  const unregister = eh.setHistoryPresenter((path, s) => applied.push([path, s.content]));
  eh.historyFor(p).reset(snap("a"));
  eh.recordEdit(p, snap("a"), snap("ab"), false);
  eh.undoHistory(p);
  eq(applied, [[p, "a"]], "the editor's presenter is driven by undo");
  eh.redoHistory(p);
  eq(applied, [[p, "a"], [p, "ab"]], "and by redo");
  unregister();
  eh.undoHistory(p);
  eq(applied.length, 2, "no presenter, no application (keyboard-less safety)");
}

// ─── re-seeding publishes availability so the Edit menu can't go stale ────────
console.log("\n== re-seed publishes availability");
{
  const p = "/proj/menu.ts";
  let notifications = 0;
  const unsubscribe = eh.subscribeHistory(() => notifications++);
  eh.resetHistory(p, snap("start"));
  const afterSeed = notifications;
  eh.recordEdit(p, snap("start"), snap("startX"), false);
  const afterEdit = notifications;
  ok(afterEdit > afterSeed, "the first edit enables Undo in the menu");
  eh.resetHistory(p, snap("agent rewrote it"));
  const afterRewind = notifications;
  ok(afterRewind > afterEdit, "an external rewrite re-publishes (Undo goes disabled)");
  ok(!eh.historyAvailability(p).canUndo, "and Undo really is disabled afterwards");
  unsubscribe();
}

// ─── availability notifications stay off the keystroke path ───────────────────
console.log("\n== notification volume");
{
  const p = "/proj/notify.ts";
  let notifications = 0;
  const unsubscribe = eh.subscribeHistory(() => notifications++);
  eh.historyFor(p).reset(snap(""));
  const before = notifications;
  for (let i = 1; i <= 500; i++) {
    eh.recordEdit(p, snap("z".repeat(i - 1)), snap("z".repeat(i)), true);
  }
  const afterTyping = notifications;
  ok(
    afterTyping - before <= 1,
    `500 keystrokes woke subscribers ${afterTyping - before}x (only the flip counts)`
  );
  unsubscribe();
}

// ─── cleanup ──────────────────────────────────────────────────────────────────
console.log(
  `\n${failures.length ? "FAILED" : "OK"} — ${passed} passed, ${failures.length} failed`
);
if (failures.length) {
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

  ok(eh.historyAvailability(p).canRedo, "redo is available right after an undo");

  // Typing after an undo must discard the redo tail, as in every other editor.
  eh.recordEdit(p, snap("two"), snap("twoX"), false);
  ok(!eh.historyAvailability(p).canRedo, "a new edit discards the redo tail");
  ok(eh.redoHistory(p) === null, "and redo can no longer resurrect it");
}

// ─── per-file isolation ───────────────────────────────────────────────────────
console.log("\n== per-file isolation");
{
  eh.historyFor("/proj/x.ts").reset(snap("x"));
  eh.recordEdit("/proj/x.ts", snap("x"), snap("xy"), false);
  eh.historyFor("/proj/y.ts").reset(snap("y"));
  eh.recordEdit("/proj/y.ts", snap("y"), snap("yz"), false);

  eq(eh.undoHistory("/proj/x.ts").content, "x", "undo on file A only walks file A");
  eq(eh.historyFor("/proj/y.ts").current().content, "yz", "file B is untouched");
  ok(!eh.historyAvailability("/proj/z.ts").canUndo, "an unopened file cannot undo");
}
