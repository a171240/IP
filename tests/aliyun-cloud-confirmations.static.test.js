/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
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

function writeSanitizedCloudConfirmationsFixture(mutate) {
  const source = readJson(fixtureCloudConfirmations)
  const sanitized = {
    ...source,
    notes: `${source.notes} Copied by static test into temporary template/local files.`,
  }
  if (mutate) mutate(sanitized)
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-confirmations-fixture-"))
  const templatePath = path.join(tmpdir, "cloud-confirmations.template.json")
  const localPath = path.join(tmpdir, "cloud-confirmations.local.json")
  fs.writeFileSync(templatePath, JSON.stringify(sanitized, null, 2))
  fs.writeFileSync(localPath, JSON.stringify(sanitized, null, 2))
  return { templatePath, localPath }
}

function runCloudConfirmations(args = [], mutate) {
  const { templatePath, localPath } = writeSanitizedCloudConfirmationsFixture(mutate)
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

test("Aliyun cloud confirmation template documents strict personal-trial expiry scheduler evidence", () => {
  const example = readJson(
    "deploy",
    "aliyun-production-cn.cloud-confirmations.example.json",
  )
  const scheduler =
    example.items.personalTrialReservationExpiryScheduler

  assert.deepEqual(
    {
      confirmed: scheduler.confirmed,
      region: scheduler.region,
      eventBusName: scheduler.eventBusName,
      eventSourceName: scheduler.eventSourceName,
      connectionName: scheduler.connectionName,
      apiDestinationName: scheduler.apiDestinationName,
      ruleName: scheduler.ruleName,
      ruleStatus: scheduler.ruleStatus,
      secretEnvName: scheduler.secretEnvName,
      secretValuesRecorded: scheduler.secretValuesRecorded,
      dedicatedSecretDistinctFromSharedCronSecret:
        scheduler.dedicatedSecretDistinctFromSharedCronSecret,
      pushRetryStrategy: scheduler.pushRetryStrategy,
      errorsTolerance: scheduler.errorsTolerance,
      deadLetterQueueEnabled: scheduler.deadLetterQueueEnabled,
    },
    {
      confirmed: false,
      region: "cn-hangzhou",
      eventBusName: "meiye-huajing-production-cn",
      eventSourceName: "personal-trial-reservation-expiry-5m",
      connectionName: "personal-trial-reservation-expiry-prod-cn",
      apiDestinationName: "personal-trial-reservation-expiry-prod-cn",
      ruleName: "personal-trial-reservation-expiry-5m",
      ruleStatus: "DISABLE",
      secretEnvName: "PERSONAL_TRIAL_EXPIRY_CRON_SECRET",
      secretValuesRecorded: false,
      dedicatedSecretDistinctFromSharedCronSecret: false,
      pushRetryStrategy: "BACKOFF_RETRY",
      errorsTolerance: "ALL",
      deadLetterQueueEnabled: false,
    },
  )

  const { output, report } = runCloudConfirmations(
    ["--backend-only", "--allow-incomplete"],
    (data) => {
      data.containsValues = false
      data.items.personalTrialReservationExpiryScheduler =
        structuredClone(scheduler)
    },
  )
  assert.deepEqual(report.template.warnings, [])
  assert.deepEqual(report.local.warnings, [])
  assertNoSecretLikeValues(output)
})

test("Aliyun cloud confirmations strict mode blocks missing personal-trial scheduler evidence", () => {
  const { templatePath, localPath } =
    writeSanitizedCloudConfirmationsFixture()
  const result = spawnSync(
    process.execPath,
    [
      "scripts/check-aliyun-cloud-confirmations.mjs",
      "--template",
      templatePath,
      "--local",
      localPath,
      "--backend-only",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 80,
    },
  )

  assert.equal(result.status, 1)
  assert.match(
    result.stdout,
    /personalTrialReservationExpiryScheduler:strict_evidence_required/,
  )
  assertNoSecretLikeValues(result.stdout)
})

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

test("allow-incomplete reports one missing local evidence file without crashing", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-confirmations-missing-local-"))
  const missingLocalPath = path.join(tmpdir, "cloud-confirmations.local.json")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--backend-only",
    "--allow-incomplete",
    "--local",
    missingLocalPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, false)
  assert.equal(report.local.exists, false)
  assert.deepEqual(report.local.blockers, ["file_missing"])
  assert.deepEqual(report.local.itemStatus, {})
  assert.equal(report.envImportPlan.ready, false)
  assert.ok(Array.isArray(report.envImportPlan.readySecretBatchIds))
  assert.ok(Array.isArray(report.envImportPlan.blockedSecretBatchIds))
  assert.ok(Array.isArray(report.envImportPlan.blockedCredentialNames))
  assertNoSecretLikeValues(output)
})

test("ready SAE runtime exposes only one validated five-field deployment identity", () => {
  const example = readJson("deploy", "aliyun-production-cn.cloud-confirmations.example.json")
  const checker = read("scripts", "check-aliyun-cloud-confirmations.mjs")
  const expectedIdentity = {
    imageDigest: `sha256:${"a".repeat(64)}`,
    saeAppId: "sae-app-20260711",
    saeDeploymentId: "sae-change-order-20260711",
    saeVersionId: "sae-version-20260711",
    deploymentCompletedAt: "2026-07-11T11:00:00.000Z",
  }
  const expectedAcrImage = "meiye-huajing-app-api-registry.cn-hangzhou.cr.aliyuncs.com/meiye/meiye-huajing-app-api:production-cn"
  for (const field of ["imageDigest", "appId", "lastDeployChangeOrderId", "saeVersionId", "deploymentCompletedAt"]) {
    assert.ok(Object.hasOwn(example.items.runtime, field), `${field} should be documented in the example`)
  }
  assert.match(checker, /deploymentIdentity/)

  const mutateReadyRuntime = (data) => {
    Object.assign(data.items.runtime, {
      confirmed: true,
      imageDigest: expectedIdentity.imageDigest,
      appId: expectedIdentity.saeAppId,
      lastDeployChangeOrderId: expectedIdentity.saeDeploymentId,
      saeVersionId: expectedIdentity.saeVersionId,
      deploymentCompletedAt: expectedIdentity.deploymentCompletedAt,
      acrImage: expectedAcrImage,
      imagePullConfigured: true,
    })
  }
  const { output, report } = runCloudConfirmations(["--backend-only", "--allow-incomplete"], mutateReadyRuntime)
  assert.equal(report.local.itemStatus.runtime.ready, true)
  assert.deepEqual(report.local.itemStatus.runtime.deploymentIdentity, expectedIdentity)
  assert.deepEqual(Object.keys(report.local.itemStatus.runtime).sort(), ["blockers", "deploymentIdentity", "ready"])
  assertNoSecretLikeValues(output)

  const invalidCases = [
    ["imageDigest", "sha256:invalid", "deployment_identity_image_digest"],
    ["appId", "TODO_APP", "deployment_identity_sae_app_id"],
    ["appId", "todo-app", "deployment_identity_sae_app_id"],
    ["appId", "pending_app", "deployment_identity_sae_app_id"],
    ["appId", "TBD-app", "deployment_identity_sae_app_id"],
    ["lastDeployChangeOrderId", "contains whitespace", "deployment_identity_sae_deployment_id"],
    ["saeVersionId", "", "deployment_identity_sae_version_id"],
    ["deploymentCompletedAt", "2026-07-11 11:00:00", "deployment_identity_completed_at"],
    ["deploymentCompletedAt", "2099-01-01T00:00:00.000Z", "deployment_identity_completed_in_future"],
    ["provider", "ECS", "provider=SAE"],
    ["region", "cn-shanghai", "region=cn-hangzhou"],
    ["appName", "wrong-app", "appName=meiye-huajing-app-api-production-cn"],
    ["imagePullConfigured", false, "imagePullConfigured=true"],
    ["acrImage", "TODO_ACR_IMAGE", "acrImage=production-cn"],
    ["acrImage", "docker.io/example/backend:latest", "acrImage=production-cn"],
  ]
  for (const [field, value, blocker] of invalidCases) {
    const invalid = runCloudConfirmations(["--backend-only", "--allow-incomplete"], (data) => {
      mutateReadyRuntime(data)
      data.items.runtime[field] = value
    })
    assert.equal(invalid.report.local.itemStatus.runtime.ready, false, field)
    assert.ok(invalid.report.local.itemStatus.runtime.blockers.includes(blocker), field)
    assert.equal(invalid.report.local.itemStatus.runtime.deploymentIdentity, null)
  }
})
