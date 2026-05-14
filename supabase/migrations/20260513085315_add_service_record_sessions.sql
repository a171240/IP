begin;

create table if not exists public.service_record_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  membership_id uuid references public.mp_account_memberships(id) on delete set null,
  client_session_id text not null,
  customer_profile_id uuid references public.voice_coach_customer_profiles(id) on delete set null,
  scene_card_id uuid references public.voice_coach_scene_cards(id) on delete set null,
  status text not null default 'recording' check (
    status in ('recording', 'paused', 'ended_pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  objective text,
  participants jsonb not null default '[]'::jsonb,
  consent_confirmed boolean not null default false,
  consent_note text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  resume_deadline_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  audio_seconds numeric not null default 0,
  segment_count integer not null default 0,
  customer_snapshot_json jsonb,
  scene_snapshot_json jsonb,
  context_snapshot_json jsonb,
  result_json jsonb,
  note_markdown text,
  profile_suggestions_json jsonb,
  xhs_draft_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists service_record_sessions_user_client_key
  on public.service_record_sessions(user_id, client_session_id);
create index if not exists service_record_sessions_user_started_idx
  on public.service_record_sessions(user_id, started_at desc);
create index if not exists service_record_sessions_company_started_idx
  on public.service_record_sessions(company_id, started_at desc);
create index if not exists service_record_sessions_store_started_idx
  on public.service_record_sessions(store_id, started_at desc);
create index if not exists service_record_sessions_customer_started_idx
  on public.service_record_sessions(customer_profile_id, started_at desc);
create index if not exists service_record_sessions_status_idx
  on public.service_record_sessions(status, updated_at desc);

create table if not exists public.service_record_segments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_id uuid not null references public.service_record_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  client_segment_id text not null,
  segment_index integer not null,
  status text not null default 'uploaded' check (
    status in ('uploaded', 'transcribing', 'transcribed', 'failed')
  ),
  storage_bucket text not null default 'voice-coach-audio',
  storage_path text not null,
  content_type text,
  format text,
  audio_bytes bigint not null default 0,
  client_audio_seconds numeric,
  started_at timestamptz,
  ended_at timestamptz,
  uploaded_at timestamptz not null default now(),
  asr_status text not null default 'pending' check (
    asr_status in ('pending', 'running', 'done', 'failed', 'skipped')
  ),
  transcript_text text,
  asr_json jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists service_record_segments_session_client_key
  on public.service_record_segments(session_id, client_segment_id);
create index if not exists service_record_segments_session_index_idx
  on public.service_record_segments(session_id, segment_index);
create index if not exists service_record_segments_user_created_idx
  on public.service_record_segments(user_id, created_at desc);
create index if not exists service_record_segments_asr_status_idx
  on public.service_record_segments(asr_status, created_at);

create table if not exists public.service_record_markers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null references public.service_record_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  marker_type text not null,
  label text,
  offset_seconds numeric not null default 0,
  note text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists service_record_markers_session_offset_idx
  on public.service_record_markers(session_id, offset_seconds);
create index if not exists service_record_markers_user_created_idx
  on public.service_record_markers(user_id, created_at desc);

alter table public.service_record_sessions enable row level security;
alter table public.service_record_segments enable row level security;
alter table public.service_record_markers enable row level security;

create policy "service_record_sessions_select_own"
  on public.service_record_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);
create policy "service_record_sessions_insert_own"
  on public.service_record_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);
create policy "service_record_sessions_update_own"
  on public.service_record_sessions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "service_record_sessions_delete_own"
  on public.service_record_sessions
  for delete
  to authenticated
  using (auth.uid() = user_id);
create policy "service_record_sessions_service_role_all"
  on public.service_record_sessions
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_record_segments_select_own"
  on public.service_record_segments
  for select
  to authenticated
  using (auth.uid() = user_id);
create policy "service_record_segments_insert_own"
  on public.service_record_segments
  for insert
  to authenticated
  with check (auth.uid() = user_id);
create policy "service_record_segments_update_own"
  on public.service_record_segments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "service_record_segments_delete_own"
  on public.service_record_segments
  for delete
  to authenticated
  using (auth.uid() = user_id);
create policy "service_record_segments_service_role_all"
  on public.service_record_segments
  for all
  to service_role
  using (true)
  with check (true);

create policy "service_record_markers_select_own"
  on public.service_record_markers
  for select
  to authenticated
  using (auth.uid() = user_id);
create policy "service_record_markers_insert_own"
  on public.service_record_markers
  for insert
  to authenticated
  with check (auth.uid() = user_id);
create policy "service_record_markers_update_own"
  on public.service_record_markers
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "service_record_markers_delete_own"
  on public.service_record_markers
  for delete
  to authenticated
  using (auth.uid() = user_id);
create policy "service_record_markers_service_role_all"
  on public.service_record_markers
  for all
  to service_role
  using (true)
  with check (true);

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

comment on table public.service_record_sessions is
  'Long in-store beauty service recordings. One row represents one customer service round.';
comment on table public.service_record_segments is
  'Uploaded short audio segments for a service_record_session. client_segment_id makes retries idempotent.';
comment on table public.service_record_markers is
  'Manual timeline markers added during service recording.';

commit;
