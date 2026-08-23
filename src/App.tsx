import { useEffect, useRef, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import TopMenu from "../components/TopMenu";
import ChatSidebar from "../components/ChatSidebar.tsx";
import ChatHistorySidebar from "../components/ChatHistorySidebar.tsx";
import InfoPanel from "../components/InfoPanel";
import PrivacyPolicy from "../components/PrivacyPolicy.tsx";
import CommandPalette from "../components/CommandPalette";
import ClickSpark from "../components/ClickSpark";
import StatusBar from "../components/StatusBar.tsx";
import Tab2 from "../components/Tab2.tsx";
import SideRays from "../components/SideRays.tsx";
import Markdown from "./components/Markdown";
import Terminal from "../components/terminal";

import "./editor.css";
import { IoCube, IoSend } from "react-icons/io5";
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
  nativeAccToCalls,
  parseToolCalls,
  stripToolCalls,
  type NativeToolAcc,
  type ToolCall,
} from "./agentic";
import type { AgenticActivity as AgenticActivityType } from "./agentic";
import FileExplorer from "./components/FileExplorer";
import CodeEditor from "./components/CodeEditor";
import type { EditorTab } from "./components/CodeEditor";
import {
  ThumbsUpIcon,
  ThumbsDownIcon,
  InfoIcon,
  DotsThreeVerticalIcon,
  PauseIcon,
} from "@phosphor-icons/react/dist/ssr";

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
    // Keep assistant messages that carry native tool calls even when their
    // text content is empty — dropping them orphans the tool-result messages.
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

export default function App() {
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onOpenTerminal, setOpenTerminal] = useState(false);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [privacyPolicyOpen, setPrivacyPolicyOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
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
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeEditorPath, setActiveEditorPath] = useState<string | null>(null);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);

  const spec: ProviderSpec = getProviderSpec(settings);

  useEffect(() => {
    mountedRef.current = true;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
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
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, sess, activeId] = await Promise.all([
        loadSettings(),
        loadSessions(),
        loadActiveSessionId(),
      ]);
      if (cancelled) return;

      setSettings(s);

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
        setWorkspaceRoot(dir);
        // A different workspace means a fresh editor context.
        setEditorTabs([]);
        setActiveEditorPath(null);
        setExplorerRefreshKey((k) => k + 1);
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
      for (const f of list) {
        await openFileInEditor(f);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Max simultaneously open editor tabs (LRU-evicted beyond this). */
  const MAX_OPEN_TABS = 10;

  /** Open a file from the explorer in an editor tab. */
  const openFileInEditor = async (path: string) => {
    setActiveEditorPath(path);
    if (editorTabs.some((t) => t.path === path)) return;
    try {
      const content = await invoke<string>("fs_read_file", { path });
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

  // Mirror of editorTabs for use inside intervals / async callbacks.
  const editorTabsRef = useRef<EditorTab[]>([]);
  editorTabsRef.current = editorTabs;

  /**
   * Re-read one open tab's file from disk and adopt external changes.
   * Clean tabs follow the file on disk, so edits made by the AI's tools
   * (or any other process) appear in the editor live. Tabs with unsaved
   * user edits are left untouched. Tabs whose file disappeared are closed
   * unless they hold unsaved work.
   */
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
    signal: AbortSignal
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

${AGENTIC_PROMPT}`,
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
    let full = streamedContentRef.current; // preserve any prior-round visible text
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
              full += delta;
              streamedContentRef.current = full;
              // Show only non-tool text to the user as it streams.
              setLastAssistantContent(stripToolCalls(full));
            }
          } catch {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!full && !signal.aborted) {
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
            full = s.extractContent(data);
            ingestNativeChunk(data, nativeAcc);
          }
        }
      } catch {
        /* stream error — keep whatever we have (may be empty) */
      }
    }

    return { text: full, nativeCalls: nativeAccToCalls(nativeAcc) };
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
    const agentic = looksLikeFileRequest(trimmed);

    setIsLoading(true);
    streamedContentRef.current = "";

    const abortCtrl = new AbortController();
    streamControllerRef.current = abortCtrl;

    try {
      let finalText = "";
      let toolRounds = 0;

      while (!abortCtrl.signal.aborted) {
        const round = await streamRound(agentHistory, agentic, abortCtrl.signal);
        if (abortCtrl.signal.aborted) break;
        toolRounds++;
        const raw = round.text;

        
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
        const visible = stripToolCalls(raw).trim();
        if (visible) finalText = visible;

        // Merge native function-calls with text-based (<tool_call>) calls.
        const calls: { call: ToolCall; native: boolean }[] = [
          ...round.nativeCalls.map((c) => ({ call: c, native: true })),
          ...parseToolCalls(raw).map((c) => ({ call: c, native: false })),
        ];

        // If the model produced no tool calls, we're done.
        if (calls.length === 0 || toolRounds >= MAX_TOOL_ROUNDS) {
          if (toolRounds >= MAX_TOOL_ROUNDS && calls.length > 0) {
            setError("Reached the maximum number of agentic tool turns. Stopping.");
          }
          break;
        }

        // Execute tools; route results back using each protocol:
        // native calls -> role:"tool" messages, text calls -> <tool_result>.
        const nativeResults: Message[] = [];
        const resultBlocks: string[] = [];
        for (const { call, native } of calls) {
          const id = activityId();
          const activity: AgenticActivityType = {
            id,
            tool: call.name,
            args: call.arguments,
            status: "pending",
          };
          setActivities((prev) => [...prev, activity]);

          // Destructive tools require explicit user approval.
          if (isDestructive(call.name)) {
            setActivities((prev) =>
              prev.map((a) => (a.id === id ? { ...a, status: "pending" } : a))
            );
            setPendingApproval(activity);
            const approved = await requestApproval(id);
            setPendingApproval(null);
            if (!approved) {
              const denied: AgenticActivityType = {
                ...activity,
                status: "denied",
              };
              setActivities((prev) =>
                prev.map((a) => (a.id === id ? denied : a))
              );
              const denial =
                "User denied approval for this operation. Do not retry it; explain and propose alternatives.";
              if (native) {
                nativeResults.push({
                  role: "tool",
                  content: denial,
                  toolCallId: call.id,
                  toolName: call.name,
                });
              } else {
                resultBlocks.push(formatToolResult({ ok: false, output: denial }));
              }
              continue;
            }
            setActivities((prev) =>
              prev.map((a) => (a.id === id ? { ...a, status: "approved" } : a))
            );
          }

          // Run the tool.
          setActivities((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "running" } : a))
          );
          const result = await executeTool(call.name, call.arguments);
          setActivities((prev) =>
            prev.map((a) =>
              a.id === id
                ? result.ok
                  ? { ...a, status: "done", output: result.output }
                  : { ...a, status: "error", error: result.output }
                : a
            )
          );
          // Reflect filesystem mutations in the editor + explorer immediately.
          if (result.ok) {
            syncAllOpenTabsRef.current();
            if (isDestructive(call.name)) setExplorerRefreshKey((k) => k + 1);
          }
          // Truncate large outputs before they enter the model's context.
          if (native) {
            nativeResults.push({
              role: "tool",
              content: truncateToolOutput(result.output),
              toolCallId: call.id,
              toolName: call.name,
            });
          } else {
            resultBlocks.push(
              formatToolResult({ ...result, output: truncateToolOutput(result.output) })
            );
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

      // Commit the final visible answer.
      if (finalText) {
        setLastAssistantContent(finalText);
      } else {
        const collected = streamedContentRef.current;
        const cleaned = stripToolCalls(collected).trim();
        if (cleaned) {
          setLastAssistantContent(cleaned);
        } else {
          setError("The model returned an empty response.");
          removeEmptyAssistant();
        }
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
    <ClickSpark sparkColor="#ffffff" sparkSize={0} sparkRadius={15} sparkCount={8} duration={400}>
      {" "}
      {/*Credit to https:Reactbits.dev for the components i use in the app */}
      <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <TopMenu
          onOpenInfoPanel={() => setInfoPanelOpen(true)}
          onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
          onOpenTab2={() => setTab2Open(true)}
          onOpenChatSidebar={() => setSidebarOpen(true)}
          onOpenChatHistory={() => setHistorySidebarOpen(true)}
          onOpenIde={() => setIdeOpen(true)}
          onOpenTerminal={ () => setOpenTerminal(true) }
        />
        <InfoPanel isOpen={infoPanelOpen} onClose={() => setInfoPanelOpen(false)} />
        <PrivacyPolicy isOpen={privacyPolicyOpen} onClose={() => setPrivacyPolicyOpen(false)} />
        <Tab2 isOpen={Tab2Open} onClose={() => setTab2Open(false)} />
        <Terminal isOpen={onOpenTerminal} onClose={()=>setOpenTerminal(false)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ChatHistorySidebar
            isOpen={historySidebarOpen}
            onClose={() => setHistorySidebarOpen(false)}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={selectSession}
            onNewChat={newChat}
            onDeleteSession={deleteSession}
          />
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-zinc-900/30 to-transparent" />
            <div className="relative z-10 flex h-14 shrink-0 items-center justify-between  px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg  bg-zinc-900">
                  <span className="text-xs text-zinc-300">
                    <IoCube size={18} />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        settings.apiKey ? "bg-emerald-500" : "bg-zinc-600"
                      }`}
                    />
                    {spec.label}
                    {settings.model && (
                      <span>- {settings.model}</span>
                    )}
                    {!settings.apiKey && spec.needsAuth && (
                      <span className="text-zinc-500">(not configured)</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={newChat}
                className=" bg-zinc-900 rounded-lg px-3 py-1.5 text-xs text-zinc-300 transition max-sm:h-11 max-sm:w-11"
              >
                New
              </button>
            </div>
            <div className="absolute inset-0 z-0">
              {/*Can be edited to your liking if youre checking the source code out */}
              {/*Credit to https:Reactbits.dev for the components i use in the app */}
              <SideRays
                speed={3.5}
                rayColor1="#EAB308"
                rayColor2="#96c8ff"
                intensity={3}
                spread={19}
                origin="top-right"
                tilt={0}
                saturation={1.5}
                blend={0.75}
                falloff={1.6}
                opacity={1}
              />
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto"
            >
              {messages.length === 0 ? (
                <div className="flex min-h-full items-center justify-center px-6">
                  <div className="w-full max-w-2xl pb-20">
                    <div className="text-center">
                      <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
                        What can I help you with?
                      </h1>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
                        Ask questions, explore ideas, write, learn, or work through a problem.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-3xl px-6 py-10">
                  <div className="space-y-10">
                    {messages.map((msg, index) => (
                      <div key={index}>
                        {msg.role === "user" ? (
                          <div className="flex justify-end">
                            <div className="max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-zinc-800/90 px-4 py-3 text-sm leading-6 text-zinc-100 shadow-sm">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3">

                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300">
                                
                                <IoCube size={14} />
                              </div>
                              {/*<span>{settings.model || spec.label}</span> */}
                            {isLoading && index === messages.length - 1 && msg.content.trim().length === 0 ? (
                              <div className="flex items-center gap-1.5 pt-2">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                              </div>
                            ) : (
                              <div className="min-w-0 max-w-[80%] flex-1 pt-1 text-sm leading-7 text-zinc-300">
                                    <Markdown content={msg.content} />
                                    <span className="m-2  hover:bg-zinc-800 rounded-2xl max-sm:h-11 max-sm:w-11">
                                      <button
                                        
                                        onClick={() =>
                                          sendFeedback("good")
                                        }>
                                        <ThumbsUpIcon size={17} />
                                      </button>
                                    </span>
                                    <span className = " hover:bg-zinc-800 rounded-2xl max-sm:h-11 max-sm:w-11">
                                      <button
                                        onClick={() =>
                                          sendFeedback("bad")}>
                                        <ThumbsDownIcon size={17} />
                                      </button>
                                    </span>
                                    <span className="m-2  hover:bg-zinc-800 rounded-2xl max-sm:h-11 max-sm:w-11">
                                      <button 
                                        onClick ={()=>sendFeedback("report")}>
                                        <InfoIcon size={17} />
                                      </button>
                                    </span>
                                    <span className="relative  hover:bg-zinc-800 rounded-2xl max-sm:h-11 max-sm:w-11">
                                      <button 
                                        onClick={() => 
                                        setMenuOpen(menuOpen === index ? null: index)}>
                                        <DotsThreeVerticalIcon size={19} />
                                      </button>
                                      {/*Opens a dropdown selector for the 3 dots. more efficient ngl. i didnt wanna add 4 other buttons plus the 3 dots is universally known to display a list of items */}
                                      {menuOpen === index  && (
                                        <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
                                          <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-800 max-sm:h-11 max-sm:w-11"
                                            onClick={() => setSidebarOpen(true)}>
                                            Settings
                                          </button>
                                          <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-800 max-sm:h-11 max-sm:w-11">
                                            Copy
                                          </button>
                                          {/* <button className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-800 max-sm:h-11 max-sm:w-11"
                                            onClick ={()=>alert("Thank you for reporting")}
                                          > */}
                                            {/* Report
                                          </button> */}
                                        </div>
                                      )}
                                    </span>
                              </div>
                            )}
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
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-300">
                  {error}
                </div>
              </div>
            )}
            <div className="relative z-20 shrink-0 px-5 pb-4 pt-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="mx-auto w-full max-w-3xl"
              >
                <div className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-2xl shadow-black/30 backdrop-blur-xl transition-all duration-200 focus-within:border-zinc-700 focus-within:bg-zinc-900">
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
                      settings.apiKey
                        ? "Send a message"
                        : "Configure your API key in settings to start chatting"
                    }
                    rows={1}
                    className="max-h-48 min-h-[58px] w-full resize-none bg-transparent px-4 pb-12 pt-4 pr-14 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-60"
                  />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={()=>setIdeOpen(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-100"
                        title="Upload files/folders"
                      >
                        {"+"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setModelOpen(prev=>!prev)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        {settings.model || spec.label} ▾
                        {modelOpen && (
                          <div className="absolute left-0 bottom-full z-50 mb-2 w-56 rounded-xl border border-white/[0.08] bg-zinc-950/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
                              Switch AI provider
                            </div>
                            {PROVIDER_OPTIONS.map((p) => (
                              <button
                                key={p.id}
                                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-zinc-800 ${
                                  settings.provider === p.id
                                    ? "text-zinc-100"
                                    : "text-zinc-400"
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
                                        s.id === activeSessionId
                                          ? { ...s, settings: updated }
                                          : s
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
                          </div>
                        )}
                      </button>
                    </div>
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={stopChat}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/90 text-sm font-medium text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-20 max-sm:h-11 max-sm:w-11"
                        title="Stop streaming"
                      >
                        <PauseIcon size={23} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!message.trim() || isLoading}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-sm font-medium text-zinc-900 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-20 max-sm:h-11 max-sm:w-11"
                      >
                        <IoSend/>
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 text-center text-[10px] text-zinc-700">
                  AI can make mistakes. Check important information.
                </div>
              </form>
            </div>
          </main>
          {/* Integrated IDE panel: file explorer + code editor beside the chat */}
          {ideOpen && (
            <section className="flex min-w-0 flex-1 flex-col border-l border-zinc-800/80 bg-[#0b0b0e]">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#111114] px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                    Workspace
                  </span>
                  {workspaceRoot && (
                    <span
                      className="max-w-[220px] truncate rounded bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-zinc-500"
                      title={workspaceRoot}
                    >
                      {workspaceRoot.split(/[\\/]/).filter(Boolean).pop()}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => void pickWorkspaceFolder()}
                    className="rounded-md border border-zinc-800 bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-zinc-300 transition hover:border-zinc-700 hover:bg-white/[0.07]"
                  >
                    Open Folder
                  </button>
                  <button
                    onClick={() => void pickWorkspaceFiles()}
                    className="rounded-md border border-zinc-800 bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-zinc-300 transition hover:border-zinc-700 hover:bg-white/[0.07]"
                  >
                    Open File
                  </button>
                  <button
                    onClick={() => setIdeOpen(false)}
                    aria-label="Close editor panel"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {workspaceRoot || editorTabs.length > 0 ? (
                <div className="flex min-h-0 flex-1">
                  {workspaceRoot && (
                    <FileExplorer
                      root={workspaceRoot}
                      activePath={activeEditorPath}
                      refreshKey={explorerRefreshKey}
                      onOpenFile={(p) => void openFileInEditor(p)}
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
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 font-mono text-lg text-zinc-600">
                    {"</>"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-400">Open a workspace</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-600">
                      Browse files, edit code, and watch the AI's changes land live.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void pickWorkspaceFolder()}
                      className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-[0_0_16px_rgba(14,165,233,0.3)] transition hover:bg-sky-400"
                    >
                      Open Folder
                    </button>
                    <button
                      onClick={() => void pickWorkspaceFiles()}
                      className="rounded-lg border border-zinc-700 bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.07]"
                    >
                      Open File
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          <aside
            className={`shrink-0 overflow-hidden border-l border-zinc-800/60 bg-[#0c0c0f] transition-[width] duration-200 ease-out ${
              sidebarOpen ? "w-80 max-sm:w-full" : "w-0"
            }`}
          >
            {sidebarOpen && (
              <ChatSidebar
                onClose={() => setSidebarOpen(false)}
                settings={settings}
                onSave={handleSaveSettings}
                onSelectLocalModel={handleSelectLocalModel}
              />
            )}
          </aside>
        </div>
        <StatusBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          historySidebarOpen={historySidebarOpen}
          onToggleHistorySidebar={() => setHistorySidebarOpen((v) => !v)}
        />
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={[
            {
              id: "toggle-sidebar",
              label: "Toggle Sidebar",
              category: "View",
              icon: "📑",
              shortcut: "Ctrl+B",
              action: () => setSidebarOpen((v) => !v),
            },
            {
              id: "toggle-history",
              label: "Toggle Chat History",
              category: "View",
              icon: "💬",
              shortcut: "Ctrl+Shift+H",
              action: () => setHistorySidebarOpen((v) => !v),
            },
            {
              id: "open-information",
              label: "Open Information",
              category: "Settings",
              icon: "ℹ️",
              action: () => setInfoPanelOpen(true),
            },
            {
              id: "open-privacy",
              label: "Open Privacy Policies",
              category: "Settings",
              icon: "🔒",
              action: () => setPrivacyPolicyOpen(true),
            },
            {
              id: "new-chat",
              label: "New Chat",
              category: "Chat",
              icon: "✏️",
              action: newChat,
            },
            {
              id: "stop-stream",
              label: "Stop Streaming",
              category: "Chat",
              icon: "⏹",
              shortcut: "Esc",
              action: isLoading ? stopChat : () => {},
            },
            {
              id: "open-ide",
              label: "Open Code Editor",
              category: "View",
              icon: "📝",
              shortcut: "Ctrl+Shift+E",
              action: () => setIdeOpen(true),
            },
          ]}
        />
      </div>
    </ClickSpark>
  );
}