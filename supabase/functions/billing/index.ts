/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
// ═══════════════════════════════════════════════════════════════════════════
// Neo (AgenticCoder) — `billing` Edge Function
//
// Subscription checkout for the BYOK paywall: free → pro.
//
// Endpoints (all user paths require the caller's JWT — verified with
// sb.auth.getUser()):
//
//   POST { action: "checkout", plan }  → creates a pending payment_orders row
//                                        and returns the payment session for
//                                        the client UI.
//   GET  ?order=<id>                   → returns the order status; when the
//                                        order is `paid`, promotes the buyer's
//                                        profile to plan = 'pro' with
//                                        byok_enabled = true.
//   POST { action: "webhook", ... }    → payment-provider webhook target,
//                                        authorised by the shared secret in
//                                        the `x-neo-billing-secret` header.
//                                        Marks the order paid and promotes
//                                        the buyer. Wire Stripe/Razorpay
//                                        signature verification in here.
//
// Plan promotion ALWAYS runs with the service role, so it passes the
// 0002_harden_profiles entitlement guard (client JWTs can never change
// plan / byok_enabled — that's the point of this function).
//
// Deploy:  supabase functions deploy billing
// Secrets: PAYMENTS_TEST_MODE=true        → checkout auto-completes (dev only)
//          BILLING_WEBHOOK_SECRET=<hex>   → shared secret for webhook calls
//          (real providers add their own secrets, e.g. STRIPE_SECRET_KEY)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-neo-billing-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Plans the client is allowed to check out. BYOK lives on all of them. */
const PAID_PLANS = new Set(["pro", "team", "enterprise"]);

/** Placeholder pricing — replace when real payment methods are wired in. */
const PLAN_PRICES: Record<string, { amountCents: number; currency: string }> = {
  pro: { amountCents: 900, currency: "usd" }, // $9.00 / month
  team: { amountCents: 2900, currency: "usd" }, // $29.00 / month
  enterprise: { amountCents: 9900, currency: "usd" }, // $99.00 / month
};

/** Promote a paid order's buyer: plan = 'pro' (or order.plan) + byok on. */
async function promoteBuyer(
  admin: ReturnType<typeof createClient>,
  order: { user_id: string; plan: string }
): Promise<string | null> {
  const plan = PAID_PLANS.has(order.plan) ? order.plan : "pro";
  const { error } = await admin
    .from("profiles")
    .update({ plan, byok_enabled: true })
    .eq("id", order.user_id);
  return error ? error.message : null;
}

/** Mark an order paid exactly once, then promote its buyer. */
async function settleOrder(
  admin: ReturnType<typeof createClient>,
  orderId: string
): Promise<{ ok: boolean; error?: string }> {
  // Conditional update: only a row still sitting in `pending` can flip to
  // `paid`, so replayed webhooks / double GETs can never double-settle.
  const { data: updated, error } = await admin
    .from("payment_orders")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("user_id, plan")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  // Nothing updated → already settled (or unknown id). Both are fine for
  // idempotency — the buyer was promoted on the first settle.

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ── Webhook path (service-style; shared secret instead of user JWT) ────
    // TODO: when real payment providers are added, verify THEIR signature
    // (e.g. stripe.webhooks.constructEvent) instead of the shared secret.
    if (req.headers.get("x-neo-billing-secret")) {
      const secret = Deno.env.get("BILLING_WEBHOOK_SECRET")?.trim() ?? "";
      if (!secret || req.headers.get("x-neo-billing-secret") !== secret) {
        return json({ error: "Invalid webhook secret." }, 401);
      }
      const body = (await req.json()) as {
        orderId?: string;
        status?: string;
        providerRef?: string;
      };
      const orderId = (body.orderId ?? "").trim();
      if (!orderId) return json({ error: "Missing orderId." }, 400);

      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      if (body.status === "paid") {
        if (body.providerRef) {
          await admin
            .from("payment_orders")
            .update({ provider_ref: body.providerRef })
            .eq("id", orderId);
        }
        const settled = await settleOrder(admin, orderId);
        if (!settled.ok) return json({ error: settled.error }, 500);
        return json({ ok: true, status: "paid" });
      }

      if (body.status === "failed" || body.status === "cancelled") {
        const { error } = await admin
          .from("payment_orders")
          .update({ status: body.status, updated_at: new Date().toISOString() })
          .eq("id", orderId)
          .eq("status", "pending");
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, status: body.status });
      }

      return json({ error: "Unsupported webhook status." }, 400);
    }

  if (!updated) return { ok: true };
  const promoteError = await promoteBuyer(admin, {
    user_id: updated.user_id,

    // ── User paths (JWT required) ───────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing authorization." }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: authData, error: authErr } = await sb.auth.getUser();
    if (authErr || !authData.user) return json({ error: "Unauthorized." }, 401);
    const userId = authData.user.id;

    // Service-role client: writes payment status + flips profile entitlements
    // (the 0002 guard only lets service-role writes through).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // GET ?order=<id> — poll checkout status. Promotes the buyer on the first
    // poll that sees the order paid (normally the webhook settled it; this is
    // the belt-and-braces path so the client never waits forever).
    if (req.method === "GET") {
      const orderId = (new URL(req.url).searchParams.get("order") ?? "").trim();
      if (!orderId) return json({ error: "Missing order id." }, 400);
      const { data: order, error } = await admin
        .from("payment_orders")
        .select("id, user_id, plan, status, provider, provider_ref, amount_cents, currency, created_at")
        .eq("id", orderId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return json({ error: "Order lookup failed." }, 500);
      if (!order) return json({ error: "Order not found." }, 404);

      if (order.status === "paid") {
        const { data: profile } = await admin
          .from("profiles")
          .select("plan, byok_enabled")
          .eq("id", userId)
          .maybeSingle();
        if (!profile || profile.plan === "free" || !profile.byok_enabled) {
          const promoteError = await promoteBuyer(admin, {

    if (req.method === "POST") {
      const body = (await req.json()) as { action?: string; plan?: string };

      // ── checkout: create a pending order for the requested plan ──────────
      if (body.action === "checkout") {
        const plan = (body.plan ?? "pro").trim().toLowerCase();
        if (!PAID_PLANS.has(plan)) return json({ error: "Unknown plan." }, 400);
        const price = PLAN_PRICES[plan];

        const { data: order, error } = await admin
          .from("payment_orders")
          .insert({
            user_id: userId,
            plan,
            amount_cents: price.amountCents,
            currency: price.currency,
            metadata: {
              source: "app-checkout",
              testMode: Deno.env.get("PAYMENTS_TEST_MODE") === "true",
            },
          })
          .select("id, status, amount_cents, currency")
          .single();
        if (error || !order) {
          return json({ error: error?.message ?? "Could not create order." }, 500);
        }

        // Real payment providers plug in here: create a Stripe Checkout
        // Session / Razorpay Order with `order.id` as the reference and
        // return its URL as `checkoutUrl`. The client opens that URL (or
        // renders the provider widget) and polls GET ?order= afterwards.
        //
        // Until a provider is configured, PAYMENTS_TEST_MODE=true lets the
        // flow complete instantly so the upgrade path can be exercised end
        // to end. Without it, the order simply stays pending.
        if (Deno.env.get("PAYMENTS_TEST_MODE") === "true") {
          const settled = await settleOrder(admin, order.id);
          if (!settled.ok) return json({ error: settled.error }, 500);
          return json({
            orderId: order.id,
            status: "paid",
            testMode: true,
            checkoutUrl: null,
          });
        }

        return json({
          orderId: order.id,
          status: order.status,
          testMode: false,
          checkoutUrl: null, // ← replace with the provider's checkout URL
        });
      }

      // Clients may not settle their own orders — that's the webhook's job.
      return json({ error: "Unsupported action." }, 400);
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

            user_id: order.user_id,
            plan: order.plan ?? "pro",
          });
          if (promoteError) return json({ error: promoteError }, 500);
        }
      }
      return json({ order });
    }

    plan: updated.plan ?? "pro",
  });
  return promoteError ? { ok: false, error: promoteError } : { ok: true };
}

