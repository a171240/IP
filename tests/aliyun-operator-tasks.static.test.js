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

test("Aliyun operator tasks backend-only mode excludes deferred app launch work", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--backend-only",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)
  const taskIds = report.tasks.map((item) => item.id)
  const sensitiveActionIds = report.sensitiveActionItems.map((item) => item.id)
  const taskById = new Map(report.tasks.map((item) => [item.id, item]))
  const t06 = report.tasks.find((item) => item.id === "T06_ALIYUN_ENV_IMPORT")
  const t08 = report.tasks.find((item) => item.id === "T08_POSTDEPLOY_REMOTE_SMOKE")

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
  assert.deepEqual(sensitiveActionIds, [
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.deepEqual(report.summary, {
    total: 8,
    ready: 0,
    blocked: 3,
    waitingWechatReview: 0,
    pendingCloud: 4,
    waitingForDeploy: 1,
    operatorActionPacketSummary: {
      currentScope: "backend_aliyun_only",
      canStartNowPacketIds: [
        "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
        "P03_ACR_PURCHASE",
        "P05_OSS_RAM_STS",
        "P11_ALIYUN_RDS_DATA_MIGRATION",
      ],
      blockedByPacketDependencies: [
        "P08_SAE_RUNTIME_SLS",
        "P04_ACR_IMAGE_AND_PULL",
        "P07_DOMAIN_DNS_HTTPS",
        "P06_ENV_IMPORT",
        "P09_PRODUCTION_DEPLOY",
      ],
      deferredAppLaunchPacketIds: [
        "P01_WECHAT_OPEN_MOBILE_APP",
        "P10_ANDROID_RELEASE_SIGNING",
        "P02_APPLE_TEAM_ID",
      ],
      taskPacketBindingCount: 8,
      secretOrCredentialPacketIds: [
        "P11_ALIYUN_RDS_DATA_MIGRATION",
        "P05_OSS_RAM_STS",
        "P06_ENV_IMPORT",
      ],
      taskPacketBindings: report.summary.operatorActionPacketSummary.taskPacketBindings,
    },
  })
  assert.equal(report.summary.operatorActionPacketSummary.taskPacketBindings.length, 8)
  assert.deepEqual(report.actionAuthorization.nextActionTimeConfirmationPacketIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.equal(report.actionAuthorization.verdict, "blocked")
  assert.deepEqual(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").actionPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").canStartNowAuthorizationPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.equal(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").nonSecretEvidenceOnly, false)
  assert.equal(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").blockerCodes.length, 19)
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").blockerCodes.includes("rdsMigration:rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").blockerCodes.includes("rdsMigration:migration.schemaCompatibilityReviewed"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").blockerCodes.includes("rdsMigration:migration.supabaseSpecificSqlResolved"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").blockerCodes.includes("rdsMigration:migration.rdsExtensionSupportConfirmed"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").evidence.includes("totalBlockers=19"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").evidence.includes("appApiRoutesWithSupabase=29/31"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").evidence.includes("firstVersionRdsRoutesWithSupabaseDataAccess=0/25"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").verifyCommands.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))
  assert.ok(taskById.get("T02B_ALIYUN_RDS_DATA_MIGRATION").writeTargets.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.deepEqual(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").actionPacketIds, [
    "P03_ACR_PURCHASE",
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.deepEqual(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").canStartNowAuthorizationPacketIds, [
    "P03_ACR_PURCHASE",
  ])
  assert.deepEqual(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").blockedByAuthorizationPacketIds, [
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.equal(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").nonSecretEvidenceOnly, true)
  assert.ok(taskById.get("T03B_ALIYUN_ACR_IMAGE_PUBLISH").writeTargets.some((item) => /image-publish\.local\.json/.test(item)))
  assert.deepEqual(taskById.get("T05_ALIYUN_OSS_AUDIO_STORAGE").canStartNowAuthorizationPacketIds, ["P05_OSS_RAM_STS"])
  assert.equal(taskById.get("T05_ALIYUN_OSS_AUDIO_STORAGE").nonSecretEvidenceOnly, false)
  assert.ok(taskById.get("T05_ALIYUN_OSS_AUDIO_STORAGE").writeTargets.some((item) => /ALIYUN_OSS_ACCESS_KEY_SECRET/.test(item)))
  assert.deepEqual(taskById.get("T06_ALIYUN_ENV_IMPORT").actionPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P06_ENV_IMPORT",
  ])
  assert.deepEqual(taskById.get("T06_ALIYUN_ENV_IMPORT").canStartNowAuthorizationPacketIds, ["P11_ALIYUN_RDS_DATA_MIGRATION"])
  assert.deepEqual(taskById.get("T06_ALIYUN_ENV_IMPORT").blockedByAuthorizationPacketIds, ["P06_ENV_IMPORT"])
  assert.ok(taskById.get("T06_ALIYUN_ENV_IMPORT").writeTargets.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.deepEqual(taskById.get("T08_POSTDEPLOY_REMOTE_SMOKE").blockedByAuthorizationPacketIds, ["P09_PRODUCTION_DEPLOY"])
  assert.deepEqual(report.env.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.equal(report.env.summary.requiredTotal, 25)
  assert.equal(report.env.summary.requiredReady, 24)
  assert.ok(report.env.summary.appLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.env.summary.appLaunchBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.env.summary.appLaunchBlocking.includes("APPLE_TEAM_ID"))
  assert.equal(report.rdsMigrationEvidence.ready, false)
  assert.equal(report.rdsMigrationEvidence.totalBlockers, 19)
  assert.ok(report.rdsMigrationEvidence.blockers.includes("migration.schemaCompatibilityReviewed"))
  assert.ok(report.rdsMigrationEvidence.blockers.includes("migration.supabaseSpecificSqlResolved"))
  assert.ok(report.rdsMigrationEvidence.blockers.includes("migration.rdsExtensionSupportConfirmed"))
  assert.equal(report.rdsMigrationEvidence.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(report.rdsMigrationEvidence.postgresDataAccessAdapterDetected, true)
  assert.deepEqual(report.backendOnlyExclusions.taskIds, [
    "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
    "T02_APP_LEGAL_LINKS",
  ])
  assert.deepEqual(report.backendOnlyExclusions.sensitiveActionIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.ok(t06.blockerCodes.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!t06.blockerCodes.some((item) => /WECHAT_OPEN/.test(item)))
  assert.deepEqual(t08.blockerCodes, ["requires_runtime_domain_env_cloud_confirmations"])
  assert.equal(report.nextCommandOrder[0], "corepack pnpm aliyun:operator:tasks:backend")
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:env:handoff:backend"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:user:actions:backend"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:action:authorization:backend"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:cloud:confirmations:backend:strict"))
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun operator tasks backend-only markdown omits deferred app launch tasks", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-tasks-backend-"))
  const markdownPath = path.join(tmpdir, "operator-tasks-backend.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--backend-only",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /## 动作包总览/)
  assert.match(markdown, /nextActionTimeConfirmationPacketIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /blockedByPacketDependencies: P08_SAE_RUNTIME_SLS, P04_ACR_IMAGE_AND_PULL, P07_DOMAIN_DNS_HTTPS, P06_ENV_IMPORT, P09_PRODUCTION_DEPLOY/)
  assert.match(markdown, /## RDS PostgreSQL 数据层迁移证据/)
  assert.match(markdown, /totalBlockers: 19/)
  assert.match(markdown, /blocker: migration\.schemaCompatibilityReviewed/)
  assert.match(markdown, /T02B_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /actionPacketIds: P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /T03_ALIYUN_RUNTIME_CONTAINER/)
  assert.match(markdown, /actionPacketIds: P08_SAE_RUNTIME_SLS/)
  assert.match(markdown, /writeTargets: deploy\/aliyun-production-cn\.cloud-confirmations\.local\.json -> items\.runtime/)
  assert.match(markdown, /T08_POSTDEPLOY_REMOTE_SMOKE/)
  assert.match(markdown, /actionPacketIds: P09_PRODUCTION_DEPLOY/)
  assert.doesNotMatch(markdown, /T01_WECHAT_OPEN_PLATFORM_APP_LOGIN/)
  assert.doesNotMatch(markdown, /S01_WECHAT_OPEN_APP_LOGIN/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(output + markdown, secretLike)
})
