/**
 * Extension library (VS Code-style marketplace).
 *
 * Every bundled extension is REAL — installing one activates actual behavior
 * in the app:
 *  - Prettier registers a "Format Document" command + Format-on-Save (the real
 *    Prettier engine, lazily loaded from `extensionsRuntime`).
 *  - Markdown Preview Enhanced contributes a live "Preview" tab to the dock.
 *  - Word Count / TODO Inspector pin live stats to the status bar.
 *  - Theme extensions register palettes with the theme engine in uiSettings.
 *
 * Icons are authentic brand glyphs from Simple Icons (`react-icons/si`) with
 * their real brand colours — the same pipeline used by FileIcon. Theme
 * extensions render their palette as a swatch, like the VS Code marketplace.
 * Install state persists to localStorage (`neo.extensions.v1`).
 */
import type { IconType } from "react-icons";
import { SiMarkdown, SiPrettier } from "react-icons/si";
import { IoList, IoStatsChart } from "react-icons/io5";

export type ExtensionCategory = "Themes" | "Formatters" | "Tools" | "Other";

export interface ExtensionTheme {
  id: string;
  label: string;
  base: string;
  panel: string;
  elevated: string;
  active: string;
}

export interface ExtensionDef {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  category: ExtensionCategory;
  /** Brand glyph component. Theme extensions render a palette swatch instead. */
  icon?: IconType;
  /** Authentic brand colour used to tint the glyph tile. */
  color?: string;
  installs: string;
  rating: number; // 0..5
  /** What the extension contributes once installed + enabled (shown as chips). */
  features: string[];
  /** Theme extensions only: the palette they register when enabled. */
  theme?: ExtensionTheme;
}

export const EXTENSIONS: ExtensionDef[] = [
  // ── Formatters ───────────────────────────────────────────────────────
  {
    id: "prettier.formatter",
    name: "Prettier - Code formatter",
    publisher: "Prettier",
    version: "3.6.2",
    description:
      "Opinionated code formatter for JavaScript, TypeScript, JSON, CSS, HTML, Markdown and YAML — powered by the real Prettier engine.",
    category: "Formatters",
    icon: SiPrettier,
    color: "#F7B93E",
    installs: "38.2M",
    rating: 4.5,
    features: ["Command: Format Document (Ctrl+Alt+F)", "Editor: Format on Save"],
  },

  // ── Tools ────────────────────────────────────────────────────────────
  {
    id: "md.markdown-preview",
    name: "Markdown Preview Enhanced",
    publisher: "shd101wyy",
    version: "0.8.0",
    description:
      "Live-rendered Markdown preview docked in the bottom panel, kept in sync with the active .md file as you type.",
    category: "Tools",
    icon: SiMarkdown,
    color: "#083FA1",
    installs: "3.1M",
    rating: 4.6,
    features: ["Panel: Preview tab", "Live editor sync", "GFM + syntax highlighting"],
  },

  // ── Other ────────────────────────────────────────────────────────────
  {
    id: "status.word-count",
    name: "Word Count",
    publisher: "ms-vscode",
    version: "0.4.0",
    description:
      "Live word, character and line count for the active file, pinned to the status bar exactly like the classic VS Code extension.",
    category: "Other",
    icon: IoStatsChart,
    color: "#3794FF",
    installs: "1.3M",
    rating: 4.4,
    features: ["Status Bar: word / char / line count", "Updates as you type"],
  },
  {
    id: "status.todo-inspector",
    name: "TODO Inspector",
    publisher: "gruntfuggly",
    version: "0.6.1",
    description:
      "Scans the active file for TODO, FIXME, HACK and XXX comments and reports the count in the status bar.",
    category: "Other",
    icon: IoList,
    color: "#D7BA7D",
    installs: "1.9M",
    rating: 4.7,
    features: ["Status Bar: TODO/FIXME count", "Multi-tag scan"],
  },

  // ── Themes ───────────────────────────────────────────────────────────
  {
    id: "theme.rose-pine",
    name: "Rosé Pine",
    publisher: "rose-pine",
    version: "1.2.0",
    description: "All natural pine, faux rosé vibes. A muted, elegant dark theme.",
    category: "Themes",
    installs: "2.1M",
    rating: 4.9,
    features: ["Theme: adds 'Rosé Pine' to Appearance", "Works with custom accents"],
    theme: { id: "ext.rose-pine", label: "Rosé Pine", base: "#191724", panel: "#1f1d2e", elevated: "#26233a", active: "#312e48" },
  },
  {
    id: "theme.nord",
    name: "Nord Frost",
    publisher: "arcticicestudio",
    version: "2.0.1",
    description: "An arctic, north-bluish clean and elegant color palette.",
    category: "Themes",
    installs: "3.4M",
    rating: 4.8,
    features: ["Theme: adds 'Nord Frost' to Appearance", "Low-contrast panels"],
    theme: { id: "ext.nord", label: "Nord Frost", base: "#2e3440", panel: "#333b47", elevated: "#3b4252", active: "#434c5e" },
  },
  {
    id: "theme.catppuccin",
    name: "Catppuccin Mocha",
    publisher: "catppuccin",
    version: "3.1.0",
    description: "A soothing pastel theme — warm dark tones with soft purples.",
    category: "Themes",
    installs: "4.7M",
    rating: 5.0,
    features: ["Theme: adds 'Catppuccin Mocha' to Appearance", "Pastel dark palette"],
    theme: { id: "ext.catppuccin", label: "Catppuccin Mocha", base: "#1e1e2e", panel: "#262639", elevated: "#313244", active: "#45475a" },
  },
  {
    id: "theme.dracula",
    name: "Dracula Dark",
    publisher: "dracula",
    version: "2.4.2",
    description: "The infamous Dracula palette — deep purples with vivid contrast.",
    category: "Themes",
    installs: "6.2M",
    rating: 4.7,
    features: ["Theme: adds 'Dracula Dark' to Appearance", "High-contrast accents"],
    theme: { id: "ext.dracula", label: "Dracula Dark", base: "#282a36", panel: "#2f313f", elevated: "#343746", active: "#44475a" },
  },
  {
    id: "theme.gruvbox",
    name: "Gruvbox Retro",
    publisher: "morhetz",
    version: "1.5.0",
    description: "Retro groove color scheme with warm, earthy dark tones.",
    category: "Themes",
    installs: "1.9M",
    rating: 4.6,
    features: ["Theme: adds 'Gruvbox Retro' to Appearance", "Warm earthy palette"],
    theme: { id: "ext.gruvbox", label: "Gruvbox Retro", base: "#282828", panel: "#32302f", elevated: "#3c3836", active: "#504945" },
  },
  {
    id: "theme.everforest",
    name: "Everforest",
    publisher: "sainnhe",
    version: "1.1.0",
    description: "Comfortable, green-toned dark theme with soft contrast.",
    category: "Themes",
    installs: "870K",
    rating: 4.8,
    features: ["Theme: adds 'Everforest' to Appearance", "Green-toned dark"],
    theme: { id: "ext.everforest", label: "Everforest", base: "#2b3339", panel: "#31393f", elevated: "#3a454a", active: "#475258" },
  },
];

/* ── Install state ─────────────────────────────────────────────────────── */

export interface ExtensionState {
  installed: string[];
  enabled: string[];
}

const EXT_STATE_KEY = "neo.extensions.v1";

function readState(): ExtensionState {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXT_STATE_KEY) ?? "{}");
    return {
      installed: Array.isArray(parsed.installed)
        ? parsed.installed.filter((x: unknown) => typeof x === "string")
        : [],
      enabled: Array.isArray(parsed.enabled)
        ? parsed.enabled.filter((x: unknown) => typeof x === "string")
        : [],
    };
  } catch {
    return { installed: [], enabled: [] };
  }
}

function writeState(s: ExtensionState): void {
  localStorage.setItem(EXT_STATE_KEY, JSON.stringify(s));
}

export function loadExtensionState(): ExtensionState {
  return readState();
}

export function isExtensionInstalled(id: string): boolean {
  return readState().installed.includes(id);
}

export function isExtensionEnabled(id: string): boolean {
  const s = readState();
  return s.installed.includes(id) && s.enabled.includes(id);
}

export function installExtension(id: string): ExtensionState {
  const s = readState();
  if (!s.installed.includes(id)) s.installed.push(id);
  if (!s.enabled.includes(id)) s.enabled.push(id);
  writeState(s);
  return s;
}

export function uninstallExtension(id: string): ExtensionState {
  const s = readState();
  s.installed = s.installed.filter((x) => x !== id);
  s.enabled = s.enabled.filter((x) => x !== id);
  writeState(s);
  return s;
}

export function setExtensionEnabled(id: string, enabled: boolean): ExtensionState {
  const s = readState();
  if (enabled && !s.enabled.includes(id)) s.enabled.push(id);
  if (!enabled) s.enabled = s.enabled.filter((x) => x !== id);
  writeState(s);
  return s;
}

export function clearExtensionState(): void {
  writeState({ installed: [], enabled: [] });
}

/** Catalog entries that are installed AND enabled. */
export function activeExtensions(): ExtensionDef[] {
  const s = readState();
  return EXTENSIONS.filter((e) => s.installed.includes(e.id) && s.enabled.includes(e.id));
}

/**
 * Theme palettes contributed by installed + enabled theme extensions.
 * Shape-compatible with `ThemePreset` in uiSettings.
 */
export function installedThemePresets(): ExtensionTheme[] {
  return activeExtensions()
    .filter((e) => e.theme)
    .map((e) => e.theme as ExtensionTheme);
}

export function extensionById(id: string): ExtensionDef | undefined {
  return EXTENSIONS.find((e) => e.id === id);
}
