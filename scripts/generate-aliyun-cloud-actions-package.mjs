#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

const CLOUD_CONSOLE_PACKET_IDS = new Set(["P03_ACR_PURCHASE", "P05_OSS_RAM_STS"])
const EXTERNAL_APP_PACKET_IDS = new Set(["P01_WECHAT_OPEN_MOBILE_APP", "P10_ANDROID_RELEASE_SIGNING", "P02_APPLE_TEAM_ID"])

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
    maxBuffer: 1024 * 1024 * 50,
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

function envArgs(args) {
  return ["--env-file", args.envFile, "--cloud-confirmations", args.cloudConfirmationsFile]
}

function buildPackage(args) {
  const consoleRunbook = runJson("console_runbook", [
    "scripts/generate-aliyun-console-runbook.mjs",
    ...envArgs(args),
  ])
  const provisioningPlan = runJson("provisioning_plan", [
    "scripts/generate-aliyun-provisioning-plan.mjs",
    ...envArgs(args),
  ])
  const blockerBrief = runJson("blocker_brief", [
    "scripts/summarize-aliyun-blocker-brief.mjs",
    ...envArgs(args),
  ])
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    ...envArgs(args),
  ])
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--allow-incomplete",
  ])
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ])

  const consoleTasks = consoleRunbook.consoleTasks || []
  const immediateConsoleTasks = consoleTasks.filter((item) => item.canStartNow === true)
  const blockedConsoleTasks = consoleTasks.filter((item) => item.canStartNow !== true)
  const immediatePackets = blockerBrief.immediateAuthorizationPackets || []
  const cloudConsolePackets = immediatePackets.filter((item) => CLOUD_CONSOLE_PACKET_IDS.has(item.packetId))
  const externalAppPackets = immediatePackets.filter((item) => EXTERNAL_APP_PACKET_IDS.has(item.packetId))
  const phases = (provisioningPlan.phases || []).map(compactPhase)
  const firstCloudPhase = phases.find((item) => item.id === "PH02_BASE_CLOUD_RESOURCES") || null
  const cliConfigProbeFailureCategory = cloudAccess.cli?.configProbe?.failureCategory || cloudAccess.cliConfigProbeFailureCategory || "none"
  const cloudInventorySummary = summarizeCloudInventoryResults(cloudInventoryResults)
  const imagePublishWritebackPlan = compactImagePublishWritebackPlan(imagePublishPlan.writebackPlan)
  const readonlyInventoryUnblock = buildReadonlyInventoryUnblock(
    cloudAccess,
    cliConfigProbeFailureCategory,
    cloudInventorySummary,
  )
  const cloudActionClosureBrief = buildCloudActionClosureBrief({
    consoleRunbook,
    immediateConsoleTasks,
    blockedConsoleTasks,
    cloudConsolePackets,
    externalAppPackets,
    cloudInventorySummary,
    imagePublishWritebackPlan,
  })
  const currentBlockers = uniqueStrings([
    ...(blockerBrief.summary?.requiredBlocking || []).map((name) => `requiredEnv:${name}`),
    ...(blockedConsoleTasks || []).map((item) => `blockedConsoleTask:${item.id}`),
    ...(cloudInventorySummary.ready ? [] : (cloudAccess.blockers || [])),
    ...(cloudInventorySummary.ready ? [] : cloudInventorySummary.blockers.map((item) => `cloudInventory:${item}`)),
  ])
  const executionQueue = buildExecutionQueue(
    immediateConsoleTasks,
    blockedConsoleTasks,
    externalAppPackets,
    imagePublishWritebackPlan,
  )

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packageId: "C00_ALIYUN_CLOUD_ACTIONS",
    environment: "production-cn",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    currentAnswer: "现在不能部署；本包只把阿里云控制台可先做/需暂缓的动作拆成短清单，不创建资源、不付款、不导入密钥、不部署。",
    summary: {
      canDeployNow: blockerBrief.canDeployNow === true,
      verdict: blockerBrief.verdict || "blocked",
      cloudConfirmationsReady: blockerBrief.summary?.cloudConfirmationsReady || "unknown",
      operatorTasksReady: blockerBrief.summary?.operatorTasksReady || "unknown",
      canStartNowConsoleTasks: immediateConsoleTasks.map((item) => item.id),
      blockedByDependencies: blockedConsoleTasks.map((item) => item.id),
      cloudConsolePackets: cloudConsolePackets.map((item) => item.packetId),
      externalAppPackets: externalAppPackets.map((item) => item.packetId),
      requiredBlocking: blockerBrief.summary?.requiredBlocking || [],
      sensitiveBlocked: blockerBrief.summary?.sensitiveBlocked || "unknown",
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cloudInventoryResultsReady: cloudInventorySummary.ready,
      cloudInventoryReadyLocalOperations: `${cloudInventorySummary.readyLocalOperations}/${cloudInventorySummary.localOperations}`,
      cloudInventoryExecutedCommandResults: `${cloudInventorySummary.executedCommandResults}/${cloudInventorySummary.commandResults}`,
      imagePublishWritebackBlockingGroups: imagePublishWritebackPlan.blockingGroups,
      cliConfigProbeFailureCategory,
      blockedCredentialCount: cloudActionClosureBrief.blockedCredentialCount,
      readySecretEnvVariableCount: cloudActionClosureBrief.readySecretEnvVariableCount,
      resourceEvidenceReady: cloudActionClosureBrief.resourceEvidenceReady,
      blockedResourceEvidenceIds: cloudActionClosureBrief.blockedResourceEvidenceIds,
      partiallyObservedResourceEvidenceIds: cloudActionClosureBrief.partiallyObservedResourceEvidenceIds,
    },
    cloudActionClosureBrief,
    firstCloudPhase,
    executionQueue,
    immediateConsoleTasks: immediateConsoleTasks.map((task) => compactConsoleTask(task, imagePublishWritebackPlan)),
    blockedConsoleTasks: blockedConsoleTasks.map((task) => compactConsoleTask(task, imagePublishWritebackPlan)),
    cloudConsoleAuthorizationPackets: cloudConsolePackets.map(compactPacket),
    externalAppPrerequisitePackets: externalAppPackets.map(compactPacket),
    phaseOrder: phases,
    readonlyInventoryUnblock,
    cloudAccess: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true || cloudAccess.cliAvailable === true,
      cliConfigProbeReady: cloudAccess.cli?.configProbe?.ready === true || cloudAccess.cliConfigProbeReady === true,
      cliConfigProbeFailureCategory,
      workbenchTerminalConnected: cloudAccess.terminalAccess?.workbenchTerminal?.connected === true || cloudAccess.workbenchTerminalConnected === true,
      workbenchTerminalReadiness: cloudAccess.terminalAccess?.workbenchTerminal?.readiness || cloudAccess.workbenchTerminalReadiness || "unknown",
      blockers: cloudAccess.blockers || [],
    },
    cloudInventoryResults: cloudInventorySummary,
    imagePublishWritebackPlan,
    writeTargets: [
      "deploy/aliyun-production-cn.image-publish.local.json -> acr purchase/runtime non-secret evidence",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> runtime/apiDomainHttps/assetDomainHttps/oss/envImport/slsAlerts non-secret evidence",
      "阿里云 SAE plain env -> only public identifiers and URLs",
      "阿里云 KMS/Secrets Manager/SAE secret env -> secrets only, never in reports",
    ],
    strictVerificationOrder: blockerBrief.strictVerificationOrder || [
      "corepack pnpm aliyun:cloud:access",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
    nextSafeLocalCommands: uniqueStrings([
      "corepack pnpm aliyun:cloud-actions:package",
      ...(blockerBrief.nextSafeLocalCommands || []),
    ]),
    prohibitedWithoutActionTimeConfirmation: blockerBrief.prohibitedWithoutActionTimeConfirmation || [],
    currentBlockers,
    safetyBoundary: [
      "本命令只读本地无值报告，不调用阿里云 API。",
      "不购买 ACR，不创建或修改 SAE/SLS/OSS/RAM/KMS/Secrets Manager/DNS/证书/CDN。",
      "不读取、复制、粘贴或导入 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。",
      "不推送镜像、不部署 production-cn、不 git push。",
      "所有 .local.json 只能写资源名、布尔值、时间、控制台路径、digest 和非密钥 evidence handle。",
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

function buildCloudActionClosureBrief({
  consoleRunbook,
  immediateConsoleTasks,
  blockedConsoleTasks,
  cloudConsolePackets,
  externalAppPackets,
  cloudInventorySummary,
  imagePublishWritebackPlan,
}) {
  const runbookBrief = consoleRunbook.consoleClosureBrief || {}
  const blockedCredentialNames =
    runbookBrief.blockedCredentialNames ||
    []
  const readySecretEnvVariableNames =
    runbookBrief.readySecretEnvVariableNames ||
    []
  const blockedResourceEvidenceIds =
    runbookBrief.blockedResourceEvidenceIds ||
    consoleRunbook.summary?.blockedResourceEvidenceIds ||
    []

  return {
    conclusion: "现在不能部署；本动作包只能进入 C02/C05 的动作时确认，其余资源、微信开放平台移动 App、iOS/Android 发布凭证和 secret env 导入仍未闭环。",
    canDeployNow: consoleRunbook.summary?.canDeployNow === true,
    blockedCredentialCount: runbookBrief.blockedCredentialCount ?? blockedCredentialNames.length,
    blockedCredentialNames,
    readySecretEnvVariableCount: runbookBrief.readySecretEnvVariableCount ?? readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    resourceEvidenceReady: runbookBrief.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "unknown",
    blockedResourceEvidenceIds,
    partiallyObservedResourceEvidenceIds:
      runbookBrief.partiallyObservedResourceEvidenceIds ||
      consoleRunbook.summary?.partiallyObservedResourceEvidenceIds ||
      [],
    blockedResourceEvidence: runbookBrief.blockedResourceEvidence || [],
    strictReadonlyInventoryReady: cloudInventorySummary.ready === true,
    cloudInventoryReadyLocalOperations: `${cloudInventorySummary.readyLocalOperations}/${cloudInventorySummary.localOperations}`,
    cloudInventoryExecutedCommandResults: `${cloudInventorySummary.executedCommandResults}/${cloudInventorySummary.commandResults}`,
    mutationPerformedCommandResults: cloudInventorySummary.mutationPerformedCommandResults,
    canStartNowConsoleTasks: immediateConsoleTasks.map((item) => item.id),
    cloudConsolePackets: cloudConsolePackets.map((item) => item.packetId),
    externalAppPackets: externalAppPackets.map((item) => item.packetId),
    blockedByDependencies: blockedConsoleTasks.map((item) => item.id),
    imagePublishWritebackBlockingGroups: imagePublishWritebackPlan.blockingGroups,
    stillRequiresActionTimeConfirmation: uniqueStrings([
      ...(runbookBrief.actionTimeConfirmationRequiredIds || []),
      ...cloudConsolePackets.map((item) => item.packetId),
      ...externalAppPackets.map((item) => item.packetId),
    ]),
  }
}

function buildExecutionQueue(immediateConsoleTasks, blockedConsoleTasks, externalAppPackets, imagePublishWritebackPlan) {
  return {
    canStartNow: immediateConsoleTasks.map((task) => {
      const compact = compactConsoleTask(task, imagePublishWritebackPlan)
      const currentActionAcceptanceEvidence = compact.currentActionAcceptanceEvidence?.length
        ? compact.currentActionAcceptanceEvidence
        : compact.completionEvidence
      return {
        id: compact.id,
        kind: "aliyun_console_task",
        title: compact.title,
        owner: task.owner || "阿里云操作员",
        requiresActionTimeConfirmation: true,
        minimumAuthorizationPhrase: compact.minimumAuthorizationPhrase,
        currentActionScope: compact.currentActionScope || "full_task",
        currentActionAcceptanceEvidence,
        consolePath: compact.consolePath,
        writeTargets: compact.writeTargets,
        verifyCommands: compact.verifyCommands,
        completionEvidence: currentActionAcceptanceEvidence,
        deferredActions: compact.deferredActions,
        deferredWritebackGroups: compact.deferredWritebackGroups || [],
        forbidden: compact.forbidden,
      }
    }),
    externalAppPrerequisites: externalAppPackets.map((packet) => {
      const compact = compactPacket(packet)
      return {
        packetId: compact.packetId,
        kind: "external_platform_prerequisite",
        title: compact.title,
        owner: compact.owner,
        requiresActionTimeConfirmation: true,
        minimumAuthorizationPhrase: compact.minimumAuthorizationPhrase,
        writeTargets: compact.writeTargets,
        verifyCommands: compact.verifyCommands,
        completionEvidence: compact.completionEvidence,
        explicitlyExcluded: compact.explicitlyExcluded,
      }
    }),
    blockedByDependencies: blockedConsoleTasks.map((task) => {
      const compact = compactConsoleTask(task, imagePublishWritebackPlan)
      return {
        id: compact.id,
        kind: "aliyun_console_task",
        title: compact.title,
        owner: task.owner || "阿里云操作员",
        status: compact.status,
        dependsOn: compact.dependsOn,
        blockingDependencies: compact.blockingDependencies,
        currentBlockers: compact.currentBlockers,
        nextActions: compact.nextActions,
        verifyCommands: compact.verifyCommands,
      }
    }),
  }
}

function compactImagePublishWritebackPlan(writebackPlan = {}) {
  const groups = (writebackPlan.groups || []).map((group) => ({
    id: group.id,
    title: group.title,
    actionScope: group.actionScope,
    ready: group.ready === true,
    canStartNow: group.canStartNow === true,
    dependsOnGroups: group.dependsOnGroups || [],
    requiredAuthorizationPackets: group.requiredAuthorizationPackets || [],
    blockers: group.blockers || [],
    writeTargets: group.writeTargets || [],
    expectedEvidence: group.expectedEvidence || [],
    forbidden: group.forbidden || [],
    verifyCommands: group.verifyCommands || [],
    nonSecretEvidenceOnly: group.nonSecretEvidenceOnly === true,
  }))
  return {
    ready: writebackPlan.ready === true,
    totalBlockers: Number(writebackPlan.totalBlockers || 0),
    blockingGroups: writebackPlan.blockingGroups || groups.filter((group) => !group.ready).map((group) => group.id),
    requiredAuthorizationPackets: writebackPlan.requiredAuthorizationPackets || [],
    strictVerificationOrder: writebackPlan.strictVerificationOrder || [],
    groups,
  }
}

function imageWritebackGroup(plan, id) {
  return (plan.groups || []).find((group) => group.id === id) || null
}

function summarizeCloudInventoryResults(cloudInventoryResults) {
  const local = cloudInventoryResults.local || {}
  const observationSummary = local.observationSummary || {}
  const summary = cloudInventoryResults.summary || {}
  const localOperations = Number(summary.localOperations || observationSummary.operations || local.checkedOperations || 0)
  const readyLocalOperations = Number(summary.readyLocalOperations || observationSummary.strictReadyOperations || 0)
  const commandResults = Number(observationSummary.commandResults || 0)
  const executedCommandResults = Number(observationSummary.executedCommandResults || 0)
  const cloudApiCalledCommandResults = Number(observationSummary.cloudApiCalledCommandResults || 0)
  const mutationPerformedCommandResults = Number(observationSummary.mutationPerformedCommandResults || 0)
  const ready =
    local.exists === true &&
    local.ready === true &&
    localOperations > 0 &&
    readyLocalOperations === localOperations &&
    commandResults > 0 &&
    executedCommandResults === commandResults &&
    cloudApiCalledCommandResults === commandResults &&
    mutationPerformedCommandResults === 0
  return {
    exists: local.exists === true,
    ready,
    localReady: local.ready === true,
    localOperations,
    readyLocalOperations,
    commandResults,
    executedCommandResults,
    cloudApiCalledCommandResults,
    mutationPerformedCommandResults,
    observedOperationIds: observationSummary.observedOperationIds || [],
    notFoundOperationIds: observationSummary.notFoundOperationIds || [],
    blockedOperationIds: observationSummary.blockedOperationIds || [],
    blockers: local.blockers || [],
    evidence: ready
      ? [
          `readyLocalOperations=${readyLocalOperations}/${localOperations}`,
          `executedCommandResults=${executedCommandResults}/${commandResults}`,
          `cloudApiCalledCommandResults=${cloudApiCalledCommandResults}`,
          `mutationPerformedCommandResults=${mutationPerformedCommandResults}`,
        ]
      : [],
  }
}

function buildReadonlyInventoryUnblock(cloudAccess, cliConfigProbeFailureCategory, cloudInventorySummary) {
  const workbenchTerminal = cloudAccess.terminalAccess?.workbenchTerminal || {}
  const inventoryReady = cloudInventorySummary.ready === true
  return {
    status: inventoryReady
      ? "strict_inventory_evidence_ready"
      : (cloudAccess.canReadCloudNow === true ? "ready_to_execute_allowlisted_readonly_inventory" : "blocked_until_cli_or_cloudshell_identity_ready"),
    currentBlocker: inventoryReady ? "none" : (cliConfigProbeFailureCategory || "unknown"),
    currentEvidence: cloudInventorySummary.evidence,
    whyConsoleLoginIsNotEnough: inventoryReady
      ? "严格云证据已来自 allowlisted Aliyun CLI/CloudShell List/Describe/stat/get 命令摘要；后续云资源创建、购买、DNS、密钥导入和部署仍需动作时确认。"
      : "浏览器控制台登录、ECS Workbench 终端可见、或 OSS/SLS 页面可见，只能作为人工观察证据；严格云证据必须来自 allowlisted Aliyun CLI/CloudShell List/Describe/stat/get 命令结果，且不记录原始敏感输出。",
    minimumAuthorizationPhrase: "授权在本机 Aliyun CLI 或阿里云 CloudShell 中配置只读身份，并只运行 allowlisted production-cn inventory 命令；不输出 AccessKeySecret、STS token、cookie、registry password 或证书私钥。",
    allowedIdentityPaths: [
      {
        id: "local_aliyun_cli",
        title: "本机 Aliyun CLI default profile",
        currentStatus: cloudAccess.cli?.configProbe?.ready === true ? "ready" : cliConfigProbeFailureCategory || "not_ready",
        allowedActions: [
          "使用阿里云官方 CLI 登录或受控 RAM/STS 只读凭据配置 default profile。",
          "region 使用 cn-hangzhou。",
          "配置完成后只运行本仓库 inventory runner 生成非密钥摘要。",
        ],
      },
      {
        id: "aliyun_cloudshell",
        title: "阿里云 CloudShell 登录身份",
        currentStatus: cloudAccess.cloudShellObservation?.ready === true ? "ready" : "not_ready_or_unread",
        allowedActions: [
          "在 CloudShell 中运行 inventory 计划中的 List/Describe/stat/get 类命令。",
          "只抄录资源名、状态、digest、时间戳和非密钥 evidence handle。",
          "如果 CloudShell 无法访问本仓库，就回到本机手工回填 ignored 的 .local.json。",
        ],
      },
      {
        id: "ecs_workbench_terminal",
        title: "ECS Workbench 终端",
        currentStatus: workbenchTerminal.connected === true ? "connected_not_inventory_ready" : "not_ready",
        allowedActions: [
          "只把连接状态作为人工观察证据。",
          "只有确认该终端有 Aliyun CLI 只读身份，并运行 allowlisted inventory 命令后，才可回填严格证据。",
        ],
      },
    ],
    unlockCommands: [
      "corepack pnpm aliyun:cloud:access",
      "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
      "corepack pnpm aliyun:completion:audit",
    ],
    expectedNonSecretEvidenceAfterUnlock: [
      inventoryReady ? `readyLocalOperations = ${cloudInventorySummary.readyLocalOperations}/${cloudInventorySummary.localOperations}` : "executedCommandResults > 0",
      inventoryReady ? `executedCommandResults = ${cloudInventorySummary.executedCommandResults}/${cloudInventorySummary.commandResults}` : "cloudApiCalledCommandResults > 0",
      `mutationPerformedCommandResults = ${cloudInventorySummary.mutationPerformedCommandResults}`,
      "each command output stored only as summary counts, exit code, sha256 fingerprint, timestamp, and evidence handle",
    ],
    forbidden: [
      "不要把 AccessKeySecret、STS token、cookie、registry password、RAM Secret、Supabase service role key 或证书私钥写入 JSON、Markdown、Docker 镜像、截图、聊天或 git。",
      "不要运行 Create/Update/Delete/Deploy/Start/Stop/GetAuthorizationToken/docker login/docker push/oss cp/oss cat/oss sign。",
      "不要把控制台页面可见或 Workbench 已连接误标记成 cloudInventory strict ready。",
    ],
  }
}

function compactConsoleTask(task, imagePublishWritebackPlan = {}) {
  const base = {
    id: task.id,
    title: task.title,
    status: task.status,
    canStartNow: task.canStartNow === true,
    dependsOn: task.dependsOn || [],
    blockingDependencies: task.blockingDependencies || [],
    consolePath: task.consolePath || "",
    minimumAuthorizationPhrase: matchingAuthorizationPhrase(task),
    currentActionScope: task.currentActionScope || "",
    currentActionAcceptanceEvidence: task.currentActionAcceptanceEvidence || [],
    targetFields: task.targetFields || [],
    writeTargets: task.writeTargets || [],
    currentBlockers: task.currentBlockers || [],
    nextActions: task.nextActions || [],
    verifyCommands: task.verifyCommands || [],
    completionEvidence: task.completionEvidence || [],
    deferredActions: task.deferredActions || [],
    forbidden: task.forbidden || [],
    mutationPerformedByThisCommand: task.mutationPerformedByThisCommand === true,
  }
  if (task.id !== "C02_ACR_IMAGE_AND_PULL") return base

  const currentGroup = imageWritebackGroup(imagePublishWritebackPlan, "acrPurchaseAndRepository")
  const deferredGroups = ["imagePushAndDigest", "saeRuntimeImagePull"]
    .map((id) => imageWritebackGroup(imagePublishWritebackPlan, id))
    .filter(Boolean)
  const currentActionAcceptanceEvidence = base.currentActionAcceptanceEvidence.length
    ? base.currentActionAcceptanceEvidence
    : currentGroup?.expectedEvidence || []
  const deferredGroupLines = deferredGroups.map((group) => {
    const packets = group.requiredAuthorizationPackets.join(", ") || "none"
    const blockers = group.blockers.join(", ") || "none"
    return `${group.id} 需等待 ${packets}；当前 blockers: ${blockers}`
  })

  return {
    ...base,
    currentActionScope: currentGroup?.actionScope || base.currentActionScope || "purchase_and_repository_only",
    currentActionAcceptanceEvidence,
    currentActionBlockers: currentGroup?.blockers || [],
    writeTargets: currentGroup?.writeTargets?.length ? currentGroup.writeTargets : base.writeTargets,
    verifyCommands: currentGroup?.verifyCommands?.length ? currentGroup.verifyCommands : base.verifyCommands,
    completionEvidence: currentActionAcceptanceEvidence,
    deferredActions: uniqueStrings([
      ...base.deferredActions,
      ...deferredGroupLines,
    ]),
    deferredWritebackGroups: deferredGroups.map((group) => ({
      id: group.id,
      actionScope: group.actionScope,
      requiredAuthorizationPackets: group.requiredAuthorizationPackets,
      blockers: group.blockers,
      writeTargets: group.writeTargets,
      verifyCommands: group.verifyCommands,
    })),
  }
}

function matchingAuthorizationPhrase(task) {
  if (task.id === "C02_ACR_IMAGE_AND_PULL") {
    return "授权购买/确认 ACR 企业版实例和镜像仓库基础信息；不执行 docker login/push，不记录 registry password。"
  }
  if (task.id === "C05_OSS_AUDIO_RAM_STS") {
    return "授权确认 OSS 音频 bucket、CORS、RAM 最小权限或 STS/运行时角色；Secret 只进阿里云受控密钥环境。"
  }
  return task.actionTimeConfirmationReason || ""
}

function compactPacket(packet) {
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title,
    owner: packet.owner,
    sequenceGroup: packet.sequenceGroup,
    minimumAuthorizationPhrase: packet.minimumUserPhrase || packet.minimumAuthorizationPhrase || "",
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
    completionEvidence: packet.completionEvidence || [],
    explicitlyExcluded: packet.explicitlyExcluded || [],
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
}

function compactPhase(phase) {
  return {
    id: phase.id,
    title: phase.title,
    status: phase.status,
    canStartNow: phase.canStartNow === true,
    authorizationPackets: (phase.authorizationPackets || []).map((item) => item.packetId),
    consoleTasks: (phase.consoleTasks || []).map((item) => item.id),
    blockingDependencies: phase.blockingDependencies || [],
    currentBlockers: phase.currentBlockers || [],
    completionEvidence: phase.completionEvidence || [],
  }
}

function renderMarkdown(report) {
  return [
    "# 阿里云控制台动作包",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- packageId: ${report.packageId}`,
    `- canDeployNow: ${report.summary.canDeployNow}`,
    `- verdict: ${report.summary.verdict}`,
    `- cloudConfirmationsReady: ${report.summary.cloudConfirmationsReady}`,
    `- operatorTasksReady: ${report.summary.operatorTasksReady}`,
    `- canReadCloudNow: ${report.summary.canReadCloudNow}`,
    `- cloudInventoryResultsReady: ${report.summary.cloudInventoryResultsReady}`,
    `- cloudInventoryReadyLocalOperations: ${report.summary.cloudInventoryReadyLocalOperations}`,
    `- cloudInventoryExecutedCommandResults: ${report.summary.cloudInventoryExecutedCommandResults}`,
    `- cliConfigProbeFailureCategory: ${report.summary.cliConfigProbeFailureCategory}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- resourceEvidenceReady: ${report.summary.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.summary.partiallyObservedResourceEvidenceIds.length ? report.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    "",
    "## 目标闭环证据简表",
    "",
    `- conclusion: ${report.cloudActionClosureBrief.conclusion}`,
    `- canDeployNow: ${report.cloudActionClosureBrief.canDeployNow}`,
    `- blockedCredentialCount: ${report.cloudActionClosureBrief.blockedCredentialCount}`,
    `- blockedCredentialNames: ${report.cloudActionClosureBrief.blockedCredentialNames.length ? report.cloudActionClosureBrief.blockedCredentialNames.join(", ") : "none"}`,
    `- readySecretEnvVariableCount: ${report.cloudActionClosureBrief.readySecretEnvVariableCount}`,
    `- resourceEvidenceReady: ${report.cloudActionClosureBrief.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.cloudActionClosureBrief.blockedResourceEvidenceIds.length ? report.cloudActionClosureBrief.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.length ? report.cloudActionClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- strictReadonlyInventoryReady: ${report.cloudActionClosureBrief.strictReadonlyInventoryReady}`,
    `- cloudInventoryReadyLocalOperations: ${report.cloudActionClosureBrief.cloudInventoryReadyLocalOperations}`,
    `- cloudInventoryExecutedCommandResults: ${report.cloudActionClosureBrief.cloudInventoryExecutedCommandResults}`,
    `- mutationPerformedCommandResults: ${report.cloudActionClosureBrief.mutationPerformedCommandResults}`,
    `- canStartNowConsoleTasks: ${report.cloudActionClosureBrief.canStartNowConsoleTasks.length ? report.cloudActionClosureBrief.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- cloudConsolePackets: ${report.cloudActionClosureBrief.cloudConsolePackets.length ? report.cloudActionClosureBrief.cloudConsolePackets.join(", ") : "none"}`,
    `- externalAppPackets: ${report.cloudActionClosureBrief.externalAppPackets.length ? report.cloudActionClosureBrief.externalAppPackets.join(", ") : "none"}`,
    `- blockedByDependencies: ${report.cloudActionClosureBrief.blockedByDependencies.length ? report.cloudActionClosureBrief.blockedByDependencies.join(", ") : "none"}`,
    `- imagePublishWritebackBlockingGroups: ${report.cloudActionClosureBrief.imagePublishWritebackBlockingGroups.length ? report.cloudActionClosureBrief.imagePublishWritebackBlockingGroups.join(", ") : "none"}`,
    "",
    "## 下一步执行队列",
    "",
    `- canStartNow: ${report.executionQueue.canStartNow.map((item) => item.id).join(", ") || "none"}`,
    `- externalAppPrerequisites: ${report.executionQueue.externalAppPrerequisites.map((item) => item.packetId).join(", ") || "none"}`,
    `- blockedByDependencies: ${report.executionQueue.blockedByDependencies.map((item) => item.id).join(", ") || "none"}`,
    ...(report.executionQueue.canStartNow.length
      ? report.executionQueue.canStartNow.map((item) => `- ${item.id}: kind=${item.kind}; scope=${item.currentActionScope}; phrase=${item.minimumAuthorizationPhrase}`)
      : ["- canStartNowItems: none"]),
    ...(report.executionQueue.externalAppPrerequisites.length
      ? report.executionQueue.externalAppPrerequisites.map((item) => `- ${item.packetId}: kind=${item.kind}; phrase=${item.minimumAuthorizationPhrase}`)
      : ["- externalAppPrerequisiteItems: none"]),
    "",
    "## 只读盘点解锁",
    "",
    `- status: ${report.readonlyInventoryUnblock.status}`,
    `- currentBlocker: ${report.readonlyInventoryUnblock.currentBlocker}`,
    `- currentEvidence: ${report.readonlyInventoryUnblock.currentEvidence.join("；") || "none"}`,
    `- minimumAuthorizationPhrase: ${report.readonlyInventoryUnblock.minimumAuthorizationPhrase}`,
    `- whyConsoleLoginIsNotEnough: ${report.readonlyInventoryUnblock.whyConsoleLoginIsNotEnough}`,
    "- unlockCommands:",
    ...report.readonlyInventoryUnblock.unlockCommands.map((command) => `  - ${command}`),
    "- forbidden:",
    ...report.readonlyInventoryUnblock.forbidden.map((item) => `  - ${item}`),
    "",
    "## 当前可先做",
    "",
    ...(report.immediateConsoleTasks.length
      ? report.immediateConsoleTasks.flatMap((task) => [
          `### ${task.id} ${task.title}`,
          "",
          `- consolePath: ${task.consolePath}`,
          `- minimumAuthorizationPhrase: ${task.minimumAuthorizationPhrase}`,
          `- currentActionScope: ${task.currentActionScope || "full_task"}`,
          `- currentActionAcceptanceEvidence: ${task.currentActionAcceptanceEvidence.join("；") || "none"}`,
          `- writeTargets: ${task.writeTargets.join("；") || "none"}`,
          `- verifyCommands: ${task.verifyCommands.join("；") || "none"}`,
          `- deferredActions: ${task.deferredActions.join("；") || "none"}`,
          "",
        ])
      : ["- none", ""]),
    "## 必须暂缓",
    "",
    ...(report.blockedConsoleTasks.length
      ? report.blockedConsoleTasks.map((task) => `- ${task.id}: dependsOn=${task.blockingDependencies.join(", ") || "none"}; blockers=${task.currentBlockers.slice(0, 6).join(", ") || "none"}`)
      : ["- none"]),
    "",
    "## 云侧动作授权包",
    "",
    ...(report.cloudConsoleAuthorizationPackets.length
      ? report.cloudConsoleAuthorizationPackets.map((packet) => `- ${packet.packetId}: ${packet.minimumAuthorizationPhrase}`)
      : ["- none"]),
    "",
    "## 外部 App 前置项",
    "",
    ...(report.externalAppPrerequisitePackets.length
      ? report.externalAppPrerequisitePackets.map((packet) => `- ${packet.packetId}: ${packet.minimumAuthorizationPhrase}`)
      : ["- none"]),
    "",
    "## 严格验证顺序",
    "",
    ...report.strictVerificationOrder.map((command) => `- ${command}`),
    "",
    "## 禁止项",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    ...report.prohibitedWithoutActionTimeConfirmation.map((item) => `- ${item}`),
    "",
    "## 当前阻塞",
    "",
    ...(report.currentBlockers.length ? report.currentBlockers.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n")
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean).map((item) => String(item)))]
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) matches.push(path)
    }
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

function printHelp() {
  console.log([
    "Usage: node scripts/generate-aliyun-cloud-actions-package.mjs [options]",
    "",
    "Options:",
    "  --env-file <path>              production-cn env file to inspect without printing values",
    "  --cloud-confirmations <path>   local non-secret cloud confirmation file",
    "  --out <path>                   write JSON report",
    "  --markdown <path>              write Markdown report",
  ].join("\n"))
}

const args = parseArgs(process.argv)
const report = buildPackage(args)
if (args.outPath) writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
if (args.markdownPath) writeFileSync(args.markdownPath, `${renderMarkdown(report)}\n`, { mode: 0o600 })
console.log(JSON.stringify(report, null, 2))
