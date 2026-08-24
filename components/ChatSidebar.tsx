import { useEffect, useState } from "react";
import type { AISettings, ProviderId } from "../src/types";
import { PROVIDER_OPTIONS, providerById } from "../src/providers";
import LocalModels from "./LocalModels";
import {
  loadMcpServers,
  saveMcpServers,
  makeServerId,
  type McpServerConfig,
} from "../src/mcp";

interface Props {
  onClose: () => void;
  settings: AISettings;
  onSave: (settings: AISettings) => void;
  onSelectLocalModel: (modelName: string) => void;
}

export default function ChatSidebar({ onClose, settings, onSave, onSelectLocalModel }: Props) {
  const [draft, setDraft] = useState<AISettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLocalModels, setShowLocalModels] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(() => loadMcpServers());
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

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

  // Keep the draft in sync when the parent settings change (e.g. a local
  // model was selected, or settings were loaded from disk).
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const update = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };
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
    <div className="flex h-full w-full flex-col bg-[#131313] text-[#ececec]">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b6b6b]">
          Settings
        </span>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[#a3a3a3] transition hover:bg-white/[0.06] hover:text-[#ececec]"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>
      {showLocalModels ? (
        <LocalModels
          onClose={() => setShowLocalModels(false)}
          onSelectModel={(modelName) => {
            onSelectLocalModel(modelName);
            setShowLocalModels(false);
          }}
          selectedModel={draft.model}
        />
      ) : (
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-4 py-4">
          {/* Local Models shortcut */}
          <button
            type="button"
            onClick={() => setShowLocalModels(true)}
            className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[12.5px] font-medium text-[#ececec] transition hover:border-white/[0.13] hover:bg-white/[0.04]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <rect x="5" y="5" width="6" height="6" rx="1" />
              <path d="M5 1v1M11 1v1M5 14v1M11 14v1M1 5h1M1 11h1M14 5h1M14 11h1" />
            </svg>
            Local Models
            <span className="ml-auto text-[10.5px] font-normal text-[#6b6b6b]">Ollama</span>
          </button>

          {/* Provider */}
          <Section title="Provider">
            <Field label="AI Provider">
              <select
                value={draft.provider}
                onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
                className="w-full appearance-none rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 pr-8 text-[12.5px] text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#1a1a1a]">
                    {p.label}
                  </option>
                ))}
              </select>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#6b6b6b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <path d="M4 6l4 4 4-4" />
              </svg>
            </Field>
            {spec.note ? (
              <p className="text-[11px] leading-4 text-[#6b6b6b]">{spec.note}</p>
            ) : needsKey ? (
              <p className="text-[11px] leading-4 text-[#6b6b6b]">
                API key required — the prefix is validated for your provider
                (e.g. OpenAI "sk-", Anthropic "sk-ant-", Groq "gsk-").
              </p>
            ) : null}
          </Section>

          {/* Connection */}
          <Section title="Connection">
            <Field label="API Endpoint (Base URL)">
              <input
                type="text"
                value={draft.baseUrl}
                onChange={(e) => update("baseUrl", e.target.value)}
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
              />
            </Field>
            <Field label="API Key">
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  onChange={(e) => update("apiKey", e.target.value)}
                  placeholder={needsKey ? "Enter API key" : "Not required"}
                  spellCheck={false}
                  className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 pr-14 text-[12.5px] text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10.5px] text-[#6b6b6b] transition hover:bg-white/[0.06] hover:text-[#ececec]"
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
          </Section>

          {/* Model */}
          <Section title="Model">
            <Field label="Model ID">
              <input
                type="text"
                value={draft.model}
                onChange={(e) => update("model", e.target.value)}
                placeholder="e.g. gpt-4o-mini"
                spellCheck={false}
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12.5px] text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
              />
            </Field>
            <Field label={`Temperature — ${draft.temperature.toFixed(1)}`}>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) => update("temperature", parseFloat(e.target.value))}
                className="w-full accent-[#4c8dff]"
              />
            </Field>
          </Section>

          {/* Behavior */}
          <Section title="Behavior">
            <Field label="System Prompt">
              <textarea
                value={draft.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
                rows={4}
                placeholder="You are a helpful, professional assistant."
                className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12.5px] leading-5 text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
              />
            </Field>
          </Section>

          {/* Agent */}
          <Section title="Agent">
            <button
              type="button"
              onClick={() => update("autoApproveTools", !draft.autoApproveTools)}
              className="flex w-full items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-white/[0.13]"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium text-[#ececec]">Auto-approve tools</div>
                <div className="mt-0.5 text-[11px] leading-4 text-[#6b6b6b]">
                  File edits and shell commands run without asking.
                </div>
              </div>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  draft.autoApproveTools ? "bg-[#4c8dff]" : "bg-white/[0.1]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                    draft.autoApproveTools ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </Section>

          {/* MCP Servers */}
          <Section title="MCP Servers">
            <div className="flex flex-col gap-2">
              {mcpServers.length === 0 && (
                <p className="text-[11px] leading-4 text-[#6b6b6b]">
                  Connect Streamable-HTTP MCP servers to extend the agent with external tools.
                </p>
              )}
              {mcpServers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-2"
                >
                  <button
                    type="button"
                    onClick={() => toggleMcpServer(s.id)}
                    title={s.enabled ? "Disable" : "Enable"}
                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                      s.enabled ? "bg-[#4c8dff]" : "bg-white/[0.12]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                        s.enabled ? "left-[14px]" : "left-0.5"
                      }`}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[12px] font-medium ${s.enabled ? "text-[#ececec]" : "text-[#6b6b6b]"}`}>
                      {s.name}
                    </div>
                    <div className="truncate text-[10px] text-[#555555]">{s.url}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMcpServer(s.id)}
                    aria-label={`Remove ${s.name}`}
                    className="shrink-0 rounded p-1 text-[#6b6b6b] transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              ))}
              <input
                type="text"
                value={mcpName}
                onChange={(e) => setMcpName(e.target.value)}
                placeholder="Server name (e.g. filesystem)"
                spellCheck={false}
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12px] text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
              />
              <input
                type="text"
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="http://localhost:3000/mcp"
                spellCheck={false}
                onKeyDown={(e) => e.key === "Enter" && addMcpServer()}
                className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[12px] text-[#ececec] outline-none transition placeholder:text-[#555555] focus:border-white/[0.18]"
              />
              <button
                type="button"
                onClick={addMcpServer}
                disabled={!mcpName.trim() || !mcpUrl.trim()}
                className="rounded-md border border-white/[0.09] px-3 py-1.5 text-[11.5px] font-medium text-[#d4d4d4] transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add Server
              </button>
            </div>
          </Section>

          {/* Actions */}
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-md bg-[#ececec] px-4 py-2 text-[12.5px] font-semibold text-[#111111] transition hover:bg-white"
            >
              {saved ? "Saved" : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-white/[0.09] px-4 py-2 text-[12.5px] text-[#a3a3a3] transition hover:bg-white/[0.04] hover:text-[#ececec]"
            >
              Reset
            </button>
          </div>

          <p className="text-center text-[10px] leading-4 text-[#4a4a4a]">
            Settings are stored locally on this device.
          </p>
        </div>
      </main>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#6b6b6b]">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="relative block">
      <span className="mb-1.5 block text-[11.5px] font-medium text-[#a3a3a3]">{label}</span>
      {children}
    </label>
  );
}
