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
  type UiSettings,
} from "../uiSettings";

type SectionId = "appearance" | "editor" | "files" | "shortcuts";

interface SettingsPanelProps {
  open: boolean;
  settings: UiSettings;
  /** Merge a partial patch into the settings and persist. */
  onChange: (patch: Partial<UiSettings>) => void;
  onClose: () => void;
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
    id: "editor",
    label: "Editor",
    icon: (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 3.5L1.5 8l4 4.5M10.5 3.5l4 4.5-4 4.5" />
      </svg>
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
];

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl+Shift+P", "Command palette"],
  ["Ctrl+B", "Toggle chat sidebar"],
  ["Ctrl+Shift+E", "Toggle code editor"],
  ["Ctrl+Shift+G", "Toggle git panel"],
  ["Ctrl+Shift+H", "Toggle chat history"],
  ["Ctrl+`", "Toggle terminal dock"],
  ["Ctrl+S", "Save active file"],
  ["Ctrl+/", "Toggle line comment"],
  ["Ctrl+,", "Open settings"],
];

export default function SettingsPanel({ open, settings, onChange, onClose }: SettingsPanelProps) {
  const [section, setSection] = useState<SectionId>("appearance");
  const [bgDraft, setBgDraft] = useState(settings.customBackground ?? "#0e0e0e");

  useEffect(() => {
    if (open) setBgDraft(settings.customBackground ?? resolveThemeVars(settings)["--bg-base"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const theme = THEMES.find((t) => t.id === settings.themeId) ?? THEMES[0];
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
          <nav className="flex flex-col gap-0.5">
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
                {s.label}
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {THEMES.map((t) => {
                    const selected = settings.themeId === t.id && !settings.customBackground;
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
                        <span className={`text-[11.5px] ${selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                          {t.label}
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
