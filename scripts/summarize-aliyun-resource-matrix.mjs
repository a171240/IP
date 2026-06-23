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

const RESOURCE_AUTHORIZATION_PACKETS = Object.freeze({
  R01_SAE_RUNTIME: Object.freeze(["P08_SAE_RUNTIME_SLS"]),
  R02_ACR_IMAGE_REGISTRY: Object.freeze(["P03_ACR_PURCHASE", "P04_ACR_IMAGE_AND_PULL"]),
  R03_API_DOMAIN_HTTPS: Object.freeze(["P07_DOMAIN_DNS_HTTPS"]),
  R04_ASSET_DOMAIN_HTTPS: Object.freeze(["P07_DOMAIN_DNS_HTTPS"]),
  R05_OSS_AUDIO_STORAGE: Object.freeze(["P05_OSS_RAM_STS"]),
  R06_ENV_IMPORT: Object.freeze(["P06_ENV_IMPORT"]),
  R07_SLS_ALERTS: Object.freeze(["P08_SAE_RUNTIME_SLS"]),
})

const RESOURCE_CONSOLE_TASKS = Object.freeze({
  R01_SAE_RUNTIME: Object.freeze(["C01_SAE_RUNTIME"]),
  R02_ACR_IMAGE_REGISTRY: Object.freeze(["C02_ACR_IMAGE_AND_PULL"]),
  R03_API_DOMAIN_HTTPS: Object.freeze(["C03_API_DOMAIN_HTTPS_ICP"]),
  R04_ASSET_DOMAIN_HTTPS: Object.freeze(["C04_ASSET_DOMAIN_HTTPS_ICP"]),
  R05_OSS_AUDIO_STORAGE: Object.freeze(["C05_OSS_AUDIO_RAM_STS"]),
  R06_ENV_IMPORT: Object.freeze(["C06_ENV_IMPORT"]),
  R07_SLS_ALERTS: Object.freeze(["C07_SLS_ALERTS"]),
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
  const observedStatusById = new Map((cloudAccess.observedResourceStatuses || []).map((item) => [item.id, item]))

  const resources = RESOURCE_DEFINITIONS.map((definition) => {
    const task = taskById.get(definition.operatorTaskId) || null
    const confirmation = definition.cloudConfirmationKey ? confirmationByKey.get(definition.cloudConfirmationKey) || null : null
    const checklist = cloudChecklistById.get(definition.cloudAccessChecklistId) || null
    const observedResourceStatus = observedStatusFor(definition, observedStatusById)
    const currentEvidence = unique([
      isUsableEvidence(checklist?.currentLocalEvidence) ? checklist.currentLocalEvidence : "",
      ...(definition.imagePublish ? imagePublishEvidence(imagePublishPlan) : []),
      observedResourceStatus?.status ? `observedResourceStatus=${observedResourceStatus.status}` : "",
      observedResourceStatus?.readiness ? `observedResourceReadiness=${observedResourceStatus.readiness}` : "",
    ])
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
      observedResourceStatus,
      writeTargets: definition.writeTargets,
      nonSecretFieldsToRecord: checklist?.nonSecretFieldsToRecord || [],
      currentLocalEvidence: checklist?.currentLocalEvidence || "",
      currentEvidence,
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
  const resourceEvidenceBrief = buildResourceEvidenceBrief(resources)
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
      observedResourceStatuses: cloudAccess.observedResourceStatusSummary || {
        total: 0,
        ready: 0,
        partial: 0,
        blocked: 0,
        observed: 0,
        notObserved: 0,
        blockedIds: [],
      },
      resourceEvidenceReady: `${resourceEvidenceBrief.ready}/${resourceEvidenceBrief.total}`,
      blockedResourceEvidenceIds: resourceEvidenceBrief.blockedIds,
    },
    cloudAccess: {
      canReadCloudNow: cloudAccess.canReadCloudNow === true,
      blockers: cloudAccess.blockers || [],
      checklistItems: cloudAccess.consoleEvidenceChecklist?.length || 0,
      observedResourceStatusSummary: cloudAccess.observedResourceStatusSummary || null,
    },
    resourceEvidenceBrief,
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

function buildResourceEvidenceBrief(resources) {
  const rows = resources.map((item) => ({
    id: item.id,
    title: item.title,
    provider: item.provider,
    status: item.status,
    ready: item.ready === true,
    observedStatus: item.observedResourceStatus?.status || "none",
    observedReadiness: item.observedResourceStatus?.readiness || "none",
    requiredAuthorizationPackets: RESOURCE_AUTHORIZATION_PACKETS[item.id] || [],
    consoleTaskIds: RESOURCE_CONSOLE_TASKS[item.id] || [],
    requiresActionTimeConfirmation: item.requiresActionTimeConfirmation === true,
    currentEvidence: item.currentEvidence || [],
    missingEvidence: buildMissingEvidence(item),
    writeTargets: item.writeTargets || [],
    verifyCommands: item.verifyCommands || [],
    nextEvidenceAction: nextEvidenceActionForResource(item),
    forbidden: item.forbidden || [],
  }))
  const blocked = rows.filter((item) => !item.ready)
  return {
    total: rows.length,
    ready: rows.length - blocked.length,
    blocked: blocked.length,
    blockedIds: blocked.map((item) => item.id),
    blockedResourceEvidence: blocked.map((item) => ({
      id: item.id,
      status: item.status,
      observedStatus: item.observedStatus,
      observedReadiness: item.observedReadiness,
      requiredAuthorizationPackets: item.requiredAuthorizationPackets,
      consoleTaskIds: item.consoleTaskIds,
      currentEvidence: item.currentEvidence,
      missingEvidence: item.missingEvidence,
      writeTargets: item.writeTargets,
      verifyCommands: item.verifyCommands,
      nextEvidenceAction: item.nextEvidenceAction,
    })),
    rows,
    valueHandlingRules: [
      "本简表只记录资源名、状态、控制台路径、digest、布尔值、证据编号和变量名。",
      "所有 AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie、Supabase service role key 必须留在受控密钥环境。",
      "资源 ready 不能只靠浏览器已登录或控制台页面可见，必须有 strict/readiness 命令或 .local.json 非密钥证据闭环。",
    ],
  }
}

function buildMissingEvidence(item) {
  return unique([
    ...(item.blockers || []),
    item.observedResourceStatus?.status && item.observedResourceStatus?.readiness !== "ready"
      ? `observed:${item.observedResourceStatus.status}`
      : "",
    item.currentEvidence?.length ? "" : "non_secret_current_evidence_missing",
  ])
}

function nextEvidenceActionForResource(item) {
  if (item.ready) return "run_strict_verification_to_preserve_ready_state"
  if (item.id === "R02_ACR_IMAGE_REGISTRY") return "complete ACR purchase/repository evidence first, then image push/digest and SAE pull evidence after action-time confirmation"
  if (item.id === "R06_ENV_IMPORT") return "import ready variables through SAE/KMS/Secrets Manager secret env after action-time confirmation, then run env/checklist and sensitive/blockers"
  if (item.requiresActionTimeConfirmation) return "obtain action-time confirmation, perform only the named console action, then write non-secret evidence to the configured .local.json target"
  return "confirm resource in Aliyun console or allowlisted readonly inventory, then write non-secret evidence to the configured .local.json target"
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function isUsableEvidence(value) {
  const text = String(value || "").trim()
  return Boolean(text) && !/^TODO_/i.test(text)
}

function observedStatusFor(definition, observedStatusById) {
  const aliases = {
    saeRuntime: "saeRuntime",
    acrImage: "acrPurchase",
    apiDomain: "domainDns",
    assetDomain: "domainDns",
    ossAudio: "ossAudio",
    envImport: "cloudShellInventory",
    slsAlerts: "slsAlerts",
  }
  const id = aliases[definition.cloudAccessChecklistId]
  return id ? observedStatusById.get(id) || null : null
}

function imagePublishEvidence(imagePublishPlan) {
  const local = imagePublishPlan.local || {}
  const purchaseCandidate = local.acr?.purchaseCandidate || {}
  const runtime = local.runtime || {}
  const image = local.image || {}
  const localDockerImage = imagePublishPlan.localDockerImage || {}
  const evidence = []

  if (local.exists !== undefined) evidence.push(`imagePublish.localExists=${local.exists === true}`)
  if (local.ready !== undefined) evidence.push(`imagePublish.localReady=${local.ready === true}`)
  if (image.localDigestReady !== undefined) evidence.push(`image.localDigestReady=${image.localDigestReady === true}`)
  if (localDockerImage.status) evidence.push(`localDockerImage.status=${localDockerImage.status}`)
  if (localDockerImage.repoDigests?.[0]) evidence.push(`localDockerImage.repoDigest=${localDockerImage.repoDigests[0]}`)
  if (purchaseCandidate.edition) evidence.push(`acr.purchaseCandidate.edition=${purchaseCandidate.edition}`)
  if (purchaseCandidate.region) evidence.push(`acr.purchaseCandidate.region=${purchaseCandidate.region}`)
  if (purchaseCandidate.duration) evidence.push(`acr.purchaseCandidate.duration=${purchaseCandidate.duration}`)
  if (purchaseCandidate.quotedAmount) evidence.push(`acr.purchaseCandidate.quotedAmount=${purchaseCandidate.quotedAmount}`)
  if (purchaseCandidate.confirmed !== undefined) {
    evidence.push(`acr.purchaseCandidate.confirmed=${purchaseCandidate.confirmed === true}`)
  }
  if (purchaseCandidate.requiresActionTimePurchaseConfirmation !== undefined) {
    evidence.push(
      `acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=${purchaseCandidate.requiresActionTimePurchaseConfirmation === true}`,
    )
  }
  if (purchaseCandidate.evidence) evidence.push(`acr.purchaseCandidate.evidence=${purchaseCandidate.evidence}`)
  if (runtime.target) evidence.push(`runtime.target=${runtime.target}`)
  if (runtime.appName) evidence.push(`runtime.appName=${runtime.appName}`)
  if (runtime.remoteImageConfigured !== undefined) {
    evidence.push(`runtime.remoteImageConfigured=${runtime.remoteImageConfigured === true}`)
  }
  if (runtime.imagePullConfigured !== undefined) {
    evidence.push(`runtime.imagePullConfigured=${runtime.imagePullConfigured === true}`)
  }

  return evidence
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
    `- resourceEvidenceReady: ${report.summary.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.summary.blockedResourceEvidenceIds.join(", ") || "none"}`,
    "",
    "## 资源证据简表",
    "",
    ...renderResourceEvidenceBrief(report.resourceEvidenceBrief),
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
      `- observedResourceStatus: ${item.observedResourceStatus?.status || "none"} / ${item.observedResourceStatus?.readiness || "none"}`,
      `- blockers: ${item.blockers.length ? item.blockers.join(", ") : "none"}`,
      `- currentEvidence: ${item.currentEvidence.length ? item.currentEvidence.join("; ") : "none"}`,
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

function renderResourceEvidenceBrief(brief) {
  if (!brief || !Array.isArray(brief.rows)) return ["- none", ""]
  return [
    "| 资源 | 状态 | 观察状态 | 授权包 | 控制台任务 | 缺失证据 | 写回目标 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...brief.rows.map((item) => [
      codeCell(item.id),
      escapeTableCell(item.status),
      escapeTableCell(`${item.observedStatus}/${item.observedReadiness}`),
      escapeTableCell((item.requiredAuthorizationPackets || []).join(", ") || "none"),
      escapeTableCell((item.consoleTaskIds || []).join(", ") || "none"),
      escapeTableCell((item.missingEvidence || []).join(", ") || "none"),
      escapeTableCell((item.writeTargets || []).join("; ") || "none"),
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
