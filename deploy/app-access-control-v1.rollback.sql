begin;

drop index if exists public.voice_coach_canonical_domain_created_idx;
drop index if exists public.voice_coach_trial_client_session_idx;

alter table public.voice_coach_sessions
  drop column if exists client_request_hash,
  drop column if exists client_session_id,
  drop column if exists data_domain,
  drop column if exists canonical_user_id;

drop index if exists public.entitlements_canonical_user_idx;

alter table public.entitlements
  drop column if exists grant_source,
  drop column if exists granted_by_user_id,
  drop column if exists authorization_version,
  drop column if exists feature_keys,
  drop column if exists status,
  drop column if exists canonical_user_id;

drop index if exists public.mp_memberships_canonical_store_scope_idx;
drop index if exists public.mp_memberships_canonical_company_scope_idx;

alter table public.mp_account_memberships
  drop column if exists authorization_version,
  drop column if exists access_source,
  drop column if exists canonical_user_id;

drop table if exists public.app_idempotency_records;
drop table if exists public.app_authorization_audit_events;
drop table if exists public.app_authorization_versions;
drop table if exists public.app_personal_trials;
drop table if exists public.app_verified_contacts;
drop table if exists public.app_identity_links;
drop table if exists public.app_auth_identities;
drop table if exists public.app_canonical_users;

commit;
