/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
 */
// ═══════════════════════════════════════════════════════════════════════════
// Neo (AgenticCoder) — `billing` Edge Function
//
// Subscription checkout for the BYOK paywall: free -> pro.
//
// The desktop app does NOT call this function: Settings -> Billing links out to
// the website that handles checkout (UPGRADE_URL in src/lib/billing.ts), and
// both share this Supabase project. This function is the server-side half the
// WEBSITE can call — it creates the Stripe session, verifies the webhook and
// promotes the buyer's entitlement. If the website implements its own checkout
// + webhook, this folder can be deleted along with [functions.billing] in
// supabase/config.toml.
//
// Endpoints (all user paths require the caller's JWT — verified with
// sb.auth.getUser()):
//
//   POST { action: "checkout", plan }  -> creates a pending payment_orders row
//                                         and returns a Stripe Checkout URL.
//   GET  (x-neo-order: <id>)           -> returns the order status; when the
//                                         order is `paid`, promotes the buyer
//                                         to their plan with byok_enabled.
//   POST (Stripe-Signature)             -> Stripe webhook target. The signature
//                                         is verified against the raw body,
//                                         then checkout completion, expiry and
//                                         subscription lifecycle events settle
//                                         the order and grant / revoke BYOK.
//
// Plan promotion ALWAYS runs with the service role, so it passes the
// 0002_harden_profiles entitlement guard (client JWTs can never change
// plan / byok_enabled — that's the point of this function).
//
// Deploy:  supabase functions deploy billing
//
// Secrets (supabase secrets set --env-file billing.env):
//   STRIPE_SECRET_KEY=sk_live_...           required to charge cards
//   STRIPE_WEBHOOK_SECRET=whsec_...         required to accept Stripe events
//   STRIPE_PRICE_PRO=price_...              Stripe Price id per plan
//   STRIPE_PRICE_TEAM=price_...
//   STRIPE_PRICE_ENTERPRISE=price_...
//   BILLING_SUCCESS_URL=https://...         where Stripe returns the buyer
//   BILLING_CANCEL_URL=https://...
//   PAYMENTS_TEST_MODE=true                 dev only: free auto-upgrade
//
// Full setup: supabase/functions/billing/SETUP.md
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@^22";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-neo-billing-secret, x-neo-order",
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
  if (!updated) return { ok: true };
  const promoteError = await promoteBuyer(admin, {
    user_id: updated.user_id,
    plan: updated.plan ?? "pro",
  });
  return promoteError ? { ok: false, error: promoteError } : { ok: true };
}
/** Stripe Price env var per plan. A plan with no Price is simply not sellable. */
const STRIPE_PRICE_ENV: Record<string, string> = {
  pro: "STRIPE_PRICE_PRO",
  team: "STRIPE_PRICE_TEAM",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

let stripeSingleton: Stripe | null | undefined;

/**
 * Deno runs on the Web Crypto API, not Node's `crypto` module. Without this
 * provider the SDK's signature verification throws inside Deno and every
 * webhook is rejected -- buyers would pay and never get their plan.
 */
const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();

/** Lazily build the Stripe client. Null until STRIPE_SECRET_KEY is set. */
function stripeClient(): Stripe | null {
  if (stripeSingleton !== undefined) return stripeSingleton;
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  // No hand-written apiVersion on purpose: the SDK already targets a known API
  // version, and a drifting version string fails every request at runtime.
  stripeSingleton = key ? new Stripe(key) : null;
  return stripeSingleton;
}

/** Stripe Price id for a plan (null when that plan has no Price configured). */
function stripePriceForPlan(plan: string): string | null {
  const envName = STRIPE_PRICE_ENV[plan];
  if (!envName) return null;
  return Deno.env.get(envName)?.trim() || null;
}

/** Absolute https return URLs for Stripe. Null when unset or malformed. */
function checkoutUrls(): { success: string; cancel: string } | null {
  const success = Deno.env.get("BILLING_SUCCESS_URL")?.trim();
  const cancel = Deno.env.get("BILLING_CANCEL_URL")?.trim();
  if (!success || !cancel) return null;
  if (!/^https:\/\//i.test(success) || !/^https:\/\//i.test(cancel)) return null;
  return {
    // Stripe substitutes the real session id for the placeholder itself.
    success: success.includes("{CHECKOUT_SESSION_ID}")
      ? success
      : `${success}${success.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel,
  };
}

/** Create a subscription Checkout Session for a pending order. */
async function createStripeSession(
  stripe: Stripe,
  args: {
    orderId: string;
    userId: string;
    plan: string;
    priceId: string;
    urls: { success: string; cancel: string };
  }
): Promise<Stripe.Checkout.Session> {
  // Mirrored onto the Subscription as well, so later lifecycle events can
  // identify the buyer without another API round-trip.
  const metadata = { order_id: args.orderId, user_id: args.userId, plan: args.plan };
  return await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: args.priceId, quantity: 1 }],
    client_reference_id: args.orderId,
    metadata,
    subscription_data: { metadata },
    success_url: args.urls.success,
    cancel_url: args.urls.cancel,
    allow_promotion_codes: true,
  });
}

/** Revoke a cancelled / unpaid subscriber. Service role, so 0002 allows it. */
async function revokeBuyer(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { error } = await admin
    .from("profiles")
    .update({ plan: "free", byok_enabled: false })
    .eq("id", userId);
  return error ? error.message : null;
}

/** Identify the buyer behind a Subscription (metadata first, then the order log). */
async function userIdForSubscription(
  admin: ReturnType<typeof createClient>,
  sub: Stripe.Subscription
): Promise<string | null> {
  const fromMetadata = (sub.metadata?.user_id ?? "").trim();
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : "";
  if (!customerId) return null;
  // Fallback for subscriptions created outside the app (Stripe dashboard):
  // match the customer id we stamped onto the order at checkout time.
  const { data } = await admin
    .from("payment_orders")
    .select("user_id, metadata")
    .eq("provider", "stripe")
    .limit(200);
  const hit = (data ?? []).find(
    (row) =>
      (row.metadata as { stripe_customer_id?: string } | null)?.stripe_customer_id ===
      customerId
  );
  return hit?.user_id ?? null;
}

/** Apply one verified Stripe event to the order + entitlement state. */
async function handleStripeEvent(
  admin: ReturnType<typeof createClient>,
  event: Stripe.Event
): Promise<Response> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = (
      session.metadata?.order_id ??
      session.client_reference_id ??
      ""
    ).trim();
    if (!orderId) {
      return json({ error: "Checkout session carries no order reference." }, 400);
    }
    await admin
      .from("payment_orders")
      .update({
        provider: "stripe",
        provider_ref: session.id,
        metadata: {
          ...(session.metadata ?? {}),
          stripe_customer_id: typeof session.customer === "string" ? session.customer : "",
          stripe_subscription_id:
            typeof session.subscription === "string" ? session.subscription : "",
        },
      })
      .eq("id", orderId);
    const settled = await settleOrder(admin, orderId);
    if (!settled.ok) return json({ error: settled.error }, 500);
    return json({ ok: true, status: "paid" });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = (
      session.metadata?.order_id ??
      session.client_reference_id ??
      ""
    ).trim();
    if (orderId) {
      await admin
        .from("payment_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("status", "pending");
    }
    return json({ ok: true, status: "cancelled" });
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const userId = await userIdForSubscription(admin, sub);
    if (!userId) return json({ ok: true, status: "ignored" });
    // Dunning grace: `past_due` keeps access while Stripe retries the charge.
    const revoked =
      event.type === "customer.subscription.deleted" ||
      sub.status === "canceled" ||
      sub.status === "unpaid" ||
      sub.status === "incomplete_expired";
    if (revoked) {
      const error = await revokeBuyer(admin, userId);
      return error ? json({ error }, 500) : json({ ok: true, status: "revoked" });
    }
    // active / trialing / past_due: re-assert the entitlement in case the
    // checkout webhook was delayed, lost or arrived out of order.
    const planned = (sub.metadata?.plan ?? "").trim();
    const error = await promoteBuyer(admin, {
      user_id: userId,
      plan: PAID_PLANS.has(planned) ? planned : "pro",
    });
    return error ? json({ error }, 500) : json({ ok: true, status: sub.status });
  }

  if (event.type === "invoice.payment_failed") {
    // Entitlement is driven by customer.subscription.updated (status → unpaid).
    // The order deliberately stays `paid`: it is the receipt of a completed
    // checkout and must stay accurate for accounting.
    return json({ ok: true, status: "recorded" });
  }

  return json({ ok: true, status: "ignored" });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // -- Stripe webhook path ----------------------------------------------
    // Stripe signs every event with `Stripe-Signature`; that signature is the
    // only authority once Stripe is configured, and it must be checked
    // against the byte-identical raw body, so the body is read as text and is
    // never parsed first. Stripe never sends a Supabase JWT, which is why the
    // function is deployed with verify_jwt = false and authenticates per route.
    const stripeSignature = req.headers.get("stripe-signature");
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
    if (stripeWebhookSecret) {
      if (!stripeSignature) return json({ error: "Missing Stripe-Signature header." }, 401);
      const stripe = stripeClient();
      if (!stripe) return json({ error: "Stripe is not configured." }, 503);
      const rawBody = await req.text();
      let event: Stripe.Event;
      try {
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          stripeSignature,
          stripeWebhookSecret,
          undefined,
          stripeCryptoProvider
        );
      } catch (e) {
        return json(
          {
            error:
              "Stripe signature verification failed: " +
              (e instanceof Error ? e.message : String(e)),
          },
          400
        );
      }
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      return await handleStripeEvent(admin, event);
    }

    // Generic shared-secret webhook path. Only reachable while Stripe is NOT
    // configured; once Stripe is set up, a signed event is the only way an
    // order can be settled.
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
    // The client sends the order id as a header (supabase-js functions.invoke
    // has no query-string option); ?order= is kept for curl/manual calls.
    if (req.method === "GET") {
      const url = new URL(req.url);
      const orderId = (
        req.headers.get("x-neo-order") ?? url.searchParams.get("order") ?? ""
      ).trim();
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
            user_id: order.user_id,
            plan: order.plan ?? "pro",
          });
          if (promoteError) return json({ error: promoteError }, 500);
        }
      }
      return json({ order });
    }

    if (req.method === "POST") {
      const body = (await req.json()) as { action?: string; plan?: string };

      // ── checkout: create a pending order for the requested plan ──────────
      if (body.action === "checkout") {
        const plan = (body.plan ?? "pro").trim().toLowerCase();
        if (!PAID_PLANS.has(plan)) return json({ error: "Unknown plan." }, 400);
        const price = PLAN_PRICES[plan];
        // Never create a pending order we cannot finish: with no configured
        // provider the order would sit `pending` forever and the buyer would
        // be stuck behind the paywall with no way to pay.
        const stripeReady =
          !!stripeClient() && !!stripePriceForPlan(plan) && !!checkoutUrls();
        if (!stripeReady && Deno.env.get("PAYMENTS_TEST_MODE") !== "true") {
          return json(
            {
              error:
                "Payments are not configured on this deployment. A billing operator must set the Stripe secrets and redeploy.",
            },
            503
          );
        }

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

        // -- Stripe Checkout: the real money path -------------------------
        // Creates a subscription Checkout Session for the pending order and
        // hands the hosted page to the client, which opens it in the system
        // browser. Access is granted only by the signature-verified webhook in
        // this function.
        const stripe = stripeClient();
        const priceId = stripePriceForPlan(plan);
        const urls = checkoutUrls();
        if (stripe && priceId && urls) {
          const session = await createStripeSession(stripe, {
            orderId: order.id,
            userId,
            plan,
            priceId,
            urls,
          });
          // Record the provider refs now, so subscription lifecycle events can
          // be attributed to this order even if the webhook is delayed.
          await admin
            .from("payment_orders")
            .update({
              provider: "stripe",
              provider_ref: session.id,
              metadata: {
                source: "app-checkout",
                provider: "stripe",
                user_id: userId,
                plan,
                stripe_checkout_session_id: session.id,
                stripe_customer_id:
                  typeof session.customer === "string" ? session.customer : "",
                stripe_subscription_id:
                  typeof session.subscription === "string" ? session.subscription : "",
              },
            })
            .eq("id", order.id);
          return json({
            orderId: order.id,
            status: "pending",
            testMode: false,
            checkoutUrl: session.url,
            provider: "stripe",
          });
        }

        // Dev-only escape hatch: settles without a provider. NEVER enable
        // this on the live project - it grants a paid plan for free.
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

        return json(
          {
            error:
              "Payments are not configured for this plan. A billing operator must set the Stripe secrets and redeploy.",
          },
          503
        );
      }

      // Clients may not settle their own orders — that's the webhook's job.
      return json({ error: "Unsupported action." }, 400);
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
