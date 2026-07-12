# Supabase to Aliyun RDS Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the approved first-version APP data from Supabase project `IP网站` to a dedicated Aliyun RDS PostgreSQL 16 database without exposing secrets, breaking tenant scope, or losing rollback capability.

**Architecture:** Supabase Auth remains the temporary identity issuer while APP-owned business rows are copied with their existing UUIDs into Aliyun RDS. The reviewed `rds-apply-candidate.sql` creates the first-version target schema without Supabase-only RLS, policy, service_role, auth schema, or storage statements; Backend repositories remain the authorization owner. Data is loaded dependency-first inside bounded transactions, validated by row counts and tenant invariants, then admitted through read-only APP API smoke before any production cutover.

**Tech Stack:** Supabase PostgreSQL 17 source, Aliyun RDS PostgreSQL 16 target, `pg_dump`/`psql`, Node.js validation scripts, Next.js APP API repositories.

## Global Constraints

- Never print, commit, or write connection strings, passwords, service-role keys, tokens, AccessKeySecret, or customer row payloads to Markdown/JSON/log output.
- Source Supabase is read-only throughout this migration.
- Target writes require `DATABASE_URL_CN` to identify a dedicated Aliyun RDS PostgreSQL database, never a Supabase hostname.
- No production cutover, Vercel deployment, SAE deployment, DNS change, or secret mutation is included in this plan.
- Preserve all source UUID primary and foreign keys.
- Abort before schema write if the target is not PostgreSQL 16, is not Aliyun RDS, is not dedicated/empty, cannot run `pgcrypto`, or lacks a rollback snapshot.
- Authentication password hashes and Supabase `auth.*` tables are not copied; Supabase Auth remains the temporary issuer.
- Repository-level `userId/companyId/storeId/membershipId` authorization remains mandatory after RDS migration.
- Do not stage or commit without separate authorization.

---

### Task 1: Freeze source and target identity

**Files:**
- Modify: `deploy/aliyun-production-cn.rds-migration.local.json`
- Reference: `deploy/aliyun-production-cn.rds-first-version-schema-map.json`

**Interfaces:**
- Consumes: `SOURCE_DATABASE_URL`, `DATABASE_URL_CN`
- Produces: verified source/target engine, host class, database name, row-count snapshot, and rollback handle without secret values

- [ ] **Step 1:** Confirm both variables exist without printing values.
- [ ] **Step 2:** Reject the target when its hostname ends in `.supabase.co` or equals the source hostname.
- [ ] **Step 3:** Query `version()`, current database, current user, server address class, and `pg_extension` on the target.
- [ ] **Step 4:** Confirm a dedicated empty target or record the reviewed pre-existing schema inventory.
- [ ] **Step 5:** Record an Aliyun RDS snapshot/backup evidence handle before any write.
- [ ] **Step 6:** Freeze source counts for all 19 required tables and verify company/store/membership foreign-key completeness.

### Task 2: Apply the reviewed first-version schema

**Files:**
- Generate: `/tmp/meiye-rds-migration-20260712/rds-apply-candidate.sql`
- Generate: `/tmp/meiye-rds-migration-20260712/rds-validation.sql`
- Reference: `docs/app-production-cn-rds-migration-package.md`

**Interfaces:**
- Consumes: verified empty target and the package SHA256 values
- Produces: target schema with the 19 required tables and indexes

- [ ] **Step 1:** Run `corepack pnpm aliyun:rds:migration:package -- --out-dir /tmp/meiye-rds-migration-20260712`.
- [ ] **Step 2:** Verify the generated apply-candidate SHA256 against the package manifest.
- [ ] **Step 3:** Run `psql "$DATABASE_URL_CN" -v ON_ERROR_STOP=1 --single-transaction -f rds-apply-candidate.sql`.
- [ ] **Step 4:** Run target schema validation and abort on any missing table, column, constraint, index, or extension.
- [ ] **Step 5:** Record only the schema digest and pass/fail evidence in the local migration evidence file.

### Task 3: Copy identity and tenant roots

**Files:**
- Create: `/tmp/meiye-rds-migration-20260712/copy-first-version-data.mjs`
- Create: `/tmp/meiye-rds-migration-20260712/source-counts.json`
- Create: `/tmp/meiye-rds-migration-20260712/target-counts.json`

**Interfaces:**
- Consumes: direct source/target PostgreSQL connections
- Produces: profiles, entitlement, company, store, membership, and ledger rows with preserved UUIDs

- [ ] **Step 1:** Copy `profiles`, `credit_transactions`, and `entitlements` in a target transaction.
- [ ] **Step 2:** Copy `mp_companies`, `mp_stores`, `mp_account_memberships`, `mp_ai_point_ledger`, and `mp_account_invites` in foreign-key order.
- [ ] **Step 3:** Compare source/target row counts for every copied table.
- [ ] **Step 4:** Assert every active membership resolves an existing profile, company, and optional store.
- [ ] **Step 5:** Roll back the batch on any count or invariant mismatch.

### Task 4: Copy APP business data

**Files:**
- Modify: `/tmp/meiye-rds-migration-20260712/copy-first-version-data.mjs`

**Interfaces:**
- Consumes: admitted tenant roots
- Produces: first-version learning, voice-coach, store-profile, and service-record rows

- [ ] **Step 1:** Copy `store_profiles` and `app_learning_progress_events`.
- [ ] **Step 2:** Copy `voice_coach_customer_profiles`, `voice_coach_scene_cards`, `voice_coach_sessions`, and `voice_coach_turns` in dependency order.
- [ ] **Step 3:** Copy `service_record_sessions`, `service_record_segments`, and `service_record_markers` in dependency order.
- [ ] **Step 4:** Compare row counts and reject orphan turns, segments, markers, company scopes, store scopes, and membership scopes.
- [ ] **Step 5:** Leave Supabase storage objects unchanged; OSS binary migration is a separate authorized package.

### Task 5: Admit RDS without cutting over production

**Files:**
- Modify: `deploy/aliyun-production-cn.rds-migration.local.json`
- Test: `tests/aliyun-app-voice-coach-rds-contract.test.js`
- Test: `tests/aliyun-app-voice-coach-rds-selection-route.test.js`

**Interfaces:**
- Consumes: migrated target rows
- Produces: L0/L2/L3 admission evidence and a rollback-ready target

- [ ] **Step 1:** Run `corepack pnpm aliyun:rds:migration:evidence:strict` and require schema/data/count/critical-record fields to pass.
- [ ] **Step 2:** Run Backend typecheck and the first-version RDS repository tests.
- [ ] **Step 3:** Start the Backend against `DATABASE_URL_CN` in a non-public validation process.
- [ ] **Step 4:** Execute unauthenticated route-existence smoke and authenticated read-only profile/tenant/learning/voice/service-record smoke with dedicated test tokens.
- [ ] **Step 5:** Verify company/store/membership changes fail closed.
- [ ] **Step 6:** Rehearse rollback by reconnecting validation to the unchanged Supabase source or restoring the pre-write RDS snapshot.
- [ ] **Step 7:** Stop before deployment or production cutover and request a separate release authorization.

## Current checkpoint

- Source Supabase project located and readable through the connector.
- Source aggregate: 2110 auth users, 4 companies, 7 stores, 53 active memberships.
- Fresh source-table freeze at 2026-07-12 11:38 +08:00: profiles 2110; credit transactions 98; entitlements 37; companies 4; stores 7; memberships 53; AI-point ledger 295; invites 71; store profiles 71; voice customer profiles 904; scene cards 97; voice sessions 2917; voice turns 15589; service sessions 12; segments 4; markers 0.
- Source tenant invariants pass: missing profile/company/store references 0; membership/store company mismatch 0.
- Reviewed RDS apply candidate exists locally and has no unresolved Supabase-specific SQL findings.
- Production target confirmed as Aliyun RDS PostgreSQL 16 instance `pgm-bp147r6429pa3vcr`, database `meiye_huajing_app`, private-only network access. The application secret remains in Aliyun KMS / SAE and is not copied into this plan or a tracked env file.
- The target was not empty: it already contained the June 28/29 migration and was serving SAE. This run therefore used insert-only, `ON CONFLICT DO NOTHING` incremental closure and preserved all RDS-only rows.
- Incremental data closure completed on 2026-07-12: profiles 10, membership dependencies 2, invites 5, voice customer profiles 3, voice sessions 12, and voice turns 14. Exact-ID containment passed for all 46 inserted rows.
- Post-migration target counts: profiles 2118; credit transactions 98; entitlements 37; companies 5; stores 8; memberships 60; AI-point ledger 295; invites 73; store profiles 71; voice customer profiles 904; scene cards 97; voice sessions 2921; voice turns 15601; service sessions 12; service segments 6; service markers 0.
- Eight tenant and store foreign-key/scope invariants total 0 violations.
- `app_learning_progress_events` did not exist in Supabase or RDS. The approved tracked RDS schema (SHA256 `b981d5f9f2ac14eccad694b974a2aaf7f3d8162e5db2997d844b3290e16dbbb0`) was installed on RDS. Verification: table present, 0 rows, 2 required indexes, 1 primary key, 1 unique constraint, 4 foreign keys, and 6 check constraints.
- Aliyun CLI verification: no public endpoint, one private connection, no open whitelist entry, and no temporary migration-named whitelist group.
- No deployment, production cutover, push, commit, secret mutation, authenticated API smoke, or rollback rehearsal was performed. Supabase Auth remains the temporary identity issuer.
