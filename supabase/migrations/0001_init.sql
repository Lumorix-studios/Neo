-- ═══════════════════════════════════════════════════════════════════════════
-- Neo (AgenticCoder) — Supabase schema 0001_init
-- Run this in the Supabase dashboard → SQL Editor (or `supabase db push`).
-- Creates: profiles, user_settings, chats, user_api_keys + RLS policies
--          and a trigger that auto-creates a profile row on every signup.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. `byok_enabled` is the future paywall flag for the
-- BYOK feature — set it to `false` per user (or flip the default) when the
-- paid plan goes live.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  plan text not null default 'free',
  byok_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user account profile. byok_enabled gates the BYOK API-key feature (paywall later).';

-- Auto-create a profile row whenever a new auth user appears (email or OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Account'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── user_settings (AI settings) ─────────────────────────────────────────────
-- One row of AI settings per user. The API key is NEVER stored here — BYOK
-- keys are encrypted in user_api_keys via the api-keys edge function.
create table if not exists public.user_settings (
  -- `default auth.uid()` lets the client upsert without naming its own id while
  -- still satisfying the RLS `with check (auth.uid() = user_id)` policy.
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  provider text not null default 'openai',
  model text not null default 'gpt-4o-mini',
  base_url text not null default 'https://api.openai.com/v1',
  system_prompt text not null default 'You are a helpful, professional assistant.',
  temperature real not null default 0.7,
  auto_approve_tools boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ── chats (conversation sessions) ───────────────────────────────────────────
-- One row per chat session. `id` is the client-generated session id (text so
-- it matches the app's local ids). `settings` holds the per-chat AI snapshot
-- (same rule as user_settings — no API keys in here).
create table if not exists public.chats (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled chat',
  messages jsonb not null default '[]'::jsonb,
  settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chats_user_updated_idx
  on public.chats (user_id, updated_at desc);

-- Keep updated_at honest when the client doesn't send it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chats_touch_updated_at on public.chats;
create trigger chats_touch_updated_at
  before update on public.chats
  for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ── user_api_keys (BYOK, encrypted) ─────────────────────────────────────────
-- Written/read ONLY through the `api-keys` edge function, which encrypts the
-- key with AES-GCM before it ever reaches this table and decrypts on the way
-- back out (after checking the caller's profile.byok_enabled flag).
create table if not exists public.user_api_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  encrypted text not null,           -- base64(iv || ciphertext) — never plaintext
  key_hint text not null default '', -- last 4 chars, for UI display only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.chats enable row level security;
alter table public.user_api_keys enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- user_settings
drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chats
drop policy if exists "chats_all_own" on public.chats;
create policy "chats_all_own" on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_api_keys — no direct-table policies on purpose: reads/writes go through
-- the edge function (service role). Direct client access stays denied.