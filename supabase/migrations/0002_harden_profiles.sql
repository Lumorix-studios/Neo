-- Author: madhusudhan
-- Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
-- ═══════════════════════════════════════════════════════════════════════════
-- Neo (AgenticCoder) — Supabase schema 0002_harden_profiles
--
-- Closes a paywall bypass left open by 0001_init.
--
-- `profiles_update_own` / `profiles_insert_own` are row-level only, so a
-- signed-in user could write ANY column of their own row:
--
--     await supabase.from('profiles')
--       .update({ byok_enabled: true, plan: 'pro' })
--       .eq('id', myUserId)          // public anon key + their own JWT
--
-- The `api-keys` edge function reads `byok_enabled` to decide whether to
-- serve a decrypted key, so that one call unlocked BYOK for free. Two
-- independent guards fix it:
--
--   1. Column-level privileges — the client role may only write display
--      fields (display_name / avatar_url / updated_at), never plan or
--      byok_enabled. Entitlements fall back to the column defaults.
--   2. A trigger that rejects entitlement changes arriving with a user JWT.
--      Service-role, SQL-editor and webhook writes carry no auth.uid() and
--      stay free to flip plan / byok_enabled (that is how the future billing
--      webhook upgrades a user).
--
-- Run in the Supabase dashboard → SQL Editor (or `supabase db push`).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─ 1. Column-level privileges ──────────────────────────────────────────────
-- Drop the blanket table grants handed out by Supabase's default privileges,
-- then hand back only the columns the app actually edits (see
-- src/lib/auth.ts → ensureProfile() / updateProfile()).
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar_url, updated_at) on public.profiles to authenticated;

revoke insert on public.profiles from authenticated, anon;
-- plan / byok_enabled / created_at are deliberately NOT granted: they always
-- take their column defaults on a client insert and are set by the backend.
grant insert (id, email, display_name, avatar_url) on public.profiles to authenticated;

-- ── 2. Trigger guard on the entitlement columns ─────────────────────────────
-- Belt-and-braces: even if a future policy or grant re-opens the table, a
-- user-scoped UPDATE can still not promote itself.
create or replace function public.protect_profile_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is non-null only for end-user (JWT) requests. Service-role,
  -- SQL-editor and webhook writes have no `sub` claim, so they pass through.
  if auth.uid() is not null then
    if new.plan is distinct from old.plan
       or new.byok_enabled is distinct from old.byok_enabled then
      raise exception
        'plan and byok_enabled are managed by Neo and cannot be changed from the client'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_entitlements on public.profiles;
create trigger profiles_protect_entitlements
  before update on public.profiles
  for each row execute function public.protect_profile_entitlements();

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect only display_name, avatar_url, updated_at for UPDATE, and
-- id, email, display_name, avatar_url for INSERT:
--
--   select privilege_type, column_name
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'profiles'
--     and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE')
--   order by privilege_type, column_name;
--
-- Expect the guard trigger to exist:
--
--   select tgname from pg_trigger where tgname = 'profiles_protect_entitlements';