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
  assert.match(releaseArtifacts, /onlyMissingBackendCredentialValue: \$\{cloudOnlyMissingBackendCredentialValue\(cloudActionsPackage\)/)
  assert.match(releaseArtifacts, /credentialAcquisitionQueueActionIds/)
  assert.match(releaseArtifacts, /credentialAcquisitionQueue: compactCredentialAcquisitionQueueForAudit/)
  assert.match(releaseArtifacts, /credentialAcquisitionQueueScope/)
  assert.match(releaseArtifacts, /credential \$\{item\.actionId\}: question=\$\{item\.userQuestion/)
  assert.match(releaseArtifacts, /function formatCloudCredentialQueueActionIds/)
  assert.match(releaseArtifacts, /function compactCredentialAcquisitionQueueForAudit/)
  assert.match(packageScript, /buildCredentialAcquisitionQueue/)
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
  assert.deepEqual(report.summary.backendCanStartNowSteps, [
    "BAP00_READONLY_INVENTORY_IDENTITY",
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
    "BAP02_OSS_RAM_STS_CLOSE",
    "BAP04_ACR_IMAGE_PUSH_AND_PULL",
  ])
  assert.deepEqual(report.summary.canStartNowConsoleTasks, ["C02_ACR_IMAGE_AND_PULL"])
  assert.ok(report.summary.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedByDependencies.includes("C06_ENV_IMPORT"))
  assert.deepEqual(report.summary.cloudConsolePackets, ["P04_ACR_IMAGE_AND_PULL"])
  assert.deepEqual(report.summary.externalAppPackets, [])
  assert.ok(report.summary.deferredAppLaunchPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.deepEqual(report.summary.requiredBlocking, ["ACR_IMAGE_REGISTRY_NOT_READY"])
  assert.ok(!report.summary.requiredBlocking.includes("RDS_POSTGRES_NOT_READY"))
  assert.equal(report.cloudAccess.canReadCloudNow, true)
  assert.equal(report.cloudAccess.cliConfigProbeFailureCategory, "none")
  assert.equal(report.summary.cloudInventoryResultsReady, true)
  assert.equal(report.summary.cloudInventoryReadyLocalOperations, "9/9")
  assert.equal(report.summary.cloudInventoryExecutedCommandResults, "9/9")
  assert.equal(report.summary.cloudConfirmationsReady, "6/6")
  assert.equal(report.summary.operatorTasksReady, "6/8")
  assert.equal(report.summary.sensitiveActionReady, "0/1")
  assert.equal(report.summary.sensitiveActionBlocked, "1/1")
  assert.equal(Object.hasOwn(report.summary, "sensitiveBlocked"), false)
  assert.equal(report.summary.blockedCredentialCount, 0)
  assert.equal(report.summary.onlyMissingBackendCredentialValue, "")
  assert.equal(report.summary.readySecretEnvVariableCount, 0)
  assert.equal(report.summary.resourceEvidenceReady, "6/7")
  assert.deepEqual(report.summary.blockedResourceEvidenceIds, ["R02_ACR_IMAGE_REGISTRY"])
  assert.deepEqual(report.summary.partiallyObservedResourceEvidenceIds, ["R02_ACR_IMAGE_REGISTRY"])
  assert.deepEqual(report.summary.immediateBackendSteps, [
    "BAP00_READONLY_INVENTORY_IDENTITY",
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
    "BAP02_OSS_RAM_STS_CLOSE",
    "BAP04_ACR_IMAGE_PUSH_AND_PULL",
  ])
  assert.ok(report.summary.blockedBackendSteps.includes("BAP05_BACKEND_ENV_IMPORT"))
  assert.deepEqual(report.summary.backendFirstUserInterventionRequired, [
    "USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD",
    "USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE",
    "USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL",
  ])
  assert.deepEqual(report.summary.backendDeferredUserInterventionRequired, [
    "USER_CONFIRM_SECRET_ENV_IMPORT",
    "USER_CONFIRM_PRODUCTION_DEPLOY",
    "USER_CONFIRM_DNS_HTTPS_ICP_CHANGE",
  ])
  assert.ok(!report.summary.backendDeferredUserInterventionRequired.includes("USER_CONFIRM_ACR_PAID_PURCHASE"))
  assert.ok(!report.summary.backendFirstUserInterventionRequired.includes("USER_CONFIRM_SECRET_ENV_IMPORT"))
  assert.ok(!report.summary.backendFirstUserInterventionRequired.includes("USER_CONFIRM_DNS_HTTPS_ICP_CHANGE"))
  assert.ok(!report.summary.backendFirstUserInterventionRequired.includes("USER_CONFIRM_PRODUCTION_DEPLOY"))
  assert.equal(report.backendFirstOrder.sourceCommand, "corepack pnpm aliyun:backend-cn:status")
  assert.match(report.backendFirstOrder.note, /backend-first apply order/)
  assert.deepEqual(report.backendFirstOrder.immediateBackendSteps, report.summary.immediateBackendSteps)
  assert.deepEqual(report.backendFirstOrder.immediateUserInterventionRequired, report.summary.backendFirstUserInterventionRequired)
  assert.deepEqual(report.backendFirstOrder.blockedUserInterventionRequired, report.summary.backendDeferredUserInterventionRequired)
  assert.ok(report.backendFirstOrder.steps.find((item) =>
    item.id === "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE" &&
    item.status === "ready_for_action_time_confirmation" &&
    item.requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION") &&
    item.orderLine.includes("RDS PostgreSQL")
  ))
  assert.ok(report.backendFirstOrder.steps.find((item) =>
    item.id === "BAP05_BACKEND_ENV_IMPORT" &&
    item.status === "blocked_by_dependencies" &&
    item.blockingDependencies.includes("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE") &&
    item.orderLine.includes("Import backend env")
  ))
  assert.ok(report.backendFirstOrder.steps.find((item) =>
    item.id === "BAP04_ACR_IMAGE_PUSH_AND_PULL" &&
    item.orderLine.includes("Push backend image")
  ))
  assert.deepEqual(report.backendFirstOrder.sourceOrderLines, [
    "3. Configure SAE to use the verified ACR production-cn image and runtime image pull permission.",
  ])
  assert.equal(report.cloudActionClosureBrief.canDeployNow, false)
  assert.match(report.cloudActionClosureBrief.conclusion, /不能部署阿里云后端/)
  assert.equal(report.cloudActionClosureBrief.blockedCredentialCount, 0)
  assert.deepEqual(report.cloudActionClosureBrief.blockedCredentialNames, [])
  assert.equal(report.cloudActionClosureBrief.onlyMissingBackendCredentialValue, "")
  assert.deepEqual(report.cloudActionClosureBrief.credentialAcquisitionQueueActionIds, ["S04_ACR_REGISTRY_AUTH"])
  assert.equal(report.cloudActionClosureBrief.readySecretEnvVariableCount, 0)
  assert.equal(report.cloudActionClosureBrief.resourceEvidenceReady, "6/7")
  assert.deepEqual(report.cloudActionClosureBrief.blockedResourceEvidenceIds, ["R02_ACR_IMAGE_REGISTRY"])
  assert.deepEqual(report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds, ["R02_ACR_IMAGE_REGISTRY"])
  assert.ok(report.cloudActionClosureBrief.blockedResourceEvidence.some((item) =>
    item.id === "R02_ACR_IMAGE_REGISTRY" &&
    item.missingEvidence.includes("imagePublishLocal:image.sourceCommitMatchesHead")
  ))
  assert.ok(!report.cloudActionClosureBrief.stillRequiresActionTimeConfirmation.some((item) =>
    /WECHAT_OPEN|APPLE_TEAM|ANDROID_RELEASE|MEIYE_RELEASE|S01_WECHAT|S02_APPLE|S07_ANDROID/.test(item)
  ))
  assert.equal(report.cloudActionClosureBrief.strictReadonlyInventoryReady, true)
  assert.equal(report.cloudActionClosureBrief.cloudInventoryReadyLocalOperations, "9/9")
  assert.equal(report.cloudActionClosureBrief.cloudInventoryExecutedCommandResults, "9/9")
  assert.equal(report.cloudActionClosureBrief.mutationPerformedCommandResults, 0)
  assert.deepEqual(report.cloudActionClosureBrief.backendCanStartNowSteps, report.summary.backendCanStartNowSteps)
  assert.ok(report.cloudActionClosureBrief.backendBlockedByDependencies.includes("BAP05_BACKEND_ENV_IMPORT"))
  assert.deepEqual(report.cloudActionClosureBrief.canStartNowConsoleTasks, ["C02_ACR_IMAGE_AND_PULL"])
  assert.deepEqual(report.cloudActionClosureBrief.cloudConsolePackets, ["P04_ACR_IMAGE_AND_PULL"])
  assert.deepEqual(report.cloudActionClosureBrief.externalAppPackets, [])
  assert.ok(report.cloudActionClosureBrief.deferredAppLaunchPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.cloudActionClosureBrief.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.deepEqual(report.cloudActionClosureBrief.imagePublishWritebackBlockingGroups, ["imagePushAndDigest"])
  assert.equal(report.credentialAcquisitionQueue.queueScope, "backend_aliyun_only")
  assert.equal(report.credentialAcquisitionQueue.onlyMissingBackendCredentialValue, "")
  assert.deepEqual(report.credentialAcquisitionQueue.items.map((item) => item.actionId), ["S04_ACR_REGISTRY_AUTH"])
  assert.deepEqual(report.summary.imagePublishWritebackBlockingGroups, ["imagePushAndDigest"])
  assert.deepEqual(report.executionQueue.backendCanStartNow.map((item) => item.id), report.summary.backendCanStartNowSteps)
  assert.ok(report.executionQueue.backendCanStartNow.every((item) => item.kind === "backend_apply_step"))
  assert.ok(report.executionQueue.backendCanStartNow.every((item) => item.requiresActionTimeConfirmation === true))
  assert.ok(report.executionQueue.backendCanStartNow.some((item) =>
    item.id === "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE" &&
    item.requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION") &&
    item.userIntervention === "USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD"
  ))
  assert.ok(report.executionQueue.backendBlockedByDependencies.some((item) =>
    item.id === "BAP05_BACKEND_ENV_IMPORT" &&
    item.blockingDependencies.includes("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE")
  ))
  assert.deepEqual(report.executionQueue.canStartNow.map((item) => item.id), ["C02_ACR_IMAGE_AND_PULL"])
  assert.deepEqual(report.executionQueue.externalAppPrerequisites, [])
  assert.ok(report.deferredAppLaunchPrerequisitePackets.some((item) => item.packetId === "P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.deferredAppLaunchPrerequisitePackets.some((item) => item.packetId === "P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.executionQueue.blockedByDependencies.some((item) => item.id === "C01_SAE_RUNTIME"))
  assert.ok(report.executionQueue.blockedByDependencies.some((item) => item.id === "C05_OSS_AUDIO_RAM_STS"))
  const envImportTask = report.executionQueue.blockedByDependencies.find((item) => item.id === "C06_ENV_IMPORT")
  assert.deepEqual(envImportTask.currentBlockers, [])
  assert.ok(!envImportTask.currentBlockers.some((item) => /WECHAT_OPEN_APP|APPLE_TEAM_ID|MEIYE_RELEASE/.test(item)))
  assert.equal(report.cloudInventoryResults.ready, true)
  assert.equal(report.cloudInventoryResults.readyLocalOperations, 9)
  assert.equal(report.cloudInventoryResults.localOperations, 9)
  assert.equal(report.cloudInventoryResults.executedCommandResults, 9)
  assert.equal(report.cloudInventoryResults.commandResults, 9)
  assert.equal(report.cloudInventoryResults.cloudApiCalledCommandResults, 9)
  assert.equal(report.cloudInventoryResults.mutationPerformedCommandResults, 0)
  assert.equal(report.cloudInventoryResults.observedOperationIds.length, 9)
  assert.deepEqual(report.cloudInventoryResults.notFoundOperationIds, [])
  assert.deepEqual(report.cloudInventoryResults.blockedOperationIds, [])
  assert.deepEqual(report.cloudInventoryResults.blockers, [])
  assert.equal(report.readonlyInventoryUnblock.status, "strict_inventory_evidence_ready")
  assert.equal(report.readonlyInventoryUnblock.currentBlocker, "none")
  assert.ok(report.readonlyInventoryUnblock.currentEvidence.includes("readyLocalOperations=9/9"))
  assert.match(report.readonlyInventoryUnblock.minimumAuthorizationPhrase, /只读身份/)
  assert.match(report.readonlyInventoryUnblock.whyConsoleLoginIsNotEnough, /严格云证据/)
  assert.ok(report.readonlyInventoryUnblock.allowedIdentityPaths.some((item) => item.id === "local_aliyun_cli"))
  assert.ok(report.readonlyInventoryUnblock.allowedIdentityPaths.some((item) => item.id === "aliyun_cloudshell"))
  assert.ok(report.readonlyInventoryUnblock.allowedIdentityPaths.some((item) => item.id === "ecs_workbench_terminal"))
  assert.ok(report.readonlyInventoryUnblock.unlockCommands.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.readonlyInventoryUnblock.unlockCommands.some((item) => item.includes("MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1")))
  assert.ok(report.readonlyInventoryUnblock.expectedNonSecretEvidenceAfterUnlock.some((item) => item.includes("mutationPerformedCommandResults = 0")))
  assert.ok(report.readonlyInventoryUnblock.forbidden.some((item) => item.includes("不要把 AccessKeySecret")))
  assert.ok(!report.currentBlockers.includes("requiredEnv:WECHAT_OPEN_APP_ID"))
  assert.ok(!report.currentBlockers.includes("requiredEnv:WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.currentBlockers.includes("backendRequired:DATABASE_URL_CN"))
  assert.deepEqual(report.immediateConsoleTasks.map((item) => item.id), ["C02_ACR_IMAGE_AND_PULL"])
  assert.ok(report.blockedConsoleTasks.some((item) => item.id === "C03_API_DOMAIN_HTTPS_ICP"))
  assert.deepEqual(report.cloudConsoleAuthorizationPackets.map((item) => item.packetId), ["P04_ACR_IMAGE_AND_PULL"])
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
  assert.match(markdown, /blockedCredentialCount: 0/)
  assert.match(markdown, /cloudConfirmationsReady: 6\/6/)
  assert.match(markdown, /operatorTasksReady: 6\/8/)
  assert.match(markdown, /sensitiveActionReady: 0\/1/)
  assert.match(markdown, /sensitiveActionBlocked: 1\/1/)
  assert.doesNotMatch(markdown, /sensitiveBlocked:/)
  assert.match(markdown, /blockedCredentialNames: none/)
  assert.match(markdown, /onlyMissingBackendCredentialValue: n\/a/)
  assert.match(markdown, /credentialAcquisitionQueueActionIds: S04_ACR_REGISTRY_AUTH/)
  assert.match(markdown, /readySecretEnvVariableCount: 0/)
  assert.match(markdown, /resourceEvidenceReady: 6\/7/)
  assert.match(markdown, /blockedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /partiallyObservedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /backendCanStartNowSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL/)
  assert.match(markdown, /immediateBackendSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL/)
  assert.match(markdown, /blockedBackendSteps: BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE/)
  assert.match(markdown, /backendFirstUserInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL/)
  assert.match(markdown, /backendDeferredUserInterventionRequired: USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE/)
  assert.match(markdown, /strictReadonlyInventoryReady: true/)
  assert.match(markdown, /cloudInventoryReadyLocalOperations: 9\/9/)
  assert.match(markdown, /cloudInventoryExecutedCommandResults: 9\/9/)
  assert.match(markdown, /mutationPerformedCommandResults: 0/)
  assert.match(markdown, /C02_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /## 后端 credential 获取\/导入队列/)
  assert.match(markdown, /requiresActionTimeConfirmationIds: S04_ACR_REGISTRY_AUTH/)
  assert.match(markdown, /\| 1 \| `acr_registry_auth` \| `S04_ACR_REGISTRY_AUTH`/)
  assert.match(markdown, /只读盘点解锁/)
  assert.match(markdown, /strict_inventory_evidence_ready/)
  assert.match(markdown, /cloudInventoryReadyLocalOperations: 9\/9/)
  assert.match(markdown, /cloudInventoryExecutedCommandResults: 9\/9/)
  assert.match(markdown, /下一步执行队列/)
  assert.match(markdown, /后端优先执行顺序/)
  assert.match(markdown, /sourceCommand: corepack pnpm aliyun:backend-cn:status/)
  assert.match(markdown, /immediateUserInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL/)
  assert.match(markdown, /blockedUserInterventionRequired: USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE/)
  assert.match(markdown, /BAP00_READONLY_INVENTORY_IDENTITY: status=ready_for_action_time_confirmation/)
  assert.match(markdown, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE: status=ready_for_action_time_confirmation; packets=P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /BAP03_ACR_PURCHASE_AND_REPOSITORY: status=completed; packets=P03_ACR_PURCHASE/)
  assert.match(markdown, /BAP04_ACR_IMAGE_PUSH_AND_PULL: status=ready_for_action_time_confirmation; packets=P04_ACR_IMAGE_AND_PULL; dependsOn=none; order=4\. Push backend image to ACR/)
  assert.match(markdown, /BAP05_BACKEND_ENV_IMPORT: status=blocked_by_dependencies/)
  assert.match(markdown, /BAP05_BACKEND_ENV_IMPORT:[^\n]*order=5\. Import backend env/)
  assert.match(markdown, /backendCanStartNow: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP04_ACR_IMAGE_PUSH_AND_PULL/)
  assert.match(markdown, /consoleCanStartNow: C02_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE: kind=backend_apply_step; packets=P11_ALIYUN_RDS_DATA_MIGRATION; userIntervention=USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD/)
  assert.match(markdown, /canStartNow: C02_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /externalAppPrerequisites: none/)
  assert.match(markdown, /deferredAppLaunchPrerequisites: P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /blockedByDependencies: C01_SAE_RUNTIME/)
  assert.match(markdown, /currentEvidence: readyLocalOperations=9\/9/)
  assert.match(markdown, /MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1/)
  assert.match(markdown, /严格云证据/)
  assert.match(markdown, /C03_API_DOMAIN_HTTPS_ICP: dependsOn=none; blockers=none/)
  assert.match(markdown, /C06_ENV_IMPORT: dependsOn=none; blockers=none/)
  assert.doesNotMatch(markdown, /C06_ENV_IMPORT:[^\n]*WECHAT_OPEN_APP/)
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
    "cloudConfirmationsReady: 6/6",
    "operatorTasksReady: 7/8",
    "sensitiveActionBlocked: 0/0",
    "strictReadonlyInventoryReady: true",
    "cloudInventoryReadyLocalOperations: 9/9",
    "cloudInventoryExecutedCommandResults: 9/9",
    "mutationPerformedCommandResults: 0",
    "blockedCredentialNames: none",
    "onlyMissingBackendCredentialValue: n/a",
    "credentialAcquisitionQueueActionIds: none",
    "resourceEvidenceReady: 7/7",
    "blockedResourceEvidenceIds: none",
    "backendCanStartNowSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP03_ACR_PURCHASE_AND_REPOSITORY",
    "immediateBackendSteps: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP03_ACR_PURCHASE_AND_REPOSITORY",
    "blockedBackendSteps: BAP04_ACR_IMAGE_PUSH_AND_PULL, BAP05_BACKEND_ENV_IMPORT, BAP06_SAE_RUNTIME_CREATE",
    "backendFirstUserInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_PAID_PURCHASE",
    "backendDeferredUserInterventionRequired: USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL, USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE",
    "## 后端优先执行顺序",
    "sourceCommand: corepack pnpm aliyun:backend-cn:status",
    "immediateUserInterventionRequired: USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY, USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD, USER_CONFIRM_OSS_RAM_STS_SECRET_OR_RUNTIME_ROLE, USER_CONFIRM_ACR_PAID_PURCHASE",
    "blockedUserInterventionRequired: USER_CONFIRM_ACR_IMAGE_PUSH_AND_RUNTIME_PULL, USER_CONFIRM_SECRET_ENV_IMPORT, USER_CONFIRM_PRODUCTION_DEPLOY, USER_CONFIRM_DNS_HTTPS_ICP_CHANGE",
    "BAP00_READONLY_INVENTORY_IDENTITY: status=ready_for_action_time_confirmation",
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE: status=ready_for_action_time_confirmation; packets=P11_ALIYUN_RDS_DATA_MIGRATION",
    "BAP02_OSS_RAM_STS_CLOSE: status=ready_for_action_time_confirmation; packets=P05_OSS_RAM_STS",
    "BAP03_ACR_PURCHASE_AND_REPOSITORY: status=ready_for_action_time_confirmation; packets=P03_ACR_PURCHASE",
    "BAP04_ACR_IMAGE_PUSH_AND_PULL: status=blocked_by_dependencies; packets=P04_ACR_IMAGE_AND_PULL; dependsOn=BAP03_ACR_PURCHASE_AND_REPOSITORY; order=4. Push backend image to ACR",
    "BAP05_BACKEND_ENV_IMPORT: status=blocked_by_dependencies",
    "order=5. Import backend env through SAE/KMS/Secrets Manager",
    "## 后端 credential 获取/导入队列",
    "- none",
    "backendCanStartNow: BAP00_READONLY_INVENTORY_IDENTITY, BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE, BAP03_ACR_PURCHASE_AND_REPOSITORY",
    "consoleCanStartNow: none",
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE: kind=backend_apply_step; packets=P11_ALIYUN_RDS_DATA_MIGRATION; userIntervention=USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD",
    "canStartNow: none",
    "cloudConsolePackets: none",
    "externalAppPackets: none",
    "deferredAppLaunchPackets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID",
    "C02_ACR_IMAGE_AND_PULL",
    "imagePublishWritebackBlockingGroups: none",
    "P04_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
    "C06_ENV_IMPORT",
    "corepack pnpm aliyun:completion:audit",
    "当前后端-only 目标不创建微信开放平台移动应用",
    "strict_inventory_evidence_ready",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.doesNotMatch(doc, /C06_ENV_IMPORT:[^\n]*WECHAT_OPEN_APP/)
  assert.doesNotMatch(doc, /blockedCredentialNames: .*WECHAT_OPEN_APP/)
  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})

test("release manifest supersedes historical cloud action queue inventory snapshot", () => {
  const manifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  for (const expected of [
    "2026-06-24 09:05 CST",
    "strictReadonlyInventoryReady=true",
    "2026-06-26 追加复核",
    "corepack pnpm aliyun:cloud-actions:package",
    "docs/app-production-cn-action-queue.md",
    "currentScope=backend_aliyun_only",
    "strictReadonlyInventoryReady=false",
    "cloudInventoryReadyLocalOperations=0/9",
    "cloudInventoryExecutedCommandResults=9/9",
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P03_ACR_PURCHASE",
    "onlyMissingBackendCredentialValue=DATABASE_URL_CN",
    "仅为历史快照",
    "不能作为当前部署证据",
  ]) {
    assert.match(manifest, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(manifest, /微信\/Android\/Apple 阻塞项描述仅为历史快照/)
  assert.doesNotMatch(manifest, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(manifest, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(manifest, /:\/\/[^\s:@]+:[^\s@]+@/)
})
