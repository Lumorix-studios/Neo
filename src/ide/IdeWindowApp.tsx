import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { IoGitBranch, IoGitCommit } from "react-icons/io5";
import IdeMenuBar from "../components/IdeMenuBar";
import FileExplorer from "../components/FileExplorer";
import SettingsPanel, { type SectionId } from "../components/SettingsPanel";
import type { AISettings } from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { loadSettings, saveSettings } from "../store";
import {
  applyUiSettings,
  DEFAULT_UI_SETTINGS,
  loadUiSettings,
  saveUiSettings,
  type UiSettings,
} from "../uiSettings";
import CodeEditor, { type EditorTab } from "../components/CodeEditor";
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

/* Language-mode label for the status bar (VS Code shows the active language). */
const LANG_LABELS: Array<[RegExp, string]> = [
  [/\.(ts|tsx)$/i, "TypeScript"],
  [/\.(js|jsx|mjs|cjs)$/i, "JavaScript"],
  [/\.json$/i, "JSON"],
  [/\.css$/i, "CSS"],
  [/\.(html?|htm)$/i, "HTML"],
  [/\.(md|markdown)$/i, "Markdown"],
  [/\.rs$/i, "Rust"],
  [/\.py$/i, "Python"],
  [/\.go$/i, "Go"],
  [/\.java$/i, "Java"],
  [/\.(c|h)$/i, "C"],
  [/\.(cpp|hpp|cc)$/i, "C++"],
  [/\.(cs)$/i, "C#"],
  [/\.(yml|yaml)$/i, "YAML"],
  [/\.toml$/i, "TOML"],
  [/\.sh(\.bats)?$/i, "Shell Script"],
  [/\.sql$/i, "SQL"],
];

function langLabel(path: string): string {
  for (const [re, label] of LANG_LABELS) if (re.test(path)) return label;
  return "Plain Text";
}

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
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SectionId | null>(null);
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  // Bumped when extensions are installed/toggled so contributed UI re-evaluates.
  const [, setExtensionTick] = useState(0);
  const uiSettingsLoadedRef = useRef(false);

  // Load persisted UI + AI settings once on mount (shared with the chat window).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [ui, ai] = await Promise.all([loadUiSettings(), loadSettings()]);
      if (cancelled) return;
      setUiSettings(ui);
      setAiSettings(ai);
      uiSettingsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply theme/accent CSS variables whenever UI settings change.
  useEffect(() => {
    applyUiSettings(uiSettings);
  }, [uiSettings]);

  // Persist UI settings (debounced, only after the initial load).
  useEffect(() => {
    if (!uiSettingsLoadedRef.current) return;
    const t = setTimeout(() => void saveUiSettings(uiSettings), 250);
    return () => clearTimeout(t);
  }, [uiSettings]);

  /** Merge a patch into UI settings (Settings panel writes here). */
  const updateUiSettings = (patch: Partial<UiSettings>) => {
    setUiSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleAiChange = (next: AISettings) => {
    setAiSettings(next);
    void saveSettings(next);
  };

  const handleSelectLocalModel = (modelName: string) => {
    // Switch to the Ollama provider and set the selected local model.
    const next: AISettings = {
      ...aiSettings,
      provider: "ollama",
      model: modelName,
      baseUrl: "http://localhost:11434",
      apiKey: "",
    };
    setAiSettings(next);
    void saveSettings(next);
  };

  // --- bottom panel (terminal etc.) ----------------------------------------
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");

  // --- status bar state (git branch + caret position) ------------------------
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Poll the git branch for the status bar. Uses the same `run_command`
  // shell-out as the GitPanel — no dedicated backend command needed.
  useEffect(() => {
    if (!workspaceRoot) {
      setGitBranch(null);
      return;
    }
    let cancelled = false;
    const fetchBranch = async () => {
      try {
        const res = await invoke<Record<string, unknown>>("run_command", {
          command: "git status --porcelain=v1 -b",
          cwd: workspaceRoot,
          timeout_secs: 10,
        });
        if (cancelled) return;
        const first = (String(res.stdout ?? "").split(/\r?\n/)[0] ?? "").trim();
        if (!first.startsWith("##")) {
          setGitBranch(null); // not a git repository
          return;
        }
        const fresh = /^##\s+no commits yet on\s+(.+)$/i.exec(first);
        const name =
          fresh?.[1] ?? /^##\s+(.+?)(?=\.\.\.|\s+\[|$)/.exec(first)?.[1] ?? null;
        setGitBranch(name && !name.includes("(") ? name.trim() : null);
      } catch {
        if (!cancelled) setGitBranch(null);
      }
    };
    void fetchBranch();
    const id = window.setInterval(fetchBranch, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [workspaceRoot, explorerRefreshKey]);

  // --- explorer width (drag-to-resize, persisted) ---------------------------
  const EXPLORER_KEY = "neo.ide.explorerWidth";
  const [explorerWidth, setExplorerWidth] = useState(() => {
    const stored = Number(localStorage.getItem(EXPLORER_KEY));
    return Number.isFinite(stored) && stored >= 170 && stored <= 480 ? stored : 240;
  });
  const explorerDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onExplorerResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    explorerDragRef.current = { startX: e.clientX, startWidth: explorerWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onExplorerResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = explorerDragRef.current;
    if (!drag) return;
    setExplorerWidth(Math.min(480, Math.max(170, drag.startWidth + (e.clientX - drag.startX))));
  };
  const onExplorerResizeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    explorerDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };
  useEffect(() => {
    localStorage.setItem(EXPLORER_KEY, String(explorerWidth));
  }, [explorerWidth]);

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

  // Auto-save: debounce-save every dirty editor tab after the configured delay.
  useEffect(() => {
    if (!uiSettings.autoSave) return;
    const dirty = editorTabs.filter((t) => t.dirty);
    if (dirty.length === 0) return;
    const id = window.setTimeout(() => {
      for (const t of dirty) void saveEditorFile(t.path);
    }, uiSettings.autoSaveDelayMs);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTabs, uiSettings.autoSave, uiSettings.autoSaveDelayMs]);
  useEffect(() => {
    // Start with the terminal panel closed when a workspace loads.
    if (workspaceRoot) setTerminalOpen(false);
  }, [workspaceRoot]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-editor)] text-[#d4d4d4]">
      {/*Title bar: menus + workspace + window controls*/}
      <header
        data-tauri-drag-region
        className="flex h-[35px] shrink-0 items-center justify-between border-b border-white/[0.02] bg-[var(--bg-chrome)] px-2"
      >
        <IdeMenuBar
          hasWorkspace={!!workspaceRoot}
          terminalOpen={terminalOpen}
          onOpenSettings={() => {
            setSettingsSection(null);
            setSettingsOpen(true);
          }}
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
              data-tauri-drag-region
              className="max-w-[350px] truncate text-[11.5px] text-[#8a8a93]"
              title={workspaceRoot}
            >
              {[
                activeEditorPath ? (activeEditorPath.split(/[\\/]/).pop() ?? null) : null,
                workspaceRoot.split(/[\\/]/).filter(Boolean).pop() ?? null,
                "Neo",
              ]
                .filter(Boolean)
                .join(" — ")}
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
        </div>
      </header>

      {/* ── Body: activity rail | explorer | editor | git ──────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Activity bar — VS Code-style icon rail */}
        <nav className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-white/[0.02] bg-[var(--bg-chrome)] py-1">
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
          <>
            <FileExplorer
              root={workspaceRoot}
              activePath={activeEditorPath}
              refreshKey={explorerRefreshKey}
              onOpenFile={openFileInEditor}
              onCollapse={collapseExplorer}
              width={explorerWidth}
            />
            {/* Drag handle — VS Code-style sash between sidebar and editor. */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize explorer"
              onPointerDown={onExplorerResizeStart}
              onPointerMove={onExplorerResizeMove}
              onPointerUp={onExplorerResizeEnd}
              onPointerCancel={onExplorerResizeEnd}
              className="w-[3px] shrink-0 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-(--accent)/25 active:bg-(--accent)/40"
            />
          </>
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
          prefs={{
            fontSize: uiSettings.editorFontSize,
            lineHeight: uiSettings.editorLineHeight,
            tabSize: uiSettings.tabSize,
            wordWrap: uiSettings.wordWrap,
            showLineNumbers: uiSettings.showLineNumbers,
          }}
          onCursorChange={setCursorPos}
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

     
      <BottomPanel
        open={terminalOpen}
        tab={panelTab}
        onTab={setPanelTab}
        onClose={() => setTerminalOpen(false)}
        root={workspaceRoot}
        onOpenFile={(p, line) => void openFileInEditor(p, line)}
        terminalPrefs={{
          fontSize: uiSettings.terminalFontSize,
          scrollback: uiSettings.terminalScrollback,
          cursorBlink: uiSettings.terminalCursorBlink,
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        settings={uiSettings}
        onChange={updateUiSettings}
        aiSettings={aiSettings}
        onAiChange={handleAiChange}
        onSelectLocalModel={handleSelectLocalModel}
        initialSection={settingsSection}
        onClose={() => setSettingsOpen(false)}
        onExtensionsChanged={() => setExtensionTick((t) => t + 1)}
      />

      {/* ── Status bar (VS Code-style) ──────────────────────────────────── */}
      <footer className="flex h-[22px] shrink-0 items-center justify-between border-t border-white/[0.07] bg-[var(--bg-chrome)] px-2 text-[11px] text-[#a8a8a8]">
        <div className="flex min-w-0 items-center gap-3">
          {workspaceRoot && (
            <span className="min-w-0 truncate" title={workspaceRoot}>
              {workspaceRoot.split(/[\\/]/).filter(Boolean).pop()}
            </span>
          )}
          {gitBranch && (
            <span className="flex shrink-0 items-center gap-1" title="Current branch">
              <IoGitBranch size={12} />
              {gitBranch}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {activeEditorPath && (
            <span className="tabular-nums">
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span>Spaces: {uiSettings.tabSize}</span>
          <span>UTF-8</span>
          <span>LF</span>
          {activeEditorPath && <span>{langLabel(activeEditorPath)}</span>}
        </div>
      </footer>
    </div>
  );


}
