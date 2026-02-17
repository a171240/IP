create extension if not exists "pgcrypto";

-- Add turn status for async pipeline states.
alter table if exists public.voice_coach_turns
  add column if not exists status text not null default 'ready'
  check (
    status in (
      'ready',
      'accepted',
      'processing',
      'asr_ready',
      'text_ready',
      'audio_ready',
      'analysis_ready',
      'error'
    )
  );

create index if not exists voice_coach_turns_session_status_idx
  on public.voice_coach_turns (session_id, status, created_at desc);

-- Async job queue for per-turn processing.
create table if not exists public.voice_coach_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null,
  session_id uuid not null references public.voice_coach_sessions (id) on delete cascade,
  user_id uuid not null,
  turn_id uuid not null references public.voice_coach_turns (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'error')),
  stage text not null default 'accepted',
  attempt_count int not null default 0,
  last_error text null,
  payload_json jsonb null,
  result_json jsonb null
);

create unique index if not exists voice_coach_jobs_turn_id_key
  on public.voice_coach_jobs (turn_id);

create index if not exists voice_coach_jobs_session_status_idx
  on public.voice_coach_jobs (session_id, status, created_at asc);

create index if not exists voice_coach_jobs_user_created_at_idx
  on public.voice_coach_jobs (user_id, created_at desc);

-- Event stream for client polling.
create table if not exists public.voice_coach_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  session_id uuid not null references public.voice_coach_sessions (id) on delete cascade,
  user_id uuid not null,
  turn_id uuid null references public.voice_coach_turns (id) on delete set null,
  job_id uuid null references public.voice_coach_jobs (id) on delete set null,
  type text not null,
  data_json jsonb null
);

create index if not exists voice_coach_events_session_id_id_idx
  on public.voice_coach_events (session_id, id asc);

create index if not exists voice_coach_events_user_created_at_idx
  on public.voice_coach_events (user_id, created_at desc);

alter table public.voice_coach_jobs enable row level security;
alter table public.voice_coach_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_jobs' and policyname = 'voice_coach_jobs_select_own'
  ) then
    create policy "voice_coach_jobs_select_own"
      on public.voice_coach_jobs
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_jobs' and policyname = 'voice_coach_jobs_insert_own'
  ) then
    create policy "voice_coach_jobs_insert_own"
      on public.voice_coach_jobs
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_jobs' and policyname = 'voice_coach_jobs_update_own'
  ) then
    create policy "voice_coach_jobs_update_own"
      on public.voice_coach_jobs
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_jobs' and policyname = 'voice_coach_jobs_service_role_all'
  ) then
    create policy "voice_coach_jobs_service_role_all"
      on public.voice_coach_jobs
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_events' and policyname = 'voice_coach_events_select_own'
  ) then
    create policy "voice_coach_events_select_own"
      on public.voice_coach_events
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_events' and policyname = 'voice_coach_events_insert_own'
  ) then
    create policy "voice_coach_events_insert_own"
      on public.voice_coach_events
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voice_coach_events' and policyname = 'voice_coach_events_service_role_all'
  ) then
    create policy "voice_coach_events_service_role_all"
      on public.voice_coach_events
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;
