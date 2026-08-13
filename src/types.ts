export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AISettings {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  temperature: number;
}

export const DEFAULT_SETTINGS: AISettings = {
  apiKey: "",
  model: "gpt-4o-mini",
  baseUrl: "https://api.openai.com/v1",
  systemPrompt: "You are a helpful, professional assistant.",
  temperature: 0.7,
};

const STORAGE_KEY = "neochat.settings.v1";

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}