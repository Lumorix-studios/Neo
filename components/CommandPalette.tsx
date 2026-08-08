import { useState, useEffect, useRef } from "react";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
  icon?: string;
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
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#10110f] border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-lg">⌘</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-[14px] text-zinc-100 outline-none placeholder:text-zinc-600"
              autoFocus
            />
            <span className="text-[10px] text-zinc-700 uppercase tracking-wider">ESC to close</span>
          </div>
        </div>

        {/* Commands list */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="px-3 py-8 text-center text-zinc-600 text-[13px]">
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
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                  transition-colors
                  ${idx === selectedIndex ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50"}
                `}
              >
                <span className="text-lg w-6 text-center">{cmd.icon || "📋"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{cmd.label}</div>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider">{cmd.category}</div>
                </div>
                {cmd.shortcut && (
                  <span className="text-[10px] text-zinc-600 font-mono">{cmd.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.08] px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-600">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 font-mono">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 font-mono">↵</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 font-mono">ESC</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  );
}