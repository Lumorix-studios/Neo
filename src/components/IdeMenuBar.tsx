/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/Lumorix-studios/Struct) for more information on permissions to use this code.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "../i18n";
import {
  IoArrowRedoOutline,
  IoArrowUndo,
  IoCheckmark,
  IoContractOutline,
  IoDocumentOutline,
  IoDocumentTextOutline,
  IoFolderOutline,
  IoGitNetworkOutline,
  IoSaveOutline,
  IoSettingsOutline,
  IoTerminal,
} from "react-icons/io5";
import {
  historyAvailability,
  redoHistory,
  subscribeHistory,
  undoHistory,
} from "./editorHistory";

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
  /** Path of the active editor tab — which file Undo/Redo act on. */
  activePath?: string | null;
}

interface MenuItem {
  label: string;
  hint?: string;
  icon: ReactNode;
  disabled?: boolean;
  checked?: boolean;
  onSelect: () => void;
}



/**
 * Stable snapshot for `useSyncExternalStore`.
 *
 * `historyAvailability` allocates, and the store compares snapshots by identity,
 * so handing it a fresh object every render would loop forever. Caching by path
 * plus the flag pair means the reference only changes when a menu item really
 * does change state.
 */
let availabilityCache = {
  path: null as string | null,
  value: { canUndo: false, canRedo: false },
};

function cachedAvailability(path: string | null) {
  const next = historyAvailability(path);
  if (
    availabilityCache.path === path &&
    availabilityCache.value.canUndo === next.canUndo &&
    availabilityCache.value.canRedo === next.canRedo
  ) {
    return availabilityCache.value;
  }
  availabilityCache = { path, value: next };
  return next;
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

const UndoGlyph = <IoArrowUndo {...iconProps} />;

const RedoGlyph = <IoArrowRedoOutline {...iconProps} />;
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
  activePath,
}: IdeMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<"file" | "edit" | "view" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  /* Undo/Redo enabled state, straight from the editor's undo timelines. The
     snapshot is cached by path and only replaced when a flag actually flips, so
     `useSyncExternalStore` sees a stable reference between edits instead of a
     fresh object on every render. */
  const availability = useSyncExternalStore(
    subscribeHistory,
    () => cachedAvailability(activePath ?? null),
    () => cachedAvailability(activePath ?? null)
  );

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
      label: t("ide.saveFile"),
      icon: SaveGlyph,
      hint: "Ctrl+S",
      disabled: !canSave,
      onSelect: () => run(() => onSaveFile?.()),
    },
    { label: t("ide.openFolder"), icon: FolderGlyph, onSelect: () => run(onOpenFolder) },
    { label: t("ide.openFiles"), icon: FileGlyph, onSelect: () => run(onOpenFiles) },
    {
      label: t("ide.closeAllTabs"),
      icon: TabsGlyph,
      disabled: !hasWorkspace,
      onSelect: () => run(onCloseAllTabs),
    },
    { label: t("ide.closeEditorPanel"), icon: PanelCloseGlyph, onSelect: () => run(onClosePanel) },
  ];

  /* Undo/Redo drive the editor's own timelines via the shared presenter, so the
     menu and Ctrl+Z are literally the same code path — including on Linux,
     where the webview's native undo stack cannot be relied on at all. */
  const canHistory = !!activePath;
  const editItems: MenuItem[] = [
    {
      label: t("ide.undo"),
      icon: UndoGlyph,
      hint: "Ctrl+Z",
      disabled: !canHistory || !availability.canUndo,
      onSelect: () => run(() => activePath && undoHistory(activePath)),
    },
    {
      label: t("ide.redo"),
      icon: RedoGlyph,
      hint: "Ctrl+Shift+Z",
      disabled: !canHistory || !availability.canRedo,
      onSelect: () => run(() => activePath && redoHistory(activePath)),
    },
  ];

  const viewItems: MenuItem[] = [
  {label : t("ide.openSettings"), icon : Settings, onSelect: () => run(onOpenSettings) },

    {

      label: t("ide.toggleTerminal"),
      icon: TerminalGlyph,
      checked: terminalOpen,
      onSelect: () => run(onToggleTerminal),
    },
    ...(onToggleGit
      ? [
          {
            label: t("ide.toggleGit"),
            icon: GitGlyph,
            checked: gitOpen,
            onSelect: () => run(onToggleGit),
          },
        ]
      : []),
  ];

  const renderMenu = (id: "file" | "edit" | "view", title: string, items: MenuItem[]) => {
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
          <div className="panel-in absolute left-0 top-full z-50 mt-px w-60 overflow-hidden rounded-[5px]  border-(--border-strong) bg-[var(--bg-elevated)] p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
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
    <div ref={barRef} className="flex items-center gap-2.5">
      {/* Brand glyph to ground the bar */}
      <img src="../../src/assets/images/icon.jpeg" alt="Struct logo" className="h-5 w-5 shrink-0" />
      {renderMenu("file", t("cmd.file"), fileItems)}
      {renderMenu("edit", t("cmd.edit"), editItems)}
      {renderMenu("view", t("cmd.view"), viewItems)}
    </div>
  );
}