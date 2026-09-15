import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IoClose, IoCopyOutline, IoRemove, IoSquareOutline } from "react-icons/io5";

/**
 * Frameless-window controls (minimize / maximize / close) rendered in-app
 * so they inherit the active theme (custom background included).
 *
 * Outside a Tauri runtime (e.g. plain-browser preview) the controls render
 * nothing instead of throwing.
 */

let winCache: ReturnType<typeof getCurrentWindow> | null | undefined;
function currentWin() {
  if (winCache !== undefined) return winCache;
  try {
    winCache = getCurrentWindow();
  } catch {
    winCache = null;
  }
  return winCache;
}

export function minimizeWindow(): void {
  void currentWin()?.minimize();
}
export function toggleMaximizeWindow(): void {
  void currentWin()?.toggleMaximize();
}
export function closeWindow(): void {
  void currentWin()?.close();
}

const MinimizeGlyph = <IoRemove className="h-[11px] w-[11px]" />;
const MaximizeGlyph = <IoSquareOutline className="h-[11px] w-[11px]" />;
const RestoreGlyph = <IoCopyOutline className="h-[11px] w-[11px]" />;
const CloseGlyph = <IoClose className="h-[11px] w-[11px]" />;

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void currentWin()
      ?.isMaximized()
      .then(setMaximized)
      .catch(() => {});
  }, []);

  if (!currentWin()) return null;

  const base =
    "flex h-[34px] w-[44px] shrink-0 items-center justify-center transition-colors ";

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        title="Minimize"
        aria-label="Minimize window"
        onClick={minimizeWindow}
        className={`${base}text-[var(--text-secondary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]`}
      >
        {MinimizeGlyph}
      </button>
      <button
        type="button"
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => {
          setMaximized((m) => !m);
          toggleMaximizeWindow();
        }}
        className={`${base}text-[var(--text-secondary)] hover:bg-(--fill-2) hover:text-[var(--text-primary)]`}
      >
        {maximized ? RestoreGlyph : MaximizeGlyph}
      </button>
      <button
        type="button"
        title="Close"
        aria-label="Close window"
        onClick={closeWindow}
        className={`${base}text-[var(--text-secondary)] hover:bg-[#e5534b] hover:text-white`}
      >
        {CloseGlyph}
      </button>
    </div>
  );
}