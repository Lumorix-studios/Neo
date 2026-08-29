import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent as ReactUIEvent } from "react";
import { langOf, highlightCode, commentToken } from "./highlight";
import { FileIcon } from "./FileIcon";
import FindReplaceBar from "./FindReplaceBar";

export interface EditorTab {
  path: string;
  content: string;
  dirty: boolean;
}

/** Editor preferences driven by the Settings tab. */
export interface EditorPrefs {
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  showLineNumbers: boolean;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  fontSize: 12.5,
  lineHeight: 20,
  tabSize: 2,
  wordWrap: false,
  showLineNumbers: true,
};

/** Data + actions for the no-file-open empty state. */
export interface EmptyStateInfo {
  hasWorkspace: boolean;
  onOpenFolder?: () => void;
  onOpenFiles?: () => void;
  /** Create an (empty) file relative to the workspace root. */
  onCreateFile?: (name: string) => void;
  recentFiles?: string[];
  onOpenRecent?: (path: string) => void;
}

export interface CodeEditorProps {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onCloseAll?: () => void;
  /** Scroll the active tab to this file+line (problems panel jumps). */
  reveal?: { path: string; line: number } | null;
  /** Appearance + behavior prefs (from Settings). Falls back to defaults. */
  prefs?: Partial<EditorPrefs>;
  /** Empty-state content: actions and recents. */
  emptyState?: EmptyStateInfo;
}

/** Top padding shared by the gutter, highlight layer and textarea. */
const PAD_TOP = 10;

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find all non-overlapping match offsets of `query` in `text`. */
function computeMatches(
  text: string,
  query: string,
  caseSensitive: boolean
): Array<{ start: number; end: number }> {
  if (!query) return [];
  try {
    const re = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");
    const out: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) break; // avoid infinite loop on zero-width
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  } catch {
    return [];
  }
}

/** Convert a char offset into 0-based {line, col} within `text`. */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length - 1, col: lines[lines.length - 1].length };
}

export default function CodeEditor({
  tabs,
  activePath,
  onSelect,
  onClose,
  onChange,
  onSave,
  reveal,
  prefs,
  emptyState,
}: CodeEditorProps) {
  // Metrics shared by the gutter, highlight layer and textarea so they stay
  // pixel-aligned. Derived per-render from the Settings-driven prefs.
  const LINE_HEIGHT = prefs?.lineHeight ?? DEFAULT_EDITOR_PREFS.lineHeight;
  const FONT_SIZE = prefs?.fontSize ?? DEFAULT_EDITOR_PREFS.fontSize;
  const TAB_SIZE = prefs?.tabSize ?? DEFAULT_EDITOR_PREFS.tabSize;
  const WORD_WRAP = prefs?.wordWrap ?? DEFAULT_EDITOR_PREFS.wordWrap;
  const SHOW_LINE_NUMBERS = prefs?.showLineNumbers ?? DEFAULT_EDITOR_PREFS.showLineNumbers;
  const indentUnit = " ".repeat(TAB_SIZE);
  const [newFileName, setNewFileName] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [goToOpen, setGoToOpen] = useState(false);
  const [goToInput, setGoToInput] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const active = tabs.find((t) => t.path === activePath) ?? null;
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [cursor, setCursor] = useState({ line: 1, col: 1, sel: 0 });

  const activeContent = active?.content ?? "";
  const activeLang = active ? langOf(active.path) : "text";
  // React Compiler auto-memoizes these; plain derivation keeps lint happy.
  const highlighted = highlightCode(activeContent, activeLang);
  const lineCount = activeContent.split("\n").length;
  const gutterDigits = Math.max(2, String(lineCount).length);

  // Reset scroll + cursor bookkeeping whenever the user switches tabs.
  useEffect(() => {
    void Promise.resolve().then(() => {
      setScrollTop(0);
      setCursor({ line: 1, col: 1, sel: 0 });
      const el = taRef.current;
      if (el) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
    });
    setFindOpen(false);
    setGoToOpen(false);
    setCtxMenu(null);
  }, [activePath]);

  // Jump to a requested file+line (problems panel / git panel clicks).
  useEffect(() => {
    if (!reveal || !activePath || reveal.path !== activePath) return;
    const el = taRef.current;
    if (!el) return;
    const target = Math.max(0, (reveal.line - 4) * LINE_HEIGHT);
    el.scrollTop = target;
    setScrollTop(target);
    setCursor({ line: reveal.line, col: 1, sel: 0 });
    el.focus();
  }, [reveal, activePath]);

  const syncCursor = () => {
    const el = taRef.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split("\n");
    setCursor({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
      sel: el.selectionEnd - el.selectionStart,
    });
  };

  
  const replaceRange = (text: string, from: number, to: number) => {
    const el = taRef.current;
    if (!el || !active) return;
    el.focus();
    el.setSelectionRange(from, to);
    const doc = document as Document & {
      execCommand?: (cmd: string, ui: boolean, value?: string) => boolean;
    };
    const ok =
      typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text);
    if (!ok) {
      const next = el.value.slice(0, from) + text + el.value.slice(to);
      onChange(active.path, next);
      const caret = from + text.length;
      requestAnimationFrame(() => {
        el.selectionStart = caret;
        el.selectionEnd = caret;
      });
    }
    syncCursor();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!active) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave(active.path);
      return;
    }

    const el = e.currentTarget;

    // Ctrl+F: open find/replace.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      if (findOpen) {
        setFindQuery(el.value.slice(el.selectionStart, el.selectionEnd));
      } else {
        openFind();
      }
      return;
    }
    // Ctrl+G: go to line.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      setGoToOpen(true);
      setGoToInput(String(cursor.line));
      return;
    }
    // Ctrl+Shift+K: delete line(s).
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      deleteLines(e);
      return;
    }
    // Ctrl+Shift+D: duplicate line(s).
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateLines(e);
      return;
    }
    // Alt+Arrow: move line up/down.
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveLines(e, 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveLines(e, -1);
        return;
      }
    }

    // Ctrl+/: toggle line comments on the selected lines.
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      const token = commentToken(activeLang);
      if (!token) return;
      e.preventDefault();
      const s = el.selectionStart;
      const en = el.selectionEnd;
      const firstLine = el.value.lastIndexOf("\n", s - 1) + 1;
      let lastLine = el.value.indexOf("\n", en);
      if (lastLine === -1) lastLine = el.value.length;
      const block = el.value.slice(firstLine, lastLine);
      const lines = block.split("\n");
      const allCommented = lines
        .filter((l) => l.trim())
        .every((l) => l.trimStart().startsWith(token));
      const next = lines
        .map((line) => {
          if (!line.trim()) return line;
          if (allCommented) {
            const idx = line.indexOf(token);
            return line.slice(0, idx) + line.slice(idx + token.length).replace(/^ /, "");
          }
          const indent = (/^[ \t]*/.exec(line) ?? [""])[0];
          return `${indent}${token} ${line.slice(indent.length)}`;
        })
        .join("\n");
      replaceRange(next, firstLine, lastLine);
      return;
    }

    // Auto-close brackets & quotes; type-over when the closer is already there.
    const CLOSERS = ")]}\"'`";
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      const PAIRS: Record<string, string> = {
        "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`",
      };
      const open = PAIRS[e.key];
      const s = el.selectionStart;
      const en = el.selectionEnd;
      if (open) {
        // Type-over a closing quote instead of inserting another one.
        if (s === en && open === e.key && el.value[s] === e.key) {
          e.preventDefault();
          el.setSelectionRange(s + 1, s + 1);
          syncCursor();
          return;
        }
        e.preventDefault();
        replaceRange(e.key + open, s, en);
        return;
      }
      if (CLOSERS.includes(e.key) && s === en && el.value[s] === e.key) {
        e.preventDefault();
        el.setSelectionRange(s + 1, s + 1);
        syncCursor();
        return;
      }
      // Backspace between an empty pair deletes both halves.
      if (e.key === "Backspace" && s === en && s > 0) {
        const before = el.value[s - 1];
        const after = el.value[s];
        if (PAIRS[before] && PAIRS[before] === after) {
          e.preventDefault();
          replaceRange("", s - 1, s + 1);
          return;
        }
      }
    }

    // Tab / Shift+Tab: indent & outdent like a real editor.
    if (e.key === "Tab") {
      e.preventDefault();
      const s = el.selectionStart;
      const en = el.selectionEnd;
      if (e.shiftKey) {
        const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
        const m = new RegExp(`^( {1,${TAB_SIZE}}|\\t)`).exec(el.value.slice(lineStart));
        if (m) replaceRange("", lineStart, lineStart + m[0].length);
      } else if (s !== en) {
        const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
        const chunk = el.value.slice(lineStart, en);
        replaceRange(chunk.replace(/^/gm, indentUnit), lineStart, en);
      } else {
        replaceRange(indentUnit, s, en);
      }
      return;
    }

    // Enter: keep the current indentation, +1 level after opening brackets.
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const s = el.selectionStart;
      const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
      const indent = (/^[ \t]*/.exec(el.value.slice(lineStart, s)) ?? [""])[0];
      const prevCh = s > 0 ? el.value[s - 1] : "";
      const extra = "{[(:>".includes(prevCh) ? indentUnit : "";
      replaceRange(`\n${indent}${extra}`, s, el.selectionEnd);
      return;
    }
  };

  const handleScroll = (e: ReactUIEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    if (preRef.current) {
      preRef.current.scrollTop = el.scrollTop;
      preRef.current.scrollLeft = el.scrollLeft;
    }
  };

  // Find & replace: match offsets for the current query.
  const matches = useMemo(() => computeMatches(activeContent, findQuery, caseSensitive), [
    activeContent,
    findQuery,
    caseSensitive,
  ]);

  // Monospace-positioned highlight marks for every match (only when not wrapping;
  // the active match is also selected in the textarea, which always works).
  const findMarks = useMemo(() => {
    if (!findOpen || !findQuery || WORD_WRAP || matches.length === 0) return [];
    const charW = FONT_SIZE * 0.6;
    return matches.slice(0, 500).map((m) => {
      const startPt = offsetToLineCol(activeContent, m.start);
      const endPt = offsetToLineCol(activeContent, m.end);
      const width = Math.max(3, (endPt.col - startPt.col) * charW);
      return {
        key: m.start,
        top: PAD_TOP + startPt.line * LINE_HEIGHT,
        left: 16 + startPt.col * charW,
        width,
      };
    });
  }, [findOpen, findQuery, WORD_WRAP, matches, activeContent, FONT_SIZE, LINE_HEIGHT]);

  /** Jump the caret to a specific match index (wraps). */
  const goMatch = (idx: number) => {
    const el = taRef.current;
    if (!el || matches.length === 0) return;
    const real = ((idx % matches.length) + matches.length) % matches.length;
    const m = matches[real];
    setMatchIndex(real);
    el.focus();
    el.setSelectionRange(m.start, m.end);
    const { line } = offsetToLineCol(activeContent, m.start);
    const top = Math.max(0, (line - 2) * LINE_HEIGHT);
    el.scrollTop = top;
    setScrollTop(top);
    if (preRef.current) {
      preRef.current.scrollTop = top;
      preRef.current.scrollLeft = el.scrollLeft;
    }
    syncCursor();
  };

  /** Replace the current match, then move to the next one. */
  const replaceCurrent = () => {
    if (!active || matches.length === 0) return;
    const real = ((matchIndex + matches.length) % matches.length) % matches.length;
    const m = matches[real];
    const next = activeContent.slice(0, m.start) + replaceQuery + activeContent.slice(m.end);
    onChange(active.path, next);
    const nextIdx = (real + 1) % matches.length;
    requestAnimationFrame(() => {
      setMatchIndex(nextIdx);
      void Promise.resolve().then(() => goMatch(nextIdx));
    });
  };

  /** Replace every match in the file in one pass. */
  const replaceAll = () => {
    if (!active || matches.length === 0) return;
    let out = "";
    let last = 0;
    for (const m of matches) {
      out += activeContent.slice(last, m.start) + replaceQuery;
      last = m.end;
    }
    out += activeContent.slice(last);
    onChange(active.path, out);
    setFindQuery("");
    setMatchIndex(-1);
  };

  /** Open the find bar, seeding with the current selection if any. */
  const openFind = () => {
    const el = taRef.current;
    if (!el) return;
    setFindOpen(true);
    setFindQuery(el.value.slice(el.selectionStart, el.selectionEnd));
    setMatchIndex(-1);
  };

  const findOpenRef = useRef(false);
  findOpenRef.current = findOpen;

  // Whenever the query changes while the bar is open, jump to the first match.
  useEffect(() => {
    if (!findOpen || !findQuery) {
      setMatchIndex(-1);
      return;
    }
    if (matches.length > 0) goMatch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, findQuery, caseSensitive]);

  const crumbs = active ? pathSegments(active.path) : [];
  const visibleCrumbs = crumbs.length > 4 ? ["…", ...crumbs.slice(-3)] : crumbs;

  /** Jump the caret to a specific line (1-based). */
  const goToLine = (lineRaw: number) => {
    const el = taRef.current;
    if (!el) return;
    const n = el.value.split("\n").length;
    const target = Math.max(1, Math.min(n, Math.floor(lineRaw)));
    let pos = 0;
    for (let i = 0; i < target - 1; i++) pos = el.value.indexOf("\n", pos) + 1;
    if (pos === 0 && target > 1) pos = el.value.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    el.scrollTop = Math.max(0, (target - 3) * LINE_HEIGHT);
    setScrollTop(el.scrollTop);
    if (preRef.current) preRef.current.scrollTop = el.scrollTop;
    setCursor({ line: target, col: 1, sel: 0 });
  };

  /** Delete the current line(s) — Ctrl+Shift+K. */
  const deleteLines = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const firstLine = el.value.lastIndexOf("\n", s - 1) + 1;
    let lastLine = el.value.indexOf("\n", en);
    if (lastLine === -1) lastLine = el.value.length;
    const next = el.value.slice(0, firstLine) + el.value.slice(lastLine);
    const caret = Math.min(firstLine, next.length);
    onChange(active!.path, next);
    requestAnimationFrame(() => {
      el.selectionStart = caret;
      el.selectionEnd = caret;
      syncCursor();
    });
  };

  /** Duplicate the current line below — Ctrl+Shift+D. */
  const duplicateLines = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const en = el.selectionEnd;
    const firstLine = el.value.lastIndexOf("\n", s - 1) + 1;
    let lastLine = el.value.indexOf("\n", en);
    if (lastLine === -1) lastLine = el.value.length;
    const block = el.value.slice(firstLine, lastLine);
    const nl = el.value.slice(lastLine).startsWith("\n") ? "" : "\n";
    const next = el.value.slice(0, lastLine) + nl + block + el.value.slice(lastLine);
    onChange(active!.path, next);
    const caret = lastLine + nl.length + block.length;
    requestAnimationFrame(() => {
      el.selectionStart = caret;
      el.selectionEnd = caret;
      syncCursor();
    });
  };

  /** Move the current line up/down — Alt+Arrow. */
  const moveLines = (e: ReactKeyboardEvent<HTMLTextAreaElement>, dir: 1 | -1) => {
    const el = e.currentTarget;
    const s = el.selectionStart;
    const caretLine = offsetToLineCol(el.value, s).line;
    const target = caretLine + dir;
    if (target < 0 || target >= el.value.split("\n").length) return;
    const lines = el.value.split("\n");
    const tmp = lines[caretLine];
    lines[caretLine] = lines[target];
    lines[target] = tmp;
    const next = lines.join("\n");
    onChange(active!.path, next);
    const newLine = caretLine + dir;
    let pos = 0;
    for (let i = 0; i < newLine; i++) pos = next.indexOf("\n", pos) + 1;
    requestAnimationFrame(() => {
      el.selectionStart = pos;
      el.selectionEnd = pos;
      el.scrollTop = Math.max(0, (newLine - 2) * LINE_HEIGHT);
      setScrollTop(el.scrollTop);
      if (preRef.current) preRef.current.scrollTop = el.scrollTop;
      syncCursor();
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-panel)]">
      {/* ── Tab strip */}
      <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.07] bg-[var(--bg-elevated)]">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.length === 0 && (
            <div className="flex items-center px-3 text-[11.5px] text-zinc-600">
              No files open
            </div>
          )}
          {tabs.map((t) => {
            const selected = t.path === activePath;
            return (
              <div
                key={t.path}
                onAuxClick={(ev) => {
                  if (ev.button === 1) onClose(t.path);
                }}
                className={`group relative flex shrink-0 items-stretch transition-colors ${
                  selected
                    ? "bg-[var(--bg-panel)] text-zinc-100"
                    : "bg-transparent text-[#8b8b8b] hover:bg-white/[0.04] hover:text-zinc-300"
                }`}
              >
                {/* VS Code-style: bright top accent on the active tab */}
                <span
                  className="absolute inset-x-0 top-0 h-px"
                  style={{ backgroundColor: selected ? "#ffffff" : "transparent", opacity: selected ? 0.28 : 0 }}
                />
                <button
                  type="button"
                  onClick={() => onSelect(t.path)}
                  className={`flex max-w-[190px] items-center gap-2 py-0 pl-3 pr-1 text-[12px] ${
                    t.dirty && !selected ? "italic" : ""
                  }`}
                  title={t.path}
                >
                  <FileIcon name={t.path} />
                  <span className="truncate">{fileName(t.path)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onClose(t.path)}
                  aria-label={`Close ${fileName(t.path)}`}
                  className="mr-1.5 flex h-5 w-5 items-center justify-center rounded transition"
                >
                  {t.dirty ? (
                    <>
                      <span className="h-[7px] w-[7px] rounded-full bg-zinc-400 group-hover:hidden" />
                      <svg viewBox="0 0 16 16" className="hidden h-3 w-3 group-hover:block" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </>
                  ) : (
                    <svg viewBox="0 0 16 16" className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Tab actions */}
        <div className="flex shrink-0 items-center gap-1.5  px-2">
          <button
            type="button"
            disabled={!active?.dirty}
            onClick={() => active && onSave(active.path)}
              className={`rounded-[4px] px-2.5 py-1 text-[11px] font-medium transition ${
                active?.dirty
                  ? "bg-[#2b6fd4] text-white hover:bg-[#3b7de0]"
                  : "cursor-default bg-white/[0.04] text-[#555555]"
              }`}
            title="Save (Ctrl+S)"
          >
            Save
          </button>
        </div>
      </div>

      {active ? (
        <>
          {/* ── Breadcrumbs ─────────────────────────────────────── */}
          <div className="flex h-7 shrink-0 items-center gap-1.5 overflow-hidden border-b border-white/[0.04] px-3 text-[11px] text-zinc-600">
            <FileIcon name={active.path} />
            {visibleCrumbs.map((seg, i) => (
              <span key={`${seg}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap">
                {i > 0 && (
                  <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3.5L10.5 8 6 12.5" />
                  </svg>
                )}
                <span className={i === visibleCrumbs.length - 1 ? "font-medium text-(--accent)" : "text-zinc-500"}>
                  {seg}
                </span>
              </span>
            ))}
          </div>

          {/* ── Find / Replace bar ──────────────────────────────── */}
          {findOpen && findQuery !== null && (
            <FindReplaceBar
              query={findQuery}
              replaceQuery={replaceQuery}
              caseSensitive={caseSensitive}
              replaceMode={replaceMode}
              matchCount={matches.length}
              matchIndex={matchIndex}
              onChangeQuery={setFindQuery}
              onChangeReplace={setReplaceQuery}
              onCaseSensitive={setCaseSensitive}
              onNext={() => goMatch(matchIndex + 1)}
              onPrev={() => goMatch(matchIndex - 1)}
              onReplace={replaceCurrent}
              onReplaceAll={replaceAll}
              onToggleReplace={setReplaceMode}
              onClose={() => { setFindOpen(false); setFindQuery(""); setMatchIndex(-1); }}
            />
          )}

          {/* ── Go to line ──────────────────────────────────────── */}
          {goToOpen && (
            <div className="shrink-0 border-b border-white/[0.06] bg-[var(--bg-elevated)] px-3 py-1.5">
              <div className="flex items-center gap-2">
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const n = parseInt(goToInput, 10);
                    if (!Number.isNaN(n)) goToLine(n);
                    setGoToOpen(false);
                  }}
                  className="flex flex-1 items-center gap-2"
                >
                  <span className="text-[var(--text-faint)]">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="3" y="6" width="10" height="8" rx="1.5" />
                      <path d="M5.5 9h.01M8 9h.01M10.5 9h.01M4 6V4.5h8V6" />
                    </svg>
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">Line</span>
                  <input
                    autoFocus
                    value={goToInput}
                    onChange={(ev) => setGoToInput(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Escape") { ev.stopPropagation(); setGoToOpen(false); }
                    }}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    spellCheck={false}
                    className="w-20 rounded-md border border-white/[0.08] bg-black/30 px-2 py-1 text-[12px] text-[#ececec] outline-none focus:border-(--accent)/50"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">of {lineCount}</span>
                </form>
                <button
                  type="button"
                  onClick={() => setGoToOpen(false)}
                  title="Close"
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* ── Editor surface ──────────────────────────────────── */}
          <div className="flex min-h-0 flex-1">
            {/* Line-number gutter */}
            {SHOW_LINE_NUMBERS && (
            <div
              className="relative shrink-0 select-none overflow-hidden bg-[var(--bg-panel)] text-right font-mono hairline-r"
              style={{ width: gutterDigits * FONT_SIZE * 0.62 + 28, fontSize: FONT_SIZE }}
              aria-hidden
            >
              <div style={{ transform: `translateY(${-scrollTop}px)`, paddingTop: PAD_TOP }}>
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    style={{ height: LINE_HEIGHT, lineHeight: `${LINE_HEIGHT}px`, paddingRight: 12 }}
                    className={
                      i + 1 === cursor.line
                        ? "font-medium text-zinc-400"
                        : "text-zinc-700"
                    }
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Code area: highlight layer under a transparent textarea */}
            <div className="relative min-w-0 flex-1 overflow-hidden font-mono" style={{ fontSize: FONT_SIZE }}>
              {/* Active-line highlight */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bg-white/[0.035]"
                style={{
                  top: PAD_TOP + (cursor.line - 1) * LINE_HEIGHT - scrollTop,
                  height: LINE_HEIGHT,
                }}
              />
              <pre
                ref={preRef}
                aria-hidden
                className={`pointer-events-none absolute inset-0 m-0 overflow-hidden pb-20 pl-4 pr-10 text-zinc-200 ${
                  WORD_WRAP ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                }`}
                style={{ paddingTop: PAD_TOP, lineHeight: `${LINE_HEIGHT}px` }}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
              {/* Find-match highlight marks */}
              {findMarks.length > 0 && (
                <div aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: `translateY(${-scrollTop}px)` }}>
                  {findMarks.map((mk, i) => (
                    <span
                      key={mk.key}
                      className={`absolute rounded-[2px] ${i === matchIndex ? "bg-(--accent)/40" : "bg-(--accent)/20"}`}
                      style={{ top: mk.top, left: mk.left, width: mk.width, height: LINE_HEIGHT }}
                    />
                  ))}
                </div>
              )}
              <textarea
                ref={taRef}
                value={active.content}
                onChange={(e) => onChange(active.path, e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                onClick={syncCursor}
                onKeyUp={syncCursor}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  setCtxMenu({ x: ev.clientX, y: ev.clientY });
                }}
                onSelect={syncCursor}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap={WORD_WRAP ? "soft" : "off"}
                className={`absolute inset-0 resize-none overflow-auto bg-transparent pb-20 pl-4 pr-10 text-transparent caret-(--accent) outline-none selection:bg-(--accent)/25 ${
                  WORD_WRAP ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                }`}
                style={{ paddingTop: PAD_TOP, lineHeight: `${LINE_HEIGHT}px`, tabSize: TAB_SIZE }}
              />
            </div>
          </div>

          {/* ── Status bar  */}
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.07] bg-[var(--bg-elevated)] px-3 text-[10.5px] text-zinc-500">
            <div className="flex items-center gap-3">
              <span>
                Ln {cursor.line}, Col {cursor.col}
              </span>
              {cursor.sel > 0 && <span className="text-zinc-400">{cursor.sel} selected</span>}
              <span>{lineCount} lines</span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`flex items-center gap-1 ${
                  active.dirty ? "text-amber-400" : "text-emerald-500"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {active.dirty ? "Unsaved" : "Saved"}
              </span>
              <span>Spaces: {TAB_SIZE}</span>
              <span>{WORD_WRAP ? "Wrap" : "No wrap"}</span>
              <span>UTF-8</span>
              <span className="flex items-center gap-1 capitalize">
                <FileIcon name={active.path} />
                {activeLang}
              </span>
            </div>
          </div>
        </>
      ) : (
        /* ── Empty state — minimal */
        <div className="relative flex flex-1 items-center justify-center px-6">
          <div className="msg-in flex w-full max-w-[260px] flex-col items-center text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] text-zinc-500">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3v5h5M9 13l2 2 4-4M16 3h4v4M7 4H4a1 1 0 00-1 1v15a1 1 0 001 1h16a1 1 0 001-1v-5" />
              </svg>
            </div>
            <p className="mt-4 text-[13px] font-medium text-[#d4d4d4]">No file open</p>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">
              Open a file to start editing.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => emptyState?.onOpenFiles?.()}
                className="rounded-md bg-(--accent) px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:brightness-110"
              >
                Open File
              </button>
              {emptyState?.onOpenFolder && (
                <button
                  type="button"
                  onClick={emptyState.onOpenFolder}
                  className="rounded-md border border-white/[0.1] px-3 py-1.5 text-[11.5px] text-[#d4d4d4] transition hover:bg-white/[0.05]"
                >
                  Open Folder
                </button>
              )}
            </div>
            {emptyState?.hasWorkspace && emptyState.onCreateFile && (
              <button
                type="button"
                onClick={() => setCreatingFile(true)}
                className="mt-2 text-[11px] text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition hover:text-zinc-300"
              >
                New file
              </button>
            )}
            {creatingFile && (
              <form
                className="mt-3 w-full"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newFileName.trim();
                  if (name && emptyState?.onCreateFile) {
                    emptyState.onCreateFile(name);
                    setCreatingFile(false);
                    setNewFileName("");
                  }
                }}
              >
                <input
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onBlur={() => setCreatingFile(false)}
                  onKeyDown={(e) => e.key === "Escape" && setCreatingFile(false)}
                  placeholder="src/main.ts"
                  spellCheck={false}
                  className="w-full rounded-md border border-(--accent)/40 bg-white/[0.04] px-2.5 py-1.5 text-center font-mono text-[11.5px] text-[#ececec] outline-none placeholder:text-zinc-600"
                />
              </form>
            )}
            <p className="mt-6 text-[10px] text-zinc-600">
              Ctrl+S save · Ctrl+F find · Ctrl+G jump
            </p>
          </div>
        </div>
      )}

      {/* ── Editor context menu (right-click) ─────────────────────── */}
      {ctxMenu && active && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(ev) => { ev.preventDefault(); setCtxMenu(null); }}
          />
          <div
            className="panel-in fixed z-50 w-48 overflow-hidden rounded-lg border border-white/[0.09] bg-[var(--bg-elevated)] py-1 shadow-[0_10px_32px_rgba(0,0,0,0.5)]"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 200),
              top: Math.min(ctxMenu.y, window.innerHeight - 260),
            }}
          >
            <button
              type="button"
              onClick={() => { document.execCommand("cut"); setCtxMenu(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#c9c9c9] transition hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M6 8L2 2M2 14l4-6M6 8l8-6M14 14l-8-6" /></svg>
              Cut
              <span className="kbd ml-auto">Ctrl+X</span>
            </button>
            <button
              type="button"
              onClick={() => { document.execCommand("copy"); setCtxMenu(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#c9c9c9] hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M3.5 3.5h7v1" /></svg>
              Copy
              <span className="kbd ml-auto">Ctrl+C</span>
            </button>
            <button
              type="button"
              onClick={() => { document.execCommand("paste"); setCtxMenu(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#c9c9c9] hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 4a1 1 0 011-1h2l1-1.5h2L10 3h2a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1z" /></svg>
              Paste
              <span className="kbd ml-auto">Ctrl+V</span>
            </button>
            <div className="my-1 h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => { taRef.current?.select(); setCtxMenu(null); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#c9c9c9] hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><rect x="3" y="3" width="10" height="10" rx="1" /><path d="M6 6h4M6 8h4M6 10h2" /></svg>
              Select All
              <span className="kbd ml-auto">Ctrl+A</span>
            </button>
            <div className="my-1 h-px bg-white/[0.06]" />
            <button
              type="button"
              onClick={() => { setCtxMenu(null); openFind(); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#c9c9c9] hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
              Find…
              <span className="kbd ml-auto">Ctrl+F</span>
            </button>
            <button
              type="button"
              onClick={() => { setCtxMenu(null); setGoToOpen(true); setGoToInput(String(cursor.line)); }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12px] text-[#c9c9c9] hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><rect x="3" y="6" width="10" height="8" rx="1.5" /><path d="M5.5 9h.01M8 9h.01M10.5 9h.01M4 6V4.5h8V6" /></svg>
              Go to Line…
              <span className="kbd ml-auto">Ctrl+G</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}