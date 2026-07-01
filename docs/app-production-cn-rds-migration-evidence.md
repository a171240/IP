# APP production-cn RDS migration evidence check

Generated at: 2026-07-01T08:20:55.311Z

## Conclusion

- ok: true
- templateReady: true
- localExists: true
- localReady: true
- migrationReady: true
- appApiRoutesWithSupabase: 54/56
- appApiRoutesWithSupabaseDataAccess: 4/56
- firstVersionRdsRoutesWithSupabaseDataAccess: 0/25
- deferredAppApiRoutesWithSupabaseDataAccess: 4/31
- databaseUrlCnReferencedInSource: true
- postgresDataAccessAdapterDetected: true
- writebackBlockingGroups: none
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- rdsMigrationPlanReady: true
- rdsMigrationPhaseReady: 5/5
- rdsMigrationNextPhaseIds: none
- rdsLocalReviewCanStartNow: false
- rdsCanStartP11AfterActionTimeConfirmation: false
- rdsCompatibilityReviewCanStartNow: false
- rdsSchemaApplyBlockedByCompatibilityReview: false

## Files

- template: /Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.rds-migration.example.json
- local: /Users/Admin/Documents/美业话镜APP/handoff/IP/deploy/aliyun-production-cn.rds-migration.local.json

## Local Blockers

- none

## Writeback Plan

### rdsInstanceAndSecret

- canStartNow: true
- dependsOnGroups: none
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- blockerFields: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.* non-secret evidence; /Users/Admin/Documents/美业话镜APP/.env.production-cn.local -> DATABASE_URL_CN status only, never committed; Aliyun KMS / Secrets Manager / SAE secret env -> DATABASE_URL_CN value
- expectedEvidence: RDS PostgreSQL instance exists in cn-hangzhou; database account and database are ready; DATABASE_URL_CN imported only through secret env
- forbidden: Do not record database password or connection string value; Do not store DATABASE_URL_CN in git, JSON, Markdown, Docker image, APP bundle, or mini-program package
- verifyCommands: corepack pnpm aliyun:rds:migration:evidence; corepack pnpm aliyun:env:check

### schemaDataAndRollback

- canStartNow: false
- dependsOnGroups: rdsInstanceAndSecret
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- blockerFields: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> sourceInventory / migration non-secret evidence; release manifest / migration report -> non-secret migration evidence handle
- expectedEvidence: APP API data access adapter uses RDS/PostgreSQL as formal production-cn data layer; Supabase SQL compatibility review completed before applying schema to Aliyun RDS; Supabase-specific auth/storage/RLS/service_role SQL resolved or rewritten for Aliyun RDS; Aliyun RDS PostgreSQL extension support confirmed for required functions; schema and data migration validated; row counts, critical records, APP API smoke, and rollback validation passed
- forbidden: Do not run destructive migration without reviewed migration and rollback plan; Do not store dump contents, customer data, Supabase service role key, or database password in reports
- verifyCommands: corepack pnpm aliyun:rds:migration:plan; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:completion:audit

## RDS Migration Plan

- ready: true
- phaseReady: 5/5
- nextPhaseIds: none
- localReviewCanStartNow: false
- cloudOrSecretActionRequired: false
- onlyMissingBackendCredentialValue: DATABASE_URL_CN

### execution_readiness

- canStartP11AfterActionTimeConfirmation: false
- compatibilityReviewCanStartNow: false
- schemaApplyBlockedByCompatibilityReview: false
- rdsInstanceAndSecretReady: true
- onlyMissingBackendCredentialValue: DATABASE_URL_CN
- databaseUrlCnSecretTarget: Aliyun KMS / Secrets Manager / SAE secret env
- localReviewCloseFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved, migration.rdsExtensionSupportConfirmed
- cloudSecretWritebackFields: rdsPostgres.instanceId, rdsPostgres.engineVersion, rdsPostgres.networkAccess, rdsPostgres.databaseName, rdsPostgres.databaseAccountReady=true, rdsPostgres.databaseUrlCnSecretImported=true, rdsPostgres.evidence=<non-secret RDS console/secret-env evidence handle>
- nextOperatorDecision: create_rds_import_database_url_secret_then_validate_schema_data_and_smoke
- verificationCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:sensitive:blockers:backend; corepack pnpm aliyun:backend-cn:status

### compatibility_review_package

- ready: true
- packageOk: true
- reviewRequired: true
- findingCount: 181
- affectedSourceFileCount: 9
- checklistItemCount: 7
- blockingFields: none
- schemaSqlSha256: 5b9f4a99254d682ac0d68cc7b5e2dfaab4ff5445585373af2fd0a2e8b8244f41
- rdsApplyCandidateSqlSha256: 2091ef7975246cfd770883d2ac5b7b3da6b45ee76a82178f7a8e9db18f91a8ab
- validationSqlSha256: 5642494c32ffaf4e9eb8297678c460b79dbd3de1f467f2851949a903961f838d
- rollbackChecklistSha256: f875b86c32714158fdd35121c56ac54b9000fe3689206a9c946dc630c7e0ad20

### rds_apply_candidate

- readyToApplySchema: true
- status: ready_after_target_rds_engine_confirmation
- findingCount: 0
- categories: none
- removedStatementCount: 113
- keptStatementCount: 148
- rewrittenStatementCount: 9
- remainingReviewRequired: false

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

### rds_apply_candidate_review_plan

- status: ready_after_target_rds_engine_confirmation
- readyToApplySchema: true
- itemCount: 0
- findingCount: 0
- categories: none
- resolvedItemCount: 1
- resolvedFindingCount: 22
- resolvedCategories: extension_review
- requiredWriteBackFields: none
- closeConditions: Resolved target-engine review items are backed by non-secret Aliyun RDS official extension evidence.; migration.schemaCompatibilityReviewed=true, migration.supabaseSpecificSqlResolved=true, and migration.rdsExtensionSupportConfirmed=true are recorded only after review closure.


### compatibility_disposition_plan

- status: open
- readyToApplySchema: false
- itemCount: 7
- requiredWriteBackFields: migration.rdsExtensionSupportConfirmed, migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- closeConditions: Every category has a reviewed non-secret disposition.; schemaApplyCandidateAudit.readyToApplySchema=true after Supabase-specific SQL is removed or rewritten from rds-schema.sql.; migration.schemaCompatibilityReviewed=true is recorded only after the reviewed RDS apply candidate is prepared.; migration.supabaseSpecificSqlResolved=true is recorded only after Supabase auth schema/auth.uid/storage/service_role/RLS/policy findings are resolved.; migration.rdsExtensionSupportConfirmed=true is recorded only after target RDS engine and extension support are confirmed.

#### disposition:extension_review

- defaultProposedDisposition: confirm_rds_extension_support_or_replace_function_usage
- operatorChecklist: Confirm the target RDS PostgreSQL engine version.; Confirm pgcrypto or equivalent function support for gen_random_uuid().; Record whether each extension statement is kept, replaced, or removed before schema apply.
- evidenceWriteBackFields: migration.rdsExtensionSupportConfirmed
- acceptanceEvidence: Target RDS engine/version and extension support evidence are recorded without secrets.

#### disposition:policy_statement

- defaultProposedDisposition: rewrite_remove_or_replace_each_supabase_policy
- operatorChecklist: Classify each create policy statement as rewrite, remove, or replace with backend enforcement.; Confirm login/profile/invite/service-record routes still enforce tenant scope after the change.; Record disposition by category and source file without copying customer data.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: Every policy statement has a recorded disposition before schema apply.

#### disposition:row_level_security

- defaultProposedDisposition: choose_rds_rls_or_backend_authorization_owner_before_apply
- operatorChecklist: Pick one authorization owner for each table: Aliyun RDS RLS or backend repository checks.; Ensure store manager and company-scope reads still match first-version APP permissions.; Do not leave Supabase-only policies as the assumed enforcement layer.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: Every RLS statement has an RDS-compatible authorization model before schema apply.

#### disposition:supabase_auth_schema

- defaultProposedDisposition: replace_supabase_auth_schema_with_app_identity_model
- operatorChecklist: Map auth.users foreign keys or triggers to public.profiles, controlled UUID user ids, or another APP-owned identity boundary.; Remove Supabase auth triggers from the final RDS apply candidate unless an APP-owned replacement trigger is explicitly reviewed.; Replace auth.jwt() claim reads with backend-provided request claims or repository parameters.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: No unresolved Supabase auth schema references such as auth.users or auth.jwt() remain in the reviewed RDS apply candidate.

#### disposition:supabase_auth_uid

- defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope
- operatorChecklist: Map each auth.uid() predicate to request user identity provided by the APP API auth layer.; Confirm company_id, store_id, and role checks are enforced in the Aliyun RDS repository layer.; Remove or rewrite the Supabase policy statement from the final RDS apply candidate.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.

#### disposition:supabase_service_role

- defaultProposedDisposition: replace_with_backend_service_account_and_rds_roles
- operatorChecklist: Remove Supabase service_role references from the RDS apply candidate.; Confirm the backend service account can perform required server-side operations through Aliyun RDS.; Keep service credentials only in Aliyun secret env or runtime credential stores.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- acceptanceEvidence: No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.

#### disposition:supabase_storage_schema

- defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary
- operatorChecklist: Exclude storage.* statements from the RDS apply candidate.; Confirm OSS bucket, prefix, CORS, and RAM/STS least-privilege evidence for service-record audio.; Record upload/download smoke evidence handles without payloads or credentials.
- evidenceWriteBackFields: migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- acceptanceEvidence: No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.

#### extension_review

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 22
- affectedSourceCount: 8
- defaultProposedDisposition: confirm_rds_extension_support_or_replace_function_usage
- operatorChecklist: Confirm the target RDS PostgreSQL engine version.; Confirm pgcrypto or equivalent function support for gen_random_uuid().; Record whether each extension statement is kept, replaced, or removed before schema apply.
- evidenceWriteBackFields: migration.rdsExtensionSupportConfirmed
- requiredOperatorDecision: Confirm Aliyun RDS PostgreSQL engine/version supports required extensions before applying schema SQL.
- acceptanceEvidence: Target RDS engine/version and extension support evidence are recorded without secrets.

#### policy_statement

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 56
- affectedSourceCount: 8
- defaultProposedDisposition: rewrite_remove_or_replace_each_supabase_policy
- operatorChecklist: Classify each create policy statement as rewrite, remove, or replace with backend enforcement.; Confirm login/profile/invite/service-record routes still enforce tenant scope after the change.; Record disposition by category and source file without copying customer data.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- requiredOperatorDecision: Review every Supabase create policy statement and rewrite, remove, or replace it with backend-enforced tenant authorization.
- acceptanceEvidence: Every policy statement has a recorded disposition before schema apply.

#### row_level_security

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 23
- affectedSourceCount: 8
- defaultProposedDisposition: choose_rds_rls_or_backend_authorization_owner_before_apply
- operatorChecklist: Pick one authorization owner for each table: Aliyun RDS RLS or backend repository checks.; Ensure store manager and company-scope reads still match first-version APP permissions.; Do not leave Supabase-only policies as the assumed enforcement layer.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- requiredOperatorDecision: Decide and document whether RLS stays in Aliyun RDS or whether tenant authorization is fully enforced in lib/aliyun-rds repositories.
- acceptanceEvidence: Every RLS statement has an RDS-compatible authorization model before schema apply.

#### supabase_auth_schema

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 12
- affectedSourceCount: 5
- defaultProposedDisposition: replace_supabase_auth_schema_with_app_identity_model
- operatorChecklist: Map auth.users foreign keys or triggers to public.profiles, controlled UUID user ids, or another APP-owned identity boundary.; Remove Supabase auth triggers from the final RDS apply candidate unless an APP-owned replacement trigger is explicitly reviewed.; Replace auth.jwt() claim reads with backend-provided request claims or repository parameters.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- requiredOperatorDecision: Replace Supabase auth schema references such as auth.users and auth.jwt() with APP-owned identity tables, controlled user ids, or backend-provided auth context before applying schema SQL.
- acceptanceEvidence: No unresolved Supabase auth schema references such as auth.users or auth.jwt() remain in the reviewed RDS apply candidate.

#### supabase_auth_uid

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 56
- affectedSourceCount: 7
- defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope
- operatorChecklist: Map each auth.uid() predicate to request user identity provided by the APP API auth layer.; Confirm company_id, store_id, and role checks are enforced in the Aliyun RDS repository layer.; Remove or rewrite the Supabase policy statement from the final RDS apply candidate.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- requiredOperatorDecision: Replace auth.uid() dependent SQL with backend-enforced user, company, store, and role checks before applying schema SQL.
- acceptanceEvidence: All auth.uid() findings have a reviewed rewrite, removal, or backend-owned authorization note.

#### supabase_service_role

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 10
- affectedSourceCount: 5
- defaultProposedDisposition: replace_with_backend_service_account_and_rds_roles
- operatorChecklist: Remove Supabase service_role references from the RDS apply candidate.; Confirm the backend service account can perform required server-side operations through Aliyun RDS.; Keep service credentials only in Aliyun secret env or runtime credential stores.
- evidenceWriteBackFields: migration.schemaCompatibilityReviewed, migration.supabaseSpecificSqlResolved
- requiredOperatorDecision: Replace Supabase service_role grants or policy references with Aliyun RDS roles plus backend service credentials.
- acceptanceEvidence: No Supabase service_role grant or policy remains in the reviewed RDS apply candidate.

#### supabase_storage_schema

- statusBeforeP11Apply: must_resolve_before_schema_apply
- findingCount: 2
- affectedSourceCount: 2
- defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary
- operatorChecklist: Exclude storage.* statements from the RDS apply candidate.; Confirm OSS bucket, prefix, CORS, and RAM/STS least-privilege evidence for service-record audio.; Record upload/download smoke evidence handles without payloads or credentials.
- evidenceWriteBackFields: migration.supabaseSpecificSqlResolved, cloudConfirmations.items.oss
- requiredOperatorDecision: Replace Supabase storage schema usage with Aliyun OSS bucket/prefix/CORS/RAM/STS evidence and application-level access checks.
- acceptanceEvidence: No storage.* SQL is applied to RDS; OSS/RAM/STS evidence covers the equivalent storage boundary.

### source_inventory_preflight

- ready: true
- canStartNow: true
- canStartAfterActionTimeConfirmation: false
- dependsOnPhaseIds: none
- requiredAuthorizationPackets: none
- blockerFields: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> sourceInventory.* non-secret evidence; deploy/aliyun-production-cn.rds-first-version-schema-map.json; deploy/app-api-production-cn.bridge-map.json
- expectedEvidence: firstVersionRdsRouteCount=25; firstVersionRdsRoutesWithSupabaseDataAccess=0; postgresDataAccessAdapterDetected=true; schemaInventoryReviewed=true; dataAccessAdapterReady=true
- forbidden: Do not include row contents, customer data, Supabase service role key, or DATABASE_URL_CN value.
- verifyCommands: corepack pnpm aliyun:rds:migration:plan; corepack pnpm aliyun:rds:migration:evidence

### compatibility_review

- ready: true
- canStartNow: true
- canStartAfterActionTimeConfirmation: false
- dependsOnPhaseIds: source_inventory_preflight
- requiredAuthorizationPackets: none
- blockerFields: none
- writeTargets: docs/app-production-cn-rds-migration-package.md -> compatibilityReviewChecklist non-secret dispositions; deploy/aliyun-production-cn.rds-migration.local.json -> migration schemaCompatibilityReviewed / supabaseSpecificSqlResolved / rdsExtensionSupportConfirmed
- expectedEvidence: compatibilityReviewChecklistItemCount=7 reviewed and closed; Supabase auth schema/auth.uid/storage/service_role/RLS/policy dispositions recorded without secrets; target Aliyun RDS PostgreSQL extension support or replacement plan confirmed
- forbidden: Do not apply schema to RDS before this review closes.; Do not store dump contents, customer data, database password, or Supabase service role key.
- verifyCommands: corepack pnpm aliyun:rds:migration:package; corepack pnpm aliyun:rds:migration:evidence

### rds_instance_and_secret

- ready: true
- canStartNow: false
- canStartAfterActionTimeConfirmation: true
- dependsOnPhaseIds: none
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- blockerFields: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.* non-secret evidence; Aliyun KMS / Secrets Manager / SAE secret env -> DATABASE_URL_CN value only
- expectedEvidence: RDS PostgreSQL instance exists in cn-hangzhou; database account and network access for SAE are ready; DATABASE_URL_CN imported only through Aliyun controlled secret env
- forbidden: Do not write DATABASE_URL_CN value, database password, or connection string to JSON, Markdown, Docker image, shell history, or git.
- verifyCommands: corepack pnpm aliyun:rds:migration:evidence; corepack pnpm aliyun:sensitive:blockers:backend

### schema_data_validation

- ready: true
- canStartNow: false
- canStartAfterActionTimeConfirmation: true
- dependsOnPhaseIds: compatibility_review, rds_instance_and_secret
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- blockerFields: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> migration schema/data validation booleans and non-secret evidence handle; release manifest / migration report -> non-secret migration evidence handle
- expectedEvidence: schemaMigrated=true; dataMigrated=true; rowCountValidationPassed=true; criticalRecordValidationPassed=true; supabaseNoLongerFormalTarget=true
- forbidden: Do not store migration dump contents or customer records in reports.; Do not run destructive migration without reviewed rollback path.
- verifyCommands: corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:backend-cn:status

### app_api_smoke_and_rollback

- ready: true
- canStartNow: false
- canStartAfterActionTimeConfirmation: true
- dependsOnPhaseIds: schema_data_validation
- requiredAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION
- blockerFields: none
- writeTargets: deploy/aliyun-production-cn.rds-migration.local.json -> migration smoke/rollback booleans and non-secret evidence handle
- expectedEvidence: profile / tenant / invite / service-record APP API smoke passed against RDS; rollbackRunbookReviewed=true; rollbackValidationPassed=true
- forbidden: Do not include auth tokens, customer payloads, database password, or connection string value in smoke evidence.
- verifyCommands: corepack pnpm aliyun:rds:migration:evidence:strict; corepack pnpm aliyun:completion:audit; corepack pnpm aliyun:predeploy

## Strict Verification Order

- corepack pnpm aliyun:rds:migration:plan
- corepack pnpm aliyun:rds:migration:evidence:strict
- corepack pnpm aliyun:env:check
- corepack pnpm aliyun:completion:audit
- corepack pnpm aliyun:predeploy

## Safety Boundary

- This checker never connects to Supabase, Aliyun RDS, Vercel, or WeChat.
- Only non-secret evidence handles, booleans, resource names, and counts may be stored in the .local.json evidence file.
- DATABASE_URL_CN, database password, dump contents, Supabase service role key, AccessKeySecret, AppSecret, STS token, and cookies must never be written to JSON, Markdown, Docker image, APP bundle, mini-program package, or git.
