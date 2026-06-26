import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "../..")
const DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE = resolve(
  BACKEND_ROOT,
  "deploy/aliyun-production-cn.cloud-access.local.json",
)

const BASE_COMPLETION_EVIDENCE = Object.freeze([
  "cloudInventoryResults.localReady=true",
  "readyLocalOperations=9/9",
  "executedCommandResults=9/9",
  "mutationPerformedCommandResults=0",
])

const BASE_EXCLUDED_ACTIONS = Object.freeze([
  "不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。",
  "不执行 docker login/push。",
  "不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。",
])

export function buildReadonlyInventoryAuthorizationContext(options = {}) {
  const cloudShellGate = summarizeCloudShellGate(readCloudShellObservation(options.cloudAccessObservationFile))
  const phrase = buildMinimumUserPhrase(cloudShellGate)
  const allowedActions = buildAllowedActions(cloudShellGate)
  const explicitlyExcluded = buildExplicitlyExcluded(cloudShellGate)
  const userMustHandle = buildUserMustHandle(cloudShellGate)
  const currentEvidence = [
    `cloudShellCurrentStatus=${cloudShellGate.currentStatus}`,
    `cloudShellConnecting=${cloudShellGate.connecting}`,
    `cloudShellTerminalInputVisible=${cloudShellGate.terminalInputVisible}`,
    `cloudShellCanRunReadOnlyInventory=${cloudShellGate.canRunReadOnlyInventory}`,
    `cloudShellRequiresOpenConfirmation=${cloudShellGate.requiresActionTimeOpenConfirmation}`,
    `cloudShellRequiresRestartConfirmation=${cloudShellGate.requiresActionTimeRestartConfirmation}`,
    ...(cloudShellGate.blockers.length ? [`cloudShellBlockers=${cloudShellGate.blockers.join(",")}`] : []),
  ]

  return {
    cloudShellGate,
    cloudShellCurrentStatus: cloudShellGate.currentStatus,
    minimumUserPhrase: phrase,
    requiredUserAction: phrase,
    allowedActions,
    explicitlyExcluded,
    completionEvidence: [...BASE_COMPLETION_EVIDENCE],
    userMustHandle,
    currentEvidence,
    actionTimeConfirmationExtra: {
      cloudShellCurrentStatus: cloudShellGate.currentStatus,
      cloudShellConnecting: cloudShellGate.connecting,
      cloudShellTerminalInputVisible: cloudShellGate.terminalInputVisible,
      cloudShellCanRunReadOnlyInventory: cloudShellGate.canRunReadOnlyInventory,
      cloudShellRequiresOpenConfirmation: cloudShellGate.requiresActionTimeOpenConfirmation,
      cloudShellRequiresRestartConfirmation: cloudShellGate.requiresActionTimeRestartConfirmation,
      cloudShellBlockers: cloudShellGate.blockers,
    },
  }
}

export function readCloudShellObservation(cloudAccessObservationFile = "") {
  const filePath = resolveOptionalPath(cloudAccessObservationFile) || DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE
  if (!existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"))
    return parsed.cloudShellObservation?.cloudShell || parsed.cloudShell || {}
  } catch {
    return {}
  }
}

export function summarizeCloudShellGate(cloudShell = {}) {
  const blockers = Array.isArray(cloudShell.blockers) ? cloudShell.blockers.map((item) => String(item)) : []
  const evidence = String(cloudShell.evidence || "")
  const combinedEvidence = `${blockers.join("\n")}\n${evidence}`
  const requiresOpenConfirmation = cloudShell.requiresActionTimeOpenConfirmation === true ||
    blockers.includes("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning") ||
    /performance_nas_may_generate_small_usage_fees|NAS|费用|开通/.test(combinedEvidence)
  const requiresRestartConfirmation = cloudShell.requiresActionTimeRestartConfirmation === true ||
    blockers.includes("cloudshell_disconnected_restart_instance_confirmation_required") ||
    /Disconnected|restart instance|restart_instance|重启实例|terminate all sessions|中止.*会话|终止.*会话|create a new session|创建.*新.*会话/i.test(combinedEvidence)
  const connectingTerminalVisible = cloudShell.connecting === true ||
    blockers.includes("cloudshell_connecting_terminal_input_visible_inventory_not_executed") ||
    /cloudshell_connecting_terminal_input_visible_inventory_not_executed|正在连接\s*Cloud\s*Shell|connecting\s+Cloud\s*Shell|terminal_input_visible|Terminal input/i.test(combinedEvidence)

  return {
    connected: cloudShell.connected === true,
    connecting: connectingTerminalVisible,
    terminalInputVisible: cloudShell.terminalInputVisible === true || /terminal_input_visible|Terminal input/i.test(combinedEvidence),
    canRunReadOnlyInventory: cloudShell.canRunReadOnlyInventory === true,
    blockers,
    evidence,
    requiresActionTimeOpenConfirmation: requiresOpenConfirmation,
    requiresActionTimeRestartConfirmation: requiresRestartConfirmation,
    currentStatus: cloudShell.canRunReadOnlyInventory === true
      ? "ready"
      : requiresRestartConfirmation
        ? "disconnected_restart_instance_confirmation_required"
        : requiresOpenConfirmation
          ? "not_opened_nas_fee_confirmation_required"
          : connectingTerminalVisible
            ? "connecting_terminal_input_visible_inventory_not_executed"
            : "cloudshell_cli_config_missing_or_unread",
  }
}

function buildMinimumUserPhrase(cloudShellGate) {
  if (cloudShellGate.currentStatus === "connecting_terminal_input_visible_inventory_not_executed") {
    return "授权等待当前阿里云 CloudShell 连接完成后，只运行 allowlisted 只读盘点命令并写入非密钥 evidence；如后续出现开通、重启实例或费用提示，必须先停下另行确认。"
  }
  if (cloudShellGate.requiresActionTimeRestartConfirmation) {
    return "授权在确认当前阿里云 CloudShell 重启实例提示后恢复只读盘点会话，或配置 Aliyun CLI；该提示会终止当前会话并创建新会话；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。"
  }
  if (cloudShellGate.requiresActionTimeOpenConfirmation) {
    return "授权开通阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。"
  }
  return "授权恢复阿里云 CloudShell/CLI 只读盘点身份；如页面后续出现开通、重启实例或费用提示，必须先停下另行确认；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。"
}

function buildAllowedActions(cloudShellGate) {
  if (cloudShellGate.currentStatus === "connecting_terminal_input_visible_inventory_not_executed") {
    return [
      "等待当前 CloudShell 从“正在连接 Cloud Shell.”变为可输入命令提示符。",
      "连接完成后只运行本仓库生成的 List/Describe/stat/get inventory 命令。",
      "也可改用已安全配置的 Aliyun CLI profile 执行同一套只读命令。",
      "只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。",
    ]
  }
  if (cloudShellGate.requiresActionTimeRestartConfirmation) {
    return [
      "动作时确认 CloudShell 重启实例提示后恢复会话；若不确认，则改用已安全配置的 Aliyun CLI profile。",
      "只运行本仓库生成的 List/Describe/stat/get inventory 命令。",
      "只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。",
    ]
  }
  if (cloudShellGate.requiresActionTimeOpenConfirmation) {
    return [
      "如 CloudShell 页面要求开通，先确认性能型 NAS 费用提示，再进入只读盘点。",
      "使用阿里云官方 CLI 或 CloudShell 的只读身份。",
      "只运行本仓库生成的 List/Describe/stat/get inventory 命令。",
      "只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。",
    ]
  }
  return [
    "使用阿里云官方 CLI 或 CloudShell 的只读身份。",
    "只运行本仓库生成的 List/Describe/stat/get inventory 命令。",
    "只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。",
  ]
}

function buildExplicitlyExcluded(cloudShellGate) {
  if (cloudShellGate.currentStatus === "connecting_terminal_input_visible_inventory_not_executed") {
    return [
      ...BASE_EXCLUDED_ACTIONS,
      "当前 connecting 状态不授权点击开通、重启实例、购买、创建资源、导入环境变量或部署。",
    ]
  }
  if (cloudShellGate.requiresActionTimeRestartConfirmation) {
    return [
      ...BASE_EXCLUDED_ACTIONS,
      "除用户明确确认 CloudShell 重启实例提示外，不做任何 production-cn deploy、env import、资源创建、购买或 DNS 变更。",
    ]
  }
  if (cloudShellGate.requiresActionTimeOpenConfirmation) {
    return [
      ...BASE_EXCLUDED_ACTIONS,
      "除用户明确确认 CloudShell 开通页的性能型 NAS 费用提示外，不做任何 production-cn deploy、env import、资源创建或计费动作。",
    ]
  }
  return [
    ...BASE_EXCLUDED_ACTIONS,
    "未出现并确认 CloudShell 开通或重启提示前，不点击开通/重启实例，不做 production-cn deploy、env import、资源创建、购买或 DNS 变更。",
  ]
}

function buildUserMustHandle(cloudShellGate) {
  if (cloudShellGate.currentStatus === "connecting_terminal_input_visible_inventory_not_executed") {
    return [
      "当前 CloudShell 已打开但仍在连接；等出现命令提示符后才能跑 allowlisted 只读盘点。",
      "如后续出现开通、重启实例或费用提示，必须先停下另行确认。",
      "AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history",
    ]
  }
  if (cloudShellGate.requiresActionTimeRestartConfirmation) {
    return [
      "If the current CloudShell tab is disconnected, reconnecting it still requires action-time confirmation.",
      "Confirm that the restart-instance prompt may terminate the current session and create a new session before continuing.",
      "AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history",
    ]
  }
  if (cloudShellGate.requiresActionTimeOpenConfirmation) {
    return [
      "If CloudShell shows an 开通 page with a performance NAS usage-fee warning, confirm that warning before clicking 开通.",
      "Aliyun CLI default profile or CloudShell logged-in read-only identity",
      "AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history",
    ]
  }
  return [
    "Aliyun CLI default profile or CloudShell logged-in read-only identity",
    "If CloudShell shows an 开通, restart, or fee prompt later, stop for action-time confirmation before clicking it.",
    "AccessKeySecret or STS token must never be copied into JSON, Markdown, chat, git, or shell history",
  ]
}

function resolveOptionalPath(filePath) {
  if (!filePath) return ""
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath)
}
