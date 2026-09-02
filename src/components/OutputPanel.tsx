
import { useEffect, useMemo, useRef, useState } from "react";
import { IoBan } from "react-icons/io5";
import {
  clearLogs,
  subscribeLogs,
  type LogChannel,
  type LogEntry,
} from "./logBus";

const CHANNELS: (LogChannel | "All")[] = [
  "All",
  "Git",
  "Problems",
  "Debug Console",
  "Ports",
  "App",
];

const CHANNEL_COLORS: Record<LogChannel, string> = {
  Git: "#7ea6ff",
  Problems: "#e2b93d",
  "Debug Console": "#c39dde",
  Ports: "#58bd5a",
  App: "#8a8a93",
};

function timeOf(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export default function OutputPanel() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogChannel | "All">("All");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeLogs((entry) => setEntries((prev) => [...prev.slice(-499), entry]));
    return unsub;
  }, []);

  const shown = useMemo(
    () => (filter === "All" ? entries : entries.filter((e) => e.channel === filter)),
    [entries, filter]
  );

  // Follow the tail as new output arrives.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [shown.length]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-8 shrink-0 items-center gap-2 px-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as LogChannel | "All")}
          className="rounded-md border border-white/[0.08] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[#d4d4d4] outline-none"
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-[10.5px] text-[#6b6b6b]">{shown.length} line(s)</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            clearLogs();
            setEntries([]);
          }}
          disabled={entries.length === 0}
          title="Clear output"
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec] disabled:pointer-events-none disabled:opacity-40"
        >
          <IoBan size={11} />
          Clear
        </button>
      </div>

      {/* Stream */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[11px] leading-4 scrollbar-thin">
        {shown.length === 0 && (
          <p className="py-2 font-sans text-[11.5px] text-[#6b6b6b]">
            No output yet — commit with the Git panel, run a problems scan or
            evaluate something in the debug console and it will show up here.
          </p>
        )}
        {shown.map((e, i) => (
          <p key={`${e.time}-${i}`} className="whitespace-pre-wrap break-all">
            <span className="mr-2 select-none text-[#4f4f57]">{timeOf(e.time)}</span>
            <span
              className="mr-2 select-none"
              style={{ color: CHANNEL_COLORS[e.channel] }}
            >
              [{e.channel}]
            </span>
            <span className="text-zinc-300">{e.message}</span>
          </p>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
