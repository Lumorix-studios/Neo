import { useState } from "react";
import {
  IoClose,
  IoSettingsSharp,
  IoServer,
  IoCube,
  IoText,
  IoCloud,
  IoChevronDown,
} from "react-icons/io5";
import type { AISettings, ProviderId } from "../src/types";
import { PROVIDER_OPTIONS, providerById } from "../src/providers";

interface Props {
  onClose: () => void;
  settings: AISettings;
  onSave: (settings: AISettings) => void;
}

export default function ChatSidebar({ onClose, settings, onSave }: Props) {
  const [draft, setDraft] = useState<AISettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  /**
   * When the user picks a different provider we auto-fill the base URL and
   * model — but ONLY if they haven't already customized them away from the
   * previous provider's defaults. This keeps hand-edited proxy URLs and
   * custom model ids intact.
   */
  const handleProviderChange = (nextId: ProviderId) => {
    const spec = providerById(nextId);
    const prevSpec = draft.provider ? providerById(draft.provider) : undefined;
    const usingDefaultUrl =
      !draft.baseUrl || (prevSpec !== undefined && draft.baseUrl === prevSpec.defaultBaseUrl);
    const usingDefaultModel =
      !draft.model || (prevSpec !== undefined && draft.model === prevSpec.defaultModel);
    setDraft((prev) => ({
      ...prev,
      provider: nextId,
      baseUrl: usingDefaultUrl ? spec.defaultBaseUrl : prev.baseUrl,
      model: usingDefaultModel ? spec.defaultModel : prev.model,
    }));
    setSaved(false);
  };

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setDraft(settings);
    setSaved(false);
  };

  const spec = providerById(draft.provider);
  const needsKey = spec.needsAuth;

  return (
    <div className="flex h-full w-full flex-col bg-[#10110f] text-[#f1f1eb]">
      <header className="flex h-12 items-center gap-2 border-b border-white/[0.08] px-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-amber-50">
          <span className="text-[13px] font-bold">
            <IoSettingsSharp size={18} />
          </span>
        </div>
        <span className="text-[12px] font-semibold tracking-tight">AI SETTINGS</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#777873] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
        >
          <IoClose size={16} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 py-4">
          {/* Provider */}
          <Section icon={<IoCloud size={14} />} title="Provider">
            <Field label="AI Provider">
              <select
                value={draft.provider}
                onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
                className="relative w-full appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 pr-9 text-[13px] text-[#f1f1eb] outline-none transition placeholder:text-[#55564f] focus:border-white/[0.18] focus:bg-white/[0.05]"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#152219]">
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#777873]">
                <IoChevronDown size={13} />
              </span>
            </Field>
            {spec.note ? (
              <p className="text-[11px] leading-4 text-[#a1a1aa]">
                {spec.note}
              </p>
            ) : needsKey ? (
              <p className="text-[11px] leading-4 text-[#a1a1aa]">
                API key required — the prefix is validated for your provider
                (e.g. OpenAI "sk-", Anthropic "sk-ant-", Groq "gsk-").
              </p>
            ) : null}
          </Section>

          {/* Connection */}
          <Section icon={<IoServer size={14} />} title="Connection">
            <Field label="API Endpoint (Base URL)">
              <input
                type="text"
                value={draft.baseUrl}
                onChange={(e) => update("baseUrl", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-[#f1f1eb] outline-none transition placeholder:text-[#55564f] focus:border-white/[0.18] focus:bg-white/[0.05]"
              />
            </Field>
            <Field label="API Key">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(e) => update("apiKey", e.target.value)}
                  placeholder={needsKey ? "Enter API key" : "Not required"}
                  readOnly={!needsKey}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 pr-16 text-[13px] text-[#f1f1eb] outline-none transition placeholder:text-[#55564f] focus:border-white/[0.18] focus:bg-white/[0.05] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[11px] text-[#777873] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
          </Section>

          {/* Model */}
          <Section icon={<IoCube size={14} />} title="Model">
            <Field label="Model">
              <input
                type="text"
                value={draft.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="e.g. gpt-4o-mini"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-[#f1f1eb] outline-none transition placeholder:text-[#55564f] focus:border-white/[0.18] focus:bg-white/[0.05]"
              />
            </Field>
            <Field label="Temperature">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={draft.temperature}
                  onChange={(e) => update("temperature", parseFloat(e.target.value))}
                  className="flex-1 accent-[#c9f2d6]"
                />
                <span className="w-10 text-right text-[12px] tabular-nums text-[#a1a1aa]">
                  {draft.temperature.toFixed(1)}
                </span>
              </div>
            </Field>
          </Section>

          {/* Behavior */}
          <Section icon={<IoText size={14} />} title="Behavior">
            <Field label="System Prompt">
              <textarea
                value={draft.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
                rows={4}
                placeholder="You are a helpful, professional assistant."
                className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] leading-5 text-[#f1f1eb] outline-none transition placeholder:text-[#55564f] focus:border-white/[0.18] focus:bg-white/[0.05]"
              />
            </Field>
          </Section>

          {/* Actions */}
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-lg bg-[#c9f2d6] px-4 py-2 text-[13px] font-semibold text-[#152219] transition hover:opacity-85"
            >
              {saved ? "Saved ✓" : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-white/[0.08] px-4 py-2 text-[13px] text-[#a1a1aa] transition hover:bg-white/[0.04] hover:text-[#f1f1eb]"
            >
              Reset
            </button>
          </div>

          <p className="text-center text-[10px] leading-4 text-[#55564f]">
            Settings are stored locally on this device.
          </p>
        </div>
      </main>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#777873]">
        <span className="text-[#a1a1aa]">{icon}</span>
        {title}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-[#a1a1aa]">{label}</span>
      {children}
    </label>
  );
}
