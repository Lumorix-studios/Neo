import { useState } from "react";
import type { ChatSession } from "../src/types";
import { providerById } from "../src/providers";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  const day = 24 * 60 * 60 * 1000;

  if (diff < day) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * day) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatHistorySidebar({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      className={`shrink-0 overflow-hidden border-r border-white/[0.07] bg-[#131313] transition-[width] duration-200 ease-out ${
        isOpen ? "w-[260px] max-sm:w-full" : "w-0"
      }`}
    >
      {isOpen && (
        <div className="flex h-full w-full flex-col bg-[#131313] text-[#ececec]">
          {/* Header */}
          <header className="flex h-10 shrink-0 items-center justify-between px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b6b6b]">
              Chats
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="New chat"
                title="New chat"
                onClick={onNewChat}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Close"
                title="Close"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </header>

          {/* Session list */}
          <main className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-14 text-center">
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#4a4a4a" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 10.5a1.5 1.5 0 01-1.5 1.5H5l-3 3V3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7z" />
                </svg>
                <p className="text-[12px] text-[#6b6b6b]">No saved chats yet</p>
                <p className="text-[11px] text-[#4a4a4a]">
                  Start a conversation and it will appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-px">
                {sorted.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      className={`group relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 transition-colors ${
                        isActive
                          ? "bg-white/[0.07] text-[#ececec]"
                          : "text-[#a3a3a3] hover:bg-white/[0.04] hover:text-[#d4d4d4]"
                      }`}
                      onClick={() => {
                        onSelectSession(session.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[#4c8dff]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium leading-5">
                          {session.title || "Untitled chat"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-4 text-[#6b6b6b]">
                          <span>{formatDate(session.updatedAt)}</span>
                          {session.settings && (
                            <>
                              <span className="text-[#3f3f3f]">·</span>
                              <span className="truncate">
                                {session.settings.model || providerById(session.settings.provider).label}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        aria-label="Delete chat"
                        title="Delete chat"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirmDeleteId === session.id) {
                            onDeleteSession(session.id);
                            setConfirmDeleteId(null);
                          } else {
                            setConfirmDeleteId(session.id);
                          }
                        }}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${
                          confirmDeleteId === session.id
                            ? "bg-red-500/15 text-red-400"
                            : "text-[#6b6b6b] opacity-0 hover:bg-white/[0.06] hover:text-red-400 group-hover:opacity-100"
                        }`}
                      >
                        {confirmDeleteId === session.id ? (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 001 .95h3.8a1 1 0 001-.95l.6-8" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 001 .95h3.8a1 1 0 001-.95l.6-8" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          {/* Footer hint */}
          <footer className="border-t border-white/[0.06] px-3 py-2">
            <p className="text-center text-[10px] leading-4 text-[#4a4a4a]">
              Chats are stored locally on this device.
            </p>
          </footer>
        </div>
      )}
    </aside>
  );
}