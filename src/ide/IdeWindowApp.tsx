import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { IoGitCommit } from "react-icons/io5";
import IdeMenuBar from "../components/IdeMenuBar";
import FileExplorer from "../components/FileExplorer";
import CodeEditor, {
  DEFAULT_EDITOR_PREFS,
  type EditorTab,
} from "../components/CodeEditor";
import BottomPanel, { type PanelTab } from "../components/BottomPanel";
import GitPanel from "../components/GitPanel";

/** Icon button for the VS Code-style activity bar rail (same look as chat). */
function RailButton({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`relative flex h-[48px] w-full items-center justify-center transition-colors ${
        active ? "text-[#e8e8e8]" : "text-[#868686] hover:text-[#e8e8e8]"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-0 h-full w-[2px] bg-(--accent)" />
      )}
      {children}
    </button>
  );
}

/* --- persisted workspace / recents --------------------------------------- */

const WS_KEY = "neo.ide.workspaceRoot";
const RECENTS_KEY = "neo.ide.recentFiles";

const loadRoot = (): string | null => localStorage.getItem(WS_KEY);
const loadRecents = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

export default function IdeWindowApp() {
  const appWindow = getCurrentWindow();

  // --- workspace -----------------------------------------------------------
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(loadRoot);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // --- editor tabs ---------------------------------------------------------
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);
  const [revealLine, setRevealLine] = useState<{ path: string; line: number } | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>(loadRecents);

  // --- bottom panel (terminal etc.) ----------------------------------------
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");

  const pushRecent = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, 12);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* storage full — non-fatal */
      }
      return next;
    });
  }, []);

  // __PART_B__

  // Mirror of the open tabs for callbacks that must stay referentially stable
  // (Tauri event listeners, memoized child props, intervals).
  const tabsRef = useRef<EditorTab[]>([]);
  tabsRef.current = editorTabs;

  /** Open a file in an editor tab (fetching content from disk). */
  const openFileInEditor = useCallback(
    async (path: string, line?: number) => {
      setActiveEditorPath(path);
      if (line != null) setRevealLine({ path, line });
      if (tabsRef.current.some((t) => t.path === path)) return;
      try {
        const content = await invoke<string>("fs_read_file", { path });
        pushRecent(path);
        setEditorTabs((prev) =>
          prev.some((t) => t.path === path) ? prev : [...prev, { path, content, dirty: false }]
        );
      } catch (e) {
        setError(`Failed to open ${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [pushRecent]
  );

  const collapseExplorer = useCallback(() => setExplorerCollapsed(true), []);
  const closeGit = useCallback(() => setGitOpen(false), []);

  const closeEditorTab = (path: string) => {
    const idx = editorTabs.findIndex((t) => t.path === path);
    if (idx === -1) return;
    const next = editorTabs.filter((t) => t.path !== path);
    setEditorTabs(next);
    if (activeEditorPath === path) {
      const fallback = next[Math.min(idx, next.length - 1)];
      setActiveEditorPath(fallback ? fallback.path : null);
    }
  };

  const updateEditorContent = (path: string, content: string) => {
    setEditorTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content, dirty: true } : t))
    );
  };

  const saveEditorFile = async (path: string) => {
    const tab = editorTabs.find((t) => t.path === path);
    if (!tab) return;
    try {
      await invoke("fs_write_file", { path, content: tab.content });
      setEditorTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, dirty: false } : t))
      );
      setExplorerRefreshKey((k) => k + 1);
    } catch (e) {
      setError(`Failed to save ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const closeAllEditorTabs = () => {
    setEditorTabs([]);
    setActiveEditorPath(null);
  };

  // __PART_C__

  // --- AUTO-SAVE: persist dirty tabs 800ms after the last keystroke --------
  useEffect(() => {
    const dirty = editorTabs.filter((t) => t.dirty);
    if (dirty.length === 0) return;
    const timers = dirty.map((t) =>
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.path === t.path);
        if (!tab || !tab.dirty) return;
        void invoke("fs_write_file", { path: tab.path, content: tab.content })
          .then(() =>
            setEditorTabs((prev) =>
              prev.map((x) => (x.path === tab.path ? { ...x, dirty: false } : x))
            )
          )
          .catch((e) =>
            setError(`Auto-save failed for ${tab.path}: ${e instanceof Error ? e.message : String(e)}`)
          );
      }, 800)
    );
    return () => timers.forEach(clearTimeout);
  }, [editorTabs]);

  // --- Cross-window sync (chat window ⇄ IDE window) --------------------------
  // Refresh a tab from disk unless it has unsaved local edits.
  const syncTabWithDisk = useCallback(async (path: string) => {
    let disk: string | null = null;
    try {
      disk = await invoke<string>("fs_read_file", { path });
    } catch {
      disk = null; // file was deleted / moved / is unreadable
    }
    setEditorTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx === -1) return prev;
      const tab = prev[idx];
      if (disk === null) return tab.dirty ? prev : prev.filter((t) => t.path !== path);
      if (tab.dirty || tab.content === disk) return prev;
      const next = [...prev];
      next[idx] = { ...tab, content: disk };
      return next;
    });
  }, []);

  // Poll the filesystem so edits made from the chat window (agent tools), git
  // operations or other editors show up without reopening the file.
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const t of tabsRef.current) {
        if (!t.dirty) void syncTabWithDisk(t.path);
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [syncTabWithDisk]);

  // The chat window forwards file opens (agent tools, problems-panel jumps)
  // and workspace changes to this window via Tauri events.
  useEffect(() => {
    const unlistenOpen = listen<{ path: string; line: number | null }>(
      "neo:ide-open-file",
      (e) => {
        const { path, line } = e.payload;
        if (typeof path === "string" && path) void openFileInEditor(path, line ?? undefined);
      }
    );
    const unlistenChanged = listen("neo:workspace-changed", () => {
      setExplorerRefreshKey((k) => k + 1);
      for (const t of tabsRef.current) {
        if (!t.dirty) void syncTabWithDisk(t.path);
      }
    });
    return () => {
      void unlistenOpen.then((f) => f());
      void unlistenChanged.then((f) => f());
    };
  }, [openFileInEditor, syncTabWithDisk]);

  // --- workspace pickers ----------------------------------------------------
  const pickWorkspaceFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false, title: "Open Folder" });
      if (typeof dir === "string") {
        setWorkspaceRoot(dir);
        localStorage.setItem(WS_KEY, dir);
        setEditorTabs([]);
        setActiveEditorPath(null);
      }
    } catch (e) {
      setError(`Failed to open folder: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const pickWorkspaceFiles = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const files = await open({ multiple: true, title: "Open Files" });
      if (Array.isArray(files)) {
        for (const f of files) {
          if (typeof f === "string") await openFileInEditor(f);
        }
      }
    } catch (e) {
      setError(`Failed to open files: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const createFileInWorkspace = async (name: string) => {
    if (!workspaceRoot) return;
    const rel = name.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/");
    const path = `${workspaceRoot.replace(/[\\/]+$/, "")}/${rel}`;
    try {
      await invoke("fs_write_file", { path, content: "" });
      setExplorerRefreshKey((k) => k + 1);
      await openFileInEditor(path);
    } catch (e) {
      setError(`Failed to create ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const activeDirty =
    editorTabs.find((t) => t.path === activeEditorPath)?.dirty ?? false;

  // Auto-open the terminal panel when a workspace is present.
  useEffect(() => {
    if (workspaceRoot) setTerminalOpen(true);
  }, [workspaceRoot]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)] text-[#d4d4d4]">
      {/* ── Title bar: menus + workspace + window controls ─────────────── */}
      <header
        data-tauri-drag-region
        className="flex h-[35px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[var(--bg-panel)] px-2"
      >
        <IdeMenuBar
          hasWorkspace={!!workspaceRoot}
          terminalOpen={terminalOpen}
          gitOpen={gitOpen}
          canSave={activeDirty}
          onSaveFile={() => {
            if (activeEditorPath) void saveEditorFile(activeEditorPath);
          }}
          onOpenFolder={() => void pickWorkspaceFolder()}
          onOpenFiles={() => void pickWorkspaceFiles()}
          onCloseAllTabs={closeAllEditorTabs}
          onToggleTerminal={() => setTerminalOpen((v) => !v)}
          onToggleGit={() => setGitOpen((v) => !v)}
          onClosePanel={() => void appWindow.close()}
        />
        <div data-tauri-drag-region className="flex items-center gap-1.5">
          {workspaceRoot && (
            <span
              className="max-w-[240px] truncate rounded bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-zinc-500"
              title={workspaceRoot}
            >
              {workspaceRoot.split(/[\\/]/).filter(Boolean).pop()}
            </span>
          )}
          {error && (
            <button
              type="button"
              onClick={() => setError(null)}
              title={error}
              className="max-w-[280px] truncate rounded bg-red-500/15 px-1.5 py-0.5 text-[10.5px] text-red-400"
            >
              {error} ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => void appWindow.minimize()}
            aria-label="Minimize"
            className="flex h-6 w-7 items-center justify-center rounded text-[#8a8a8a] transition hover:bg-white/[0.08] hover:text-[#e8e8e8]"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M3.5 8h9" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void appWindow.toggleMaximize()}
            aria-label="Maximize"
            className="flex h-6 w-7 items-center justify-center rounded text-[#8a8a8a] transition hover:bg-white/[0.08] hover:text-[#e8e8e8]"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="3.5" y="3.5" width="9" height="9" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void appWindow.close()}
            aria-label="Close IDE window"
            className="flex h-6 w-7 items-center justify-center rounded text-[#8a8a8a] transition hover:bg-[#e5534b] hover:text-white"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Body: activity rail | explorer | editor | git ──────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Activity bar — VS Code-style icon rail */}
        <nav className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-white/[0.07] bg-[var(--bg-panel)] py-1">
          <div className="flex w-full flex-col items-center gap-1">
            <RailButton
              active={!explorerCollapsed}
              title="Toggle file explorer (Ctrl+Shift+E)"
              onClick={() => setExplorerCollapsed((v) => !v)}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.75H13A1.5 1.5 0 0114.5 6.25V12A1.5 1.5 0 0112.5 13.5h-9A1.5 1.5 0 011.5 12V4.5z" />
                <path d="M1.5 7h13" opacity="0.5" />
              </svg>
            </RailButton>
            <RailButton active={gitOpen} title="Git tools" onClick={() => setGitOpen((v) => !v)}>
              <IoGitCommit size={15} />
            </RailButton>
          </div>
          <div className="w-full">
            <RailButton active={terminalOpen} title="Terminal (Ctrl+`)" onClick={() => setTerminalOpen((v) => !v)}>
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" />
                <path d="M4.5 6l2 1.7-2 1.7M8 9.8h3.5" />
              </svg>
            </RailButton>
            
          </div>
        </nav>
        {workspaceRoot && !explorerCollapsed && (
          <FileExplorer
            root={workspaceRoot}
            activePath={activeEditorPath}
            refreshKey={explorerRefreshKey}
            onOpenFile={openFileInEditor}
            onCollapse={collapseExplorer}
          />
        )}

        <CodeEditor
          tabs={editorTabs}
          activePath={activeEditorPath}
          onSelect={setActiveEditorPath}
          onClose={closeEditorTab}
          onChange={updateEditorContent}
          onSave={(p) => void saveEditorFile(p)}
          onCloseAll={closeAllEditorTabs}
          reveal={revealLine}
          prefs={DEFAULT_EDITOR_PREFS}
          emptyState={{
            hasWorkspace: !!workspaceRoot,
            onOpenFolder: () => void pickWorkspaceFolder(),
            onOpenFiles: () => void pickWorkspaceFiles(),
            onCreateFile: (name) => void createFileInWorkspace(name),
            recentFiles,
            onOpenRecent: (p) => void openFileInEditor(p),
          }}
        />

        {gitOpen && workspaceRoot && (
          <GitPanel
            root={workspaceRoot}
            onClose={closeGit}
            onOpenFile={(p: string) =>
              void openFileInEditor(`${workspaceRoot.replace(/[\/]+$/, "")}/${p}`)
            }
          />
        )}
      </div>

      {/* ── Bottom dock: terminal / problems / output / ports ───────────── */}
      <BottomPanel
        open={terminalOpen}
        tab={panelTab}
        onTab={setPanelTab}
        onClose={() => setTerminalOpen(false)}
        root={workspaceRoot}
        onOpenFile={(p, line) => void openFileInEditor(p, line)}
      />
    </div>
  );


}
