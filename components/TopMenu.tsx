import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useErrorHandler } from "../src/errorContext";

interface TopMenuProps {
  onOpenInfoPanel: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenTab2: () => void;
  onOpenChatSidebar: () => void;
  onOpenChatHistory: () => void;
  onOpenIde: () => void;
  onOpenTerminal: () => void;
  onOpenSettings?: () => void;
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
  onOpenChatSidebar,
  onOpenChatHistory,
  onOpenIde,
  onOpenTerminal,
  onOpenSettings,
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
        { label: "Chat & AI Config", action: onOpenChatSidebar, shortcut: "Ctrl+B" },
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
      className="relative z-50 flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[var(--bg-panel)] pl-3 pr-2"
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
                className={`rounded-md px-2.5 py-[4px] text-[12px] font-medium transition-colors ${
                  openMenu === menu.label
                    ? "bg-white/[0.08] text-[#ececec]"
                    : "text-[#a3a3a3] hover:bg-white/[0.05] hover:text-[#ececec]"
                }`}
              >
                {menu.label}
              </button>

              {openMenu === menu.label && (
                <div className="panel-in absolute left-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-lg border border-white/[0.09] bg-[var(--bg-elevated)] p-1 shadow-[0_10px_32px_rgba(0,0,0,0.5)]">
                  {menu.items.map((item, i) => (
                    <button
                      key={i}
                      disabled={item.disabled}
                      onClick={() => {
                        item.action();
                        setOpenMenu(null);
                      }}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-[6px] text-left text-[12px] text-[#c9c9c9] transition-colors hover:bg-white/[0.06] hover:text-[#ececec] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <span className="kbd ml-4">{item.shortcut}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: optional slot */}
      {right && <div className="flex items-center gap-2">{right}</div>}
    </nav>
  );
}