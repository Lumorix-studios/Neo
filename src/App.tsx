
//author of this entire codebase is Madhusudhan thapa (madhusudhant207@gmail.com) and coding agents 
//Licensed under the MIT License. See LICENSE file in the project root for full license information.
//Completely opensource code and free to use and modify. Please give credit to the author if you use this codebase in your project.
//cant guarantee that this codebase is free of bugs or security vulnerabilities. Use at your own risk. The author is not responsible for any damage or loss caused by the use of this codebase.
//also cant assure you this will always stay opensource
//            9/18/26
import { useEffect, useRef, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import StarBorder from "../components/StarBorder";
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
import {
  getCurrentUser,
  getProfile,
  onAuthChanged,
  handleOAuthRedirect,
  type NeoUser,
  type Profile as AccountProfile,
} from "./lib/auth";
import * as cloudSync from "./lib/cloudSync";
import { useDeepLinkAuth } from "./lib/deepLink";
import * as byok from "./lib/byok";
import { isSupabaseConfigured } from "./lib/supabase";
import { isTauri } from "@tauri-apps/api/core";
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
import { getProjectContext } from "./projectIndex";
import type { AgenticActivity as AgenticActivityType } from "./agentic";
import type { FsEntry } from "./agentic";
import {
  loadMcpServers,
  listMcpTools,
  callMcpTool,
  formatMcpToolSchema,
  type McpToolEntry,
} from "./mcp";
import { computeLineDiff } from "./diff";
import { checkRateLimit, estimateTokens, recordUsage } from "./tokenUsage";
import { resolveFsPath } from "./agentic";
import type { EditorTab } from "./components/CodeEditor";
import { ensureOllamaReady } from "./localModels";
/* GitPanel removed — moved to IDE window only */
import BlurText from "../components/BlurText";
import SettingsPanel, { type SectionId } from "./components/SettingsPanel";
import {
  applyUiSettings,
  DEFAULT_UI_SETTINGS,
  getRecentFiles,
  getRecentFolders,
  loadUiSettings,
  pushRecentFile,
  saveUiSettings,
  type UiSettings,
} from "./uiSettings";
import { IoAdd, IoAlertSharp, /*IoBarChartOutline, IoBugOutline*/ IoCheckmark, IoChevronDown, IoCopyOutline, IoFolderOutline, /*IoSparkles*/ IoStop, IoTerminal, IoThumbsDownSharp, IoThumbsUpSharp, IoSend, IoSettings } from "react-icons/io5";
import { shortPath } from "./utils";

type JsonDict = Record<string, unknown>;

/** Newline character (avoids escape-sequence issues in generated code). */
const NL = String.fromCharCode(10);

/* Quick-Action presets removed as requested */


/** Result of one streaming round: visible text + any native tool calls. */
interface StreamRoundResult {
  text: string;
  nativeCalls: ToolCall[];
}

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

const MAX_TOOL_OUTPUT = 24000;


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

const SHARED_WS_KEY = "neo.ide.workspaceRoot";

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
        active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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

/** Small icon used on the welcome-screen action cards. */
// function CardIcon({ name }: { name: string }) {
//   const cls = "shrink-0 opacity-60";
//   const color = "var(--accent)";
//   switch (name) {
//     case "folder":
//       return <IoFolderOutline size={13} className={cls} color={color} />;
//     case "chart":
//       return <IoBarChartOutline size={13} className={cls} color={color} />;
//     case "bug":
//       return <IoBugOutline size={13} className={cls} color={color} />;
//     default:
//       return <IoSparkles size={13} className={cls} color={color} />;
//   }
// }

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

/** Small ghost icon-button used in the assistant message action row.
 *  Shows a transient checkmark after a click instead of any dialog. */
function MessageAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        onClick();
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      title={label}
      aria-label={label}
      className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
        done
          ? "text-emerald-400/80"
          : "text-[var(--text-muted)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
      }`}
    >
      {done ? (
        <IoCheckmark size={13} />
      ) : (
        children
      )}
    </button>
  );
}

export default function App() {
  const [modelOpen, setModelOpen] = useState(false);
  const [onOpenTerminal, setOpenTerminal] = useState(false);
  // Which tab of the bottom dock is visible (terminal/problems/debug/…).
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");
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
  // --- Account (Supabase) state ---
  const [account, setAccount] = useState<NeoUser | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const signedIn = !!account;
  /** updatedAt of the last cloud push per chat id — avoids re-uploading unchanged chats. */
  const cloudPushedAtRef = useRef<Map<string, number>>(new Map());
  const [activities, setActivities] = useState<AgenticActivityType[]>([]);
  const [pendingApproval, setPendingApproval] =
    useState<AgenticActivityType | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Resolver for the pending destructive-tool approval dialog.
  const approvalRef = useRef<{
    id: string;
    resolve: (approved: boolean) => void;
  } | null>(null);
  // Cap the number of tool-executing rounds to avoid runaway loops. Rounds
  // where the model only streams prose (no tool calls) don't count. When the
  // cap is reached mid-task, the run gets a fresh budget (checkpoint) up to
  // MAX_CHECKPOINTS times while it keeps making progress.
  const MAX_TOOL_ROUNDS = 75;
  const MAX_CHECKPOINTS = 2;

  // The active streaming request's abort controller, so we can cancel it.
  const streamControllerRef = useRef<AbortController | null>(null);
  // Mutable hold of the assistant text being streamed in (avoids closures capturing stale state).
  const streamedContentRef = useRef("");
  const mountedRef = useRef(true);
  // Whether the user is scrolled near the bottom (auto-follow).
  const autoScrollRef = useRef(true);
  const launchIdeWindowRef = useRef<() => void>(() => {});
  // Workspace root shared with the IDE window via a persisted localStorage key.
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(() =>
    localStorage.getItem(SHARED_WS_KEY)
  );
  // --- Context menu (top-left): workspace folder list + pinned files ---
  const [contextEntries, setContextEntries] = useState<FsEntry[]>([]);
  const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);

  // Load the workspace folder listing for the Context menu when the root changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!workspaceRoot) {
        setContextEntries([]);
        return;
      }
      try {
        const entries = await invoke<FsEntry[]>("fs_list_dir", { path: workspaceRoot });
        if (cancelled) return;
        const sorted = [...entries].sort((a, b) =>
          a.is_dir !== b.is_dir ? (a.is_dir ? -1 : 1) : a.name.localeCompare(b.name)
        );
        setContextEntries(sorted.slice(0, 60));
      } catch {
        if (!cancelled) setContextEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  /** Toggle a file's pin in the agent's context (Context menu). */
  const togglePinFile = (path: string) => {
    setPinnedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);
  // --- UI settings (Settings tab) ---
  const [uiSettings, setUiSettings] = useState<UiSettings>(DEFAULT_UI_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which section of the settings panel was requested (null = default). */
  const [settingsSection, setSettingsSection] = useState<SectionId | null>(null);
  const [, setRecentFiles] = useState<string[]>([]);
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
        launchIdeWindowRef.current();
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

  // Browser build only. In the desktop app the deep-link hook owns OAuth
  // callbacks (tokens arrive via `agenticcoder://`, never in the webview URL),
  // so this is a fast no-op there; see useDeepLinkAuth() below.
  useEffect(() => {
    if (isTauri()) return;
    if (!isSupabaseConfigured) return;
    void handleOAuthRedirect();
  }, []);

  // VS Code style sign-in: `agenticcoder://auth/callback` lands here, the
  // session is restored, onAuthChanged fires and bootstrapCloud refreshes.
  useDeepLinkAuth();

  // ── Cloud bootstrap ───────────────────────────────────────────────────────
  // Runs once after local restore: if the user is signed in, pull their cloud
  // chats/settings and merge them over the local snapshot (newer updatedAt wins
  // per chat). If the cloud is empty (first sign-in) this device's data seeds
  // the account instead.
  const bootstrapCloud = async () => {
    if (!isSupabaseConfigured) return;
    const user = await getCurrentUser();
    setAccount(user);
    if (!user) {
      setAccountProfile(null);
      return;
    }
    const profile = await getProfile();
    setAccountProfile(profile);
    const snapshot = await cloudSync.loadAll();
    if (snapshot.settings) {
      setSettings((prev) => ({ ...prev, ...snapshot.settings! }));
    }
    if (snapshot.chats.length > 0) {
      setSessions((prev) => {
        const map = new Map(prev.map((s) => [s.id, s]));
        for (const c of snapshot.chats) {
          const local = map.get(c.id);
          if (!local || c.updatedAt > local.updatedAt) map.set(c.id, c);
          // Remember cloud timestamps so the save-effect doesn't re-upload them.
          cloudPushedAtRef.current.set(c.id, Math.max(c.updatedAt, local?.updatedAt ?? 0));
        }
        return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      });
    } else {
      // First sign-in on a fresh account: seed the cloud from this device.
      const [localSessions, localSettings] = await Promise.all([loadSessions(), loadSettings()]);
      if (localSessions.length > 0) {
        void cloudSync.upsertChats(localSessions);
        for (const s of localSessions) cloudPushedAtRef.current.set(s.id, s.updatedAt);
      }
      void cloudSync.upsertSettings(localSettings);
    }
  };

  useEffect(() => {
    if (!restored) return;
    void bootstrapCloud();
    // Live subscription: refresh account state on sign-in/out from any window.
    const off = onAuthChanged((user) => {
      setAccount(user);
      if (!user) {
        setAccountProfile(null);
        byok.clearMemoryKeys();
      } else {
        void bootstrapCloud();
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  /** Re-read account + profile (called after Account-tab edits). */
  const refreshAccount = async () => {
    if (!isSupabaseConfigured) return;
    setAccount(await getCurrentUser());
    setAccountProfile(await getProfile());
  };

  // ── BYOK key injection ─────────────────────────────────────────────────────
  // The API key is never persisted with settings — it is resolved at runtime
  // from the encrypted cloud store (signed in) or the local fallback store.
  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    // A paywalled plan resolves to no key at all (`byokEnabled === false`).
    void byok
      .resolveApiKey(settings.provider, signedIn, accountProfile?.byokEnabled ?? true)
      .then((key) => {
        if (cancelled) return;
        setSettings((prev) => (prev.apiKey === key ? prev : { ...prev, apiKey: key }));
      });
    return () => {
      cancelled = true;
    };
  }, [settings.provider, signedIn, accountProfile?.byokEnabled, restored]);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveSettings(settings);
      // Mirror AI settings to the account (API key excluded — BYOK is separate).
      if (signedIn) void cloudSync.upsertSettings(settings);
    }, 250);
    return () => clearTimeout(t);
  }, [settings, restored, signedIn]);

  // Persist sessions whenever they change.
  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveSessions(sessions);
      // Push only chats that changed since the last cloud push.
      if (signedIn) {
        const changed = sessions.filter(
          (s) => (cloudPushedAtRef.current.get(s.id) ?? 0) < s.updatedAt
        );
        if (changed.length > 0) {
          for (const s of changed) cloudPushedAtRef.current.set(s.id, s.updatedAt);
          void cloudSync.upsertChats(changed);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [sessions, restored, signedIn]);

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

  const handleSelectLocalModel = async (modelName: string): Promise<string | null> => {
    // Make sure an Ollama server is actually up before switching to it. This
    // reuses the app's own server or an external one already on port 11434,
    // or starts a fresh one — instead of silently pointing chat at a server
    // that may have died (the old overlap bug).
    const serverErr = await ensureOllamaReady();

    // Switch to the Ollama provider and set the selected local model.
    const next: AISettings = {
      ...settings,
      provider: "ollama",
      model: modelName,
      baseUrl: "http://localhost:11434",
      apiKey: "",
      // Clear any potentially conflicting system prompts when switching to a local tool-model
    };
    setSettings(next);
    void saveSettings(next);

    // Remember the local model choice for the active session too.
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, settings: next } : s))
      );
    }

    return serverErr;
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
    // Remove it from the account too.
    if (signedIn) void cloudSync.deleteChat(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  useEffect(() => {
    const syncRoot = () => {
      const root = localStorage.getItem(SHARED_WS_KEY);
      if (root) setWorkspaceRoot((prev) => (prev === root ? prev : root));
    };
    syncRoot();
    window.addEventListener("focus", syncRoot);
    window.addEventListener("storage", syncRoot);
    return () => {
      window.removeEventListener("focus", syncRoot);
      window.removeEventListener("storage", syncRoot);
    };
  }, []);

  /** Max simultaneously open editor tabs (LRU-evicted beyond this). */
  const MAX_OPEN_TABS = 10;

  const openFileInEditor = async (path: string, line?: number) => {
    setActiveEditorPath(path);
    try {
      await emit("neo:ide-open-file", { path, line: line ?? null });
    } catch {
      /* IDE window not open / event system unavailable — non-fatal */
    }
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
        title: "IDE",
        width: 1280,
        height: 820,
        minWidth: 720,
        minHeight: 480,
        decorations: false,
      });
      ideWin.once("tauri://error", (e) => {
        setError(`Failed to open IDE window: ${e.payload}`);
      });
    } catch (e) {
      setError(`Failed to open IDE window: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Late-bound so the Ctrl+Shift+E shortcut registered above always calls the
  // current launchIdeWindow closure.
  launchIdeWindowRef.current = launchIdeWindow;

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

    // Token budget guard — pause the run before spending when a configured
    // limit (Settings → Dashboard) would be exceeded by this request.
    const limitErr = checkRateLimit(estimateTokens(JSON.stringify(body)));
    if (limitErr) throw new Error(limitErr);

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

      // Self-healing retry for Google thinking models: a 400 about a missing
      // thought_signature means replayed functionCall parts lack the opaque
      // signature the model originally returned (e.g. turns saved before
      // signature capture existed). Signatures are unrecoverable, so retry
      // once with every tool-call turn downgraded to plain text.
      if (res.status === 400 && /thought[_ ]?signature/i.test(detail)) {
        const retryBody = s.buildBody(effectiveSettings, history, {
          enableTools: agentic,
          forceTextTools: true,
        });
        const retryRes = await platformFetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(retryBody),
          signal,
        });
        if (!retryRes.ok) {
          let retryDetail: string = `HTTP ${retryRes.status} ${retryRes.statusText}`;
          try {
            const text = await retryRes.text();
            if (text.trim() && !text.trim().startsWith("<")) {
              try {
                const parsed = JSON.parse(text.trim()) as JsonDict;
                const errMsg = parsed?.error as JsonDict | undefined;
                retryDetail = (errMsg?.message as string) || text.trim().slice(0, 500);
              } catch {
                retryDetail = text.trim().slice(0, 500);
              }
            }
          } catch {
            /* keep status-based detail */
          }
          throw new Error(`API error (${retryRes.status}): ${retryDetail}`);
        }
        if (signal.aborted) throw new Error("__ABORTED__");
        res = retryRes;
      } else {
        throw new Error(msg);
      }
    }

    const bodyStream = res.body;
    let usageIn = 0;
    let usageOut = 0;
    let sawUsage = false;
    if (!bodyStream) {
      const data = (await res.json().catch(() => null)) as JsonDict | null;
      const acc0: NativeToolAcc[] = [];
      if (data) {
        ingestNativeChunk(data, acc0);
        const u = s.extractUsage?.(data);
        if (u && (u.input != null || u.output != null)) {
          usageIn = u.input ?? 0;
          usageOut = u.output ?? 0;
          sawUsage = true;
        }
        void recordUsage(
          settings.provider,
          settings.model,
          sawUsage && usageIn > 0 ? usageIn : estimateTokens(JSON.stringify(body)),
          sawUsage && usageOut > 0 ? usageOut : estimateTokens(s.extractContent(data))
        );
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
            const u = s.extractUsage?.(json);
            if (u && (u.input != null || u.output != null)) {
              usageIn += u.input ?? 0;
              usageOut += u.output ?? 0;
              sawUsage = true;
            }
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
            const u = s.extractUsage?.(data);
            if (u && (u.input != null || u.output != null)) {
              usageIn = u.input ?? 0;
              usageOut = u.output ?? 0;
              sawUsage = true;
            }
          }
        }
      } catch {
        /* stream error — keep whatever we have (may be empty) */
      }
    }

    if (!signal.aborted) {
      void recordUsage(
        settings.provider,
        settings.model,
        sawUsage && usageIn > 0 ? usageIn : estimateTokens(JSON.stringify(body)),
        sawUsage && usageOut > 0 ? usageOut : estimateTokens(round)
      );
    }
    return { text: round, nativeCalls: nativeAccToCalls(nativeAcc) };
  };
  const handleAnimationComplete = () => {
    console.log('Animation completed!');
  };

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText ?? message).trim();
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

    // Agentic (file/web-tool) mode is always on: the tool loop only executes
    // calls the model actually emits, so leaving it enabled is harmless and
    // keeps web_search / web_fetch available for every request.
    const agentic = true;
    const activeEditorAtSend = activeEditorRef.current;

    // Build the agent's environment suffix: a high-level project map,
    // open tabs, and any MCP tools exposed by enabled servers.
    let promptSuffix = "";
    if (agentic && workspaceRoot) {
      try {
        const projectMap = await getProjectContext(workspaceRoot);
        promptSuffix += `${projectMap}\n\n`;
      } catch {
        /* fallback to simple listing if indexing fails */
        try {
          const entries = await invoke<FsEntry[]>("fs_list_dir", { path: workspaceRoot });
          const names = entries.map((e) => (e.is_dir ? `${e.name}/` : e.name));
          promptSuffix += `Workspace root: ${workspaceRoot}\nEntries: ${names.slice(0, 25).join(", ")}\n`;
        } catch {
          /* no listing available — continue without it */
        }
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

      // Pinned files (from the Context menu) are injected verbatim so the
      // agent always has them available without needing to read them.
      if (pinnedPaths.length > 0) {
        const MAX_PINNED = 8000;
        for (const p of pinnedPaths) {
          const tab = editorTabsRef.current.find((t) => t.path === p);
          let content: string | null = tab ? tab.content : null;
          if (content == null) {
            try {
              content = await invoke<string>("fs_read_file", { path: p });
            } catch {
              content = null; // unreadable (deleted, binary, folder…) — skip
            }
          }
          if (content == null) continue;
          const capped =
            content.length <= MAX_PINNED
              ? content
              : `${content.slice(0, MAX_PINNED)}\n...[truncated — call read_file for more]`;
          promptSuffix += `\n\nPINNED FILE ${rel(p)}:\n${capped}\n(end of pinned ${rel(p)})`;
        }
        promptSuffix += `\n\nThe PINNED FILE sections above were explicitly attached by the user — treat them as primary context.`;
      }
    }

    // The annotated user message is what small models actually attend to.
    if (userFileNote) {
      const lastMsg = agentHistory[agentHistory.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        lastMsg.content = `${lastMsg.content}\n\n${userFileNote}`;
      }
    }

    const mcpTools = new Map<string, McpToolEntry>();
    if (agentic) {
      const servers = loadMcpServers().filter((s) => s.enabled);
      if (servers.length > 0) {
        await Promise.all(
          servers.map(async (s) => {
            try {
              const tools = await listMcpTools(s);
              for (const t of tools) {
                mcpTools.set(`mcp_${s.name}_${t.name}`, {
                  server: s,
                  tool: t.name,
                  schema: t.inputSchema,
                  readOnly: t.readOnly,
                });
              }
            } catch {
              /* server offline — skip silently */
            }
          })
        );
      }
      if (mcpTools.size > 0) {
        promptSuffix += `

MCP tools available (call via {"name": "<full name>", "arguments": {...}}). Parameters marked (required) MUST be included in arguments or the call fails:
${[...mcpTools.entries()]
  .map(([k, m]) => {
    const sig = formatMcpToolSchema(m.schema);
    return sig ? `- ${k}\n  ${sig}` : `- ${k}`;
  })
  .join(NL)}

MCP call rules:
- If a call fails naming a missing argument (e.g. "datamodel_type is required", "studio_id is required"), re-call WITH that argument included.
- Tools needing id-style arguments (e.g. studio_id) get them from a discovery tool on the same server (e.g. list_roblox_studios) — call that first, then pass the id on every later call to that server.
- Batch independent calls together in one round (e.g. discovery + reads) to save round trips.`;
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
      // Cumulative failures per tool NAME (across rounds). Catches models
      // that keep failing with *different* arguments (e.g. guessing news
      // site URLs one after another), which the identical-signature guard
      // below can never trip. A success resets the count, and hitting the
      // limit only BENCHES that tool — the rest of the turn continues.
      const toolFailCounts = new Map<string, number>();
      const TOOL_FAIL_LIMIT = 8;
      // If the model keeps calling benched tools despite the instruction to
      // stop, end the turn after this many extra attempts.
      const BANNED_TOOL_CALL_LIMIT = 3;
      const bannedTools = new Set<string>();
      let bannedToolCalls = 0;
      let totalFails = 0;
      let totalSuccesses = 0;
      // Budget checkpoints: each checkpoint refills the round budget so long
      // tasks never dead-end mid-run while they keep making progress.
      let checkpointsUsed = 0;
      let lastCheckpointSuccesses = 0;
      let totalRounds = 0;
      // Per-turn cache of read-only tool results. Weak models frequently
      // re-emit identical read calls in later rounds; serving them from cache
      // skips redundant filesystem work. Cleared whenever a mutating tool runs.
      const readOnlyCache = new Map<string, { ok: boolean; output: string; data?: unknown }>();

      while (!abortCtrl.signal.aborted) {
        const round = await streamRound(agentHistory, agentic, abortCtrl.signal, promptSuffix);
        if (abortCtrl.signal.aborted) break;
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
                  thoughtSignature: c.thoughtSignature,
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
        if (calls.length === 0) {
          // Recovery: weak local models often DESCRIBE tool calls in prose
          // ("Sure! Let's use the web_search function...") or emit an EMPTY
          // code fence instead of actually emitting a call. Nudge them to
          // emit a real block instead of ending.
          if (
            nudgeCount < 2 &&
            /(\b(function call|tool call|tool_call|read_file|list_dir|search_files|web_search|web_fetch)\b|web search|search the web|fetch (the |this |that )?url|```|<[a-z_]+\s*\/?>|\b\w+_\w+\(\)|\bcall\s+(read|list|get|search)_)/i.test(raw)
          ) {
            nudgeCount++;
            // Tailor the example to what the user actually asked for: a web
            // question gets a web_search example (with their own message as
            // the query so it can be copied verbatim), otherwise list_dir.
            const wantsWeb =
              /(search|news|latest|web\b|internet|fetch|url|https?|weather|docs|documentation)/i.test(trimmed) ||
              /(web_search|web search|search the web|fetch\b)/i.test(raw);
            const example = wantsWeb
              ? `{"name": "web_search", "arguments": {"query": ${JSON.stringify(trimmed.slice(0, 140))}}}`
              : `{"name": "list_dir", "arguments": {"path": "."}}`;
            agentHistory.push({
              role: "user",
              content:
                `You described a tool call but did not actually emit one — descriptions do nothing. Reply with EXACTLY ONE real tool-call block as your entire message:\n<tool_call>\n${example}\n</tool_call>\nNo prose, no code fences, no examples.`,
            });
            continue;
          }
          break;
        }

        // Plain prose rounds (thinking out loud between calls) don't consume
        // the budget — only rounds that actually execute tools do.
        if (toolRounds >= MAX_TOOL_ROUNDS) {
          if (checkpointsUsed < MAX_CHECKPOINTS && totalSuccesses > lastCheckpointSuccesses) {
            // Still making progress — grant a fresh budget and keep working
            // instead of dead-ending mid-task.
            checkpointsUsed++;
            lastCheckpointSuccesses = totalSuccesses;
            toolRounds = 0;
            agentHistory.push({
              role: "user",
              content: `Checkpoint: you have used ${totalRounds} tool rounds. Your tool budget has been EXTENDED — keep working autonomously until the task is fully complete. Do not stop to summarize or ask for confirmation. If the task is already done, write the final summary now.`,
            });
            continue;
          }
          setError(
            "Neo used all of its tool turns for this request and paused. Send a follow-up message to continue where it left off."
          );
          break;
        }
        toolRounds++;
        totalRounds++;

        const activityIds = new Map<string, string>();
        const planned: AgenticActivityType[] = calls.map(({ call }) => {
          const id = activityId();
          activityIds.set(`${call.name}:${JSON.stringify(call.arguments)}`, id);
          return { id, tool: call.name, args: call.arguments, status: "pending" };
        });
        setActivities((prev) => [...prev, ...planned]);

        const patchActivity = (id: string, patch: Partial<AgenticActivityType>) =>
          setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

        const resultsByKey = new Map<string, { ok: boolean; output: string; data?: unknown }>();

        const effRoot =
          workspaceRoot ??
          (() => {
            const a = activeEditorRef.current;
            if (!a) return null;
            const i = Math.max(a.lastIndexOf("\\"), a.lastIndexOf("/"));
            return i > 0 ? a.slice(0, i) : null;
          })();

        const runToolCall = async (call: ToolCall): Promise<{ ok: boolean; output: string; data?: unknown }> => {
          // A tool benched for repeated failures is short-circuited: the
          // model is told to move on instead of hammering it.
          if (bannedTools.has(call.name)) {
            bannedToolCalls++;
            return {
              ok: false,
              output: `Tool "${call.name}" is disabled for the rest of this turn after repeated failures. Use a different tool, or answer from what you already have.`,
            };
          }
          // Weak local models frequently emit tool calls with EMPTY arguments
          // (e.g. web_search with no query). Rescue the common cases by
          // falling back to the user's own message, so one malformed call
          // doesn't send the model into a retry loop.
          const args = { ...call.arguments };
          if (call.name === "web_search" && !String(args.query ?? "").trim()) {
            args.query = trimmed;
          } else if (call.name === "search_files" && !String(args.pattern ?? "").trim()) {
            args.pattern = trimmed;
          }
          // MCP tools are dynamic ("mcp_<server>_<tool>") — route them to
          // their server instead of the built-in executor.
          if (call.name.startsWith("mcp_")) {
            const mcp = mcpTools.get(call.name);
            if (!mcp) {
              return {
                ok: false,
                output: `Unknown MCP tool "${call.name}". It may belong to a server that is offline or disabled. Available MCP tools: ${
                  [...mcpTools.keys()].join(", ") || "(none)"
                }.`,
              };
            }
            try {
              return await callMcpTool(mcp.server, mcp.tool, args);
            } catch (e) {
              return {
                ok: false,
                output: `MCP tool "${call.name}" failed: ${e instanceof Error ? e.message : String(e)}`,
              };
            }
          }
          const editor = {
            openPaths: editorTabsRef.current.map((t) => t.path),
            activePath: activeEditorRef.current,
            getTabContent: (p: string) =>
              editorTabsRef.current.find((t) => t.path === p)?.content ?? null,
          };
          try {
            const result = await executeTool(call.name, args, effRoot, editor);
            return { ok: result.ok, output: truncateToolOutput(result.output), data: result.data };
          } catch (e) {
            return {
              ok: false,
              output: `Tool "${call.name}" crashed: ${e instanceof Error ? e.message : String(e)}`,
            };
          }
        };

        // --- Read-only batch (parallel). MCP tools the server declares
        // read-only (readOnlyHint) join this batch too — they run without
        // approval and get cached. Unknown MCP tools stay in the sequential
        // batch to be safe. ---
        const isMcpName = (n: string) => n.startsWith("mcp_");
        const readOnly = calls.filter(({ call }) => {
          if (isDestructive(call.name)) return false;
          if (!isMcpName(call.name)) return true;
          return mcpTools.get(call.name)?.readOnly === true;
        });
        if (readOnly.length > 0) {
          readOnly.forEach(({ key }) => {
            if (readOnlyCache.has(key)) return; // cached — no spinner needed
            const id = activityIds.get(key);
            if (id) patchActivity(id, { status: "running" });
          });
          await Promise.all(
            readOnly.map(async ({ call, key }) => {
              const cached = readOnlyCache.get(key);
              const result = cached ?? (await runToolCall(call));
              if (!cached) readOnlyCache.set(key, result);
              resultsByKey.set(key, result);
              ranTools++;
              const id = activityIds.get(key);
              if (id) {
                patchActivity(
                  id,
                  result.ok
                    ? { status: "done", output: result.output, data: result.data }
                    : { status: "error", error: result.output }
                );
              }
            })
          );
        }

        // --- Mutating batch (sequential, each behind user approval). ---
        const mutating = calls.filter(
          ({ call }) =>
            isDestructive(call.name) ||
            (isMcpName(call.name) && mcpTools.get(call.name)?.readOnly !== true)
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
          // A mutation invalidates every cached read-only result.
          readOnlyCache.clear();
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
        if (mutating.length > 0) {
          // Nudge the IDE window so its explorer + open tabs pick up the
          // agent's file changes immediately (it also polls as a fallback).
          try {
            await emit("neo:workspace-changed", {});
          } catch {
            /* IDE window not open — non-fatal */
          }
        }

        // Runaway guard: identical failing calls across consecutive rounds.
        // A round with ANY success proves progress — reset the streak.
        const anySuccess = calls.some(({ key }) => resultsByKey.get(key)?.ok === true);
        const failSig = calls
          .filter(({ key }) => resultsByKey.get(key)?.ok === false)
          .map(({ call }) => `${call.name}:${JSON.stringify(call.arguments)}`)
          .sort()
          .join("|");
        if (failSig && failSig === lastFailSig && !anySuccess) {
          failStreak++;
          if (failStreak >= 4) {
            setError(
              "The same tool calls kept failing identically — stopping to avoid an endless loop. Try rephrasing the task or checking that the files exist."
            );
            break;
          }
        } else {
          lastFailSig = failSig;
          failStreak = failSig ? 1 : 0;
        }

        // Per-tool failure accounting. Success resets a tool's strike count
        // (a tool that recovers is never benched); reaching the limit only
        // benches THAT tool — the turn continues with everything else. Hard
        // stop only if the model keeps hammering benched tools, or nothing
        // succeeds despite many failures.
        for (const [key, r] of resultsByKey) {
          const tool = key.slice(0, key.indexOf(":"));
          if (r.ok) {
            totalSuccesses++;
            toolFailCounts.delete(tool);
          } else if (!bannedTools.has(tool)) {
            totalFails++;
            toolFailCounts.set(tool, (toolFailCounts.get(tool) ?? 0) + 1);
          }
        }
        for (const [tool, count] of toolFailCounts) {
          if (count >= TOOL_FAIL_LIMIT) bannedTools.add(tool);
        }
        if (bannedTools.size > 0) {
          agentHistory.push({
            role: "user",
            content: `Tools disabled for the rest of this turn after repeated failures: ${[
              ...bannedTools,
            ].join(", ")}. Do NOT call them again — use other tools, or summarize what you know and answer directly.`,
          });
        }
        if (
          bannedToolCalls >= BANNED_TOOL_CALL_LIMIT ||
          (totalFails >= 12 && totalSuccesses === 0)
        ) {
          setError(
            `Too many tool failures this turn (${totalFails} failed, ${totalSuccesses} succeeded${
              bannedTools.size > 0 ? `; disabled: ${[...bannedTools].join(", ")}` : ""
            }). Stopped to avoid an endless loop — try rephrasing or check the target system.`
          );
          break;
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

  /** Kick off a deep project analysis by the agent (Context menu). */
  const handleAnalyzeProject = () => {
    if (!workspaceRoot) {
      setError("Open a workspace folder first, then run Analyze Project.");
      return;
    }
    void sendMessage(
      `Analyze the project at "${workspaceRoot}" in depth: identify the stack, entry points, key modules and their roles, and how data flows between them. Use list_dir, read_file and search_files as needed, then summarize the architecture plus anything that looks risky or unfinished.`
    );
  };

  /** Export the active chat session as JSON via a save dialog (Context menu). */
  const handleSaveSession = async () => {
    try {
      const path = await saveDialog({
        title: "Save chat session",
        defaultPath: `neo-session-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return; // user cancelled
      const payload = {
        exportedAt: new Date().toISOString(),
        workspaceRoot,
        provider: settings.provider,
        model: settings.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        activities,
      };
      await invoke("fs_write_file", { path, content: JSON.stringify(payload, null, 2) });
    } catch (e) {
      setError(`Failed to save session: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <TopMenu
          contextEntries={contextEntries}
          pinnedPaths={pinnedPaths}
          onPinFile={togglePinFile}
          onAnalyzeProject={handleAnalyzeProject}
          onSaveSession={() => void handleSaveSession()}
          onOpenInfoPanel={() => setInfoPanelOpen(true)}
          onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
          onOpenTab2={() => setTab2Open(true)}
          onOpenAiSettings={() => {
            setSettingsSection("ai");
            setSettingsOpen(true);
          }}
          onOpenChatHistory={() => setHistorySidebarOpen(true)}
          onOpenIde={() => launchIdeWindowRef.current()}
          onOpenIdeWindow={() => void launchIdeWindow()}
          onOpenTerminal={() => setOpenTerminal(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          right={
            <>
              {/* Provider / model pill */}
              <div className="relative min-w-0 max-w-full">
                <button
                  type="button"
                  onClick={() => setModelOpen((v) => !v)}
                  title="Switch AI provider"
                  className="flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-(--border) bg-(--fill-1) px-2 py-[3px] text-[11px] text-[var(--text-secondary)] transition-colors hover:border-(--border-strong) hover:text-[var(--text-primary)]"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      settings.apiKey || !spec.needsAuth ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="min-w-0 max-w-[min(22vw,150px)] flex-1 truncate">
                    {settings.model || spec.label}
                  </span>
                  {!settings.apiKey && spec.needsAuth && (
                    <span className="hidden shrink-0 whitespace-nowrap text-[var(--text-muted)] sm:inline">
                      (not configured)
                    </span>
                  )}
                  <IoChevronDown size={10} className="shrink-0" />
                </button>
                {modelOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-(--border-strong) bg-[var(--bg-elevated)] p-1 shadow-[0_10px_32px_rgba(0,0,0,0.5)]">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      AI Provider
                    </div>
                    {PROVIDER_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        className={`flex w-full items-center justify-between rounded-md px-2.5 py-[6px] text-left text-[12px] transition-colors hover:bg-(--fill-2) ${
                          settings.provider === p.id ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
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
                    <div className="mt-1 border-t border-(--border) px-2 pb-1 pt-2">
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span>Context window</span>
                        <span className="tabular-nums">
                          ~{formatTokens(estTokens)} / {formatTokens(ctxLimit)} tok
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--fill-2)">
                        <div
                          className={`h-full rounded-full transition-all ${
                            ctxPct > 85 ? "bg-red-400" : ctxPct > 60 ? "bg-amber-400" : "bg-(--accent)"
                          }`}
                          style={{ width: `${Math.max(2, ctxPct)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--text-faint)]">
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
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
              >
                <IoAdd size={13} />
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
          account={account}
          accountProfile={accountProfile}
          onAccountRefresh={() => void refreshAccount()}
        />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* */}
          <nav className="flex w-12 shrink-0 flex-col items-center justify-between border-r border-(--border) bg-[var(--bg-panel)] py-1">
            <div className="w-full">
              <RailButton active={onOpenTerminal} title="Terminal (Ctrl+`)" onClick={() => setOpenTerminal((v) => !v)}>
                <IoTerminal size={17} />
              </RailButton>
              <RailButton active={settingsOpen} title="Settings (Ctrl+,)" onClick={() => setSettingsOpen(true)}>
                <IoSettings size={16} />
              </RailButton>
            </div>
          </nav>
          <ChatHistorySidebar
            isOpen={historySidebarOpen}
            onClose={() => setHistorySidebarOpen(false)}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={selectSession}
            onNewChat={newChat}
            onDeleteSession={deleteSession}
            signedIn={signedIn}
          />
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
            {/* --- CONTEXT STRIP --- */}
            {/* relative z-20 keeps it ABOVE the scroll fade so it stays visible/clickable */}
            <div
              className="relative z-20 flex shrink-0 items-center gap-3 overflow-x-auto whitespace-nowrap border-b border-zinc-800/30 bg-black/20 px-5 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-debug="context-strip"
            >
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="text-[10px] uppercase tracking-wider font-bold">Context:</span>
              </div>
              {workspaceRoot && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-800 text-[var(--text-primary)] text-[10px] font-mono">
                  <span><IoFolderOutline/>
                  </span> {shortPath(workspaceRoot)}
                </div>
              )}
              {activeEditorPath && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-mono">
                  <span>
                  </span> {shortPath(activeEditorPath)}
                </div>
              )}
              {!workspaceRoot && !activeEditorPath && (
                <span className="text-[var(--text-secondary)] text-[10px] italic">No active workspace</span>
              )}
            </div>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="relative min-h-0 flex-1 overflow-y-auto"
              data-debug="chat-scroll"
            >
              {messages.length === 0 ? (
                <div className="relative flex min-h-full items-center justify-center px-6">
                  <div className="msg-in relative z-0 w-full max-w-2xl pb-24 text-center" data-debug="welcome-wrap">

                    {/* Emblem */}
                    

                    {/* Welcome heading */}
                    <div className="relative z-0 flex items-center justify-center" data-debug="welcome-heading">
                      <BlurText
                        text="Ready to start working?"
                        delay={70}
                        animateBy="letters"
                        direction="top"
                        onAnimationComplete={handleAnimationComplete}
                        className="mb-3 justify-center text-center text-2xl text-[var(--text-primary)]"
                      />
                    </div>
                    
                    {/* Status chips */}
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                      {/* <span
                        title={`Provider: ${spec.label}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--fill-1) px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            settings.apiKey || !spec.needsAuth ? "bg-emerald-500" : "bg-zinc-600"
                          }`}
                        />
                        {settings.model || spec.label}
                      </span>
                      <span
                        title={workspaceRoot ?? undefined}
                        className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--fill-1) px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1.5 4.5A1.5 1.5 0 013 3h3l1.5 1.75H13A1.5 1.5 0 0114.5 6.25V12A1.5 1.5 0 0112.5 13.5h-9A1.5 1.5 0 011.5 12V4.5z" />
                        </svg>
                        {workspaceRoot
                          ? `${workspaceRoot.split(/[\\/]/).filter(Boolean).pop()} folder/file open`
                          : "No workspace open"}
                      </span>
                       */}
                    </div>

                    {/* Action cards */}
                    <div className="mx-auto mt-8 grid w-full max-w-lg grid-cols-1 gap-3 text-left sm:grid-cols-2">
                      <StarBorder
                        as="button"
                        type="button"
                        onClick={() => {
                          void launchIdeWindow();
                        }}
                        color="lightblue"
                        speed="5s"
                        thickness={1}
                        backgroundColor="rgba(255, 255, 255, 0.02)"
                        borderColor="rgba(255, 255, 255, 0.08)"
                        className="w-full rounded-[2px] transition hover:bg-(--fill-1)"
                        innerClassName="px-3 py-2.5 text-left"
                      >
                        
                         
                      <span className="flex items-center gap-2">
                        <IoAdd size={14} className="text-[var(--text-accent)]" />
                        <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">Open a project</span>
                      </span>
                      
                      <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-faint)]">Browse and edit files in a real workspace</span>
                      
                      </StarBorder>
                      {[
                        {
                          label: "Summarize my project",
                          desc: "A quick overview of what's here",
                          prompt: "Summarize my project in small details",
                        },
                        {
                          label: "Find and fix bugs",
                          desc: "Scan for issues and apply fixes",
                          prompt: "Find and fix bugs and make sure they aren't repeated again",
                         
                        },
                        {
                          label: "Write a new feature",
                          desc: "Describe it and Neo builds it",
                          prompt: "Write a new feature in my code",
                          
                        },
                      ].map((card) => (
                        <StarBorder
                          key={card.label}
                          as="button"
                          type="button"
                          onClick={() => setMessage(card.prompt)}
                          color="lightblue"
                          speed="5s"
                          thickness={1}
                          backgroundColor="rgba(255, 255, 255, 0.02)"
                          borderColor="rgba(255, 255, 255, 0.08)"
                          className="w-full rounded-[2px] transition hover:bg-(--fill-1)"
                          innerClassName="px-3 py-2.5 text-left"
                        >
                          <span className="flex items-center gap-2">
                            {/* <CardIcon name={card.icon} /> */}
                            <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">{card.label}</span>
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-faint)]">{card.desc}</span>
                        </StarBorder>
                      ))}
                    </div>

                    {/* Keyboard shortcuts */}
                    {/* <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[10.5px] text-[var(--text-muted)]">
                      <span className="flex items-center gap-1.5">
                        <span className="kbd">Ctrl</span>
                        <span className="kbd">Shift</span>
                        <span className="kbd">P</span>
                        Command palette
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="kbd">Ctrl</span>
                        <span className="kbd">`</span>
                        Terminal
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="kbd">Ctrl</span>
                        <span className="kbd">B</span>
                        AI config
                      </span>
                    </div> */}
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-3xl px-6 py-8">
                  <div className="space-y-7">
                    {messages.map((msg, index) => (
                      <div key={index} className="msg-in">
                        {msg.role === "user" ? (
                          <div className="flex justify-end">
                            <div className="max-w-[85%] whitespace-pre-wrap rounded-md border border-(--border) bg-(--fill-1) px-3.5 py-2.5 text-[13px] leading-6 text-[var(--text-primary)]">
                              {msg.content}
                            </div>
                          </div>
                        ) : isLoading &&
                          index === messages.length - 1 &&
                          msg.content.trim().length === 0 ? (
                          <div className="flex items-center gap-2 py-2">
                            <span className="thinking-dot" />
                            <span className="text-[11px] text-[var(--text-muted)]">Working…</span>
                          </div>
                        ) : (
                          <div className="group/msg min-w-0">
                            <div className="mb-1.5 flex items-center gap-1.5">
                              
                              <span className="text-[10px] font-medium tracking-[0.06em] text-[var(--text-muted)]">
                                Assistant - 
                              </span>
                            </div>
                            <div className="text-[13.5px] leading-7 text-[var(--text-primary)]">
                              <Markdown content={msg.content} />
                              {isLoading && index === messages.length - 1 && (
                                <span className="stream-caret" aria-hidden />
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                              <MessageAction
                                label="Copy"
                                onClick={() => {
                                  void navigator.clipboard.writeText(msg.content);
                                }}
                              >
                                <IoCopyOutline size={13} />
                              </MessageAction>
                              <MessageAction label="Good response" onClick={() => sendFeedback("good")}>
                                <IoThumbsUpSharp size={13} />
                              </MessageAction>
                              <MessageAction label="Bad response" onClick={() => sendFeedback("bad")}>
                                <IoThumbsDownSharp size={13} />
                              </MessageAction>
                              <MessageAction label="Report an issue" onClick={() => sendFeedback("report")}>
                                <IoAlertSharp size={13} />
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
                      className="inline-flex items-center gap-1.5 rounded border border-(--border) bg-(--fill-1) px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                    >
                      <span className="h-1 w-1 rounded-full bg-[#5a5a5a]" />
                      {activeEditorPath.split(/[\\/]/).pop()}
                    </span>
                  </div>
                ) : (
                  <div className="mb-1.5 flex items-center gap-1.5 px-1">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Open file/folder or give the agent the path of file/folder in the editor and it's sent to the agent automatically
                    </span>
                  </div>
                )}
                <div className="relative rounded-lg border border-(--border) bg-[var(--bg-panel)] transition-colors duration-150 focus-within:border-blue-500/50 shadow-2xl">
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
                        ? "Ask the agent to fix, refactor, or build..."
                        : "Configure your API key in Settings to start chatting"
                    }
                    rows={1}
                    spellCheck={false}
                    className="max-h-48 min-h-[54px] w-full resize-none bg-transparent px-3.5 pb-11 pt-3 pr-12 text-[13px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] disabled:opacity-60"
                  />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => launchIdeWindowRef.current()}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
                      title="Open IDE window"
                    >
                      <IoAdd size={14} />
                    </button>
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={stopChat}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-(--fill-2) text-[var(--text-primary)] transition hover:bg-(--fill-3)"
                        title="Stop streaming"
                      >
                        <IoStop size={11} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!message.trim() || isLoading}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-(--fill-2) disabled:text-[var(--text-faint)]"
                        title="Send message"
                      >
                        <IoSend size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between px-1 text-[10.5px] text-[var(--text-faint)]">
                  <span>Enter to send · Shift+Enter for a new line</span>
                  <span>AI can make mistakes — verify important info.</span>
                </div>
              </form>
            </div>
          </main>
        </div>
       
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
              id: "open-ide-window",
              label: "Open IDE Window",
              category: "View",
              shortcut: "Ctrl+Shift+E",
              action: () => launchIdeWindowRef.current(),
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
