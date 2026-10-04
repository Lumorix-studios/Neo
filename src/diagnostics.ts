/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */


import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logToBus } from "./components/logBus";
import { isWordChar, lineCommentToken, startsExpression } from "./components/highlight";

export type DiagnosticSeverity = "error" | "warning" | "info";
export type DiagnosticSource = "tsc" | "neo" | "lsp";

export interface FileDiagnostic {
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  col: number;
  /**
   * Optional inclusive 1-based end position. Producers that know the exact span
   * (LSP ranges, the bracket a structural scan flagged) set it so the editor
   * can underline precisely instead of to the end of the line.
   */
  endLine?: number;
  endCol?: number;
  severity: DiagnosticSeverity;
  /** Compiler code (`TS1005`) or a `neo-*` id for local findings. */
  code: string;
  message: string;
  source: DiagnosticSource;
}

export interface DiagnosticGroup {
  /** Absolute path (native separators, exactly as reported by the producer). */
  file: string;
  items: FileDiagnostic[];
}

/** Shared empty arrays keep `useSyncExternalStore` snapshots referentially
 *  stable when a file has no findings. */
const EMPTY: FileDiagnostic[] = [];
const EMPTY_GROUPS: DiagnosticGroup[] = [];

interface FileEntry {
  file: string;
  items: FileDiagnostic[];
}

const byFile = new Map<string, FileEntry>();
const listeners = new Set<() => void>();
/** Files that received findings from the most recent workspace scan. */
let tscFiles = new Set<string>();
/** Bumped on every write; snapshot caches key off it. */
let version = 0;
let groupsCache: { v: number; groups: DiagnosticGroup[] } | null = null;

/** Store key for a path: forward slashes, no trailing slash, lower-cased
 *  drive letter — `file://` URIs always carry `file:///c:/…`, while the editor
 *  opens `C:\…`; without this the two would never match in the store. */
export function normalizePath(p: string): string {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return s.replace(/^([A-Za-z]:)/, (_m, d: string) => d.toLowerCase());
}

function emit(): void {
  version++;
  for (const l of listeners) l();
}

function sameItems(a: FileDiagnostic[], b: FileDiagnostic[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.line !== y.line ||
      x.col !== y.col ||
      x.endLine !== y.endLine ||
      x.endCol !== y.endCol ||
      x.severity !== y.severity ||
      x.code !== y.code ||
      x.message !== y.message ||
      x.source !== y.source
    ) {
      return false;
    }
  }
  return true;
}

/** Replace every finding for `file` that came from `source` (other sources
 *  are preserved, so a tsc warning survives a local rescan). */
export function publishDiagnostics(
  file: string,
  items: FileDiagnostic[],
  source: DiagnosticSource
): void {
  const key = normalizePath(file);
  const prev = byFile.get(key);
  const rest = (prev?.items ?? EMPTY).filter((d) => d.source !== source);
  const next = [...rest, ...items];
  if (prev && sameItems(prev.items, next)) return;
  if (next.length === 0) byFile.delete(key);
  else byFile.set(key, { file, items: next });
  emit();
}

/** Replace the whole `tsc` result set. Files that no longer report anything
 *  are cleared, so fixed errors disappear on the next scan. */
export function publishTscResults(groups: DiagnosticGroup[]): void {
  const seen = new Set<string>();
  let changed = false;
  for (const g of groups) {
    const key = normalizePath(g.file);
    seen.add(key);
    const prev = byFile.get(key);
    const rest = (prev?.items ?? EMPTY).filter((d) => d.source !== "tsc");
    const next = [...rest, ...g.items];
    if (!prev || !sameItems(prev.items, next)) {
      if (next.length === 0) byFile.delete(key);
      else byFile.set(key, { file: g.file, items: next });
      changed = true;
    }
  }
  for (const key of tscFiles) {
    if (seen.has(key)) continue;
    const prev = byFile.get(key);
    if (!prev) continue;
    const rest = prev.items.filter((d) => d.source !== "tsc");
    if (rest.length === 0) byFile.delete(key);
    else byFile.set(key, { file: prev.file, items: rest });
    changed = true;
  }
  tscFiles = seen;
  if (changed) emit();
}

/** Drop every finding produced by `source`, wherever it lives in the store. */
export function clearDiagnostics(source: DiagnosticSource): void {
  let changed = false;
  for (const [key, entry] of [...byFile]) {
    const rest = entry.items.filter((d) => d.source !== source);
    if (rest.length === entry.items.length) continue;
    changed = true;
    if (rest.length === 0) byFile.delete(key);
    else byFile.set(key, { file: entry.file, items: rest });
  }
  if (changed) emit();
}

export function subscribeDiagnostics(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Findings for one file. Identity is stable until that file is republished. */
export function getFileDiagnostics(path: string | null): FileDiagnostic[] {
  if (!path) return EMPTY;
  return byFile.get(normalizePath(path))?.items ?? EMPTY;
}

function severityRank(s: DiagnosticSeverity): number {
  return s === "error" ? 0 : s === "warning" ? 1 : 2;
}

function cmpDiag(a: FileDiagnostic, b: FileDiagnostic): number {
  if (a.line !== b.line) return a.line - b.line;
  if (a.col !== b.col) return a.col - b.col;
  return severityRank(a.severity) - severityRank(b.severity);
}

/** Every finding, grouped and sorted. Stable between store writes. */
export function getAllDiagnostics(): DiagnosticGroup[] {
  if (groupsCache && groupsCache.v === version) return groupsCache.groups;
  if (byFile.size === 0) {
    groupsCache = { v: version, groups: EMPTY_GROUPS };
    return EMPTY_GROUPS;
  }
  const groups = [...byFile.values()]
    .map((g) => ({ file: g.file, items: [...g.items].sort(cmpDiag) }))
    .sort((a, b) => a.file.localeCompare(b.file));
  groupsCache = { v: version, groups };
  return groups;
}

export function countDiagnostics(): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const g of byFile.values()) {
    for (const d of g.items) {
      if (d.severity === "error") errors++;
      else if (d.severity === "warning") warnings++;
    }
  }
  return { errors, warnings };
}

/** React hook: findings for one file. */
export function useFileDiagnostics(path: string | null): FileDiagnostic[] {
  const read = useCallback(() => getFileDiagnostics(path), [path]);
  return useSyncExternalStore(subscribeDiagnostics, read);
}

/** React hook: every finding, already grouped by file. */
export function useAllDiagnostics(): DiagnosticGroup[] {
  return useSyncExternalStore(subscribeDiagnostics, getAllDiagnostics);
}

/* ── Workspace scan (tsc) ─────────────────────────────────────────────────── */

interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** Matches "src/App.tsx(12,5): error TS2304: Cannot find name 'x'." */
const TSC_LINE =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+?)\s*$/;

export interface ScanSummary {
  errors: number;
  warnings: number;
  note: string | null;
}

/** Run `tsc --noEmit` in `root`, publish the findings and return a summary. */
export async function runTscScan(root: string): Promise<ScanSummary> {
  const res = await invoke<RunResult>("run_command", {
    command: "npx tsc --noEmit --pretty false",
    cwd: root,
    timeout_secs: 120,
  });
  const combined = `${res.stdout}\n${res.stderr}`;
  const groups = new Map<string, FileDiagnostic[]>();
  let errors = 0;
  let warnings = 0;
  for (const raw of combined.split(/\r?\n/)) {
    const m = TSC_LINE.exec(raw.trim());
    if (!m) continue;
    const relPath = m[1].replace(/\\/g, "/");
    const file = `${root.replace(/[\\/]+$/, "")}/${relPath}`;
    const severity: DiagnosticSeverity = m[4] === "error" ? "error" : "warning";
    if (severity === "error") errors++;
    else warnings++;
    const items = groups.get(file) ?? [];
    items.push({
      line: parseInt(m[2], 10),
      col: parseInt(m[3], 10),
      severity,
      code: m[5],
      message: m[6],
      source: "tsc",
    });
    groups.set(file, items);
  }
  publishTscResults(
    [...groups.entries()].map(([file, items]) => ({ file, items }))
  );
  let note: string | null = null;
  if (groups.size === 0 && res.exitCode !== 0 && !/error TS/i.test(combined)) {
    note = res.timedOut
      ? "Scan timed out after 120 s."
      : combined.trim().slice(0, 200) ||
        "TypeScript scan produced no report (is this a TS project?).";
  }
  logToBus(
    "Problems",
    `tsc --noEmit → ${errors} error(s), ${warnings} warning(s)` +
      (res.timedOut ? " (scan timed out)" : "")
  );
  return { errors, warnings, note };
}

export interface WorkspaceDiagnosticsState {
  /** A scan is in flight. */
  scanning: boolean;
  /** Non-fatal explanation when a scan produced nothing usable. */
  note: string | null;
  /** Re-run the scan now (the "Re-scan" button). */
  rescan: () => void;
}

const SCAN_DEBOUNCE_MS = 1200;

/**
 * Keep the diagnostics store in sync with the workspace: one scan on open,
 * then a debounced re-scan whenever `token` changes (the IDE bumps it after
 * every explicit save and before a terminal command runs).
 */
export function useWorkspaceDiagnostics(
  root: string | null,
  token = 0
): WorkspaceDiagnosticsState {
  const [state, setState] = useState<{ scanning: boolean; note: string | null }>({
    scanning: false,
    note: null,
  });
  const [manualToken, setManualToken] = useState(0);
  const runningRef = useRef(false);
  const pendingRef = useRef(false);
  const rootRef = useRef(root);
  const lastRootRef = useRef<string | null>(null);
  const scanRef = useRef<() => void>(() => {});

  useEffect(() => {
    rootRef.current = root;
  }, [root]);

  // The runner lives in a ref so the debounce effect below only depends on
  // (root, token): a fresh function identity must not restart the timer.
  useEffect(() => {
    scanRef.current = () => {
      const target = rootRef.current;
      if (!target) return;
      if (runningRef.current) {
        // A scan is already running — queue exactly one more so the newest
        // saves still get compiled instead of being silently dropped.
        pendingRef.current = true;
        return;
      }
      runningRef.current = true;
      setState((s) => (s.scanning ? s : { ...s, scanning: true }));
      void Promise.resolve()
        .then(() => runTscScan(target))
        .then((summary) => {
          if (rootRef.current === target) {
            setState({ scanning: false, note: summary.note });
          }
        })
        .catch((e: unknown) => {
          if (rootRef.current === target) {
            setState({
              scanning: false,
              note: e instanceof Error ? e.message : String(e),
            });
          }
        })
        .finally(() => {
          runningRef.current = false;
          if (pendingRef.current) {
            pendingRef.current = false;
            scanRef.current();
          }
        });
    };
  });

  useEffect(() => {
    if (!root) {
      setState({ scanning: false, note: null });
      return;
    }
    // Opening a workspace scans immediately (the panel should not sit empty
    // for a debounce window); token bumps after saves stay debounced.
    if (root !== lastRootRef.current) {
      lastRootRef.current = root;
      scanRef.current();
      return;
    }
    const timer = window.setTimeout(() => scanRef.current(), SCAN_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [root, token, manualToken]);

  const rescan = useCallback(() => setManualToken((t) => t + 1), []);
  return { scanning: state.scanning, note: state.note, rescan };
}

/* ── Local structural scan (instant, parser-free) ─────────────────────────── */

/** Languages where brackets/quotes/comments are worth checking structurally.
 *  Prose-ish formats (markdown, HTML text, plain text) are excluded: an
 *  unbalanced `(` inside a sentence is not an error. */
const STRUCTURAL_LANGS = new Set([
  "typescript", "javascript", "json", "jsonc", "rust", "go", "java", "c",
  "cpp", "csharp", "php", "swift", "kotlin", "css", "scss", "less", "sql",
  "python", "shell", "ruby", "yaml", "toml",
]);

/** Languages whose buffers may contain JSX. */
const JSX_LANGS = new Set(["typescript", "javascript"]);
/** Cheap "does this buffer contain an element?" probe — generic-heavy plain TS
 *  can match too, which only costs a little caution in the scan below. */
const JSX_PATTERN = /<[A-Za-z][\w.:-]*[^<>]*\/?>/;

/** Keywords after which a value (string/regex) may start. */
const VALUE_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "do", "else", "yield", "await", "case", "throw",
]);

interface OpenBracket {
  ch: string;
  line: number;
  col: number;
}

const PAIR_OF: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

type ScanState = "code" | "line" | "block" | "str" | "tmpl" | "regex";
/** Where the scanner thinks it is: normal code, JSX children (prose) or
 *  inside a JSX tag. */
type Context = "code" | "jsxText" | "jsxTag";

interface Frame {
  /** `stack.length` when the `{` opened — the matching `}` restores the
   *  context/template that was interrupted. */
  depth: number;
  kind: "template" | "jsx";
  context: Context;
  /** Tag state to restore when a JSX attribute container closes. */
  tagEnclosing?: Context;
  tagClosing?: boolean;
}

/**
 * Single-pass structural check of `content`: unterminated strings / block
 * comments and unbalanced brackets, with string/comment/regex/template (and
 * JSX) awareness so the findings stay trustworthy. Returns [] for prose
 * formats.
 *
 * Quotes only open a literal in expression position, and inside JSX children
 * only tags and `{...}` containers are parsed — that is what keeps prose like
 * `don't` or a `Ctrl+`` key hint from producing bogus findings.
 */
export function quickScan(content: string, lang: string): FileDiagnostic[] {
  if (!STRUCTURAL_LANGS.has(lang) || content.length === 0) return [];

  const out: FileDiagnostic[] = [];
  const lineTok = lineCommentToken(lang);
  const isRust = lang === "rust";
  const jsx = JSX_LANGS.has(lang) && JSX_PATTERN.test(content);
  const stack: OpenBracket[] = [];
  const frames: Frame[] = [];
  /** Enclosing contexts of the open JSX elements (close tags restore one). */
  const jsxStack: Context[] = [];
  let context: Context = "code";
  /** Context the tag being scanned will return to. */
  let tagEnclosing: Context = "code";
  let tagClosing = false;
  let state: ScanState = "code";
  let blockEnd = "*/";
  let quote = "";
  /** True while a `"""` / `'''` / triple-backtick span is open — newlines are
   *  content then, and only the matching triple closes the literal. */
  let tripleQuote = false;
  let quoteLine = 1;
  let quoteCol = 1;
  let regexClass = false;
  /** Last significant token hint ("" = start): drives the string/prose and
   *  division/regex decisions. */
  let prev = "";
  let line = 1;
  let col = 1;
  let i = 0;
  const n = content.length;

  const advance = () => {
    if (content.charCodeAt(i) === 10) {
      line++;
      col = 1;
    } else {
      col++;
    }
    i++;
  };
  const report = (
    severity: DiagnosticSeverity,
    code: string,
    message: string,
    l: number,
    c: number
  ) => {
    out.push({
      line: l,
      col: c,
      // The offending character itself (bracket/quote) — underlines precisely
      // instead of trailing to the end of the line.
      endCol: c + 1,
      severity,
      code,
      message,
      source: "neo",
    });
  };
  const openLiteral = (l: number, c: number) => {
    quoteLine = l;
    quoteCol = c;
  };
  /** `<Name`, `</Name` or `<>` starts a JSX tag at `idx` (prose `<` and the
   *  comparison operator do not). */
  const tagAt = (idx: number): "open" | "close" | null => {
    const next = content[idx + 1];
    if (next === ">") return "open";
    if (next === "/") {
      const after = content[idx + 2];
      return after === ">" || isWordChar(after) ? "close" : null;
    }
    return isWordChar(next) ? "open" : null;
  };
  while (i < n) {
    const c = content[i];
    const two = content.slice(i, i + 2);
    const l = line;
    const k = col;

    /* ── literal states ──────────────────────────────────────────────────── */

    if (state === "line") {
      if (c === "\n") state = "code";
      advance();
      continue;
    }

    if (state === "block") {
      if (two === blockEnd) {
        i += blockEnd.length;
        col += blockEnd.length;
        state = "code";
        continue;
      }
      advance();
      continue;
    }

    if (state === "str" || state === "tmpl") {
      const q = state === "tmpl" && !tripleQuote ? "`" : quote;
      if (c === "\\") {
        i += 2;
        col += 2;
        continue;
      }
      if (tripleQuote) {
        if (c === q && content[i + 1] === q && content[i + 2] === q) {
          i += 3;
          col += 3;
          state = "code";
          tripleQuote = false;
          prev = "x";
          continue;
        }
        advance();
        continue;
      }
      if (c === q) {
        advance();
        state = "code";
        prev = "x";
        continue;
      }
      if (state === "tmpl" && !tripleQuote && two === "${") {
        frames.push({ depth: stack.length, kind: "template", context });
        i += 2;
        col += 2;
        state = "code";
        prev = "";
        continue;
      }
      if (c === "\n" && state === "str" && !tripleQuote) {
        // ' and " never span lines — the literal is genuinely broken.
        report(
          "error",
          "neo-unterminated-string",
          `Unterminated string — no closing ${q}`,
          quoteLine,
          quoteCol
        );
        state = "code";
        advance();
        continue;
      }
      advance();
      continue;
    }

    if (state === "regex") {
      if (c === "\\") {
        i += 2;
        col += 2;
        continue;
      }
      if (c === "\n") {
        // A regex cannot wrap: this was a division after all.
        state = "code";
        advance();
        continue;
      }
      if (c === "[") {
        regexClass = true;
        advance();
        continue;
      }
      if (c === "]") {
        regexClass = false;
        advance();
        continue;
      }
      if (c === "/" && !regexClass) {
        advance();
        while (i < n && isWordChar(content[i])) advance(); // flags
        state = "code";
        prev = "x";
        continue;
      }
      advance();
      continue;
    }

    /* ── JSX children: only tags and `{...}` containers are code ─────────── */

    if (context === "jsxText") {
      if (c === "<") {
        const kind = tagAt(i);
        if (kind) {
          tagEnclosing = context;
          tagClosing = kind === "close";
          context = "jsxTag";
          advance();
          continue;
        }
      }
      if (c === "{") {
        stack.push({ ch: c, line: l, col: k });
        frames.push({ depth: stack.length - 1, kind: "jsx", context: "jsxText" });
        context = "code";
        prev = "";
        advance();
        continue;
      }
      advance();
      continue;
    }

    /* ── Inside a tag: attribute strings, `{...}` and the closing `>` ────── */

    if (context === "jsxTag") {
      if (c === '"' || c === "'") {
        openLiteral(l, k);
        quote = c;
        state = "str";
        advance();
        continue;
      }
      if (c === "{") {
        stack.push({ ch: c, line: l, col: k });
        frames.push({ depth: stack.length - 1, kind: "jsx", context: "jsxTag", tagEnclosing, tagClosing });
        context = "code";
        prev = "";
        advance();
        continue;
      }
      if (c === "/" && content[i + 1] === ">") {
        i += 2;
        col += 2;
        // A `/>` self-closes: it opened nothing, so restore the enclosing
        // context directly instead of treating it like `<tag>`.
        context = tagClosing ? (jsxStack.pop() ?? "code") : tagEnclosing;
        prev = ">";
        continue;
      }
      if (c === ">") {
        if (tagClosing) {
          context = jsxStack.pop() ?? "code";
        } else {
          jsxStack.push(tagEnclosing);
          context = "jsxText";
        }
        prev = ">";
        advance();
        continue;
      }
      advance();
      continue;
    }


    /* ── code state ──────────────────────────────────────────────────────── */

    if (c === "\n" || c === " " || c === "\t" || c === "\r") {
      advance();
      continue;
    }

    if (jsx && c === "<") {
      const kind = tagAt(i);
      // `</Name>` can only be a close tag; an opening `<Name` must sit in
      // expression position so `a < b` comparisons are left alone.
      if (kind === "close" || (kind === "open" && startsExpression(prev))) {
        tagEnclosing = context;
        tagClosing = kind === "close";
        context = "jsxTag";
        advance();
        continue;
      }
    }

    // Comments first: their contents never affect the bracket stack.
    if (
      (lineTok === "//" && two === "//") ||
      (lineTok === "--" && two === "--")
    ) {
      state = "line";
      i += 2;
      col += 2;
      continue;
    }
    if (lineTok === "#" && c === "#") {
      state = "line";
      advance();
      continue;
    }
    if (two === "/*") {
      state = "block";
      blockEnd = "*/";
      i += 2;
      col += 2;
      continue;
    }
    if (two === "<!--") {
      state = "block";
      blockEnd = "-->";
      i += 4;
      col += 4;
      continue;
    }

    // Regex literal (checked before division; `//` and `/*` stay comments).
    if (
      c === "/" &&
      content[i + 1] !== "/" &&
      content[i + 1] !== "*" &&
      startsExpression(prev)
    ) {
      state = "regex";
      regexClass = false;
      advance();
      continue;
    }

    // Rust lifetimes ('a) look like string openers to a naive scanner.
    if (isRust && c === "'" && isWordChar(content[i + 1]) && content[i + 2] !== "'") {
      i += 2;
      col += 2;
      prev = "x";
      continue;
    }

    if ((c === '"' || c === "'" || c === "`") && startsExpression(prev)) {
      // Triple quotes (python docstrings, C# raw strings) may span lines.
      const triple = content[i + 1] === c && content[i + 2] === c;
      openLiteral(l, k);
      quote = c;
      tripleQuote = triple;
      if (triple) {
        // Triple-quoted text behaves like a template: it may span lines and
        // only the matching triple closes it (tracked above via `tripleQuote`).
        state = "tmpl";
        i += 3;
        col += 3;
      } else {
        state = c === "`" ? "tmpl" : "str";
        advance();
      }
      continue;
    }

    if (c === "(" || c === "[" || c === "{") {
      stack.push({ ch: c, line: l, col: k });
      prev = c;
      advance();
      continue;
    }

    if (c === ")" || c === "]" || c === "}") {
      const frame = frames[frames.length - 1];
      if (frame && c === "}") {
        // A `}` that ends a JSX container or a template interpolation.
        if (frame.kind === "jsx" && stack.length - 1 === frame.depth) {
          frames.pop();
          stack.pop();
          context = frame.context;
          if (frame.tagEnclosing !== undefined) {
            // Back inside the tag this container belonged to.
            tagEnclosing = frame.tagEnclosing;
            tagClosing = frame.tagClosing ?? false;
          }
          prev = "x";
          advance();
          continue;
        }
        if (frame.kind === "template" && stack.length === frame.depth) {
          frames.pop();
          state = "tmpl";
          prev = "x";
          advance();
          continue;
        }
      }
      const open = stack.pop();
      if (!open) {
        report(
          "error",
          "neo-unmatched-closer",
          `Unexpected '${c}' — nothing is open here`,
          l,
          k
        );
      } else if (open.ch !== PAIR_OF[c]) {
        report(
          "error",
          "neo-mismatched-closer",
          `Mismatched '${c}' — '${open.ch}' on line ${open.line} is still open`,
          l,
          k
        );
      }
      prev = c;
      advance();
      continue;
    }

    if (isWordChar(c)) {
      let j = i;
      while (j < n && isWordChar(content[j])) j++;
      const word = content.slice(i, j);
      col += j - i;
      i = j;
      prev = VALUE_KEYWORDS.has(word) ? "(" : "x";
      continue;
    }

    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && isWordChar(content[j])) j++;
      col += j - i;
      i = j;
      prev = "x";
      continue;
    }

    prev = c;
    advance();
  }

  if (state === "block") {
    report(
      "error",
      "neo-unterminated-comment",
      `Unterminated block comment — missing '${blockEnd}'`,
      quoteLine,
      quoteCol
    );
  } else if (state === "str" || state === "tmpl") {
    report(
      "error",
      "neo-unterminated-string",
      `Unterminated string — no closing ${state === "tmpl" ? "`" : quote}`,
      quoteLine,
      quoteCol
    );
  }
  for (const b of stack) {
    report(
      "error",
      "neo-unclosed-bracket",
      `Unclosed '${b.ch}' — no matching closer`,
      b.line,
      b.col
    );
  }
  return out;
}
