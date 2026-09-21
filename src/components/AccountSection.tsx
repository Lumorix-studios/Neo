/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */


import { useEffect, useState } from "react";
import { useRef} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithOAuth,
  resetPassword,
  signOut,
  updateProfile,
  refreshEnabledProviders,
  providerDisabledMessage,
  type EnabledProviders,
  type NeoUser,
  type Profile,
} from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import { deleteAllCloudData } from "../lib/cloudSync";
import { IoLogoGithub, IoLogoGoogle, IoMailOutline } from "react-icons/io5";
import { IoInformationCircleOutline } from "react-icons/io5";
interface AccountSectionProps {
  account: NeoUser | null;
  profile: Profile | null;
  authLoading?: boolean;
  /** Ask the app to re-read the account/profile after profile edits. */
  onAccountRefresh: () => void;
}

type Mode = "sign-in" | "sign-up";

function formatPlan(plan: string | null | undefined): string {
  const clean = (plan ?? "free").trim();
  if (!clean) return "Free";
  if (clean.toLowerCase() === "unavailable") return "Unavailable";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export default function AccountSection({
  account,
  profile,
  authLoading = false,
  onAccountRefresh,
}: AccountSectionProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Draft display name. Kept together with the profile name it was derived from
   * so a changed/loaded profile resets the draft during render instead of via a
   * cascading setState-in-effect.
   */
  // --- "About builds" popover (sidebar footer) ---
   
  const profileName = profile?.name ?? "";
  const [draft, setDraft] = useState({ name: profileName, from: profileName });
  if (draft.from !== profileName) setDraft({ name: profileName, from: profileName });
  const displayName = draft.name;
  const setDisplayName = (name: string) => setDraft({ name, from: profileName });

  if (!isSupabaseConfigured) {
    return (
      <div className="p-1">
        <SectionTitle>Account</SectionTitle>
        <p className="text-[11.5px] leading-5 text-[var(--text-muted)]">
          Cloud sync is not configured. Create a Supabase project, add
          <code className="mx-1 rounded bg-(--fill-2) px-1 py-px text-[10.5px]">VITE_SUPABASE_URL</code>
          and
          <code className="mx-1 rounded bg-(--fill-2) px-1 py-px text-[10.5px]">VITE_SUPABASE_ANON_KEY</code>
          to your <code className="rounded bg-(--fill-2) px-1 py-px text-[10.5px]">.env</code>, then restart the app.
          See <code className="rounded bg-(--fill-2) px-1 py-px text-[10.5px]">SUPABASE_SETUP.md</code>.
        </p>
      </div>
    );
  }

  if (account) {
    const initial = (account.name || account.email || "A").charAt(0).toUpperCase();
    const planLabel = formatPlan(profile?.plan);
    const byokCopy = profile
      ? profile.byokEnabled
        ? `available on your ${planLabel} plan`
        : `not included in your ${planLabel} plan`
      : "checking your current plan";
    return (
      <div className="p-1">
        <SectionTitle>Account</SectionTitle>
        <div className="flex items-center gap-3 pb-3">
          {account.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-full border border-(--border-strong) object-cover"
            />
          ) : (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[16px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{account.name}</p>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {account.email || account.provider}
              {profile ? ` · ${planLabel} plan` : " · checking plan"}
            </p>
            {profile?.dbError && (
              <p className="pt-1 text-[11px] leading-4 text-red-400/90">
                Could not load your plan from the database: {profile.dbError}. Run
                <code className="mx-1 rounded bg-(--fill-2) px-1 py-px text-[10.5px]">
                  supabase/migrations/0003_restore_table_grants.sql
                </code>
                in the Supabase SQL editor, then sign out and back in.
              </p>
            )}
          </div>
        </div>

        <Row title="Display name" description="Shown with your account across devices.">
          <div className="flex shrink-0 gap-1.5">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              spellCheck={false}
              className="w-44 rounded-md border border-(--border) bg-(--fill-1) px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none transition focus:border-(--border-strong)"
            />
            <button
              type="button"
              disabled={busy || displayName === (profile?.name ?? "")}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await updateProfile({ displayName });
                  onAccountRefresh();
                  setNotice("Profile saved.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              className="shrink-0 rounded-md border border-(--border-strong) px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </Row>

        <p className="pb-3 pt-1 text-[11px] leading-5 text-[var(--text-muted)]">
          Your chats and AI settings sync to your account. API keys (BYOK) are stored
          encrypted in your account and are {byokCopy}.
        </p>

        {error && <p className="pb-2 text-[11px] text-red-400/90">{error}</p>}
        {notice && !error && <p className="pb-2 text-[11px] text-emerald-400/90">{notice}</p>}
                
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border border-(--border-strong) px-3 py-1.5 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
        >
          Sign out
        </button>
             
        <div className="mt-4 border-t border-(--border) pt-3">
          <SectionTitle>Danger zone</SectionTitle>
          <Row
            title="Delete synced data"
            description="Erases every chat, AI setting and encrypted API key stored in your account. This device's copies stay put."
          >
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Delete all data synced to your account? This cannot be undone."
                  )
                ) {
                  return;
                }
                setBusy(true);
                setError(null);
                setNotice(null);
                try {
                  await deleteAllCloudData();
                  setNotice("Synced data deleted from your account.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              className="shrink-0 rounded-md border border-red-500/30 px-2.5 py-1 text-[11px] text-red-400/90 transition hover:bg-red-500/10 disabled:opacity-40"
            >
              Delete
            </button>
          </Row>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="p-1">
        <SectionTitle>Account</SectionTitle>
        <p className="text-[11.5px] leading-5 text-[var(--text-muted)]">
          Checking your saved session and plan...
        </p>
      </div>
    );
  }

  return (
    <SignInUp
      mode={mode}
      setMode={setMode}
      busy={busy}
      setBusy={setBusy}
      error={error}
      notice={notice}
      setError={setError}
      setNotice={setNotice}
    />
  );
}

/* ── Signed-out form ───────────────────────────────────────────────────────── */
function SignInUp(props: {
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
  error: string | null;
  notice: string | null;
  setError: (e: string | null) => void;
  setNotice: (n: string | null) => void;
}) {
  const { mode, setMode, busy, setBusy, error, notice, setError, setNotice } = props;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /**
   * Which providers the Supabase project has switched on. `null` = still
   * probing (or the probe failed) — buttons then behave normally.
   */
  const [providers, setProviders] = useState<EnabledProviders | null>(null);

  useEffect(() => {
    let alive = true;
    void refreshEnabledProviders().then((p) => {
      if (alive && p) setProviders(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runAuth = async (fn: () => Promise<unknown>, done?: (r: unknown) => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      done?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
   const [buildsInfoOpen, setBuildsInfoOpen] = useState(false);
    const buildsInfoRef = useRef<HTMLDivElement>(null);
  
    // Close the popover on outside click or Escape.
    useEffect(() => {
      if (!buildsInfoOpen) return;
      const onPointerDown = (e: PointerEvent) => {
        if (!buildsInfoRef.current?.contains(e.target as Node)) setBuildsInfoOpen(false);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setBuildsInfoOpen(false);
      };
      window.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("keydown", onKeyDown);
      };
    }, [buildsInfoOpen]);
  

  return (
    <div className="p-1">
      <SectionTitle>Account</SectionTitle>
      <p className="pb-3 text-[11.5px] leading-5 text-[var(--text-muted)]">
        Signup/login
      </p>

      {providers?.email === false && (
        <p className="mb-3 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-[10.5px] leading-4 text-amber-400/90">
          Email sign-in is switched off for this Supabase project. Turn it on under
          Dashboard → Authentication → Sign In / Providers.
        </p>
      )}

      <div className="flex flex-col gap-2 pb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          spellCheck={false}
          autoComplete="email"
          className="w-full rounded-md border border-(--border) bg-(--fill-1) px-2.5 py-2 text-[12.5px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-(--border-strong)"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 6 characters)"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          className="w-full rounded-md border border-(--border) bg-(--fill-1) px-2.5 py-2 text-[12.5px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-(--border-strong)"
        />
         <div className="mt-auto px-2 py-1 text-[10px] text-[var(--text-faint)]">
                          <div ref={buildsInfoRef} className="relative sm:text-right">
                            <button
                              type="button"
                              aria-label="About Neo builds"
                              aria-expanded={buildsInfoOpen}
                              className="inline-flex items-center text-[var(--text-faint)] transition hover:text-[var(--text-secondary)]"
                              onClick={() => setBuildsInfoOpen((v) => !v)}
                            >
                             <p className="text-sm font-medium m-4">Important information</p>
                              
                              <IoInformationCircleOutline className="h-4 w-4" />
                            </button>
              
                            {buildsInfoOpen && (
                              <div className="absolute bottom-0 right-10px z-50 ml-2 w-72 rounded-lg border border-(--border-strong) bg-[var(--bg-elevated)] p-4 text-left shadow-[0_10px_32px_rgba(0,0,0,0.5)]">
              
                                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                                 Google and Github OAuth features are currently down for maintenance. Please login using the email and password method or create an account. For any enquiries contact the maintainers. The official GitHub repository is {" "}
                                  <a
                                    href="https://github.com/Lumorix-studios/Neo"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--text-primary)] hover:underline"
                                  >
                                    here
                                  </a>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
        <button
          type="button"
          disabled={busy || !email.trim() || password.length < 6}
          onClick={() =>
            void runAuth(
              () =>
                mode === "sign-in"
                  ? signInWithEmail(email.trim(), password)
                  : signUpWithEmail(email.trim(), password),
              (r) => {
                const res = r as { needsEmailConfirmation?: boolean } | undefined;
                if (res?.needsEmailConfirmation) {
                  setNotice("Check your inbox — confirm your email to finish signing up.");
                }
              }
            )
          }
          className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition disabled:opacity-50 bg-white text-black hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
          //style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          <IoMailOutline size={14} />
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
        <div className="flex items-center justify-between text-[11px]">
          <button
            type="button"
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            className="text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
          >
            {mode === "sign-in" ? "No account yet? Create one" : "Already have an account? Sign in"}
          </button>
          {mode === "sign-in" && (
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() =>
                void runAuth(() => resetPassword(email.trim()), () => setNotice("Password-reset email sent."))
              }
              className="text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
      <OAuthButtons
        busy={busy}
        runAuth={runAuth}
        providers={providers}
        onRecheck={() => {
          void refreshEnabledProviders().then((p) => {
            if (p) setProviders(p);
          });
        }}
      />
      {error && <p className="pt-2 text-[11px] leading-4 text-red-400/90">{error}</p>}
      {notice && !error && <p className="pt-2 text-[11px] leading-4 text-emerald-400/90">{notice}</p>}
    </div>
  );
}
/* ── OAuth buttons (GitHub / Google) ───────────────────────────────────────── */
function OAuthButtons({
  busy,
  runAuth,
  providers,
  onRecheck,
}: {
  busy: boolean;
  runAuth: (fn: () => Promise<unknown>, done?: (r: unknown) => void) => Promise<void>;
  providers: EnabledProviders | null;
  onRecheck: () => void;
}) {
  const githubOff = providers?.github === false;
  const googleOff = providers?.google === false;
  return (
    <>
      <div className="flex items-center gap-2 pb-3">
        <span className="h-px flex-1 bg-(--border)" />
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">or continue with</span>
        <span className="h-px flex-1 bg-(--border)" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || githubOff}
          title={githubOff ? providerDisabledMessage("github") : "Continue with GitHub"}
          onClick={() =>
            void runAuth(async () => {
              const url = await signInWithOAuth("github");
              await openUrl(url);
            })
          }
          className="flex items-center justify-center gap-2 rounded-md border border-(--border-strong) px-3 py-2 text-[12px] text-[var(--text-primary)] transition hover:bg-(--fill-2) disabled:opacity-50"
        >
          <IoLogoGithub size={15} />
          GitHub
        </button>
        <button
          type="button"
          disabled={busy || googleOff}
          title={googleOff ? providerDisabledMessage("google") : "Continue with Google"}
          onClick={() =>
            void runAuth(async () => {
              const url = await signInWithOAuth("google");
              await openUrl(url);
            })
          }
          className="flex items-center justify-center gap-2 rounded-md border border-(--border-strong) px-3 py-2 text-[12px] text-[var(--text-primary)] transition hover:bg-(--fill-2) disabled:opacity-50"
        >
          <IoLogoGoogle size={14} />
          Google
        </button>
      </div>
      {(githubOff || googleOff) && (
        <p className="pt-2 text-[10.5px] leading-4 text-amber-400/90">
          {[
            githubOff ? "GitHub" : null,
            googleOff ? "Google" : null,
          ].filter(Boolean).join(" and ")} sign-in is switched off in Supabase.{" "}
          <button
            type="button"
            onClick={onRecheck}
            className="underline underline-offset-2 hover:text-amber-300"
          >
            Recheck
          </button>
        </p>
      )}
    </>
  );
}

/* ── Small shared bits ─────────────────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{title}</p>
        {description && <p className="text-[10.5px] leading-4 text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}
