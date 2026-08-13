import { invoke } from "@tauri-apps/api/core";
import type { AISettings, Message } from "./types";
import { DEFAULT_SETTINGS } from "./types";

const SETTINGS_KEY = "neochat.settings.v2";
const HISTORY_KEY = "neochat.history.v2";

const STORAGE_PREFIX = "neochat:";

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

function lsRead(key: string): string | null {
  return localStorage.getItem(STORAGE_PREFIX + key);
}

function lsWrite(key: string, value: string): void {
  localStorage.setItem(STORAGE_PREFIX + key, value);
}

/**
 * Settings
 */
export async function loadSettings(): Promise<AISettings> {
  const raw = inTauri() ? await diskRead(SETTINGS_KEY) : lsRead(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AISettings): Promise<void> {
  const raw = JSON.stringify(settings);
  if (inTauri()) {
    const ok = await diskWrite(SETTINGS_KEY, raw);
    if (!ok) lsWrite(SETTINGS_KEY, raw);
  } else {
    lsWrite(SETTINGS_KEY, raw);
  }
}

/**
 * Chat history
 */
export async function loadChatHistory(): Promise<Message[]> {
  const raw = inTauri() ? await diskRead(HISTORY_KEY) : lsRead(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveChatHistory(messages: Message[]): Promise<void> {
  const raw = JSON.stringify(messages.slice(-200));
  if (inTauri()) {
    const ok = await diskWrite(HISTORY_KEY, raw);
    if (!ok) lsWrite(HISTORY_KEY, raw);
  } else {
    lsWrite(HISTORY_KEY, raw);
  }
}