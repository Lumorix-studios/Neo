import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, UIEvent as ReactUIEvent } from "react";
import { langOf, highlightCode, LANG_BADGE } from "./highlight";

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

/** Small colored language badge used on editor tabs and explorer rows. */
export function LangBadge({ path }: { path: string }) {
  const meta = LANG_BADGE[langOf(path)] ?? LANG_BADGE.text;
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
      title={langOf(path)}
    >
      {meta.label}
    </span>
  );
}

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
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const activeContent = active?.content ?? "";
  const activeLang = active ? langOf(active.path) : "text";
  const highlighted = useMemo(
    () => highlightCode(activeContent, activeLang),
    [activeContent, activeLang]
  );
  const lineCount = useMemo(() => activeContent.split("\n").length, [activeContent]);
  const gutterDigits = Math.max(2, String(lineCount).length);

  // Reset scroll + cursor bookkeeping whenever the user switches tabs.
  useEffect(() => {
    setScrollTop(0);
    setCursor({ line: 1, col: 1 });
    const el = taRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [activePath]);

  const syncCursor = () => {
    const el = taRef.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split("\n");
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  /**
   * Replace the [from,to) range with `text`, preferring execCommand so the
   * native undo stack survives. Falls back to a controlled-state edit.
   */
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
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0d0d10]">
      {/* ── Tab strip ─────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-stretch border-b border-zinc-800/80 bg-[#111114]">
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
                className={`group relative flex shrink-0 items-center border-r border-zinc-800/60 transition-colors ${
                  selected
                    ? "bg-[#0d0d10] text-zinc-100"
                    : "bg-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
                }`}
              >
                {selected && (
                  <span className="absolute inset-x-0 top-0 h-[2px] bg-sky-500" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(t.path)}
                  className="flex max-w-[190px] items-center gap-2 py-0 pl-3 pr-1 text-[12px]"
                  title={t.path}
                >
                  <LangBadge path={t.path} />
                  <span className={`truncate ${t.dirty ? "italic" : ""}`}>
                    {fileName(t.path)}
                  </span>
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
                      <span className="hidden text-[14px] leading-none text-zinc-400 group-hover:block hover:text-zinc-100">
                        ×
                      </span>
                    </>
                  ) : (
                    <span className="text-[14px] leading-none text-transparent group-hover:text-zinc-500 hover:text-zinc-100">
                      ×
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Tab actions */}
        <div className="flex shrink-0 items-center gap-1.5 border-l border-zinc-800/60 px-2">
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
                ? "bg-sky-500 text-white shadow-[0_0_14px_rgba(14,165,233,0.35)] hover:bg-sky-400"
                : "cursor-default bg-white/[0.04] text-zinc-600"
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
          <div className="flex h-7 shrink-0 items-center gap-1 overflow-hidden border-b border-zinc-800/50 px-3 text-[11px] text-zinc-600">
            {visibleCrumbs.map((seg, i) => (
              <span key={`${seg}-${i}`} className="flex items-center gap-1 whitespace-nowrap">
                {i > 0 && <span className="text-zinc-700">›</span>}
                <span className={i === visibleCrumbs.length - 1 ? "text-zinc-400" : ""}>
                  {seg}
                </span>
              </span>
            ))}
            {active.dirty && (
              <span className="ml-2 shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-400">
                unsaved changes
              </span>
            )}
          </div>

          {/* ── Editor surface ──────────────────────────────────── */}
          <div className="flex min-h-0 flex-1">
            {/* Line-number gutter */}
            <div
              className="relative shrink-0 select-none overflow-hidden bg-[#0d0d10] text-right font-mono text-[12.5px]"
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
                className="absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent pb-20 pl-4 pr-10 text-transparent caret-sky-300 outline-none selection:bg-sky-500/25"
                style={{ paddingTop: PAD_TOP, lineHeight: `${LINE_HEIGHT}px` }}
              />
            </div>
          </div>

          {/* ── Status bar ──────────────────────────────────────── */}
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-zinc-800/80 bg-[#111114] px-3 text-[10.5px] text-zinc-500">
            <div className="flex items-center gap-3">
              <span>
                Ln {cursor.line}, Col {cursor.col}
              </span>
              <span>{lineCount} lines</span>
              <span>{activeContent.length} chars</span>
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
              <span className="capitalize">{activeLang}</span>
            </div>
          </div>
        </>
      ) : (
        /* ── Empty state ───────────────────────────────────────── */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 font-mono text-lg text-zinc-600">
            {"</>"}
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-400">No file open</p>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Pick a file from the explorer, or ask the AI to create one —
              <br />
              changes it makes will stream straight into this editor.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}