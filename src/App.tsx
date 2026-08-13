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
import "./editor.css";
import { IoCube } from "react-icons/io5";
import type { AISettings, Message } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { loadSettings, saveSettings, loadChatHistory, saveChatHistory } from "./store";

type JsonDict = Record<string, unknown>;
async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
  const inTauri = !!win.__TAURI_INTERNALS__;

  if (inTauri) {
    try {
      return await tauriFetch(url, init);
    } catch (e) {
      throw new Error(
        `Tauri HTTP request failed: ${e instanceof Error ? e.message : String(e)}`
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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => { saveSettings(settings); }, 250);
    return () => clearTimeout(t);
  }, [settings, restored]);

  useEffect(() => {
    if (!restored) return;
    const t = setTimeout(() => { saveChatHistory(messages); }, 250);
    return () => clearTimeout(t);
  }, [messages, restored]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSaveSettings = (next: AISettings) => {
    setSettings(next);
    void saveSettings(next);
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    if (!settings.apiKey) {
      setError("Please configure your API key in the AI Settings sidebar (Ctrl+B).");
      return;
    }

    const userMessage: Message = { role: "user", content: trimmed };
    const history: Message[] = [...messages, userMessage];
    setMessages(history);
    setMessage("");
    setError(null);
    setIsLoading(true);

    try {
      const base = settings.baseUrl.trim().replace(/\/+$/, "");
      if (!base) throw new Error("Base URL is empty. Check your settings.");
      const endpoint = `${base}/chat/completions`;

      const body = {
        model: settings.model,
        messages: [
          { role: "system", content: settings.systemPrompt },
          ...history.map((m: Message) => ({ role: m.role, content: m.content })),
        ],
        temperature: settings.temperature,
      };

      let res: Response;
      try {
        res = await platformFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (netErr) {
        throw new Error(
          `Could not connect to ${endpoint}: ${
            netErr instanceof Error ? netErr.message : String(netErr)
          }`
        );
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status} ${res.statusText}`;
        try {
          const text = await res.text();
          if (text) {
            try {
              const parsed = JSON.parse(text) as JsonDict;
              const errMsg = parsed?.error as JsonDict | undefined;
              detail = (errMsg?.message as string) || (parsed?.message as string) || text;
            } catch {
              detail = text;
            }
          }
        } catch {
          /* keep status detail */
        }
        throw new Error(`API error (${res.status}): ${detail}`);
      }

      const data = (await res.json()) as JsonDict;
      const choices = data?.choices as JsonDict[] | undefined;
      const messageObj = choices?.[0]?.message as JsonDict | undefined;
      const content = messageObj?.content as string | undefined;
      if (!content) throw new Error("Empty response from model.");

      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the AI provider.");
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setError(null);
  };

  const useSuggestion = (text: string) => {
    setMessage(text);
  };

  return (
    <ClickSpark sparkColor="#ffffff" sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}>
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
                  <span className="text-xs text-zinc-300"><IoCube size={18} /></span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                    <span className={`h-1.5 w-1.5 rounded-full ${settings.apiKey ? "bg-emerald-500" : "bg-zinc-600"}`} />
                    Neo{settings.apiKey ? ` · ${settings.model}` : " · Not configured"}
                  </div>
                </div>
              </div>
              <button
                onClick={newChat}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-300"
              >
                New chat
              </button>
            </div>
            <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto">
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
                      <button
                        onClick={() => useSuggestion("Help me come up with an idea for a project")}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <div className="mb-3 text-sm text-zinc-400 transition group-hover:text-zinc-200">✦</div>
                        <div className="text-sm font-medium text-zinc-200">Brainstorm</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">Generate ideas and explore possibilities</div>
                      </button>
                      <button
                        onClick={() => useSuggestion("Explain this concept to me in a simple way")}
                        className="group rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900"
                      >
                        <div className="mb-3 text-sm text-zinc-400 transition group-hover:text-zinc-200">◇</div>
                        <div className="text-sm font-medium text-zinc-200">Learn</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">Break down difficult concepts</div>
                      </button>
                      <button
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
                      </button>
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
                    placeholder={settings.apiKey ? "Message Neo..." : "Configure your API key in settings to start chatting"}
                    rows={1}
                    className="max-h-48 min-h-[58px] w-full resize-none bg-transparent px-4 pb-12 pt-4 pr-14 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
                  />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300"
                        title="Attach"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        {settings.model || "Model"} ▾
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={!message.trim() || isLoading}
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-sm font-medium text-zinc-900 transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-20"
                    >
                      ↑
                    </button>
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
          ]}
        />
      </div>
    </ClickSpark>
  );
}