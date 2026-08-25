/**
 * Source Control side panel (git status / stage / commit / pull / push).
 * All git access shells out to the system `git` CLI via the existing
 * `run_command` Tauri command — no extra backend needed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IoArrowUp,
  IoChevronDown,
  IoChevronUp,
  IoGitBranch,
  IoGitCommit,
  IoGitNetwork,
  IoClose,
  IoRefresh,
  IoAdd,
  IoRemove,
  IoSync,
  IoArrowUndo,
} from "react-icons/io5";

/** Shape returned by the Tauri `run_command` command. */
interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

interface GitPanelProps {
  /** Absolute path of the workspace folder git commands run in. */
  root: string;
  onClose: () => void;
  /** Open a clicked changed-file in an editor tab. */
  onOpenFile?: (path: string) => void;
}

/** One row of `git status --porcelain` output. */
interface Change {
  /** Index (staged) status letter: M / A / D / R / … or space. */
  x: string;
  /** Worktree status letter, "?" for untracked. */
  y: string;
  /** Current path relative to the repo root. */
  path: string;
  /** Original path for renames (`old -> new`). */
  origPath?: string;
}

interface BranchInfo {
  name: string | null;
  ahead: number;
  behind: number;
}

/** Run a git sub-command in the workspace and capture its output. */
async function git(root: string, args: string): Promise<RunResult> {
  return await invoke<RunResult>("run_command", {
    command: `git ${args}`,
    cwd: root,
    timeout_secs: 60,
  });
}

/** Quote a path so it survives the PowerShell round-trip intact.
 *  IMPORTANT: use single quotes — double quotes get escaped to \" by Rust's
 *  argv handling and PowerShell then re-parses them wrongly, breaking any
 *  command that contains spaces. */
function quotePath(p: string): string {
  return `'${p.replace(/['"]/g, "")}'`;
}

/** Decode git's C-quoted paths ("pa\th") back to plain text. */
function unquotePath(raw: string): string {
  let p = raw.trim();
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.slice(1, -1);
    p = p.replace(/\\(?:([\\"])|([0-7]{3}))/g, (_m, ch, oct) =>
      ch ? ch : String.fromCharCode(parseInt(oct, 8))
    );
  }
  return p;
}

const STATUS_LABELS: Record<string, string> = {
  M: "Modified", A: "Added", D: "Deleted", R: "Renamed",
  C: "Copied", U: "Conflict", "?": "Untracked",
};

const STATUS_COLORS: Record<string, string> = {
  M: "#e2b93d", A: "#58bd5a", D: "#e5534b", R: "#c39dde",
  C: "#c39dde", U: "#e5534b", "?": "#6e7681", " ": "#6e7681",
};

/** Parse `git status --porcelain=v1 -b` output into structured data. */
function parseStatus(output: string): { branch: BranchInfo; changes: Change[] } {
  const lines = output.split(/\r?\n/).filter((l) => l.length > 0);
  const branch: BranchInfo = { name: null, ahead: 0, behind: 0 };

  let i = 0;
  if (lines[0]?.startsWith("## ")) {
    i = 1;
    const head = lines[0].slice(3);
    // "## main...origin/main [ahead 1, behind 2]", "## HEAD (no branch)",
    // or "## No commits yet on master" on a fresh repo.
    const fresh = /^no commits yet on (.+)$/i.exec(head);
    const main = fresh
      ? fresh[1]
      : head.split(/\.\.\.|\s+\[/)[0].trim();
    branch.name = main.includes("(") ? null : main || null;
    const am = /\bahead (\d+)/.exec(head);
    const bm = /\bbehind (\d+)/.exec(head);
    branch.ahead = am ? parseInt(am[1], 10) : 0;
    branch.behind = bm ? parseInt(bm[1], 10) : 0;
  }

  const changes: Change[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let rest = unquotePath(line.slice(3));
    let origPath: string | undefined;
    const arrowIdx = rest.indexOf(" -> ");
    if (arrowIdx !== -1) {
      origPath = rest.slice(0, arrowIdx);
      rest = rest.slice(arrowIdx + 4);
    }
    changes.push({ x, y, path: rest, origPath });
  }
  return { branch, changes };
}

/** Compact ghost icon button used across the panel chrome. */
function IconButton({
  title, onClick, disabled, children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-6 w-6 items-center justify-center rounded-md text-[#8a8a93] transition hover:bg-white/[0.07] hover:text-[#ececec] disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** One file row in a change list, with VS Code-style hover actions. */
function ChangeRow({
  change, staged, busy, onOpen, onStage, onUnstage, onDiscard,
}: {
  change: Change;
  staged: boolean;
  busy: boolean;
  onOpen: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}) {
  const letter = (staged ? change.x : change.y !== " " ? change.y : change.x).trim() ||
    (change.x === "?" ? "?" : "~");
  const segments = change.path.split(/[\\/]/);
  const name = segments.pop();
  return (
    <div
      className={`group flex h-[26px] items-center gap-2 rounded-md pl-1 pr-1 transition-colors ${
        busy ? "" : "hover:bg-white/[0.05]"
      }`}
    >
      <span
        className="w-7 shrink-0 text-center font-mono text-[11px] font-semibold"
        style={{ color: STATUS_COLORS[(staged ? change.x : change.y).trim() || "?"] ?? "#6e7681" }}
        title={STATUS_LABELS[letter] ?? letter}
      >
        {letter}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
        title={`${change.origPath ? `${change.origPath} → ` : ""}${change.path}`}
      >
        <span className="truncate text-[12px] text-[#d4d4d4]">{name}</span>
        {segments.length > 0 && (
          <span className="shrink-0 truncate text-[10px] text-[#6b6b6b]">
            {segments.join("/")}
          </span>
        )}
      </button>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {onDiscard && !staged && (
          <IconButton
            title="Discard changes"
            onClick={onDiscard}
            disabled={busy}
          >
            <IoArrowUndo size={13} />
          </IconButton>
        )}
        {onUnstage && (
          <IconButton title="Unstage" onClick={onUnstage} disabled={busy}>
            <IoRemove size={14} />
          </IconButton>
        )}
        {onStage && (
          <IconButton title="Stage" onClick={onStage} disabled={busy}>
            <IoAdd size={14} />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/**
 * The panel component. Keeps a live view of the repo: branch + sync state,
 * staged vs unstaged changes, commit box and an output console.
 */
export default function GitPanel({ root, onClose, onOpenFile }: GitPanelProps) {
  const [branch, setBranch] = useState<BranchInfo>({ name: null, ahead: 0, behind: 0 });
  const [changes, setChanges] = useState<Change[]>([]);
  const [notRepo, setNotRepo] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [remotes, setRemotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState("");
  const [outOpen, setOutOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const logEndRef = useRef<HTMLPreElement>(null);

  const appendLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-40), text]);
  }, []);

  /** Refresh branch + status; distinguishes "not a repo" from other errors. */
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await git(root, "status --porcelain=v1 -b");
      if (res.exitCode !== 0) {
        const err = (res.stderr || res.stdout || "").toLowerCase();
        if (err.includes("not a git repository") || err.includes("not found") ||
            err.includes("unknown option")) {
          setNotRepo(true);
        } else if (res.stderr.trim()) {
          appendLog(`git status failed:\n${res.stderr.trim()}`);
        }
        setChanges([]);
        return;
      }
      setNotRepo(false);
      setFatal(null);
      const parsed = parseStatus(res.stdout);
      setBranch(parsed.branch);
      setChanges(parsed.changes);
      const rm = await git(root, "remote");
      setRemotes(rm.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    } catch (e) {
      // invoke rejects when the command could not be spawned at all.
      setFatal(`Could not run git — is it installed and on PATH?\n${
        e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [root, appendLog]);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  /**
   * Run one git action, log its output and refresh the lists.
   * Returns whether the command exited successfully plus its raw output.
   */
  const runGit = async (
    args: string,
    label: string
  ): Promise<{ ok: boolean; text: string }> => {
    setBusy(true);
    try {
      const res = await git(root, args);
      const out = [res.stdout, res.stderr].filter((s) => s.trim()).join("\n").trim();
      appendLog(
        `$ git ${label}\n${out || "(no output)"}${
          res.exitCode !== 0 ? `\n(exit code ${res.exitCode ?? "timeout"})` : ""
        }`
      );
      if (res.exitCode !== 0) {
        // Surface common setup problems directly in the console.
        if (/tell me who you are|user\.email/i.test(out)) {
          appendLog(
            "hint: set your git identity once:\n" +
              "$ git config --global user.name 'Your Name'\n" +
              "$ git config --global user.email 'you@example.com'"
          );
        }
        setOutOpen(true);
      }
      return { ok: res.exitCode === 0 && !res.timedOut, text: out };
    } catch (e) {
      appendLog(`$ git ${label}\n${e instanceof Error ? e.message : String(e)}`);
      setOutOpen(true);
      return { ok: false, text: String(e) };
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const staged = changes.filter((c) => c.x !== " " && c.x !== "?");
  const worktree = changes.filter((c) => !staged.includes(c));

  const openPath = (p: string) =>
    onOpenFile?.(`${root.replace(/[\\/]+$/, "")}/${p}`);

  const stage = (p: string) => void runGit(`add -- ${quotePath(p)}`, `add ${p}`);
  const stageAll = () => void runGit("add -A", "add -A");
  const unstage = (p: string) =>
    void runGit(`reset -q HEAD -- ${quotePath(p)}`, `reset ${p}`);
  const discard = (c: Change) => {
    if (!window.confirm(`Discard changes in ${c.path}? This cannot be undone.`)) return;
    void runGit(
      c.y === "?" ? `clean -q -f -- ${quotePath(c.path)}` : `checkout -q -- ${quotePath(c.path)}`,
      `discard ${c.path}`
    );
  };
  /** Commit staged changes. Returns true when a commit was created. */
  const commit = async (): Promise<boolean> => {
    // Single quotes only — double quotes break through the PowerShell layer.
    const clean = msg.trim().replace(/["'`]/g, "");
    if (!clean || staged.length === 0) return false;
    const r = await runGit(`commit -m '${clean}'`, "commit");
    if (r.ok) {
      setMsg("");
      appendLog(`✓ committed ${staged.length} file(s)`);
      return true;
    }
    return false;
  };
  /** Safe subset of characters for branch names in shell commands. */
  const safeBranch = () => (branch.name ?? "").replace(/[^A-Za-z0-9._\-/]/g, "");
  /** Push; retries with --set-upstream when the branch has no upstream yet. */
  const push = async () => {
    const first = await runGit("push", "push");
    if (first.ok) {
      appendLog("✓ pushed");
      return;
    }
    if (/set-upstream|upstream/i.test(first.text)) {
      const b = safeBranch();
      if (b) {
        const retry = await runGit(`push --set-upstream origin ${b}`, `push -u origin ${b}`);
        if (retry.ok) appendLog("✓ pushed (upstream set)");
        return;
      }
    }
    if (/does not appear to be a git repository|no configured push destination/i.test(first.text)) {
      appendLog(
        "hint: no remote configured yet — add one:\n$ git remote add origin <repo-url>"
      );
    } else if (/authentication|could not read username|permission|403/i.test(first.text)) {
      appendLog(
        "hint: authentication failed. Complete the sign-in window if one opened, or run 'git push' once in a terminal to cache credentials."
      );
    }
    // A timeout usually means git is waiting on an interactive login prompt.
  };
  /** Pull; falls back to an explicit remote/branch when upstream is unset. */
  const pull = async () => {
    const first = await runGit("pull", "pull");
    if (!first.ok && /no tracking information/i.test(first.text)) {
      const b = safeBranch();
      if (b) await runGit(`pull origin ${b}`, `pull origin ${b}`);
    }
  };
  const fetchAll = () => void runGit("fetch --all", "fetch --all");
  /** VS Code-style synchronize: pull remote changes, then push local ones. */
  const syncChanges = async () => {
    await pull();
    await push();
    appendLog("✓ synced");
  };
  const commitAndPush = async () => {
    if (await commit()) await push();
  };
  const commitAndSync = async () => {
    if (await commit()) await syncChanges();
  };

  const canCommit = staged.length > 0 && msg.trim().length > 0 && !busy;
  const hasRemote = remotes.length > 0;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-white/[0.07] bg-[#131313]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a3a3a3]">
          <IoGitNetwork size={13} />
          Source Control
        </div>
        <div className="flex items-center gap-0.5">
          {busy && (
            <svg viewBox="0 0 16 16" className="mr-1 h-3 w-3 animate-spin text-[#6b6b6b]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M8 1.5a6.5 6.5 0 106.5 6.5" />
            </svg>
          )}
          <IconButton title="Refresh status" onClick={() => void refresh()} disabled={busy}>
            <IoRefresh size={13} />
          </IconButton>
          <IconButton title="Close source control" onClick={onClose}>
            <IoClose size={14} />
          </IconButton>
        </div>
      </div>

      {fatal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-[12px] font-medium text-[#e5534b]">Git unavailable</p>
          <p className="whitespace-pre-wrap text-[11px] leading-5 text-[#6b6b6b]">{fatal}</p>
        </div>
      ) : notRepo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <IoGitBranch size={22} className="text-[#3f3f46]" />
          <p className="text-[12px] font-medium text-[#d4d4d4]">Not a git repository</p>
          <p className="text-[11px] leading-5 text-[#6b6b6b]">
            Initialise one to start tracking changes in this workspace.
          </p>
          <button
            type="button"
            onClick={() => void runGit("init", "init")}
            disabled={busy}
            className="rounded-md bg-[#ececec] px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-white disabled:opacity-40"
          >
            Initialize Repository
          </button>
        </div>
      ) : (
        <>
          {/* ── Branch / sync bar ─────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.05] px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[#c9c9c9]">
              <IoGitBranch size={12} className="shrink-0 text-[#8a8a93]" />
              <span className="truncate">{branch.name ?? "HEAD (detached)"}</span>
              {branch.ahead > 0 && (
                <span title={`${branch.ahead} commit(s) ahead`} className="flex items-center gap-0.5 rounded bg-white/[0.06] px-1 text-[10px] text-[#c9c9c9]">
                  ↑{branch.ahead}
                </span>
              )}
              {branch.behind > 0 && (
                <span title={`${branch.behind} commit(s) behind`} className="flex items-center gap-0.5 rounded bg-white/[0.06] px-1 text-[10px] text-[#c9c9c9]">
                  ↓{branch.behind}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                title={hasRemote ? "Fetch from remotes" : "No remote configured"}
                onClick={fetchAll}
                disabled={busy || !hasRemote}
              >
                <IoSync size={12} />
              </IconButton>
              {/* VS Code-style "Synchronize Changes": pull, then push. */}
              <button
                type="button"
                onClick={() => void syncChanges()}
                disabled={busy || !hasRemote}
                title={
                  hasRemote
                    ? `Pull and push commits${branch.behind > 0 ? `, ${branch.behind} behind` : ""}${branch.ahead > 0 ? `, ${branch.ahead} ahead` : ""}`
                    : "No remote configured"
                }
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition ${
                  busy || !hasRemote
                    ? "cursor-not-allowed text-[#5a5a62]"
                    : branch.ahead + branch.behind > 0
                      ? "bg-[#2563eb]/15 text-[#7ea6ff] hover:bg-[#2563eb]/25"
                      : "bg-white/[0.05] text-[#8a8a93] hover:bg-white/[0.09] hover:text-[#c9c9c9]"
                }`}
              >
                <IoSync size={11} className={busy ? "animate-spin" : ""} />
                {branch.behind > 0 && <span>↓{branch.behind}</span>}
                {branch.ahead > 0 && <span>↑{branch.ahead}</span>}
                <span>Sync</span>
              </button>
            </div>
          </div>
          {remotes.length === 0 && (
            <div className="shrink-0 border-b border-white/[0.05] bg-amber-500/[0.06] px-2.5 py-1.5 text-[10.5px] leading-4 text-amber-400/90">
              No remote configured. Run{" "}
              <span className="font-mono">git remote add origin &lt;url&gt;</span> in
              the terminal to enable fetch / pull / push.
            </div>
          )}

          {/* ── Commit box ────────────────────────────────────────────── */}
          <div className="shrink-0 px-2.5 pb-2 pt-2.5">
            <input
              value={msg}
              onChange={(ev) => setMsg(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && canCommit) void commit();
              }}
              placeholder={`Message (Ctrl+Enter to commit on ${branch.name ?? "HEAD"})`}
              className="mb-2 w-full rounded-md border border-white/[0.08] bg-[#0e0e0e] px-2.5 py-1.5 text-[12px] text-[#ececec] outline-none placeholder:text-[#5a5a62] focus:border-[#4c8dff]/60"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void commit()}
                disabled={!canCommit}
                title={
                  staged.length === 0
                    ? "Stage some changes first"
                    : !msg.trim()
                      ? "Enter a commit message"
                      : `Commit ${staged.length} file(s)`
                }
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#2563eb] py-1.5 text-[12px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#3b76f5] disabled:cursor-not-allowed disabled:bg-white/[0.05] disabled:text-[#5a5a62] disabled:shadow-none"
              >
                <IoGitCommit size={14} />
                Commit{staged.length > 0 ? ` (${staged.length})` : ""}
              </button>
              {/* Split-button dropdown: more commit actions (VS Code style). */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setCommitMenuOpen((v) => !v)}
                  disabled={!canCommit}
                  title="More commit actions"
                  aria-label="More commit actions"
                  aria-expanded={commitMenuOpen}
                  className="flex h-full w-6 items-center justify-center rounded-md border border-l-white/20 border-[#2563eb]/60 bg-transparent text-[#7ea6ff] transition hover:bg-[#2563eb]/15 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:text-[#5a5a62]"
                >
                  <IoChevronDown size={12} />
                </button>
                {commitMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setCommitMenuOpen(false)}
                    />
                    <div className="absolute bottom-full right-0 z-50 mb-1 w-44 overflow-hidden rounded-lg border border-white/[0.08] bg-[#1b1b1b] py-1 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setCommitMenuOpen(false);
                          void commitAndPush();
                        }}
                        disabled={!canCommit}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06] disabled:text-[#5a5a62]"
                      >
                        <IoArrowUp size={13} />
                        Commit &amp; Push
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCommitMenuOpen(false);
                          void commitAndSync();
                        }}
                        disabled={!canCommit || !hasRemote}
                        title={hasRemote ? undefined : "No remote configured"}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06] disabled:text-[#5a5a62]"
                      >
                        <IoSync size={13} />
                        Commit &amp; Sync
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Change lists ──────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
            {staged.length > 0 && (
              <section>
                <div className="flex items-center justify-between px-1.5 pb-0.5 pt-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]">
                    Staged changes ({staged.length})
                  </span>
                </div>
                {staged.map((c) => (
                  <ChangeRow
                    key={`s:${c.x}${c.y}:${c.path}`}
                    change={c}
                    staged
                    busy={busy}
                    onOpen={() => openPath(c.path)}
                    onUnstage={() => unstage(c.path)}
                  />
                ))}
              </section>
            )}

            <section>
              <div className="flex items-center justify-between px-1.5 pb-0.5 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6b6b6b]">
                  Changes ({worktree.length})
                </span>
                {worktree.length > 0 && (
                  <IconButton title="Stage all changes" onClick={stageAll} disabled={busy}>
                    <IoAdd size={13} />
                  </IconButton>
                )}
              </div>
              {worktree.length === 0 ? (
                <p className="px-1.5 py-1 text-[11px] text-[#6b6b6b]">
                  {staged.length > 0
                    ? "Everything else is staged."
                    : "Working tree clean — no changes."}
                </p>
              ) : (
                worktree.map((c) => (
                  <ChangeRow
                    key={`w:${c.x}${c.y}:${c.path}`}
                    change={c}
                    staged={false}
                    busy={busy}
                    onOpen={() => openPath(c.path)}
                    onStage={() => stage(c.path)}
                    onDiscard={() => discard(c)}
                  />
                ))
              )}
            </section>
          </div>

          {/* ── Footer: output console toggle ─────────────────────────── */}
          <button
            type="button"
            onClick={() => setOutOpen((v) => !v)}
            className="flex h-7 shrink-0 items-center gap-1.5 border-t border-white/[0.07] px-3 text-[10.5px] text-[#8a8a93] transition hover:bg-white/[0.04] hover:text-[#c9c9c9]"
          >
            {outOpen ? <IoChevronDown size={11} /> : <IoChevronUp size={11} />}
            Output
            {log.length > 0 && (
              <span className="rounded bg-white/[0.06] px-1 text-[9.5px]">{log.length}</span>
            )}
          </button>
          {outOpen && log.length > 0 && (
            <pre
              ref={logEndRef}
              className="max-h-40 shrink-0 overflow-y-auto border-t border-white/[0.05] bg-[#0e0e0e] px-2.5 py-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-[#8a8a93] scrollbar-thin"
            >
              {log.join("\n")}
            </pre>
          )}

        </>
      )}
    </aside>
  );
}



