# APP production-cn RDS Migration Package Handoff

Generated from local non-secret package report: 2026-06-25T08:28:55.154Z

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
- validationSqlBytes: 4489
- schemaSqlSha256: 5b9f4a99254d682ac0d68cc7b5e2dfaab4ff5445585373af2fd0a2e8b8244f41
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
