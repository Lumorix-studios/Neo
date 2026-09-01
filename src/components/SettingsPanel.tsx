import { useEffect, useState } from "react";
import {
  ACCENT_SWATCHES,
  DEFAULT_UI_SETTINGS,
  THEMES,
  isValidHex,
  resolveThemeVars,
  clearRecentFiles,
  clearRecentFolders,
  shade,
  type ThemePreset,
  type UiSettings,
} from "../uiSettings";
import type { AISettings, ProviderId } from "../types";
import { PROVIDER_OPTIONS, providerById } from "../providers";
import { loadMcpServers, saveMcpServers, makeServerId, type McpServerConfig } from "../mcp";
import {
  EXTENSIONS,
  loadExtensionState,
  installExtension,
  uninstallExtension,
  setExtensionEnabled,
  clearExtensionState,
  installedThemePresets,
  type ExtensionCategory,
  type ExtensionDef,
  type ExtensionState,
} from "../extensions";
import LocalModels from "../../components/LocalModels";

import { IoCode } from "react-icons/io5";


export type SectionId =
  | "appearance"
  | "ai"
  | "editor"
  | "extensions"
  | "terminal"
  | "files"
  | "data"
  | "shortcuts"
  | "about";

interface SettingsPanelProps {
  open: boolean;
  settings: UiSettings;
  /** Merge a partial patch into the settings and persist. */
  onChange: (patch: Partial<UiSettings>) => void;
  /** Current AI/chat settings (provider, model, keys, …). */
  aiSettings: AISettings;
  /** Replace the AI settings and persist. */
  onAiChange: (next: AISettings) => void;
  /** User picked a local (Ollama) model from the Local Models browser. */
  onSelectLocalModel: (modelName: string) => void;
  /** Section to show when the panel opens (defaults to "appearance"). */
  initialSection?: SectionId | null;
  onClose: () => void;
  /** Fired whenever an extension is installed / uninstalled / toggled. */
  onExtensionsChanged?: () => void;
}

/* ── Small building blocks ─────────────────────────────────────────── */

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
        checked
          ? "border-transparent bg-(--accent)"
          : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white transition-all ${
          checked ? "left-[18px]" : "left-[3px] opacity-60"
        }`}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-white/10 accent-[var(--accent)]"
      />
      <span className="w-12 text-right text-[11px] tabular-nums text-[var(--text-secondary)]">
        {value}
        {unit ?? ""}
      </span>
    </div>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-white/[0.05] py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 mt-6 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] first:mt-0">
      {children}
    </h3>
  );
}

/* ── Extensions marketplace pieces ─────────────────────────────────── */

const EXT_CATEGORIES: Array<ExtensionCategory | "All" | "Installed"> = [
  "All",
  "Themes",
  "Formatters",
  "Tools",
  "Other",
  "Installed",
];

const CATEGORY_TILE: Record<ExtensionCategory, { bg: string; fg: string }> = {
  Themes: { bg: "rgba(139,92,246,0.16)", fg: "#c4b5fd" },
  Formatters: { bg: "rgba(247,185,62,0.14)", fg: "#fcd34d" },
  Tools: { bg: "rgba(52,211,153,0.14)", fg: "#6ee7b7" },
  Other: { bg: "rgba(76,141,255,0.16)", fg: "#93c5fd" },
};

function ExtensionCard({
  ext,
  state,
  onInstall,
  onUninstall,
  onToggle,
}: {
  ext: ExtensionDef;
  state: ExtensionState;
  onInstall: () => void;
  onUninstall: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const installed = state.installed.includes(ext.id);
  const enabled = installed && state.enabled.includes(ext.id);
  const tile = CATEGORY_TILE[ext.category];
  return (
    <div
      className={`flex gap-3 rounded-lg border p-3 transition ${
        installed
          ? "border-(--accent)/40 bg-white/[0.03]"
          : "border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.02]"
      }`}
    >
      {ext.theme ? (
        <div
          className="flex h-10 w-10 shrink-0 flex-col overflow-hidden rounded-lg border border-white/10"
          title={`${ext.theme.label} palette`}
        >
          <div className="flex-[3]" style={{ background: ext.theme.base }} />
          <div className="flex-1" style={{ background: ext.theme.elevated }} />
          <div className="flex-1" style={{ background: ext.theme.active }} />
        </div>
      ) : (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${ext.color ?? "#8a8a93"}1f` }}
        >
          {ext.icon && <ext.icon size={22} color={ext.color ?? "var(--text-secondary)"} />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{ext.name}</span>
          <span className="shrink-0 text-[10px] text-[var(--text-faint)]">v{ext.version}</span>
          {installed && (
            <span
              className={`shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-medium ${
                enabled ? "bg-[rgba(52,211,153,0.14)] text-[#6ee7b7]" : "bg-white/[0.06] text-[var(--text-faint)]"
              }`}
            >
              {enabled ? "Enabled" : "Disabled"}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{ext.description}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ext.features.map((f) => (
            <span
              key={f}
              className="rounded bg-white/[0.05] px-1.5 py-px text-[9.5px] text-[var(--text-secondary)]"
            >
              {f}
            </span>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-faint)]">
          <span>{ext.publisher}</span>
          <span>⬇ {ext.installs}</span>
          <span>★ {ext.rating.toFixed(1)}</span>
          <span
            className="rounded px-1"
            style={{ background: tile.bg, color: tile.fg }}
          >
            {ext.category}
          </span>
          {ext.theme && <span className="text-[var(--text-faint)]">Adds a theme to Appearance</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between gap-1.5">
        {installed ? (
          <>
            <button
              type="button"
              onClick={onUninstall}
              className="rounded-md border border-white/[0.09] px-2 py-1 text-[10.5px] text-[var(--text-secondary)] transition hover:border-[#e5534b]/40 hover:text-[#e5534b]"
            >
              Uninstall
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--text-faint)]">{enabled ? "On" : "Off"}</span>
              <Toggle checked={enabled} onChange={onToggle} />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            className="rounded-md bg-(--accent) px-3 py-1 text-[10.5px] font-medium text-white transition hover:brightness-110"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}

/** Export a JSON snapshot of all settings via a browser download. */
function exportSettingsSnapshot(ui: UiSettings, ai: AISettings, ext: ExtensionState): void {
  const snapshot = {
    app: "Neo",
    exportedAt: new Date().toISOString(),
    uiSettings: ui,
    aiSettings: ai,
    extensions: ext,
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `neo-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
/* ── Main panel ────────────────────────────────────────────────────── */

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ReactNode }> = [
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 1.75a6.25 6.25 0 010 12.5z" fill="currentColor" stroke="none" opacity="0.35" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI",
    icon: (
      <IoCode size={13} />
    ),
  },

  {
    id: "files",
    label: "Files & Save",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M4 1.75h5.2L12.5 5v8.25a1 1 0 01-1 1H4a1 1 0 01-1-1v-10.5a1 1 0 011-1zM9.2 1.75V5h3.3" />
      </svg>
    ),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <rect x="1.75" y="4" width="12.5" height="8" rx="1.5" />
        <path d="M4.5 7h.01M7 7h.01M9.5 7h.01M12 7h.01M4.5 9.5h7" />
      </svg>
    ),
  },
  {
    id: "extensions",
    label: "Extensions",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M6 1.75a1.75 1.75 0 100 3.5h.75v1H2.75a1 1 0 00-1 1v2.25h1a1.75 1.75 0 110 3.5h-1v2.25a1 1 0 001 1H5v-1a1.75 1.75 0 013.5 0v1h2.25a1 1 0 001-1v-4.25h1a1.75 1.75 0 100-3.5h-1V3.75a1 1 0 00-1-1H6.75v-1z" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
        <path d="M4.5 6l2.25 2L4.5 10M8.25 10.25h3" />
      </svg>
    ),
  },
  {
    id: "data",
    label: "Privacy & Data",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M8 1.75l5 2v4.1c0 3.1-2.1 5.4-5 6.4-2.9-1-5-3.3-5-6.4V3.75l5-2z" />
        <path d="M5.9 7.9l1.5 1.5 2.7-2.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 7.25v4M8 4.6v.01" />
      </svg>
    ),
  },
];

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+Shift+P", "Command palette"],
  ["Ctrl+B", "Open AI settings"],
  ["Ctrl+Shift+E", "Toggle code editor"],
  ["Ctrl+Shift+G", "Toggle git panel"],
  ["Ctrl+Shift+H", "Toggle chat history"],
  ["Ctrl+`", "Toggle terminal dock"],
  ["Ctrl+S", "Save active file"],
  ["Ctrl+/", "Toggle line comment"],
  ["Ctrl+,", "Open settings"],
];

export default function SettingsPanel({
  open,
  settings,
  onChange,
  aiSettings,
  onAiChange,
  onSelectLocalModel,
  initialSection,
  onClose,
  onExtensionsChanged,
}: SettingsPanelProps) {
  const [section, setSection] = useState<SectionId>("appearance");
  const [bgDraft, setBgDraft] = useState(settings.customBackground ?? "#0e0e0e");
  // --- AI settings state (mirrors the previous chat settings sidebar) ---
  const [showAiKey, setShowAiKey] = useState(false);
  const [showLocalModels, setShowLocalModels] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => loadMcpServers());
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  // --- Extensions marketplace state ---
  const [extState, setExtState] = useState<ExtensionState>(() => loadExtensionState());
  const [extQuery, setExtQuery] = useState("");
  const [extCategory, setExtCategory] = useState<ExtensionCategory | "All" | "Installed">("All");

  useEffect(() => {
    if (open) {
      setBgDraft(settings.customBackground ?? resolveThemeVars(settings)["--bg-base"]);
      setSection(initialSection ?? "appearance");
      setShowLocalModels(false);
      setShowAiKey(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Jump to a requested section while the panel is already open (e.g. Ctrl+B).
  useEffect(() => {
    if (open && initialSection) setSection(initialSection);
  }, [open, initialSection]);

  const updateAi = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    onAiChange({ ...aiSettings, [key]: value });
  };

  const handleAiProviderChange = (nextId: ProviderId) => {
    const spec = providerById(nextId);
    const prevSpec = aiSettings.provider ? providerById(aiSettings.provider) : undefined;
    const usingDefaultUrl =
      !aiSettings.baseUrl ||
      (prevSpec !== undefined && aiSettings.baseUrl === prevSpec.defaultBaseUrl);
    const usingDefaultModel =
      !aiSettings.model || (prevSpec !== undefined && aiSettings.model === prevSpec.defaultModel);
    onAiChange({
      ...aiSettings,
      provider: nextId,
      baseUrl: usingDefaultUrl ? spec.defaultBaseUrl : aiSettings.baseUrl,
      model: usingDefaultModel ? spec.defaultModel : aiSettings.model,
    });
  };

  const aiSpec = providerById(aiSettings.provider);
  const aiNeedsKey = aiSpec.needsAuth;

  const addMcpServer = () => {
    const name = mcpName.trim();
    const url = mcpUrl.trim();
    if (!name || !url) return;
    const next = [...mcpServers, { id: makeServerId(), name, url, enabled: true }];
    setMcpServers(next);
    saveMcpServers(next);
    setMcpName("");
    setMcpUrl("");
  };

  const toggleMcpServer = (id: string) => {
    const next = mcpServers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setMcpServers(next);
    saveMcpServers(next);
  };

  const removeMcpServer = (id: string) => {
    const next = mcpServers.filter((s) => s.id !== id);
    setMcpServers(next);
    saveMcpServers(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  // Built-in themes plus any palettes contributed by enabled theme extensions.
  const extThemes: ThemePreset[] = installedThemePresets();
  const allThemes: ThemePreset[] = [...THEMES, ...extThemes];
  const theme = allThemes.find((t) => t.id === settings.themeId) ?? allThemes[0];

  const q = extQuery.trim().toLowerCase();
  const visibleExtensions = EXTENSIONS.filter((e) => {
    if (extCategory === "Installed" && !extState.installed.includes(e.id)) return false;
    if (extCategory !== "All" && extCategory !== "Installed" && e.category !== extCategory) return false;
    if (q && !`${e.name} ${e.publisher} ${e.description}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const installedCount = extState.installed.length;
return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel-in flex h-[560px] max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--bg-base)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        {/* ── Left nav */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-white/[0.06] bg-[var(--bg-panel)] p-2">
          <p className="px-2 pb-2 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            Settings
          </p>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 rounded-md px-2 py-[6px] text-left text-[12px] transition-colors ${
                  section === s.id
                    ? "bg-white/[0.07] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                }`}
              >
                <span className={section === s.id ? "text-(--accent)" : "text-[var(--text-muted)]"}>
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {s.id === "extensions" && installedCount > 0 && (
                  <span className="rounded-full bg-(--accent-soft) px-1.5 text-[9.5px] font-medium text-(--accent)">
                    {installedCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-2 py-1 text-[10px] text-[var(--text-faint)]">Neo v1.0.4</div>
        </aside>

        {/* ── Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
              {SECTIONS.find((s) => s.id === section)?.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {section === "appearance" && (
              <div>
                <SectionTitle>Theme</SectionTitle>
                {extThemes.length > 0 && (
                  <p className="mb-1.5 text-[10.5px] text-[var(--text-faint)]">
                    {extThemes.length} theme{extThemes.length === 1 ? "" : "s"} from your extensions — manage them under Extensions.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {allThemes.map((t) => {
                    const selected = settings.themeId === t.id && !settings.customBackground;
                    const fromExtension = t.id.startsWith("ext.");
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onChange({ themeId: t.id, customBackground: null })}
                        className={`rounded-lg border p-2 text-left transition ${
                          selected
                            ? "border-(--accent) bg-white/[0.04]"
                            : "border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.02]"
                        }`}
                      >
                        <div className="mb-1.5 flex gap-1">
                          {[t.base, t.panel, t.elevated, t.active].map((c) => (
                            <span
                              key={c}
                              className="h-4 flex-1 rounded-[3px] border border-white/[0.07]"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                        <span className={`flex items-center gap-1.5 text-[11.5px] ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                          {t.label}
                          {fromExtension && (
                            <span className="rounded bg-white/[0.07] px-1 py-px text-[8.5px] uppercase tracking-wide text-[var(--text-faint)]">
                              Ext
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <SectionTitle>Background</SectionTitle>
                <Row
                  title="Custom background color"
                  description={`Overrides the ${theme.label} base color. Panel shades are derived automatically.`}
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="color"
                      value={isValidHex(bgDraft) ? bgDraft : "#0e0e0e"}
                      onChange={(e) => {
                        setBgDraft(e.target.value);
                        onChange({ customBackground: e.target.value });
                      }}
                      className="h-7 w-9 cursor-pointer rounded border border-white/[0.1] bg-transparent p-0.5"
                    />
                    <input
                      type="text"
                      value={bgDraft}
                      onChange={(e) => {
                        setBgDraft(e.target.value);
                        if (isValidHex(e.target.value)) onChange({ customBackground: e.target.value });
                      }}
                      spellCheck={false}
                      className="w-20 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] font-mono text-[var(--text-primary)] outline-none focus:border-(--accent)"
                    />
                    {settings.customBackground && (
                      <button
                        type="button"
                        onClick={() => onChange({ customBackground: null })}
                        className="rounded-md px-2 py-1 text-[11px] text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </Row>
                {settings.customBackground && (
                  <div className="mt-2 flex gap-1.5">
                    {[-0.09, -0.04, 0, 0.03, 0.06].map((amt) => (
                      <span
                        key={amt}
                        className="h-5 flex-1 rounded border border-white/[0.07]"
                        style={{ background: shade(settings.customBackground as string, amt) }}
                      />
                    ))}
                  </div>
                )}

                <SectionTitle>Accent</SectionTitle>
                <div className="flex items-center gap-2">
                  {ACCENT_SWATCHES.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      title={a.label}
                      onClick={() => onChange({ accent: a.value })}
                      className={`h-6 w-6 rounded-full border-2 transition ${
                        settings.accent === a.value ? "scale-105 border-white/80" : "border-transparent hover:scale-105"
                      }`}
                      style={{ background: a.value }}
                    />
                  ))}
                  <input
                    type="color"
                    value={isValidHex(settings.accent) ? settings.accent : "var(--accent)"}
                    onChange={(e) => onChange({ accent: e.target.value })}
                    title="Custom accent"
                    className="h-6 w-9 cursor-pointer rounded border border-white/[0.1] bg-transparent p-0.5"
                  />
                </div>
              </div>
            )}
            {section === "ai" &&
              (showLocalModels ? (
                <div className="h-full">
                  <LocalModels
                    onClose={() => setShowLocalModels(false)}
                    onSelectModel={(modelName) => {
                      onSelectLocalModel(modelName);
                      setShowLocalModels(false);
                    }}
                    selectedModel={aiSettings.model}
                  />
                </div>
              ) : (
              <div>
                <SectionTitle>Provider</SectionTitle>
                <Row title="AI provider" description="Where chat requests are sent.">
                  <div className="relative shrink-0">
                    <select
                      value={aiSettings.provider}
                      onChange={(e) => handleAiProviderChange(e.target.value as ProviderId)}
                      className="w-48 appearance-none rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-8 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-white/[0.18]"
                    >
                      {PROVIDER_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[var(--bg-elevated)]">
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </Row>
                {(aiSpec.note || aiNeedsKey) && (
                  <p className="pb-3 text-[11px] leading-4 text-[var(--text-muted)]">
                    {aiSpec.note ??
                      'API key required — the prefix is validated for your provider (e.g. OpenAI "sk-", Anthropic "sk-ant-", Groq "gsk-").'}
                  </p>
                )}
                <Row title="Local models" description="Browse, pull and run models locally with Ollama.">
                  <button
                    type="button"
                    onClick={() => setShowLocalModels(true)}
                    className="shrink-0 rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Browse
                  </button>
                </Row>
                <SectionTitle>Connection</SectionTitle>
                <Row title="API endpoint" description="Base URL used for chat requests.">
                  <input
                    type="text"
                    value={aiSettings.baseUrl}
                    onChange={(e) => updateAi("baseUrl", e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    spellCheck={false}
                    className="w-56 shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                  />
                </Row>
                <Row title="API key" description={aiNeedsKey ? "Stored locally on this device." : "Not required for this provider."}>
                  <div className="relative shrink-0">
                    <input
                      type={showAiKey ? "text" : "password"}
                      value={aiSettings.apiKey}
                      onChange={(e) => updateAi("apiKey", e.target.value)}
                      placeholder={aiNeedsKey ? "Enter API key" : "Not required"}
                      spellCheck={false}
                      className="w-56 rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-2.5 pr-14 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAiKey((v) => !v)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10.5px] text-[var(--text-muted)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                    >
                      {showAiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </Row>

                <SectionTitle>Model</SectionTitle>
                <Row title="Model ID" description="Model identifier sent to the provider.">
                  <input
                    type="text"
                    value={aiSettings.model}
                    onChange={(e) => updateAi("model", e.target.value)}
                    placeholder="e.g. gpt-4o-mini"
                    spellCheck={false}
                    className="w-56 shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                  />
                </Row>
                <Row title="Temperature" description="Higher values make output more creative.">
                  <Slider value={aiSettings.temperature} min={0} max={2} step={0.1} onChange={(v) => updateAi("temperature", v)} />
                </Row>
                <SectionTitle>Behavior</SectionTitle>
                <Row title="Auto-approve tools" description="Agent file edits and shell commands run without asking.">
                  <Toggle checked={!!aiSettings.autoApproveTools} onChange={(v) => updateAi("autoApproveTools", v)} />
                </Row>
                <div className="pb-2 pt-1">
                  <p className="mb-1.5 text-[12.5px] font-medium text-[var(--text-primary)]">System prompt</p>
                  <textarea
                    value={aiSettings.systemPrompt}
                    onChange={(e) => updateAi("systemPrompt", e.target.value)}
                    rows={4}
                    placeholder="You are a helpful, professional assistant."
                    className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-5 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                  />
                </div>

                <SectionTitle>MCP servers</SectionTitle>
                <div className="flex flex-col gap-2 pb-2">
                  {mcpServers.length === 0 && (
                    <p className="text-[11px] leading-4 text-[var(--text-muted)]">
                      Connect Streamable-HTTP MCP servers to extend the agent with external tools.
                    </p>
                  )}
                  {mcpServers.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => toggleMcpServer(s.id)}
                        title={s.enabled ? "Disable" : "Enable"}
                        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                          s.enabled ? "bg-(--accent)" : "bg-white/[0.12]"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                            s.enabled ? "left-[14px]" : "left-0.5"
                          }`}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-[12px] font-medium ${s.enabled ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                          {s.name}
                        </div>
                        <div className="truncate text-[10px] text-[var(--text-faint)]">{s.url}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMcpServer(s.id)}
                        aria-label={`Remove ${s.name}`}
                        className="shrink-0 rounded p-1 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mcpName}
                      onChange={(e) => setMcpName(e.target.value)}
                      placeholder="Server name (e.g. filesystem)"
                      spellCheck={false}
                      className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                    />
                    <input
                      type="text"
                      value={mcpUrl}
                      onChange={(e) => setMcpUrl(e.target.value)}
                      placeholder="http://localhost:3000/mcp"
                      spellCheck={false}
                      onKeyDown={(e) => e.key === "Enter" && addMcpServer()}
                      className="min-w-0 flex-[1.4] rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addMcpServer}
                    disabled={!mcpName.trim() || !mcpUrl.trim()}
                    className="self-start rounded-md border border-white/[0.09] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add Server
                  </button>
                </div>

                <p className="pt-1 text-[10.5px] text-[var(--text-faint)]">
                  AI settings are stored locally on this device.
                </p>
              </div>
              ))}
            {section === "editor" && (
              <div>
                <SectionTitle>Typography</SectionTitle>
                <Row title="Font size" description="Size of the code text in the editor.">
                  <Slider value={settings.editorFontSize} min={10} max={18} step={0.5} unit="px" onChange={(v) => onChange({ editorFontSize: v })} />
                </Row>
                <Row title="Line height" description="Vertical space per line.">
                  <Slider value={settings.editorLineHeight} min={16} max={30} step={1} unit="px" onChange={(v) => onChange({ editorLineHeight: v })} />
                </Row>

                <SectionTitle>Behavior</SectionTitle>
                <Row title="Word wrap" description="Soft-wrap long lines instead of horizontal scrolling.">
                  <Toggle checked={settings.wordWrap} onChange={(v) => onChange({ wordWrap: v })} />
                </Row>
                <Row title="Line numbers" description="Show the gutter with line numbers.">
                  <Toggle checked={settings.showLineNumbers} onChange={(v) => onChange({ showLineNumbers: v })} />
                </Row>
                <Row title="Tab size" description="Spaces inserted per indent level.">
                  <div className="flex shrink-0 overflow-hidden rounded-md border border-white/[0.08]">
                    {[2, 4, 8].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onChange({ tabSize: n })}
                        className={`px-3 py-1 text-[11.5px] transition ${
                          settings.tabSize === n
                            ? "bg-white/[0.1] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-white/[0.05]"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </Row>
              </div>
            )}

            {section === "files" && (
              <div>
                <SectionTitle>Auto save</SectionTitle>
                <Row title="Auto save" description="Persist dirty editor tabs automatically.">
                  <Toggle checked={settings.autoSave} onChange={(v) => onChange({ autoSave: v })} />
                </Row>
                {settings.autoSave && (
                  <Row title="Auto save delay" description="How long to wait after the last keystroke.">
                    <Slider value={settings.autoSaveDelayMs} min={500} max={3000} step={250} unit="ms" onChange={(v) => onChange({ autoSaveDelayMs: v })} />
                  </Row>
                )}

                <SectionTitle>Privacy</SectionTitle>
                <Row title="Clear recents" description="Removes the recent files and folders lists shown on the empty states.">
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentFiles();
                      clearRecentFolders();
                    }}
                    className="shrink-0 rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Clear
                  </button>
                </Row>
              </div>
            )}

            {section === "shortcuts" && (
              <div>
                <SectionTitle>Keyboard shortcuts</SectionTitle>
                <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                  {SHORTCUTS.map(([keys, label], i) => (
                    <div
                      key={keys}
                      className={`flex items-center justify-between px-3 py-2 ${i % 2 === 0 ? "bg-white/[0.02]" : ""}`}
                    >
                      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
                      <span className="kbd">{keys}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section === "extensions" && (
              <div>
                {/* Search + filter toolbar */}
                <div className="sticky -top-4 z-10 -mx-4 mb-3 bg-[var(--bg-base)]/95 px-4 pb-2 pt-1 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]">
                        <circle cx="7" cy="7" r="4.5" />
                        <path d="M10.5 10.5L14 14" />
                      </svg>
                      <input
                        value={extQuery}
                        onChange={(e) => setExtQuery(e.target.value)}
                        placeholder="Search extensions…"
                        spellCheck={false}
                        className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-2.5 text-[12px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-white/[0.18]"
                      />
                    </div>
                    <span className="shrink-0 text-[10.5px] text-[var(--text-faint)]">
                      {installedCount} installed
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {EXT_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setExtCategory(c)}
                        className={`rounded-full border px-2.5 py-0.5 text-[10.5px] transition ${
                          extCategory === c
                            ? "border-(--accent)/60 bg-(--accent-soft) text-[var(--text-primary)]"
                            : "border-white/[0.08] text-[var(--text-secondary)] hover:bg-white/[0.04]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {visibleExtensions.map((ext) => (
                    <ExtensionCard
                      key={ext.id}
                      ext={ext}
                      state={extState}
                      onInstall={() => {
                        setExtState(installExtension(ext.id));
                        onExtensionsChanged?.();
                      }}
                      onUninstall={() => {
                        setExtState(uninstallExtension(ext.id));
                        onExtensionsChanged?.();
                      }}
                      onToggle={(enabled) => {
                        setExtState(setExtensionEnabled(ext.id, enabled));
                        onExtensionsChanged?.();
                      }}
                    />
                  ))}
                  {visibleExtensions.length === 0 && (
                    <p className="py-8 text-center text-[11.5px] text-[var(--text-faint)]">
                      No extensions match your search.
                    </p>
                  )}
                </div>

                <p className="pt-3 text-[10.5px] text-[var(--text-faint)]">
                  Extensions activate immediately — Prettier adds Format Document +
                  Format on Save, Markdown Preview adds a Preview tab in the dock,
                  Word Count / TODO Inspector pin stats to the status bar, and
                  theme extensions appear under Appearance. State is stored locally
                  on this device.
                </p>
              </div>
            )}

            {section === "terminal" && (
              <div>
                <SectionTitle>Typography</SectionTitle>
                <Row title="Font size" description="Size of the terminal text.">
                  <Slider value={settings.terminalFontSize} min={8} max={20} step={0.5} unit="px" onChange={(v) => onChange({ terminalFontSize: v })} />
                </Row>

                <SectionTitle>Buffer</SectionTitle>
                <Row title="Scrollback" description="How much output history is kept per terminal.">
                  <Slider value={settings.terminalScrollback} min={100} max={10000} step={100} onChange={(v) => onChange({ terminalScrollback: v })} />
                </Row>

                <SectionTitle>Cursor</SectionTitle>
                <Row title="Cursor blink" description="Blink the block cursor in terminals.">
                  <Toggle checked={settings.terminalCursorBlink} onChange={(v) => onChange({ terminalCursorBlink: v })} />
                </Row>

                <p className="pt-2 text-[10.5px] text-[var(--text-faint)]">
                  Changes apply instantly to open terminals; new terminals pick them up automatically.
                </p>
              </div>
            )}

            {section === "data" && (
              <div>
                <SectionTitle>Backup</SectionTitle>
                <Row title="Export settings" description="Download all UI, AI and extension settings as a JSON file.">
                  <button
                    type="button"
                    onClick={() => exportSettingsSnapshot(settings, aiSettings, extState)}
                    className="shrink-0 rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Export JSON
                  </button>
                </Row>

                <SectionTitle>Local caches</SectionTitle>
                <Row title="Clear extension installs" description="Uninstalls every extension and forgets enabled state.">
                  <button
                    type="button"
                    onClick={() => {
                      clearExtensionState();
                      setExtState(loadExtensionState());
                      onExtensionsChanged?.();
                    }}
                    className="shrink-0 rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Clear
                  </button>
                </Row>
                <Row title="Clear MCP servers" description="Removes all configured MCP server endpoints.">
                  <button
                    type="button"
                    onClick={() => {
                      setMcpServers([]);
                      saveMcpServers([]);
                    }}
                    className="shrink-0 rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Clear
                  </button>
                </Row>
                <Row title="Clear recents" description="Removes the recent files and folders lists.">
                  <button
                    type="button"
                    onClick={() => {
                      clearRecentFiles();
                      clearRecentFolders();
                    }}
                    className="shrink-0 rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                  >
                    Clear
                  </button>
                </Row>

                <p className="pt-2 text-[10.5px] text-[var(--text-faint)]">
                  Everything lives on this device — no account, no cloud sync, no telemetry.
                </p>
              </div>
            )}

            {section === "about" && (
              <div>
                <div className="flex items-center gap-3 py-2">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--accent-soft) text-[20px] font-bold text-(--accent)">
                    N
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--text-primary)]">Neo</p>
                    <p className="text-[11px] text-[var(--text-muted)]">Version 1.0.4 (Beta) · AI-native code workspace</p>
                  </div>
                </div>

                <SectionTitle>About</SectionTitle>
                <p className="text-[11.5px] leading-5 text-[var(--text-secondary)]">
                  Neo is a local-first, Tauri-powered code editor with a built-in AI assistant,
                  integrated terminal, git panel and a VS Code-style extension library. Your files,
                  keys and settings never leave this machine.
                </p>

                <SectionTitle>Links</SectionTitle>
                <div className="flex flex-col gap-1">
                  {[
                    ["GitHub repository", "https://github.com/madhusudhan-rgb/Neo"],
                    ["Report an issue", "https://github.com/madhusudhan-rgb/Neo/issues"],
                  ].map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between rounded-md border border-white/[0.07] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                    >
                      {label}
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3.5h6.5V10M12.5 3.5L3 13" />
                      </svg>
                    </a>
                  ))}
                </div>

                <SectionTitle>Built with</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {["Tauri 2", "React 19", "TypeScript", "Rust", "Tailwind CSS 4", "xterm.js", "portable-pty"].map((t) => (
                    <span key={t} className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
                      {t}
                    </span>
                  ))}
                </div>

                <p className="pt-4 text-[10.5px] text-[var(--text-faint)]">
                  Made with ♥ by madhusudhan-rgb and contributors.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <footer className="flex h-11 shrink-0 items-center justify-between border-t border-white/[0.06] px-4">
            <span className="text-[10.5px] text-[var(--text-faint)]">Changes apply and save instantly</span>
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_UI_SETTINGS })}
              className="rounded-md border border-white/[0.09] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
            >
              Reset to defaults
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
