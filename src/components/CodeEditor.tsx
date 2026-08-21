import { useMemo, useRef } from "react";
import { langOf, highlightCode, LANG_BADGE } from "./highlight";

export interface EditorTab {
  path: string;
  content: string;
  dirty: boolean;
}

interface CodeEditorProps {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onCloseAll?: () => void;
}

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

  const activeContent = active?.content ?? "";
  const activeLang = active ? langOf(active.path) : "text";
  const highlighted = useMemo(
    () => highlightCode(activeContent, activeLang),
    [activeContent, activeLang]
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-zinc-800 bg-[#0c0c0e]">
      <div className="flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b border-zinc-800">
        {tabs.length === 0 && (
          <div className="px-3 text-[12px] text-zinc-600">Open a file from the explorer</div>
        )}
        {tabs.map((t) => {
          const selected = t.path === activePath;
          return (
            <div
              key={t.path}
              className={`group flex h-full items-center border-r border-zinc-800 ${
                selected ? "bg-zinc-900 text-zinc-100" : "text-zinc-500"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(t.path)}
                className="flex max-w-[180px] items-center gap-1.5 truncate px-2.5 py-2 text-[12px]"
                title={t.path}
              >
                <LangBadge path={t.path} />
                <span className="truncate">
                  {fileName(t.path)}
                  {t.dirty ? " •" : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onClose(t.path)}
                className="pr-2 text-[11px] text-zinc-600 hover:text-zinc-200"
                aria-label={`Close ${fileName(t.path)}`}
              >
                ×
              </button>
            </div>
          );
        })}
        {/* Tab actions — Close All + Save */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-2">
          {tabs.length > 0 && onCloseAll && (
            <button
              type="button"
              onClick={onCloseAll}
              className="rounded-md px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              title="Close all tabs"
            >
              Close All
            </button>
          )}
          <button
            type="button"
            disabled={!active?.dirty}
            onClick={() => active && onSave(active.path)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              active?.dirty
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "cursor-not-allowed bg-zinc-800/60 text-zinc-600"
            }`}
            title="Save (Ctrl+S)"
          >
            Save
          </button>
        </div>
      </div>
      {active ? (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              onSave(active.path);
            }
          }}
        >
          {/* Highlighted layer behind a transparent textarea (scroll-synced) */}
          <div className="relative min-h-0 flex-1 overflow-hidden font-mono text-[12.5px] leading-5">
            <pre
              ref={preRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3 text-zinc-200"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
              value={active.content}
              onChange={(e) => onChange(active.path, e.target.value)}
              onScroll={(e) => {
                if (preRef.current) {
                  preRef.current.scrollTop = e.currentTarget.scrollTop;
                  preRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
              spellCheck={false}
              wrap="off"
              className="absolute inset-0 resize-none overflow-auto whitespace-pre bg-transparent p-3 text-transparent caret-zinc-100 outline-none selection:bg-zinc-600/50"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
          Select a file to edit
        </div>
      )}
    </section>
  );
}