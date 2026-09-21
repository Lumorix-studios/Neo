/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
/**
 * BYOK (Bring Your Own Key) — provider API keys for Neo.
 *
 * Two storage modes:
 *  - Signed in  → the key is encrypted server-side (AES-GCM inside the
 *    `api-keys` Supabase Edge Function) and stored in the `user_api_keys`
 *    table. Access is gated by `profiles.byok_enabled`, the future paywall
 *    flag. The decrypted key is held in memory only — never written to disk.
 *  - Signed out → optional local fallback. Desktop builds store it in the
 *    OS app-data directory so it survives WebView/profile changes; browser
 *    builds use localStorage. Signed-in sessions never fall back to this
 *    local store.
 */

import { supabase, isSupabaseConfigured } from "./supabase";
import { debugLog } from "../debugLog";
import { invoke } from "@tauri-apps/api/core";

const LOCAL_BYOK_KEY = "neo.byok.keys.v1";
const LOCAL_BYOK_STATE_KEY = "neochat.byok.local.v1";

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

function inTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

async function readLocalStore(): Promise<LocalByokStore> {
  try {
    let raw: string | null = null;
    if (inTauri()) {
      raw = await invoke<string>("load_state", { key: LOCAL_BYOK_STATE_KEY });
      // Migrate the old WebView-local store into the desktop app-data store.
      if (!raw) raw = localStorage.getItem(LOCAL_BYOK_KEY);
    } else {
      raw = localStorage.getItem(LOCAL_BYOK_KEY);
    }
    const parsed = JSON.parse(raw ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function writeLocalStore(store: LocalByokStore): Promise<void> {
  try {
    const raw = JSON.stringify(store);
    if (inTauri()) {
      await invoke("save_state", { key: LOCAL_BYOK_STATE_KEY, value: raw });
    } else {
      localStorage.setItem(LOCAL_BYOK_KEY, raw);
    }
  } catch {
    if (!inTauri()) {
      try {
        localStorage.setItem(LOCAL_BYOK_KEY, JSON.stringify(store));
      } catch {
        /* storage unavailable */
      }
    }
  }
}

/** Cached decrypted keys, in-memory only, keyed by provider id. */
const memoryKeys = new Map<string, string>();
const remoteKeyCache = new Map<string, string | null>();
const remoteKeyRequests = new Map<string, Promise<string | null>>();

/** True when the signed-in user may store/remote-fetch API keys. */
export function byokAllowed(profile: { byokEnabled: boolean } | null, signedIn: boolean): boolean {
  if (!signedIn) return true; // local fallback mode
  return !!profile?.byokEnabled;
}

/** Fetch the decrypted key for a provider (signed-in users). */
export async function fetchRemoteKey(provider: string): Promise<string | null> {
  if (remoteKeyCache.has(provider)) return remoteKeyCache.get(provider) ?? null;
  const pending = remoteKeyRequests.get(provider);
  if (pending) return pending;
  const request = fetchRemoteKeyOnce(provider);
  remoteKeyRequests.set(provider, request);
  try {
    return await request;
  } finally {
    remoteKeyRequests.delete(provider);
  }
}

async function fetchRemoteKeyOnce(provider: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke("api-keys", {
    method: "GET",
    headers: { "x-neo-provider": provider },
  });
  const payload = data as { apiKey?: string; error?: string; paywalled?: boolean } | null;
  // #region agent log
  debugLog("D", "byok.ts:fetchRemoteKey", "api-keys GET", {
    provider,
    hasKey: !!payload?.apiKey,
    invokeError: error?.message ?? null,
    bodyError: payload?.error ?? null,
    paywalled: payload?.paywalled ?? false,
  });
  // #endregion
  if (error) {
    throw new Error(await invokeErrorMessage(error, "Could not load the key from your account."));
  }
  if (payload?.error) {
    throw new Error(payload.error);
  }
  if (payload?.apiKey) memoryKeys.set(provider, payload.apiKey);
  const key = payload?.apiKey ?? null;
  remoteKeyCache.set(provider, key);
  return key;
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
  const normalized = apiKey.trim();
  memoryKeys.set(provider, normalized);
  remoteKeyCache.set(provider, normalized);
  await clearLocalKey(provider);
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
  remoteKeyCache.set(provider, null);
  await clearLocalKey(provider);
}

/** Local fallback (signed-out users). Desktop state uses Tauri app-data. */
export async function getLocalKey(provider: string): Promise<string> {
  return (await readLocalStore())[provider] ?? "";
}

export async function setLocalKey(provider: string, apiKey: string): Promise<void> {
  const store = await readLocalStore();
  if (apiKey.trim()) store[provider] = apiKey.trim();
  else delete store[provider];
  await writeLocalStore(store);
  if (apiKey.trim()) memoryKeys.set(provider, apiKey.trim());
  else memoryKeys.delete(provider);
}

export async function clearLocalKey(provider: string): Promise<void> {
  const store = await readLocalStore();
  delete store[provider];
  await writeLocalStore(store);
}

/**
 * Resolve the API key for a provider at call time:
 * 1. in-memory cloud key (already fetched), else remote fetch;
 * 2. local fallback for signed-out users only.
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
    const remote = await fetchRemoteKey(provider);
    return remote ?? "";
  }
  return await getLocalKey(provider);
}

/** Drop in-memory copies (on sign-out). */
export function clearMemoryKeys(): void {
  memoryKeys.clear();
  remoteKeyCache.clear();
  remoteKeyRequests.clear();
}

/** Provider ids that currently have a stored key (for the settings UI). */
export async function hasKeyHint(provider: string, signedIn: boolean): Promise<boolean> {
  if (signedIn) return memoryKeys.has(provider);
  return !!(await getLocalKey(provider));
}