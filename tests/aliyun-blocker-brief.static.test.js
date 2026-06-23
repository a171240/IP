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
  assert.match(report.currentAnswer, /Android release signing/)
  assert.equal(report.summary.requiredEnv, "24/26")
  assert.deepEqual(report.summary.requiredBlocking, ["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET"])
  assert.deepEqual(report.summary.sensitiveBlockedIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.deepEqual(report.summary.immediateAuthorizationPackets, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
  ])
  assert.equal(report.summary.blockedVariableAcquisitionCount, 8)
  assert.equal(report.summary.blockedCredentialCount, 8)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.ok(report.summary.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.blockedCredentialNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.ok(report.summary.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.equal(report.summary.readySecretEnvImportGroupCount, 9)
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "WECHAT_OPEN_APP_ID" && /微信开放平台/.test(item.consolePath)))
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "WECHAT_OPEN_APP_SECRET" && /secret env/.test(item.importTarget)))
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "APPLE_TEAM_ID" && /Apple Developer/.test(item.consolePath)))
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "MEIYE_RELEASE_KEY_PASSWORD" && /Android signing secret store/.test(item.importTarget)))
  assert.ok(report.sensitiveBlockers.some((item) =>
    item.id === "S07_ANDROID_RELEASE_SIGNING" &&
    item.type === "android_keystore_password_or_signature" &&
    item.variableNames.includes("MEIYE_RELEASE_STORE_PASSWORD")
  ))
  const acquisitionByName = new Map(report.blockedVariableAcquisitionPlan.map((item) => [item.name, item]))
  assert.equal(acquisitionByName.get("WECHAT_OPEN_APP_ID").requiredAuthorizationPackets[0], "P01_WECHAT_OPEN_MOBILE_APP")
  assert.match(acquisitionByName.get("WECHAT_OPEN_APP_ID").obtainFrom, /微信开放平台/)
  assert.match(acquisitionByName.get("WECHAT_OPEN_APP_ID").importTarget, /plain env/)
  assert.match(acquisitionByName.get("WECHAT_OPEN_APP_ID").valueHandling, /plain env/)
  assert.equal(acquisitionByName.get("WECHAT_OPEN_APP_SECRET").requiredAuthorizationPackets[0], "P01_WECHAT_OPEN_MOBILE_APP")
  assert.match(acquisitionByName.get("WECHAT_OPEN_APP_SECRET").importTarget, /secret env/)
  assert.equal(acquisitionByName.get("APPLE_TEAM_ID").requiredAuthorizationPackets[0], "P02_APPLE_TEAM_ID")
  assert.match(acquisitionByName.get("APPLE_TEAM_ID").obtainFrom, /Apple Developer/)
  assert.equal(acquisitionByName.get("MEIYE_RELEASE_KEY_PASSWORD").requiredAuthorizationPackets[0], "P10_ANDROID_RELEASE_SIGNING")
  assert.match(acquisitionByName.get("MEIYE_RELEASE_KEY_PASSWORD").importTarget, /Android signing secret store/)
  assert.match(acquisitionByName.get("MEIYE_RELEASE_KEY_PASSWORD").valueHandling, /本机\/CI signing secret store/)
  assert.ok(report.readySecretEnvImportGroups.some((group) =>
    group.category === "bridge_database" &&
    group.variableNames.includes("SUPABASE_SERVICE_ROLE_KEY")
  ))
  assert.ok(report.readySecretEnvImportGroups.some((group) =>
    group.category === "volc_speech" &&
    group.variableNames.includes("VOLC_SPEECH_SECRET_KEY")
  ))
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 8)
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "wechat_open_mobile_app" &&
    group.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID") &&
    /微信开放平台/.test(group.obtainFrom)
  ))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "ready_secret_env_import" &&
    group.readySecretEnvVariableNames.includes("DASHSCOPE_API_KEY")
  ))
  assert.ok(report.credentialInterventionBrief.groups.some((group) =>
    group.category === "android_release_signing" &&
    group.blockedCredentialNames.includes("MEIYE_RELEASE_KEY_PASSWORD")
  ))
  assert.equal(report.cloudAccess.canReadCloudNow, false)
  assert.equal(report.cloudAccess.cliConfigProbeFailureCategory, "aliyun_cli_profile_not_configured")
  assert.equal(report.summary.cloudInventoryInterpretation, "existing_strict_inventory_ready_but_fresh_cli_profile_unavailable")
  assert.equal(
    report.cloudInventoryReadinessInterpretation.interpretation,
    "existing_strict_inventory_ready_but_fresh_cli_profile_unavailable",
  )
  assert.equal(report.cloudInventoryReadinessInterpretation.strictInventoryEvidenceReady, true)
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
  assert.equal(report.wechatOpenMobileApp.accountVerified, true)
  assert.equal(report.wechatOpenMobileApp.mobileAppCreated, false)
  assert.equal(report.wechatOpenMobileApp.canCreateDraftInWechatOpenPlatform, true)
  assert.equal(report.wechatOpenMobileApp.readyToSubmitForReview, false)
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
  assert.equal(typeof report.cloudAccess.workbenchTerminalConnected, "boolean")
  assert.equal(typeof report.cloudAccess.workbenchTerminalReadiness, "string")
  assert.equal(report.cloudAccess.workbenchTerminalCliInventoryAttempted, false)
  assert.equal(typeof report.cloudInventory.safeConsoleOnly, "boolean")
  assert.equal(typeof report.cloudInventory.strictReadyOperations, "number")
  assert.ok(report.cloudInventory.strictReadyOperations <= report.cloudInventory.operations)
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.match(markdown, /当前阻塞简报/)
  assert.match(markdown, /Android release signing/)
  assert.match(markdown, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(markdown, /S07_ANDROID_RELEASE_SIGNING/)
  assert.match(markdown, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(markdown, /workbenchTerminalReadiness/)
  assert.match(markdown, /currentBrowserCanUseCurrentConsole/)
  assert.match(markdown, /currentBrowserCloudApiCalled: false/)
  assert.match(markdown, /cloudInventoryInterpretation: existing_strict_inventory_ready_but_fresh_cli_profile_unavailable/)
  assert.match(markdown, /notACloudResourceReadyProof: true/)
  assert.match(markdown, /nextEvidenceAction: configure_aliyun_cli_profile_or_use_cloudshell_for_fresh_readonly_inventory/)
  assert.match(markdown, /微信开放平台移动应用链路/)
  assert.match(markdown, /canCreateDraftInWechatOpenPlatform: true/)
  assert.match(markdown, /readyToSubmitForReview: false/)
  assert.match(markdown, /androidSignatureStatus: missing_release_wechat_signature/)
  assert.match(markdown, /appleTeamIdMissing: true/)
  assert.match(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /用户介入密钥\/密码简表/)
  assert.match(markdown, /blockedCredentialCount: 8/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /wechat_open_mobile_app/)
  assert.match(markdown, /ready_secret_env_import/)
  assert.match(markdown, /阻塞变量获取与导入计划/)
  assert.match(markdown, /已 ready 但仍需导入阿里云 secret env 的变量组/)
  assert.match(markdown, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})
