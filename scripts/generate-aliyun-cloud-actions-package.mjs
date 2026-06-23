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

  const consoleTasks = consoleRunbook.consoleTasks || []
  const immediateConsoleTasks = consoleTasks.filter((item) => item.canStartNow === true)
  const blockedConsoleTasks = consoleTasks.filter((item) => item.canStartNow !== true)
  const immediatePackets = blockerBrief.immediateAuthorizationPackets || []
  const cloudConsolePackets = immediatePackets.filter((item) => CLOUD_CONSOLE_PACKET_IDS.has(item.packetId))
  const externalAppPackets = immediatePackets.filter((item) => EXTERNAL_APP_PACKET_IDS.has(item.packetId))
  const phases = (provisioningPlan.phases || []).map(compactPhase)
  const firstCloudPhase = phases.find((item) => item.id === "PH02_BASE_CLOUD_RESOURCES") || null
  const cliConfigProbeFailureCategory = cloudAccess.cli?.configProbe?.failureCategory || cloudAccess.cliConfigProbeFailureCategory || "none"
  const currentBlockers = uniqueStrings([
    ...(blockerBrief.summary?.requiredBlocking || []).map((name) => `requiredEnv:${name}`),
    ...(blockedConsoleTasks || []).map((item) => `blockedConsoleTask:${item.id}`),
    ...(cloudAccess.blockers || []),
  ])

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
      cliConfigProbeFailureCategory,
    },
    firstCloudPhase,
    immediateConsoleTasks: immediateConsoleTasks.map(compactConsoleTask),
    blockedConsoleTasks: blockedConsoleTasks.map(compactConsoleTask),
    cloudConsoleAuthorizationPackets: cloudConsolePackets.map(compactPacket),
    externalAppPrerequisitePackets: externalAppPackets.map(compactPacket),
    phaseOrder: phases,
    cloudAccess: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true || cloudAccess.cliAvailable === true,
      cliConfigProbeReady: cloudAccess.cli?.configProbe?.ready === true || cloudAccess.cliConfigProbeReady === true,
      cliConfigProbeFailureCategory,
      workbenchTerminalConnected: cloudAccess.terminalAccess?.workbenchTerminal?.connected === true || cloudAccess.workbenchTerminalConnected === true,
      workbenchTerminalReadiness: cloudAccess.terminalAccess?.workbenchTerminal?.readiness || cloudAccess.workbenchTerminalReadiness || "unknown",
      blockers: cloudAccess.blockers || [],
    },
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

function compactConsoleTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    canStartNow: task.canStartNow === true,
    dependsOn: task.dependsOn || [],
    blockingDependencies: task.blockingDependencies || [],
    consolePath: task.consolePath || "",
    minimumAuthorizationPhrase: matchingAuthorizationPhrase(task),
    currentActionScope: task.currentActionScope || "",
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
    `- cliConfigProbeFailureCategory: ${report.summary.cliConfigProbeFailureCategory}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    "",
    "## 当前可先做",
    "",
    ...(report.immediateConsoleTasks.length
      ? report.immediateConsoleTasks.flatMap((task) => [
          `### ${task.id} ${task.title}`,
          "",
          `- consolePath: ${task.consolePath}`,
          `- minimumAuthorizationPhrase: ${task.minimumAuthorizationPhrase}`,
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
