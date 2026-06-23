#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    outPath: "",
    markdownPath: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      continue
    }
    if (arg === "--out") {
      args.outPath = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdownPath = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }
  return args
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function envArgs(args) {
  return [
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ]
}

function runJson(label, scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label}_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function buildCloudInventoryReadinessInterpretation(status, cloudAccess) {
  const inventory = status.summary?.cloudInventoryResults || {}
  const observation = inventory.observationSummary || {}
  const operations = observation.operations || inventory.localOperations || 0
  const strictReadyOperations = observation.strictReadyOperations || inventory.readyLocalOperations || 0
  const strictInventoryEvidenceReady = operations > 0 && strictReadyOperations === operations
  const freshCloudReadAvailableNow = cloudAccess.canReadCloudNow === true
  const currentCliProfileReady = cloudAccess.cli?.configProbe?.ready === true
  const currentBrowserConsoleUsable = cloudAccess.localBrowserProbe?.canUseCurrentConsole === true

  let interpretation = "strict_inventory_incomplete_and_fresh_read_unavailable"
  if (strictInventoryEvidenceReady && freshCloudReadAvailableNow) {
    interpretation = "existing_strict_inventory_ready_and_fresh_read_available"
  } else if (strictInventoryEvidenceReady && !freshCloudReadAvailableNow) {
    interpretation = "existing_strict_inventory_ready_but_fresh_cli_profile_unavailable"
  } else if (!strictInventoryEvidenceReady && freshCloudReadAvailableNow) {
    interpretation = "fresh_read_available_but_strict_inventory_incomplete"
  }

  return {
    strictInventoryEvidenceReady,
    freshCloudReadAvailableNow,
    currentCliProfileReady,
    currentBrowserConsoleUsable,
    interpretation,
    notACloudResourceReadyProof: true,
    proofScope: strictInventoryEvidenceReady
      ? "existing_local_cloud_inventory_evidence_only"
      : "strict_cloud_inventory_evidence_incomplete",
    nextEvidenceAction: freshCloudReadAvailableNow
      ? "rerun_readonly_cloud_inventory_before_any_production_action"
      : "configure_aliyun_cli_profile_or_use_cloudshell_for_fresh_readonly_inventory",
  }
}

function buildReport(args) {
  const status = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    ...envArgs(args),
  ])
  const completionAudit = runJson("completion_audit", [
    "scripts/summarize-aliyun-completion-audit.mjs",
    ...envArgs(args),
  ])
  const sensitiveBlockers = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    ...envArgs(args),
  ])
  const actionAuthorization = runJson("action_authorization", [
    "scripts/summarize-aliyun-action-authorization.mjs",
    ...envArgs(args),
  ])
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const cloudShellHandoff = runJson("cloudshell_handoff", [
    "scripts/generate-aliyun-cloudshell-inventory-handoff.mjs",
  ])
  const wechatOpenMobileAppPackage = runJson("wechat_open_mobile_app_package", [
    "scripts/generate-wechat-open-mobile-app-package.mjs",
    ...envArgs(args),
  ])

  const requiredEnvBlockers = extractRequiredEnvBlockers(sensitiveBlockers)
  const sensitiveBlockerSummaries = compactSensitiveBlockers(sensitiveBlockers)
  const blockedVariableAcquisitionPlan = buildBlockedVariableAcquisitionPlan(sensitiveBlockers)
  const readySecretEnvImportGroups = sensitiveBlockers.summary?.readySensitiveEnvVariableGroups || []
  const credentialInterventionBrief = sensitiveBlockers.credentialInterventionBrief
    || sensitiveBlockers.summary?.credentialInterventionBrief
    || {}
  const wechatOpenMobileApp = compactWechatOpenMobileApp(wechatOpenMobileAppPackage)
  const cloudInventoryReadinessInterpretation = buildCloudInventoryReadinessInterpretation(status, cloudAccess)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    canDeployNow: status.canDeployNow === true,
    verdict: status.verdict || completionAudit.verdict || "blocked",
    currentAnswer: status.canDeployNow === true
      ? "本地门禁接近可部署，但生产动作仍需动作时确认。"
      : "现在不能部署；先补微信开放平台移动应用、Android release signing、Apple Team ID、ACR/OSS/SAE/DNS/SLS 和阿里云环境变量导入证据。",
    summary: {
      requiredEnv: `${status.summary?.requiredReady || 0}/${status.summary?.requiredTotal || 0}`,
      requiredBlocking: status.summary?.requiredBlocking || [],
      cloudConfirmationsReady: `${status.summary?.cloudConfirmations?.ready || 0}/${status.summary?.cloudConfirmations?.total || 0}`,
      operatorTasksReady: `${status.summary?.operatorTasks?.ready || 0}/${status.summary?.operatorTasks?.total || 0}`,
      completion: {
        proved: completionAudit.summary?.proved || 0,
        blocked: completionAudit.summary?.blocked || 0,
        partial: completionAudit.summary?.partial || 0,
        requirements: completionAudit.summary?.requirements || 0,
      },
      sensitiveBlocked: `${sensitiveBlockers.summary?.blocked || 0}/${sensitiveBlockers.summary?.total || 0}`,
      sensitiveBlockedIds: sensitiveBlockerSummaries
        .filter((item) => item.status !== "ready")
        .map((item) => item.id),
      requiredEnvBlockers: requiredEnvBlockers.map((item) => item.name),
      blockedCredentialCount: credentialInterventionBrief.blockedCredentialCount || 0,
      blockedCredentialNames: credentialInterventionBrief.blockedCredentialNames || [],
      readySecretEnvVariableCount: credentialInterventionBrief.readySecretEnvVariableCount || 0,
      readySecretEnvVariableNames: credentialInterventionBrief.readySecretEnvVariableNames || [],
      blockedVariableAcquisitionCount: blockedVariableAcquisitionPlan.length,
      readySecretEnvImportGroupCount: readySecretEnvImportGroups.length,
      immediateAuthorizationPackets: actionAuthorization.summary?.nextActionTimeConfirmations || [],
      cloudInventoryStrictReady: `${status.summary?.cloudInventoryResults?.readyLocalOperations || 0}/${status.summary?.cloudInventoryResults?.localOperations || 0}`,
      cloudInventoryInterpretation: cloudInventoryReadinessInterpretation.interpretation,
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliConfigProbeFailureCategory: cloudAccess.cli?.configProbe?.failureCategory || "",
      currentBrowserCanUseCurrentConsole: cloudAccess.localBrowserProbe?.canUseCurrentConsole === true,
      currentBrowserAliyunConsoleTabCount: cloudAccess.localBrowserProbe?.aliyunConsoleTabCount || 0,
      wechatOpenAccountVerified: wechatOpenMobileApp.accountVerified,
      wechatOpenMobileAppCreated: wechatOpenMobileApp.mobileAppCreated,
      wechatOpenCanCreateDraft: wechatOpenMobileApp.canCreateDraftInWechatOpenPlatform,
      wechatOpenReadyToSubmitForReview: wechatOpenMobileApp.readyToSubmitForReview,
    },
    immediateAuthorizationPackets: actionAuthorization.nextActionTimeConfirmations || [],
    requiredEnvBlockers,
    blockedVariableAcquisitionPlan,
    readySecretEnvImportGroups,
    credentialInterventionBrief,
    wechatOpenMobileApp,
    cloudInventoryReadinessInterpretation,
    cloudAccess: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true,
      cliConfigFileExists: cloudAccess.cli?.configFileExists === true,
      cliConfigProbeReady: cloudAccess.cli?.configProbe?.ready === true,
      cliConfigProbeFailureCategory: cloudAccess.cli?.configProbe?.failureCategory || "",
      currentBrowserChecked: cloudAccess.localBrowserProbe?.checked === true,
      currentBrowserRunning: cloudAccess.localBrowserProbe?.running === true,
      currentBrowserCanUseCurrentConsole: cloudAccess.localBrowserProbe?.canUseCurrentConsole === true,
      currentBrowserAliyunConsoleTabCount: cloudAccess.localBrowserProbe?.aliyunConsoleTabCount || 0,
      currentBrowserAliyunConsoleHostPaths: (cloudAccess.localBrowserProbe?.aliyunConsoleTabs || [])
        .map((item) => item.hostPath)
        .filter(Boolean),
      currentBrowserCloudApiCalled: cloudAccess.localBrowserProbe?.cloudApiCalled === true,
      currentBrowserCloudMutationPerformed: cloudAccess.localBrowserProbe?.cloudMutationPerformed === true,
      currentBrowserBlockers: cloudAccess.localBrowserProbe?.blockers || [],
      workbenchTerminalConnected: cloudAccess.terminalAccess?.workbenchTerminal?.connected === true,
      workbenchTerminalReadiness: cloudAccess.terminalAccess?.workbenchTerminal?.readiness || "not_observed",
      workbenchTerminalCliInventoryAttempted: cloudAccess.terminalAccess?.workbenchTerminal?.cliInventoryAttempted === true,
      blockers: cloudAccess.blockers || [],
      readOnlyOnly: cloudAccess.readOnlyOnly === true,
      cloudApiCalled: cloudAccess.cloudApiCalled === true,
      cloudMutationPerformed: cloudAccess.cloudMutationPerformed === true,
    },
    cloudInventory: {
      localExists: status.summary?.cloudInventoryResults?.localExists === true,
      localReady: status.summary?.cloudInventoryResults?.localReady === true,
      strictReadyOperations: status.summary?.cloudInventoryResults?.observationSummary?.strictReadyOperations || 0,
      operations: status.summary?.cloudInventoryResults?.observationSummary?.operations || 0,
      safeConsoleOnly: status.summary?.cloudInventoryResults?.observationSummary?.safeConsoleOnly === true,
      consoleObservationOperations: status.summary?.cloudInventoryResults?.observationSummary?.consoleObservationOperations || 0,
      executedCommandResults: status.summary?.cloudInventoryResults?.observationSummary?.executedCommandResults || 0,
      cloudApiCalledCommandResults: status.summary?.cloudInventoryResults?.observationSummary?.cloudApiCalledCommandResults || 0,
      blockedOperationIds: status.summary?.cloudInventoryResults?.observationSummary?.blockedOperationIds || [],
      notFoundOperationIds: status.summary?.cloudInventoryResults?.observationSummary?.notFoundOperationIds || [],
      observedOperationIds: status.summary?.cloudInventoryResults?.observationSummary?.observedOperationIds || [],
    },
    sensitiveBlockers: sensitiveBlockerSummaries,
    strictVerificationOrder: cloudShellHandoff.strictVerificationOrder || [
      "corepack pnpm aliyun:cloud:access",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
    nextSafeLocalCommands: [
      "corepack pnpm aliyun:blockers:brief",
      "corepack pnpm aliyun:cloudshell:handoff",
      "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
      "corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage",
    ],
    prohibitedWithoutActionTimeConfirmation: actionAuthorization.prohibitedWithoutActionTimeConfirmation || [],
  }

  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    secretLikePaths,
  }
  report.ok = report.secretLeakCheck.ok
  return report
}

function compactWechatOpenMobileApp(report) {
  const summary = report.summary || {}
  const packageInfo = report.mobileAppCreationPackage || {}
  const android = packageInfo.android || {}
  const androidSignaturePackage = packageInfo.androidSignaturePackage || {}
  const ios = packageInfo.ios || {}
  const actionPacket = report.actionPacket || {}
  return {
    accountVerified: summary.accountVerified === true,
    mobileAppCreated: summary.mobileAppCreated === true,
    mobileAppSubmitted: summary.mobileAppSubmitted === true,
    reviewStatus: summary.reviewStatus || "unknown",
    canCreateDraftInWechatOpenPlatform: summary.canCreateDraftInWechatOpenPlatform === true,
    readyToSubmitForReview: summary.readyToSubmitForReview === true,
    submissionBlockers: summary.submissionBlockers || [],
    mobileAppCredentialsAvailable: summary.mobileAppCredentialsAvailable === true,
    requiredBlocking: summary.requiredBlocking || [],
    machineBlocking: summary.machineBlocking || [],
    androidPackageName: android.packageName || "",
    androidReleaseSigningConfigReady: android.releaseSigningConfigReady === true,
    androidReleaseUsesDebugSigning: android.releaseUsesDebugSigning === true,
    androidSignatureStatus: androidSignaturePackage.status || "unknown",
    androidReleaseArtifactReady: androidSignaturePackage.releaseArtifactReady === true,
    androidWechatSignatureRecorded: androidSignaturePackage.wechatSignatureRecorded === true,
    iosBundleId: ios.bundleId || "",
    iosUniversalLink: ios.universalLink || "",
    iosAssociatedDomain: ios.associatedDomain || "",
    appleTeamIdMissing: ios.appleTeamIdMissing === true,
    actionPacketId: actionPacket.packetId || "",
    minimumAuthorizationPhrase: actionPacket.minimumAuthorizationPhrase || "",
    createDraftFields: actionPacket.createDraftFields || [],
    backendWriteTargetsAfterApproval: actionPacket.backendWriteTargetsAfterApproval || [],
    verifyCommands: actionPacket.verifyCommands || report.verifyCommands || [],
    forbidden: actionPacket.forbidden || report.forbidden || [],
  }
}

function compactSensitiveBlockers(sensitiveBlockers) {
  return (sensitiveBlockers.items || []).map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    owner: item.owner,
    obtainFrom: item.obtainFrom,
    writeTargets: item.writeTargets || [],
    verifyCommands: item.verifyCommands || [],
    variableNames: item.variableNames || [],
    requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
  }))
}

const SENSITIVE_BLOCKER_TO_PACKET_IDS = Object.freeze({
  S01_WECHAT_OPEN_APP_LOGIN: Object.freeze(["P01_WECHAT_OPEN_MOBILE_APP"]),
  S02_APPLE_TEAM_ID: Object.freeze(["P02_APPLE_TEAM_ID"]),
  S03_ACR_PAID_PURCHASE: Object.freeze(["P03_ACR_PURCHASE"]),
  S04_ACR_REGISTRY_AUTH: Object.freeze(["P04_ACR_IMAGE_AND_PULL"]),
  S05_OSS_RAM_SECRET_OR_STS: Object.freeze(["P05_OSS_RAM_STS"]),
  S06_READY_SENSITIVE_ENV_IMPORT: Object.freeze(["P06_ENV_IMPORT"]),
  S07_ANDROID_RELEASE_SIGNING: Object.freeze(["P10_ANDROID_RELEASE_SIGNING"]),
})

function buildBlockedVariableAcquisitionPlan(sensitiveBlockers) {
  return (sensitiveBlockers.items || []).flatMap((item) => {
    const packetIds = SENSITIVE_BLOCKER_TO_PACKET_IDS[item.id] || []
    return (item.variableDetails || [])
      .filter((variable) => variable.status !== "ready")
      .map((variable) => ({
        name: variable.name,
        required: variable.required === true,
        status: variable.status,
        sensitivity: variable.sensitivity,
        sourceCategory: variable.sourceCategory,
        sourceBlockerId: item.id,
        requiredAuthorizationPackets: packetIds,
        owner: variable.owner || item.owner,
        obtainFrom: variable.consolePath || item.obtainFrom || item.consolePath || "",
        obtain: variable.obtain || "",
        importTarget: variable.importTarget || "",
        cloudConfirmationKey: variable.cloudConfirmationKey || "",
        action: variable.action || item.requiredUserAction || "",
        writeTargets: item.writeTargets || [],
        verifyCommands: item.verifyCommands || [],
        notes: variable.notes || "",
        valueHandling: valueHandlingForVariable(variable),
      }))
  })
}

function valueHandlingForVariable(variable) {
  const importTarget = String(variable.importTarget || "")
  if (importTarget.includes("plain env")) {
    return "只记录标识符和非密钥证据，导入 SAE plain env；不要写入 App 包。"
  }
  if (importTarget.includes("Android signing secret store") || importTarget.includes("本机/CI")) {
    return "只保存在本机/CI signing secret store；不要写入 JSON、Markdown、Docker 镜像或 git。"
  }
  if (variable.sensitivity === "public") {
    return "只记录标识符和非密钥证据，不写入 App 包。"
  }
  return "只在动作时导入 KMS/Secrets Manager/SAE secret env；不要写入 JSON、Markdown、Docker 镜像或 git。"
}

function extractRequiredEnvBlockers(sensitiveBlockers) {
  const variableDetails = (sensitiveBlockers.items || [])
    .flatMap((item) => item.variableDetails || [])
  const wanted = new Set(["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET", "APPLE_TEAM_ID"])
  return variableDetails
    .filter((item) => wanted.has(item.name) || item.required === true && item.status !== "ready")
    .map((item) => ({
      name: item.name,
      required: item.required === true,
      status: item.status,
      sensitivity: item.sensitivity,
      sourceCategory: item.sourceCategory,
      owner: item.owner,
      consolePath: item.consolePath,
      obtainFrom: item.consolePath,
      obtain: item.obtain,
      importTarget: item.importTarget,
      action: item.action,
      valueHandling: valueHandlingForVariable(item),
    }))
}

function renderMarkdown(report) {
  return [
    "# 美业话镜 APP production-cn 当前阻塞简报",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- verdict: ${report.verdict}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- requiredEnv: ${report.summary.requiredEnv}`,
    `- requiredBlocking: ${report.summary.requiredBlocking.join(", ") || "none"}`,
    `- cloudConfirmationsReady: ${report.summary.cloudConfirmationsReady}`,
    `- operatorTasksReady: ${report.summary.operatorTasksReady}`,
    `- completion: proved ${report.summary.completion.proved}/${report.summary.completion.requirements}, blocked ${report.summary.completion.blocked}, partial ${report.summary.completion.partial}`,
    `- sensitiveBlocked: ${report.summary.sensitiveBlocked}`,
    `- sensitiveBlockedIds: ${report.summary.sensitiveBlockedIds.join(", ") || "none"}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- blockedVariableAcquisitionCount: ${report.summary.blockedVariableAcquisitionCount}`,
    `- readySecretEnvImportGroupCount: ${report.summary.readySecretEnvImportGroupCount}`,
    `- cloudInventoryStrictReady: ${report.summary.cloudInventoryStrictReady}`,
    `- cloudInventoryInterpretation: ${report.summary.cloudInventoryInterpretation}`,
    `- canReadCloudNow: ${report.summary.canReadCloudNow}`,
    `- cliConfigProbeFailureCategory: ${report.summary.cliConfigProbeFailureCategory || "none"}`,
    `- currentBrowserCanUseCurrentConsole: ${report.summary.currentBrowserCanUseCurrentConsole}`,
    `- currentBrowserAliyunConsoleTabCount: ${report.summary.currentBrowserAliyunConsoleTabCount}`,
    `- wechatOpenAccountVerified: ${report.summary.wechatOpenAccountVerified}`,
    `- wechatOpenMobileAppCreated: ${report.summary.wechatOpenMobileAppCreated}`,
    `- wechatOpenCanCreateDraft: ${report.summary.wechatOpenCanCreateDraft}`,
    `- wechatOpenReadyToSubmitForReview: ${report.summary.wechatOpenReadyToSubmitForReview}`,
    "",
    "## 微信开放平台移动应用链路",
    "",
    `- accountVerified: ${report.wechatOpenMobileApp.accountVerified}`,
    `- mobileAppCreated: ${report.wechatOpenMobileApp.mobileAppCreated}`,
    `- mobileAppSubmitted: ${report.wechatOpenMobileApp.mobileAppSubmitted}`,
    `- reviewStatus: ${report.wechatOpenMobileApp.reviewStatus}`,
    `- canCreateDraftInWechatOpenPlatform: ${report.wechatOpenMobileApp.canCreateDraftInWechatOpenPlatform}`,
    `- readyToSubmitForReview: ${report.wechatOpenMobileApp.readyToSubmitForReview}`,
    `- mobileAppCredentialsAvailable: ${report.wechatOpenMobileApp.mobileAppCredentialsAvailable}`,
    `- submissionBlockers: ${report.wechatOpenMobileApp.submissionBlockers.join(", ") || "none"}`,
    `- androidPackageName: ${report.wechatOpenMobileApp.androidPackageName || "unknown"}`,
    `- androidReleaseSigningConfigReady: ${report.wechatOpenMobileApp.androidReleaseSigningConfigReady}`,
    `- androidReleaseUsesDebugSigning: ${report.wechatOpenMobileApp.androidReleaseUsesDebugSigning}`,
    `- androidSignatureStatus: ${report.wechatOpenMobileApp.androidSignatureStatus}`,
    `- androidReleaseArtifactReady: ${report.wechatOpenMobileApp.androidReleaseArtifactReady}`,
    `- androidWechatSignatureRecorded: ${report.wechatOpenMobileApp.androidWechatSignatureRecorded}`,
    `- iosBundleId: ${report.wechatOpenMobileApp.iosBundleId || "unknown"}`,
    `- iosUniversalLink: ${report.wechatOpenMobileApp.iosUniversalLink || "unknown"}`,
    `- iosAssociatedDomain: ${report.wechatOpenMobileApp.iosAssociatedDomain || "unknown"}`,
    `- appleTeamIdMissing: ${report.wechatOpenMobileApp.appleTeamIdMissing}`,
    `- actionPacketId: ${report.wechatOpenMobileApp.actionPacketId || "none"}`,
    `- minimumAuthorizationPhrase: ${report.wechatOpenMobileApp.minimumAuthorizationPhrase || "none"}`,
    "- createDraftFields:",
    ...report.wechatOpenMobileApp.createDraftFields.map((item) => `  - ${item.name}: ${item.value}`),
    "- backendWriteTargetsAfterApproval:",
    ...report.wechatOpenMobileApp.backendWriteTargetsAfterApproval.map((item) => `  - ${item}`),
    "",
    "## 当前可开始但必须动作时确认",
    "",
    ...(report.immediateAuthorizationPackets.length
      ? report.immediateAuthorizationPackets.flatMap(renderPacket)
      : ["- none", ""]),
    "## 密钥/密码/token/付款/受控标识符阻塞项",
    "",
    ...renderSensitiveBlockers(report.sensitiveBlockers),
    "## 用户介入密钥/密码简表",
    "",
    ...renderCredentialInterventionBrief(report.credentialInterventionBrief),
    "## 必填/发布阻塞变量",
    "",
    ...renderVariableTable(report.requiredEnvBlockers),
    "## 阻塞变量获取与导入计划",
    "",
    ...renderBlockedVariableAcquisitionPlan(report.blockedVariableAcquisitionPlan),
    "## 已 ready 但仍需导入阿里云 secret env 的变量组",
    "",
    ...renderReadySecretEnvImportGroups(report.readySecretEnvImportGroups),
    "## CloudShell / CLI 只读盘点",
    "",
    `- interpretation: ${report.cloudInventoryReadinessInterpretation.interpretation}`,
    `- strictInventoryEvidenceReady: ${report.cloudInventoryReadinessInterpretation.strictInventoryEvidenceReady}`,
    `- freshCloudReadAvailableNow: ${report.cloudInventoryReadinessInterpretation.freshCloudReadAvailableNow}`,
    `- currentCliProfileReady: ${report.cloudInventoryReadinessInterpretation.currentCliProfileReady}`,
    `- currentBrowserConsoleUsable: ${report.cloudInventoryReadinessInterpretation.currentBrowserConsoleUsable}`,
    `- notACloudResourceReadyProof: ${report.cloudInventoryReadinessInterpretation.notACloudResourceReadyProof}`,
    `- proofScope: ${report.cloudInventoryReadinessInterpretation.proofScope}`,
    `- nextEvidenceAction: ${report.cloudInventoryReadinessInterpretation.nextEvidenceAction}`,
    `- canReadCloudNow: ${report.cloudAccess.canReadCloudNow}`,
    `- cliConfigProbeReady: ${report.cloudAccess.cliConfigProbeReady}`,
    `- cliConfigProbeFailureCategory: ${report.cloudAccess.cliConfigProbeFailureCategory || "none"}`,
    `- currentBrowserChecked: ${report.cloudAccess.currentBrowserChecked}`,
    `- currentBrowserRunning: ${report.cloudAccess.currentBrowserRunning}`,
    `- currentBrowserCanUseCurrentConsole: ${report.cloudAccess.currentBrowserCanUseCurrentConsole}`,
    `- currentBrowserAliyunConsoleTabCount: ${report.cloudAccess.currentBrowserAliyunConsoleTabCount}`,
    `- currentBrowserAliyunConsoleHostPaths: ${report.cloudAccess.currentBrowserAliyunConsoleHostPaths.join(", ") || "none"}`,
    `- currentBrowserCloudApiCalled: ${report.cloudAccess.currentBrowserCloudApiCalled}`,
    `- currentBrowserCloudMutationPerformed: ${report.cloudAccess.currentBrowserCloudMutationPerformed}`,
    `- currentBrowserBlockers: ${report.cloudAccess.currentBrowserBlockers.join(", ") || "none"}`,
    `- workbenchTerminalConnected: ${report.cloudAccess.workbenchTerminalConnected}`,
    `- workbenchTerminalReadiness: ${report.cloudAccess.workbenchTerminalReadiness || "not_observed"}`,
    `- workbenchTerminalCliInventoryAttempted: ${report.cloudAccess.workbenchTerminalCliInventoryAttempted}`,
    `- blockers: ${report.cloudAccess.blockers.join(", ") || "none"}`,
    `- safeConsoleOnly: ${report.cloudInventory.safeConsoleOnly}`,
    `- strictReadyOperations: ${report.cloudInventory.strictReadyOperations}/${report.cloudInventory.operations}`,
    `- consoleObservationOperations: ${report.cloudInventory.consoleObservationOperations}`,
    `- executedCommandResults: ${report.cloudInventory.executedCommandResults}`,
    "",
    "## Strict 验证顺序",
    "",
    ...report.strictVerificationOrder.map((item) => `- \`${item}\``),
    "",
    "## 未获动作时确认前禁止",
    "",
    ...report.prohibitedWithoutActionTimeConfirmation.map((item) => `- ${item}`),
    "",
  ].join("\n")
}

function renderCredentialInterventionBrief(brief) {
  if (!brief || !Array.isArray(brief.groups)) return ["- none", ""]
  return [
    `- blockedCredentialCount: ${brief.blockedCredentialCount || 0}`,
    `- blockedCredentialNames: ${(brief.blockedCredentialNames || []).join(", ") || "none"}`,
    `- readySecretEnvVariableCount: ${brief.readySecretEnvVariableCount || 0}`,
    `- readySecretEnvVariableNames: ${(brief.readySecretEnvVariableNames || []).join(", ") || "none"}`,
    `- forbiddenStorage: ${(brief.forbiddenStorage || []).join(", ") || "none"}`,
    "",
    "| 类别 | 动作 ID | 状态 | 还缺变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...brief.groups.map((group) => [
      codeCell(group.category),
      codeCell(group.actionId),
      escapeTableCell(group.status),
      escapeTableCell((group.blockedCredentialNames || []).join(", ") || "none"),
      escapeTableCell((group.readySecretEnvVariableNames || []).join(", ") || "none"),
      escapeTableCell(group.obtainFrom),
      escapeTableCell((group.writeTargets || []).join("; ") || (group.importTargets || []).join("; ") || "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
}

function renderBlockedVariableAcquisitionPlan(items) {
  if (!items.length) return ["- none", ""]
  return [
    "| 变量 | 授权包 | 获取位置 | 获取方式 | 导入目标 | 禁止写入 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.name),
      escapeTableCell((item.requiredAuthorizationPackets || []).join(", ") || "none"),
      escapeTableCell(item.obtainFrom),
      escapeTableCell(item.obtain),
      escapeTableCell(item.importTarget),
      escapeTableCell(item.valueHandling),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
}

function renderReadySecretEnvImportGroups(groups) {
  if (!groups.length) return ["- none", ""]
  return [
    "| 类别 | owner | 导入目标 | 变量名 |",
    "| --- | --- | --- | --- |",
    ...groups.map((group) => [
      codeCell(group.category),
      escapeTableCell(group.owner),
      escapeTableCell(group.importTarget),
      escapeTableCell((group.variableNames || []).join(", ")),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
}

function renderSensitiveBlockers(items) {
  if (!items.length) return ["- none", ""]
  return [
    "| ID | 状态 | 类型 | owner | 变量名 |",
    "| --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.id),
      escapeTableCell(item.status),
      escapeTableCell(item.type),
      escapeTableCell(item.owner),
      escapeTableCell((item.variableNames || []).join(", ") || "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
}

function renderPacket(packet) {
  return [
    `### ${packet.packetId}`,
    "",
    `- title: ${packet.title}`,
    `- owner: ${packet.owner}`,
    `- minimumUserPhrase: ${packet.minimumUserPhrase}`,
    `- writeTargets: ${(packet.writeTargets || []).join("; ") || "none"}`,
    `- verifyCommands: ${(packet.verifyCommands || []).join("; ") || "none"}`,
    `- nonSecretEvidenceOnly: ${packet.nonSecretEvidenceOnly === true}`,
    "",
  ]
}

function renderVariableTable(items) {
  if (!items.length) return ["- none", ""]
  return [
    "| 变量 | 必填 | 状态 | 敏感等级 | 获取位置 | 获取方式 | 导入目标 | 处理规则 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.name),
      item.required ? "是" : "否",
      escapeTableCell(item.status),
      escapeTableCell(item.sensitivity),
      escapeTableCell(item.obtainFrom || item.consolePath),
      escapeTableCell(item.obtain),
      escapeTableCell(item.importTarget),
      escapeTableCell(item.valueHandling),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
}

function codeCell(value) {
  return `\`${escapeTableCell(value)}\``
}

function escapeTableCell(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    findSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function writeText(filePath, content) {
  if (!filePath) return
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function printHelp() {
  console.log(`Usage: node scripts/summarize-aliyun-blocker-brief.mjs [options]

Options:
  --env-file <path>             production-cn env file
  --cloud-confirmations <path>  local cloud confirmations file
  --out <path>                  write JSON brief
  --markdown <path>             write Markdown brief
`)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  const json = JSON.stringify(report, null, 2)
  writeText(args.outPath, json)
  writeText(args.markdownPath, renderMarkdown(report))
  console.log(json)
  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
