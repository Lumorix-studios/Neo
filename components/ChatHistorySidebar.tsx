import { useState } from "react";
import {
  IoClose,
  IoTrash,
  IoChatbubbleEllipses,
  IoAdd,
  IoTime,
} from "react-icons/io5";
import type { ChatSession } from "../src/types";

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
      className={`shrink-0 overflow-hidden border-r border-zinc-800/60 bg-[#0c0c0f] transition-[width] duration-200 ease-out ${
        isOpen ? "w-72 max-sm:w-full" : "w-0"
      }`}
    >
      {isOpen && (
        <div className="flex h-full w-full flex-col bg-[#0c0c0f] text-zinc-100">
          {/* Header */}
          <header className="flex h-12 items-center gap-2 border-b border-white/[0.08] px-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-300">
              <IoChatbubbleEllipses size={18} />
            </div>
            <span className="text-[12px] font-semibold tracking-tight">CHAT HISTORY</span>
            <div className="flex-1" />
            <button
              type="button"
              aria-label="Close"
              title="Close"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <IoClose size={16} />
            </button>
          </header>

          {/* New chat button */}
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={onNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-white/[0.06] hover:border-white/[0.15]"
            >
              <IoAdd size={16} />
              New Chat
            </button>
          </div>

          {/* Session list */}
          <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <IoChatbubbleEllipses size={28} className="text-zinc-700" />
                <p className="text-[13px] text-zinc-500">No saved chats yet</p>
                <p className="text-[11px] text-zinc-600">
                  Start a conversation and it will appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {sorted.map((session) => {
                  const isActive = session.id === activeSessionId;
                  return (
                    <div
                      key={session.id}
                      className={`group relative flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors cursor-pointer ${
                        isActive
                          ? "bg-white/[0.08] text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                      }`}
                      onClick={() => {
                        onSelectSession(session.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium leading-5">
                          {session.title || "Untitled chat"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-600">
                          <IoTime size={10} />
                          {formatDate(session.updatedAt)}
                          <span className="text-zinc-700">·</span>
                          {session.messages.length} messages
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
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
                          confirmDeleteId === session.id
                            ? "bg-red-500/20 text-red-400"
                            : "text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] hover:text-red-400"
                        }`}
                      >
                        <IoTrash size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          {/* Footer hint */}
          <footer className="border-t border-white/[0.06] px-3 py-2">
            <p className="text-center text-[10px] leading-4 text-zinc-600">
              Chats are stored locally on this device.
            </p>
          </footer>
        </div>
      )}
    </aside>
  );
}