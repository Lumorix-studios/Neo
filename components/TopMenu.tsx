import { useState, useEffect, useRef } from "react";

interface TopMenuProps {
  onOpenInfoPanel: () => void;
  onOpenPrivacyPolicy: () => void;
}

interface MenuDef {
  label: string;
  items: { label: string; action: () => void; shortcut?: string; disabled?: boolean }[];
}

export default function TopMenu({
  onOpenInfoPanel,
  onOpenPrivacyPolicy,
}: TopMenuProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menus: MenuDef[] = [
  {},
    {
      label: "Settings",
      items: [
        { label: "Information", action: onOpenInfoPanel },
        { label: "Privacy policies", action: onOpenPrivacyPolicy },
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
      className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center px-2 flex-shrink-0 z-50 relative"
      data-tauri-drag-region
    >
      <div className="relative flex items-center gap-1 z-10">
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              className={`
                px-3 py-1 text-[13px] rounded transition-colors
                ${openMenu === menu.label ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}
              `}
            >
              {menu.label}
            </button>

            {openMenu === menu.label && (
              <div className="absolute top-full left-0 mt-px w-52 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-xl overflow-hidden z-50">
                {menu.items.map((item, i) => (
                  <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => { item.action(); setOpenMenu(null); }}
                    className="
                      w-full flex items-center justify-between
                      px-3 py-1.5 text-[13px]
                      hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed
                      text-left text-zinc-300 hover:text-zinc-100
                      transition-colors
                    "
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[11px] text-zinc-600 ml-4">{item.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}