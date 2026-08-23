import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "xterm/css/xterm.css";

interface TerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Terminal({ isOpen, onClose }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  // Controls the slide animation (kept mounted so the terminal persists)
  const [shown, setShown] = useState(false);

  // Slide in / out when isOpen changes
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
  }, [isOpen]);

  // Create the xterm instance once on mount
  useEffect(() => {
    if (!containerRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: 14,
      theme: {
        background: "#1e1e1e", // Dark mode background canvas matching VS Code
        foreground: "#ffffff",
      },
    });
    term.open(containerRef.current);
    term.writeln("Terminal ready.");
    xtermRef.current = term;

    // Capture user keyboard input and invoke the Rust command
    const dataListener = term.onData((data) => {
      invoke("write_to_pty", { data }).catch(() => {});
    });

    // Listen to background stream updates coming from Rust
    let unlistenPty: (() => void) | undefined;
    listen<string>("pty-data", (event) => {
      term.write(event.payload);
    }).then((unsub) => {
      unlistenPty = unsub;
    });

    // Clean up connections on component destruction
    return () => {
      dataListener.dispose();
      if (unlistenPty) unlistenPty();
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Focus the terminal whenever it slides in
  useEffect(() => {
    if (isOpen && shown) {
      xtermRef.current?.focus();
    }
  }, [isOpen, shown]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out"
      style={{
        transform: shown ? "translateY(0)" : "translateY(100%)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
      aria-hidden={!isOpen}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-[#111111] border-t border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#f1f1eb]">Terminal</span>
          <span className="text-[11px] text-[#777873]">powershell</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] text-[#777873] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
          aria-label="Close terminal"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "45vh",
          backgroundColor: "#1e1e1e",
          padding: "8px",
        }}
      />
    </div>
  );
}