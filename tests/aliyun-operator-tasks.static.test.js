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
const fixtureArgs = Object.freeze([
  "--env-file",
  "tests/fixtures/aliyun-user-action-brief/env.production-cn.fixture",
  "--cloud-confirmations",
  "tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json",
  "--rds-migration",
  "tests/fixtures/aliyun-user-action-brief/rds-migration.fixture.json",
  "--image-publish",
  "tests/fixtures/aliyun-user-action-brief/image-publish.fixture.json",
])
const onlineBoundaryCommand = "corepack pnpm aliyun:app-api:online-readonly-boundary -- --base-url https://api-cn.ipgongchang.xin --timeout-ms 15000"

function commandEnv() {
  return {
    ...process.env,
    MEIYE_ALIYUN_RUN_JSON_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-tasks-cache-")),
  }
}

function runOperatorTasks(args = ["--backend-only", ...fixtureArgs]) {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    ...args,
  ], {
    cwd: root,
    env: commandEnv(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  return { output, report: JSON.parse(output) }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, secretLike)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

function assertOneOf(actual, expected, label) {
  assert.ok(
    expected.includes(actual),
    `${label}: expected one of ${expected.join(", ")}, got ${actual}`,
  )
}

test("Aliyun operator tasks backend command is wired into scripts and deploy spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")

  assert.equal(pkg.scripts["aliyun:operator:tasks"], "node ./scripts/generate-aliyun-operator-tasks.mjs")
  assert.equal(pkg.scripts["aliyun:operator:tasks:backend"], "node ./scripts/generate-aliyun-operator-tasks.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:operator:tasks:test"], "node --test tests/aliyun-operator-tasks.static.test.js")
  assert.match(predeploy, /aliyun:operator:tasks:test/)
  assert.match(predeploy, /aliyun:operator:tasks:backend/)
  assert.equal(deploySpec.cloudConfirmations.operatorTasksCommand, "corepack pnpm aliyun:operator:tasks")
  assert.equal(deploySpec.cloudConfirmations.backendOperatorTasksCommand, "corepack pnpm aliyun:operator:tasks:backend")
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:tasks:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:tasks:backend"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:operator:tasks:backend"))
  assert.match(deploySpecChecker, /backendOperatorTasksCommand/)
})

test("Aliyun operator tasks backend-only mode reflects current Aliyun backend progress", () => {
  const { output, report } = runOperatorTasks()
  const taskIds = report.tasks.map((item) => item.id)
  const taskById = new Map(report.tasks.map((item) => [item.id, item]))

  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.containsValues, false)
  assert.deepEqual(taskIds, [
    "T02B_ALIYUN_RDS_DATA_MIGRATION",
    "T03_ALIYUN_RUNTIME_CONTAINER",
    "T03B_ALIYUN_ACR_IMAGE_PUBLISH",
    "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    "T05_ALIYUN_OSS_AUDIO_STORAGE",
    "T06_ALIYUN_ENV_IMPORT",
    "T07_ALIYUN_SLS_ALERTS",
    "T08_POSTDEPLOY_REMOTE_SMOKE",
  ])
  assert.deepEqual(report.sensitiveActionItems.map((item) => item.id), [
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  const statusCounts = report.tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] || 0) + 1
    return counts
  }, {})
  assert.equal(report.summary.total, 8)
  assert.equal(report.summary.ready, 0)
  assertOneOf(report.summary.blocked, [3, 4], "blocked summary")
  assertOneOf(report.summary.pendingCloud, [3, 4], "pendingCloud summary")
  assert.equal(report.summary.blocked, statusCounts.blocked || 0)
  assert.equal(report.summary.pendingCloud, statusCounts.pending_cloud || 0)
  assert.equal(report.summary.blocked + report.summary.pendingCloud, 7)
  assert.equal(report.summary.waitingForDeploy, 1)
  assert.deepEqual(report.summary.operatorActionPacketSummary.canStartNowPacketIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.ok(report.summary.operatorActionPacketSummary.blockedByPacketDependencies.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.summary.operatorActionPacketSummary.blockedByPacketDependencies.includes("P09_PRODUCTION_DEPLOY"))
  assert.deepEqual(report.actionAuthorization.deferredAppLaunchPacketIds, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])

  const rds = taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION")
  assert.equal(rds.status, "blocked")
  assert.equal(rds.blockerCodes.length, 16)
  assert.ok(rds.blockerCodes.includes("rdsMigration:rdsPostgres.confirmed"))
  assert.ok(rds.blockerCodes.includes("rdsMigration:rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(rds.blockerCodes.includes("rdsMigration:migration.schemaCompatibilityReviewed"))
  assert.ok(rds.blockerCodes.includes("rdsMigration:migration.supabaseSpecificSqlResolved"))
  assert.ok(rds.blockerCodes.includes("rdsMigration:migration.rollbackValidationPassed"))
  assert.ok(rds.evidence.includes("totalBlockers=16"))
  assert.ok(rds.evidence.includes("databaseUrlCnSecretImported=false"))
  assert.ok(rds.evidence.includes("schemaCompatibilityReviewed=false"))
  assert.ok(rds.evidence.includes("supabaseSpecificSqlResolved=false"))
  assert.ok(rds.evidence.includes("rdsExtensionSupportConfirmed=false"))
  assert.deepEqual(rds.canStartNowAuthorizationPacketIds, ["P11_ALIYUN_RDS_DATA_MIGRATION"])

  assert.equal(taskById.get("T03_ALIYUN_RUNTIME_CONTAINER").status, "pending_cloud")
  assert.deepEqual(taskById.get("T03_ALIYUN_RUNTIME_CONTAINER").blockedByAuthorizationPacketIds, ["P08_SAE_RUNTIME_SLS"])
  assertOneOf(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").status, ["blocked", "pending_cloud"], "T03B status")
  assert.ok(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").blockerCodes.includes("imagePublishLocal:runtime.imagePullConfigured"))
  assert.equal(taskById.get("T05_ALIYUN_OSS_AUDIO_STORAGE").status, "pending_cloud")
  assert.deepEqual(taskById.get("T05_ALIYUN_OSS_AUDIO_STORAGE").canStartNowAuthorizationPacketIds, ["P05_OSS_RAM_STS"])
  assert.equal(taskById.get("T07_ALIYUN_SLS_ALERTS").status, "pending_cloud")
  assert.deepEqual(taskById.get("T07_ALIYUN_SLS_ALERTS").blockedByAuthorizationPacketIds, ["P08_SAE_RUNTIME_SLS"])
  assert.equal(taskById.get("T06_ALIYUN_ENV_IMPORT").status, "blocked")
  assert.deepEqual(taskById.get("T06_ALIYUN_ENV_IMPORT").blockerCodes, [
    "missing_required_env:DATABASE_URL_CN",
    "envImport:confirmed",
  ])
  assert.ok(taskById.get("T06_ALIYUN_ENV_IMPORT").evidence.includes("requiredReady=24/25"))
  assert.ok(taskById.get("T06_ALIYUN_ENV_IMPORT").evidence.includes("requiredBlocking=DATABASE_URL_CN"))
  assert.equal(taskById.get("T04_ALIYUN_DOMAIN_DNS_HTTPS").status, "blocked")
  assert.ok(taskById.get("T04_ALIYUN_DOMAIN_DNS_HTTPS").blockerCodes.includes("apiDomainHttps:httpsEnabled"))
  assert.equal(taskById.get("T08_POSTDEPLOY_REMOTE_SMOKE").status, "waiting_for_deploy")
  assert.deepEqual(taskById.get("T08_POSTDEPLOY_REMOTE_SMOKE").blockerCodes, ["requires_runtime_domain_env_cloud_confirmations"])
  assert.ok(taskById.get("T08_POSTDEPLOY_REMOTE_SMOKE").verifyCommands.includes(onlineBoundaryCommand))
  assert.ok(taskById.get("T08_POSTDEPLOY_REMOTE_SMOKE").evidence.includes("online-readonly-boundary ok=true and 404=0"))
  assert.ok(taskById.get("T08_POSTDEPLOY_REMOTE_SMOKE").actionPackets.some((packet) => (
    packet.packetId === "P09_PRODUCTION_DEPLOY" &&
    packet.verifyCommands.includes(onlineBoundaryCommand)
  )))

  assert.deepEqual(report.env.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.equal(report.env.summary.requiredTotal, 25)
  assert.equal(report.env.summary.requiredReady, 24)
  assert.deepEqual(report.cloudImportedRequiredEnvNames, [])
  assert.equal(report.rdsMigrationEvidence.ready, false)
  assert.equal(report.rdsMigrationEvidence.totalBlockers, 16)
  assert.ok(report.rdsMigrationEvidence.blockers.includes("rdsPostgres.confirmed"))
  assert.ok(report.rdsMigrationEvidence.blockers.includes("migration.rollbackValidationPassed"))
  assert.equal(report.imagePublishPlan.ready, false)
  assert.ok(report.imagePublishPlan.totalBlockers >= 8)
  assert.deepEqual(report.backendOnlyExclusions.taskIds, [
    "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
    "T02_APP_LEGAL_LINKS",
  ])
  assert.deepEqual(report.backendOnlyExclusions.sensitiveActionIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assertNoSecretLikeValues(output)
})

test("Aliyun operator tasks backend-only markdown omits deferred app launch work", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-tasks-backend-"))
  const markdownPath = path.join(tmpdir, "operator-tasks-backend.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--backend-only",
    ...fixtureArgs,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    env: commandEnv(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /## RDS PostgreSQL 数据层迁移证据/)
  assert.match(markdown, /totalBlockers: 16/)
  assert.match(markdown, /blocker: rdsPostgres\.confirmed/)
  assert.match(markdown, /blocker: migration\.rollbackValidationPassed/)
  assert.match(markdown, /databaseUrlCnSecretImported=false/)
  assert.match(markdown, /T06_ALIYUN_ENV_IMPORT/)
  assert.match(markdown, /status: blocked/)
  assert.match(markdown, /requiredBlocking=DATABASE_URL_CN/)
  assert.match(markdown, /S04_ACR_REGISTRY_AUTH/)
  assert.match(markdown, /T04_ALIYUN_DOMAIN_DNS_HTTPS/)
  assert.match(markdown, /T08_POSTDEPLOY_REMOTE_SMOKE/)
  assert.match(markdown, /aliyun:app-api:online-readonly-boundary -- --base-url https:\/\/api-cn\.ipgongchang\.xin --timeout-ms 15000/)
  assert.match(markdown, /online-readonly-boundary ok=true and 404=0/)
  assert.doesNotMatch(markdown, /T01_WECHAT_OPEN_PLATFORM_APP_LOGIN/)
  assert.doesNotMatch(markdown, /S01_WECHAT_OPEN_APP_LOGIN/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_SECRET/)
  assertNoSecretLikeValues(output + markdown)
})
