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

function validateFile(filePath, mode) {
  if (!existsSync(filePath)) {
    return {
      file: filePath,
      mode,
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

  const items = DEFINITIONS.map((definition) => validateItem(rawItems[definition.key], definition, mode))
  const itemBlockers = items.flatMap((item) => item.blockers.map((blocker) => `${item.key}:${blocker}`))
  const itemWarnings = items.flatMap((item) => item.warnings.map((warning) => `${item.key}:${warning}`))
  warnings.push(...itemWarnings)
  blockers.push(...itemBlockers)

  return {
    file: filePath,
    mode,
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
  return {
    files: files.length,
    readyFiles: files.filter((file) => file.ready).length,
    blockingFiles: files.filter((file) => !file.ready).length,
    totalBlockers: files.reduce((sum, file) => sum + file.blockers.length, 0),
    totalWarnings: files.reduce((sum, file) => sum + file.warnings.length, 0),
  }
}

function main() {
  const args = parseArgs(process.argv)
  const template = validateFile(args.templateFile, "template")
  const local = validateFile(args.localFile, "local")
  const ok = template.ready && local.ready
  const report = {
    ok,
    allowIncomplete: args.allowIncomplete,
    containsValues: false,
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
    nextActions: [
      "保持 example 模板只放 TODO 和非密钥字段。",
      "在 .local.json 里只填资源名、布尔状态、证据编号或控制台路径，不填任何 secret/token/key/password 值。",
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
    "  node scripts/check-aliyun-cloud-confirmations.mjs [--allow-incomplete] [--template path] [--local path]",
    "",
    "Checks the non-secret Aliyun/WeChat cloud confirmation template and local evidence file.",
    "It never reads or prints secret values, and fails strict mode until all local confirmations are complete.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
