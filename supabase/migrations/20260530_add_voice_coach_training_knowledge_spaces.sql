create extension if not exists "pgcrypto";

create table if not exists public.voice_coach_knowledge_spaces (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  code text not null default '',
  display_name text not null,
  type text not null default 'store_custom'
    check (type in ('common_generic', 'brand_template', 'store_custom')),
  company_id uuid references public.mp_companies(id) on delete cascade,
  store_id uuid references public.mp_stores(id) on delete cascade,
  brand_code text,
  default_pack_id text not null default '',
  training_pack_mode text not null default 'common-generic',
  version text not null default 'v1',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists voice_coach_knowledge_spaces_company_idx
  on public.voice_coach_knowledge_spaces(company_id, status, created_at desc);

create index if not exists voice_coach_knowledge_spaces_store_idx
  on public.voice_coach_knowledge_spaces(store_id, status, created_at desc);

create index if not exists voice_coach_knowledge_spaces_type_idx
  on public.voice_coach_knowledge_spaces(type, status);

create table if not exists public.voice_coach_training_packs (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  knowledge_space_id text not null references public.voice_coach_knowledge_spaces(id) on delete cascade,
  title text not null,
  subtitle text not null default '',
  brand_code text,
  training_pack_mode text not null default 'common-generic',
  version text not null default 'v1',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  tasks_json jsonb not null default '[]'::jsonb
);

create index if not exists voice_coach_training_packs_space_idx
  on public.voice_coach_training_packs(knowledge_space_id, status, created_at desc);

create table if not exists public.voice_coach_training_progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null,
  company_id uuid references public.mp_companies(id) on delete set null,
  store_id uuid references public.mp_stores(id) on delete set null,
  membership_id uuid references public.mp_account_memberships(id) on delete set null,
  knowledge_space_id text not null,
  pack_id text not null,
  current_task_id text not null default '',
  completed_task_ids jsonb not null default '{}'::jsonb,
  progress_json jsonb not null default '{}'::jsonb,
  last_completed_at timestamptz
);

create unique index if not exists voice_coach_training_progress_user_space_pack_key
  on public.voice_coach_training_progress(user_id, knowledge_space_id, pack_id);

create index if not exists voice_coach_training_progress_company_idx
  on public.voice_coach_training_progress(company_id, updated_at desc);

create index if not exists voice_coach_training_progress_store_idx
  on public.voice_coach_training_progress(store_id, updated_at desc);

alter table public.voice_coach_knowledge_spaces enable row level security;
alter table public.voice_coach_training_packs enable row level security;
alter table public.voice_coach_training_progress enable row level security;

create policy "voice_coach_knowledge_spaces_select_scoped"
  on public.voice_coach_knowledge_spaces
  for select
  to authenticated
  using (
    status = 'active'
    and (
      type = 'common_generic'
      or exists (
        select 1
        from public.mp_account_memberships m
        where m.user_id = auth.uid()
          and m.status = 'active'
          and (
            (voice_coach_knowledge_spaces.store_id is not null and m.store_id = voice_coach_knowledge_spaces.store_id)
            or (
              voice_coach_knowledge_spaces.store_id is null
              and voice_coach_knowledge_spaces.company_id is not null
              and m.company_id = voice_coach_knowledge_spaces.company_id
            )
          )
      )
    )
  );

create policy "voice_coach_knowledge_spaces_service_role_all"
  on public.voice_coach_knowledge_spaces
  for all
  to service_role
  using (true)
  with check (true);

create policy "voice_coach_training_packs_select_scoped"
  on public.voice_coach_training_packs
  for select
  to authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.voice_coach_knowledge_spaces ks
      where ks.id = knowledge_space_id
        and ks.status = 'active'
        and (
          ks.type = 'common_generic'
          or exists (
            select 1
            from public.mp_account_memberships m
            where m.user_id = auth.uid()
              and m.status = 'active'
              and (
                (ks.store_id is not null and m.store_id = ks.store_id)
                or (
                  ks.store_id is null
                  and ks.company_id is not null
                  and m.company_id = ks.company_id
                )
              )
          )
        )
    )
  );

create policy "voice_coach_training_packs_service_role_all"
  on public.voice_coach_training_packs
  for all
  to service_role
  using (true)
  with check (true);

create policy "voice_coach_training_progress_select_own"
  on public.voice_coach_training_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "voice_coach_training_progress_insert_own"
  on public.voice_coach_training_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "voice_coach_training_progress_update_own"
  on public.voice_coach_training_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "voice_coach_training_progress_service_role_all"
  on public.voice_coach_training_progress
  for all
  to service_role
  using (true)
  with check (true);
