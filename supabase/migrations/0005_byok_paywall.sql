-- Author: madhusudhan
-- Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
-- ═══════════════════════════════════════════════════════════════════════════
-- Neo (AgenticCoder) — Supabase schema 0005_byok_paywall
--
-- Turns the BYOK paywall ON. 0001_init shipped
-- `byok_enabled boolean not null default true` and the `api-keys` edge function
-- only blocked the literal value `false`, so every account — including brand
-- new free signups — was entitled and the paid feature was effectively free.
--
-- After this migration:
--   * new profile rows default to `byok_enabled = false` (locked);
--   * a paid plan (admin / pro / team / enterprise / paid) grants BYOK via the
--     plan id alone;
--   * a non-paid plan is only entitled when `byok_enabled` is explicitly true
--     (manual grant / comp).
--
-- The matching rule lives in `supabase/functions/api-keys/index.ts`
-- (`hasByokAccess`) and `src/lib/auth.ts` (`resolveByokEnabled`).
--
-- Run in the Supabase dashboard → SQL Editor (or `supabase db push`).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles alter column byok_enabled set default false;

-- Rows created before this migration carry the old default (true) and would
-- stay entitled. Lock every non-paid row down. A hand-granted BYOK flag on a
-- free row is dropped too — re-grant it explicitly:
--   update public.profiles set byok_enabled = true where id = '<uuid>';
update public.profiles
   set byok_enabled = false,
       updated_at = now()
 where coalesce(plan, 'free') not in ('admin', 'pro', 'team', 'enterprise', 'paid');

-- Keep paid rows consistent with their plan (belt and braces — the plan id
-- alone already grants BYOK in the edge function).
update public.profiles
   set byok_enabled = true,
       updated_at = now()
 where plan in ('admin', 'pro', 'team', 'enterprise', 'paid')
   and byok_enabled is distinct from true;

comment on column public.profiles.byok_enabled is
  'Explicit BYOK grant for a non-paid plan. Paid plans are entitled by plan id; everything else is locked.';
