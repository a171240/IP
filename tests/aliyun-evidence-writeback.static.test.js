const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(text, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

function findGap(group, jsonPath) {
  return group.gaps.find((item) => item.jsonPath === jsonPath)
}

test("Aliyun evidence writeback command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:evidence:writeback"], "node ./scripts/generate-aliyun-evidence-writeback-checklist.mjs")
  assert.equal(pkg.scripts["aliyun:evidence:writeback:backend"], "node ./scripts/generate-aliyun-evidence-writeback-checklist.mjs --backend-only --skip-vercel-env-coverage")
  assert.equal(pkg.scripts["aliyun:release:artifacts:backend"], "node ./scripts/prepare-aliyun-release-artifacts.mjs --backend-only --skip-vercel-env-coverage")
  assert.equal(pkg.scripts["aliyun:evidence:writeback:test"], "node --test tests/aliyun-evidence-writeback.static.test.js")
  assert.match(predeploy, /aliyun:evidence:writeback:test/)
  assert.match(predeploy, /aliyun:evidence:writeback", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:evidence:writeback:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:evidence:writeback -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:evidence:writeback"))
  assert.match(releaseArtifacts, /evidence-writeback\.json/)
  assert.match(releaseArtifacts, /evidence-writeback\.md/)
  assert.match(releaseArtifacts, /evidenceWriteback/)
  assert.match(releaseArtifacts, /arg === "--backend-only"/)
  assert.match(releaseArtifacts, /\.\.\.backendOnlyArg/)
  assert.match(releaseArtifacts, /MEIYE_RELEASE_ARTIFACTS_PROGRESS/)
  assert.match(releaseArtifacts, /progressLine\("start", label\)/)
  assert.match(releaseArtifacts, /function runAppLaunchPackage/)
  assert.match(releaseArtifacts, /buildDeferredAppLaunchPackage/)
  assert.match(releaseArtifacts, /deferred_after_backend_online/)
  assert.match(releaseArtifacts, /currentScopeReady/)
  assert.match(releaseArtifacts, /rdsMigrationGaps: evidenceWriteback\.summary\.rdsMigrationGaps/)
  assert.match(releaseArtifacts, /evidenceClosureBrief/)
  assert.match(releaseArtifacts, /partiallyObservedResourceEvidenceIds/)
  assert.match(releaseArtifacts, /blockedResourceEvidence/)
})

test("Aliyun backend-only release artifacts defer APP launch packages instead of generating them", () => {
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.match(releaseArtifacts, /if \(args\.backendOnly\) \{[\s\S]*buildDeferredAppLaunchPackage/)
  assert.match(releaseArtifacts, /runAppLaunchPackage\(args, "wechat", "wechat_open_mobile_app_package"/)
  assert.match(releaseArtifacts, /runAppLaunchPackage\(args, "android", "android_release_signing_package"/)
  assert.match(releaseArtifacts, /runAppLaunchPackage\(args, "apple", "apple_team_aasa_package"/)
  assert.match(releaseArtifacts, /当前 backend-only 总包不生成这些专项材料/)
})

test("Aliyun evidence writeback backend-only mode excludes deferred APP launch gaps", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--backend-only",
    "--skip-vercel-env-coverage",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const cloudConfirmationPaths = report.writebackGroups.cloudConfirmations.gaps.map((item) => item.jsonPath)
  const rdsPaths = report.writebackGroups.rdsMigration.gaps.map((item) => item.jsonPath)

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.files, 4)
  assert.equal(report.summary.rdsMigrationGaps, 16)
  assert.equal(report.summary.cloudInventoryResultGaps, 1)
  assert.equal(report.summary.cloudConfirmationGaps, 18)
  assert.equal(report.summary.totalGaps, 47)
  assert.equal(report.summary.rdsMigrationGaps, report.writebackGroups.rdsMigration.gaps.length)
  assert.equal(report.summary.cloudConfirmationGaps, report.writebackGroups.cloudConfirmations.gaps.length)
  assert.ok(rdsPaths.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(rdsPaths.includes("migration.appApiSmokeOnRdsPassed"))
  assert.ok(!cloudConfirmationPaths.some((item) => item.includes("wechatOpenPlatform")))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.currentAnswer.includes("还不能部署阿里云后端"))
  assertNoSecretLikeValues(output)
})

test("Aliyun evidence writeback checklist exposes local JSON write targets without secret values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--skip-vercel-env-coverage",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const cloudConfirmationPaths = report.writebackGroups.cloudConfirmations.gaps.map((item) => item.jsonPath)
  const imagePublishPaths = report.writebackGroups.imagePublish.gaps.map((item) => item.jsonPath)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.executionMode, "writeback_checklist_only")
  assert.equal(report.summary.files, 4)
  assert.ok(report.summary.totalGaps >= 1)
  assert.equal(report.summary.rdsMigrationGaps, report.writebackGroups.rdsMigration.gaps.length)
  assert.equal(report.summary.cloudConfirmationGaps, report.writebackGroups.cloudConfirmations.gaps.length)
  assert.equal(report.summary.imagePublishGaps, report.writebackGroups.imagePublish.gaps.length)
  assert.equal(report.summary.evidenceWritebackReady, report.evidenceClosureBrief.evidenceWritebackReady)
  assert.equal(report.evidenceClosureBrief.blockedCredentialCount, 8)
  assert.equal(report.evidenceClosureBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.evidenceClosureBrief.resourceEvidenceReady, "0/7")
  assert.equal(report.summary.blockedCredentialCount, report.evidenceClosureBrief.blockedCredentialCount)
  assert.equal(report.summary.readySecretEnvVariableCount, report.evidenceClosureBrief.readySecretEnvVariableCount)
  assert.equal(report.summary.resourceEvidenceReady, report.evidenceClosureBrief.resourceEvidenceReady)
  assert.ok(report.evidenceClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.evidenceClosureBrief.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.evidenceClosureBrief.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.evidenceClosureBrief.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.ok(report.evidenceClosureBrief.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.evidenceClosureBrief.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  const ossResourceEvidence = report.evidenceClosureBrief.blockedResourceEvidence.find((item) =>
    item.id === "R05_OSS_AUDIO_STORAGE")
  const slsResourceEvidence = report.evidenceClosureBrief.blockedResourceEvidence.find((item) =>
    item.id === "R07_SLS_ALERTS")
  assert.equal(ossResourceEvidence.observedReadiness, "partial")
  assert.ok(ossResourceEvidence.currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.ok(ossResourceEvidence.missingEvidence.includes("oss:ramLeastPrivilege"))
  assert.equal(slsResourceEvidence.observedReadiness, "partial")
  assert.ok(slsResourceEvidence.currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.ok(slsResourceEvidence.missingEvidence.includes("slsAlerts:healthAlertConfigured"))
  assert.ok(report.evidenceClosureBrief.writeTargets.some((item) => item.includes("cloud-confirmations.local.json")))
  assert.ok(report.evidenceClosureBrief.writeTargets.some((item) => item.includes("image-publish.local.json")))
  assert.ok(report.evidenceClosureBrief.writeTargets.some((item) => item.includes("rds-migration.local.json")))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  if (report.summary.cloudInventoryResultGaps > 0) {
    assert.ok(report.summary.requiredAuthorizationPackets.includes("P00_ALIYUN_READONLY_INVENTORY_IDENTITY"))
    assert.ok(!report.summary.requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  } else {
    assert.equal(report.writebackGroups.cloudInventoryResults.ready, true)
  }
  assert.match(report.writebackGroups.cloudInventoryResults.file, /cloud-inventory-results\.local\.json/)
  assert.match(report.writebackGroups.rdsMigration.file, /rds-migration\.local\.json/)
  assert.match(report.writebackGroups.cloudConfirmations.file, /cloud-confirmations\.local\.json/)
  assert.match(report.writebackGroups.imagePublish.file, /image-publish\.local\.json/)
  assert.equal(report.writebackGroups.rdsMigration.exists, true)
  assert.equal(report.writebackGroups.cloudConfirmations.exists, true)
  assert.equal(report.writebackGroups.imagePublish.exists, true)
  assert.ok(findGap(report.writebackGroups.rdsMigration, "rdsPostgres.databaseUrlCnSecretImported").requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(findGap(report.writebackGroups.rdsMigration, "migration.supabaseNoLongerFormalTarget").requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(cloudConfirmationPaths.includes("items.wechatOpenPlatform.mobileAppCreated"))
  assert.ok(cloudConfirmationPaths.includes("items.wechatOpenPlatform.mobileAppSecretReady"))
  assert.ok(imagePublishPaths.includes("acr.registryHost"))
  assert.ok(imagePublishPaths.includes("runtime.confirmed"))
  if (report.writebackGroups.cloudInventoryResults.gaps.length > 0) {
    assert.ok(report.writebackGroups.cloudInventoryResults.requiredAuthorizationPackets.includes("P00_ALIYUN_READONLY_INVENTORY_IDENTITY"))
    assert.ok(!report.writebackGroups.cloudInventoryResults.requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  } else {
    assert.equal(report.writebackGroups.cloudInventoryResults.requiredAuthorizationPackets.length, 0)
  }
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.mobileAppSecretReady").requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.androidSignature").requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.iosConfigured").requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.apiDomainHttps.httpsEnabled").requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.oss.ramLeastPrivilege").requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.envImport.secretNotInImage").requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "acr.registryHost").requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "acr.remoteDigest").requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "runtime.confirmed").requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:confirmations:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:image:plan:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不会调用阿里云 API")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("禁止写入 AppSecret")))
  assertNoSecretLikeValues(output)
})

test("Aliyun image publish plan groups ACR and SAE writeback blockers by execution step", () => {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const groupsById = new Map(report.writebackPlan.groups.map((item) => [item.id, item]))

  assert.equal(report.ok, false)
  assert.equal(report.containsValues, false)
  assert.deepEqual(report.summary.writebackBlockingGroups, [
    "acrPurchaseAndRepository",
    "imagePushAndDigest",
    "saeRuntimeImagePull",
  ])
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))

  const acrPurchase = groupsById.get("acrPurchaseAndRepository")
  const imagePush = groupsById.get("imagePushAndDigest")
  const saeRuntime = groupsById.get("saeRuntimeImagePull")

  assert.equal(acrPurchase.canStartNow, true)
  assert.equal(acrPurchase.requiresActionTimeConfirmation, true)
  assert.ok(acrPurchase.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(acrPurchase.writeTargets.some((item) => item.includes("acr.registryHost")))
  assert.ok(acrPurchase.forbidden.some((item) => item.includes("docker push")))

  assert.equal(imagePush.canStartNow, false)
  assert.deepEqual(imagePush.dependsOnGroups, ["acrPurchaseAndRepository"])
  assert.ok(imagePush.blockers.includes("acr.remoteDigest=sha256"))
  assert.ok(imagePush.requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(imagePush.verifyCommands.includes("corepack pnpm aliyun:image:plan:strict"))

  assert.equal(saeRuntime.canStartNow, false)
  assert.deepEqual(saeRuntime.dependsOnGroups, ["acrPurchaseAndRepository", "imagePushAndDigest"])
  assert.ok(saeRuntime.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(saeRuntime.requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(saeRuntime.writeTargets.some((item) => item.includes("runtime.imagePullConfigured")))

  assert.ok(report.writebackPlan.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.ok(report.writebackPlan.safetyBoundary.some((item) => item.includes("does not call Aliyun APIs")))
  assertNoSecretLikeValues(output)
})

test("Aliyun cloud confirmations groups local evidence blockers by authorization packet", () => {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--allow-incomplete",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const groupsById = new Map(report.writebackPlan.groups.map((item) => [item.id, item]))

  assert.equal(report.ok, false)
  assert.equal(report.containsValues, false)
  assert.deepEqual(report.summary.writebackBlockingGroups, [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "wechatOpenPlatform",
    "envImport",
    "slsAlerts",
  ])
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))

  const oss = groupsById.get("oss")
  const wechat = groupsById.get("wechatOpenPlatform")
  const envImport = groupsById.get("envImport")
  const apiDomain = groupsById.get("apiDomainHttps")

  assert.equal(oss.canStartNow, true)
  assert.ok(oss.blockers.includes("oss:ramLeastPrivilege"))
  assert.ok(oss.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(oss.expectedEvidence.some((item) => item.includes("ramLeastPrivilege=true")))

  assert.equal(wechat.canStartNow, false)
  assert.ok(wechat.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(wechat.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(wechat.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(wechat.forbidden.some((item) => item.includes("小程序 AppID/Secret")))

  assert.ok(envImport.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(apiDomain.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.writebackPlan.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.ok(report.writebackPlan.safetyBoundary.some((item) => item.includes("does not call Aliyun APIs")))
  assertNoSecretLikeValues(output)
})

test("Aliyun evidence writeback markdown renders the same writeback boundaries", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-evidence-writeback-"))
  const markdown = path.join(tmpdir, "evidence-writeback.md")
  const json = path.join(tmpdir, "evidence-writeback.json")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--skip-vercel-env-coverage",
    "--out",
    json,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const markdownOutput = fs.readFileSync(markdown, "utf8")
  const report = JSON.parse(fs.readFileSync(json, "utf8"))

  assert.equal(report.ok, true)
  assert.match(markdownOutput, /阿里云证据回填清单/)
  assert.match(markdownOutput, /rdsMigration/)
  assert.match(markdownOutput, /cloudInventoryResults/)
  assert.match(markdownOutput, /cloudConfirmations/)
  assert.match(markdownOutput, /imagePublish/)
  assert.match(markdownOutput, /rdsMigrationGaps: 16/)
  assert.match(markdownOutput, /证据闭环摘要/)
  assert.match(markdownOutput, /blockedCredentialCount: 8/)
  assert.match(markdownOutput, /readySecretEnvVariableCount: 17/)
  assert.match(markdownOutput, /resourceEvidenceReady: 0\/7/)
  assert.match(markdownOutput, /R01_SAE_RUNTIME/)
  assert.match(markdownOutput, /已观测但未闭环的资源证据/)
  assert.match(markdownOutput, /partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdownOutput, /bucket_exists/)
  assert.match(markdownOutput, /project_meiye-huajing-app-prod-cn/)
  assert.match(markdownOutput, /cloud-confirmations\.local\.json/)
  assert.match(markdownOutput, /rds-migration\.local\.json/)
  assert.match(markdownOutput, /image-publish\.local\.json/)
  assert.match(markdownOutput, /requiredAuthorizationPackets/)
  assert.match(markdownOutput, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  if (report.writebackGroups.cloudInventoryResults.gaps.length > 0) {
  assert.match(markdownOutput, /P00_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.doesNotMatch(markdownOutput, /P11_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  } else {
    assert.match(markdownOutput, /cloudInventoryResultGaps: 0/)
  }
  assert.match(markdownOutput, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(markdownOutput, /P07_DOMAIN_DNS_HTTPS/)
  assert.match(markdownOutput, /Strict 验证顺序/)
  assert.match(markdownOutput, /corepack pnpm aliyun:predeploy/)
  assertNoSecretLikeValues(output + markdownOutput)
})

test("tracked APP production-cn evidence gap doc pins the current non-deployable writeback state", () => {
  const doc = read("docs", "app-production-cn-evidence-writeback-gaps.md")
  const fieldMap = read("docs", "app-production-cn-evidence-field-map.md")
  const manifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  assert.match(doc, /还不能部署阿里云后端/)
  assert.match(doc, /currentScope: backend_aliyun_only/)
  assert.match(doc, /evidenceWritebackReady: 0\/4/)
  assert.match(doc, /totalGaps: 47/)
  assert.match(doc, /rdsMigrationGaps: 16/)
  assert.match(doc, /cloudInventoryResultGaps: 1/)
  assert.match(doc, /cloudConfirmationGaps: 18/)
  assert.match(doc, /imagePublishGaps: 12/)
  assert.match(doc, /blockedCredentialCount: 1/)
  assert.match(doc, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(doc, /resourceEvidenceReady: 0\/7/)
  assert.match(doc, /deploy\/aliyun-production-cn\.cloud-inventory-results\.local\.json/)
  assert.match(doc, /deploy\/aliyun-production-cn\.rds-migration\.local\.json/)
  assert.match(doc, /deploy\/aliyun-production-cn\.cloud-confirmations\.local\.json/)
  assert.match(doc, /deploy\/aliyun-production-cn\.image-publish\.local\.json/)
  assert.match(doc, /P03_ACR_PURCHASE/)
  assert.match(doc, /P04_ACR_IMAGE_AND_PULL/)
  assert.match(doc, /P05_OSS_RAM_STS/)
  assert.match(doc, /P06_ENV_IMPORT/)
  assert.match(doc, /P07_DOMAIN_DNS_HTTPS/)
  assert.match(doc, /P08_SAE_RUNTIME_SLS/)
  assert.match(doc, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(doc, /P00_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.doesNotMatch(doc, /P11_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(doc, /R01_SAE_RUNTIME/)
  assert.match(doc, /R02_ACR_IMAGE_REGISTRY/)
  assert.match(doc, /R03_API_DOMAIN_HTTPS/)
  assert.match(doc, /R04_ASSET_DOMAIN_HTTPS/)
  assert.match(doc, /R05_OSS_AUDIO_STORAGE/)
  assert.match(doc, /R06_ENV_IMPORT/)
  assert.match(doc, /R07_SLS_ALERTS/)
  assert.match(doc, /partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(doc, /WECHAT_MINI_APPID/)
  assert.match(doc, /DATABASE_URL_CN/)
  assert.match(doc, /corepack pnpm aliyun:rds:migration:evidence:strict/)
  assert.match(doc, /corepack pnpm aliyun:cloud:inventory-results:strict/)
  assert.match(doc, /corepack pnpm aliyun:cloud:confirmations:strict/)
  assert.match(doc, /corepack pnpm aliyun:image:plan:strict/)
  assert.match(doc, /不会购买 ACR/)
  assert.match(doc, /不会 push 镜像/)
  assert.doesNotMatch(doc, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.doesNotMatch(doc, /P02_APPLE_TEAM_ID/)
  assert.doesNotMatch(doc, /P10_ANDROID_RELEASE_SIGNING/)
  assert.doesNotMatch(doc, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(doc, /WECHAT_OPEN_APP_SECRET/)
  assert.match(fieldMap, /Production-cn cannot be deployed now\./)
  assert.match(fieldMap, /evidenceWritebackReady=0\/4/)
  assert.match(fieldMap, /totalGaps=47/)
  assert.match(fieldMap, /rdsMigrationGaps=16/)
  assert.match(fieldMap, /cloudInventoryResultGaps=1/)
  assert.match(fieldMap, /cloudConfirmationGaps=18/)
  assert.match(fieldMap, /imagePublishGaps=12/)
  assert.match(fieldMap, /Current scope is `backend_aliyun_only`/)
  assert.match(fieldMap, /Current field blockers: `18`/)
  assert.match(fieldMap, /Current field blockers: `12`/)
  assert.match(fieldMap, /Current field blockers: `16`/)
  assert.match(fieldMap, /`rdsPostgres\.databaseUrlCnSecretImported` \| `P11_ALIYUN_RDS_DATA_MIGRATION`/)
  assert.match(fieldMap, /`migration\.appApiSmokeOnRdsPassed` \| `P11_ALIYUN_RDS_DATA_MIGRATION`/)
  assert.match(fieldMap, /`migration\.supabaseNoLongerFormalTarget` \| `P11_ALIYUN_RDS_DATA_MIGRATION`/)
  assert.match(fieldMap, /`items\.runtime\.confirmed` \| `P08_SAE_RUNTIME_SLS`/)
  assert.match(fieldMap, /`items\.apiDomainHttps\.dnsResolvedToAliyun` \| `P07_DOMAIN_DNS_HTTPS`/)
  assert.match(fieldMap, /`items\.oss\.ramLeastPrivilege` \| `P05_OSS_RAM_STS`/)
  assert.match(fieldMap, /`items\.envImport\.secretNotInImage` \| `P06_ENV_IMPORT`/)
  assert.match(fieldMap, /`items\.slsAlerts\.serverErrorAlertConfigured` \| `P08_SAE_RUNTIME_SLS`/)
  assert.match(fieldMap, /`acr\.registryHost` \| `P03_ACR_PURCHASE`/)
  assert.match(fieldMap, /`acr\.remoteImage` \| `P04_ACR_IMAGE_AND_PULL`/)
  assert.match(fieldMap, /`acr\.remoteDigest` \| `P04_ACR_IMAGE_AND_PULL`/)
  assert.match(fieldMap, /`runtime\.remoteImageConfigured` \| `P04_ACR_IMAGE_AND_PULL`/)
  assert.match(fieldMap, /AppSecret/)
  assert.match(fieldMap, /AccessKeySecret/)
  assert.match(fieldMap, /registry password/)
  assert.match(fieldMap, /DATABASE_URL_CN value/)
  assert.match(fieldMap, /database password/)
  assert.match(fieldMap, /dump contents/)
  assert.match(fieldMap, /customer data/)
  assert.match(fieldMap, /corepack pnpm aliyun:rds:migration:evidence:strict/)
  assert.match(fieldMap, /corepack pnpm aliyun:cloud:inventory-results:strict/)
  assert.match(fieldMap, /corepack pnpm aliyun:cloud:confirmations:strict/)
  assert.match(fieldMap, /corepack pnpm aliyun:image:plan:strict/)
  assert.match(fieldMap, /corepack pnpm aliyun:evidence:writeback:backend/)
  assert.match(fieldMap, /Do not deploy production-cn/)
  assert.doesNotMatch(fieldMap, /items\.wechatOpenPlatform/)
  assert.doesNotMatch(fieldMap, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.doesNotMatch(fieldMap, /P02_APPLE_TEAM_ID/)
  assert.doesNotMatch(fieldMap, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(manifest, /app-production-cn-evidence-field-map\.md/)
  assert.match(manifest, /app-production-cn-evidence-writeback-gaps\.md/)
  assertNoSecretLikeValues(fieldMap)
  assertNoSecretLikeValues(doc)
})
