const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function runCloudConfirmations(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(text, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

test("Aliyun cloud confirmations backend-only command is wired and release artifacts pass the scope flag", () => {
  const pkg = readJson("package.json")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:cloud:confirmations"], "node ./scripts/check-aliyun-cloud-confirmations.mjs --allow-incomplete")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:backend"], "node ./scripts/check-aliyun-cloud-confirmations.mjs --backend-only --allow-incomplete")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:backend:strict"], "node ./scripts/check-aliyun-cloud-confirmations.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:strict"], "node ./scripts/check-aliyun-cloud-confirmations.mjs")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:test"], "node --test tests/aliyun-cloud-confirmations.static.test.js")
  assert.match(releaseArtifacts, /const backendOnlyArg = args\.backendOnly \? \["--backend-only"\] : \[\]/)
  assert.match(releaseArtifacts, /scripts\/check-aliyun-cloud-confirmations\.mjs"[\s\S]*\.\.\.backendOnlyArg[\s\S]*"--allow-incomplete"/)
})

test("Aliyun cloud confirmations full APP scope keeps WeChat mobile app blockers", () => {
  const { output, report } = runCloudConfirmations(["--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.currentScope, "full_app_launch")
  assert.equal(report.backendOnly, false)
  assert.equal(report.summary.totalBlockers, 27)
  assert.ok(report.summary.writebackBlockingGroups.includes("wechatOpenPlatform"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.local.blockers.some((item) => item.startsWith("wechatOpenPlatform:")))
  assert.equal(report.local.checkedItems, 7)
  assert.ok(Object.prototype.hasOwnProperty.call(report.local.itemStatus, "wechatOpenPlatform"))
  assertNoSecretLikeValues(output)
})

test("Aliyun cloud confirmations backend-only mode excludes deferred APP launch blockers", () => {
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
  assert.equal(report.summary.totalBlockers, 18)
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
  assert.deepEqual(report.summary.recommendedOssAccessModes, ["sae_runtime_role", "sts_assume_role"])
  assert.equal(report.summary.canStartP05AfterActionTimeConfirmation, true)
  assert.equal(report.summary.preferredOssAccessModeAvoidsLongLivedSecret, true)
  assert.equal(report.summary.domainHttpsPlanReady, false)
  assert.deepEqual(report.summary.recommendedDomainIngressModes, ["api_sae_custom_domain", "asset_cdn_custom_domain"])
  assert.equal(report.summary.runtimeSlsPlanReady, false)
  assert.deepEqual(report.summary.recommendedRuntimeSlsModes, ["sae_custom_container_runtime", "sls_health_5xx_alerts"])
  assert.equal(report.summary.envImportPlanReady, false)
  assert.deepEqual(report.summary.envImportBlockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.envImportReadySecretEnvVariableCount, 17)
  assert.deepEqual(report.summary.blockedEnvImportBatchIds, [
    "BLOCKED_SECRET_BATCH_01_OSS_RAM_STS",
    "BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
  ])
  assert.equal(report.summary.readyEnvImportBatchIds.length, 9)
  assert.equal(report.runtimeSlsPlan.ready, false)
  assert.equal(report.runtimeSlsPlan.selectedModes.runtime, "pending_create_sae_custom_container_runtime")
  assert.equal(report.runtimeSlsPlan.selectedModes.slsAlerts, "pending_bind_sae_logs_and_alerts")
  assert.deepEqual(report.runtimeSlsPlan.recommendedModeIds, ["sae_custom_container_runtime", "sls_health_5xx_alerts"])
  assert.equal(report.runtimeSlsPlan.groups.runtime.targetAppName, "meiye-huajing-app-api-production-cn")
  assert.equal(report.runtimeSlsPlan.groups.slsAlerts.targetProject, "meiye-huajing-app-prod-cn")
  assert.equal(report.runtimeSlsPlan.groups.slsAlerts.targetLogstore, "app-api")
  assert.ok(report.runtimeSlsPlan.groups.runtime.writebackTemplate.optionalNonSecretFields.includes("acrImage"))
  assert.ok(report.runtimeSlsPlan.groups.runtime.writebackTemplate.optionalNonSecretFields.includes("envSecretSource"))
  assert.ok(report.runtimeSlsPlan.groups.slsAlerts.writebackTemplate.optionalNonSecretFields.includes("healthAlertName"))
  assert.ok(report.runtimeSlsPlan.groups.slsAlerts.writebackTemplate.optionalNonSecretFields.includes("notificationChannel"))
  assert.ok(report.runtimeSlsPlan.candidates.find((item) => item.id === "sae_custom_container_runtime").writeBackFields.includes("items.runtime.imagePullConfigured=true"))
  assert.ok(report.runtimeSlsPlan.candidates.find((item) => item.id === "sls_health_5xx_alerts").writeBackFields.includes("items.slsAlerts.healthAlertConfigured=true"))
  assert.equal(report.domainHttpsPlan.ready, false)
  assert.equal(report.domainHttpsPlan.selectedModes.apiDomainHttps, "pending_sae_runtime_public_endpoint")
  assert.equal(report.domainHttpsPlan.selectedModes.assetDomainHttps, "pending_choose_cdn_or_oss_custom_domain")
  assert.deepEqual(report.domainHttpsPlan.recommendedModeIds, ["api_sae_custom_domain", "asset_cdn_custom_domain"])
  assert.equal(report.domainHttpsPlan.groups.apiDomainHttps.targetHost, "api-cn.ipgongchang.xin")
  assert.equal(report.domainHttpsPlan.groups.assetDomainHttps.targetHost, "assets-cn.ipgongchang.xin")
  assert.ok(report.domainHttpsPlan.groups.apiDomainHttps.writebackTemplate.optionalNonSecretFields.includes("recordValue"))
  assert.ok(report.domainHttpsPlan.groups.apiDomainHttps.writebackTemplate.optionalNonSecretFields.includes("certificateId"))
  assert.ok(report.domainHttpsPlan.groups.assetDomainHttps.writebackTemplate.optionalNonSecretFields.includes("httpsProbeUrl"))
  assert.ok(report.domainHttpsPlan.candidates.find((item) => item.id === "api_sae_custom_domain").writeBackFields.includes("items.apiDomainHttps.ingressType=sae_custom_domain"))
  assert.ok(report.domainHttpsPlan.candidates.find((item) => item.id === "asset_cdn_custom_domain").writeBackFields.includes("items.assetDomainHttps.ingressType=cdn_custom_domain"))
  assert.equal(report.domainHttpsPlan.candidates.find((item) => item.id === "asset_oss_custom_domain").recommended, false)
  assert.equal(report.ossAccessPlan.selectedMode, "pending_choose_sae_runtime_role_or_sts")
  assert.equal(report.ossAccessPlan.selectedReady, false)
  assert.deepEqual(report.ossAccessPlan.selectedBlockers, ["oss.confirmed", "oss.ramLeastPrivilege"])
  assert.equal(report.ossAccessPlan.executionReadiness.canStartP05AfterActionTimeConfirmation, true)
  assert.equal(report.ossAccessPlan.executionReadiness.resourceReadyForP05, true)
  assert.equal(report.ossAccessPlan.executionReadiness.accessGrantReady, false)
  assert.equal(report.ossAccessPlan.executionReadiness.preferredModeId, "sae_runtime_role")
  assert.equal(report.ossAccessPlan.executionReadiness.preferredModeAvoidsLongLivedSecret, true)
  assert.deepEqual(report.ossAccessPlan.executionReadiness.fallbackSecretModeIds, [
    "sts_assume_role",
    "least_privilege_ram_user_secret_env",
  ])
  assert.deepEqual(report.ossAccessPlan.executionReadiness.fallbackSecretEnvNames, [
    "ALIYUN_OSS_ACCESS_KEY_ID",
    "ALIYUN_OSS_ACCESS_KEY_SECRET",
    "ALIYUN_OSS_SECURITY_TOKEN",
  ])
  assert.equal(
    report.ossAccessPlan.executionReadiness.nextOperatorDecision,
    "choose_sae_runtime_role_or_sts_then_bind_least_privilege_policy",
  )
  assert.ok(report.ossAccessPlan.executionReadiness.postActionWritebackFields.includes("items.oss.ramLeastPrivilege=true"))
  assert.ok(report.ossAccessPlan.executionReadiness.verificationCommands.includes("corepack pnpm aliyun:sensitive:blockers:backend"))
  assert.ok(report.ossAccessPlan.executionReadiness.safetyBoundary.some((item) => item.includes("Prefer sae_runtime_role")))
  assert.equal(report.ossAccessPlan.policyFile, "deploy/aliyun-production-cn.oss-ram-policy.json")
  assert.equal(report.ossAccessPlan.policyName, "MeiyeHuajingServiceRecordsOssPolicy")
  assert.equal(report.ossAccessPlan.runtimePrefixContract.requiredEnvName, "SERVICE_RECORD_OSS_PREFIX")
  assert.equal(report.ossAccessPlan.runtimePrefixContract.expectedValue, "service-records/production-cn")
  assert.equal(report.ossAccessPlan.runtimePrefixContract.codeDefaultWithoutEnv, "service-records")
  assert.equal(
    report.ossAccessPlan.runtimePrefixContract.policyScope,
    "acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*",
  )
  assert.equal(report.ossAccessPlan.runtimePrefixContract.policyScopeCoversExpectedPrefix, true)
  assert.equal(report.ossAccessPlan.runtimePrefixContract.currentConfirmationPrefixReady, true)
  assert.equal(report.ossAccessPlan.runtimePrefixContract.importTarget, "阿里云 SAE plain env")
  assert.ok(
    report.ossAccessPlan.runtimePrefixContract.postActionWritebackFields.includes(
      "SAE plain env SERVICE_RECORD_OSS_PREFIX=service-records/production-cn",
    ),
  )
  assert.deepEqual(report.ossAccessPlan.selectedSecretEnvNames, [])
  assert.equal(report.ossAccessPlan.writebackTemplate.jsonPath, "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss")
  assert.ok(report.ossAccessPlan.writebackTemplate.optionalNonSecretFields.includes("accessMode"))
  assert.ok(report.ossAccessPlan.writebackTemplate.optionalNonSecretFields.includes("roleOrUserName"))
  assert.ok(report.ossAccessPlan.writebackTemplate.requiredCompletionFields.includes("ramLeastPrivilege=true"))
  assert.deepEqual(report.ossAccessPlan.writebackTemplate.modeIds, [
    "sae_runtime_role",
    "sts_assume_role",
    "least_privilege_ram_user_secret_env",
  ])
  assert.deepEqual(report.ossAccessPlan.allowedActions, ["oss:GetObject", "oss:PutObject", "oss:PostObject"])
  assert.equal(
    report.ossAccessPlan.resourceScope,
    "acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*",
  )
  assert.deepEqual(report.ossAccessPlan.recommendedModeIds, ["sae_runtime_role", "sts_assume_role"])
  assert.equal(report.ossAccessPlan.candidates.find((item) => item.id === "sae_runtime_role").recommended, true)
  assert.equal(report.ossAccessPlan.candidates.find((item) => item.id === "sts_assume_role").recommended, true)
  assert.ok(report.ossAccessPlan.candidates.find((item) => item.id === "sae_runtime_role").writeBackFields.includes("items.oss.accessMode=sae_runtime_role"))
  assert.ok(report.ossAccessPlan.candidates.find((item) => item.id === "sts_assume_role").writeBackFields.includes("items.oss.credentialBoundary=sts_token_secret_env_only"))
  assert.ok(report.ossAccessPlan.candidates.find((item) => item.id === "least_privilege_ram_user_secret_env").writeBackFields.includes("items.oss.credentialBoundary=access_key_secret_env_only"))
  assert.equal(
    report.ossAccessPlan.candidates.find((item) => item.id === "least_privilege_ram_user_secret_env").recommended,
    false,
  )
  assert.ok(!report.local.blockers.some((item) => item.startsWith("wechatOpenPlatform:")))
  assert.equal(report.local.checkedItems, 6)
  assert.ok(!Object.prototype.hasOwnProperty.call(report.local.itemStatus, "wechatOpenPlatform"))
  assert.equal(report.writebackPlan.totalBlockers, 18)
  assert.ok(!report.writebackPlan.blockingGroups.includes("wechatOpenPlatform"))
  assert.ok(report.writebackPlan.groups.every((group) => group.id !== "wechatOpenPlatform"))
  assert.ok(report.writebackPlan.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:confirmations:backend:strict"))
  assert.ok(report.writebackPlan.groups.every((group) =>
    group.verifyCommands.includes("corepack pnpm aliyun:cloud:confirmations:backend")))
  const runtimeGroup = report.writebackPlan.groups.find((group) => group.id === "runtime")
  const slsGroup = report.writebackPlan.groups.find((group) => group.id === "slsAlerts")
  assert.ok(runtimeGroup)
  assert.ok(slsGroup)
  assert.equal(runtimeGroup.runtimeSlsPlan.selectedMode, "pending_create_sae_custom_container_runtime")
  assert.equal(runtimeGroup.runtimeSlsPlan.targetAppName, "meiye-huajing-app-api-production-cn")
  assert.deepEqual(runtimeGroup.runtimeSlsPlan.recommendedModeIds, ["sae_custom_container_runtime"])
  assert.equal(runtimeGroup.runtimeSlsPlan.writebackTemplate.jsonPath, "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime")
  assert.equal(slsGroup.runtimeSlsPlan.selectedMode, "pending_bind_sae_logs_and_alerts")
  assert.equal(slsGroup.runtimeSlsPlan.targetProject, "meiye-huajing-app-prod-cn")
  assert.equal(slsGroup.runtimeSlsPlan.targetLogstore, "app-api")
  assert.deepEqual(slsGroup.runtimeSlsPlan.recommendedModeIds, ["sls_health_5xx_alerts"])
  assert.equal(slsGroup.runtimeSlsPlan.writebackTemplate.jsonPath, "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts")
  const ossGroup = report.writebackPlan.groups.find((group) => group.id === "oss")
  assert.ok(ossGroup)
  assert.equal(ossGroup.ossAccessPlan.selectedMode, "pending_choose_sae_runtime_role_or_sts")
  assert.equal(ossGroup.ossAccessPlan.executionReadiness.canStartP05AfterActionTimeConfirmation, true)
  assert.equal(ossGroup.ossAccessPlan.executionReadiness.preferredModeAvoidsLongLivedSecret, true)
  assert.deepEqual(ossGroup.ossAccessPlan.recommendedModeIds, ["sae_runtime_role", "sts_assume_role"])
  assert.equal(ossGroup.ossAccessPlan.policyFile, "deploy/aliyun-production-cn.oss-ram-policy.json")
  assert.equal(ossGroup.ossAccessPlan.policyName, "MeiyeHuajingServiceRecordsOssPolicy")
  assert.equal(ossGroup.ossAccessPlan.writebackTemplate.jsonPath, "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss")
  const apiDomainGroup = report.writebackPlan.groups.find((group) => group.id === "apiDomainHttps")
  const assetDomainGroup = report.writebackPlan.groups.find((group) => group.id === "assetDomainHttps")
  assert.ok(apiDomainGroup)
  assert.ok(assetDomainGroup)
  assert.equal(apiDomainGroup.domainHttpsPlan.selectedMode, "pending_sae_runtime_public_endpoint")
  assert.equal(apiDomainGroup.domainHttpsPlan.targetHost, "api-cn.ipgongchang.xin")
  assert.deepEqual(apiDomainGroup.domainHttpsPlan.recommendedModeIds, ["api_sae_custom_domain"])
  assert.equal(apiDomainGroup.domainHttpsPlan.writebackTemplate.jsonPath, "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps")
  assert.equal(assetDomainGroup.domainHttpsPlan.selectedMode, "pending_choose_cdn_or_oss_custom_domain")
  assert.equal(assetDomainGroup.domainHttpsPlan.targetHost, "assets-cn.ipgongchang.xin")
  assert.deepEqual(assetDomainGroup.domainHttpsPlan.recommendedModeIds, ["asset_cdn_custom_domain"])
  assert.equal(assetDomainGroup.domainHttpsPlan.writebackTemplate.jsonPath, "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps")
  const envImportGroup = report.writebackPlan.groups.find((group) => group.id === "envImport")
  assert.ok(envImportGroup)
  assert.equal(
    envImportGroup.blockedUntil,
    "RDS/DATABASE_URL_CN、OSS/RAM、ACR 镜像和 SAE runtime 目标明确后导入变量",
  )
  assert.doesNotMatch(envImportGroup.blockedUntil, /微信移动应用/)
  assert.equal(report.envImportPlan.ready, false)
  assert.equal(report.envImportPlan.selectedMode, "pending_secret_env_import_after_resource_dependencies")
  assert.equal(report.envImportPlan.importTarget, "SAE")
  assert.deepEqual(report.envImportPlan.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.envImportPlan.blockedSecretBatchIds, [
    "BLOCKED_SECRET_BATCH_01_OSS_RAM_STS",
    "BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
  ])
  assert.equal(report.envImportPlan.readySecretBatchIds.length, 9)
  assert.deepEqual(report.envImportPlan.candidates.map((item) => item.id), [
    "blocked_rds_database_url_secret",
    "blocked_oss_ram_sts_secret_env",
    "ready_backend_secret_env_batches",
  ])
  assert.equal(
    report.envImportPlan.writebackTemplate.jsonPath,
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
  )
  assert.deepEqual(envImportGroup.envImportPlan.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(envImportGroup.envImportPlan.readySecretEnvVariableCount, 17)
  assert.equal(
    envImportGroup.envImportPlan.writebackTemplate.jsonPath,
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
  )
  assert.ok(report.nextActions.some((item) => item.includes("backend-only 口径下微信开放平台移动应用")))
  assertNoSecretLikeValues(output)
})
