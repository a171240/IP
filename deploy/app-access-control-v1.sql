begin;

create extension if not exists "pgcrypto";

do $$
begin
  if
    to_regclass('public.app_canonical_users') is not null
    or to_regclass('public.app_auth_identities') is not null
    or to_regclass('public.app_identity_links') is not null
    or to_regclass('public.app_identity_reviews') is not null
    or to_regclass('public.app_verified_contacts') is not null
    or to_regclass('public.app_personal_trials') is not null
    or to_regclass('public.app_authorization_versions') is not null
    or to_regclass('public.app_authorization_audit_events') is not null
    or to_regclass('public.app_idempotency_records') is not null
    or to_regclass('public.app_membership_entitlements') is not null
    or to_regclass('public.app_personal_trial_voice_evidence') is not null
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
          table_name = 'voice_coach_sessions'
          and column_name in (
            'canonical_user_id',
            'data_domain',
            'client_session_id',
            'client_request_hash',
            'trial_reservation_status',
            'trial_reserved_at',
            'trial_reservation_expires_at',
            'trial_consumed_at',
            'trial_completion_event_id',
            'trial_completion_event_hash',
            'trial_round_1_evidence',
            'trial_released_at',
            'trial_release_reason'
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

create table public.app_identity_reviews (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null unique,
  existing_canonical_user_id uuid not null
    references public.app_canonical_users(id) on delete restrict,
  candidate_canonical_user_id uuid not null
    references public.app_canonical_users(id) on delete restrict,
  reason text not null check (
    reason in ('trusted_identity_conflict', 'verified_phone_ambiguous')
  ),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  trusted_identity_fingerprint text not null,
  resolution_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  )
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

create index app_verified_contacts_active_value_idx
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

create function public.app_verified_contacts_mark_ambiguity()
returns trigger
language plpgsql
as $$
declare
  affected_canonical_user_id uuid;
  affected_count integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      new.contact_type || ':' || new.normalized_value_hash,
      0
    )
  );

  select count(distinct candidate.canonical_user_id)::integer
  into affected_count
  from (
    select contact.canonical_user_id
    from public.app_verified_contacts contact
    where contact.contact_type = new.contact_type
      and contact.normalized_value_hash = new.normalized_value_hash
      and contact.status in ('verified', 'conflict')
      and contact.id <> new.id
    union
    select new.canonical_user_id
  ) candidate;

  if affected_count <= 1 then
    return new;
  end if;

  update public.app_verified_contacts
  set status = 'conflict', updated_at = now()
  where contact_type = new.contact_type
    and normalized_value_hash = new.normalized_value_hash
    and status = 'verified'
    and id <> new.id;

  new.status := 'conflict';
  new.updated_at := now();

  for affected_canonical_user_id in
    select contact.canonical_user_id
    from public.app_verified_contacts contact
    where contact.contact_type = new.contact_type
      and contact.normalized_value_hash = new.normalized_value_hash
      and contact.status = 'conflict'
      and contact.id <> new.id
    union
    select new.canonical_user_id
  loop
    insert into public.app_authorization_audit_events (
      canonical_user_id,
      action,
      target_type,
      target_id,
      metadata
    )
    values (
      affected_canonical_user_id,
      'verified_phone.ambiguous',
      'verified_contact',
      null,
      jsonb_build_object(
        'contact_type', new.contact_type,
        'candidate_count', affected_count
      )
    );
  end loop;

  return new;
end
$$;

create trigger app_verified_contacts_mark_ambiguity
before insert or update of contact_type, normalized_value_hash, status
on public.app_verified_contacts
for each row
when (new.status = 'verified')
execute function public.app_verified_contacts_mark_ambiguity();

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

create table public.app_membership_entitlements (
  membership_id uuid primary key
    references public.mp_account_memberships(id) on delete restrict,
  canonical_user_id uuid not null
    references public.app_canonical_users(id) on delete restrict,
  plan text not null check (plan in ('free', 'basic', 'pro', 'vip')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'revoked', 'expired')),
  feature_keys text[] not null default '{}'::text[],
  authorization_version bigint not null default 0
    check (authorization_version >= 0),
  granted_by_user_id uuid,
  grant_source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_membership_entitlements_canonical_idx
  on public.app_membership_entitlements(canonical_user_id, updated_at desc);

alter table public.voice_coach_sessions
  add column canonical_user_id uuid
    references public.app_canonical_users(id) on delete restrict,
  add column data_domain text not null default 'store'
    check (data_domain in ('store', 'personal_trial')),
  add column client_session_id text,
  add column client_request_hash text,
  add column trial_reservation_status text
    check (trial_reservation_status in ('reserved', 'consumed', 'released', 'expired')),
  add column trial_reserved_at timestamptz,
  add column trial_reservation_expires_at timestamptz,
  add column trial_consumed_at timestamptz,
  add column trial_completion_event_id text,
  add column trial_completion_event_hash text,
  add column trial_round_1_evidence jsonb,
  add column trial_released_at timestamptz,
  add column trial_release_reason text
    check (
      trial_release_reason in (
        'opening_tts_failed',
        'recording_receive_failed',
        'asr_failed',
        'next_turn_tts_failed',
        'reservation_expired'
      )
    );

alter table public.voice_coach_sessions
  add constraint voice_coach_sessions_domain_scope_check
  check (
    (
      data_domain = 'personal_trial'
      and canonical_user_id is not null
      and company_id is null
      and store_id is null
      and membership_id is null
      and trial_reservation_status is not null
      and trial_reserved_at is not null
      and trial_reservation_expires_at is not null
      and trial_reservation_expires_at > trial_reserved_at
      and (
        (
          trial_reservation_status = 'reserved'
          and trial_consumed_at is null
          and trial_completion_event_id is null
          and trial_completion_event_hash is null
          and trial_round_1_evidence is null
          and trial_released_at is null
          and trial_release_reason is null
        )
        or (
          trial_reservation_status = 'consumed'
          and trial_consumed_at is not null
          and trial_completion_event_id is not null
          and trial_completion_event_hash is not null
          and trial_round_1_evidence is not null
          and trial_released_at is null
          and trial_release_reason is null
        )
        or (
          trial_reservation_status = 'released'
          and trial_consumed_at is null
          and trial_completion_event_id is null
          and trial_completion_event_hash is null
          and trial_round_1_evidence is null
          and trial_released_at is not null
          and trial_release_reason in (
            'opening_tts_failed',
            'recording_receive_failed',
            'asr_failed',
            'next_turn_tts_failed'
          )
        )
        or (
          trial_reservation_status = 'expired'
          and trial_consumed_at is null
          and trial_completion_event_id is null
          and trial_completion_event_hash is null
          and trial_round_1_evidence is null
          and trial_released_at is not null
          and trial_release_reason = 'reservation_expired'
        )
      )
    )
    or (
      data_domain = 'store'
      and company_id is not null
      and store_id is not null
      and membership_id is not null
      and trial_reservation_status is null
      and trial_reserved_at is null
      and trial_reservation_expires_at is null
      and trial_consumed_at is null
      and trial_completion_event_id is null
      and trial_completion_event_hash is null
      and trial_round_1_evidence is null
      and trial_released_at is null
      and trial_release_reason is null
    )
  ) not valid;

create table public.app_personal_trial_voice_evidence (
  session_id uuid not null
    references public.voice_coach_sessions(id) on delete restrict,
  evidence_stage text not null
    check (
      evidence_stage in (
        'opening_tts_ready',
        'recording_received',
        'asr_succeeded',
        'next_turn_tts_ready'
      )
    ),
  evidence_id text not null
    check (length(evidence_id) between 1 and 200),
  recorded_at timestamptz not null default now(),
  primary key (session_id, evidence_stage)
);

create unique index voice_coach_trial_client_session_idx
  on public.voice_coach_sessions(canonical_user_id, client_session_id)
  where data_domain = 'personal_trial' and client_session_id is not null;

create unique index voice_coach_trial_completion_event_idx
  on public.voice_coach_sessions(trial_completion_event_id)
  where trial_completion_event_id is not null;

create index voice_coach_canonical_domain_created_idx
  on public.voice_coach_sessions(canonical_user_id, data_domain, created_at desc);

comment on table public.app_canonical_users is
  'Stable account root. Authentication identities, verified contacts, trials, memberships and entitlements remain separate.';
comment on table public.app_verified_contacts is
  'Verified contacts store a lookup hash plus encrypted value; they are recovery evidence only and never implicitly create a membership or entitlement.';
comment on column public.voice_coach_sessions.data_domain is
  'store is tenant data; personal_trial is isolated demo data with no company/store/membership scope.';
comment on table public.app_personal_trial_voice_evidence is
  'Server-only immutable evidence stages. A completion event may consume a trial only after all four rows exist for one session.';

commit;
