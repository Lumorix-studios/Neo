import { useEffect, useRef, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import TopMenu from "../components/TopMenu";
import ChatSidebar from "../components/ChatSidebar.tsx";
import InfoPanel from "../components/InfoPanel";
import PrivacyPolicy from "../components/PrivacyPolicy.tsx";
import CommandPalette from "../components/CommandPalette";
import ClickSpark from "../components/ClickSpark";
import StatusBar from "../components/StatusBar.tsx";
import Tab2 from "../components/Tab2.tsx";
import SideRays from "../components/SideRays.tsx";
import "./editor.css";
import { IoCube } from "react-icons/io5";
import type { AISettings, Message } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { loadSettings, saveSettings, loadChatHistory, saveChatHistory } from "./store";
import { getProviderSpec, buildAuthHeaders } from "./providers";
import type { ProviderSpec } from "./providers";

type JsonDict = Record<string, unknown>;

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

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // The active streaming request's abort controller, so we can cancel it.
  const streamControllerRef = useRef<AbortController | null>(null);
  // Mutable hold of the assistant text being streamed in (avoids closures capturing stale state).
  const streamedContentRef = useRef("");
  // Throttles React re-renders while streaming: we only flush to state ~every 16ms.
  const pendingFlushRef = useRef(false);
  // Holds the active flush timer id so we can cancel stale flushes.
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Generation counter: each new request increments it. Pending flushes from a
  // previous request check this and bail out, preventing stale writes.
  const streamGenRef = useRef(0);
  // Whether the component is still mounted (prevents setState after unmount).
  const mountedRef = useRef(true);
  // True while the user is scrolled near the bottom (auto-follow).
  const autoScrollRef = useRef(true);

  const spec: ProviderSpec = getProviderSpec(settings);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, h] = await Promise.all([loadSettings(), loadChatHistory()]);
      if (cancelled) return;
      if (h.length > 0) setMessages(h);
      setSettings(s);
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveSettings(settings);
    }, 250);
    return () => clearTimeout(t);
  }, [settings, restored]);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => {
      saveChatHistory(messages);
    }, 250);
    return () => clearTimeout(t);
  }, [messages, restored]);

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
      mountedRef.current = false;
      streamControllerRef.current?.abort();
    };
  }, []);

  const handleSaveSettings = (next: AISettings) => {
    setSettings(next);
    void saveSettings(next);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" when within 80px of the scroll bottom.
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /** Replace the trailing assistant placeholder's content (used while streaming). */
  const replaceLastAssistant = (content: string) => {
    if (!mountedRef.current) return;
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") return prev;
      const copy = [...prev];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content };
      return copy;
    });
  };

  /** Drop the trailing assistant placeholder (used when surfacing a banner error). */
  const dropPlaceholder = () => {
    if (!mountedRef.current) return;
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") return prev;
      return prev.slice(0, -1);
    });
  };

  /** Cancel any pending throttled flush. */
  const clearFlushTimer = () => {
    if (flushTimerRef.current != null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingFlushRef.current = false;
  };

  /** Flush accumulated deltas to React state, throttled to avoid jank. */
  const scheduleFlush = () => {
    if (pendingFlushRef.current) return;
    pendingFlushRef.current = true;
    const gen = streamGenRef.current;
    flushTimerRef.current = setTimeout(() => {
      // Skip if the component unmounted or a newer request took over.
      if (!mountedRef.current || gen !== streamGenRef.current) {
        pendingFlushRef.current = false;
        flushTimerRef.current = null;
        return;
      }
      pendingFlushRef.current = false;
      flushTimerRef.current = null;
      replaceLastAssistant(streamedContentRef.current);
    }, 16);
  };

  const stopChat = () => {
    // Abort the in-flight request. The stream loop detects the abort and
    // finalizes whatever content we collected so far.
    streamControllerRef.current?.abort();
    clearFlushTimer();
    setIsLoading(false);
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    // Cancel any previous in-flight stream before starting a new one.
    streamControllerRef.current?.abort();
    streamControllerRef.current = null;
    // Bump the generation so any pending flush from the old request is ignored.
    streamGenRef.current += 1;
    const myGen = streamGenRef.current;
    clearFlushTimer();

    setError(null);
    setMessage("");

    const s = getProviderSpec(settings);

    // --- Fail-fast auth validation (no network round trip needed) ---
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

    const endpoint = s.buildUrl(settings);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...buildAuthHeaders(s, settings.apiKey),
    };

    // History sent to the provider = all previous messages + the new user message.
    const history: Message[] = [...messages, { role: "user", content: trimmed }];
    const body = s.buildBody(settings, history);

    // Optimistically render the user message and a streaming assistant bubble.
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    setIsLoading(true);
    streamedContentRef.current = "";
    pendingFlushRef.current = false;

    const abortCtrl = new AbortController();
    streamControllerRef.current = abortCtrl;

    try {
      let res: Response;
      try {
        res = await platformFetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: abortCtrl.signal,
        });
      } catch (netErr) {
        if (abortCtrl.signal.aborted) return;
        throw new Error(
          `Could not connect to ${endpoint}: ${
            netErr instanceof Error ? netErr.message : String(netErr)
          }`,
          { cause: netErr }
        );
      }

      if (abortCtrl.signal.aborted) return;

      if (!res.ok) {
        let detail: string = `HTTP ${res.status} ${res.statusText}`;
        try {
          const text = await res.text();
          if (text) {
            try {
              const parsed = JSON.parse(text) as JsonDict;
              const errMsg = parsed?.error as JsonDict | undefined;
              detail =
                (errMsg?.message as string) ||
                (parsed?.message as string) ||
                text;
            } catch {
              detail = text;
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

      // --- Stream the response body chunk by chunk ---
      const bodyStream = res.body;
      if (!bodyStream) {
        // Some proxies strip the body stream; fall back to a full JSON read.
        const data = (await res.json().catch(() => null)) as JsonDict | null;
        const content = data ? s.extractContent(data) : "";
        replaceLastAssistant(content);
        if (!content) setError("Empty response from model.");
        return;
      }

      const reader = bodyStream.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      try {
        // Read until the server closes the stream or we are aborted. A
        // rejected `read()` (e.g. from AbortController) propagates to the
        // outer catch, which finalizes whatever content was collected so far.
        while (!abortCtrl.signal.aborted) {
          const step = await reader.read();
          if (step.done) break;

          buffer += decoder.decode(step.value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last (possibly partial) line in the buffer.
          buffer = lines.pop() ?? "";

          for (const raw of lines) {
            let line = raw.trim();
            if (!line) continue;
            // Strip the SSE `data:` prefix when present (OpenAI, Anthropic,
            // Google, OpenRouter, Groq all use it). Bare JSON lines (Ollama
            // NDJSON) simply don't have the prefix and are parsed as-is.
            if (line.startsWith("data:")) line = line.slice(5).trim();
            if (!line) continue;
            if (line === "[DONE]") continue; // OpenAI-style end marker
            if (line.startsWith(":")) continue; // SSE keep-alive comment
            try {
              const json = JSON.parse(line);
              const delta = s.extractDelta(json);
              if (delta) {
                streamedContentRef.current += delta;
                scheduleFlush();
              }
            } catch {
              // Partial JSON across a chunk boundary — skip; it'll arrive whole next time.
              continue;
            }
          }
        }

        // Stream ended normally — commit whatever we collected.
        const collected = streamedContentRef.current;
        if (myGen === streamGenRef.current) {
          replaceLastAssistant(collected);
          if (!collected) setError("The model returned an empty response.");
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if (myGen !== streamGenRef.current) {
        // A newer request superseded this one; leave its message alone.
        return;
      }
      if (abortCtrl.signal.aborted) {
        // User stopped the generation; keep partial output, drop empty bubble.
        if (streamedContentRef.current) {
          replaceLastAssistant(streamedContentRef.current);
        } else {
          dropPlaceholder();
        }
      } else {
        setError(err instanceof Error ? err.message : "Failed to reach the AI provider.");
        dropPlaceholder();
      }
    } finally {
      clearFlushTimer();
      setIsLoading(false);
      streamControllerRef.current = null;
    }
  };

  const newChat = () => {
    streamControllerRef.current?.abort();
    streamGenRef.current += 1;
    clearFlushTimer();
    setMessages([]);
    setError(null);
  };
  return (
    <ClickSpark sparkColor="#ffffff" sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}>
      {" "}
      {/*Credit to https:Reactbits.dev for the components i use in the app */}
      <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100">
        <TopMenu
          onOpenInfoPanel={() => setInfoPanelOpen(true)}
          onOpenPrivacyPolicy={() => setPrivacyPolicyOpen(true)}
          onOpenTab2={() => setTab2Open(true)}
          onOpenChatSidebar={() => setSidebarOpen(true)}
        />
        <InfoPanel isOpen={infoPanelOpen} onClose={() => setInfoPanelOpen(false)} />
        <PrivacyPolicy isOpen={privacyPolicyOpen} onClose={() => setPrivacyPolicyOpen(false)} />
        <Tab2 isOpen={Tab2Open} onClose={() => setTab2Open(false)} />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-zinc-900/30 to-transparent" />
            <div className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/50 px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
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
                    Neo · {spec.label}
                    {settings.model && (
                      <span>· {settings.model}</span>
                    )}
                    {!settings.apiKey && spec.needsAuth && (
                      <span className="text-zinc-500">(not configured)</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={newChat}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-900 hover:text-zinc-300"
              >
                New chat
              </button>
            </div>
            <div className="absolute inset-0 z-0">
              {/*Can be edited to your liking if youre checking the source code out */}
              {/*Credit to https:Reactbits.dev for the components i use in the app */}
              <SideRays
                speed={3.5}
                rayColor1="#EAB308"
                rayColor2="#96c8ff"
                intensity={2}
                spread={10}
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
                    <div className="mb-7 flex justify-center">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-2xl bg-white/5 blur-xl" />
                      </div>
                    </div>
                    <div className="text-center">
                      <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
                        What can I help you with?
                      </h1>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
                        Ask questions, explore ideas, write, learn, or work through a problem.
                      </p>
                    </div>
                    <div className="mt-10 grid grid-cols-2 gap-3">
                      {/*<button
                        onClick={() => useSuggestion("Help me come up with an idea for a project")}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <div className="mb-3 text-sm text-zinc-400 transition group-hover:text-zinc-200">✦</div>
                        <div className="text-sm font-medium text-zinc-200">Brainstorm</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">Generate ideas and explore possibilities</div>
                      </button>*/}
                      {/*<button
                        onClick={() => useSuggestion("Explain this concept to me in a simple way")}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <div className="mb-3 text-sm text-zinc-400 transition group-hover:text-zinc-200">◇</div>
                        <div className="text-sm font-medium text-zinc-200">Learn</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">Break down difficult concepts</div>
                      </button>*/}
                      {/*<button
                        onClick={() => useSuggestion("Help me write something")}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <div className="mb-3 text-sm text-zinc-400 transition group-hover:text-zinc-200">Aa</div>
                        <div className="text-sm font-medium text-zinc-200">Write</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">Draft, rewrite, or improve your writing</div>
                      </button>
                      <button
                        onClick={() => useSuggestion("Help me solve this problem")}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <div className="mb-3 text-sm text-zinc-400 transition group-hover:text-zinc-200">→</div>
                        <div className="text-sm font-medium text-zinc-200">Solve</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">Work through a problem step by step</div>
                      </button>*/}
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
                            <div className="max-w-[75%] rounded-2xl rounded-br-md bg-zinc-800/90 px-4 py-3 text-sm leading-6 text-zinc-100 shadow-sm">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300">
                              <IoCube size={14} />
                            </div>
                            <div className="max-w-[80%] whitespace-pre-wrap pt-1 text-sm leading-7 text-zinc-300">
                              {msg.content}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300">
                          <IoCube size={14} />
                        </div>
                        <div className="flex items-center gap-1.5 pt-2">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
                        disabled
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-300 disabled:hover:bg-transparent disabled:hover:text-zinc-600 disabled:cursor-not-allowed"
                        title="Coming soon!!!!!!"
                      >
                        {"+"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        {settings.model || spec.label} ▾
                      </button>
                    </div>
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={stopChat}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/90 text-sm font-medium text-white transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-20"
                        title="Stop streaming"
                      >
                        ⏹
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!message.trim() || isLoading}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-sm font-medium text-zinc-900 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        ↑
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
          <aside
            className={`shrink-0 overflow-hidden border-l border-zinc-800/60 bg-[#0c0c0f] transition-[width] duration-200 ease-out ${
              sidebarOpen ? "w-80" : "w-0"
            }`}
          >
            {sidebarOpen && (
              <ChatSidebar
                onClose={() => setSidebarOpen(false)}
                settings={settings}
                onSave={handleSaveSettings}
              />
            )}
          </aside>
        </div>
        <StatusBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
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
          ]}
        />
      </div>
    </ClickSpark>
  );
}
