/**
 * Supabase client for Neo (AgenticCoder).
 *
 * Configured via Vite env vars (see .env.example at the repo root):
 *   VITE_SUPABASE_URL      — e.g. https://abcdefgh.supabase.co
 *   VITE_SUPABASE_ANON_KEY — the anon/public key from the same project
 *
 * When either var is missing the app runs fully local (every call in
 * auth.ts / cloudSync.ts / byok.ts degrades to local-only behaviour) so a
 * dev build without a Supabase project keeps working.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

let client: SupabaseClient | null = null;
if (isSupabaseConfigured) {
  // persistSession: keep the login across app restarts (like VS Code sign-in).
  // autoRefreshToken: silently refresh JWTs in the background.
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // deep-link/token handling is done manually
      // Sessions are persisted in the WebView's localStorage under the
      // supabase-js storage key, so sign-in survives app restarts.
    },
  });
}

/** The shared Supabase client, or `null` when env vars are not configured. */
export function supabase(): SupabaseClient | null {
  return client;
}