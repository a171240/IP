# APP production-cn RDS Migration Package Handoff

Generated from local non-secret package report: 2026-06-27T00:28:00+08:00

## Verdict

- currentScope: backend_aliyun_only
- formalTarget: Aliyun RDS PostgreSQL
- currentSource: Supabase migration source / legacy compatibility only
- packageContainsValues: false
- cloudApiCalled: false
- mutationPerformed: false
- blockedCredentialNames: DATABASE_URL_CN
- requiredAuthorizationPacket: P11_ALIYUN_RDS_DATA_MIGRATION

This file is the fixed handoff summary for the RDS migration package. It does not contain SQL dumps, row payloads, database passwords, or the `DATABASE_URL_CN` value. Generate the actual local package with:

```bash
node scripts/generate-aliyun-rds-migration-package.mjs --out-dir /tmp/meiye-huajing-rds-migration-package
```

## Package Digests

- sourceFileCount: 9
- requiredTableCount: 15
- requiredFunctionCount: 2
- requiredStorageCount: 1
- schemaSqlBytes: 51858
- rdsApplyCandidateSqlBytes: 38910
- validationSqlBytes: 4489
- schemaSqlSha256: 5b9f4a99254d682ac0d68cc7b5e2dfaab4ff5445585373af2fd0a2e8b8244f41
- rdsApplyCandidateSqlSha256: b6cca44687e039ec60837af55caeca861c3403131cb7cd2b511ffb25ad91aeef
- validationSqlSha256: 02d43c412731687ba06aa3f8827052564d4ae64ba29036cf255c88561935d55c
- rollbackChecklistSha256: c8a973fdaa5aef67266623b9137e291a82356addd32fb6553db4cffe103793ad

## Required Tables

- profiles
- credit_transactions
- entitlements
- mp_companies
- mp_stores
- mp_account_memberships
- mp_ai_point_ledger
- mp_account_invites
- store_profiles
- voice_coach_customer_profiles
- voice_coach_sessions
- voice_coach_turns
- service_record_sessions
- service_record_segments
- service_record_markers

## Required Functions

- consume_credits
- grant_trial_credits

## Required Storage Boundary

- sourceBucket: delivery-packs
- productionCnTarget: Aliyun OSS service-record audio prefix and delivery artifacts if still used by first-version routes
- validation: oss_bucket_prefix_ready, ram_sts_policy_minimum_scope_confirmed, signed_upload_download_smoke_passes

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

## RDS SQL Compatibility Review

- reviewRequired: true
- reviewChecklistItems: 7
- affectedSourceFiles: 9
- compatibilityFindingCount: 181
- schemaApplyCandidateReady: false
- schemaApplyCandidateStatus: blocked_supabase_specific_sql_present
- schemaApplyCandidateFindingCount: 181
- schemaApplyCandidateCategories: extension_review, policy_statement, row_level_security, supabase_auth_schema, supabase_auth_uid, supabase_service_role, supabase_storage_schema
- appliesTo: schema_sql_before_aliyun_rds_apply
- categories: extension_review, policy_statement, row_level_security, supabase_auth_schema, supabase_auth_uid, supabase_service_role, supabase_storage_schema
- policy: The package is not authorization to apply unreviewed Supabase SQL to Aliyun RDS.

Required review before running schema SQL on Aliyun RDS:

- `supabase_auth_schema`: replace Supabase `auth.users` / `auth.jwt()` dependencies with APP-owned identity tables or backend auth context.
- `supabase_auth_uid`: replace Supabase `auth.uid()` policy dependencies with backend-enforced user, company, store, and role checks.
- `supabase_storage_schema`: replace `storage.*` / `storage.buckets` usage with Aliyun OSS bucket, prefix, CORS, RAM/STS, and application-level access checks.
- `supabase_service_role`: replace Supabase `service_role` grants and policies with Aliyun RDS roles plus backend service credentials.
- `row_level_security` and `policy_statement`: decide whether RLS remains in Aliyun RDS or whether all tenant authorization is enforced in the `lib/aliyun-rds` repository layer.
- `extension_review`: confirm target Aliyun RDS PostgreSQL supports required extensions such as `pgcrypto` before applying SQL.

Only after this compatibility review is recorded may the operator treat `rds-schema.sql` as an apply candidate. Until then, it is a non-secret review package, not a production migration script.

## RDS Schema Apply Candidate Audit

- readyToApplySchema: false
- status: blocked_supabase_specific_sql_present
- findingCount: 181
- affectedGeneratedFileCount: 1
- categories: extension_review, policy_statement, row_level_security, supabase_auth_schema, supabase_auth_uid, supabase_service_role, supabase_storage_schema
- policy: The generated `rds-schema.sql` still contains Supabase-specific SQL and must not be applied to Aliyun RDS until rewritten or explicitly resolved.

Current generated `rds-schema.sql` still contains these blocked categories:

- `supabase_auth_schema`: 12 findings in `rds-schema.sql`; replace Supabase Auth schema references with APP-owned identity boundaries before apply.
- `supabase_auth_uid`: 56 findings in `rds-schema.sql`; rewrite to backend-enforced identity and tenant checks.
- `supabase_storage_schema`: 2 findings in `rds-schema.sql`; replace with OSS bucket/prefix/RAM/STS evidence.
- `supabase_service_role`: 10 findings in `rds-schema.sql`; replace with Aliyun RDS roles and backend service credentials.
- `row_level_security`: 23 findings in `rds-schema.sql`; choose RDS RLS or backend repository authorization before apply.
- `policy_statement`: 56 findings in `rds-schema.sql`; rewrite, remove, or replace each Supabase policy.
- `extension_review`: 22 findings in `rds-schema.sql`; confirm target RDS PostgreSQL extension support before keeping extension-dependent SQL.

## RDS Apply Candidate

The package generator now also emits:

```text
rds-apply-candidate.sql
```

This candidate removes Supabase-only policy, RLS, `service_role`, and `storage.*` statements from the raw `rds-schema.sql` review package. It also rewrites Supabase Auth foreign keys and `auth.uid()` calls to the APP-owned identity context used by the backend boundary. It is still not production-apply-ready; it exists to reduce the P11 review surface and show the remaining blockers after automatic stripping and rewrite.

- readyToApplySchema: false
- status: blocked_extension_support_unconfirmed
- findingCount: 22
- categories: extension_review
- removedStatementCount: 97
- keptStatementCount: 138
- rewrittenStatementCount: 12
- removed policy_statement statements: 69
- removed row_level_security statements: 23
- removed supabase_auth_schema statements: 3
- removed supabase_service_role statements: 10
- removed supabase_storage_schema statements: 2
- rewritten supabase_auth_schema statements: 9
- rewritten supabase_auth_uid statements: 3
- rdsApplyCandidateSqlSha256: b6cca44687e039ec60837af55caeca861c3403131cb7cd2b511ffb25ad91aeef

Remaining required review before this candidate can be applied:

- confirm Aliyun RDS PostgreSQL engine/version support for `pgcrypto` / `gen_random_uuid()`;
- confirm the backend request context sets `app.current_user_id` before any rewritten SQL functions that need request identity are used;
- complete schema/data migration, APP API smoke, and rollback validation.

## RDS Apply Candidate Review Plan

- status: open
- readyToApplySchema: false
- reviewPlanItemCount: 1
- reviewPlanFindingCount: 22
- categories: extension_review
- requiredWriteBackFields: migration.rdsExtensionSupportConfirmed
- policy: close every remaining `rds-apply-candidate.sql` review item before applying schema SQL to Aliyun RDS.
- locationPolicy: line numbers below refer to generated `rds-apply-candidate.sql`; source line text is intentionally omitted.

### apply-review:extension_review

- findingCount: 22
- affectedSourceCount: 8
- sourceSummaries: `lib/supabase/schema.sql:7`; `supabase/migrations/20250213_add_activation_requests_and_entitlements.sql:1`; `supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql:1`; `supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql:3`; `supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql:2`; `supabase/migrations/20260506_add_mp_ai_points_backend.sql:4`; `supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql:1`; `supabase/migrations/20260513085315_add_service_record_sessions.sql:3`
- evidenceWriteBackFields: migration.rdsExtensionSupportConfirmed
- acceptanceEvidence: target RDS engine/version and extension support evidence are recorded without secrets.

## RDS SQL Compatibility Disposition Plan

- status: open
- readyToApplySchema: false
- itemCount: 7
- requiredWriteBackFields: migration.rdsExtensionSupportConfirmed, migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- defaultDispositionPolicy: Do not apply unreviewed Supabase-specific SQL to Aliyun RDS.
- closeCondition: every category below has a reviewed non-secret disposition, and the local RDS evidence file records the matching write-back booleans only after the reviewed apply candidate is prepared.
- forbiddenValues: DATABASE_URL_CN value, database password, customer row payloads, dump contents, Supabase service role key, AccessKeySecret, STS token

### disposition:extension_review

- defaultProposedDisposition: confirm_rds_extension_support_or_replace_function_usage
- operatorChecklist: confirm target RDS PostgreSQL engine version; confirm pgcrypto or equivalent support for gen_random_uuid(); record whether each extension statement is kept, replaced, or removed before schema apply.
- acceptanceEvidence: Target RDS engine/version and extension support evidence are recorded without secrets.

### disposition:policy_statement

- defaultProposedDisposition: rewrite_remove_or_replace_each_supabase_policy
- operatorChecklist: classify each create policy statement as rewrite, remove, or replace with backend enforcement; confirm login/profile/invite/service-record routes still enforce tenant scope; record disposition by category and source file without customer data.
- acceptanceEvidence: Every policy statement has a recorded disposition before schema apply.

### disposition:row_level_security

- defaultProposedDisposition: choose_rds_rls_or_backend_authorization_owner_before_apply
- operatorChecklist: pick one authorization owner for each table; ensure store manager and company-scope reads still match first-version APP permissions; do not leave Supabase-only policies as the assumed enforcement layer.
- acceptanceEvidence: Every RLS statement has an RDS-compatible authorization model before schema apply.

### disposition:supabase_auth_schema

- defaultProposedDisposition: replace_supabase_auth_schema_with_app_identity_model
- operatorChecklist: map auth.users foreign keys or triggers to public.profiles, controlled UUID user ids, or another APP-owned identity boundary; remove Supabase auth triggers unless an APP-owned replacement trigger is reviewed; replace auth.jwt() claim reads with backend-provided request claims or repository parameters.
- acceptanceEvidence: No unresolved Supabase auth schema references such as auth.users or auth.jwt() remain in the reviewed RDS apply candidate.

### disposition:supabase_auth_uid

- defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope
- operatorChecklist: map each auth.uid() predicate to request user identity from the APP API auth layer; confirm company_id, store_id, and role checks in the Aliyun RDS repository layer; remove or rewrite the Supabase policy statement from the final RDS apply candidate.
- acceptanceEvidence: All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.

### disposition:supabase_service_role

- defaultProposedDisposition: replace_with_backend_service_account_and_rds_roles
- operatorChecklist: remove Supabase service_role references from the RDS apply candidate; confirm backend service account operations through Aliyun RDS; keep service credentials only in Aliyun secret env or runtime credential stores.
- acceptanceEvidence: No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.

### disposition:supabase_storage_schema

- defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary
- operatorChecklist: exclude storage.* statements from the RDS apply candidate; confirm OSS bucket, prefix, CORS, and RAM/STS least-privilege evidence for service-record audio; record upload/download smoke evidence handles without payloads or credentials.
- acceptanceEvidence: No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.

## RDS SQL Compatibility Review Checklist

Each item below must be resolved before P11 treats `rds-schema.sql` as an Aliyun RDS apply candidate. These are operator review tasks, not permission to apply SQL.

### extension_review

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 22
- affectedSourceCount: 8
- sourcePaths: lib/supabase/schema.sql; supabase/migrations/20250213_add_activation_requests_and_entitlements.sql; supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql; supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql; supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql; supabase/migrations/20260506_add_mp_ai_points_backend.sql; supabase/migrations/20260511_add_mp_account_invites_and_org_snapshots.sql; supabase/migrations/20260513085315_add_service_record_sessions.sql
- requiredOperatorDecision: Confirm Aliyun RDS PostgreSQL engine/version supports required extensions before applying schema SQL.
- evidenceWriteBackFields: migration.rdsExtensionSupportConfirmed
- acceptanceEvidence: Target RDS engine/version and extension support evidence are recorded without secrets.

### policy_statement

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 56
- affectedSourceCount: 8
- sourcePaths: lib/supabase/schema.sql; supabase/migrations/20250213_add_activation_requests_and_entitlements.sql; supabase/migrations/20260209_xhs_v4_store_profiles_and_draft_fields.sql; supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql; supabase/migrations/20260412_add_voice_coach_profiles_and_scene_cards.sql; supabase/migrations/20260506_add_mp_ai_points_backend.sql; supabase/migrations/20260511_harden_mp_account_invites_access.sql; supabase/migrations/20260513085315_add_service_record_sessions.sql
- requiredOperatorDecision: Review every Supabase create policy statement and rewrite, remove, or replace it with backend-enforced tenant authorization.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: Every policy statement has a recorded disposition before schema apply.

### row_level_security

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 23
- affectedSourceCount: 8
- requiredOperatorDecision: Decide and document whether RLS stays in Aliyun RDS or whether tenant authorization is fully enforced in `lib/aliyun-rds` repositories.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: Every RLS statement has an RDS-compatible authorization model before schema apply.

### supabase_auth_schema

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 12
- affectedSourceCount: 5
- requiredOperatorDecision: Replace Supabase auth schema references such as `auth.users` and `auth.jwt()` with APP-owned identity tables, controlled user ids, or backend-provided auth context before applying schema SQL.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: No unresolved Supabase auth schema references such as `auth.users` or `auth.jwt()` remain in the reviewed RDS apply candidate.

### supabase_auth_uid

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 56
- affectedSourceCount: 7
- requiredOperatorDecision: Replace `auth.uid()` dependent SQL with backend-enforced user, company, store, and role checks before applying schema SQL.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: All `auth.uid()` findings have a reviewed rewrite, removal, or backend-owned authorization note.

### supabase_service_role

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 10
- affectedSourceCount: 5
- requiredOperatorDecision: Replace Supabase `service_role` grants or policy references with Aliyun RDS roles plus backend service credentials.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: No Supabase `service_role` grant or policy remains in the reviewed RDS apply candidate.

### supabase_storage_schema

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 2
- affectedSourceCount: 2
- sourcePaths: supabase/migrations/20260210_add_voice_coach_sessions_and_turns.sql; supabase/migrations/20260513085315_add_service_record_sessions.sql
- requiredOperatorDecision: Replace Supabase storage schema usage with Aliyun OSS bucket/prefix/CORS/RAM/STS evidence and application-level access checks.
- evidenceWriteBackFields: migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- acceptanceEvidence: No `storage.*` SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.

## Execution Boundary

1. Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou.
2. Apply the reviewed schema package to the Aliyun RDS target.
3. Migrate data from Supabase source to Aliyun RDS without writing dumps to git or reports.
4. Run validation SQL and record counts/evidence handles only.
5. Run APP API smoke on the RDS-backed backend.
6. Rehearse rollback and write only non-secret evidence to `deploy/aliyun-production-cn.rds-migration.local.json`.

## Evidence To Write Back

- `rdsPostgres.instanceId`
- `rdsPostgres.engineVersion`
- `rdsPostgres.networkAccess`
- `rdsPostgres.databaseName`
- `rdsPostgres.databaseAccountReady=true`
- `rdsPostgres.databaseUrlCnSecretImported=true`
- `migration.schemaCompatibilityReviewed=true`
- `migration.supabaseSpecificSqlResolved=true`
- `migration.rdsExtensionSupportConfirmed=true`
- `migration.schemaMigrated=true`
- `migration.dataMigrated=true`
- `migration.rowCountValidationPassed=true`
- `migration.criticalRecordValidationPassed=true`
- `migration.appApiSmokeOnRdsPassed=true`
- `migration.supabaseNoLongerFormalTarget=true`
- `migration.rollbackRunbookReviewed=true`
- `migration.rollbackValidationPassed=true`

## Forbidden Values

- DATABASE_URL_CN value
- database password
- customer row payloads
- dump contents
- Supabase service role key
- AccessKeySecret
- STS token
- cookies

## Verification

```bash
corepack pnpm aliyun:rds:migration:package
corepack pnpm aliyun:rds:migration:evidence:strict
corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin
corepack pnpm aliyun:completion:audit
```
