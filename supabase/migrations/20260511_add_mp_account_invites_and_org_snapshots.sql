begin;

alter table public.mp_account_memberships
  add column if not exists display_name text,
  add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists metadata jsonb;

create table if not exists public.mp_account_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.mp_companies(id) on delete cascade,
  store_id uuid references public.mp_stores(id) on delete cascade,
  role text not null check (
    role in (
      'company_owner',
      'company_admin',
      'merchant_owner',
      'merchant_admin',
      'store_owner',
      'store_admin',
      'staff',
      'employee',
      'service_operator'
    )
  ),
  token_hash text not null unique,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  max_uses integer not null default 1 check (max_uses > 0 and max_uses <= 200),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  note text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.voice_coach_sessions
  add column if not exists company_id uuid references public.mp_companies(id) on delete set null,
  add column if not exists store_id uuid references public.mp_stores(id) on delete set null,
  add column if not exists membership_id uuid references public.mp_account_memberships(id) on delete set null;

create index if not exists mp_account_memberships_scope_idx
  on public.mp_account_memberships(company_id, store_id, status);
create index if not exists mp_account_memberships_role_idx
  on public.mp_account_memberships(role, status);
create unique index if not exists mp_account_memberships_company_unique_idx
  on public.mp_account_memberships(user_id, company_id, role)
  where store_id is null;
create unique index if not exists mp_account_memberships_store_unique_idx
  on public.mp_account_memberships(user_id, company_id, store_id, role)
  where store_id is not null;
create index if not exists mp_account_invites_token_hash_idx
  on public.mp_account_invites(token_hash);
create index if not exists mp_account_invites_company_idx
  on public.mp_account_invites(company_id, status, expires_at desc);
create index if not exists mp_account_invites_store_idx
  on public.mp_account_invites(store_id, status, expires_at desc);
create index if not exists voice_coach_sessions_company_started_idx
  on public.voice_coach_sessions(company_id, started_at desc);
create index if not exists voice_coach_sessions_store_started_idx
  on public.voice_coach_sessions(store_id, started_at desc);
create index if not exists voice_coach_sessions_membership_started_idx
  on public.voice_coach_sessions(membership_id, started_at desc);

alter table public.mp_account_invites enable row level security;

comment on table public.mp_account_invites is
  'Mini-program account invitation links. Raw tokens are never stored; only token_hash is persisted.';
comment on column public.voice_coach_sessions.company_id is
  'Organization snapshot captured when a mini-program voice coach session starts.';
comment on column public.voice_coach_sessions.store_id is
  'Store snapshot captured when a mini-program voice coach session starts.';
comment on column public.voice_coach_sessions.membership_id is
  'Membership snapshot captured when a mini-program voice coach session starts.';

commit;
