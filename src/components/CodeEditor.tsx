import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent as ReactUIEvent } from "react";
import { langOf, langColorOf, highlightCode, commentToken } from "./highlight";
import { FileIcon } from "./FileIcon";

export interface EditorTab {
  path: string;
  content: string;
  dirty: boolean;
}

export interface CodeEditorProps {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onCloseAll?: () => void;
}

/** Metrics shared by the gutter, highlight layer and textarea so they stay pixel-aligned. */
const LINE_HEIGHT = 20;
const PAD_TOP = 10;

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function pathSegments(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

export default function CodeEditor({
  tabs,
  activePath,
  onSelect,
  onClose,
  onChange,
  onSave,
  onCloseAll,
}: CodeEditorProps) {
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
  }, [activePath]);

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
        const m = /^( {1,2}|\t)/.exec(el.value.slice(lineStart));
        if (m) replaceRange("", lineStart, lineStart + m[0].length);
      } else if (s !== en) {
        const lineStart = el.value.lastIndexOf("\n", s - 1) + 1;
        const chunk = el.value.slice(lineStart, en);
        replaceRange(chunk.replace(/^/gm, "  "), lineStart, en);
      } else {
        replaceRange("  ", s, en);
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
      const extra = "{[(:>".includes(prevCh) ? "  " : "";
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

  const crumbs = active ? pathSegments(active.path) : [];
  const visibleCrumbs = crumbs.length > 4 ? ["…", ...crumbs.slice(-3)] : crumbs;

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#131313]">
      {/* ── Tab strip */}
      <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.07] bg-[#161616]">
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
                className={`group relative flex shrink-0 items-center border-r border-white/[0.06] transition-colors ${
                  selected
                    ? "bg-[#1a1a1a] text-zinc-100"
                    : "bg-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
              >
                {/* Language-coloured top accent on the active tab */}
                <span
                  className="absolute inset-x-0 top-0 h-[2px] transition-opacity"
                  style={{ backgroundColor: langColorOf(t.path), opacity: selected ? 1 : 0 }}
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
          {tabs.length > 0 && onCloseAll && (
            <button
              type="button"
              onClick={onCloseAll}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              title="Close all tabs"
            >
              Close all
            </button>
          )}
          <button
            type="button"
            disabled={!active?.dirty}
            onClick={() => active && onSave(active.path)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                active?.dirty
                  ? "bg-[#ececec] text-[#111111] hover:bg-white"
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
                <span className={i === visibleCrumbs.length - 1 ? "text-zinc-400" : ""}>
                  {seg}
                </span>
              </span>
            ))}
            {active.dirty && (
              <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-px text-[10px] font-medium text-amber-400">
                <span className="h-1 w-1 rounded-full bg-current" />
                unsaved
              </span>
            )}
          </div>

          {/* ── Editor surface ──────────────────────────────────── */}
          <div className="flex min-h-0 flex-1">
            {/* Line-number gutter */}
            <div
              className="relative shrink-0 select-none overflow-hidden bg-[#131313] text-right font-mono text-[12.5px]"
              style={{ width: gutterDigits * 7.6 + 28 }}
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

            {/* Code area: highlight layer under a transparent textarea */}
            <div className="relative min-w-0 flex-1 overflow-hidden font-mono text-[12.5px]">
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
                className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre pb-20 pl-4 pr-10 text-zinc-200"
                style={{ paddingTop: PAD_TOP, lineHeight: `${LINE_HEIGHT}px` }}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
              <textarea
                ref={taRef}
                value={active.content}
                onChange={(e) => onChange(active.path, e.target.value)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                onClick={syncCursor}
                onKeyUp={syncCursor}
                onSelect={syncCursor}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                wrap="off"
                className="absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent pb-20 pl-4 pr-10 text-transparent caret-[#4c8dff] outline-none selection:bg-[#4c8dff]/25"
                style={{ paddingTop: PAD_TOP, lineHeight: `${LINE_HEIGHT}px` }}
              />
            </div>
          </div>

          {/* ── Status bar  */}
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-white/[0.07] bg-[#161616] px-3 text-[10.5px] text-zinc-500">
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
              <span>Spaces: 2</span>
              <span>UTF-8</span>
              <span className="flex items-center gap-1 capitalize">
                <FileIcon name={active.path} />
                {activeLang}
              </span>
            </div>
          </div>
        </>
      ) : (
        /* ── Empty state */
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/3 h-56 w-80 max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4c8dff]/[0.06] blur-3xl"
          />
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent shadow-inner">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 6l-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#d4d4d4]">No file open</p>
            <p className="mt-1 text-[11.5px] leading-5 text-[#6b6b6b]">
              Pick a file from the explorer, or ask the AI to create one —
              <br />
              changes it makes will stream straight into this editor.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px] text-zinc-600">
            <span><kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-px">Ctrl+S</kbd> save</span>
            <span><kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-px">Ctrl+/</kbd> comment</span>
            <span><kbd className="rounded border border-white/10 bg-white/[0.04] px-1 py-px">Tab</kbd> indent</span>
          </div>
        </div>
      )}
    </section>
  );
}