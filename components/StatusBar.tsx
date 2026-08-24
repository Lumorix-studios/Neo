interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  historySidebarOpen: boolean;
  onToggleHistorySidebar: () => void;
  ideOpen?: boolean;
  onToggleIde?: () => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  /** Open workspace folder name shown next to the brand. */
  workspaceName?: string | null;
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
      className={`rounded px-1.5 py-px text-[10.5px] transition-colors ${
        active
          ? "bg-white/[0.1] text-[#ececec]"
          : "text-[#8a8a8a] hover:bg-white/[0.06] hover:text-[#d4d4d4]"
      }`}
    >
      {children}
    </button>
  );
}

export default function StatusBar({
  sidebarOpen,
  onToggleSidebar,
  historySidebarOpen,
  onToggleHistorySidebar,
  ideOpen,
  onToggleIde,
  terminalOpen,
  onToggleTerminal,
  workspaceName,
}: Props) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-white/[0.07] bg-[#131313] px-2.5 text-[10.5px]">
      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <span className="flex shrink-0 items-center gap-1 font-medium text-[#8a8a8a]">
          Neo
          <span className="rounded-sm bg-white/[0.07] px-1 text-[9px] uppercase tracking-wide">Beta</span>
        </span>
        {workspaceName && (
          <span className="flex min-w-0 shrink-0 items-center gap-1 text-[#8a8a8a]" title={workspaceName}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.75 13V3.75A.75.75 0 012.5 3h3l1.5 1.75h6a.75.75 0 01.75.75V13a.75.75 0 01-.75.75h-10.5A.75.75 0 011.75 13z" />
            </svg>
            <span className="max-w-[140px] truncate">{workspaceName}</span>
          </span>
        )}
        <span className="truncate text-[#4f4f4f]">v1.0.4</span>
      </div>

      {/* Right */}
      <div className="flex shrink-0 items-center gap-0.5">
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
        <ToggleButton
          active={sidebarOpen}
          onClick={onToggleSidebar}
          title="Toggle Settings (Ctrl+B)"
        >
          Settings
        </ToggleButton>
      </div>
    </div>
  );
}