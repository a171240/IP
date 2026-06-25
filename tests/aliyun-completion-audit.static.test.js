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
        observedAt: "2026-06-23T02:30:00+08:00",
        outputSummary: "Console-only non-secret observation; CLI/OpenAPI inventory not executed.",
        evidence: `completion_audit_console_only_${id.toLowerCase()}_handle`,
      },
    ],
    writesTo: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
    ],
    evidence: `${id} non-secret console evidence`,
  }
}

function writeConsoleOnlyInventoryFixture(filePath) {
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: "2026-06-23T02:30:00+08:00",
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
}

test("Aliyun completion audit command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:completion:audit"], "node ./scripts/summarize-aliyun-completion-audit.mjs")
  assert.equal(pkg.scripts["aliyun:completion:audit:test"], "node --test tests/aliyun-completion-audit.static.test.js")
  assert.match(predeploy, /aliyun:completion:audit:test/)
  assert.match(predeploy, /aliyun:completion:audit/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:completion:audit:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:completion:audit"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:completion:audit"))
  assert.match(releaseArtifacts, /completion-audit\.json/)
  assert.match(releaseArtifacts, /completion-audit\.md/)
  assert.match(releaseArtifacts, /completionAudit/)
  assert.match(releaseArtifacts, /cloudInventoryConsoleOnly/)
  assert.match(releaseArtifacts, /observationSummary/)
  assert.match(releaseArtifacts, /nextActionTimeConfirmations/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /readySecretEnvVariableCount/)
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /blockedResourceEvidenceIds/)
  assert.match(releaseArtifacts, /compatibilityReviewRequired/)
  assert.match(releaseArtifacts, /compatibilityFindingCount/)
  assert.match(releaseArtifacts, /compatibilityCategories/)
  assert.match(releaseArtifacts, /goalClosureEvidenceBrief/)
})

test("Aliyun completion audit reports the current goal as blocked without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-completion-audit.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.requirements.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.complete, false)
  assert.equal(report.verdict, "blocked")
  assert.equal(report.canDeployNow, false)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.requirements, 11)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.summary.deferred, 2)
  assert.ok(report.summary.blocked >= 6)
  assert.ok(report.summary.proved >= 1)
  assert.ok(report.summary.partial >= 1)
  assert.equal(report.summary.requiredBlockingScope, "backend_aliyun_only")
  assert.equal(report.summary.requiredEnv, "24/25")
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.ok(!report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.summary.fullAppRequiredEnv, "24/27")
  assert.ok(report.summary.fullAppRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.fullAppRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.summary.cloudConfirmations.scope, "backend_aliyun_only")
  assert.equal(report.summary.cloudConfirmations.backendOnly, true)
  assert.equal(report.summary.cloudConfirmations.ready, 0)
  assert.equal(report.summary.cloudConfirmations.total, 6)
  assert.equal(report.summary.cloudConfirmations.totalBlockers, 18)
  assert.ok(!report.summary.cloudConfirmations.pending.some((item) => item.key === "wechatOpenPlatform"))
  assert.deepEqual(report.summary.cloudConfirmations.writebackBlockingGroups, [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "envImport",
    "slsAlerts",
  ])
  assert.equal(report.summary.fullAppCloudConfirmations.ready, 0)
  assert.equal(report.summary.fullAppCloudConfirmations.total, 7)
  assert.ok(report.summary.fullAppCloudConfirmations.pending.some((item) => item.key === "wechatOpenPlatform"))
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.fullAppBlockedCredentialCount, 8)
  assert.ok(report.summary.fullAppBlockedCredentialNames.includes("DATABASE_URL_CN"))
  assert.ok(report.summary.fullAppBlockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.deferredAppLaunchBlockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.deferredAppLaunchBlockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.deferredAppLaunchSensitiveBlockedIds.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.equal(report.summary.localImplementationReady, true)
  assert.deepEqual(report.summary.localImplementationBlockingFields, [])
  assert.ok(report.summary.localImplementationReadyFields.includes("appApiBridgeMap"))
  assert.ok(report.summary.localImplementationReadyFields.includes("appRuntimeConfig"))
  assert.ok(report.summary.localCodeMachineBlockers.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!report.summary.localCodeMachineBlockers.includes("missing_required_env:WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.localCodeMachineBlockers.includes("app_universal_link:apple_team_id_missing"))
  assert.equal(report.bridgeDataLayer.current, "Supabase migration source / legacy compatibility only")
  assert.equal(report.bridgeDataLayer.target, "Aliyun RDS PostgreSQL")
  assert.equal(report.bridgeDataLayer.firstBridgeDeploymentUses, "not_allowed_for_final_production_cn")
  assert.equal(report.bridgeDataLayer.supabaseBridgeReady, false)
  assert.equal(report.bridgeDataLayer.supabaseSourceReady, true)
  assert.equal(report.bridgeDataLayer.databaseUrlCnStatus, "todo")
  assert.equal(report.bridgeDataLayer.rdsMigrationIncludedInThisRelease, false)
  assert.equal(report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn, true)
  assert.equal(report.summary.bridgeDataLayer.current, "Supabase migration source / legacy compatibility only")
  assert.equal(report.summary.bridgeDataLayer.rdsMigrationIncludedInThisRelease, false)
  assert.ok(report.bridgeDataLayer.notes.some((item) => item.includes("正式国内 production-cn 目标必须使用阿里云 RDS PostgreSQL")))
  assert.ok(report.summary.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.equal(report.summary.operatorTasks.total, 8)
  assert.equal(report.summary.operatorTasks.ready, 0)
  assert.equal(report.summary.operatorTasks.operatorActionPacketSummary.currentScope, "backend_aliyun_only")
  assert.deepEqual(report.summary.operatorTasks.operatorActionPacketSummary.canStartNowPacketIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(report.summary.operatorTasks.operatorActionPacketSummary.deferredAppLaunchPacketIds, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.ok(!report.summary.operatorTasks.operatorActionPacketSummary.canStartNowPacketIds.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.equal(report.goalClosureEvidenceBrief.credentialIntervention.blockedCredentialCount, 1)
  assert.deepEqual(report.goalClosureEvidenceBrief.credentialIntervention.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.goalClosureEvidenceBrief.resourceEvidence.ready, "0/7")
  assert.ok(!report.goalClosureEvidenceBrief.credentialIntervention.groups.some((group) =>
    group.category === "wechat_open_mobile_app"
  ))
  assert.ok(report.goalClosureEvidenceBrief.resourceEvidence.blockedResourceEvidence.some((item) =>
    item.id === "R02_ACR_IMAGE_REGISTRY" &&
    item.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE")
  ))

  assert.equal(byId.get("G01_LOCAL_APP_BACKEND_READY").status, "partial")
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").evidence.includes("localCodeReady=false"))
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").evidence.includes("localImplementationReady=true"))
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").evidence.includes("localImplementationBlockingFields=none"))
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").evidence.some((item) =>
    item.includes("localCodeMachineBlockers=") &&
    item.includes("missing_required_env:DATABASE_URL_CN") &&
    !item.includes("missing_required_env:WECHAT_OPEN_APP_ID")
  ))
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").blockers.includes("localCodeReady=false"))
  assert.ok(!byId.get("G01_LOCAL_APP_BACKEND_READY").blockers.includes("appApiBridgeMap"))
  assert.ok(!byId.get("G01_LOCAL_APP_BACKEND_READY").blockers.includes("appRuntimeConfig"))
  assert.equal(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").status, "blocked")
  assert.ok(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").evidence.includes("cloudConfirmationScope=backend_aliyun_only"))
  assert.ok(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").evidence.includes("cloudConfirmations 0/6 ready"))
  assert.ok(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").evidence.includes("operatorTasks ready 0/8"))
  assert.ok(!byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").evidence.includes("operatorTasks ready 1/9"))
  assert.ok(!byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").blockers.some((item) =>
    item.startsWith("wechatOpenPlatform:")
  ))
  assert.ok(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").evidence.includes("resourceEvidenceReady=0/7"))
  assert.ok(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").blockers.some((item) =>
    item.includes("R02_ACR_IMAGE_REGISTRY:imagePublishLocal:todo:acr.registryHost")
  ))
  assert.equal(byId.get("G02B_ALIYUN_RDS_DATA_LAYER_READY").status, "blocked")
  assert.ok(byId.get("G02B_ALIYUN_RDS_DATA_LAYER_READY").blockers.includes("DATABASE_URL_CN"))
  assert.ok(byId.get("G02B_ALIYUN_RDS_DATA_LAYER_READY").blockers.includes("rdsMigrationIncludedInThisRelease=false"))
  assert.equal(byId.get("G03_CLOUD_INVENTORY_PROVED").status, "blocked")
  assert.ok(byId.get("G03_CLOUD_INVENTORY_PROVED").evidence.includes("readyLocalOperations=0/9"))
  assert.ok(byId.get("G03_CLOUD_INVENTORY_PROVED").evidence.includes("executedCommandResults=9/9"))
  assert.ok(byId.get("G03_CLOUD_INVENTORY_PROVED").blockers.includes("readonly_inventory_strict_ready=0/9"))
  assert.equal(byId.get("G04_IMAGE_PUBLISH_READY").status, "blocked")
  assert.equal(byId.get("G05_DOMAIN_HTTPS_ICP_READY").status, "blocked")
  assert.equal(byId.get("G06_WECHAT_APP_LOGIN_READY").status, "deferred")
  assert.equal(byId.get("G07_APPLE_AASA_READY").status, "deferred")
  assert.equal(byId.get("G08_ENV_IMPORT_READY").status, "blocked")
  assert.equal(byId.get("G09_SENSITIVE_BLOCKERS_EXPLICIT").status, "proved")
  assert.ok(byId.get("G09_SENSITIVE_BLOCKERS_EXPLICIT").evidence.includes("blockedCredentialCount=1"))
  assert.ok(byId.get("G09_SENSITIVE_BLOCKERS_EXPLICIT").evidence.includes("readySecretEnvVariableCount=17"))
  assert.equal(byId.get("G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE").status, "blocked")

  assert.ok(byId.get("G06_WECHAT_APP_LOGIN_READY").blockers.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(byId.get("G06_WECHAT_APP_LOGIN_READY").blockers.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!byId.get("G08_ENV_IMPORT_READY").blockers.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!byId.get("G08_ENV_IMPORT_READY").blockers.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(byId.get("G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE").blockers.includes("canDeployNow=false"))

  assert.ok(report.nextActions.canStartNowConsoleTasks.includes("C02_ACR_IMAGE_AND_PULL"))
  assert.ok(report.nextActions.canStartNowConsoleTasks.includes("C05_OSS_AUDIO_RAM_STS"))
  assert.ok(!report.nextActions.canStartNowAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(!report.nextActions.canStartNowAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.nextActions.canStartNowAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.deepEqual(
    report.summary.nextActionTimeConfirmations.map((item) => item.packetId),
    [
      "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
      "P03_ACR_PURCHASE",
      "P05_OSS_RAM_STS",
      "P11_ALIYUN_RDS_DATA_MIGRATION",
    ],
  )
  assert.equal(report.sourceCommands.cloudConfirmations, "corepack pnpm aliyun:cloud:confirmations:backend")
  assert.equal(report.sourceCommands.operatorTasks, "corepack pnpm aliyun:operator:tasks:backend")
  assert.ok(
    report.summary.nextActionTimeConfirmations
      .find((item) => item.packetId === "P03_ACR_PURCHASE")
      .explicitlyExcluded.some((item) => item.includes("未明确确认金额前不点击付款")),
  )
  assert.ok(
    report.nextActions.nextActionTimeConfirmations
      .find((item) => item.packetId === "P05_OSS_RAM_STS")
      .completionEvidence.includes("oss.ramLeastPrivilege=true"),
  )
  assert.ok(!report.nextActions.sensitiveBlockedIds.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(report.nextActions.deferredAppLaunchSensitiveBlockedIds.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(report.nextActions.sensitiveBlockedIds.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不购买 ACR")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不读取、复制、输出或导入")))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun completion audit carries console-only inventory evidence into G03 and markdown", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-completion-audit-console-observation-"))
  const inventoryResults = path.join(tmpdir, "cloud-inventory-results.local.json")
  const markdown = path.join(tmpdir, "completion-audit.md")
  writeConsoleOnlyInventoryFixture(inventoryResults)

  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-completion-audit.mjs",
    "--cloud-inventory-results",
    inventoryResults,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.requirements.map((item) => [item.id, item]))
  const cloudInventory = byId.get("G03_CLOUD_INVENTORY_PROVED")
  const evidence = cloudInventory.evidence.join("; ")
  const markdownOutput = fs.readFileSync(markdown, "utf8")

  assert.equal(cloudInventory.status, "blocked")
  assert.match(evidence, /safeConsoleOnly=true/)
  assert.match(evidence, /consoleObservationOperations=9\/9/)
  assert.match(evidence, /executedCommandResults=0\/9/)
  assert.match(evidence, /cloudApiCalledCommandResults=0/)
  assert.match(evidence, /mutationPerformedCommandResults=0/)
  assert.ok(cloudInventory.blockers.includes("console_only_observation_not_strict_inventory"))
  assert.ok(cloudInventory.blockers.includes("readonly_inventory_commands_executed=0/9"))
  assert.ok(!cloudInventory.blockers.some((item) => item.includes("commandResults[0]:executed=true")))
  assert.equal(report.summary.cloudInventoryResults.observationSummary.safeConsoleOnly, true)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.consoleObservationOperations, 9)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.executedCommandResults, 0)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.cloudApiCalledCommandResults, 0)
  assert.match(markdownOutput, /Cloud inventory console-only: safe true, console observations 9\/9, executed commands 0\/9, cloud API calls 0/)
  assert.match(markdownOutput, /Bridge data layer: current Supabase migration source \/ legacy compatibility only, target Aliyun RDS PostgreSQL, first bridge uses not_allowed_for_final_production_cn/)
  assert.match(markdownOutput, /G02B_ALIYUN_RDS_DATA_LAYER_READY/)
  assert.match(markdownOutput, /## 数据层边界/)
  assert.match(markdownOutput, /rdsMigrationIncludedInThisRelease: false/)
  assert.match(markdownOutput, /rdsMigrationRequiredForFinalProductionCn: true/)
  assert.match(markdownOutput, /目标闭环证据简表/)
  assert.match(markdownOutput, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdownOutput, /fullAppBlockedCredentialNames: .*WECHAT_OPEN_APP_SECRET/)
  assert.match(markdownOutput, /deferredAppLaunchBlockedCredentialNames: .*WECHAT_OPEN_APP_SECRET/)
  assert.match(markdownOutput, /resourceEvidenceReady: 0\/7/)
  assert.match(markdownOutput, /R02_ACR_IMAGE_REGISTRY: observed=purchase_candidate_visible_not_purchased\/blocked/)
  assert.match(markdownOutput, /safeConsoleOnly=true/)
  assert.doesNotMatch(output + markdownOutput, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdownOutput, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdownOutput, /:\/\/[^\s:@]+:[^\s@]+@/)
})
