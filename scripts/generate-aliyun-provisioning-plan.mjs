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
    title: "确认 ACR 购买候选和 OSS/RAM/STS 基础资源",
    authorizationPackets: ["P03_ACR_PURCHASE", "P05_OSS_RAM_STS"],
    consoleTasks: ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS"],
    completionEvidence: [
      "ACR 只记录 registry host、namespace、repository、remote tag 和购买证据。",
      "OSS 只记录 bucket、region、CORS、RAM/STS 最小权限布尔证据。",
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
  const packetsById = new Map((actionAuthorization.authorizationPackets || []).map((item) => [item.packetId, item]))
  const consoleTasksById = new Map((consoleRunbook.consoleTasks || []).map((item) => [item.id, item]))
  const phases = PHASES.map((phase) => buildPhase(phase, packetsById, consoleTasksById))
  const provisioningClosureBrief = buildProvisioningClosureBrief({
    consoleRunbook,
    actionAuthorization,
    phases,
  })
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
    currentAnswer: "这是 provisioning 计划，不是执行结果；没有动作时确认前不能购买、创建、修改、推送镜像、导入密钥或部署 production-cn。",
    sourceCommands: {
      actionAuthorization: "corepack pnpm aliyun:action:authorization",
      consoleRunbook: "corepack pnpm aliyun:console:runbook",
    },
    summary: {
      phases: phases.length,
      readyToStartPhases: phases.filter((item) => item.canStartNow).map((item) => item.id),
      blockedPhases: phases.filter((item) => !item.canStartNow).map((item) => item.id),
      authorizationPackets: actionAuthorization.summary?.authorizationPackets || 0,
      consoleTasks: consoleRunbook.consoleTasks?.length || 0,
      canStartNowPackets: actionAuthorization.summary?.canStartNowPackets || [],
      canStartNowConsoleTasks: consoleRunbook.summary?.canStartNowConsoleTasks || [],
      requiredBlocking: actionAuthorization.summary?.requiredBlocking || [],
      cloudResourceReady: consoleRunbook.summary?.resourceReady || "unknown",
      userActionReady: consoleRunbook.summary?.userActionReady || "unknown",
      blockedCredentialCount: provisioningClosureBrief.blockedCredentialCount,
      readySecretEnvVariableCount: provisioningClosureBrief.readySecretEnvVariableCount,
      resourceEvidenceReady: provisioningClosureBrief.resourceEvidenceReady,
      blockedResourceEvidenceIds: provisioningClosureBrief.blockedResourceEvidenceIds,
      partiallyObservedResourceEvidenceIds: provisioningClosureBrief.partiallyObservedResourceEvidenceIds,
    },
    provisioningClosureBrief,
    phases,
    readyAuthorizationPackets: (actionAuthorization.authorizationPackets || [])
      .filter((packet) => packet.canStartNow === true)
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
}) {
  const runbookBrief = consoleRunbook.consoleClosureBrief || {}
  const blockedCredentialNames = runbookBrief.blockedCredentialNames || []
  const readySecretEnvVariableNames = runbookBrief.readySecretEnvVariableNames || []
  const readyToStartPhases = phases
    .filter((item) => item.canStartNow)
    .map((item) => item.id)
  const blockedPhases = phases
    .filter((item) => !item.canStartNow)
    .map((item) => item.id)

  return {
    conclusion: "现在不能部署；PH01/PH02 只表示可进入动作时确认，不代表微信移动 App、Android/iOS 发布凭证、阿里云资源证据或 secret env 已闭环。",
    canDeployNow: consoleRunbook.summary?.canDeployNow === true,
    canCodexExecuteNow: false,
    blockedCredentialCount: runbookBrief.blockedCredentialCount ?? blockedCredentialNames.length,
    blockedCredentialNames,
    readySecretEnvVariableCount: runbookBrief.readySecretEnvVariableCount ?? readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    resourceEvidenceReady: runbookBrief.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "unknown",
    blockedResourceEvidenceIds: runbookBrief.blockedResourceEvidenceIds || consoleRunbook.summary?.blockedResourceEvidenceIds || [],
    partiallyObservedResourceEvidenceIds:
      runbookBrief.partiallyObservedResourceEvidenceIds ||
      consoleRunbook.summary?.partiallyObservedResourceEvidenceIds ||
      [],
    blockedResourceEvidence: runbookBrief.blockedResourceEvidence || [],
    readyToStartPhases,
    blockedPhases,
    canStartNowAuthorizationPackets: actionAuthorization.summary?.canStartNowPackets || [],
    canStartNowConsoleTasks: consoleRunbook.summary?.canStartNowConsoleTasks || [],
    nextActionTimeConfirmations: actionAuthorization.summary?.nextActionTimeConfirmations || [],
    requiredBlocking: actionAuthorization.summary?.requiredBlocking || [],
    actionTimeConfirmationRequired: uniqueStrings([
      ...(runbookBrief.actionTimeConfirmationRequiredIds || []),
      ...(actionAuthorization.summary?.actionTimeConfirmationRequired || []),
    ]),
  }
}

function buildPhase(phase, packetsById, consoleTasksById) {
  const packets = phase.authorizationPackets.map((id) => packetsById.get(id)).filter(Boolean)
  const consoleTasks = phase.consoleTasks.map((id) => consoleTasksById.get(id)).filter(Boolean)
  const missingPackets = phase.authorizationPackets.filter((id) => !packetsById.has(id))
  const missingConsoleTasks = phase.consoleTasks.filter((id) => !consoleTasksById.has(id))
  const blockingDependencies = uniqueStrings([
    ...packets.flatMap((item) => item.blockingDependencies || []),
    ...consoleTasks.flatMap((item) => item.blockingDependencies || []),
    ...missingPackets.map((id) => `missingPacket:${id}`),
    ...missingConsoleTasks.map((id) => `missingConsoleTask:${id}`),
  ])
  const currentBlockers = uniqueStrings([
    ...packets.flatMap((item) => item.currentBlockers || []),
    ...consoleTasks.flatMap((item) => item.currentBlockers || []),
    ...blockingDependencies.map((item) => `dependsOn:${item}`),
  ])
  const canStartNow = packets.every((item) => item.canStartNow === true)
    && consoleTasks.every((item) => item.canStartNow === true)
    && missingPackets.length === 0
    && missingConsoleTasks.length === 0
  const compactedConsoleTasks = consoleTasks.map(compactConsoleTask)
  return {
    id: phase.id,
    title: phase.title,
    status: canStartNow ? "ready_for_action_time_confirmation" : "blocked_by_dependencies",
    canStartNow,
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
    ]),
    verifyCommands: uniqueStrings(consoleTasks.flatMap((item) => item.verifyCommands || [])),
    completionEvidence: phase.completionEvidence,
  }
}

function compactPacket(packet) {
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
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

function compactConsoleTask(task) {
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
    acceptanceEvidence,
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
    `- Execution mode: ${report.executionMode}`,
    `- Can Codex execute now: ${report.canCodexExecuteNow}`,
    `- Cloud resource ready: ${report.summary.cloudResourceReady}`,
    `- User action ready: ${report.summary.userActionReady}`,
    `- Ready phases: ${report.summary.readyToStartPhases.length ? report.summary.readyToStartPhases.join(", ") : "none"}`,
    `- Blocked phases: ${report.summary.blockedPhases.join(", ")}`,
    `- Required blocking env: ${report.summary.requiredBlocking.length ? report.summary.requiredBlocking.join(", ") : "none"}`,
    `- Ready authorization packets: ${report.readyAuthorizationPackets.length ? report.readyAuthorizationPackets.map((item) => item.packetId).join(", ") : "none"}`,
    `- Ready console action packets: ${report.readyActionPackets.length ? report.readyActionPackets.map((item) => item.taskId).join(", ") : "none"}`,
    `- Blocked credential count: ${report.summary.blockedCredentialCount}`,
    `- Ready secret env variable count: ${report.summary.readySecretEnvVariableCount}`,
    `- Resource evidence ready: ${report.summary.resourceEvidenceReady}`,
    `- Blocked resource evidence ids: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- Partially observed resource evidence ids: ${report.summary.partiallyObservedResourceEvidenceIds.length ? report.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
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
    `- Can start now authorization packets: ${report.provisioningClosureBrief.canStartNowAuthorizationPackets.length ? report.provisioningClosureBrief.canStartNowAuthorizationPackets.join(", ") : "none"}`,
    `- Can start now console tasks: ${report.provisioningClosureBrief.canStartNowConsoleTasks.length ? report.provisioningClosureBrief.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- Next action-time confirmations: ${report.provisioningClosureBrief.nextActionTimeConfirmations.length ? report.provisioningClosureBrief.nextActionTimeConfirmations.join(", ") : "none"}`,
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
      `- Requires action-time confirmation: ${phase.requiresActionTimeConfirmation}`,
      `- Authorization packets: ${phase.authorizationPackets.map((item) => item.packetId).join(", ") || "none"}`,
      `- Console tasks: ${phase.consoleTasks.map((item) => item.id).join(", ") || "none"}`,
      `- Current action scopes: ${phase.currentActionScopes.length ? phase.currentActionScopes.map((item) => `${item.taskId}=${item.scope}`).join(", ") : "none"}`,
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
