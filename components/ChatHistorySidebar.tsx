/*
 * Chat history sidebar — flat session list with search, date grouping and
 * inline delete. Purely presentational: session state lives in App.
 */
import { useMemo, useState } from "react";
import type { ChatSession } from "../src/types";
import { providerById } from "../src/providers";
import { IoAdd, IoClose, IoSearch, IoTrashOutline } from "react-icons/io5";

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

const DAY = 24 * 60 * 60 * 1000;

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  if (diff < 7 * DAY) return new Date(ts).toLocaleDateString([], { weekday: "short" });
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

type Group = "Today" | "Previous 7 days" | "Older";

function groupFor(ts: number): Group {
  const diff = Date.now() - ts;
  if (diff < DAY) return "Today";
  if (diff < 7 * DAY) return "Previous 7 days";
  return "Older";
}

const ICON_BUTTON =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-(--fill-1) hover:text-[var(--text-primary)]";

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
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((s) => {
        if (!q) return true;
        const model = s.settings?.model || providerById(s.settings?.provider ?? "openai").label;
        return `${s.title ?? ""} ${model}`.toLowerCase().includes(q);
      });
    const map: Record<Group, ChatSession[]> = { Today: [], "Previous 7 days": [], Older: [] };
    for (const s of filtered) map[groupFor(s.updatedAt)].push(s);
    return (Object.keys(map) as Group[])
      .map((label) => ({ label, items: map[label] }))
      .filter((g) => g.items.length > 0);
  }, [sessions, query]);

  return (
    <aside
      className={`shrink-0 overflow-hidden border-r border-(--border) bg-[var(--bg-panel)] transition-[width] duration-150 ease-out ${
        isOpen ? "w-[248px] max-sm:w-full" : "w-0"
      }`}
    >
      {isOpen && (
        <div className="flex h-full w-full flex-col">
          {/* Search + actions */}
          <div className="flex shrink-0 items-center gap-1.5 px-2 py-2">
            <div className="relative min-w-0 flex-1">
              <IoSearch className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats"
                spellCheck={false}
                aria-label="Search chats"
                className="h-6 w-full rounded-md bg-(--fill-1) pl-6 pr-2 text-[11.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-faint)] focus:bg-(--fill-2)"
              />
            </div>
            <button type="button" onClick={onNewChat} title="New chat" aria-label="New chat" className={ICON_BUTTON}>
              <IoAdd size={13} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close chat history"
              className={ICON_BUTTON}
            >
              <IoClose size={13} />
            </button>
          </div>

          {/* Sessions */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {groups.length === 0 && (
              <p className="px-3 py-6 text-center text-[11px] text-[var(--text-muted)]">
                {query.trim() ? "No chats match." : "No chats yet."}
              </p>
            )}
            {groups.map((group) => (
              <div key={group.label} className="pt-3 first:pt-0">
                <p className="px-3 pb-1 text-[10.5px] text-[var(--text-faint)]">{group.label}</p>
                {group.items.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const confirming = confirmId === session.id;
                  const model =
                    session.settings?.model ||
                    providerById(session.settings?.provider ?? "openai").label;
                  return (
                    <div
                      key={session.id}
                      className={`group relative flex items-center ${
                        isActive ? "bg-(--fill-1)" : "hover:bg-(--fill-1)"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className="min-w-0 flex-1 px-3 py-2 text-left"
                      >
                        <span
                          className={`block truncate text-[12px] ${
                            isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {session.title || "Untitled chat"}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-[var(--text-muted)]">
                          {formatRelative(session.updatedAt)}
                          {model ? ` · ${model}` : ""}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={confirming ? "Click again to delete" : "Delete chat"}
                        title={confirming ? "Click again to delete" : "Delete chat"}
                        onClick={() => {
                          if (confirming) {
                            onDeleteSession(session.id);
                            setConfirmId(null);
                          } else {
                            setConfirmId(session.id);
                          }
                        }}
                        className={`mr-1.5 flex h-6 shrink-0 items-center justify-center rounded-md transition ${
                          confirming
                            ? "w-auto px-1.5 text-[10px] text-red-400/90"
                            : "w-6 text-[var(--text-muted)] opacity-0 hover:text-red-400/90 group-hover:opacity-100"
                        }`}
                      >
                        {confirming ? "Delete?" : <IoTrashOutline size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="shrink-0 border-t border-(--border) px-3 py-2 text-[10px] text-[var(--text-faint)]">
            {signedIn ? "Synced to your account." : "Stored on this device."}
          </p>
        </div>
      )}
    </aside>
  );
}
