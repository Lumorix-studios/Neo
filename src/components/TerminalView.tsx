/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */

import { useEffect, useEffectEvent, useRef } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "xterm/css/xterm.css";

/** Build the xterm palette from the resolved theme so the terminal follows
    custom/bright background colors instead of staying hardcoded dark. */
function termThemeFromDoc() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    background: v("--bg-chrome", "#0a0a0a"),
    foreground: v("--text-primary", "#d4d4d4"),
    cursor: v("--text-primary", "#cccccc"),
    cursorAccent: v("--text-muted", "#181818"),
    selectionBackground: v("--accent-soft", "rgba(76, 141, 255, 0.28)"),
    black: v("--bg-active", "#181818"),
    brightBlack: v("--text-muted", "#6b6b6b"),
  };
}

export interface TerminalPrefs {
  fontSize: number;
  scrollback: number;
  cursorBlink: boolean;
}

interface TerminalViewProps {
  id: number;
  active: boolean;
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

  /** Seed the terminal options from prefs. An effect event because prefs only
   *  bootstrap the constructor — live changes are applied by the effect below,
   *  so the creation effect must stay keyed on `id` alone. */
  const seedOptions = useEffectEvent(() => ({
    cursorBlink: prefs?.cursorBlink ?? true,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
    fontSize: prefs?.fontSize ?? 12.5,
    lineHeight: 1.2,
    scrollback: prefs?.scrollback ?? 1000,
    theme: termThemeFromDoc(),
  }));

  // Create the xterm instance + wire it to the PTY once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || termRef.current) return;

    const term = new XTerm(seedOptions());
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
  }, [id]);

  // Live-apply preference changes to already-running terminals.
  useEffect(() => {
    const term = termRef.current;
    if (!term || !prefs) return;
    term.options.fontSize = prefs.fontSize;
    term.options.cursorBlink = prefs.cursorBlink;
    term.options.scrollback = prefs.scrollback;
    // Read the ref before the try so the optional chain is not a "value block"
    // inside the try/catch (that pattern blocks React Compiler optimization).
    const fit = fitRef.current;
    if (fit) {
      try {
        fit.fit();
      } catch {
        /* hidden container */
      }
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
      className="h-full w-full px-3 py-2"
      style={{ display: active ? "block" : "none" }}
    />
  );
}
