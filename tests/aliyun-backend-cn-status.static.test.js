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

test("Aliyun backend-cn status command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const script = read("scripts", "summarize-aliyun-backend-cn-status.mjs")

  assert.equal(pkg.scripts["aliyun:backend-cn:status"], "node ./scripts/summarize-aliyun-backend-cn-status.mjs")
  assert.equal(pkg.scripts["aliyun:backend-cn:status:test"], "node --test tests/aliyun-backend-cn-status.static.test.js")
  assert.match(predeploy, /aliyun:backend-cn:status:test/)
  assert.match(predeploy, /aliyun:backend-cn:status/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:backend-cn:status/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.match(releaseArtifacts, /backend-cn-status\.json/)
  assert.match(releaseArtifacts, /backendCnStatus/)
  assert.match(script, /backend_aliyun_only/)
  assert.match(script, /deferred_after_backend_online/)
  assert.match(script, /WECHAT_OPEN_APP_ID/)
  assert.match(script, /WECHAT_OPEN_APP_SECRET/)
  assert.match(script, /APP_API_POSTGRES_ADAPTER_MISSING/)
  assert.match(script, /POSTDEPLOY_SMOKE_NOT_RUN/)
  assert.doesNotMatch(script, secretLike)
})

test("Aliyun backend-cn status excludes WeChat mobile app from current backend blockers", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-backend-cn-status.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const report = JSON.parse(output)
  const targetById = new Map(report.backendTargets.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.canDeployBackendNow, false)
  assert.equal(report.summary.backendTargetReady, "0/8")

  for (const blocker of [
    "DATABASE_URL_CN",
    "RDS_MIGRATION_EVIDENCE_NOT_READY",
    "ACR_IMAGE_REGISTRY_NOT_READY",
    "SAE_RUNTIME_NOT_READY",
    "API_DOMAIN_HTTPS_ICP_NOT_READY",
    "ASSET_DOMAIN_HTTPS_ICP_NOT_READY",
    "OSS_RAM_STS_NOT_READY",
    "ENV_IMPORT_NOT_READY",
    "SLS_ALERTS_NOT_READY",
    "POSTDEPLOY_SMOKE_NOT_RUN",
  ]) {
    assert.ok(report.summary.backendRequiredBlocking.includes(blocker), blocker)
  }

  assert.ok(!report.summary.backendRequiredBlocking.includes("RDS_POSTGRES_NOT_READY"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.wechatDeferredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.wechatDeferredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.deferredScope.wechatOpenMobileApp.excludedFromBackendRequiredBlocking, true)
  assert.equal(report.deferredScope.wechatOpenMobileApp.status, "deferred_after_backend_online")

  assert.equal(report.cloudInventory.strictReady, false)
  assert.equal(report.cloudInventory.readyLocalOperations, "0/9")
  assert.equal(report.cloudInventory.executedCommandResults, "9/9")
  assert.deepEqual(report.cloudInventory.notFoundOperationIds, [])
  assert.deepEqual(report.cloudInventory.observedOperationIds, [])
  assert.equal(report.cloudInventory.backendMeaning.rdsPostgres, "observed_or_unknown")
  assert.equal(report.cloudInventory.backendMeaning.saeRuntime, "observed_or_unknown")
  assert.equal(report.cloudInventory.backendMeaning.acrImage, "observed_or_unknown")
  assert.equal(report.cloudInventory.backendMeaning.ossAudioBucket, "not_observed")
  assert.equal(report.cloudInventory.backendMeaning.slsProject, "not_observed")
  assert.equal(report.cloudInventory.mutationPerformedCommandResults, 0)
  assert.match(report.nextBackendOrder[0], /^0\. Restore Aliyun CLI\/CloudShell read-only inventory evidence/)
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloudshell:handoff"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.equal(report.rdsMigration.localExists, true)
  assert.equal(report.rdsMigration.localReady, false)
  assert.ok(report.rdsMigration.blockers.includes("rdsPostgres.confirmed"))
  assert.ok(report.rdsMigration.blockers.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(report.rdsMigration.blockers.includes("migration.dataAccessAdapterReady"))
  assert.equal(report.rdsMigration.appApiRoutesWithSupabase, 30)
  assert.equal(report.rdsMigration.appApiRoutesWithSupabaseDataAccess, 29)
  assert.equal(report.rdsMigration.firstVersionRdsRouteCount, 25)
  assert.equal(report.rdsMigration.firstVersionRdsRoutesWithSupabase, 25)
  assert.equal(report.rdsMigration.firstVersionRdsRoutesWithSupabaseDataAccess, 25)
  assert.equal(report.rdsMigration.deferredAppApiRouteCount, 5)
  assert.equal(report.rdsMigration.deferredAppApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(report.rdsMigration.databaseUrlCnReferencedInSource, true)
  assert.equal(report.rdsMigration.postgresDataAccessAdapterDetected, true)
  assert.equal(report.cloudResources.evidenceReady, "0/7")
  assert.ok(report.cloudResources.blockedIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.cloudResources.blockedIds.includes("R07_SLS_ALERTS"))

  assert.ok(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("DATABASE_URL_CN"))
  assert.ok(!targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("RDS_POSTGRES_NOT_READY"))
  assert.ok(!targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("APP_API_POSTGRES_ADAPTER_MISSING"))
  assert.ok(targetById.get("B02_ACR_IMAGE_REGISTRY").blockers.includes("ACR_IMAGE_REGISTRY_NOT_READY"))
  assert.ok(targetById.get("B03_SAE_RUNTIME").blockers.includes("SAE_RUNTIME_NOT_READY"))
  assert.ok(targetById.get("B04_DOMAINS_HTTPS_ICP").blockers.includes("API_DOMAIN_HTTPS_ICP_NOT_READY"))
  assert.ok(targetById.get("B05_OSS_RAM_STS").blockers.includes("OSS_RAM_STS_NOT_READY"))
  assert.ok(targetById.get("B06_ENV_IMPORT").blockers.includes("ENV_IMPORT_NOT_READY"))
  assert.ok(targetById.get("B07_SLS_ALERTS").blockers.includes("SLS_ALERTS_NOT_READY"))
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").blockers.includes("POSTDEPLOY_SMOKE_NOT_RUN"))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend-cn status markdown states the backend-only target", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-cn-status-"))
  const markdownPath = path.join(tmpdir, "backend-cn-status.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /canDeployBackendNow: false/)
  assert.match(markdown, /backendRequiredBlocking: ACR_IMAGE_REGISTRY_NOT_READY/)
  assert.match(markdown, /B01_RDS_POSTGRES_DATA_LAYER/)
  assert.match(markdown, /B08_POSTDEPLOY_SMOKE/)
  assert.match(markdown, /wechatOpenMobileApp: deferred_after_backend_online/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /0\. Restore Aliyun CLI\/CloudShell read-only inventory evidence/)
  assert.match(markdown, /corepack pnpm aliyun:cloudshell:handoff/)
  assert.match(markdown, /corepack pnpm aliyun:cloud:inventory-results:strict/)
  assert.match(markdown, /corepack pnpm aliyun:rds:migration:evidence:strict/)
  assert.doesNotMatch(output + markdown, secretLike)
})
