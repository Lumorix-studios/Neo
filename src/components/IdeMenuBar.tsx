import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  IoCheckmark,
  IoContractOutline,
  IoDiamondOutline,
  IoDocumentOutline,
  IoDocumentTextOutline,
  IoFolderOutline,
  IoGitNetworkOutline,
  IoSaveOutline,
  IoSettingsOutline,
  IoTerminal,
} from "react-icons/io5";

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
  className: "h-3.5 w-3.5 shrink-0",
};

const FolderGlyph = <IoFolderOutline {...iconProps} />;

const FileGlyph = <IoDocumentOutline {...iconProps} />;

const TabsGlyph = <IoDocumentTextOutline {...iconProps} />;

const TerminalGlyph = <IoTerminal {...iconProps} />;

const PanelCloseGlyph = <IoContractOutline {...iconProps} />;

const CheckGlyph = <IoCheckmark {...iconProps} />;

const SaveGlyph = <IoSaveOutline {...iconProps} />;

const GitGlyph = <IoGitNetworkOutline {...iconProps} />;
const Settings = (
  <IoSettingsOutline size={14} className="shrink-0" />
)

export default function IdeMenuBar({
  hasWorkspace,
  terminalOpen,
  onOpenFolder,
  onOpenFiles,
  onCloseAllTabs,
  onToggleTerminal,
  onOpenSettings,
  onClosePanel,
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

  const run = (fn?: () => void) => {
    setOpenMenu(null);
    fn?.();
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
  {label : "Settings", icon : Settings, onSelect: () => run(onOpenSettings) },

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
              ? "bg-(--fill-2) text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
          }`}
        >
          {title}
        </button>
        {open && (
          <div className="panel-in absolute left-0 top-full z-50 mt-px w-60 overflow-hidden rounded-[5px] border border-(--border-strong) bg-[var(--bg-elevated)] p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
            <div>
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={item.onSelect}
                  className={`flex w-full items-center gap-2.5 rounded-[3px] px-2 py-[5px] text-left text-[12.5px] transition-colors ${
                    item.disabled
                      ? "cursor-default text-[var(--text-faint)]"
                      : "text-[var(--text-primary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${item.checked ? "text-(--accent)" : "text-[var(--text-muted)]"}`}>
                    {item.checked ? CheckGlyph : item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-[11px] tracking-wide text-[var(--text-muted)]">{item.hint}</span>}
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
      <img src="/app-icon.png" alt="Agentic Coder logo" className="h-5 w-5 shrink-0" />
      {renderMenu("file", "File", fileItems)}
      {renderMenu("view", "View", viewItems)}
    </div>
  );
}