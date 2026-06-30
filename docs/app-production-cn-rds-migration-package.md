# APP production-cn RDS Migration Package Handoff

- ok: true
- requiredAuthorizationPacket: P11_ALIYUN_RDS_DATA_MIGRATION
- blockedCredentialNames: DATABASE_URL_CN
- containsValues: false
- readOnlyOnly: true
- cloudApiCalled: false
- mutationPerformed: false
- sourceFileCount: 9
- requiredTableCount: 15
- requiredFunctionCount: 0
- requiredStorageCount: 1
- schemaSqlSha256: 5b9f4a99254d682ac0d68cc7b5e2dfaab4ff5445585373af2fd0a2e8b8244f41
- rdsApplyCandidateSqlSha256: 2091ef7975246cfd770883d2ac5b7b3da6b45ee76a82178f7a8e9db18f91a8ab
- validationSqlSha256: 5642494c32ffaf4e9eb8297678c460b79dbd3de1f467f2851949a903961f838d
- rollbackChecklistSha256: f875b86c32714158fdd35121c56ac54b9000fe3689206a9c946dc630c7e0ad20
- blockers: none
- warnings: rds_sql_compatibility_review_required:lib/supabase/schema.sql:extension_review+policy_statement+row_level_security+supabase_auth_schema+supabase_auth_uid, rds_sql_compatibility_review_required:supabase/migrations/20250213_add_activation_requests_and_entitlements.sql:extension_review+policy_statement+row_level_security+supabase_auth_schema+supabase_auth_uid+supabase_service_role, rds_sql_compatibility_review_required:supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql:extension_review+policy_statement+row_level_security+supabase_auth_uid+supabase_service_role, rds_sql_compatibility_review_required:supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql:extension_review+policy_statement+row_level_security+supabase_auth_uid+supabase_service_role+supabase_storage_schema, rds_sql_compatibility_review_required:supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql:extension_review+policy_statement+row_level_security+supabase_auth_uid+supabase_service_role, rds_sql_compatibility_review_required:supabase/migrations/20260506_add_mp_ai_points_backend.sql:extension_review+policy_statement+row_level_security+supabase_auth_schema+supabase_auth_uid, rds_sql_compatibility_review_required:supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql:extension_review+row_level_security+supabase_auth_schema, rds_sql_compatibility_review_required:supabase/migrations/20260511_harden_mp_account_invites_access.sql:policy_statement, rds_sql_compatibility_review_required:supabase/migrations/20260513085315_add_service_record_sessions.sql:extension_review+policy_statement+row_level_security+supabase_auth_schema+supabase_auth_uid+supabase_service_role+supabase_storage_schema
- rdsCompatibilityReviewRequired: true
- rdsCompatibilityFindingCount: 181
- rdsCompatibilityAffectedSourceCount: 9
- schemaApplyCandidateReady: false
- schemaApplyCandidateStatus: blocked_supabase_specific_sql_present
- schemaApplyCandidateFindingCount: 181
- schemaApplyCandidateCategories: extension_review, policy_statement, row_level_security, supabase_auth_schema, supabase_auth_uid, supabase_service_role, supabase_storage_schema
- rdsApplyCandidateReady: true
- rdsApplyCandidateStatus: ready_after_target_rds_engine_confirmation
- rdsApplyCandidateFindingCount: 0
- rdsApplyCandidateCategories: none
- rdsApplyCandidateRemovedStatements: 113
- reviewPlanItemCount: 0
- reviewPlanFindingCount: 0
- reviewPlanResolvedItemCount: 1
- reviewPlanResolvedFindingCount: 22
- targetRdsExtensionSupportConfirmed: true

## Files

- manifest: /tmp/meiye-rds-package-doc-current/rds-migration-package.json
- markdown: /tmp/meiye-rds-package-doc-current/rds-migration-package.md
- schemaSql: /tmp/meiye-rds-package-doc-current/rds-schema.sql
- rdsApplyCandidateSql: /tmp/meiye-rds-package-doc-current/rds-apply-candidate.sql
- validationSql: /tmp/meiye-rds-package-doc-current/rds-validation.sql
- rollbackChecklist: /tmp/meiye-rds-package-doc-current/rds-rollback-checklist.md

## Source Files

- lib/supabase/schema.sql: fd64a33b1d1b8b67ec49aba0732fc0ae2187d786b0cdad67c60e0fb0a5a4a017
- supabase/migrations/20250213_add_activation_requests_and_entitlements.sql: 6c3fbf3309d6c3a4691c4476439c78a74ea0b695bb95554d7d631f3481a9442f
- supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql: 14623a634cc759d9a80af2c898cb78751601e394fd20839d406a73c18cbca3e2
- supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql: f70551ee44276ac0be2ffd7ac9ef70d46f30f0e54b42959492abe28910519f2b
- supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql: 3308366d99d133ecec030eaa6c8c1ef2f1889db9db7fafbe0cbd1aefe859174b
- supabase/migrations/20260506_add_mp_ai_points_backend.sql: 47c3601ac9a546da1e9824ab3fb30c48acb9c3fe18f80da141e470d844fffd45
- supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql: 228b26e164a130edafa6ce544b088f02dab48a25af029e0c98681df49d9b47ed
- supabase/migrations/20260511_harden_mp_account_invites_access.sql: 2efe570c4d98a98b8640c5d5ff7ba578fe5c418f6d362fa04f970c5ae5660cf2
- supabase/migrations/20260513085315_add_service_record_sessions.sql: 6b3b929032010946d363eec0c5bb4130cf68891bd6a487d57c284293e6ecc4f3

## Required Tables

- profiles: source=lib/supabase/schema.sql; capabilities=login_test_token, profile_multi_tenant_permissions; validation=row_count_matches_source, critical_test_user_profile_exists, credits_columns_present
- credit_transactions: source=lib/supabase/schema.sql; capabilities=profile_multi_tenant_permissions; validation=row_count_matches_source, user_credit_ledger_resolves_profile
- entitlements: source=supabase/migrations/20250213_add_activation_requests_and_entitlements.sql; capabilities=login_test_token, profile_multi_tenant_permissions; validation=row_count_matches_source, entitlement_lookup_by_user_id_passes
- mp_companies: source=supabase/migrations/20260506_add_mp_ai_points_backend.sql; capabilities=profile_multi_tenant_permissions, store_invite, store_manager_service_record_read; validation=row_count_matches_source, company_admin_membership_resolves
- mp_stores: source=supabase/migrations/20260506_add_mp_ai_points_backend.sql; capabilities=profile_multi_tenant_permissions, store_invite, service_record_long_recording, store_manager_service_record_read; validation=row_count_matches_source, store_manager_membership_resolves_store
- mp_account_memberships: source=supabase/migrations/20260506_add_mp_ai_points_backend.sql; capabilities=profile_multi_tenant_permissions, store_invite, store_manager_service_record_read; validation=row_count_matches_source, company_scope_and_store_scope_indexes_present, active_memberships_resolve_profile_company_store
- mp_ai_point_ledger: source=supabase/migrations/20260506_add_mp_ai_points_backend.sql; capabilities=profile_multi_tenant_permissions, store_manager_service_record_read; validation=row_count_matches_source, user_company_store_indexes_present, grant_and_consume_credit_ledger_writes_validate
- mp_account_invites: source=supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql; capabilities=store_invite; validation=row_count_matches_source, token_hash_index_present, expired_invite_rejected_by_api_smoke
- store_profiles: source=supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql; capabilities=profile_multi_tenant_permissions; validation=row_count_matches_source, store_profile_owner_crud_smoke_passes
- voice_coach_customer_profiles: source=supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql; capabilities=service_record_long_recording, store_manager_service_record_read; validation=row_count_matches_source, service_record_customer_fk_resolves
- voice_coach_sessions: source=supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql; capabilities=store_manager_service_record_read; validation=row_count_matches_source, company_store_started_indexes_present, store_manager_overview_smoke_passes
- voice_coach_turns: source=supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql; capabilities=store_manager_service_record_read; validation=row_count_matches_source, session_turn_indexes_present, store_manager_member_stats_smoke_passes
- service_record_sessions: source=supabase/migrations/20260513085315_add_service_record_sessions.sql; capabilities=service_record_long_recording, store_manager_service_record_read; validation=row_count_matches_source, unique_user_client_session_key_present, company_store_started_indexes_present
- service_record_segments: source=supabase/migrations/20260513085315_add_service_record_sessions.sql; capabilities=service_record_long_recording, store_manager_service_record_read; validation=row_count_matches_source, unique_session_client_segment_key_present, asr_status_index_present
- service_record_markers: source=supabase/migrations/20260513085315_add_service_record_sessions.sql; capabilities=service_record_long_recording; validation=row_count_matches_source, session_offset_index_present

## Required Functions

- none

## Required Storage

- sourceBucket: delivery-packs; productionCnTarget=Aliyun OSS service-record audio prefix and delivery artifacts if still used by first-version routes; validation=oss_bucket_prefix_ready, ram_sts_policy_minimum_scope_confirmed, signed_upload_download_smoke_passes

## RDS Compatibility Review

- required: true
- appliesTo: schema_sql_before_aliyun_rds_apply
- categories: extension_review, policy_statement, row_level_security, supabase_auth_schema, supabase_auth_uid, supabase_service_role, supabase_storage_schema
- policy: The package can be generated locally, but schema SQL must not be applied to Aliyun RDS until these compatibility findings are reviewed or rewritten.

- extension_review: findings=22, sources=8, action=Confirm the target Aliyun RDS PostgreSQL engine supports the required extension before applying schema SQL.
- policy_statement: findings=56, sources=8, action=Review every Supabase policy statement before applying it to Aliyun RDS.
- row_level_security: findings=23, sources=8, action=Review whether RLS remains enabled on Aliyun RDS or whether the backend repository layer owns tenant authorization.
- supabase_auth_schema: findings=12, sources=5, action=Replace Supabase auth schema references such as auth.users/auth.jwt with APP-owned identity tables or backend auth context before applying to Aliyun RDS.
- supabase_auth_uid: findings=56, sources=7, action=Replace Supabase auth.uid dependent predicates with backend-enforced user or tenant checks before applying to Aliyun RDS.
- supabase_service_role: findings=10, sources=5, action=Replace Supabase service_role grants or policies with Aliyun RDS roles and backend service credentials.
- supabase_storage_schema: findings=2, sources=2, action=Replace Supabase storage schema statements with Aliyun OSS bucket/prefix/RAM/STS evidence and application code checks.

## RDS Schema Apply Candidate Audit

- readyToApplySchema: false
- status: blocked_supabase_specific_sql_present
- findingCount: 181
- categories: extension_review, policy_statement, row_level_security, supabase_auth_schema, supabase_auth_uid, supabase_service_role, supabase_storage_schema
- policy: Do not apply rds-schema.sql to Aliyun RDS while Supabase-specific auth/storage/RLS/policy/service_role SQL remains in the generated candidate.

- extension_review: findings=22, generatedFiles=1, action=Confirm the target Aliyun RDS PostgreSQL engine supports the required extension before applying schema SQL.
- policy_statement: findings=56, generatedFiles=1, action=Review every Supabase policy statement before applying it to Aliyun RDS.
- row_level_security: findings=23, generatedFiles=1, action=Review whether RLS remains enabled on Aliyun RDS or whether the backend repository layer owns tenant authorization.
- supabase_auth_schema: findings=12, generatedFiles=1, action=Replace Supabase auth schema references such as auth.users/auth.jwt with APP-owned identity tables or backend auth context before applying to Aliyun RDS.
- supabase_auth_uid: findings=56, generatedFiles=1, action=Replace Supabase auth.uid dependent predicates with backend-enforced user or tenant checks before applying to Aliyun RDS.
- supabase_service_role: findings=10, generatedFiles=1, action=Replace Supabase service_role grants or policies with Aliyun RDS roles and backend service credentials.
- supabase_storage_schema: findings=2, generatedFiles=1, action=Replace Supabase storage schema statements with Aliyun OSS bucket/prefix/RAM/STS evidence and application code checks.

## RDS Apply Candidate

- readyToApplySchema: true
- status: ready_after_target_rds_engine_confirmation
- findingCount: 0
- categories: none
- removedStatementCount: 113
- rewrittenStatementCount: 9
- rewrittenCategories: supabase_auth_schema
- keptStatementCount: 148
- removalPolicy: Removed statements are not applied to Aliyun RDS; deferred auth.uid() RPC functions and out-of-scope XHS draft statements are excluded from the first-version apply candidate, while rewritten statements move remaining Supabase auth references to APP-owned identity context. Equivalent authorization and object storage boundaries must be enforced by APP API repositories, Aliyun OSS, RAM/STS, and runtime secret env.

- removed:deferred_auth_uid_function:consume_credits: statements=1
- removed:deferred_auth_uid_function:grant_trial_credits: statements=1
- removed:deferred_auth_uid_function:update_profile_public: statements=1
- removed:deferred_out_of_scope_xhs_drafts: statements=12
- removed:policy_statement: statements=70
- removed:row_level_security: statements=23
- removed:supabase_auth_schema: statements=3
- removed:supabase_service_role: statements=10
- removed:supabase_storage_schema: statements=2
- rewritten:supabase_auth_schema: statements=9

## RDS Apply Candidate Review Plan

- status: ready_after_target_rds_engine_confirmation
- readyToApplySchema: true
- itemCount: 0
- findingCount: 0
- categories: none
- requiredWriteBackFields: none
- policy: Close every remaining rds-apply-candidate.sql review item before applying schema SQL to Aliyun RDS.
- closeConditions: Resolved target-engine review items are backed by non-secret Aliyun RDS official extension evidence.; migration.schemaCompatibilityReviewed=true, migration.supabaseSpecificSqlResolved=true, and migration.rdsExtensionSupportConfirmed=true are recorded only after review closure.

### apply-resolved:extension_review

- statusBeforeApply: resolved_by_target_rds_evidence
- findingCount: 22
- affectedSourceCount: 8
- sampleLineNumbers: 60, 76, 95, 110, 132, 156, 180, 254, 305, 340, 345, 364
- sourceSummaries: lib/supabase/schema.sql:7; supabase/migrations/20250213_add_activation_requests_and_entitlements.sql:1; supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql:1; supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql:3; supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql:2; supabase/migrations/20260506_add_mp_ai_points_backend.sql:4; supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql:1; supabase/migrations/20260513085315_add_service_record_sessions.sql:3
- evidenceWriteBackFields: migration.rdsExtensionSupportConfirmed
- acceptanceEvidence: aliyun_official_rds_postgresql_extensions_standard_edition_pg16_pgcrypto_1_3_2026-06-27

## Target RDS Review Resolution

- target: Aliyun RDS PostgreSQL 16.0
- edition: Standard Edition
- evidenceHandle: aliyun_official_rds_postgresql_extensions_standard_edition_pg16_pgcrypto_1_3_2026-06-27
- sourceTitle: Alibaba Cloud RDS PostgreSQL supported extensions
- sourceUrl: https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/extensions-supported-by-apsaradb-rds-for-postgresql
- resolvedCodes: extension_review
- supportedExtensions: pgcrypto@1.3
- policy: The generated RDS apply candidate may keep pgcrypto/gen_random_uuid() because the target Aliyun RDS PostgreSQL 16.0 engine supports pgcrypto. This does not authorize schema or data migration.

## RDS Compatibility Disposition Plan

- status: open
- readyToApplySchema: false
- defaultDispositionPolicy: Do not apply unreviewed Supabase-specific SQL to Aliyun RDS.
- itemCount: 7
- requiredWriteBackFields: migration.rdsExtensionSupportConfirmed, migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- closeConditions: Every category has a reviewed non-secret disposition.; schemaApplyCandidateAudit.readyToApplySchema=true after Supabase-specific SQL is removed or rewritten from rds-schema.sql.; migration.schemaCompatibilityReviewed=true is recorded only after the reviewed RDS apply candidate is prepared.; migration.supabaseSpecificSqlResolved=true is recorded only after Supabase auth schema/auth.uid/storage/service_role/RLS/policy findings are resolved.; migration.rdsExtensionSupportConfirmed=true is recorded only after target RDS engine and extension support are confirmed.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### disposition:extension_review

- defaultProposedDisposition: confirm_rds_extension_support_or_replace_function_usage
- operatorChecklist: Confirm the target RDS PostgreSQL engine version.; Confirm pgcrypto or equivalent function support for gen_random_uuid().; Record whether each extension statement is kept, replaced, or removed before schema apply.
- acceptanceEvidence: Target RDS engine/version and extension support evidence are recorded without secrets.

### disposition:policy_statement

- defaultProposedDisposition: rewrite_remove_or_replace_each_supabase_policy
- operatorChecklist: Classify each create policy statement as rewrite, remove, or replace with backend enforcement.; Confirm login/profile/invite/service-record routes still enforce tenant scope after the change.; Record disposition by category and source file without copying customer data.
- acceptanceEvidence: Every policy statement has a recorded disposition before schema apply.

### disposition:row_level_security

- defaultProposedDisposition: choose_rds_rls_or_backend_authorization_owner_before_apply
- operatorChecklist: Pick one authorization owner for each table: Aliyun RDS RLS or backend repository checks.; Ensure store manager and company-scope reads still match first-version APP permissions.; Do not leave Supabase-only policies as the assumed enforcement layer.
- acceptanceEvidence: Every RLS statement has an RDS-compatible authorization model before schema apply.

### disposition:supabase_auth_schema

- defaultProposedDisposition: replace_supabase_auth_schema_with_app_identity_model
- operatorChecklist: Map auth.users foreign keys or triggers to public.profiles, controlled UUID user ids, or another APP-owned identity boundary.; Remove Supabase auth triggers from the final RDS apply candidate unless an APP-owned replacement trigger is explicitly reviewed.; Replace auth.jwt() claim reads with backend-provided request claims or repository parameters.
- acceptanceEvidence: No unresolved Supabase auth schema references such as auth.users or auth.jwt() remain in the reviewed RDS apply candidate.

### disposition:supabase_auth_uid

- defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope
- operatorChecklist: Map each auth.uid() predicate to request user identity provided by the APP API auth layer.; Confirm company_id, store_id, and role checks are enforced in the Aliyun RDS repository layer.; Remove or rewrite the Supabase policy statement from the final RDS apply candidate.
- acceptanceEvidence: All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.

### disposition:supabase_service_role

- defaultProposedDisposition: replace_with_backend_service_account_and_rds_roles
- operatorChecklist: Remove Supabase service_role references from the RDS apply candidate.; Confirm the backend service account can perform required server-side operations through Aliyun RDS.; Keep service credentials only in Aliyun secret env or runtime credential stores.
- acceptanceEvidence: No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.

### disposition:supabase_storage_schema

- defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary
- operatorChecklist: Exclude storage.* statements from the RDS apply candidate.; Confirm OSS bucket, prefix, CORS, and RAM/STS least-privilege evidence for service-record audio.; Record upload/download smoke evidence handles without payloads or credentials.
- acceptanceEvidence: No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.

## RDS Compatibility Review Checklist

### extension_review

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 22
- affectedSourceCount: 8
- sourcePaths: lib/supabase/schema.sql, supabase/migrations/20250213_add_activation_requests_and_entitlements.sql, supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql, supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql, supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql, supabase/migrations/20260506_add_mp_ai_points_backend.sql, supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: confirm_rds_extension_support_or_replace_function_usage
- requiredOperatorDecision: Confirm Aliyun RDS PostgreSQL engine/version supports required extensions before applying schema SQL.
- operatorChecklist: Confirm the target RDS PostgreSQL engine version.; Confirm pgcrypto or equivalent function support for gen_random_uuid().; Record whether each extension statement is kept, replaced, or removed before schema apply.
- evidenceWriteBackFields: migration.rdsExtensionSupportConfirmed
- acceptanceEvidence: Target RDS engine/version and extension support evidence are recorded without secrets.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### policy_statement

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 56
- affectedSourceCount: 8
- sourcePaths: lib/supabase/schema.sql, supabase/migrations/20250213_add_activation_requests_and_entitlements.sql, supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql, supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql, supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql, supabase/migrations/20260506_add_mp_ai_points_backend.sql, supabase/migrations/20260511_harden_mp_account_invites_access.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: rewrite_remove_or_replace_each_supabase_policy
- requiredOperatorDecision: Review every Supabase create policy statement and rewrite, remove, or replace it with backend-enforced tenant authorization.
- operatorChecklist: Classify each create policy statement as rewrite, remove, or replace with backend enforcement.; Confirm login/profile/invite/service-record routes still enforce tenant scope after the change.; Record disposition by category and source file without copying customer data.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: Every policy statement has a recorded disposition before schema apply.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### row_level_security

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 23
- affectedSourceCount: 8
- sourcePaths: lib/supabase/schema.sql, supabase/migrations/20250213_add_activation_requests_and_entitlements.sql, supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql, supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql, supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql, supabase/migrations/20260506_add_mp_ai_points_backend.sql, supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: choose_rds_rls_or_backend_authorization_owner_before_apply
- requiredOperatorDecision: Decide and document whether RLS stays in Aliyun RDS or whether tenant authorization is fully enforced in lib/aliyun-rds repositories.
- operatorChecklist: Pick one authorization owner for each table: Aliyun RDS RLS or backend repository checks.; Ensure store manager and company-scope reads still match first-version APP permissions.; Do not leave Supabase-only policies as the assumed enforcement layer.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: Every RLS statement has an RDS-compatible authorization model before schema apply.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### supabase_auth_schema

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 12
- affectedSourceCount: 5
- sourcePaths: lib/supabase/schema.sql, supabase/migrations/20250213_add_activation_requests_and_entitlements.sql, supabase/migrations/20260506_add_mp_ai_points_backend.sql, supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: replace_supabase_auth_schema_with_app_identity_model
- requiredOperatorDecision: Replace Supabase auth schema references such as auth.users and auth.jwt() with APP-owned identity tables, controlled user ids, or backend-provided auth context before applying schema SQL.
- operatorChecklist: Map auth.users foreign keys or triggers to public.profiles, controlled UUID user ids, or another APP-owned identity boundary.; Remove Supabase auth triggers from the final RDS apply candidate unless an APP-owned replacement trigger is explicitly reviewed.; Replace auth.jwt() claim reads with backend-provided request claims or repository parameters.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: No unresolved Supabase auth schema references such as auth.users or auth.jwt() remain in the reviewed RDS apply candidate.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### supabase_auth_uid

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 56
- affectedSourceCount: 7
- sourcePaths: lib/supabase/schema.sql, supabase/migrations/20250213_add_activation_requests_and_entitlements.sql, supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql, supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql, supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql, supabase/migrations/20260506_add_mp_ai_points_backend.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope
- requiredOperatorDecision: Replace auth.uid() dependent SQL with backend-enforced user, company, store, and role checks before applying schema SQL.
- operatorChecklist: Map each auth.uid() predicate to request user identity provided by the APP API auth layer.; Confirm company_id, store_id, and role checks are enforced in the Aliyun RDS repository layer.; Remove or rewrite the Supabase policy statement from the final RDS apply candidate.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### supabase_service_role

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 10
- affectedSourceCount: 5
- sourcePaths: supabase/migrations/20250213_add_activation_requests_and_entitlements.sql, supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql, supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql, supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: replace_with_backend_service_account_and_rds_roles
- requiredOperatorDecision: Replace Supabase service_role grants or policy references with Aliyun RDS roles plus backend service credentials.
- operatorChecklist: Remove Supabase service_role references from the RDS apply candidate.; Confirm the backend service account can perform required server-side operations through Aliyun RDS.; Keep service credentials only in Aliyun secret env or runtime credential stores.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### supabase_storage_schema

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 2
- affectedSourceCount: 2
- sourcePaths: supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql, supabase/migrations/20260513085315_add_service_record_sessions.sql
- defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary
- requiredOperatorDecision: Replace Supabase storage schema usage with Aliyun OSS bucket/prefix/CORS/RAM/STS evidence and application-level access checks.
- operatorChecklist: Exclude storage.* statements from the RDS apply candidate.; Confirm OSS bucket, prefix, CORS, and RAM/STS least-privilege evidence for service-record audio.; Record upload/download smoke evidence handles without payloads or credentials.
- evidenceWriteBackFields: migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- acceptanceEvidence: No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

## Verification Commands

- Dry run: corepack pnpm aliyun:rds:runtime-smoke
- Strict smoke after DATABASE_URL_CN is available in the target runtime: MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE=1 corepack pnpm aliyun:rds:runtime-smoke:strict

## Evidence Writeback

- localNonSecretEvidencePath: deploy/aliyun-production-cn.rds-migration.local.json
- rule: write evidence handles, counts, ids, statuses, and timestamps only; do not write DATABASE_URL_CN, passwords, tokens, customer row payloads, or dump contents.

## Next Required Evidence

- Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou.
- Import DATABASE_URL_CN only through Aliyun KMS / Secrets Manager / SAE secret env.
- Record schemaCompatibilityReviewed, supabaseSpecificSqlResolved, and rdsExtensionSupportConfirmed before applying schema SQL.
- Apply reviewed schema and migrate data without writing data dumps into git or reports.
- Run row-count, critical-record, APP API smoke, and rollback validation.
