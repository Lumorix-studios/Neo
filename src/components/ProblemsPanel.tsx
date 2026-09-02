
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IoAlertCircle, IoRefresh } from "react-icons/io5";
import { logToBus } from "./logBus";

interface ProblemsPanelProps {
  /** Workspace folder scanned by the TypeScript compiler. */
  root: string | null;
  onOpenFile: (path: string, line: number) => void;
  /** Report the error/warning counts up to the tab badge. */
  onCount?: (errors: number, warnings: number) => void;
}

interface Problem {
  file: string; // absolute path
  line: number;
  col: number;
  severity: "error" | "warning";
  code: string;
  message: string;
}

interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** Matches "src/App.tsx(12,5): error TS2304: Cannot find name 'x'." */
const TSC_LINE =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+?)\s*$/;

export default function ProblemsPanel({
  root,
  onOpenFile,
  onCount,
}: ProblemsPanelProps) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!root || scanning) return;
    setScanning(true);
    setNote(null);
    try {
      const res = await invoke<RunResult>("run_command", {
        command: "npx tsc --noEmit --pretty false",
        cwd: root,
        timeout_secs: 120,
      });
      const combined = `${res.stdout}\n${res.stderr}`;
      const found: Problem[] = [];
      for (const raw of combined.split(/\r?\n/)) {
        const m = TSC_LINE.exec(raw.trim());
        if (!m) continue;
        const relPath = m[1].replace(/\\/g, "/");
        found.push({
          file: `${root.replace(/[\\/]+$/, "")}/${relPath}`,
          line: parseInt(m[2], 10),
          col: parseInt(m[3], 10),
          severity: m[4] === "error" ? "error" : "warning",
          code: m[5],
          message: m[6],
        });
      }
      setProblems(found);
      const errs = found.filter((p) => p.severity === "error").length;
      const warns = found.length - errs;
      onCount?.(errs, warns);
      logToBus(
        "Problems",
        `tsc --noEmit → ${errs} error(s), ${warns} warning(s)` +
          (res.timedOut ? " (scan timed out)" : "")
      );
      if (found.length === 0 && res.exitCode !== 0 && !/error TS/i.test(combined)) {
        setNote(
          res.timedOut
            ? "Scan timed out after 120 s."
            : combined.trim().slice(0, 200) ||
                "TypeScript scan produced no report (is this a TS project?)."
        );
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [root, scanning, onCount]);

  useEffect(() => {
    void Promise.resolve().then(() => scan());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");

  // Group findings by file, preserving first-seen order.
  const byFile = new Map<string, Problem[]>();
  for (const p of problems) {
    const list = byFile.get(p.file) ?? [];
    list.push(p);
    byFile.set(p.file, list);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between px-3">
        <div className="flex items-center gap-2 text-[11px] text-[#8a8a93]">
          {scanning ? (
            <span className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 1.5a6.5 6.5 0 106.5 6.5" />
              </svg>
              Scanning…
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-[#e5534b]">
                <IoAlertCircle size={12} /> {errors.length} errors
              </span>
              <span className="text-[#e2b93d]">{warnings.length} warnings</span>
              {!root && <span className="text-[#6b6b6b]">No workspace open</span>}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void scan()}
          disabled={scanning || !root}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec] disabled:pointer-events-none disabled:opacity-40"
        >
          <IoRefresh size={12} />
          Re-scan
        </button>
      </div>

      {/* Findings */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin font-mono text-[11.5px]">
        {note && (
          <p className="mx-1 my-1 whitespace-pre-wrap rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[11px] text-[#6b6b6b]">
            {note}
          </p>
        )}
        {problems.length === 0 && !scanning && !note && (
          <p className="px-2 py-2 text-[11.5px] text-[#6b6b6b]">
            No problems detected — nice and clean.
          </p>
        )}
        {[...byFile.entries()].map(([file, list]) => (
          <div key={file} className="mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-zinc-400">
              <IoAlertCircle
                size={11}
                className={
                  list.some((p) => p.severity === "error")
                    ? "text-[#e5534b]"
                    : "text-[#e2b93d]"
                }
              />
              <span className="truncate">{file.split(/[\\/]/).pop()}</span>
              <span className="shrink-0 truncate text-[10px] text-[#6b6b6b]">
                {file}
              </span>
            </div>
            {list.map((p, i) => (
              <button
                key={`${p.line}-${i}`}
                type="button"
                onClick={() => onOpenFile(p.file, p.line)}
                className="group flex w-full items-start gap-2 rounded-md py-1 pl-6 pr-3 text-left transition hover:bg-white/[0.05]"
                title={`Go to ${p.file}:${p.line}`}
              >
                <span
                  className={`mt-px shrink-0 ${
                    p.severity === "error" ? "text-[#e5534b]" : "text-[#e2b93d]"
                  }`}
                >
                  {p.severity === "error" ? "✕" : "⚠"}
                </span>
                <span className="min-w-0 flex-1 text-zinc-300">
                  {p.message} <span className="text-[#6b6b6b]">({p.code})</span>
                </span>
                <span className="shrink-0 text-[10px] text-[#6b6b6b] group-hover:text-(--accent)">
                  [Ln {p.line}, Col {p.col}]
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}


