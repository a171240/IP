#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_DEFERRED_APP_LAUNCH_ENV_NAMES = Object.freeze([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "APPLE_TEAM_ID",
  "MEIYE_RELEASE_STORE_FILE",
  "MEIYE_RELEASE_STORE_PASSWORD",
  "MEIYE_RELEASE_KEY_ALIAS",
  "MEIYE_RELEASE_KEY_PASSWORD",
  "ANDROID_RELEASE_WECHAT_SIGNATURE",
  "IOS_UNIVERSAL_LINK_AASA",
])
const DEFERRED_APP_LAUNCH_ACTION_IDS = Object.freeze([
  "S01_WECHAT_OPEN_APP_LOGIN",
  "S02_APPLE_TEAM_ID",
  "S07_ANDROID_RELEASE_SIGNING",
  "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
  "U02_APPLE_TEAM_ID",
  "U10_ANDROID_RELEASE_SIGNING",
])
const DEFERRED_APP_LAUNCH_ACTION_ID_SET = new Set(DEFERRED_APP_LAUNCH_ACTION_IDS)
const TARGET_RUNTIME = Object.freeze({
  provider: "Aliyun SAE",
  region: "cn-hangzhou",
  appName: "meiye-huajing-app-api-production-cn",
  runtime: "custom-container",
  containerPort: 3000,
  healthPath: "/api/healthz",
  strictHealthPath: "/api/app/health?strict=1",
  apiHost: "api-cn.ipgongchang.xin",
  assetHost: "assets-cn.ipgongchang.xin",
  fallback: "ECS is a fallback only",
  dataLayer: "Aliyun RDS PostgreSQL as the formal data layer",
})

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

const PHASES = Object.freeze([
  Object.freeze({
    id: "PH00_READONLY_INVENTORY_IDENTITY",
    title: "恢复阿里云 CLI/CloudShell 只读盘点身份",
    authorizationPackets: ["P00_ALIYUN_READONLY_INVENTORY_IDENTITY"],
    consoleTasks: [],
    completionEvidence: [
      "只运行 allowlisted List/Describe/stat/get inventory 命令。",
      "cloud-inventory-results.local.json 只记录资源名、布尔值、时间戳、命令状态和非密钥 evidence handle。",
      "CloudShell 若提示开通性能型 NAS 并可能产生费用，必须动作时确认后才能点击开通。",
    ],
  }),
  Object.freeze({
    id: "PH01_EXTERNAL_APP_IDENTIFIERS",
    title: "补齐微信移动应用、Android release 签名和 Apple Team ID",
    authorizationPackets: ["P01_WECHAT_OPEN_MOBILE_APP", "P10_ANDROID_RELEASE_SIGNING", "P02_APPLE_TEAM_ID"],
    consoleTasks: [],
    completionEvidence: [
      "微信开放平台移动应用审核通过后 only 记录 AppID ready；AppSecret 只导入 secret env。",
      "Android release 包必须用受控 release keystore 签名，并只记录微信 Android 签名非密钥证据。",
      "APPLE_TEAM_ID 从 Apple Developer 读取并导入 plain env。",
    ],
  }),
  Object.freeze({
    id: "PH02_BASE_CLOUD_RESOURCES",
    title: "确认 RDS PostgreSQL、OSS/RAM/STS 和 ACR 基础资源",
    authorizationPackets: ["P11_ALIYUN_RDS_DATA_MIGRATION", "P05_OSS_RAM_STS", "P03_ACR_PURCHASE"],
    consoleTasks: ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS"],
    completionEvidence: [
      "RDS PostgreSQL 必须完成实例、DATABASE_URL_CN secret env、schema/data 迁移、APP API smoke 和回滚验收；首版业务数据访问代码侧已切到 RDS repository。",
      "OSS 只记录 bucket、region、CORS、RAM/STS 最小权限布尔证据。",
      "ACR 只记录 registry host、namespace、repository、remote tag 和购买证据。",
    ],
  }),
  Object.freeze({
    id: "PH03_IMAGE_PUSH_AND_PULL",
    title: "推送后端镜像并配置 SAE 镜像拉取",
    authorizationPackets: ["P04_ACR_IMAGE_AND_PULL"],
    consoleTasks: ["C02_ACR_IMAGE_AND_PULL"],
    completionEvidence: [
      "image-publish.local.json 只记录 remote image、sha256 digest 和布尔状态。",
      "registry password、RAM Secret 或 token 不进入 JSON、Markdown、镜像或 git。",
    ],
  }),
  Object.freeze({
    id: "PH04_ENV_IMPORT",
    title: "导入 production-cn 环境变量",
    authorizationPackets: ["P06_ENV_IMPORT"],
    consoleTasks: ["C06_ENV_IMPORT"],
    completionEvidence: [
      "plain env 只放非密钥标识符和公开 URL。",
      "secret env 只通过 KMS/Secrets Manager/SAE secret env 导入。",
      "cloud-confirmations.local.json 只记录 importedAt、target、secretNotInImage=true 和 evidence handle。",
    ],
  }),
  Object.freeze({
    id: "PH05_SAE_RUNTIME_AND_SLS",
    title: "创建/确认 SAE runtime 和 SLS 告警",
    authorizationPackets: ["P08_SAE_RUNTIME_SLS"],
    consoleTasks: ["C01_SAE_RUNTIME", "C07_SLS_ALERTS"],
    completionEvidence: [
      "SAE cn-hangzhou 自定义容器应用名为 meiye-huajing-app-api-production-cn，端口 3000，健康检查 /api/healthz。",
      "SLS 配置 health 和 5xx 告警后只记录布尔证据。",
    ],
  }),
  Object.freeze({
    id: "PH06_DOMAIN_HTTPS_ICP",
    title: "配置 api-cn/assets-cn DNS、HTTPS、ICP",
    authorizationPackets: ["P07_DOMAIN_DNS_HTTPS"],
    consoleTasks: ["C03_API_DOMAIN_HTTPS_ICP", "C04_ASSET_DOMAIN_HTTPS_ICP"],
    completionEvidence: [
      "api-cn 指向阿里云后端公网入口，assets-cn 指向 OSS/CDN 资产入口。",
      "不能用旧 api/ip 记录、Vercel、localhost、example 或 198.18.0.x 作为 ready 证据。",
    ],
  }),
  Object.freeze({
    id: "PH07_PRODUCTION_DEPLOY",
    title: "执行 production-cn 部署和 postdeploy smoke",
    authorizationPackets: ["P09_PRODUCTION_DEPLOY"],
    consoleTasks: [],
    completionEvidence: [
      "所有 strict 门禁通过后才执行生产部署。",
      "部署后运行 postdeploy smoke、remote smoke 和 app api smoke。",
    ],
  }),
])

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

function buildPlan(args) {
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
  const backendStatus = runJson("backend_status", [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
  ])
  const packetsById = new Map([
    ...(actionAuthorization.authorizationPackets || []),
    ...(actionAuthorization.deferredAppLaunchPackets || []),
  ].map((item) => [item.packetId, item]))
  const consoleTasksById = new Map((consoleRunbook.consoleTasks || []).map((item) => [item.id, item]))
  const currentStartPacketIds = new Set(actionAuthorization.summary?.canStartNowPackets || [])
  const deferredAppLaunchPacketIds = new Set(actionAuthorization.summary?.deferredAppLaunchPackets || [])
  const deferredAppLaunchEnvNames = new Set([
    ...DEFAULT_DEFERRED_APP_LAUNCH_ENV_NAMES,
    ...(actionAuthorization.summary?.deferredAppLaunchBlocking || []),
  ])
  const phases = PHASES.map((phase) => buildPhase(phase, packetsById, consoleTasksById, {
    currentStartPacketIds,
    deferredAppLaunchPacketIds,
    deferredAppLaunchEnvNames,
  }))
  const currentInventoryGate = buildCurrentInventoryGate(backendStatus)
  const provisioningClosureBrief = buildProvisioningClosureBrief({
    consoleRunbook,
    actionAuthorization,
    phases,
    currentInventoryGate,
  })
  const currentReadyPhases = phases.filter((item) => item.canStartNow).map((item) => item.id)
  const currentBlockedPhases = phases
    .filter((item) => !item.canStartNow && !item.deferredAfterBackendOnline)
    .map((item) => item.id)
  const deferredPhases = phases
    .filter((item) => item.deferredAfterBackendOnline)
    .map((item) => item.id)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    executionMode: "plan_only",
    canCodexExecuteNow: false,
    currentScope: actionAuthorization.currentScope || "backend_aliyun_only",
    fullAppLaunchScope: actionAuthorization.fullAppLaunchScope || "deferred_after_backend_online",
    currentAnswer: "这是 provisioning 计划，不是执行结果；没有动作时确认前不能购买、创建、修改、推送镜像、导入密钥或部署 production-cn。",
    sourceCommands: {
      actionAuthorization: "corepack pnpm aliyun:action:authorization:backend",
      consoleRunbook: "corepack pnpm aliyun:console:runbook",
      backendStatus: "corepack pnpm aliyun:backend-cn:status",
    },
    targetRuntime: TARGET_RUNTIME,
    summary: {
      phases: phases.length,
      readyToStartPhases: currentReadyPhases,
      blockedPhases: currentBlockedPhases,
      deferredPhases,
      authorizationPackets: actionAuthorization.summary?.authorizationPackets || 0,
      consoleTasks: consoleRunbook.consoleTasks?.length || 0,
      canStartNowPackets: actionAuthorization.summary?.canStartNowPackets || [],
      deferredAppLaunchPackets: actionAuthorization.summary?.deferredAppLaunchPackets || [],
      canStartNowConsoleTasks: consoleRunbook.summary?.canStartNowConsoleTasks || [],
      requiredBlocking: actionAuthorization.summary?.requiredBlocking || [],
      cloudResourceReady: consoleRunbook.summary?.resourceReady || "unknown",
      userActionReady: actionAuthorization.summary?.userActionReady || consoleRunbook.summary?.userActionReady || "unknown",
      blockedCredentialCount: provisioningClosureBrief.blockedCredentialCount,
      readySecretEnvVariableCount: provisioningClosureBrief.readySecretEnvVariableCount,
      resourceEvidenceReady: provisioningClosureBrief.resourceEvidenceReady,
      blockedResourceEvidenceIds: provisioningClosureBrief.blockedResourceEvidenceIds,
      partiallyObservedResourceEvidenceIds: provisioningClosureBrief.partiallyObservedResourceEvidenceIds,
      cloudInventoryStrictReady: currentInventoryGate.strictReady,
      cloudInventoryReadyLocalOperations: currentInventoryGate.readyLocalOperations,
      cloudInventoryDryRunEvidence: currentInventoryGate.dryRunEvidence,
    },
    provisioningClosureBrief,
    currentInventoryGate,
    phases,
    readyAuthorizationPackets: (actionAuthorization.authorizationPackets || [])
      .filter((packet) => packet.canStartNow === true && currentStartPacketIds.has(packet.packetId))
      .map(compactReadyAuthorizationPacket),
    deferredAppLaunchAuthorizationPackets: [
      ...(actionAuthorization.authorizationPackets || []),
      ...(actionAuthorization.deferredAppLaunchPackets || []),
    ]
      .filter((packet) => deferredAppLaunchPacketIds.has(packet.packetId))
      .map(compactReadyAuthorizationPacket),
    readyActionPackets: (consoleRunbook.readyActionPackets || []).map(compactReadyActionPacket),
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
      "deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "deploy/aliyun-production-cn.image-publish.local.json",
      "/Users/Admin/Documents/美业话镜APP/.env.production-cn.local",
      "Aliyun SAE/KMS/Secrets Manager secret env",
    ],
    safetyBoundary: [
      "本计划不执行任何阿里云、微信、Apple、Vercel 或 git 写操作。",
      "本计划不读取或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、证书私钥或 Supabase service role key。",
      "执行任一 phase 前必须有动作时确认，且确认范围只覆盖该 phase。",
      "所有 .local.json 只能写资源名、布尔值、时间、控制台路径、digest 和非密钥 evidence handle。",
      "当前后端-only 目标不创建微信开放平台移动应用，也不执行 Android release signing 或 Apple Team ID/AASA 操作。",
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

function buildProvisioningClosureBrief({
  consoleRunbook,
  actionAuthorization,
  phases,
  currentInventoryGate,
}) {
  const runbookBrief = consoleRunbook.consoleClosureBrief || {}
  const authorizationBrief = actionAuthorization.authorizationClosureBrief || {}
  const closureBrief = Object.keys(authorizationBrief).length ? authorizationBrief : runbookBrief
  const blockedCredentialNames = closureBrief.blockedCredentialNames || []
  const readySecretEnvVariableNames = closureBrief.readySecretEnvVariableNames || []
  const readyToStartPhases = phases
    .filter((item) => item.canStartNow)
    .map((item) => item.id)
  const blockedPhases = phases
    .filter((item) => !item.canStartNow && !item.deferredAfterBackendOnline)
    .map((item) => item.id)
  const deferredPhases = phases
    .filter((item) => item.deferredAfterBackendOnline)
    .map((item) => item.id)

  return {
    conclusion: "现在不能部署；当前只推进阿里云后端，PH00/PH02 可进入动作时确认，微信移动 App、Android/iOS 发布凭证延期到后端上线后且不计入当前阻塞。",
    canDeployNow: consoleRunbook.summary?.canDeployNow === true,
    canCodexExecuteNow: false,
    blockedCredentialCount: closureBrief.blockedCredentialCount ?? blockedCredentialNames.length,
    blockedCredentialNames,
    readySecretEnvVariableCount: closureBrief.readySecretEnvVariableCount ?? readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    resourceEvidenceReady: closureBrief.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "unknown",
    blockedResourceEvidenceIds: closureBrief.blockedResourceEvidenceIds || consoleRunbook.summary?.blockedResourceEvidenceIds || [],
    partiallyObservedResourceEvidenceIds:
      closureBrief.partiallyObservedResourceEvidenceIds ||
      consoleRunbook.summary?.partiallyObservedResourceEvidenceIds ||
      [],
    blockedResourceEvidence: closureBrief.blockedResourceEvidence || [],
    readyToStartPhases,
    blockedPhases,
    deferredPhases,
    canStartNowAuthorizationPackets: actionAuthorization.summary?.canStartNowPackets || [],
    deferredAppLaunchPackets: actionAuthorization.summary?.deferredAppLaunchPackets || [],
    canStartNowConsoleTasks: consoleRunbook.summary?.canStartNowConsoleTasks || [],
    nextActionTimeConfirmations: actionAuthorization.summary?.nextActionTimeConfirmations || [],
    currentInventoryGate,
    requiredBlocking: actionAuthorization.summary?.requiredBlocking || [],
    actionTimeConfirmationRequired: filterDeferredAppLaunchActionIds(uniqueStrings([
      ...(runbookBrief.actionTimeConfirmationRequiredIds || []),
      ...(authorizationBrief.actionTimeConfirmationRequiredIds || []),
      ...(actionAuthorization.summary?.actionTimeConfirmationRequired || []),
    ])),
  }
}

function buildCurrentInventoryGate(backendStatus) {
  const cloudInventory = backendStatus.cloudInventory || {}
  const gapSummary = backendStatus.summary?.evidenceWritebackGapSummary || {}
  const fileSummary = readCloudInventoryFileSummary(backendStatus.files?.cloudInventoryResultsFile)
  const strictReady = cloudInventory.strictReady === true
  const readyLocalOperations = cloudInventory.readyLocalOperations || "unknown"
  const executedCommandResults = cloudInventory.executedCommandResults || "unknown"
  const mutationPerformedCommandResults = cloudInventory.mutationPerformedCommandResults ?? "unknown"
  const cloudInventoryResultGaps = gapSummary.cloudInventoryResultGaps ?? "unknown"
  const dryRunEvidence = fileSummary.operationCount > 0
    ? `${fileSummary.dryRunEvidenceCount}/${fileSummary.operationCount}`
    : "unknown"
  const failureCategories = fileSummary.failureCategories || []
  const currentEvidence = [
    `cloudInventoryStrictReady=${strictReady}`,
    `readyLocalOperations=${readyLocalOperations}`,
    `executedCommandResults=${executedCommandResults}`,
    `mutationPerformedCommandResults=${mutationPerformedCommandResults}`,
    `cloudInventoryResultGaps=${cloudInventoryResultGaps}`,
    `dryRunEvidence=${dryRunEvidence}`,
    ...(failureCategories.length ? [`failureCategories=${failureCategories.join(",")}`] : []),
  ]
  return {
    status: strictReady ? "strict_ready" : "not_ready",
    strictReady,
    readyLocalOperations,
    executedCommandResults,
    mutationPerformedCommandResults,
    cloudInventoryResultGaps,
    localInventoryFile: toBackendRelativePath(backendStatus.files?.cloudInventoryResultsFile),
    localFileExists: fileSummary.localFileExists,
    dryRunEvidence,
    dryRunEvidenceCount: fileSummary.dryRunEvidenceCount,
    operationCount: fileSummary.operationCount,
    failureCategories,
    currentEvidence,
    nextRequiredAction: strictReady
      ? "P00 strict inventory is current; continue with the next backend cloud evidence gate."
      : "动作时确认后恢复 CloudShell 或配置安全 Aliyun CLI profile，再重新运行 allowlisted 只读 inventory 并写回非密钥 evidence。",
  }
}

function readCloudInventoryFileSummary(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return {
      localFileExists: false,
      operationCount: 0,
      dryRunEvidenceCount: 0,
      failureCategories: [],
    }
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8"))
  const operations = Array.isArray(parsed.operations) ? parsed.operations : []
  const failureCategories = uniqueStrings(operations.flatMap((operation) => (
    Array.isArray(operation.commandResults) ? operation.commandResults : []
  ).map((result) => extractFailureCategory(result.outputSummary))))
  return {
    localFileExists: true,
    operationCount: operations.length,
    dryRunEvidenceCount: operations.filter((operation) => operation.evidence === "DRY_RUN_NOT_EXECUTED").length,
    failureCategories,
  }
}

function extractFailureCategory(outputSummary) {
  const match = String(outputSummary || "").match(/failureCategory=([^;\s]+)/)
  return match ? match[1] : ""
}

function toBackendRelativePath(filePath) {
  if (!filePath) return ""
  const resolvedPath = resolve(filePath)
  const prefix = `${BACKEND_ROOT}/`
  return resolvedPath.startsWith(prefix) ? resolvedPath.slice(prefix.length) : resolvedPath
}

function filterDeferredAppLaunchActionIds(ids) {
  return (ids || []).filter((id) => !DEFERRED_APP_LAUNCH_ACTION_ID_SET.has(id))
}

function buildPhase(phase, packetsById, consoleTasksById, {
  currentStartPacketIds,
  deferredAppLaunchPacketIds,
  deferredAppLaunchEnvNames,
}) {
  const packets = phase.authorizationPackets.map((id) => packetsById.get(id)).filter(Boolean)
  const consoleTasks = phase.consoleTasks.map((id) => consoleTasksById.get(id)).filter(Boolean)
  const missingPackets = phase.authorizationPackets.filter((id) => !packetsById.has(id))
  const missingConsoleTasks = phase.consoleTasks.filter((id) => !consoleTasksById.has(id))
  const deferredPacketIds = phase.authorizationPackets.filter((id) => deferredAppLaunchPacketIds.has(id))
  const currentScopeBlockedPackets = phase.authorizationPackets.filter((id) => (
    packetsById.has(id) &&
    !currentStartPacketIds.has(id) &&
    !deferredAppLaunchPacketIds.has(id)
  ))
  const blockingDependencies = uniqueStrings([
    ...packets.flatMap((item) => item.blockingDependencies || []),
    ...consoleTasks.flatMap((item) => item.blockingDependencies || []),
    ...missingPackets.map((id) => `missingPacket:${id}`),
    ...missingConsoleTasks.map((id) => `missingConsoleTask:${id}`),
    ...deferredPacketIds.map((id) => `deferredAfterBackendOnline:${id}`),
    ...currentScopeBlockedPackets.map((id) => `notReadyForCurrentScope:${id}`),
  ])
  const currentBlockers = filterDeferredAppLaunchEnvMentions(uniqueStrings([
    ...packets.flatMap((item) => item.currentBlockers || []),
    ...consoleTasks.flatMap((item) => item.currentBlockers || []),
    ...blockingDependencies.map((item) => `dependsOn:${item}`),
  ]), deferredAppLaunchEnvNames)
  const isDeferredAfterBackendOnline = phase.authorizationPackets.length > 0
    && phase.authorizationPackets.every((id) => deferredAppLaunchPacketIds.has(id))
  const canStartNow = !isDeferredAfterBackendOnline
    && phase.authorizationPackets.every((id) => currentStartPacketIds.has(id))
    && consoleTasks.every((item) => item.canStartNow === true)
    && missingPackets.length === 0
    && missingConsoleTasks.length === 0
  const compactedConsoleTasks = consoleTasks.map((task) => compactConsoleTask(task, {
    deferredAppLaunchEnvNames,
  }))
  return {
    id: phase.id,
    title: phase.title,
    status: isDeferredAfterBackendOnline
      ? "deferred_after_backend_online"
      : canStartNow ? "ready_for_action_time_confirmation" : "blocked_by_dependencies",
    canStartNow,
    deferredAfterBackendOnline: isDeferredAfterBackendOnline,
    requiresActionTimeConfirmation: true,
    authorizationPackets: packets.map(compactPacket),
    consoleTasks: compactedConsoleTasks,
    currentActionScopes: compactedConsoleTasks
      .filter((item) => item.currentActionScope)
      .map((item) => ({
        taskId: item.id,
        scope: item.currentActionScope,
      })),
    currentActionAcceptanceEvidence: uniqueStrings(compactedConsoleTasks.flatMap((item) => item.acceptanceEvidence || [])),
    deferredActions: uniqueStrings(compactedConsoleTasks.flatMap((item) => item.deferredActions || [])),
    blockingDependencies,
    currentBlockers,
    allowedActions: uniqueStrings(packets.flatMap((item) => item.allowedActions || [])),
    explicitlyExcluded: uniqueStrings([
      ...packets.flatMap((item) => item.explicitlyExcluded || []),
      ...consoleTasks.flatMap((item) => item.forbidden || []),
      ...(isDeferredAfterBackendOnline ? [
        "当前后端-only 目标不创建微信开放平台移动应用、不做 Android release signing、不读取 Apple Team ID。",
        "这些延期项只在阿里云后端上线后单独授权处理。",
      ] : []),
    ]),
    verifyCommands: uniqueStrings([
      ...packets.flatMap((item) => item.verifyCommands || []),
      ...consoleTasks.flatMap((item) => item.verifyCommands || []),
    ]),
    completionEvidence: phase.completionEvidence,
  }
}

function compactPacket(packet) {
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title || "",
    owner: packet.owner || "",
    deferredUntil: packet.deferredUntil || "",
    deferReason: packet.deferReason || "",
    canStartNow: packet.canStartNow === true,
    dependsOn: packet.dependsOn || [],
    blockingDependencies: packet.blockingDependencies || [],
    minimumUserPhrase: packet.minimumUserPhrase,
    allowedActions: packet.allowedActions || [],
    explicitlyExcluded: packet.explicitlyExcluded || [],
    completionEvidence: packet.completionEvidence || [],
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
}

function compactConsoleTask(task, {
  deferredAppLaunchEnvNames,
} = {}) {
  const acceptanceEvidence = task.currentActionAcceptanceEvidence?.length
    ? task.currentActionAcceptanceEvidence
    : task.completionEvidence || []
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    canStartNow: task.canStartNow === true,
    dependsOn: task.dependsOn || [],
    blockingDependencies: task.blockingDependencies || [],
    consolePath: task.consolePath,
    requiresActionTimeConfirmation: task.requiresActionTimeConfirmation === true,
    actionTimeConfirmationReason: task.actionTimeConfirmationReason || "",
    currentActionScope: task.currentActionScope || "",
    targetFields: task.targetFields || [],
    acceptanceEvidence: filterDeferredAppLaunchEnvMentions(
      normalizeBackendEvidence(acceptanceEvidence, deferredAppLaunchEnvNames),
      deferredAppLaunchEnvNames,
    ),
    completionEvidence: task.completionEvidence || [],
    deferredActions: task.deferredActions || [],
    writeTargets: task.writeTargets || [],
    verifyCommands: task.verifyCommands || [],
    forbidden: task.forbidden || [],
  }
}

function compactReadyActionPacket(packet) {
  return {
    taskId: packet.taskId,
    title: packet.title,
    currentActionScope: packet.currentActionScope || "full_task",
    minimumAuthorizationPhrase: packet.minimumAuthorizationPhrase,
    actionTimeConfirmationReason: packet.actionTimeConfirmationReason || "",
    acceptanceEvidence: packet.acceptanceEvidence || [],
    deferredActions: packet.deferredActions || [],
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
    forbidden: packet.forbidden || [],
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
}

function compactReadyAuthorizationPacket(packet) {
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title,
    sequenceGroup: packet.sequenceGroup || "",
    minimumUserPhrase: packet.minimumUserPhrase,
    allowedActions: packet.allowedActions || [],
    explicitlyExcluded: packet.explicitlyExcluded || [],
    completionEvidence: packet.completionEvidence || [],
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
}

function normalizeBackendEvidence(values, deferredAppLaunchEnvNames = new Set()) {
  return (values || []).flatMap((value) => {
    const text = String(value)
    if (text.startsWith("requiredReady=")) return []
    if (!text.startsWith("requiredBlocking=")) return [text]
    const currentNames = text
      .slice("requiredBlocking=".length)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !deferredAppLaunchEnvNames.has(item))
    return [`currentBackendRequiredBlocking=${currentNames.length ? currentNames.join(",") : "none"}`]
  })
}

function filterDeferredAppLaunchEnvMentions(values, deferredAppLaunchEnvNames = new Set()) {
  if (!deferredAppLaunchEnvNames || deferredAppLaunchEnvNames.size === 0) return values || []
  return (values || []).filter((value) => {
    const text = String(value)
    return !Array.from(deferredAppLaunchEnvNames).some((name) => isDeferredEnvBlocker(text, name))
  })
}

function isDeferredEnvBlocker(text, name) {
  return text === name ||
    text === `requiredEnv:${name}` ||
    text === `missing_required_env:${name}` ||
    text.includes(`:requiredEnv:${name}`) ||
    text.includes(`:missing_required_env:${name}`)
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
    "# 美业话镜 APP production-cn 阿里云 Provisioning Plan",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    "- Production-cn cannot be deployed now.",
    `- Execution mode: ${report.executionMode}`,
    `- executionMode=${report.executionMode}`,
    `- Current scope: ${report.currentScope}`,
    `- Full APP launch scope: ${report.fullAppLaunchScope}`,
    `- Can Codex execute now: ${report.canCodexExecuteNow}`,
    `- canCodexExecuteNow=${report.canCodexExecuteNow}`,
    `- canDeployNow=${report.provisioningClosureBrief.canDeployNow}`,
    `- provider=${report.targetRuntime.provider}`,
    `- region=${report.targetRuntime.region}`,
    `- appName=${report.targetRuntime.appName}`,
    `- runtime=${report.targetRuntime.runtime}`,
    `- containerPort=${report.targetRuntime.containerPort}`,
    `- healthPath=${report.targetRuntime.healthPath}`,
    `- strictHealthPath=${report.targetRuntime.strictHealthPath}`,
    `- apiHost=${report.targetRuntime.apiHost}`,
    `- assetHost=${report.targetRuntime.assetHost}`,
    `- ${report.targetRuntime.fallback}`,
    `- ${report.targetRuntime.dataLayer}`,
    `- Cloud resource ready: ${report.summary.cloudResourceReady}`,
    `- User action ready: ${report.summary.userActionReady}`,
    `- Ready phases: ${report.summary.readyToStartPhases.length ? report.summary.readyToStartPhases.join(", ") : "none"}`,
    `- Blocked phases: ${report.summary.blockedPhases.length ? report.summary.blockedPhases.join(", ") : "none"}`,
    `- Deferred phases: ${report.summary.deferredPhases.length ? report.summary.deferredPhases.join(", ") : "none"}`,
    `- Required blocking env: ${report.summary.requiredBlocking.length ? report.summary.requiredBlocking.join(", ") : "none"}`,
    `- Deferred APP launch packets: ${report.summary.deferredAppLaunchPackets.length ? report.summary.deferredAppLaunchPackets.join(", ") : "none"}`,
    `- Ready authorization packets: ${report.readyAuthorizationPackets.length ? report.readyAuthorizationPackets.map((item) => item.packetId).join(", ") : "none"}`,
    `- Deferred APP launch authorization packets: ${report.deferredAppLaunchAuthorizationPackets.length ? report.deferredAppLaunchAuthorizationPackets.map((item) => item.packetId).join(", ") : "none"}`,
    `- Ready console action packets: ${report.readyActionPackets.length ? report.readyActionPackets.map((item) => item.taskId).join(", ") : "none"}`,
    `- Blocked credential count: ${report.summary.blockedCredentialCount}`,
    `- Ready secret env variable count: ${report.summary.readySecretEnvVariableCount}`,
    `- Resource evidence ready: ${report.summary.resourceEvidenceReady}`,
    `- Blocked resource evidence ids: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- Partially observed resource evidence ids: ${report.summary.partiallyObservedResourceEvidenceIds.length ? report.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- Current P00 inventory gate: ${report.currentInventoryGate.status}`,
    `- cloudInventoryStrictReady=${report.currentInventoryGate.strictReady}`,
    `- readyLocalOperations=${report.currentInventoryGate.readyLocalOperations}`,
    `- dryRunEvidence=${report.currentInventoryGate.dryRunEvidence}`,
    "",
    "## 目标闭环证据简表",
    "",
    `- Conclusion: ${report.provisioningClosureBrief.conclusion}`,
    `- Can deploy now: ${report.provisioningClosureBrief.canDeployNow}`,
    `- Can Codex execute now: ${report.provisioningClosureBrief.canCodexExecuteNow}`,
    `- Blocked credential count: ${report.provisioningClosureBrief.blockedCredentialCount}`,
    `- Blocked credential names: ${report.provisioningClosureBrief.blockedCredentialNames.length ? report.provisioningClosureBrief.blockedCredentialNames.join(", ") : "none"}`,
    `- Ready secret env variable count: ${report.provisioningClosureBrief.readySecretEnvVariableCount}`,
    `- Resource evidence ready: ${report.provisioningClosureBrief.resourceEvidenceReady}`,
    `- Blocked resource evidence ids: ${report.provisioningClosureBrief.blockedResourceEvidenceIds.length ? report.provisioningClosureBrief.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- Partially observed resource evidence ids: ${report.provisioningClosureBrief.partiallyObservedResourceEvidenceIds.length ? report.provisioningClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- Ready to start phases: ${report.provisioningClosureBrief.readyToStartPhases.length ? report.provisioningClosureBrief.readyToStartPhases.join(", ") : "none"}`,
    `- Blocked phases: ${report.provisioningClosureBrief.blockedPhases.length ? report.provisioningClosureBrief.blockedPhases.join(", ") : "none"}`,
    `- Deferred phases: ${report.provisioningClosureBrief.deferredPhases.length ? report.provisioningClosureBrief.deferredPhases.join(", ") : "none"}`,
    `- Can start now authorization packets: ${report.provisioningClosureBrief.canStartNowAuthorizationPackets.length ? report.provisioningClosureBrief.canStartNowAuthorizationPackets.join(", ") : "none"}`,
    `- Deferred APP launch packets: ${report.provisioningClosureBrief.deferredAppLaunchPackets.length ? report.provisioningClosureBrief.deferredAppLaunchPackets.join(", ") : "none"}`,
    `- Can start now console tasks: ${report.provisioningClosureBrief.canStartNowConsoleTasks.length ? report.provisioningClosureBrief.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- Next action-time confirmations: ${report.provisioningClosureBrief.nextActionTimeConfirmations.length ? report.provisioningClosureBrief.nextActionTimeConfirmations.join(", ") : "none"}`,
    `- Current P00 inventory gate: ${report.provisioningClosureBrief.currentInventoryGate.status}`,
    "",
    "## 当前 P00 只读盘点门禁",
    "",
    `- Status: ${report.currentInventoryGate.status}`,
    `- cloudInventoryStrictReady=${report.currentInventoryGate.strictReady}`,
    `- readyLocalOperations=${report.currentInventoryGate.readyLocalOperations}`,
    `- executedCommandResults=${report.currentInventoryGate.executedCommandResults}`,
    `- mutationPerformedCommandResults=${report.currentInventoryGate.mutationPerformedCommandResults}`,
    `- cloudInventoryResultGaps=${report.currentInventoryGate.cloudInventoryResultGaps}`,
    `- localInventoryFile: ${report.currentInventoryGate.localInventoryFile || "unknown"}`,
    `- localFileExists: ${report.currentInventoryGate.localFileExists}`,
    `- dryRunEvidence=${report.currentInventoryGate.dryRunEvidence}`,
    `- failureCategories: ${report.currentInventoryGate.failureCategories.length ? report.currentInventoryGate.failureCategories.join(", ") : "none"}`,
    "- Current evidence:",
    ...report.currentInventoryGate.currentEvidence.map((item) => `  - ${item}`),
    `- Next required action: ${report.currentInventoryGate.nextRequiredAction}`,
    "",
    "## Ready Authorization Packets",
    "",
    ...(report.readyAuthorizationPackets.length
      ? report.readyAuthorizationPackets.flatMap((packet) => [
        `### ${packet.packetId} ${packet.title}`,
        "",
        `- Action id: ${packet.actionId}`,
        `- Sequence group: ${packet.sequenceGroup || "none"}`,
        `- Minimum user phrase: ${packet.minimumUserPhrase}`,
        `- Non-secret evidence only: ${packet.nonSecretEvidenceOnly}`,
        "- Allowed actions:",
        ...(packet.allowedActions.length ? packet.allowedActions.map((item) => `  - ${item}`) : ["  - none"]),
        "- Completion evidence:",
        ...(packet.completionEvidence.length ? packet.completionEvidence.map((item) => `  - ${item}`) : ["  - none"]),
        "- Write targets:",
        ...(packet.writeTargets.length ? packet.writeTargets.map((item) => `  - ${item}`) : ["  - none"]),
        "- Explicitly excluded:",
        ...(packet.explicitlyExcluded.length ? packet.explicitlyExcluded.map((item) => `  - ${item}`) : ["  - none"]),
        "",
      ])
      : ["- none", ""]),
    "",
    "## Phases",
    "",
    ...report.phases.flatMap((phase) => [
      `### ${phase.id} ${phase.title}`,
      "",
      `- Status: ${phase.status}`,
      `- Can start now: ${phase.canStartNow}`,
      `- Deferred after backend online: ${phase.deferredAfterBackendOnline}`,
      `- Requires action-time confirmation: ${phase.requiresActionTimeConfirmation}`,
      `- Authorization packets: ${phase.authorizationPackets.map((item) => item.packetId).join(", ") || "none"}`,
      `- Console tasks: ${phase.consoleTasks.map((item) => item.id).join(", ") || "none"}`,
      `- Current action scopes: ${phase.currentActionScopes.length ? phase.currentActionScopes.map((item) => `${item.taskId}=${item.scope}`).join(", ") : "none"}`,
      `- Current action scope handles: ${phase.currentActionScopes.length ? phase.currentActionScopes.map((item) => `currentActionScope=${item.scope}`).join(", ") : "none"}`,
      `- Blocking dependencies: ${phase.blockingDependencies.length ? phase.blockingDependencies.join(", ") : "none"}`,
      `- Current blockers: ${phase.currentBlockers.length ? phase.currentBlockers.join("; ") : "none"}`,
      `- Verify commands: ${phase.verifyCommands.length ? phase.verifyCommands.map((command) => `\`${command}\``).join("; ") : "none"}`,
      "- Current action acceptance evidence:",
      ...(phase.currentActionAcceptanceEvidence.length ? phase.currentActionAcceptanceEvidence.map((item) => `  - ${item}`) : ["  - none"]),
      "- Deferred actions:",
      ...(phase.deferredActions.length ? phase.deferredActions.map((item) => `  - ${item}`) : ["  - none"]),
      "- Completion evidence:",
      ...phase.completionEvidence.map((item) => `  - ${item}`),
      "- Explicitly excluded:",
      ...(phase.explicitlyExcluded.length ? phase.explicitlyExcluded.map((item) => `  - ${item}`) : ["  - none"]),
      "",
    ]),
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
    "本文件不包含任何密钥值，也不代表已执行任何云资源变更。",
  ].join("\n")
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-provisioning-plan.mjs [--env-file path] [--cloud-confirmations path] [--out path] [--markdown path]",
    "",
    "Builds a non-secret, plan-only provisioning sequence from the current action authorization matrix and Aliyun console runbook.",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildPlan(args)
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
