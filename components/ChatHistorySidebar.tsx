import { useState } from "react";
import type { ChatSession } from "../src/types";
import { providerById } from "../src/providers";
import { IoAdd, IoChatbubbleOutline, IoClose, IoTrashOutline } from "react-icons/io5";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  /** True when the user is signed in — chats then sync to their account. */
  signedIn?: boolean;
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
  signedIn = false,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const syncFooterText = signedIn
    ? "Chats sync to your account across devices."
    : "Chats are stored locally on this device.";

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside
      className={`shrink-0 overflow-hidden border-r border-(--border) bg-[var(--bg-panel)] transition-[width] duration-200 ease-out ${
        isOpen ? "w-[260px] max-sm:w-full" : "w-0"
      }`}
    >
      {isOpen && (
        <div className="flex h-full w-full flex-col bg-[var(--bg-panel)] text-[var(--text-primary)]">
          {/* Header */}
          <header className="flex h-10 shrink-0 items-center justify-between px-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Chats
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="New chat"
                title="New chat"
                onClick={onNewChat}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
              >
                <IoAdd size={14} />
              </button>
              <button
                type="button"
                aria-label="Close"
                title="Close"
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
              >
                <IoClose size={12} />
              </button>
            </div>
          </header>

          {/* Session list */}
          <main className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 py-14 text-center">
                <IoChatbubbleOutline size={22} className="text-[var(--text-faint)]" />
                <p className="text-[12px] text-[var(--text-muted)]">No saved chats yet</p>
                <p className="text-[11px] text-[var(--text-faint)]">
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
                          ? "bg-(--fill-2) text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:bg-(--fill-1) hover:text-[var(--text-primary)]"
                      }`}
                      onClick={() => {
                        onSelectSession(session.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-(--accent)" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium leading-5">
                          {session.title || "Untitled chat"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-4 text-[var(--text-muted)]">
                          <span>{formatDate(session.updatedAt)}</span>
                          {session.settings && (
                            <>
                              <span className="text-[var(--text-faint)]">·</span>
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
                            : "text-[var(--text-muted)] opacity-0 hover:bg-(--fill-2) hover:text-red-400 group-hover:opacity-100"
                        }`}
                      >
                        {confirmDeleteId === session.id ? (
                          <IoTrashOutline size={12} />
                        ) : (
                          <IoTrashOutline size={12} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          {/* Footer hint */}
          <footer className="border-t border-(--border) px-3 py-2">
            <p className="text-center text-[10px] leading-4 text-[var(--text-faint)]">
              {syncFooterText}
            </p>
          </footer>
        </div>
      )}
    </aside>
  );
}