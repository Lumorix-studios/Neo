import { useEffect, useState } from "react";
import type { AgenticActivity as AgenticActivityType, FsEntry } from "../agentic";
import { TOOL_LABELS } from "../agentic";
import { diffStats } from "../../src/diff";

interface AgenticActivityProps {
  items: AgenticActivityType[];
  pending: AgenticActivityType | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

const STATUS_DOT: Record<AgenticActivityType["status"], string> = {
  pending: "bg-blue-500",
  running: "bg-blue-400 animate-pulse",
  approved: "bg-zinc-500",
  denied: "bg-red-500",
  done: "bg-emerald-500",
  error: "bg-red-500",
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
      className={`h-3 w-3 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArgsPreview({ args }: { args: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(args);
  const isLong = entries.some(([, v]) => String(v).length > 120);

  return (
    <div className="mt-2 overflow-hidden rounded border border-zinc-800 bg-zinc-900/50">
      <pre
        className={`overflow-auto px-3 py-2 font-mono text-[11px] leading-5 text-zinc-400 ${
          expanded ? "max-h-64" : "max-h-24"
        }`}
      >
        {entries.map(([k, v]) => (
          <div key={k} className="break-all">
            <span className="text-zinc-600">{k}: </span>
            {k === "path" || k === "new_path" ? shortPath(String(v)) : String(v)}
          </div>
        ))}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-zinc-800 px-3 py-1 text-left text-[10px] text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

function StructuredOutput({ item }: { item: AgenticActivityType }) {
  if (item.tool === "list_dir" && Array.isArray(item.data)) {
    const entries = item.data as FsEntry[];
    return (
      <div className="mx-3 mb-2 overflow-hidden rounded border border-zinc-800 bg-zinc-900/30">
        <table className="w-full text-left text-[11px] font-mono">
          <thead className="bg-zinc-800/50 text-zinc-500">
            <tr>
              <th className="px-2 py-1 font-medium">Name</th>
              <th className="px-2 py-1 font-medium text-right">Size</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-2 py-1 text-zinc-300">
                  <span className={e.is_dir ? "text-blue-400" : "text-zinc-400"}>
                    {e.is_dir ? "📁 " : "📄 "}{e.name}
                  </span>
                </td>
                <td className="px-2 py-1 text-right text-zinc-600">
                  {e.size ? `${(e.size / 1024).toFixed(1)}KB` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!item.output) return null;

  return (
    <pre className="mx-3 mb-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2 font-mono text-[11px] leading-5 text-zinc-400">
      {item.output}
    </pre>
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
  const [groupOpen, setGroupOpen] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const id = pending.id;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); onApprove(id); } 
      else if (e.key === "Escape") { e.preventDefault(); onDeny(id); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending, onApprove, onDeny]);

  const remove = (id: string) => setClosed((prev) => [...prev, id]);
  const isClosed = (id: string) => closed.includes(id);
  const toggleRow = (id: string) =>
    setExpandedRows((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const visible = items.filter((item) => !isClosed(item.id));

  const total = visible.length;
  const activeCount = visible.filter((i) => i.status === "running" || i.status === "pending").length;
  const failedCount = visible.filter((i) => i.status === "error" || i.status === "denied").length;
  const totals = visible.reduce((acc, item) => {
      if (item.diff) {
        const s = diffStats(item.diff);
        acc.adds += s.adds; acc.dels += s.dels;
      }
      return acc;
    }, { adds: 0, dels: 0 });

  const headerDot = pending ? STATUS_DOT.pending : activeCount > 0 ? STATUS_DOT.running : failedCount > 0 ? STATUS_DOT.error : STATUS_DOT.done;

  if (total === 0 && !pending) return null;

  return (
    <div className="relative z-20 mx-auto w-full max-w-3xl px-5 pt-2">
      <div className="space-y-2">
        {pending && (
          <div className="rounded border border-blue-500/30 bg-blue-500/5 shadow-sm">
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
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => onDeny(pending.id)}
                  className="rounded px-2 py-1 text-[11px] text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                >
                  Deny
                </button>
                <button
                  onClick={() => onApprove(pending.id)}
                  className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-blue-500"
                >
                  Approve
                </button>
              </div>
            </div>
            <div className="px-3 pb-2.5">
              <ArgsPreview args={pending.args} />
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-900/40">
            <div className="group/head flex w-full items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setGroupOpen(!groupOpen)}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${headerDot}`} />
              <span className="text-[12px] font-medium text-zinc-300">Agent Activity</span>
              <span className="text-[11px] text-zinc-600">
                {total} calls {activeCount > 0 ? `· ${activeCount} running` : ""}
              </span>
              {totals.adds + totals.dels > 0 && (
                <span className="ml-auto font-mono text-[10px]">
                  <span className="text-emerald-400">+{totals.adds}</span> <span className="text-red-400">−{totals.dels}</span>
                </span>
              )}
              <Chevron open={groupOpen} />
            </div>

            {groupOpen && (
              <div className="max-h-80 overflow-y-auto border-t border-zinc-800">
                {visible.map((item) => {
          const open = expandedRows.includes(item.id);
          const hasDetail = !!(item.output || item.error || item.data);
          return (
            <div key={item.id} className="group transition-colors hover:bg-white/[0.02]">
              <button
                onClick={() => hasDetail && toggleRow(item.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${hasDetail ? "cursor-pointer" : ""}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
                <span className="text-[12px] text-zinc-300">
                  {TOOL_LABELS[item.tool as keyof typeof TOOL_LABELS] ?? item.tool}
                </span>
                {typeof item.args.path === "string" && item.args.path && (
                  <span className="flex-1 truncate font-mono text-[11px] text-zinc-500">
                    {shortPath(item.args.path)}
                  </span>
                )}
                {hasDetail && <Chevron open={open} />}
                <span
                  onClick={(e) => { e.stopPropagation(); remove(item.id); }}
                  className="ml-1 text-[11px] text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-zinc-400"
                >
                  ✕
                </span>
              </button>
              {open && (
                <div className="px-3 pb-2">
                  {item.diff && item.diff.length > 0 && (
                    <div className="mb-2 overflow-hidden rounded border border-zinc-800 bg-black/40 font-mono text-[11px]">
                      {item.diff.map((l, i) => (
                        <div key={i} className={l.type === "add" ? "bg-emerald-500/10 text-emerald-400" : l.type === "del" ? "bg-red-500/10 text-red-400" : "text-zinc-600"}>
                          <span className="px-2 opacity-50">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
                          <span className="whitespace-pre-wrap break-all">{l.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <StructuredOutput item={item} />
                </div>
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
