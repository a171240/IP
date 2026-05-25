begin;

create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists brand_code text,
  add column if not exists feature_flags jsonb;

alter table public.mp_companies
  add column if not exists brand_code text,
  add column if not exists metadata jsonb;

alter table public.mp_stores
  add column if not exists brand_code text,
  add column if not exists metadata jsonb;

create index if not exists profiles_brand_code_idx
  on public.profiles(brand_code)
  where brand_code is not null;
create index if not exists mp_companies_brand_code_idx
  on public.mp_companies(brand_code, status)
  where brand_code is not null;
create index if not exists mp_stores_brand_code_idx
  on public.mp_stores(brand_code, status)
  where brand_code is not null;

create table if not exists public.voice_training_packs (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null,
  pack_id text not null,
  title text not null,
  version text not null default 'v1',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_code, pack_id)
);

create table if not exists public.voice_training_tasks (
  id text primary key,
  brand_code text not null,
  pack_id text not null,
  day_index integer not null,
  title text not null,
  focus text not null default '',
  customer_persona_json jsonb not null default '{}'::jsonb,
  visible_goal_json jsonb not null default '[]'::jsonb,
  live_notes_template text not null default '',
  must_cover_points_json jsonb not null default '[]'::jsonb,
  forbidden_phrases_json jsonb not null default '[]'::jsonb,
  reward_json jsonb not null default '{}'::jsonb,
  rubric_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_code, pack_id, day_index),
  unique (brand_code, pack_id, id)
);

create table if not exists public.voice_training_session_links (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null,
  pack_id text not null,
  task_id text not null,
  session_id uuid not null references public.voice_coach_sessions(id) on delete cascade,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  membership_id uuid references public.mp_account_memberships(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  result_json jsonb,
  stars_total integer not null default 0 check (stars_total >= 0 and stars_total <= 3),
  passed boolean not null default false,
  rubric_version text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id)
);

create table if not exists public.voice_training_progress (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null,
  pack_id text not null,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  membership_id uuid references public.mp_account_memberships(id) on delete set null,
  completed_task_count integer not null default 0 check (completed_task_count >= 0),
  current_task_id text,
  stars_total integer not null default 0 check (stars_total >= 0),
  reward_count integer not null default 0 check (reward_count >= 0),
  progress_json jsonb not null default '{}'::jsonb,
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_code, pack_id, staff_user_id)
);

create table if not exists public.voice_training_rewards (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null,
  pack_id text not null,
  task_id text not null,
  session_id uuid references public.voice_coach_sessions(id) on delete set null,
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  membership_id uuid references public.mp_account_memberships(id) on delete set null,
  reward_type text not null check (reward_type in ('badge', 'gold_line', 'hidden_customer', 'easter_egg', 'certificate')),
  title text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  unlocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (brand_code, pack_id, staff_user_id, task_id, reward_type)
);

create index if not exists voice_training_packs_brand_status_idx
  on public.voice_training_packs(brand_code, status);
create index if not exists voice_training_tasks_pack_day_idx
  on public.voice_training_tasks(brand_code, pack_id, day_index);
create index if not exists voice_training_session_links_staff_idx
  on public.voice_training_session_links(staff_user_id, started_at desc);
create index if not exists voice_training_session_links_company_store_idx
  on public.voice_training_session_links(company_id, store_id, started_at desc);
create index if not exists voice_training_session_links_task_idx
  on public.voice_training_session_links(brand_code, pack_id, task_id, started_at desc);
create index if not exists voice_training_progress_scope_idx
  on public.voice_training_progress(company_id, store_id, updated_at desc);
create index if not exists voice_training_rewards_staff_idx
  on public.voice_training_rewards(staff_user_id, unlocked_at desc);

alter table public.voice_training_packs enable row level security;
alter table public.voice_training_tasks enable row level security;
alter table public.voice_training_session_links enable row level security;
alter table public.voice_training_progress enable row level security;
alter table public.voice_training_rewards enable row level security;

grant select, insert, update, delete on table public.voice_training_packs to service_role;
grant select, insert, update, delete on table public.voice_training_tasks to service_role;
grant select, insert, update, delete on table public.voice_training_session_links to service_role;
grant select, insert, update, delete on table public.voice_training_progress to service_role;
grant select, insert, update, delete on table public.voice_training_rewards to service_role;
grant select on table public.voice_training_session_links to authenticated;
grant select on table public.voice_training_progress to authenticated;
grant select on table public.voice_training_rewards to authenticated;

do $$
begin
  create policy "voice_training_packs_service_role_all"
    on public.voice_training_packs
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_tasks_service_role_all"
    on public.voice_training_tasks
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_session_links_select_own"
    on public.voice_training_session_links
    for select
    to authenticated
    using ((select auth.uid()) = staff_user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_session_links_service_role_all"
    on public.voice_training_session_links
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_progress_select_own"
    on public.voice_training_progress
    for select
    to authenticated
    using ((select auth.uid()) = staff_user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_progress_service_role_all"
    on public.voice_training_progress
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_rewards_select_own"
    on public.voice_training_rewards
    for select
    to authenticated
    using ((select auth.uid()) = staff_user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "voice_training_rewards_service_role_all"
    on public.voice_training_rewards
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

comment on column public.mp_companies.brand_code is
  'Optional brand scope for mini-program feature gating, e.g. baibaitu.';
comment on column public.mp_stores.brand_code is
  'Optional brand scope for mini-program feature gating, e.g. baibaitu.';
comment on table public.voice_training_session_links is
  'Links a voice-coach session to a branded training task for progress and rewards.';
comment on table public.voice_training_progress is
  'Per-staff branded voice training progress snapshot.';

commit;
