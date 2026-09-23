/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
export type ProviderId =
  | "openai"
  | "openrouter"
  | "groq"
  | "nvidia"
  | "anthropic"
  | "google"
  | "ollama"
  | "custom";

export interface NativeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Gemini thinking models: opaque signature returned with a functionCall
   * part — it must be replayed verbatim in later turns or the API 400s
   * ("Function call is missing a thought_signature"). */
  thoughtSignature?: string;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  /** Assistant-native tool invocations (OpenAI/Anthropic/Ollama/Gemini). */
  toolCalls?: NativeToolCall[];
  /** Tool-result correlation id when role is `tool`. */
  toolCallId?: string;
  toolName?: string;
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
  /** When true, agent file edits & commands run without an approval dialog. */
  autoApproveTools?: boolean;
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
  autoApproveTools: false,
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