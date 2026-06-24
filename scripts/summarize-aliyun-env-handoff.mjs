#!/usr/bin/env node

import { existsSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildImportPlan, parseEnvFile } from "./prepare-aliyun-runtime-env.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")

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

const GROUPS = Object.freeze([
  ["blockedRequired", "必填阻塞变量"],
  ["appLaunchBlocking", "APP 发布阻塞但非后端必填"],
  ["readyPlainEnv", "可导入 SAE plain env"],
  ["readySecretEnv", "可导入 KMS/Secrets Manager/SAE secret env"],
  ["deferred", "可后置或空缺变量"],
])
const CURRENT_SCOPE = "backend_aliyun_only"
const FULL_APP_LAUNCH_SCOPE = "deferred_after_backend_online"
const APP_LAUNCH_DEFERRED_NAMES = new Set([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "APPLE_TEAM_ID",
  "MEIYE_RELEASE_STORE_FILE",
  "MEIYE_RELEASE_STORE_PASSWORD",
  "MEIYE_RELEASE_KEY_ALIAS",
  "MEIYE_RELEASE_KEY_PASSWORD",
])

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
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

function buildReport(args) {
  const env = parseEnvFile(args.envFile)
  const plan = buildImportPlan(env)
  const groups = groupVariables(plan)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    sourceCommand: "corepack pnpm aliyun:env:handoff",
    sourcePlanCommand: "corepack pnpm aliyun:env:checklist",
    files: {
      envFile: args.envFile,
      envFileExists: existsSync(args.envFile),
    },
    currentAnswer: "现在不能部署；当前只推进阿里云后端，后端必填阻塞只剩 DATABASE_URL_CN，微信移动应用/Android/Apple 发布变量延期到后端上线后。",
    summary: {
      currentScope: CURRENT_SCOPE,
      fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
      total: plan.summary.total,
      requiredReady: plan.summary.requiredReady,
      requiredTotal: plan.summary.requiredTotal,
      requiredBlocking: groups.blockedRequired.map((item) => item.name),
      fullAppRequiredBlocking: plan.summary.requiredBlocking || [],
      appLaunchBlocking: groups.appLaunchBlocking.map((item) => item.name),
      readyPlainEnv: groups.readyPlainEnv.length,
      readySecretEnv: groups.readySecretEnv.length,
      deferred: groups.deferred.length,
      sourceMetadataReady: plan.summary.sourceMetadataReady,
      secretOrSensitiveTotal: plan.summary.secretOrSensitiveTotal,
      groupCounts: Object.fromEntries(GROUPS.map(([key]) => [key, groups[key].length])),
      actionTimeConfirmationRequiredGroups: [
        "blockedRequired",
        "appLaunchBlocking",
        "readyPlainEnv",
        "readySecretEnv",
      ],
    },
    acquisitionOrder: buildAcquisitionOrder(groups),
    groups,
    verificationCommands: [
      "corepack pnpm aliyun:env:checklist",
      "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:user:actions",
      "corepack pnpm aliyun:readiness:cloud-ready",
    ],
    completionEvidence: [
      "WECHAT_OPEN_APP_ID 和 WECHAT_OPEN_APP_SECRET 只能在微信开放平台移动应用审核通过后取得。",
      "APPLE_TEAM_ID 从 Apple Developer 当前团队读取；它不是密钥，但不能猜测。",
      "readySecretEnv 组只能导入 KMS/Secrets Manager/SAE secret env，不能写进文档、镜像或 git。",
      "导入完成后只记录 envImport.confirmed=true、envImport.secretNotInImage=true、importedAt 和非密钥 evidence handle。",
    ],
    safetyBoundary: [
      "本命令不创建阿里云资源、不读取云端密钥、不导入环境变量、不部署、不 git push。",
      "本命令不输出 env value；只输出变量名、状态、控制台路径、获取方式和导入目标。",
      "AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 和 Supabase service role key 不能写入 JSON、Markdown、镜像或 git。",
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

function groupVariables(plan) {
  const appLaunchBlockingNames = new Set([
    ...(plan.summary.appLaunchBlocking || []),
    ...APP_LAUNCH_DEFERRED_NAMES,
  ])
  const groups = Object.fromEntries(GROUPS.map(([key]) => [key, []]))

  for (const variable of plan.variables) {
    const compact = compactVariable(variable)
    if (variable.status !== "ready" && appLaunchBlockingNames.has(variable.name)) {
      groups.appLaunchBlocking.push(compact)
      continue
    }
    if (variable.required && variable.status !== "ready") {
      groups.blockedRequired.push(compact)
      continue
    }
    if (variable.status === "ready" && variable.importTarget === "阿里云 SAE plain env") {
      groups.readyPlainEnv.push(compact)
      continue
    }
    if (variable.status === "ready") {
      groups.readySecretEnv.push(compact)
      continue
    }
    groups.deferred.push(compact)
  }

  return groups
}

function compactVariable(variable) {
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
    action: variable.action,
    notes: variable.notes,
    valuePolicy: valuePolicyFor(variable),
    blockers: blockersFor(variable),
    forbidden: forbiddenFor(variable),
  }
}

function valuePolicyFor(variable) {
  if (variable.status !== "ready") return "当前缺失或仍是 TODO，占位值不能导入阿里云。"
  if (variable.importTarget === "阿里云 SAE plain env") {
    return "值可能已在本机 env 中 ready，但本报告不输出；只允许作为非密钥配置导入 SAE plain env。"
  }
  return "值可能已在本机 env 中 ready，但本报告不输出；只能通过 KMS/Secrets Manager/SAE secret env 导入。"
}

function blockersFor(variable) {
  if (variable.status === "ready") return []
  if (variable.name === "WECHAT_OPEN_APP_ID" || variable.name === "WECHAT_OPEN_APP_SECRET") {
    return ["微信开放平台账号已认证，但移动 App 未创建/未审核通过。"]
  }
  if (variable.name === "APPLE_TEAM_ID") {
    return ["Apple Developer Team ID 未确认，AASA / Universal Link 验收阻塞。"]
  }
  if (variable.required) return ["production-cn 后端必填变量未 ready。"]
  return ["可后置或当前功能未启用。"]
}

function forbiddenFor(variable) {
  if (variable.name === "WECHAT_OPEN_APP_ID") {
    return "不能用小程序 AppID 替代；不能写进 App 包，只能导入服务端 SAE plain env。"
  }
  if (variable.name === "WECHAT_OPEN_APP_SECRET") {
    return "不能用小程序 Secret 替代；不能写入文档、镜像、App 包或 git。"
  }
  if (variable.name === "APPLE_TEAM_ID") {
    return "不要猜测 Team ID；必须从 Apple Developer 当前团队读取。"
  }
  if (variable.importTarget !== "阿里云 SAE plain env") {
    return "不能把真实 value 写入 JSON、Markdown、Docker 镜像或 git。"
  }
  return "不要把本地 .env value 复制进文档或 git。"
}

function buildAcquisitionOrder(groups) {
  return [
    ...groups.blockedRequired.map((item) => ({
      name: item.name,
      reason: "后端必填阻塞",
      obtain: item.obtain,
      importTarget: item.importTarget,
    })),
    ...groups.appLaunchBlocking.map((item) => ({
      name: item.name,
      reason: "APP 发布/AASA 阻塞",
      obtain: item.obtain,
      importTarget: item.importTarget,
    })),
    {
      name: "readySecretEnv",
      reason: "本机已有 ready 值但云侧未确认导入",
      obtain: "按 readySecretEnv 分组逐项从 Vercel/Supabase/阿里云/DeepSeek/火山/微信公众平台等控制台确认。",
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
    },
    {
      name: "readyPlainEnv",
      reason: "本机已有 ready 非密钥配置但云侧未确认导入",
      obtain: "按 readyPlainEnv 分组逐项核对正式 production-cn 配置。",
      importTarget: "阿里云 SAE plain env",
    },
  ]
}

function renderMarkdown(report) {
  const lines = [
    "# 美业话镜 APP production-cn 环境变量获取与导入手册",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- ok: ${report.ok}`,
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- requiredReady: ${report.summary.requiredReady} / ${report.summary.requiredTotal}`,
    `- requiredBlocking: ${report.summary.requiredBlocking.length ? report.summary.requiredBlocking.join(", ") : "none"}`,
    `- fullAppRequiredBlocking: ${report.summary.fullAppRequiredBlocking.length ? report.summary.fullAppRequiredBlocking.join(", ") : "none"}`,
    `- appLaunchBlocking: ${report.summary.appLaunchBlocking.length ? report.summary.appLaunchBlocking.join(", ") : "none"}`,
    `- readyPlainEnv: ${report.summary.readyPlainEnv}`,
    `- readySecretEnv: ${report.summary.readySecretEnv}`,
    `- deferred: ${report.summary.deferred}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    "",
    "## 优先获取顺序",
    "",
    ...report.acquisitionOrder.map((item) => `- ${item.name}: ${item.reason}；获取：${item.obtain}；导入：${item.importTarget}`),
    "",
    ...GROUPS.flatMap(([key, title]) => renderGroup(title, report.groups[key])),
    "## 完成后验证",
    "",
    ...report.verificationCommands.map((command) => `- \`${command}\``),
    "",
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
  ]
  return `${lines.join("\n")}\n`
}

function renderGroup(title, items) {
  return [
    `## ${title}`,
    "",
    ...renderVariableTable(items),
  ]
}

function renderVariableTable(items) {
  if (!items.length) return ["- none", ""]
  return [
    "| 变量 | 状态 | 敏感等级 | 获取位置 | 导入目标 | 动作 | 禁止事项 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...items.map((item) => [
      codeCell(item.name),
      escapeTableCell(item.status),
      escapeTableCell(item.sensitivity),
      escapeTableCell(item.consolePath),
      escapeTableCell(item.importTarget),
      escapeTableCell(item.action),
      escapeTableCell(item.forbidden),
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

function printHelp() {
  console.log(`Usage: node scripts/summarize-aliyun-env-handoff.mjs [options]

Options:
  --env-file <path>  Env file to inspect. Defaults to workspace .env.production-cn.local.
  --out <path>       Write value-free JSON handoff to a file.
  --markdown <path>  Write value-free Markdown handoff to a file.
  -h, --help         Show this help.
`)
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (args.outPath) writeFileSync(args.outPath, output, { mode: 0o600 })
  if (args.markdownPath) writeFileSync(args.markdownPath, renderMarkdown(report), { mode: 0o600 })
  process.stdout.write(output)
}

main()
