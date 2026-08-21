export type ProviderId =
  | "openai"
  | "openrouter"
  | "groq"
  | "anthropic"
  | "google"
  | "ollama"
  | "custom";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Per-session AI settings (model/provider) so each chat tab can use a different AI. */
  settings?: AISettings;
}

export interface AISettings {
  /** Which AI provider to talk to. Drives auth, endpoint and response parsing. */
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt: string;
  temperature: number;
}

/** Defaults for every field. Adding a new field here keeps old saved
 *  settings (loaded via `{ ...DEFAULT_SETTINGS, ...parsed }`) valid. */
export const DEFAULT_SETTINGS: AISettings = {
  provider: "openai",
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