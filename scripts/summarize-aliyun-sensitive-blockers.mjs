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
const APP_LAUNCH_DEFERRED_SENSITIVE_ACTION_IDS = Object.freeze([
  "S01_WECHAT_OPEN_APP_LOGIN",
  "S02_APPLE_TEAM_ID",
  "S07_ANDROID_RELEASE_SIGNING",
])
const APP_LAUNCH_DEFERRED_SENSITIVE_ACTION_ID_SET = new Set(APP_LAUNCH_DEFERRED_SENSITIVE_ACTION_IDS)
const CONDITIONAL_OPTIONAL_CREDENTIAL_NAMES = new Set([
  "ALIYUN_OSS_SECURITY_TOKEN",
])

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
    backendOnly: false,
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
    if (arg === "--backend-only") {
      args.backendOnly = true
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
  const variableRows = items.flatMap((item) =>
    (item.variableDetails || []).map((variable) => ({
      actionId: item.id,
      blockerType: item.type,
      owner: item.owner,
      ...variable,
    })),
  )
  const blockedVariableRows = variableRows.filter(isBlockedCredentialVariable)
  const readySecretEnvVariableRows = variableRows.filter((variable) =>
    variable.status === "ready" &&
    variable.sensitivity !== "public" &&
    String(variable.importTarget || "").includes("secret env"),
  )
  const userIntervention = buildUserInterventionSummary(items, blockedVariableRows, readySecretEnvVariableRows)
  const credentialInterventionBrief = buildCredentialInterventionBrief(
    items,
    blockedVariableRows,
    readySecretEnvVariableRows,
    userIntervention,
  )
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
    userIntervention,
    credentialInterventionBrief,
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
        sum + (item.variableDetails || []).filter(isBlockedCredentialVariable).length, 0),
      ready: items.reduce((sum, item) =>
        sum + (item.variableDetails || []).filter((variable) => variable.status === "ready").length, 0),
      secretOrSensitive: items.reduce((sum, item) =>
        sum + (item.variableDetails || []).filter((variable) => variable.sensitivity !== "public").length, 0),
    },
  }
}

const CREDENTIAL_GROUP_METADATA = Object.freeze({
  S01_WECHAT_OPEN_APP_LOGIN: Object.freeze({
    category: "wechat_open_mobile_app",
    userQuestion: "微信登录环境变量从哪里获得",
  }),
  S02_APPLE_TEAM_ID: Object.freeze({
    category: "ios_universal_link",
    userQuestion: "iOS Universal Link 需要哪个 Apple Team ID",
  }),
  S03_ACR_PAID_PURCHASE: Object.freeze({
    category: "acr_paid_purchase",
    userQuestion: "阿里云 ACR 是否需要购买和确认规格",
  }),
  S04_ACR_REGISTRY_AUTH: Object.freeze({
    category: "acr_registry_auth",
    userQuestion: "镜像推送和 SAE 拉取凭证放在哪里",
  }),
  S05_OSS_RAM_SECRET_OR_STS: Object.freeze({
    category: "oss_ram_sts",
    userQuestion: "OSS/RAM/STS 密钥如何导入阿里云运行环境",
  }),
  S08_ALIYUN_RDS_DATABASE_URL: Object.freeze({
    category: "rds_database_secret_and_migration",
    userQuestion: "DATABASE_URL_CN 从哪里获得并导入到哪里",
  }),
  S06_READY_SENSITIVE_ENV_IMPORT: Object.freeze({
    category: "ready_secret_env_import",
    userQuestion: "本机已有 API key 如何迁到阿里云 secret env",
  }),
  S07_ANDROID_RELEASE_SIGNING: Object.freeze({
    category: "android_release_signing",
    userQuestion: "国内 Android release 签名和微信开放平台签名如何补齐",
  }),
})

function buildCredentialInterventionBrief(items, blockedVariableRows, readySecretEnvVariableRows, userIntervention) {
  const blockedCredentialNames = unique(blockedVariableRows.map((variable) => variable.name)).sort()
  const readySecretEnvVariableNames = unique(readySecretEnvVariableRows.map((variable) => variable.name)).sort()
  return {
    canCodexProceedWithoutUser: false,
    blockedCredentialCount: blockedCredentialNames.length,
    blockedCredentialNames,
    readySecretEnvVariableCount: readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    actionTimeConfirmationRequiredIds: userIntervention.actionTimeConfirmationRequired,
    groups: items.map((item) => buildCredentialGroup(item)),
    valueHandlingRules: userIntervention.valueHandlingRules,
    forbiddenStorage: [
      "git",
      "JSON/Markdown 报告",
      "Docker image",
      "App bundle",
      "小程序或 App 前端包",
    ],
  }
}

function buildCredentialGroup(item) {
  const metadata = CREDENTIAL_GROUP_METADATA[item.id] || {}
  const variableDetails = item.variableDetails || []
  return {
    category: metadata.category || interventionMode(item),
    actionId: item.id,
    userQuestion: metadata.userQuestion || "",
    status: item.status,
    owner: item.owner,
    type: item.type,
    blockedCredentialNames: unique(variableDetails
      .filter(isBlockedCredentialVariable)
      .map((variable) => variable.name)).sort(),
    readySecretEnvVariableNames: unique(variableDetails
      .filter((variable) =>
        variable.status === "ready" &&
        variable.sensitivity !== "public" &&
        String(variable.importTarget || "").includes("secret env"))
      .map((variable) => variable.name)).sort(),
    variableNames: item.variableNames || [],
    obtainFrom: item.obtainFrom || item.consolePath || "",
    importTargets: unique(variableDetails.map((variable) => variable.importTarget)).sort(),
    writeTargets: item.writeTargets || [],
    requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
    valueHandling: valueHandlingForItem(item, variableDetails),
    forbiddenStorage: forbiddenStorageForItem(item),
    verifyCommands: item.verifyCommands || [],
    unblockCondition: item.unblockCondition,
  }
}

function isBlockedCredentialVariable(variable) {
  if (!variable || variable.status === "ready") return false
  if (CONDITIONAL_OPTIONAL_CREDENTIAL_NAMES.has(variable.name)) return false
  return true
}

function valueHandlingForItem(item, variableDetails) {
  if (item.id === "S03_ACR_PAID_PURCHASE") return "只记录 ACR 规格、地域、命名空间、仓库名和付款确认状态；不记录付款凭据。"
  if (item.id === "S04_ACR_REGISTRY_AUTH") return "镜像仓库登录和 SAE 拉取凭证只能进入 Docker credential helper、RAM/KMS/Secrets Manager 或阿里云运行时 secret 配置。"
  if (item.id === "S08_ALIYUN_RDS_DATABASE_URL") return "DATABASE_URL_CN 和数据库密码只能进入 KMS/Secrets Manager/SAE secret env；报告只记录 RDS 实例、数据库名、布尔状态和迁移验收证据。"
  if (item.id === "S07_ANDROID_RELEASE_SIGNING") return "release keystore 和密码只进入本机/CI signing secret store；微信开放平台只填写签名摘要。"
  if (variableDetails.some((variable) => String(variable.importTarget || "").includes("plain env"))) {
    return "公开标识符可导入 SAE plain env；secret value 仍必须走 KMS/Secrets Manager/SAE secret env。"
  }
  return "只在动作时导入 KMS/Secrets Manager/SAE secret env；报告中只保留变量名和非密钥证据。"
}

function forbiddenStorageForItem(item) {
  if (item.id === "S07_ANDROID_RELEASE_SIGNING") return ["git", "JSON/Markdown 报告", "Docker image", "App bundle", "debug.keystore"]
  if (item.id === "S04_ACR_REGISTRY_AUTH") return ["git", "JSON/Markdown 报告", "Docker image", "shell history"]
  if (item.id === "S08_ALIYUN_RDS_DATABASE_URL") return ["git", "JSON/Markdown 报告", "Docker image", "APP bundle", "小程序或 App 前端包", "shell history"]
  return ["git", "JSON/Markdown 报告", "Docker image", "App bundle", "小程序或 App 前端包"]
}

function buildUserInterventionSummary(items, blockedVariableRows, readySecretEnvVariableRows) {
  const groups = {}
  for (const item of items) {
    const mode = interventionMode(item)
    if (!groups[mode]) groups[mode] = []
    groups[mode].push(item.id)
  }
  return {
    canCodexProceedWithoutUser: false,
    actionTimeConfirmationRequired: items
      .filter((item) => item.requiresActionTimeConfirmation === true)
      .map((item) => item.id),
    userMustObtainOrConfirmIds: items
      .filter((item) => item.status !== "ready")
      .map((item) => item.id),
    blockedVariableNames: unique(blockedVariableRows.map((variable) => variable.name)).sort(),
    readySecretEnvVariableNames: unique(readySecretEnvVariableRows.map((variable) => variable.name)).sort(),
    readySecretEnvVariableCount: unique(readySecretEnvVariableRows.map((variable) => variable.name)).length,
    groups,
    valueHandlingRules: [
      "blockedVariableNames 只说明还缺哪些变量名，不包含 value。",
      "readySecretEnvVariableNames 表示本机已有 ready 状态但仍只能通过 KMS/Secrets Manager/SAE secret env 导入。",
      "AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、keystore password 和 Supabase service role key 不能写入 JSON、Markdown、Docker 镜像或 git。",
    ],
  }
}

function interventionMode(item) {
  if (item.type === "external_credential_after_review") return "external_review_then_app_credentials"
  if (item.type === "external_identifier") return "external_identifier_lookup"
  if (item.type === "paid_purchase_confirmation") return "paid_purchase_confirmation"
  if (item.type === "android_keystore_password_or_signature") return "android_release_signing_secret"
  if (
    item.type === "registry_password_or_runtime_pull_secret" ||
    item.type === "ram_secret_or_sts_import" ||
    item.type === "database_secret_and_migration" ||
    item.type === "ready_sensitive_env_need_cloud_import"
  ) {
    return "controlled_secret_channel"
  }
  return "other_user_intervention"
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

function filterItemsForScope(items, args) {
  if (!args.backendOnly) return items
  return items.filter((item) => !APP_LAUNCH_DEFERRED_SENSITIVE_ACTION_ID_SET.has(item.id))
}

function buildReport(operatorTasks, args) {
  const currentScope = args.backendOnly ? "backend_aliyun_only" : "full_app_launch"
  const rawItems = (operatorTasks.sensitiveActionItems || []).map(compactItem)
  const items = filterItemsForScope(rawItems, args)
  const summary = summarize(items)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    currentScope,
    backendOnly: args.backendOnly,
    containsValues: false,
    readOnlyOnly: true,
    sourceCommand: args.backendOnly
      ? "corepack pnpm aliyun:operator:tasks filtered by --backend-only"
      : "corepack pnpm aliyun:operator:tasks",
    deferredAppLaunchSensitiveActionIds: args.backendOnly ? APP_LAUNCH_DEFERRED_SENSITIVE_ACTION_IDS : [],
    currentAnswer: summary.blocked
      ? (args.backendOnly
        ? "当前阿里云后端-only 仍有付款、secret/token 或受控运行环境类人工介入项；微信/Apple/Android 发布密钥已从当前后端范围延期。"
        : "当前仍有密钥、密码、token、付款或受控标识符类人工介入项；本报告只列变量名和控制台路径，不输出任何 value。")
      : "当前没有未完成的密钥、密码、token、付款或受控标识符类人工介入项。",
    summary,
    credentialInterventionBrief: summary.credentialInterventionBrief,
    items,
    nextActions: [
      ...(args.backendOnly
        ? [
          "当前后端-only 先处理 S03/S04/S05/S08/S06：ACR 付款、registry/SAE 拉取认证、OSS RAM/STS、RDS DATABASE_URL_CN、ready secret env 导入。",
          "微信开放平台、Apple Team ID 和 Android release signing 保留为 APP 发布阶段延期项，不作为当前阿里云后端阻塞。",
        ]
        : [
          "先处理 S01 微信开放平台移动应用创建/审核；审核通过后再获取 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET。",
          "确认 APPLE_TEAM_ID 后只导入 plain env，用于 AASA；不要猜测。",
          "ACR 付费、registry 登录、RAM Secret、STS token 和环境变量导入都必须在阿里云官方控制台或受控密钥环境完成。",
        ]),
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
    `- currentScope: ${report.currentScope}`,
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- blocked: ${report.summary.blocked} / ${report.summary.total}`,
    `- actionTimeConfirmationRequired: ${report.summary.actionTimeConfirmationRequired.length ? report.summary.actionTimeConfirmationRequired.join(", ") : "none"}`,
    `- deferredAppLaunchSensitiveActionIds: ${report.deferredAppLaunchSensitiveActionIds?.length ? report.deferredAppLaunchSensitiveActionIds.join(", ") : "none"}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- canCodexProceedWithoutUser: ${report.summary.userIntervention.canCodexProceedWithoutUser}`,
    `- blockedVariableNames: ${report.summary.userIntervention.blockedVariableNames.length ? report.summary.userIntervention.blockedVariableNames.join(", ") : "none"}`,
    `- readySecretEnvVariableNames: ${report.summary.userIntervention.readySecretEnvVariableNames.length ? report.summary.userIntervention.readySecretEnvVariableNames.join(", ") : "none"}`,
    "",
    "## 用户介入密钥/密码简表",
    "",
    `- blockedCredentialCount: ${report.credentialInterventionBrief.blockedCredentialCount}`,
    `- blockedCredentialNames: ${report.credentialInterventionBrief.blockedCredentialNames.length ? report.credentialInterventionBrief.blockedCredentialNames.join(", ") : "none"}`,
    `- readySecretEnvVariableCount: ${report.credentialInterventionBrief.readySecretEnvVariableCount}`,
    `- readySecretEnvVariableNames: ${report.credentialInterventionBrief.readySecretEnvVariableNames.length ? report.credentialInterventionBrief.readySecretEnvVariableNames.join(", ") : "none"}`,
    `- forbiddenStorage: ${report.credentialInterventionBrief.forbiddenStorage.join(", ")}`,
    "",
    ...renderCredentialInterventionGroups(report.credentialInterventionBrief.groups),
    "## 用户介入分层",
    "",
    ...Object.entries(report.summary.userIntervention.groups).map(([mode, ids]) => `- ${mode}: ${ids.join(", ")}`),
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

function renderCredentialInterventionGroups(groups) {
  if (!groups.length) return ["- none", ""]
  return [
    "| 类别 | 动作 ID | 状态 | 还缺变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...groups.map((group) => [
      codeCell(group.category),
      codeCell(group.actionId),
      escapeTableCell(group.status),
      escapeTableCell(group.blockedCredentialNames.join(", ") || "none"),
      escapeTableCell(group.readySecretEnvVariableNames.join(", ") || "none"),
      escapeTableCell(group.obtainFrom),
      escapeTableCell((group.writeTargets || []).join("; ") || (group.importTargets || []).join("; ") || "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  ]
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
  const report = buildReport(operatorTasks, args)
  const json = JSON.stringify(report, null, 2)
  writeOutput(args.outPath, json)
  writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(json)
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-sensitive-blockers.mjs [--backend-only] [--out /tmp/blockers.json] [--markdown /tmp/blockers.md]",
    "",
    "Prints a value-free summary of credential/password/token/payment blockers",
    "--backend-only excludes deferred WeChat Open Platform, Apple Team ID, and Android release signing actions from the current backend deployment scope.",
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
