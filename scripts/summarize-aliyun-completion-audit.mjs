#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_CLOUD_INVENTORY_RESULTS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")

const OBJECTIVE = "补齐美业话镜 APP 国内发布所需的阿里云侧部署资源与本地证据，明确仍需用户介入的密钥/密码类阻塞项"
const CURRENT_SCOPE = "backend_aliyun_only"
const FULL_APP_LAUNCH_SCOPE = "deferred_after_backend_online"
const APP_LAUNCH_REQUIRED_NAMES = new Set([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "APPLE_TEAM_ID",
])
const APP_LAUNCH_SENSITIVE_ACTION_IDS = new Set([
  "S01_WECHAT_OPEN_APP_LOGIN",
  "S02_APPLE_TEAM_ID",
  "S07_ANDROID_RELEASE_SIGNING",
])
const APP_LAUNCH_CREDENTIAL_NAME_PATTERNS = [
  /^WECHAT_OPEN_APP_/,
  /^APPLE_TEAM_ID$/,
  /^MEIYE_RELEASE_/,
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

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    cloudInventoryResultsFile: DEFAULT_CLOUD_INVENTORY_RESULTS_FILE,
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
    if (arg === "--cloud-inventory-results") {
      args.cloudInventoryResultsFile = resolveValue(argv[++index], "--cloud-inventory-results")
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

function runJson(label, scriptArgs, options = {}) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
    timeout: options.timeoutMs || 0,
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

function runJsonOptional(label, scriptArgs, options = {}) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
    timeout: options.timeoutMs || 0,
  })
  if (result.error) {
    return {
      ok: false,
      report: null,
      error: result.error.code === "ETIMEDOUT"
        ? `${label}_timeout:${options.timeoutMs || 0}ms`
        : result.error.message,
    }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      report: null,
      error: `${label}_failed:${result.status}`,
    }
  }
  try {
    return {
      ok: true,
      report: JSON.parse(result.stdout),
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      report: null,
      error: `invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function runInputs(args) {
  const productionStatus = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--cloud-inventory-results",
    args.cloudInventoryResultsFile,
  ])
  const backendStatus = runJson("backend_status", [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--cloud-inventory-results",
    args.cloudInventoryResultsFile,
  ])
  const envHandoff = runJson("env_handoff", [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
  ])
  const fullAppEnvHandoff = runJson("full_app_env_handoff", [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--env-file",
    args.envFile,
  ])
  const sensitiveBlockers = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const fullAppSensitiveBlockers = runJson("full_app_sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const resourcesMatrix = runJson("resources_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const actionAuthorization = runJson("action_authorization", [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const consoleRunbook = runJson("console_runbook", [
    "scripts/generate-aliyun-console-runbook.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const wechatOpenMobileAppPackage = runJson("wechat_open_mobile_app_package", [
    "scripts/generate-wechat-open-mobile-app-package.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const operatorHandoff = buildOperatorHandoffFallback({
    productionStatus,
    resourcesMatrix,
    consoleRunbook,
    envHandoff: fullAppEnvHandoff,
    operatorHandoffError: "operator_handoff_skipped_for_backend_only_completion_audit",
  })

  return {
    productionStatus,
    backendStatus,
    operatorHandoff,
    envHandoff,
    fullAppEnvHandoff,
    sensitiveBlockers,
    fullAppSensitiveBlockers,
    resourcesMatrix,
    actionAuthorization,
    consoleRunbook,
    wechatOpenMobileAppPackage,
  }
}

function buildOperatorHandoffFallback({
  productionStatus,
  resourcesMatrix,
  consoleRunbook,
  envHandoff,
  operatorHandoffError,
}) {
  const local = productionStatus.localReadiness || {}
  const cloudConfirmations = productionStatus.summary?.cloudConfirmations || {}
  const inventory = productionStatus.summary?.cloudInventoryResults || {}
  const consoleTasks = (consoleRunbook.consoleTasks || []).map((task) => ({
    id: task.id,
    status: task.status,
    ready: task.ready === true,
    currentBlockers: task.currentBlockers || task.blockerCodes || [],
    blockingDependencies: task.blockingDependencies || [],
  }))
  const imageResource = (resourcesMatrix.resources || []).find((item) => item.id === "R02_ACR_IMAGE_REGISTRY")
  return {
    ok: false,
    fallback: true,
    fallbackReason: operatorHandoffError || "operator_handoff_unavailable",
    canDeployNow: false,
    bridgeDataLayer: productionStatus.summary?.bridgeDataLayer || local.bridgeDataLayer || {},
    localReady: {
      appApiBridgeMap: local.backendBridgeMap?.ok === true,
      appRuntimeConfig: local.appRuntimeConfig?.ok === true,
      appRuntimeApiBaseUrl: local.appRuntimeConfig?.apiBaseUrl || "",
      appRuntimeAssetBaseUrl: local.appRuntimeConfig?.assetBaseUrl || "",
      legalPages: local.legalPages?.ok === true,
      nativeRelease: local.nativeRelease?.ok === true,
      docker: local.docker?.ready === true,
    },
    localEvidenceGaps: {
      cloudConfirmations: {
        ready: Number(cloudConfirmations.ready || 0) === Number(cloudConfirmations.total || 0) && Number(cloudConfirmations.total || 0) > 0,
        totalBlockers: compactCloudPending(cloudConfirmations.pending).length,
      },
      cloudInventoryResults: {
        checkedOperations: inventory.localCheckedOperations || inventory.localOperations || 0,
        observationSummary: inventory.observationSummary || {},
      },
      imagePublish: {
        ready: imageResource?.ready === true,
        localDockerImage: "unknown",
        totalBlockers: imageResource?.ready === true ? 0 : 1,
        gaps: imageResource?.ready === true ? [] : [{
          jsonPath: "deploy/aliyun-production-cn.image-publish.local.json",
          blocker: "image_publish_evidence_not_ready",
        }],
      },
    },
    aliyunConsoleTaskOrder: {
      canStartNow: consoleRunbook.summary?.canStartNowConsoleTasks || consoleTasks
        .filter((task) => task.ready !== true && task.blockingDependencies.length === 0)
        .map((task) => task.id),
      blockedByDependencies: consoleRunbook.summary?.blockedByTaskDependencies || consoleTasks
        .filter((task) => task.blockingDependencies.length > 0)
        .map((task) => task.id),
      tasks: consoleTasks,
    },
    appLaunchBlocking: {
      states: envHandoff.groups?.appLaunchBlocking || [],
    },
    userActionNow: [],
    aliyunConsoleActionNow: [],
  }
}

function buildAudit(args, inputs) {
  const {
    productionStatus,
    backendStatus,
    operatorHandoff,
    envHandoff,
    fullAppEnvHandoff,
    sensitiveBlockers,
    fullAppSensitiveBlockers,
    resourcesMatrix,
    actionAuthorization,
    consoleRunbook,
    wechatOpenMobileAppPackage,
  } = inputs
  const goalClosureEvidenceBrief = buildGoalClosureEvidenceBrief(sensitiveBlockers, resourcesMatrix)
  const fullAppCredentialIntervention = credentialInterventionFromSensitiveBlockers(fullAppSensitiveBlockers)
  const deferredAppLaunchBlockedCredentialNames = fullAppCredentialIntervention.blockedCredentialNames
    .filter((name) => APP_LAUNCH_CREDENTIAL_NAME_PATTERNS.some((pattern) => pattern.test(String(name))))
  const bridgeDataLayer = buildBridgeDataLayerBoundary(productionStatus, operatorHandoff)
  const localImplementation = buildLocalImplementationEvidence(productionStatus, operatorHandoff)
  const requirements = [
    buildLocalAppBackendRequirement(productionStatus, operatorHandoff, localImplementation),
    buildAliyunCloudResourceRequirement(productionStatus, operatorHandoff, resourcesMatrix),
    buildAliyunDataLayerRequirement(bridgeDataLayer),
    buildCloudInventoryRequirement(productionStatus, operatorHandoff),
    buildImagePublishRequirement(operatorHandoff),
    buildDomainRequirement(actionAuthorization, consoleRunbook),
    buildWechatRequirement(productionStatus, wechatOpenMobileAppPackage),
    buildAppleRequirement(productionStatus, operatorHandoff, fullAppEnvHandoff),
    buildEnvImportRequirement(productionStatus, operatorHandoff, envHandoff),
    buildSensitiveBlockersRequirement(sensitiveBlockers),
    buildProductionDeployRequirement(productionStatus, operatorHandoff, actionAuthorization),
  ]
  const summary = summarizeRequirements(requirements)
  const complete = requirements.every((item) => item.status === "proved" || item.status === "deferred")
  const verdict = complete ? "complete" : "blocked"
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    objective: OBJECTIVE,
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    verdict,
    complete,
    canDeployNow: backendStatus.canDeployBackendNow === true && operatorHandoff.canDeployNow === true,
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudInventoryResultsFile: args.cloudInventoryResultsFile,
    },
    bridgeDataLayer,
    currentAnswer: complete
      ? "目标完成；仍需按发布流程单独授权生产部署动作。"
      : "现在目标还没完成，不能上线/部署；当前只审计阿里云后端，微信/Apple/Android 发布项延期；阿里云 RDS 数据层、云资源、production-cn 环境变量导入、域名 HTTPS/ICP 和生产部署冒烟仍未完成。",
    summary: {
      currentScope: CURRENT_SCOPE,
      fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
      ...summary,
      backendRequiredBlocking: backendStatus.summary?.backendRequiredBlocking || [],
      deferredAppLaunchBlocking: backendStatus.summary?.appLaunchDeferredBlocking || [],
      localEvidenceUsable: productionStatus.releaseEvidenceUsable !== false,
      localImplementationReady: localImplementation.ready,
      localImplementationReadyFields: localImplementation.readyFields,
      localImplementationBlockingFields: localImplementation.blockingFields,
      localCodeMachineBlockers: localImplementation.machineBlockers,
      requiredEnv: `${productionStatus.summary?.requiredReady || 0}/${productionStatus.summary?.requiredTotal || 0}`,
      requiredBlocking: productionStatus.summary?.requiredBlocking || [],
      cloudConfirmations: productionStatus.summary?.cloudConfirmations || {},
      cloudInventoryResults: productionStatus.summary?.cloudInventoryResults || {},
      bridgeDataLayer,
      operatorTasks: productionStatus.summary?.operatorTasks || {},
      canStartNowConsoleTasks: operatorHandoff.aliyunConsoleTaskOrder?.canStartNow || [],
      blockedByConsoleTaskDependencies: operatorHandoff.aliyunConsoleTaskOrder?.blockedByDependencies || [],
      canStartNowAuthorizationPackets: actionAuthorization.summary?.canStartNowPackets || [],
      nextActionTimeConfirmations: actionAuthorization.nextActionTimeConfirmations || [],
      blockedByAuthorizationPacketDependencies: actionAuthorization.summary?.blockedByPacketDependencies || [],
      sensitiveBlockedIds: sensitiveBlockers.summary?.blockedIds || [],
      deferredAppLaunchSensitiveBlockedIds: (fullAppSensitiveBlockers.summary?.blockedIds || [])
        .filter((id) => APP_LAUNCH_SENSITIVE_ACTION_IDS.has(id)),
      blockedCredentialCount: goalClosureEvidenceBrief.credentialIntervention.blockedCredentialCount,
      blockedCredentialNames: goalClosureEvidenceBrief.credentialIntervention.blockedCredentialNames,
      fullAppBlockedCredentialCount: fullAppCredentialIntervention.blockedCredentialCount,
      fullAppBlockedCredentialNames: fullAppCredentialIntervention.blockedCredentialNames,
      deferredAppLaunchBlockedCredentialNames,
      readySecretEnvVariableCount: goalClosureEvidenceBrief.credentialIntervention.readySecretEnvVariableCount,
      readySecretEnvVariableNames: goalClosureEvidenceBrief.credentialIntervention.readySecretEnvVariableNames,
      resourceEvidenceReady: goalClosureEvidenceBrief.resourceEvidence.ready,
      blockedResourceEvidenceIds: goalClosureEvidenceBrief.resourceEvidence.blockedIds,
    },
    goalClosureEvidenceBrief,
    requirements,
    nextActions: {
      userActionNow: operatorHandoff.userActionNow || [],
      aliyunConsoleActionNow: operatorHandoff.aliyunConsoleActionNow || [],
      canStartNowConsoleTasks: operatorHandoff.aliyunConsoleTaskOrder?.canStartNow || [],
      blockedByConsoleTaskDependencies: operatorHandoff.aliyunConsoleTaskOrder?.blockedByDependencies || [],
      canStartNowAuthorizationPackets: actionAuthorization.summary?.canStartNowPackets || [],
      nextActionTimeConfirmations: actionAuthorization.nextActionTimeConfirmations || [],
      blockedByAuthorizationPacketDependencies: actionAuthorization.summary?.blockedByPacketDependencies || [],
      sensitiveBlockedIds: sensitiveBlockers.summary?.blockedIds || [],
      deferredAppLaunchSensitiveBlockedIds: (fullAppSensitiveBlockers.summary?.blockedIds || [])
        .filter((id) => APP_LAUNCH_SENSITIVE_ACTION_IDS.has(id)),
      blockedResourceEvidenceIds: goalClosureEvidenceBrief.resourceEvidence.blockedIds,
    },
    sourceCommands: {
      productionStatus: "corepack pnpm aliyun:status",
      operatorHandoff: "corepack pnpm aliyun:operator:handoff -- --skip-vercel-env-coverage",
      envHandoff: "corepack pnpm aliyun:env:handoff:backend",
      fullAppEnvHandoff: "corepack pnpm aliyun:env:handoff",
      sensitiveBlockers: "corepack pnpm aliyun:sensitive:blockers:backend",
      fullAppSensitiveBlockers: "corepack pnpm aliyun:sensitive:blockers",
      resourcesMatrix: "corepack pnpm aliyun:resources:matrix",
      actionAuthorization: "corepack pnpm aliyun:action:authorization:backend",
      consoleRunbook: "corepack pnpm aliyun:console:runbook",
      wechatOpenMobileAppPackage: "corepack pnpm aliyun:wechat-open:package",
    },
    safetyBoundary: [
      "本审计只读本地非密钥证据。",
      "本审计不购买 ACR，不创建或修改 SAE/SLS/OSS/RAM/KMS/DNS/证书/CDN。",
      "本审计不读取、复制、输出或导入 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、证书私钥或 Supabase service role key。",
      "本审计不推送镜像、不部署 production-cn、不 git push、不上传微信或创建微信移动 App。",
    ],
  }
  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    matches: secretLikePaths,
  }
  if (secretLikePaths.length > 0) {
    report.ok = false
    report.containsValues = true
  }
  return report
}

function buildBridgeDataLayerBoundary(productionStatus, operatorHandoff) {
  const source = operatorHandoff.bridgeDataLayer
    || productionStatus.summary?.bridgeDataLayer
    || productionStatus.localReadiness?.bridgeDataLayer
    || {}
  return {
    current: source.current || "Supabase migration source / legacy compatibility only",
    target: source.target || "Aliyun RDS PostgreSQL",
    status: source.status || "blocked_until_aliyun_rds_postgresql_migration_ready",
    firstBridgeDeploymentUses: source.firstBridgeDeploymentUses || "not_allowed_for_final_production_cn",
    supabaseBridgeReady: source.supabaseBridgeReady === true,
    supabaseSourceReady: source.supabaseSourceReady === true,
    supabaseKeys: source.supabaseKeys || [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    databaseUrlCnStatus: source.databaseUrlCnStatus || "todo",
    redisUrlCnStatus: source.redisUrlCnStatus || "todo",
    rdsMigrationIncludedInThisRelease: source.rdsMigrationIncludedInThisRelease === true,
    rdsMigrationRequiredForFinalProductionCn: source.rdsMigrationRequiredForFinalProductionCn !== false,
    notes: source.notes || [
      "正式国内 production-cn 目标必须使用阿里云 RDS PostgreSQL；Supabase 只能作为迁移来源或旧链路兼容，不是正式数据库。",
      "DATABASE_URL_CN 是正式全阿里云数据层的必填阻塞项；仅填写连接串仍不等于完成 Supabase SDK 到 RDS/PostgreSQL 的代码和数据迁移。",
      "REDIS_URL_CN 只有在 production-cn 队列/缓存实现明确依赖 Tair/Redis 时才升级为必填阻塞项。",
    ],
  }
}

function buildAliyunDataLayerRequirement(bridgeDataLayer) {
  const databaseReady = bridgeDataLayer.databaseUrlCnStatus === "ready"
  const migrationReady = bridgeDataLayer.rdsMigrationIncludedInThisRelease === true
  return requirement({
    id: "G02B_ALIYUN_RDS_DATA_LAYER_READY",
    title: "正式国内数据层迁到阿里云 RDS PostgreSQL",
    status: databaseReady && migrationReady ? "proved" : "blocked",
    evidence: [
      `current=${bridgeDataLayer.current}`,
      `target=${bridgeDataLayer.target}`,
      `DATABASE_URL_CN=${bridgeDataLayer.databaseUrlCnStatus}`,
      `REDIS_URL_CN=${bridgeDataLayer.redisUrlCnStatus}`,
      `rdsMigrationIncludedInThisRelease=${bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
      `rdsMigrationRequiredForFinalProductionCn=${bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    ],
    blockers: [
      ...(databaseReady ? [] : ["DATABASE_URL_CN"]),
      ...(migrationReady ? [] : ["rdsMigrationIncludedInThisRelease=false"]),
      "RDS PostgreSQL instance and migration evidence must be ready before final production-cn",
    ],
    authoritativeCommands: [
      "corepack pnpm aliyun:readiness",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
    ],
  })
}

function buildLocalImplementationEvidence(status, operatorHandoff) {
  const localReady = operatorHandoff.localReady || {}
  const booleanReadyFields = [
    "appApiBridgeMap",
    "appRuntimeConfig",
    "legalPages",
    "nativeRelease",
    "docker",
  ]
  const blockingFields = booleanReadyFields.filter((key) => localReady[key] !== true)
  const machineBlockers = (status.summary?.machineBlocking || [])
    .filter((item) => !APP_LAUNCH_MACHINE_BLOCKER_PATTERNS.some((pattern) => pattern.test(String(item))))
  return {
    ready: blockingFields.length === 0,
    readyFields: booleanReadyFields.filter((key) => localReady[key] === true),
    blockingFields,
    machineBlockers,
  }
}

function buildLocalAppBackendRequirement(status, operatorHandoff, localImplementation) {
  const localReady = operatorHandoff.localReady || {}
  const localCodeReady = status.summary?.localCodeReady === true
  const blockers = [...localImplementation.blockingFields]
  if (!localCodeReady) blockers.unshift("localCodeReady=false")
  const statusValue = localCodeReady && blockers.length === 0 ? "proved" : "partial"
  return requirement({
    id: "G01_LOCAL_APP_BACKEND_READY",
    title: "APP/后端本地代码和 API 桥接证据 ready",
    status: statusValue,
    evidence: [
      `localCodeReady=${localCodeReady}`,
      `localImplementationReady=${localImplementation.ready}`,
      `localImplementationReadyFields=${localImplementation.readyFields.join(",") || "none"}`,
      `localImplementationBlockingFields=${localImplementation.blockingFields.join(",") || "none"}`,
      `localCodeMachineBlockers=${localImplementation.machineBlockers.join(",") || "none"}`,
      `appApiBridgeMap=${localReady.appApiBridgeMap === true}`,
      `appRuntimeConfig=${localReady.appRuntimeConfig === true}`,
      `appRuntimeApiBaseUrl=${localReady.appRuntimeApiBaseUrl || "unknown"}`,
      `appRuntimeAssetBaseUrl=${localReady.appRuntimeAssetBaseUrl || "unknown"}`,
      `legalPages=${localReady.legalPages === true}`,
      `nativeRelease=${localReady.nativeRelease === true}`,
      `docker=${localReady.docker === true}`,
    ],
    blockers,
    authoritativeCommands: [
      "corepack pnpm aliyun:status",
      "corepack pnpm aliyun:operator:handoff -- --skip-vercel-env-coverage",
    ],
  })
}

function buildGoalClosureEvidenceBrief(sensitiveBlockers, resourcesMatrix) {
  const credentialIntervention = sensitiveBlockers.credentialInterventionBrief
    || sensitiveBlockers.summary?.credentialInterventionBrief
    || {}
  const resourceEvidence = resourcesMatrix.resourceEvidenceBrief || {}
  return {
    credentialIntervention: {
      blockedCredentialCount: credentialIntervention.blockedCredentialCount || 0,
      blockedCredentialNames: credentialIntervention.blockedCredentialNames || [],
      readySecretEnvVariableCount: credentialIntervention.readySecretEnvVariableCount || 0,
      readySecretEnvVariableNames: credentialIntervention.readySecretEnvVariableNames || [],
      actionTimeConfirmationRequiredIds: credentialIntervention.actionTimeConfirmationRequiredIds || [],
      groups: (credentialIntervention.groups || []).map((group) => ({
        category: group.category,
        actionId: group.actionId,
        status: group.status,
        blockedCredentialNames: group.blockedCredentialNames || [],
        readySecretEnvVariableNames: group.readySecretEnvVariableNames || [],
        obtainFrom: group.obtainFrom,
        writeTargets: group.writeTargets || [],
        verifyCommands: group.verifyCommands || [],
      })),
    },
    resourceEvidence: {
      ready: `${resourceEvidence.ready || 0}/${resourceEvidence.total || 0}`,
      blocked: resourceEvidence.blocked || 0,
      blockedIds: resourceEvidence.blockedIds || [],
      blockedResourceEvidence: (resourceEvidence.blockedResourceEvidence || []).map((item) => ({
        id: item.id,
        status: item.status,
        observedStatus: item.observedStatus,
        observedReadiness: item.observedReadiness,
        requiredAuthorizationPackets: item.requiredAuthorizationPackets || [],
        consoleTaskIds: item.consoleTaskIds || [],
        missingEvidence: item.missingEvidence || [],
        writeTargets: item.writeTargets || [],
        verifyCommands: item.verifyCommands || [],
        nextEvidenceAction: item.nextEvidenceAction,
      })),
      valueHandlingRules: resourceEvidence.valueHandlingRules || [],
    },
  }
}

function credentialInterventionFromSensitiveBlockers(sensitiveBlockers) {
  const credentialIntervention = sensitiveBlockers?.credentialInterventionBrief
    || sensitiveBlockers?.summary?.credentialInterventionBrief
    || {}
  return {
    blockedCredentialCount: credentialIntervention.blockedCredentialCount || 0,
    blockedCredentialNames: credentialIntervention.blockedCredentialNames || [],
    readySecretEnvVariableCount: credentialIntervention.readySecretEnvVariableCount || 0,
    readySecretEnvVariableNames: credentialIntervention.readySecretEnvVariableNames || [],
  }
}

function buildAliyunCloudResourceRequirement(status, operatorHandoff, resourcesMatrix) {
  const cloud = status.summary?.cloudConfirmations || {}
  const ready = Number(cloud.ready || 0)
  const total = Number(cloud.total || 0)
  const resourceEvidence = resourcesMatrix.resourceEvidenceBrief || {}
  const blockedResourceEvidence = resourceEvidence.blockedResourceEvidence || []
  const backendCloudPending = (cloud.pending || [])
    .filter((item) => item.key !== "wechatOpenPlatform")
  return requirement({
    id: "G02_ALIYUN_CLOUD_RESOURCES_READY",
    title: "阿里云 production-cn 云资源完成并有非密钥证据",
    status: total > 0 && ready === total ? "proved" : "blocked",
    evidence: [
      `cloudConfirmations ${ready}/${total} ready`,
      `resourceEvidenceReady=${resourceEvidence.ready || 0}/${resourceEvidence.total || 0}`,
      `resourceEvidenceBlocked=${resourceEvidence.blocked || 0}`,
      `operatorTasks ready ${status.summary?.operatorTasks?.ready || 0}/${status.summary?.operatorTasks?.total || 0}`,
      `cloudConfirmations.ready=${operatorHandoff.localEvidenceGaps?.cloudConfirmations?.ready === true}`,
    ],
    blockers: compactCloudPending(backendCloudPending).concat(
      operatorHandoff.localEvidenceGaps?.cloudConfirmations?.totalBlockers
        ? [`cloudConfirmations.totalBlockers=${operatorHandoff.localEvidenceGaps.cloudConfirmations.totalBlockers}`]
        : [],
      blockedResourceEvidence.flatMap((item) =>
        (item.missingEvidence || []).map((evidence) => `${item.id}:${evidence}`),
      ),
    ),
    authoritativeCommands: [
      "corepack pnpm aliyun:status",
      "corepack pnpm aliyun:cloud:confirmations:strict",
    ],
  })
}

function buildCloudInventoryRequirement(status, operatorHandoff) {
  const inventory = status.summary?.cloudInventoryResults || {}
  const handoffInventory = operatorHandoff.localEvidenceGaps?.cloudInventoryResults || {}
  const observationSummary = inventory.observationSummary || handoffInventory.observationSummary || {}
  return requirement({
    id: "G03_CLOUD_INVENTORY_PROVED",
    title: "阿里云 CLI/Cloud Shell 只读盘点结果已落地",
    status: inventory.localReady === true ? "proved" : "blocked",
    evidence: [
      `localExists=${inventory.localExists === true}`,
      `localReady=${inventory.localReady === true}`,
      `readyLocalOperations=${inventory.readyLocalOperations || 0}/${inventory.localOperations || 0}`,
      `checkedOperations=${handoffInventory.checkedOperations || 0}`,
      `safeConsoleOnly=${observationSummary.safeConsoleOnly === true}`,
      `consoleObservationOperations=${observationSummary.consoleObservationOperations || 0}/${observationSummary.operations || 0}`,
      `executedCommandResults=${observationSummary.executedCommandResults || 0}/${observationSummary.commandResults || 0}`,
      `cloudApiCalledCommandResults=${observationSummary.cloudApiCalledCommandResults || 0}`,
      `mutationPerformedCommandResults=${observationSummary.mutationPerformedCommandResults || 0}`,
    ],
    blockers: inventory.localBlockers || handoffInventory.gaps?.map((item) => item.blocker) || [],
    authoritativeCommands: [
      "corepack pnpm aliyun:cloud:inventory-results",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
    ],
  })
}

function buildImagePublishRequirement(operatorHandoff) {
  const image = operatorHandoff.localEvidenceGaps?.imagePublish || {}
  return requirement({
    id: "G04_IMAGE_PUBLISH_READY",
    title: "ACR 镜像发布、digest 和 SAE 拉取配置 ready",
    status: image.ready === true ? "proved" : "blocked",
    evidence: [
      `imagePublish.ready=${image.ready === true}`,
      `localDockerImage=${image.localDockerImage || "unknown"}`,
      `totalBlockers=${image.totalBlockers ?? 0}`,
    ],
    blockers: (image.gaps || []).map((item) => `${item.jsonPath}:${item.blocker}`),
    authoritativeCommands: [
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:operator:handoff -- --skip-vercel-env-coverage",
    ],
  })
}

function buildDomainRequirement(actionAuthorization, consoleRunbook) {
  const domainAction = actionById(actionAuthorization, "U07_DOMAIN_DNS_HTTPS_ICP")
  const domainTasks = (consoleRunbook.consoleTasks || []).filter((task) =>
    ["C03_API_DOMAIN_HTTPS_ICP", "C04_ASSET_DOMAIN_HTTPS_ICP"].includes(task.id)
  )
  const ready = domainTasks.length > 0 && domainTasks.every((task) => task.ready === true)
  return requirement({
    id: "G05_DOMAIN_HTTPS_ICP_READY",
    title: "api-cn/assets-cn DNS、HTTPS、ICP ready",
    status: ready ? "proved" : "blocked",
    evidence: domainTasks.map((task) => `${task.id}:${task.status}:canStartNow=${task.canStartNow}`),
    blockers: [
      ...(domainAction?.currentBlockers || []),
      ...domainTasks.flatMap((task) => task.currentBlockers || []),
    ],
    authoritativeCommands: [
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:console:runbook",
    ],
  })
}

function buildWechatRequirement(status, wechatPackage) {
  const summary = wechatPackage.summary || {}
  const missing = status.summary?.requiredBlocking || []
  const ready = summary.mobileAppCreated === true
    && ["approved", "ready"].includes(String(summary.reviewStatus || ""))
    && !missing.includes("WECHAT_OPEN_APP_ID")
    && !missing.includes("WECHAT_OPEN_APP_SECRET")
  return requirement({
    id: "G06_WECHAT_APP_LOGIN_READY",
    title: "微信开放平台移动应用审核/AppID/AppSecret ready",
    status: ready ? "proved" : "deferred",
    evidence: [
      `accountVerified=${summary.accountVerified === true}`,
      `mobileAppCreated=${summary.mobileAppCreated === true}`,
      `reviewStatus=${summary.reviewStatus || "unknown"}`,
      `readyToSubmitForReview=${summary.readyToSubmitForReview === true}`,
    ],
    blockers: [
      ...(missing.includes("WECHAT_OPEN_APP_ID") ? ["WECHAT_OPEN_APP_ID"] : []),
      ...(missing.includes("WECHAT_OPEN_APP_SECRET") ? ["WECHAT_OPEN_APP_SECRET"] : []),
      ...(summary.mobileAppCreated !== true ? ["wechatOpenPlatform.mobileAppCreated=false"] : []),
      ...(!["approved", "ready"].includes(String(summary.reviewStatus || "")) ? [`wechatOpenPlatform.reviewStatus=${summary.reviewStatus || "unknown"}`] : []),
    ],
    authoritativeCommands: [
      "corepack pnpm aliyun:wechat-open:package",
      "corepack pnpm aliyun:status",
    ],
  })
}

function buildAppleRequirement(status, operatorHandoff, envHandoff) {
  const appLaunchBlocking = envHandoff.summary?.appLaunchBlocking || []
  const stateBlockers = operatorHandoff.appLaunchBlocking?.states || []
  const ready = !appLaunchBlocking.includes("APPLE_TEAM_ID") && stateBlockers.length === 0
  return requirement({
    id: "G07_APPLE_AASA_READY",
    title: "Apple Team ID/AASA/Universal Link ready",
    status: ready ? "proved" : "deferred",
    evidence: [
      `APP launch blocking=${appLaunchBlocking.join(", ") || "none"}`,
      `stateBlockers=${stateBlockers.map((item) => `${item.name}:${item.status}`).join(", ") || "none"}`,
      `localCodeReady=${status.summary?.localCodeReady === true}`,
    ],
    blockers: [
      ...appLaunchBlocking,
      ...stateBlockers.map((item) => `${item.name}:${item.status}`),
    ],
    authoritativeCommands: [
      "corepack pnpm aliyun:env:handoff",
      "corepack pnpm aliyun:aasa:strict",
    ],
  })
}

function buildEnvImportRequirement(status, operatorHandoff, envHandoff) {
  const envImportTask = (operatorHandoff.aliyunConsoleTaskOrder?.tasks || []).find((task) => task.id === "C06_ENV_IMPORT")
  const requiredBlocking = (envHandoff.summary?.requiredBlocking || status.summary?.requiredBlocking || [])
    .filter((name) => !APP_LAUNCH_REQUIRED_NAMES.has(name))
  const ready = requiredBlocking.length === 0 && envImportTask?.ready === true
  return requirement({
    id: "G08_ENV_IMPORT_READY",
    title: "production-cn env 已导入 SAE/KMS/Secrets Manager 且未进镜像",
    status: ready ? "proved" : "blocked",
    evidence: [
      `requiredEnv=${status.summary?.requiredReady || 0}/${status.summary?.requiredTotal || 0}`,
      `readyPlainEnv=${envHandoff.summary?.readyPlainEnv ?? 0}`,
      `readySecretEnv=${envHandoff.summary?.readySecretEnv ?? 0}`,
      `envImportTask=${envImportTask?.status || "unknown"}`,
    ],
    blockers: [
      ...requiredBlocking,
      ...(envImportTask?.currentBlockers || [])
        .filter((item) => !APP_LAUNCH_MACHINE_BLOCKER_PATTERNS.some((pattern) => pattern.test(String(item)))),
      ...(envImportTask?.blockingDependencies || []).map((item) => `dependsOn:${item}`),
    ],
    authoritativeCommands: [
      "corepack pnpm aliyun:env:handoff",
      "corepack pnpm aliyun:cloud:confirmations:strict",
    ],
  })
}

function buildSensitiveBlockersRequirement(sensitiveBlockers) {
  const ok = sensitiveBlockers.ok === true
    && sensitiveBlockers.containsValues === false
    && sensitiveBlockers.secretLeakCheck?.ok === true
  const credentialIntervention = sensitiveBlockers.credentialInterventionBrief
    || sensitiveBlockers.summary?.credentialInterventionBrief
    || {}
  return requirement({
    id: "G09_SENSITIVE_BLOCKERS_EXPLICIT",
    title: "密钥/密码/token/付款项已明确列出且不泄露值",
    status: ok ? "proved" : "blocked",
    evidence: [
      `blocked=${sensitiveBlockers.summary?.blocked ?? 0}/${sensitiveBlockers.summary?.total ?? 0}`,
      `blockedCredentialCount=${credentialIntervention.blockedCredentialCount || 0}`,
      `readySecretEnvVariableCount=${credentialIntervention.readySecretEnvVariableCount || 0}`,
      `containsValues=${sensitiveBlockers.containsValues === true}`,
      `secretLeakCheck=${sensitiveBlockers.secretLeakCheck?.ok === true}`,
    ],
    blockers: ok ? [] : sensitiveBlockers.summary?.blockedIds || [],
    authoritativeCommands: [
      "corepack pnpm aliyun:sensitive:blockers",
    ],
  })
}

function buildProductionDeployRequirement(status, operatorHandoff, actionAuthorization) {
  const deployAction = actionById(actionAuthorization, "U09_DEPLOY_AUTHORIZATION")
  const deployActionBlockers = (deployAction?.currentBlockers || [])
    .filter((item) => !APP_LAUNCH_MACHINE_BLOCKER_PATTERNS.some((pattern) => pattern.test(String(item))))
  return requirement({
    id: "G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE",
    title: "production-cn 部署和 postdeploy 冒烟已完成",
    status: status.canDeployNow === true && operatorHandoff.canDeployNow === true ? "proved" : "blocked",
    evidence: [
      `status.canDeployNow=${status.canDeployNow === true}`,
      `operatorHandoff.canDeployNow=${operatorHandoff.canDeployNow === true}`,
      `deployAction=${deployAction?.automationPolicy || "unknown"}`,
    ],
    blockers: [
      ...deployActionBlockers,
      ...(deployAction?.blockingDependencies || []).map((item) => `dependsOn:${item}`),
      ...(status.canDeployNow !== true ? ["canDeployNow=false"] : []),
    ],
    authoritativeCommands: [
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  })
}

function requirement({ id, title, status, evidence, blockers, authoritativeCommands }) {
  return {
    id,
    title,
    status,
    evidence: uniqueStrings(evidence),
    blockers: uniqueStrings(blockers),
    authoritativeCommands,
  }
}

function summarizeRequirements(requirements) {
  return {
    requirements: requirements.length,
    proved: requirements.filter((item) => item.status === "proved").length,
    blocked: requirements.filter((item) => item.status === "blocked").length,
    partial: requirements.filter((item) => item.status === "partial").length,
    deferred: requirements.filter((item) => item.status === "deferred").length,
  }
}

function compactCloudPending(pending) {
  if (!Array.isArray(pending)) return []
  return pending.flatMap((item) => {
    const missing = Array.isArray(item.missing) && item.missing.length
      ? item.missing.map((field) => `${item.key}:${field}`)
      : [`${item.key}:not_ready`]
    return missing
  })
}

function actionById(actionAuthorization, id) {
  return (actionAuthorization.actions || []).find((item) => item.id === id) || null
}

function uniqueStrings(values) {
  return Array.from(new Set((values || [])
    .filter((item) => item !== null && item !== undefined && String(item).trim())
    .map((item) => String(item))))
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

function renderMarkdown(report) {
  return [
    "# 美业话镜 APP production-cn 目标完成度审计",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- Verdict: ${report.verdict}`,
    `- Current scope: ${report.currentScope}`,
    `- Full app launch scope: ${report.fullAppLaunchScope}`,
    `- Complete: ${report.complete}`,
    `- Can deploy now: ${report.canDeployNow}`,
    `- Current answer: ${report.currentAnswer}`,
    `- Requirements: proved ${report.summary.proved}/${report.summary.requirements}, blocked ${report.summary.blocked}, partial ${report.summary.partial}, deferred ${report.summary.deferred}`,
    `- Local implementation ready: ${report.summary.localImplementationReady}`,
    `- Local implementation blocking fields: ${report.summary.localImplementationBlockingFields.length ? report.summary.localImplementationBlockingFields.join(", ") : "none"}`,
    `- Local code machine blockers: ${report.summary.localCodeMachineBlockers.length ? report.summary.localCodeMachineBlockers.join(", ") : "none"}`,
    `- Required env: ${report.summary.requiredEnv}`,
    `- Backend required blockers: ${report.summary.backendRequiredBlocking.join(", ") || "none"}`,
    `- Deferred app launch blockers: ${report.summary.deferredAppLaunchBlocking.join(", ") || "none"}`,
    `- Cloud confirmations: ${report.summary.cloudConfirmations.ready || 0}/${report.summary.cloudConfirmations.total || 0} ready`,
    `- Cloud inventory results: localReady ${report.summary.cloudInventoryResults.localReady === true}, ready operations ${report.summary.cloudInventoryResults.readyLocalOperations || 0}/${report.summary.cloudInventoryResults.localOperations || 0}`,
    `- Cloud inventory console-only: safe ${report.summary.cloudInventoryResults.observationSummary?.safeConsoleOnly === true}, console observations ${report.summary.cloudInventoryResults.observationSummary?.consoleObservationOperations || 0}/${report.summary.cloudInventoryResults.observationSummary?.operations || 0}, executed commands ${report.summary.cloudInventoryResults.observationSummary?.executedCommandResults || 0}/${report.summary.cloudInventoryResults.observationSummary?.commandResults || 0}, cloud API calls ${report.summary.cloudInventoryResults.observationSummary?.cloudApiCalledCommandResults || 0}`,
    `- Bridge data layer: current ${report.bridgeDataLayer.current}, target ${report.bridgeDataLayer.target}, first bridge uses ${report.bridgeDataLayer.firstBridgeDeploymentUses}`,
    `- RDS migration included in this release: ${report.bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
    `- RDS migration required for final production-cn: ${report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    `- Can start now console tasks: ${report.summary.canStartNowConsoleTasks.length ? report.summary.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- Can start now authorization packets: ${report.summary.canStartNowAuthorizationPackets.length ? report.summary.canStartNowAuthorizationPackets.join(", ") : "none"}`,
    `- Next action-time confirmations: ${report.summary.nextActionTimeConfirmations.length ? report.summary.nextActionTimeConfirmations.map((item) => item.packetId).join(", ") : "none"}`,
    `- Blocked credential count: ${report.summary.blockedCredentialCount}`,
    `- Full app blocked credential count: ${report.summary.fullAppBlockedCredentialCount}`,
    `- Deferred app launch blocked credentials: ${report.summary.deferredAppLaunchBlockedCredentialNames.length ? report.summary.deferredAppLaunchBlockedCredentialNames.join(", ") : "none"}`,
    `- Ready secret env variable count: ${report.summary.readySecretEnvVariableCount}`,
    `- Resource evidence ready: ${report.summary.resourceEvidenceReady}`,
    `- Blocked resource evidence ids: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    "",
    "## 目标闭环证据简表",
    "",
    `- blockedCredentialNames: ${report.summary.blockedCredentialNames.length ? report.summary.blockedCredentialNames.join(", ") : "none"}`,
    `- fullAppBlockedCredentialNames: ${report.summary.fullAppBlockedCredentialNames.length ? report.summary.fullAppBlockedCredentialNames.join(", ") : "none"}`,
    `- deferredAppLaunchBlockedCredentialNames: ${report.summary.deferredAppLaunchBlockedCredentialNames.length ? report.summary.deferredAppLaunchBlockedCredentialNames.join(", ") : "none"}`,
    `- readySecretEnvVariableNames: ${report.summary.readySecretEnvVariableNames.length ? report.summary.readySecretEnvVariableNames.join(", ") : "none"}`,
    `- resourceEvidenceReady: ${report.summary.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    "",
    ...(report.goalClosureEvidenceBrief.resourceEvidence.blockedResourceEvidence.length
      ? report.goalClosureEvidenceBrief.resourceEvidence.blockedResourceEvidence.map((item) =>
        `- ${item.id}: observed=${item.observedStatus}/${item.observedReadiness}; packets=${item.requiredAuthorizationPackets.join(", ") || "none"}; missing=${item.missingEvidence.slice(0, 4).join(", ") || "none"}`)
      : ["- resourceEvidenceBlocked: none"]),
    "",
    "## 数据层边界",
    "",
    `- current: ${report.bridgeDataLayer.current}`,
    `- target: ${report.bridgeDataLayer.target}`,
    `- status: ${report.bridgeDataLayer.status}`,
    `- firstBridgeDeploymentUses: ${report.bridgeDataLayer.firstBridgeDeploymentUses}`,
    `- supabaseBridgeReady: ${report.bridgeDataLayer.supabaseBridgeReady}`,
    `- DATABASE_URL_CN: ${report.bridgeDataLayer.databaseUrlCnStatus}`,
    `- REDIS_URL_CN: ${report.bridgeDataLayer.redisUrlCnStatus}`,
    `- rdsMigrationIncludedInThisRelease: ${report.bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    ...(report.bridgeDataLayer.notes || []).map((item) => `- ${item}`),
    "",
    "## 当前可开始的动作时确认",
    "",
    ...(report.summary.nextActionTimeConfirmations.length
      ? report.summary.nextActionTimeConfirmations.flatMap((item) => [
        `### ${item.packetId} ${item.title}`,
        "",
        `- owner: ${item.owner}`,
        `- minimumUserPhrase: ${item.minimumUserPhrase}`,
        `- explicitlyExcluded: ${item.explicitlyExcluded.join("; ") || "none"}`,
        `- completionEvidence: ${item.completionEvidence.join("; ") || "none"}`,
        `- writeTargets: ${item.writeTargets.join("; ") || "none"}`,
        "",
      ])
      : ["- none", ""]),
    "",
    "## Requirements",
    "",
    ...report.requirements.flatMap((item) => [
      `### ${item.id} ${item.title}`,
      "",
      `- Status: ${item.status}`,
      `- Evidence: ${item.evidence.length ? item.evidence.join("; ") : "none"}`,
      `- Blockers: ${item.blockers.length ? item.blockers.join("; ") : "none"}`,
      `- Commands: ${item.authoritativeCommands.map((command) => `\`${command}\``).join("; ")}`,
      "",
    ]),
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
    "本文件不包含任何密钥值，也不代表已授权生产部署。",
  ].join("\n")
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-completion-audit.mjs [--env-file path] [--cloud-confirmations path] [--cloud-inventory-results path] [--out path] [--markdown path]",
    "",
    "Builds a read-only completion audit for the current APP production-cn Aliyun objective.",
    "It summarizes existing non-secret local evidence and does not call Aliyun APIs or mutate cloud resources.",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  const inputs = runInputs(args)
  const report = buildAudit(args, inputs)
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (args.outPath) writeFileSync(args.outPath, output, { mode: 0o600 })
  if (args.markdownPath) writeFileSync(args.markdownPath, `${renderMarkdown(report)}\n`, { mode: 0o600 })
  process.stdout.write(output)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
