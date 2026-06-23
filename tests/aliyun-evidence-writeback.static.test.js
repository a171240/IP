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
  assert.equal(pkg.scripts["aliyun:evidence:writeback:test"], "node --test tests/aliyun-evidence-writeback.static.test.js")
  assert.match(predeploy, /aliyun:evidence:writeback:test/)
  assert.match(predeploy, /aliyun:evidence:writeback", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:evidence:writeback:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:evidence:writeback -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:evidence:writeback"))
  assert.match(releaseArtifacts, /evidence-writeback\.json/)
  assert.match(releaseArtifacts, /evidence-writeback\.md/)
  assert.match(releaseArtifacts, /evidenceWriteback/)
  assert.match(releaseArtifacts, /evidenceClosureBrief/)
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
  assert.equal(report.summary.files, 3)
  assert.ok(report.summary.totalGaps >= 1)
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
  assert.ok(report.evidenceClosureBrief.writeTargets.some((item) => item.includes("cloud-confirmations.local.json")))
  assert.ok(report.evidenceClosureBrief.writeTargets.some((item) => item.includes("image-publish.local.json")))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS_ICP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  if (report.summary.cloudInventoryResultGaps > 0) {
    assert.ok(report.summary.requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  } else {
    assert.equal(report.writebackGroups.cloudInventoryResults.ready, true)
  }
  assert.match(report.writebackGroups.cloudInventoryResults.file, /cloud-inventory-results\.local\.json/)
  assert.match(report.writebackGroups.cloudConfirmations.file, /cloud-confirmations\.local\.json/)
  assert.match(report.writebackGroups.imagePublish.file, /image-publish\.local\.json/)
  assert.equal(report.writebackGroups.cloudConfirmations.exists, true)
  assert.equal(report.writebackGroups.imagePublish.exists, true)
  assert.ok(cloudConfirmationPaths.includes("items.wechatOpenPlatform.mobileAppCreated"))
  assert.ok(cloudConfirmationPaths.includes("items.wechatOpenPlatform.mobileAppSecretReady"))
  assert.ok(imagePublishPaths.includes("acr.registryHost"))
  assert.ok(imagePublishPaths.includes("runtime.confirmed"))
  if (report.writebackGroups.cloudInventoryResults.gaps.length > 0) {
    assert.ok(report.writebackGroups.cloudInventoryResults.requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  } else {
    assert.equal(report.writebackGroups.cloudInventoryResults.requiredAuthorizationPackets.length, 0)
  }
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.mobileAppSecretReady").requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.androidSignature").requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.iosConfigured").requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.apiDomainHttps.httpsEnabled").requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS_ICP"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.oss.ramLeastPrivilege").requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.envImport.secretNotInImage").requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "acr.registryHost").requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "acr.remoteDigest").requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "runtime.confirmed").requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:confirmations:strict"))
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
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS_ICP"))
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
  assert.ok(apiDomain.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS_ICP"))
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
  assert.match(markdownOutput, /cloudInventoryResults/)
  assert.match(markdownOutput, /cloudConfirmations/)
  assert.match(markdownOutput, /imagePublish/)
  assert.match(markdownOutput, /证据闭环摘要/)
  assert.match(markdownOutput, /blockedCredentialCount: 8/)
  assert.match(markdownOutput, /readySecretEnvVariableCount: 17/)
  assert.match(markdownOutput, /resourceEvidenceReady: 0\/7/)
  assert.match(markdownOutput, /R01_SAE_RUNTIME/)
  assert.match(markdownOutput, /cloud-confirmations\.local\.json/)
  assert.match(markdownOutput, /image-publish\.local\.json/)
  assert.match(markdownOutput, /requiredAuthorizationPackets/)
  if (report.writebackGroups.cloudInventoryResults.gaps.length > 0) {
    assert.match(markdownOutput, /P11_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  } else {
    assert.match(markdownOutput, /cloudInventoryResultGaps: 0/)
  }
  assert.match(markdownOutput, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(markdownOutput, /P07_DOMAIN_DNS_HTTPS_ICP/)
  assert.match(markdownOutput, /Strict 验证顺序/)
  assert.match(markdownOutput, /corepack pnpm aliyun:predeploy/)
  assertNoSecretLikeValues(output + markdownOutput)
})
