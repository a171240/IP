create extension if not exists "pgcrypto";

-- Voice coach (speech roleplay training) sessions + turns.

create table if not exists public.voice_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  scenario_id text not null default 'objection_safety',
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  report_json jsonb null,
  total_score numeric null,
  dimension_scores jsonb null
);

create index if not exists voice_coach_sessions_user_created_at_idx
  on public.voice_coach_sessions (user_id, created_at desc);

create index if not exists voice_coach_sessions_status_idx
  on public.voice_coach_sessions (status);

create table if not exists public.voice_coach_turns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null references public.voice_coach_sessions (id) on delete cascade,
  turn_index int not null,
  role text not null check (role in ('customer', 'beautician')),
  text text not null default '',
  emotion text null,
  audio_path text null,
  audio_seconds numeric null,
  asr_confidence numeric null,
  analysis_json jsonb null,
  features_json jsonb null
);

create unique index if not exists voice_coach_turns_session_turn_index_key
  on public.voice_coach_turns (session_id, turn_index);

create index if not exists voice_coach_turns_session_created_at_idx
  on public.voice_coach_turns (session_id, created_at);

alter table public.voice_coach_sessions enable row level security;
alter table public.voice_coach_turns enable row level security;

-- Sessions: authenticated users can select/insert/update their own sessions.
create policy "voice_coach_sessions_select_own"
  on public.voice_coach_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_sessions_insert_own"
  on public.voice_coach_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "voice_coach_sessions_update_own"
  on public.voice_coach_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "voice_coach_sessions_service_role_all"
  on public.voice_coach_sessions
  for all
  to service_role
  using (true)
  with check (true);

-- Turns: authenticated users can select/insert/update/delete turns that belong to their sessions.
create policy "voice_coach_turns_select_own"
  on public.voice_coach_turns
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.voice_coach_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  );

create policy "voice_coach_turns_insert_own"
  on public.voice_coach_turns
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.voice_coach_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  );

create policy "voice_coach_turns_update_own"
  on public.voice_coach_turns
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.voice_coach_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.voice_coach_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  );

create policy "voice_coach_turns_delete_own"
  on public.voice_coach_turns
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.voice_coach_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
    )
  );

create policy "voice_coach_turns_service_role_all"
  on public.voice_coach_turns
  for all
  to service_role
  using (true)
  with check (true);

-- Storage bucket (optional; ignore if storage schema not available in this environment).
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage'
      and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('voice-coach-audio', 'voice-coach-audio', false)
    on conflict (id) do nothing;
  end if;
end $$;

