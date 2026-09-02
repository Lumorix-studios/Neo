
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { IoOpenOutline, IoRefresh } from "react-icons/io5";

interface PortRow {
  port: number;
  address: string;
  pid: number | null;
  process: string | null;
}

interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

const IS_WINDOWS =
  typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent);

/** One combined PowerShell query returning "port|address|pid|process" rows. */
const WIN_CMD =
  "Get-NetTCPConnection -State Listen | ForEach-Object { " +
  "$p = $_.OwningProcess; " +
  "$n = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName; " +
  "'{0}|{1}|{2}|{3}' -f $_.LocalPort, $_.LocalAddress, $p, $n }";

function parseWindows(out: string): PortRow[] {
  const seen = new Set<string>();
  const rows: PortRow[] = [];
  for (const line of out.split(/\r?\n/)) {
    const [portS, addr, pidS, proc] = line.trim().split("|");
    const port = parseInt(portS, 10);
    if (!Number.isFinite(port) || port <= 0) continue;
    const key = `${port}:${addr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      port,
      address: addr ?? "?",
      pid: pidS && /^\d+$/.test(pidS) ? parseInt(pidS, 10) : null,
      process: proc && proc !== "" ? proc : null,
    });
  }
  return rows.sort((a, b) => a.port - b.port);
}

function parseUnix(out: string): PortRow[] {
  const seen = new Set<string>();
  const rows: PortRow[] = [];
  for (const line of out.split(/\r?\n/).slice(1)) {
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const local = parts[8];
    const idx = local.lastIndexOf(":");
    const port = parseInt(local.slice(idx + 1), 10);
    if (!Number.isFinite(port)) continue;
    const key = `${port}:${local.slice(0, idx)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      port,
      address: local.slice(0, idx),
      pid: parseInt(parts[1], 10) || null,
      process: parts[0],
    });
  }
  return rows.sort((a, b) => a.port - b.port);
}

interface PortsPanelProps {
  /** Whether this tab is currently visible (drives auto-refresh). */
  active: boolean;
}

export default function PortsPanel({ active }: PortsPanelProps) {
  const [rows, setRows] = useState<PortRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setScanning(true);
    try {
      const res = await invoke<RunResult>("run_command", {
        command: IS_WINDOWS ? WIN_CMD : "lsof -nP -iTCP -sTCP:LISTEN",
        timeout_secs: 20,
      });
      if (res.exitCode !== 0 && !res.stdout.trim()) {
        setError(res.stderr.trim().slice(0, 200) || "Failed to list listening ports.");
        return;
      }
      setError(null);
      setRows(IS_WINDOWS ? parseWindows(res.stdout) : parseUnix(res.stdout));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, []);

  // Refresh when the tab opens + periodically while visible.
  useEffect(() => {
    if (!active) return;
    void Promise.resolve().then(() => refresh());
    timerRef.current = setInterval(() => void refresh(), 15000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active, refresh]);

  const httpPorts = rows.filter((r) => r.port !== 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] text-[#8a8a93]">
          {scanning ? (
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 1.5a6.5 6.5 0 106.5 6.5" />
              </svg>
              Scanning…
            </span>
          ) : (
            `${httpPorts.length} listening port${httpPorts.length === 1 ? "" : "s"}`
          )}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={scanning}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec] disabled:pointer-events-none disabled:opacity-40"
        >
          <IoRefresh size={12} />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mx-3 whitespace-pre-wrap rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 font-mono text-[11px] text-[#e5534b]">
          {error}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
          {/* Table header */}
          <div className="flex items-center gap-3 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#6b6b6b]">
            <span className="w-14 shrink-0">Port</span>
            <span className="w-28 shrink-0">Address</span>
            <span className="min-w-0 flex-1">Process</span>
            <span className="w-12 shrink-0" />
          </div>
          {httpPorts.length === 0 && !scanning && (
            <p className="px-2 py-2 text-[11.5px] text-[#6b6b6b]">
              Nothing listening right now.
            </p>
          )}
          {httpPorts.map((r) => (
            <button
              key={`${r.port}-${r.address}`}
              type="button"
              onClick={() => void openUrl(`http://localhost:${r.port}`)}
              title={`Open http://localhost:${r.port}`}
              className="group flex w-full items-center gap-3 rounded-md px-2 py-1 text-left transition hover:bg-white/[0.05]"
            >
              <span className="w-14 shrink-0 font-mono text-[12px] font-medium text-(--accent) group-hover:underline">
                {r.port}
              </span>
              <span className="w-28 shrink-0 truncate font-mono text-[11px] text-zinc-400">
                {r.address}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-300">
                {r.process ?? "unknown"}
                {r.pid != null && (
                  <span className="ml-1.5 text-[10px] text-[#6b6b6b]">
                    PID {r.pid}
                  </span>
                )}
              </span>
              <span className="flex w-12 shrink-0 items-center justify-end text-[#6b6b6b] opacity-0 transition group-hover:opacity-100">
                <IoOpenOutline size={13} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

