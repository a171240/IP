#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_TEMPLATE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.example.json")
const DEFAULT_LOCAL_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const EXPECTED_WECHAT_MOBILE_APP_NAME = "美业话镜"
const EXPECTED_ANDROID_PACKAGE_NAME = "com.ipgongchang.meiyehuajing"
const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"
const EXPECTED_ALIYUN_REGION = "cn-hangzhou"
const APP_LAUNCH_DEFERRED_CONFIRMATION_KEYS = new Set(["wechatOpenPlatform"])
const APP_LAUNCH_DEFERRED_AUTHORIZATION_PACKETS = Object.freeze([
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P10_ANDROID_RELEASE_SIGNING",
  "P02_APPLE_TEAM_ID",
])

const DEFINITIONS = [
  {
    key: "runtime",
    label: "阿里云 SAE 容器应用",
    requiredFields: ["confirmed", "provider", "region", "appName", "containerPort", "healthPath", "evidence"],
    allowedFields: ["confirmed", "provider", "region", "appName", "containerPort", "healthPath", "evidence"],
    validate: (item, mode) => {
      const blockers = []
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && String(item.provider || "").trim() !== "SAE") blockers.push("provider=SAE")
      if (Number(item.containerPort) !== 3000) blockers.push("containerPort=3000")
      if (String(item.healthPath || "").trim() !== "/api/healthz") blockers.push("healthPath=/api/healthz")
      return blockers
    },
  },
  {
    key: "apiDomainHttps",
    label: "api-cn DNS、HTTPS 和 ICP",
    requiredFields: ["confirmed", "host", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    allowedFields: ["confirmed", "host", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    validate: (item, mode) => {
      const blockers = []
      const host = String(item.host || "").trim()
      if (!host.startsWith("api-cn.")) blockers.push("host_api_cn")
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && item.dnsResolvedToAliyun !== true) blockers.push("dnsResolvedToAliyun")
      if (mode === "local" && item.httpsEnabled !== true) blockers.push("httpsEnabled")
      if (mode === "local" && item.icpReady !== true) blockers.push("icpReady")
      return blockers
    },
  },
  {
    key: "assetDomainHttps",
    label: "assets-cn DNS、HTTPS 和 ICP",
    requiredFields: ["confirmed", "host", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    allowedFields: ["confirmed", "host", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    validate: (item, mode) => {
      const blockers = []
      const host = String(item.host || "").trim()
      if (!host.startsWith("assets-cn.")) blockers.push("host_assets_cn")
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && item.dnsResolvedToAliyun !== true) blockers.push("dnsResolvedToAliyun")
      if (mode === "local" && item.httpsEnabled !== true) blockers.push("httpsEnabled")
      if (mode === "local" && item.icpReady !== true) blockers.push("icpReady")
      return blockers
    },
  },
  {
    key: "oss",
    label: "OSS Bucket、CORS 和 RAM 最小权限",
    requiredFields: ["confirmed", "bucket", "region", "corsConfigured", "ramLeastPrivilege", "serviceRecordPrefix", "evidence"],
    allowedFields: ["confirmed", "bucket", "region", "corsConfigured", "ramLeastPrivilege", "serviceRecordPrefix", "evidence"],
    validate: (item, mode) => {
      const blockers = []
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && String(item.region || "").trim() !== EXPECTED_ALIYUN_REGION) {
        blockers.push(`region=${EXPECTED_ALIYUN_REGION}`)
      }
      if (mode === "local" && item.corsConfigured !== true) blockers.push("corsConfigured")
      if (mode === "local" && item.ramLeastPrivilege !== true) blockers.push("ramLeastPrivilege")
      if (String(item.serviceRecordPrefix || "").trim() !== "service-records/production-cn") {
        blockers.push("serviceRecordPrefix=service-records/production-cn")
      }
      return blockers
    },
  },
  {
    key: "wechatOpenPlatform",
    label: "微信开放平台移动应用",
    requiredFields: [
      "confirmed",
      "accountVerified",
      "mobileAppCreated",
      "mobileAppSubmitted",
      "reviewStatus",
      "mobileAppName",
      "mobileAppIdReady",
      "mobileAppSecretReady",
      "androidPackageName",
      "androidSignature",
      "androidConfigured",
      "iosBundleId",
      "iosUniversalLink",
      "iosConfigured",
      "evidence",
    ],
    allowedFields: [
      "confirmed",
      "accountVerified",
      "mobileAppCreated",
      "mobileAppSubmitted",
      "reviewStatus",
      "mobileAppName",
      "mobileAppIdReady",
      "mobileAppSecretReady",
      "androidPackageName",
      "androidSignature",
      "androidConfigured",
      "iosBundleId",
      "iosUniversalLink",
      "iosConfigured",
      "evidence",
    ],
    validate: (item, mode) => {
      const blockers = []
      const reviewStatus = String(item.reviewStatus || "").trim()
      if (!["not_started", "reviewing", "approved", "rejected", "TODO_REVIEW_STATUS"].includes(reviewStatus)) {
        blockers.push("reviewStatus")
      }
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && item.accountVerified !== true) blockers.push("accountVerified")
      if (mode === "local" && item.mobileAppCreated !== true) blockers.push("mobileAppCreated")
      if (mode === "local" && item.mobileAppSubmitted !== true) blockers.push("mobileAppSubmitted")
      if (mode === "local" && reviewStatus !== "approved") blockers.push("reviewStatus=approved")
      if (mode === "local" && String(item.mobileAppName || "").trim() !== EXPECTED_WECHAT_MOBILE_APP_NAME) {
        blockers.push(`mobileAppName=${EXPECTED_WECHAT_MOBILE_APP_NAME}`)
      }
      if (mode === "local" && item.mobileAppIdReady !== true) blockers.push("mobileAppIdReady")
      if (mode === "local" && item.mobileAppSecretReady !== true) blockers.push("mobileAppSecretReady")
      if (mode === "local" && String(item.androidPackageName || "").trim() !== EXPECTED_ANDROID_PACKAGE_NAME) {
        blockers.push(`androidPackageName=${EXPECTED_ANDROID_PACKAGE_NAME}`)
      }
      if (mode === "local" && item.androidConfigured !== true) blockers.push("androidConfigured")
      if (mode === "local" && String(item.iosBundleId || "").trim() !== EXPECTED_IOS_BUNDLE_ID) {
        blockers.push(`iosBundleId=${EXPECTED_IOS_BUNDLE_ID}`)
      }
      if (mode === "local") {
        const iosUniversalLink = String(item.iosUniversalLink || "").trim()
        if (
          iosUniversalLink &&
          !iosUniversalLink.startsWith("TODO_") &&
          !iosUniversalLink.startsWith("https://")
        ) {
          blockers.push("iosUniversalLink=https")
        }
      }
      if (mode === "local" && item.iosConfigured !== true) blockers.push("iosConfigured")
      return blockers
    },
  },
  {
    key: "envImport",
    label: "阿里云运行环境变量导入",
    requiredFields: ["confirmed", "target", "importedAt", "secretNotInImage", "evidence"],
    allowedFields: ["confirmed", "target", "importedAt", "secretNotInImage", "evidence"],
    validate: (item, mode) => {
      const blockers = []
      const target = String(item.target || "").trim()
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && !["SAE", "KMS", "SecretsManager"].includes(target)) blockers.push("target")
      if (mode === "local" && item.secretNotInImage !== true) blockers.push("secretNotInImage")
      return blockers
    },
  },
  {
    key: "slsAlerts",
    label: "SLS 日志和告警",
    requiredFields: ["confirmed", "slsProject", "healthAlertConfigured", "serverErrorAlertConfigured", "evidence"],
    allowedFields: ["confirmed", "slsProject", "healthAlertConfigured", "serverErrorAlertConfigured", "evidence"],
    validate: (item, mode) => {
      const blockers = []
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && item.healthAlertConfigured !== true) blockers.push("healthAlertConfigured")
      if (mode === "local" && item.serverErrorAlertConfigured !== true) blockers.push("serverErrorAlertConfigured")
      return blockers
    },
  },
]

const TOP_LEVEL_FIELDS = new Set(["schemaVersion", "environment", "updatedAt", "operator", "notes", "items"])
const CLOUD_CONFIRMATION_GROUP_METADATA = Object.freeze({
  runtime: Object.freeze({
    title: "SAE runtime 与健康检查",
    source: "阿里云控制台 -> SAE -> cn-hangzhou -> 应用列表/部署配置",
    actionScope: "sae_runtime_confirmation",
    canStartNow: false,
    requiredAuthorizationPackets: Object.freeze(["P08_SAE_RUNTIME_SLS"]),
    blockedUntil: "ACR/OSS/env 前置完成后创建或确认 SAE runtime",
    expectedEvidence: Object.freeze([
      "SAE production-cn 自定义容器应用存在",
      "containerPort=3000",
      "healthPath=/api/healthz",
      "非密钥控制台证据编号已记录",
    ]),
  }),
  apiDomainHttps: Object.freeze({
    title: "api-cn DNS、HTTPS 和 ICP",
    source: "阿里云控制台 -> 云解析 DNS / 数字证书 / SAE 或网关公网入口",
    actionScope: "api_domain_dns_https_icp",
    canStartNow: false,
    requiredAuthorizationPackets: Object.freeze(["P07_DOMAIN_DNS_HTTPS"]),
    blockedUntil: "SAE runtime 公网入口存在后配置 api-cn 域名",
    expectedEvidence: Object.freeze([
      "api-cn.ipgongchang.xin 解析到阿里云公网入口",
      "HTTPS 证书启用并可访问",
      "ICP备案满足国内正式访问要求",
    ]),
  }),
  assetDomainHttps: Object.freeze({
    title: "assets-cn DNS、HTTPS 和 ICP",
    source: "阿里云控制台 -> 云解析 DNS / OSS 或 CDN 自定义域名 / 数字证书",
    actionScope: "asset_domain_dns_https_icp",
    canStartNow: false,
    requiredAuthorizationPackets: Object.freeze(["P07_DOMAIN_DNS_HTTPS"]),
    blockedUntil: "OSS/CDN 资源入口确认后配置 assets-cn 域名",
    expectedEvidence: Object.freeze([
      "assets-cn.ipgongchang.xin 解析到阿里云资源入口",
      "HTTPS 证书启用并可访问",
      "ICP备案满足国内正式访问要求",
    ]),
  }),
  oss: Object.freeze({
    title: "OSS Bucket、CORS 和 RAM/STS 最小权限",
    source: "阿里云控制台 -> OSS Bucket / RAM 访问控制 / SAE 运行身份",
    actionScope: "oss_audio_bucket_cors_ram_sts",
    canStartNow: true,
    requiredAuthorizationPackets: Object.freeze(["P05_OSS_RAM_STS"]),
    blockedUntil: "OSS bucket、CORS、服务记录前缀和最小权限 RAM/STS 均确认",
    expectedEvidence: Object.freeze([
      "bucket=meiye-huajing-service-records-production-cn",
      "region=cn-hangzhou",
      "corsConfigured=true",
      "ramLeastPrivilege=true",
      "serviceRecordPrefix=service-records/production-cn",
    ]),
  }),
  wechatOpenPlatform: Object.freeze({
    title: "微信开放平台移动应用",
    source: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜",
    actionScope: "wechat_open_platform_mobile_app",
    canStartNow: false,
    requiredAuthorizationPackets: Object.freeze([
      "P01_WECHAT_OPEN_MOBILE_APP",
      "P10_ANDROID_RELEASE_SIGNING",
      "P02_APPLE_TEAM_ID",
    ]),
    blockedUntil: "移动应用创建并审核通过，Android release 签名和 iOS Universal Link 均配置完成",
    expectedEvidence: Object.freeze([
      "mobileAppCreated=true",
      "reviewStatus=approved",
      "mobileAppIdReady=true",
      "mobileAppSecretReady=true",
      "androidConfigured=true",
      "iosConfigured=true",
    ]),
  }),
  envImport: Object.freeze({
    title: "production-cn 运行环境变量导入",
    source: "阿里云控制台 -> SAE 环境变量 / KMS / Secrets Manager",
    actionScope: "runtime_env_import",
    canStartNow: false,
    requiredAuthorizationPackets: Object.freeze(["P06_ENV_IMPORT"]),
    blockedUntil: "微信移动应用、OSS/RAM 和运行时目标明确后导入变量",
    expectedEvidence: Object.freeze([
      "confirmed=true",
      "importedAt 为实际导入时间或证据编号",
      "secretNotInImage=true",
      "只记录非密钥 evidence handle",
    ]),
  }),
  slsAlerts: Object.freeze({
    title: "SLS 日志采集和告警",
    source: "阿里云控制台 -> 日志服务 SLS / 应用监控告警",
    actionScope: "sls_health_and_5xx_alerts",
    canStartNow: false,
    requiredAuthorizationPackets: Object.freeze(["P08_SAE_RUNTIME_SLS"]),
    blockedUntil: "SAE runtime 存在并接入日志后配置 health/5xx 告警",
    expectedEvidence: Object.freeze([
      "SLS project/logstore 存在",
      "healthAlertConfigured=true",
      "serverErrorAlertConfigured=true",
      "非密钥控制台证据编号已记录",
    ]),
  }),
})
const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
]

function parseArgs(argv) {
  const args = {
    templateFile: DEFAULT_TEMPLATE_FILE,
    localFile: DEFAULT_LOCAL_FILE,
    allowIncomplete: false,
    backendOnly: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--template") {
      args.templateFile = resolveValue(argv[++index], "--template")
      continue
    }
    if (arg === "--local") {
      args.localFile = resolveValue(argv[++index], "--local")
      continue
    }
    if (arg === "--allow-incomplete") {
      args.allowIncomplete = true
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function definitionsForScope(args) {
  if (!args.backendOnly) return DEFINITIONS
  return DEFINITIONS.filter((definition) => !APP_LAUNCH_DEFERRED_CONFIRMATION_KEYS.has(definition.key))
}

function cloudConfirmationCommandsForScope(currentScope) {
  if (currentScope === "backend_aliyun_only") {
    return {
      check: "corepack pnpm aliyun:cloud:confirmations:backend",
      strict: "corepack pnpm aliyun:cloud:confirmations:backend:strict",
    }
  }
  return {
    check: "corepack pnpm aliyun:cloud:confirmations",
    strict: "corepack pnpm aliyun:cloud:confirmations:strict",
  }
}

function validateFile(filePath, mode, options = {}) {
  const definitions = options.definitions || DEFINITIONS
  if (!existsSync(filePath)) {
    return {
      file: filePath,
      mode,
      currentScope: options.currentScope || "full_app_launch",
      exists: false,
      ready: false,
      blockers: ["file_missing"],
      warnings: [],
      items: [],
    }
  }

  const data = readJson(filePath)
  const blockers = []
  const warnings = []
  const topLevelUnknown = Object.keys(data).filter((field) => !TOP_LEVEL_FIELDS.has(field))
  if (topLevelUnknown.length) warnings.push(`unknown_top_level_fields:${topLevelUnknown.join(",")}`)
  if (data.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (data.environment !== "production-cn") blockers.push("environment=production-cn")
  if (!data.items || typeof data.items !== "object" || Array.isArray(data.items)) blockers.push("items_object_required")

  const secretMatches = findSecretLikeValues(data)
  if (secretMatches.length) blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)

  const rawItems = data.items && typeof data.items === "object" && !Array.isArray(data.items) ? data.items : {}
  const knownKeys = new Set(DEFINITIONS.map((item) => item.key))
  const unknownItems = Object.keys(rawItems).filter((key) => !knownKeys.has(key))
  if (unknownItems.length) warnings.push(`unknown_items:${unknownItems.join(",")}`)

  const items = definitions.map((definition) => validateItem(rawItems[definition.key], definition, mode))
  const itemBlockers = items.flatMap((item) => item.blockers.map((blocker) => `${item.key}:${blocker}`))
  const itemWarnings = items.flatMap((item) => item.warnings.map((warning) => `${item.key}:${warning}`))
  warnings.push(...itemWarnings)
  blockers.push(...itemBlockers)

  return {
    file: filePath,
    mode,
    currentScope: options.currentScope || "full_app_launch",
    exists: true,
    ready: blockers.length === 0,
    blockers,
    warnings,
    items,
  }
}

function validateItem(rawItem, definition, mode) {
  if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
    return {
      key: definition.key,
      label: definition.label,
      ready: false,
      blockers: ["item_missing"],
      warnings: [],
      missingFields: definition.requiredFields,
    }
  }
  const missingFields = definition.requiredFields.filter((field) => !Object.prototype.hasOwnProperty.call(rawItem, field))
  const blockers = [...missingFields.map((field) => `missing:${field}`)]
  const warnings = []
  const unknownFields = Object.keys(rawItem).filter((field) => !definition.allowedFields.includes(field))
  if (unknownFields.length) warnings.push(`unknown_fields:${unknownFields.join(",")}`)

  if (mode === "local") {
    for (const field of definition.requiredFields) {
      if (!Object.prototype.hasOwnProperty.call(rawItem, field)) continue
      const value = rawItem[field]
      if (typeof value === "string" && isTodoText(value)) blockers.push(`todo:${field}`)
      if (typeof value === "string" && isPendingPlaceholderText(value)) blockers.push(`placeholder:${field}`)
      if (value === "") blockers.push(`empty:${field}`)
    }
  }

  blockers.push(...definition.validate(rawItem, mode))
  const uniqueBlockers = [...new Set(blockers)]
  return {
    key: definition.key,
    label: definition.label,
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    warnings,
    missingFields,
  }
}

function text(value) {
  return String(value || "").trim()
}

function isTodoText(value) {
  return /^TODO(?:_|$)/i.test(text(value))
}

function isPendingPlaceholderText(value) {
  return /^(?:pending|TBD)(?:_|$)/i.test(text(value))
}

function findSecretLikeValues(value, path = "$") {
  const matches = []
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => matches.push(...findSecretLikeValues(item, `${path}[${index}]`)))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    matches.push(...findSecretLikeValues(nested, `${path}.${key}`))
  }
  return matches
}

function summarize(files) {
  const local = files.find((file) => file.mode === "local")
  const writebackPlan = local ? buildCloudConfirmationWritebackPlan(local) : null
  return {
    files: files.length,
    readyFiles: files.filter((file) => file.ready).length,
    blockingFiles: files.filter((file) => !file.ready).length,
    totalBlockers: files.reduce((sum, file) => sum + file.blockers.length, 0),
    totalWarnings: files.reduce((sum, file) => sum + file.warnings.length, 0),
    ...(writebackPlan ? {
      writebackBlockingGroups: writebackPlan.blockingGroups,
      requiredAuthorizationPackets: writebackPlan.requiredAuthorizationPackets,
    } : {}),
  }
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const item = String(value || "").trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function authorizationPacketsForBlocker(key, blocker) {
  if (key !== "wechatOpenPlatform") {
    return CLOUD_CONFIRMATION_GROUP_METADATA[key]?.requiredAuthorizationPackets || []
  }
  const textValue = String(blocker || "")
  if (textValue.includes("android")) return ["P10_ANDROID_RELEASE_SIGNING"]
  if (textValue.includes("ios")) return ["P01_WECHAT_OPEN_MOBILE_APP", "P02_APPLE_TEAM_ID"]
  return ["P01_WECHAT_OPEN_MOBILE_APP"]
}

function buildCloudConfirmationWritebackPlan(local) {
  const currentScope = local.currentScope || "full_app_launch"
  const commands = cloudConfirmationCommandsForScope(currentScope)
  const groups = (local.items || []).map((item) => {
    const metadata = CLOUD_CONFIRMATION_GROUP_METADATA[item.key] || {}
    const requiredAuthorizationPackets = uniqueStrings(
      item.blockers.flatMap((blocker) => authorizationPacketsForBlocker(item.key, blocker)),
    )
    return {
      id: item.key,
      title: metadata.title || item.label,
      source: metadata.source || "unknown",
      actionScope: metadata.actionScope || item.key,
      ready: item.ready === true,
      canStartNow: metadata.canStartNow === true,
      blockers: item.blockers.map((blocker) => `${item.key}:${blocker}`),
      requiredAuthorizationPackets,
      writeTargets: [`deploy/aliyun-production-cn.cloud-confirmations.local.json: items.${item.key}`],
      expectedEvidence: metadata.expectedEvidence || [],
      blockedUntil: item.ready ? "ready" : metadata.blockedUntil || "补齐该组非密钥证据",
      forbidden: [
        "不要写入 AccessKeySecret、AppSecret、registry password、RAM Secret、STS token、cookie 或 Supabase service role key",
        "不要把云控制台已登录误标记为资源 ready",
        "不要把小程序 AppID/Secret 当作微信开放平台移动应用凭证",
      ],
      verifyCommands: [
        commands.check,
        commands.strict,
      ],
      nonSecretEvidenceOnly: true,
    }
  })
  const blockingGroups = groups.filter((group) => !group.ready).map((group) => group.id)
  return {
    file: local.file,
    exists: local.exists,
    ready: local.ready,
    totalBlockers: local.blockers.length,
    blockingGroups,
    groups,
    requiredAuthorizationPackets: uniqueStrings(groups.flatMap((group) => group.requiredAuthorizationPackets)),
    strictVerificationOrder: [
      commands.strict,
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "This report is local and value-free; it does not call Aliyun APIs, create resources, import secrets, mutate DNS, or deploy.",
      "Write only resource names, booleans, timestamps, console paths, and non-secret evidence handles into cloud-confirmations.local.json.",
      "Never store AppSecret, AccessKeySecret, RAM Secret, registry password, STS token, cookies, certificate private keys, or Supabase service role keys.",
    ],
  }
}

function main() {
  const args = parseArgs(process.argv)
  const currentScope = args.backendOnly ? "backend_aliyun_only" : "full_app_launch"
  const definitions = definitionsForScope(args)
  const template = validateFile(args.templateFile, "template", { currentScope, definitions })
  const local = validateFile(args.localFile, "local", { currentScope, definitions })
  const ok = template.ready && local.ready
  const writebackPlan = buildCloudConfirmationWritebackPlan(local)
  const report = {
    ok,
    currentScope,
    backendOnly: args.backendOnly,
    allowIncomplete: args.allowIncomplete,
    containsValues: false,
    deferredAppLaunchConfirmationKeys: args.backendOnly ? [...APP_LAUNCH_DEFERRED_CONFIRMATION_KEYS] : [],
    deferredAppLaunchAuthorizationPackets: args.backendOnly ? [...APP_LAUNCH_DEFERRED_AUTHORIZATION_PACKETS] : [],
    summary: summarize([template, local]),
    template: {
      file: template.file,
      ready: template.ready,
      blockers: template.blockers,
      warnings: template.warnings,
      checkedItems: template.items.length,
    },
    local: {
      file: local.file,
      exists: local.exists,
      ready: local.ready,
      blockers: local.blockers,
      warnings: local.warnings,
      checkedItems: local.items.length,
      itemStatus: Object.fromEntries(local.items.map((item) => [item.key, {
        ready: item.ready,
        blockers: item.blockers,
      }])),
    },
    writebackPlan,
    nextActions: [
      "保持 example 模板只放 TODO 和非密钥字段。",
      "在 .local.json 里只填资源名、布尔状态、证据编号或控制台路径，不填任何 secret/token/key/password 值。",
      ...(args.backendOnly
        ? ["当前 backend-only 口径下微信开放平台移动应用、Android 签名和 iOS AASA 只作为上线后延期项，不阻塞阿里云后端资源补齐。"]
        : []),
      "所有 local item ready 后再运行 corepack pnpm aliyun:readiness:cloud-ready。",
      "正式部署后再运行 corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin。",
    ],
  }

  console.log(JSON.stringify(report, null, 2))
  if (!ok && !args.allowIncomplete) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-cloud-confirmations.mjs [--allow-incomplete] [--backend-only] [--template path] [--local path]",
    "",
    "Checks the non-secret Aliyun/WeChat cloud confirmation template and local evidence file.",
    "--backend-only excludes deferred WeChat Open Platform mobile app, Android signing, and iOS AASA evidence from the current backend deployment scope.",
    "It never reads or prints secret values, and fails strict mode until all local confirmations are complete.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
