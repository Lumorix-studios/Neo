/**
 * Multi-provider AI configuration.
 *
 * Each provider describes how to:
 *  - build the request URL (including auth in the query string where needed,
 *    e.g. Google's `?key=...` parameter)
 *  - attach the API key (Bearer header, raw `x-api-key` header, query param,
 *    or none for self-hosted services like Ollama)
 *  - build the provider-specific request body
 *  - extract a text delta from a single decoded stream chunk
 *  - extract the full content from a non-streaming (or failed-stream) response
 *  - validate the API key format *before* a round-trip so we fail fast and
 *    with an actionable message
 *  - produce a helpful hint when the provider returns an auth / config error
 */
import type { AISettings, Message, ProviderId } from "./types";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  /** Human readable note shown in the settings UI, e.g. "No API key required". */
  note?: string;
  defaultBaseUrl: string;
  defaultModel: string;
  /** Whether the provider requires an API key / token at all. */
  needsAuth: boolean;
  /** Header name used to carry the key, or `null` to use a query parameter. */
  authHeader: string | null;
  /** How the header value is formatted. */
  authScheme: "bearer" | "apikey";
  /** Query parameter name for the key (Google uses `?key=`), or `null`. */
  authQueryParam: string | null;
  /** Extra static headers that must be sent (e.g. Anthropic's `anthropic-version`). */
  extraHeaders: Record<string, string>;
  /** Assemble the full request URL from settings (may embed the key as a query param). */
  buildUrl: (settings: AISettings) => string;
  /** Build the JSON request body from the conversation history (excludes the system prompt
   * which each provider attaches in its own shape). */
  buildBody: (settings: AISettings, history: Message[]) => object;
  /** Pull a text delta out of a decoded stream chunk. Return `null` when the
   * chunk carries no new text (a role event, usage metadata, `[DONE]`, etc.). */
  extractDelta: (json: unknown) => string | null;
  /** Extract full content from a complete (non-streaming) JSON response. */
  extractContent: (json: unknown) => string;
  /** Validate the API key format. Return a user-facing error string, or `null` when valid. */
  validateAuth: (apiKey: string) => string | null;
  /** Produce a provider-specific hint appended to HTTP auth / config errors. */
  authErrorHint: (status: number, settings: AISettings) => string;
}

/**
 * Minimal, `any`-free shapes for the pieces of each provider's JSON that we
 * actually read. Parsed SSE/NDJSON lines are cast into these so the compiler
 * stays happy without resorting to `any`. Extra fields are simply ignored.
 */
interface OpenAiShape {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string };
  }>;
}
interface AnthropicShape {
  type?: string;
  delta?: { text?: string };
  content?: Array<{ text?: string }>;
}
interface GoogleShape {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}
interface OllamaShape {
  done?: boolean;
  message?: { content?: string };
}

const bearer = (value: string) => `Bearer ${value}`;

/**
 * Build the authentication headers for a provider. Keys are only attached when
 * the provider requires auth and a key is present — self-hosted providers such
 * as Ollama never send a key header. Query-param providers (Google) have their
 * key embedded in the URL by `buildUrl` instead.
 */
export function buildAuthHeaders(spec: ProviderSpec, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { ...spec.extraHeaders };
  if (spec.needsAuth && apiKey && spec.authHeader) {
    headers[spec.authHeader] = spec.authScheme === "bearer" ? bearer(apiKey) : apiKey;
  }
  return headers;
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    needsAuth: true,
    authHeader: "Authorization",
    authScheme: "bearer",
    authQueryParam: null,
    extraHeaders: {},
    buildUrl: (s) => `${s.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    buildBody: (s, history) => ({
      model: s.model,
      messages: [{ role: "system", content: s.systemPrompt }, ...history],
      temperature: s.temperature,
      stream: true,
    }),
    extractDelta: (j) => {
      const c = (j as OpenAiShape)?.choices?.[0]?.delta?.content;
      return typeof c === "string" && c.length > 0 ? c : null;
    },
    extractContent: (j) => (j as OpenAiShape)?.choices?.[0]?.message?.content ?? "",
    validateAuth: (k) =>
      !k || !k.startsWith("sk-")
        ? 'OpenAI API key looks invalid — it should start with "sk-" (get one at platform.openai.com/api-keys).'
        : null,
    authErrorHint: (status) =>
      `Authentication failed (${status}). Verify your OpenAI key at platform.openai.com/api-keys and confirm billing is enabled.`,
  },

  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    note: "Auto-routes to the best available model.",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    needsAuth: true,
    authHeader: "Authorization",
    authScheme: "bearer",
    authQueryParam: null,
    extraHeaders: {
      // OpenRouter recommends these for app analytics & ranking.
      "HTTP-Referer": "https://neochat.local",
      "X-Title": "Neo",
    },
    buildUrl: (s) => `${s.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    buildBody: (s, history) => ({
      model: s.model,
      messages: [{ role: "system", content: s.systemPrompt }, ...history],
      temperature: s.temperature,
      stream: true,
    }),
    extractDelta: (j) => {
      const c = (j as OpenAiShape)?.choices?.[0]?.delta?.content;
      return typeof c === "string" && c.length > 0 ? c : null;
    },
    extractContent: (j) => (j as OpenAiShape)?.choices?.[0]?.message?.content ?? "",
    validateAuth: (k) =>
      !k || !k.startsWith("sk-")
        ? 'OpenRouter API key looks invalid — it should start with "sk-" (get one at openrouter.ai/keys).'
        : null,
    authErrorHint: (status) =>
      `Authentication failed (${status}). Check your OpenRouter key at openrouter.ai/keys and that the model is available.`,
  },

  groq: {
    id: "groq",
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant",
    needsAuth: true,
    authHeader: "Authorization",
    authScheme: "bearer",
    authQueryParam: null,
    extraHeaders: {},
    buildUrl: (s) => `${s.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    buildBody: (s, history) => ({
      model: s.model,
      messages: [{ role: "system", content: s.systemPrompt }, ...history],
      temperature: s.temperature,
      stream: true,
    }),
    extractDelta: (j) => {
      const c = (j as OpenAiShape)?.choices?.[0]?.delta?.content;
      return typeof c === "string" && c.length > 0 ? c : null;
    },
    extractContent: (j) => (j as OpenAiShape)?.choices?.[0]?.message?.content ?? "",
    validateAuth: (k) =>
      !k || !k.startsWith("gsk-")
        ? 'Groq API key looks invalid — it should start with "gsk-" (get one at console.groq.com/keys).'
        : null,
    authErrorHint: (status) =>
      `Authentication failed (${status}). Check your Groq key at console.groq.com/keys.`,
  },

  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-20241022",
    needsAuth: true,
    authHeader: "x-api-key",
    authScheme: "apikey", // raw value, NOT "Bearer ..."
    authQueryParam: null,
    extraHeaders: { "anthropic-version": "2023-06-01" },
    buildUrl: (s) => `${s.baseUrl.replace(/\/+$/, "")}/v1/messages`,
    buildBody: (s, history) => ({
      model: s.model,
      system: s.systemPrompt,
      messages: history, // Anthropic does not accept a "system" role inside messages
      max_tokens: 4096,
      temperature: s.temperature,
      stream: true,
    }),
    extractDelta: (j) => {
      const obj = j as AnthropicShape;
      if (obj?.type !== "content_block_delta") return null;
      const t = obj?.delta?.text;
      return typeof t === "string" && t.length > 0 ? t : null;
    },
    extractContent: (j) => (j as AnthropicShape)?.content?.[0]?.text ?? "",
    validateAuth: (k) =>
      !k || !k.startsWith("sk-ant-")
        ? 'Anthropic API key looks invalid — it should start with "sk-ant-" (get one at console.anthropic.com/settings/keys).'
        : null,
    authErrorHint: (status, s) =>
      `Authentication failed (${status}). Verify your Anthropic key at console.anthropic.com/settings/keys and that you have access to "${s.model}".`,
  },

  google: {
    id: "google",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
    needsAuth: true,
    authHeader: null, // key goes in the URL query string
    authScheme: "bearer",
    authQueryParam: "key",
    extraHeaders: {},
    buildUrl: (s) => {
      const base = s.baseUrl.replace(/\/+$/, "");
      const url = new URL(`${base}/models/${encodeURIComponent(s.model)}:streamGenerateContent`);
      url.searchParams.set("key", s.apiKey);
      return url.toString();
    },
    buildBody: (s, history) => ({
      contents: history.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      system_instruction: { parts: [{ text: s.systemPrompt }] },
      generationConfig: { temperature: s.temperature },
    }),
    extractDelta: (j) => {
      const t = (j as GoogleShape)?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof t === "string" && t.length > 0 ? t : null;
    },
    extractContent: (j) =>
      (j as GoogleShape)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    validateAuth: (k) =>
      !k || k.length < 20
        ? "Google API key looks invalid — it should be a long alphanumeric string from Google Cloud."
        : null,
    authErrorHint: (status) =>
      `Authentication failed (${status}). Check your Google API key and that the Generative Language API is enabled in Google Cloud.`,
  },

  ollama: {
    id: "ollama",
    label: "Ollama",
    note: "Self-hosted local model runner. No API key needed.",
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3",
    needsAuth: false,
    authHeader: null,
    authScheme: "bearer",
    authQueryParam: null,
    extraHeaders: {},
    buildUrl: (s) => `${s.baseUrl.replace(/\/+$/, "")}/api/chat`,
    buildBody: (s, history) => ({
      model: s.model,
      messages: [{ role: "system", content: s.systemPrompt }, ...history],
      stream: true,
      options: { temperature: s.temperature },
    }),
    // Ollama sends newline-delimited JSON (no `data:` prefix). The final chunk
    // has `done: true` and must be ignored.
    extractDelta: (j) => {
      const obj = j as OllamaShape;
      if (obj?.done) return null;
      const c = obj?.message?.content;
      return typeof c === "string" && c.length > 0 ? c : null;
    },
    extractContent: (j) => (j as OllamaShape)?.message?.content ?? "",
    validateAuth: () => null,
    authErrorHint: (status, s) =>
      `Connection failed (${status}). Ensure Ollama is running on "${s.baseUrl}" and that the model "${s.model}" is pulled (try: ollama pull ${s.model}).`,
  },

  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    note: "Any OpenAI-compatible endpoint (e.g. a local proxy).",
    defaultBaseUrl: "",
    defaultModel: "gpt-4o-mini",
    needsAuth: true,
    authHeader: "Authorization",
    authScheme: "bearer",
    authQueryParam: null,
    extraHeaders: {},
    buildUrl: (s) => `${s.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    buildBody: (s, history) => ({
      model: s.model,
      messages: [{ role: "system", content: s.systemPrompt }, ...history],
      temperature: s.temperature,
      stream: true,
    }),
    extractDelta: (j) => {
      const c = (j as OpenAiShape)?.choices?.[0]?.delta?.content;
      return typeof c === "string" && c.length > 0 ? c : null;
    },
    extractContent: (j) => (j as OpenAiShape)?.choices?.[0]?.message?.content ?? "",
    validateAuth: (k) => (!k ? "An API key is required." : null),
    authErrorHint: (status) =>
      `Request failed (${status}). Check your base URL, API key, and model in the AI Settings sidebar.`,
  },
};

/**
 * Resolve the provider spec for a given settings object, falling back to a
 * safe default when the stored provider id is unknown (e.g. settings were
 * saved by an older version of the app).
 */
export function getProviderSpec(settings: AISettings): ProviderSpec {
  return PROVIDERS[settings.provider] ?? PROVIDERS.openai;
}

/** Pick a provider by id, falling back to `openai` for unknown ids. */
export function providerById(id: ProviderId): ProviderSpec {
  return PROVIDERS[id] ?? PROVIDERS.openai;
}

/** List of providers suitable for a `<select>`. */
export const PROVIDER_OPTIONS: { id: ProviderId; label: string; note?: string }[] =
  Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, note: p.note }));
