/**
 * BYOK (Bring Your Own Key) — provider API keys for Neo.
 *
 * Two storage modes:
 *  - Signed in  → the key is encrypted server-side (AES-GCM inside the
 *    `api-keys` Supabase Edge Function) and stored in the `user_api_keys`
 *    table. Access is gated by `profiles.byok_enabled`, the future paywall
 *    flag. The decrypted key is held in memory only — never written to disk.
 *  - Signed out → local fallback in localStorage so the app keeps working
 *    without an account.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

const LOCAL_BYOK_KEY = "neo.byok.keys.v1";

/**
 * Providers that can hold a stored key (the app's ProviderId minus `ollama`,
 * which is a local server). Kept here so the client and the `api-keys` edge
 * function (which enforces the same set) cannot drift apart.
 */
export const BYOK_PROVIDERS = [
  "openai",
  "openrouter",
  "groq",
  "anthropic",
  "google",
  "custom",
] as const;

/**
 * Turn a supabase-js functions error into a readable message. Edge Function
 * non-2xx responses throw `FunctionsHttpError`, whose JSON body (e.g. the
 * paywall `{ paywalled: true }` payload) is attached as `.context`.
 */
async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as {
        error?: string;
        paywalled?: boolean;
      };
      if (body?.paywalled) {
        return "BYOK requires an upgraded plan — upgrade to store API keys in your account.";
      }
      if (body?.error) return body.error;
    } catch {
      /* body already consumed, or not JSON */
    }
  }
  const message = (error as { message?: string } | null)?.message;
  return message && message.trim() ? message : fallback;
}

interface LocalByokStore {
  [provider: string]: string;
}

function readLocalStore(): LocalByokStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_BYOK_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStore(store: LocalByokStore): void {
  try {
    localStorage.setItem(LOCAL_BYOK_KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

/** Cached decrypted keys, in-memory only, keyed by provider id. */
const memoryKeys = new Map<string, string>();

/** True when the signed-in user may store/remote-fetch API keys. */
export function byokAllowed(profile: { byokEnabled: boolean } | null, signedIn: boolean): boolean {
  if (!signedIn) return true; // local fallback mode
  return !!profile?.byokEnabled;
}

/** Fetch the decrypted key for a provider (signed-in users). */
export async function fetchRemoteKey(provider: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.functions.invoke("api-keys", {
    method: "GET",
    headers: { "x-neo-provider": provider },
  });
  const payload = data as { apiKey?: string } | null;
  if (payload?.apiKey) memoryKeys.set(provider, payload.apiKey);
  return payload?.apiKey ?? null;
}

/** Encrypt + store a key server-side (signed-in users). */
export async function saveRemoteKey(provider: string, apiKey: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Not signed in — cannot save key to your account.");
  const sb = supabase();
  if (!sb) throw new Error("Not signed in.");
  if (!apiKey.trim()) return await removeRemoteKey(provider);
  const { error } = await sb.functions.invoke("api-keys", {
    body: { provider, apiKey: apiKey.trim() },
  });
  if (error) {
    throw new Error(await invokeErrorMessage(error, "Could not save the key to your account."));
  }
  memoryKeys.set(provider, apiKey.trim());
}

/** Delete the stored key for a provider (signed-in users). */
export async function removeRemoteKey(provider: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.functions.invoke("api-keys", {
    method: "DELETE",
    headers: { "x-neo-provider": provider },
  });
  if (error) {
    throw new Error(await invokeErrorMessage(error, "Could not remove the key from your account."));
  }
  memoryKeys.delete(provider);
}

/** Local fallback (signed-out users). */
export function getLocalKey(provider: string): string {
  return readLocalStore()[provider] ?? "";
}

export function setLocalKey(provider: string, apiKey: string): void {
  const store = readLocalStore();
  if (apiKey.trim()) store[provider] = apiKey.trim();
  else delete store[provider];
  writeLocalStore(store);
  if (apiKey.trim()) memoryKeys.set(provider, apiKey.trim());
  else memoryKeys.delete(provider);
}

/**
 * Resolve the API key for a provider at call time:
 * 1. in-memory cloud key (already fetched), else remote fetch;
 * 2. local fallback for signed-out users.
 *
 * `byokEnabled` is the `profiles.byok_enabled` entitlement. When a signed-in
 * user's plan excludes BYOK we return no key at all — falling back to the local
 * store would silently bypass the paywall.
 */
export async function resolveApiKey(
  provider: string,
  signedIn: boolean,
  byokEnabled: boolean = true
): Promise<string> {
  if (signedIn) {
    if (!byokEnabled) return "";
    if (memoryKeys.has(provider)) return memoryKeys.get(provider) ?? "";
    const remote = await fetchRemoteKey(provider).catch(() => null);
    if (remote) return remote;
    // No key on the account yet — the user may still have a key this device
    // kept from before they signed in.
  }
  return getLocalKey(provider);
}

/** Drop in-memory copies (on sign-out). */
export function clearMemoryKeys(): void {
  memoryKeys.clear();
}

/** Provider ids that currently have a stored key (for the settings UI). */
export function hasKeyHint(provider: string, signedIn: boolean): boolean {
  if (signedIn) return memoryKeys.has(provider);
  return !!getLocalKey(provider);
}