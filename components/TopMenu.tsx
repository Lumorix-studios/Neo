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
        { label: "Settings", action: onOpenChatSidebar, shortcut: "Ctrl+B" },
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
      className="relative z-50 flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#131313] pl-3 pr-2"
      data-tauri-drag-region
    >
      {/* Left: brand + menus */}
      <div className="flex items-center gap-1">
        <div
          className="mr-1 flex items-center gap-1.5 select-none"
          data-tauri-drag-region
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 1l6 3.5v7L8 15l-6-3.5v-7L8 1z"
              stroke="#ececec"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path d="M8 1v7m0 0l6-3.5M8 8L2 4.5" stroke="#ececec" strokeWidth="1.2" strokeLinejoin="round" opacity="0.55" />
          </svg>
          <span className="text-[12px] font-semibold tracking-tight text-[#ececec]">
            Neo
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {menus.map((menu) => (
            <div key={menu.label} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
                onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
                className={`rounded px-2 py-[3px] text-[12px] transition-colors ${
                  openMenu === menu.label
                    ? "bg-white/[0.08] text-[#ececec]"
                    : "text-[#a3a3a3] hover:bg-white/[0.05] hover:text-[#ececec]"
                }`}
              >
                {menu.label}
              </button>

              {openMenu === menu.label && (
                <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-white/[0.09] bg-[#1a1a1a] p-1 shadow-[0_10px_32px_rgba(0,0,0,0.5)]">
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