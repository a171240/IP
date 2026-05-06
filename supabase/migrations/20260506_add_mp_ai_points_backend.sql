begin;

alter table public.profiles
  add column if not exists account_role text not null default 'merchant_owner',
  add column if not exists company_id uuid,
  add column if not exists company_name text,
  add column if not exists store_id uuid,
  add column if not exists store_name text,
  add column if not exists service_plan_label text;

comment on column public.profiles.credits_balance is
  'Compatibility wallet. Mini-program backend presents this value as ai_points_balance.';
comment on column public.profiles.account_role is
  'Mini-program account role: company_owner/company_admin/merchant_owner/store_owner/store_admin/staff/service_operator.';

create table if not exists public.mp_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mp_stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.mp_companies(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mp_account_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.mp_companies(id) on delete cascade,
  store_id uuid references public.mp_stores(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, store_id, role)
);

create table if not exists public.mp_ai_point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_role text,
  company_id uuid,
  store_id uuid,
  action_code text not null,
  action_title text,
  page_path text,
  business_object_type text,
  business_object_id text,
  delta integer not null,
  balance_after integer,
  status text not null default 'succeeded'
    check (status in ('succeeded', 'refunded', 'blocked', 'quoted')),
  reason text,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  audio_seconds numeric,
  image_count integer,
  provider_cost_cents integer,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mp_account_memberships_user_idx
  on public.mp_account_memberships(user_id, status);
create index if not exists mp_account_memberships_company_idx
  on public.mp_account_memberships(company_id, status);
create index if not exists mp_stores_company_idx
  on public.mp_stores(company_id, status);
create index if not exists mp_ai_point_ledger_user_created_idx
  on public.mp_ai_point_ledger(user_id, created_at desc);
create index if not exists mp_ai_point_ledger_action_created_idx
  on public.mp_ai_point_ledger(action_code, created_at desc);
create index if not exists mp_ai_point_ledger_company_store_idx
  on public.mp_ai_point_ledger(company_id, store_id, created_at desc);

alter table public.mp_companies enable row level security;
alter table public.mp_stores enable row level security;
alter table public.mp_account_memberships enable row level security;
alter table public.mp_ai_point_ledger enable row level security;

do $$
begin
  create policy "mp_companies_select_member"
    on public.mp_companies
    for select
    to authenticated
    using (
      owner_user_id = auth.uid()
      or exists (
        select 1
        from public.mp_account_memberships m
        where m.company_id = mp_companies.id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "mp_stores_select_member"
    on public.mp_stores
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.mp_account_memberships m
        where m.company_id = mp_stores.company_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "mp_memberships_select_own"
    on public.mp_account_memberships
    for select
    to authenticated
    using (user_id = auth.uid());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "mp_ai_point_ledger_select_own"
    on public.mp_ai_point_ledger
    for select
    to authenticated
    using (user_id = auth.uid());
exception
  when duplicate_object then null;
end $$;

comment on table public.mp_ai_point_ledger is
  'Mini-program AI point spend/refund/block ledger. Authoritative balance remains profiles.credits_balance for compatibility.';

commit;
