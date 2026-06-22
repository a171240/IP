#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
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

const ACTION_ORDER = [
  "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
  "U02_APPLE_TEAM_ID",
  "U03_ACR_PURCHASE_CONFIRMATION",
  "U04_ACR_RUNTIME_AUTH",
  "U05_OSS_RAM_OR_STS",
  "U06_ENV_IMPORT",
  "U07_DOMAIN_DNS_HTTPS_ICP",
  "U08_SAE_RUNTIME_AND_SLS",
  "U09_DEPLOY_AUTHORIZATION",
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

function buildReport(args) {
  const sensitive = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const resources = runJson("resources_matrix", [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const status = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])

  const sensitiveById = new Map((sensitive.items || []).map((item) => [item.id, item]))
  const resourcesById = new Map((resources.resources || []).map((item) => [item.id, item]))
  const cloudConfirmations = readOptionalJson(args.cloudConfirmationsFile)
  const actions = buildActions({
    sensitiveById,
    resourcesById,
    status,
    cloudItems: cloudConfirmations?.items || {},
  })
  const blocked = actions.filter((item) => item.status !== "ready")
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    canDeployNow: status.canDeployNow === true,
    verdict: status.verdict || "blocked",
    sourceCommands: [
      "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:resources:matrix",
      "corepack pnpm aliyun:status",
    ],
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
    },
    summary: {
      total: actions.length,
      ready: actions.length - blocked.length,
      blocked: blocked.length,
      blockedIds: blocked.map((item) => item.id),
      userMustAct: actions.filter((item) => item.requiresUserAction).map((item) => item.id),
      actionTimeConfirmationRequired: actions
        .filter((item) => item.requiresActionTimeConfirmation)
        .map((item) => item.id),
      canBeRecordedAsNonSecretEvidence: actions
        .filter((item) => item.nonSecretEvidenceOnly)
        .map((item) => item.id),
      sensitiveBlockers: sensitive.summary?.blocked || 0,
      aliyunResourcesReady: resources.summary ? `${resources.summary.ready}/${resources.summary.total}` : "unknown",
    },
    currentAnswer: "现在不能部署；本简报只列用户/操作员还要做什么、从哪里取得、写到哪里，不输出任何密钥值。",
    actions,
    nextSafeLocalCommands: [
      "corepack pnpm aliyun:user:actions",
      "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:resources:matrix",
      "corepack pnpm aliyun:release:artifacts -- --skip-bundle --skip-vercel-env-coverage",
    ],
    afterUserActionsVerification: [
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "本命令不创建阿里云资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署、不 git push。",
      "本命令不读取或输出 secret value；只输出变量名、资源名、控制台路径、写入目标和解除条件。",
      "AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、cookie 和 Supabase service role key 不能写入文档、镜像或 git。",
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

function readOptionalJson(filePath) {
  if (!filePath || !existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function buildActions({ sensitiveById, resourcesById, status, cloudItems }) {
  const actionMap = new Map()

  addAction(actionMap, {
    id: "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
    title: "创建微信开放平台移动应用并审核通过",
    status: sensitiveById.get("S01_WECHAT_OPEN_APP_LOGIN")?.status || "blocked",
    owner: "用户/微信开放平台操作员",
    obtainFrom: "微信开放平台 -> 管理中心 -> 移动应用 -> 创建“美业话镜”移动应用",
    writeTargets: [
      "WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env",
      "WECHAT_OPEN_APP_SECRET -> KMS/Secrets Manager/SAE secret env",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform",
    ],
    requiredUserAction: sensitiveById.get("S01_WECHAT_OPEN_APP_LOGIN")?.requiredUserAction,
    unblockCondition: sensitiveById.get("S01_WECHAT_OPEN_APP_LOGIN")?.unblockCondition,
    variableNames: sensitiveById.get("S01_WECHAT_OPEN_APP_LOGIN")?.variableNames || [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: false,
    sourceIds: ["S01_WECHAT_OPEN_APP_LOGIN"],
    currentBlockers: [
      ...machineBlockers(status, /WECHAT_OPEN|wechat_open_platform/),
      ...cloudMissing(status, "wechatOpenPlatform"),
    ],
    currentEvidence: cloudEvidence(cloudItems, "wechatOpenPlatform", [
      "accountVerified",
      "mobileAppCreated",
      "mobileAppSubmitted",
      "reviewStatus",
      "mobileAppIdReady",
      "mobileAppSecretReady",
    ]),
    verifyCommands: ["corepack pnpm aliyun:wechat-state:test", "corepack pnpm aliyun:readiness"],
  })

  addAction(actionMap, {
    id: "U02_APPLE_TEAM_ID",
    title: "确认 Apple Team ID 用于 iOS Universal Link AASA",
    status: sensitiveById.get("S02_APPLE_TEAM_ID")?.status || "blocked",
    owner: "Apple Developer / iOS 发布操作员",
    obtainFrom: "Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers",
    writeTargets: ["APPLE_TEAM_ID -> 阿里云 SAE plain env"],
    requiredUserAction: sensitiveById.get("S02_APPLE_TEAM_ID")?.requiredUserAction,
    unblockCondition: sensitiveById.get("S02_APPLE_TEAM_ID")?.unblockCondition,
    variableNames: sensitiveById.get("S02_APPLE_TEAM_ID")?.variableNames || [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: false,
    sourceIds: ["S02_APPLE_TEAM_ID"],
    currentBlockers: machineBlockers(status, /apple_team_id|universal_link/i),
    currentEvidence: ["APPLE_TEAM_ID=missing"],
    verifyCommands: ["corepack pnpm aliyun:aasa:check", "corepack pnpm aliyun:app-native:check"],
  })

  addAction(actionMap, {
    id: "U03_ACR_PURCHASE_CONFIRMATION",
    title: "确认 ACR 企业版付费购买",
    status: sensitiveById.get("S03_ACR_PAID_PURCHASE")?.status || resourcesById.get("R02_ACR_IMAGE_REGISTRY")?.status || "blocked",
    owner: "用户/阿里云 ACR 操作员",
    obtainFrom: "阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页",
    writeTargets: ["deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence"],
    requiredUserAction: sensitiveById.get("S03_ACR_PAID_PURCHASE")?.requiredUserAction,
    unblockCondition: sensitiveById.get("S03_ACR_PAID_PURCHASE")?.unblockCondition,
    variableNames: [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: true,
    sourceIds: ["S03_ACR_PAID_PURCHASE", "R02_ACR_IMAGE_REGISTRY"],
    currentBlockers: [
      ...sensitiveStatusBlockers(sensitiveById, ["S03_ACR_PAID_PURCHASE"]),
      ...resourceBlockers(resourcesById, ["R02_ACR_IMAGE_REGISTRY"]),
    ],
    currentEvidence: resourceEvidence(resourcesById, ["R02_ACR_IMAGE_REGISTRY"]),
    verifyCommands: ["corepack pnpm aliyun:image:plan"],
  })

  addAction(actionMap, {
    id: "U04_ACR_RUNTIME_AUTH",
    title: "配置 ACR 镜像推送和 SAE 镜像拉取权限",
    status: sensitiveById.get("S04_ACR_REGISTRY_AUTH")?.status || resourcesById.get("R02_ACR_IMAGE_REGISTRY")?.status || "blocked",
    owner: "阿里云 ACR/SAE 操作员",
    obtainFrom: "阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置",
    writeTargets: ["deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime"],
    requiredUserAction: sensitiveById.get("S04_ACR_REGISTRY_AUTH")?.requiredUserAction,
    unblockCondition: sensitiveById.get("S04_ACR_REGISTRY_AUTH")?.unblockCondition,
    variableNames: [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: true,
    sourceIds: ["S04_ACR_REGISTRY_AUTH", "R02_ACR_IMAGE_REGISTRY"],
    currentBlockers: [
      ...sensitiveStatusBlockers(sensitiveById, ["S04_ACR_REGISTRY_AUTH"]),
      ...resourceBlockers(resourcesById, ["R02_ACR_IMAGE_REGISTRY"]),
    ],
    currentEvidence: resourceEvidence(resourcesById, ["R02_ACR_IMAGE_REGISTRY"]),
    verifyCommands: ["corepack pnpm aliyun:image:plan:strict", "corepack pnpm aliyun:container:smoke"],
  })

  addAction(actionMap, {
    id: "U05_OSS_RAM_OR_STS",
    title: "绑定 OSS RAM 最小权限或 STS/运行时角色方案",
    status: sensitiveById.get("S05_OSS_RAM_SECRET_OR_STS")?.status || resourcesById.get("R05_OSS_AUDIO_STORAGE")?.status || "blocked",
    owner: "阿里云 OSS/RAM 操作员",
    obtainFrom: "阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份",
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
      "ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env",
    ],
    requiredUserAction: sensitiveById.get("S05_OSS_RAM_SECRET_OR_STS")?.requiredUserAction,
    unblockCondition: sensitiveById.get("S05_OSS_RAM_SECRET_OR_STS")?.unblockCondition,
    variableNames: sensitiveById.get("S05_OSS_RAM_SECRET_OR_STS")?.variableNames || [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: false,
    sourceIds: ["S05_OSS_RAM_SECRET_OR_STS", "R05_OSS_AUDIO_STORAGE"],
    currentBlockers: [
      ...sensitiveStatusBlockers(sensitiveById, ["S05_OSS_RAM_SECRET_OR_STS"]),
      ...resourceBlockers(resourcesById, ["R05_OSS_AUDIO_STORAGE"]),
      ...cloudMissing(status, "oss"),
    ],
    currentEvidence: [
      ...cloudEvidence(cloudItems, "oss", [
        "confirmed",
        "bucket",
        "region",
        "corsConfigured",
        "ramLeastPrivilege",
        "serviceRecordPrefix",
      ]),
      ...resourceEvidence(resourcesById, ["R05_OSS_AUDIO_STORAGE"]),
    ],
    verifyCommands: ["corepack pnpm aliyun:cloud:confirmations", "corepack pnpm aliyun:health:smoke"],
  })

  addAction(actionMap, {
    id: "U06_ENV_IMPORT",
    title: "把 ready 环境变量导入 SAE/KMS/Secrets Manager",
    status: sensitiveById.get("S06_READY_SENSITIVE_ENV_IMPORT")?.status || resourcesById.get("R06_ENV_IMPORT")?.status || "blocked",
    owner: "阿里云运行环境/密钥操作员",
    obtainFrom: "现有 Vercel/Supabase/阿里云/DeepSeek/火山/微信平台变量源；只由有权限的操作员导入，不在报告中显示值",
    writeTargets: [
      "阿里云 SAE 环境变量 / KMS / Secrets Manager",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
    ],
    requiredUserAction: sensitiveById.get("S06_READY_SENSITIVE_ENV_IMPORT")?.requiredUserAction,
    unblockCondition: sensitiveById.get("S06_READY_SENSITIVE_ENV_IMPORT")?.unblockCondition,
    variableNames: sensitiveById.get("S06_READY_SENSITIVE_ENV_IMPORT")?.variableNames || [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: false,
    sourceIds: ["S06_READY_SENSITIVE_ENV_IMPORT", "R06_ENV_IMPORT"],
    currentBlockers: [
      ...sensitiveStatusBlockers(sensitiveById, ["S06_READY_SENSITIVE_ENV_IMPORT"]),
      ...resourceBlockers(resourcesById, ["R06_ENV_IMPORT"]),
      ...cloudMissing(status, "envImport"),
      ...requiredBlocking(status),
    ],
    currentEvidence: cloudEvidence(cloudItems, "envImport", [
      "confirmed",
      "target",
      "secretNotInImage",
    ]),
    verifyCommands: ["corepack pnpm aliyun:env:checklist", "corepack pnpm aliyun:readiness:cloud-ready"],
  })

  addAction(actionMap, {
    id: "U07_DOMAIN_DNS_HTTPS_ICP",
    title: "配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据",
    status: resourcesById.get("R03_API_DOMAIN_HTTPS")?.status === "ready" && resourcesById.get("R04_ASSET_DOMAIN_HTTPS")?.status === "ready"
      ? "ready"
      : "blocked",
    owner: "阿里云域名/证书操作员",
    obtainFrom: "阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 OSS/CDN 入口",
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
    ],
    requiredUserAction: "把 api-cn.ipgongchang.xin 和 assets-cn.ipgongchang.xin 指向阿里云公网入口，配置 HTTPS，并记录 ICP 证据。",
    unblockCondition: "apiDomainHttps 和 assetDomainHttps confirmed=true、dnsResolvedToAliyun=true、httpsEnabled=true、icpReady=true。",
    variableNames: [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: true,
    sourceIds: ["R03_API_DOMAIN_HTTPS", "R04_ASSET_DOMAIN_HTTPS"],
    currentBlockers: [
      ...resourceBlockers(resourcesById, ["R03_API_DOMAIN_HTTPS", "R04_ASSET_DOMAIN_HTTPS"]),
      ...cloudMissing(status, "apiDomainHttps"),
      ...cloudMissing(status, "assetDomainHttps"),
    ],
    currentEvidence: [
      ...cloudEvidence(cloudItems, "apiDomainHttps", [
        "confirmed",
        "host",
        "dnsResolvedToAliyun",
        "httpsEnabled",
        "icpReady",
      ]),
      ...cloudEvidence(cloudItems, "assetDomainHttps", [
        "confirmed",
        "host",
        "dnsResolvedToAliyun",
        "httpsEnabled",
        "icpReady",
      ]),
      ...resourceEvidence(resourcesById, ["R03_API_DOMAIN_HTTPS", "R04_ASSET_DOMAIN_HTTPS"]),
    ],
    verifyCommands: ["corepack pnpm aliyun:domain:strict", "corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin"],
  })

  addAction(actionMap, {
    id: "U08_SAE_RUNTIME_AND_SLS",
    title: "确认 SAE runtime 和 SLS health/5xx 告警",
    status: resourcesById.get("R01_SAE_RUNTIME")?.status === "ready" && resourcesById.get("R07_SLS_ALERTS")?.status === "ready"
      ? "ready"
      : "pending_cloud",
    owner: "阿里云操作员/运维操作员",
    obtainFrom: "阿里云控制台 -> SAE / 日志服务 SLS / 应用监控告警",
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
    ],
    requiredUserAction: "创建或确认 SAE 自定义容器应用，绑定日志采集，并配置 /api/healthz 和 5xx 告警。",
    unblockCondition: "runtime.confirmed=true，slsAlerts.confirmed=true，healthAlertConfigured=true，serverErrorAlertConfigured=true。",
    variableNames: [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: true,
    sourceIds: ["R01_SAE_RUNTIME", "R07_SLS_ALERTS"],
    currentBlockers: [
      ...resourceBlockers(resourcesById, ["R01_SAE_RUNTIME", "R07_SLS_ALERTS"]),
      ...cloudMissing(status, "runtime"),
      ...cloudMissing(status, "slsAlerts"),
    ],
    currentEvidence: [
      ...cloudEvidence(cloudItems, "runtime", [
        "confirmed",
        "provider",
        "region",
        "appName",
        "containerPort",
        "healthPath",
      ]),
      ...cloudEvidence(cloudItems, "slsAlerts", [
        "confirmed",
        "slsProject",
        "healthAlertConfigured",
        "serverErrorAlertConfigured",
      ]),
      ...resourceEvidence(resourcesById, ["R01_SAE_RUNTIME", "R07_SLS_ALERTS"]),
    ],
    verifyCommands: ["corepack pnpm aliyun:runtime:plan", "corepack pnpm aliyun:cloud:confirmations:strict"],
  })

  addAction(actionMap, {
    id: "U09_DEPLOY_AUTHORIZATION",
    title: "生产部署、镜像推送、DNS 变更、git push 的动作时授权",
    status: status.canDeployNow === true ? "waiting_authorization" : "blocked",
    owner: "用户/发布负责人",
    obtainFrom: "本 Codex 线程的明确动作时授权",
    writeTargets: ["release manifest / deployment log"],
    requiredUserAction: "所有前置资源 ready 后，再明确授权生产部署、ACR push、DNS 修改或 git push；本简报不自动推断授权。",
    unblockCondition: "cloud confirmations strict、readiness cloud-ready、image plan strict、domain strict 和 predeploy 全部通过后，由用户明确授权对应外部动作。",
    variableNames: [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: true,
    sourceIds: ["release_gate"],
    currentBlockers: deployAuthorizationBlockers(status),
    currentEvidence: [
      `verdict=${status.verdict || "unknown"}`,
      `canDeployNow=${status.canDeployNow === true}`,
      `productionReady=${status.summary?.productionReady === true}`,
      `cloudConfirmations=${status.summary?.cloudConfirmations?.ready || 0}/${status.summary?.cloudConfirmations?.total || 0}`,
    ],
    verifyCommands: ["corepack pnpm aliyun:predeploy", "corepack pnpm aliyun:cloud:confirmations:strict"],
  })

  return ACTION_ORDER.map((id) => actionMap.get(id)).filter(Boolean)
}

function addAction(actionMap, action) {
  actionMap.set(action.id, {
    id: action.id,
    title: action.title,
    status: action.status || "blocked",
    owner: action.owner,
    obtainFrom: action.obtainFrom,
    writeTargets: action.writeTargets || [],
    requiredUserAction: action.requiredUserAction || "",
    unblockCondition: action.unblockCondition || "",
    variableNames: action.variableNames || [],
    currentBlockers: uniqueStrings(action.currentBlockers || []),
    currentEvidence: uniqueStrings(action.currentEvidence || []),
    requiresUserAction: action.requiresUserAction === true,
    requiresActionTimeConfirmation: action.requiresActionTimeConfirmation === true,
    nonSecretEvidenceOnly: action.nonSecretEvidenceOnly === true,
    sourceIds: action.sourceIds || [],
    verifyCommands: action.verifyCommands || [],
  })
}

function machineBlockers(status, pattern) {
  return (status.summary?.machineBlocking || []).filter((item) => pattern.test(String(item)))
}

function requiredBlocking(status) {
  return (status.summary?.requiredBlocking || []).map((item) => `requiredEnv:${item}`)
}

function cloudMissing(status, key) {
  const pending = status.summary?.cloudConfirmations?.pending || []
  const item = pending.find((entry) => entry.key === key)
  return (item?.missing || []).map((missing) => `${key}:${missing}`)
}

function sensitiveStatusBlockers(sensitiveById, ids) {
  return ids.flatMap((id) => {
    const item = sensitiveById.get(id)
    if (!item || item.status === "ready") return []
    return [`${id}:${item.status}`]
  })
}

function resourceBlockers(resourcesById, ids) {
  return ids.flatMap((id) => {
    const item = resourcesById.get(id)
    return (item?.blockers || []).map((blocker) => `${id}:${blocker}`)
  })
}

function resourceEvidence(resourcesById, ids) {
  return ids.flatMap((id) => {
    const resource = resourcesById.get(id)
    const evidence = resource?.currentEvidence?.length ? resource.currentEvidence : [resource?.currentLocalEvidence]
    return (evidence || [])
      .filter(Boolean)
      .map((item) => `${id}:${item}`)
  })
}

function cloudEvidence(cloudItems, key, fields) {
  const item = cloudItems?.[key]
  if (!item || typeof item !== "object") return []
  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(item, field))
    .map((field) => `${key}.${field}=${formatEvidenceValue(item[field])}`)
}

function formatEvidenceValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  const text = String(value || "").trim()
  if (text.length <= 140) return text
  return `${text.slice(0, 137)}...`
}

function deployAuthorizationBlockers(status) {
  const blockers = []
  if (status.canDeployNow !== true) blockers.push("canDeployNow=false")
  if (status.summary?.productionReady !== true) blockers.push("productionReady=false")
  blockers.push(...requiredBlocking(status))
  blockers.push(...(status.summary?.machineBlocking || []))
  blockers.push(...(status.summary?.manualBlocking || []).map((item) => `manual:${item}`))
  return blockers
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean).map((item) => String(item))))
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
    "# 美业话镜 APP production-cn 用户动作简报",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- ready: ${report.summary.ready} / ${report.summary.total}`,
    `- blocked: ${report.summary.blocked}`,
    `- containsValues: ${report.containsValues}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    "",
    "## 动作清单",
    "",
  ]

  for (const item of report.actions) {
    lines.push(
      `### ${item.id} ${item.title}`,
      "",
      `- status: ${item.status}`,
      `- owner: ${item.owner}`,
      `- obtainFrom: ${item.obtainFrom}`,
      `- writeTargets: ${item.writeTargets.join("; ")}`,
      `- variableNames: ${item.variableNames.length ? item.variableNames.join(", ") : "none"}`,
      `- currentBlockers: ${item.currentBlockers.length ? item.currentBlockers.join("; ") : "none"}`,
      `- currentEvidence: ${item.currentEvidence.length ? item.currentEvidence.join("; ") : "none"}`,
      `- requiresActionTimeConfirmation: ${item.requiresActionTimeConfirmation}`,
      `- requiredUserAction: ${item.requiredUserAction}`,
      `- unblockCondition: ${item.unblockCondition}`,
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
    "  node scripts/summarize-aliyun-user-action-brief.mjs [--env-file path] [--cloud-confirmations path] [--out /tmp/user-actions.json] [--markdown /tmp/user-actions.md]",
    "",
    "Builds a non-secret user action brief for Aliyun production-cn release blockers.",
    "It does not create resources, import secrets, mutate DNS, push images, deploy, or pay for ACR.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
