/**
 * AccountSection — the "Account" tab of the Settings panel.
 *
 * Signed out: email/password sign-in + sign-up, plus GitHub/Google OAuth
 * (VS Code style: the system browser opens; the deep link returns the user).
 * Signed in: avatar, display-name editing, BYOK plan state, sign out.
 */

import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithOAuth,
  resetPassword,
  signOut,
  updateProfile,
  type NeoUser,
  type Profile,
} from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import { deleteAllCloudData } from "../lib/cloudSync";
import { IoLogoGithub, IoLogoGoogle, IoMailOutline } from "react-icons/io5";

interface AccountSectionProps {
  account: NeoUser | null;
  profile: Profile | null;
  /** Ask the app to re-read the account/profile after profile edits. */
  onAccountRefresh: () => void;
}

type Mode = "sign-in" | "sign-up";

export default function AccountSection({ account, profile, onAccountRefresh }: AccountSectionProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Draft display name. Kept together with the profile name it was derived from
   * so a changed/loaded profile resets the draft during render instead of via a
   * cascading setState-in-effect.
   */
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
              {profile ? ` · ${profile.plan === "free" ? "Free" : profile.plan} plan` : ""}
            </p>
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
          encrypted in your account and are {profile?.byokEnabled === false ? "not included in your current plan" : "available"}.
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

  return (
    <div className="p-1">
      <SectionTitle>Account</SectionTitle>
      <p className="pb-3 text-[11.5px] leading-5 text-[var(--text-muted)]">
        Sign in to sync your chats, settings and API keys across devices.
      </p>

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
          className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
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
      <OAuthButtons busy={busy} runAuth={runAuth} />
      {error && <p className="pt-2 text-[11px] leading-4 text-red-400/90">{error}</p>}
      {notice && !error && <p className="pt-2 text-[11px] leading-4 text-emerald-400/90">{notice}</p>}
    </div>
  );
}
/* ── OAuth buttons (GitHub / Google) ───────────────────────────────────────── */
function OAuthButtons({
  busy,
  runAuth,
}: {
  busy: boolean;
  runAuth: (fn: () => Promise<unknown>, done?: (r: unknown) => void) => Promise<void>;
}) {
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
          disabled={busy}
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
          disabled={busy}
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
