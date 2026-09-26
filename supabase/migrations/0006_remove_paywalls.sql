-- Author: madhusudhan
-- Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
-- ═══════════════════════════════════════════════════════════════════════════
-- Neo (AgenticCoder) — Supabase schema 0006_remove_paywalls
--
-- Removes the paywall. Accounts are KEPT — only the paid gating goes away:
--
--   * `profiles.byok_enabled` reverts to default true and every row is unlocked,
--     so any signed-in account can store and read its own provider keys
--     (the `api-keys` edge function no longer checks the flag at all — redeploy
--     it, see supabase/functions/api-keys/index.ts);
--   * `payment_orders` (checkout receipts) is dropped — nothing writes to it now
--     that the `billing` edge function and the Pricing page are gone;
--   * `profiles.plan` is KEPT as an informational column so existing rows and
--     any future entitlement work keep working. It no longer gates anything.
--
-- Idempotent — safe to re-run.
-- Run in the Supabase dashboard → SQL Editor (or `supabase db push`).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Unlock BYOK for every account ──────────────────────────────────────────
-- Reverses 0005_byok_paywall: new profile rows default to entitled, and every
-- existing row is flipped on regardless of its old plan.
alter table public.profiles
  alter column byok_enabled set default true;

update public.profiles
  set byok_enabled = true,
      updated_at = now()
  where byok_enabled is distinct from true;

comment on column public.profiles.byok_enabled is
  'Always true. Kept for backwards compatibility; BYOK is no longer plan-gated.';

comment on column public.profiles.plan is
  'Informational only. No feature is gated on the plan — there is no paywall.';

-- ── 2. Drop the checkout / receipts table ─────────────────────────────────────
-- Nothing references it once the Pricing page and the `billing` function are
-- removed. Dropping it also removes the order RLS policies and the
-- column-restricted INSERT grant created in 0004_payments.
drop table if exists public.payment_orders;

-- ── 3. Report ─────────────────────────────────────────────────────────────────
-- Expect: byok_enabled default true, plan column still present.
select
  column_name,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('plan', 'byok_enabled')
order by column_name;

commit;