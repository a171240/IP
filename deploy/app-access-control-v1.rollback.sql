begin;

do $$
begin
  if
    exists (select 1 from public.app_canonical_users limit 1)
    or exists (select 1 from public.app_auth_identities limit 1)
    or exists (select 1 from public.app_identity_links limit 1)
    or exists (select 1 from public.app_identity_reviews limit 1)
    or exists (select 1 from public.app_verified_contacts limit 1)
    or exists (select 1 from public.app_personal_trials limit 1)
    or exists (select 1 from public.app_authorization_versions limit 1)
    or exists (select 1 from public.app_authorization_audit_events limit 1)
    or exists (select 1 from public.app_idempotency_records limit 1)
    or exists (select 1 from public.app_membership_entitlements limit 1)
    or exists (select 1 from public.app_personal_trial_voice_evidence limit 1)
    or exists (
      select 1
      from public.mp_account_memberships
      where canonical_user_id is not null
        or access_source is not null
        or authorization_version <> 0
      limit 1
    )
    or exists (
      select 1
      from public.voice_coach_sessions
      where canonical_user_id is not null
        or data_domain <> 'store'
        or client_session_id is not null
        or client_request_hash is not null
        or trial_reservation_status is not null
        or trial_reserved_at is not null
        or trial_reservation_expires_at is not null
        or trial_consumed_at is not null
        or trial_completion_event_id is not null
        or trial_completion_event_hash is not null
        or trial_round_1_evidence is not null
        or trial_released_at is not null
        or trial_release_reason is not null
      limit 1
    )
  then
    raise exception
      'app_access_control_v1_rollback_blocked_business_data: use a reviewed compensating migration';
  end if;
end
$$;

drop index if exists public.voice_coach_canonical_domain_created_idx;
drop index if exists public.voice_coach_trial_completion_event_idx;
drop index if exists public.voice_coach_trial_client_session_idx;

drop table if exists public.app_personal_trial_voice_evidence;

alter table public.voice_coach_sessions
  drop constraint if exists voice_coach_sessions_domain_scope_check,
  drop column if exists trial_release_reason,
  drop column if exists trial_released_at,
  drop column if exists trial_round_1_evidence,
  drop column if exists trial_completion_event_hash,
  drop column if exists trial_completion_event_id,
  drop column if exists trial_consumed_at,
  drop column if exists trial_reservation_expires_at,
  drop column if exists trial_reserved_at,
  drop column if exists trial_reservation_status,
  drop column if exists client_request_hash,
  drop column if exists client_session_id,
  drop column if exists data_domain,
  drop column if exists canonical_user_id;

drop index if exists public.app_membership_entitlements_canonical_idx;
drop table if exists public.app_membership_entitlements;

drop index if exists public.mp_memberships_canonical_store_scope_idx;
drop index if exists public.mp_memberships_canonical_company_scope_idx;

alter table public.mp_account_memberships
  drop column if exists authorization_version,
  drop column if exists access_source,
  drop column if exists canonical_user_id;

drop table if exists public.app_idempotency_records;
drop trigger if exists app_verified_contacts_mark_ambiguity
  on public.app_verified_contacts;
drop function if exists public.app_verified_contacts_mark_ambiguity();
drop table if exists public.app_authorization_audit_events;
drop table if exists public.app_authorization_versions;
drop table if exists public.app_personal_trials;
drop table if exists public.app_verified_contacts;
drop table if exists public.app_identity_reviews;
drop table if exists public.app_identity_links;
drop table if exists public.app_auth_identities;
drop table if exists public.app_canonical_users;

commit;
