/**
 * One xterm instance bound to a backend PTY session (id-based). The parent
 * BottomPanel owns terminal ids and keeps instances mounted (hidden) so their
 * scrollback survives tab switches.
 */
import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "xterm/css/xterm.css";

export interface TerminalPrefs {
  fontSize: number;
  scrollback: number;
  cursorBlink: boolean;
}

interface TerminalViewProps {
  /** Backend PTY session id (from `terminal_create`). */
  id: number;
  /** Whether this instance is the visible tab (drives fitting). */
  active: boolean;
  /** User-configurable terminal preferences (from Settings → Terminal). */
  prefs?: TerminalPrefs;
}

interface PtyDataPayload {
  id: number;
  data: string;
}

export default function TerminalView({ id, active, prefs }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Create the xterm instance + wire it to the PTY once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || termRef.current) return;

    const term = new XTerm({
      cursorBlink: prefs?.cursorBlink ?? true,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
      fontSize: prefs?.fontSize ?? 12.5,
      scrollback: prefs?.scrollback ?? 1000,
      theme: {
        background: "var(--bg-panel)",
        foreground: "#d4d4d4",
        cursor: "#ececec",
        selectionBackground: "rgba(76, 141, 255, 0.28)",
        black: "var(--bg-panel)",
        brightBlack: "#6b6b6b",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      fit.fit();
    } catch {
      /* container not measurable yet */
    }
    // Push the real grid size so the shell wraps correctly.
    void invoke("terminal_resize", { id, rows: term.rows, cols: term.cols }).catch(
      () => {}
    );
    termRef.current = term;
    fitRef.current = fit;

    const dataListener = term.onData((data) => {
      void invoke("terminal_write", { id, data }).catch(() => {});
    });

    let unlisten: UnlistenFn | undefined;
    void listen<PtyDataPayload>("pty-data", (event) => {
      if (event.payload.id === id) term.write(event.payload.data);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      dataListener.dispose();
      unlisten?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefs only seed the constructor; live updates use the effect above
  }, [id]);

  // Live-apply preference changes to already-running terminals.
  useEffect(() => {
    const term = termRef.current;
    if (!term || !prefs) return;
    term.options.fontSize = prefs.fontSize;
    term.options.cursorBlink = prefs.cursorBlink;
    term.options.scrollback = prefs.scrollback;
    try {
      fitRef.current?.fit();
    } catch {
      /* hidden container */
    }
    void invoke("terminal_resize", { id, rows: term.rows, cols: term.cols }).catch(
      () => {}
    );
  }, [prefs, id]);

  // Reflow whenever visibility or container size changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!active) return; // fitting a hidden element throws / yields zeros
      try {
        fitRef.current?.fit();
        const term = termRef.current;
        if (term) {
          void invoke("terminal_resize", {
            id,
            rows: term.rows,
            cols: term.cols,
          }).catch(() => {});
        }
      } catch {
        /* zero-size during transitions */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, active]);

  // Focus + refit when becoming the visible tab.
  useEffect(() => {
    if (!active) return;
    try {
      fitRef.current?.fit();
    } catch {
      /* not measurable */
    }
    termRef.current?.focus();
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full px-2 py-1.5"
      style={{ display: active ? "block" : "none" }}
    />
  );
}
