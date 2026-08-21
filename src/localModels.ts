import { invoke } from "@tauri-apps/api/core";

export interface LocalModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface LocalModelStatus {
  installed: boolean;
  running: boolean;
}

function inTauri(): boolean {
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown };
  return !!win.__TAURI_INTERNALS__;
}

/**
 * Check if Ollama is installed on the system.
 */
export async function checkOllamaInstalled(): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("check_ollama_installed");
  } catch {
    return false;
  }
}

/**
 * Check if the Ollama server is currently running.
 */
export async function checkOllamaRunning(): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("check_ollama_running");
  } catch {
    return false;
  }
}

/**
 * Start the Ollama server as a background process.
 */
export async function startOllamaServer(): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("start_ollama_server");
  } catch {
    return false;
  }
}

/**
 * Stop the Ollama server process we started.
 */
export async function stopOllamaServer(): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("stop_ollama_server");
  } catch {
    return false;
  }
}

/**
 * List installed local models via the Ollama API.
 */
export async function listLocalModels(): Promise<LocalModelInfo[]> {
  if (!inTauri()) return [];
  try {
    const models = await invoke<LocalModelInfo[]>("list_local_models");
    return models ?? [];
  } catch {
    return [];
  }
}

/**
 * Pull a model from the Ollama registry.
 */
export async function pullLocalModel(modelName: string): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("pull_local_model", { modelName });
  } catch {
    return false;
  }
}

/**
 * Delete a local model.
 */
export async function deleteLocalModel(modelName: string): Promise<boolean> {
  if (!inTauri()) return false;
  try {
    return await invoke<boolean>("delete_local_model", { modelName });
  } catch {
    return false;
  }
}

/**
 * Get the full status (installed + running) in one call.
 */
export async function getLocalModelStatus(): Promise<LocalModelStatus> {
  const [installed, running] = await Promise.all([
    checkOllamaInstalled(),
    checkOllamaRunning(),
  ]);
  return { installed, running };
}

/**
 * Format a model size in bytes to a human-readable string.
 */
export function formatModelSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}