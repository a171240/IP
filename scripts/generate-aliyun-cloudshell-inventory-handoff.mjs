#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_OUT = ""
const DEFAULT_MARKDOWN = ""

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
    out: DEFAULT_OUT,
    markdown: DEFAULT_MARKDOWN,
    cloudInventoryResultsFile: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--out") {
      args.out = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdown = resolveValue(argv[++index], "--markdown")
      continue
    }
    if (arg === "--cloud-inventory-results") {
      args.cloudInventoryResultsFile = resolveValue(argv[++index], "--cloud-inventory-results")
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
    maxBuffer: 1024 * 1024 * 30,
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

function compactOperation(operation) {
  return {
    id: operation.id,
    title: operation.title,
    product: operation.product,
    region: operation.region,
    status: operation.status,
    consoleFallback: operation.consoleFallback,
    commands: (operation.commandPlan || []).map((item) => ({
      command: item.command,
      purpose: item.purpose,
      helpCommand: item.helpCommand,
    })),
    writeTargets: operation.writeTargets || [],
    forbiddenCommands: operation.forbiddenCommands || [],
  }
}

function summarizeCurrentBrowserProbe(probe = {}) {
  const tabs = Array.isArray(probe.aliyunConsoleTabs) ? probe.aliyunConsoleTabs : []
  return {
    checked: probe.checked === true,
    browser: probe.browser || "",
    running: probe.running === true,
    canUseCurrentConsole: probe.canUseCurrentConsole === true,
    tabCount: toNumber(probe.tabCount),
    aliyunConsoleTabCount: toNumber(probe.aliyunConsoleTabCount),
    aliyunConsoleHostPaths: tabs.map((item) => item.hostPath).filter(Boolean),
    evidence: probe.evidence || "",
    cloudApiCalled: probe.cloudApiCalled === true,
    cloudMutationPerformed: probe.cloudMutationPerformed === true,
    blockers: Array.isArray(probe.blockers) ? probe.blockers : [],
    note: probe.note || "",
  }
}

function summarizeCloudShellGate(cloudShell = {}) {
  const blockers = Array.isArray(cloudShell.blockers) ? cloudShell.blockers.map((item) => String(item)) : []
  const evidence = String(cloudShell.evidence || "")
  const requiresOpenConfirmation = blockers.includes("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning") ||
    /performance_nas_may_generate_small_usage_fees|NAS|费用|开通/.test(evidence)
  return {
    connected: cloudShell.connected === true,
    cliAvailable: cloudShell.cliAvailable === true,
    cliConfigFileExists: cloudShell.cliConfigFileExists === true,
    canRunReadOnlyInventory: cloudShell.canRunReadOnlyInventory === true,
    blockers,
    evidence,
    requiresActionTimeOpenConfirmation: requiresOpenConfirmation,
    billingWarning: requiresOpenConfirmation
      ? "CloudShell page requires clicking 开通 and warns that it may create a performance NAS instance with possible usage fees."
      : "",
    currentStatus: cloudShell.canRunReadOnlyInventory === true
      ? "ready"
      : requiresOpenConfirmation
        ? "not_opened_nas_fee_confirmation_required"
        : "cloudshell_cli_config_missing_or_unread",
  }
}

function summarizeCloudInventoryResults(cloudInventoryResults = {}) {
  const local = cloudInventoryResults.local || {}
  const observationSummary = local.observationSummary || {}
  const summary = cloudInventoryResults.summary || {}
  const localOperations = firstNumber(summary.localOperations, observationSummary.operations, local.checkedOperations)
  const readyLocalOperations = firstNumber(summary.readyLocalOperations, observationSummary.strictReadyOperations)
  const commandResults = firstNumber(observationSummary.commandResults)
  const executedCommandResults = firstNumber(observationSummary.executedCommandResults)
  const cloudApiCalledCommandResults = firstNumber(observationSummary.cloudApiCalledCommandResults)
  const mutationPerformedCommandResults = firstNumber(observationSummary.mutationPerformedCommandResults)
  const ready = local.exists === true &&
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
    observedOperationIds: Array.isArray(observationSummary.observedOperationIds) ? observationSummary.observedOperationIds : [],
    notFoundOperationIds: Array.isArray(observationSummary.notFoundOperationIds) ? observationSummary.notFoundOperationIds : [],
    blockedOperationIds: Array.isArray(observationSummary.blockedOperationIds) ? observationSummary.blockedOperationIds : [],
    blockers: Array.isArray(local.blockers) ? local.blockers : [],
    evidence: ready ? [
      `readyLocalOperations=${readyLocalOperations}/${localOperations}`,
      `executedCommandResults=${executedCommandResults}/${commandResults}`,
      `cloudApiCalledCommandResults=${cloudApiCalledCommandResults}`,
      `mutationPerformedCommandResults=${mutationPerformedCommandResults}`,
    ] : [],
  }
}

function buildCurrentAnswer(cloudAccess, existingInventoryEvidence) {
  if (cloudAccess.canReadCloudNow === true) {
    return "Aliyun CLI/CloudShell read-only inventory can be attempted after action-time confirmation."
  }
  const cloudShell = summarizeCloudShellGate(cloudAccess.cloudShellObservation?.cloudShell || {})
  if (cloudShell.requiresActionTimeOpenConfirmation) {
    return "Aliyun CloudShell read-only inventory is blocked because the current CloudShell page requires 开通 and warns about possible performance NAS usage fees; do not click it without action-time confirmation."
  }
  if (existingInventoryEvidence.ready === true) {
    return "Existing strict inventory evidence is ready, but current Aliyun CLI/CloudShell identity is not ready for refresh; do not treat later cloud changes as verified until inventory is rerun."
  }
  return "Aliyun CLI/CloudShell read-only inventory is still blocked by local CLI/CloudShell configuration; do not treat cloud resources as ready."
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildReport(options = {}) {
  const cloudAccess = runJson("cloud_access", ["scripts/check-aliyun-cloud-access.mjs"])
  const inventoryPlan = runJson("cloud_inventory_plan", ["scripts/generate-aliyun-cli-inventory-plan.mjs"])
  const cloudInventoryResults = runJson("cloud_inventory_results", [
    "scripts/check-aliyun-cli-inventory-results.mjs",
    "--allow-incomplete",
    ...(options.cloudInventoryResultsFile ? ["--local", options.cloudInventoryResultsFile] : []),
  ])
  const cliProbe = cloudAccess.cli?.configProbe || {}
  const workbenchTerminal = cloudAccess.terminalAccess?.workbenchTerminal || cloudAccess.cloudShellObservation?.workbenchTerminal || {}
  const currentBrowser = summarizeCurrentBrowserProbe(cloudAccess.localBrowserProbe || {})
  const cloudShellGate = summarizeCloudShellGate(cloudAccess.cloudShellObservation?.cloudShell || {})
  const existingInventoryEvidence = summarizeCloudInventoryResults(cloudInventoryResults)
  const operations = (inventoryPlan.operations || []).map(compactOperation)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    objective: "handoff Aliyun CLI/CloudShell read-only inventory without leaking secrets",
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    executionMode: "handoff_only",
    currentAnswer: buildCurrentAnswer(cloudAccess, existingInventoryEvidence),
    cliReadiness: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true,
      cliBinary: cloudAccess.cli?.binary || "",
      cliConfigFileExists: cloudAccess.cli?.configFileExists === true,
      configProbe: cliProbe,
      blockers: cloudAccess.blockers || [],
      strictInventoryAlreadyReady: existingInventoryEvidence.ready === true,
    },
    currentBrowser,
    cloudShellGate,
    existingInventoryEvidence,
    inventoryPlan: {
      status: inventoryPlan.status,
      canRunReadOnlyInventoryNow: inventoryPlan.canRunReadOnlyInventoryNow === true,
      totalOperations: inventoryPlan.summary?.totalOperations ?? operations.length,
      commandTemplates: inventoryPlan.summary?.commandTemplates ?? operations.reduce((total, item) => total + item.commands.length, 0),
      requiresActionTimeConfirmation: inventoryPlan.summary?.requiresActionTimeConfirmation || [],
    },
    operatorPaths: [
      {
        id: "local_cli",
        title: "本机 Aliyun CLI",
        currentStatus: cliProbe.ready === true ? "ready" : (cliProbe.failureCategory || "unknown"),
        allowedActions: [
          "在安全终端完成阿里云官方 CLI 登录或 default profile 配置。",
          "把 region 明确设为 cn-hangzhou。",
          "重新运行 corepack pnpm aliyun:cloud:access 与受控只读 inventory runner。",
        ],
        forbidden: [
          "不要把 AccessKeySecret、STS token、cookie 或账号凭据写入 repo、JSON、Markdown、截图或聊天。",
          "不要执行购买、创建、更新、删除、部署、DNS 修改、docker login/push 或 OSS 对象读写命令。",
        ],
        verifyCommands: [
          "corepack pnpm aliyun:cloud:access",
          "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json",
          "corepack pnpm aliyun:cloud:inventory-results:strict",
        ],
      },
      {
        id: "aliyun_cloudshell",
        title: "阿里云 CloudShell",
        currentStatus: cloudShellGate.currentStatus,
        cloudShellConnected: cloudShellGate.connected,
        cloudShellCliAvailable: cloudShellGate.cliAvailable,
        cloudShellCliConfigFileExists: cloudShellGate.cliConfigFileExists,
        cloudShellCanRunReadOnlyInventory: cloudShellGate.canRunReadOnlyInventory,
        cloudShellBlockers: cloudShellGate.blockers,
        cloudShellEvidence: cloudShellGate.evidence,
        requiresActionTimeOpenConfirmation: cloudShellGate.requiresActionTimeOpenConfirmation,
        billingWarning: cloudShellGate.billingWarning,
        currentBrowserCanUseCurrentConsole: currentBrowser.canUseCurrentConsole === true,
        currentBrowserAliyunConsoleHostPaths: currentBrowser.aliyunConsoleHostPaths,
        currentBrowserCloudApiCalled: currentBrowser.cloudApiCalled === true,
        currentBrowserCloudMutationPerformed: currentBrowser.cloudMutationPerformed === true,
        currentBrowserEvidence: currentBrowser.evidence,
        consolePath: "阿里云控制台 -> CloudShell -> cn-hangzhou / 华东1或华东2账号上下文",
        allowedActions: [
          "如果页面要求点击开通，必须先获得动作时确认，因为当前页面提示可能创建性能型 NAS 并产生少量费用。",
          "只运行 inventoryPlan.operations 中列出的 List/Describe/stat/get 类只读命令。",
          "只把资源名、布尔状态、digest、exit 状态、时间戳和非密钥 evidence handle 回填到 ignored 的 .local.json。",
          "如 CloudShell 无法访问本地 repo，则按命令计划人工记录非密钥摘要，再回到本机回填。",
        ],
        forbidden: [
          "不要运行 Create/Update/Delete/Deploy/Start/Stop/GetAuthorizationToken/docker login/push/oss cp/oss cat/oss sign。",
          "不要复制 CloudShell 中的 AccessKeySecret、STS token、cookie、registry password 或证书私钥。",
        ],
        verifyCommands: [
          "corepack pnpm aliyun:cloud:inventory-results:strict",
          "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
          "corepack pnpm aliyun:completion:audit",
        ],
      },
      {
        id: "ecs_workbench_terminal",
        title: "阿里云 ECS Workbench 终端",
        currentStatus: workbenchTerminal.connected === true
          ? "connected_not_inventory_ready"
          : workbenchTerminal.observed === true
            ? "observed_not_connected"
            : "not_observed",
        consolePath: "阿里云控制台 -> ECS Workbench / 终端",
        currentEvidence: workbenchTerminal.evidence || "",
        allowedActions: [
          "只把可见终端连接状态、标题、非敏感主机标签和时间戳记录为人工观察证据。",
          "如果后续要在该终端运行 Aliyun CLI，只能运行 inventoryPlan.operations 中列出的只读命令。",
          "未记录 allowlisted inventory 执行结果前，不把 Workbench 终端视为 CloudShell/OpenAPI readiness。",
        ],
        forbidden: [
          "不要在 Workbench 终端里执行购买、创建、更新、删除、部署、DNS 修改、docker login/push 或 OSS 对象读写命令。",
          "不要复制终端里的 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。",
          "不要把普通远程终端连接状态当成阿里云 CloudShell 已配置或云资源已验收。",
        ],
        verifyCommands: [
          "corepack pnpm aliyun:cloud:access",
          "corepack pnpm aliyun:cloud:inventory-results:strict",
          "corepack pnpm aliyun:blockers:brief",
        ],
      },
    ],
    operations,
    writebackTargets: [
      "deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
      "deploy/aliyun-production-cn.image-publish.local.json",
    ],
    strictVerificationOrder: [
      "corepack pnpm aliyun:cloud:access",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "This command only generates a local handoff package.",
      "It does not call Aliyun cloud APIs, configure CLI credentials, create resources, change DNS, import env vars, push images, or deploy production-cn.",
      "All reports are value-free; raw CLI stdout/stderr and credential files are never read or written.",
    ],
  }
  const secretLeakCheck = findSecretLikeValues(report)
  return {
    ...report,
    ok: secretLeakCheck.length === 0,
    secretLeakCheck: {
      ok: secretLeakCheck.length === 0,
      matches: secretLeakCheck,
    },
  }
}

function renderMarkdown(report) {
  return [
    "# 美业话镜 APP production-cn CloudShell/CLI 只读盘点交接包",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 当前结论",
    "",
    `- ${report.currentAnswer}`,
    `- canReadCloudNow: ${report.cliReadiness.canReadCloudNow}`,
    `- cliConfigProbeReady: ${report.cliReadiness.configProbe?.ready === true}`,
    `- cliConfigProbeFailureCategory: ${report.cliReadiness.configProbe?.failureCategory || "none"}`,
    `- strictInventoryAlreadyReady: ${report.existingInventoryEvidence.ready === true}`,
    `- strictInventoryReadyLocalOperations: ${report.existingInventoryEvidence.readyLocalOperations}/${report.existingInventoryEvidence.localOperations}`,
    `- strictInventoryExecutedCommandResults: ${report.existingInventoryEvidence.executedCommandResults}/${report.existingInventoryEvidence.commandResults}`,
    `- strictInventoryCloudApiCalledCommandResults: ${report.existingInventoryEvidence.cloudApiCalledCommandResults}`,
    `- strictInventoryMutationPerformedCommandResults: ${report.existingInventoryEvidence.mutationPerformedCommandResults}`,
    `- currentBrowserCanUseCurrentConsole: ${report.currentBrowser.canUseCurrentConsole === true}`,
    `- currentBrowserAliyunConsoleTabCount: ${report.currentBrowser.aliyunConsoleTabCount}`,
    `- currentBrowserAliyunConsoleHostPaths: ${formatList(report.currentBrowser.aliyunConsoleHostPaths)}`,
    `- currentBrowserCloudApiCalled: ${report.currentBrowser.cloudApiCalled === true}`,
    `- currentBrowserCloudMutationPerformed: ${report.currentBrowser.cloudMutationPerformed === true}`,
    `- cloudShellCurrentStatus: ${report.cloudShellGate.currentStatus}`,
    `- cloudShellRequiresActionTimeOpenConfirmation: ${report.cloudShellGate.requiresActionTimeOpenConfirmation === true}`,
    `- cloudShellBillingWarning: ${report.cloudShellGate.billingWarning || "none"}`,
    `- cloudShellBlockers: ${formatList(report.cloudShellGate.blockers)}`,
    `- inventoryPlanStatus: ${report.inventoryPlan.status}`,
    `- totalOperations: ${report.inventoryPlan.totalOperations}`,
    `- commandTemplates: ${report.inventoryPlan.commandTemplates}`,
    "",
    "## 已有 strict inventory 证据",
    "",
    `- exists: ${report.existingInventoryEvidence.exists === true}`,
    `- ready: ${report.existingInventoryEvidence.ready === true}`,
    `- localOperations: ${report.existingInventoryEvidence.readyLocalOperations}/${report.existingInventoryEvidence.localOperations}`,
    `- commandResults: ${report.existingInventoryEvidence.executedCommandResults}/${report.existingInventoryEvidence.commandResults}`,
    `- mutationPerformedCommandResults: ${report.existingInventoryEvidence.mutationPerformedCommandResults}`,
    `- observedOperationIds: ${formatList(report.existingInventoryEvidence.observedOperationIds)}`,
    `- notFoundOperationIds: ${formatList(report.existingInventoryEvidence.notFoundOperationIds)}`,
    `- blockedOperationIds: ${formatList(report.existingInventoryEvidence.blockedOperationIds)}`,
    ...(report.existingInventoryEvidence.blockers.length
      ? report.existingInventoryEvidence.blockers.map((item) => `- ${item}`)
      : ["- blockers: none"]),
    "",
    "## 操作路径",
    "",
    ...report.operatorPaths.flatMap(renderOperatorPath),
    "## 只读命令计划",
    "",
    ...report.operations.flatMap(renderOperation),
    "## 回填目标",
    "",
    ...report.writebackTargets.map((item) => `- ${item}`),
    "",
    "## Strict 验证顺序",
    "",
    ...report.strictVerificationOrder.map((item) => `- \`${item}\``),
    "",
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
  ].join("\n") + "\n"
}

function renderOperatorPath(item) {
  return [
    `### ${item.title}`,
    "",
    `- id: ${item.id}`,
    `- currentStatus: ${item.currentStatus}`,
    ...(item.consolePath ? [`- consolePath: ${item.consolePath}`] : []),
    ...(typeof item.currentBrowserCanUseCurrentConsole === "boolean" ? [`- currentBrowserCanUseCurrentConsole: ${item.currentBrowserCanUseCurrentConsole}`] : []),
    ...(typeof item.cloudShellConnected === "boolean" ? [`- cloudShellConnected: ${item.cloudShellConnected}`] : []),
    ...(typeof item.cloudShellCanRunReadOnlyInventory === "boolean" ? [`- cloudShellCanRunReadOnlyInventory: ${item.cloudShellCanRunReadOnlyInventory}`] : []),
    ...(typeof item.requiresActionTimeOpenConfirmation === "boolean" ? [`- requiresActionTimeOpenConfirmation: ${item.requiresActionTimeOpenConfirmation}`] : []),
    ...(Array.isArray(item.cloudShellBlockers) ? [`- cloudShellBlockers: ${formatList(item.cloudShellBlockers)}`] : []),
    ...(item.billingWarning ? [`- billingWarning: ${item.billingWarning}`] : []),
    ...(item.cloudShellEvidence ? [`- cloudShellEvidence: ${item.cloudShellEvidence}`] : []),
    ...(Array.isArray(item.currentBrowserAliyunConsoleHostPaths) ? [`- currentBrowserAliyunConsoleHostPaths: ${formatList(item.currentBrowserAliyunConsoleHostPaths)}`] : []),
    ...(typeof item.currentBrowserCloudApiCalled === "boolean" ? [`- currentBrowserCloudApiCalled: ${item.currentBrowserCloudApiCalled}`] : []),
    ...(typeof item.currentBrowserCloudMutationPerformed === "boolean" ? [`- currentBrowserCloudMutationPerformed: ${item.currentBrowserCloudMutationPerformed}`] : []),
    ...(item.currentBrowserEvidence ? [`- currentBrowserEvidence: ${item.currentBrowserEvidence}`] : []),
    "- allowedActions:",
    ...item.allowedActions.map((value) => `  - ${value}`),
    "- forbidden:",
    ...item.forbidden.map((value) => `  - ${value}`),
    "- verifyCommands:",
    ...item.verifyCommands.map((value) => `  - ${value}`),
    "",
  ]
}

function formatList(items) {
  return Array.isArray(items) && items.length ? items.join(", ") : "none"
}

function renderOperation(operation) {
  return [
    `### ${operation.id} ${operation.title}`,
    "",
    `- product: ${operation.product}`,
    `- region: ${operation.region}`,
    `- status: ${operation.status}`,
    `- consoleFallback: ${operation.consoleFallback}`,
    "- commands:",
    ...operation.commands.map((item) => `  - \`${item.command}\` - ${item.purpose}`),
    `- writeTargets: ${operation.writeTargets.join("; ") || "none"}`,
    `- forbiddenCommands: ${operation.forbiddenCommands.join(", ") || "none"}`,
    "",
  ]
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
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function printHelp() {
  console.log(`Usage: node scripts/generate-aliyun-cloudshell-inventory-handoff.mjs [options]

Options:
  --out <path>                      write JSON handoff
  --markdown <path>                 write Markdown handoff
  --cloud-inventory-results <path>  use a specific local inventory results file
`)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  const json = JSON.stringify(report, null, 2)
  if (args.out) writeText(args.out, json)
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  console.log(json)
  if (!report.ok) process.exitCode = 1
}

main()
