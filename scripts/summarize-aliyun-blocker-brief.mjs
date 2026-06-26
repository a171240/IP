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

const CURRENT_SCOPE = "backend_aliyun_only"
const FULL_APP_LAUNCH_SCOPE = "deferred_after_backend_online"
const APP_LAUNCH_REQUIRED_NAMES = new Set([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "APPLE_TEAM_ID",
])
const APP_LAUNCH_SENSITIVE_BLOCKER_IDS = new Set([
  "S01_WECHAT_OPEN_APP_LOGIN",
  "S02_APPLE_TEAM_ID",
  "S07_ANDROID_RELEASE_SIGNING",
])
const APP_LAUNCH_VARIABLE_PATTERNS = [
  /^WECHAT_OPEN_APP_/,
  /^MEIYE_RELEASE_/,
  /^APPLE_TEAM_ID$/,
]
const APP_LAUNCH_MACHINE_BLOCKER_PATTERNS = [
  /WECHAT_OPEN_APP_/,
  /wechat_open_platform_mobile_app/i,
  /wechatOpenPlatform/i,
  /微信开放平台/,
  /app_universal_link:apple_team_id_missing/i,
  /invalid_app_universal_link_config/i,
  /Android release signing/i,
  /APPLE_TEAM_ID/,
  /Apple Team ID/i,
  /iOS Universal Link/i,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    outPath: "",
    markdownPath: "",
    skipVercelEnvCoverage: false,
    vercelEnvCoverageInput: "",
    vercelEnvCoverageReport: "",
    backendOnly: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--backend-only") {
      args.backendOnly = true
      continue
    }
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
    if (arg === "--skip-vercel-env-coverage") {
      args.skipVercelEnvCoverage = true
      continue
    }
    if (arg === "--vercel-env-coverage-input") {
      args.vercelEnvCoverageInput = resolveValue(argv[++index], "--vercel-env-coverage-input")
      continue
    }
    if (arg === "--vercel-env-coverage-report") {
      args.vercelEnvCoverageReport = resolveValue(argv[++index], "--vercel-env-coverage-report")
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
    ...(args.backendOnly ? ["--backend-only"] : []),
    ...envArgs(args),
  ])
  const backendStatus = runJson("backend_status", [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    ...envArgs(args),
  ])
  const completionAudit = runJson("completion_audit", [
    "scripts/summarize-aliyun-completion-audit.mjs",
    ...envArgs(args),
  ])
  const sensitiveBlockers = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
    ...envArgs(args),
  ])
  const fullAppSensitiveBlockers = runJson("full_app_sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    ...envArgs(args),
  ])
  const actionAuthorization = runJson("action_authorization", [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--backend-only",
    ...envArgs(args),
  ])
  const resourcesMatrix = runJson("resources_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    ...envArgs(args),
  ])
  const consoleRunbook = runJson("console_runbook", [
    "scripts/generate-aliyun-console-runbook.mjs",
    ...envArgs(args),
  ])
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
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
  const envSourceMap = runJson("env_source_map", [
    "scripts/summarize-aliyun-env-source-map.mjs",
    "--env-file",
    args.envFile,
    ...(args.vercelEnvCoverageReport
      ? ["--vercel-env-coverage-report", args.vercelEnvCoverageReport]
      : []),
    ...(args.vercelEnvCoverageInput && !args.vercelEnvCoverageReport
      ? ["--vercel-env-coverage-input", args.vercelEnvCoverageInput]
      : []),
    ...(args.skipVercelEnvCoverage && !args.vercelEnvCoverageReport
      ? ["--skip-vercel-env-coverage"]
      : []),
  ])

  const requiredEnvBlockers = extractRequiredEnvBlockers(sensitiveBlockers)
  const sensitiveBlockerSummaries = compactSensitiveBlockers(sensitiveBlockers)
  const fullAppSensitiveBlockerSummaries = compactSensitiveBlockers(fullAppSensitiveBlockers)
  const currentSensitiveBlockerSummaries = sensitiveBlockerSummaries
    .filter((item) => !APP_LAUNCH_SENSITIVE_BLOCKER_IDS.has(item.id))
  const deferredAppLaunchSensitiveBlockerSummaries = fullAppSensitiveBlockerSummaries
    .filter((item) => APP_LAUNCH_SENSITIVE_BLOCKER_IDS.has(item.id))
  const blockedVariableAcquisitionPlan = buildBlockedVariableAcquisitionPlan(sensitiveBlockers, {
    deferredAppLaunchOnly: false,
  })
  const deferredAppLaunchVariableAcquisitionPlan = buildBlockedVariableAcquisitionPlan(fullAppSensitiveBlockers, {
    deferredAppLaunchOnly: true,
  })
  const readySecretEnvImportGroups = sensitiveBlockers.summary?.readySensitiveEnvVariableGroups || []
  const credentialInterventionBrief = sensitiveBlockers.credentialInterventionBrief
    || sensitiveBlockers.summary?.credentialInterventionBrief
    || {}
  const wechatOpenMobileApp = compactWechatOpenMobileApp(wechatOpenMobileAppPackage)
  const wechatCredentialBoundary = wechatOpenMobileApp.credentialBoundary
  const bridgeDataLayer = compactBridgeDataLayer(status.summary?.bridgeDataLayer || {})
  const cloudResourceObservations = compactCloudResourceObservations(resourcesMatrix)
  const nextActionSequencing = compactNextActionSequencing(completionAudit)
  const canStartNowWritebackPlan = compactCanStartNowWritebackPlan(consoleRunbook, imagePublishPlan)
  const cloudInventoryReadinessInterpretation = buildCloudInventoryReadinessInterpretation(status, cloudAccess)
  const envSourceMapSummary = compactEnvSourceMap(envSourceMap)
  const envSourceBlockedExternalScope = splitEnvSourceBlockedExternalRequired(envSourceMapSummary)
  const backendRequiredBlocking = backendStatus.summary?.backendRequiredBlocking || []
  const deferredAppLaunchBlocking = backendStatus.summary?.appLaunchDeferredBlocking || []
  const currentOperatorTasks = completionAudit.summary?.operatorTasks || status.summary?.operatorTasks || {}
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    backendOnly: args.backendOnly === true,
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    canDeployNow: status.canDeployNow === true,
    verdict: status.verdict || completionAudit.verdict || "blocked",
    currentAnswer: backendStatus.canDeployBackendNow === true
      ? "阿里云后端门禁接近可部署，但生产动作仍需动作时确认。"
      : "现在不能部署；当前只推进阿里云后端，微信/Android/Apple 发布项已延期，先补 RDS、ACR、OSS、SAE、DNS/HTTPS/ICP、env、SLS 和 smoke 证据。",
    summary: {
      currentScope: CURRENT_SCOPE,
      fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
      currentBackendScopeNote: "当前阿里云后端阻塞只看 requiredBlocking、machineBlocking、canStartNowConsoleTasks 和 canStartNowAuthorizationPackets；fullApp* 与 deferredAppLaunch* 只保留完整 App 发布延期上下文，不是当前后端部署阻塞。",
      requiredEnv: `${status.summary?.requiredReady || 0}/${status.summary?.requiredTotal || 0}`,
      requiredBlocking: backendRequiredBlocking,
      fullAppRequiredBlocking: status.summary?.requiredBlocking || [],
      deferredAppLaunchBlocking,
      backendTargetReady: backendStatus.summary?.backendTargetReady || "unknown",
      canProceedWithoutWechat: backendStatus.canProceedWithoutWechat === true,
      localCodeReady: status.summary?.localCodeReady === true,
      releaseEvidenceUsable: status.summary?.releaseEvidenceUsable === true,
      machineBlocking: (status.summary?.machineBlocking || [])
        .filter((item) => !APP_LAUNCH_MACHINE_BLOCKER_PATTERNS.some((pattern) => pattern.test(String(item)))),
      fullAppMachineBlocking: status.summary?.machineBlocking || [],
      manualBlockingCount: status.summary?.manualBlocking?.length || 0,
      bridgeDataLayerCurrent: bridgeDataLayer.current,
      bridgeDataLayerTarget: bridgeDataLayer.target,
      bridgeDataLayerStatus: bridgeDataLayer.status,
      rdsMigrationIncludedInThisRelease: bridgeDataLayer.rdsMigrationIncludedInThisRelease,
      rdsMigrationRequiredForFinalProductionCn: bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn,
      cloudResourceEvidenceReady: cloudResourceObservations.evidenceReady,
      cloudResourceObservedReady: cloudResourceObservations.observedStatuses.ready,
      cloudResourceObservedPartial: cloudResourceObservations.observedStatuses.partial,
      cloudResourceObservedBlocked: cloudResourceObservations.observedStatuses.blocked,
      cloudResourceObservedTotal: cloudResourceObservations.observedStatuses.total,
      cloudResourceBlockedIds: cloudResourceObservations.blockedIds,
      cloudResourceObservedPartialIds: cloudResourceObservations.observedPartialIds,
      cloudResourceObservedBlockedIds: cloudResourceObservations.observedBlockedIds,
      cloudResourceActionTimeConfirmations: cloudResourceObservations.actionTimeConfirmationRequired,
      canStartNowConsoleTasks: nextActionSequencing.canStartNowConsoleTasks,
      canStartNowWritebackTaskCount: canStartNowWritebackPlan.length,
      blockedByConsoleTaskDependencies: nextActionSequencing.blockedByConsoleTaskDependencies,
      canStartNowAuthorizationPackets: nextActionSequencing.canStartNowAuthorizationPackets,
      blockedByAuthorizationPacketDependencies: nextActionSequencing.blockedByAuthorizationPacketDependencies,
      cloudConfirmationsReady: `${status.summary?.cloudConfirmations?.ready || 0}/${status.summary?.cloudConfirmations?.total || 0}`,
      operatorTasksReady: `${currentOperatorTasks.ready || 0}/${currentOperatorTasks.total || 0}`,
      completion: {
        proved: completionAudit.summary?.proved || 0,
        blocked: completionAudit.summary?.blocked || 0,
        partial: completionAudit.summary?.partial || 0,
        requirements: completionAudit.summary?.requirements || 0,
      },
      sensitiveBlocked: `${sensitiveBlockers.summary?.blocked || 0}/${sensitiveBlockers.summary?.total || 0}`,
      sensitiveBlockedIds: currentSensitiveBlockerSummaries
        .filter((item) => item.status !== "ready")
        .map((item) => item.id),
      deferredAppLaunchSensitiveBlockedIds: deferredAppLaunchSensitiveBlockerSummaries
        .filter((item) => item.status !== "ready")
        .map((item) => item.id),
      requiredEnvBlockers: requiredEnvBlockers.map((item) => item.name),
      blockedCredentialCount: credentialInterventionBrief.blockedCredentialCount || 0,
      blockedCredentialNames: credentialInterventionBrief.blockedCredentialNames || [],
      readySecretEnvVariableCount: credentialInterventionBrief.readySecretEnvVariableCount || 0,
      readySecretEnvVariableNames: credentialInterventionBrief.readySecretEnvVariableNames || [],
      blockedVariableAcquisitionCount: blockedVariableAcquisitionPlan.length,
      deferredAppLaunchVariableAcquisitionCount: deferredAppLaunchVariableAcquisitionPlan.length,
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
      wechatAppLoginCredentialSource: wechatCredentialBoundary.appLoginCredentialSource,
      wechatMiniProgramCredentialsReusableForAppLogin: wechatCredentialBoundary.miniProgramCredentialsReusableForAppLogin,
      wechatMiniProgramCompatVariableNames: wechatCredentialBoundary.miniProgramCompatVariableNames,
      envSourceVercelRequiredCovered: envSourceMapSummary.vercelCoverage.requiredCovered,
      envSourceCanMigrateFromVercelProduction: envSourceMapSummary.canMigrateFromVercelProduction,
      envSourceAppAliyunOwnedNotInVercel: envSourceMapSummary.appAliyunOwnedNotInVercel,
      envSourceBlockedExternalRequired: args.backendOnly
        ? envSourceBlockedExternalScope.currentBackend
        : envSourceMapSummary.blockedExternalRequired,
      envSourceCurrentBackendBlockedExternalRequired: envSourceBlockedExternalScope.currentBackend,
      envSourceDeferredAppLaunchBlockedExternalRequired: envSourceBlockedExternalScope.deferredAppLaunch,
      envSourceBlockedExternalScopeNote: args.backendOnly
        ? "backend-only summary treats only currentBackend as current blockers; deferredAppLaunch remains full App launch context."
        : "full App summary includes current backend and deferred App launch external blockers.",
      envSourceReadyLocalButMissingFromVercel: envSourceMapSummary.readyLocalButMissingFromVercel,
      envSourceSecretOrSensitiveToImport: envSourceMapSummary.secretOrSensitiveToImport,
    },
    immediateAuthorizationPackets: actionAuthorization.nextActionTimeConfirmations || [],
    requiredEnvBlockers,
    blockedVariableAcquisitionPlan,
    deferredAppLaunchVariableAcquisitionPlan,
    readySecretEnvImportGroups,
    credentialInterventionBrief,
    wechatOpenMobileApp,
    wechatCredentialBoundary,
    envSourceMap: {
      ...envSourceMapSummary,
      blockedExternalScope: envSourceBlockedExternalScope,
    },
    bridgeDataLayer,
    cloudResourceObservations,
    nextActionSequencing,
    canStartNowWritebackPlan,
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

function compactNextActionSequencing(completionAudit) {
  const summary = completionAudit.summary || {}
  return {
    canStartNowConsoleTasks: summary.canStartNowConsoleTasks || [],
    blockedByConsoleTaskDependencies: summary.blockedByConsoleTaskDependencies || [],
    canStartNowAuthorizationPackets: summary.canStartNowAuthorizationPackets || [],
    blockedByAuthorizationPacketDependencies: summary.blockedByAuthorizationPacketDependencies || [],
    nextActionTimeConfirmations: (summary.nextActionTimeConfirmations || []).map((item) => ({
      packetId: item.packetId,
      actionId: item.actionId,
      title: item.title,
      owner: item.owner,
      sequenceGroup: item.sequenceGroup,
      minimumUserPhrase: item.minimumUserPhrase,
      nonSecretEvidenceOnly: item.nonSecretEvidenceOnly === true,
      writeTargets: item.writeTargets || [],
      verifyCommands: item.verifyCommands || [],
      explicitlyExcluded: item.explicitlyExcluded || [],
    })),
  }
}

function compactCanStartNowWritebackPlan(consoleRunbook, imagePublishPlan) {
  const imageGroups = new Map((imagePublishPlan.writebackPlan?.groups || []).map((group) => [group.id, group]))
  return (consoleRunbook.consoleTasks || [])
    .filter((task) => task.canStartNow === true)
    .map((task) => {
      const imageGroup = task.id === "C02_ACR_IMAGE_AND_PULL"
        ? imageGroups.get("acrPurchaseAndRepository")
        : null
      const deferredGroups = task.id === "C02_ACR_IMAGE_AND_PULL"
        ? ["imagePushAndDigest", "saeRuntimeImagePull"]
          .map((id) => imageGroups.get(id))
          .filter(Boolean)
        : []
      const writeTargets = imageGroup?.writeTargets?.length
        ? imageGroup.writeTargets
        : task.writeTargets || []
      const acceptanceEvidence = imageGroup?.expectedEvidence?.length
        ? imageGroup.expectedEvidence
        : (task.currentActionAcceptanceEvidence?.length
          ? task.currentActionAcceptanceEvidence
          : task.completionEvidence || [])
      const forbidden = uniqueStrings([
        ...(imageGroup?.forbidden || []),
        ...(task.forbidden || []),
      ])
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        currentActionScope: imageGroup?.actionScope || task.currentActionScope || "full_task",
        requiresActionTimeConfirmation: task.requiresActionTimeConfirmation === true,
        nonSecretEvidenceOnly: imageGroup
          ? imageGroup.nonSecretEvidenceOnly === true
          : false,
        consolePath: task.consolePath || "",
        targetFields: (task.targetFields || []).map((field) => ({
          name: field.name,
          value: field.value,
          source: field.source,
        })),
        writeTargets,
        nonSecretFieldsToRecord: task.nonSecretFieldsToRecord || [],
        acceptanceEvidence,
        currentBlockers: (imageGroup?.blockers?.length ? imageGroup.blockers : task.currentBlockers || []).slice(0, 12),
        deferredWritebackGroups: deferredGroups.map((group) => ({
          id: group.id,
          actionScope: group.actionScope,
          requiredAuthorizationPackets: group.requiredAuthorizationPackets || [],
          blockers: group.blockers || [],
          writeTargets: group.writeTargets || [],
          verifyCommands: group.verifyCommands || [],
        })),
        deferredActions: task.deferredActions || [],
        forbidden,
        verifyCommands: imageGroup?.verifyCommands?.length
          ? imageGroup.verifyCommands
          : task.verifyCommands || [],
      }
    })
}

function compactCloudResourceObservations(resourcesMatrix) {
  const summary = resourcesMatrix.summary || {}
  const observedStatuses = summary.observedResourceStatuses || {}
  const items = (resourcesMatrix.resources || []).map((item) => {
    const observed = item.observedResourceStatus || {}
    return {
      id: item.id,
      title: item.title,
      status: item.status,
      ready: item.ready === true,
      requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
      observedStatus: observed.status || "unknown",
      observedReadiness: observed.readiness || "unknown",
      observed: observed.observed === true,
      currentObservation: observed.currentObservation || "",
      nextAction: observed.nextAction || "",
      writeTarget: observed.writeTarget || "",
      currentLocalEvidence: item.currentLocalEvidence || "",
      blockers: (item.blockers || []).slice(0, 8),
    }
  })
  return {
    evidenceReady: summary.resourceEvidenceReady || `${summary.ready || 0}/${summary.total || 0}`,
    total: summary.total || 0,
    ready: summary.ready || 0,
    blocked: summary.blocked || 0,
    blockedIds: summary.blockedIds || [],
    actionTimeConfirmationRequired: summary.actionTimeConfirmationRequired || [],
    cloudConfirmationsTotalBlockers: summary.cloudConfirmationsTotalBlockers || 0,
    imagePublishTotalBlockers: summary.imagePublishTotalBlockers || 0,
    cloudAccessCanReadNow: summary.cloudAccessCanReadNow === true,
    observedStatuses: {
      total: observedStatuses.total || 0,
      ready: observedStatuses.ready || 0,
      partial: observedStatuses.partial || 0,
      blocked: observedStatuses.blocked || 0,
      observed: observedStatuses.observed || 0,
      notObserved: observedStatuses.notObserved || 0,
      blockedIds: observedStatuses.blockedIds || [],
    },
    observedReadyIds: items
      .filter((item) => item.observedReadiness === "ready")
      .map((item) => item.id),
    observedPartialIds: items
      .filter((item) => item.observedReadiness === "partial")
      .map((item) => item.id),
    observedBlockedIds: items
      .filter((item) => item.observedReadiness === "blocked")
      .map((item) => item.id),
    observedNotReadyIds: items
      .filter((item) => item.observedReadiness !== "ready")
      .map((item) => item.id),
    items,
  }
}

function compactBridgeDataLayer(bridge = {}) {
  return {
    current: bridge.current || "unknown",
    target: bridge.target || "unknown",
    status: bridge.status || "unknown",
    firstBridgeDeploymentUses: bridge.firstBridgeDeploymentUses || "unknown",
    supabaseBridgeReady: bridge.supabaseBridgeReady === true,
    supabaseSourceReady: bridge.supabaseSourceReady === true,
    supabaseKeys: bridge.supabaseKeys || [],
    databaseUrlCnStatus: bridge.databaseUrlCnStatus || "unknown",
    redisUrlCnStatus: bridge.redisUrlCnStatus || "unknown",
    rdsMigrationIncludedInThisRelease: bridge.rdsMigrationIncludedInThisRelease === true,
    rdsMigrationRequiredForFinalProductionCn: bridge.rdsMigrationRequiredForFinalProductionCn === true,
    notes: bridge.notes || [],
  }
}

function compactWechatOpenMobileApp(report) {
  const summary = report.summary || {}
  const packageInfo = report.mobileAppCreationPackage || {}
  const android = packageInfo.android || {}
  const androidSignaturePackage = packageInfo.androidSignaturePackage || {}
  const ios = packageInfo.ios || {}
  const actionPacket = report.actionPacket || {}
  const credentialBoundary = compactWechatCredentialBoundary(report.credentialBoundary || {})
  return {
    accountVerified: summary.accountVerified === true,
    mobileAppCreated: summary.mobileAppCreated === true,
    mobileAppSubmitted: summary.mobileAppSubmitted === true,
    reviewStatus: summary.reviewStatus || "unknown",
    canCreateDraftInWechatOpenPlatform: summary.canCreateDraftInWechatOpenPlatform === true,
    readyToSubmitForReview: summary.readyToSubmitForReview === true,
    submissionBlockers: summary.submissionBlockers || [],
    mobileAppCredentialsAvailable: summary.mobileAppCredentialsAvailable === true,
    miniProgramCredentialsReusableForAppLogin: summary.miniProgramCredentialsReusableForAppLogin === true,
    appLoginCredentialSource: summary.appLoginCredentialSource || credentialBoundary.appLoginCredentialSource,
    credentialBoundary,
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

function compactWechatCredentialBoundary(boundary) {
  return {
    purpose: boundary.purpose || "APP 微信登录服务端凭证边界",
    appLoginCredentialSource: boundary.appLoginCredentialSource || "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App -> 开发信息",
    appLoginVariableNames: boundary.appLoginVariableNames || [
      "WECHAT_OPEN_APP_ID",
      "WECHAT_OPEN_APP_SECRET",
      "WECHAT_OPEN_APP_REVIEW_STATUS",
    ],
    appLoginImportTargets: boundary.appLoginImportTargets || [
      "WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env",
      "WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env",
      "WECHAT_OPEN_APP_REVIEW_STATUS -> 阿里云 SAE plain env",
    ],
    miniProgramCredentialSource: boundary.miniProgramCredentialSource || "微信公众平台小程序 -> 开发管理 -> 开发设置",
    miniProgramCompatVariableNames: boundary.miniProgramCompatVariableNames || [
      "WECHAT_MINI_APPID",
      "WECHAT_MINI_SECRET",
      "WECHAT_LOGIN_SECRET",
    ],
    miniProgramCredentialsReusableForAppLogin: boundary.miniProgramCredentialsReusableForAppLogin === true,
    miniProgramCompatibilityUse: boundary.miniProgramCompatibilityUse || "仅用于旧小程序/兼容后端链路，不能用于 React Native APP 微信开放平台移动应用登录。",
    aliyunRuntimeUse: boundary.aliyunRuntimeUse || "阿里云 SAE 后端在 APP 微信登录回调中使用移动应用 AppID/AppSecret 调微信登录接口；React Native APP 包内不内置 AppSecret。",
    whyNotReusable: boundary.whyNotReusable || [
      "微信开放平台移动应用和微信小程序是不同应用类型，AppID/AppSecret 不是同一套凭证。",
      "小程序 WECHAT_MINI_* 可以保留给旧小程序 API 兼容，但不能解除 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET 阻塞。",
      "移动应用审核通过前不能把 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET 标记为 ready。",
    ],
    forbidden: boundary.forbidden || [
      "不能用小程序 AppID/Secret 替代移动应用 AppID/AppSecret。",
      "不能把 WECHAT_OPEN_APP_SECRET 写入 App 包、JSON、Markdown、Docker 镜像或 git。",
      "不能在移动应用未审核通过前把 APP 登录凭证导入为生产 ready。",
    ],
  }
}

function compactEnvSourceMap(report = {}) {
  const summary = report.summary || {}
  const vercelCoverage = report.vercelCoverage || {}
  const groups = report.groups || {}
  return {
    ok: report.ok === true,
    containsValues: report.containsValues === true,
    total: summary.total || 0,
    requiredReady: summary.requiredReady || "unknown",
    requiredBlocking: summary.requiredBlocking || [],
    appLaunchBlocking: summary.appLaunchBlocking || [],
    vercelCoverageStatus: summary.vercelCoverageStatus || "unknown",
    canMigrateFromVercelProduction: summary.canMigrateFromVercelProduction || 0,
    appAliyunOwnedNotInVercel: summary.appAliyunOwnedNotInVercel || 0,
    blockedExternalRequired: summary.blockedExternalRequired || [],
    readyLocalButMissingFromVercel: summary.readyLocalButMissingFromVercel || [],
    miniProgramCompatOnly: summary.miniProgramCompatOnly || [],
    deferredOptional: summary.deferredOptional || 0,
    secretOrSensitiveToImport: summary.secretOrSensitiveToImport || 0,
    requiredMissingInVercelProduction: summary.requiredMissingInVercelProduction || [],
    appSpecificMissingInVercelProduction: summary.appSpecificMissingInVercelProduction || [],
    vercelCoverage: {
      ok: vercelCoverage.ok === true,
      skipped: vercelCoverage.skipped === true,
      source: vercelCoverage.source || "",
      project: vercelCoverage.project || "",
      scope: vercelCoverage.scope || "",
      environment: vercelCoverage.environment || "",
      requiredCovered: vercelCoverage.requiredCovered || summary.vercelRequiredCovered || "unknown",
      productionNames: vercelCoverage.productionNames || "unknown",
      requiredMissingInVercelProduction: vercelCoverage.requiredMissingInVercelProduction || [],
      appSpecificKeysMissingInVercelProduction: vercelCoverage.appSpecificKeysMissingInVercelProduction || [],
      bridgeKeysPresentInVercelProduction: vercelCoverage.bridgeKeysPresentInVercelProduction || [],
      error: vercelCoverage.error || "",
    },
    groups: {
      migrateFromVercelProduction: compactEnvSourceNameGroup(groups.migrateFromVercelProduction),
      appAliyunOwnedNotInVercel: compactEnvSourceNameGroup(groups.appAliyunOwnedNotInVercel),
      blockedExternalRequired: compactEnvSourceVariables(groups.blockedExternalRequired),
      readyLocalButMissingFromVercel: compactEnvSourceVariables(groups.readyLocalButMissingFromVercel),
      miniProgramCompatOnly: compactEnvSourceVariables(groups.miniProgramCompatOnly),
      deferredOptional: compactEnvSourceNameGroup(groups.deferredOptional),
    },
  }
}

function splitEnvSourceBlockedExternalRequired(envSourceMapSummary = {}) {
  const names = envSourceMapSummary.blockedExternalRequired || []
  const currentBackend = []
  const deferredAppLaunch = []
  for (const name of names) {
    if (isDeferredAppLaunchEnvSourceName(name)) {
      deferredAppLaunch.push(name)
    } else {
      currentBackend.push(name)
    }
  }
  return {
    currentBackend,
    deferredAppLaunch,
    all: names,
  }
}

function isDeferredAppLaunchEnvSourceName(name) {
  return APP_LAUNCH_REQUIRED_NAMES.has(name)
    || APP_LAUNCH_VARIABLE_PATTERNS.some((pattern) => pattern.test(String(name || "")))
}

function compactEnvSourceNameGroup(items = []) {
  return {
    count: items.length,
    variableNames: items.map((item) => item.name).filter(Boolean),
  }
}

function compactEnvSourceVariables(items = []) {
  return items.map((item) => ({
    name: item.name,
    required: item.required === true,
    status: item.status,
    sensitivity: item.sensitivity,
    sourceCategory: item.sourceCategory,
    owner: item.owner,
    consolePath: item.consolePath,
    obtain: item.obtain,
    importTarget: item.importTarget,
    cloudConfirmationKey: item.cloudConfirmationKey,
    vercelProductionNameStatus: item.vercelProductionNameStatus,
    sourceDecision: item.sourceDecision,
    action: item.action,
    forbidden: item.forbidden,
  }))
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
  S08_ALIYUN_RDS_DATABASE_URL: Object.freeze(["P11_ALIYUN_RDS_DATA_MIGRATION"]),
})

function buildBlockedVariableAcquisitionPlan(sensitiveBlockers, options = {}) {
  const blockedCredentialNames = new Set(
    sensitiveBlockers.credentialInterventionBrief?.blockedCredentialNames
    || sensitiveBlockers.summary?.credentialInterventionBrief?.blockedCredentialNames
    || [],
  )
  return (sensitiveBlockers.items || []).flatMap((item) => {
    const packetIds = SENSITIVE_BLOCKER_TO_PACKET_IDS[item.id] || []
    return (item.variableDetails || [])
      .filter((variable) => variable.status !== "ready")
      .filter((variable) => blockedCredentialNames.size === 0 || blockedCredentialNames.has(variable.name))
      .filter((variable) => {
        const deferred = isDeferredAppLaunchVariable(item, variable)
        return options.deferredAppLaunchOnly ? deferred : !deferred
      })
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

function isDeferredAppLaunchVariable(item, variable) {
  return APP_LAUNCH_SENSITIVE_BLOCKER_IDS.has(item.id)
    || APP_LAUNCH_REQUIRED_NAMES.has(variable.name)
    || APP_LAUNCH_VARIABLE_PATTERNS.some((pattern) => pattern.test(String(variable.name || "")))
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
    .filter((item) => !APP_LAUNCH_SENSITIVE_BLOCKER_IDS.has(item.id))
    .flatMap((item) => item.variableDetails || [])
  return variableDetails
    .filter((item) => !APP_LAUNCH_REQUIRED_NAMES.has(item.name) && item.required === true && item.status !== "ready")
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

function renderBackendOnlyMarkdown(report) {
  const immediatePacketIds = new Set(report.summary.immediateAuthorizationPackets || [])
  const immediatePackets = report.nextActionSequencing.nextActionTimeConfirmations
    .filter((item) => immediatePacketIds.has(item.packetId))

  return [
    "# 美业话镜 APP production-cn 阿里云后端-only 当前执行简报",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- currentScope: ${report.currentScope}`,
    `- backendOnly: ${report.backendOnly}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- canProceedWithoutWechat: ${report.summary.canProceedWithoutWechat}`,
    `- backendTargetReady: ${report.summary.backendTargetReady}`,
    `- cloudResourceEvidenceReady: ${report.summary.cloudResourceEvidenceReady}`,
    `- cloudConfirmationsReady: ${report.summary.cloudConfirmationsReady}`,
    `- operatorTasksReady: ${report.summary.operatorTasksReady}`,
    `- sensitiveBlocked: ${report.summary.sensitiveBlocked}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- blockedCredentialNames: ${report.summary.blockedCredentialNames.join(", ") || "none"}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    "",
    "## 当前只做",
    "",
    "- 阿里云后端：RDS/ACR/OSS/SAE/DNS/HTTPS/ICP/env/SLS/smoke。",
    "- 数据库目标：阿里云 RDS PostgreSQL；Supabase 只作为迁移来源或旧链路兼容，不是正式国内生产数据库目标。",
    "- 资源证据写回只记录非密钥字段、资源名、布尔值、时间和 evidence handle。",
    "",
    "## 当前不做",
    "",
    "- 移动应用开放平台、Android 签名、Apple Team ID：延期到后端上线后，不在本后端清单中展开。",
    "- 不购买、不创建云资源、不导入密钥、不推送镜像、不部署 production-cn、不 git push，除非有动作时授权。",
    "",
    "## 状态来源与一致性",
    "",
    "- 主门禁来源：`corepack pnpm aliyun:backend-cn:status`，用于判断 `canDeployBackendNow`、`backendTargetReady`、后端 requiredBlocking 和当前后端 credential 摘要。",
    "- 密钥/密码字段来源：`corepack pnpm aliyun:sensitive:blockers:backend`，用于列出 `DATABASE_URL_CN`、已 ready 但仍需导入阿里云 secret env 的变量、获取位置、导入目标和禁止写入位置。",
    "- 本简报来源：`corepack pnpm aliyun:blockers:brief:backend`，只聚合本地 value-free 证据，不调用阿里云写 API，不购买、不创建、不导入、不部署。",
    "",
    "## 后端阻塞",
    "",
    `- requiredBlocking: ${report.summary.requiredBlocking.join(", ") || "none"}`,
    `- machineBlocking: ${report.summary.machineBlocking.join(", ") || "none"}`,
    `- cloudResourceObservedPartialIds: ${report.summary.cloudResourceObservedPartialIds.join(", ") || "none"}`,
    `- cloudResourceObservedBlockedIds: ${report.summary.cloudResourceObservedBlockedIds.join(", ") || "none"}`,
    `- sensitiveBlockedIds: ${report.summary.sensitiveBlockedIds.join(", ") || "none"}`,
    `- canStartNowConsoleTasks: ${report.summary.canStartNowConsoleTasks.join(", ") || "none"}`,
    `- canStartNowAuthorizationPackets: ${report.summary.canStartNowAuthorizationPackets.join(", ") || "none"}`,
    `- blockedByAuthorizationPacketDependencies: ${report.summary.blockedByAuthorizationPacketDependencies.join(", ") || "none"}`,
    "",
    "## 数据层边界",
    "",
    `- current: ${report.bridgeDataLayer.current}`,
    `- target: ${report.bridgeDataLayer.target}`,
    `- status: ${report.bridgeDataLayer.status}`,
    `- databaseUrlCnStatus: ${report.bridgeDataLayer.databaseUrlCnStatus}`,
    `- rdsMigrationIncludedInThisRelease: ${report.bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    "- notes:",
    ...(report.bridgeDataLayer.notes.length ? report.bridgeDataLayer.notes.map((item) => `  - ${item}`) : ["  - none"]),
    "",
    "## 阿里云资源状态",
    "",
    "| 资源 | ready | 观察状态 | 观察成熟度 | 下一步 | 写入目标 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.cloudResourceObservations.items.map((item) => [
      codeCell(item.id),
      item.ready ? "true" : "false",
      escapeTableCell(item.observedStatus),
      escapeTableCell(item.observedReadiness),
      escapeTableCell(item.nextAction),
      escapeTableCell(item.writeTarget),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## 现在需要动作时确认的后端授权包",
    "",
    ...(immediatePackets.length
      ? immediatePackets.flatMap(renderPacket)
      : ["- none", ""]),
    "## 当前可回填的后端证据",
    "",
    ...(report.canStartNowWritebackPlan.length
      ? report.canStartNowWritebackPlan.flatMap(renderWritebackTask)
      : ["- none", ""]),
    "## 还缺的变量获取与导入",
    "",
    "- 真实 value 只能进入阿里云 KMS/Secrets Manager/SAE secret env，不能写入报告、JSON、Docker 镜像或 git。",
    "",
    ...renderBlockedVariableAcquisitionPlan(report.blockedVariableAcquisitionPlan),
    "## 已 ready 但仍需导入阿里云 secret env",
    "",
    `- groupCount: ${report.summary.readySecretEnvImportGroupCount}`,
    `- variableCount: ${report.summary.readySecretEnvVariableCount}`,
    "- 这些值只在动作时由受控渠道导入阿里云运行环境，本简报不展开真实值。",
    "",
    "## 环境变量来源概览",
    "",
    `- vercelRequiredCovered: ${report.summary.envSourceVercelRequiredCovered}`,
    `- canMigrateFromVercelProduction: ${report.summary.envSourceCanMigrateFromVercelProduction}`,
    `- appAliyunOwnedNotInVercel: ${report.summary.envSourceAppAliyunOwnedNotInVercel}`,
    `- currentBackendBlockedExternalRequired: ${report.summary.envSourceCurrentBackendBlockedExternalRequired.join(", ") || "none"}`,
    `- deferredAppLaunchBlockedExternalRequiredCount: ${report.summary.envSourceDeferredAppLaunchBlockedExternalRequired.length}`,
    `- scopeNote: ${report.summary.envSourceBlockedExternalScopeNote}`,
    `- secretOrSensitiveToImport: ${report.summary.envSourceSecretOrSensitiveToImport}`,
    "",
    "## CloudShell / CLI 只读盘点",
    "",
    `- interpretation: ${report.cloudInventoryReadinessInterpretation.interpretation}`,
    `- strictInventoryEvidenceReady: ${report.cloudInventoryReadinessInterpretation.strictInventoryEvidenceReady}`,
    `- freshCloudReadAvailableNow: ${report.cloudInventoryReadinessInterpretation.freshCloudReadAvailableNow}`,
    `- currentCliProfileReady: ${report.cloudInventoryReadinessInterpretation.currentCliProfileReady}`,
    `- currentBrowserConsoleUsable: ${report.cloudInventoryReadinessInterpretation.currentBrowserConsoleUsable}`,
    `- notACloudResourceReadyProof: ${report.cloudInventoryReadinessInterpretation.notACloudResourceReadyProof}`,
    `- nextEvidenceAction: ${report.cloudInventoryReadinessInterpretation.nextEvidenceAction}`,
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

function renderMarkdown(report) {
  if (report.backendOnly === true) return renderBackendOnlyMarkdown(report)

  return [
    "# 美业话镜 APP production-cn 当前阻塞简报",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- verdict: ${report.verdict}`,
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
    `- currentBackendScopeNote: ${report.summary.currentBackendScopeNote}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- canProceedWithoutWechat: ${report.summary.canProceedWithoutWechat}`,
    `- backendTargetReady: ${report.summary.backendTargetReady}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- requiredEnv: ${report.summary.requiredEnv}`,
    `- requiredBlocking: ${report.summary.requiredBlocking.join(", ") || "none"}`,
    `- fullAppRequiredBlocking: ${report.summary.fullAppRequiredBlocking.join(", ") || "none"}`,
    `- deferredAppLaunchBlocking: ${report.summary.deferredAppLaunchBlocking.join(", ") || "none"}`,
    `- localCodeReady: ${report.summary.localCodeReady}`,
    `- releaseEvidenceUsable: ${report.summary.releaseEvidenceUsable}`,
    `- machineBlocking: ${report.summary.machineBlocking.join(", ") || "none"}`,
    `- fullAppMachineBlocking: ${report.summary.fullAppMachineBlocking.join(", ") || "none"}`,
    `- manualBlockingCount: ${report.summary.manualBlockingCount}`,
    `- bridgeDataLayerCurrent: ${report.summary.bridgeDataLayerCurrent}`,
    `- bridgeDataLayerTarget: ${report.summary.bridgeDataLayerTarget}`,
    `- bridgeDataLayerStatus: ${report.summary.bridgeDataLayerStatus}`,
    `- rdsMigrationIncludedInThisRelease: ${report.summary.rdsMigrationIncludedInThisRelease}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${report.summary.rdsMigrationRequiredForFinalProductionCn}`,
    `- cloudResourceEvidenceReady: ${report.summary.cloudResourceEvidenceReady}`,
    `- cloudResourceObserved: ready ${report.summary.cloudResourceObservedReady}/${report.summary.cloudResourceObservedTotal}, partial ${report.summary.cloudResourceObservedPartial}, blocked ${report.summary.cloudResourceObservedBlocked}`,
    `- cloudResourceBlockedIds: ${report.summary.cloudResourceBlockedIds.join(", ") || "none"}`,
    `- cloudResourceObservedPartialIds: ${report.summary.cloudResourceObservedPartialIds.join(", ") || "none"}`,
    `- cloudResourceObservedBlockedIds: ${report.summary.cloudResourceObservedBlockedIds.join(", ") || "none"}`,
    `- cloudResourceActionTimeConfirmations: ${report.summary.cloudResourceActionTimeConfirmations.join(", ") || "none"}`,
    `- canStartNowConsoleTasks: ${report.summary.canStartNowConsoleTasks.join(", ") || "none"}`,
    `- canStartNowWritebackTaskCount: ${report.summary.canStartNowWritebackTaskCount}`,
    `- blockedByConsoleTaskDependencies: ${report.summary.blockedByConsoleTaskDependencies.join(", ") || "none"}`,
    `- canStartNowAuthorizationPackets: ${report.summary.canStartNowAuthorizationPackets.join(", ") || "none"}`,
    `- blockedByAuthorizationPacketDependencies: ${report.summary.blockedByAuthorizationPacketDependencies.join(", ") || "none"}`,
    `- cloudConfirmationsReady: ${report.summary.cloudConfirmationsReady}`,
    `- operatorTasksReady: ${report.summary.operatorTasksReady}`,
    `- completion: proved ${report.summary.completion.proved}/${report.summary.completion.requirements}, blocked ${report.summary.completion.blocked}, partial ${report.summary.completion.partial}`,
    `- sensitiveBlocked: ${report.summary.sensitiveBlocked}`,
    `- sensitiveBlockedIds: ${report.summary.sensitiveBlockedIds.join(", ") || "none"}`,
    `- deferredAppLaunchSensitiveBlockedIds: ${report.summary.deferredAppLaunchSensitiveBlockedIds.join(", ") || "none"}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- blockedVariableAcquisitionCount: ${report.summary.blockedVariableAcquisitionCount}`,
    `- deferredAppLaunchVariableAcquisitionCount: ${report.summary.deferredAppLaunchVariableAcquisitionCount}`,
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
    `- wechatAppLoginCredentialSource: ${report.summary.wechatAppLoginCredentialSource}`,
    `- wechatMiniProgramCredentialsReusableForAppLogin: ${report.summary.wechatMiniProgramCredentialsReusableForAppLogin}`,
    `- wechatMiniProgramCompatVariableNames: ${report.summary.wechatMiniProgramCompatVariableNames.join(", ") || "none"}`,
    `- envSourceVercelRequiredCovered: ${report.summary.envSourceVercelRequiredCovered}`,
    `- envSourceCanMigrateFromVercelProduction: ${report.summary.envSourceCanMigrateFromVercelProduction}`,
    `- envSourceAppAliyunOwnedNotInVercel: ${report.summary.envSourceAppAliyunOwnedNotInVercel}`,
    `- envSourceBlockedExternalRequired: ${report.summary.envSourceBlockedExternalRequired.join(", ") || "none"}`,
    `- envSourceReadyLocalButMissingFromVercel: ${report.summary.envSourceReadyLocalButMissingFromVercel.join(", ") || "none"}`,
    `- envSourceSecretOrSensitiveToImport: ${report.summary.envSourceSecretOrSensitiveToImport}`,
    "",
    "## 当前口径说明",
    "",
    "- 当前目标只补阿里云后端：RDS/ACR/OSS/SAE/DNS/HTTPS/ICP/env/SLS/smoke。",
    "- 当前后端阻塞只看 `requiredBlocking`、`machineBlocking`、`canStartNowConsoleTasks`、`canStartNowAuthorizationPackets`。",
    "- `fullAppRequiredBlocking`、`fullAppMachineBlocking`、`deferredAppLaunchBlocking` 是完整 App 发布延期上下文；微信开放平台移动应用、Android 签名、Apple Team ID 不属于当前阿里云后端补齐目标。",
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
    "## APP 微信登录凭证边界",
    "",
    `- purpose: ${report.wechatCredentialBoundary.purpose}`,
    `- appLoginCredentialSource: ${report.wechatCredentialBoundary.appLoginCredentialSource}`,
    `- appLoginVariableNames: ${report.wechatCredentialBoundary.appLoginVariableNames.join(", ")}`,
    `- appLoginImportTargets: ${report.wechatCredentialBoundary.appLoginImportTargets.join("; ")}`,
    `- miniProgramCredentialSource: ${report.wechatCredentialBoundary.miniProgramCredentialSource}`,
    `- miniProgramCompatVariableNames: ${report.wechatCredentialBoundary.miniProgramCompatVariableNames.join(", ")}`,
    `- miniProgramCredentialsReusableForAppLogin: ${report.wechatCredentialBoundary.miniProgramCredentialsReusableForAppLogin}`,
    `- miniProgramCompatibilityUse: ${report.wechatCredentialBoundary.miniProgramCompatibilityUse}`,
    `- aliyunRuntimeUse: ${report.wechatCredentialBoundary.aliyunRuntimeUse}`,
    "- whyNotReusable:",
    ...report.wechatCredentialBoundary.whyNotReusable.map((item) => `  - ${item}`),
    "- forbidden:",
    ...report.wechatCredentialBoundary.forbidden.map((item) => `  - ${item}`),
    "",
    "## 环境变量来源与 Vercel 覆盖",
    "",
    ...renderEnvSourceMap(report.envSourceMap),
    "## 数据层边界",
    "",
    `- current: ${report.bridgeDataLayer.current}`,
    `- target: ${report.bridgeDataLayer.target}`,
    `- status: ${report.bridgeDataLayer.status}`,
    `- firstBridgeDeploymentUses: ${report.bridgeDataLayer.firstBridgeDeploymentUses}`,
    `- supabaseBridgeReady: ${report.bridgeDataLayer.supabaseBridgeReady}`,
    `- supabaseKeys: ${report.bridgeDataLayer.supabaseKeys.join(", ") || "none"}`,
    `- databaseUrlCnStatus: ${report.bridgeDataLayer.databaseUrlCnStatus}`,
    `- redisUrlCnStatus: ${report.bridgeDataLayer.redisUrlCnStatus}`,
    `- rdsMigrationIncludedInThisRelease: ${report.bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    "- notes:",
    ...(report.bridgeDataLayer.notes.length ? report.bridgeDataLayer.notes.map((item) => `  - ${item}`) : ["  - none"]),
    "",
    "## 阿里云资源观察结果",
    "",
    `- evidenceReady: ${report.cloudResourceObservations.evidenceReady}`,
    `- matrixReady: ${report.cloudResourceObservations.ready}/${report.cloudResourceObservations.total}`,
    `- matrixBlocked: ${report.cloudResourceObservations.blocked}`,
    `- observedReady: ${report.cloudResourceObservations.observedStatuses.ready}/${report.cloudResourceObservations.observedStatuses.total}`,
    `- observedPartial: ${report.cloudResourceObservations.observedStatuses.partial}`,
    `- observedBlocked: ${report.cloudResourceObservations.observedStatuses.blocked}`,
    `- observedPartialIds: ${report.cloudResourceObservations.observedPartialIds.join(", ") || "none"}`,
    `- observedBlockedIds: ${report.cloudResourceObservations.observedBlockedIds.join(", ") || "none"}`,
    `- observedNotReadyIds: ${report.cloudResourceObservations.observedNotReadyIds.join(", ") || "none"}`,
    `- observedCount: ${report.cloudResourceObservations.observedStatuses.observed}`,
    `- notObservedCount: ${report.cloudResourceObservations.observedStatuses.notObserved}`,
    `- cloudConfirmationsTotalBlockers: ${report.cloudResourceObservations.cloudConfirmationsTotalBlockers}`,
    `- imagePublishTotalBlockers: ${report.cloudResourceObservations.imagePublishTotalBlockers}`,
    `- actionTimeConfirmationRequired: ${report.cloudResourceObservations.actionTimeConfirmationRequired.join(", ") || "none"}`,
    "",
    "| 资源 | ready | 观察状态 | 观察成熟度 | 动作时确认 | 下一步 | 写入目标 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.cloudResourceObservations.items.map((item) => [
      codeCell(item.id),
      item.ready ? "true" : "false",
      escapeTableCell(item.observedStatus),
      escapeTableCell(item.observedReadiness),
      item.requiresActionTimeConfirmation ? "true" : "false",
      escapeTableCell(item.nextAction),
      escapeTableCell(item.writeTarget),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## 下一步动作排序",
    "",
    `- canStartNowConsoleTasks: ${report.nextActionSequencing.canStartNowConsoleTasks.join(", ") || "none"}`,
    `- blockedByConsoleTaskDependencies: ${report.nextActionSequencing.blockedByConsoleTaskDependencies.join(", ") || "none"}`,
    `- canStartNowAuthorizationPackets: ${report.nextActionSequencing.canStartNowAuthorizationPackets.join(", ") || "none"}`,
    `- blockedByAuthorizationPacketDependencies: ${report.nextActionSequencing.blockedByAuthorizationPacketDependencies.join(", ") || "none"}`,
    "",
    "| 授权包 | 动作 | owner | 最小确认语 | 非密钥证据 |",
    "| --- | --- | --- | --- | --- |",
    ...(report.nextActionSequencing.nextActionTimeConfirmations.length
      ? report.nextActionSequencing.nextActionTimeConfirmations.map((item) => [
        codeCell(item.packetId),
        escapeTableCell(item.title),
        escapeTableCell(item.owner),
        escapeTableCell(item.minimumUserPhrase),
        item.nonSecretEvidenceOnly ? "true" : "false",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
      : ["| none | none | none | none | none |"]),
    "",
    "## 当前可做动作回填清单",
    "",
    ...(report.canStartNowWritebackPlan.length
      ? report.canStartNowWritebackPlan.flatMap(renderWritebackTask)
      : ["- none", ""]),
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
    "## 当前后端阻塞变量获取与导入计划",
    "",
    ...renderBlockedVariableAcquisitionPlan(report.blockedVariableAcquisitionPlan),
    "## 延期的完整 APP 发布变量",
    "",
    ...renderBlockedVariableAcquisitionPlan(report.deferredAppLaunchVariableAcquisitionPlan),
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

function renderEnvSourceMap(envSourceMap) {
  if (!envSourceMap) return ["- none", ""]
  const vercel = envSourceMap.vercelCoverage || {}
  return [
    `- total: ${envSourceMap.total}`,
    `- requiredReady: ${envSourceMap.requiredReady}`,
    `- requiredBlocking: ${envSourceMap.requiredBlocking.join(", ") || "none"}`,
    `- appLaunchBlocking: ${envSourceMap.appLaunchBlocking.join(", ") || "none"}`,
    `- vercelCoverageStatus: ${envSourceMap.vercelCoverageStatus}`,
    `- vercelCoverageOk: ${vercel.ok === true}`,
    `- vercelProject: ${vercel.project || "unknown"}`,
    `- vercelEnvironment: ${vercel.environment || "unknown"}`,
    `- vercelProductionNames: ${vercel.productionNames || "unknown"}`,
    `- vercelRequiredCovered: ${vercel.requiredCovered || "unknown"}`,
    `- requiredMissingInVercelProduction: ${(vercel.requiredMissingInVercelProduction || []).join(", ") || "none"}`,
    `- appSpecificKeysMissingInVercelProduction: ${(vercel.appSpecificKeysMissingInVercelProduction || []).join(", ") || "none"}`,
    `- bridgeKeysPresentInVercelProduction: ${(vercel.bridgeKeysPresentInVercelProduction || []).join(", ") || "none"}`,
    `- canMigrateFromVercelProduction: ${envSourceMap.canMigrateFromVercelProduction}`,
    `- appAliyunOwnedNotInVercel: ${envSourceMap.appAliyunOwnedNotInVercel}`,
    `- blockedExternalRequired: ${envSourceMap.blockedExternalRequired.join(", ") || "none"}`,
    `- readyLocalButMissingFromVercel: ${envSourceMap.readyLocalButMissingFromVercel.join(", ") || "none"}`,
    `- miniProgramCompatOnly: ${envSourceMap.miniProgramCompatOnly.join(", ") || "none"}`,
    `- deferredOptional: ${envSourceMap.deferredOptional}`,
    `- secretOrSensitiveToImport: ${envSourceMap.secretOrSensitiveToImport}`,
    "",
    "### 可按同名从 Vercel Production 迁移",
    "",
    `- count: ${envSourceMap.groups.migrateFromVercelProduction.count}`,
    `- variableNames: ${envSourceMap.groups.migrateFromVercelProduction.variableNames.join(", ") || "none"}`,
    "",
    "### APP/阿里云新增或云侧确认值",
    "",
    `- count: ${envSourceMap.groups.appAliyunOwnedNotInVercel.count}`,
    `- variableNames: ${envSourceMap.groups.appAliyunOwnedNotInVercel.variableNames.join(", ") || "none"}`,
    "",
    "### 外部阻塞值",
    "",
    ...renderEnvSourceVariableTable(envSourceMap.groups.blockedExternalRequired),
    "### 本机 ready 但 Vercel Production 名称缺失",
    "",
    ...renderEnvSourceVariableTable(envSourceMap.groups.readyLocalButMissingFromVercel),
    "### 小程序兼容变量",
    "",
    ...renderEnvSourceVariableTable(envSourceMap.groups.miniProgramCompatOnly),
  ]
}

function renderEnvSourceVariableTable(items = []) {
  if (!items.length) return ["- none", ""]
  return [
    "| 变量 | 状态 | 敏感等级 | 来源分类 | 来源判断 | 获取位置 | 导入目标 | 禁止事项 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.name),
      escapeTableCell(item.status),
      escapeTableCell(item.sensitivity),
      escapeTableCell(item.sourceCategory),
      escapeTableCell(item.sourceDecision),
      escapeTableCell(item.consolePath),
      escapeTableCell(item.importTarget),
      escapeTableCell(item.forbidden),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
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

function renderWritebackTask(task) {
  return [
    `### ${task.id}`,
    "",
    `- title: ${task.title}`,
    `- currentActionScope: ${task.currentActionScope}`,
    `- requiresActionTimeConfirmation: ${task.requiresActionTimeConfirmation}`,
    `- nonSecretEvidenceOnly: ${task.nonSecretEvidenceOnly}`,
    `- consolePath: ${task.consolePath || "none"}`,
    "- targetFields:",
    ...(task.targetFields.length
      ? task.targetFields.map((field) => `  - ${field.name}: ${field.value} (${field.source || "unknown"})`)
      : ["  - none"]),
    "- writeTargets:",
    ...(task.writeTargets.length ? task.writeTargets.map((item) => `  - ${item}`) : ["  - none"]),
    "- acceptanceEvidence:",
    ...(task.acceptanceEvidence.length ? task.acceptanceEvidence.map((item) => `  - ${item}`) : ["  - none"]),
    "- currentBlockers:",
    ...(task.currentBlockers.length ? task.currentBlockers.map((item) => `  - ${item}`) : ["  - none"]),
    "- deferredWritebackGroups:",
    ...(task.deferredWritebackGroups.length
      ? task.deferredWritebackGroups.map((group) => `  - ${group.id}: waits=${group.requiredAuthorizationPackets.join(", ") || "none"}; blockers=${group.blockers.join(", ") || "none"}`)
      : ["  - none"]),
    "- deferredActions:",
    ...(task.deferredActions.length ? task.deferredActions.map((item) => `  - ${item}`) : ["  - none"]),
    "- forbidden:",
    ...(task.forbidden.length ? task.forbidden.map((item) => `  - ${item}`) : ["  - none"]),
    "- verifyCommands:",
    ...(task.verifyCommands.length ? task.verifyCommands.map((item) => `  - ${item}`) : ["  - none"]),
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

function uniqueStrings(items) {
  return [...new Set((items || []).filter(Boolean))]
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
