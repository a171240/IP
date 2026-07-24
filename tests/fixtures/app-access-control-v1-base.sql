create extension if not exists "pgcrypto";

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nickname text,
  avatar_url text,
  plan text not null default 'free',
  credits_balance integer not null default 0,
  credits_unlimited boolean not null default false,
  trial_granted_at timestamptz,
  account_role text not null default 'guest',
  company_id uuid,
  company_name text,
  store_id uuid,
  store_name text,
  service_plan_label text
);

create table if not exists public.mp_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
);

create table if not exists public.mp_stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.mp_companies(id) on delete cascade,
  name text not null,
  status text not null default 'active'
);

create table if not exists public.mp_account_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete cascade,
  store_id uuid references public.mp_stores(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  display_name text,
  accepted_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  pro_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  membership_id uuid references public.mp_account_memberships(id) on delete set null,
  scenario_id text not null default 'objection_safety',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  report_json jsonb,
  total_score numeric,
  dimension_scores jsonb,
  customer_profile_id uuid,
  scene_card_id uuid,
  session_context_json jsonb,
  scenario_snapshot_json jsonb
);

create table if not exists public.voice_coach_turns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null references public.voice_coach_sessions(id) on delete cascade,
  turn_index integer not null,
  role text not null,
  text text not null default '',
  emotion text,
  audio_path text,
  audio_seconds numeric,
  asr_confidence numeric,
  analysis_json jsonb,
  features_json jsonb,
  unique (session_id, turn_index)
);
