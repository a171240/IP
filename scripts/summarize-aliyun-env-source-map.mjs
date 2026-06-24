#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  OPTIONAL_KEYS,
  REQUIRED_KEYS,
  buildImportPlan,
  parseEnvFile,
} from "./prepare-aliyun-runtime-env.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")

const APP_LAUNCH_BLOCKING_VARIABLES = new Set(["APPLE_TEAM_ID"])

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
    outPath: "",
    markdownPath: "",
    skipVercelEnvCoverage: false,
    vercelEnvCoverageInput: "",
    vercelEnvCoverageReport: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
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
    if (arg === "--skip-vercel-env-coverage") {
      args.skipVercelEnvCoverage = true
      continue
    }
    if (arg === "--vercel-env-coverage-input") {
      args.vercelEnvCoverageInput = resolveValue(argv[++index], "--vercel-env-coverage-input")
      continue
    }
    if (arg === "--vercel-env-coverage-report") {
      args.vercelEnvCoverageReport = resolveValue(argv[++index], "--vercel-env-coverage-report")
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function loadVercelCoverage(args) {
  if (args.skipVercelEnvCoverage) {
    return {
      ok: false,
      skipped: true,
      error: "",
      report: null,
    }
  }
  if (args.vercelEnvCoverageReport) {
    const report = readJson(args.vercelEnvCoverageReport)
    return {
      ok: true,
      skipped: false,
      error: "",
      report,
    }
  }

  const commandArgs = ["scripts/check-vercel-env-coverage.mjs"]
  if (args.vercelEnvCoverageInput) commandArgs.push("--input", args.vercelEnvCoverageInput)
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    return {
      ok: false,
      skipped: false,
      error: (result.stderr || result.stdout || `exit ${result.status}`).split(/\r?\n/).slice(0, 8).join(" | "),
      report: null,
    }
  }
  return {
    ok: true,
    skipped: false,
    error: "",
    report: JSON.parse(result.stdout),
  }
}

function buildReport(args) {
  const env = parseEnvFile(args.envFile)
  const plan = buildImportPlan(env)
  const vercelCoverage = loadVercelCoverage(args)
  const rows = plan.variables.map((variable) => compactVariable(variable, vercelCoverage.report))
  const groups = groupRows(rows)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    sourceCommand: "corepack pnpm aliyun:env:source-map",
    currentAnswer: "Vercel production 可以作为旧后端 API/密钥的迁移来源，但 APP 国内发布新增的微信开放平台移动应用、域名、法务链接、Apple Team ID 和阿里云资源证据仍需单独补齐；本报告不输出任何 value。",
    files: {
      envFile: args.envFile,
      envFileExists: existsSync(args.envFile),
      vercelEnvCoverageInput: args.vercelEnvCoverageInput || "",
      vercelEnvCoverageReport: args.vercelEnvCoverageReport || "",
    },
    vercelCoverage: summarizeVercelCoverage(vercelCoverage),
    summary: buildSummary(plan, rows, groups, vercelCoverage.report),
    groups,
    variables: rows,
    verificationCommands: [
      "corepack pnpm aliyun:vercel-env:coverage",
      "corepack pnpm aliyun:env:handoff",
      "corepack pnpm aliyun:env:source-map",
      "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:readiness:cloud-ready",
    ],
    safetyBoundary: [
      "本命令只读取本地 .env 状态和 Vercel 环境变量名称覆盖，不输出任何变量 value。",
      "从 Vercel 迁移 secret 时只能在动作时导入阿里云 KMS/Secrets Manager/SAE secret env。",
      "微信开放平台移动应用 AppID/AppSecret 不能用小程序 AppID/Secret 替代。",
      "APP_API_BASE_URL、APP_ASSET_BASE_URL、协议 URL 和 Apple Team ID 必须按 APP 国内发布链路确认，不能因为 Vercel 缺失就忽略。",
    ],
  }
  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    secretLikePaths,
  }
  report.ok = report.secretLeakCheck.ok && (vercelCoverage.report?.containsValues !== true)
  return report
}

function compactVariable(variable, vercelReport) {
  const vercelStatus = vercelProductionNameStatus(variable.name, vercelReport)
  return {
    name: variable.name,
    required: variable.required,
    status: variable.status,
    sensitivity: variable.sensitivity,
    sourceCategory: variable.sourceCategory,
    owner: variable.owner,
    consolePath: variable.consolePath,
    obtain: variable.obtain,
    importTarget: variable.importTarget,
    cloudConfirmationKey: variable.cloudConfirmationKey,
    vercelProductionNameStatus: vercelStatus,
    sourceDecision: sourceDecisionFor(variable, vercelStatus),
    action: sourceActionFor(variable, vercelStatus),
    forbidden: forbiddenFor(variable),
  }
}

function vercelProductionNameStatus(name, vercelReport) {
  if (!vercelReport) return "unknown_not_checked"
  const plannedNames = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS])
  if (!plannedNames.has(name)) return "not_planned"
  const missingNames = new Set([
    ...(vercelReport.requiredMissingInVercelProduction || []),
    ...(vercelReport.optionalMissingInVercelProduction || []),
  ])
  return missingNames.has(name) ? "missing" : "present"
}

function sourceDecisionFor(variable, vercelStatus) {
  if (vercelStatus === "present") return "migrate_from_vercel_production_by_name"
  if (variable.status !== "ready" && (variable.required || APP_LAUNCH_BLOCKING_VARIABLES.has(variable.name))) {
    return "blocked_external_value_required"
  }
  if (vercelStatus === "unknown_not_checked") return "vercel_coverage_not_checked"
  if (isAppOrAliyunOwned(variable)) return "new_app_or_aliyun_production_cn_value"
  if (vercelStatus === "missing" && variable.status === "ready") return "ready_locally_but_not_in_vercel_production_names"
  if (vercelStatus === "missing") return "not_in_vercel_confirm_source_or_defer"
  return "vercel_coverage_not_checked"
}

function sourceActionFor(variable, vercelStatus) {
  if (vercelStatus === "present") {
    return variable.importTarget === "阿里云 SAE plain env"
      ? "动作时从 Vercel production 按同名变量迁移到阿里云 SAE plain env；不写入文档。"
      : "动作时从 Vercel production 按同名变量迁移到阿里云 KMS/Secrets Manager/SAE secret env；不输出 value。"
  }
  if (variable.name === "WECHAT_OPEN_APP_ID") {
    return "微信开放平台移动应用创建并审核通过后，读取 AppID 并导入阿里云 SAE plain env。"
  }
  if (variable.name === "WECHAT_OPEN_APP_SECRET") {
    return "微信开放平台移动应用创建并审核通过后，只把 AppSecret 导入阿里云 secret env。"
  }
  if (variable.name === "APPLE_TEAM_ID") {
    return "从 Apple Developer 当前团队读取 10 位 Team ID，并导入阿里云 SAE plain env。"
  }
  if (isAppOrAliyunOwned(variable)) return variable.obtain
  if (variable.status === "ready") return "本机 production-cn env 已有 ready 值；导入前仍需动作时核对来源和目标。"
  return variable.action || variable.obtain
}

function forbiddenFor(variable) {
  if (variable.name === "WECHAT_OPEN_APP_ID") return "不能用小程序 AppID 替代；不能写进 App 包。"
  if (variable.name === "WECHAT_OPEN_APP_SECRET") return "不能用小程序 Secret 替代；不能写入文档、镜像、App 包或 git。"
  if (variable.sourceCategory === "mini_program_compat") return "仅兼容旧小程序链路，不能用于原生 APP 微信登录。"
  if (variable.importTarget !== "阿里云 SAE plain env") return "真实 value 只能进入阿里云 secret env，不能写入 JSON、Markdown、Docker 镜像或 git。"
  return "不要把真实 value 写入文档或 git。"
}

function isAppOrAliyunOwned(variable) {
  return [
    "runtime",
    "domain",
    "asset_domain",
    "legal_links",
    "wechat_open_platform",
    "ios_universal_link",
    "aliyun_oss",
    "aliyun_rds_postgresql",
    "bailian_asr",
    "future_rds",
    "future_cache",
  ].includes(variable.sourceCategory)
}

function groupRows(rows) {
  const groups = {
    migrateFromVercelProduction: [],
    appAliyunOwnedNotInVercel: [],
    blockedExternalRequired: [],
    readyLocalButMissingFromVercel: [],
    miniProgramCompatOnly: [],
    deferredOptional: [],
    unknownVercelCoverage: [],
  }

  for (const row of rows) {
    if (row.vercelProductionNameStatus === "unknown_not_checked") {
      groups.unknownVercelCoverage.push(row)
    }
    if (row.sourceDecision === "migrate_from_vercel_production_by_name") {
      groups.migrateFromVercelProduction.push(row)
    }
    if (row.sourceDecision === "new_app_or_aliyun_production_cn_value") {
      groups.appAliyunOwnedNotInVercel.push(row)
    }
    if (row.sourceDecision === "blocked_external_value_required") {
      groups.blockedExternalRequired.push(row)
    }
    if (row.sourceDecision === "ready_locally_but_not_in_vercel_production_names") {
      groups.readyLocalButMissingFromVercel.push(row)
    }
    if (row.sourceCategory === "mini_program_compat") {
      groups.miniProgramCompatOnly.push(row)
    }
    if (!row.required && row.status !== "ready" && !APP_LAUNCH_BLOCKING_VARIABLES.has(row.name)) {
      groups.deferredOptional.push(row)
    }
  }

  return groups
}

function buildSummary(plan, rows, groups, vercelReport) {
  const requiredPresent = rows.filter((row) => row.required && row.vercelProductionNameStatus === "present")
  const requiredMissing = rows.filter((row) => row.required && row.vercelProductionNameStatus === "missing")
  return {
    total: plan.summary.total,
    requiredReady: `${plan.summary.requiredReady}/${plan.summary.requiredTotal}`,
    requiredBlocking: plan.summary.requiredBlocking,
    appLaunchBlocking: plan.summary.appLaunchBlocking,
    vercelCoverageStatus: vercelReport ? "checked" : "not_checked",
    vercelRequiredCovered: vercelReport
      ? `${requiredPresent.length}/${requiredPresent.length + requiredMissing.length}`
      : "unknown",
    requiredMissingInVercelProduction: requiredMissing.map((item) => item.name),
    appSpecificMissingInVercelProduction: vercelReport?.appSpecificKeysMissingInVercelProduction || [],
    canMigrateFromVercelProduction: groups.migrateFromVercelProduction.length,
    appAliyunOwnedNotInVercel: groups.appAliyunOwnedNotInVercel.length,
    blockedExternalRequired: groups.blockedExternalRequired.map((item) => item.name),
    readyLocalButMissingFromVercel: groups.readyLocalButMissingFromVercel.map((item) => item.name),
    miniProgramCompatOnly: groups.miniProgramCompatOnly.map((item) => item.name),
    deferredOptional: groups.deferredOptional.length,
    secretOrSensitiveToImport: rows.filter((item) => item.status === "ready" && item.importTarget !== "阿里云 SAE plain env").length,
  }
}

function summarizeVercelCoverage(vercelCoverage) {
  if (vercelCoverage.skipped) {
    return {
      ok: false,
      skipped: true,
      containsValues: false,
      source: "skipped",
      requiredCovered: "unknown",
      productionNames: "unknown",
      requiredMissingInVercelProduction: [],
      appSpecificKeysMissingInVercelProduction: [],
      bridgeKeysPresentInVercelProduction: [],
      error: "",
    }
  }
  if (!vercelCoverage.ok || !vercelCoverage.report) {
    return {
      ok: false,
      skipped: false,
      containsValues: false,
      source: "vercel coverage unavailable",
      requiredCovered: "unknown",
      productionNames: "unknown",
      requiredMissingInVercelProduction: [],
      appSpecificKeysMissingInVercelProduction: [],
      bridgeKeysPresentInVercelProduction: [],
      error: vercelCoverage.error || "unknown",
    }
  }
  const report = vercelCoverage.report
  return {
    ok: true,
    skipped: false,
    containsValues: report.containsValues === true,
    source: report.source || "vercel env ls --format json",
    project: report.project || "",
    scope: report.scope || "",
    environment: report.environment || "production",
    requiredCovered: `${report.totals?.requiredPresentInVercelProduction ?? "unknown"}/${report.totals?.requiredTotal ?? "unknown"}`,
    productionNames: report.totals?.productionNames ?? "unknown",
    requiredMissingInVercelProduction: report.requiredMissingInVercelProduction || [],
    appSpecificKeysMissingInVercelProduction: report.appSpecificKeysMissingInVercelProduction || [],
    bridgeKeysPresentInVercelProduction: report.bridgeKeysPresentInVercelProduction || [],
    error: "",
  }
}

function renderMarkdown(report) {
  return [
    "# 美业话镜 APP production-cn 环境变量来源映射",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- vercelCoverage: ${report.vercelCoverage.ok ? "checked" : report.vercelCoverage.skipped ? "skipped" : "failed"}`,
    `- requiredReady: ${report.summary.requiredReady}`,
    `- vercelRequiredCovered: ${report.summary.vercelRequiredCovered}`,
    `- canMigrateFromVercelProduction: ${report.summary.canMigrateFromVercelProduction}`,
    `- appAliyunOwnedNotInVercel: ${report.summary.appAliyunOwnedNotInVercel}`,
    `- blockedExternalRequired: ${report.summary.blockedExternalRequired.join(", ") || "none"}`,
    "",
    "## Vercel 缺失的必填变量",
    "",
    ...(report.summary.requiredMissingInVercelProduction.length
      ? report.summary.requiredMissingInVercelProduction.map((name) => `- ${name}`)
      : ["- none"]),
    "",
    "## 可按同名从 Vercel Production 迁移",
    "",
    ...renderVariableLines(report.groups.migrateFromVercelProduction),
    "## APP/阿里云国内发布新增或云侧确认值",
    "",
    ...renderVariableLines(report.groups.appAliyunOwnedNotInVercel),
    "## 外部阻塞值",
    "",
    ...renderVariableLines(report.groups.blockedExternalRequired),
    "## 小程序兼容变量",
    "",
    ...renderVariableLines(report.groups.miniProgramCompatOnly),
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
    "## 验证命令",
    "",
    ...report.verificationCommands.map((item) => `- \`${item}\``),
  ].join("\n")
}

function renderVariableLines(items) {
  if (!items.length) return ["- none", ""]
  return [
    "| 变量 | 状态 | 来源判断 | 来源分类 | 导入目标 | 动作 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.name),
      escapeTableCell(item.status),
      escapeTableCell(item.sourceDecision),
      escapeTableCell(item.sourceCategory),
      escapeTableCell(item.importTarget),
      escapeTableCell(item.action),
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

function writeReport(report, args) {
  if (args.outPath) {
    writeFileSync(args.outPath, JSON.stringify(report, null, 2), { mode: 0o600 })
  }
  if (args.markdownPath) {
    writeFileSync(args.markdownPath, renderMarkdown(report), { mode: 0o600 })
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-env-source-map.mjs [--env-file path] [--skip-vercel-env-coverage] [--vercel-env-coverage-input raw-vercel-json] [--vercel-env-coverage-report report.json] [--out /tmp/source-map.json] [--markdown /tmp/source-map.md]",
    "",
    "Combines the Aliyun production-cn env import plan with Vercel production env-name coverage.",
    "It never prints env values.",
  ].join("\n"))
}

try {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  writeReport(report, args)
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
