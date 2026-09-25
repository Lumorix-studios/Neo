# Billing runbook — real payments for the BYOK paywall

> **Who calls what**
>
> The **desktop app does not call this function.** Settings → Billing only links
> out to the website that handles checkout (`UPGRADE_URL` in `src/lib/billing.ts`),
> and both share the same Supabase project, so a purchase on the website updates
> `profiles.plan` / `byok_enabled` and the app shows it on the next refresh.
>
> This folder is the **server-side half your website can call**: it creates the
> Stripe Checkout session, verifies the webhook, and promotes the buyer's
> entitlement. If your website implements its own checkout + webhook, this folder
> is not needed — delete it and drop `[functions.billing]` from
> `supabase/config.toml`.

One-time operator setup. Until it is done, no payment can be settled and nobody
reaches the paid plan.

## 1. Stripe products + prices

Dashboard → Products → three recurring (monthly) products priced to match
`PLAN_DISPLAY` in `src/lib/billing.ts`: Pro $9, Team $29, Enterprise $99.
Copy each Price id (`price_...`) for step 2.

## 2. Function secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_PRO=price_... \
  STRIPE_PRICE_TEAM=price_... \
  STRIPE_PRICE_ENTERPRISE=price_... \
  BILLING_SUCCESS_URL=https://<your-site>/billing/done \
  BILLING_CANCEL_URL=https://<your-site>/billing/cancel
```

`BILLING_SUCCESS_URL` is where Stripe sends the buyer after paying; it must be an
absolute `https` URL. If it has no query string, the function appends
`?session_id={CHECKOUT_SESSION_ID}` itself.

`STRIPE_WEBHOOK_SECRET` is the endpoint secret from step 3 — **not** the API key.

## 3. Webhook endpoint

Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://<project-ref>.supabase.co/functions/v1/billing`
- **Events:**
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.

## 4. Deploy

```bash
supabase functions deploy billing
supabase functions deploy api-keys
```

And apply the schema migrations in the Supabase SQL Editor: `0004_payments.sql`
and `0005_byok_paywall.sql`.

## 5. Verify (use Stripe test mode first)

Validate with a test key + test prices, then swap in the live values.

1. Sign in with a free account → Settings → Billing → a plan button (or call the
   function directly).
2. The browser opens `checkout.stripe.com`; pay with card `4242 4242 4242 4242`.
3. Returning to the app flips the plan to Pro with no manual step: the webhook
   settles the order, and the GET fallback promotes the buyer if the webhook was
   still in flight.
4. Dashboard → Webhooks shows `200`s for `checkout.session.completed`.
5. Cancel the subscription in the Stripe test portal → the next
   `customer.subscription.deleted` sets `plan = 'free'` and `byok_enabled = false`.

## Never

Do **not** set `PAYMENTS_TEST_MODE=true` on the live project: it grants the paid
plan instantly with no charge. It exists only for local/dev smoke tests.
