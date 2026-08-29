import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import IdeMenuBar from "../components/IdeMenuBar";
import FileExplorer from "../components/FileExplorer";
import CodeEditor, {
  DEFAULT_EDITOR_PREFS,
  type EditorTab,
} from "../components/CodeEditor";
import BottomPanel, { type PanelTab } from "../components/BottomPanel";
import GitPanel from "../components/GitPanel";

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

  /** Open a file in an editor tab (fetching content from disk). */
  const openFileInEditor = async (path: string, line?: number) => {
    setActiveEditorPath(path);
    if (line != null) setRevealLine({ path, line });
    if (editorTabs.some((t) => t.path === path)) return;
    try {
      const content = await invoke<string>("fs_read_file", { path });
      pushRecent(path);
      setEditorTabs((prev) =>
        prev.some((t) => t.path === path) ? prev : [...prev, { path, content, dirty: false }]
      );
    } catch (e) {
      setError(`Failed to open ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
  const tabsRef = useRef(editorTabs);
  tabsRef.current = editorTabs;
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

      {/* ── Body: explorer | editor | git ──────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {workspaceRoot && !explorerCollapsed && (
          <FileExplorer
            root={workspaceRoot}
            activePath={activeEditorPath}
            refreshKey={explorerRefreshKey}
            onOpenFile={(p) => void openFileInEditor(p)}
            onCollapse={() => setExplorerCollapsed(true)}
          />
        )}
        {workspaceRoot && explorerCollapsed && (
          <div className="flex w-7 shrink-0 flex-col items-center border-r border-white/[0.07] bg-[var(--bg-panel)] py-2">
            <button
              type="button"
              onClick={() => setExplorerCollapsed(false)}
              title="Show explorer"
              className="flex h-6 w-6 items-center justify-center rounded text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4l3.5 4L5 12M9.5 4L13 8l-3.5 4" />
              </svg>
            </button>
          </div>
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
            onClose={() => setGitOpen(false)}
            onOpenFile={(p) => void openFileInEditor(p)}
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
