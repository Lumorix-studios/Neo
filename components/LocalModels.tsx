import { useCallback, useEffect, useState } from "react";
import {
  IoServer,
  IoPlay,
  IoStop,
  IoTrash,
  IoDownload,
  IoRefresh,
  IoCube,
  IoCheckmarkCircle,
  IoAlertCircle,
  IoClose,
} from "react-icons/io5";
import {
  checkOllamaInstalled,
  checkOllamaRunning,
  startOllamaServer,
  stopOllamaServer,
  listLocalModels,
  pullLocalModel,
  deleteLocalModel,
  formatModelSize,
  type LocalModelInfo,
} from "../src/localModels";

interface Props {
  onClose: () => void;
  onSelectModel: (modelName: string) => void;
  selectedModel: string;
}

const POPULAR_MODELS = [
  "llama3.2",
  "llama3.1",
  "mistral",
  "gemma2",
  "phi3",
  "qwen2.5",
  "codellama",
  "deepseek-coder",
];

export default function LocalModels({ onClose, onSelectModel, selectedModel }: Props) {
  const [installed, setInstalled] = useState(false);
  const [running, setRunning] = useState(false);
  const [models, setModels] = useState<LocalModelInfo[]>([]);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pullName, setPullName] = useState("");
  const [showPullInput, setShowPullInput] = useState(false);

  const refreshStatus = useCallback(async () => {
    const [isInstalled, isRunning] = await Promise.all([
      checkOllamaInstalled(),
      checkOllamaRunning(),
    ]);
    setInstalled(isInstalled);
    setRunning(isRunning);
    if (isRunning) {
      const modelList = await listLocalModels();
      setModels(modelList);
    } else {
      setModels([]);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const ok = await startOllamaServer();
      if (ok) {
        setRunning(true);
        setSuccess("Ollama server started successfully.");
        const modelList = await listLocalModels();
        setModels(modelList);
      } else {
        setError("Failed to start the Ollama server.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the Ollama server.");
    } finally {
      setStarting(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    setError(null);
    try {
      await stopOllamaServer();
      setRunning(false);
      setModels([]);
      setSuccess("Ollama server stopped.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop the Ollama server.");
    } finally {
      setStopping(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handlePull = async (name: string) => {
    const modelName = name.trim();
    if (!modelName) return;
    setPulling(modelName);
    setError(null);
    setSuccess(null);
    try {
      const ok = await pullLocalModel(modelName);
      if (ok) {
        setSuccess(`Model "${modelName}" pulled successfully.`);
        const modelList = await listLocalModels();
        setModels(modelList);
        setPullName("");
        setShowPullInput(false);
      } else {
        setError(`Failed to pull model "${modelName}".`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to pull model "${modelName}".`);
    } finally {
      setPulling(null);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleDelete = async (name: string) => {
    setDeleting(name);
    setError(null);
    try {
      const ok = await deleteLocalModel(name);
      if (ok) {
        setSuccess(`Model "${name}" deleted.`);
        const modelList = await listLocalModels();
        setModels(modelList);
      } else {
        setError(`Failed to delete model "${name}".`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to delete model "${name}".`);
    } finally {
      setDeleting(null);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleSelect = (name: string) => {
    onSelectModel(name);
    setSuccess(`Model "${name}" selected.`);
    setTimeout(() => setSuccess(null), 2000);
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#10110f] text-[#f1f1eb]">
      <header className="flex h-12 items-center gap-2 border-b border-white/[0.08] px-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-md text-amber-50">
          <span className="text-[13px] font-bold">
            <IoCube size={18} />
          </span>
        </div>
        <span className="text-[12px] font-semibold tracking-tight">Local Models</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Refresh"
          title="Refresh status"
          onClick={() => void refreshStatus()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#777873] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
        >
          <IoRefresh size={15} />
        </button>
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
          {/* Server Status */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#777873]">
              <span className="text-[#a1a1aa]">
                <IoServer size={14} />
              </span>
              Server Status
            </div>

            {!installed ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
                  <IoAlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                  <div className="text-[12px] leading-5 text-amber-200">
                    <p className="font-medium">Ollama is not installed</p>
                    <p className="mt-1 text-[11px] text-amber-200/70">
                      Install Ollama from{" "}
                      <a
                        href="https://ollama.com"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-amber-100"
                      >
                        ollama.com
                      </a>{" "}
                      to run local AI models on your device.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      running ? "bg-emerald-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-[13px] font-medium">
                    {running ? "Server running" : "Server stopped"}
                  </span>
                  <span className="text-[11px] text-[#777873]">localhost:11434</span>
                </div>

                <div className="flex gap-2">
                  {!running ? (
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={starting}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#c9f2d6] px-3 py-2 text-[12px] font-semibold text-[#152219] transition hover:opacity-85 disabled:opacity-50"
                    >
                      <IoPlay size={13} />
                      {starting ? "Starting..." : "Start Server"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStop}
                      disabled={stopping}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <IoStop size={13} />
                      {stopping ? "Stopping..." : "Stop Server"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Error / Success messages */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] leading-5 text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[12px] leading-5 text-emerald-300">
              {success}
            </div>
          )}

          {/* Installed Models */}
          {running && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#777873]">
                  <span className="text-[#a1a1aa]">
                    <IoCube size={14} />
                  </span>
                  Installed Models
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-[#a1a1aa]">
                    {models.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPullInput((v) => !v)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#a1a1aa] transition hover:bg-white/[0.06] hover:text-[#f1f1eb]"
                >
                  <IoDownload size={12} />
                  Pull Model
                </button>
              </div>

              {showPullInput && (
                <div className="mb-3 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pullName}
                      onChange={(e) => setPullName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handlePull(pullName);
                      }}
                      placeholder="e.g. llama3.2"
                      className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-[#f1f1eb] outline-none transition placeholder:text-[#55564f] focus:border-white/[0.18] focus:bg-white/[0.05]"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePull(pullName)}
                      disabled={!pullName.trim() || pulling !== null}
                      className="rounded-lg bg-[#c9f2d6] px-3 py-2 text-[12px] font-semibold text-[#152219] transition hover:opacity-85 disabled:opacity-50"
                    >
                      {pulling ? "Pulling..." : "Pull"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_MODELS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPullName(m)}
                        className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] text-[#a1a1aa] transition hover:border-white/[0.2] hover:text-[#f1f1eb]"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {models.length === 0 ? (
                <p className="py-4 text-center text-[12px] text-[#55564f]">
                  No models installed yet. Pull one to get started.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {models.map((model) => (
                    <div
                      key={model.name}
                      className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                        selectedModel === model.name
                          ? "border-[#c9f2d6]/40 bg-[#c9f2d6]/[0.06]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(model.name)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`shrink-0 ${
                            selectedModel === model.name ? "text-[#c9f2d6]" : "text-[#777873]"
                          }`}
                        >
                          {selectedModel === model.name ? (
                            <IoCheckmarkCircle size={15} />
                          ) : (
                            <IoCube size={15} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium text-[#f1f1eb]">
                            {model.name}
                          </span>
                          <span className="block text-[10px] text-[#777873]">
                            {model.details?.parameter_size ?? "Unknown size"} ·{" "}
                            {formatModelSize(model.size)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(model.name)}
                        disabled={deleting === model.name}
                        title={`Delete ${model.name}`}
                        className="shrink-0 rounded-md p-1.5 text-[#777873] opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
                      >
                        <IoTrash size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#777873]">
              How it works
            </div>
            <p className="text-[11px] leading-5 text-[#a1a1aa]">
              Local models run entirely on your device using{" "}
              <span className="text-[#f1f1eb]">Ollama</span>. No data leaves your
              computer. Start the server, pull a model, then select it to chat
              with it. The selected model will be used as your AI provider.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}