const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun cloud actions package command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const packageScript = read("scripts", "generate-aliyun-cloud-actions-package.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:cloud-actions:package"], "node ./scripts/generate-aliyun-cloud-actions-package.mjs")
  assert.equal(pkg.scripts["aliyun:cloud-actions:package:test"], "node --test tests/aliyun-cloud-actions-package.static.test.js")
  assert.match(predeploy, /aliyun:cloud-actions:package:test/)
  assert.match(predeploy, /aliyun:cloud-actions:package/)
  assert.match(packageScript, /C00_ALIYUN_CLOUD_ACTIONS/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud-actions:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud-actions:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloud-actions:package"))
  assert.match(releaseArtifacts, /cloudActionsPackage/)
  assert.match(releaseArtifacts, /cloudActionClosureBrief/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /partiallyObservedResourceEvidenceIds/)
  assert.match(releaseArtifacts, /cloudInventoryResultsReady/)
  assert.match(releaseArtifacts, /cloudInventoryReadyLocalOperations/)
  assert.match(releaseArtifacts, /cloudInventoryExecutedCommandResults/)
  assert.match(releaseArtifacts, /imagePublishWritebackBlockingGroups/)
  assert.match(releaseArtifacts, /writebackBlockingGroups/)
  assert.match(packageScript, /imagePublishWritebackPlan/)
  assert.match(packageScript, /currentActionAcceptanceEvidence/)
  assert.doesNotMatch(packageScript, /summarize-aliyun-blocker-brief/)
  assert.doesNotMatch(packageScript, /blocker_brief/)
  assert.doesNotMatch(packageScript, /summarize-aliyun-action-authorization/)
  assert.doesNotMatch(packageScript, /action_authorization/)
  assert.match(releaseArtifacts, /readonlyInventoryStatus/)
  assert.match(releaseArtifacts, /readonlyInventoryCurrentEvidence/)
  assert.match(releaseArtifacts, /executionQueueCanStartNow/)
  assert.match(releaseArtifacts, /executionQueueExternalAppPrerequisites/)
  assert.match(releaseArtifacts, /executionQueueBlockedByDependencies/)
  assert.match(releaseArtifacts, /cloud-actions-package\.json/)
})

test("Aliyun cloud actions package summarizes current cloud console action order without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-cloud-actions-package.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.packageId, "C00_ALIYUN_CLOUD_ACTIONS")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.summary.canDeployNow, false)
  assert.equal(report.summary.canProceedWithoutWechat, true)
  assert.deepEqual(report.summary.canStartNowConsoleTasks, ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS"])
  assert.ok(report.summary.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedByDependencies.includes("C06_ENV_IMPORT"))
  assert.deepEqual(report.summary.cloudConsolePackets, [
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(report.summary.externalAppPackets, [])
  assert.ok(report.summary.deferredAppLaunchPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredBlocking.includes("DATABASE_URL_CN"))
  assert.ok(report.summary.requiredBlocking.includes("RDS_POSTGRES_NOT_READY"))
  assert.equal(report.cloudAccess.canReadCloudNow, false)
  assert.equal(report.cloudAccess.cliConfigProbeFailureCategory, "aliyun_cli_profile_not_configured")
  assert.equal(report.summary.cloudInventoryResultsReady, true)
  assert.equal(report.summary.cloudInventoryReadyLocalOperations, "9/9")
  assert.equal(report.summary.cloudInventoryExecutedCommandResults, "12/12")
  assert.equal(report.summary.blockedCredentialCount, 8)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.equal(report.cloudActionClosureBrief.canDeployNow, false)
  assert.equal(report.cloudActionClosureBrief.blockedCredentialCount, 8)
  assert.ok(report.cloudActionClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.cloudActionClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.cloudActionClosureBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.cloudActionClosureBrief.resourceEvidenceReady, "0/7")
  assert.ok(report.cloudActionClosureBrief.blockedResourceEvidenceIds.includes("R02_ACR_IMAGE_REGISTRY"))
  assert.ok(report.cloudActionClosureBrief.blockedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.cloudActionClosureBrief.blockedResourceEvidence.some((item) =>
    item.id === "R07_SLS_ALERTS" &&
    item.observedReadiness === "partial" &&
    item.currentEvidence.some((evidence) => /project_meiye-huajing-app-prod-cn/.test(evidence))
  ))
  assert.equal(report.cloudActionClosureBrief.strictReadonlyInventoryReady, true)
  assert.equal(report.cloudActionClosureBrief.cloudInventoryReadyLocalOperations, "9/9")
  assert.equal(report.cloudActionClosureBrief.cloudInventoryExecutedCommandResults, "12/12")
  assert.equal(report.cloudActionClosureBrief.mutationPerformedCommandResults, 0)
  assert.deepEqual(report.cloudActionClosureBrief.canStartNowConsoleTasks, ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS"])
  assert.deepEqual(report.cloudActionClosureBrief.cloudConsolePackets, [
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(report.cloudActionClosureBrief.externalAppPackets, [])
  assert.ok(report.cloudActionClosureBrief.deferredAppLaunchPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.cloudActionClosureBrief.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.cloudActionClosureBrief.imagePublishWritebackBlockingGroups.includes("imagePushAndDigest"))
  assert.deepEqual(report.summary.imagePublishWritebackBlockingGroups, [
    "acrPurchaseAndRepository",
    "imagePushAndDigest",
    "saeRuntimeImagePull",
  ])
  assert.deepEqual(report.executionQueue.canStartNow.map((item) => item.id), ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS"])
  assert.ok(report.executionQueue.canStartNow.every((item) => item.kind === "aliyun_console_task"))
  assert.ok(report.executionQueue.canStartNow.every((item) => item.requiresActionTimeConfirmation === true))
  assert.ok(report.executionQueue.canStartNow.some((item) => item.minimumAuthorizationPhrase.includes("ACR")))
  assert.ok(report.executionQueue.canStartNow.some((item) => item.consolePath.includes("OSS")))
  const queueAcr = report.executionQueue.canStartNow.find((item) => item.id === "C02_ACR_IMAGE_AND_PULL")
  assert.equal(queueAcr.currentActionScope, "purchase_and_repository_only")
  assert.ok(queueAcr.currentActionAcceptanceEvidence.includes("acr.registryHost actual aliyuncs.com host"))
  assert.ok(queueAcr.writeTargets.some((item) => item.includes("acr.registryHost")))
  assert.ok(queueAcr.deferredWritebackGroups.some((item) => item.id === "imagePushAndDigest"))
  assert.ok(queueAcr.deferredWritebackGroups.some((item) => item.id === "saeRuntimeImagePull"))
  assert.ok(queueAcr.deferredActions.some((item) => item.includes("P04_ACR_IMAGE_AND_PULL")))
  assert.ok(queueAcr.deferredActions.some((item) => item.includes("imagePushed=true")))
  assert.ok(!queueAcr.completionEvidence.some((item) => item.includes("imagePushed=true")))
  assert.ok(!queueAcr.completionEvidence.some((item) => item.includes("runtime.imagePullConfigured=true")))
  assert.deepEqual(report.executionQueue.externalAppPrerequisites, [])
  assert.ok(report.deferredAppLaunchPrerequisitePackets.some((item) => item.packetId === "P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.deferredAppLaunchPrerequisitePackets.some((item) => item.packetId === "P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.executionQueue.blockedByDependencies.some((item) => item.id === "C01_SAE_RUNTIME"))
  assert.ok(report.executionQueue.blockedByDependencies.some((item) => item.blockingDependencies.includes("C05_OSS_AUDIO_RAM_STS")))
  assert.equal(report.cloudInventoryResults.ready, true)
  assert.equal(report.cloudInventoryResults.readyLocalOperations, 9)
  assert.equal(report.cloudInventoryResults.localOperations, 9)
  assert.equal(report.cloudInventoryResults.executedCommandResults, 12)
  assert.equal(report.cloudInventoryResults.commandResults, 12)
  assert.equal(report.cloudInventoryResults.cloudApiCalledCommandResults, 12)
  assert.equal(report.cloudInventoryResults.mutationPerformedCommandResults, 0)
  assert.deepEqual(report.cloudInventoryResults.observedOperationIds, ["I05_OSS_AUDIO_BUCKET", "I06_SLS_ALERTS"])
  assert.ok(report.cloudInventoryResults.notFoundOperationIds.includes("I08_RDS_POSTGRES"))
  assert.ok(report.cloudInventoryResults.notFoundOperationIds.includes("I09_TAIR_REDIS"))
  assert.equal(report.readonlyInventoryUnblock.status, "strict_inventory_evidence_ready")
  assert.equal(report.readonlyInventoryUnblock.currentBlocker, "none")
  assert.ok(report.readonlyInventoryUnblock.currentEvidence.includes("readyLocalOperations=9/9"))
  assert.ok(report.readonlyInventoryUnblock.currentEvidence.includes("executedCommandResults=12/12"))
  assert.match(report.readonlyInventoryUnblock.minimumAuthorizationPhrase, /只读身份/)
  assert.match(report.readonlyInventoryUnblock.whyConsoleLoginIsNotEnough, /严格云证据已来自/)
  assert.ok(report.readonlyInventoryUnblock.allowedIdentityPaths.some((item) => item.id === "local_aliyun_cli"))
  assert.ok(report.readonlyInventoryUnblock.allowedIdentityPaths.some((item) => item.id === "aliyun_cloudshell"))
  assert.ok(report.readonlyInventoryUnblock.allowedIdentityPaths.some((item) => item.id === "ecs_workbench_terminal"))
  assert.ok(report.readonlyInventoryUnblock.unlockCommands.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.readonlyInventoryUnblock.unlockCommands.some((item) => item.includes("MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1")))
  assert.ok(report.readonlyInventoryUnblock.expectedNonSecretEvidenceAfterUnlock.some((item) => item.includes("mutationPerformedCommandResults = 0")))
  assert.ok(report.readonlyInventoryUnblock.forbidden.some((item) => item.includes("不要把 AccessKeySecret")))
  assert.ok(!report.currentBlockers.includes("requiredEnv:WECHAT_OPEN_APP_ID"))
  assert.ok(!report.currentBlockers.includes("requiredEnv:WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.currentBlockers.includes("backendRequired:DATABASE_URL_CN"))
  const immediateAcr = report.immediateConsoleTasks.find((item) => item.id === "C02_ACR_IMAGE_AND_PULL")
  assert.ok(immediateAcr.consolePath.includes("ACR"))
  assert.equal(immediateAcr.currentActionScope, "purchase_and_repository_only")
  assert.ok(immediateAcr.deferredWritebackGroups.some((item) => item.id === "imagePushAndDigest"))
  assert.ok(report.immediateConsoleTasks.some((item) => item.id === "C05_OSS_AUDIO_RAM_STS" && item.consolePath.includes("OSS")))
  assert.ok(report.blockedConsoleTasks.some((item) => item.id === "C03_API_DOMAIN_HTTPS_ICP" && item.blockingDependencies.includes("C01_SAE_RUNTIME")))
  assert.ok(report.cloudConsoleAuthorizationPackets.some((item) => item.packetId === "P03_ACR_PURCHASE" && item.minimumAuthorizationPhrase.includes("CNY 117.00")))
  assert.ok(report.cloudConsoleAuthorizationPackets.some((item) => item.packetId === "P05_OSS_RAM_STS" && item.minimumAuthorizationPhrase.includes("OSS")))
  assert.ok(report.cloudConsoleAuthorizationPackets.some((item) => (
    item.packetId === "P11_ALIYUN_RDS_DATA_MIGRATION" &&
    item.minimumAuthorizationPhrase.includes("DATABASE_URL_CN")
  )))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.nextSafeLocalCommands.includes("corepack pnpm aliyun:cloud-actions:package"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不购买 ACR")))
  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("部署 production-cn")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun cloud actions package markdown renders compact action order without values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloud-actions-package.mjs",
    "--markdown",
    "/tmp/meiye-aliyun-cloud-actions-package-test.md",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const markdown = fs.readFileSync("/tmp/meiye-aliyun-cloud-actions-package-test.md", "utf8")

  assert.match(markdown, /# 阿里云控制台动作包/)
  assert.match(markdown, /packageId: C00_ALIYUN_CLOUD_ACTIONS/)
  assert.match(markdown, /## 目标闭环证据简表/)
  assert.match(markdown, /blockedCredentialCount: 8/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /resourceEvidenceReady: 0\/7/)
  assert.match(markdown, /blockedResourceEvidenceIds: .*R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /partiallyObservedResourceEvidenceIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdown, /strictReadonlyInventoryReady: true/)
  assert.match(markdown, /mutationPerformedCommandResults: 0/)
  assert.match(markdown, /C02_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /P03_ACR_PURCHASE/)
  assert.match(markdown, /P05_OSS_RAM_STS/)
  assert.match(markdown, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /只读盘点解锁/)
  assert.match(markdown, /strict_inventory_evidence_ready/)
  assert.match(markdown, /cloudInventoryReadyLocalOperations: 9\/9/)
  assert.match(markdown, /cloudInventoryExecutedCommandResults: 12\/12/)
  assert.match(markdown, /下一步执行队列/)
  assert.match(markdown, /canStartNow: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /scope=purchase_and_repository_only/)
  assert.match(markdown, /currentActionAcceptanceEvidence: acr\.purchaseCandidate\.confirmed=true/)
  assert.match(markdown, /externalAppPrerequisites: none/)
  assert.match(markdown, /deferredAppLaunchPrerequisites: P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /blockedByDependencies: C01_SAE_RUNTIME/)
  assert.match(markdown, /currentEvidence: readyLocalOperations=9\/9/)
  assert.match(markdown, /MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1/)
  assert.match(markdown, /严格云证据已来自/)
  assert.match(markdown, /C03_API_DOMAIN_HTTPS_ICP: dependsOn=C01_SAE_RUNTIME/)
  assert.match(markdown, /不购买 ACR/)
  assert.match(markdown, /不推送镜像/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("APP production-cn action queue documents the current authorized next-step boundary", () => {
  const doc = read("docs", "app-production-cn-action-queue.md")

  for (const expected of [
    "currentScope: backend_aliyun_only",
    "fullAppLaunchScope: deferred_after_backend_online",
    "canDeployNow: false",
    "canProceedWithoutWechat: true",
    "cloudConfirmationsReady: 0/7",
    "strictReadonlyInventoryReady: true",
    "cloudInventoryReadyLocalOperations: 9/9",
    "mutationPerformedCommandResults: 0",
    "canStartNow: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS",
    "cloudConsolePackets: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION",
    "externalAppPackets: none",
    "deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID",
    "C02_ACR_IMAGE_AND_PULL",
    "purchase_and_repository_only",
    "当前报价 CNY 117.00",
    "repository=meiye-huajing-app-api",
    "acr.registryHost=<cn-hangzhou aliyuncs.com host>",
    "P04_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
    "ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env",
    "RAM 最小权限",
    "OSS 音频 bucket",
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
    "C06_ENV_IMPORT",
    "corepack pnpm aliyun:completion:audit",
    "当前后端-only 目标不创建微信开放平台移动应用",
    "backendRequired:DATABASE_URL_CN",
    "backendRequired:RDS_POSTGRES_NOT_READY",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})
