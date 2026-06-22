#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { SENSITIVE_ACTION_METADATA } from "./aliyun-sensitive-action-metadata.mjs"

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

function runOperatorTasks(args) {
  const result = spawnSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`operator_tasks_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`invalid_operator_tasks_json:${error instanceof Error ? error.message : String(error)}`)
  }
}

function summarize(items) {
  const blocked = items.filter((item) => item.status !== "ready")
  const byType = {}
  const byOwner = {}
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1
    byOwner[item.owner] = (byOwner[item.owner] || 0) + 1
  }
  return {
    total: items.length,
    ready: items.length - blocked.length,
    blocked: blocked.length,
    blockedIds: blocked.map((item) => item.id),
    byType,
    byOwner,
    actionTimeConfirmationRequired: items
      .filter((item) => item.requiresActionTimeConfirmation === true)
      .map((item) => item.id),
    variableNames: unique(items.flatMap((item) => item.variableNames || [])).sort(),
    readySensitiveEnvVariableGroups: items
      .filter((item) => item.id === "S06_READY_SENSITIVE_ENV_IMPORT")
      .flatMap((item) => item.variableGroups || [])
      .map((group) => ({
        category: group.category,
        owner: group.owner,
        importTarget: group.importTarget,
        count: group.count,
        variableNames: group.variableNames || [],
      })),
    variableDetails: {
      total: items.reduce((sum, item) => sum + (item.variableDetails || []).length, 0),
      blocked: items.reduce((sum, item) =>
        sum + (item.variableDetails || []).filter((variable) => variable.status !== "ready").length, 0),
      ready: items.reduce((sum, item) =>
        sum + (item.variableDetails || []).filter((variable) => variable.status === "ready").length, 0),
      secretOrSensitive: items.reduce((sum, item) =>
        sum + (item.variableDetails || []).filter((variable) => variable.sensitivity !== "public").length, 0),
    },
  }
}

function compactItem(item) {
  const metadata = SENSITIVE_ACTION_METADATA[item.id] || {}
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    owner: item.owner,
    consolePath: item.consolePath,
    obtainFrom: item.obtainFrom || metadata.obtainFrom || item.consolePath,
    writeTargets: item.writeTargets || metadata.writeTargets || [],
    verifyCommands: item.verifyCommands || metadata.verifyCommands || [],
    requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true || metadata.requiresActionTimeConfirmation === true,
    completionEvidence: item.completionEvidence || metadata.completionEvidence || [],
    variableNames: item.variableNames || [],
    variableGroups: item.variableGroups || [],
    variableDetails: item.variableDetails || [],
    requiredUserAction: item.requiredUserAction,
    unblockCondition: item.unblockCondition,
    forbidden: item.forbidden,
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
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

function buildReport(operatorTasks) {
  const items = (operatorTasks.sensitiveActionItems || []).map(compactItem)
  const summary = summarize(items)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    sourceCommand: "corepack pnpm aliyun:operator:tasks",
    currentAnswer: summary.blocked
      ? "当前仍有密钥、密码、token、付款或受控标识符类人工介入项；本报告只列变量名和控制台路径，不输出任何 value。"
      : "当前没有未完成的密钥、密码、token、付款或受控标识符类人工介入项。",
    summary,
    items,
    nextActions: [
      "先处理 S01 微信开放平台移动应用创建/审核；审核通过后再获取 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET。",
      "确认 APPLE_TEAM_ID 后只导入 plain env，用于 AASA；不要猜测。",
      "ACR 付费、registry 登录、RAM Secret、STS token 和环境变量导入都必须在阿里云官方控制台或受控密钥环境完成。",
      "导入完成后只在 ignored 的 .local.json 里记录资源名、布尔状态和非密钥证据编号。",
    ],
    safetyBoundary: [
      "本报告不创建资源、不付款、不修改 DNS、不导入环境变量、不调用阿里云写 API。",
      "本报告不读取或打印 secret value；只复用 operator tasks 的变量名、控制台路径和动作说明。",
      "不要把 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key 写入 git。",
    ],
  }
  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    secretLikePaths,
  }
  report.ok = report.secretLeakCheck.ok
  return report
}

function renderMarkdown(report) {
  const lines = [
    "# 美业话镜 APP production-cn 密钥/密码/token/付款/受控标识符阻塞项",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- blocked: ${report.summary.blocked} / ${report.summary.total}`,
    `- actionTimeConfirmationRequired: ${report.summary.actionTimeConfirmationRequired.length ? report.summary.actionTimeConfirmationRequired.join(", ") : "none"}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    "",
    "## 按类型汇总",
    "",
    ...Object.entries(report.summary.byType).map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## 变量名",
    "",
    ...(report.summary.variableNames.length
      ? report.summary.variableNames.map((name) => `- ${name}`)
      : ["- none"]),
    "",
    "## 人工介入项",
    "",
  ]

  for (const item of report.items) {
    lines.push(
      `### ${item.id}`,
      "",
      `- type: ${item.type}`,
      `- status: ${item.status}`,
      `- owner: ${item.owner}`,
      `- consolePath: ${item.consolePath}`,
      `- obtainFrom: ${item.obtainFrom}`,
      `- writeTargets: ${item.writeTargets.length ? item.writeTargets.join("; ") : "none"}`,
      `- verifyCommands: ${item.verifyCommands.length ? item.verifyCommands.join("; ") : "none"}`,
      `- requiresActionTimeConfirmation: ${item.requiresActionTimeConfirmation}`,
      `- completionEvidence: ${item.completionEvidence.length ? item.completionEvidence.join("; ") : "none"}`,
      `- variableNames: ${item.variableNames.length ? item.variableNames.join(", ") : "none"}`,
      `- requiredUserAction: ${item.requiredUserAction}`,
      `- unblockCondition: ${item.unblockCondition}`,
      `- forbidden: ${item.forbidden}`,
      "",
    )
    if (item.variableDetails.length) {
      lines.push(
        "#### 变量获取和导入明细",
        "",
        ...renderVariableDetailTable(item.variableDetails),
      )
    }
  }

  lines.push(
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
  )
  return `${lines.join("\n")}\n`
}

function renderVariableDetailTable(items) {
  return [
    "| 变量 | 必填 | 状态 | 敏感等级 | 来源分类 | 获取位置 | 导入目标 | 解除/动作 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.name),
      item.required ? "是" : "否",
      escapeTableCell(item.status),
      escapeTableCell(item.sensitivity),
      escapeTableCell(item.sourceCategory),
      escapeTableCell(item.consolePath),
      escapeTableCell(item.importTarget),
      escapeTableCell(item.action || item.obtain),
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

function writeOutput(filePath, content) {
  if (!filePath) return
  if (!isAbsolute(filePath)) throw new Error("output_path_must_be_absolute")
  writeFileSync(filePath, content, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const operatorTasks = runOperatorTasks(args)
  const report = buildReport(operatorTasks)
  const json = JSON.stringify(report, null, 2)
  writeOutput(args.outPath, json)
  writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(json)
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-sensitive-blockers.mjs [--out /tmp/blockers.json] [--markdown /tmp/blockers.md]",
    "",
    "Prints a value-free summary of credential/password/token/payment blockers",
    "from aliyun:operator:tasks. It does not create resources, import secrets,",
    "change DNS, deploy, push images, or call Aliyun write APIs.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
