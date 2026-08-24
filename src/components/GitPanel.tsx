import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IoGitBranchSharp,
  IoGitCommit,
  IoGitNetworkSharp,
} from "react-icons/io5";

/** Shape returned by the Tauri `run_command` command. */
interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

/** One changed file parsed from `git status --porcelain`. */
interface StatusEntry {
  /** Index (staged) status code, e.g. "M", "A", "?". */
  x: string;
  /** Worktree status code. */
  y: string;
  path: string;
}

interface GitPanelProps {
  /** Absolute path of the workspace folder git commands run in. */
  root: string;
  onClose: () => void;
  /** Open a clicked changed-file in an editor tab. */
  onOpenFile?: (path: string) => void;
}

/** Run a git sub-command in the workspace and capture its output. */
async function git(root: string, args: string): Promise<RunResult> {
  return await invoke<RunResult>("run_command", {
    command: `git ${args}`,
    cwd: root,
    timeout_secs: 60,
  });
}

const STATUS_LABELS: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  U: "Unmerged",
  "?": "Untracked",
};

/** Human-readable badge text for one porcelain row. */
function statusLabel(e: StatusEntry): string {
  if (e.x === "?" && e.y === "?") return "Untracked";
  const parts: string[] = [];
  if (e.x !== " " && e.x !== "?") parts.push(`Staged ${STATUS_LABELS[e.x] ?? e.x}`);
  if (e.y !== " ") parts.push(`${STATUS_LABELS[e.y] ?? e.y}`);
  return parts.join(" · ") || "Changed";
}

/**
 * Source-control side panel: shows the current branch, changed files and
 * quick actions (stage all, commit, pull, push). Everything shells out to
 * the system `git` CLI via the existing `run_command` Tauri command.
 */
export default function GitPanel({ root, onClose, onOpenFile }: GitPanelProps) {
  const [branch, setBranch] = useState<string | null>(null);
  const [entries, setEntries] = useState<StatusEntry[]>([]);
  const [notRepo, setNotRepo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-30), text]); // keep last ~31 blocks
  }, []);

  /** Refresh branch + status. Safe to call repeatedly. */
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const b = await git(root, "rev-parse --abbrev-ref HEAD");
      if (b.exitCode !== 0) {
        setNotRepo(true);
        setBranch(null);
        setEntries([]);
        return;
      }
      setNotRepo(false);
      setBranch(b.stdout.trim() || null);
      const s = await git(root, "status --porcelain");
      const rows = s.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 3)
        .map((line) => ({
          x: line[0],
          y: line[1],
          // Porcelain v1: "XY<space>PATH"; rename rows contain "old -> new".
          path: line.slice(3),
        }));
      setEntries(rows);
    } catch (e) {
      appendLog(`git status failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [root, appendLog]);

  useEffect(() => {
    // Defer through a microtask so the initial status load doesn't set state
    // synchronously during the effect (avoids cascading renders).
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  /**
   * Run one mutating git action, surface its output in the log and refresh.
   * Commit messages are sanitized (no quote chars) so they survive PowerShell.
   */
  const runAction = async (args: string, label: string) => {
    setBusy(true);
    try {
      const res = await git(root, args);
      const out = [res.stdout, res.stderr].filter((s) => s.trim()).join("\n").trim();
      appendLog(
        `$ git ${label}\n${out || "(no output)"}\n$ exit code: ${res.exitCode ?? "timeout"}`
      );
    } catch (e) {
      appendLog(`$ git ${label}\n${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const stageAllAndCommit = async () => {
    const msg = commitMsg.trim().replace(/["'`]/g, "");
    if (!msg) return;
    await runAction("add -A", "add -A");
    await runAction(`commit -m "${msg}"`, "commit");
    setCommitMsg("");
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/[0.07] bg-[#131313]">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#ececec]">
          <IoGitNetworkSharp size={13} />
          Source Control
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            title="Refresh"
            aria-label="Refresh git status"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec] disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5v2.6h-2.6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close source control"
            aria-label="Close source control"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {notRepo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-[12px] font-medium text-[#d4d4d4]">Not a git repository</p>
          <p className="text-[11px] leading-5 text-[#6b6b6b]">
            Initialise one to start tracking changes in this workspace.
          </p>
          <button
            type="button"
            onClick={() => void runAction("init", "init")}
            disabled={busy}
            className="rounded-md bg-[#ececec] px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-white disabled:opacity-40"
          >
            Initialize Repository
          </button>
        </div>
      ) : (
        <>
          {/* Branch */}
          <div className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.05] px-3 py-2 text-[11.5px] text-[#a3a3a3]">
            <IoGitBranchSharp size={12} className="shrink-0" />
            <span className="truncate">{branch ?? "HEAD (detached)"}</span>
          </div>

          {/* Changed files */}
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            <p className="px-1.5 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-[#6b6b6b]">
              Changes{entries.length > 0 ? ` (${entries.length})` : ""}
            </p>
            {entries.length === 0 ? (
              <p className="px-1.5 py-2 text-[11.5px] text-[#6b6b6b]">
                Working tree clean — no changes.
              </p>
            ) : (
              entries.map((e) => (
                <button
                  key={`${e.x}${e.y}:${e.path}`}
                  type="button"
                  onClick={() => onOpenFile?.(e.path)}
                  title={`${statusLabel(e)} — ${e.path}${onOpenFile ? " (click to open)" : ""}`}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="w-7 shrink-0 rounded bg-white/[0.06] px-1 text-center font-mono text-[10px] text-[#d4d4d4]">
                    {(e.x !== " " ? e.x : e.y).trim() || "~"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#d4d4d4]">
                    {e.path.split(/[\\/]/).pop()}
                  </span>
                  <span className="shrink-0 text-[10px] text-[#6b6b6b]">{statusLabel(e)}</span>
                </button>
              ))
            )}
          </div>

          {/* Commit box */}
          <div className="shrink-0 border-t border-white/[0.07] p-2.5">
            <input
              value={commitMsg}
              onChange={(ev) => setCommitMsg(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && commitMsg.trim() && !busy) {
                  void stageAllAndCommit();
                }
              }}
              placeholder={`Message (commit on ${branch ?? "HEAD"})`}
              className="mb-2 w-full rounded-md border border-white/[0.08] bg-[#0e0e0e] px-2.5 py-1.5 text-[12px] text-[#ececec] outline-none placeholder:text-[#6b6b6b] focus:border-white/[0.2]"
            />
            <button
              type="button"
              onClick={() => void stageAllAndCommit()}
              disabled={busy || !commitMsg.trim()}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-[#ececec] py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IoGitCommit size={14} />
              {busy ? "Working…" : "Stage All & Commit"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void runAction("pull", "pull")}
                disabled={busy}
                className="flex-1 rounded-md border border-white/[0.09] bg-white/[0.02] py-1.5 text-[12px] font-medium text-[#d4d4d4] transition hover:bg-white/[0.05] disabled:opacity-40"
              >
                Pull
              </button>
              <button
                type="button"
                onClick={() => void runAction("push", "push")}
                disabled={busy}
                className="flex-1 rounded-md border border-white/[0.09] bg-white/[0.02] py-1.5 text-[12px] font-medium text-[#d4d4d4] transition hover:bg-white/[0.05] disabled:opacity-40"
              >
                Push
              </button>
            </div>
          </div>

          {/* Output log */}
          {log.length > 0 && (
            <pre className="max-h-32 shrink-0 overflow-y-auto border-t border-white/[0.07] bg-[#0e0e0e] px-2.5 py-2 font-mono text-[10.5px] leading-4 whitespace-pre-wrap text-[#8a8a8a]">
              {log.join("\n")}
            </pre>
          )}

        </>
      )}
    </aside>
  );
}


