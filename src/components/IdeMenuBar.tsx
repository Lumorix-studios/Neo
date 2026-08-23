import { useEffect, useRef, useState, type ReactNode } from "react";

interface IdeMenuBarProps {
  hasWorkspace: boolean;
  terminalOpen: boolean;
  onOpenFolder: () => void;
  onOpenFiles: () => void;
  onCloseAllTabs: () => void;
  onToggleTerminal: () => void;
  onClosePanel: () => void;
}

interface MenuItem {
  label: string;
  hint?: string;
  icon: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onSelect: () => void;
}

/* --- Small stroke icons for menu rows ------------------------------------ */

const iconProps = {
  viewBox: "0 0 16 16",
  className: "h-3.5 w-3.5 shrink-0",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const FolderGlyph = (
  <svg {...iconProps}>
    <path d="M1.75 13V3.75A.75.75 0 0 1 2.5 3h3l1.5 1.75h6a.75.75 0 0 1 .75.75V13a.75.75 0 0 1-.75.75h-10.5A.75.75 0 0 1 1.75 13z" />
  </svg>
);

const FileGlyph = (
  <svg {...iconProps}>
    <path d="M4 1.75h5.2L12.5 5v8.25a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1zM9.2 1.75V5h3.3" />
  </svg>
);

const TabsGlyph = (
  <svg {...iconProps}>
    <rect x="1.75" y="4.25" width="10" height="8.5" rx="1.2" />
    <path d="M4.5 4.25V2.75a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-.75" />
  </svg>
);

const TerminalGlyph = (
  <svg {...iconProps}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" />
    <path d="M4.5 6l2 1.7-2 1.7M8 9.8h3.5" />
  </svg>
);

const PanelCloseGlyph = (
  <svg {...iconProps}>
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.6" />
    <path d="M10 2.75v10.5M12 6.5l-1.5 1.5L12 9.5" />
  </svg>
);

const CheckGlyph = (
  <svg {...iconProps} strokeWidth={1.8}>
    <path d="M3 8.5l3.2 3L13 4.5" />
  </svg>
);

/* --- Component ------------------------------------------------------------ */

export default function IdeMenuBar({
  hasWorkspace,
  terminalOpen,
  onOpenFolder,
  onOpenFiles,
  onCloseAllTabs,
  onToggleTerminal,
  onClosePanel,
}: IdeMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "view" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click / Escape
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const run = (fn: () => void) => {
    setOpenMenu(null);
    fn();
  };

  const fileItems: MenuItem[] = [
    { label: "Open Folder…", icon: FolderGlyph, onSelect: () => run(onOpenFolder) },
    { label: "Open File…", icon: FileGlyph, onSelect: () => run(onOpenFiles) },
    {
      label: "Close All Tabs",
      icon: TabsGlyph,
      disabled: !hasWorkspace,
      onSelect: () => run(onCloseAllTabs),
    },
    { label: "Close Editor Panel", icon: PanelCloseGlyph, onSelect: () => run(onClosePanel) },
  ];

  const viewItems: MenuItem[] = [
    {
      label: terminalOpen ? "Close Terminal" : "Open Terminal",
      icon: TerminalGlyph,
      checked: terminalOpen,
      onSelect: () => run(onToggleTerminal),
    },
  ];

  const renderMenu = (id: "file" | "view", title: string, items: MenuItem[]) => {
    const open = openMenu === id;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(open ? null : id)}
          onMouseEnter={() => openMenu && setOpenMenu(id)}
          className={`rounded-md px-2 py-[3px] text-[11.5px] font-medium transition-colors ${
            open ? "bg-white/[0.09] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
          }`}
        >
          {title}
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#16161b]/95 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                onClick={item.onSelect}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-[6px] text-left text-[12px] transition-colors ${
                  item.disabled
                    ? "cursor-default text-zinc-600"
                    : "text-zinc-300 hover:bg-sky-500/[0.14] hover:text-zinc-100"
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${item.checked ? "text-sky-400" : "text-zinc-500"}`}>
                  {item.checked ? CheckGlyph : item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={barRef} className="flex items-center gap-0.5">
      {renderMenu("file", "File", fileItems)}
      {renderMenu("view", "View", viewItems)}
    </div>
  );
}