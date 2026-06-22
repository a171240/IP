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

const RESOURCE_DEFINITIONS = [
  {
    id: "R01_SAE_RUNTIME",
    title: "阿里云 SAE production-cn 自定义容器应用",
    provider: "Aliyun SAE",
    operatorTaskId: "T03_ALIYUN_RUNTIME_CONTAINER",
    cloudConfirmationKey: "runtime",
    cloudAccessChecklistId: "saeRuntime",
    requiredBeforeDeploy: true,
    actionType: "cloud_resource_confirmation",
    writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime"],
    verifyCommands: ["corepack pnpm aliyun:runtime:plan", "corepack pnpm aliyun:cloud:confirmations"],
  },
  {
    id: "R02_ACR_IMAGE_REGISTRY",
    title: "阿里云 ACR 镜像仓库、镜像 digest 和 SAE 拉取配置",
    provider: "Aliyun ACR + SAE",
    operatorTaskId: "T03B_ALIYUN_ACR_IMAGE_PUBLISH",
    cloudConfirmationKey: null,
    imagePublish: true,
    cloudAccessChecklistId: "acrImage",
    requiredBeforeDeploy: true,
    actionType: "paid_cloud_resource_and_image_push",
    requiresActionTimeConfirmation: true,
    writeTargets: ["deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime"],
    verifyCommands: ["corepack pnpm aliyun:image:plan", "corepack pnpm aliyun:image:plan:strict"],
  },
  {
    id: "R03_API_DOMAIN_HTTPS",
    title: "api-cn.ipgongchang.xin DNS、HTTPS 和 ICP 证据",
    provider: "Aliyun DNS / Certificate / SAE ingress",
    operatorTaskId: "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    cloudConfirmationKey: "apiDomainHttps",
    cloudAccessChecklistId: "apiDomain",
    requiredBeforeDeploy: true,
    actionType: "dns_https_icp_confirmation",
    requiresActionTimeConfirmation: true,
    writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps"],
    verifyCommands: ["corepack pnpm aliyun:domain:check", "corepack pnpm aliyun:domain:strict"],
  },
  {
    id: "R04_ASSET_DOMAIN_HTTPS",
    title: "assets-cn.ipgongchang.xin DNS、HTTPS 和 ICP 证据",
    provider: "Aliyun DNS / Certificate / OSS or CDN",
    operatorTaskId: "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    cloudConfirmationKey: "assetDomainHttps",
    cloudAccessChecklistId: "assetDomain",
    requiredBeforeDeploy: true,
    actionType: "dns_https_icp_confirmation",
    requiresActionTimeConfirmation: true,
    writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps"],
    verifyCommands: ["corepack pnpm aliyun:domain:check", "corepack pnpm aliyun:domain:strict"],
  },
  {
    id: "R05_OSS_AUDIO_STORAGE",
    title: "服务记录音频 OSS、CORS 和 RAM 最小权限",
    provider: "Aliyun OSS / RAM",
    operatorTaskId: "T05_ALIYUN_OSS_AUDIO_STORAGE",
    cloudConfirmationKey: "oss",
    cloudAccessChecklistId: "ossAudio",
    requiredBeforeDeploy: true,
    actionType: "cloud_resource_confirmation",
    writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss"],
    verifyCommands: ["corepack pnpm aliyun:cloud:confirmations", "corepack pnpm aliyun:health:smoke"],
  },
  {
    id: "R06_ENV_IMPORT",
    title: "SAE/KMS/Secrets Manager 环境变量导入",
    provider: "Aliyun SAE / KMS / Secrets Manager",
    operatorTaskId: "T06_ALIYUN_ENV_IMPORT",
    cloudConfirmationKey: "envImport",
    cloudAccessChecklistId: "envImport",
    requiredBeforeDeploy: true,
    actionType: "secret_env_import",
    requiresActionTimeConfirmation: true,
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
      "阿里云 SAE 环境变量 / KMS / Secrets Manager",
    ],
    verifyCommands: ["corepack pnpm aliyun:env:checklist", "corepack pnpm aliyun:sensitive:blockers"],
  },
  {
    id: "R07_SLS_ALERTS",
    title: "SLS 日志、/api/healthz 和 5xx 告警",
    provider: "Aliyun SLS / Application monitoring",
    operatorTaskId: "T07_ALIYUN_SLS_ALERTS",
    cloudConfirmationKey: "slsAlerts",
    cloudAccessChecklistId: "slsAlerts",
    requiredBeforeDeploy: true,
    actionType: "cloud_observability_confirmation",
    writeTargets: ["deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts"],
    verifyCommands: ["corepack pnpm aliyun:cloud:confirmations", "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin"],
  },
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

function runJson(label, scriptArgs, allowFailure = false) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${label}_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  const stdout = (result.stdout || "").trim()
  if (!stdout) {
    if (allowFailure) return { ok: false, error: result.stderr || `exit ${result.status}` }
    throw new Error(`${label}_empty_stdout`)
  }
  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function buildReport(args) {
  const operatorTasks = runJson("operator_tasks", [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const cloudConfirmations = runJson("cloud_confirmations", [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    "--local",
    args.cloudConfirmationsFile,
    "--allow-incomplete",
  ])
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--allow-incomplete",
  ])
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])

  const taskById = new Map((operatorTasks.tasks || []).map((task) => [task.id, task]))
  const confirmationByKey = new Map(
    Object.entries(cloudConfirmations.local?.itemStatus || {}).map(([key, value]) => [key, value]),
  )
  const cloudChecklistById = new Map((cloudAccess.consoleEvidenceChecklist || []).map((item) => [item.id, item]))

  const resources = RESOURCE_DEFINITIONS.map((definition) => {
    const task = taskById.get(definition.operatorTaskId) || null
    const confirmation = definition.cloudConfirmationKey ? confirmationByKey.get(definition.cloudConfirmationKey) || null : null
    const checklist = cloudChecklistById.get(definition.cloudAccessChecklistId) || null
    const blockers = unique([
      ...(task?.blockerCodes || []),
      ...(confirmation?.blockers || []).map((blocker) => `${definition.cloudConfirmationKey}:${blocker}`),
    ])
    const status = task?.ready || confirmation?.ready || (definition.imagePublish && imagePublishPlan.ready)
      ? "ready"
      : task?.status || "pending_cloud"
    return {
      id: definition.id,
      title: definition.title,
      provider: definition.provider,
      status,
      ready: status === "ready",
      requiredBeforeDeploy: definition.requiredBeforeDeploy,
      actionType: definition.actionType,
      requiresActionTimeConfirmation: definition.requiresActionTimeConfirmation === true,
      mutationAllowedByThisCommand: false,
      mutationPerformed: false,
      operatorTaskId: definition.operatorTaskId,
      cloudConfirmationKey: definition.cloudConfirmationKey,
      consolePath: task?.consolePath || checklist?.consolePath || "",
      writeTargets: definition.writeTargets,
      nonSecretFieldsToRecord: checklist?.nonSecretFieldsToRecord || [],
      currentLocalEvidence: checklist?.currentLocalEvidence || "",
      blockers,
      nextActions: task?.actions || [],
      evidenceExpected: task?.evidence || [],
      verifyCommands: unique([...(definition.verifyCommands || []), ...(task?.verifyCommands || [])]),
      forbidden: checklist?.forbidden || [
        "AccessKeySecret",
        "AppSecret",
        "registry password",
        "RAM Secret",
        "token",
        "cookie",
        "Supabase service role key",
      ],
    }
  })

  const blocked = resources.filter((item) => !item.ready)
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    sourceCommands: [
      "corepack pnpm aliyun:operator:tasks",
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:cloud:access",
    ],
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
    },
    summary: {
      total: resources.length,
      ready: resources.length - blocked.length,
      blocked: blocked.length,
      blockedIds: blocked.map((item) => item.id),
      actionTimeConfirmationRequired: resources
        .filter((item) => item.requiresActionTimeConfirmation)
        .map((item) => item.id),
      cloudConfirmationsTotalBlockers: cloudConfirmations.summary?.totalBlockers ?? 0,
      imagePublishTotalBlockers: imagePublishPlan.summary?.totalBlockers ?? 0,
      cloudAccessCanReadNow: cloudAccess.canReadCloudNow === true,
    },
    cloudAccess: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      blockers: cloudAccess.blockers || [],
      checklistItems: cloudAccess.consoleEvidenceChecklist?.length || 0,
    },
    resources,
    nextActions: [
      "先用本矩阵确认哪些阿里云资源只差非密钥证据，哪些需要动作时授权。",
      "ACR 购买、DNS 修改、环境变量导入、生产部署和任何密钥操作都需要动作时确认。",
      "每个资源完成后只把资源名、布尔状态、控制台路径或截图编号写入 .local.json；不要写任何 secret value。",
      "所有资源 ready 后运行 corepack pnpm aliyun:cloud:confirmations:strict 和 corepack pnpm aliyun:readiness:cloud-ready。",
    ],
    safetyBoundary: [
      "本命令不创建阿里云资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署。",
      "本命令只输出资源名、字段名、控制台路径、证据编号和变量名，不输出任何密钥 value。",
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
    "# 美业话镜 APP production-cn 阿里云资源矩阵",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ready: ${report.summary.ready} / ${report.summary.total}`,
    `- blocked: ${report.summary.blocked}`,
    `- containsValues: ${report.containsValues}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- cloudAccessCanReadNow: ${report.summary.cloudAccessCanReadNow}`,
    "",
    "## 资源清单",
    "",
  ]

  for (const item of report.resources) {
    lines.push(
      `### ${item.id} ${item.title}`,
      "",
      `- status: ${item.status}`,
      `- provider: ${item.provider}`,
      `- consolePath: ${item.consolePath}`,
      `- writeTargets: ${item.writeTargets.join("; ")}`,
      `- actionTimeConfirmationRequired: ${item.requiresActionTimeConfirmation}`,
      `- blockers: ${item.blockers.length ? item.blockers.join(", ") : "none"}`,
      `- verifyCommands: ${item.verifyCommands.join("; ")}`,
      "",
    )
  }

  lines.push(
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
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
  const json = JSON.stringify(report, null, 2)
  writeOutput(args.outPath, json)
  writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(json)
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-resource-matrix.mjs [--env-file path] [--cloud-confirmations path] [--out /tmp/resources.json] [--markdown /tmp/resources.md]",
    "",
    "Builds a non-secret Aliyun resource matrix from existing operator, cloud-confirmation, image, and cloud-access checks.",
    "It does not create resources, import secrets, mutate DNS, push images, deploy, or pay for ACR.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
