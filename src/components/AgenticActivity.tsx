import { useEffect, useState } from "react";
import type { AgenticActivity as AgenticActivityType } from "../agentic";
import { TOOL_LABELS } from "../agentic";

interface AgenticActivityProps {
  items: AgenticActivityType[];
  pending: AgenticActivityType | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

/** Tiny status dot — no emoji, Cursor-style. */
const STATUS_DOT: Record<AgenticActivityType["status"], string> = {
  pending: "bg-amber-400",
  running: "bg-blue-400 animate-pulse",
  approved: "bg-zinc-500",
  denied: "bg-red-400",
  done: "bg-emerald-400",
  error: "bg-red-400",
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
  if (visible.length === 0 && !pending) return null;

  return (
    <div className="relative z-20 mx-auto w-full max-w-3xl px-5 pt-2">
      <div className="space-y-1.5">
        {pending && (
          <div className="rounded-lg border border-zinc-700/80 bg-zinc-900 shadow-lg shadow-black/40">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT.pending}`} />
                <span className="text-[12px] font-medium text-zinc-200">
                  {TOOL_LABELS[pending.tool]}
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
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  title="Reject (Esc)"
                >
                  Reject
                </button>
                <button
                  onClick={() => onApprove(pending.id)}
                  className="rounded-md bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-900 transition hover:bg-white"
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

        {visible.map((item) => {
          const open = expandedRows.includes(item.id);
          const hasDetail = !!(item.output || item.error);
          return (
            <div
              key={item.id}
              className="group rounded-lg border border-zinc-800/80 bg-zinc-900/60"
            >
              <button
                onClick={() => hasDetail && toggleRow(item.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                  hasDetail ? "cursor-pointer hover:bg-zinc-800/40" : "cursor-default"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
                <span className="text-[12px] font-medium text-zinc-300">
                  {TOOL_LABELS[item.tool]}
                </span>
                {item.args.path != null && (
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">
                    {shortPath(String(item.args.path))}
                  </span>
                )}
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
    </div>
  );
}