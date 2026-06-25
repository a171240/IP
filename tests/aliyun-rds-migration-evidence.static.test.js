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
  assert.equal(template.sourceInventory.appApiRouteCount, 31)
  assert.equal(template.sourceInventory.appApiRoutesWithSupabase, 29)
  assert.equal(template.sourceInventory.appApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(template.sourceInventory.firstVersionRdsRouteCount, 25)
  assert.equal(template.sourceInventory.firstVersionRdsRoutesWithSupabase, 23)
  assert.equal(template.sourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(template.sourceInventory.deferredAppApiRouteCount, 6)
  assert.equal(template.sourceInventory.deferredAppApiRoutesWithSupabaseDataAccess, 4)
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
  assert.equal(report.summary.appApiRouteCount, 31)
  assert.equal(report.summary.appApiRoutesWithSupabase, 29)
  assert.equal(report.summary.appApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(report.summary.firstVersionRdsRouteCount, 25)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabase, 23)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(report.summary.deferredAppApiRouteCount, 6)
  assert.equal(report.summary.deferredAppApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(report.summary.databaseUrlCnReferencedInSource, true)
  assert.equal(report.summary.postgresDataAccessAdapterDetected, true)
  assert.deepEqual(report.summary.requiredAuthorizationPackets, ["P11_ALIYUN_RDS_DATA_MIGRATION"])
  assert.deepEqual(report.summary.writebackBlockingGroups, ["rdsInstanceAndSecret"])
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
  assert.equal(local.sourceInventory.appApiRouteCount, 31)
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
      appApiRouteCount: 31,
      appApiRoutesWithSupabase: 29,
      appApiRoutesWithSupabaseDataAccess: 4,
      firstVersionRdsRouteCount: 25,
      firstVersionRdsRoutesWithSupabase: 23,
      firstVersionRdsRoutesWithSupabaseDataAccess: 0,
      deferredAppApiRouteCount: 6,
      deferredAppApiRoutesWithSupabaseDataAccess: 4,
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
  assert.match(markdown, /firstVersionRdsRoutesWithSupabaseDataAccess: 0\/25/)
  assert.match(markdown, /deferredAppApiRoutesWithSupabaseDataAccess: 4\/6/)
  assert.match(markdown, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /DATABASE_URL_CN/)
  assert.match(markdown, /Supabase SQL compatibility review completed/)
  assert.match(markdown, /Supabase-specific auth\/storage\/RLS\/service_role SQL resolved/)
  assert.match(markdown, /Aliyun RDS PostgreSQL extension support confirmed/)
  assert.match(markdown, /Do not store DATABASE_URL_CN/)
  assert.doesNotMatch(output + markdown, secretLike)
})
