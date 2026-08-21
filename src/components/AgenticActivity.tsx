import { useEffect, useState } from "react";
import type { AgenticActivity as AgenticActivityType } from "../agentic";
import { TOOL_LABELS } from "../agentic";

interface AgenticActivityProps {
  items: AgenticActivityType[];
  pending: AgenticActivityType | null;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

const STATUS_COLORS: Record<AgenticActivityType["status"], string> = {
  pending: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  running: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  approved: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  denied: "text-red-400 border-red-400/30 bg-red-400/5",
  done: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5",
  error: "text-red-400 border-red-400/30 bg-red-400/5",
};

const STATUS_ICON: Record<AgenticActivityType["status"], string> = {
  pending: "⏳",
  running: "🔄",
  approved: "✅",
  denied: "⛔",
  done: "✔️",
  error: "❌",
};

function shortPath(p: string): string {
  if (p.length <= 64) return p;
  const parts = p.replace(/\\/g, "/").split("/");
  if (parts.length <= 2) return p;
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

export default function AgenticActivity({
  items,
  pending,
  onApprove,
  onDeny,
}: AgenticActivityProps) {
  const [closed, setClosed] = useState<string[]>([]);

  useEffect(() => {
    if (pending) {
      setClosed((prev) => prev.filter((id) => id !== pending.id));
    }
  }, [pending?.id]);

  const remove = (id: string) => setClosed((prev) => [...prev, id]);
  const isClosed = (id: string) => closed.includes(id);

  const visible = items.filter((item) => !isClosed(item.id));
  if (visible.length === 0 && !pending) return null;

  return (
    <div className="relative z-20 mx-auto w-full max-w-3xl px-5 pt-2">
      <div className="space-y-2">
        {pending && (
          <div className="rounded-xl border border-yellow-400/40 bg-[#11110c]/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-yellow-300">
                  <span>{STATUS_ICON.pending}</span>
                  <span>{TOOL_LABELS[pending.tool]}</span>
                  <span className="text-[11px] text-yellow-400/60">
                    requires your approval
                  </span>
                </div>
                <div className="mt-1.5 space-y-1 font-mono text-[11px] text-zinc-400">
                      {Object.entries(pending.args).map(([k, v]) => {
                        const val: string =
                          k === "path" || k === "new_path"
                            ? shortPath(String(v))
                            : String(v);
                        return (
                          <div key={k}>
                            <span className="text-zinc-600">{k}:</span>{" "}
                            {val}
                          </div>
                        );
                      })}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => onDeny(pending.id)}
                  className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-400/10"
                >
                  Deny
                </button>
                <button
                  onClick={() => onApprove(pending.id)}
                  className="rounded-lg bg-yellow-400/90 px-3 py-1.5 text-xs font-semibold text-[#11100a] transition hover:bg-yellow-300"
                >
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {visible.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border px-3 py-2 ${STATUS_COLORS[item.status]}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span>{STATUS_ICON[item.status]}</span>
                <span className="font-medium">{TOOL_LABELS[item.tool]}</span>
                {item.args.path != null && (
                  <span className="truncate font-mono text-[10px] opacity-70">
                    {shortPath(String(item.args.path))}
                  </span>
                )}
              </div>
              <button
                onClick={() => remove(item.id)}
                className="shrink-0 text-[10px] text-zinc-500 transition hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            {item.output && (
              <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-5 text-zinc-400">
                {item.output}
              </pre>
            )}
            {item.error && (
              <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-red-500/5 px-2 py-1.5 font-mono text-[10px] leading-5 text-red-300">
                {item.error}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}