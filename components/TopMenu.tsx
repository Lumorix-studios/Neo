import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useErrorHandler } from "../src/errorContext";

interface TopMenuProps {
  onOpenInfoPanel: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTab2: () => void;
  onOpenAiSettings: () => void;
  onOpenChatHistory: () => void;
  onOpenIde: () => void;
  onOpenTerminal: () => void;
  onOpenSettings?: () => void;
  /** Opens the command palette from the title-bar "command center" pill. */
  onOpenCommandPalette?: () => void;
  /** Optional right-aligned slot (model pill, actions) rendered in the title bar. */
  right?: ReactNode;
}

interface MenuDef {
  label: string;
  items: { label: string; action: () => void; shortcut?: string; disabled?: boolean }[];
}

export default function TopMenu({
  onOpenInfoPanel,
  onOpenPrivacyPolicy,
  onOpenTab2,
  onOpenAiSettings,
  onOpenChatHistory,
  onOpenIde,
  onOpenTerminal,
  onOpenSettings,
  onOpenCommandPalette,
  right,
}: TopMenuProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { reportError } = useErrorHandler();

  const openDocs = async () => {
    try {
      await openUrl("https://github.com/Lumorix-studios/Neo");
    } catch (error) {
      reportError(error);
    }
  };

  const menus: MenuDef[] = [
    {
      label: "File",
      items: [
        { label: "New Chat", action: onOpenChatHistory, shortcut: "Ctrl+Shift+H" },
        { label: "Open Editor", action: onOpenIde, shortcut: "Ctrl+Shift+E" },
        { label: "Open Terminal", action: onOpenTerminal, shortcut: "Ctrl+`" },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Chat History", action: onOpenChatHistory, shortcut: "Ctrl+Shift+H" },
        { label: "AI Settings…", action: onOpenAiSettings, shortcut: "Ctrl+B" },
        ...(onOpenSettings
          ? [{ label: "Settings…", action: onOpenSettings, shortcut: "Ctrl+," }]
          : []),
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Documentation", action: openDocs },
        { label: "About & Contact", action: onOpenInfoPanel },
        { label: "Privacy Policy", action: onOpenPrivacyPolicy },
        { label: "Rate Neo", action: onOpenTab2 },
      ],
    },
  ];

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <nav
      ref={menuRef}
      className="relative z-50 flex h-[35px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[var(--bg-panel)] pl-3 pr-2"
      data-tauri-drag-region
    >
      {/* Left: brand + menus */}
      <div className="flex items-center gap-1">
        <div
          className="mr-1.5 flex items-center gap-2 select-none"
          data-tauri-drag-region
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <img
              src="/app-icon.png"
              alt="Neo"
              className="h-5 w-5 rounded-md shadow-[0_0_12px_var(--accent-soft)]"
            />
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-(--accent)"
            />
          </span>
          <span className="text-[12.5px] font-semibold tracking-tight text-[#ececec]">
            Neo
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {menus.map((menu) => (
            <div key={menu.label} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
                className={`rounded-[4px] px-2 py-[3px] text-[12.5px] transition-colors ${
                  openMenu === menu.label
                    ? "bg-white/[0.09] text-[#e8e8e8]"
                    : "text-[#ababab] hover:bg-white/[0.09] hover:text-[#e8e8e8]"
                }`}
              >
                {menu.label}
              </button>

              {openMenu === menu.label && (
                <div className="panel-in absolute left-0 top-full z-50 mt-px w-64 overflow-hidden rounded-[5px] border border-white/[0.1] bg-[var(--bg-elevated)] p-[3px] shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
                  {menu.items.map((item, i) => (
                    <button
                      key={i}
                      disabled={item.disabled}
                      onClick={() => {
                        item.action();
                        setOpenMenu(null);
                      }}
                      className="flex w-full items-center justify-between rounded-[3px] px-2.5 py-[5px] text-left text-[12.5px] text-[#c9c9c9] transition-colors hover:bg-white/[0.09] hover:text-[#ececec] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="ml-8 text-[11px] tracking-wide text-[#8b8b8b]">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Center: command-center pill, VS Code title-bar style */}
      {onOpenCommandPalette && (
        <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[35px] items-center justify-center lg:flex">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            title="Search commands and files (Ctrl+P)"
            className="pointer-events-auto flex h-[22px] w-[34%] max-w-[320px] items-center justify-center gap-2 rounded-[6px] border border-white/[0.09] bg-white/[0.03] text-[11.5px] text-[#8b8b8b] transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-[#c9c9c9]"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.4" />
              <path d="M10.4 10.4L13.5 13.5" />
            </svg>
            Search Neo
          </button>
        </div>
      )}

      {/* Right: optional slot */}
      {right && <div className="flex items-center gap-2">{right}</div>}
    </nav>
  );
}