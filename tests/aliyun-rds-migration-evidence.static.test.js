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
  assert.equal(template.sourceInventory.appApiRouteCount, 30)
  assert.equal(template.sourceInventory.appApiRoutesWithSupabase, 30)
  assert.equal(template.sourceInventory.appApiRoutesWithSupabaseDataAccess, 29)
  assert.equal(template.sourceInventory.firstVersionRdsRouteCount, 25)
  assert.equal(template.sourceInventory.firstVersionRdsRoutesWithSupabase, 25)
  assert.equal(template.sourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess, 25)
  assert.equal(template.sourceInventory.deferredAppApiRouteCount, 5)
  assert.equal(template.sourceInventory.deferredAppApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(template.sourceInventory.databaseUrlCnReferencedInSource, true)
  assert.equal(template.sourceInventory.postgresDataAccessAdapterDetected, true)
  assert.match(template.sourceInventory.evidence, /lib\/aliyun-rds\/postgres\.server\.ts/)
  assert.match(template.sourceInventory.evidence, /deploy\/aliyun-production-cn\.rds-first-version-schema-map\.json/)
  assert.match(template.sourceInventory.evidence, /deploy\/app-api-production-cn\.bridge-map\.json/)
  assert.equal(template.security.containsDatabasePassword, false)
  assert.equal(template.security.containsConnectionString, false)
  assert.equal(template.security.containsSupabaseServiceRoleKey, false)
  assert.ok(template.verifyCommands.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))

  assert.doesNotMatch(JSON.stringify(template), secretLike)
})

test("Aliyun RDS migration evidence check reports missing local closure without values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
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
  assert.equal(report.summary.appApiRouteCount, 30)
  assert.equal(report.summary.appApiRoutesWithSupabase, 30)
  assert.equal(report.summary.appApiRoutesWithSupabaseDataAccess, 29)
  assert.equal(report.summary.firstVersionRdsRouteCount, 25)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabase, 25)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabaseDataAccess, 25)
  assert.equal(report.summary.deferredAppApiRouteCount, 5)
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

test("Aliyun RDS migration evidence markdown is value-free", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-evidence-"))
  const markdownPath = path.join(tmpdir, "rds-evidence.md")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
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
  assert.match(markdown, /firstVersionRdsRoutesWithSupabaseDataAccess: 25\/25/)
  assert.match(markdown, /deferredAppApiRoutesWithSupabaseDataAccess: 4\/5/)
  assert.match(markdown, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /DATABASE_URL_CN/)
  assert.match(markdown, /Do not store DATABASE_URL_CN/)
  assert.doesNotMatch(output + markdown, secretLike)
})
