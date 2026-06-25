const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

test("Aliyun backend-cn status command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const script = read("scripts", "summarize-aliyun-backend-cn-status.mjs")

  assert.equal(pkg.scripts["aliyun:backend-cn:status"], "node ./scripts/summarize-aliyun-backend-cn-status.mjs")
  assert.equal(pkg.scripts["aliyun:backend-cn:status:test"], "node --test tests/aliyun-backend-cn-status.static.test.js")
  assert.match(predeploy, /aliyun:backend-cn:status:test/)
  assert.match(predeploy, /aliyun:backend-cn:status/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:backend-cn:status/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.match(releaseArtifacts, /backend-cn-status\.json/)
  assert.match(releaseArtifacts, /backendCnStatus/)
  assert.match(script, /backend_aliyun_only/)
  assert.match(script, /deferred_after_backend_online/)
  assert.match(script, /WECHAT_OPEN_APP_ID/)
  assert.match(script, /WECHAT_OPEN_APP_SECRET/)
  assert.match(script, /APP_API_POSTGRES_ADAPTER_MISSING/)
  assert.match(script, /POSTDEPLOY_SMOKE_NOT_RUN/)
  assert.match(script, /summarize-aliyun-sensitive-blockers\.mjs/)
  assert.match(script, /credentialIntervention/)
  assert.doesNotMatch(script, secretLike)
})

test("Aliyun backend-cn status excludes WeChat mobile app from current backend blockers", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-backend-cn-status.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const report = JSON.parse(output)
  const targetById = new Map(report.backendTargets.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.canDeployBackendNow, false)
  assert.equal(report.summary.backendTargetReady, "0/8")
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.ok(report.summary.readySecretEnvVariableNames.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"))
  assert.ok(report.summary.readySecretEnvVariableNames.includes("WECHAT_MINI_SECRET"))
  assert.ok(report.summary.sensitiveActionBlockedIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.summary.actionTimeConfirmationRequiredIds.includes("S03_ACR_PAID_PURCHASE"))
  assert.ok(report.summary.actionTimeConfirmationRequiredIds.includes("S05_OSS_RAM_SECRET_OR_STS"))
  assert.ok(report.summary.actionTimeConfirmationRequiredIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.deepEqual(report.summary.nextActionTimeConfirmationPacketIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(report.actionAuthorization.canStartNowPackets, report.summary.nextActionTimeConfirmationPacketIds)
  assert.ok(report.actionAuthorization.blockedByPacketDependencies.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.actionAuthorization.blockedByPacketDependencies.includes("P09_PRODUCTION_DEPLOY"))
  const packetById = new Map(report.actionAuthorization.nextActionTimeConfirmations.map((item) => [item.packetId, item]))
  assert.match(packetById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").minimumUserPhrase, /CloudShell/)
  assert.match(packetById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").minimumUserPhrase, /只读盘点/)
  assert.ok(packetById.get("P00_ALIYUN_READONLY_INVENTORY_IDENTITY").explicitlyExcluded.some((item) => /Create\/Update\/Delete/.test(item)))
  assert.match(packetById.get("P03_ACR_PURCHASE").minimumUserPhrase, /CNY 117\.00/)
  assert.equal(packetById.get("P03_ACR_PURCHASE").nonSecretEvidenceOnly, true)
  assert.match(packetById.get("P11_ALIYUN_RDS_DATA_MIGRATION").minimumUserPhrase, /DATABASE_URL_CN/)
  assert.equal(packetById.get("P11_ALIYUN_RDS_DATA_MIGRATION").nonSecretEvidenceOnly, false)
  assert.deepEqual(report.credentialIntervention.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.credentialIntervention.readySecretEnvVariableNames.length, 17)
  assert.ok(report.credentialIntervention.valueHandlingRules.some((item) => item.includes("不包含 value")))
  assert.ok(report.credentialIntervention.forbiddenStorage.includes("Docker image"))
  const credentialGroupById = new Map(report.credentialIntervention.groups.map((item) => [item.actionId, item]))
  assert.match(credentialGroupById.get("S08_ALIYUN_RDS_DATABASE_URL").obtainFrom, /RDS PostgreSQL/)
  assert.ok(credentialGroupById.get("S08_ALIYUN_RDS_DATABASE_URL").blockedCredentialNames.includes("DATABASE_URL_CN"))
  assert.ok(credentialGroupById.get("S08_ALIYUN_RDS_DATABASE_URL").importTargets.includes("阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.ok(credentialGroupById.get("S06_READY_SENSITIVE_ENV_IMPORT").readySecretEnvVariableNames.includes("DASHSCOPE_API_KEY"))
  assert.deepEqual(report.credentialIntervention.interventionBreakdown.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assert.deepEqual(report.credentialIntervention.interventionBreakdown.missingCredentialValues.actionIds, ["S08_ALIYUN_RDS_DATABASE_URL"])
  assert.equal(report.credentialIntervention.interventionBreakdown.readySecretsPendingCloudImport.count, 17)
  assert.ok(report.credentialIntervention.interventionBreakdown.readySecretsPendingCloudImport.names.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.credentialIntervention.interventionBreakdown.readySecretsPendingCloudImport.actionIds.includes("S05_OSS_RAM_SECRET_OR_STS"))
  assert.ok(report.credentialIntervention.interventionBreakdown.readySecretsPendingCloudImport.actionIds.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.deepEqual(report.credentialIntervention.interventionBreakdown.paidPurchaseConfirmationActionIds, ["S03_ACR_PAID_PURCHASE"])
  assert.deepEqual(report.credentialIntervention.interventionBreakdown.controlledSecretChannelActionIds, [
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])

  for (const blocker of [
    "DATABASE_URL_CN",
    "RDS_MIGRATION_EVIDENCE_NOT_READY",
    "ACR_IMAGE_REGISTRY_NOT_READY",
    "SAE_RUNTIME_NOT_READY",
    "API_DOMAIN_HTTPS_ICP_NOT_READY",
    "ASSET_DOMAIN_HTTPS_ICP_NOT_READY",
    "OSS_RAM_STS_NOT_READY",
    "ENV_IMPORT_NOT_READY",
    "SLS_ALERTS_NOT_READY",
    "POSTDEPLOY_SMOKE_NOT_RUN",
  ]) {
    assert.ok(report.summary.backendRequiredBlocking.includes(blocker), blocker)
  }

  assert.ok(!report.summary.backendRequiredBlocking.includes("RDS_POSTGRES_NOT_READY"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.wechatDeferredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.wechatDeferredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.deferredScope.wechatOpenMobileApp.excludedFromBackendRequiredBlocking, true)
  assert.equal(report.deferredScope.wechatOpenMobileApp.status, "deferred_after_backend_online")

  assert.equal(report.cloudInventory.strictReady, false)
  assert.equal(report.cloudInventory.readyLocalOperations, "0/9")
  assert.equal(report.cloudInventory.executedCommandResults, "9/9")
  assert.deepEqual(report.cloudInventory.notFoundOperationIds, [])
  assert.deepEqual(report.cloudInventory.observedOperationIds, [])
  assert.equal(report.cloudInventory.backendMeaning.rdsPostgres, "observed_or_unknown")
  assert.equal(report.cloudInventory.backendMeaning.saeRuntime, "observed_or_unknown")
  assert.equal(report.cloudInventory.backendMeaning.acrImage, "observed_or_unknown")
  assert.equal(report.cloudInventory.backendMeaning.ossAudioBucket, "not_observed")
  assert.equal(report.cloudInventory.backendMeaning.slsProject, "not_observed")
  assert.equal(report.cloudInventory.mutationPerformedCommandResults, 0)
  assert.match(report.nextBackendOrder[0], /^0\. Restore Aliyun CLI\/CloudShell read-only inventory evidence/)
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloudshell:handoff"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.equal(report.rdsMigration.localExists, true)
  assert.equal(report.rdsMigration.localReady, false)
  assert.ok(report.rdsMigration.blockers.includes("rdsPostgres.confirmed"))
  assert.ok(report.rdsMigration.blockers.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(!report.rdsMigration.blockers.includes("migration.dataAccessAdapterReady"))
  assert.equal(report.rdsMigration.appApiRoutesWithSupabase, 29)
  assert.equal(report.rdsMigration.appApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(report.rdsMigration.firstVersionRdsRouteCount, 25)
  assert.equal(report.rdsMigration.firstVersionRdsRoutesWithSupabase, 23)
  assert.equal(report.rdsMigration.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(report.rdsMigration.deferredAppApiRouteCount, 6)
  assert.equal(report.rdsMigration.deferredAppApiRoutesWithSupabaseDataAccess, 4)
  assert.equal(report.rdsMigration.databaseUrlCnReferencedInSource, true)
  assert.equal(report.rdsMigration.postgresDataAccessAdapterDetected, true)
  assert.equal(report.cloudConfirmations.backendReady, "0/6")
  assert.deepEqual(report.cloudConfirmations.backendMissingItems, [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "envImport",
    "slsAlerts",
  ])
  assert.ok(report.cloudConfirmations.backendBlockers.includes("runtime:missing_cloud_confirmation_item"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("apiDomainHttps:missing_cloud_confirmation_item"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("assetDomainHttps:missing_cloud_confirmation_item"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("oss:missing_cloud_confirmation_item"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("envImport:missing_cloud_confirmation_item"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("slsAlerts:missing_cloud_confirmation_item"))
  assert.equal(report.cloudResources.evidenceReady, "0/7")
  assert.ok(report.cloudResources.blockedIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.cloudResources.blockedIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.cloudResources.observedPartial.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.cloudResources.observedPartial.includes("R07_SLS_ALERTS"))

  assert.ok(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("DATABASE_URL_CN"))
  assert.ok(!targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("RDS_POSTGRES_NOT_READY"))
  assert.ok(!targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("APP_API_POSTGRES_ADAPTER_MISSING"))
  assert.ok(targetById.get("B02_ACR_IMAGE_REGISTRY").blockers.includes("ACR_IMAGE_REGISTRY_NOT_READY"))
  assert.ok(targetById.get("B02_ACR_IMAGE_REGISTRY").currentEvidence.includes("R02_ACR_IMAGE_REGISTRY.observedStatus=purchase_candidate_visible_not_purchased"))
  assert.ok(targetById.get("B03_SAE_RUNTIME").blockers.includes("SAE_RUNTIME_NOT_READY"))
  assert.ok(targetById.get("B03_SAE_RUNTIME").currentEvidence.includes("R01_SAE_RUNTIME.observedReadiness=blocked"))
  assert.ok(targetById.get("B04_DOMAINS_HTTPS_ICP").blockers.includes("API_DOMAIN_HTTPS_ICP_NOT_READY"))
  assert.ok(targetById.get("B04_DOMAINS_HTTPS_ICP").currentEvidence.includes("R03_API_DOMAIN_HTTPS.observedStatus=domain_visible_records_missing"))
  assert.ok(targetById.get("B05_OSS_RAM_STS").blockers.includes("OSS_RAM_STS_NOT_READY"))
  assert.ok(targetById.get("B05_OSS_RAM_STS").currentEvidence.includes("R05_OSS_AUDIO_STORAGE.observedReadiness=partial"))
  assert.ok(targetById.get("B05_OSS_RAM_STS").currentEvidence.some((item) => item.includes("bucket_exists")))
  assert.ok(targetById.get("B06_ENV_IMPORT").blockers.includes("ENV_IMPORT_NOT_READY"))
  assert.ok(targetById.get("B07_SLS_ALERTS").blockers.includes("SLS_ALERTS_NOT_READY"))
  assert.ok(targetById.get("B07_SLS_ALERTS").currentEvidence.includes("R07_SLS_ALERTS.observedReadiness=partial"))
  assert.ok(targetById.get("B07_SLS_ALERTS").currentEvidence.some((item) => item.includes("meiye-huajing-app-prod-cn")))
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").blockers.includes("POSTDEPLOY_SMOKE_NOT_RUN"))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend-cn status markdown states the backend-only target", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-cn-status-"))
  const markdownPath = path.join(tmpdir, "backend-cn-status.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /canDeployBackendNow: false/)
  assert.match(markdown, /backendRequiredBlocking: ACR_IMAGE_REGISTRY_NOT_READY/)
  assert.match(markdown, /## Cloud Confirmations/)
  assert.match(markdown, /backendReady: 0\/6/)
  assert.match(markdown, /backendMissingItems: runtime, apiDomainHttps, assetDomainHttps, oss, envImport, slsAlerts/)
  assert.match(markdown, /runtime:missing_cloud_confirmation_item/)
  assert.match(markdown, /envImport:missing_cloud_confirmation_item/)
  assert.match(markdown, /B01_RDS_POSTGRES_DATA_LAYER/)
  assert.match(markdown, /R05_OSS_AUDIO_STORAGE\.observedReadiness=partial/)
  assert.match(markdown, /R07_SLS_ALERTS\.observedReadiness=partial/)
  assert.match(markdown, /B08_POSTDEPLOY_SMOKE/)
  assert.match(markdown, /Credential Intervention/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /missingCredentialValues: DATABASE_URL_CN/)
  assert.match(markdown, /readySecretsPendingCloudImport: 17/)
  assert.match(markdown, /paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE/)
  assert.match(markdown, /controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(markdown, /阿里云 KMS\/Secrets Manager\/SAE secret env/)
  assert.match(markdown, /wechatOpenMobileApp: deferred_after_backend_online/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /0\. Restore Aliyun CLI\/CloudShell read-only inventory evidence/)
  assert.match(markdown, /## Action-Time Authorization Packets/)
  assert.match(markdown, /nextActionTimeConfirmationPacketIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /blockedByPacketDependencies: P04_ACR_IMAGE_AND_PULL, P06_ENV_IMPORT, P07_DOMAIN_DNS_HTTPS, P08_SAE_RUNTIME_SLS, P09_PRODUCTION_DEPLOY/)
  assert.match(markdown, /P00_ALIYUN_READONLY_INVENTORY_IDENTITY: 恢复阿里云 CLI\/CloudShell 只读盘点身份/)
  assert.match(markdown, /P11_ALIYUN_RDS_DATA_MIGRATION: 创建阿里云 RDS PostgreSQL 并完成正式数据层迁移/)
  assert.match(markdown, /corepack pnpm aliyun:cloudshell:handoff/)
  assert.match(markdown, /corepack pnpm aliyun:cloud:inventory-results:strict/)
  assert.match(markdown, /corepack pnpm aliyun:rds:migration:evidence:strict/)
  assert.doesNotMatch(output + markdown, secretLike)
})
