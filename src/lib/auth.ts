/**
 * Authentication for Neo — email/password + GitHub & Google OAuth.
 *
 * All functions degrade gracefully when Supabase env vars are missing
 * (isSupabaseConfigured === false): they resolve to a signed-out state with a
 * friendly message instead of throwing.
 */

import {
  supabase,
  isSupabaseConfigured,
  supabaseUrl,
  supabaseAnonKey,
} from "./supabase";

export type AuthProvider = "github" | "google";

/** Display label for an OAuth provider id ("github" → "GitHub"). */
export function providerLabel(provider: AuthProvider): string {
  return provider === "github" ? "GitHub" : "Google";
}

/** Which sign-in methods the Supabase project actually has switched on. */
export interface EnabledProviders {
  email: boolean;
  github: boolean;
  google: boolean;
}

let providersPromise: Promise<EnabledProviders | null> | null = null;

/**
 * Ask the project which sign-in providers are enabled.
 *
 * Needed because `signInWithOAuth({ skipBrowserRedirect: true })` builds the
 * authorize URL entirely client-side and never contacts the server — so
 * supabase-js reports `error: null` for a disabled provider, and the user is
 * dropped into the system browser staring at raw GoTrue JSON:
 * `{"code":400,"error_code":"validation_failed", …}`.
 * GoTrue's public settings endpoint is the only way to know beforehand.
 *
 * Cached for the session. Resolves to `null` when the probe fails (offline,
 * old project…), and callers should then simply let the user try.
 */
export function fetchEnabledProviders(): Promise<EnabledProviders | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (!providersPromise) {
    providersPromise = fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { external?: Record<string, boolean> } | null) => {
        const external = json?.external;
        if (!external) return null;
        return {
          // `!== false` so an unexpected shape still lets the user try.
          email: external.email !== false,
          github: external.github === true,
          google: external.google === true,
        };
      })
      .catch(() => null);
  }
  return providersPromise;
}

/** True when the project is known to have this provider switched off. */
export async function isProviderDisabled(provider: AuthProvider): Promise<boolean> {
  const enabled = await fetchEnabledProviders();
  return enabled ? !enabled[provider] : false;
}

/**
 * Re-probe the project, ignoring the session cache.
 *
 * The cached result would otherwise pin a freshly-enabled provider to
 * "disabled" until the app restarts, so callers that are about to show the
 * sign-in form (or that offer a recheck) should use this instead.
 */
export function refreshEnabledProviders(): Promise<EnabledProviders | null> {
  providersPromise = null;
  return fetchEnabledProviders();
}

/** Actionable message for a provider that isn't enabled on the project. */
export function providerDisabledMessage(provider: AuthProvider): string {
  return (
    `${providerLabel(provider)} sign-in isn't enabled on this Supabase project yet. ` +
    "Turn it on in Dashboard → Authentication → Sign In / Providers, paste the OAuth " +
    "Client ID and Client Secret, add the callback URL shown there to your OAuth app, " +
    "then try again."
  );
}

export interface NeoUser {
  id: string;
  email: string;
  /** Display name (profile row if present, else email local-part). */
  name: string;
  /** Avatar URL (profile row if present, else OAuth-provided one). */
  avatarUrl: string | null;
  /** Raw auth provider ("email" | "github" | "google"). */
  provider: string;
}

export interface Profile extends NeoUser {
  /** Billing plan id from profiles.plan ("free" by default). */
  plan: string;
  /** Paywall flag — flip server-side when BYOK goes paid. */
  byokEnabled: boolean;
  createdAt: string | null;
}

/** Map a supabase auth user + profile row to our app-level shape. */
function toNeoUser(
  authUser: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
  profile?: { display_name?: string | null; avatar_url?: string | null } | null
): NeoUser {
  const meta = authUser.user_metadata ?? {};
  const metaName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.user_name === "string" && meta.user_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  const metaAvatar =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  const identity = (authUser.app_metadata?.provider as string | undefined) ?? "email";
  return {
    id: authUser.id,
    email: authUser.email ?? "",
    name: profile?.display_name || metaName || authUser.email?.split("@")[0] || "Account",
    avatarUrl: profile?.avatar_url || metaAvatar,
    provider: identity,
  };
}

export function authErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // Supabase returns this until the provider is switched on in the dashboard.
  // The raw text names the API ("Unsupported provider: provider is not
  // enabled"), not the button the user has to click — so translate it.
  if (/provider is not enabled|unsupported provider/i.test(msg)) {
    return "This sign-in provider isn't enabled on your Supabase project yet — turn it on in Dashboard → Authentication → Sign In / Providers, then try again.";
  }

  // redirect_to rejected because it isn't in the allow list.
  if (/redirect/i.test(msg) && /(not allowed|not in|invalid|whitelist)/i.test(msg)) {
    return "Your project's Redirect URLs allow list doesn't include this app's callback — add agenticcoder://auth/callback in Dashboard → Authentication → URL Configuration.";
  }

  return msg
    .replace(/Email logins are disabled/, "Email sign-in is disabled for this project")
    .replace(/Invalid login credentials/, "Incorrect email or password.")
    .replace(/User already registered/, "An account with this email already exists — try signing in.")
    .replace(/Password should be at least/, "Password is too short — use at least 6 characters.");
}

/** Current signed-in user (null when signed out / Supabase unconfigured). */
export async function getCurrentUser(): Promise<NeoUser | null> {
  if (!isSupabaseConfigured) return null;
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.user) return null;
  const { data: profile } = await sb
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", data.session.user.id)
    .maybeSingle();
  return toNeoUser(data.session.user, profile ?? undefined);
}

/** Full profile (includes the BYOK paywall flag). Null when signed out. */
export async function getProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null;
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.user) return null;
  const { data: row } = await sb
    .from("profiles")
    .select("id, display_name, avatar_url, plan, byok_enabled, created_at")
    .eq("id", data.session.user.id)
    .maybeSingle();
  const base = toNeoUser(data.session.user, row ?? undefined);
  return {
    ...base,
    plan: row?.plan ?? "free",
    byokEnabled: row?.byok_enabled ?? false,
    createdAt: row?.created_at ?? null,
  };
}

/** Create the profile row on demand (backup for the DB trigger). */
export async function ensureProfile(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = supabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  const { data: existing } = await sb.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) return;
  const meta = user.user_metadata ?? {};
  // `ignoreDuplicates` turns this into INSERT … ON CONFLICT DO NOTHING, so it
  // only needs INSERT privileges — the client has no UPDATE grant on `id` or on
  // the entitlement columns (see supabase/migrations/0002_harden_profiles.sql).
  await sb.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? "",
      display_name:
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.user_name === "string" && meta.user_name) ||
        user.email?.split("@")[0] ||
        "Account",
      avatar_url:
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
}

/** Update display name / avatar in the profiles table. */
export async function updateProfile(patch: {
  displayName?: string;
  avatarUrl?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Not signed in.");
  const sb = supabase();
  if (!sb) throw new Error("Not signed in.");
  // Backup for the DB trigger on accounts that predate it.
  await ensureProfile().catch(() => undefined);
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("Not signed in.");
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl;
  const { error } = await sb.from("profiles").update(update).eq("id", uid);
  if (error) throw new Error(authErrorMessage(error));
}

/**
 * Sign up with email + password. Supabase sends a confirmation email when
 * "Confirm email" is enabled on the project (default) — surface that to the UI.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsEmailConfirmation: boolean }> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured — see SUPABASE_SETUP.md.");
  const sb = supabase();
  if (!sb) throw new Error("Supabase is not configured.");
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  await ensureProfile().catch(() => undefined);
  return { needsEmailConfirmation: !data.session && !!data.user };
}

/** Sign in with email + password. */
export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured — see SUPABASE_SETUP.md.");
  const sb = supabase();
  if (!sb) throw new Error("Supabase is not configured.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  await ensureProfile().catch(() => undefined);
}

/** Send a password-reset email. */
export async function resetPassword(email: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  const sb = supabase();
  if (!sb) throw new Error("Supabase is not configured.");
  const redirectTo =
    (import.meta.env.VITE_OAUTH_REDIRECT_URL as string | undefined)?.trim() ||
    "agenticcoder://auth/callback";
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(authErrorMessage(error));
}

/** Sign out (cloud data stays intact for the next login). */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = supabase();
  if (!sb) return;
  await sb.auth.signOut();
}

/** Deep-link that the OS browser redirects back to after OAuth / recovery. */
export function oauthRedirectUrl(): string {
  return (
    (import.meta.env.VITE_OAUTH_REDIRECT_URL as string | undefined)?.trim() ||
    "agenticcoder://auth/callback"
  );
}

/**
 * OAuth sign-in (GitHub / Google), VS Code style: the system browser opens,
 * the user authorises there, and Supabase redirects back into the app via the
 * deep link. The returning tokens are exchanged in handleOAuthRedirect().
 * Returns the provider URL for the caller to open with the OS opener.
 */
export async function signInWithOAuth(provider: AuthProvider): Promise<string> {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured — see SUPABASE_SETUP.md.");
  const sb = supabase();
  if (!sb) throw new Error("Supabase is not configured.");

  // Pre-flight. `signInWithOAuth` below cannot fail locally, so without this
  // check the user gets sent to the browser to read a raw JSON error page.
  if (await isProviderDisabled(provider)) throw new Error(providerDisabledMessage(provider));

  const { data, error } = await sb.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: oauthRedirectUrl(),
      skipBrowserRedirect: true, // we open the URL ourselves via the OS browser
    },
  });
  if (error) {
    // The dashboard error is generic and never names the provider, but we know
    // which button was pressed — so say exactly which one needs enabling.
    if (/provider is not enabled|unsupported provider/i.test(error.message)) {
      throw new Error(providerDisabledMessage(provider));
    }
    throw new Error(authErrorMessage(error));
  }
  if (!data?.url) throw new Error("Could not start the sign-in flow — try again.");
  return data.url;
}

/**
 * Complete an OAuth / magic-link / password-recovery flow that redirected back
 * into the app with tokens in the URL (fragment or query).
 *
 * `rawUrl` is the deep-link URL handed to us by the OS
 * (`agenticcoder://auth/callback#access_token=…`); when omitted the webview's
 * own location is inspected instead (browser build). Idempotent — safe to call
 * on every startup and on every incoming deep link.
 */
export async function handleOAuthRedirect(rawUrl?: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const sb = supabase();
  if (!sb) return;

  const fromDeepLink = typeof rawUrl === "string" && rawUrl.length > 0;
  const href = fromDeepLink ? (rawUrl as string) : window.location.href;
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return;
  }
  const hash = parsed.hash;
  const hasHash = hash.includes("access_token") || hash.includes("error");
  const hasQuery =
    parsed.search.includes("code=") ||
    parsed.search.includes("error") ||
    parsed.search.includes("error_description");
  if (!hasHash && !hasQuery) return;

  try {
    if (hasHash) {
      // Implicit flow: #access_token=…&refresh_token=…
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    } else {
      // PKCE flow: ?code=… — exchanged by supabase-js (verifier is in storage).
      await sb.auth.exchangeCodeForSession(href);
    }
    // Accounts created before the DB trigger existed still get a profile row.
    await ensureProfile().catch(() => undefined);
  } catch {
    /* bad / expired / replayed link — leave the user signed out */
  } finally {
    // Scrub tokens from the address bar. Deep-link URLs never reach it.
    if (!fromDeepLink) {
      if (hasHash) window.location.hash = "";
      else window.history.replaceState({}, "", window.location.pathname);
    }
  }
}

/** Subscribe to sign-in / sign-out events. Returns an unsubscribe fn. */
export function onAuthChanged(cb: (user: NeoUser | null) => void): () => void {
  if (!isSupabaseConfigured) {
    cb(null);
    return () => undefined;
  }
  const sb = supabase();
  if (!sb) {
    cb(null);
    return () => undefined;
  }
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    void (async () => {
      if (!session?.user) {
        cb(null);
        return;
      }
      cb(await getCurrentUser());
    })();
  });
  return () => data.subscription.unsubscribe();
}