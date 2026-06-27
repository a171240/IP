#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runJsonWithCache } from "./lib/run-json-cache.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const CURRENT_SCOPE = "backend_aliyun_only"
const FULL_APP_LAUNCH_SCOPE = "deferred_after_backend_online"

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
    verifyCommands: [
      "corepack pnpm aliyun:env:handoff:backend",
      "corepack pnpm aliyun:sensitive:blockers:backend",
      "corepack pnpm aliyun:env:checklist",
    ],
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
  return runJsonWithCache(label, scriptArgs, {
    cwd: BACKEND_ROOT,
    maxBuffer: 1024 * 1024 * 30,
    allowFailure,
  })
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
  const runtimePlan = runJson("runtime_plan", [
    "scripts/check-aliyun-runtime-plan.mjs",
  ])
  const cloudAccess = runJson("cloud_access", [
    "scripts/check-aliyun-cloud-access.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const backendEnvHandoff = runJson("backend_env_handoff", [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--backend-only",
    "--env-file",
    args.envFile,
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
    const observedResourceStatus = observedStatusFor(definition, observedStatusById, imagePublishPlan)
    const currentEvidence = unique([
      isUsableEvidence(checklist?.currentLocalEvidence) ? checklist.currentLocalEvidence : "",
      ...(definition.imagePublish ? imagePublishEvidence(imagePublishPlan) : []),
      ...(definition.cloudConfirmationKey === "oss" ? ossAccessEvidence(cloudConfirmations) : []),
      ...(definition.cloudConfirmationKey === "apiDomainHttps" || definition.cloudConfirmationKey === "assetDomainHttps"
        ? domainHttpsEvidence(cloudConfirmations, definition.cloudConfirmationKey)
        : []),
      ...(definition.cloudConfirmationKey === "runtime" || definition.cloudConfirmationKey === "slsAlerts"
        ? runtimeSlsEvidence(cloudConfirmations, definition.cloudConfirmationKey, runtimePlan)
        : []),
      ...(definition.cloudConfirmationKey === "envImport" ? envImportEvidence(cloudConfirmations) : []),
      observedResourceStatus?.status ? `observedResourceStatus=${observedResourceStatus.status}` : "",
      observedResourceStatus?.readiness ? `observedResourceReadiness=${observedResourceStatus.readiness}` : "",
    ])
    const blockers = buildResourceBlockers(definition, task, confirmation, backendEnvHandoff)
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
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    sourceCommands: [
      "corepack pnpm aliyun:operator:tasks",
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:runtime:plan",
      "corepack pnpm aliyun:cloud:access",
      "corepack pnpm aliyun:env:handoff:backend",
    ],
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
    },
    summary: {
      total: resources.length,
      currentScope: CURRENT_SCOPE,
      fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
      ready: resources.length - blocked.length,
      blocked: blocked.length,
      blockedIds: blocked.map((item) => item.id),
      actionTimeConfirmationRequired: resources
        .filter((item) => item.requiresActionTimeConfirmation)
        .map((item) => item.id),
      cloudConfirmationsTotalBlockers: cloudConfirmations.summary?.totalBlockers ?? 0,
      ossAccessPlanReady: cloudConfirmations.ossAccessPlan?.selectedReady === true,
      recommendedOssAccessModes: cloudConfirmations.ossAccessPlan?.recommendedModeIds || [],
      runtimeSlsPlanReady: cloudConfirmations.runtimeSlsPlan?.ready === true,
      runtimePlanDataLayerTarget: runtimePlan.dataLayerTarget || "",
      runtimePlanPredeployDependencyIds: runtimePlan.predeployDependencyIds || [],
      recommendedRuntimeSlsModes: cloudConfirmations.runtimeSlsPlan?.recommendedModeIds || [],
      envImportPlanReady: cloudConfirmations.envImportPlan?.ready === true,
      envImportBlockedCredentialNames: cloudConfirmations.envImportPlan?.blockedCredentialNames || [],
      envImportReadySecretEnvVariableCount: cloudConfirmations.envImportPlan?.readySecretEnvVariableCount ?? 0,
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
      backendRequiredBlocking: backendEnvHandoff.summary?.requiredBlocking || [],
      deferredAppLaunchBlocking: backendEnvHandoff.summary?.appLaunchBlocking || [],
      backendOnlyExclusions: backendEnvHandoff.backendOnlyExclusions?.envNames || [],
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
      "ACR 镜像推送/拉取、DNS 修改、环境变量导入、生产部署和任何密钥操作都需要动作时确认。",
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
    requiredAuthorizationPackets: requiredAuthorizationPacketsForResource(item),
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

function requiredAuthorizationPacketsForResource(item) {
  if (item.id !== "R02_ACR_IMAGE_REGISTRY") return RESOURCE_AUTHORIZATION_PACKETS[item.id] || []
  const purchaseConfirmed = (item.currentEvidence || [])
    .some((value) => /acr\.purchaseCandidate\.confirmed=true/.test(String(value)))
  return purchaseConfirmed
    ? ["P04_ACR_IMAGE_AND_PULL"]
    : RESOURCE_AUTHORIZATION_PACKETS[item.id] || []
}

function buildResourceBlockers(definition, task, confirmation, backendEnvHandoff) {
  const blockers = unique([
    ...(task?.blockerCodes || []),
    ...(confirmation?.blockers || []).map((blocker) => `${definition.cloudConfirmationKey}:${blocker}`),
  ])
  if (definition.id !== "R06_ENV_IMPORT") return blockers

  const backendRequiredBlocking = new Set(backendEnvHandoff.summary?.requiredBlocking || [])
  return blockers.filter((blocker) => {
    const match = String(blocker).match(/^missing_required_env:(.+)$/)
    if (!match) return true
    return backendRequiredBlocking.has(match[1])
  })
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
  if (item.id === "R01_SAE_RUNTIME") return "after ACR image digest, RDS secret env, and OSS access path are ready, create or confirm SAE custom container runtime and write non-secret runtime evidence"
  if (item.id === "R02_ACR_IMAGE_REGISTRY") return "ACR purchase/repository evidence is confirmed when acr.purchaseCandidate.confirmed=true; next close image push/digest and SAE pull evidence after P04/P08 action-time confirmation"
  if (item.id === "R03_API_DOMAIN_HTTPS") return "after SAE runtime public endpoint exists, clear wildcard/special-use DNS, bind api-cn as a SAE custom domain, attach HTTPS certificate, confirm ICP, then write non-secret evidence"
  if (item.id === "R04_ASSET_DOMAIN_HTTPS") return "after OSS/CDN asset origin exists, clear wildcard/special-use DNS, bind assets-cn through CDN or OSS custom domain, attach HTTPS certificate, confirm ICP, then write non-secret evidence"
  if (item.id === "R06_ENV_IMPORT") return "after RDS, OSS/RAM/STS, ACR image, and SAE runtime dependencies close, import backend secret-env batches through KMS/Secrets Manager/SAE secret env and write only non-secret batch evidence"
  if (item.id === "R07_SLS_ALERTS") return "after SAE runtime emits logs to SLS, configure logstore index plus health and 5xx alerts, then write non-secret alert evidence"
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

function observedStatusFor(definition, observedStatusById, imagePublishPlan) {
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
  const rawStatus = id ? observedStatusById.get(id) || null : null
  if (definition.id !== "R02_ACR_IMAGE_REGISTRY") return rawStatus
  return normalizeAcrObservedStatus(rawStatus, imagePublishPlan)
}

function normalizeAcrObservedStatus(rawStatus, imagePublishPlan) {
  const local = imagePublishPlan.local || {}
  const acr = local.acr || {}
  const purchaseConfirmed = acr.purchaseCandidate?.confirmed === true || Boolean(acr.registryHost && acr.namespace)
  if (!purchaseConfirmed) return rawStatus

  const imagePushed = acr.imagePushed === true && acr.digestVerified === true && /^sha256:[a-f0-9]{64}$/i.test(String(acr.remoteDigest || ""))
  const runtime = local.runtime || {}
  const runtimePullReady = runtime.confirmed === true &&
    runtime.remoteImageConfigured === true &&
    runtime.imagePullConfigured === true

  let status = "acr_repository_confirmed_image_push_pending"
  let readiness = "partial"
  let nextAction = "Push/import the backend image to ACR, verify sha256 digest, then configure SAE image pull authorization."
  if (imagePushed && !runtimePullReady) {
    status = "acr_image_pushed_runtime_pull_pending"
    nextAction = "Configure SAE to use the ACR image and verify image pull authorization."
  }
  if (imagePushed && runtimePullReady) {
    status = "acr_image_and_runtime_pull_confirmed"
    readiness = "ready"
    nextAction = "Preserve ACR digest and SAE pull evidence through strict verification."
  }

  return {
    ...(rawStatus || {}),
    id: rawStatus?.id || "acrPurchase",
    title: rawStatus?.title || "ACR 企业版实例和镜像仓库",
    status,
    readiness,
    observed: true,
    currentObservation: [
      rawStatus?.currentObservation,
      `acr.purchaseCandidate.confirmed=${acr.purchaseCandidate?.confirmed === true}`,
      acr.registryHost ? `acr.registryHost=${acr.registryHost}` : "",
      acr.namespace ? `acr.namespace=${acr.namespace}` : "",
      acr.repository ? `acr.repository=${acr.repository}` : "",
    ].filter(Boolean).join("; "),
    nextAction,
    writeTarget: rawStatus?.writeTarget || "deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime",
  }
}

function imagePublishEvidence(imagePublishPlan) {
  const local = imagePublishPlan.local || {}
  const purchaseCandidate = local.acr?.purchaseCandidate || {}
  const runtime = local.runtime || {}
  const image = local.image || {}
  const dockerContext = imagePublishPlan.dockerContext || {}
  const localDockerImage = imagePublishPlan.localDockerImage || {}
  const pushNetworkPlan = imagePublishPlan.pushNetworkPlan || {}
  const executionReadiness = imagePublishPlan.executionReadiness || {}
  const evidence = []

  if (local.exists !== undefined) evidence.push(`imagePublish.localExists=${local.exists === true}`)
  if (local.ready !== undefined) evidence.push(`imagePublish.localReady=${local.ready === true}`)
  if (image.localDigestReady !== undefined) evidence.push(`image.localDigestReady=${image.localDigestReady === true}`)
  if (dockerContext.status) evidence.push(`dockerContext.status=${dockerContext.status}`)
  if (dockerContext.ok !== undefined) evidence.push(`dockerContext.ok=${dockerContext.ok === true}`)
  if (dockerContext.checkedFiles !== undefined) evidence.push(`dockerContext.checkedFiles=${dockerContext.checkedFiles}`)
  if (dockerContext.sensitiveEnvExcluded !== undefined) {
    evidence.push(`dockerContext.sensitiveEnvExcluded=${dockerContext.sensitiveEnvExcluded === true}`)
  }
  if (localDockerImage.status) evidence.push(`localDockerImage.status=${localDockerImage.status}`)
  if (localDockerImage.dockerClientInstalled !== undefined) {
    evidence.push(`localDockerImage.dockerClientInstalled=${localDockerImage.dockerClientInstalled === true}`)
  }
  if (localDockerImage.dockerServerAvailable !== undefined) {
    evidence.push(`localDockerImage.dockerServerAvailable=${localDockerImage.dockerServerAvailable === true}`)
  }
  if (localDockerImage.nextEvidenceAction) {
    evidence.push(`localDockerImage.nextEvidenceAction=${localDockerImage.nextEvidenceAction}`)
  }
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
  if (pushNetworkPlan.publicNetworkEntranceEnabled !== undefined) {
    evidence.push(`acr.publicNetworkEntranceEnabled=${pushNetworkPlan.publicNetworkEntranceEnabled === true}`)
  }
  if (pushNetworkPlan.selectedPath) evidence.push(`acr.pushNetworkPlan.selectedPath=${pushNetworkPlan.selectedPath}`)
  if (pushNetworkPlan.selectedReady !== undefined) {
    evidence.push(`acr.pushNetworkPlan.selectedReady=${pushNetworkPlan.selectedReady === true}`)
  }
  if (Array.isArray(pushNetworkPlan.recommendedPathIds) && pushNetworkPlan.recommendedPathIds.length) {
    evidence.push(`acr.pushNetworkPlan.recommendedPathIds=${pushNetworkPlan.recommendedPathIds.join(",")}`)
  }
  if (executionReadiness.canStartP04AfterActionTimeConfirmation !== undefined) {
    evidence.push(
      `acr.execution.canStartP04AfterActionTimeConfirmation=${executionReadiness.canStartP04AfterActionTimeConfirmation === true}`,
    )
  }
  if (executionReadiness.p04StrictReady !== undefined) {
    evidence.push(`acr.execution.p04StrictReady=${executionReadiness.p04StrictReady === true}`)
  }
  if (executionReadiness.selectedTransferPathReady !== undefined) {
    evidence.push(`acr.execution.selectedTransferPathReady=${executionReadiness.selectedTransferPathReady === true}`)
  }
  if (executionReadiness.localPublicPushReady !== undefined) {
    evidence.push(`acr.execution.localPublicPushReady=${executionReadiness.localPublicPushReady === true}`)
  }
  if (executionReadiness.dockerDaemonReady !== undefined) {
    evidence.push(`acr.execution.dockerDaemonReady=${executionReadiness.dockerDaemonReady === true}`)
  }
  if (Array.isArray(executionReadiness.recommendedTransferPathIds) && executionReadiness.recommendedTransferPathIds.length) {
    evidence.push(`acr.execution.recommendedTransferPathIds=${executionReadiness.recommendedTransferPathIds.join(",")}`)
  }
  if (Array.isArray(executionReadiness.forbiddenTransferPathIds) && executionReadiness.forbiddenTransferPathIds.length) {
    evidence.push(`acr.execution.forbiddenTransferPathIds=${executionReadiness.forbiddenTransferPathIds.join(",")}`)
  }
  if (executionReadiness.nextOperatorDecision) {
    evidence.push(`acr.execution.nextOperatorDecision=${executionReadiness.nextOperatorDecision}`)
  }
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

function ossAccessEvidence(cloudConfirmations) {
  const plan = cloudConfirmations.ossAccessPlan || {}
  const execution = plan.executionReadiness || {}
  const prefixContract = plan.runtimePrefixContract || {}
  const evidence = []
  if (plan.selectedMode) evidence.push(`oss.accessPlan.selectedMode=${plan.selectedMode}`)
  if (plan.selectedReady !== undefined) evidence.push(`oss.accessPlan.selectedReady=${plan.selectedReady === true}`)
  if (Array.isArray(plan.selectedBlockers) && plan.selectedBlockers.length) {
    evidence.push(`oss.accessPlan.selectedBlockers=${plan.selectedBlockers.join(",")}`)
  }
  if (Array.isArray(plan.recommendedModeIds) && plan.recommendedModeIds.length) {
    evidence.push(`oss.accessPlan.recommendedModeIds=${plan.recommendedModeIds.join(",")}`)
  }
  if (plan.policyFile) evidence.push(`oss.accessPlan.policyFile=${plan.policyFile}`)
  if (plan.policyName) evidence.push(`oss.accessPlan.policyName=${plan.policyName}`)
  if (plan.roleOrUserName) evidence.push(`oss.accessPlan.roleOrUserName=${plan.roleOrUserName}`)
  if (Array.isArray(plan.selectedSecretEnvNames) && plan.selectedSecretEnvNames.length) {
    evidence.push(`oss.accessPlan.selectedSecretEnvNames=${plan.selectedSecretEnvNames.join(",")}`)
  }
  if (plan.credentialBoundary) evidence.push(`oss.accessPlan.credentialBoundary=${plan.credentialBoundary}`)
  if (Array.isArray(plan.allowedActions) && plan.allowedActions.length) {
    evidence.push(`oss.accessPlan.allowedActions=${plan.allowedActions.join(",")}`)
  }
  if (plan.resourceScope) evidence.push(`oss.accessPlan.resourceScope=${plan.resourceScope}`)
  if (prefixContract.requiredEnvName) {
    evidence.push(`oss.runtimePrefixContract.requiredEnvName=${prefixContract.requiredEnvName}`)
  }
  if (prefixContract.expectedValue) {
    evidence.push(`oss.runtimePrefixContract.expectedValue=${prefixContract.expectedValue}`)
  }
  if (prefixContract.policyScopeCoversExpectedPrefix !== undefined) {
    evidence.push(
      `oss.runtimePrefixContract.policyScopeCoversExpectedPrefix=${prefixContract.policyScopeCoversExpectedPrefix === true}`,
    )
  }
  if (prefixContract.currentConfirmationPrefixReady !== undefined) {
    evidence.push(
      `oss.runtimePrefixContract.currentConfirmationPrefixReady=${prefixContract.currentConfirmationPrefixReady === true}`,
    )
  }
  if (plan.writebackTemplate?.jsonPath) evidence.push(`oss.accessPlan.writebackTemplate=${plan.writebackTemplate.jsonPath}`)
  if (execution.canStartP05AfterActionTimeConfirmation !== undefined) {
    evidence.push(
      `oss.execution.canStartP05AfterActionTimeConfirmation=${execution.canStartP05AfterActionTimeConfirmation === true}`,
    )
  }
  if (execution.resourceReadyForP05 !== undefined) {
    evidence.push(`oss.execution.resourceReadyForP05=${execution.resourceReadyForP05 === true}`)
  }
  if (execution.accessGrantReady !== undefined) {
    evidence.push(`oss.execution.accessGrantReady=${execution.accessGrantReady === true}`)
  }
  if (execution.preferredModeId) evidence.push(`oss.execution.preferredModeId=${execution.preferredModeId}`)
  if (execution.preferredModeAvoidsLongLivedSecret !== undefined) {
    evidence.push(`oss.execution.preferredModeAvoidsLongLivedSecret=${execution.preferredModeAvoidsLongLivedSecret === true}`)
  }
  if (Array.isArray(execution.fallbackSecretModeIds) && execution.fallbackSecretModeIds.length) {
    evidence.push(`oss.execution.fallbackSecretModeIds=${execution.fallbackSecretModeIds.join(",")}`)
  }
  if (Array.isArray(execution.fallbackSecretEnvNames) && execution.fallbackSecretEnvNames.length) {
    evidence.push(`oss.execution.fallbackSecretEnvNames=${execution.fallbackSecretEnvNames.join(",")}`)
  }
  if (execution.nextOperatorDecision) evidence.push(`oss.execution.nextOperatorDecision=${execution.nextOperatorDecision}`)
  return evidence
}

function domainHttpsEvidence(cloudConfirmations, key) {
  const plan = cloudConfirmations.domainHttpsPlan || {}
  const group = plan.groups?.[key] || {}
  const evidence = []
  if (plan.ready !== undefined) evidence.push(`domainHttpsPlan.ready=${plan.ready === true}`)
  if (group.selectedMode) evidence.push(`domainHttpsPlan.${key}.selectedMode=${group.selectedMode}`)
  if (group.targetHost) evidence.push(`domainHttpsPlan.${key}.targetHost=${group.targetHost}`)
  if (group.ready !== undefined) evidence.push(`domainHttpsPlan.${key}.ready=${group.ready === true}`)
  if (Array.isArray(group.blockers) && group.blockers.length) {
    evidence.push(`domainHttpsPlan.${key}.blockers=${group.blockers.join(",")}`)
  }
  if (Array.isArray(group.recommendedModeIds) && group.recommendedModeIds.length) {
    evidence.push(`domainHttpsPlan.${key}.recommendedModeIds=${group.recommendedModeIds.join(",")}`)
  }
  if (group.writebackTemplate?.jsonPath) {
    evidence.push(`domainHttpsPlan.${key}.writebackTemplate=${group.writebackTemplate.jsonPath}`)
  }
  const candidateIds = Array.isArray(group.candidates) ? group.candidates.map((candidate) => candidate.id).filter(Boolean) : []
  if (candidateIds.length) evidence.push(`domainHttpsPlan.${key}.candidateIds=${candidateIds.join(",")}`)
  return evidence
}

function runtimeSlsEvidence(cloudConfirmations, key, runtimePlan = {}) {
  const plan = cloudConfirmations.runtimeSlsPlan || {}
  const group = plan.groups?.[key] || {}
  const evidence = []
  if (key === "runtime") {
    if (runtimePlan.dataLayerTarget) evidence.push(`runtimePlan.dataLayerTarget=${runtimePlan.dataLayerTarget}`)
    if (runtimePlan.dataLayerConnectionEnvName) {
      evidence.push(`runtimePlan.dataLayerConnectionEnvName=${runtimePlan.dataLayerConnectionEnvName}`)
    }
    if (Array.isArray(runtimePlan.predeployDependencyIds) && runtimePlan.predeployDependencyIds.length) {
      evidence.push(`runtimePlan.predeployDependencyIds=${runtimePlan.predeployDependencyIds.join(",")}`)
    }
  }
  if (plan.ready !== undefined) evidence.push(`runtimeSlsPlan.ready=${plan.ready === true}`)
  if (group.selectedMode) evidence.push(`runtimeSlsPlan.${key}.selectedMode=${group.selectedMode}`)
  if (group.targetAppName) evidence.push(`runtimeSlsPlan.${key}.targetAppName=${group.targetAppName}`)
  if (group.targetProject) evidence.push(`runtimeSlsPlan.${key}.targetProject=${group.targetProject}`)
  if (group.targetLogstore) evidence.push(`runtimeSlsPlan.${key}.targetLogstore=${group.targetLogstore}`)
  if (group.ready !== undefined) evidence.push(`runtimeSlsPlan.${key}.ready=${group.ready === true}`)
  if (Array.isArray(group.blockers) && group.blockers.length) {
    evidence.push(`runtimeSlsPlan.${key}.blockers=${group.blockers.join(",")}`)
  }
  if (Array.isArray(group.recommendedModeIds) && group.recommendedModeIds.length) {
    evidence.push(`runtimeSlsPlan.${key}.recommendedModeIds=${group.recommendedModeIds.join(",")}`)
  }
  if (group.writebackTemplate?.jsonPath) {
    evidence.push(`runtimeSlsPlan.${key}.writebackTemplate=${group.writebackTemplate.jsonPath}`)
  }
  const candidateIds = Array.isArray(group.candidates) ? group.candidates.map((candidate) => candidate.id).filter(Boolean) : []
  if (candidateIds.length) evidence.push(`runtimeSlsPlan.${key}.candidateIds=${candidateIds.join(",")}`)
  return evidence
}

function envImportEvidence(cloudConfirmations) {
  const plan = cloudConfirmations.envImportPlan || {}
  const evidence = []
  if (plan.ready !== undefined) evidence.push(`envImportPlan.ready=${plan.ready === true}`)
  if (plan.selectedMode) evidence.push(`envImportPlan.selectedMode=${plan.selectedMode}`)
  if (plan.importTarget) evidence.push(`envImportPlan.importTarget=${plan.importTarget}`)
  if (plan.secretEnvStore) evidence.push(`envImportPlan.secretEnvStore=${plan.secretEnvStore}`)
  if (Array.isArray(plan.blockedCredentialNames) && plan.blockedCredentialNames.length) {
    evidence.push(`envImportPlan.blockedCredentialNames=${plan.blockedCredentialNames.join(",")}`)
  }
  if (plan.readySecretEnvVariableCount !== undefined) {
    evidence.push(`envImportPlan.readySecretEnvVariableCount=${plan.readySecretEnvVariableCount}`)
  }
  if (plan.readySecretEnvVariableGroupCount !== undefined) {
    evidence.push(`envImportPlan.readySecretEnvVariableGroupCount=${plan.readySecretEnvVariableGroupCount}`)
  }
  if (Array.isArray(plan.blockedSecretBatchIds) && plan.blockedSecretBatchIds.length) {
    evidence.push(`envImportPlan.blockedSecretBatchIds=${plan.blockedSecretBatchIds.join(",")}`)
  }
  if (Array.isArray(plan.readySecretBatchIds) && plan.readySecretBatchIds.length) {
    evidence.push(`envImportPlan.readySecretBatchIds=${plan.readySecretBatchIds.join(",")}`)
  }
  if (plan.importBatchCount !== undefined) evidence.push(`envImportPlan.importBatchCount=${plan.importBatchCount}`)
  if (Array.isArray(plan.recommendedModeIds) && plan.recommendedModeIds.length) {
    evidence.push(`envImportPlan.recommendedModeIds=${plan.recommendedModeIds.join(",")}`)
  }
  if (plan.writebackTemplate?.jsonPath) {
    evidence.push(`envImportPlan.writebackTemplate=${plan.writebackTemplate.jsonPath}`)
  }
  const candidateIds = Array.isArray(plan.candidates) ? plan.candidates.map((candidate) => candidate.id).filter(Boolean) : []
  if (candidateIds.length) evidence.push(`envImportPlan.candidateIds=${candidateIds.join(",")}`)
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
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
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
  return `${lines.join("\n").replace(/\n+$/, "")}\n`
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
