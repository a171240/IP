begin;

create table if not exists public.mp_knowledge_spaces (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  display_name text not null,
  brand_code text,
  default_pack_id text,
  scope_type text,
  company_id uuid,
  store_id uuid,
  status text not null default 'active',
  feature_flags jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mp_knowledge_spaces
  add column if not exists code text,
  add column if not exists display_name text,
  add column if not exists brand_code text,
  add column if not exists default_pack_id text,
  add column if not exists scope_type text,
  add column if not exists company_id uuid,
  add column if not exists store_id uuid,
  add column if not exists status text not null default 'active',
  add column if not exists feature_flags jsonb not null default '{}'::jsonb,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists sort_order integer,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists mp_knowledge_spaces_code_unique_idx
  on public.mp_knowledge_spaces(code);
create index if not exists mp_knowledge_spaces_status_sort_idx
  on public.mp_knowledge_spaces(status, sort_order, created_at);
create index if not exists mp_knowledge_spaces_company_idx
  on public.mp_knowledge_spaces(company_id, status);
create index if not exists mp_knowledge_spaces_store_idx
  on public.mp_knowledge_spaces(store_id, status);

create table if not exists public.mp_knowledge_space_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  knowledge_space_id uuid not null,
  role text not null default 'viewer',
  status text not null default 'active',
  expires_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mp_knowledge_space_access
  add column if not exists user_id uuid,
  add column if not exists knowledge_space_id uuid,
  add column if not exists role text not null default 'viewer',
  add column if not exists status text not null default 'active',
  add column if not exists expires_at timestamptz,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists mp_knowledge_space_access_user_space_unique_idx
  on public.mp_knowledge_space_access(user_id, knowledge_space_id);
create index if not exists mp_knowledge_space_access_user_idx
  on public.mp_knowledge_space_access(user_id, status, expires_at);
create index if not exists mp_knowledge_space_access_space_idx
  on public.mp_knowledge_space_access(knowledge_space_id, status);

create table if not exists public.voice_training_packs (
  id uuid primary key default gen_random_uuid(),
  brand_code text not null,
  pack_id text not null,
  title text not null,
  version text,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  tasks_json jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voice_training_packs
  add column if not exists brand_code text,
  add column if not exists pack_id text,
  add column if not exists title text,
  add column if not exists version text,
  add column if not exists status text not null default 'active',
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists tasks_json jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists voice_training_packs_brand_pack_unique_idx
  on public.voice_training_packs(brand_code, pack_id);
create index if not exists voice_training_packs_status_idx
  on public.voice_training_packs(brand_code, status, published_at desc);

comment on table public.mp_knowledge_spaces is
  'App-readable customer and training knowledge spaces for production-cn.';
comment on table public.mp_knowledge_space_access is
  'Per-user access grants for App-readable knowledge spaces.';

commit;
