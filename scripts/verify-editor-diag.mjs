#!/usr/bin/env node
/**
 * Unit checks for the editor's inline-diagnostic geometry
 * (src/components/editorDiagnostics.ts).
 *
 * The squiggle/gutter positioning is pure arithmetic on monospace metrics, so
 * it is verified here rather than by staring at the UI: exact spans, clamping
 * to the real line text, windowing, multi-line ranges and the mark cap.
 *
 * Usage: node scripts/verify-editor-diag.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "scripts", ".lsp-tmp");

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
    `${msg} (got ${JSON.stringify(actual)})`
  );
}

// ─── transpile the real module (type-only imports are erased) ────────────────
const ts = require("typescript");
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"commonjs"}\n');
const src = fs.readFileSync(
  path.join(root, "src", "components", "editorDiagnostics.ts"),
  "utf8"
);
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dest = path.join(tmp, "editorDiagnostics.js");
fs.writeFileSync(dest, out);
const ed = require(dest);

// Metrics matching CodeEditor at the default font size.
const M = { padTop: 10, leftPad: 16, charW: 6, lineHeight: 20 };
const d = (over) => ({
  line: 1,
  col: 1,
  severity: "error",
  code: "E1",
  message: "boom",
  source: "lsp",
  ...over,
});

// ─── indexFileDiagnostics ────────────────────────────────────────────────────
console.log("\n== indexFileDiagnostics");
{
  const idx = ed.indexFileDiagnostics(
    [
      d({ line: 2, severity: "warning" }),
      d({ line: 2, col: 5, severity: "error" }),
      d({ line: 2, col: 9, severity: "info" }),
      d({ line: 1, severity: "info" }),
      d({ line: 99 }), // past EOF — dropped
      d({ line: 0 }), // invalid — dropped
    ],
    5
  );
  eq([...idx.byLine.keys()], [2, 1], "groups by line, out-of-range dropped");
  eq(idx.byLine.get(2).length, 3, "three findings on line 2");
  eq(idx.worst.get(2), "error", "worst severity on line 2 = error");
  eq(idx.worst.get(1), "info", "worst severity on line 1 = info");
  ok(!idx.worst.has(99), "no entry for out-of-range line");
  const empty = ed.indexFileDiagnostics([d({})], 0);
  eq(empty.byLine.size, 0, "empty buffer → no index");
}

// ─── visibleLineTexts ───────────────────────────────────────────────────────
console.log("\n== visibleLineTexts");
{
  const text = "const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;";
  eq(ed.visibleLineTexts(text, 0, 2), ["const a = 1;", "const b = 2;"], "window from the top");
  eq(ed.visibleLineTexts(text, 1, 3), ["const b = 2;", "const c = 3;"], "window from offset 1");
  eq(ed.visibleLineTexts(text, 3, 10), ["const d = 4;"], "window clamps at EOF");
  eq(
    ed.visibleLineTexts("a\r\nb\r\nc", 0, 3),
    ["a", "b", "c"],
    "CRLF stripped"
  );
  // An empty buffer still has one (empty) row — same as countLines(), which the
  // editor uses for its own line count.
  eq(ed.visibleLineTexts("", 0, 5), [""], "empty buffer → one empty row");
}
// ─── layoutDiagnosticMarks ──────────────────────────────────────────────────
console.log("\n== layoutDiagnosticMarks");
{
  const lines = ["const a = 1;", "const b = 2;", "const c = 3;"];

  // Exact range: cols 7..13 (1-based inclusive) → 0-based [6,12) = 6 chars.
  let idx = ed.indexFileDiagnostics(
    [d({ line: 1, col: 7, endLine: 1, endCol: 13 })],
    3
  );
  let marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(marks.length, 1, "one mark painted");
  eq(
    { top: marks[0].top, left: marks[0].left, width: marks[0].width },
    { top: 10, left: 16 + 6 * 6, width: 6 * 6 },
    "exact range → left/width from 0-based cols"
  );

  // No end column (tsc-style) → underline to end of line.
  idx = ed.indexFileDiagnostics([d({ line: 2, col: 1 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(
    { top: marks[0].top, width: marks[0].width },
    { top: 10 + 20, width: 12 * 6 },
    "no endCol → to end of line, on the right row"
  );

  // Stale end position (buffer shrank) must clamp to the line, never overflow.
  idx = ed.indexFileDiagnostics([d({ line: 1, col: 3, endCol: 999 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(marks[0].left + marks[0].width, 16 + 12 * 6, "endCol clamped to line length");

  // Stale start position clamps too.
  idx = ed.indexFileDiagnostics([d({ line: 1, col: 99, endCol: 120 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  ok(marks[0].left <= 16 + 12 * 6, "out-of-range start clamped into the line");

  // Zero-width finding (server points at a position) still shows a 2px mark.
  idx = ed.indexFileDiagnostics([d({ line: 1, col: 4, endCol: 4 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(marks[0].width, 2, "zero-width range → minimum visible width");

  // Multi-line range: end column belongs to a later line → run to EOL here.
  idx = ed.indexFileDiagnostics([d({ line: 1, col: 1, endLine: 3, endCol: 4 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(marks[0].width, 12 * 6, "multi-line range → end of the start line");

  // Only the requested window is painted.
  idx = ed.indexFileDiagnostics([d({ line: 3, col: 1 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(marks.length, 1, "finding inside the window is painted");
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines.slice(0, 1), 0, M);
  eq(marks.length, 0, "finding outside the window is skipped");

  // Empty line + a finding on it → clamped, still visible, no NaN.
  idx = ed.indexFileDiagnostics([d({ line: 2, col: 1 })], 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, ["", "", ""], 0, M);
  eq(
    { left: marks[0].left, width: marks[0].width },
    { left: 16, width: 2 },
    "empty line → mark at the line start, minimum width"
  );

  // Mark cap protects the render path from a pathological file.
  const many = Array.from({ length: 2000 }, (_, i) => d({ line: 1, col: i + 1 }));
  idx = ed.indexFileDiagnostics(many, 3);
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  ok(marks.length <= 600, `mark cap enforced (${marks.length} ≤ 600)`);

  // Keys are unique enough to key React nodes on.
  idx = ed.indexFileDiagnostics(
    [d({ line: 1, col: 3, code: "A" }), d({ line: 1, col: 9, code: "B" })],
    3
  );
  marks = ed.layoutDiagnosticMarks(idx.byLine, lines, 0, M);
  eq(new Set(marks.map((m) => m.key)).size, marks.length, "mark keys are unique");
}

// ─── tooltips ───────────────────────────────────────────────────────────────
console.log("\n== tooltips");
{
  eq(ed.diagnosticOriginLabel("lsp"), "language server", "lsp label");
  eq(ed.diagnosticOriginLabel("tsc"), "TypeScript", "tsc label");
  eq(ed.diagnosticOriginLabel("neo"), "built-in scan", "neo label");
  eq(
    ed.diagnosticTooltip({ message: "Expected ';'", code: "", source: "lsp" }),
    "Expected ';' — language server",
    "tooltip without a code"
  );
  eq(
    ed.diagnosticTooltip({ message: "nope", code: "TS2322", source: "tsc" }),
    "nope (TS2322) — TypeScript",
    "tooltip with a code"
  );
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL: ${f}`);
  process.exit(1);
}
process.exit(0);