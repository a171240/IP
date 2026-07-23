/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const migrationPath = path.join(root, "deploy", "app-access-control-v1.sql")
const rollbackPath = path.join(root, "deploy", "app-access-control-v1.rollback.sql")
const backfillPath = path.join(root, "scripts", "dry-run-app-identity-backfill.mjs")
const appAuthPath = path.join(root, "lib", "aliyun-rds", "app-auth.server.ts")
const wechatAuthRoutePath = path.join(
  root,
  "app",
  "api",
  "app",
  "auth",
  "wechat",
  "route.ts",
)
const repositoryPath = path.join(
  root,
  "lib",
  "aliyun-rds",
  "repositories",
  "app-access-control.server.ts",
)
const accountProfileRepositoryPath = path.join(
  root,
  "lib",
  "aliyun-rds",
  "repositories",
  "account-profile.server.ts",
)
const storeAdminRepositoryPath = path.join(
  root,
  "lib",
  "aliyun-rds",
  "repositories",
  "store-admin.server.ts",
)

test("V1 migration separates canonical identity, contacts, trials, memberships, entitlements and audit", () => {
  const sql = fs.readFileSync(migrationPath, "utf8")

  for (const table of [
    "app_canonical_users",
    "app_auth_identities",
    "app_identity_links",
    "app_identity_reviews",
    "app_verified_contacts",
    "app_personal_trials",
    "app_authorization_versions",
    "app_authorization_audit_events",
    "app_idempotency_records",
    "app_membership_entitlements",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"), table)
  }

  assert.match(sql, /app_access_control_v1_schema_conflict/i)
  assert.match(sql, /session_limit integer not null default 2/i)
  assert.match(sql, /data_domain text not null default 'personal_trial'/i)
  assert.match(sql, /client_session_id text/i)
  assert.match(sql, /canonical_user_id uuid/i)
  assert.match(sql, /authorization_version bigint/i)
  assert.match(sql, /normalized_value_hash text not null/i)
  assert.match(sql, /encrypted_value text not null/i)
  assert.match(sql, /app_verified_contacts_mark_ambiguity/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(
    sql,
    /create trigger app_verified_contacts_mark_ambiguity\s+before insert/i,
  )
  assert.match(sql, /voice_coach_sessions_domain_scope_check/i)
  assert.match(
    sql,
    /data_domain = 'personal_trial'[\s\S]*company_id is null[\s\S]*store_id is null[\s\S]*membership_id is null/i,
  )
  assert.doesNotMatch(sql, /\bnormalized_value text\b/i)
  assert.doesNotMatch(
    sql,
    /alter table public\.entitlements[\s\S]*add column feature_keys/i,
  )
  assert.match(
    sql,
    /create unique index voice_coach_trial_client_session_idx\s+on public\.voice_coach_sessions\(canonical_user_id, client_session_id\)/i,
  )
  assert.doesNotMatch(sql, /\b(phone|mobile).*(membership|entitlement)/i)
})

test("V1 rollback is explicit and removes only V1-owned schema additions", () => {
  const sql = fs.readFileSync(rollbackPath, "utf8")

  assert.match(sql, /app_access_control_v1_rollback_blocked_business_data/i)
  assert.match(sql, /app_membership_entitlements/i)
  assert.match(sql, /app_identity_reviews/i)
  assert.match(sql, /drop table if exists public\.app_idempotency_records/i)
  assert.match(sql, /drop table if exists public\.app_auth_identities/i)
  assert.match(sql, /alter table public\.voice_coach_sessions[\s\S]*drop column if exists data_domain/i)
  assert.doesNotMatch(sql, /drop table if exists public\.(profiles|entitlements|mp_account_memberships|voice_coach_sessions)\b/i)
})

test("backfill utility is read-only dry-run and guarded to local databases", () => {
  const source = fs.readFileSync(backfillPath, "utf8")

  assert.match(source, /assertLocalDatabaseUrl/)
  assert.match(source, /--dry-run/)
  assert.match(source, /select/i)
  assert.doesNotMatch(source, /\b(insert|update|delete|merge|truncate|alter|drop)\b/i)
})

test("access-control repository exposes the canonical V1 operations", () => {
  const source = fs.readFileSync(repositoryPath, "utf8")

  for (const operation of [
    "ensureAppCanonicalIdentityAndTrial",
    "getAppAccessSnapshot",
    "consumePersonalTrialVoiceSession",
    "grantAppAccess",
  ]) {
    assert.match(source, new RegExp(`export async function ${operation}\\b`), operation)
  }

  assert.match(source, /app_identity_review_required/)
  assert.match(source, /persistAppIdentityReview/)
  assert.match(source, /membership_id/)
  assert.match(source, /membership_conflict/)
  assert.match(
    source,
    /canonical_user_id is null[\s\S]*user_id = \$4/i,
  )
  assert.doesNotMatch(
    source,
    /from public\.entitlements where canonical_user_id/i,
  )
})

test("canonical WeChat identity uses only admin-controlled app_metadata", () => {
  const repository = fs.readFileSync(repositoryPath, "utf8")
  const appAuth = fs.readFileSync(appAuthPath, "utf8")
  const wechatAuthRoute = fs.readFileSync(wechatAuthRoutePath, "utf8")

  assert.match(repository, /recordValue\(user\.app_metadata\)/)
  assert.doesNotMatch(repository, /recordValue\(user\.user_metadata\)/)
  assert.match(appAuth, /app_metadata:\s*supabaseUser\.app_metadata/)
  assert.match(wechatAuthRoute, /app_metadata:\s*trustedWechatIdentityMetadata/)
  assert.match(wechatAuthRoute, /app_metadata:\s*nextAppMetadata/)
  assert.match(
    wechatAuthRoute,
    /WECHAT_OPEN_PLATFORM_SCOPE_ID[\s\S]*unionid[\s\S]*scopedIdentityKey/,
  )
  assert.match(wechatAuthRoute, /legacyUnionIdentityKey/)
  assert.match(wechatAuthRoute, /isTrustedLegacyUnionUser/)
  assert.match(wechatAuthRoute, /legacy_identity_review_required/)
  assert.match(wechatAuthRoute, /updateUserById[\s\S]*updatedUserError/)
  assert.match(wechatAuthRoute, /profileUpsertError/)
})

test("profile authorization is read from one repeatable-read database snapshot", () => {
  const source = fs.readFileSync(accountProfileRepositoryPath, "utf8")

  assert.match(source, /withAliyunRdsTransaction/)
  assert.match(
    source,
    /set transaction isolation level repeatable read read only/i,
  )
  assert.match(source, /loadAppAccountReadSnapshotWithClient/)
  assert.match(source, /resolveAppCanonicalAuthorizationWithClient/)
})

test("formal store reporting explicitly excludes personal trial sessions", () => {
  const source = fs.readFileSync(storeAdminRepositoryPath, "utf8")

  assert.match(
    source,
    /from public\.voice_coach_sessions[\s\S]*data_domain = 'store'/i,
  )
})
