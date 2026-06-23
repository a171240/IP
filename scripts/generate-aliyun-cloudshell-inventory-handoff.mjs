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

function buildReport() {
  const cloudAccess = runJson("cloud_access", ["scripts/check-aliyun-cloud-access.mjs"])
  const inventoryPlan = runJson("cloud_inventory_plan", ["scripts/generate-aliyun-cli-inventory-plan.mjs"])
  const cliProbe = cloudAccess.cli?.configProbe || {}
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
    currentAnswer: cloudAccess.canReadCloudNow === true
      ? "Aliyun CLI/CloudShell read-only inventory can be attempted after action-time confirmation."
      : "Aliyun CLI/CloudShell read-only inventory is still blocked by local CLI/CloudShell configuration; do not treat cloud resources as ready.",
    cliReadiness: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      cliAvailable: cloudAccess.cli?.available === true,
      cliBinary: cloudAccess.cli?.binary || "",
      cliConfigFileExists: cloudAccess.cli?.configFileExists === true,
      configProbe: cliProbe,
      blockers: cloudAccess.blockers || [],
    },
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
        currentStatus: cloudAccess.cloudShellObservation?.ready === true ? "ready" : "cloudshell_cli_config_missing_or_unread",
        consolePath: "阿里云控制台 -> CloudShell -> cn-hangzhou / 华东1或华东2账号上下文",
        allowedActions: [
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
    `- inventoryPlanStatus: ${report.inventoryPlan.status}`,
    `- totalOperations: ${report.inventoryPlan.totalOperations}`,
    `- commandTemplates: ${report.inventoryPlan.commandTemplates}`,
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
    "- allowedActions:",
    ...item.allowedActions.map((value) => `  - ${value}`),
    "- forbidden:",
    ...item.forbidden.map((value) => `  - ${value}`),
    "- verifyCommands:",
    ...item.verifyCommands.map((value) => `  - ${value}`),
    "",
  ]
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
  --out <path>       write JSON handoff
  --markdown <path>  write Markdown handoff
`)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport()
  const json = JSON.stringify(report, null, 2)
  if (args.out) writeText(args.out, json)
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  console.log(json)
  if (!report.ok) process.exitCode = 1
}

main()
