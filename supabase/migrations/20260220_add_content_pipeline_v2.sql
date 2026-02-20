-- Content pipeline v2 (mini-program)
-- Scope: ingest -> rewrite -> avatar-video -> distribution

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  source_mode text not null check (source_mode in ('single_link', 'douyin_profile')),
  platform text not null check (platform in ('douyin', 'xiaohongshu')),
  source_url text not null,

  status text not null default 'ready' check (status in ('ready', 'failed')),
  title text,
  text_content text,
  images jsonb,
  video_url text,
  author text,
  meta jsonb,
  raw_payload jsonb,
  error_code text,

  batch_id uuid,
  sort_index int not null default 0
);

create index if not exists content_sources_user_created_at_idx
  on public.content_sources (user_id, created_at desc);

create index if not exists content_sources_batch_sort_idx
  on public.content_sources (batch_id, sort_index asc, created_at asc);

alter table public.content_sources enable row level security;

drop policy if exists "content_sources_select_own" on public.content_sources;
drop policy if exists "content_sources_insert_own" on public.content_sources;
drop policy if exists "content_sources_update_own" on public.content_sources;
drop policy if exists "content_sources_service_role_all" on public.content_sources;

create policy "content_sources_select_own"
  on public.content_sources
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "content_sources_insert_own"
  on public.content_sources
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "content_sources_update_own"
  on public.content_sources
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "content_sources_service_role_all"
  on public.content_sources
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.content_rewrites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid not null references public.content_sources(id) on delete cascade,

  target text not null check (target in ('douyin_video', 'xhs_note')),
  tone text not null default 'professional' check (tone in ('professional', 'sharp', 'warm')),
  constraints jsonb,

  result_title text,
  result_body text,
  result_script text,
  result_tags jsonb,
  cover_prompts jsonb,

  compliance_risk_level text,
  compliance_flags jsonb,

  status text not null default 'done' check (status in ('done', 'failed')),
  error_code text
);

create index if not exists content_rewrites_user_created_at_idx
  on public.content_rewrites (user_id, created_at desc);

create index if not exists content_rewrites_source_idx
  on public.content_rewrites (source_id, created_at desc);

alter table public.content_rewrites enable row level security;

drop policy if exists "content_rewrites_select_own" on public.content_rewrites;
drop policy if exists "content_rewrites_insert_own" on public.content_rewrites;
drop policy if exists "content_rewrites_update_own" on public.content_rewrites;
drop policy if exists "content_rewrites_service_role_all" on public.content_rewrites;

create policy "content_rewrites_select_own"
  on public.content_rewrites
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "content_rewrites_insert_own"
  on public.content_rewrites
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "content_rewrites_update_own"
  on public.content_rewrites
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "content_rewrites_service_role_all"
  on public.content_rewrites
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  rewrite_id uuid not null references public.content_rewrites(id) on delete cascade,
  duration_profile text not null default '15_25s' check (duration_profile in ('15_25s')),
  avatar_profile_id uuid references public.store_profiles(id) on delete set null,
  product_assets jsonb,

  provider text not null default 'volc',
  provider_job_id text,

  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  progress numeric(5,2) not null default 0,
  retry_count int not null default 0,

  audio_storage_path text,
  video_storage_path text,
  error text
);

create index if not exists video_render_jobs_user_created_at_idx
  on public.video_render_jobs (user_id, created_at desc);

create index if not exists video_render_jobs_status_created_at_idx
  on public.video_render_jobs (status, created_at asc);

alter table public.video_render_jobs enable row level security;

drop policy if exists "video_render_jobs_select_own" on public.video_render_jobs;
drop policy if exists "video_render_jobs_insert_own" on public.video_render_jobs;
drop policy if exists "video_render_jobs_update_own" on public.video_render_jobs;
drop policy if exists "video_render_jobs_service_role_all" on public.video_render_jobs;

create policy "video_render_jobs_select_own"
  on public.video_render_jobs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "video_render_jobs_insert_own"
  on public.video_render_jobs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "video_render_jobs_update_own"
  on public.video_render_jobs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "video_render_jobs_service_role_all"
  on public.video_render_jobs
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.distribution_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  content_id uuid not null,
  content_type text not null default 'rewrite' check (content_type in ('rewrite', 'video')),

  mode text not null check (mode in ('immediate', 'scheduled')),
  schedule_at timestamptz,

  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  error text
);

create index if not exists distribution_jobs_user_created_at_idx
  on public.distribution_jobs (user_id, created_at desc);

alter table public.distribution_jobs enable row level security;

drop policy if exists "distribution_jobs_select_own" on public.distribution_jobs;
drop policy if exists "distribution_jobs_insert_own" on public.distribution_jobs;
drop policy if exists "distribution_jobs_update_own" on public.distribution_jobs;
drop policy if exists "distribution_jobs_service_role_all" on public.distribution_jobs;

create policy "distribution_jobs_select_own"
  on public.distribution_jobs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "distribution_jobs_insert_own"
  on public.distribution_jobs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "distribution_jobs_update_own"
  on public.distribution_jobs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "distribution_jobs_service_role_all"
  on public.distribution_jobs
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.distribution_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  job_id uuid not null references public.distribution_jobs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  platform text not null check (platform in ('xiaohongshu', 'douyin', 'video_account')),
  mode text not null check (mode in ('api', 'assistant')),
  status text not null default 'queued' check (status in ('queued', 'submitted', 'done', 'failed')),

  publish_url text,
  action_payload jsonb,
  error text,
  retry_count int not null default 0
);

create index if not exists distribution_tasks_job_idx
  on public.distribution_tasks (job_id, created_at asc);

create index if not exists distribution_tasks_user_created_idx
  on public.distribution_tasks (user_id, created_at desc);

alter table public.distribution_tasks enable row level security;

drop policy if exists "distribution_tasks_select_own" on public.distribution_tasks;
drop policy if exists "distribution_tasks_insert_own" on public.distribution_tasks;
drop policy if exists "distribution_tasks_update_own" on public.distribution_tasks;
drop policy if exists "distribution_tasks_service_role_all" on public.distribution_tasks;

create policy "distribution_tasks_select_own"
  on public.distribution_tasks
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "distribution_tasks_insert_own"
  on public.distribution_tasks
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "distribution_tasks_update_own"
  on public.distribution_tasks
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "distribution_tasks_service_role_all"
  on public.distribution_tasks
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.platform_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('xiaohongshu', 'douyin', 'video_account')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'expired')),

  account_id text,
  account_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  meta jsonb,

  unique (user_id, platform)
);

create index if not exists platform_connections_user_updated_idx
  on public.platform_connections (user_id, updated_at desc);

alter table public.platform_connections enable row level security;

drop policy if exists "platform_connections_select_own" on public.platform_connections;
drop policy if exists "platform_connections_insert_own" on public.platform_connections;
drop policy if exists "platform_connections_update_own" on public.platform_connections;
drop policy if exists "platform_connections_service_role_all" on public.platform_connections;

create policy "platform_connections_select_own"
  on public.platform_connections
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "platform_connections_insert_own"
  on public.platform_connections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "platform_connections_update_own"
  on public.platform_connections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "platform_connections_service_role_all"
  on public.platform_connections
  for all
  to service_role
  using (true)
  with check (true);

-- Store profile extension for avatar + product assets
alter table public.store_profiles
  add column if not exists boss_drive_video_path text;

alter table public.store_profiles
  add column if not exists boss_portrait_path text;

alter table public.store_profiles
  add column if not exists product_images jsonb;

alter table public.store_profiles
  add column if not exists avatar_consent_meta jsonb;

-- Link xhs_drafts with v2 pipeline entities
alter table public.xhs_drafts
  add column if not exists source_id uuid references public.content_sources(id) on delete set null;

alter table public.xhs_drafts
  add column if not exists rewrite_id uuid references public.content_rewrites(id) on delete set null;

alter table public.xhs_drafts
  add column if not exists video_job_id uuid references public.video_render_jobs(id) on delete set null;

create index if not exists xhs_drafts_source_id_idx
  on public.xhs_drafts (source_id);

create index if not exists xhs_drafts_rewrite_id_idx
  on public.xhs_drafts (rewrite_id);

create index if not exists xhs_drafts_video_job_id_idx
  on public.xhs_drafts (video_job_id);
