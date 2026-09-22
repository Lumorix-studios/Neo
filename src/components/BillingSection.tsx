/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
/**
 * Billing — the subscription tab (free -> pro checkout).
 *
 * Renders plan cards, runs the checkout against the `billing` edge function
 * (src/lib/billing.ts), polls the order and refreshes the account when the
 * payment lands. The "Payment method" box is a deliberate placeholder: real
 * providers (Stripe / Razorpay / ...) are wired into the edge function and the
 * `checkoutUrl` it returns — this UI needs no changes for that.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { IoCardOutline, IoCheckmarkCircle, IoFlashOutline, IoLockClosedOutline, IoTimeOutline } from "react-icons/io5";
import {
  createCheckout,
  pollOrder,
  PLAN_DISPLAY,
  PAID_PLANS,
  type BillingOrder,
  type PaidPlan,
} from "../lib/billing";
import type { NeoUser, Profile } from "../lib/auth";

interface BillingSectionProps {
  account: NeoUser | null;
  profile: Profile | null;
  /** Re-read account/profile after a successful upgrade. */
  onAccountRefresh: () => void;
  /** Jump to the Account tab (e.g. "sign in to upgrade"). */
  onGoToAccount: () => void;
}

type CheckoutState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "processing"; orderId: string; testMode: boolean }
  | { phase: "done" }
  | { phase: "error"; message: string };

const CHECKOUT_INTERVAL_MS = 2000;
const CHECKOUT_MAX_ATTEMPTS = 30; // ~60 s of polling before giving up

function formatAmount(cents: number, currency: string): string {
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toUpperCase() + " ";
  return symbol + (cents / 100).toFixed(2);
}

const BillingSection = memo(function BillingSection({
  account,
  profile,
  onAccountRefresh,
  onGoToAccount,
}: BillingSectionProps) {
  const [checkout, setCheckout] = useState<CheckoutState>({ phase: "idle" });
  const [order, setOrder] = useState<BillingOrder | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    []
  );

  const plan = (profile?.plan ?? "free").trim().toLowerCase();
  const isPro = plan === "pro" || plan === "team" || plan === "enterprise" || plan === "admin" || plan === "paid";
  const purchasedPlan: PaidPlan = "pro";

  /** Poll the created order until it settles or the attempts run out. The
   *  recursion lives in a nested `tick` (rather than the callback calling
   *  itself) so the value is declared before it is read. */
  const poll = useCallback(
    (orderId: string, attemptsLeft: number) => {
      const tick = async (remaining: number) => {
        try {
          const next = await pollOrder(orderId);
          setOrder(next);
          if (next.status === "paid") {
            setCheckout({ phase: "done" });
            onAccountRefresh();
            return;
          }
          if (next.status === "failed" || next.status === "cancelled") {
            setCheckout({ phase: "error", message: "Payment " + next.status + ". No charge was kept." });
            return;
          }
          if (remaining <= 1) {
            setCheckout({
              phase: "error",
              message: "Still waiting for the payment to confirm — reopen Billing to poll again.",
            });
            return;
          }
          pollTimer.current = setTimeout(() => void tick(remaining - 1), CHECKOUT_INTERVAL_MS);
        } catch (e) {
          setCheckout({ phase: "error", message: e instanceof Error ? e.message : String(e) });
        }
      };
      pollTimer.current = setTimeout(() => void tick(attemptsLeft), CHECKOUT_INTERVAL_MS);
    },
    [onAccountRefresh]
  );

  const startCheckout = useCallback(
    async (target: PaidPlan) => {
      if (!account) return;
      setCheckout({ phase: "creating" });
      setOrder(null);
      try {
        const res = await createCheckout(target);
        if (res.status === "paid") {
          // Test mode: the server auto-settled the order.
          setCheckout({ phase: "done" });
          onAccountRefresh();
          return;
        }
        if (res.checkoutUrl) {
          // A real provider is wired in — open its checkout, then poll.
          window.open(res.checkoutUrl, "_blank");
        }
        setCheckout({ phase: "processing", orderId: res.orderId, testMode: res.testMode });
        poll(res.orderId, CHECKOUT_MAX_ATTEMPTS);
      } catch (e) {
        setCheckout({ phase: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [account, onAccountRefresh, poll]
  );

  if (!account) {
    return (
      <div>
        <SectionTitle>Billing</SectionTitle>
        <div className="rounded-md border border-(--border-strong) bg-(--fill-1) p-4 text-center">
          <IoLockClosedOutline className="mx-auto mb-2 h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-[12.5px] text-[var(--text-primary)]">Sign in to manage your subscription</p>
          <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
            Subscriptions are tied to your Neo account — plans, invoices and the BYOK
            entitlement follow you across devices.
          </p>
          <button
            type="button"
            onClick={onGoToAccount}
            className="mt-3 rounded-md border border-(--border-strong) px-3 py-1.5 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)]"
          >
            Go to Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>Billing</SectionTitle>
      <p className="pb-3 text-[11.5px] leading-5 text-[var(--text-muted)]">
        You're on the <span className="font-medium text-[var(--text-primary)]">{plan}</span> plan.
        {!isPro && " Upgrade to unlock BYOK — bring your own provider API keys, encrypted in your account."}
      </p>

      {checkout.phase === "done" && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2.5">
          <IoCheckmarkCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-[11.5px] leading-4 text-emerald-300/95">
            Payment received — your account is now <strong>Pro</strong>. BYOK is unlocked;
            store provider API keys from the AI settings tab.
          </p>
        </div>
      )}

      {checkout.phase === "error" && (
        <p className="mb-3 rounded-md border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-[11px] leading-4 text-red-400/90">
          {checkout.message}
        </p>
      )}

      {checkout.phase === "processing" && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5">
          <IoTimeOutline className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[11.5px] leading-4 text-amber-300/95">
            Waiting for payment confirmation{order ? " (order " + order.id.slice(0, 8) + "\u2026)" : ""}.
            {checkout.testMode && " Test mode is on — no real charge is made."}
          </p>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-2 pb-3">
        <PlanCard
          name="Free"
          price="$0"
          cadence="forever"
          current={!isPro}
          features={["Unlimited local chats", "Local models (Ollama)", "Cloud sync of chats & settings"]}
          cta={null}
        />
        <PlanCard
          name={PLAN_DISPLAY[purchasedPlan].name}
          price={PLAN_DISPLAY[purchasedPlan].price}
          cadence={PLAN_DISPLAY[purchasedPlan].cadence}
          current={isPro}
          highlight
          features={[
            "Everything in Free",
            "BYOK — encrypted provider API keys in your account",
            "All providers: OpenAI, Anthropic, Google, Groq, OpenRouter…",
            "Priority support",
          ]}
          cta={
            isPro ? (
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-emerald-400">
                <IoCheckmarkCircle className="h-4 w-4" /> Current plan
              </span>
            ) : (
              <button
                type="button"
                disabled={checkout.phase === "creating" || checkout.phase === "processing"}
                onClick={() => void startCheckout(purchasedPlan)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium transition disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              >
                <IoFlashOutline className="h-4 w-4" />
                {checkout.phase === "creating" ? "Starting checkout…" : "Upgrade to " + PLAN_DISPLAY[purchasedPlan].name}
              </button>
            )
          }
        />
        {PAID_PLANS.filter((p) => p !== "pro").map((p) => (
          <PlanCard
            key={p}
            name={PLAN_DISPLAY[p].name}
            price={PLAN_DISPLAY[p].price}
            cadence={PLAN_DISPLAY[p].cadence}
            compact
            features={[]}
            cta={
              <button
                type="button"
                disabled={checkout.phase === "creating" || checkout.phase === "processing"}
                onClick={() => void startCheckout(p)}
                className="w-full rounded-md border border-(--border-strong) px-3 py-1.5 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-(--fill-2) hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                Choose {PLAN_DISPLAY[p].name}
              </button>
            }
          />
        ))}
      </div>

      {/* Payment-method placeholder — real providers render here later. */}
      {!isPro && checkout.phase !== "done" && (
        <div className="mb-3 rounded-md border border-(--border) bg-(--fill-1) p-3">
          <div className="flex items-center gap-2 pb-2">
            <IoCardOutline className="h-4 w-4 text-[var(--text-muted)]" />
            <p className="text-[11.5px] font-medium text-[var(--text-primary)]">Payment method</p>
          </div>
          <div className="grid grid-cols-2 gap-2 pb-2 opacity-50">
            <input
              type="text"
              disabled
              placeholder="Card number"
              className="col-span-2 rounded-md border border-(--border) bg-(--fill-2) px-2.5 py-1.5 text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
            />
            <input
              type="text"
              disabled
              placeholder="MM / YY"
              className="rounded-md border border-(--border) bg-(--fill-2) px-2.5 py-1.5 text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
            />
            <input
              type="text"
              disabled
              placeholder="CVC"
              className="rounded-md border border-(--border) bg-(--fill-2) px-2.5 py-1.5 text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
            />
          </div>
          <p className="text-[10.5px] leading-4 text-[var(--text-muted)]">
            Card payments land here soon — the checkout pipeline is live end to end. Pressing
            Upgrade records the order today; connect a provider in
            <code className="mx-1 rounded bg-(--fill-2) px-1 py-px text-[10px]">supabase/functions/billing</code>
            to take real money.
          </p>
        </div>
      )}

      {order && checkout.phase !== "idle" && (
        <p className="text-[10.5px] text-[var(--text-faint)]">
          Latest order: {order.id} · {formatAmount(order.amountCents, order.currency)} · {order.status}
        </p>
      )}
    </div>
  );
});

/* ── Plan card ─────────────────────────────────────────────────────────────── */
function PlanCard({
  name,
  price,
  cadence,
  features,
  current,
  highlight = false,
  compact = false,
  cta,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  current?: boolean;
  highlight?: boolean;
  compact?: boolean;
  cta: React.ReactNode;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " +
        (highlight ? "border-[var(--accent)]/50 bg-(--fill-1)" : "border-(--border) bg-(--fill-1)")
      }
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">
          {name}
          {current && (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-px text-[9.5px] font-medium text-emerald-400">
              current
            </span>
          )}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          <span className="text-[15px] font-semibold text-[var(--text-primary)]">{price}</span> {cadence}
        </p>
      </div>
      {!compact && (
        <ul className="pb-3 pt-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-1.5 py-0.5 text-[11.5px] leading-4 text-[var(--text-secondary)]">
              <IoCheckmarkCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
              {f}
            </li>
          ))}
        </ul>
      )}
      {cta && <div className={compact ? "pt-1" : ""}>{cta}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export default BillingSection;
