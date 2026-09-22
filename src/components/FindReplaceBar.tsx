/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
import { useEffect, useRef } from "react";
import { IoArrowDownOutline, IoArrowUpOutline, IoClose, IoSearch } from "react-icons/io5";

interface FindReplaceBarProps {
  query: string;
  replaceQuery: string;
  caseSensitive: boolean;
  replaceMode: boolean;
  matchCount: number;
  matchIndex: number; // -1 when no current match
  onChangeQuery: (q: string) => void;
  onChangeReplace: (q: string) => void;
  onCaseSensitive: (v: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onToggleReplace: (v: boolean) => void;
  onClose: () => void;
}

const inputCls =
  "w-full rounded-md border border-(--border) bg-black/30 px-2 py-1 text-[11.5px] text-[var(--text-primary)] outline-none transition focus:border-(--accent)/50 placeholder:text-[var(--text-faint)]";

/** Compact find/replace bar shown above the editor when Ctrl+F is pressed. */
export default function FindReplaceBar({
  query,
  replaceQuery,
  caseSensitive,
  replaceMode,
  matchCount,
  matchIndex,
  onChangeQuery,
  onChangeReplace,
  onCaseSensitive,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onToggleReplace,
  onClose,
}: FindReplaceBarProps) {
  const qRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    qRef.current?.focus();
    qRef.current?.select();
  }, []);

  const status = query ? `${Math.max(0, matchIndex + 1)}/${matchCount}` : "";

  return (
    <div className="shrink-0 border-b border-(--border) bg-[var(--bg-elevated)] px-3 py-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex flex-1 items-center gap-1">
          <span className="text-[var(--text-faint)]">
            <IoSearch size={12} />
          </span>
          <input
            ref={qRef}
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) onPrev();
                else onNext();
              }
              if (e.key === "Escape") { e.stopPropagation(); onClose(); }
            }}
            placeholder="Find"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-1 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)]"
          />
          <span className={`shrink-0 text-[10.5px] tabular-nums ${matchCount > 0 ? "text-[var(--text-secondary)]" : "text-[#e5534b]"}`}>
            {status || "0/0"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onToggleReplace(!replaceMode)}
            title={replaceMode ? "Hide replace" : "Show replace"}
            className={`rounded px-1.5 py-1 text-[11px] transition ${replaceMode ? "text-(--accent)" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
          >
            Replace
          </button>
          <button type="button" onClick={() => onCaseSensitive(!caseSensitive)} title="Match case"
            className={`rounded px-1.5 py-1 text-[11px] transition ${caseSensitive ? "text-(--accent)" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
            Aa
          </button>
          <span className="mx-0.5 h-4 w-px bg-(--fill-2)" />
          <button type="button" onClick={onPrev} title="Previous (Shift+Enter)"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]">
            <IoArrowUpOutline size={12} />
          </button>
          <button type="button" onClick={onNext} title="Next (Enter)"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]">
            <IoArrowDownOutline size={12} />
          </button>
          <span className="mx-0.5 h-4 w-px bg-(--fill-2)" />
          <button type="button" onClick={onClose} title="Close (Esc)"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]">
            <IoClose size={11} />
          </button>
        </div>
      </div>

      {replaceMode && (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={replaceQuery}
            onChange={(e) => onChangeReplace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onReplace(); }
              if (e.key === "Escape") { e.stopPropagation(); onClose(); }
            }}
            placeholder="Replace"
            spellCheck={false}
            className={inputCls}
          />
          <button type="button" onClick={() => onReplace()} disabled={!matchCount}
            className="shrink-0 rounded-md border border-(--border) px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) disabled:opacity-40">
            Replace
          </button>
          <button type="button" onClick={() => onReplaceAll()} disabled={!matchCount}
            className="shrink-0 rounded-md border border-(--border) px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) disabled:opacity-40">
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}