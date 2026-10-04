/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { IoAlertCircle, IoRefresh, IoReloadOutline } from "react-icons/io5";
import { useAllDiagnostics, useWorkspaceDiagnostics } from "../diagnostics";
import { getLspStatuses, subscribeLspStatus } from "../lsp";

interface ProblemsPanelProps {
  /** Workspace folder (tsc scan root and language-server root). */
  root: string | null;
  onOpenFile: (path: string, line: number) => void;
  /** Report the error/warning counts up to the tab badge. */
  onCount?: (errors: number, warnings: number) => void;
}

/** Chip colours per language-server state. */
const SERVER_STATE_CLASS: Record<string, string> = {
  ready: "text-[#3fb950]",
  starting: "text-[#e2b93d]",
  failed: "text-[#e5534b]",
  missing: "text-[var(--text-muted)]",
  stopped: "text-[var(--text-muted)]",
};

export default function ProblemsPanel({
  root,
  onOpenFile,
  onCount,
}: ProblemsPanelProps) {
  // Findings come from the shared store, so the workspace tsc scan, the
  // instant structural scan and every language server (pyright, clangd,
  // rust-analyzer, …) all land side by side, each keeping its source tag.
  const { scanning, note, rescan } = useWorkspaceDiagnostics(root);
  const groups = useAllDiagnostics();
  const servers = useSyncExternalStore(subscribeLspStatus, getLspStatuses);

  const counts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const g of groups) {
      for (const d of g.items) {
        if (d.severity === "error") errors++;
        else if (d.severity === "warning") warnings++;
      }
    }
    return { errors, warnings };
  }, [groups]);

  useEffect(() => {
    onCount?.(counts.errors, counts.warnings);
  }, [counts, onCount]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-8 shrink-0 items-center justify-between px-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
          {scanning ? (
            <span className="flex items-center gap-1.5">
              <IoReloadOutline className="h-3 w-3 animate-spin" />
              Scanning…
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-[#e5534b]">
                <IoAlertCircle size={12} /> {counts.errors} errors
              </span>
              <span className="text-[#e2b93d]">{counts.warnings} warnings</span>
              {!root && (
                <span className="text-[var(--text-muted)]">No workspace open</span>
              )}
            </>
          )}
          {/* Language-server chips: which servers are live for this workspace.
              Hover for the install hint (missing) or the crash reason (failed). */}
          {servers.map((s) => (
            <span
              key={s.id}
              title={
                s.detail ??
                `${s.label} language server (${s.state})`
              }
              className={`flex items-center gap-1 rounded-full border border-(--border) px-1.5 py-px text-[10px] ${SERVER_STATE_CLASS[s.state] ?? ""}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {s.label}
              {s.state === "missing" ? " (install)" : ""}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => rescan()}
          disabled={scanning || !root}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-40"
        >
          <IoRefresh size={12} />
          Re-scan
        </button>
      </div>

      {/* Findings */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin font-mono text-[11.5px]">
        {note && (
          <p className="mx-1 my-1 whitespace-pre-wrap rounded-md border border-(--border) bg-(--fill-1) px-2 py-1.5 text-[11px] text-[var(--text-muted)]">
            {note}
          </p>
        )}
        {groups.length === 0 && !scanning && !note && (
          <p className="px-2 py-2 text-[11.5px] text-[var(--text-muted)]">
            No problems detected — nice and clean.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.file} className="mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[var(--text-secondary)]">
              <IoAlertCircle
                size={11}
                className={
                  g.items.some((d) => d.severity === "error")
                    ? "text-[#e5534b]"
                    : "text-[#e2b93d]"
                }
              />
              <span className="truncate">{g.file.split(/[\\/]/).pop()}</span>
              <span className="shrink-0 truncate text-[10px] text-[var(--text-muted)]">
                {g.file}
              </span>
            </div>
            {g.items.map((d, i) => (
              <button
                key={`${d.line}-${d.col}-${d.code}-${i}`}
                type="button"
                onClick={() => onOpenFile(g.file, d.line)}
                className="group flex w-full items-start gap-2 rounded-md py-1 pl-6 pr-3 text-left transition hover:bg-(--fill-2)"
                title={`Go to ${g.file}:${d.line} — via ${
                  d.source === "lsp"
                    ? "language server"
                    : d.source === "tsc"
                      ? "tsc"
                      : "built-in scan"
                }`}
              >
                <span
                  className={`mt-px shrink-0 ${
                    d.severity === "error"
                      ? "text-[#e5534b]"
                      : d.severity === "warning"
                        ? "text-[#e2b93d]"
                        : "text-[var(--text-muted)]"
                  }`}
                >
                  {d.severity === "error" ? "✕" : d.severity === "warning" ? "⚠" : "ℹ"}
                </span>
                <span className="min-w-0 flex-1 text-[var(--text-primary)]">
                  {d.message}{" "}
                  {d.code && (
                    <span className="text-[var(--text-muted)]">({d.code})</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--text-muted)] group-hover:text-(--accent)">
                  {d.source === "lsp" ? "LSP" : d.source} · [Ln {d.line}, Col {d.col}]
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

