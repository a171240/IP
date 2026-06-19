create extension if not exists "pgcrypto";

create table if not exists public.voice_coach_opening_preparations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  user_id uuid not null,
  account_id text null,
  idempotency_key text not null,
  session_id uuid null references public.voice_coach_sessions (id) on delete set null,
  scenario_id text not null default 'objection_safety',
  source_type text not null default 'voice_coach',
  knowledge_space_id text null,
  training_pack_id text null,
  training_task_id text null,
  source_snapshot_hash text null,
  context_hash text null,
  text_hash text null,
  audio_hash text null,
  opening_context_json jsonb null,
  opening_line_json jsonb null,
  audio_path text null,
  audio_seconds numeric null,
  voice_profile_id text null,
  voice_config_hash text null,
  policy_status text not null default 'unchecked',
  policy_issues_json jsonb not null default '[]'::jsonb,
  status text not null default 'preparing'
    check (status in ('preparing', 'audio_ready', 'fallback_ready', 'blocked', 'consumed', 'expired')),
  attempt_count int not null default 0,
  locked_at timestamptz null,
  consumed_at timestamptz null,
  error_code text null,
  error_message text null
);

create unique index if not exists voice_coach_opening_preparations_user_idempotency_key
  on public.voice_coach_opening_preparations (user_id, idempotency_key);

create index if not exists voice_coach_opening_preparations_user_status_idx
  on public.voice_coach_opening_preparations (user_id, status, expires_at desc);

create index if not exists voice_coach_opening_preparations_session_idx
  on public.voice_coach_opening_preparations (session_id);

create index if not exists voice_coach_opening_preparations_context_idx
  on public.voice_coach_opening_preparations (user_id, context_hash, voice_config_hash);

grant select, insert, update on public.voice_coach_opening_preparations to authenticated;
grant select, insert, update, delete on public.voice_coach_opening_preparations to service_role;

alter table public.voice_coach_opening_preparations enable row level security;

create policy "voice_coach_opening_preparations_select_own"
  on public.voice_coach_opening_preparations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_opening_preparations_insert_own"
  on public.voice_coach_opening_preparations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "voice_coach_opening_preparations_update_own"
  on public.voice_coach_opening_preparations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "voice_coach_opening_preparations_service_role_all"
  on public.voice_coach_opening_preparations
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.voice_coach_opening_preparations is
  'Precomputed first customer opening text and audio for voice coach startup latency reduction.';

comment on column public.voice_coach_opening_preparations.idempotency_key is
  'Client supplied preparation idempotency key scoped to user_id.';

comment on column public.voice_coach_opening_preparations.opening_context_json is
  'Server-resolved customer, scene, training, professional, and follow-up context snapshot.';

comment on column public.voice_coach_opening_preparations.opening_line_json is
  'Prepared first customer line: text, emotion, tag, and policy metadata.';
