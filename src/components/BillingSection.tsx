/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */


import { memo, useCallback, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  PLAN_DISPLAY,
  PAID_PLANS,
  upgradeUrl,
  type PaidPlan,
} from "../lib/billing";
import type { NeoUser, Profile } from "../lib/auth";

interface BillingSectionProps {
  account: NeoUser | null;
  profile: Profile | null;
  /** Re-read account/profile (e.g. after returning from the checkout page). */
  onAccountRefresh: () => void;
  /** Jump to the Account tab (e.g. "sign in to upgrade"). */
  onGoToAccount: () => void;
}

function planTitle(plan: string | null | undefined): string {
  const clean = (plan ?? "free").trim().toLowerCase();
  if (!clean || clean === "free") return "Free";
  if (clean in PLAN_DISPLAY) return PLAN_DISPLAY[clean as PaidPlan].name;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/* One short line per plan — the long feature checklists were noise. */
const PLAN_BLURB: Record<string, string> = {
  free: "Local chats, local models (Ollama) and cloud sync of chats and settings.",
  pro: "Everything in Free plus BYOK — encrypted provider keys and every cloud provider.",
  team: "Everything in Pro plus shared team workspaces and centralised billing.",
  enterprise: "Everything in Team plus SSO, audit logs and dedicated support.",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] text-[var(--text-muted)]">{children}</p>;
}

const BillingSection = memo(function BillingSection({
  account,
  profile,
  onAccountRefresh,
  onGoToAccount,
}: BillingSectionProps) {
  const plan = (profile?.plan ?? "free").trim().toLowerCase();
  const isPro = ["pro", "team", "enterprise", "admin", "paid"].includes(plan);
  const currentTitle = planTitle(profile?.plan);

  /** Open the website checkout for a plan in the system browser. */
  const openUpgrade = useCallback((target: PaidPlan) => {
    const url = upgradeUrl(target);
    openUrl(url).catch(() => {
      window.open(url, "_blank");
    });
  }, []);

  // Checkout lives on the website: once the buyer comes back from paying, this
  // window regains focus, so re-read the account and show the new plan at once
  // (both share the same Supabase project).
  useEffect(() => {
    if (!account) return;
    const refresh = () => {
      if (document.visibilityState === "visible") onAccountRefresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [account, onAccountRefresh]);

  /* ── Signed out ────────────────────────────────────────────────────────── */
  if (!account) {
    return (
      <div className="space-y-6">
        <section>
          <SectionTitle>Locked</SectionTitle>
          <div className="divide-y divide-(--border) rounded-md border border-(--border) bg-(--fill-1)">
            <Row
              title="Billing"
              description="Plans, receipts and the provider-key entitlement live in your Neo account, so there is nothing to show until you sign in."
            />
            <Row title="Sign in required" description="Sign in or create an account to pick a plan.">
              <button
                type="button"
                onClick={onGoToAccount}
                className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              >
                Go to Account
              </button>
            </Row>
          </div>
        </section>
      </div>
    );
  }

  /* ── Signed in ─────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      <section>
        <SectionTitle>Current plan</SectionTitle>
        <div className="divide-y divide-(--border) rounded-md border border-(--border) bg-(--fill-1)">
          <Row
            title={currentTitle}
            description={isPro ? "Monthly · cancel anytime." : "No payment method on file."}
          >
            <span className="text-[11.5px] text-[var(--text-secondary)]">
              {isPro ? "BYOK included" : "BYOK not included"}
            </span>
          </Row>
        </div>
      </section>

      <section>
        <SectionTitle>Choose a plan</SectionTitle>
        <PlanList currentPlan={plan} onGet={openUpgrade} />
      </section>

      <section className="space-y-1">
        <p className="text-[11px] leading-4 text-[var(--text-faint)]">
          Plans are purchased on the Neo website — the buttons above open it in your browser. Your
          account is shared, so a paid plan is already active here as soon as you sign back in. API
          keys are encrypted with AES-256-GCM before they are stored in your account.
        </p>
      </section>
    </div>
  );
});

/* ── Rows + plan list ──────────────────────────────────────────────────────── */

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-[12.5px] text-[var(--text-primary)]">{title}</p>
        {description && (
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </div>
  );
}

interface PlanRowData {
  id: PaidPlan | "free";
  name: string;
  price: string;
  cadence: string;
}

function PlanList({
  currentPlan,
  onGet,
}: {
  currentPlan: string;
  /** Opens the website checkout for the clicked plan. */
  onGet: (plan: PaidPlan) => void;
}) {
  const rows: PlanRowData[] = [
    { id: "free", name: "Free", price: "$0", cadence: "forever" },
    ...PAID_PLANS.map((p) => ({
      id: p,
      name: PLAN_DISPLAY[p].name,
      price: PLAN_DISPLAY[p].price,
      cadence: PLAN_DISPLAY[p].cadence,
    })),
  ];

  return (
    <div className="divide-y divide-(--border) rounded-md border border-(--border) bg-(--fill-1)">
      {rows.map((row) => {
        const isCurrent = currentPlan === row.id;
        const isFree = row.id === "free";
        return (
          <div
            key={row.id}
            className="flex flex-wrap items-center gap-3 px-3.5 py-3 sm:flex-nowrap sm:gap-6"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] text-[var(--text-primary)]">
                  {row.name}
                  {isCurrent && (
                    <span className="ml-2 text-[11px] text-[var(--text-muted)]">Current</span>
                  )}
                </span>
                <span className="shrink-0 text-[11.5px] text-[var(--text-secondary)]">
                  {row.price} <span className="text-[var(--text-muted)]">{row.cadence}</span>
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">
                {PLAN_BLURB[row.id] ?? ""}
              </p>
            </div>
            {isCurrent ? (
              <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                {isFree ? "Your plan" : "Active"}
              </span>
            ) : isFree ? (
              <span className="shrink-0 text-[11px] text-[var(--text-faint)]">Included</span>
            ) : (
              <button
                type="button"
                onClick={() => onGet(row.id as PaidPlan)}
                title={"Open checkout for " + row.name}
                className="h-7 shrink-0 rounded-md px-2.5 text-[11px] font-medium text-[var(--on-accent)] transition hover:brightness-110"
                style={{ background: "var(--accent)" }}
              >
                Get {row.name}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default BillingSection;
