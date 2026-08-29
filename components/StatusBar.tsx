interface Props {
  historySidebarOpen: boolean;
  onToggleHistorySidebar: () => void;
  ideOpen?: boolean;
  onToggleIde?: () => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  /** Open workspace folder name shown next to the brand. */
  workspaceName?: string | null;
  /**
   * Live editor stats contributed by status-bar extensions (Word Count,
   * TODO Inspector) — null while neither is installed/enabled.
   */
  editorStats?: {
    words: number;
    chars: number;
    lines: number;
    todos: number;
    showWords: boolean;
    showTodos: boolean;
  } | null;
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded px-1.5 py-px text-[11px] transition-colors ${
        active
          ? "bg-white/[0.12] text-[#e8e8e8]"
          : "text-[#8b8b8b] hover:bg-white/[0.1] hover:text-[#d4d4d4]"
      }`}
    >
      {children}
    </button>
  );
}

export default function StatusBar({
  historySidebarOpen,
  onToggleHistorySidebar,
  ideOpen,
  onToggleIde,
  terminalOpen,
  onToggleTerminal,
  workspaceName,
  editorStats,
}: Props) {
  return (
    <div className="flex h-[22px] shrink-0 items-center gap-3 border-t border-white/[0.07] bg-[var(--bg-panel)] px-2 text-[11px] text-[#8b8b8b]">
      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <span className="flex shrink-0 items-center gap-1 font-medium text-[#8a8a8a]">
          <span className="h-1.5 w-1.5 rounded-full bg-(--accent)" />
          Neo
        </span>
        {workspaceName && (
          <span className="flex min-w-0 shrink-0 items-center gap-1 text-[#8a8a8a]" title={workspaceName}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.75 13V3.75A.75.75 0 012.5 3h3l1.5 1.75h6a.75.75 0 01.75.75V13a.75.75 0 01-.75.75h-10.5A.75.75 0 011.75 13z" />
            </svg>
            <span className="max-w-[140px] truncate">{workspaceName}</span>
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-0.5">
        {editorStats && (
          <div className="mr-1.5 flex items-center gap-3 pr-1 text-[#8a8a8a]">
            {editorStats.showTodos && (
              <span title="TODO / FIXME / HACK / XXX comments in the active file">
                {editorStats.todos} TODOs
              </span>
            )}
            {editorStats.showWords && (
              <span title="Word, character and line count of the active file">
                {editorStats.words} words · {editorStats.chars} chars ·{" "}
                {editorStats.lines} lines
              </span>
            )}
          </div>
        )}
        {onToggleTerminal && (
          <ToggleButton
            active={terminalOpen}
            onClick={onToggleTerminal}
            title="Toggle Terminal (Ctrl+`)"
          >
            Terminal
          </ToggleButton>
        )}
        {onToggleIde && (
          <ToggleButton
            active={ideOpen}
            onClick={onToggleIde}
            title="Toggle Editor (Ctrl+Shift+E)"
          >
            Editor
          </ToggleButton>
        )}
        <ToggleButton
          active={historySidebarOpen}
          onClick={onToggleHistorySidebar}
          title="Toggle Chat History (Ctrl+Shift+H)"
        >
          History
        </ToggleButton>
      </div>
    </div>
  );
}