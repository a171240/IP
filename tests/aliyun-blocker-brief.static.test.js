const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|token\s*[:=]\s*\S{8,})/i

test("Aliyun blocker brief command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const blockerBrief = read("scripts", "summarize-aliyun-blocker-brief.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:blockers:brief"], "node ./scripts/summarize-aliyun-blocker-brief.mjs")
  assert.equal(pkg.scripts["aliyun:blockers:brief:test"], "node --test tests/aliyun-blocker-brief.static.test.js")
  assert.match(predeploy, /aliyun:blockers:brief:test/)
  assert.match(predeploy, /aliyun:blockers:brief/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:blockers:brief:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:blockers:brief"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:blockers:brief"))
  assert.match(releaseArtifacts, /blocker-brief\.json/)
  assert.match(releaseArtifacts, /blockerBrief/)
  assert.match(releaseArtifacts, /currentBrowserCanUseCurrentConsole/)
  assert.match(releaseArtifacts, /currentBrowserAliyunConsoleTabCount/)
  assert.match(releaseArtifacts, /wechatOpenCanCreateDraft/)
  assert.match(releaseArtifacts, /wechatOpenMobileApp/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /readySecretEnvVariableCount/)
  assert.match(releaseArtifacts, /credentialInterventionBrief/)
  assert.match(releaseArtifacts, /blockedVariableAcquisitionCount/)
  assert.match(releaseArtifacts, /readySecretEnvImportGroupCount/)
  assert.match(releaseArtifacts, /blockedVariableAcquisitionPlan/)
  assert.match(releaseArtifacts, /readySecretEnvImportGroups/)
  assert.match(releaseArtifacts, /requiredEnvBlockerDetails/)
  assert.match(releaseArtifacts, /localCodeReady/)
  assert.match(releaseArtifacts, /machineBlocking/)
  assert.match(releaseArtifacts, /bridgeDataLayer/)
  assert.match(releaseArtifacts, /rdsMigrationIncludedInThisRelease/)
  assert.match(releaseArtifacts, /cloudResourceObservations/)
  assert.match(releaseArtifacts, /cloudResourceObservedPartialIds/)
  assert.match(releaseArtifacts, /cloudResourceObservedBlockedIds/)
  assert.match(releaseArtifacts, /nextActionSequencing/)
  assert.match(releaseArtifacts, /canStartNowWritebackPlan/)
  assert.match(releaseArtifacts, /envSourceVercelRequiredCovered/)
  assert.match(releaseArtifacts, /envSourceMap/)
  assert.match(blockerBrief, /wechatCredentialBoundary/)
  assert.match(blockerBrief, /wechatMiniProgramCredentialsReusableForAppLogin/)
})

test("APP production-cn current blocker brief records the go-no-go boundary", () => {
  const doc = read("docs", "app-production-cn-current-blocker-brief.md")

  assert.match(doc, /现在不能部署；当前只推进阿里云后端/)
  assert.match(doc, /currentBackendScopeNote: 当前阿里云后端阻塞只看 requiredBlocking、machineBlocking、canStartNowConsoleTasks 和 canStartNowAuthorizationPackets/)
  assert.match(doc, /当前口径说明/)
  assert.match(doc, /当前后端阻塞只看 `requiredBlocking`、`machineBlocking`、`canStartNowConsoleTasks`、`canStartNowAuthorizationPackets`/)
  assert.match(doc, /微信开放平台移动应用、Android 签名、Apple Team ID 不属于当前阿里云后端补齐目标/)
  assert.match(doc, /requiredEnv: 24\/27/)
  assert.match(doc, /requiredBlocking:[\s\S]*DATABASE_URL_CN[\s\S]*RDS_MIGRATION_EVIDENCE_NOT_READY/)
  assert.match(doc, /deferredAppLaunchBlocking:[\s\S]*WECHAT_OPEN_APP_ID[\s\S]*ANDROID_RELEASE_SIGNING[\s\S]*APPLE_TEAM_ID/)
  assert.match(doc, /localCodeReady: false/)
  assert.match(doc, /releaseEvidenceUsable: true/)
  assert.match(doc, /cloudResourceEvidenceReady: 0\/7/)
  assert.match(doc, /sensitiveBlocked: 5\/5/)
  assert.match(doc, /blockedCredentialCount: 1/)
  assert.match(doc, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(doc, /readySecretEnvVariableCount: 17/)
  assert.match(doc, /currentBrowserCanUseCurrentConsole: true/)
  assert.match(doc, /canReadCloudNow: false/)
  assert.match(doc, /aliyun_cli_profile_not_configured/)
  assert.match(doc, /wechatOpenAccountVerified: true/)
  assert.match(doc, /wechatOpenMobileAppCreated: false/)
  assert.match(doc, /wechatOpenCanCreateDraft: true/)
  assert.match(doc, /wechatOpenReadyToSubmitForReview: false/)
  assert.match(doc, /wechatMiniProgramCredentialsReusableForAppLogin: false/)
  assert.match(doc, /WECHAT_MINI_APPID, WECHAT_MINI_SECRET, WECHAT_LOGIN_SECRET/)
  assert.match(doc, /WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env/)
  assert.match(doc, /WECHAT_OPEN_APP_SECRET -> 阿里云 KMS\/Secrets Manager\/SAE secret env/)
  assert.match(doc, /阿里云 SAE 后端在 APP 微信登录回调中使用移动应用 AppID\/AppSecret/)
  assert.match(doc, /region: cn-hangzhou/)
  assert.match(doc, /meiye-huajing-app-api-production-cn/)
  assert.match(doc, /容器端口 3000/)
  assert.match(doc, /api-cn\.ipgongchang\.xin/)
  assert.match(doc, /assets-cn\.ipgongchang\.xin/)
  assert.match(doc, /current: Supabase migration source \/ legacy compatibility only/)
  assert.match(doc, /target: Aliyun RDS PostgreSQL/)
  assert.match(doc, /databaseUrlCnStatus: todo/)
  assert.match(doc, /Supabase 只能作为迁移来源或旧链路兼容/)
  assert.match(doc, /rdsMigrationIncludedInThisRelease: false/)
  assert.match(doc, /rdsMigrationRequiredForFinalProductionCn: true/)
  assert.match(doc, /envSourceVercelRequiredCovered: 17\/27/)
  assert.match(doc, /envSourceCanMigrateFromVercelProduction: 46/)
  assert.match(doc, /envSourceAppAliyunOwnedNotInVercel: 10/)
  assert.match(doc, /SERVICE_RECORD_DEEPSEEK_API_KEY/)
  assert.match(doc, /cloudResourceObservedPartialIds:[\s\S]*R05_OSS_AUDIO_STORAGE[\s\S]*R07_SLS_ALERTS/)
  assert.match(doc, /cloudResourceObservedBlockedIds:[\s\S]*R01_SAE_RUNTIME[\s\S]*R06_ENV_IMPORT/)
  assert.match(doc, /canStartNowConsoleTasks:[\s\S]*C02_ACR_IMAGE_AND_PULL[\s\S]*C05_OSS_AUDIO_RAM_STS/)
  assert.match(doc, /canStartNowAuthorizationPackets:[\s\S]*P03_ACR_PURCHASE[\s\S]*P05_OSS_RAM_STS[\s\S]*P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(doc, /blockedByAuthorizationPacketDependencies:[\s\S]*P04_ACR_IMAGE_AND_PULL[\s\S]*P09_PRODUCTION_DEPLOY/)
  assert.match(doc, /deploy\/aliyun-production-cn\.image-publish\.local\.json: acr\.confirmed=true/)
  assert.match(doc, /deploy\/aliyun-production-cn\.cloud-confirmations\.local\.json -> items\.oss/)
  assert.match(doc, /bucket: meiye-huajing-service-records-production-cn/)
  assert.match(doc, /serviceRecordPrefix: service-records\/production-cn/)
  assert.match(doc, /docker login/)
  assert.match(doc, /docker push/)
  assert.match(doc, /部署 production-cn/)
  assert.match(doc, /创建微信开放平台移动应用/)
  assert.doesNotMatch(doc, secretLike)
})

test("Aliyun blocker brief is concise, value-free, and names current hard blockers", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-blocker-brief-"))
  const jsonPath = path.join(tmpdir, "blocker-brief.json")
  const markdownPath = path.join(tmpdir, "blocker-brief.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-blocker-brief.mjs",
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.canDeployNow, false)
  assert.match(report.currentAnswer, /当前只推进阿里云后端/)
  assert.equal(report.summary.requiredEnv, "24/27")
  assert.ok(report.summary.requiredBlocking.includes("DATABASE_URL_CN"))
  assert.ok(report.summary.requiredBlocking.includes("RDS_MIGRATION_EVIDENCE_NOT_READY"))
  assert.ok(!report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.deepEqual(report.summary.deferredAppLaunchBlocking, [
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "WECHAT_OPEN_PLATFORM_MOBILE_APP",
    "ANDROID_RELEASE_SIGNING",
    "APPLE_TEAM_ID",
    "IOS_UNIVERSAL_LINK_AASA",
  ])
  assert.equal(report.summary.localCodeReady, false)
  assert.equal(report.summary.releaseEvidenceUsable, true)
  assert.deepEqual(report.summary.machineBlocking, ["missing_required_env:DATABASE_URL_CN"])
  assert.ok(report.summary.fullAppMachineBlocking.includes("missing_required_env:WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.fullAppMachineBlocking.includes("app_universal_link:apple_team_id_missing"))
  assert.equal(report.summary.manualBlockingCount, 8)
  assert.equal(report.summary.bridgeDataLayerCurrent, "Supabase migration source / legacy compatibility only")
  assert.equal(report.summary.bridgeDataLayerTarget, "Aliyun RDS PostgreSQL")
  assert.equal(report.summary.rdsMigrationIncludedInThisRelease, false)
  assert.equal(report.summary.rdsMigrationRequiredForFinalProductionCn, true)
  assert.equal(report.bridgeDataLayer.current, "Supabase migration source / legacy compatibility only")
  assert.equal(report.bridgeDataLayer.target, "Aliyun RDS PostgreSQL")
  assert.equal(report.bridgeDataLayer.firstBridgeDeploymentUses, "not_allowed_for_final_production_cn")
  assert.equal(report.bridgeDataLayer.supabaseBridgeReady, false)
  assert.equal(report.bridgeDataLayer.supabaseSourceReady, true)
  assert.equal(report.bridgeDataLayer.databaseUrlCnStatus, "todo")
  assert.equal(report.bridgeDataLayer.redisUrlCnStatus, "todo")
  assert.equal(report.bridgeDataLayer.rdsMigrationIncludedInThisRelease, false)
  assert.equal(report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn, true)
  assert.ok(report.bridgeDataLayer.notes.some((item) => /正式国内 production-cn 目标必须使用阿里云 RDS PostgreSQL/.test(item)))
  assert.equal(report.summary.cloudResourceEvidenceReady, "0/7")
  assert.equal(report.summary.cloudResourceObservedReady, 0)
  assert.equal(report.summary.cloudResourceObservedPartial, 2)
  assert.equal(report.summary.cloudResourceObservedBlocked, 5)
  assert.equal(report.summary.cloudResourceObservedTotal, 7)
  assert.ok(report.summary.cloudResourceBlockedIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.cloudResourceBlockedIds.includes("R07_SLS_ALERTS"))
  assert.deepEqual(report.summary.cloudResourceObservedPartialIds, [
    "R05_OSS_AUDIO_STORAGE",
    "R07_SLS_ALERTS",
  ])
  assert.deepEqual(report.summary.cloudResourceObservedBlockedIds, [
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R06_ENV_IMPORT",
  ])
  assert.ok(report.summary.cloudResourceActionTimeConfirmations.includes("R02_ACR_IMAGE_REGISTRY"))
  assert.equal(report.cloudResourceObservations.evidenceReady, "0/7")
  assert.equal(report.cloudResourceObservations.observedStatuses.ready, 0)
  assert.equal(report.cloudResourceObservations.observedStatuses.partial, 2)
  assert.equal(report.cloudResourceObservations.observedStatuses.blocked, 5)
  assert.equal(report.cloudResourceObservations.observedStatuses.total, 7)
  assert.deepEqual(report.cloudResourceObservations.observedPartialIds, report.summary.cloudResourceObservedPartialIds)
  assert.deepEqual(report.cloudResourceObservations.observedBlockedIds, report.summary.cloudResourceObservedBlockedIds)
  assert.ok(report.cloudResourceObservations.observedNotReadyIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.equal(report.cloudResourceObservations.items.length, 7)
  assert.ok(report.cloudResourceObservations.items.some((item) =>
    item.id === "R01_SAE_RUNTIME" &&
    item.observedStatus === "not_created_or_not_confirmed" &&
    item.observedReadiness === "blocked"
  ))
  assert.ok(report.cloudResourceObservations.items.some((item) =>
    item.id === "R02_ACR_IMAGE_REGISTRY" &&
    item.requiresActionTimeConfirmation === true &&
    item.observedStatus === "purchase_candidate_visible_not_purchased"
  ))
  assert.ok(report.cloudResourceObservations.items.some((item) =>
    item.id === "R05_OSS_AUDIO_STORAGE" &&
    item.observedReadiness === "partial"
  ))
  assert.ok(report.cloudResourceObservations.items.some((item) =>
    item.id === "R07_SLS_ALERTS" &&
    item.observedReadiness === "partial"
  ))
  assert.deepEqual(report.summary.canStartNowConsoleTasks, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.deepEqual(report.summary.blockedByConsoleTaskDependencies, [
    "C01_SAE_RUNTIME",
    "C03_API_DOMAIN_HTTPS_ICP",
    "C04_ASSET_DOMAIN_HTTPS_ICP",
    "C06_ENV_IMPORT",
    "C07_SLS_ALERTS",
  ])
  assert.deepEqual(report.summary.canStartNowAuthorizationPackets, [
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.deepEqual(report.summary.blockedByAuthorizationPacketDependencies, [
    "P04_ACR_IMAGE_AND_PULL",
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
    "P09_PRODUCTION_DEPLOY",
  ])
  assert.deepEqual(report.nextActionSequencing.canStartNowConsoleTasks, report.summary.canStartNowConsoleTasks)
  assert.deepEqual(report.nextActionSequencing.blockedByConsoleTaskDependencies, report.summary.blockedByConsoleTaskDependencies)
  assert.deepEqual(report.nextActionSequencing.canStartNowAuthorizationPackets, report.summary.canStartNowAuthorizationPackets)
  assert.ok(report.nextActionSequencing.nextActionTimeConfirmations.some((item) =>
    item.packetId === "P03_ACR_PURCHASE" &&
    item.nonSecretEvidenceOnly === true &&
    /ACR/.test(item.minimumUserPhrase)
  ))
  assert.ok(report.nextActionSequencing.nextActionTimeConfirmations.some((item) =>
    item.packetId === "P05_OSS_RAM_STS" &&
    item.nonSecretEvidenceOnly === false &&
    /OSS/.test(item.minimumUserPhrase)
  ))
  assert.equal(report.summary.canStartNowWritebackTaskCount, 2)
  assert.equal(report.canStartNowWritebackPlan.length, 2)
  const acrWriteback = report.canStartNowWritebackPlan.find((item) => item.id === "C02_ACR_IMAGE_AND_PULL")
  assert.ok(acrWriteback)
  assert.equal(acrWriteback.currentActionScope, "purchase_and_repository_only")
  assert.equal(acrWriteback.nonSecretEvidenceOnly, true)
  assert.ok(acrWriteback.writeTargets.includes("deploy/aliyun-production-cn.image-publish.local.json: acr.confirmed=true"))
  assert.ok(acrWriteback.writeTargets.some((item) => /acr.registryHost/.test(item)))
  assert.ok(acrWriteback.acceptanceEvidence.some((item) => /ACR Enterprise Economic/.test(item)))
  assert.ok(acrWriteback.deferredWritebackGroups.some((group) => group.id === "imagePushAndDigest"))
  assert.ok(acrWriteback.deferredWritebackGroups.some((group) => group.id === "saeRuntimeImagePull"))
  assert.ok(acrWriteback.forbidden.some((item) => /registry/.test(item)))
  assert.deepEqual(acrWriteback.verifyCommands, ["corepack pnpm aliyun:image:plan"])
  const ossWriteback = report.canStartNowWritebackPlan.find((item) => item.id === "C05_OSS_AUDIO_RAM_STS")
  assert.ok(ossWriteback)
  assert.equal(ossWriteback.requiresActionTimeConfirmation, true)
  assert.ok(ossWriteback.writeTargets.includes("deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss"))
  assert.ok(ossWriteback.nonSecretFieldsToRecord.includes("ramLeastPrivilege"))
  assert.ok(ossWriteback.acceptanceEvidence.includes("ramLeastPrivilege=true"))
  assert.ok(ossWriteback.targetFields.some((item) => item.name === "bucket" && item.value === "meiye-huajing-service-records-production-cn"))
  assert.ok(ossWriteback.targetFields.some((item) => item.name === "serviceRecordPrefix" && item.value === "service-records/production-cn"))
  assert.ok(ossWriteback.forbidden.some((item) => /AccessKeySecret/.test(item)))
  assert.deepEqual(report.summary.sensitiveBlockedIds, [
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.deepEqual(report.summary.deferredAppLaunchSensitiveBlockedIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.deepEqual(report.summary.immediateAuthorizationPackets, [
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
  ])
  assert.equal(report.summary.blockedVariableAcquisitionCount, 1)
  assert.equal(report.summary.deferredAppLaunchVariableAcquisitionCount, 7)
  assert.equal(report.summary.sensitiveBlocked, "5/5")
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(report.summary.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.equal(report.summary.readySecretEnvImportGroupCount, 9)
  assert.equal(report.requiredEnvBlockers.length, 1)
  assert.equal(report.requiredEnvBlockers[0].name, "DATABASE_URL_CN")
  assert.match(report.requiredEnvBlockers[0].consolePath, /RDS PostgreSQL/)
  assert.match(report.requiredEnvBlockers[0].importTarget, /secret env/)
  assert.ok(!report.sensitiveBlockers.some((item) => item.id === "S07_ANDROID_RELEASE_SIGNING"))
  const acquisitionByName = new Map(report.blockedVariableAcquisitionPlan.map((item) => [item.name, item]))
  assert.deepEqual(Array.from(acquisitionByName.keys()), ["DATABASE_URL_CN"])
  assert.equal(acquisitionByName.get("DATABASE_URL_CN").requiredAuthorizationPackets[0], "P11_ALIYUN_RDS_DATA_MIGRATION")
  const deferredAcquisitionByName = new Map(report.deferredAppLaunchVariableAcquisitionPlan.map((item) => [item.name, item]))
  assert.equal(deferredAcquisitionByName.get("WECHAT_OPEN_APP_ID").requiredAuthorizationPackets[0], "P01_WECHAT_OPEN_MOBILE_APP")
  assert.match(deferredAcquisitionByName.get("WECHAT_OPEN_APP_ID").obtainFrom, /微信开放平台/)
  assert.match(deferredAcquisitionByName.get("WECHAT_OPEN_APP_ID").importTarget, /plain env/)
  assert.match(deferredAcquisitionByName.get("WECHAT_OPEN_APP_ID").valueHandling, /plain env/)
  assert.equal(deferredAcquisitionByName.get("WECHAT_OPEN_APP_SECRET").requiredAuthorizationPackets[0], "P01_WECHAT_OPEN_MOBILE_APP")
  assert.match(deferredAcquisitionByName.get("WECHAT_OPEN_APP_SECRET").importTarget, /secret env/)
  assert.equal(deferredAcquisitionByName.get("APPLE_TEAM_ID").requiredAuthorizationPackets[0], "P02_APPLE_TEAM_ID")
  assert.match(deferredAcquisitionByName.get("APPLE_TEAM_ID").obtainFrom, /Apple Developer/)
  assert.equal(deferredAcquisitionByName.get("MEIYE_RELEASE_KEY_PASSWORD").requiredAuthorizationPackets[0], "P10_ANDROID_RELEASE_SIGNING")
  assert.match(deferredAcquisitionByName.get("MEIYE_RELEASE_KEY_PASSWORD").importTarget, /Android signing secret store/)
  assert.match(deferredAcquisitionByName.get("MEIYE_RELEASE_KEY_PASSWORD").valueHandling, /本机\/CI signing secret store/)
  assert.ok(report.readySecretEnvImportGroups.some((group) =>
    group.category === "legacy_database_migration_source" &&
    group.variableNames.includes("SUPABASE_SERVICE_ROLE_KEY")
  ))
  assert.ok(report.readySecretEnvImportGroups.some((group) =>
    group.category === "volc_speech" &&
    group.variableNames.includes("VOLC_SPEECH_SECRET_KEY")
  ))
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 1)
  assert.deepEqual(report.credentialInterventionBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(!report.credentialInterventionBrief.groups.some((group) => group.category === "wechat_open_mobile_app"))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "ready_secret_env_import" &&
    group.readySecretEnvVariableNames.includes("DASHSCOPE_API_KEY")
  ))
  assert.ok(!report.credentialInterventionBrief.groups.some((group) => group.category === "android_release_signing"))
  assert.equal(report.cloudAccess.canReadCloudNow, false)
  assert.equal(report.cloudAccess.cliConfigProbeFailureCategory, "aliyun_cli_profile_not_configured")
  assert.equal(report.summary.cloudInventoryInterpretation, "strict_inventory_incomplete_and_fresh_read_unavailable")
  assert.equal(
    report.cloudInventoryReadinessInterpretation.interpretation,
    "strict_inventory_incomplete_and_fresh_read_unavailable",
  )
  assert.equal(report.cloudInventoryReadinessInterpretation.strictInventoryEvidenceReady, false)
  assert.equal(report.cloudInventoryReadinessInterpretation.freshCloudReadAvailableNow, false)
  assert.equal(report.cloudInventoryReadinessInterpretation.currentCliProfileReady, false)
  assert.equal(report.cloudInventoryReadinessInterpretation.currentBrowserConsoleUsable, true)
  assert.equal(report.cloudInventoryReadinessInterpretation.notACloudResourceReadyProof, true)
  assert.match(report.cloudInventoryReadinessInterpretation.nextEvidenceAction, /cloudshell|aliyun_cli_profile/)
  assert.equal(report.cloudAccess.currentBrowserChecked, true)
  assert.equal(typeof report.cloudAccess.currentBrowserCanUseCurrentConsole, "boolean")
  assert.equal(typeof report.cloudAccess.currentBrowserAliyunConsoleTabCount, "number")
  assert.ok(Array.isArray(report.cloudAccess.currentBrowserAliyunConsoleHostPaths))
  assert.equal(report.cloudAccess.currentBrowserCloudApiCalled, false)
  assert.equal(report.cloudAccess.currentBrowserCloudMutationPerformed, false)
  assert.ok(Array.isArray(report.cloudAccess.currentBrowserBlockers))
  assert.equal(typeof report.summary.currentBrowserCanUseCurrentConsole, "boolean")
  assert.equal(typeof report.summary.currentBrowserAliyunConsoleTabCount, "number")
  assert.equal(report.summary.wechatOpenAccountVerified, true)
  assert.equal(report.summary.wechatOpenMobileAppCreated, false)
  assert.equal(report.summary.wechatOpenCanCreateDraft, true)
  assert.equal(report.summary.wechatOpenReadyToSubmitForReview, false)
  assert.match(report.summary.wechatAppLoginCredentialSource, /微信开放平台 -> 管理中心 -> 移动应用/)
  assert.equal(report.summary.wechatMiniProgramCredentialsReusableForAppLogin, false)
  assert.deepEqual(report.summary.wechatMiniProgramCompatVariableNames, [
    "WECHAT_MINI_APPID",
    "WECHAT_MINI_SECRET",
    "WECHAT_LOGIN_SECRET",
  ])
  assert.equal(report.wechatOpenMobileApp.accountVerified, true)
  assert.equal(report.wechatOpenMobileApp.mobileAppCreated, false)
  assert.equal(report.wechatOpenMobileApp.canCreateDraftInWechatOpenPlatform, true)
  assert.equal(report.wechatOpenMobileApp.readyToSubmitForReview, false)
  assert.equal(report.wechatOpenMobileApp.miniProgramCredentialsReusableForAppLogin, false)
  assert.match(report.wechatOpenMobileApp.appLoginCredentialSource, /微信开放平台 -> 管理中心 -> 移动应用/)
  assert.equal(report.wechatCredentialBoundary.miniProgramCredentialsReusableForAppLogin, false)
  assert.deepEqual(report.wechatCredentialBoundary.appLoginVariableNames, [
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "WECHAT_OPEN_APP_REVIEW_STATUS",
  ])
  assert.deepEqual(report.wechatCredentialBoundary.miniProgramCompatVariableNames, [
    "WECHAT_MINI_APPID",
    "WECHAT_MINI_SECRET",
    "WECHAT_LOGIN_SECRET",
  ])
  assert.ok(report.wechatCredentialBoundary.whyNotReusable.some((item) => item.includes("不能解除 WECHAT_OPEN_APP_ID")))
  assert.ok(report.wechatCredentialBoundary.appLoginImportTargets.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.ok(report.wechatOpenMobileApp.submissionBlockers.includes("android_release_wechat_signature_missing"))
  assert.ok(report.wechatOpenMobileApp.submissionBlockers.includes("apple_team_id_missing_for_aasa"))
  assert.equal(report.wechatOpenMobileApp.androidPackageName, "com.ipgongchang.meiyehuajing")
  assert.equal(report.wechatOpenMobileApp.androidReleaseUsesDebugSigning, false)
  assert.equal(report.wechatOpenMobileApp.androidSignatureStatus, "missing_release_wechat_signature")
  assert.equal(report.wechatOpenMobileApp.androidWechatSignatureRecorded, false)
  assert.equal(report.wechatOpenMobileApp.iosBundleId, "com.ipgongchang.meiyehuajing")
  assert.equal(report.wechatOpenMobileApp.iosAssociatedDomain, "applinks:api-cn.ipgongchang.xin")
  assert.equal(report.wechatOpenMobileApp.appleTeamIdMissing, true)
  assert.equal(report.wechatOpenMobileApp.mobileAppCredentialsAvailable, false)
  assert.ok(report.wechatOpenMobileApp.backendWriteTargetsAfterApproval.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.ok(report.wechatOpenMobileApp.createDraftFields.some((item) => item.name === "androidPackageName"))
  assert.equal(report.summary.envSourceVercelRequiredCovered, "17/27")
  assert.equal(report.summary.envSourceCanMigrateFromVercelProduction, 46)
  assert.equal(report.summary.envSourceAppAliyunOwnedNotInVercel, 10)
  assert.equal(report.summary.envSourceSecretOrSensitiveToImport, 17)
  assert.deepEqual(report.summary.envSourceBlockedExternalRequired, [
    "DATABASE_URL_CN",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "APPLE_TEAM_ID",
  ])
  assert.ok(report.summary.envSourceReadyLocalButMissingFromVercel.includes("SERVICE_RECORD_DEEPSEEK_API_KEY"))
  assert.equal(report.envSourceMap.vercelCoverage.requiredCovered, "17/27")
  assert.ok(report.envSourceMap.vercelCoverage.bridgeKeysPresentInVercelProduction.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(report.envSourceMap.vercelCoverage.requiredMissingInVercelProduction.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.envSourceMap.groups.migrateFromVercelProduction.variableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.equal(report.envSourceMap.groups.migrateFromVercelProduction.count, 46)
  assert.equal(report.envSourceMap.groups.appAliyunOwnedNotInVercel.count, 10)
  const blockedEnvSourceByName = new Map(report.envSourceMap.groups.blockedExternalRequired.map((item) => [item.name, item]))
  assert.equal(blockedEnvSourceByName.get("WECHAT_OPEN_APP_ID").sourceDecision, "blocked_external_value_required")
  assert.match(blockedEnvSourceByName.get("WECHAT_OPEN_APP_ID").importTarget, /plain env/)
  assert.match(blockedEnvSourceByName.get("DATABASE_URL_CN").consolePath, /RDS PostgreSQL/)
  assert.match(blockedEnvSourceByName.get("DATABASE_URL_CN").importTarget, /secret env/)
  assert.equal(blockedEnvSourceByName.get("WECHAT_OPEN_APP_SECRET").sensitivity, "secret")
  assert.match(blockedEnvSourceByName.get("WECHAT_OPEN_APP_SECRET").importTarget, /secret env/)
  assert.match(blockedEnvSourceByName.get("APPLE_TEAM_ID").consolePath, /Apple Developer/)
  assert.ok(report.envSourceMap.groups.miniProgramCompatOnly.some((item) => item.name === "WECHAT_MINI_APPID"))
  assert.ok(report.envSourceMap.groups.miniProgramCompatOnly.some((item) => item.name === "WECHAT_MINI_SECRET"))
  assert.equal(typeof report.cloudAccess.workbenchTerminalConnected, "boolean")
  assert.equal(typeof report.cloudAccess.workbenchTerminalReadiness, "string")
  assert.equal(report.cloudAccess.workbenchTerminalCliInventoryAttempted, false)
  assert.equal(typeof report.cloudInventory.safeConsoleOnly, "boolean")
  assert.equal(typeof report.cloudInventory.strictReadyOperations, "number")
  assert.ok(report.cloudInventory.strictReadyOperations <= report.cloudInventory.operations)
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.match(markdown, /当前阻塞简报/)
  assert.equal(
    report.summary.currentBackendScopeNote,
    "当前阿里云后端阻塞只看 requiredBlocking、machineBlocking、canStartNowConsoleTasks 和 canStartNowAuthorizationPackets；fullApp* 与 deferredAppLaunch* 只保留完整 App 发布延期上下文，不是当前后端部署阻塞。",
  )
  assert.match(markdown, /当前口径说明/)
  assert.match(markdown, /当前后端阻塞只看 `requiredBlocking`、`machineBlocking`、`canStartNowConsoleTasks`、`canStartNowAuthorizationPackets`/)
  assert.match(markdown, /微信开放平台移动应用、Android 签名、Apple Team ID 不属于当前阿里云后端补齐目标/)
  assert.match(markdown, /ANDROID_RELEASE_SIGNING|android_release_signing/)
  assert.match(markdown, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(markdown, /S07_ANDROID_RELEASE_SIGNING/)
  assert.match(markdown, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(markdown, /workbenchTerminalReadiness/)
  assert.match(markdown, /currentBrowserCanUseCurrentConsole/)
  assert.match(markdown, /currentBrowserCloudApiCalled: false/)
  assert.match(markdown, /cloudInventoryInterpretation: strict_inventory_incomplete_and_fresh_read_unavailable/)
  assert.match(markdown, /localCodeReady: false/)
  assert.match(markdown, /machineBlocking: missing_required_env:DATABASE_URL_CN/)
  assert.match(markdown, /fullAppMachineBlocking: .*missing_required_env:WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /数据层边界/)
  assert.match(markdown, /current: Supabase migration source \/ legacy compatibility only/)
  assert.match(markdown, /target: Aliyun RDS PostgreSQL/)
  assert.match(markdown, /`DATABASE_URL_CN` \| todo/)
  assert.match(markdown, /rdsMigrationIncludedInThisRelease: false/)
  assert.match(markdown, /rdsMigrationRequiredForFinalProductionCn: true/)
  assert.match(markdown, /阿里云资源观察结果/)
  assert.match(markdown, /evidenceReady: 0\/7/)
  assert.match(markdown, /observedReady: 0\/7/)
  assert.match(markdown, /observedPartial: 2/)
  assert.match(markdown, /observedBlocked: 5/)
  assert.match(markdown, /cloudResourceObservedPartialIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdown, /cloudResourceObservedBlockedIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R06_ENV_IMPORT/)
  assert.match(markdown, /observedPartialIds: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdown, /R01_SAE_RUNTIME/)
  assert.match(markdown, /not_created_or_not_confirmed/)
  assert.match(markdown, /R05_OSS_AUDIO_STORAGE/)
  assert.match(markdown, /bucket_visible_unconfirmed/)
  assert.match(markdown, /下一步动作排序/)
  assert.match(markdown, /canStartNowConsoleTasks: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /blockedByConsoleTaskDependencies: C01_SAE_RUNTIME/)
  assert.match(markdown, /canStartNowAuthorizationPackets: P03_ACR_PURCHASE, P05_OSS_RAM_STS, P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /P03_ACR_PURCHASE/)
  assert.match(markdown, /授权购买/)
  assert.match(markdown, /当前可做动作回填清单/)
  assert.match(markdown, /C02_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /purchase_and_repository_only/)
  assert.match(markdown, /acr\.confirmed=true/)
  assert.match(markdown, /imagePushAndDigest/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /ramLeastPrivilege=true/)
  assert.match(markdown, /service-records\/production-cn/)
  assert.match(markdown, /notACloudResourceReadyProof: true/)
  assert.match(markdown, /nextEvidenceAction: configure_aliyun_cli_profile_or_use_cloudshell_for_fresh_readonly_inventory/)
  assert.match(markdown, /微信开放平台移动应用链路/)
  assert.match(markdown, /canCreateDraftInWechatOpenPlatform: true/)
  assert.match(markdown, /readyToSubmitForReview: false/)
  assert.match(markdown, /androidSignatureStatus: missing_release_wechat_signature/)
  assert.match(markdown, /appleTeamIdMissing: true/)
  assert.match(markdown, /APP 微信登录凭证边界/)
  assert.match(markdown, /appLoginVariableNames: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_APP_REVIEW_STATUS/)
  assert.match(markdown, /miniProgramCompatVariableNames: WECHAT_MINI_APPID, WECHAT_MINI_SECRET, WECHAT_LOGIN_SECRET/)
  assert.match(markdown, /miniProgramCredentialsReusableForAppLogin: false/)
  assert.match(markdown, /阿里云 SAE 后端在 APP 微信登录回调中使用移动应用 AppID\/AppSecret/)
  assert.match(markdown, /环境变量来源与 Vercel 覆盖/)
  assert.match(markdown, /vercelRequiredCovered:/)
  assert.match(markdown, /canMigrateFromVercelProduction:/)
  assert.match(markdown, /appAliyunOwnedNotInVercel:/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /SERVICE_RECORD_DEEPSEEK_API_KEY/)
  assert.match(markdown, /WECHAT_MINI_APPID/)
  assert.match(markdown, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /用户介入密钥\/密码简表/)
  assert.match(markdown, /sensitiveBlocked: 5\/5/)
  assert.match(markdown, /blockedCredentialCount: 1/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.doesNotMatch(markdown, /`wechat_open_mobile_app` \| `S01_WECHAT_OPEN_APP_LOGIN`/)
  assert.match(markdown, /ready_secret_env_import/)
  assert.match(markdown, /当前后端阻塞变量获取与导入计划/)
  assert.match(markdown, /延期的完整 APP 发布变量/)
  assert.match(markdown, /已 ready 但仍需导入阿里云 secret env 的变量组/)
  assert.match(markdown, /禁止写入/)
  assert.match(markdown, /只保存在本机\/CI signing secret store/)
  assert.match(markdown, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})
