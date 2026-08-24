import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "xterm/css/xterm.css";
import { IoTerminal } from "react-icons/io5";
import { GrTerminal } from "react-icons/gr";

interface TerminalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Workspace folder the shell should cd into when it opens. */
  cwd?: string | null;
}

/** Height bounds for the resizable terminal panel (px). */
const MIN_HEIGHT = 120;
const MAX_HEIGHT_RATIO = 0.85;

export default function Terminal({ isOpen, onClose, cwd }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Controls the slide animation (kept mounted so the terminal persists)
  const [shown, setShown] = useState(false);
  // Panel height in px (resizable by dragging the top edge).
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 400 : Math.round(window.innerHeight * 0.45)
  );
  // Active drag session for the resize handle.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

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
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
      fontSize: 13,
      theme: {
        background: "#131313", // matches the app panel surface
        foreground: "#d4d4d4",
        cursor: "#ececec",
        selectionBackground: "rgba(76, 141, 255, 0.28)",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    try {
      fitAddon.fit();
    } catch {
      /* container not measurable yet */
    }
    term.writeln("Terminal initialized");
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

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
      fitAddonRef.current = null;
    };
  }, []);

  // Reflow the terminal grid whenever its container is resized.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        /* container hidden / zero-sized */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Focus the terminal whenever it slides in
  useEffect(() => {
    if (isOpen && shown) {
      xtermRef.current?.focus();
    }
  }, [isOpen, shown]);
  const syncedCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || !cwd || !xtermRef.current) return;
    if (syncedCwdRef.current === cwd) return;
    syncedCwdRef.current = cwd;
    const normalized = cwd.replace(/[\\/]+$/, "");
    invoke("write_to_pty", { data: `cd "${normalized}"\r` }).catch(() => {});
  }, [isOpen, cwd]);

  // --- Resize-handle drag logic ---
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const max = Math.round(window.innerHeight * MAX_HEIGHT_RATIO);
    const next = drag.startHeight - (e.clientY - drag.startY);
    setHeight(Math.min(max, Math.max(MIN_HEIGHT, next)));
  };

  const onResizeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out"
      style={{
        transform: shown ? "translateY(0)" : "translateY(100%)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
      aria-hidden={!isOpen}
    >
      {/* Drag handle: grab this edge to resize the terminal vertically */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize terminal"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        className="group flex h-2 w-full cursor-row-resize items-center justify-center bg-[#131313] select-none touch-none"
      >
        <span className="h-1 w-10 rounded-full bg-white/15 transition-colors group-hover:bg-white/35" />
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#131313]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b6b6b]"><IoTerminal size = {19}/></span>
          <span className = "text-[10.5px] text-[#55555]">
            <button className =" flex h-6 w-13 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text=[#ececec]">
              Problems
              </button>
              </span>
          <span className = "text-[10.5px] text-[#55555]">
            <button 
            aria-label = "coming-soon"
            className = " flex h-6 w-13 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text=[#ececec]">
              Output
              </button>
              </span>
          <span className = "text-[10.5px] text-[#55555]">
            <button 
             aria-label = "coming-soon"
            className = " flex h-6 w-13 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text=[#ececec]">
            Ports
              </button>
              </span>
          <span className="text-[10.5px] text-[#555555]"></span>
        </div>
            <button 
            className = " flex h-6 w-13 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text=[#ececec] "
            aria-label = "coming-soon"
            >
            <GrTerminal size = {14}/>
              </button>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
          aria-label="Close terminal"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: `${height}px`,
          backgroundColor: "#131313",
          padding: "8px",
        }}
      />
    </div>
  );
}