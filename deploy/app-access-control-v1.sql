begin;

create extension if not exists "pgcrypto";

do $$
begin
  if
    to_regclass('public.app_canonical_users') is not null
    or to_regclass('public.app_auth_identities') is not null
    or to_regclass('public.app_identity_links') is not null
    or to_regclass('public.app_verified_contacts') is not null
    or to_regclass('public.app_personal_trials') is not null
    or to_regclass('public.app_authorization_versions') is not null
    or to_regclass('public.app_authorization_audit_events') is not null
    or to_regclass('public.app_idempotency_records') is not null
  then
    raise exception 'app_access_control_v1_schema_conflict: owned table already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name = 'mp_account_memberships'
          and column_name in (
            'canonical_user_id',
            'access_source',
            'authorization_version'
          )
        )
        or (
          table_name = 'entitlements'
          and column_name in (
            'canonical_user_id',
            'status',
            'feature_keys',
            'authorization_version',
            'granted_by_user_id',
            'grant_source'
          )
        )
        or (
          table_name = 'voice_coach_sessions'
          and column_name in (
            'canonical_user_id',
            'data_domain',
            'client_session_id',
            'client_request_hash'
          )
        )
      )
  ) then
    raise exception 'app_access_control_v1_schema_conflict: owned column already exists';
  end if;
end
$$;

create table public.app_canonical_users (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'merged')),
  merged_into_canonical_user_id uuid
    references public.app_canonical_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'merged' and merged_into_canonical_user_id is not null)
    or (status <> 'merged' and merged_into_canonical_user_id is null)
  )
);

create table public.app_auth_identities (
  id uuid primary key default gen_random_uuid(),
  canonical_user_id uuid not null
    references public.app_canonical_users(id) on delete restrict,
  app_user_id uuid not null,
  provider text not null,
  provider_app_id text not null,
  subject text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_user_id),
  unique (provider, provider_app_id, subject)
);

create table public.app_identity_links (
  id uuid primary key default gen_random_uuid(),
  canonical_user_id uuid not null
    references public.app_canonical_users(id) on delete restrict,
  link_type text not null check (link_type in ('wechat_unionid')),
  issuer text not null,
  subject text not null,
  created_at timestamptz not null default now(),
  unique (link_type, issuer, subject)
);

create table public.app_verified_contacts (
  id uuid primary key default gen_random_uuid(),
  canonical_user_id uuid not null
    references public.app_canonical_users(id) on delete restrict,
  contact_type text not null check (contact_type in ('phone')),
  normalized_value_hash text not null,
  encrypted_value text not null,
  verified_at timestamptz not null,
  verification_source text not null,
  status text not null default 'verified'
    check (status in ('verified', 'revoked', 'conflict')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_user_id, contact_type, normalized_value_hash)
);

create unique index app_verified_contacts_active_value_idx
  on public.app_verified_contacts(contact_type, normalized_value_hash)
  where status = 'verified';

create table public.app_personal_trials (
  canonical_user_id uuid primary key
    references public.app_canonical_users(id) on delete restrict,
  trial_kind text not null default 'personal_trial',
  data_domain text not null default 'personal_trial',
  session_limit integer not null default 2 check (session_limit = 2),
  sessions_used integer not null default 0
    check (sessions_used >= 0 and sessions_used <= session_limit),
  status text not null default 'active'
    check (status in ('active', 'exhausted', 'suspended', 'revoked')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_kind = 'personal_trial'),
  check (data_domain = 'personal_trial')
);

create table public.app_authorization_versions (
  canonical_user_id uuid primary key
    references public.app_canonical_users(id) on delete restrict,
  authorization_version bigint not null default 0 check (authorization_version >= 0),
  updated_at timestamptz not null default now()
);

create table public.app_authorization_audit_events (
  id uuid primary key default gen_random_uuid(),
  canonical_user_id uuid
    references public.app_canonical_users(id) on delete restrict,
  actor_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  request_id text,
  before_json jsonb,
  after_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index app_authorization_audit_canonical_created_idx
  on public.app_authorization_audit_events(canonical_user_id, created_at desc);

create table public.app_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  operation_scope text not null,
  actor_key text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (operation_scope, actor_key, idempotency_key)
);

alter table public.mp_account_memberships
  add column canonical_user_id uuid
    references public.app_canonical_users(id) on delete restrict,
  add column access_source text,
  add column authorization_version bigint not null default 0;

create unique index mp_memberships_canonical_company_scope_idx
  on public.mp_account_memberships(canonical_user_id, company_id)
  where canonical_user_id is not null and store_id is null;

create unique index mp_memberships_canonical_store_scope_idx
  on public.mp_account_memberships(canonical_user_id, company_id, store_id)
  where canonical_user_id is not null and store_id is not null;

alter table public.entitlements
  add column canonical_user_id uuid
    references public.app_canonical_users(id) on delete restrict,
  add column status text not null default 'active',
  add column feature_keys text[] not null default '{}'::text[],
  add column authorization_version bigint not null default 0,
  add column granted_by_user_id uuid,
  add column grant_source text;

create unique index entitlements_canonical_user_idx
  on public.entitlements(canonical_user_id)
  where canonical_user_id is not null;

alter table public.voice_coach_sessions
  add column canonical_user_id uuid
    references public.app_canonical_users(id) on delete restrict,
  add column data_domain text not null default 'store'
    check (data_domain in ('store', 'personal_trial')),
  add column client_session_id text,
  add column client_request_hash text;

create unique index voice_coach_trial_client_session_idx
  on public.voice_coach_sessions(canonical_user_id, client_session_id)
  where data_domain = 'personal_trial' and client_session_id is not null;

create index voice_coach_canonical_domain_created_idx
  on public.voice_coach_sessions(canonical_user_id, data_domain, created_at desc);

comment on table public.app_canonical_users is
  'Stable account root. Authentication identities, verified contacts, trials, memberships and entitlements remain separate.';
comment on table public.app_verified_contacts is
  'Verified contacts store a lookup hash plus encrypted value; they are recovery evidence only and never implicitly create a membership or entitlement.';
comment on column public.voice_coach_sessions.data_domain is
  'store is tenant data; personal_trial is isolated demo data with no company/store/membership scope.';

commit;
