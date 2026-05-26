begin;

create extension if not exists "pgcrypto";

create table if not exists public.mp_knowledge_spaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  brand_code text not null,
  default_pack_id text,
  scope_type text not null default 'brand' check (scope_type in ('brand', 'company', 'store', 'demo')),
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  feature_flags jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mp_knowledge_space_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_space_id uuid not null references public.mp_knowledge_spaces(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'demo_operator', 'operator', 'admin')),
  status text not null default 'active' check (status in ('active', 'inactive', 'revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, knowledge_space_id)
);

alter table public.voice_coach_sessions
  add column if not exists knowledge_space_id uuid references public.mp_knowledge_spaces(id) on delete set null;

alter table public.voice_training_session_links
  add column if not exists knowledge_space_id uuid references public.mp_knowledge_spaces(id) on delete set null;

alter table public.voice_training_progress
  add column if not exists knowledge_space_id uuid references public.mp_knowledge_spaces(id) on delete set null;

alter table public.voice_training_rewards
  add column if not exists knowledge_space_id uuid references public.mp_knowledge_spaces(id) on delete set null;

alter table public.voice_training_progress
  drop constraint if exists voice_training_progress_brand_code_pack_id_staff_user_id_key;

alter table public.voice_training_rewards
  drop constraint if exists voice_training_rewards_brand_code_pack_id_staff_user_id_task_id_reward_type_key;

do $$
begin
  alter table public.voice_training_progress
    add constraint voice_training_progress_space_pack_staff_unique
    unique (knowledge_space_id, pack_id, staff_user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.voice_training_rewards
    add constraint voice_training_rewards_space_pack_staff_task_type_unique
    unique (knowledge_space_id, pack_id, staff_user_id, task_id, reward_type);
exception when duplicate_object then null;
end $$;

create index if not exists mp_knowledge_spaces_status_sort_idx
  on public.mp_knowledge_spaces(status, sort_order, display_name);
create index if not exists mp_knowledge_spaces_brand_pack_idx
  on public.mp_knowledge_spaces(brand_code, default_pack_id)
  where status = 'active';
create index if not exists mp_knowledge_space_access_user_status_idx
  on public.mp_knowledge_space_access(user_id, status, expires_at);
create index if not exists mp_knowledge_space_access_space_idx
  on public.mp_knowledge_space_access(knowledge_space_id, status);
create index if not exists voice_coach_sessions_knowledge_space_started_idx
  on public.voice_coach_sessions(knowledge_space_id, started_at desc);
create index if not exists voice_training_session_links_space_staff_idx
  on public.voice_training_session_links(knowledge_space_id, staff_user_id, started_at desc);
create index if not exists voice_training_progress_space_staff_idx
  on public.voice_training_progress(knowledge_space_id, staff_user_id, updated_at desc);
create index if not exists voice_training_rewards_space_staff_idx
  on public.voice_training_rewards(knowledge_space_id, staff_user_id, unlocked_at desc);

alter table public.mp_knowledge_spaces enable row level security;
alter table public.mp_knowledge_space_access enable row level security;

grant select, insert, update, delete on table public.mp_knowledge_spaces to service_role;
grant select, insert, update, delete on table public.mp_knowledge_space_access to service_role;
grant select on table public.mp_knowledge_spaces to authenticated;
grant select on table public.mp_knowledge_space_access to authenticated;

do $$
begin
  create policy "mp_knowledge_spaces_select_access"
    on public.mp_knowledge_spaces
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.mp_knowledge_space_access access
        where access.knowledge_space_id = mp_knowledge_spaces.id
          and access.user_id = (select auth.uid())
          and access.status = 'active'
          and (access.expires_at is null or access.expires_at > now())
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "mp_knowledge_spaces_service_role_all"
    on public.mp_knowledge_spaces
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "mp_knowledge_space_access_select_own"
    on public.mp_knowledge_space_access
    for select
    to authenticated
    using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "mp_knowledge_space_access_service_role_all"
    on public.mp_knowledge_space_access
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

insert into public.mp_knowledge_spaces (
  code,
  display_name,
  brand_code,
  default_pack_id,
  scope_type,
  status,
  feature_flags,
  metadata_json,
  sort_order
) values
  (
    'baibaitu',
    '白白兔',
    'baibaitu',
    'baibaitu_onboarding_v1',
    'brand',
    'active',
    '{"voice_training": true}'::jsonb,
    '{"subtitle": "白白兔新人训练营"}'::jsonb,
    10
  ),
  (
    'chunshe',
    '椿舍',
    'chunshe',
    'chunshe_onboarding_v1',
    'demo',
    'active',
    '{"voice_training": true}'::jsonb,
    '{"subtitle": "椿舍演示训练营"}'::jsonb,
    20
  )
on conflict (code) do update set
  display_name = excluded.display_name,
  brand_code = excluded.brand_code,
  default_pack_id = excluded.default_pack_id,
  scope_type = excluded.scope_type,
  status = excluded.status,
  feature_flags = excluded.feature_flags,
  metadata_json = public.mp_knowledge_spaces.metadata_json || excluded.metadata_json,
  sort_order = excluded.sort_order,
  updated_at = now();

with baibaitu_space as (
  select id
  from public.mp_knowledge_spaces
  where code = 'baibaitu'
  limit 1
)
update public.voice_training_session_links links
set knowledge_space_id = baibaitu_space.id
from baibaitu_space
where links.knowledge_space_id is null
  and links.brand_code = 'baibaitu';

with baibaitu_space as (
  select id
  from public.mp_knowledge_spaces
  where code = 'baibaitu'
  limit 1
)
update public.voice_training_progress progress
set knowledge_space_id = baibaitu_space.id
from baibaitu_space
where progress.knowledge_space_id is null
  and progress.brand_code = 'baibaitu';

with baibaitu_space as (
  select id
  from public.mp_knowledge_spaces
  where code = 'baibaitu'
  limit 1
)
update public.voice_training_rewards rewards
set knowledge_space_id = baibaitu_space.id
from baibaitu_space
where rewards.knowledge_space_id is null
  and rewards.brand_code = 'baibaitu';

with baibaitu_space as (
  select id
  from public.mp_knowledge_spaces
  where code = 'baibaitu'
  limit 1
)
update public.voice_coach_sessions sessions
set knowledge_space_id = baibaitu_space.id
from baibaitu_space
where sessions.knowledge_space_id is null
  and exists (
    select 1
    from public.voice_training_session_links links
    where links.session_id = sessions.id
      and links.knowledge_space_id = baibaitu_space.id
  );

with baibaitu_space as (
  select id
  from public.mp_knowledge_spaces
  where code = 'baibaitu'
  limit 1
)
update public.voice_coach_sessions sessions
set knowledge_space_id = baibaitu_space.id
from baibaitu_space
where sessions.knowledge_space_id is null
  and (
    sessions.session_context_json ->> 'training_brand_code' = 'baibaitu'
    or sessions.session_context_json #>> '{training_context,brand_code}' = 'baibaitu'
    or sessions.session_context_json #>> '{training_task,brand_code}' = 'baibaitu'
  );

comment on table public.mp_knowledge_spaces is
  'Selectable mini-program knowledge spaces such as Baibaitu, Chunshe, or future demo clients.';
comment on table public.mp_knowledge_space_access is
  'User-to-knowledge-space authorization for demo operators and regular mini-program accounts.';
comment on column public.voice_coach_sessions.knowledge_space_id is
  'Active knowledge space snapshot captured when a voice coach session starts.';
comment on column public.voice_training_progress.knowledge_space_id is
  'Knowledge space scope for per-staff training progress isolation.';

commit;
