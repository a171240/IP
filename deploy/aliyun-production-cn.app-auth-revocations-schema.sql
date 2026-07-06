-- Local schema contract for App auth logout server-side token revocation.
-- Scope: schema only. Do not place token values, request headers, URLs, or business rows here.

create table if not exists public.app_auth_token_revocations (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  auth_source text not null check (auth_source in ('aliyun_test_login', 'supabase')),
  user_id uuid not null,
  device_id text,
  revoked_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_auth_token_revocations_active_lookup_idx
  on public.app_auth_token_revocations (token_hash, auth_source, user_id)
  where expires_at is null;

create index if not exists app_auth_token_revocations_expiring_lookup_idx
  on public.app_auth_token_revocations (expires_at, token_hash)
  where expires_at is not null;

create index if not exists app_auth_token_revocations_revoked_at_idx
  on public.app_auth_token_revocations (revoked_at);
