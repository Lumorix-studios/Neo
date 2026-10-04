/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */
/**
 * Inline diagnostic geometry for the code editor.
 *
 * The editor renders code as a pre-tokenized HTML string behind a transparent
 * textarea, so findings cannot be painted into that markup. Instead they are
 * drawn as absolutely-positioned marks in the editor's overlay layer — exactly
 * like the existing find-match marks — using the same monospace arithmetic.
 *
 * Everything here is pure (no React, no DOM): given diagnostics, the buffer
 * text and viewport metrics it produces coordinates, so the positioning can be
 * unit-tested in `scripts/verify-editor-diag.mjs` without a browser.
 */
import type { DiagnosticSeverity, FileDiagnostic } from "../diagnostics";

/** Left padding of the highlight layer (`pl-4`) — see CodeEditor's <pre>. */
export const MARK_LEFT_PAD = 16;

/** Hard cap on painted marks, so a pathological file can't flood the overlay. */
const MAX_MARKS = 600;

export interface DiagnosticIndex {
  /** 1-based line → findings starting on that line. */
  byLine: Map<number, FileDiagnostic[]>;
  /** 1-based line → worst severity present on it (drives the gutter marker). */
  worst: Map<number, DiagnosticSeverity>;
}

/** Severity ordering used to pick the dominant finding per line. */
export function severityRank(s: DiagnosticSeverity): number {
  return s === "error" ? 0 : s === "warning" ? 1 : 2;
}

export function worstSeverity(a: DiagnosticSeverity, b: DiagnosticSeverity): DiagnosticSeverity {
  return severityRank(a) <= severityRank(b) ? a : b;
}

/**
 * Group findings by line, dropping anything outside the buffer.
 *
 * Buffer edits land before the (debounced) server re-publish, so ranges can
 * briefly point past the end of the file — those are dropped here rather than
 * painted as stray marks.
 */
export function indexFileDiagnostics(
  items: readonly FileDiagnostic[],
  lineCount: number
): DiagnosticIndex {
  const byLine = new Map<number, FileDiagnostic[]>();
  const worst = new Map<number, DiagnosticSeverity>();
  if (lineCount <= 0) return { byLine, worst };
  for (const d of items) {
    if (!Number.isFinite(d.line) || d.line < 1 || d.line > lineCount) continue;
    const list = byLine.get(d.line);
    if (list) list.push(d);
    else byLine.set(d.line, [d]);
    worst.set(d.line, worstSeverity(worst.get(d.line) ?? "info", d.severity));
  }
  return { byLine, worst };
}

/** Text of lines `[first, last)` (0-based) without splitting the whole buffer. */
export function visibleLineTexts(
  content: string,
  first: number,
  last: number
): string[] {
  const out: string[] = [];
  let start = 0;
  let line = 0;
  const end = content.length;
  while (start <= end && out.length < Math.max(0, last - first)) {
    const nl = content.indexOf("\n", start);
    const stop = nl === -1 ? end : nl;
    if (line >= first) {
      let text = content.slice(start, stop);
      if (text.endsWith("\r")) text = text.slice(0, -1);
      out.push(text);
    }
    if (nl === -1) break;
    start = nl + 1;
    line++;
  }
  return out;
}

export interface DiagnosticMark {
  key: string;
  /** CSS pixels, in overlay (scroll-translated) space. */
  top: number;
  left: number;
  width: number;
  height: number;
  severity: DiagnosticSeverity;
  message: string;
  code: string;
  source: string;
  /** 1-based line, for tooltips and future navigation. */
  line: number;
}

export interface MarkMetrics {
  padTop: number;
  leftPad: number;
  charW: number;
  lineHeight: number;
}

/**
 * Turn findings into overlay marks for the visible window.
 *
 * Range handling: a finding with an explicit `endCol` underlines exactly that
 * span; without one it underlines to the end of the line (what the tsc parse
 * gives us). Ranges are clamped to the real line text, so a stale end position
 * can never paint outside the code area.
 */
export function layoutDiagnosticMarks(
  byLine: Map<number, FileDiagnostic[]>,
  lines: readonly string[],
  first: number,
  metrics: MarkMetrics
): DiagnosticMark[] {
  const { padTop, leftPad, charW, lineHeight } = metrics;
  const marks: DiagnosticMark[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = first + i + 1; // 1-based
    const items = byLine.get(lineNo);
    if (!items || items.length === 0) continue;
    const text = lines[i];
    for (const d of items) {
      const startCol = Math.max(0, Math.min(d.col - 1, text.length));
      // Only trust `endCol` when it belongs to THIS line; a range that continues
      // onto later lines underlines to the end of this row instead of applying
      // the final line's column here.
      let endCol = text.length;
      if (d.endCol != null && (d.endLine == null || d.endLine === lineNo)) {
        endCol = Math.max(0, d.endCol - 1);
      }
      endCol = Math.min(Math.max(endCol, startCol), text.length);
      // A zero-width finding still deserves a visible mark (cursor position).
      const width = Math.max(2, (endCol - startCol) * charW);
      marks.push({
        key: `${lineNo}:${startCol}:${d.source}:${d.code || d.message.slice(0, 12)}`,
        top: padTop + i * lineHeight,
        left: leftPad + startCol * charW,
        width,
        height: lineHeight,
        severity: d.severity,
        message: d.message,
        code: d.code,
        source: d.source,
        line: lineNo,
      });
      if (marks.length >= MAX_MARKS) return marks;
    }
  }
  return marks;
}

/** Human label for a finding's origin, used in hover titles. */
export function diagnosticOriginLabel(source: string): string {
  switch (source) {
    case "lsp":
      return "language server";
    case "tsc":
      return "TypeScript";
    case "neo":
      return "built-in scan";
    default:
      return source;
  }
}

/** Full hover text for a finding (message + code + origin). */
export function diagnosticTooltip(d: {
  message: string;
  code: string;
  source: string;
}): string {
  const code = d.code ? ` (${d.code})` : "";
  return `${d.message}${code} — ${diagnosticOriginLabel(d.source)}`;
}