const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun action authorization command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:action:authorization"], "node ./scripts/summarize-aliyun-action-authorization.mjs")
  assert.equal(pkg.scripts["aliyun:action:authorization:backend"], "node ./scripts/summarize-aliyun-action-authorization.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:action:authorization:test"], "node --test tests/aliyun-action-authorization.static.test.js")
  assert.match(predeploy, /aliyun:action:authorization:test/)
  assert.match(predeploy, /aliyun:action:authorization/)
  assert.match(predeploy, /aliyun:action:authorization:backend/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization:backend"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:action:authorization"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:action:authorization:backend"))
  assert.match(releaseArtifacts, /scripts\/summarize-aliyun-action-authorization\.mjs"[\s\S]*\.\.\.backendOnlyArg/)
  assert.match(releaseArtifacts, /authorizationPackets/)
  assert.match(releaseArtifacts, /authorizationPacketIds/)
  assert.match(releaseArtifacts, /canStartNowPackets/)
  assert.match(releaseArtifacts, /nextActionTimeConfirmations/)
  assert.match(releaseArtifacts, /blockedByPacketDependencies/)
  assert.match(releaseArtifacts, /authorizationClosureBrief/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /partiallyObservedResourceEvidenceIds/)
})

test("Aliyun action authorization matrix separates local-safe work from external actions", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-action-authorization.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.actions.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.canDeployNow, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.actions, 12)
  assert.equal(report.summary.authorizationPackets, 12)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.deepEqual(report.summary.canStartNowPackets, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P03_ACR_PURCHASE",
  ])
  assert.deepEqual(report.summary.deferredAppLaunchPackets, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.deepEqual(report.summary.nextActionTimeConfirmations, report.summary.canStartNowPackets)
  assert.ok(report.summary.blockedByPacketDependencies.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.summary.blockedByPacketDependencies.includes("P09_PRODUCTION_DEPLOY"))
  assert.deepEqual(report.summary.canCodexProceedWithoutUser, [])
  assert.equal(report.summary.cloudConsoleTasks, 7)
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.ok(report.summary.fullAppRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.fullAppRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.summary.blockedCredentialCount, 8)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.equal(report.authorizationClosureBrief.canDeployNow, false)
  assert.equal(report.authorizationClosureBrief.canCodexProceedWithoutUser, false)
  assert.equal(report.authorizationClosureBrief.blockedCredentialCount, 8)
  assert.ok(report.authorizationClosureBrief.blockedCredentialNames.includes("DATABASE_URL_CN"))
  assert.ok(report.authorizationClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.authorizationClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.authorizationClosureBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.authorizationClosureBrief.resourceEvidenceReady, "0/7")
  assert.ok(report.authorizationClosureBrief.blockedResourceEvidenceIds.includes("R02_ACR_IMAGE_REGISTRY"))
  assert.ok(report.authorizationClosureBrief.blockedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.authorizationClosureBrief.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.authorizationClosureBrief.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.authorizationClosureBrief.blockedResourceEvidence.some((item) =>
    item.id === "R05_OSS_AUDIO_STORAGE" &&
    item.observedReadiness === "partial" &&
    item.currentEvidence.some((evidence) => /bucket_exists/.test(evidence))
  ))
  assert.deepEqual(report.authorizationClosureBrief.canStartNowPackets, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P03_ACR_PURCHASE",
  ])
  assert.deepEqual(report.authorizationClosureBrief.deferredAppLaunchPackets, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.deepEqual(report.authorizationClosureBrief.canStartNowConsoleTasks, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(report.authorizationClosureBrief.blockedByPacketDependencies.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.authorizationClosureBrief.blockedByTaskDependencies.includes("C01_SAE_RUNTIME"))

  assert.equal(byId.get("U00_ALIYUN_READONLY_INVENTORY_IDENTITY").automationPolicy, "readonly_inventory_identity_requires_action_time_confirmation")
  assert.equal(byId.get("U00_ALIYUN_READONLY_INVENTORY_IDENTITY").blockerClass, "readonly_cloud_inventory_identity")
  assert.equal(byId.get("U00_ALIYUN_READONLY_INVENTORY_IDENTITY").requiresActionTimeConfirmation, true)
  assert.ok(byId.get("U00_ALIYUN_READONLY_INVENTORY_IDENTITY").currentBlockers.includes("readonly_inventory_strict_ready=0/9"))
  assert.ok(byId.get("U00_ALIYUN_READONLY_INVENTORY_IDENTITY").currentEvidence.includes("mutationPerformedCommandResults=0"))

  assert.equal(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").automationPolicy, "external_platform_review_required")
  assert.equal(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").requiresActionTimeConfirmation, true)
  assert.ok(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").currentEvidence.includes("wechatOpenPlatform.mobileAppCreated=false"))
  assert.ok(byId.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").currentBlockers.includes("wechatOpenPlatform:mobileAppCreated"))

  assert.equal(byId.get("U10_ANDROID_RELEASE_SIGNING").automationPolicy, "android_release_signing_requires_action_time_confirmation")
  assert.equal(byId.get("U10_ANDROID_RELEASE_SIGNING").blockerClass, "android_keystore_password_or_signature")
  assert.equal(byId.get("U10_ANDROID_RELEASE_SIGNING").requiresActionTimeConfirmation, true)
  assert.ok(byId.get("U10_ANDROID_RELEASE_SIGNING").variableNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.ok(byId.get("U10_ANDROID_RELEASE_SIGNING").currentBlockers.includes("S07_ANDROID_RELEASE_SIGNING:blocked"))
  assert.ok(byId.get("U10_ANDROID_RELEASE_SIGNING").currentBlockers.includes("wechatOpenPlatform:androidSignature"))

  assert.equal(byId.get("U02_APPLE_TEAM_ID").requiresActionTimeConfirmation, true)

  assert.equal(byId.get("U03_ACR_PURCHASE_CONFIRMATION").automationPolicy, "paid_purchase_requires_action_time_confirmation")
  assert.equal(byId.get("U03_ACR_PURCHASE_CONFIRMATION").requiresActionTimeConfirmation, true)
  assert.ok(byId.get("U03_ACR_PURCHASE_CONFIRMATION").currentEvidence.includes("R02_ACR_IMAGE_REGISTRY:acr.purchaseCandidate.quotedAmount=CNY 117.00"))

  assert.equal(byId.get("U06_ENV_IMPORT").automationPolicy, "secret_import_requires_action_time_confirmation")
  assert.equal(byId.get("U06_ENV_IMPORT").blockerClass, "ready_sensitive_env_need_cloud_import")
  assert.ok(byId.get("U06_ENV_IMPORT").currentBlockers.includes("envImport:secretNotInImage"))

  assert.equal(byId.get("U04_ACR_RUNTIME_AUTH").requiresActionTimeConfirmation, true)
  assert.equal(byId.get("U05_OSS_RAM_OR_STS").requiresActionTimeConfirmation, true)

  assert.equal(byId.get("U11_ALIYUN_RDS_DATA_MIGRATION").automationPolicy, "rds_creation_and_database_migration_requires_action_time_confirmation")
  assert.equal(byId.get("U11_ALIYUN_RDS_DATA_MIGRATION").blockerClass, "database_secret_and_migration")
  assert.match(byId.get("U11_ALIYUN_RDS_DATA_MIGRATION").why, /兼容审查/)
  assert.ok(byId.get("U11_ALIYUN_RDS_DATA_MIGRATION").variableNames.includes("DATABASE_URL_CN"))
  assert.ok(byId.get("U11_ALIYUN_RDS_DATA_MIGRATION").currentBlockers.includes("rdsMigrationIncludedInThisRelease=false"))

  assert.equal(byId.get("U07_DOMAIN_DNS_HTTPS_ICP").automationPolicy, "dns_https_icp_requires_action_time_confirmation")
  assert.ok(byId.get("U07_DOMAIN_DNS_HTTPS_ICP").currentBlockers.includes("apiDomainHttps:dnsResolvedToAliyun"))

  assert.equal(byId.get("U08_SAE_RUNTIME_AND_SLS").automationPolicy, "cloud_resource_creation_requires_action_time_confirmation")
  assert.ok(byId.get("U08_SAE_RUNTIME_AND_SLS").currentBlockers.includes("runtime:confirmed"))

  assert.equal(byId.get("U09_DEPLOY_AUTHORIZATION").automationPolicy, "production_release_requires_explicit_authorization")
  assert.ok(byId.get("U09_DEPLOY_AUTHORIZATION").currentBlockers.includes("canDeployNow=false"))

  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("购买 ACR")))
  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("创建/修改 SAE")))
  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("读取、复制、粘贴、导入或输出")))
  assert.ok(report.safeLocalWorkStillAllowed.some((item) => item.includes("运行本地检查")))

  assert.equal(report.nextActionTimeConfirmations.length, 4)
  assert.deepEqual(report.deferredAppLaunchConfirmations.map((item) => item.packetId), [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  const nextConfirmationsById = new Map(report.nextActionTimeConfirmations.map((item) => [item.packetId, item]))
  const deferredConfirmationsById = new Map(report.deferredAppLaunchConfirmations.map((item) => [item.packetId, item]))
  assert.match(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").minimumUserPhrase, /allowlisted 只读盘点命令/)
  assert.match(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").minimumUserPhrase, /等待当前阿里云 CloudShell 连接完成/)
  assert.equal(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").cloudShellCurrentStatus, "connecting_terminal_input_visible_inventory_not_executed")
  assert.equal(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").cloudShellConnecting, true)
  assert.equal(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").cloudShellTerminalInputVisible, true)
  assert.ok(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").allowedActions.some((item) =>
    item.includes("正在连接 Cloud Shell")
  ))
  assert.ok(nextConfirmationsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").explicitlyExcluded.some((item) =>
    item.includes("当前 connecting 状态不授权")
  ))
  assert.match(deferredConfirmationsById.get("P01_WECHAT_OPEN_MOBILE_APP").minimumUserPhrase, /微信开放平台创建\/补全美业话镜移动应用资料/)
  assert.match(deferredConfirmationsById.get("P10_ANDROID_RELEASE_SIGNING").minimumUserPhrase, /Android release keystore/)
  assert.ok(deferredConfirmationsById.get("P02_APPLE_TEAM_ID").writeTargets.includes("APPLE_TEAM_ID -> 阿里云 SAE plain env"))
  assert.match(nextConfirmationsById.get("P03_ACR_PURCHASE").minimumUserPhrase, /CNY 117\.00/)
  assert.ok(
    nextConfirmationsById.get("P03_ACR_PURCHASE").explicitlyExcluded.some((item) =>
      item.includes("未明确确认金额前不点击付款"),
    ),
  )
  assert.equal(nextConfirmationsById.get("P03_ACR_PURCHASE").nonSecretEvidenceOnly, true)
  assert.ok(
    nextConfirmationsById.get("P05_OSS_RAM_STS").completionEvidence.includes("oss.ramLeastPrivilege=true"),
  )
  assert.ok(
    nextConfirmationsById.get("P05_OSS_RAM_STS").explicitlyExcluded.some((item) =>
      item.includes("不把 AccessKeySecret"),
    ),
  )
  assert.match(nextConfirmationsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").minimumUserPhrase, /RDS PostgreSQL/)
  assert.ok(
    nextConfirmationsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").allowedActions.some((item) =>
      item.includes("compatibilityReviewChecklist 6 类"),
    ),
  )
  assert.ok(
    nextConfirmationsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").completionEvidence.some((item) =>
      item.includes("compatibilityReviewChecklistItemCount=6"),
    ),
  )
  assert.ok(
    nextConfirmationsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").writeTargets.some((item) =>
      item.includes("DATABASE_URL_CN"),
    ),
  )

  assert.equal(report.authorizationPackets.length, 12)
  const packetsById = new Map(report.authorizationPackets.map((item) => [item.packetId, item]))
  assert.equal(packetsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").actionId, "U00_ALIYUN_READONLY_INVENTORY_IDENTITY")
  assert.equal(packetsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").canStartNow, true)
  assert.equal(packetsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").nonSecretEvidenceOnly, true)
  assert.ok(packetsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").completionEvidence.includes("mutationPerformedCommandResults=0"))
  assert.equal(packetsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").cloudShellCurrentStatus, "connecting_terminal_input_visible_inventory_not_executed")
  assert.match(packetsById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").minimumUserPhrase, /等待当前阿里云 CloudShell 连接完成/)
  assert.equal(packetsById.get("P10_ANDROID_RELEASE_SIGNING").actionId, "U10_ANDROID_RELEASE_SIGNING")
  assert.equal(packetsById.get("P10_ANDROID_RELEASE_SIGNING").canStartNow, true)
  assert.ok(packetsById.get("P10_ANDROID_RELEASE_SIGNING").completionEvidence.includes("wechatOpenPlatform.androidConfigured=true"))
  assert.equal(packetsById.get("P03_ACR_PURCHASE").actionId, "U03_ACR_PURCHASE_CONFIRMATION")
  assert.equal(packetsById.get("P03_ACR_PURCHASE").canStartNow, true)
  assert.match(packetsById.get("P03_ACR_PURCHASE").minimumUserPhrase, /CNY 117\.00/)
  assert.ok(packetsById.get("P03_ACR_PURCHASE").explicitlyExcluded.some((item) => item.includes("docker login")))
  assert.deepEqual(packetsById.get("P04_ACR_IMAGE_AND_PULL").dependsOn, ["P03_ACR_PURCHASE"])
  assert.deepEqual(packetsById.get("P04_ACR_IMAGE_AND_PULL").blockingDependencies, ["P03_ACR_PURCHASE"])
  assert.equal(packetsById.get("P04_ACR_IMAGE_AND_PULL").canStartNow, false)
  assert.ok(packetsById.get("P04_ACR_IMAGE_AND_PULL").explicitlyExcluded.some((item) => item.includes("不购买 ACR")))
  assert.deepEqual(packetsById.get("P06_ENV_IMPORT").dependsOn, [
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.ok(
    packetsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").allowedActions.some((item) =>
      item.includes("docs/app-production-cn-rds-migration-package.md"),
    ),
  )
  assert.ok(
    packetsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").completionEvidence.includes("migration.schemaCompatibilityReviewed=true"),
  )
  assert.ok(packetsById.get("P06_ENV_IMPORT").explicitlyExcluded.some((item) => item.includes("不把任何 value")))
  assert.deepEqual(packetsById.get("P07_DOMAIN_DNS_HTTPS").dependsOn, ["P08_SAE_RUNTIME_SLS"])
  assert.ok(packetsById.get("P07_DOMAIN_DNS_HTTPS").allowedActions.some((item) => item.includes("api-cn.ipgongchang.xin")))
  assert.ok(packetsById.get("P08_SAE_RUNTIME_SLS").explicitlyExcluded.some((item) => item.includes("不推送镜像")))
  assert.ok(!packetsById.get("P09_PRODUCTION_DEPLOY").dependsOn.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(packetsById.get("P09_PRODUCTION_DEPLOY").dependsOn.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(packetsById.get("P09_PRODUCTION_DEPLOY").dependsOn.includes("P08_SAE_RUNTIME_SLS"))
  assert.equal(packetsById.get("P09_PRODUCTION_DEPLOY").canStartNow, false)
  assert.ok(packetsById.get("P09_PRODUCTION_DEPLOY").explicitlyExcluded.some((item) => item.includes("不 git push")))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun action authorization markdown includes closure brief without secret values", () => {
  const markdownPath = "/tmp/meiye-aliyun-action-authorization-test.md"
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /## 目标闭环证据简表/)
  assert.match(markdown, /blockedCredentialCount: 8/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /resourceEvidenceReady: 0\/7/)
  assert.match(markdown, /blockedResourceEvidenceIds: .*R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdown, /canStartNowPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /blockedByPacketDependencies: .*P04_ACR_IMAGE_AND_PULL/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun action authorization backend-only mode excludes deferred APP launch blockers", () => {
  const markdownPath = "/tmp/meiye-aliyun-action-authorization-backend-test.md"
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--backend-only",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const actionIds = report.actions.map((item) => item.id)
  const packetIds = report.authorizationPackets.map((item) => item.packetId)
  const envImportEvidence = report.authorizationClosureBrief.blockedResourceEvidence
    .find((item) => item.id === "R06_ENV_IMPORT")
  const envImportPacket = report.authorizationPackets.find((item) => item.packetId === "P06_ENV_IMPORT")

  assert.equal(report.backendOnly, true)
  assert.equal(report.summary.actions, 9)
  assert.equal(report.summary.authorizationPackets, 9)
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.fullAppRequiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.deferredAppLaunchBlocking, [])
  assert.equal(report.summary.deferredAppLaunchBlockingCount, 2)
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.deepEqual(report.authorizationClosureBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.authorizationClosureBrief.blockedCredentialCount, 1)
  assert.deepEqual(report.summary.nextActionTimeConfirmations, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P03_ACR_PURCHASE",
  ])
  assert.ok(!actionIds.includes("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(!actionIds.includes("U10_ANDROID_RELEASE_SIGNING"))
  assert.ok(!actionIds.includes("U02_APPLE_TEAM_ID"))
  assert.ok(!packetIds.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(packetIds.includes("P00_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.ok(!packetIds.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(!packetIds.includes("P02_APPLE_TEAM_ID"))
  assert.ok(envImportEvidence.missingEvidence.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!envImportEvidence.missingEvidence.some((item) => /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/.test(item)))
  assert.ok(!envImportPacket.explicitlyExcluded.some((item) => /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/.test(item)))
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.doesNotMatch(output + markdown, /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(output + markdown, /MEIYE_RELEASE_STORE_PASSWORD|MEIYE_RELEASE_KEY_PASSWORD/)
})

test("Aliyun action authorization packet handoff documents the current packet gate", () => {
  const handoff = read("docs", "app-production-cn-action-authorization-packets.md")
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-action-authorization.mjs", "--backend-only"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)

  assert.match(handoff, /现在不能部署；当前只推进阿里云后端/)
  assert.match(handoff, /currentScope: backend_aliyun_only/)
  assert.match(handoff, /fullAppLaunchScope: deferred_after_backend_online/)
  assert.match(handoff, /canDeployNow: false/)
  assert.match(handoff, /secretLeakCheck: true/)
  assert.match(handoff, /resourceEvidenceReady: 0\/7/)
  assert.match(handoff, /blockedCredentialCount: 1/)
  assert.match(handoff, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(handoff, /readySecretEnvVariableCount: 17/)
  assert.match(handoff, /canStartNowPackets: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P03_ACR_PURCHASE/)
  assert.match(handoff, /deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID/)
  assert.doesNotMatch(handoff, /blockedCredentialNames: .*WECHAT_OPEN_APP/)
  assert.doesNotMatch(handoff, /currentBlockers: .*WECHAT_OPEN_APP/)

  for (const packet of report.authorizationPackets) {
    assert.match(handoff, new RegExp(packet.packetId))
    assert.match(handoff, new RegExp(packet.actionId))
    for (const dependency of packet.dependsOn || []) {
      assert.match(handoff, new RegExp(dependency))
    }
  }

  for (const packetId of report.summary.canStartNowPackets) {
    assert.match(handoff, new RegExp(packetId))
  }
  for (const packetId of report.summary.blockedByPacketDependencies) {
    assert.match(handoff, new RegExp(packetId))
  }
  for (const resourceId of report.summary.blockedResourceEvidenceIds) {
    assert.match(handoff, new RegExp(resourceId))
  }
  for (const resourceId of report.summary.partiallyObservedResourceEvidenceIds) {
    assert.match(handoff, new RegExp(resourceId))
  }
  for (const name of report.authorizationClosureBrief.blockedCredentialNames) {
    assert.match(handoff, new RegExp(name))
  }

  assert.doesNotMatch(handoff, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(handoff, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(handoff, /:\/\/[^\s:@]+:[^\s@]+@/)
})
