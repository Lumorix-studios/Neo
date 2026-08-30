import { useEffect, useRef, useState, type ReactNode } from "react";

interface IdeMenuBarProps {
  hasWorkspace: boolean;
  terminalOpen: boolean;
  onOpenFolder: () => void;
  onOpenFiles: () => void;
  onCloseAllTabs: () => void;
  onToggleTerminal: () => void;
  onClosePanel: () => void;
  onOpenSettings?: () => void;
  /** True when the active editor tab has unsaved changes. */
  canSave?: boolean;
  /** Saves the active editor tab. */
  onSaveFile?: () => void;
  /** Git panel open state + toggle (IDE window). */
  gitOpen?: boolean;
  onToggleGit?: () => void;
}

interface MenuItem {
  label: string;
  hint?: string;
  icon: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onSelect: () => void;
}



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

const GearGlyph = (
  <svg {...iconProps}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.6l.7 1.7a4.9 4.9 0 011.7.7l1.8-.6 1.2 2-1.1 1.5a4.9 4.9 0 010 1.9l1.1 1.5-1.2 2-1.8-.6a4.9 4.9 0 01-1.7.7L8 14.4l-.7-1.7a4.9 4.9 0 01-1.7-.7l-1.8.6-1.2-2 1.1-1.5a4.9 4.9 0 010-1.9L2.6 5.7l1.2-2 1.8.6a4.9 4.9 0 011.7-.7z" />
  </svg>
);

const SaveGlyph = (
  <svg {...iconProps}>
    <path d="M3.5 3h7.4l2.1 2.1v7.4a.5.5 0 01-.5.5H3.5a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5z" />
    <path d="M5.5 3v3.4h4.4V3" />
    <path d="M5.5 13V9.2h5V13" />
  </svg>
);

const GitGlyph = (
  <svg {...iconProps}>
    <circle cx="5" cy="4" r="1.9" />
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="11.5" cy="8" r="1.9" />
    <path d="M5 5.9v4.2M6.9 4.7l2.9 2.1M6.9 11.3l2.9-2.1" />
  </svg>
);


export default function IdeMenuBar({
  hasWorkspace,
  terminalOpen,
  onOpenFolder,
  onOpenFiles,
  onCloseAllTabs,
  onToggleTerminal,
  onClosePanel,
  onOpenSettings,
  canSave,
  onSaveFile,
  gitOpen,
  onToggleGit,
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
    {
      label: "Save",
      icon: SaveGlyph,
      hint: "Ctrl+S",
      disabled: !canSave,
      onSelect: () => run(() => onSaveFile?.()),
    },
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
    ...(onToggleGit
      ? [
          {
            label: gitOpen ? "Hide Git Tools" : "Show Git Tools",
            icon: GitGlyph,
            checked: gitOpen,
            onSelect: () => run(onToggleGit),
          },
        ]
      : []),
  ];

  const renderMenu = (id: "file" | "view", title: string, items: MenuItem[]) => {
    const open = openMenu === id;
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu(open ? null : id)}
          onMouseEnter={() => openMenu && setOpenMenu(id)}
          className={`flex items-center gap-1.5 rounded-[4px] px-2 py-[3px] text-[12.5px] transition-colors ${
            open
              ? "bg-white/[0.09] text-[#e8e8e8]"
              : "text-[#ababab] hover:bg-white/[0.09] hover:text-[#e8e8e8]"
          }`}
        >
          {title}
        </button>
        {open && (
          <div className="panel-in absolute left-0 top-full z-50 mt-px w-60 overflow-hidden rounded-[5px] border border-white/[0.1] bg-[var(--bg-elevated)] p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
            <div>
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={item.onSelect}
                  className={`flex w-full items-center gap-2.5 rounded-[3px] px-2 py-[5px] text-left text-[12.5px] transition-colors ${
                    item.disabled
                      ? "cursor-default text-[#555555]"
                      : "text-[#c9c9c9] hover:bg-white/[0.09] hover:text-[#ececec]"
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${item.checked ? "text-(--accent)" : "text-[#6b6b6b]"}`}>
                    {item.checked ? CheckGlyph : item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-[11px] tracking-wide text-[#8b8b8b]">{item.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={barRef} className="flex items-center gap-0.5">
      {/* Brand glyph to ground the bar */}
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#8a8a8a" strokeWidth="1.1" strokeLinejoin="round" className="mr-1 opacity-80">
        <path d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z" />
        <path d="M8 1v7m0 0l6-3.5M8 8L2 4.5" opacity="0.5" />
      </svg>
      {renderMenu("file", "File", fileItems)}
      {renderMenu("view", "View", viewItems)}
    </div>
  );
}