-- ═══════════════════════════════════════════════════════════════════════════
-- Neo (AgenticCoder) — 0003_restore_table_grants
--
-- Runtime probe of this project returned HTTP 401 / Postgres 42501:
--   permission denied for table profiles
--   permission denied for table chats
--   permission denied for table user_settings
--
-- RLS policies exist, but PostgREST never reaches them if the JWT role
-- (anon / authenticated) has no table privilege. That made sign-in appear
-- to work while every plan + cloud query failed, and the client then
-- defaulted the missing profile row to plan = 'free'.
--
-- Idempotent. Does not open user_api_keys to the client (edge function only).
-- Does not restore UPDATE on profiles.plan / byok_enabled (see 0002).
-- ═══════════════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant insert (id, email, display_name, avatar_url) on table public.profiles to authenticated;
grant update (display_name, avatar_url, updated_at) on table public.profiles to authenticated;

grant select, insert, update, delete on table public.chats to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
