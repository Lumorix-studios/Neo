/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
/**
 * Billing client for Neo — subscription checkout against the `billing`
 * Supabase Edge Function.
 *
 * Flow:
 *   1. createCheckout()  → server creates a `payment_orders` row (pending)
 *   2. (real providers)  → open `checkoutUrl` / render the provider widget
 *   3. pollOrder()       → watch the order until the payment settles
 *   4. when status=paid  → the server has already promoted the profile to
 *      plan='pro' + byok_enabled=true; the caller just refreshes the account
 *
 * Real payment methods (Stripe, Razorpay, …) plug into the edge function —
 * this file only ever talks to it, so the UI stays provider-agnostic.
 */

import { supabase, isSupabaseConfigured } from "./supabase";

/** Plans the app can sell. `pro` is the BYOK-unlocking default. */
export const PAID_PLANS = ["pro", "team", "enterprise"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

/** Client-side display pricing (server amounts are authoritative). */
export const PLAN_DISPLAY: Record<PaidPlan, { name: string; price: string; cadence: string }> = {
  pro: { name: "Pro", price: "$9", cadence: "per month" },
  team: { name: "Team", price: "$29", cadence: "per month" },
  enterprise: { name: "Enterprise", price: "$99", cadence: "per month" },
};

export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface BillingOrder {
  id: string;
  plan: string;
  status: OrderStatus;
  provider: string | null;
  providerRef: string | null;
  amountCents: number;
  currency: string;
  createdAt: string | null;
}

export interface CheckoutResult {
  orderId: string;
  status: OrderStatus;
  /** True when the server is in PAYMENTS_TEST_MODE (dev auto-completes). */
  testMode: boolean;
  /** Provider checkout URL — null until a real provider is wired in. */
  checkoutUrl: string | null;
}

/** Turn a functions error into a readable message (mirrors byok.ts). */
async function billingErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).clone === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* body already consumed, or not JSON */
    }
  }
  const message = (error as { message?: string } | null)?.message;
  return message && message.trim() ? message : fallback;
}

/** Create a pending checkout order on the server for the given plan. */
export async function createCheckout(plan: PaidPlan): Promise<CheckoutResult> {
  if (!isSupabaseConfigured) throw new Error("Cloud sync is not configured — sign-in is required to upgrade.");
  const sb = supabase();
  if (!sb) throw new Error("Not signed in.");
  const { data, error } = await sb.functions.invoke("billing", {
    body: { action: "checkout", plan },
  });
  if (error) {
    throw new Error(await billingErrorMessage(error, "Could not start the checkout — try again."));
  }
  const res = data as CheckoutResult | null;
  if (!res?.orderId) throw new Error("Checkout did not return an order id — try again.");
  return res;
}

/** Poll a checkout order's current status. */
export async function pollOrder(orderId: string): Promise<BillingOrder> {
  if (!isSupabaseConfigured) throw new Error("Cloud sync is not configured.");
  const sb = supabase();
  if (!sb) throw new Error("Not signed in.");
  // functions.invoke has no query-string option in this supabase-js version —
  // the order id rides in a header (same pattern as byok.ts / x-neo-provider).
  const { data, error } = await sb.functions.invoke("billing", {
    method: "GET",
    headers: { "x-neo-order": orderId },
  });
  if (error) {
    throw new Error(await billingErrorMessage(error, "Could not read the order status."));
  }
  const order = (data as { order?: BillingOrder } | null)?.order;
  if (!order) throw new Error("Order not found.");
  return order;
}
