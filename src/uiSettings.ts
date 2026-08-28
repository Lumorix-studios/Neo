import { invoke } from "@tauri-apps/api/core";

/**
 * UI / workspace preferences — everything that is NOT the AI config.
 * Persisted with the same Tauri-disk-then-localStorage strategy as store.ts
 * and applied to the document as CSS custom properties (see index.css).
 */
export interface UiSettings {
  /** Active theme preset id (see THEMES). */
  themeId: string;
  /** Optional hex color overriding the theme's base background. */
  customBackground: string | null;
  /** Accent color (hex) used for highlights, caret, selection. */
  accent: string;
  /** Editor font size (px). */
  editorFontSize: number;
  /** Editor line height (px per line). */
  editorLineHeight: number;
  /** Spaces inserted per indentation level. */
  tabSize: number;
  /** Soft-wrap long lines in the editor. */
  wordWrap: boolean;
  /** Show the line-number gutter. */
  showLineNumbers: boolean;
  /** Automatically save dirty editor tabs after a short delay. */
  autoSave: boolean;
  /** Debounce (ms) before an auto-save fires. */
  autoSaveDelayMs: number;
}

export interface ThemePreset {
  id: string;
  label: string;
  base: string;
  panel: string;
  elevated: string;
  active: string;
}

export const THEMES: ThemePreset[] = [
  { id: "neo", label: "Neo Dark", base: "#0e0e0e", panel: "#131313", elevated: "#1a1a1a", active: "#232323" },
  { id: "midnight", label: "Midnight", base: "#0b1220", panel: "#0f1726", elevated: "#162032", active: "#1e2a40" },
  { id: "graphite", label: "Graphite", base: "#111214", panel: "#16181b", elevated: "#1d2024", active: "#26292e" },
  { id: "charcoal", label: "Charcoal", base: "#131110", panel: "#191614", elevated: "#211d1a", active: "#2b2622" },
  { id: "slate", label: "Slate", base: "#0f1115", panel: "#14171c", elevated: "#1b1f26", active: "#242a33" },
];

export const ACCENT_SWATCHES: Array<{ label: string; value: string }> = [
  { label: "Blue", value: "#4c8dff" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Emerald", value: "#34d399" },
  { label: "Cyan", value: "#22d3ee" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Rose", value: "#f43f5e" },
];

export const DEFAULT_UI_SETTINGS: UiSettings = {
  themeId: "neo",
  customBackground: null,
  accent: "#4c8dff",
  editorFontSize: 12.5,
  editorLineHeight: 20,
  tabSize: 2,
  wordWrap: false,
  showLineNumbers: true,
  autoSave: false,
  autoSaveDelayMs: 1000,
};

/* ------------------------------------------------------------------ *
 * Persistence (mirrors store.ts: Tauri disk first, localStorage fallback)
 * ------------------------------------------------------------------ */

const UI_SETTINGS_KEY = "neo.ui-settings.v1";

function inTauri(): boolean {
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return !!win.__TAURI_INTERNALS__;
}

async function diskRead(key: string): Promise<string | null> {
  try {
    const raw = await invoke<string>("load_state", { key });
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

async function diskWrite(key: string, value: string): Promise<boolean> {
  try {
    await invoke("save_state", { key, value });
    return true;
  } catch {
    return false;
  }
}

export async function loadUiSettings(): Promise<UiSettings> {
  const raw = inTauri() ? await diskRead(UI_SETTINGS_KEY) : localStorage.getItem(UI_SETTINGS_KEY);
  if (!raw) return DEFAULT_UI_SETTINGS;
  try {
    return { ...DEFAULT_UI_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

export async function saveUiSettings(s: UiSettings): Promise<void> {
  const raw = JSON.stringify(s);
  if (inTauri()) {
    const ok = await diskWrite(UI_SETTINGS_KEY, raw);
    if (!ok) localStorage.setItem(UI_SETTINGS_KEY, raw);
  } else {
    localStorage.setItem(UI_SETTINGS_KEY, raw);
  }
}

/* ------------------------------------------------------------------ *
 * Color helpers
 * ------------------------------------------------------------------ */

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Mix `hex` toward white (amount > 0) or black (amount < 0). amount in [-1, 1]. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

export function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isValidHex(hex: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim());
}

function normalizeHex(hex: string): string {
  const h = hex.trim().replace("#", "");
  if (h.length === 3) return `#${h.split("").map((c) => c + c).join("")}`;
  return `#${h}`;
}

/* ------------------------------------------------------------------ *
 * Theme resolution + application
 * ------------------------------------------------------------------ */

/** Resolve the concrete CSS variable map for a settings object. */
export function resolveThemeVars(s: UiSettings): Record<string, string> {
  const theme = THEMES.find((t) => t.id === s.themeId) ?? THEMES[0];
  const custom = !!(s.customBackground && isValidHex(s.customBackground));
  const base = custom ? normalizeHex(s.customBackground as string) : theme.base;
  return {
    "--bg-base": base,
    "--bg-panel": custom ? shade(base, 0.028) : theme.panel,
    "--bg-elevated": custom ? shade(base, 0.055) : theme.elevated,
    "--bg-active": custom ? shade(base, 0.09) : theme.active,
    "--accent": s.accent,
    "--accent-soft": hexToRgba(s.accent, 0.12),
  };
}

/** Push the resolved theme onto the document root as CSS custom properties. */
export function applyUiSettings(s: UiSettings): void {
  const vars = resolveThemeVars(s);
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
}

/* ------------------------------------------------------------------ *
 * Recents (localStorage is fine — these are lightweight lists)
 * ------------------------------------------------------------------ */

const RECENT_FILES_KEY = "neo.recents.files.v1";
const RECENT_FOLDERS_KEY = "neo.recents.folders.v1";
const RECENTS_LIMIT = 8;

function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]): void {
  localStorage.setItem(key, JSON.stringify(list));
}

function pushInto(key: string, value: string): string[] {
  const next = [value, ...readList(key).filter((p) => p !== value)].slice(0, RECENTS_LIMIT);
  writeList(key, next);
  return next;
}

export function getRecentFiles(): string[] {
  return readList(RECENT_FILES_KEY);
}

/** Add a file to recents; returns the updated list for state updates. */
export function pushRecentFile(path: string): string[] {
  return pushInto(RECENT_FILES_KEY, path);
}

export function clearRecentFiles(): void {
  writeList(RECENT_FILES_KEY, []);
}

export function getRecentFolders(): string[] {
  return readList(RECENT_FOLDERS_KEY);
}

/** Add a folder to recents; returns the updated list for state updates. */
export function pushRecentFolder(path: string): string[] {
  return pushInto(RECENT_FOLDERS_KEY, path);
}

export function clearRecentFolders(): void {
  writeList(RECENT_FOLDERS_KEY, []);
}
