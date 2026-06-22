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

const POLICY_BY_ACTION_ID = Object.freeze({
  U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE: Object.freeze({
    automationPolicy: "external_platform_review_required",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "external_identifier_and_secret_after_review",
    why: "微信开放平台账号认证不等于移动应用已创建；移动应用审核通过前没有 APP 登录 AppID/AppSecret。",
  }),
  U02_APPLE_TEAM_ID: Object.freeze({
    automationPolicy: "external_identifier_required",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "external_identifier",
    why: "Apple Team ID 必须来自 Apple Developer 账号，不能猜测。",
  }),
  U03_ACR_PURCHASE_CONFIRMATION: Object.freeze({
    automationPolicy: "paid_purchase_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "paid_purchase",
    why: "ACR 企业版购买是付费动作；当前只可记录报价候选，付款前必须确认金额和规格。",
  }),
  U04_ACR_RUNTIME_AUTH: Object.freeze({
    automationPolicy: "registry_auth_requires_runtime_secret_channel",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "registry_password_or_runtime_pull_secret",
    why: "镜像推送和 SAE 拉取配置会涉及 registry 凭证或 RAM/运行时 Secret，不能写入仓库或报告。",
  }),
  U05_OSS_RAM_OR_STS: Object.freeze({
    automationPolicy: "oss_ram_or_sts_secret_channel_required",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "ram_secret_or_sts_import",
    why: "OSS 最小权限绑定需要选择受控 AccessKey、STS 或运行时角色；Secret 只能进 KMS/Secrets Manager/SAE secret env。",
  }),
  U06_ENV_IMPORT: Object.freeze({
    automationPolicy: "secret_import_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "ready_sensitive_env_need_cloud_import",
    why: "本地已有部分 ready 变量，但真实 value 只能导入阿里云受控环境，不能输出到文档、JSON、镜像或 git。",
  }),
  U07_DOMAIN_DNS_HTTPS_ICP: Object.freeze({
    automationPolicy: "dns_https_icp_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "public_domain_mutation",
    why: "DNS/HTTPS/ICP 会改变 APP production-cn 公网入口，动作时必须确认目标入口和证书。",
  }),
  U08_SAE_RUNTIME_AND_SLS: Object.freeze({
    automationPolicy: "cloud_resource_creation_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "cloud_resource_mutation",
    why: "SAE/SLS 创建或配置是阿里云写操作，可能产生资源和计费影响；本脚本只列目标字段和验收方式。",
  }),
  U09_DEPLOY_AUTHORIZATION: Object.freeze({
    automationPolicy: "production_release_requires_explicit_authorization",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "production_release",
    why: "生产部署、ACR push、DNS 变更和 git push 都必须在云侧严格门禁通过后再单独授权。",
  }),
})

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

function envArgs(args) {
  return [
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ]
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

function buildReport(args) {
  const userActions = runJson("user_actions", [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    ...envArgs(args),
  ])
  const consoleRunbook = runJson("console_runbook", [
    "scripts/generate-aliyun-console-runbook.mjs",
    ...envArgs(args),
  ])
  const status = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    ...envArgs(args),
  ])

  const actions = (userActions.actions || []).map((action) => classifyAction(action))
  const actionTimeConfirmationRequired = actions
    .filter((action) => action.requiresActionTimeConfirmation)
    .map((action) => action.id)
  const currentExternalBlockers = actions
    .filter((action) => action.status !== "ready")
    .map((action) => action.id)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    canDeployNow: status.canDeployNow === true,
    verdict: status.verdict || "blocked",
    currentAnswer: status.canDeployNow === true
      ? "机器门禁接近可部署，但生产动作仍需逐项授权。"
      : "现在不能部署；阿里云资源、付款、DNS、密钥导入和生产发布动作仍需动作时确认或外部账号完成。",
    sourceCommands: [
      "corepack pnpm aliyun:user:actions",
      "corepack pnpm aliyun:console:runbook",
      "corepack pnpm aliyun:status",
    ],
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
    },
    summary: {
      actions: actions.length,
      canCodexProceedWithoutUser: actions.filter((action) => action.canCodexProceedWithoutUser).map((action) => action.id),
      currentExternalBlockers,
      actionTimeConfirmationRequired,
      policyClasses: unique(actions.map((action) => action.blockerClass)),
      cloudConsoleTasks: consoleRunbook.consoleTasks?.length || 0,
      cloudResourceReady: consoleRunbook.summary?.resourceReady || "unknown",
      userActionReady: userActions.summary ? `${userActions.summary.ready}/${userActions.summary.total}` : "unknown",
      requiredBlocking: status.summary?.requiredBlocking || [],
      sensitiveActionItems: status.summary?.sensitiveActionItems || {},
    },
    safeLocalWorkStillAllowed: [
      "运行本地检查和 smoke。",
      "生成不含 value 的 env checklist、user action brief、console runbook、operator handoff 和 release artifacts。",
      "把已从控制台只读确认到的资源名、布尔状态、digest 或截图编号写入 ignored 的 .local.json。",
      "更新 release manifest、脚本和测试，提交本地安全门禁改动。",
    ],
    prohibitedWithoutActionTimeConfirmation: [
      "购买 ACR 或任何付费资源。",
      "创建/修改 SAE、SLS、OSS、RAM、KMS、Secrets Manager、DNS、证书、CDN 或公网入口。",
      "读取、复制、粘贴、导入或输出 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key。",
      "推送镜像到 ACR、部署 production-cn、修改正式域名解析、git push。",
      "创建微信开放平台移动应用或读取审核通过后的 AppSecret，除非用户在动作时明确授权并提供相应账号上下文。",
    ],
    actions,
    nextVerifyCommands: [
      "corepack pnpm aliyun:action:authorization",
      "corepack pnpm aliyun:user:actions",
      "corepack pnpm aliyun:console:runbook",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
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

function classifyAction(action) {
  const policy = POLICY_BY_ACTION_ID[action.id] || {
    automationPolicy: "unknown_requires_manual_review",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "unknown",
    why: "未配置的动作必须先人工复核。",
  }
  return {
    id: action.id,
    title: action.title,
    status: action.status,
    owner: action.owner,
    obtainFrom: action.obtainFrom,
    writeTargets: action.writeTargets || [],
    variableNames: action.variableNames || [],
    currentBlockers: action.currentBlockers || [],
    currentEvidence: action.currentEvidence || [],
    verifyCommands: action.verifyCommands || [],
    automationPolicy: policy.automationPolicy,
    canCodexProceedWithoutUser: policy.canCodexProceedWithoutUser,
    requiresActionTimeConfirmation: policy.requiresActionTimeConfirmation,
    blockerClass: policy.blockerClass,
    why: policy.why,
    nonSecretEvidenceOnly: action.nonSecretEvidenceOnly === true,
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

function renderMarkdown(report) {
  const lines = [
    "# 美业话镜 APP production-cn 阿里云动作授权矩阵",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- verdict: ${report.verdict}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- containsValues: ${report.containsValues}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- actionTimeConfirmationRequired: ${report.summary.actionTimeConfirmationRequired.join(", ")}`,
    "",
    "## 允许的本地工作",
    "",
    ...report.safeLocalWorkStillAllowed.map((item) => `- ${item}`),
    "",
    "## 未获动作时确认前禁止",
    "",
    ...report.prohibitedWithoutActionTimeConfirmation.map((item) => `- ${item}`),
    "",
    "## 动作分类",
    "",
  ]

  for (const action of report.actions) {
    lines.push(
      `### ${action.id} ${action.title}`,
      "",
      `- status: ${action.status}`,
      `- automationPolicy: ${action.automationPolicy}`,
      `- canCodexProceedWithoutUser: ${action.canCodexProceedWithoutUser}`,
      `- requiresActionTimeConfirmation: ${action.requiresActionTimeConfirmation}`,
      `- blockerClass: ${action.blockerClass}`,
      `- why: ${action.why}`,
      `- owner: ${action.owner}`,
      `- obtainFrom: ${action.obtainFrom}`,
      `- writeTargets: ${action.writeTargets.join("; ") || "none"}`,
      `- variableNames: ${action.variableNames.join(", ") || "none"}`,
      `- currentBlockers: ${action.currentBlockers.join("; ") || "none"}`,
      `- currentEvidence: ${action.currentEvidence.join("; ") || "none"}`,
      `- verifyCommands: ${action.verifyCommands.join("; ") || "none"}`,
      "",
    )
  }

  lines.push(
    "## 下一组验证命令",
    "",
    ...report.nextVerifyCommands.map((command) => `- \`${command}\``),
    "",
  )
  return `${lines.join("\n")}\n`
}

function writeOutput(filePath, content) {
  if (!filePath) return
  if (!isAbsolute(filePath)) throw new Error("output_path_must_be_absolute")
  writeFileSync(filePath, content, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  writeOutput(args.outPath, `${JSON.stringify(report, null, 2)}\n`)
  writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-action-authorization.mjs [--env-file path] [--cloud-confirmations path] [--out /tmp/report.json] [--markdown /tmp/report.md]",
    "",
    "Builds a non-secret action-time authorization matrix for APP production-cn Aliyun work.",
    "It does not create resources, pay, change DNS, import env values, push images, deploy, or git push.",
  ].join("\n"))
}

main()
