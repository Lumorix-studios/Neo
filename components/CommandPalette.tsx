import { useState, useEffect, useRef } from "react";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[14vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.09] bg-[#161616] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        {/* Input */}
        <div className="border-b border-white/[0.07] px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command…"
            spellCheck={false}
            className="w-full bg-transparent text-[13px] text-[#ececec] outline-none placeholder:text-[#555555]"
          />
        </div>

        {/* Commands list */}
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-[#6b6b6b]">
              No commands found
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  idx === selectedIndex ? "bg-white/[0.07] text-[#ececec]" : "text-[#a3a3a3]"
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{cmd.label}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#555555]">
                  {cmd.category}
                </span>
                {cmd.shortcut && <span className="kbd shrink-0">{cmd.shortcut}</span>}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2 text-[10px] text-[#6b6b6b]">
          <span className="flex items-center gap-1.5">
            <span className="kbd">↑↓</span> Navigate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="kbd">↵</span> Select
          </span>
          <span className="flex items-center gap-1.5">
            <span className="kbd">Esc</span> Close
          </span>
        </div>
      </div>
    </div>
  );
}