const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const fixtureCloudConfirmations = path.join(
  "tests",
  "fixtures",
  "aliyun-user-action-brief",
  "cloud-confirmations.fixture.json",
)
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

function writeSanitizedCloudConfirmationsFixture() {
  const source = readJson(fixtureCloudConfirmations)
  const sanitized = {
    ...source,
    notes: `${source.notes} Copied by static test into temporary template/local files.`,
  }
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-confirmations-fixture-"))
  const templatePath = path.join(tmpdir, "cloud-confirmations.template.json")
  const localPath = path.join(tmpdir, "cloud-confirmations.local.json")
  fs.writeFileSync(templatePath, JSON.stringify(sanitized, null, 2))
  fs.writeFileSync(localPath, JSON.stringify(sanitized, null, 2))
  return { templatePath, localPath }
}

function runCloudConfirmations(args = []) {
  const { templatePath, localPath } = writeSanitizedCloudConfirmationsFixture()
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--template",
    templatePath,
    "--local",
    localPath,
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  return { output, report: JSON.parse(output) }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, secretLike)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

test("Aliyun cloud confirmations full APP scope keeps WeChat mobile app blockers", () => {
  const { output, report } = runCloudConfirmations(["--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.currentScope, "full_app_launch")
  assert.equal(report.backendOnly, false)
  assert.ok(report.summary.writebackBlockingGroups.includes("wechatOpenPlatform"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.local.blockers.some((item) => item.startsWith("wechatOpenPlatform:")))
  assert.equal(report.local.checkedItems, 7)
  assert.ok(Object.prototype.hasOwnProperty.call(report.local.itemStatus, "wechatOpenPlatform"))
  assertNoSecretLikeValues(output)
})

test("Aliyun cloud confirmations backend-only mode uses fixture blockers without deferred APP launch blockers", () => {
  const { output, report } = runCloudConfirmations(["--backend-only", "--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.backendOnly, true)
  assert.deepEqual(report.deferredAppLaunchConfirmationKeys, ["wechatOpenPlatform"])
  assert.deepEqual(report.deferredAppLaunchAuthorizationPackets, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.equal(report.summary.totalBlockers, 16)
  assert.equal(report.summary.totalWarnings, 0)
  assert.deepEqual(report.summary.writebackBlockingGroups, [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "envImport",
    "slsAlerts",
  ])
  assert.ok(!report.summary.writebackBlockingGroups.includes("wechatOpenPlatform"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.equal(report.summary.ossAccessPlanReady, false)
  assert.equal(report.summary.canStartP05AfterActionTimeConfirmation, false)
  assert.equal(report.summary.domainHttpsPlanReady, false)
  assert.equal(report.summary.runtimeSlsPlanReady, false)
  assert.equal(report.summary.envImportPlanReady, false)
  assert.deepEqual(report.summary.envImportBlockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.blockedEnvImportBatchIds, [
    "BLOCKED_SECRET_BATCH_01_OSS_RAM_STS",
    "BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
  ])
  assert.equal(report.summary.envImportReadySecretEnvVariableCount, 17)
  assert.equal(report.local.checkedItems, 6)
  assert.ok(!Object.prototype.hasOwnProperty.call(report.local.itemStatus, "wechatOpenPlatform"))
  assert.ok(!report.local.blockers.some((item) => item.startsWith("wechatOpenPlatform:")))
  assert.ok(report.local.blockers.includes("runtime:confirmed"))
  assert.ok(report.local.blockers.includes("oss:ramLeastPrivilege"))
  assert.ok(report.local.blockers.includes("envImport:confirmed"))
  assert.equal(report.local.itemStatus.runtime.ready, false)
  assert.equal(report.local.itemStatus.oss.ready, false)
  assert.equal(report.local.itemStatus.envImport.ready, false)
  assert.equal(report.local.itemStatus.slsAlerts.ready, false)
  assert.equal(report.local.itemStatus.apiDomainHttps.ready, false)
  assert.equal(report.local.itemStatus.assetDomainHttps.ready, false)

  assert.equal(report.ossAccessPlan.selectedMode, "pending_choose_sae_runtime_role_or_sts")
  assert.equal(report.ossAccessPlan.selectedReady, false)
  assert.deepEqual(report.ossAccessPlan.selectedBlockers, [
    "oss.confirmed",
    "oss.corsConfigured",
    "oss.ramLeastPrivilege",
  ])
  assert.equal(report.ossAccessPlan.executionReadiness.selectedModeRequiresSecretEnv, false)
  assert.equal(
    report.ossAccessPlan.executionReadiness.nextOperatorDecision,
    "choose_sae_runtime_role_or_sts_then_bind_least_privilege_policy",
  )
  assert.equal(report.ossAccessPlan.executionReadiness.preferredModeAvoidsLongLivedSecret, true)
  assert.ok(report.ossAccessPlan.executionReadiness.verificationCommands.includes("corepack pnpm aliyun:oss:runtime-access:strict"))
  assert.equal(report.envImportPlan.ready, false)
  assert.equal(report.envImportPlan.selectedMode, "pending_secret_env_import_after_resource_dependencies")
  assert.equal(report.envImportPlan.importTarget, "SAE")
  assert.deepEqual(report.envImportPlan.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.envImportPlan.blockedSecretBatchIds, [
    "BLOCKED_SECRET_BATCH_01_OSS_RAM_STS",
    "BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
  ])
  assert.equal(report.envImportPlan.readySecretEnvVariableCount, 17)
  assert.equal(report.writebackPlan.totalBlockers, 16)
  assert.deepEqual(report.writebackPlan.blockingGroups, [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "envImport",
    "slsAlerts",
  ])
  const groupById = new Map(report.writebackPlan.groups.map((group) => [group.id, group]))
  assert.equal(groupById.get("runtime").ready, false)
  assert.equal(groupById.get("oss").ready, false)
  assert.equal(groupById.get("envImport").ready, false)
  assert.equal(groupById.get("slsAlerts").ready, false)
  assert.ok(groupById.get("apiDomainHttps").blockers.includes("apiDomainHttps:confirmed"))
  assert.ok(groupById.get("assetDomainHttps").blockers.includes("assetDomainHttps:confirmed"))
  assert.ok(report.nextActions.some((item) => item.includes("backend-only 口径下微信开放平台移动应用")))
  assertNoSecretLikeValues(output)
})
