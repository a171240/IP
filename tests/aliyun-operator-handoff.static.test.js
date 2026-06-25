const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function buildConsoleObservationOperation(id, status) {
  return {
    id,
    title: `${id} console observation`,
    product: "aliyun",
    readOnly: true,
    status,
    commandResults: [
      {
        command: `aliyun readonly ${id}`,
        executed: false,
        exitStatus: null,
        cloudApiCalled: false,
        mutationPerformed: false,
        observedAt: "2026-06-23T02:00:00+08:00",
        outputSummary: "Console-only non-secret observation; CLI/OpenAPI inventory not executed.",
        evidence: `console_only_${id.toLowerCase()}_non_secret_handle`,
      },
    ],
    writesTo: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
    ],
    evidence: `${id} non-secret console evidence`,
  }
}

function initRdsMigrationLocal(tmpdir) {
  const localPath = path.join(tmpdir, "rds-migration.local.json")
  execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--init-local",
    "--local",
    localPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  return localPath
}

test("Aliyun operator handoff command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:operator:handoff"], "node ./scripts/generate-aliyun-operator-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:operator:handoff:backend"], "node ./scripts/generate-aliyun-operator-handoff.mjs --backend-only --skip-vercel-env-coverage")
  assert.equal(pkg.scripts["aliyun:operator:handoff:test"], "node --test tests/aliyun-operator-handoff.static.test.js")
  assert.match(predeploy, /aliyun:operator:handoff:test/)
  assert.match(predeploy, /aliyun:operator:handoff", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:handoff:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:handoff -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:operator:handoff"))
  assert.match(releaseArtifacts, /canStartNowConsoleTasks/)
  assert.match(releaseArtifacts, /blockedByConsoleTaskDependencies/)
  assert.match(releaseArtifacts, /currentBrowserCanUseCurrentConsole/)
  assert.match(releaseArtifacts, /currentBrowserAliyunConsoleHostPaths/)
  assert.match(releaseArtifacts, /operatorClosureBrief/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /readySecretEnvVariableCount/)
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /blockedResourceEvidenceIds/)
  assert.match(releaseArtifacts, /operatorHandoff\.actionTimeAuthorizationRequest/)
  assert.match(releaseArtifacts, /actionTimeAuthorizationRequest\.recommendedUserReply/)
  assert.match(releaseArtifacts, /localEvidenceGaps:[\s\S]*rdsMigration/)
  assert.match(releaseArtifacts, /operatorHandoff\.localEvidenceGaps\?\.rdsMigration/)
})

test("Aliyun operator handoff backend-only mode excludes deferred APP launch work", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-handoff-backend-rds-"))
  const rdsMigrationLocal = initRdsMigrationLocal(tmpdir)
  const markdown = path.join(tmpdir, "operator-handoff-backend.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--backend-only",
    "--skip-vercel-env-coverage",
    "--rds-migration",
    rdsMigrationLocal,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const markdownOutput = fs.readFileSync(markdown, "utf8")
  const cloudConfirmationPaths = report.localEvidenceGaps.cloudConfirmations.gaps.map((item) => item.jsonPath)
  const rdsMigrationPaths = report.localEvidenceGaps.rdsMigration.gaps.map((item) => item.jsonPath)
  const userActionTitles = report.userActionNow.map((item) => item.title)
  const priorityTaskIds = report.priorityTasks.map((item) => item.id)
  const backendNextActionIds = report.backendNextActionOrder.map((item) => item.id)
  const envImportTask = report.priorityTasks.find((item) => item.id === "T06_ALIYUN_ENV_IMPORT")
  const consoleEnvImportTask = report.aliyunConsoleTaskOrder.tasks.find((item) => item.id === "C06_ENV_IMPORT")
  const requiredVariableNames = report.missingVariables.required.map((item) => item.name)

  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.containsValues, false)
  assert.equal(report.actionTimeAuthorizationRequest.required, true)
  assert.deepEqual(report.actionTimeAuthorizationRequest.packetIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /阿里云后端第一批动作/)
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /RDS PostgreSQL/)
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /不做微信\/Android\/iOS/)
  assert.ok(report.actionTimeAuthorizationRequest.explicitlyExcluded.some((item) => /不执行 production-cn 部署/.test(item)))
  assert.equal(report.operatorClosureBrief.blockedCredentialCount, 1)
  assert.deepEqual(report.operatorClosureBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(!report.operatorClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.operatorClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.operatorClosureBrief.credentialGroups.some((group) => group.actionId === "S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(!report.operatorClosureBrief.credentialGroups.some((group) => group.actionId === "S07_ANDROID_RELEASE_SIGNING"))
  assert.deepEqual(backendNextActionIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P03_P04_ACR_IMAGE_AND_PULL",
    "P06_ENV_IMPORT",
    "P08_SAE_RUNTIME",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SLS_ALERTS",
    "P09_PRODUCTION_DEPLOY_SMOKE",
  ])
  assert.equal(report.backendNextActionOrder[0].status, "blocked")
  assert.ok(report.backendNextActionOrder[0].currentBlockers.includes("readonly_inventory_strict_ready=0/9"))
  assert.ok(report.backendNextActionOrder[1].currentBlockers.includes("DATABASE_URL_CN"))
  assert.ok(report.backendNextActionOrder[1].currentBlockers.includes("RDS_MIGRATION_EVIDENCE_NOT_READY"))
  assert.ok(report.backendNextActionOrder[1].requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(report.backendNextActionOrder[4].currentBlockers.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(report.backendNextActionOrder[6].requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.equal(report.backendNextActionOrder[8].status, "waiting_for_deploy")
  assert.ok(report.backendNextActionOrder[8].currentBlockers.includes("BACKEND_ALIYUN_DEPLOY_NOT_READY"))
  assert.equal(report.localEvidenceGaps.cloudConfirmations.totalBlockers, cloudConfirmationPaths.length)
  assert.equal(report.localEvidenceGaps.cloudConfirmations.totalBlockers, 18)
  assert.ok(!cloudConfirmationPaths.some((item) => item.includes("wechatOpenPlatform")))
  assert.equal(report.localEvidenceGaps.rdsMigration.exists, true)
  assert.equal(report.localEvidenceGaps.rdsMigration.ready, false)
  assert.equal(report.localEvidenceGaps.rdsMigration.totalBlockers, rdsMigrationPaths.length)
  assert.equal(report.localEvidenceGaps.rdsMigration.totalBlockers, 16)
  assert.ok(!rdsMigrationPaths.includes("file_missing"))
  assert.ok(rdsMigrationPaths.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(!rdsMigrationPaths.includes("migration.dataAccessAdapterReady"))
  assert.ok(rdsMigrationPaths.includes("migration.rollbackValidationPassed"))
  assert.equal(report.localEvidenceGaps.rdsMigration.appApiRoutesWithSupabase, 29)
  assert.equal(report.localEvidenceGaps.rdsMigration.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(report.localEvidenceGaps.rdsMigration.postgresDataAccessAdapterDetected, true)
  const databaseUrlGap = report.localEvidenceGaps.rdsMigration.gaps.find((item) =>
    item.jsonPath === "rdsPostgres.databaseUrlCnSecretImported"
  )
  assert.ok(databaseUrlGap.requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.match(databaseUrlGap.writeTo, /rds-migration\.local\.json -> rdsPostgres/)
  assert.match(databaseUrlGap.expected, /DATABASE_URL_CN/)
  assert.ok(databaseUrlGap.forbidden.includes("database password"))
  assert.ok(databaseUrlGap.forbidden.includes("Supabase service role key"))
  assert.deepEqual(requiredVariableNames, ["DATABASE_URL_CN"])
  assert.ok(envImportTask)
  assert.deepEqual(envImportTask.blockerCodes, [
    "missing_required_env:DATABASE_URL_CN",
    "envImport:confirmed",
    "envImport:secretNotInImage",
  ])
  assert.ok(envImportTask.evidence.includes("requiredBlocking=DATABASE_URL_CN"))
  assert.ok(!envImportTask.blockerCodes.some((item) => /WECHAT_OPEN_APP|APPLE_TEAM_ID/.test(item)))
  assert.ok(!envImportTask.actions.some((item) => /微信开放平台/.test(item)))
  assert.ok(consoleEnvImportTask)
  assert.ok(consoleEnvImportTask.currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.ok(!consoleEnvImportTask.currentBlockers.some((item) => /WECHAT_OPEN_APP|APPLE_TEAM_ID|MEIYE_RELEASE_/.test(item)))
  assert.deepEqual(userActionTitles, [
    "授权 RDS PostgreSQL 和数据迁移",
    "确认 OSS RAM/STS 最小权限",
    "授权 ACR 企业版实例/仓库",
  ])
  assert.ok(!userActionTitles.some((item) => /微信开放平台移动应用|Android release signing|Apple Team ID/.test(item)))
  assert.ok(!priorityTaskIds.includes("T01_WECHAT_OPEN_PLATFORM_APP_LOGIN"))
  assert.ok(priorityTaskIds.includes("T03B_ALIYUN_ACR_IMAGE_PUBLISH"))
  assert.ok(report.currentAnswer.includes("现在只处理阿里云后端"))
  assert.match(markdownOutput, /## 后端下一步顺序/)
  assert.match(markdownOutput, /## 动作时授权请求/)
  assert.match(markdownOutput, /recommendedUserReply: 授权本轮只做阿里云后端第一批动作/)
  assert.match(markdownOutput, /packetIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdownOutput, /0\. P00_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(markdownOutput, /1\. P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdownOutput, /6\. P07_DOMAIN_DNS_HTTPS/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun operator handoff maps ACR and SAE evidence gaps to the correct consoles", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-handoff-inventory-missing-"))
  const missingInventoryResults = path.join(tmpdir, "missing.cloud-inventory-results.local.json")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--skip-vercel-env-coverage",
    "--cloud-inventory-results",
    missingInventoryResults,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const gaps = report.localEvidenceGaps.imagePublish.gaps
  const inventoryResults = report.localEvidenceGaps.cloudInventoryResults
  const byPath = new Map(gaps.map((item) => [item.jsonPath, item]))
  const registryHost = byPath.get("acr.registryHost")
  const remoteDigest = byPath.get("acr.remoteDigest")
  const runtimeConfirmed = byPath.get("runtime.confirmed")
  const remoteImageConfigured = byPath.get("runtime.remoteImageConfigured")
  const imagePullConfigured = byPath.get("runtime.imagePullConfigured")

  assert.equal(report.containsValues, false)
  assert.equal(report.operatorClosureBrief.blockedCredentialCount, 8)
  assert.equal(report.operatorClosureBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.operatorClosureBrief.resourceEvidenceReady, "0/7")
  assert.ok(report.operatorClosureBrief.blockedCredentialNames.includes("DATABASE_URL_CN"))
  assert.ok(report.operatorClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.operatorClosureBrief.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.operatorClosureBrief.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.operatorClosureBrief.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.ok(report.operatorClosureBrief.credentialGroups.some((group) =>
    group.category === "wechat_open_mobile_app" &&
    group.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID")
  ))
  assert.ok(report.operatorClosureBrief.blockedResourceEvidence.some((item) =>
    item.id === "R02_ACR_IMAGE_REGISTRY" &&
    item.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE")
  ))
  const ossResourceEvidence = report.operatorClosureBrief.blockedResourceEvidence.find((item) =>
    item.id === "R05_OSS_AUDIO_STORAGE")
  const slsResourceEvidence = report.operatorClosureBrief.blockedResourceEvidence.find((item) =>
    item.id === "R07_SLS_ALERTS")
  assert.equal(ossResourceEvidence.observedReadiness, "partial")
  assert.ok(ossResourceEvidence.currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.ok(ossResourceEvidence.missingEvidence.includes("oss:ramLeastPrivilege"))
  assert.equal(slsResourceEvidence.observedReadiness, "partial")
  assert.ok(slsResourceEvidence.currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.ok(slsResourceEvidence.missingEvidence.includes("slsAlerts:healthAlertConfigured"))
  assert.equal(report.cloudAccess.currentBrowser.checked, true)
  assert.equal(typeof report.cloudAccess.currentBrowser.canUseCurrentConsole, "boolean")
  assert.equal(typeof report.cloudAccess.currentBrowser.aliyunConsoleTabCount, "number")
  assert.ok(Array.isArray(report.cloudAccess.currentBrowser.aliyunConsoleTabs))
  assert.equal(report.cloudAccess.currentBrowser.cloudApiCalled, false)
  assert.equal(report.cloudAccess.currentBrowser.cloudMutationPerformed, false)
  assert.match(report.currentAnswer, /Android release signing/)
  assert.match(report.currentAnswer, /Apple Team ID/)
  assert.ok(report.userActionNow.some((item) => /Android release signing/.test(item.title)))
  const androidAction = report.userActionNow.find((item) => /Android release signing/.test(item.title))
  assert.ok(androidAction.needAfterApproval.includes("MEIYE_RELEASE_STORE_PASSWORD"))
  assert.ok(androidAction.mustNotUse.some((item) => /debug\.keystore/.test(item)))
  assert.deepEqual(report.aliyunConsoleTaskOrder.canStartNow, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(report.aliyunConsoleTaskOrder.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.aliyunConsoleTaskOrder.blockedByDependencies.includes("C06_ENV_IMPORT"))
  assert.ok(report.aliyunConsoleActionNow.some((item) => item.includes("当前可先处理 C02_ACR_IMAGE_AND_PULL")))
  assert.ok(report.aliyunConsoleActionNow.some((item) => item.includes("当前可先处理 C05_OSS_AUDIO_RAM_STS")))
  assert.ok(report.aliyunConsoleActionNow.some((item) => item.includes("先暂缓 C01_SAE_RUNTIME")))
  const consoleTasksById = new Map(report.aliyunConsoleTaskOrder.tasks.map((item) => [item.id, item]))
  assert.equal(consoleTasksById.get("C02_ACR_IMAGE_AND_PULL").canStartNow, true)
  assert.equal(consoleTasksById.get("C05_OSS_AUDIO_RAM_STS").canStartNow, true)
  assert.deepEqual(consoleTasksById.get("C01_SAE_RUNTIME").blockingDependencies, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
    "C06_ENV_IMPORT",
  ])
  assert.equal(inventoryResults.exists, false)
  assert.equal(inventoryResults.ready, false)
  assert.equal(inventoryResults.checkedOperations, 0)
  assert.equal(inventoryResults.totalBlockers, 1)
  assert.equal(inventoryResults.gaps[0].jsonPath, "$")
  assert.equal(inventoryResults.gaps[0].blocker, "file_missing")
  assert.match(inventoryResults.gaps[0].source, /CLI/)
  assert.match(inventoryResults.gaps[0].writeTo, /cloud-inventory-results\.local\.json/)
  assert.match(inventoryResults.gaps[0].expected, /复制/)
  assert.match(report.safetyBoundary.join("\n"), /cloud-inventory-results\.local\.json/)
  assert.equal(report.localEvidenceGaps.imagePublish.totalBlockers, 12)
  assert.match(registryHost.source, /容器镜像服务 ACR/)
  assert.match(registryHost.writeTo, /-> acr$/)
  assert.match(remoteDigest.source, /容器镜像服务 ACR/)
  assert.match(runtimeConfirmed.source, /SAE/)
  assert.doesNotMatch(runtimeConfirmed.source, /命名空间\/仓库/)
  assert.match(runtimeConfirmed.writeTo, /-> runtime$/)
  assert.match(remoteImageConfigured.source, /SAE/)
  assert.match(imagePullConfigured.source, /SAE/)
  assert.match(remoteImageConfigured.expected, /SAE 已指向 ACR remote image/)
  assert.match(imagePullConfigured.expected, /SAE 镜像拉取权限/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun operator handoff exposes console-only inventory observation summary", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-handoff-console-observation-"))
  const inventoryResults = path.join(tmpdir, "cloud-inventory-results.local.json")
  const rdsMigrationLocal = initRdsMigrationLocal(tmpdir)
  const markdown = path.join(tmpdir, "operator-handoff.md")
  fs.writeFileSync(inventoryResults, JSON.stringify({
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: "2026-06-23T02:00:00+08:00",
    operator: "test",
    sourcePlanCommand: "corepack pnpm aliyun:cloud:inventory-plan",
    notes: "Test fixture with console-only observations and no cloud API calls.",
    operations: [
      buildConsoleObservationOperation("I01_SAE_RUNTIME", "not_found"),
      buildConsoleObservationOperation("I02_ACR_IMAGE", "blocked"),
      buildConsoleObservationOperation("I03_DNS_API_DOMAIN", "not_found"),
      buildConsoleObservationOperation("I04_DNS_ASSET_DOMAIN", "not_found"),
      buildConsoleObservationOperation("I05_OSS_AUDIO_BUCKET", "observed"),
      buildConsoleObservationOperation("I06_SLS_ALERTS", "observed"),
      buildConsoleObservationOperation("I07_CERT_HTTPS", "blocked"),
      buildConsoleObservationOperation("I08_RDS_POSTGRES", "not_found"),
      buildConsoleObservationOperation("I09_TAIR_REDIS", "not_found"),
    ],
  }, null, 2))

  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--skip-vercel-env-coverage",
    "--cloud-inventory-results",
    inventoryResults,
    "--rds-migration",
    rdsMigrationLocal,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const summary = report.localEvidenceGaps.cloudInventoryResults.observationSummary
  const inventoryGaps = report.localEvidenceGaps.cloudInventoryResults.gaps
  const markdownOutput = fs.readFileSync(markdown, "utf8")

  assert.equal(report.localEvidenceGaps.cloudInventoryResults.exists, true)
  assert.equal(report.localEvidenceGaps.cloudInventoryResults.ready, false)
  assert.equal(summary.safeConsoleOnly, true)
  assert.equal(summary.operations, 9)
  assert.equal(summary.consoleObservationOperations, 9)
  assert.equal(summary.commandResults, 9)
  assert.equal(summary.executedCommandResults, 0)
  assert.equal(summary.cloudApiCalledCommandResults, 0)
  assert.equal(summary.mutationPerformedCommandResults, 0)
  assert.deepEqual(summary.observedOperationIds, [
    "I05_OSS_AUDIO_BUCKET",
    "I06_SLS_ALERTS",
  ])
  assert.deepEqual(summary.notFoundOperationIds, [
    "I01_SAE_RUNTIME",
    "I03_DNS_API_DOMAIN",
    "I04_DNS_ASSET_DOMAIN",
    "I08_RDS_POSTGRES",
    "I09_TAIR_REDIS",
  ])
  assert.deepEqual(summary.blockedOperationIds, [
    "I02_ACR_IMAGE",
    "I07_CERT_HTTPS",
  ])
  assert.ok(inventoryGaps.some((item) => item.blocker === "console_only_observation_not_strict_inventory"))
  assert.ok(inventoryGaps.every((item) => item.jsonPath === "operations[*].commandResults[*]" || item.jsonPath === "$"))
  assert.ok(inventoryGaps.some((item) => /控制台人工观察/.test(item.expected)))
  assert.match(markdownOutput, /safeConsoleOnly: true/)
  assert.match(markdownOutput, /consoleObservationOperations: 9\/9/)
  assert.match(markdownOutput, /executedCommandResults: 0\/9/)
  assert.match(markdownOutput, /cloudApiCalledCommandResults: 0/)
  assert.match(markdownOutput, /mutationPerformedCommandResults: 0/)
  assert.match(markdownOutput, /### rds-migration\.local\.json/)
  assert.match(markdownOutput, /rdsPostgres\.databaseUrlCnSecretImported/)
  assert.match(markdownOutput, /P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdownOutput, /currentBrowserCanUseCurrentConsole/)
  assert.match(markdownOutput, /currentBrowserAliyunConsoleTabCount/)
  assert.match(markdownOutput, /currentBrowserCloudApiCalled: false/)
  assert.match(markdownOutput, /目标闭环证据简表/)
  assert.match(markdownOutput, /blockedCredentialCount: 8/)
  assert.match(markdownOutput, /readySecretEnvVariableCount: 17/)
  assert.match(markdownOutput, /resourceEvidenceReady: 0\/7/)
  assert.match(markdownOutput, /WECHAT_OPEN_APP_SECRET/)
  assert.match(markdownOutput, /R02_ACR_IMAGE_REGISTRY: observed=purchase_candidate_visible_not_purchased\/blocked/)
  assert.doesNotMatch(output + markdownOutput, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdownOutput, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdownOutput, /:\/\/[^\s:@]+:[^\s@]+@/)
})
