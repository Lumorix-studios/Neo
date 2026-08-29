import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import TopMenu from "../components/TopMenu";
import ChatHistorySidebar from "../components/ChatHistorySidebar.tsx";
import InfoPanel from "../components/InfoPanel";
import PrivacyPolicy from "../components/PrivacyPolicy.tsx";
import CommandPalette from "../components/CommandPalette";
import StatusBar from "../components/StatusBar.tsx";
import Tab2 from "../components/Tab2.tsx";
import Markdown from "./components/Markdown";
import BottomPanel, { type PanelTab } from "./components/BottomPanel";
import { isExtensionEnabled } from "./extensions";
import { formatWithPrettier } from "./extensionsRuntime";
import "./editor.css";
import type { AISettings, ChatSession, Message } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import {
  loadSettings,
  saveSettings,
  loadSessions,
  saveSessions,
  loadActiveSessionId,
  saveActiveSessionId,
} from "./store";
import { getProviderSpec, buildAuthHeaders, PROVIDER_OPTIONS, providerById } from "./providers";
import type { ProviderSpec } from "./providers";
import AgenticActivity from "./components/AgenticActivity";
import {
  AGENTIC_PROMPT,
  activityId,
  executeTool,
  formatToolResult,
  ingestNativeChunk,
  isDestructive,
  isToolName,
  nativeAccToCalls,
  parseToolCalls,
  stabilizeStreamingMarkdown,
  stripToolCalls,
  type NativeToolAcc,
  type ToolCall,
} from "./agentic";
import type { AgenticActivity as AgenticActivityType } from "./agentic";
import type { FsEntry } from "./agentic";
import {
  loadMcpServers,
  listMcpTools,
  callMcpTool,
  type McpServerConfig,
} from "./mcp";
import { computeLineDiff } from "./diff";
import { resolveFsPath } from "./agentic";
import FileExplorer from "./components/FileExplorer";
import CodeEditor from "./components/CodeEditor";
import IdeMenuBar from "./components/IdeMenuBar";
import type { EditorTab } from "./components/CodeEditor";
import GitPanel from "./components/GitPanel";
import { IoGitCommit } from "react-icons/io5";
import SettingsPanel, { type SectionId } from "./components/SettingsPanel";
import {
  applyUiSettings,
  DEFAULT_UI_SETTINGS,
  getRecentFiles,
  getRecentFolders,
  loadUiSettings,
  pushRecentFile,
  pushRecentFolder,
  saveUiSettings,
  type UiSettings,
} from "./uiSettings";

type JsonDict = Record<string, unknown>;

/** Newline character (avoids escape-sequence issues in generated code). */
const NL = String.fromCharCode(10);

/** Result of one streaming round: visible text + any native tool calls. */
interface StreamRoundResult {
  text: string;
  nativeCalls: ToolCall[];
}

const MAX_TOOL_OUTPUT = 8000;

function truncateToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT) return output;
  const head = Math.floor(MAX_TOOL_OUTPUT * 0.6);
  const tail = MAX_TOOL_OUTPUT - head;
  const omitted = output.length - head - tail;
  return (
    output.slice(0, head) +
    `${NL}[... output truncated — ${omitted} characters omitted ...]${NL}` +
    output.slice(output.length - tail)
  );
}

async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
  const inTauri = !!win.__TAURI_INTERNALS__;

  if (inTauri) {
    try {
      return await tauriFetch(url, init);
    } catch (e) {
      throw new Error(
        `Tauri HTTP request failed: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e }
      );
    }
  }
  return fetch(url, init);
}
const sendFeedback = (feedback: "good" | "bad" | "report") => {
  const subject = encodeURIComponent("AgenticCoder Feedback");
  const body = encodeURIComponent(`Feedback: ${feedback}`);

  window.location.href =
    `mailto:madhusudhant207@gmail.com?subject=${subject}&body=${body}`;
};

function sanitizeHistory(msgs: Message[]): Message[] {
  const out: Message[] = [];
  for (const m of msgs) {
    const hasNativeCalls = !!(m.toolCalls && m.toolCalls.length > 0);
    if (m.role === "assistant" && m.content.trim().length === 0 && !hasNativeCalls) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.role === m.role &&
      !(last.toolCalls && last.toolCalls.length > 0) &&
      !hasNativeCalls
    ) {
      last.content = `${last.content}
${m.content}`.trim();
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

function generateSessionId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Untitled chat";
  const text = firstUser.content.trim();
  return text.length > 50 ? text.slice(0, 50) + "…" : text;
}

/** Icon button for the VS Code-style activity bar rail. */
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

/** Known context-window sizes by model-family substring (first match wins). */
const CONTEXT_LIMITS: Array<[string, number]> = [
  ["gpt-4o", 128000],
  ["gpt-4.1", 1000000],
  ["gpt-5", 400000],
  ["o1", 200000],
  ["o3", 200000],
  ["claude", 200000],
  ["gemini-2.5-pro", 1048576],
  ["gemini-2.5-flash", 1048576],
  ["gemini", 32768],
  ["deepseek", 65536],
  ["qwen", 32768],
  ["mistral", 32768],
  ["grok", 131072],
  ["llama", 8192],
];

function contextLimitFor(model: string): number {
  const m = model.toLowerCase();
  for (const [key, limit] of CONTEXT_LIMITS) {
    if (m.includes(key)) return limit;
  }
  return 128000;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/** Small ghost icon-button used in the assistant message action row. */
function MessageAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 items-center justify-center rounded-md text-[#6b6b6b] transition-colors hover:bg-white/[0.06] hover:text-[#d4d4d4]"
    >
      {children}
    </button>
  );
}

export default function App() {
  const [modelOpen, setModelOpen] = useState(false);
  const [onOpenTerminal, setOpenTerminal] = useState(false);
  // Which tab of the bottom dock is visible (terminal/problems/debug/…).
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");
  // Jump-to-line request forwarded to the CodeEditor (problems panel etc.).
  const [revealLine, setRevealLine] = useState<{ path: string; line: number } | null>(null);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [privacyPolicyOpen, setPrivacyPolicyOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Bumped when extensions are installed/toggled so contributed UI (preview
  // tab, status-bar stats) re-evaluates immediately. Value itself is unused.
  const [, setExtensionTick] = useState(0);
  const [Tab2Open, setTab2Open] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [restored, setRestored] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activities, setActivities] = useState<AgenticActivityType[]>([]);
  const [pendingApproval, setPendingApproval] =
    useState<AgenticActivityType | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Resolver for the pending destructive-tool approval dialog.
  const approvalRef = useRef<{
    id: string;
    resolve: (approved: boolean) => void;
  } | null>(null);
  // Cap the number of tool rounds to avoid runaway loops.
  const MAX_TOOL_ROUNDS = 12;

  // The active streaming request's abort controller, so we can cancel it.
  const streamControllerRef = useRef<AbortController | null>(null);
  // Mutable hold of the assistant text being streamed in (avoids closures capturing stale state).
  const streamedContentRef = useRef("");
  const mountedRef = useRef(true);
  // Whether the user is scrolled near the bottom (auto-follow).
  const autoScrollRef = useRef(true);

  // --- IDE / Code editor state ---
  const [ideOpen, setIdeOpen] = useState(false);
  // Popup menu on the rail folder button (Open Folder… / Open Files…).
  const [railMenuOpen, setRailMenuOpen] = useState(false);
  // Source-control side panel toggled from the rail's Git button.
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  // Resizable width of the IDE panel (px), adjusted by dragging its left edge.
  const [ideWidth, setIdeWidth] = useState(520);
  const ideDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  // VS Code-style: collapse the file-explorer sidebar for more editor room.
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  // --- UI settings (Settings tab) ---
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which section of the settings panel was requested (null = default). */
  const [settingsSection, setSettingsSection] = useState<SectionId | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [, setRecentFolders] = useState<string[]>([]);

  const spec: ProviderSpec = getProviderSpec(settings);

  // --- Model overview: estimated token usage vs. the model's context window ---
  const ctxLimit = contextLimitFor(settings.model);
  const estTokens = (() => {
    let chars = settings.systemPrompt.length + 800; // headroom for agent prompt
    for (const m of messages) chars += m.content.length;
    return Math.ceil(chars / 4);
  })();
  const ctxPct = Math.min(100, Math.round((estTokens / ctxLimit) * 100));

  useEffect(() => {
    mountedRef.current = true;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSettingsSection("ai");
        setSettingsOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setHistorySidebarOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setIdeOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setGitPanelOpen((v) => !v);
      }
      // Ctrl+Alt+F: Format Document (command contributed by the Prettier
      // extension — a no-op while it is not installed and enabled).
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void formatDocument(activeEditorRef.current);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setOpenTerminal((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsSection(null);
        setSettingsOpen(true);
      }
      // Ctrl+Tab / Ctrl+Shift+Tab: cycle through open editor tabs.
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const tabs = editorTabsRef.current;
        if (tabs.length > 1) {
          const idx = tabs.findIndex((t) => t.path === activeEditorRef.current);
          const next = e.shiftKey
            ? tabs[(idx - 1 + tabs.length) % tabs.length]
            : tabs[(idx + 1) % tabs.length];
          if (next) setActiveEditorPath(next.path);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, sess, activeId, ui] = await Promise.all([
        loadSettings(),
        loadSessions(),
        loadActiveSessionId(),
        loadUiSettings(),
      ]);
      if (cancelled) return;

      setSettings(s);
      setUiSettings(ui);
      setRecentFiles(getRecentFiles());
      setRecentFolders(getRecentFolders());

      // If we have saved sessions, restore the active one (or the most recent).
      if (sess.length > 0) {
        setSessions(sess);
        const target = activeId
          ? sess.find((x) => x.id === activeId)
          : undefined;
        const session = target ?? sess[0];
        if (session) {
          setActiveSessionId(session.id);
          setMessages(sanitizeHistory(session.messages));
        }
      }

      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {      saveSettings(settings);
    }, 250);
    return () => clearTimeout(t);
  }, [settings, restored]);

  // Persist sessions whenever they change.
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveSessions(sessions);
    }, 250);
    return () => clearTimeout(t);
  }, [sessions, restored]);

  // Persist active session id.
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveActiveSessionId(activeSessionId);
    }, 250);
    return () => clearTimeout(t);
  }, [activeSessionId, restored]);

  // Apply UI settings to the document immediately, then persist (debounced).
  useEffect(() => {
    applyUiSettings(uiSettings);
  }, [uiSettings]);
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      void saveUiSettings(uiSettings);
    }, 250);
    return () => clearTimeout(t);
  }, [uiSettings, restored]);

  /** Merge a patch into UI settings (Settings tab writes here). */
  const updateUiSettings = (patch: Partial<UiSettings>) => {
    setUiSettings((prev) => ({ ...prev, ...patch }));
  };

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

  // Keep the active session's messages in sync with the sessions list.
  useEffect(() => {
    if (!restored || !activeSessionId) return;
    const t = setTimeout(() => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === activeSessionId);
        if (!existing) return prev;
        const updated: ChatSession = {
          ...existing,
          messages,
          updatedAt: Date.now(),
          title: existing.title !== "Untitled chat" ? existing.title : deriveTitle(messages),
          settings: existing.settings ?? settings,
        };
        return prev.map((s) => (s.id === activeSessionId ? updated : s));
      });
    }, 250);
    return () => clearTimeout(t);
  }, [messages, activeSessionId, restored, settings]);

  // Keep the chat pinned to the bottom while the user hasn't scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (autoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    // Abort any in-flight stream when the component unmounts.
    return () => {
      streamControllerRef.current?.abort();
    };
  }, []);

  const handleSaveSettings = (next: AISettings) => {
    setSettings(next);
    void saveSettings(next);

    // Persist the settings into the active session so each chat tab
    // remembers which AI it was using.
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, settings: next } : s))
      );
    }
  };

  const handleSelectLocalModel = (modelName: string) => {
    // Switch to the Ollama provider and set the selected local model.
    const next: AISettings = {
      ...settings,
      provider: "ollama",
      model: modelName,
      baseUrl: "http://localhost:11434",
      apiKey: "",
    };
    setSettings(next);
    void saveSettings(next);

    // Remember the local model choice for the active session too.
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, settings: next } : s))
      );
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" when within 80px of the scroll bottom.
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /** Append to the trailing assistant placeholder's content (used while streaming). */
  const setLastAssistantContent = (content: string) => {
    if (!mountedRef.current) return;
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
        // No assistant bubble present — add one (e.g. non-stream fallback).
        return [...prev, { role: "assistant", content }];
      }
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content };
      return copy;
    });
  };

  /** Remove any trailing empty assistant bubble (used for errors / aborts). */
  const removeEmptyAssistant = () => {
    if (!mountedRef.current) return;
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") return prev;
      if (prev[prev.length - 1].content.trim().length > 0) return prev;
      return prev.slice(0, -1);
    });
  };

  const stopChat = () => {
    // Abort the in-flight request. The stream loop detects the abort and
    // finalizes whatever content we collected so far.
    streamControllerRef.current?.abort();
    setIsLoading(false);
  };

  const newChat = () => {
    streamControllerRef.current?.abort();
    setMessages([]);
    setError(null);
    setActiveSessionId(null);
  };

  const selectSession = (id: string) => {
    streamControllerRef.current?.abort();
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    setActiveSessionId(id);
    setMessages(sanitizeHistory(session.messages));
    // Restore the AI provider/model this tab was using (fall back to global).
    if (session.settings) {
      setSettings(session.settings);
    }
    setError(null);
    setIsLoading(false);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  
  const pickWorkspaceFolder = async () => {
    try {
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string" && dir) {
        // Opening a folder always REPLACES the current workspace: every open
        // editor tab is closed and the explorer starts from a clean state.
        // The `key` on <FileExplorer> forces a full remount so no stale tree
        // state from the previous folder can survive.
        setWorkspaceRoot(dir);
        setEditorTabs([]);
        setActiveEditorPath(null);
        setExplorerRefreshKey((k) => k + 1);
        setRecentFolders(pushRecentFolder(dir));
        // Make sure the picked folder is immediately visible in the editor.
        setIdeOpen(true);
        setExplorerCollapsed(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Ask the user to pick one or more files to open directly in the editor.
   *  Only the picked files are opened — no workspace folder is loaded. */
  const pickWorkspaceFiles = async () => {
    try {
      const files = await open({ multiple: true, directory: false });
      if (!files) return;
      const list = Array.isArray(files) ? files : [files];
      // Show the editor panel so the picked files are visible right away.
      setIdeOpen(true);
      for (const f of list) {
        await openFileInEditor(f);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Max simultaneously open editor tabs (LRU-evicted beyond this). */
  const MAX_OPEN_TABS = 10;

  /** Open a file from the explorer in an editor tab (optionally at a line). */
  const openFileInEditor = async (path: string, line?: number) => {
    setActiveEditorPath(path);
    if (line != null) setRevealLine({ path, line });
    if (editorTabs.some((t) => t.path === path)) return;
    try {
      const content = await invoke<string>("fs_read_file", { path });
      setRecentFiles(pushRecentFile(path));
      setEditorTabs((prev) => {
        if (prev.some((t) => t.path === path)) return prev;
        let next: EditorTab[] = [...prev, { path, content, dirty: false }];
        // LRU cap: evict oldest clean tabs so the pane never fills with
        // every file ever opened.
        while (next.length > MAX_OPEN_TABS) {
          const evictIdx = next.findIndex((t) => !t.dirty && t.path !== path);
          if (evictIdx === -1) break;
          next = next.filter((_, i) => i !== evictIdx);
        }
        return next;
      });
    } catch (e) {
      setError(`Failed to open ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Close every open editor tab. */
  const closeAllEditorTabs = () => {
    setEditorTabs([]);
    setActiveEditorPath(null);
  };

  /**
   * Cursor-style "IDE →": open the full IDE in its own native window
   * (explorer + editor + auto-save + git + terminal). Reuses the same bundle
   * with ?window=ide so main.tsx mounts IdeWindowApp there.
   */
  const launchIdeWindow = async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const existing = await WebviewWindow.getByLabel("ide");
      if (existing) {
        await existing.setFocus();
        return;
      }
      const ideWin = new WebviewWindow("ide", {
        url: "index.html?window=ide",
        title: "Neo IDE",
        width: 1280,
        height: 820,
        minWidth: 720,
        minHeight: 480,
      });
      ideWin.once("tauri://error", (e) => {
        setError(`Failed to open IDE window: ${e.payload}`);
      });
    } catch (e) {
      setError(`Failed to open IDE window: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // --- IDE panel resize-handle drag logic ---
  const MIN_IDE_WIDTH = 280;

  const onIdeResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    ideDragRef.current = { startX: e.clientX, startWidth: ideWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onIdeResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = ideDragRef.current;
    if (!drag) return;
    // Let the IDE panel slide across the whole window (fully extended IDE).
    const max = window.innerWidth;
    const next = drag.startWidth - (e.clientX - drag.startX);
    setIdeWidth(Math.min(max, Math.max(MIN_IDE_WIDTH, next)));
  };

  /** Double-click the resize handle: snap between full-window and restored. */
  const ideMaximized = ideWidth >= window.innerWidth - 8;
  const toggleIdeMaximize = () => {
    setIdeWidth(ideMaximized ? 520 : window.innerWidth);
  };

  const onIdeResizeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    ideDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  /** Close an editor tab, falling back to a neighbouring tab. */
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

  /** Mark a tab dirty as its content changes. */
  const updateEditorContent = (path: string, content: string) => {
    setEditorTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content, dirty: true } : t))
    );
  };

  /** Persist the active tab back to disk via the Tauri fs command. */
  const saveEditorFile = async (path: string) => {
    const tab = editorTabs.find((t) => t.path === path);
    if (!tab) return;
    // Format-on-Save, contributed by the Prettier extension. The formatted
    // text is written to disk and reflected back into the editor tab.
    let contentToSave = tab.content;
    if (isExtensionEnabled("prettier.formatter")) {
      const formatted = await formatWithPrettier(path, tab.content);
      if (formatted != null && formatted !== tab.content) {
        contentToSave = formatted;
        setEditorTabs((prev) =>
          prev.map((t) =>
            t.path === path ? { ...t, content: formatted, dirty: false } : t
          )
        );
      }
    }
    try {
      await invoke("fs_write_file", { path, content: contentToSave });
      setEditorTabs((prev) =>
        prev.map((t) => (t.path === path ? { ...t, dirty: false } : t))
      );
      setExplorerRefreshKey((k) => k + 1);
    } catch (e) {
      setError(`Failed to save ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /**
   * Format Document — command contributed by the Prettier extension.
   * Uses ref mirrors so the (once-registered) global key handler always
   * formats the tab that is active right now.
   */
  const formatDocument = async (path: string | null) => {
    if (!isExtensionEnabled("prettier.formatter")) {
      setError("Prettier is not active — install and enable it in Settings → Extensions.");
      return;
    }
    const p = path ?? activeEditorRef.current;
    if (!p) return;
    const tab = editorTabsRef.current.find((t) => t.path === p);
    if (!tab) return;
    const out = await formatWithPrettier(p, tab.content);
    if (out == null) {
      setError(`Prettier: unsupported file type or syntax error in ${p}`);
      return;
    }
    if (out !== tab.content) updateEditorContent(p, out);
  };

  // --- Extension contributions (VS Code-style activation) ----------------
  // Read live on every render so features activate the moment an extension
  // is installed/toggled in Settings (the panel reports changes back).
  const markdownPreviewEnabled = isExtensionEnabled("md.markdown-preview");
  const wordCountEnabled = isExtensionEnabled("status.word-count");
  const todoEnabled = isExtensionEnabled("status.todo-inspector");
  const statusExtensionsOn = wordCountEnabled || todoEnabled;

  /** Create an empty file inside the workspace (editor empty-state action). */
  const createFileInWorkspace = async (name: string) => {
    if (!workspaceRoot) {
      setError("Open a folder first to create files.");
      return;
    }
    const path = `${workspaceRoot.replace(/[\\/]+$/, "")}/${name.replace(/^[\\/]+/, "")}`;
    try {
      await invoke("fs_write_file", { path, content: "" });
      setExplorerRefreshKey((k) => k + 1);
      await openFileInEditor(path);
    } catch (e) {
      setError(`Failed to create ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Mirror of editorTabs for use inside intervals / async callbacks.
  const editorTabsRef = useRef<EditorTab[]>([]);
  editorTabsRef.current = editorTabs;

  // Ref mirror of the focused tab path for the async agent loop. Set via an
  // effect so we never write refs during render.
  const activeEditorRef = useRef<string | null>(null);
  useEffect(() => {
    activeEditorRef.current = activeEditorPath;
  }, [activeEditorPath]);

  
  const syncTabWithDisk = async (path: string) => {
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
  };

  /** Refresh every open tab from disk. */
  const syncAllOpenTabs = () => {
    for (const t of editorTabsRef.current) void syncTabWithDisk(t.path);
  };
  // Ref indirection so intervals and the tool loop always call the latest closure.
  const syncAllOpenTabsRef = useRef<() => void>(() => {});
  syncAllOpenTabsRef.current = syncAllOpenTabs;

  // Poll the filesystem while the IDE panel is open so external edits
  // (AI tools, other editors, git operations) show up without reopening.
  useEffect(() => {
    if (!ideOpen) return;
    const id = window.setInterval(() => syncAllOpenTabsRef.current(), 1200);
    return () => window.clearInterval(id);
  }, [ideOpen]);

  /** Approve a pending destructive tool call. */
  const handleApproveTool = (id: string) => {
    const pending = approvalRef.current;
    if (!pending || pending.id !== id) return;
    setPendingApproval(null);
    approvalRef.current = null;
    pending.resolve(true);
  };

  /** Deny a pending destructive tool call. */
  const handleDenyTool = (id: string) => {
    const pending = approvalRef.current;
    if (!pending || pending.id !== id) return;
    setPendingApproval(null);
    approvalRef.current = null;
    pending.resolve(false);
  };

  /** Ask the user to approve a destructive tool call. */
  const requestApproval = (id: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      approvalRef.current?.resolve(false); // resolve any stale dialog
      approvalRef.current = { id, resolve };
    });

  
  const streamRound = async (
    history: Message[],
    agentic: boolean,
    signal: AbortSignal,
    promptSuffix = ""
  ): Promise<StreamRoundResult> => {
    const s = getProviderSpec(settings);
    const endpoint = s.buildUrl(settings);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...buildAuthHeaders(s, settings.apiKey),
    };
    
    const effectiveSettings: AISettings = agentic
      ? {
          ...settings,
          systemPrompt: `${settings.systemPrompt}

${AGENTIC_PROMPT}${promptSuffix ? `

${promptSuffix}` : ""}`,
        }
      : settings;
   
    const body = s.buildBody(effectiveSettings, history, { enableTools: agentic });

    // Use the signal from sendMessage so cancellation is handled by a single
    // source of truth (no separate per-round AbortController).
    let res: Response;
    try {
      res = await platformFetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (netErr) {
      if (signal.aborted) {
        throw new Error("__ABORTED__", { cause: netErr });
      }
      throw new Error(
        `Could not connect to ${endpoint}: ${
          netErr instanceof Error ? netErr.message : String(netErr)
        }`,
        { cause: netErr }
      );
    }

    if (signal.aborted) throw new Error("__ABORTED__");

    if (!res.ok) {
      let detail: string = `HTTP ${res.status} ${res.statusText}`;
      try {
        const text = await res.text();
        if (text) {
          const trimmed = text.trim();
          // If the server returned HTML (e.g. a website instead of an API),
          // don't dump the whole page — show a concise message instead.
          if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype")) {
            detail = `The server returned an HTML page (not an API response). Check that the base URL points to a valid AI API endpoint, not a website.`;
          } else {
            try {
              const parsed = JSON.parse(trimmed) as JsonDict;
              const errMsg = parsed?.error as JsonDict | undefined;
              detail =
                (errMsg?.message as string) ||
                (parsed?.message as string) ||
                trimmed;
            } catch {
              detail = trimmed.length > 500 ? trimmed.slice(0, 500) + "…" : trimmed;
            }
          }
        }
      } catch {
        /* keep the status-based detail */
      }
      let msg = `API error (${res.status}): ${detail}`;
      if (res.status === 401 || res.status === 403) {
        msg += ` ${s.authErrorHint(res.status, settings)}`;
      }
      throw new Error(msg);
    }

    const bodyStream = res.body;
    if (!bodyStream) {
      const data = (await res.json().catch(() => null)) as JsonDict | null;
      const acc0: NativeToolAcc[] = [];
      if (data) {
        ingestNativeChunk(data, acc0);
        return { text: s.extractContent(data), nativeCalls: nativeAccToCalls(acc0) };
      }
      return { text: "", nativeCalls: [] };
    }

    const reader = bodyStream.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let round = "";
    let base = streamedContentRef.current;
    const nativeAcc: NativeToolAcc[] = [];

    try {
      while (!signal.aborted) {
        let step: { done: boolean; value?: Uint8Array };
        try {
          step = await reader.read();
        } catch (e) {
          if (signal.aborted) break;
          throw e;
        }
        if (step.done) break;

        buffer += decoder.decode(step.value, { stream: true });
        const lines = buffer.split(NL);
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          let line = raw.trim();
          if (!line) continue;
          if (line.startsWith("data:")) line = line.slice(5).trim();
          if (!line) continue;
          if (line === "[DONE]") continue;
          if (line.startsWith(":")) continue;
          try {
            const json = JSON.parse(line) as Record<string, unknown>;
            // Accumulate native function-calling chunks so tool-only rounds
            // are not lost when no text deltas are emitted.
            ingestNativeChunk(json, nativeAcc);
            const delta = s.extractDelta(json);
            if (delta) {
              round += delta;
              
              const shown = stabilizeStreamingMarkdown(stripToolCalls(base + round));
              streamedContentRef.current = shown;
              setLastAssistantContent(shown);
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!round && nativeAcc.length === 0 && !signal.aborted) {
      try {
        const nonStreamBody = {
          ...(s.buildBody(effectiveSettings, history, { enableTools: agentic }) as Record<string, unknown>),
          stream: false,
        } as Record<string, unknown>;
        // Google uses a different URL for streaming vs. non-streaming.
        const nonStreamUrl = endpoint.includes("streamGenerateContent")
          ? endpoint.replace("streamGenerateContent", "generateContent")
          : endpoint;
        const fallbackRes = await platformFetch(nonStreamUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(nonStreamBody),
          signal,
        });
        if (fallbackRes.ok) {
          const data = (await fallbackRes.json().catch(() => null)) as JsonDict | null;
          if (data) {
            round = s.extractContent(data);
            ingestNativeChunk(data, nativeAcc);
          }
        }
      } catch {
        /* stream error — keep whatever we have (may be empty) */
      }
    }

    return { text: round, nativeCalls: nativeAccToCalls(nativeAcc) };
  };

  /** Heuristic: does the user's message look like a file/folder operation? */
  const looksLikeFileRequest = (text: string): boolean => {
    const t = text.toLowerCase();
    const keywords = [
      "read file", "read the file", "open file", "open the file",
      "create file", "create a file", "make file", "make a file",
      "write file", "write to file", "write a file",
      "edit file", "edit the file", "update file", "update the file",
      "delete file", "delete the file", "remove file", "remove the file",
      "delete folder", "delete directory", "remove folder", "remove directory",
      "create folder", "create directory", "make folder", "make directory",
      "list folder", "list directory", "list files", "show files",
      "search file", "search files", "find file", "find files",
      "rename file", "rename folder", "move file", "move folder",
      "append to file", "replace in file",
      "read the code", "read my code", "look at my code",
      "show me the code", "show the file", "show me the file",
      "what's in", "what is in", "whats in",
      "create a project", "make a project", "build a project",
      "create component", "make component", "create a component",
      "file", "folder", "directory", "path",
    ];
    return keywords.some((k) => t.includes(k));
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    // --- Fail-fast validation BEFORE touching the in-flight stream. ---
    const s = getProviderSpec(settings);
    if (s.needsAuth) {
      const trimmedKey = settings.apiKey.trim();
      if (!trimmedKey) {
        setError(
          `Please configure your ${s.label} API key in the AI Settings sidebar (Ctrl+B).`
        );
        return;
      }
      const authErr = s.validateAuth(trimmedKey);
      if (authErr) {
        setError(authErr);
        return;
      }
    }

    const base = settings.baseUrl.trim().replace(/\/+$/, "");
    if (!base) {
      setError("Base URL is empty. Configure it in the AI Settings sidebar (Ctrl+B).");
      return;
    }

    // --- Now it's safe to cancel any previous in-flight stream. ---
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;

    setError(null);
    setMessage("");
    setActivities([]);

    // If there's no active session, create one for this new conversation.
    // Snapshot the current AI settings so this tab remembers its model.
    if (!activeSessionId) {
      const newId = generateSessionId();
      const now = Date.now();
      const newSession: ChatSession = {
        id: newId,
        title: "Untitled chat",
        messages: [],
        createdAt: now,
        updatedAt: now,
        settings,
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newId);
    }

    // Optimistically render the user message and a streaming assistant bubble.
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Provider conversation for this agentic run.
    const agentHistory: Message[] = [
      ...sanitizeHistory(messages),
      { role: "user", content: trimmed },
    ];

    // Decide whether to enable agentic (file-tool) mode for this request.
    // Edit-y verbs ("debug", "fix", "refactor"…) qualify when the user has
    // context to act on — an active editor tab OR an open workspace folder.
    const activeEditorAtSend = activeEditorRef.current;
    const looksLikeEditTask =
      /\b(fix|edit|refactor|improve|clean up|optimi[sz]e|document|comment|extend|complete|implement|rewrite|convert|debug|add)\b/i.test(
        trimmed
      ) && (activeEditorAtSend !== null || workspaceRoot !== null);
    const agentic = looksLikeFileRequest(trimmed) || looksLikeEditTask;

    // Build the agent's environment suffix: a one-shot workspace view so it
    // starts oriented, plus any MCP tools exposed by enabled servers.
    let promptSuffix = "";
    if (agentic && workspaceRoot) {
      try {
        const entries = await invoke<FsEntry[]>("fs_list_dir", { path: workspaceRoot });
        // Cap the listing — dumping hundreds of entries (e.g. a Downloads
        // folder) drowns small models and sends them narrating random files
        // instead of doing the task.
        const names = entries.map((e) => (e.is_dir ? `${e.name}/` : e.name));
        const shown = names.slice(0, 25);
        const more = names.length - shown.length;
        const listing =
          shown.join(", ") +
          (more > 0 ? ` … (+${more} more — use list_dir/search_files rather than guessing)` : "");
        promptSuffix += `Workspace root: ${workspaceRoot}\nTop-level entries (${names.length} total): ${listing}`;
      } catch {
        /* ignore — the agent can list it itself */
      }
    }

  
    let userFileNote = "";
    if (agentic) {
      const rel = (p: string): string =>
        workspaceRoot && p.startsWith(workspaceRoot)
          ? p.slice(workspaceRoot.length).replace(/^[\\/]+/, "")
          : p;
      const openTabs = editorTabsRef.current;
      if (openTabs.length > 0) {
        promptSuffix += `\n\nOpen editor tabs: ${openTabs.map((t) => rel(t.path)).join(", ")}`;
        const activeTab = openTabs.find((t) => t.path === activeEditorAtSend) ?? null;
        if (activeTab) {
          const dirOf = (p: string): string => {
            const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
            return i > 0 ? p.slice(0, i) : p;
          };
          promptSuffix += `\nThe ACTIVE file the user is viewing: ${rel(activeTab.path)} (folder: ${dirOf(activeTab.path)}). Treat references to "this file" or "the current file" as this one. All relative paths resolve against this folder. Work ONLY on this file — do NOT browse, describe, or summarize other files/folders unless explicitly asked.`;
          const MAX_INLINE = 8000;
          const bodyText =
            activeTab.content.length <= MAX_INLINE
              ? activeTab.content
              : `${activeTab.content.slice(0, MAX_INLINE)}\n...[truncated - call read_active_file or read_file for more]`;
          promptSuffix += `\n\nCurrent contents of ${rel(activeTab.path)}:\n${bodyText}\n(end of ${rel(activeTab.path)})`;
          userFileNote = `(Working file: ${rel(activeTab.path)} — its complete source is already in your system context above. Start analyzing it immediately; do not ask for it.)`;
        }
      } else if (workspaceRoot) {
        promptSuffix += `\n\nNo files are currently open in the editor. If the task is ambiguous, use list_dir or search_files to locate the right file before reading.`;
      }
    }

    // The annotated user message is what small models actually attend to.
    if (userFileNote) {
      const lastMsg = agentHistory[agentHistory.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        lastMsg.content = `${lastMsg.content}\n\n${userFileNote}`;
      }
    }

    const mcpTools = new Map<string, { server: McpServerConfig; tool: string }>();
    if (agentic) {
      const servers = loadMcpServers().filter((s) => s.enabled);
      if (servers.length > 0) {
        await Promise.all(
          servers.map(async (s) => {
            try {
              const tools = await listMcpTools(s);
              for (const t of tools) {
                mcpTools.set(`mcp_${s.name}_${t.name}`, { server: s, tool: t.name });
              }
            } catch {
              /* server offline — skip silently */
            }
          })
        );
      }
      if (mcpTools.size > 0) {
        promptSuffix += `

MCP tools available (call via {"name": "<full name>", "arguments": {...}}):
${[...mcpTools.keys()].map((k) => `- ${k}`).join(NL)}`;
      }
    }

    setIsLoading(true);
    streamedContentRef.current = "";

    const abortCtrl = new AbortController();
    streamControllerRef.current = abortCtrl;

    try {
      let ranTools = 0;
      let toolRounds = 0;
      let sawRawOutput = false;
      // Anti-haywire state: prose-nudges issued, and consecutive rounds whose
      // calls all failed with identical signatures.
      let nudgeCount = 0;
      let failStreak = 0;
      let lastFailSig = "";

      while (!abortCtrl.signal.aborted) {
        const round = await streamRound(agentHistory, agentic, abortCtrl.signal, promptSuffix);
        if (abortCtrl.signal.aborted) break;
        toolRounds++;
        const raw = round.text;
        if (raw.trim().length > 0 || round.nativeCalls.length > 0) sawRawOutput = true;

        
        agentHistory.push({
          role: "assistant",
          content: raw,
          ...(round.nativeCalls.length > 0
            ? {
                toolCalls: round.nativeCalls.map((c, i) => ({
                  id: c.id ?? `call_${toolRounds}_${i}`,
                  name: c.name,
                  arguments: c.arguments,
                })),
              }
            : {}),
        });
       
        const calls: { call: ToolCall; native: boolean; key: string }[] = [];
        const seenKeys = new Set<string>();
        for (const { call, native } of [
          ...round.nativeCalls.map((c) => ({ call: c, native: true })),
          ...parseToolCalls(raw).map((c) => ({ call: c, native: false })),
        ]) {
          if (!isToolName(call.name) && !call.name.startsWith("mcp_")) continue;
          const key = `${call.name}:${JSON.stringify(call.arguments)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          calls.push({ call, native, key });
        }

        // If the model produced no tool calls, we're done.
        if (calls.length === 0 || toolRounds >= MAX_TOOL_ROUNDS) {
          // Recovery: weak local models often DESCRIBE tool calls in prose
          // ("Here is the JSON function call that would...") without actually
          // emitting one. Nudge them to emit a real block instead of ending.
          if (
            calls.length === 0 &&
            toolRounds < MAX_TOOL_ROUNDS &&
            nudgeCount < 2 &&
            /(\b(function call|tool call|tool_call|read_file|list_dir|search_files)\b|<[a-z_]+\s*\/?>|\b\w+_\w+\(\)|\bcall\s+(read|list|get|search)_)/i.test(raw)
          ) {
            nudgeCount++;
            agentHistory.push({
              role: "user",
              content:
                'You described a tool call but did not actually emit one — descriptions do nothing. Reply with EXACTLY ONE real tool-call block as your entire message:\n<tool_call>\n{"name": "list_dir", "arguments": {"path": "."}}\n</tool_call>\nNo prose, no code fences, no examples.',
            });
            continue;
          }
          if (toolRounds >= MAX_TOOL_ROUNDS && calls.length > 0) {
            setError("Reached the maximum number of agentic tool turns. Stopping.");
          }
          break;
        }

        
        const activityIds = new Map<string, string>();
        const planned: AgenticActivityType[] = calls.map(({ call }) => {
          const id = activityId();
          activityIds.set(`${call.name}:${JSON.stringify(call.arguments)}`, id);
          return { id, tool: call.name, args: call.arguments, status: "pending" };
        });
        setActivities((prev) => [...prev, ...planned]);

        const patchActivity = (id: string, patch: Partial<AgenticActivityType>) =>
          setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

        const resultsByKey = new Map<string, { ok: boolean; output: string }>();

        
        const effRoot =
          workspaceRoot ??
          (() => {
            const a = activeEditorRef.current;
            if (!a) return null;
            const i = Math.max(a.lastIndexOf("\\"), a.lastIndexOf("/"));
            return i > 0 ? a.slice(0, i) : null;
          })();

        /** Execute one call — built-in filesystem/command tools or MCP tools. */
        const runToolCall = async (call: ToolCall) => {
          if (call.name.startsWith("mcp_")) {
            const entry = mcpTools.get(call.name);
            if (!entry) return { ok: false, output: `Unknown MCP tool: ${call.name}` };
            return callMcpTool(entry.server, entry.tool, call.arguments);
          }
          return executeTool(call.name, call.arguments, effRoot, {
            openPaths: editorTabsRef.current.map((t) => t.path),
            activePath: activeEditorRef.current,
            getTabContent: (p) =>
              editorTabsRef.current.find((t) => t.path === p)?.content ?? null,
          });
        };

        // --- Read-only batch (parallel). MCP tools always need approval. ---
        const readOnly = calls.filter(
          ({ call }) => !isDestructive(call.name) && !call.name.startsWith("mcp_")
        );
        if (readOnly.length > 0) {
          readOnly.forEach(({ key }) => {
            const id = activityIds.get(key);
            if (id) patchActivity(id, { status: "running" });
          });
          await Promise.all(
            readOnly.map(async ({ call, key }) => {
              const result = await runToolCall(call);
              resultsByKey.set(key, result);
              ranTools++;
              const id = activityIds.get(key);
              if (id) {
                patchActivity(
                  id,
                  result.ok
                    ? { status: "done", output: result.output }
                    : { status: "error", error: result.output }
                );
              }
            })
          );
        }

        // --- Mutating batch (sequential, each behind user approval). ---
        const mutating = calls.filter(
          ({ call }) => isDestructive(call.name) || call.name.startsWith("mcp_")
        );
        /** Tools whose result can be shown as a line diff in the activity feed. */
        const FILE_MUTATORS = new Set(["write_file", "append_file", "replace_in_file"]);
        for (const { call, key } of mutating) {
          const id = activityIds.get(key);
          if (!id) continue;

          // Snapshot the file before the change so we can render a diff.
          let beforeContent: string | null = null;
          let targetPath = "";
          if (
            FILE_MUTATORS.has(call.name) &&
            typeof call.arguments.path === "string"
          ) {
            targetPath = call.arguments.path;
            try {
              beforeContent = await invoke<string>("fs_read_file", {
                path: resolveFsPath(targetPath, effRoot),
              });
            } catch {
              beforeContent = null; // new file
            }
          }

          let approved = settings.autoApproveTools === true;
          if (!approved) {
            setPendingApproval({ id, tool: call.name, args: call.arguments, status: "pending" });
            approved = await requestApproval(id);
            setPendingApproval(null);
          }
          if (!approved) {
            patchActivity(id, { status: "denied" });
            resultsByKey.set(key, {
              ok: false,
              output:
                "User denied approval for this operation. Do not retry it; explain and propose alternatives.",
            });
            continue;
          }

          patchActivity(id, { status: "running" });
          const result = await runToolCall(call);
          resultsByKey.set(key, result);
          if (result.ok) ranTools++;
          patchActivity(
            id,
            result.ok
              ? { status: "done", output: result.output.slice(0, 4000) }
              : { status: "error", error: result.output.slice(0, 2000) }
          );
          // Reflect filesystem mutations in the editor immediately, show a
          // line-by-line diff in the activity feed, and open the changed file.
          if (result.ok) {
            syncAllOpenTabsRef.current();
            if (FILE_MUTATORS.has(call.name) && targetPath) {
              const absPath = resolveFsPath(targetPath, effRoot);
              let afterContent = "";
              try {
                afterContent = await invoke<string>("fs_read_file", { path: absPath });
              } catch {
                afterContent = "";
              }
              patchActivity(id, { diff: computeLineDiff(beforeContent ?? "", afterContent) });
              void openFileInEditor(absPath);
            }
          }
        }
        if (mutating.length > 0) setExplorerRefreshKey((k) => k + 1);

        // Runaway guard: if every call in a round failed and the failing
        // signatures match the previous round's, we're looping — stop early.
        const failSig = calls
          .filter(({ key }) => resultsByKey.get(key)?.ok === false)
          .map(({ call }) => `${call.name}:${JSON.stringify(call.arguments)}`)
          .sort()
          .join("|");
        if (failSig && failSig === lastFailSig) {
          failStreak++;
          if (failStreak >= 3) {
            setError(
              "The same tool calls kept failing identically — stopping to avoid an endless loop. Try rephrasing the task or checking that the files exist."
            );
            break;
          }
        } else {
          lastFailSig = failSig;
          failStreak = failSig ? 1 : 0;
        }

        // Route results back in the original call order.
        const nativeResults: Message[] = [];
        const resultBlocks: string[] = [];
        for (const { call, native, key } of calls) {
          const result = resultsByKey.get(key);
          if (!result) continue;
          // Truncate large outputs before they enter the model's context.
          const output = truncateToolOutput(result.output);
          if (native) {
            nativeResults.push({
              role: "tool",
              content: output,
              toolCallId: call.id,
              toolName: call.name,
            });
          } else {
            resultBlocks.push(formatToolResult({ ...result, output }));
          }
        }

        // Send the tool results back to the model and loop.
        if (nativeResults.length > 0) {
          agentHistory.push(...nativeResults);
        }
        if (resultBlocks.length > 0) {
          agentHistory.push({ role: "user", content: resultBlocks.join(NL + NL) });
        }
      }

      // Commit whatever visible text accumulated across all rounds.
      const finalVisible = streamedContentRef.current.trim();
      if (finalVisible) {
        setLastAssistantContent(finalVisible);
      } else if (ranTools > 0) {
        // Tools ran but the model never narrated — show a concise summary
        // instead of a misleading "empty response" error.
        setLastAssistantContent(
          `Done — ${ranTools} file operation${ranTools === 1 ? "" : "s"} completed.`
        );
      } else if (sawRawOutput) {
        // The model said something, but it was all tool markup we could not
        // map to a known tool. Surface that instead of a generic error.
        setError(
          "The model responded, but its tool calls could not be recognized. Try a different model, or rephrase so it answers in plain text."
        );
        removeEmptyAssistant();
      } else {
        setError(
          "The model returned an empty response. Check the model name and endpoint in Settings (Ctrl+B)."
        );
        removeEmptyAssistant();
      }
    } catch (err) {
      if (abortCtrl.signal.aborted) {
        // User stopped the generation; keep partial output.
        const partial = stripToolCalls(streamedContentRef.current).trim();
        if (partial) {
          setLastAssistantContent(partial);
        } else {
          removeEmptyAssistant();
        }
      } else {
        const msg = err instanceof Error ? err.message : "Failed to reach the AI provider.";
        setError(msg);
        removeEmptyAssistant();
      }
    } finally {
      setIsLoading(false);
      streamControllerRef.current = null;
      approvalRef.current?.resolve(false);
      approvalRef.current = null;
      setPendingApproval(null);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)] text-[#ececec] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <TopMenu
          onOpenInfoPanel={() => setInfoPanelOpen(true)}
          onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
          onOpenTab2={() => setTab2Open(true)}
          onOpenAiSettings={() => {
            setSettingsSection("ai");
            setSettingsOpen(true);
          }}
          onOpenChatHistory={() => setHistorySidebarOpen(true)}
          onOpenIde={() => setIdeOpen(true)}
          onOpenIdeWindow={() => void launchIdeWindow()}
          onOpenTerminal={() => setOpenTerminal(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          right={
            <>
              {/* Provider / model pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelOpen((v) => !v)}
                  title="Switch AI provider"
                  className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-[3px] text-[11px] text-[#a3a3a3] transition-colors hover:border-white/[0.14] hover:text-[#ececec]"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      settings.apiKey || !spec.needsAuth ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="max-w-[160px] truncate">{settings.model || spec.label}</span>
                  {!settings.apiKey && spec.needsAuth && (
                    <span className="text-[#6b6b6b]">(not configured)</span>
                  )}
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {modelOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-white/[0.09] bg-[var(--bg-elevated)] p-1 shadow-[0_10px_32px_rgba(0,0,0,0.5)]">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[#6b6b6b]">
                      AI Provider
                    </div>
                    {PROVIDER_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-[6px] text-left text-[12px] transition-colors hover:bg-white/[0.06] ${
                          settings.provider === p.id ? "text-[#ececec]" : "text-[#a3a3a3]"
                        }`}
                        onClick={() => {
                          const next = providerById(p.id);
                          const updated = {
                            ...settings,
                            provider: p.id,
                            baseUrl: next.defaultBaseUrl,
                            model: next.defaultModel,
                          };
                          setSettings(updated);
                          void saveSettings(updated);
                          // Persist to the active session too.
                          if (activeSessionId) {
                            setSessions((prev) =>
                              prev.map((s) =>
                                s.id === activeSessionId ? { ...s, settings: updated } : s
                              )
                            );
                          }
                          setModelOpen(false);
                        }}
                      >
                        <span>{p.label}</span>
                        {settings.provider === p.id && (
                          <span className="text-[10px] text-emerald-400">●</span>
                        )}
                      </button>
                    ))}

                    {/* Model overview */}
                    <div className="mt-1 border-t border-white/[0.07] px-2 pb-1 pt-2">
                      <div className="flex items-center justify-between text-[10px] text-[#6b6b6b]">
                        <span>Context window</span>
                        <span className="tabular-nums">
                          ~{formatTokens(estTokens)} / {formatTokens(ctxLimit)} tok
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className={`h-full rounded-full transition-all ${
                            ctxPct > 85 ? "bg-red-400" : ctxPct > 60 ? "bg-amber-400" : "bg-(--accent)"
                          }`}
                          style={{ width: `${Math.max(2, ctxPct)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#555555]">
                        <span>
                          {messages.length} message{messages.length === 1 ? "" : "s"}
                        </span>
                        <span>{spec.label}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* New chat */}
              <button
                type="button"
                onClick={newChat}
                title="New chat"
                aria-label="New chat"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
            </>
          }
        />
        <InfoPanel isOpen={infoPanelOpen} onClose={() => setInfoPanelOpen(false)} />
        <PrivacyPolicy isOpen={privacyPolicyOpen} onClose={() => setPrivacyPolicyOpen(false)} />
        <Tab2 isOpen={Tab2Open} onClose={() => setTab2Open(false)} />
        <SettingsPanel
          open={settingsOpen}
          settings={uiSettings}
          onChange={updateUiSettings}
          aiSettings={settings}
          onAiChange={handleSaveSettings}
          onSelectLocalModel={handleSelectLocalModel}
          initialSection={settingsSection}
          onClose={() => setSettingsOpen(false)}
          onExtensionsChanged={() => setExtensionTick((t) => t + 1)}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Activity bar — VS Code-style icon rail */}
          <nav className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-white/[0.07] bg-[var(--bg-panel)] py-1">
            <div className="relative flex w-full flex-col items-center gap-1">
              <RailButton active={ideOpen} title="Open editor / workspace (Ctrl+Shift+E)" onClick={() => setRailMenuOpen((v) => !v)}>
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.75H13A1.5 1.5 0 0114.5 6.25V12A1.5 1.5 0 0112.5 13.5h-9A1.5 1.5 0 011.5 12V4.5z" />
                  <path d="M1.5 7h13" opacity="0.5" />
                </svg>
              </RailButton>
              {/* Popup for the native file dialog: pick a workspace folder or loose files. */}
              {railMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setRailMenuOpen(false)} />
                  <div className="absolute left-full top-0 z-50 ml-1 w-44 overflow-hidden rounded-lg border border-white/[0.08] bg-[var(--bg-elevated)] py-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setRailMenuOpen(false);
                        void pickWorkspaceFolder();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.75H13A1.5 1.5 0 0114.5 6.25V12A1.5 1.5 0 0112.5 13.5h-9A1.5 1.5 0 011.5 12V4.5z" />
                      </svg>
                      Open Folder…
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRailMenuOpen(false);
                        void pickWorkspaceFiles();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#d4d4d4] transition hover:bg-white/[0.06]"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 1.75h5L12.5 5v8.75a1 1 0 01-1 1h-7.5a1 1 0 01-1-1V2.75a1 1 0 011-1z" />
                        <path d="M9 1.75V5h3.5" opacity="0.6" />
                      </svg>
                      Open Files…
                    </button>
                  </div>
                </>
              )}
              <RailButton active={gitPanelOpen} title="Git tools (Ctrl+Shift+G)" onClick={() => setGitPanelOpen((v) => !v)}>
                <IoGitCommit size={15}/>
              </RailButton>

            </div>
            <div className="w-full">
              <RailButton active={onOpenTerminal} title="Terminal (Ctrl+`)" onClick={() => setOpenTerminal((v) => !v)}>
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" />
                  <path d="M4.5 6l2 1.7-2 1.7M8 9.8h3.5" />
                </svg>
              </RailButton>
              <RailButton active={settingsOpen} title="Settings (Ctrl+,)" onClick={() => setSettingsOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="2.1" />
                  <path d="M8 1.6l.7 1.7a4.9 4.9 0 011.7.7l1.8-.6 1.2 2-1.1 1.5a4.9 4.9 0 010 1.9l1.1 1.5-1.2 2-1.8-.6a4.9 4.9 0 01-1.7.7L8 14.4l-.7-1.7a4.9 4.9 0 01-1.7-.7l-1.8.6-1.2-2 1.1-1.5a4.9 4.9 0 010-1.9L2.6 5.7l1.2-2 1.8.6a4.9 4.9 0 011.7-.7z" />
                </svg>
              </RailButton>
            </div>
          </nav>
          {/* Source-control panel (git status / commit / pull / push). */}
          {gitPanelOpen && workspaceRoot && (
            <GitPanel
              root={workspaceRoot}
              onClose={() => setGitPanelOpen(false)}
              onOpenFile={(p) =>
                void openFileInEditor(
                  `${workspaceRoot.replace(/[\\/]+$/, "")}/${p}`
                )
              }
            />
          )}
          {gitPanelOpen && !workspaceRoot && (
            <aside className="flex h-full w-64 shrink-0 flex-col items-center justify-center gap-3 border-r border-white/[0.07] bg-[var(--bg-panel)] px-4 text-center">
              <p className="text-[12px] font-medium text-[#d4d4d4]">No workspace open</p>
              <p className="text-[11px] leading-5 text-[#6b6b6b]">
                Open a folder to use git tools.
              </p>
              <button
                type="button"
                onClick={() => void pickWorkspaceFolder()}
                className="rounded-md bg-[#ececec] px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-white"
              >
                Open Folder
              </button>
            </aside>
          )}
          <ChatHistorySidebar
            isOpen={historySidebarOpen}
            onClose={() => setHistorySidebarOpen(false)}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={selectSession}
            onNewChat={newChat}
            onDeleteSession={deleteSession}
          />
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
            <div className="fade-top" aria-hidden />
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {messages.length === 0 ? (
                <div className="relative flex min-h-full items-center justify-center px-6">
                  {/* Soft radial glow behind the hero */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-[36rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
                    style={{ background: "radial-gradient(closest-side, var(--accent), transparent)" }}
                  />
                  <div className="msg-in relative w-full max-w-2xl pb-24 text-center">
                    <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.03]">
                      <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#ececec" strokeWidth="1.1" strokeLinejoin="round">
                        <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z" />
                        <path d="M8 1v7m0 0l6-3.5M8 8L2 4.5" opacity="0.5" />
                      </svg>
                    </div>
                    <h1 className="text-[28px] font-semibold tracking-tight text-[#ececec]">
                      Welcome
                    </h1>
                    {/* <p className="mx-auto mt-3 max-w-md text-[13px] leading-6 text-[#6b6b6b]">
                      Ask questions, explore ideas, or work through code — Neo can read and edit files in your workspace.
                    </p> */}

                    {/* Action cards */}
                    <div className="mx-auto mt-8 grid max-w-lg grid-cols-1 gap-2 text-left sm:grid-cols-2">
                      {/* <button
                        type="button"
                        onClick={() => {
                          setIdeOpen(true);
                          void pickWorkspaceFolder();
                        }}
                        className="group flex items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 transition hover:border-white/[0.18] hover:bg-white/[0.05]"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition group-hover:text-[#ececec]">
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
                            <path d="M1.75 13V3.75A.75.75 0 012.5 3h3l1.5 1.75h6a.75.75 0 01.75.75V13a.75.75 0 01-.75.75h-10.5A.75.75 0 011.75 13z" />
                          </svg>
                        </span>
                        <span>
                          <span className="block text-[12.5px] font-medium text-[#d4d4d4]">Open a project</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-zinc-600">Browse and edit files in a real workspace</span>
                        </span>
                      </button>
                      {[
                        {
                          label: "Summarize my project",
                          desc: "A quick overview of what's here",
                          prompt: "Summarize my project",
                        },
                        {
                          label: "Find and fix bugs",
                          desc: "Scan for issues and apply fixes",
                          prompt: "Find and fix bugs",
                        },
                        {
                          label: "Write a new feature",
                          desc: "Describe it and Neo builds it",
                          prompt: "Write a new feature",
                        },
                      ].map((card) => (
                        <button
                          key={card.label}
                          type="button"
                          onClick={() => setMessage(card.prompt)}
                          className="group flex items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 transition hover:border-white/[0.18] hover:bg-white/[0.05]"
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition group-hover:text-[#ececec]">
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 6l-5 6 5 6M16 6l5 6-5 6" transform="translate(0 -1.4) scale(0.95)" />
                            </svg>
                          </span>
                          <span>
                            <span className="block text-[12.5px] font-medium text-[#d4d4d4]">{card.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-zinc-600">{card.desc}</span>
                          </span>
                        </button>
                      ))} */}
                    </div>

                    {/* Shortcut hints */}
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10.5px] text-zinc-600">
                      <span className="flex items-center gap-1.5"><span className="kbd">Ctrl+Shift+P</span> commands</span>
                      <span className="flex items-center gap-1.5"><span className="kbd">Ctrl+Shift+E</span> editor</span>
                      <span className="flex items-center gap-1.5"><span className="kbd">Ctrl+,</span> settings</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-3xl px-6 py-8">
                  <div className="space-y-7">
                    {messages.map((msg, index) => (
                      <div key={index} className="msg-in">
                        {msg.role === "user" ? (
                          <div className="flex justify-end">
                            <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-(--accent)/25 bg-(--accent)/[0.08] px-3.5 py-2.5 text-[13px] leading-6 text-[#ececec]">
                              {msg.content}
                            </div>
                          </div>
                        ) : isLoading &&
                          index === messages.length - 1 &&
                          msg.content.trim().length === 0 ? (
                          <div className="flex items-center gap-1.5 py-2">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-[#6b6b6b] [animation-delay:0ms]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-[#6b6b6b] [animation-delay:150ms]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-[#6b6b6b] [animation-delay:300ms]" />
                          </div>
                        ) : (
                          <div className="group/msg min-w-0">
                            <div className="mb-1.5 flex items-center gap-1.5">
                              <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03]">
                                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#ececec" strokeWidth="1.4" strokeLinejoin="round">
                                  <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z" />
                                </svg>
                              </span>
                              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                                Neo
                              </span>
                            </div>
                            <div className="text-[13.5px] leading-7 text-[#d4d4d4]">
                              <Markdown content={msg.content} />
                              {isLoading && index === messages.length - 1 && (
                                <span className="stream-caret" aria-hidden />
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                              <MessageAction
                                label="Copy"
                                onClick={() => void navigator.clipboard.writeText(msg.content)}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" />
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                              </MessageAction>
                              <MessageAction label="Good response" onClick={() => sendFeedback("good")}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                                </svg>
                              </MessageAction>
                              <MessageAction label="Bad response" onClick={() => sendFeedback("bad")}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
                                </svg>
                              </MessageAction>
                              <MessageAction label="Report an issue" onClick={() => sendFeedback("report")}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M12 16v-4M12 8h.01" />
                                </svg>
                              </MessageAction>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <AgenticActivity
              items={activities}
              pending={pendingApproval}
              onApprove={handleApproveTool}
              onDeny={handleDenyTool}
            />
            {error && (
              <div className="relative z-20 mx-auto w-full max-w-3xl px-5 pt-2">
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3.5 py-2 text-[12.5px] leading-5 text-red-300">
                  {error}
                </div>
              </div>
            )}
            <div className="relative z-20 shrink-0 px-5 pb-3 pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="mx-auto w-full max-w-3xl"
              >
                {activeEditorPath ? (
                  <div className="mb-1.5 flex items-center gap-1.5 px-1">
                    <span
                      title={`The agent will receive this file's contents automatically`}
                      className="inline-flex items-center gap-1 rounded-full border border-(--accent)/30 bg-(--accent)/10 px-2 py-0.5 text-[10.5px] font-medium text-[#8ab4ff]"
                    >
                      <span className="h-1 w-1 rounded-full bg-(--accent)" />
                      Attached: {activeEditorPath.split(/[\\/]/).pop()}
                    </span>
                  </div>
                ) : (
                  <div className="mb-1.5 flex items-center gap-1.5 px-1">
                    <span className="text-[10.5px] text-[#6b6b6b]">
                      No file attached — open one in the editor and it will be sent to the agent automatically
                    </span>
                  </div>
                )}
                <div className="relative overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--bg-elevated)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-200 focus-within:border-(--accent)/40 focus-within:shadow-[0_0_0_3px_var(--accent-soft),0_8px_32px_rgba(0,0,0,0.4)]">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    disabled={isLoading}
                    placeholder={
                      settings.apiKey || !spec.needsAuth
                        ? "Send a message…"
                        : "Configure your API key in Settings to start chatting"
                    }
                    rows={1}
                    spellCheck={false}
                    className="max-h-48 min-h-[54px] w-full resize-none bg-transparent px-3.5 pb-11 pt-3 pr-12 text-[13px] leading-6 text-[#ececec] outline-none placeholder:text-[#555555] disabled:opacity-60"
                  />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIdeOpen(true)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#ececec]"
                      title="Open editor panel"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <path d="M8 3v10M3 8h10" />
                      </svg>
                    </button>
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={stopChat}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.08] text-[#ececec] transition hover:bg-white/[0.14]"
                        title="Stop streaming"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!message.trim() || isLoading}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-(--accent) text-white shadow-[0_1px_6px_var(--accent-soft)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-[#555555] disabled:shadow-none"
                        title="Send message"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 19V5M5 12l7-7 7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 text-center text-[10px] text-[#4a4a4a]">
                  AI can make mistakes. Verify important information.
                </div>
              </form>
            </div>
          </main>
          {/* Integrated IDE panel: file explorer + code editor beside the chat */}
          {ideOpen && (
            <>
            {/* Drag handle: grab this edge to resize the IDE panel horizontally */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize — double-click to maximize / restore"
              onPointerDown={onIdeResizeStart}
              onPointerMove={onIdeResizeMove}
              onPointerUp={onIdeResizeEnd}
              onPointerCancel={onIdeResizeEnd}
              onDoubleClick={toggleIdeMaximize}
              className="group w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-(--accent)/40 select-none touch-none"
            />
            <section
              style={{ width: `${ideWidth}px` }}
              className="flex min-w-0 shrink-0 flex-col border-l border-white/[0.07] bg-[var(--bg-panel)]"
            >
              <div className="flex h-[35px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[var(--bg-elevated)] px-2">
                {/* VS Code-style menu bar: File / View dropdowns */}
                <IdeMenuBar
                  hasWorkspace={!!workspaceRoot}
                  terminalOpen={onOpenTerminal}
                  canSave={(editorTabs.find((t) => t.path === activeEditorPath)?.dirty ?? false)}
                  onSaveFile={() => {
                    if (activeEditorPath) void saveEditorFile(activeEditorPath);
                  }}
                  onOpenFolder={() => void pickWorkspaceFolder()}
                  onOpenFiles={() => void pickWorkspaceFiles()}
                  onCloseAllTabs={closeAllEditorTabs}
                  onToggleTerminal={() => setOpenTerminal((v) => !v)}
                  onClosePanel={() => setIdeOpen(false)}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
                <div className="flex shrink-0 items-center gap-1.5">
                  {workspaceRoot && (
                    <span
                      className="max-w-[220px] truncate rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-[#8b8b8b]"
                      title={workspaceRoot}
                    >
                      {workspaceRoot.split(/[\\/]/).filter(Boolean).pop()}
                    </span>
                  )}
                  <button
                    onClick={() => setIdeOpen(false)}
                    aria-label="Close editor panel"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              </div>
              {workspaceRoot || editorTabs.length > 0 ? (
                <div className="flex min-h-0 flex-1">
                  {workspaceRoot && !explorerCollapsed && (
                    <FileExplorer
                      key={workspaceRoot}
                      root={workspaceRoot}
                      activePath={activeEditorPath}
                      refreshKey={explorerRefreshKey}
                      onOpenFile={(p) => void openFileInEditor(p)}
                      onCollapse={() => setExplorerCollapsed(true)}
                    />
                  )}
                  {/* Slim strip to bring the explorer back after collapsing. */}
                  {workspaceRoot && explorerCollapsed && (
                    <div className="flex w-7 shrink-0 flex-col items-center justify-start border-r border-white/[0.07] bg-[var(--bg-panel)] py-2">
                      <button
                        type="button"
                        onClick={() => setExplorerCollapsed(false)}
                        title="Show explorer"
                        aria-label="Show explorer"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
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
                    prefs={uiSettings}
                    emptyState={{
                      hasWorkspace: !!workspaceRoot,
                      onOpenFolder: () => void pickWorkspaceFolder(),
                      onOpenFiles: () => void pickWorkspaceFiles(),
                      onCreateFile: (name) => void createFileInWorkspace(name),
                      recentFiles,
                      onOpenRecent: (p) => void openFileInEditor(p),
                    }}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
                  <div className="msg-in flex w-full max-w-[240px] flex-col items-center text-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] text-zinc-500">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.75H13A1.5 1.5 0 0114.5 6.25V12A1.5 1.5 0 0112.5 13.5h-9A1.5 1.5 0 011.5 12V4.5z" />
                      </svg>
                    </div>
                    <p className="mt-4 text-[13px] font-medium text-[#d4d4d4]">No folder open</p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                      Open a folder to browse and edit files.
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void pickWorkspaceFiles()}
                        className="rounded-md border border-white/[0.1] px-3 py-1.5 text-[11.5px] text-[#d4d4d4] transition hover:bg-white/[0.05]"
                      >
                        Open File
                      </button>
                      <button
                        type="button"
                        onClick={() => void pickWorkspaceFolder()}
                        className="rounded-md bg-(--accent) px-3 py-1.5 text-[11.5px] font-medium text-white transition hover:brightness-110"
                      >
                        Open Folder
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
            </>
          )}
        </div>
        {/* VS Code-style bottom dock: Terminal / Problems / Debug / Output / Ports */}
        <BottomPanel
          open={onOpenTerminal}
          tab={panelTab}
          onTab={setPanelTab}
          onClose={() => setOpenTerminal(false)}
          root={workspaceRoot}
          onOpenFile={(p, line) => void openFileInEditor(p, line)}
          terminalPrefs={{
            fontSize: uiSettings.terminalFontSize,
            scrollback: uiSettings.terminalScrollback,
            cursorBlink: uiSettings.terminalCursorBlink,
          }}
          preview={
            markdownPreviewEnabled
              ? {
                  path: activeEditorPath,
                  content:
                    editorTabs.find((t) => t.path === activeEditorPath)?.content ?? "",
                }
              : null
          }
        />
        <StatusBar
          historySidebarOpen={historySidebarOpen}
          onToggleHistorySidebar={() => setHistorySidebarOpen((v) => !v)}
          terminalOpen={onOpenTerminal}
          onToggleTerminal={() => setOpenTerminal((v) => !v)}
          workspaceName={workspaceRoot?.split(/[\\/]/).filter(Boolean).pop() ?? null}
          editorStats={
            statusExtensionsOn
              ? (() => {
                  const c =
                    editorTabs.find((t) => t.path === activeEditorPath)?.content ?? "";
                  return {
                    words: (c.match(/\S+/g) ?? []).length,
                    chars: c.length,
                    lines: c ? c.split("\n").length : 1,
                    todos: (c.match(/\b(TODO|FIXME|HACK|XXX)\b/g) ?? []).length,
                    showWords: wordCountEnabled,
                    showTodos: todoEnabled,
                  };
                })()
              : null
          }
        />
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={[
            {
              id: "open-ai-settings",
              label: "Open AI Settings",
              category: "Settings",
              shortcut: "Ctrl+B",
              action: () => {
                setSettingsSection("ai");
                setSettingsOpen(true);
              },
            },
            {
              id: "toggle-history",
              label: "Toggle Chat History",
              category: "View",
              shortcut: "Ctrl+Shift+H",
              action: () => setHistorySidebarOpen((v) => !v),
            },
            {
              id: "open-information",
              label: "About & Contact",
              category: "Help",
              action: () => setInfoPanelOpen(true),
            },
            {
              id: "open-privacy",
              label: "Privacy Policy",
              category: "Help",
              action: () => setPrivacyPolicyOpen(true),
            },
            {
              id: "new-chat",
              label: "New Chat",
              category: "Chat",
              action: newChat,
            },
            {
              id: "stop-stream",
              label: "Stop Streaming",
              category: "Chat",
              shortcut: "Esc",
              action: isLoading ? stopChat : () => {},
            },
            {
              id: "open-terminal",
              label: "Toggle Terminal",
              category: "View",
              shortcut: "Ctrl+`",
              action: () => setOpenTerminal((v) => !v),
            },
            {
              id: "toggle-ide",
              label: "Toggle Code Editor",
              category: "View",
              shortcut: "Ctrl+Shift+E",
              action: () => setIdeOpen((v) => !v),
            },
            {
              id: "toggle-git-panel",
              label: "Toggle Git Panel",
              category: "View",
              shortcut: "Ctrl+Shift+G",
              action: () => setGitPanelOpen((v) => !v),
            },
            {
              id: "open-workspace-folder",
              label: "Open Folder…",
              category: "File",
              action: () => void pickWorkspaceFolder(),
            },
            {
              id: "open-files",
              label: "Open Files…",
              category: "File",
              action: () => void pickWorkspaceFiles(),
            },
            {
              id: "open-settings",
              label: "Open Settings",
              category: "Settings",
              shortcut: "Ctrl+,",
              action: () => setSettingsOpen(true),
            },
            ...(isExtensionEnabled("prettier.formatter")
              ? [
                  {
                    id: "format-document",
                    label: "Format Document (Prettier)",
                    category: "Editor",
                    shortcut: "Ctrl+Alt+F",
                    action: () => void formatDocument(activeEditorRef.current),
                  },
                ]
              : []),
          ]}
        />
      </div>
  );
}
