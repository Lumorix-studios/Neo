interface Props {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  historySidebarOpen: boolean;
  onToggleHistorySidebar: () => void;
}

export default function StatusBar({
  sidebarOpen,
  onToggleSidebar,
  historySidebarOpen,
  onToggleHistorySidebar,
}: Props) {
  return (
    <div className="h-6 bg-zinc-900 border-t border-zinc-800 flex items-center px-3 gap-3 shrink-0 text-[11px]">

      {/* Left side of it */}
      <div className="flex items-center gap-3 flex-1 overflow-hidden text-zinc-500">
        <span className="text-zinc-600 truncate">v.1.0.4</span>
        <span className = "text-zinc-600 truncate">BETA</span>
      </div>

      {/* Right side of it */}
      <div className="flex items-center gap-3 shrink-0 text-zinc-500">
        <button
          onClick={onToggleHistorySidebar}
          title="Toggle Chat History (Ctrl+Shift+H)"
          className={`
            flex items-center gap-1 px-2 py-0.5 rounded transition-colors
            ${historySidebarOpen
              ? "bg-cyan-500/20 text-cyan-400"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }
          `}
        >
          History
        </button>
        <button
          onClick={onToggleSidebar}
          title="Toggle Settings tab (Ctrl+B)"
          className={`
            flex items-center gap-1 px-2 py-0.5 rounded transition-colors
            ${sidebarOpen
              ? "bg-cyan-500/20 text-cyan-400"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            }
          `}
        >
        Settings
        </button>
      </div>
    </div>
  );
}