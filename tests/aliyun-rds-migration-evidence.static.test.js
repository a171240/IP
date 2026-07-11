/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

test("Aliyun RDS migration evidence command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const template = readJson("deploy", "aliyun-production-cn.rds-migration.example.json")

  assert.equal(pkg.scripts["aliyun:rds:migration:evidence"], "node ./scripts/check-aliyun-rds-migration-evidence.mjs --allow-incomplete")
  assert.equal(pkg.scripts["aliyun:rds:migration:evidence:init"], "node ./scripts/check-aliyun-rds-migration-evidence.mjs --allow-incomplete --init-local")
  assert.equal(pkg.scripts["aliyun:rds:migration:evidence:strict"], "node ./scripts/check-aliyun-rds-migration-evidence.mjs")
  assert.equal(pkg.scripts["aliyun:rds:migration:evidence:test"], "node --test tests/aliyun-rds-migration-evidence.static.test.js")
  assert.match(predeploy, /aliyun:rds:migration:evidence:test/)
  assert.match(predeploy, /aliyun:rds:migration:evidence/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:rds:migration:evidence/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:evidence:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:evidence"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:rds:migration:evidence"))
  assert.match(releaseArtifacts, /rds-migration-evidence\.json/)
  assert.match(releaseArtifacts, /rdsMigrationEvidence/)

  assert.equal(template.schemaVersion, 1)
  assert.equal(template.environment, "production-cn")
  assert.equal(template.rdsPostgres.provider, "Aliyun RDS PostgreSQL")
  assert.equal(template.rdsPostgres.region, "cn-hangzhou")
  assert.equal(template.rdsPostgres.databaseUrlCnSecretTarget, "Aliyun KMS / Secrets Manager / SAE secret env")
  assert.equal(template.sourceInventory.appApiRouteCount, 59)
  assert.equal(template.sourceInventory.appApiRoutesWithSupabase, 57)
  assert.equal(template.sourceInventory.appApiRoutesWithSupabaseDataAccess, 2)
  assert.equal(template.sourceInventory.firstVersionRdsRouteCount, 28)
  assert.equal(template.sourceInventory.firstVersionRdsRoutesWithSupabase, 26)
  assert.equal(template.sourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(template.sourceInventory.deferredAppApiRouteCount, 31)
  assert.equal(template.sourceInventory.deferredAppApiRoutesWithSupabaseDataAccess, 2)
  assert.equal(template.sourceInventory.databaseUrlCnReferencedInSource, true)
  assert.equal(template.sourceInventory.postgresDataAccessAdapterDetected, true)
  assert.match(template.sourceInventory.evidence, /lib\/aliyun-rds\/postgres\.server\.ts/)
  assert.match(template.sourceInventory.evidence, /deploy\/aliyun-production-cn\.rds-first-version-schema-map\.json/)
  assert.match(template.sourceInventory.evidence, /deploy\/app-api-production-cn\.bridge-map\.json/)
  assert.equal(template.migration.schemaCompatibilityReviewed, false)
  assert.equal(template.migration.supabaseSpecificSqlResolved, false)
  assert.equal(template.migration.rdsExtensionSupportConfirmed, false)
  assert.equal(template.security.containsDatabasePassword, false)
  assert.equal(template.security.containsConnectionString, false)
  assert.equal(template.security.containsSupabaseServiceRoleKey, false)
  assert.ok(template.verifyCommands.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))

  assert.doesNotMatch(JSON.stringify(template), secretLike)
})

test("Aliyun RDS migration evidence check reports missing local closure without values", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-evidence-missing-"))
  const missingLocalPath = path.join(tmpdir, "missing-rds-migration.local.json")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--local",
    missingLocalPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, false)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.template.ready, true)
  assert.equal(report.local.exists, false)
  assert.deepEqual(report.local.blockers, ["file_missing"])
  assert.equal(report.summary.appApiRouteCount, 59)
  assert.equal(report.summary.appApiRoutesWithSupabase, 57)
  assert.equal(report.summary.appApiRoutesWithSupabaseDataAccess, 2)
  assert.equal(report.summary.firstVersionRdsRouteCount, 28)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabase, 26)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(report.summary.deferredAppApiRouteCount, 31)
  assert.equal(report.summary.deferredAppApiRoutesWithSupabaseDataAccess, 2)
  assert.equal(report.summary.databaseUrlCnReferencedInSource, true)
  assert.equal(report.summary.postgresDataAccessAdapterDetected, true)
  assert.deepEqual(report.summary.requiredAuthorizationPackets, ["P11_ALIYUN_RDS_DATA_MIGRATION"])
  assert.deepEqual(report.summary.writebackBlockingGroups, ["rdsInstanceAndSecret"])
  assert.equal(report.summary.rdsMigrationPlanReady, false)
  assert.equal(report.summary.rdsMigrationPhaseReady, "0/5")
  assert.deepEqual(report.summary.rdsMigrationNextPhaseIds, [
    "source_inventory_preflight",
    "compatibility_review",
    "rds_instance_and_secret",
  ])
  assert.equal(report.summary.rdsLocalReviewCanStartNow, true)
  assert.equal(report.summary.rdsCanStartP11AfterActionTimeConfirmation, true)
  assert.equal(report.summary.rdsCompatibilityReviewCanStartNow, false)
  assert.equal(report.summary.rdsSchemaApplyBlockedByCompatibilityReview, true)
  assert.equal(report.rdsMigrationPlan.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.equal(report.rdsMigrationPlan.cloudOrSecretActionRequired, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.canStartP11AfterActionTimeConfirmation, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.compatibilityReviewCanStartNow, false)
  assert.equal(report.rdsMigrationPlan.executionReadiness.schemaApplyBlockedByCompatibilityReview, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.rdsInstanceAndSecretReady, false)
  assert.equal(report.rdsMigrationPlan.executionReadiness.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.equal(
    report.rdsMigrationPlan.executionReadiness.databaseUrlCnSecretTarget,
    "Aliyun KMS / Secrets Manager / SAE secret env",
  )
  assert.ok(report.rdsMigrationPlan.executionReadiness.localReviewCloseFields.includes("migration.schemaCompatibilityReviewed"))
  assert.ok(report.rdsMigrationPlan.executionReadiness.cloudSecretWritebackFields.includes("rdsPostgres.databaseUrlCnSecretImported=true"))
  assert.equal(
    report.rdsMigrationPlan.executionReadiness.nextOperatorDecision,
    "create_rds_import_database_url_secret_then_validate_schema_data_and_smoke",
  )
  assert.ok(report.rdsMigrationPlan.executionReadiness.verificationCommands.includes("corepack pnpm aliyun:sensitive:blockers:backend"))
  assert.ok(report.rdsMigrationPlan.executionReadiness.safetyBoundary.some((item) => item.includes("Do not apply schema SQL")))
  assert.equal(report.rdsMigrationPlan.compatibilityReview.packageOk, true)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.reviewRequired, true)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.findingCount, 182)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.affectedSourceFileCount, 10)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.checklistItemCount, 7)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.status, "open")
  assert.equal(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.itemCount, 7)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.readyToApplySchema, false)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.status, "blocked_supabase_specific_sql_present")
  assert.equal(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.readyToApplySchema, false)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.findingCount, 182)
  assert.ok(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.categories.includes("supabase_auth_schema"))
  assert.ok(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.categories.includes("supabase_auth_uid"))
  assert.equal(
    report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateAudit.status,
    "ready_after_target_rds_engine_confirmation",
  )
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateAudit.readyToApplySchema, true)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateAudit.findingCount, 0)
  assert.deepEqual(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateAudit.categories, [])
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.removedStatementCount, 113)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.rewrittenStatementCount, 9)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.status, "ready_after_target_rds_engine_confirmation")
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.readyToApplySchema, true)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.itemCount, 0)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.findingCount, 0)
  assert.deepEqual(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.categories, [])
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.requiredWriteBackFields.includes("migration.appApiSmokeOnRdsPassed"), false)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.requiredWriteBackFields.includes("migration.rdsExtensionSupportConfirmed"), false)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.resolvedItemCount, 1)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.resolvedFindingCount, 23)
  assert.deepEqual(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.resolvedCategories, ["extension_review"])
  assert.equal(
    report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.resolvedItems[0].acceptanceEvidence,
    "aliyun_official_rds_postgresql_extensions_standard_edition_pg16_pgcrypto_1_3_2026-06-27",
  )
  assert.ok(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.removedCategories.some((item) => item.code === "policy_statement"))
  assert.ok(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.removedCategories.some((item) => item.code === "deferred_auth_uid_function:consume_credits"))
  assert.ok(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.removedCategories.some((item) => item.code === "deferred_out_of_scope_xhs_drafts"))
  assert.ok(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.rewrittenCategories.some((item) => item.code === "supabase_auth_schema"))
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.rewrittenCategories.some((item) => item.code === "supabase_auth_uid"), false)
  assert.ok(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.requiredWriteBackFields.includes("migration.schemaCompatibilityReviewed"))
  assert.ok(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.items.some((item) =>
    item.code === "supabase_auth_schema" &&
    item.defaultProposedDisposition === "replace_supabase_auth_schema_with_app_identity_model"))
  assert.ok(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.items.some((item) =>
    item.code === "supabase_auth_uid" &&
    item.defaultProposedDisposition === "rewrite_to_backend_enforced_identity_and_tenant_scope"))
  assert.deepEqual(report.rdsMigrationPlan.compatibilityReview.blockingFields, ["file_missing"])
  assert.deepEqual(report.rdsMigrationPlan.compatibilityReview.categories.map((item) => item.code), [
    "extension_review",
    "policy_statement",
    "row_level_security",
    "supabase_auth_schema",
    "supabase_auth_uid",
    "supabase_service_role",
    "supabase_storage_schema",
  ])
  assert.equal(
    report.rdsMigrationPlan.compatibilityReview.packageDigests.schemaSqlSha256,
    "9da94ef44b7a62127a02b40d6dd9cce8822dd19b1c531472af4fceaa4a71abb7",
  )
  assert.equal(report.rdsMigrationPlan.phases.length, 5)
  assert.deepEqual(report.rdsMigrationPlan.phases.map((item) => item.id), [
    "source_inventory_preflight",
    "compatibility_review",
    "rds_instance_and_secret",
    "schema_data_validation",
    "app_api_smoke_and_rollback",
  ])
  const sourceInventoryPhase = report.rdsMigrationPlan.phases.find((item) => item.id === "source_inventory_preflight")
  assert.ok(sourceInventoryPhase.expectedEvidence.includes("firstVersionRdsRouteCount=28"))
  assert.ok(sourceInventoryPhase.expectedEvidence.includes("firstVersionRdsRoutesWithSupabaseDataAccess=0"))
  assert.equal(sourceInventoryPhase.expectedEvidence.includes("firstVersionRdsRouteCount=25"), false)
  assert.ok(report.rdsMigrationPlan.phases.every((item) => item.blockerFields.includes("file_missing")))
  assert.equal(report.sourceInventory.currentDataLayer, "Supabase migration source / legacy compatibility only")
  assert.equal(report.sourceInventory.formalTarget, "Aliyun RDS PostgreSQL")
  assert.equal(report.writebackPlan.groups[0].id, "rdsInstanceAndSecret")
  assert.ok(report.writebackPlan.groups[0].writeTargets.some((item) => item.includes("DATABASE_URL_CN")))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun RDS migration evidence init creates a non-secret local evidence scaffold", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-evidence-init-"))
  const localPath = path.join(tmpdir, "rds-migration.local.json")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--init-local",
    "--local",
    localPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)
  const local = JSON.parse(fs.readFileSync(localPath, "utf8"))

  assert.equal(report.ok, false)
  assert.equal(report.localInit.requested, true)
  assert.equal(report.localInit.written, true)
  assert.equal(report.localInit.skipped, false)
  assert.equal(report.local.exists, true)
  assert.equal(report.local.ready, false)
  assert.equal(report.summary.rdsMigrationPhaseReady, "1/5")
  assert.deepEqual(report.summary.rdsMigrationNextPhaseIds, ["compatibility_review", "rds_instance_and_secret"])
  assert.equal(report.summary.rdsCanStartP11AfterActionTimeConfirmation, true)
  assert.equal(report.summary.rdsCompatibilityReviewCanStartNow, true)
  assert.equal(report.summary.rdsSchemaApplyBlockedByCompatibilityReview, true)
  assert.equal(report.rdsMigrationPlan.phases.find((item) => item.id === "source_inventory_preflight").ready, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.canStartP11AfterActionTimeConfirmation, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.compatibilityReviewCanStartNow, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.schemaApplyBlockedByCompatibilityReview, true)
  assert.equal(report.rdsMigrationPlan.executionReadiness.appApiSmokeBlockedUntilSchemaData, true)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.findingCount, 182)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.checklistItemCount, 7)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.itemCount, 7)
  assert.ok(report.rdsMigrationPlan.compatibilityReview.dispositionPlan.closeConditions.some((item) =>
    item.includes("migration.supabaseSpecificSqlResolved=true")))
  assert.equal(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.status, "blocked_supabase_specific_sql_present")
  assert.equal(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.readyToApplySchema, false)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.findingCount, 182)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateAudit.findingCount, 0)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateAudit.readyToApplySchema, true)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.removedStatementCount, 113)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateRemoval.rewrittenStatementCount, 9)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.itemCount, 0)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.findingCount, 0)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.resolvedItemCount, 1)
  assert.equal(report.rdsMigrationPlan.compatibilityReview.rdsApplyCandidateReviewPlan.resolvedFindingCount, 23)
  assert.ok(report.rdsMigrationPlan.compatibilityReview.schemaApplyCandidateAudit.byCode.some((item) =>
    item.code === "supabase_storage_schema" &&
    item.sourcePaths.includes("rds-schema.sql")))
  assert.deepEqual(report.rdsMigrationPlan.compatibilityReview.blockingFields, [
    "migration.schemaCompatibilityReviewed",
    "migration.supabaseSpecificSqlResolved",
    "migration.rdsExtensionSupportConfirmed",
  ])
  assert.ok(report.rdsMigrationPlan.compatibilityReview.categories.find((item) =>
    item.code === "supabase_storage_schema" &&
    item.defaultProposedDisposition === "exclude_from_rds_apply_and_replace_with_oss_boundary" &&
    item.evidenceWriteBackFields.includes("cloudConfirmations.items.oss")))
  assert.deepEqual(
    report.rdsMigrationPlan.phases.find((item) => item.id === "compatibility_review").blockerFields,
    [
      "migration.schemaCompatibilityReviewed",
      "migration.supabaseSpecificSqlResolved",
      "migration.rdsExtensionSupportConfirmed",
    ],
  )
  assert.ok(
    report.rdsMigrationPlan.phases
      .find((item) => item.id === "rds_instance_and_secret")
      .writeTargets
      .some((item) => item.includes("DATABASE_URL_CN value only")),
  )
  assert.ok(!report.local.blockers.includes("file_missing"))
  assert.ok(report.local.blockers.includes("rdsPostgres.confirmed"))
  assert.ok(report.local.blockers.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(report.local.blockers.includes("migration.schemaCompatibilityReviewed"))
  assert.ok(report.local.blockers.includes("migration.supabaseSpecificSqlResolved"))
  assert.ok(report.local.blockers.includes("migration.rdsExtensionSupportConfirmed"))
  assert.ok(!report.local.blockers.includes("migration.dataAccessAdapterReady"))
  assert.equal(local.schemaVersion, 1)
  assert.equal(local.environment, "production-cn")
  assert.equal(local.operator, "codex-local-rds-evidence-init")
  assert.equal(local.rdsPostgres.confirmed, false)
  assert.equal(local.rdsPostgres.provider, "Aliyun RDS PostgreSQL")
  assert.equal(local.rdsPostgres.region, "cn-hangzhou")
  assert.equal(local.rdsPostgres.databaseUrlCnSecretImported, false)
  assert.equal(local.sourceInventory.generatedBy, "corepack pnpm aliyun:rds:migration:plan")
  assert.equal(local.sourceInventory.appApiRouteCount, 59)
  assert.equal(local.sourceInventory.firstVersionRdsRouteCount, 28)
  assert.equal(local.sourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(local.sourceInventory.databaseUrlCnReferencedInSource, true)
  assert.equal(local.sourceInventory.postgresDataAccessAdapterDetected, true)
  assert.equal(local.migration.schemaInventoryReviewed, true)
  assert.equal(local.migration.schemaCompatibilityReviewed, false)
  assert.equal(local.migration.supabaseSpecificSqlResolved, false)
  assert.equal(local.migration.rdsExtensionSupportConfirmed, false)
  assert.equal(local.migration.dataAccessAdapterReady, true)
  assert.equal(local.security.containsDatabasePassword, false)
  assert.equal(local.security.containsConnectionString, false)
  assert.equal(local.security.containsSupabaseServiceRoleKey, false)

  assert.doesNotMatch(output + JSON.stringify(local), secretLike)
})

test("Aliyun RDS migration evidence init does not overwrite an existing local evidence file", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-evidence-init-existing-"))
  const localPath = path.join(tmpdir, "rds-migration.local.json")
  const existing = {
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: "2026-06-24T00:00:00.000Z",
    operator: "existing-operator",
    notes: "existing non-secret local evidence",
    rdsPostgres: {
      confirmed: false,
      provider: "Aliyun RDS PostgreSQL",
      region: "cn-hangzhou",
      instanceId: "TODO_NON_SECRET_RDS_INSTANCE_ID",
      instanceName: "meiye-huajing-app-api-production-cn",
      engine: "PostgreSQL",
      engineVersion: "TODO_POSTGRES_VERSION",
      networkAccess: "TODO_VPC_OR_SAE_INTERNAL_ACCESS",
      databaseName: "TODO_DATABASE_NAME",
      databaseAccountReady: false,
      databaseUrlCnSecretImported: false,
      databaseUrlCnSecretTarget: "Aliyun KMS / Secrets Manager / SAE secret env",
      evidence: "TODO_NON_SECRET_RDS_CONSOLE_EVIDENCE",
    },
    sourceInventory: {
      generatedBy: "corepack pnpm aliyun:rds:migration:plan",
      appApiRouteCount: 58,
      appApiRoutesWithSupabase: 56,
      appApiRoutesWithSupabaseDataAccess: 2,
      firstVersionRdsRouteCount: 25,
      firstVersionRdsRoutesWithSupabase: 23,
      firstVersionRdsRoutesWithSupabaseDataAccess: 0,
      deferredAppApiRouteCount: 33,
      deferredAppApiRoutesWithSupabaseDataAccess: 2,
      tableCount: 44,
      rpcCount: 3,
      storageBucketCount: 1,
      databaseUrlCnReferencedInSource: true,
      postgresDataAccessAdapterDetected: true,
      evidence: "existing_non_secret_source_inventory_evidence",
    },
    migration: {
      schemaInventoryReviewed: false,
      dataAccessAdapterReady: false,
      schemaMigrated: false,
      dataMigrated: false,
      rowCountValidationPassed: false,
      criticalRecordValidationPassed: false,
      appApiSmokeOnRdsPassed: false,
      supabaseNoLongerFormalTarget: false,
      rollbackRunbookReviewed: false,
      rollbackValidationPassed: false,
      evidence: "TODO_NON_SECRET_MIGRATION_AND_ROLLBACK_EVIDENCE",
    },
    security: {
      containsDatabasePassword: false,
      containsConnectionString: false,
      containsSupabaseServiceRoleKey: false,
      secretPolicy: "Do not store DATABASE_URL_CN, database password, dump contents, Supabase service role key, AccessKeySecret, AppSecret, STS token, or cookie in git, JSON, Markdown, Docker image, APP bundle, or mini-program package.",
    },
    verifyCommands: ["corepack pnpm aliyun:rds:migration:evidence:strict"],
  }
  fs.writeFileSync(localPath, JSON.stringify(existing, null, 2))

  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--init-local",
    "--local",
    localPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)
  const after = JSON.parse(fs.readFileSync(localPath, "utf8"))

  assert.equal(report.localInit.requested, true)
  assert.equal(report.localInit.written, false)
  assert.equal(report.localInit.skipped, true)
  assert.equal(report.localInit.reason, "local_file_already_exists")
  assert.equal(after.operator, "existing-operator")
  assert.deepEqual(after, existing)
  assert.doesNotMatch(output + JSON.stringify(after), secretLike)
})

test("Aliyun RDS migration evidence markdown is value-free", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-evidence-"))
  const missingLocalPath = path.join(tmpdir, "missing-rds-migration.local.json")
  const markdownPath = path.join(tmpdir, "rds-evidence.md")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--local",
    missingLocalPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /RDS migration evidence check/)
  assert.match(markdown, /localExists: false/)
  assert.match(markdown, /writebackBlockingGroups: rdsInstanceAndSecret/)
  assert.match(markdown, /rdsMigrationPhaseReady: 0\/5/)
  assert.match(markdown, /rdsMigrationNextPhaseIds: source_inventory_preflight, compatibility_review, rds_instance_and_secret/)
  assert.match(markdown, /rdsCanStartP11AfterActionTimeConfirmation: true/)
  assert.match(markdown, /rdsCompatibilityReviewCanStartNow: false/)
  assert.match(markdown, /rdsSchemaApplyBlockedByCompatibilityReview: true/)
  assert.match(markdown, /RDS Migration Plan/)
  assert.match(markdown, /execution_readiness/)
  assert.match(markdown, /canStartP11AfterActionTimeConfirmation: true/)
  assert.match(markdown, /compatibilityReviewCanStartNow: false/)
  assert.match(markdown, /schemaApplyBlockedByCompatibilityReview: true/)
  assert.match(markdown, /databaseUrlCnSecretTarget: Aliyun KMS \/ Secrets Manager \/ SAE secret env/)
  assert.match(markdown, /nextOperatorDecision: create_rds_import_database_url_secret_then_validate_schema_data_and_smoke/)
  assert.match(markdown, /compatibility_review_package/)
  assert.match(markdown, /compatibility_disposition_plan/)
  assert.match(markdown, /rds_apply_candidate/)
  assert.match(markdown, /rds_apply_candidate_review_plan/)
  assert.match(markdown, /findingCount: 182/)
  assert.match(markdown, /findingCount: 0/)
  assert.match(markdown, /itemCount: 0/)
  assert.match(markdown, /resolvedItemCount: 1/)
  assert.match(markdown, /resolvedFindingCount: 23/)
  assert.match(markdown, /resolvedCategories: extension_review/)
  assert.doesNotMatch(markdown, /review:backend_request_context/)
  assert.doesNotMatch(markdown, /review:extension_review: findings=22/)
  assert.doesNotMatch(markdown, /review:supabase_auth_schema/)
  assert.doesNotMatch(markdown, /review:supabase_auth_uid/)
  assert.match(markdown, /removedStatementCount: 113/)
  assert.match(markdown, /rewrittenStatementCount: 9/)
  assert.match(markdown, /checklistItemCount: 7/)
  assert.match(markdown, /defaultProposedDisposition: replace_supabase_auth_schema_with_app_identity_model/)
  assert.match(markdown, /defaultProposedDisposition: rewrite_to_backend_enforced_identity_and_tenant_scope/)
  assert.match(markdown, /defaultProposedDisposition: exclude_from_rds_apply_and_replace_with_oss_boundary/)
  assert.match(markdown, /schemaSqlSha256: 9da94ef44b7a62127a02b40d6dd9cce8822dd19b1c531472af4fceaa4a71abb7/)
  assert.match(markdown, /rdsApplyCandidateSqlSha256: ad3b6c19d853459a8eaba4f3cda171869d338c4478b4d3b00bfa5c518f38b855/)
  assert.match(markdown, /validationSqlSha256: 79e9349d41191f1ea7359e512a7fea0c4c9881f359977af65e32942bd63f332c/)
  assert.match(markdown, /source_inventory_preflight/)
  assert.match(markdown, /compatibility_review/)
  assert.match(markdown, /rds_instance_and_secret/)
  assert.match(markdown, /schema_data_validation/)
  assert.match(markdown, /app_api_smoke_and_rollback/)
  assert.match(markdown, /extension_review/)
  assert.match(markdown, /policy_statement/)
  assert.match(markdown, /row_level_security/)
  assert.match(markdown, /supabase_auth_schema/)
  assert.match(markdown, /supabase_auth_uid/)
  assert.match(markdown, /supabase_service_role/)
  assert.match(markdown, /supabase_storage_schema/)
  assert.match(markdown, /firstVersionRdsRoutesWithSupabaseDataAccess: 0\/28/)
  assert.match(markdown, /deferredAppApiRoutesWithSupabaseDataAccess: 2\/31/)
  assert.match(markdown, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /DATABASE_URL_CN/)
  assert.match(markdown, /Supabase SQL compatibility review completed/)
  assert.match(markdown, /Supabase-specific auth\/storage\/RLS\/service_role SQL resolved/)
  assert.match(markdown, /Aliyun RDS PostgreSQL extension support confirmed/)
  assert.match(markdown, /Do not store DATABASE_URL_CN/)
  assert.doesNotMatch(output + markdown, secretLike)
})

test("tracked Aliyun RDS migration evidence doc is explicitly historical and non-current", () => {
  const doc = read("docs", "app-production-cn-rds-migration-evidence.md")

  assert.match(doc, /APP production-cn RDS migration evidence check/)
  assert.match(doc, /HISTORICAL_EXTERNAL_EVIDENCE_NOT_CURRENT/)
  assert.match(doc, /2026-07-01 external snapshot from `\/Users\/Admin\/Documents\/美业话镜APP\/handoff\/IP`/)
  assert.match(doc, /does not satisfy the current controller evidence gate/i)
  assert.match(doc, /Current verification requires a fresh local evidence file/i)
  assert.doesNotMatch(doc, secretLike)
})
