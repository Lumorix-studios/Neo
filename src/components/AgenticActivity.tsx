import { useEffect, useState } from "react";
import type { AgenticActivity as AgenticActivityType } from "../agentic";
import { TOOL_LABELS } from "../agentic";
import { diffStats } from "../../src/diff";

interface AgenticActivityProps {
  items: AgenticActivityType[];
  pending: AgenticActivityType | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

/** Tiny status dot — muted, minimal (no boxes, no badges). */
const STATUS_DOT: Record<AgenticActivityType["status"], string> = {
  pending: "bg-amber-400/80",
  running: "bg-blue-400/70 animate-pulse",
  approved: "bg-zinc-600",
  denied: "bg-red-400/70",
  done: "bg-emerald-500/60",
  error: "bg-red-400/70",
};

function shortPath(p: string): string {
  if (p.length <= 56) return p;
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 2) return p;
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-3 w-3 shrink-0 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Compact mono preview of the tool arguments, collapsible when long. */
function ArgsPreview({ args }: { args: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(args);
  const isLong = entries.some(([, v]) => String(v).length > 120);

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-zinc-800/80 bg-black/40">
      <pre
        className={`overflow-auto px-2.5 py-2 font-mono text-[11px] leading-5 text-zinc-400 ${
          expanded ? "max-h-64" : "max-h-24"
        }`}
      >
        {entries.map(([k, v]) => {
          const raw = String(v);
          const val =
            k === "path" || k === "new_path"
              ? shortPath(raw)
              : raw.length > 400 && !expanded
                ? raw.slice(0, 400) + "…"
                : raw;
          return (
            <div key={k} className="break-all">
              <span className="text-zinc-600">{k}: </span>
              {val}
            </div>
          );
        })}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-zinc-800/80 px-2.5 py-1 text-left text-[10px] text-zinc-500 transition hover:bg-zinc-800/50 hover:text-zinc-300"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export default function AgenticActivity({
  items,
  pending,
  onApprove,
  onDeny,
}: AgenticActivityProps) {
  const [closed, setClosed] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  // The whole feed lives in ONE collapsible group so it never covers the
  // chat — collapsed by default, expandable on demand.
  const [groupOpen, setGroupOpen] = useState(false);

  // Cursor-style keyboard shortcuts: Enter accepts, Esc rejects. The effect
  // only re-registers when the approval dialog opens/closes or the callbacks
  // change — no refs needed.
  useEffect(() => {
    if (!pending) return;
    const id = pending.id;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onApprove(id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDeny(id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending, onApprove, onDeny]);

  const remove = (id: string) => setClosed((prev) => [...prev, id]);
  const isClosed = (id: string) => closed.includes(id);
  const toggleRow = (id: string) =>
    setExpandedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const visible = items.filter((item) => !isClosed(item.id));

  // Header summary: totals, live status, and cumulative diff stats.
  const total = visible.length;
  const activeCount = visible.filter(
    (i) => i.status === "running" || i.status === "pending"
  ).length;
  const failedCount = visible.filter(
    (i) => i.status === "error" || i.status === "denied"
  ).length;
  const totals = visible.reduce(
    (acc, item) => {
      if (item.diff && item.diff.length > 0) {
        const s = diffStats(item.diff);
        acc.adds += s.adds;
        acc.dels += s.dels;
      }
      return acc;
    },
    { adds: 0, dels: 0 }
  );

  const headerDot = pending
    ? STATUS_DOT.pending
    : activeCount > 0
      ? STATUS_DOT.running
      : failedCount > 0
        ? STATUS_DOT.error
        : STATUS_DOT.done;

  if (total === 0 && !pending) return null;

  return (
    <div className="relative z-20 mx-auto w-full max-w-3xl px-5 pt-2">
      <div className="space-y-1.5">
        {pending && (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/80 shadow-md shadow-black/20">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT.pending}`} />
                <span className="text-[12px] font-medium text-zinc-200">
                  {TOOL_LABELS[pending.tool as keyof typeof TOOL_LABELS] ?? pending.tool}
                </span>
                {typeof pending.args.path === "string" && (
                  <span className="truncate font-mono text-[11px] text-zinc-500">
                    {shortPath(pending.args.path)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => onDeny(pending.id)}
                  className="rounded px-2.5 py-1 text-[11px] text-zinc-500 transition hover:text-zinc-200"
                  title="Reject (Esc)"
                >
                  Reject
                </button>
                <button
                  onClick={() => onApprove(pending.id)}
                  className="rounded bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-900 transition hover:bg-white"
                  title="Accept (Enter)"
                >
                  Accept
                </button>
              </div>
            </div>
            <div className="px-3 pb-2.5">
              <ArgsPreview args={pending.args} />
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="overflow-hidden rounded-md border border-zinc-800/80 bg-zinc-900/50">
            {/* Single summary header — the only thing visible when collapsed. */}
            <div className="group/head flex w-full items-center gap-2 px-3 py-1.5">
              <button
                onClick={() => setGroupOpen((v) => !v)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={groupOpen ? "Hide agent activity" : "Show agent activity"}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${headerDot}`} />
                <span className="shrink-0 text-[12px] font-medium text-zinc-300">
                  Agent activity
                </span>
                <span className="shrink-0 text-[11px] text-zinc-600">
                  {total} tool call{total === 1 ? "" : "s"}
                  {activeCount > 0 ? ` · ${activeCount} running` : ""}
                  {failedCount > 0 ? ` · ${failedCount} failed` : ""}
                </span>
                {totals.adds + totals.dels > 0 && (
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">
                    <span className="text-emerald-400">+{totals.adds}</span>{" "}
                    <span className="text-red-400">−{totals.dels}</span>
                  </span>
                )}
                <span className="min-w-0 flex-1" />
                <Chevron open={groupOpen} />
              </button>
              <button
                onClick={() => setClosed(items.map((i) => i.id))}
                title="Dismiss activity"
                className="shrink-0 text-[11px] text-zinc-700 opacity-0 transition hover:text-zinc-300 group-hover/head:opacity-100"
              >
                ✕
              </button>
            </div>

            {/* Collapsible scrollable list — one row per tool call. */}
            {groupOpen && (
              <div className="max-h-72 overflow-y-auto border-t border-zinc-800/80">
                {visible.map((item) => {
          const open = expandedRows.includes(item.id);
          const hasDetail = !!(item.output || item.error);
          return (
            <div
              key={item.id}
              className="group rounded-md transition-colors hover:bg-white/[0.03]"
            >
              <button
                onClick={() => hasDetail && toggleRow(item.id)}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left ${
                  hasDetail ? "cursor-pointer" : "cursor-default"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
                <span className="text-[12px] font-medium text-zinc-300">
                  {TOOL_LABELS[item.tool as keyof typeof TOOL_LABELS] ?? item.tool}
                </span>
                {item.args.path != null && (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">
                    {shortPath(String(item.args.path))}
                  </span>
                )}
                {item.diff && (() => {
                  const { adds, dels } = diffStats(item.diff);
                  return adds + dels > 0 ? (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">
                      <span className="text-emerald-400">+{adds}</span>{" "}
                      <span className="text-red-400">−{dels}</span>
                    </span>
                  ) : null;
                })()}
                {hasDetail && <Chevron open={open} />}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(item.id);
                  }}
                  className="ml-1 shrink-0 text-[11px] text-zinc-700 opacity-0 transition hover:text-zinc-300 group-hover:opacity-100"
                >
                  ✕
                </span>
              </button>
              {open && item.diff && item.diff.length > 0 && (
                <div className="mx-3 mb-2 overflow-hidden rounded-md border border-zinc-800/80 bg-black/40">
                  <div className="max-h-64 overflow-auto font-mono text-[11px] leading-5">
                    {item.diff.map((l, i) => (
                      <div
                        key={i}
                        className={
                          l.type === "add"
                            ? "bg-emerald-500/[0.08] text-emerald-300"
                            : l.type === "del"
                              ? "bg-red-500/[0.08] text-red-300"
                              : "text-zinc-600"
                        }
                      >
                        <span className="select-none px-2 opacity-60">
                          {l.type === "add" ? "+" : l.type === "del" ? "−" : " "}
                        </span>
                        <span className="whitespace-pre-wrap break-all">{l.text || " "}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {open && item.output && (
                <pre className="mx-3 mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-zinc-800/80 bg-black/40 px-2.5 py-2 font-mono text-[11px] leading-5 text-zinc-400">
                  {item.output}
                </pre>
              )}
              {open && item.error && (
                <pre className="mx-3 mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2 font-mono text-[11px] leading-5 text-red-300">
                  {item.error}
                </pre>
              )}
            </div>
          );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}