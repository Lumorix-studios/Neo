/**
 * VS Code-style bottom dock: Terminal | Problems | Debug Console | Output |
 * Ports. Resizable by dragging its top edge; terminal instances persist while
 * the dock is open so scrollback survives tab switches.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IoAdd,
  IoAlertCircle,
  IoCodeSlash,
  IoDocumentText,
  IoEyeOutline,
  IoPulse,
  IoTerminal,
  IoTrash,
} from "react-icons/io5";
import TerminalView, { type TerminalPrefs } from "./TerminalView";
import ProblemsPanel from "./ProblemsPanel";
import Markdown from "./Markdown";
import DebugConsole from "./DebugConsole";
import OutputPanel from "./OutputPanel";
import PortsPanel from "./PortsPanel";

export type PanelTab = "terminal" | "problems" | "debug" | "output" | "ports" | "preview";

interface BottomPanelProps {
  open: boolean;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  /** Workspace folder (terminal cwd / problems scan root). */
  root: string | null;
  /** Jump to a file (and optionally a line) in the editor. */
  onOpenFile: (path: string, line?: number) => void;
  /** User-configurable terminal preferences (from Settings → Terminal). */
  terminalPrefs?: TerminalPrefs;
  /**
   * Live Markdown preview contributed by the Markdown Preview Enhanced
   * extension — null while the extension is not installed/enabled.
   */
  preview?: { path: string | null; content: string } | null;
}

const MIN_HEIGHT = 140;

const TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "terminal", label: "Terminal", icon: <IoTerminal size={12} /> },
  { id: "problems", label: "Problems", icon: <IoAlertCircle size={12} /> },
  { id: "debug", label: "Debug Console", icon: <IoCodeSlash size={12} /> },
  { id: "output", label: "Output", icon: <IoDocumentText size={12} /> },
  { id: "ports", label: "Ports", icon: <IoPulse size={12} /> },
];

/** Extension-contributed tab (Markdown Preview Enhanced). */
const PREVIEW_TAB: { id: PanelTab; label: string; icon: React.ReactNode } = {
  id: "preview",
  label: "Preview",
  icon: <IoEyeOutline size={12} />,
};

export default function BottomPanel({
  open,
  tab,
  onTab,
  onClose,
  root,
  onOpenFile,
  terminalPrefs,
  preview,
}: BottomPanelProps) {
  // --- Terminal instance management ---
  const [terms, setTerms] = useState<number[]>([]);
  const [activeTerm, setActiveTerm] = useState<number | null>(null);
  const [problemCount, setProblemCount] = useState(0);
  const [termError, setTermError] = useState<string | null>(null);
  const [spawning, setSpawning] = useState(false);
  // Mirrors `terms` so the lazy-spawn effect can read it without re-running.
  const termsRef = useRef<number[]>([]);

  const createTerm = useCallback(async () => {
    setTermError(null);
    setSpawning(true);
    try {
      // Race the IPC call against a 5s timeout so a stale/missing backend
      // can never leave the UI spinning forever.
      const id = await Promise.race([
        invoke<number>("terminal_create", { cwd: root }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Backend did not respond — the Rust side is not rebuilt. Run: npm run tauri dev")), 5000)
        ),
      ]);
      setTerms((prev) => {
        const next = [...prev, id];
        termsRef.current = next;
        return next;
      });
      setActiveTerm(id);
    } catch (e) {
      setTermError(e instanceof Error ? e.message : String(e));
    } finally {
      setSpawning(false);
    }
  }, [root]);

  const killTerm = useCallback(async (id: number) => {
    try {
      await invoke("terminal_kill", { id });
    } catch {
      /* already gone */
    }
    setTerms((prev) => {
      const next = prev.filter((t) => t !== id);
      termsRef.current = next;
      setActiveTerm(next[next.length - 1] ?? null);
      return next;
    });
  }, []);

  // Lazily spawn the first shell when the terminal tab is shown and the
  // panel is open. Once a spawn fails, we stop auto-retrying (the Retry
  // button re-attempts manually) so the effect can never loop.
  useEffect(() => {
    if (!open || tab !== "terminal") return;
    if (termsRef.current.length > 0 || spawning || termError) return;
    void createTerm();
  }, [open, tab, createTerm, spawning, termError]);

  // --- Dock resize (drag the top edge) ---
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 280 : Math.round(window.innerHeight * 0.35)
  );
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Dragging up grows the dock.
    const max = Math.round(window.innerHeight * 0.7);
    setHeight(
      Math.min(max, Math.max(MIN_HEIGHT, drag.startHeight - (e.clientY - drag.startY)))
    );
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
    <section
      aria-label="Panel"
      className="flex shrink-0 flex-col overflow-hidden border-t border-white/[0.07] bg-[var(--bg-panel)] transition-[height] duration-200 ease-out"
      style={{ height: open ? height : 0 }}
      aria-hidden={!open}
    >
      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize panel"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        className="group flex h-1.5 shrink-0 cursor-row-resize touch-none select-none items-center justify-center bg-[var(--bg-panel)]"
      >
        <span className="h-0.5 w-10 rounded-full bg-white/10 transition-colors group-hover:bg-white/30" />
      </div>

      {/* Tab strip + terminal instance controls */}
      <div className="flex h-8 shrink-0 items-stretch border-b border-white/[0.05]">
        <div className="flex min-w-0 items-stretch">
          {/* The Preview tab is contributed at runtime by the Markdown Preview
              Enhanced extension — it only exists while that extension is on. */}
          {[...TABS, ...(preview ? [PREVIEW_TAB] : [])].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`relative flex items-center gap-1.5 px-3 text-[11px] font-medium uppercase tracking-wide transition ${
                tab === t.id
                  ? "text-[#ececec]"
                  : "text-[#6b6b6b] hover:bg-white/[0.03] hover:text-[#a3a3a3]"
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === "problems" && problemCount > 0 && (
                <span className="rounded-full bg-white/[0.08] px-1.5 text-[9.5px] leading-4 text-zinc-300">
                  {problemCount}
                </span>
              )}
              {tab === t.id && (
                <span className="absolute inset-x-2 top-0 h-[2px] rounded-b bg-(--accent)" />
              )}
            </button>
          ))}
        </div>

        {/* Right side: terminal instance switcher / close */}
        <div className="ml-auto flex shrink-0 items-center gap-1 px-2">
          {tab === "terminal" && (
            <>
              <div className="mr-1 flex max-w-[220px] items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {terms.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTerm(id)}
                    className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] transition ${
                      activeTerm === id
                        ? "bg-white/[0.09] text-[#ececec]"
                        : "text-[#8a8a93] hover:bg-white/[0.05] hover:text-[#c9c9c9]"
                    }`}
                    title={`Terminal ${i + 1}`}
                  >
                    <IoTerminal size={10} />
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void createTerm()}
                title="New terminal"
                aria-label="New terminal"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#8a8a93] transition hover:bg-white/[0.06] hover:text-[#ececec]"
              >
                <IoAdd size={14} />
              </button>
              <button
                type="button"
                onClick={() => activeTerm != null && void killTerm(activeTerm)}
                disabled={activeTerm == null}
                title="Kill terminal"
                aria-label="Kill terminal"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[#8a8a93] transition hover:bg-white/[0.06] hover:text-[#ececec] disabled:pointer-events-none disabled:opacity-40"
              >
                <IoTrash size={12} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close panel"
            aria-label="Close panel"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

      </div>

      {/* Content — terminals stay mounted (hidden) to preserve scrollback */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "terminal" && (
          <>
            {terms.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                {termError ? (
                  <>
                    <p className="text-[12px] font-medium text-[#e5534b]">
                      Could not start terminal
                    </p>
                    <p className="max-w-sm whitespace-pre-wrap text-[11px] leading-5 text-[#8a8a93]">
                      {termError}
                    </p>
                    <p className="text-[10.5px] text-[#6b6b6b]">
                      This usually means the app was rebuilt without the new
                      backend. Try{" "}
                      <span className="font-mono">npm run tauri dev</span> to
                      rebuild the Rust side.
                    </p>
                    <button
                      type="button"
                      onClick={() => void createTerm()}
                      disabled={spawning}
                      className="rounded-md bg-[#ececec] px-3 py-1.5 text-[12px] font-medium text-[#111111] transition hover:bg-white disabled:opacity-40"
                    >
                      Retry
                    </button>
                  </>
                ) : spawning ? (
                  <p className="flex items-center gap-2 text-[11.5px] text-[#6b6b6b]">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M8 1.5a6.5 6.5 0 106.5 6.5" />
                    </svg>
                    Spawning shell…
                  </p>
                ) : (
                  <p className="text-[11.5px] text-[#6b6b6b]">
                    Terminal closed — open it from the rail or press{" "}
                    <span className="font-mono">Ctrl+`</span>
                  </p>
                )}
              </div>
            )}
            {terms.map((id) => (
              <TerminalView
                key={id}
                id={id}
                active={open && tab === "terminal" && id === activeTerm}
                prefs={terminalPrefs}
              />
            ))}
          </>
        )}
        {tab === "problems" && (
          <ProblemsPanel
            root={root}
            onOpenFile={onOpenFile}
            onCount={(errors) => setProblemCount(errors)}
          />
        )}
        {tab === "debug" && <DebugConsole root={root} />}
        {tab === "output" && <OutputPanel />}
        {tab === "ports" && <PortsPanel active={open} />}
        {tab === "preview" && (
          <div className="h-full overflow-y-auto">
            {preview?.path && /\.(md|markdown)$/i.test(preview.path) ? (
              <div className="mx-auto max-w-3xl px-6 py-5 pb-10">
                <Markdown content={preview.content} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-[11.5px] text-[#6b6b6b]">
                Open a Markdown (.md) file in the editor to preview it here.
              </div>
            )}
          </div>
        )}
      </div>


    </section>
  );
}

