#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_RUNTIME_PLAN_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.runtime-plan.json")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_IMAGE_PUBLISH_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")
const DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-access.local.json")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const EXPECTED_ALIYUN_REGION = "cn-hangzhou"
const EXPECTED_SERVICE_RECORD_OSS_PREFIX = "service-records/production-cn"

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
    runtimePlanFile: DEFAULT_RUNTIME_PLAN_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    imagePublishFile: DEFAULT_IMAGE_PUBLISH_FILE,
    cloudAccessObservationFile: DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE,
    envFile: DEFAULT_ENV_FILE,
    writeReport: "",
    strict: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--runtime-plan") {
      args.runtimePlanFile = resolveValue(argv[++index], "--runtime-plan")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      continue
    }
    if (arg === "--image-publish") {
      args.imagePublishFile = resolveValue(argv[++index], "--image-publish")
      continue
    }
    if (arg === "--cloud-access-observation") {
      args.cloudAccessObservationFile = resolveValue(argv[++index], "--cloud-access-observation")
      continue
    }
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--write-report") {
      args.writeReport = resolveValue(argv[++index], "--write-report")
      continue
    }
    if (arg === "--strict") {
      args.strict = true
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

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function shell(command) {
  const result = spawnSync("sh", ["-lc", command], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  }
}

function commandPath(name) {
  const result = shell(`command -v ${name}`)
  return result.status === 0 ? result.stdout.split(/\r?\n/)[0] || "" : ""
}

function commandVersion(binary) {
  if (!binary) return ""
  const result = shell(`${quoteShell(binary)} version 2>/dev/null || ${quoteShell(binary)} --version 2>/dev/null || true`)
  return result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 3).join(" | ")
}

function localBrowserProbe() {
  const pgrep = shell("pgrep -x 'Google Chrome' >/dev/null 2>&1")
  if (pgrep.status !== 0) {
    return {
      checked: true,
      browser: "Google Chrome",
      running: false,
      canUseCurrentConsole: false,
      tabCount: 0,
      aliyunConsoleTabCount: 0,
      aliyunConsoleTabs: [],
      cloudApiCalled: false,
      cloudMutationPerformed: false,
      evidence: "current_chrome_not_running",
      blockers: ["current_chrome_not_running"],
      note: "Current browser probe only enumerates Chrome tab titles and sanitized host/path values; it does not read cookies, form fields, localStorage, secrets, or page content.",
    }
  }

  const script = [
    "const chrome = Application('Google Chrome');",
    "const rows = [];",
    "for (const win of chrome.windows()) {",
    "  for (const tab of win.tabs()) {",
    "    rows.push(JSON.stringify({ title: tab.title(), url: tab.url() }));",
    "  }",
    "}",
    "rows.join('\\n');",
  ].join("\n")
  const result = spawnSync("osascript", ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    return {
      checked: true,
      browser: "Google Chrome",
      running: true,
      canUseCurrentConsole: false,
      tabCount: 0,
      aliyunConsoleTabCount: 0,
      aliyunConsoleTabs: [],
      cloudApiCalled: false,
      cloudMutationPerformed: false,
      evidence: "current_chrome_tab_probe_failed",
      blockers: ["current_chrome_tab_probe_failed"],
      note: "Chrome is running, but AppleScript/JXA tab enumeration failed. No raw stderr is stored because browser automation errors may include local paths or account hints.",
    }
  }

  const tabs = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseBrowserTabLine)
    .filter(Boolean)
  const aliyunConsoleTabs = tabs
    .filter((tab) => isAliyunConsoleHostPath(tab.hostPath))
    .map((tab) => ({
      title: truncateText(tab.title, 120),
      hostPath: tab.hostPath,
    }))

  return {
    checked: true,
    browser: "Google Chrome",
    running: true,
    canUseCurrentConsole: aliyunConsoleTabs.length > 0,
    tabCount: tabs.length,
    aliyunConsoleTabCount: aliyunConsoleTabs.length,
    aliyunConsoleTabs,
    cloudApiCalled: false,
    cloudMutationPerformed: false,
    evidence: aliyunConsoleTabs.length
      ? `current_chrome_aliyun_console_tabs_${aliyunConsoleTabs.length}`
      : "current_chrome_no_aliyun_console_tabs",
    blockers: aliyunConsoleTabs.length ? [] : ["current_aliyun_console_browser_tab_not_observed"],
    note: "Current browser probe only enumerates Chrome tab titles and sanitized host/path values; it does not read cookies, form fields, localStorage, secrets, or page content.",
  }
}

function parseBrowserTabLine(line) {
  try {
    const raw = JSON.parse(line)
    return {
      title: String(raw.title || ""),
      hostPath: sanitizeUrlHostPath(raw.url),
    }
  } catch {
    return null
  }
}

function sanitizeUrlHostPath(value) {
  try {
    const url = new URL(String(value || ""))
    return `${url.hostname}${url.pathname}`.replace(/\/$/, "")
  } catch {
    return ""
  }
}

function isAliyunConsoleHostPath(hostPath) {
  const value = String(hostPath || "")
  return /(^|\.)aliyun\.com(\/|$)/i.test(value)
}

function truncateText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function cliConfigProbe(binary) {
  if (!binary) {
    return {
      executed: false,
      exitStatus: null,
      stdoutLines: 0,
      stderrLines: 0,
      failureCategory: "aliyun_cli_binary_missing",
      ready: false,
      cloudApiCalled: false,
      mutationPerformed: false,
      note: "Aliyun CLI binary was not found. No cloud API was called.",
    }
  }
  const result = shell(`${quoteShell(binary)} configure list`)
  const failureCategory = classifyCliProbeFailure(result)
  return {
    executed: true,
    exitStatus: result.status,
    stdoutLines: lineCount(result.stdout),
    stderrLines: lineCount(result.stderr),
    failureCategory,
    ready: result.status === 0 && failureCategory === "",
    cloudApiCalled: false,
    mutationPerformed: false,
    note: "Runs local `aliyun configure list` only. Raw stdout/stderr are not stored because they may contain account identifiers.",
  }
}

function lineCount(value) {
  const text = String(value || "").trim()
  return text ? text.split(/\r?\n/).filter(Boolean).length : 0
}

function classifyCliProbeFailure(result) {
  if (result.status === 0) return ""
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`
  if (/config failed|region can't be empty|region cannot be empty|missing region/i.test(combined)) {
    return "aliyun_cli_config_incomplete"
  }
  if (/profile\s+default\s+is\s+not\s+configure|Configuration failed|aliyun configure|load configure failed|config\.json: no such file/i.test(combined)) {
    return "aliyun_cli_profile_not_configured"
  }
  if (/command not found|ENOENT|not recognized/i.test(combined)) return "aliyun_cli_binary_missing"
  if (/InvalidAccessKeyId|SignatureDoesNotMatch|Forbidden|Unauthorized|AccessDenied|NoPermission/i.test(combined)) {
    return "aliyun_cli_auth_or_permission_failed"
  }
  return "aliyun_cli_config_probe_failed"
}

function quoteShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function candidateAliyunConfigFiles() {
  const home = process.env.HOME || ""
  if (!home) return []
  return [
    resolve(home, ".aliyun/config.json"),
    resolve(home, ".aliyun/config"),
    resolve(home, ".aliyun/credentials"),
  ].map((filePath) => ({
    path: filePath,
    exists: existsSync(filePath),
    inspected: false,
    reason: "config files may contain AccessKeySecret; this check only reports existence",
  }))
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

function normalizeCloudAccessObservation(observation) {
  const defaultWorkbenchTerminal = {
    observed: false,
    connected: false,
    title: "",
    urlHostPath: "",
    loginUser: "",
    hostLabel: "",
    observedAt: "",
    cliInventoryAttempted: false,
    cloudApiCalled: false,
    cloudMutationPerformed: false,
    evidence: "",
    blockers: [],
    readiness: "not_observed",
    note: "ECS Workbench terminal visibility is not the same as Aliyun CloudShell/OpenAPI inventory readiness.",
  }
  if (!observation) {
    return {
      exists: false,
      ready: false,
      blockers: ["cloud_access_observation_missing"],
      warnings: [],
      browserConsole: {
        chromeLoggedIn: false,
        observedAt: "",
        evidence: "",
        resourcesObserved: [],
      },
      cloudShell: {
        connected: false,
        connecting: false,
        terminalInputVisible: false,
        regionLabel: "",
        cliAvailable: false,
        cliVersion: "",
        cliConfigFileExists: false,
        canRunReadOnlyInventory: false,
        cloudApiCalled: false,
        cloudMutationPerformed: false,
        lastReadOnlyCommand: "",
        requiresActionTimeOpenConfirmation: false,
        requiresActionTimeRestartConfirmation: false,
        confirmationKinds: [],
        billingWarning: "",
        restartWarning: "",
        blockers: [],
        evidence: "",
      },
      workbenchTerminal: defaultWorkbenchTerminal,
    }
  }

  const blockers = []
  const warnings = []
  if (observation.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (observation.environment !== "production-cn") blockers.push("environment=production-cn")
  const browserConsole = observation.browserConsole || {}
  const cloudShell = observation.cloudShell || {}
  const cloudShellBlockers = Array.isArray(cloudShell.blockers) ? cloudShell.blockers.map((item) => String(item)) : []
  const resourcesObserved = Array.isArray(browserConsole.resourcesObserved)
    ? browserConsole.resourcesObserved.map((item) => String(item))
    : []
  const cloudShellEvidence = String(cloudShell.evidence || "")
  const cloudShellText = [
    cloudShellEvidence,
    ...cloudShellBlockers,
    ...resourcesObserved.filter((line) => /Cloud\s*Shell|CloudShell|shell\.aliyun\.com|重启实例|Disconnected/i.test(line)),
  ].join("\n")
  const requiresOpenConfirmation = cloudShell.requiresActionTimeOpenConfirmation === true ||
    cloudShellBlockers.includes("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning") ||
    /performance_nas_may_generate_small_usage_fees|performance NAS|性能型 NAS|usage fees|费用提示|点击开通|requires 开通/i.test(cloudShellText)
  const requiresRestartConfirmation = cloudShell.requiresActionTimeRestartConfirmation === true ||
    cloudShellBlockers.includes("cloudshell_disconnected_restart_instance_confirmation_required") ||
    /Disconnected|restart instance|restart_instance|重启实例|terminate all sessions|中止.*会话|终止.*会话|create a new session|创建.*新.*会话/i.test(cloudShellText)
  const connectingTerminalVisible = cloudShell.connecting === true ||
    cloudShellBlockers.includes("cloudshell_connecting_terminal_input_visible_inventory_not_executed") ||
    /cloudshell_connecting_terminal_input_visible_inventory_not_executed|正在连接\s*Cloud\s*Shell|connecting\s+Cloud\s*Shell/i.test(cloudShellText) ||
    (cloudShell.terminalInputVisible === true && /Terminal input|terminal_input_visible|终端输入框/i.test(cloudShellText))
  if (requiresOpenConfirmation && !cloudShellBlockers.includes("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning")) {
    cloudShellBlockers.push("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning")
  }
  if (requiresRestartConfirmation && !cloudShellBlockers.includes("cloudshell_disconnected_restart_instance_confirmation_required")) {
    cloudShellBlockers.push("cloudshell_disconnected_restart_instance_confirmation_required")
  }
  if (
    connectingTerminalVisible &&
    !requiresOpenConfirmation &&
    !requiresRestartConfirmation &&
    !cloudShellBlockers.includes("cloudshell_connecting_terminal_input_visible_inventory_not_executed")
  ) {
    cloudShellBlockers.push("cloudshell_connecting_terminal_input_visible_inventory_not_executed")
  }
  if (cloudShell.cloudMutationPerformed === true) blockers.push("cloudshell_mutation_observed")
  if (cloudShell.cloudApiCalled === true && cloudShell.canRunReadOnlyInventory !== true) {
    warnings.push("cloudshell_api_called_but_inventory_not_ready")
  }
  if (cloudShell.connected === true && cloudShell.cliAvailable === true && cloudShell.cliConfigFileExists !== true) {
    blockers.push("cloudshell_cli_config_missing_or_unread")
  }
  const canRunReadOnlyInventory = cloudShell.canRunReadOnlyInventory === true
  const workbenchTerminal = observation.workbenchTerminal || {}
  if (workbenchTerminal.cloudMutationPerformed === true) blockers.push("workbench_terminal_mutation_observed")
  if (workbenchTerminal.cloudApiCalled === true && workbenchTerminal.cliInventoryAttempted !== true) {
    warnings.push("workbench_terminal_api_called_without_inventory_context")
  }
  const normalizedWorkbenchTerminal = {
    observed: workbenchTerminal.observed === true,
    connected: workbenchTerminal.connected === true,
    title: String(workbenchTerminal.title || ""),
    urlHostPath: String(workbenchTerminal.urlHostPath || ""),
    loginUser: String(workbenchTerminal.loginUser || ""),
    hostLabel: String(workbenchTerminal.hostLabel || ""),
    observedAt: String(workbenchTerminal.observedAt || ""),
    cliInventoryAttempted: workbenchTerminal.cliInventoryAttempted === true,
    cloudApiCalled: workbenchTerminal.cloudApiCalled === true,
    cloudMutationPerformed: workbenchTerminal.cloudMutationPerformed === true,
    evidence: String(workbenchTerminal.evidence || ""),
    blockers: Array.isArray(workbenchTerminal.blockers) ? workbenchTerminal.blockers.map((item) => String(item)) : [],
    readiness: workbenchTerminal.cliInventoryAttempted === true && workbenchTerminal.cloudApiCalled === true
      ? "inventory_attempted"
      : workbenchTerminal.connected === true
        ? "connected_not_inventory_ready"
        : workbenchTerminal.observed === true
          ? "observed_not_connected"
          : "not_observed",
    note: "ECS Workbench terminal visibility is not the same as Aliyun CloudShell/OpenAPI inventory readiness.",
  }

  return {
    exists: true,
    ready: blockers.length === 0 && canRunReadOnlyInventory,
    blockers,
    warnings,
    browserConsole: {
      chromeLoggedIn: browserConsole.chromeLoggedIn === true,
      observedAt: String(browserConsole.observedAt || ""),
      evidence: String(browserConsole.evidence || ""),
      resourcesObserved: Array.isArray(browserConsole.resourcesObserved)
        ? browserConsole.resourcesObserved.map((item) => String(item))
        : [],
    },
    cloudShell: {
      connected: cloudShell.connected === true,
      connecting: connectingTerminalVisible,
      terminalInputVisible: cloudShell.terminalInputVisible === true || /Terminal input|terminal_input_visible|终端输入框/i.test(cloudShellText),
      regionLabel: String(cloudShell.regionLabel || ""),
      cliAvailable: cloudShell.cliAvailable === true,
      cliVersion: String(cloudShell.cliVersion || ""),
      cliConfigFileExists: cloudShell.cliConfigFileExists === true,
      canRunReadOnlyInventory,
      cloudApiCalled: cloudShell.cloudApiCalled === true,
      cloudMutationPerformed: cloudShell.cloudMutationPerformed === true,
      lastReadOnlyCommand: String(cloudShell.lastReadOnlyCommand || ""),
      requiresActionTimeOpenConfirmation: requiresOpenConfirmation,
      requiresActionTimeRestartConfirmation: requiresRestartConfirmation,
      confirmationKinds: [
        ...(requiresOpenConfirmation ? ["open_service_nas_fee"] : []),
        ...(requiresRestartConfirmation ? ["restart_instance"] : []),
      ],
      billingWarning: requiresOpenConfirmation
        ? "CloudShell page requires clicking 开通 and warns that it may create a performance NAS instance with possible usage fees."
        : "",
      restartWarning: requiresRestartConfirmation
        ? "CloudShell restart confirmation says it will terminate current sessions and create a new session; do not confirm it without action-time approval."
        : "",
      blockers: cloudShellBlockers,
      evidence: cloudShellEvidence,
    },
    workbenchTerminal: normalizedWorkbenchTerminal,
  }
}

function buildObservedResourceStatuses(cloudAccessObservation, imagePublish = {}) {
  const lines = cloudAccessObservation.browserConsole?.resourcesObserved || []
  const saeLine = findObservedLine(lines, [
    /SAE console accessible/i,
    /SAE .*app list visible/i,
    /target app .*not (present|proven created)/i,
  ])
  const acrLine = findObservedLine(lines, [
    /ACR Enterprise Economic/i,
    /ACR .*instances page visible/i,
    /create enterprise instance button visible/i,
  ])
  const ossLine = findObservedLine(lines, /OSS bucket/i)
  const dnsLine = findObservedLine(lines, /DNS ipgongchang\.xin/i)
  const slsLine = findObservedLine(lines, /SLS logsearch URL visible/i)
  const cloudShellLine = findObservedLine(lines, /Cloud Shell tab|CloudShell tab|CloudShell|shell\.aliyun\.com/i)
  const localCliLine = findObservedLine(lines, /Local macOS aliyun CLI installed/i)
  const cloudShellInventoryStatus = classifyCloudShellInventoryStatus(cloudAccessObservation.cloudShell, cloudShellLine)
  const acr = imagePublish?.acr || {}
  const runtime = imagePublish?.runtime || {}
  const acrRepositoryConfirmed = acr.purchaseCandidate?.confirmed === true &&
    Boolean(acr.registryHost) &&
    Boolean(acr.namespace) &&
    Boolean(acr.repository)
  const acrImageReady = acrRepositoryConfirmed &&
    acr.imagePushed === true &&
    acr.digestVerified === true &&
    /^sha256:[a-f0-9]{64}$/i.test(String(acr.remoteDigest || "")) &&
    runtime.remoteImageConfigured === true &&
    runtime.imagePullConfigured === true
  const acrStatus = acrRepositoryConfirmed
    ? acrImageReady ? "acr_image_and_runtime_pull_confirmed" : "acr_repository_confirmed_image_push_pending"
    : acrLine
      ? /not purchased|purchase\/repository still action-time confirmation|no .*target instance|no .*repository/i.test(acrLine)
        ? "purchase_candidate_visible_not_purchased"
        : "purchase_or_instance_visible_unconfirmed"
      : "not_observed"
  const acrReadiness = acrImageReady ? "ready" : acrRepositoryConfirmed ? "partial" : "blocked"
  const acrObservation = Array.from(new Set([
    acrLine,
    acrRepositoryConfirmed ? `local image-publish evidence confirms ACR registryHost=${acr.registryHost}; namespace=${acr.namespace}; repository=${acr.repository}; image push/digest/runtime pull pending` : "",
  ].filter(Boolean))).join(" | ")

  return [
    {
      id: "localAliyunCli",
      title: "本机 Aliyun CLI",
      status: localCliLine ? "cli_installed_config_missing_or_unread" : "not_observed",
      readiness: "blocked",
      observed: Boolean(localCliLine),
      currentObservation: localCliLine,
      nextAction: "通过阿里云官方登录/配置方式补齐只读 inventory 所需 CLI 配置；不要把 AccessKeySecret 写入仓库。",
      writeTarget: "deploy/aliyun-production-cn.cloud-access.local.json -> cloudShell / browserConsole non-secret evidence",
    },
    {
      id: "saeRuntime",
      title: "SAE production-cn 自定义容器应用",
      status: saeLine
        ? /not created|暂无实例|not present|not proven created/i.test(saeLine)
          ? "not_created_or_not_confirmed"
          : "console_accessible_unconfirmed"
        : "not_observed",
      readiness: "blocked",
      observed: Boolean(saeLine),
      currentObservation: saeLine,
      nextAction: "创建或确认 cn-hangzhou SAE 应用 meiye-huajing-app-api-production-cn，容器端口 3000，健康检查 /api/healthz。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
    },
    {
      id: "acrPurchase",
      title: "ACR 企业版实例和镜像仓库",
      status: acrStatus,
      readiness: acrReadiness,
      observed: Boolean(acrLine || acrRepositoryConfirmed),
      currentObservation: acrObservation,
      nextAction: acrRepositoryConfirmed
        ? "进入 P04：推送/导入后端镜像到 ACR，核对 sha256 digest，并配置 SAE 镜像拉取权限。"
        : "动作时确认 ACR Enterprise Economic / cn-hangzhou / 1 month 后，购买实例并创建 namespace/repository。",
      writeTarget: "deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr non-secret evidence",
    },
    {
      id: "ossAudio",
      title: "服务记录音频 OSS Bucket",
      status: ossLine ? "bucket_visible_unconfirmed" : "not_observed",
      readiness: "partial",
      observed: Boolean(ossLine),
      currentObservation: ossLine,
      nextAction: "继续确认 CORS、RAM 最小权限和 service-records/production-cn 前缀；只记录 bucket/region/布尔证据。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
    },
    {
      id: "domainDns",
      title: "ipgongchang.xin DNS 与 api-cn/assets-cn 记录",
      status: dnsLine
        ? /no explicit api-cn\/assets-cn|no api-cn\/assets-cn host record|returns 没有数据|public DNS still resolves/i.test(dnsLine)
          ? "domain_visible_records_missing"
          : "domain_visible_unconfirmed"
        : "not_observed",
      readiness: "blocked",
      observed: Boolean(dnsLine),
      currentObservation: dnsLine,
      nextAction: "补齐 api-cn.ipgongchang.xin 与 assets-cn.ipgongchang.xin 解析到阿里云入口，并确认 HTTPS/ICP。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps / items.assetDomainHttps",
    },
    {
      id: "slsAlerts",
      title: "SLS 日志项目和 health/5xx 告警",
      status: slsLine
        ? /alerts (still|remain) pending/i.test(slsLine)
          ? "project_logstore_visible_alerts_pending"
          : "project_logstore_visible_unconfirmed"
        : "not_observed",
      readiness: "partial",
      observed: Boolean(slsLine),
      currentObservation: slsLine,
      nextAction: "SAE runtime ready 后配置日志采集、/api/healthz 健康告警和 5xx 告警。",
      writeTarget: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
    },
    {
      id: "cloudShellInventory",
      title: "Cloud Shell 只读盘点能力",
      status: cloudShellInventoryStatus,
      readiness: cloudAccessObservation.cloudShell?.canRunReadOnlyInventory === true ? "ready" : "blocked",
      observed: Boolean(cloudShellLine) || cloudAccessObservation.cloudShell?.connected === true,
      currentObservation: cloudShellLine || cloudAccessObservation.cloudShell?.evidence || "",
      nextAction: "只有 Cloud Shell/CLI 配置 ready 后，才运行受控只读 inventory runner；否则继续用控制台人工证据。",
      writeTarget: "deploy/aliyun-production-cn.cloud-inventory-results.local.json",
    },
  ]
}

function findObservedLine(lines, patternOrPatterns) {
  const patterns = Array.isArray(patternOrPatterns) ? patternOrPatterns : [patternOrPatterns]
  return lines.find((line) => patterns.some((pattern) => pattern.test(line))) || ""
}

function classifyCloudShellInventoryStatus(cloudShell = {}, observedLine = "") {
  if (cloudShell?.canRunReadOnlyInventory === true) return "readonly_inventory_ready"
  const text = [
    String(observedLine || ""),
    String(cloudShell?.evidence || ""),
    ...(Array.isArray(cloudShell?.blockers) ? cloudShell.blockers.map((item) => String(item)) : []),
  ].join("\n")
  if (/cloudshell_disconnected_restart_instance_confirmation_required|Disconnected|restart instance|restart_instance|重启实例|terminate all sessions|中止.*会话|终止.*会话|create a new session|创建.*新.*会话/i.test(text)) {
    return "cloudshell_disconnected_restart_confirmation_required"
  }
  if (/cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning|performance_nas_may_generate_small_usage_fees|performance NAS|性能型 NAS|usage fees|费用提示|点击开通|requires 开通/i.test(text)) {
    return "cloudshell_not_opened_nas_fee_confirmation_required"
  }
  if (/cloudshell_connecting_terminal_input_visible_inventory_not_executed|正在连接\s*Cloud\s*Shell|connecting\s+Cloud\s*Shell|terminal_input_visible|Terminal input/i.test(text)) {
    return "cloudshell_connecting_inventory_not_executed"
  }
  const hasAnyObservation = Boolean(observedLine) ||
    cloudShell?.connected === true ||
    Boolean(String(cloudShell?.evidence || "")) ||
    (Array.isArray(cloudShell?.blockers) && cloudShell.blockers.length > 0)
  return hasAnyObservation ? "cloudshell_disconnected_or_config_missing" : "not_observed"
}

function summarizeObservedResourceStatuses(items) {
  return {
    total: items.length,
    ready: items.filter((item) => item.readiness === "ready").length,
    partial: items.filter((item) => item.readiness === "partial").length,
    blocked: items.filter((item) => item.readiness === "blocked").length,
    observed: items.filter((item) => item.observed === true).length,
    notObserved: items.filter((item) => item.observed !== true).length,
    blockedIds: items.filter((item) => item.readiness === "blocked").map((item) => item.id),
  }
}

function buildConsoleChecklist(runtimePlan, cloudConfirmations, imagePublish) {
  const target = runtimePlan?.target || {}
  const image = runtimePlan?.image || {}
  const domains = runtimePlan?.domains || {}
  const cloudItems = cloudConfirmations?.items || {}
  const localImage = imagePublish?.image || {}
  const acr = imagePublish?.acr || {}
  return [
    {
      id: "saeRuntime",
      title: "SAE production-cn 自定义容器应用",
      consolePath: "阿里云控制台 -> SAE -> cn-hangzhou -> 应用列表",
      expected: {
        provider: "SAE",
        region: target.region || EXPECTED_ALIYUN_REGION,
        appName: target.appName || "meiye-huajing-app-api-production-cn",
        containerPort: target.containerPort || 3000,
        healthPath: target.healthPath || "/api/healthz",
      },
      currentLocalEvidence: cloudItems.runtime?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
      nonSecretFieldsToRecord: ["confirmed", "provider", "region", "appName", "containerPort", "healthPath", "evidence"],
    },
    {
      id: "acrImage",
      title: "ACR 镜像仓库与 production-cn 镜像 digest",
      consolePath: "阿里云控制台 -> 容器镜像服务 ACR -> cn-hangzhou -> 命名空间/仓库",
      expected: {
        provider: "Aliyun ACR",
        region: acr.region || EXPECTED_ALIYUN_REGION,
        repository: image.repository || acr.repository || "meiye-huajing-app-api",
        tag: image.tag || acr.remoteTag || "production-cn",
        localTag: localImage.localTag || image.localImage || "meiye-huajing-app-api:production-cn",
      },
      currentLocalEvidence: acr.evidence || "",
      writeTo: "deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime",
      nonSecretFieldsToRecord: [
        "registryHost",
        "namespace",
        "remoteImage",
        "remoteDigest",
        "imagePushed",
        "digestVerified",
        "runtime.remoteImageConfigured",
        "runtime.imagePullConfigured",
        "evidence",
      ],
    },
    {
      id: "apiDomain",
      title: "api-cn DNS、HTTPS、ICP",
      consolePath: "阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或网关入口",
      expected: {
        host: domains.apiHost || "api-cn.ipgongchang.xin",
        healthUrl: domains.apiHealthUrl || "https://api-cn.ipgongchang.xin/api/healthz",
      },
      currentLocalEvidence: cloudItems.apiDomainHttps?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
      nonSecretFieldsToRecord: ["confirmed", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    },
    {
      id: "assetDomain",
      title: "assets-cn DNS、HTTPS、ICP",
      consolePath: "阿里云控制台 -> 云解析 DNS / CDN 或 OSS 自定义域名 / 数字证书管理服务",
      expected: {
        host: domains.assetHost || "assets-cn.ipgongchang.xin",
      },
      currentLocalEvidence: cloudItems.assetDomainHttps?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
      nonSecretFieldsToRecord: ["confirmed", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    },
    {
      id: "ossAudio",
      title: "服务记录音频 OSS、CORS、RAM 最小权限",
      consolePath: "阿里云控制台 -> OSS Bucket / RAM 访问控制",
      expected: {
        region: EXPECTED_ALIYUN_REGION,
        serviceRecordPrefix: EXPECTED_SERVICE_RECORD_OSS_PREFIX,
      },
      currentLocalEvidence: cloudItems.oss?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
      nonSecretFieldsToRecord: ["confirmed", "bucket", "region", "corsConfigured", "ramLeastPrivilege", "serviceRecordPrefix", "evidence"],
    },
    {
      id: "envImport",
      title: "SAE/KMS/Secrets Manager 环境变量导入",
      consolePath: "阿里云控制台 -> SAE 应用 -> 环境变量 / KMS / Secrets Manager",
      expected: {
        envFile: DEFAULT_ENV_FILE,
        planCommand: "corepack pnpm aliyun:env:plan",
      },
      currentLocalEvidence: cloudItems.envImport?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
      nonSecretFieldsToRecord: ["confirmed", "target", "importedAt", "secretNotInImage", "evidence"],
    },
    {
      id: "slsAlerts",
      title: "SLS 日志和 health/5xx 告警",
      consolePath: "阿里云控制台 -> 日志服务 SLS / 应用监控告警",
      expected: {
        healthPath: target.healthPath || "/api/healthz",
        serverErrorAlert: "5xx",
      },
      currentLocalEvidence: cloudItems.slsAlerts?.evidence || "",
      writeTo: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
      nonSecretFieldsToRecord: ["confirmed", "slsProject", "healthAlertConfigured", "serverErrorAlertConfigured", "evidence"],
    },
  ].map((item) => ({
    ...item,
    forbidden: [
      "AccessKeySecret",
      "AppSecret",
      "registry password",
      "RAM Secret",
      "token",
      "cookie",
      "Supabase service role key",
    ],
  }))
}

function main() {
  const args = parseArgs(process.argv)
  const aliyunPath = commandPath("aliyun")
  const aliyuncliPath = commandPath("aliyuncli")
  const aliyunBinary = aliyunPath || aliyuncliPath || ""
  const configProbe = cliConfigProbe(aliyunBinary)
  const runtimePlan = readJsonIfExists(args.runtimePlanFile)
  const cloudConfirmations = readJsonIfExists(args.cloudConfirmationsFile)
  const imagePublish = readJsonIfExists(args.imagePublishFile)
  const cloudAccessObservation = normalizeCloudAccessObservation(readJsonIfExists(args.cloudAccessObservationFile))
  const browserProbe = localBrowserProbe()
  const configFiles = candidateAliyunConfigFiles()
  const cliConfigExists = configFiles.some((item) => item.exists)
  const cliAvailable = Boolean(aliyunPath || aliyuncliPath)
  const observedResourceStatuses = buildObservedResourceStatuses(cloudAccessObservation, imagePublish)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    cloudMutationPerformed: false,
    cloudApiCalled: false,
    canReadCloudNow: (cliAvailable && cliConfigExists) || cloudAccessObservation.ready,
    files: {
      runtimePlanFile: args.runtimePlanFile,
      runtimePlanFileExists: existsSync(args.runtimePlanFile),
      cloudConfirmationsFile: args.cloudConfirmationsFile,
      cloudConfirmationsFileExists: existsSync(args.cloudConfirmationsFile),
      imagePublishFile: args.imagePublishFile,
      imagePublishFileExists: existsSync(args.imagePublishFile),
      cloudAccessObservationFile: args.cloudAccessObservationFile,
      cloudAccessObservationFileExists: existsSync(args.cloudAccessObservationFile),
      envFile: args.envFile,
      envFileExists: existsSync(args.envFile),
    },
    cli: {
      available: cliAvailable,
      binary: aliyunBinary,
      version: commandVersion(aliyunBinary),
      configFileExists: cliConfigExists,
      configFiles,
      configProbe,
      note: "No Aliyun cloud API is called by this script. It only checks whether this machine can plausibly run read-only Aliyun CLI inventory later.",
    },
    localBrowserProbe: browserProbe,
    cloudShellObservation: cloudAccessObservation,
    terminalAccess: {
      workbenchTerminal: cloudAccessObservation.workbenchTerminal,
      inventoryReady: cloudAccessObservation.ready === true,
      note: "A connected ECS Workbench terminal is only a manual observation surface until allowlisted Aliyun CLI/OpenAPI inventory is explicitly run and recorded.",
    },
    observedResourceStatusSummary: summarizeObservedResourceStatuses(observedResourceStatuses),
    observedResourceStatuses,
    targets: {
      provider: runtimePlan?.target?.provider || "SAE",
      region: runtimePlan?.target?.region || EXPECTED_ALIYUN_REGION,
      appName: runtimePlan?.target?.appName || "meiye-huajing-app-api-production-cn",
      apiHost: runtimePlan?.domains?.apiHost || "api-cn.ipgongchang.xin",
      assetHost: runtimePlan?.domains?.assetHost || "assets-cn.ipgongchang.xin",
      imageRepository: runtimePlan?.image?.repository || "meiye-huajing-app-api",
      imageTag: runtimePlan?.image?.tag || "production-cn",
    },
    consoleEvidenceChecklist: buildConsoleChecklist(runtimePlan, cloudConfirmations, imagePublish),
    blockers: [],
    nextActions: [],
  }

  if (!cliAvailable) {
    report.blockers.push("aliyun_cli_missing")
    report.nextActions.push("本机未发现 aliyun CLI；继续使用阿里云控制台只读确认，或安装/登录 aliyun CLI 后再补自动 inventory。")
  }
  if (cliAvailable && !cliConfigExists) {
    report.blockers.push("aliyun_cli_config_missing_or_unread")
    report.nextActions.push("本机发现 aliyun CLI，但未发现常见配置文件；不要把 AccessKey 写入仓库，优先使用阿里云官方登录/配置方式。")
  }
  if (cliAvailable && configProbe.ready !== true) {
    report.blockers.push(configProbe.failureCategory)
    if (configProbe.failureCategory === "aliyun_cli_profile_not_configured") {
      report.nextActions.push("Aliyun CLI default profile 未配置；请在安全终端或 CloudShell 完成官方登录/配置后再跑只读 inventory，不要把 AccessKeySecret 写进仓库。")
    } else if (configProbe.failureCategory === "aliyun_cli_config_incomplete") {
      report.nextActions.push("Aliyun CLI 配置不完整，至少缺 region；请补齐 cn-hangzhou 或改用 CloudShell 后再跑只读 inventory。")
    } else {
      report.nextActions.push("Aliyun CLI 配置探针未通过；请先修复本机 CLI/CloudShell 配置，再跑只读 inventory。")
    }
  }
  if (cloudAccessObservation.exists && cloudAccessObservation.ready !== true) {
    report.blockers.push(...cloudAccessObservation.blockers)
    if (cloudAccessObservation.cloudShell.connected && cloudAccessObservation.cloudShell.cliAvailable) {
      report.nextActions.push("Cloud Shell 已能启动 aliyun CLI，但当前观察显示缺 CLI 配置；只能继续用控制台页面核验证据，不能声称已具备自动云 API inventory。")
    }
    if (cloudAccessObservation.workbenchTerminal?.connected === true && cloudAccessObservation.workbenchTerminal?.cliInventoryAttempted !== true) {
      report.nextActions.push("Chrome 中可见的 ECS Workbench 终端只证明远程终端已连接；未运行 allowlisted inventory 前，不能把它当作 CloudShell/OpenAPI 只读盘点 ready。")
    }
  }
  if (browserProbe.canUseCurrentConsole !== true) {
    report.blockers.push(...browserProbe.blockers)
    report.nextActions.push("当前 Chrome 没有可复用的阿里云控制台标签页；需要重新打开控制台页面，或改用 CloudShell/CLI 只读 inventory 后再回填证据。")
  }
  if (!cloudAccessObservation.exists) {
    report.nextActions.push("如使用已登录 Chrome 或 Cloud Shell 做云侧只读核验，把非密钥观察写入 deploy/aliyun-production-cn.cloud-access.local.json。")
  }
  report.nextActions.push("从控制台读取资源名、布尔状态、digest 和证据编号后，只写入 ignored 的 .local.json；不要写入任何密钥。")
  report.nextActions.push("云资源配置完成后运行 corepack pnpm aliyun:cloud:confirmations:strict、corepack pnpm aliyun:image:plan:strict、corepack pnpm aliyun:domain:strict。")

  const secretLikePaths = findSecretLikeValues(report)
  if (secretLikePaths.length) {
    report.ok = false
    report.blockers.push(`report_contains_secret_like_values:${secretLikePaths.join(",")}`)
  }

  const json = JSON.stringify(report, null, 2)
  if (args.writeReport) writeFileSync(args.writeReport, `${json}\n`, { mode: 0o600 })
  console.log(json)
  if (args.strict && !report.canReadCloudNow) process.exit(1)
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-cloud-access.mjs [--strict] [--write-report /tmp/report.json]",
    "  node scripts/check-aliyun-cloud-access.mjs --cloud-access-observation deploy/aliyun-production-cn.cloud-access.local.json",
    "",
    "Checks whether this machine can perform read-only Aliyun cloud inventory and prints",
    "a non-secret console evidence checklist for production-cn cloud confirmations.",
    "It does not call Aliyun cloud APIs, create resources, change DNS, push images, or read CLI secrets.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
