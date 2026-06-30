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
const EXPECTED_OSS_BUCKET = "meiye-huajing-service-records-production-cn"
const EXPECTED_OSS_SERVICE_RECORD_PREFIX = "service-records/production-cn"
const EXPECTED_API_HOST = "api-cn.ipgongchang.xin"
const EXPECTED_ASSET_HOST = "assets-cn.ipgongchang.xin"
const EXPECTED_SAE_APP_NAME = "meiye-huajing-app-api-production-cn"
const EXPECTED_RUNTIME_CONTAINER_PORT = 3000
const EXPECTED_RUNTIME_HEALTH_PATH = "/api/healthz"
const EXPECTED_SLS_PROJECT = "meiye-huajing-app-prod-cn"
const EXPECTED_SLS_LOGSTORE = "app-api"
const EXPECTED_READY_SECRET_ENV_VARIABLE_COUNT = 17
const EXPECTED_READY_SECRET_ENV_GROUP_COUNT = 9
const EXPECTED_BLOCKED_CREDENTIAL_NAMES = Object.freeze(["DATABASE_URL_CN"])
const EXPECTED_BLOCKED_SECRET_BATCH_IDS = Object.freeze([
  "BLOCKED_SECRET_BATCH_01_OSS_RAM_STS",
  "BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
])
const EXPECTED_READY_SECRET_BATCH_IDS = Object.freeze([
  "READY_SECRET_BATCH_01_LEGACY_DATABASE_MIGRATION_SOURCE",
  "READY_SECRET_BATCH_02_APP_AUTH",
  "READY_SECRET_BATCH_03_ALIYUN_OSS",
  "READY_SECRET_BATCH_04_BAILIAN_ASR",
  "READY_SECRET_BATCH_05_DEEPSEEK_SUMMARY",
  "READY_SECRET_BATCH_06_VOLC_SPEECH",
  "READY_SECRET_BATCH_07_BACKEND_OPS",
  "READY_SECRET_BATCH_08_LEGACY_CONTENT_PROVIDER",
  "READY_SECRET_BATCH_09_MINI_PROGRAM_COMPAT",
])
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
    allowedFields: [
      "confirmed",
      "provider",
      "region",
      "appId",
      "appName",
      "containerPort",
      "healthPath",
      "acrImage",
      "imageDigest",
      "imagePullConfigured",
      "imagePullSecretId",
      "imagePullSecretName",
      "imagePullCredentialMode",
      "startCommand",
      "publicEndpoint",
      "publicIngress",
      "publicIngressProtocol",
      "internetSlbId",
      "internetIp",
      "httpHealthUrl",
      "dnsHttpHealthProbe",
      "runningInstances",
      "lastDeployChangeOrderId",
      "lastDeployPipelineId",
      "lastBindSlbChangeOrderId",
      "lastBindSlbPipelineId",
      "slsConfigured",
      "slsLogConfigName",
      "lastSlsDeployChangeOrderId",
      "lastSlsDeployPipelineId",
      "runtimeRoleName",
      "envSecretSource",
      "logProject",
      "logstore",
      "vpcId",
      "vswitchId",
      "securityGroupId",
      "cpu",
      "memory",
      "replicas",
      "autoScaling",
      "releaseStrategy",
      "evidence",
    ],
    validate: (item, mode) => {
      const blockers = []
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && String(item.provider || "").trim() !== "SAE") blockers.push("provider=SAE")
      if (Number(item.containerPort) !== EXPECTED_RUNTIME_CONTAINER_PORT) {
        blockers.push(`containerPort=${EXPECTED_RUNTIME_CONTAINER_PORT}`)
      }
      if (String(item.healthPath || "").trim() !== EXPECTED_RUNTIME_HEALTH_PATH) {
        blockers.push(`healthPath=${EXPECTED_RUNTIME_HEALTH_PATH}`)
      }
      return blockers
    },
  },
  {
    key: "apiDomainHttps",
    label: "api-cn DNS、HTTPS 和 ICP",
    requiredFields: ["confirmed", "host", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    allowedFields: [
      "confirmed",
      "host",
      "dnsResolvedToAliyun",
      "httpsEnabled",
      "icpReady",
      "dnsProvider",
      "recordType",
      "recordName",
      "recordValue",
      "recordId",
      "ingressType",
      "certificateId",
      "certificateEvidence",
      "icpEntity",
      "icpEvidence",
      "httpProbeUrl",
      "httpProbeWithResolve",
      "httpsProbeUrl",
      "evidence",
    ],
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
    allowedFields: [
      "confirmed",
      "host",
      "dnsResolvedToAliyun",
      "httpsEnabled",
      "icpReady",
      "dnsProvider",
      "recordType",
      "recordName",
      "recordValue",
      "recordId",
      "ingressType",
      "certificateId",
      "certificateEvidence",
      "icpEntity",
      "icpEvidence",
      "httpsProbeUrl",
      "evidence",
    ],
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
    allowedFields: [
      "confirmed",
      "bucket",
      "region",
      "corsConfigured",
      "ramLeastPrivilege",
      "serviceRecordPrefix",
      "accessMode",
      "roleOrUserName",
      "policyName",
      "secretEnvNames",
      "credentialBoundary",
      "evidence",
    ],
    validate: (item, mode) => {
      const blockers = []
      if (mode === "local" && item.confirmed !== true) blockers.push("confirmed")
      if (mode === "local" && String(item.region || "").trim() !== EXPECTED_ALIYUN_REGION) {
        blockers.push(`region=${EXPECTED_ALIYUN_REGION}`)
      }
      if (mode === "local" && item.corsConfigured !== true) blockers.push("corsConfigured")
      if (mode === "local" && item.ramLeastPrivilege !== true) blockers.push("ramLeastPrivilege")
      if (String(item.serviceRecordPrefix || "").trim() !== EXPECTED_OSS_SERVICE_RECORD_PREFIX) {
        blockers.push(`serviceRecordPrefix=${EXPECTED_OSS_SERVICE_RECORD_PREFIX}`)
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
    allowedFields: [
      "confirmed",
      "target",
      "importedAt",
      "secretNotInImage",
      "importMode",
      "secretEnvStore",
      "secretEnvScope",
      "readySecretEnvVariableCount",
      "readySecretEnvVariableGroupCount",
      "blockedCredentialNames",
      "blockedSecretBatchIds",
      "readySecretBatchIds",
      "importBatchCount",
      "rdsSecretImported",
      "ossSecretsImported",
      "readySecretsImported",
      "imageContainsSecrets",
      "deferredAppLaunchExcluded",
      "importBatchEvidence",
      "evidence",
    ],
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
    allowedFields: [
      "confirmed",
      "slsProject",
      "region",
      "logstore",
      "healthAlertConfigured",
      "serverErrorAlertConfigured",
      "healthAlertName",
      "serverErrorAlertName",
      "requestLogQuery",
      "dashboardName",
      "notificationChannel",
      "retentionDays",
      "indexEnabled",
      "logConfigName",
      "logType",
      "logDir",
      "importedAt",
      "evidence",
    ],
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
      `containerPort=${EXPECTED_RUNTIME_CONTAINER_PORT}`,
      `healthPath=${EXPECTED_RUNTIME_HEALTH_PATH}`,
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
      `bucket=${EXPECTED_OSS_BUCKET}`,
      "region=cn-hangzhou",
      "corsConfigured=true",
      "ramLeastPrivilege=true",
      `serviceRecordPrefix=${EXPECTED_OSS_SERVICE_RECORD_PREFIX}`,
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
    blockedUntil: "RDS/DATABASE_URL_CN、OSS/RAM、ACR 镜像和 SAE runtime 目标明确后导入变量",
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
    nonSecretValues: nonSecretConfirmationValues(definition.key, rawItem),
  }
}

function text(value) {
  return String(value || "").trim()
}

function nonSecretConfirmationValues(key, rawItem) {
  if (key === "runtime" && rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)) {
    return {
      confirmed: rawItem.confirmed === true,
      provider: text(rawItem.provider),
      region: text(rawItem.region),
      appName: text(rawItem.appName),
      containerPort: Number(rawItem.containerPort),
      healthPath: text(rawItem.healthPath),
      acrImage: text(rawItem.acrImage),
      imageDigest: text(rawItem.imageDigest),
      imagePullConfigured: rawItem.imagePullConfigured === true,
      publicEndpoint: text(rawItem.publicEndpoint),
      runtimeRoleName: text(rawItem.runtimeRoleName),
      envSecretSource: text(rawItem.envSecretSource),
      logProject: text(rawItem.logProject),
      logstore: text(rawItem.logstore),
      vpcId: text(rawItem.vpcId),
      vswitchId: text(rawItem.vswitchId),
      securityGroupId: text(rawItem.securityGroupId),
      cpu: text(rawItem.cpu),
      memory: text(rawItem.memory),
      replicas: text(rawItem.replicas),
      autoScaling: text(rawItem.autoScaling),
      releaseStrategy: text(rawItem.releaseStrategy),
      evidence: text(rawItem.evidence),
    }
  }
  if ((key === "apiDomainHttps" || key === "assetDomainHttps") && rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)) {
    return {
      confirmed: rawItem.confirmed === true,
      host: text(rawItem.host),
      dnsResolvedToAliyun: rawItem.dnsResolvedToAliyun === true,
      httpsEnabled: rawItem.httpsEnabled === true,
      icpReady: rawItem.icpReady === true,
      dnsProvider: text(rawItem.dnsProvider),
      recordType: text(rawItem.recordType),
      recordName: text(rawItem.recordName),
      recordValue: text(rawItem.recordValue),
      ingressType: text(rawItem.ingressType),
      certificateId: text(rawItem.certificateId),
      certificateEvidence: text(rawItem.certificateEvidence),
      icpEntity: text(rawItem.icpEntity),
      icpEvidence: text(rawItem.icpEvidence),
      httpsProbeUrl: text(rawItem.httpsProbeUrl),
      evidence: text(rawItem.evidence),
    }
  }
  if (key === "slsAlerts" && rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)) {
    return {
      confirmed: rawItem.confirmed === true,
      slsProject: text(rawItem.slsProject),
      region: text(rawItem.region),
      logstore: text(rawItem.logstore),
      healthAlertConfigured: rawItem.healthAlertConfigured === true,
      serverErrorAlertConfigured: rawItem.serverErrorAlertConfigured === true,
      healthAlertName: text(rawItem.healthAlertName),
      serverErrorAlertName: text(rawItem.serverErrorAlertName),
      requestLogQuery: text(rawItem.requestLogQuery),
      dashboardName: text(rawItem.dashboardName),
      notificationChannel: text(rawItem.notificationChannel),
      retentionDays: text(rawItem.retentionDays),
      evidence: text(rawItem.evidence),
    }
  }
  if (key === "envImport" && rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)) {
    return {
      confirmed: rawItem.confirmed === true,
      target: text(rawItem.target),
      importedAt: text(rawItem.importedAt),
      secretNotInImage: rawItem.secretNotInImage === true,
      importMode: text(rawItem.importMode),
      secretEnvStore: text(rawItem.secretEnvStore),
      secretEnvScope: text(rawItem.secretEnvScope),
      readySecretEnvVariableCount: Number(rawItem.readySecretEnvVariableCount),
      readySecretEnvVariableGroupCount: Number(rawItem.readySecretEnvVariableGroupCount),
      blockedCredentialNames: Array.isArray(rawItem.blockedCredentialNames)
        ? rawItem.blockedCredentialNames.map(text).filter(Boolean)
        : [],
      blockedSecretBatchIds: Array.isArray(rawItem.blockedSecretBatchIds)
        ? rawItem.blockedSecretBatchIds.map(text).filter(Boolean)
        : [],
      readySecretBatchIds: Array.isArray(rawItem.readySecretBatchIds)
        ? rawItem.readySecretBatchIds.map(text).filter(Boolean)
        : [],
      importBatchCount: Number(rawItem.importBatchCount),
      rdsSecretImported: rawItem.rdsSecretImported === true,
      ossSecretsImported: rawItem.ossSecretsImported === true,
      readySecretsImported: rawItem.readySecretsImported === true,
      imageContainsSecrets: rawItem.imageContainsSecrets === true,
      deferredAppLaunchExcluded: rawItem.deferredAppLaunchExcluded === true,
      importBatchEvidence: text(rawItem.importBatchEvidence),
      evidence: text(rawItem.evidence),
    }
  }
  if (key !== "oss" || !rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return {}
  return {
    confirmed: rawItem.confirmed === true,
    bucket: text(rawItem.bucket),
    region: text(rawItem.region),
    corsConfigured: rawItem.corsConfigured === true,
    ramLeastPrivilege: rawItem.ramLeastPrivilege === true,
    serviceRecordPrefix: text(rawItem.serviceRecordPrefix),
    accessMode: text(rawItem.accessMode),
    roleOrUserName: text(rawItem.roleOrUserName),
    policyName: text(rawItem.policyName),
    secretEnvNames: Array.isArray(rawItem.secretEnvNames) ? rawItem.secretEnvNames.map(text).filter(Boolean) : [],
    credentialBoundary: text(rawItem.credentialBoundary),
  }
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
  const ossAccessPlan = local ? buildOssAccessPlan(local) : null
  const domainHttpsPlan = local ? buildDomainHttpsPlan(local) : null
  const runtimeSlsPlan = local ? buildRuntimeSlsPlan(local) : null
  const envImportPlan = local ? buildEnvImportPlan(local) : null
  const writebackPlan = local
    ? buildCloudConfirmationWritebackPlan(local, ossAccessPlan, domainHttpsPlan, runtimeSlsPlan, envImportPlan)
    : null
  return {
    files: files.length,
    readyFiles: files.filter((file) => file.ready).length,
    blockingFiles: files.filter((file) => !file.ready).length,
    totalBlockers: files.reduce((sum, file) => sum + file.blockers.length, 0),
    totalWarnings: files.reduce((sum, file) => sum + file.warnings.length, 0),
    ...(writebackPlan ? {
      writebackBlockingGroups: writebackPlan.blockingGroups,
      requiredAuthorizationPackets: writebackPlan.requiredAuthorizationPackets,
      ossAccessPlanReady: ossAccessPlan.selectedReady,
      recommendedOssAccessModes: ossAccessPlan.recommendedModeIds,
      canStartP05AfterActionTimeConfirmation: ossAccessPlan.executionReadiness.canStartP05AfterActionTimeConfirmation,
      preferredOssAccessModeAvoidsLongLivedSecret: ossAccessPlan.executionReadiness.preferredModeAvoidsLongLivedSecret,
      domainHttpsPlanReady: domainHttpsPlan.ready,
      recommendedDomainIngressModes: domainHttpsPlan.recommendedModeIds,
      runtimeSlsPlanReady: runtimeSlsPlan.ready,
      recommendedRuntimeSlsModes: runtimeSlsPlan.recommendedModeIds,
      envImportPlanReady: envImportPlan.ready,
      blockedEnvImportBatchIds: envImportPlan.blockedSecretBatchIds,
      readyEnvImportBatchIds: envImportPlan.readySecretBatchIds,
      envImportBlockedCredentialNames: envImportPlan.blockedCredentialNames,
      envImportReadySecretEnvVariableCount: envImportPlan.readySecretEnvVariableCount,
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

function buildRuntimeSlsPlan(local) {
  const itemsByKey = new Map((local.items || []).map((item) => [item.key, item]))
  const runtimeItem = itemsByKey.get("runtime") || null
  const slsItem = itemsByKey.get("slsAlerts") || null
  const runtimeValues = runtimeItem?.nonSecretValues || {}
  const slsValues = slsItem?.nonSecretValues || {}
  const runtimeBlockers = cloudItemBlockers("runtime", runtimeItem)
  const slsBlockers = cloudItemBlockers("slsAlerts", slsItem)
  const runtimeMode = runtimeItem?.ready === true
    ? "sae_custom_container_runtime"
    : "pending_create_sae_custom_container_runtime"
  const slsMode = slsItem?.ready === true
    ? "sls_health_5xx_alerts"
    : "pending_bind_sae_logs_and_alerts"
  const candidates = [
    {
      id: "sae_custom_container_runtime",
      itemKey: "runtime",
      title: "Create or confirm the SAE production-cn custom container runtime",
      recommended: true,
      targetAppName: EXPECTED_SAE_APP_NAME,
      provider: "SAE",
      region: EXPECTED_ALIYUN_REGION,
      containerPort: EXPECTED_RUNTIME_CONTAINER_PORT,
      healthPath: EXPECTED_RUNTIME_HEALTH_PATH,
      consolePaths: [
        "SAE -> cn-hangzhou -> 应用 -> 创建应用/部署应用 -> 自定义容器镜像",
        "SAE -> 应用 -> 部署配置 -> 镜像、端口、健康检查、环境变量",
        "SAE -> 应用 -> 访问方式 -> 公网访问/自定义域名",
        "SAE -> 应用 -> 日志 -> SLS project/logstore 绑定",
      ],
      canUseNow: runtimeItem?.ready === true,
      blockers: runtimeBlockers,
      blockedUntil: [
        "ACR remote image digest and image pull authorization are confirmed",
        "RDS DATABASE_URL_CN and ready secret env variables are imported into SAE/KMS/Secrets Manager",
        "OSS RAM/STS/runtime role access path is selected",
      ],
      writeBackFields: [
        "items.runtime.provider=SAE",
        `items.runtime.region=${EXPECTED_ALIYUN_REGION}`,
        `items.runtime.appName=${EXPECTED_SAE_APP_NAME}`,
        `items.runtime.containerPort=${EXPECTED_RUNTIME_CONTAINER_PORT}`,
        `items.runtime.healthPath=${EXPECTED_RUNTIME_HEALTH_PATH}`,
        "items.runtime.acrImage=<ACR remote image reference>",
        "items.runtime.imageDigest=<sha256 digest evidence handle>",
        "items.runtime.imagePullConfigured=true",
        "items.runtime.publicEndpoint=<SAE public endpoint or ingress evidence handle>",
        "items.runtime.runtimeRoleName=<SAE runtime role or service-linked identity name>",
        "items.runtime.envSecretSource=SAE/KMS/SecretsManager secret env",
        `items.runtime.logProject=${EXPECTED_SLS_PROJECT}`,
        `items.runtime.logstore=${EXPECTED_SLS_LOGSTORE}`,
        "items.runtime.confirmed=true",
      ],
      requiredEvidence: [
        "SAE application exists in cn-hangzhou with the expected app name",
        "SAE deployment uses the ACR remote image and verified sha256 digest",
        "containerPort and /api/healthz health check are configured",
        "runtime secret env source and runtime identity are recorded without secret values",
        "SLS log project/logstore binding is recorded as non-secret evidence",
      ],
    },
    {
      id: "sls_health_5xx_alerts",
      itemKey: "slsAlerts",
      title: "Configure SLS logstore plus health and 5xx alerts for the backend runtime",
      recommended: true,
      project: EXPECTED_SLS_PROJECT,
      logstore: EXPECTED_SLS_LOGSTORE,
      consolePaths: [
        "日志服务 SLS -> project -> logstore -> 索引和查询分析",
        "日志服务 SLS -> 告警 -> 新建告警 -> /api/healthz 异常",
        "日志服务 SLS -> 告警 -> 新建告警 -> 5xx 错误",
        "日志服务 SLS -> 仪表盘/告警通知 -> 非密钥通知渠道证据",
      ],
      canUseNow: slsItem?.ready === true,
      blockers: slsBlockers,
      blockedUntil: [
        "SAE runtime exists and emits access/application logs to SLS",
        "logstore index/query analysis is enabled",
        "health and server-error alert rules have non-secret evidence handles",
      ],
      writeBackFields: [
        "items.slsAlerts.confirmed=true",
        `items.slsAlerts.slsProject=${EXPECTED_SLS_PROJECT}`,
        `items.slsAlerts.region=${EXPECTED_ALIYUN_REGION}`,
        `items.slsAlerts.logstore=${EXPECTED_SLS_LOGSTORE}`,
        "items.slsAlerts.healthAlertName=<health alert rule name>",
        "items.slsAlerts.serverErrorAlertName=<5xx alert rule name>",
        "items.slsAlerts.requestLogQuery=<non-secret query name or saved-search evidence handle>",
        "items.slsAlerts.dashboardName=<dashboard name or evidence handle>",
        "items.slsAlerts.notificationChannel=<non-secret contact group or channel evidence handle>",
        "items.slsAlerts.healthAlertConfigured=true",
        "items.slsAlerts.serverErrorAlertConfigured=true",
      ],
      requiredEvidence: [
        "SLS project/logstore exists and receives SAE logs",
        "query/index is enabled enough to support health and 5xx alert rules",
        "healthAlertConfigured=true and serverErrorAlertConfigured=true are backed by non-secret alert evidence",
        "notification channel evidence does not include webhook tokens or credentials",
      ],
    },
  ]
  const groups = {
    runtime: {
      selectedMode: runtimeMode,
      targetAppName: runtimeValues.appName || EXPECTED_SAE_APP_NAME,
      ready: runtimeItem?.ready === true,
      blockers: runtimeBlockers,
      recommendedModeIds: ["sae_custom_container_runtime"],
      candidates: candidates.filter((candidate) => candidate.itemKey === "runtime"),
      writebackTemplate: runtimeSlsWritebackTemplate("runtime"),
    },
    slsAlerts: {
      selectedMode: slsMode,
      targetProject: slsValues.slsProject || EXPECTED_SLS_PROJECT,
      targetLogstore: slsValues.logstore || EXPECTED_SLS_LOGSTORE,
      ready: slsItem?.ready === true,
      blockers: slsBlockers,
      recommendedModeIds: ["sls_health_5xx_alerts"],
      candidates: candidates.filter((candidate) => candidate.itemKey === "slsAlerts"),
      writebackTemplate: runtimeSlsWritebackTemplate("slsAlerts"),
    },
  }
  return {
    ready: groups.runtime.ready && groups.slsAlerts.ready,
    selectedModes: {
      runtime: groups.runtime.selectedMode,
      slsAlerts: groups.slsAlerts.selectedMode,
    },
    targets: {
      runtimeAppName: EXPECTED_SAE_APP_NAME,
      slsProject: EXPECTED_SLS_PROJECT,
      slsLogstore: EXPECTED_SLS_LOGSTORE,
    },
    recommendedModeIds: ["sae_custom_container_runtime", "sls_health_5xx_alerts"],
    selectedBlockers: uniqueStrings([...runtimeBlockers, ...slsBlockers]),
    groups,
    candidates,
    writebackTemplate: {
      jsonPaths: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
      ],
      optionalNonSecretFields: [
        "acrImage",
        "imageDigest",
        "imagePullConfigured",
        "publicEndpoint",
        "runtimeRoleName",
        "envSecretSource",
        "logProject",
        "logstore",
        "healthAlertName",
        "serverErrorAlertName",
        "requestLogQuery",
        "dashboardName",
        "notificationChannel",
      ],
      requiredCompletionFields: [
        "items.runtime.confirmed=true",
        "items.runtime.provider=SAE",
        `items.runtime.containerPort=${EXPECTED_RUNTIME_CONTAINER_PORT}`,
        `items.runtime.healthPath=${EXPECTED_RUNTIME_HEALTH_PATH}`,
        "items.slsAlerts.confirmed=true",
        "items.slsAlerts.healthAlertConfigured=true",
        "items.slsAlerts.serverErrorAlertConfigured=true",
        "evidence=<non-secret runtime/log/alert evidence handle>",
      ],
    },
    safetyBoundary: [
      "Record only runtime names, image references, digest handles, endpoint names, role names, log project/logstore names, alert rule names, and booleans.",
      "Never store registry password, AccessKeySecret, RAM Secret, STS token, DATABASE_URL_CN value, database password, webhook token, AppSecret, or Supabase service role key.",
      "Do not mark SAE runtime ready until the deployed runtime actually uses the ACR image, secret env source, health check, and image pull authorization.",
    ],
  }
}

function cloudItemBlockers(key, item) {
  if (!item) return [`${key}.item_missing`]
  return item.blockers.map((blocker) => `${key}.${blocker}`)
}

function runtimeSlsWritebackTemplate(key) {
  const optionalNonSecretFields = key === "runtime"
    ? [
      "acrImage",
      "imageDigest",
      "imagePullConfigured",
      "publicEndpoint",
      "runtimeRoleName",
      "envSecretSource",
      "logProject",
      "logstore",
      "vpcId",
      "vswitchId",
      "securityGroupId",
      "cpu",
      "memory",
      "replicas",
      "autoScaling",
      "releaseStrategy",
    ]
    : [
      "region",
      "logstore",
      "healthAlertName",
      "serverErrorAlertName",
      "requestLogQuery",
      "dashboardName",
      "notificationChannel",
      "retentionDays",
    ]
  const requiredCompletionFields = key === "runtime"
    ? [
      "confirmed=true",
      "provider=SAE",
      `region=${EXPECTED_ALIYUN_REGION}`,
      `appName=${EXPECTED_SAE_APP_NAME}`,
      `containerPort=${EXPECTED_RUNTIME_CONTAINER_PORT}`,
      `healthPath=${EXPECTED_RUNTIME_HEALTH_PATH}`,
      "evidence=<non-secret SAE runtime evidence handle>",
    ]
    : [
      "confirmed=true",
      `slsProject=${EXPECTED_SLS_PROJECT}`,
      "healthAlertConfigured=true",
      "serverErrorAlertConfigured=true",
      "evidence=<non-secret SLS alert evidence handle>",
    ]
  return {
    jsonPath: `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.${key}`,
    optionalNonSecretFields,
    requiredCompletionFields,
  }
}

function buildEnvImportPlan(local) {
  const envItem = (local.items || []).find((item) => item.key === "envImport") || null
  const values = envItem?.nonSecretValues || {}
  const blockers = cloudItemBlockers("envImport", envItem)
  const readySecretBatchIds = values.readySecretBatchIds.length
    ? values.readySecretBatchIds
    : [...EXPECTED_READY_SECRET_BATCH_IDS]
  const rdsSecretImported = values.rdsSecretImported === true
  const defaultBlockedSecretBatchIds = rdsSecretImported
    ? ["BLOCKED_SECRET_BATCH_01_OSS_RAM_STS"]
    : [...EXPECTED_BLOCKED_SECRET_BATCH_IDS]
  const blockedSecretBatchIds = values.blockedSecretBatchIds.length
    ? values.blockedSecretBatchIds
    : (envItem?.ready === true ? [] : defaultBlockedSecretBatchIds)
  const blockedCredentialNames = values.blockedCredentialNames.length
    ? values.blockedCredentialNames
    : (rdsSecretImported ? [] : [...EXPECTED_BLOCKED_CREDENTIAL_NAMES])
  const readySecretEnvVariableCount = Number.isFinite(values.readySecretEnvVariableCount) && values.readySecretEnvVariableCount > 0
    ? values.readySecretEnvVariableCount
    : EXPECTED_READY_SECRET_ENV_VARIABLE_COUNT
  const readySecretEnvVariableGroupCount = Number.isFinite(values.readySecretEnvVariableGroupCount) && values.readySecretEnvVariableGroupCount > 0
    ? values.readySecretEnvVariableGroupCount
    : EXPECTED_READY_SECRET_ENV_GROUP_COUNT
  const importBatchCount = Number.isFinite(values.importBatchCount) && values.importBatchCount > 0
    ? values.importBatchCount
    : readySecretBatchIds.length + blockedSecretBatchIds.length
  const selectedMode = envItem?.ready === true
    ? "sae_kms_secret_env_import_confirmed"
    : "pending_secret_env_import_after_resource_dependencies"
  const candidates = [
    {
      id: "blocked_rds_database_url_secret",
      title: "Import DATABASE_URL_CN only after RDS PostgreSQL and migration evidence are ready",
      actionPacketId: "P11_ALIYUN_RDS_DATA_MIGRATION",
      sensitiveActionId: "S08_ALIYUN_RDS_DATABASE_URL",
      recommended: true,
      canUseNow: false,
      variableNames: ["DATABASE_URL_CN"],
      blockedCredentialNames: ["DATABASE_URL_CN"],
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
      blockers: [
        "rdsPostgres.confirmed",
        "rdsPostgres.databaseAccountReady",
        "rdsPostgres.databaseUrlCnSecretImported",
        "migration.schemaCompatibilityReviewed",
        "migration.appApiSmokeOnRdsPassed",
      ],
      writeBackFields: [
        "deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.databaseUrlCnSecretImported=true",
        "items.envImport.blockedCredentialNames=DATABASE_URL_CN",
        "items.envImport.rdsSecretImported=true",
        "items.envImport.secretNotInImage=true",
      ],
      requiredEvidence: [
        "RDS PostgreSQL instance/account is ready",
        "DATABASE_URL_CN value is imported only to the controlled Aliyun secret env target",
        "RDS migration compatibility, API smoke, and rollback evidence are complete",
      ],
    },
    {
      id: "blocked_oss_runtime_role_or_fallback_secret_env",
      title: "Confirm SAE RRSA/OIDC runtime role first, or import fallback RAM/STS credentials after least-privilege access is confirmed",
      actionPacketId: "P05_OSS_RAM_STS",
      sensitiveActionId: "S05_OSS_RAM_SECRET_OR_STS",
      recommended: true,
      canUseNow: false,
      variableNames: [
        "ALIBABA_CLOUD_ROLE_ARN",
        "ALIBABA_CLOUD_OIDC_PROVIDER_ARN",
        "ALIBABA_CLOUD_OIDC_TOKEN_FILE",
        "ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_SECRET",
        "ALIYUN_OSS_SECURITY_TOKEN",
      ],
      blockedCredentialNames: [],
      optionalVariableNames: ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIYUN_OSS_SECURITY_TOKEN"],
      plainEnvVariableNames: [
        "ALIBABA_CLOUD_ROLE_ARN",
        "ALIBABA_CLOUD_OIDC_PROVIDER_ARN",
        "ALIBABA_CLOUD_OIDC_TOKEN_FILE",
      ],
      fallbackSecretEnvVariableNames: ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIYUN_OSS_SECURITY_TOKEN"],
      preferredCredentialMode: "sae_runtime_role",
      importTarget: "preferred: SAE RRSA/OIDC runtime env; fallback only: KMS/Secrets Manager/SAE secret env",
      blockers: [
        "oss.confirmed",
        "oss.ramLeastPrivilege",
        "oss.accessMode",
        "SAE RRSA/OIDC runtime role or fallback STS/RAM path selected",
      ],
      writeBackFields: [
        "items.oss.accessMode=sae_runtime_role|sts_assume_role|least_privilege_ram_user_secret_env",
        "SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE when accessMode=sae_runtime_role",
        "items.oss.ramLeastPrivilege=true",
        "items.envImport.ossSecretsImported=true",
        "items.envImport.secretNotInImage=true",
      ],
      requiredEvidence: [
        "OSS bucket and service-record prefix are confirmed",
        "RAM policy is bound to the SAE RRSA/OIDC runtime role and limited to required OSS actions and resource scope",
        "sae_runtime_role path uses AssumeRoleWithOIDC and does not require long-lived OSS AccessKeySecret",
        "AccessKeySecret/RAM Secret/STS token values are not written to reports, images, shell history, or git",
      ],
    },
    {
      id: "ready_backend_secret_env_batches",
      title: "Import ready-by-name backend secrets after resource dependencies close",
      actionPacketId: "P06_ENV_IMPORT",
      sensitiveActionId: "S06_READY_SENSITIVE_ENV_IMPORT",
      recommended: true,
      canUseNow: false,
      readySecretEnvVariableCount,
      readySecretEnvVariableGroupCount,
      readySecretBatchIds,
      importTarget: "阿里云 KMS/Secrets Manager/SAE secret env",
      blockers: [
        "DATABASE_URL_CN",
        "OSS RAM/STS access path",
        "ACR image and SAE runtime target",
        "action-time confirmation",
      ],
      writeBackFields: [
        `items.envImport.readySecretEnvVariableCount=${readySecretEnvVariableCount}`,
        `items.envImport.readySecretEnvVariableGroupCount=${readySecretEnvVariableGroupCount}`,
        `items.envImport.readySecretBatchIds=${readySecretBatchIds.join(",")}`,
        "items.envImport.readySecretsImported=true",
        "items.envImport.confirmed=true",
        "items.envImport.secretNotInImage=true",
      ],
      requiredEvidence: [
        "Ready-by-name variable values are re-read from their controlled source at import time",
        "Values enter only KMS/Secrets Manager/SAE secret env or plain env for non-secret identifiers",
        "No secret values are written to git, JSON, Markdown, Docker images, App bundles, or shell history",
      ],
    },
  ]
  return {
    ready: envItem?.ready === true,
    selectedMode,
    selectedBlockers: blockers,
    importTarget: values.target || "SAE/KMS/SecretsManager",
    secretEnvStore: values.secretEnvStore || "KMS/SecretsManager/SAE secret env",
    secretEnvScope: values.secretEnvScope || "backend_aliyun_only",
    blockedCredentialNames,
    readySecretEnvVariableCount,
    readySecretEnvVariableGroupCount,
    blockedSecretBatchIds,
    readySecretBatchIds,
    importBatchCount,
    recommendedModeIds: [
      "blocked_rds_database_url_secret",
      "blocked_oss_runtime_role_or_fallback_secret_env",
      "ready_backend_secret_env_batches",
    ],
    candidates,
    writebackTemplate: {
      jsonPath: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
      optionalNonSecretFields: [
        "importMode",
        "secretEnvStore",
        "secretEnvScope",
        "readySecretEnvVariableCount",
        "readySecretEnvVariableGroupCount",
        "blockedCredentialNames",
        "blockedSecretBatchIds",
        "readySecretBatchIds",
        "importBatchCount",
        "rdsSecretImported",
        "ossSecretsImported",
        "readySecretsImported",
        "imageContainsSecrets",
        "deferredAppLaunchExcluded",
        "importBatchEvidence",
      ],
      requiredCompletionFields: [
        "confirmed=true",
        "secretNotInImage=true",
        "importedAt=<actual import time or evidence handle>",
        "evidence=<non-secret env import evidence handle>",
      ],
    },
    safetyBoundary: [
      "Record only variable names, batch ids, counts, booleans, timestamps, and non-secret evidence handles.",
      "Never store DATABASE_URL_CN value, database password, AccessKeySecret, RAM Secret, STS token, registry password, AppSecret, webhook token, Supabase service role key, or API keys in reports, images, shell history, or git.",
      "Do not mark env import ready until RDS, OSS/RAM/STS, ACR image, SAE runtime, and action-time confirmation are complete.",
    ],
  }
}

function buildOssAccessPlan(local) {
  const ossItem = (local.items || []).find((item) => item.key === "oss") || null
  const values = ossItem?.nonSecretValues || {}
  const bucketReady = values.bucket === EXPECTED_OSS_BUCKET
  const regionReady = values.region === EXPECTED_ALIYUN_REGION
  const prefixReady = values.serviceRecordPrefix === EXPECTED_OSS_SERVICE_RECORD_PREFIX
  const corsReady = values.corsConfigured === true
  const confirmedReady = values.confirmed === true
  const leastPrivilegeReady = values.ramLeastPrivilege === true
  const selectedReady = confirmedReady && leastPrivilegeReady && bucketReady && regionReady && prefixReady && corsReady
  const accessMode = values.accessMode && !isTodoText(values.accessMode) && !isPendingPlaceholderText(values.accessMode)
    ? values.accessMode
    : ""
  const selectedMode = accessMode || (selectedReady
    ? "confirmed_least_privilege"
    : "pending_choose_sae_runtime_role_or_sts")
  const resourceBlockers = [
    confirmedReady ? "" : "oss.confirmed",
    bucketReady ? "" : `oss.bucket=${EXPECTED_OSS_BUCKET}`,
    regionReady ? "" : `oss.region=${EXPECTED_ALIYUN_REGION}`,
    corsReady ? "" : "oss.corsConfigured",
    prefixReady ? "" : `oss.serviceRecordPrefix=${EXPECTED_OSS_SERVICE_RECORD_PREFIX}`,
  ].filter(Boolean)
  const accessBlockers = leastPrivilegeReady ? [] : ["oss.ramLeastPrivilege"]
  const sharedPolicy = {
    policyFile: "deploy/aliyun-production-cn.oss-ram-policy.json",
    allowedActions: ["oss:GetObject", "oss:PutObject", "oss:PostObject"],
    resourceScope: `acs:oss:*:*:${EXPECTED_OSS_BUCKET}/${EXPECTED_OSS_SERVICE_RECORD_PREFIX}/*`,
  }
  const runtimePrefixContract = buildOssRuntimePrefixContract({ prefixReady, resourceScope: sharedPolicy.resourceScope })
  const candidateBlockers = uniqueStrings([...resourceBlockers, ...accessBlockers])
  const candidates = [
    {
      id: "sae_runtime_role",
      title: "Use SAE RRSA/OIDC runtime role for OSS signing",
      preferredOrder: 1,
      recommended: true,
      canUseNow: selectedReady,
      blockers: candidateBlockers,
      credentialHandling: "no long-lived OSS AccessKeySecret in repository or image; SAE RRSA/OIDC runtime identity evidence only",
      secretEnvNames: [],
      writeBackFields: [
        "items.oss.accessMode=sae_runtime_role",
        "items.oss.roleOrUserName=<SAE RRSA/OIDC runtime role name>",
        "items.oss.policyName=MeiyeHuajingServiceRecordsOssPolicy",
        "items.oss.secretEnvNames=[]",
        "items.oss.credentialBoundary=runtime_role_no_long_lived_secret",
        "items.oss.ramLeastPrivilege=true",
        "items.oss.confirmed=true",
        "SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE",
      ],
      requiredEvidence: [
        "RAM policy is bound to the SAE RRSA/OIDC runtime role",
        "SAE runtime exposes ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE",
        "oss.ramLeastPrivilege=true",
        "non-secret role/policy evidence handle recorded in items.oss.evidence",
      ],
      ...sharedPolicy,
    },
    {
      id: "sts_assume_role",
      title: "Use STS temporary credentials for OSS signing",
      preferredOrder: 2,
      recommended: true,
      canUseNow: selectedReady,
      blockers: candidateBlockers,
      credentialHandling: "STS token is secret material and may enter only KMS/Secrets Manager/SAE secret env",
      secretEnvNames: ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIYUN_OSS_SECURITY_TOKEN"],
      writeBackFields: [
        "items.oss.accessMode=sts_assume_role",
        "items.oss.roleOrUserName=<RAM role used to issue STS credentials>",
        "items.oss.policyName=MeiyeHuajingServiceRecordsOssPolicy",
        "items.oss.secretEnvNames=ALIYUN_OSS_ACCESS_KEY_ID,ALIYUN_OSS_ACCESS_KEY_SECRET,ALIYUN_OSS_SECURITY_TOKEN",
        "items.oss.credentialBoundary=sts_token_secret_env_only",
        "items.oss.ramLeastPrivilege=true",
        "items.oss.confirmed=true",
      ],
      requiredEvidence: [
        "STS role is limited to the OSS policy scope",
        "ALIYUN_OSS_SECURITY_TOKEN is imported only if temporary STS credentials are selected",
        "no STS token value is written to JSON, Markdown, image, shell history, or git",
      ],
      ...sharedPolicy,
    },
    {
      id: "least_privilege_ram_user_secret_env",
      title: "Use a dedicated least-privilege RAM AccessKey through secret env",
      preferredOrder: 3,
      recommended: false,
      canUseNow: selectedReady,
      blockers: candidateBlockers,
      credentialHandling: "fallback only; AccessKeySecret must be imported to KMS/Secrets Manager/SAE secret env",
      secretEnvNames: ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET"],
      writeBackFields: [
        "items.oss.accessMode=least_privilege_ram_user_secret_env",
        "items.oss.roleOrUserName=<dedicated RAM user or key owner>",
        "items.oss.policyName=MeiyeHuajingServiceRecordsOssPolicy",
        "items.oss.secretEnvNames=ALIYUN_OSS_ACCESS_KEY_ID,ALIYUN_OSS_ACCESS_KEY_SECRET",
        "items.oss.credentialBoundary=access_key_secret_env_only",
        "items.oss.ramLeastPrivilege=true",
        "items.oss.confirmed=true",
      ],
      requiredEvidence: [
        "dedicated RAM user or key is bound only to the OSS policy scope",
        "ALIYUN_OSS_ACCESS_KEY_SECRET is imported through controlled secret env",
        "no AccessKeySecret value is written to JSON, Markdown, image, shell history, or git",
      ],
      ...sharedPolicy,
    },
  ]
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedMode) || null
  const executionReadiness = buildOssExecutionReadiness({
    selectedMode,
    selectedReady,
    resourceBlockers,
    accessBlockers,
    candidateBlockers,
    candidates,
  })
  return {
    selectedMode,
    selectedReady,
    selectedBlockers: candidateBlockers,
    executionReadiness,
    bucket: values.bucket || EXPECTED_OSS_BUCKET,
    region: values.region || EXPECTED_ALIYUN_REGION,
    serviceRecordPrefix: values.serviceRecordPrefix || EXPECTED_OSS_SERVICE_RECORD_PREFIX,
    runtimePrefixContract,
    policyFile: sharedPolicy.policyFile,
    policyName: values.policyName || "MeiyeHuajingServiceRecordsOssPolicy",
    roleOrUserName: values.roleOrUserName || "",
    selectedSecretEnvNames: values.secretEnvNames,
    credentialBoundary: values.credentialBoundary || "",
    allowedActions: sharedPolicy.allowedActions,
    resourceScope: sharedPolicy.resourceScope,
    recommendedModeIds: candidates.filter((candidate) => candidate.recommended).map((candidate) => candidate.id),
    selectedModeWriteBackFields: selectedCandidate?.writeBackFields || [],
    candidates,
    writebackTemplate: {
      jsonPath: "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
      optionalNonSecretFields: [
        "accessMode",
        "roleOrUserName",
        "policyName",
        "secretEnvNames",
        "credentialBoundary",
      ],
      requiredCompletionFields: [
        "confirmed=true",
        "ramLeastPrivilege=true",
        "evidence=<non-secret role/policy/binding evidence handle>",
      ],
      modeIds: candidates.map((candidate) => candidate.id),
      selectedModeWriteBackFields: selectedCandidate?.writeBackFields || [],
    },
    safetyBoundary: [
      "Record only bucket, region, prefix, booleans, policy name/path, role/user name, and non-secret evidence handles.",
      "Never store AccessKeySecret, RAM Secret, STS token, cookies, AppSecret, registry password, or Supabase service role key.",
      "ALIYUN_OSS_SECURITY_TOKEN is optional and only belongs in secret env when temporary STS credentials are selected.",
    ],
  }
}

function buildOssRuntimePrefixContract({ prefixReady, resourceScope }) {
  return {
    requiredEnvName: "SERVICE_RECORD_OSS_PREFIX",
    expectedValue: EXPECTED_OSS_SERVICE_RECORD_PREFIX,
    codeDefaultWithoutEnv: "service-records",
    policyScope: resourceScope,
    policyScopeCoversExpectedPrefix: resourceScope.endsWith(`/${EXPECTED_OSS_SERVICE_RECORD_PREFIX}/*`),
    currentConfirmationPrefixReady: prefixReady === true,
    importTarget: "阿里云 SAE plain env",
    reason: "服务记录上传 objectKey 由 SERVICE_RECORD_OSS_PREFIX 参与生成；生产环境必须显式使用 service-records/production-cn，才能被最小权限 RAM policy 覆盖。",
    postActionWritebackFields: [
      `items.oss.serviceRecordPrefix=${EXPECTED_OSS_SERVICE_RECORD_PREFIX}`,
      "SAE plain env SERVICE_RECORD_OSS_PREFIX=service-records/production-cn",
    ],
    safetyBoundary: [
      "SERVICE_RECORD_OSS_PREFIX is non-secret and may be recorded as a name/value contract.",
      "Do not widen the RAM policy to bucket-wide access just to mask a prefix mismatch.",
      "Do not record AccessKeySecret, RAM Secret, STS token, cookies, registry password, or AppSecret.",
    ],
  }
}

function buildOssExecutionReadiness({
  selectedMode,
  selectedReady,
  resourceBlockers,
  accessBlockers,
  candidateBlockers,
  candidates,
}) {
  const recommendedModeIds = candidates.filter((candidate) => candidate.recommended).map((candidate) => candidate.id)
  const preferredModeId = "sae_runtime_role"
  const preferredMode = candidates.find((candidate) => candidate.id === preferredModeId) || null
  const fallbackSecretModeIds = candidates
    .filter((candidate) => candidate.id !== preferredModeId && candidate.secretEnvNames.length > 0)
    .map((candidate) => candidate.id)
  const fallbackSecretEnvNames = uniqueStrings(
    candidates
      .filter((candidate) => fallbackSecretModeIds.includes(candidate.id))
      .flatMap((candidate) => candidate.secretEnvNames),
  )
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedMode) || null
  const resourceReadyForP05 = resourceBlockers.filter((blocker) => blocker !== "oss.confirmed").length === 0
  const canStartP05AfterActionTimeConfirmation = selectedReady !== true && resourceReadyForP05
  return {
    ready: selectedReady,
    canStartP05AfterActionTimeConfirmation,
    resourceReadyForP05,
    accessGrantReady: accessBlockers.length === 0,
    selectedMode,
    selectedModeReady: selectedReady,
    selectedModeRequiresSecretEnv: Boolean(selectedCandidate?.secretEnvNames?.length),
    preferredModeId,
    preferredModeAvoidsLongLivedSecret: preferredMode?.secretEnvNames?.length === 0,
    recommendedModeIds,
    fallbackSecretModeIds,
    fallbackSecretEnvNames,
    remainingBlockers: candidateBlockers,
    nextOperatorDecision: selectedReady
      ? "preserve_oss_access_ready_state_with_strict_verification"
      : "choose_sae_runtime_role_or_sts_then_bind_least_privilege_policy",
    postActionWritebackFields: [
      "items.oss.accessMode=sae_runtime_role|sts_assume_role|least_privilege_ram_user_secret_env",
      "items.oss.roleOrUserName=<SAE RRSA/OIDC runtime role, RAM role, or dedicated RAM user name>",
      "items.oss.policyName=MeiyeHuajingServiceRecordsOssPolicy",
      "items.oss.secretEnvNames=[] for sae_runtime_role, or controlled secret env names for STS/RAM fallback",
      "items.oss.credentialBoundary=runtime_role_no_long_lived_secret|sts_token_secret_env_only|access_key_secret_env_only",
      "SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE when accessMode=sae_runtime_role",
      "items.oss.ramLeastPrivilege=true",
      "items.oss.confirmed=true",
      "items.oss.evidence=<non-secret role/policy/binding evidence handle>",
    ],
    verificationCommands: [
      "corepack pnpm aliyun:oss:runtime-access:strict",
      "corepack pnpm aliyun:cloud:confirmations:backend:strict",
      "corepack pnpm aliyun:sensitive:blockers:backend",
      "corepack pnpm aliyun:backend-cn:status",
    ],
    safetyBoundary: [
      "Prefer SAE RRSA/OIDC runtime role so no long-lived OSS AccessKeySecret is needed.",
      "Use STS or dedicated RAM user only as fallback, and put secret values only into KMS/Secrets Manager/SAE secret env.",
      "Record only role/user names, policy name, allowed actions, resource scope, booleans, and non-secret evidence handles.",
      "Never write AccessKeySecret, RAM Secret, STS token, cookies, AppSecret, registry password, or Supabase service role key.",
    ],
  }
}

function buildDomainHttpsPlan(local) {
  const itemsByKey = new Map((local.items || []).map((item) => [item.key, item]))
  const apiItem = itemsByKey.get("apiDomainHttps") || null
  const assetItem = itemsByKey.get("assetDomainHttps") || null
  const apiValues = apiItem?.nonSecretValues || {}
  const assetValues = assetItem?.nonSecretValues || {}
  const apiBlockers = domainItemBlockers("apiDomainHttps", apiItem)
  const assetBlockers = domainItemBlockers("assetDomainHttps", assetItem)
  const apiMode = usableDomainMode(apiValues.ingressType, "pending_sae_runtime_public_endpoint")
  const assetMode = usableDomainMode(assetValues.ingressType, "pending_choose_cdn_or_oss_custom_domain")
  const candidates = [
    {
      id: "api_sae_custom_domain",
      itemKey: "apiDomainHttps",
      title: "Bind api-cn to the SAE production-cn public endpoint",
      recommended: true,
      targetHost: EXPECTED_API_HOST,
      dnsRecordName: "api-cn",
      recordType: "CNAME_OR_A",
      ingressType: "sae_custom_domain",
      consolePaths: [
        "SAE -> 应用 -> meiye-huajing-app-api-production-cn -> 访问方式/自定义域名",
        "云解析 DNS -> ipgongchang.xin -> 解析设置",
        "数字证书管理服务 -> SSL 证书",
        "ICP备案 -> ipgongchang.xin 备案状态",
      ],
      canUseNow: apiItem?.ready === true,
      blockers: apiBlockers,
      writeBackFields: [
        `items.apiDomainHttps.host=${EXPECTED_API_HOST}`,
        "items.apiDomainHttps.dnsProvider=Alibaba Cloud DNS",
        "items.apiDomainHttps.recordName=api-cn",
        "items.apiDomainHttps.recordType=CNAME_OR_A",
        "items.apiDomainHttps.recordValue=<SAE/SLB/API gateway public endpoint>",
        "items.apiDomainHttps.ingressType=sae_custom_domain",
        "items.apiDomainHttps.certificateId=<Aliyun certificate id or certificate evidence id>",
        `items.apiDomainHttps.httpsProbeUrl=https://${EXPECTED_API_HOST}/api/healthz`,
        "items.apiDomainHttps.icpEntity=<ICP主体或备案证据编号>",
        "items.apiDomainHttps.dnsResolvedToAliyun=true",
        "items.apiDomainHttps.httpsEnabled=true",
        "items.apiDomainHttps.icpReady=true",
        "items.apiDomainHttps.confirmed=true",
      ],
      requiredEvidence: [
        "api-cn has an explicit DNS record and no longer falls through to wildcard/special-use placeholder records",
        "DNS resolves to an Aliyun-owned public ingress for the backend runtime",
        `https://${EXPECTED_API_HOST}/api/healthz succeeds after deployment`,
        "ICP readiness evidence is recorded without certificate private keys or secrets",
      ],
    },
    {
      id: "asset_cdn_custom_domain",
      itemKey: "assetDomainHttps",
      title: "Serve assets-cn through CDN in front of OSS",
      recommended: true,
      targetHost: EXPECTED_ASSET_HOST,
      dnsRecordName: "assets-cn",
      recordType: "CNAME",
      ingressType: "cdn_custom_domain",
      consolePaths: [
        "CDN -> 域名管理 -> 添加 assets-cn.ipgongchang.xin",
        "OSS -> bucket -> 传输管理/域名管理",
        "云解析 DNS -> ipgongchang.xin -> 解析设置",
        "数字证书管理服务 -> SSL 证书",
        "ICP备案 -> ipgongchang.xin 备案状态",
      ],
      canUseNow: assetItem?.ready === true,
      blockers: assetBlockers,
      writeBackFields: [
        `items.assetDomainHttps.host=${EXPECTED_ASSET_HOST}`,
        "items.assetDomainHttps.dnsProvider=Alibaba Cloud DNS",
        "items.assetDomainHttps.recordName=assets-cn",
        "items.assetDomainHttps.recordType=CNAME",
        "items.assetDomainHttps.recordValue=<CDN CNAME endpoint>",
        "items.assetDomainHttps.ingressType=cdn_custom_domain",
        "items.assetDomainHttps.certificateId=<Aliyun certificate id or certificate evidence id>",
        `items.assetDomainHttps.httpsProbeUrl=https://${EXPECTED_ASSET_HOST}/`,
        "items.assetDomainHttps.icpEntity=<ICP主体或备案证据编号>",
        "items.assetDomainHttps.dnsResolvedToAliyun=true",
        "items.assetDomainHttps.httpsEnabled=true",
        "items.assetDomainHttps.icpReady=true",
        "items.assetDomainHttps.confirmed=true",
      ],
      requiredEvidence: [
        "assets-cn has an explicit DNS record and no longer falls through to wildcard/special-use placeholder records",
        "CDN is bound to the OSS origin or intended asset origin",
        `https://${EXPECTED_ASSET_HOST}/ is reachable with the bound certificate`,
        "ICP readiness evidence is recorded without certificate private keys or secrets",
      ],
    },
    {
      id: "asset_oss_custom_domain",
      itemKey: "assetDomainHttps",
      title: "Bind assets-cn directly to OSS custom domain",
      recommended: false,
      targetHost: EXPECTED_ASSET_HOST,
      dnsRecordName: "assets-cn",
      recordType: "CNAME",
      ingressType: "oss_custom_domain",
      consolePaths: [
        "OSS -> bucket -> 域名管理 -> 绑定自定义域名",
        "云解析 DNS -> ipgongchang.xin -> 解析设置",
        "数字证书管理服务 -> SSL 证书",
        "ICP备案 -> ipgongchang.xin 备案状态",
      ],
      canUseNow: assetItem?.ready === true,
      blockers: assetBlockers,
      writeBackFields: [
        `items.assetDomainHttps.host=${EXPECTED_ASSET_HOST}`,
        "items.assetDomainHttps.dnsProvider=Alibaba Cloud DNS",
        "items.assetDomainHttps.recordName=assets-cn",
        "items.assetDomainHttps.recordType=CNAME",
        "items.assetDomainHttps.recordValue=<OSS custom domain CNAME endpoint>",
        "items.assetDomainHttps.ingressType=oss_custom_domain",
        "items.assetDomainHttps.certificateId=<Aliyun certificate id or certificate evidence id>",
        `items.assetDomainHttps.httpsProbeUrl=https://${EXPECTED_ASSET_HOST}/`,
        "items.assetDomainHttps.icpEntity=<ICP主体或备案证据编号>",
        "items.assetDomainHttps.dnsResolvedToAliyun=true",
        "items.assetDomainHttps.httpsEnabled=true",
        "items.assetDomainHttps.icpReady=true",
        "items.assetDomainHttps.confirmed=true",
      ],
      requiredEvidence: [
        "assets-cn has an explicit DNS record and no longer falls through to wildcard/special-use placeholder records",
        "OSS custom domain binding points to the production-cn bucket or intended asset origin",
        `https://${EXPECTED_ASSET_HOST}/ is reachable with the bound certificate`,
        "ICP readiness evidence is recorded without certificate private keys or secrets",
      ],
    },
  ]
  const groups = {
    apiDomainHttps: {
      selectedMode: apiMode,
      targetHost: apiValues.host || EXPECTED_API_HOST,
      ready: apiItem?.ready === true,
      blockers: apiBlockers,
      recommendedModeIds: ["api_sae_custom_domain"],
      candidates: candidates.filter((candidate) => candidate.itemKey === "apiDomainHttps"),
      writebackTemplate: domainWritebackTemplate("apiDomainHttps"),
    },
    assetDomainHttps: {
      selectedMode: assetMode,
      targetHost: assetValues.host || EXPECTED_ASSET_HOST,
      ready: assetItem?.ready === true,
      blockers: assetBlockers,
      recommendedModeIds: ["asset_cdn_custom_domain"],
      candidates: candidates.filter((candidate) => candidate.itemKey === "assetDomainHttps"),
      writebackTemplate: domainWritebackTemplate("assetDomainHttps"),
    },
  }
  return {
    ready: groups.apiDomainHttps.ready && groups.assetDomainHttps.ready,
    selectedModes: {
      apiDomainHttps: groups.apiDomainHttps.selectedMode,
      assetDomainHttps: groups.assetDomainHttps.selectedMode,
    },
    targetHosts: {
      apiDomainHttps: EXPECTED_API_HOST,
      assetDomainHttps: EXPECTED_ASSET_HOST,
    },
    recommendedModeIds: ["api_sae_custom_domain", "asset_cdn_custom_domain"],
    selectedBlockers: uniqueStrings([...apiBlockers, ...assetBlockers]),
    groups,
    candidates,
    writebackTemplate: {
      jsonPaths: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
      ],
      optionalNonSecretFields: [
        "dnsProvider",
        "recordType",
        "recordName",
        "recordValue",
        "ingressType",
        "certificateId",
        "certificateEvidence",
        "icpEntity",
        "icpEvidence",
        "httpsProbeUrl",
      ],
      requiredCompletionFields: [
        "confirmed=true",
        "dnsResolvedToAliyun=true",
        "httpsEnabled=true",
        "icpReady=true",
        "evidence=<non-secret DNS/cert/ICP evidence handle>",
      ],
    },
    safetyBoundary: [
      "Record only host names, DNS record metadata, Aliyun endpoint names, certificate ids/evidence handles, ICP evidence handles, and booleans.",
      "Never store certificate private keys, AccessKeySecret, registry password, RAM Secret, STS token, cookies, AppSecret, or Supabase service role key.",
      "Do not mark domains ready while they still resolve through wildcard/special-use placeholder records.",
    ],
  }
}

function domainItemBlockers(key, item) {
  if (!item) return [`${key}.item_missing`]
  return item.blockers.map((blocker) => `${key}.${blocker}`)
}

function usableDomainMode(value, fallback) {
  const mode = text(value)
  return mode && !isTodoText(mode) && !isPendingPlaceholderText(mode) ? mode : fallback
}

function domainWritebackTemplate(key) {
  return {
    jsonPath: `deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.${key}`,
    optionalNonSecretFields: [
      "dnsProvider",
      "recordType",
      "recordName",
      "recordValue",
      "ingressType",
      "certificateId",
      "certificateEvidence",
      "icpEntity",
      "icpEvidence",
      "httpsProbeUrl",
    ],
    requiredCompletionFields: [
      "confirmed=true",
      "dnsResolvedToAliyun=true",
      "httpsEnabled=true",
      "icpReady=true",
      "evidence=<non-secret DNS/cert/ICP evidence handle>",
    ],
  }
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

function buildCloudConfirmationWritebackPlan(
  local,
  ossAccessPlan = buildOssAccessPlan(local),
  domainHttpsPlan = buildDomainHttpsPlan(local),
  runtimeSlsPlan = buildRuntimeSlsPlan(local),
  envImportPlan = buildEnvImportPlan(local),
) {
  const currentScope = local.currentScope || "full_app_launch"
  const commands = cloudConfirmationCommandsForScope(currentScope)
  const groups = (local.items || []).map((item) => {
    const metadata = CLOUD_CONFIRMATION_GROUP_METADATA[item.key] || {}
    const requiredAuthorizationPackets = uniqueStrings(
      item.blockers.flatMap((blocker) => authorizationPacketsForBlocker(item.key, blocker)),
    )
    const group = {
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
    if (item.key === "oss") {
      return {
        ...group,
        ossAccessPlan: {
          selectedMode: ossAccessPlan.selectedMode,
          selectedReady: ossAccessPlan.selectedReady,
          selectedBlockers: ossAccessPlan.selectedBlockers,
          executionReadiness: ossAccessPlan.executionReadiness,
          recommendedModeIds: ossAccessPlan.recommendedModeIds,
          policyFile: ossAccessPlan.policyFile,
          policyName: ossAccessPlan.policyName,
          roleOrUserName: ossAccessPlan.roleOrUserName,
          selectedSecretEnvNames: ossAccessPlan.selectedSecretEnvNames,
          credentialBoundary: ossAccessPlan.credentialBoundary,
          allowedActions: ossAccessPlan.allowedActions,
          resourceScope: ossAccessPlan.resourceScope,
          writebackTemplate: ossAccessPlan.writebackTemplate,
          candidates: ossAccessPlan.candidates,
        },
      }
    }
    if (item.key === "apiDomainHttps" || item.key === "assetDomainHttps") {
      const domainPlan = domainHttpsPlan.groups[item.key]
      return {
        ...group,
        domainHttpsPlan: {
          selectedMode: domainPlan.selectedMode,
          targetHost: domainPlan.targetHost,
          ready: domainPlan.ready,
          blockers: domainPlan.blockers,
          recommendedModeIds: domainPlan.recommendedModeIds,
          writebackTemplate: domainPlan.writebackTemplate,
          candidates: domainPlan.candidates,
        },
      }
    }
    if (item.key === "runtime" || item.key === "slsAlerts") {
      const runtimePlan = runtimeSlsPlan.groups[item.key]
      return {
        ...group,
        runtimeSlsPlan: {
          selectedMode: runtimePlan.selectedMode,
          targetAppName: runtimePlan.targetAppName,
          targetProject: runtimePlan.targetProject,
          targetLogstore: runtimePlan.targetLogstore,
          ready: runtimePlan.ready,
          blockers: runtimePlan.blockers,
          recommendedModeIds: runtimePlan.recommendedModeIds,
          writebackTemplate: runtimePlan.writebackTemplate,
          candidates: runtimePlan.candidates,
        },
      }
    }
    if (item.key === "envImport") {
      return {
        ...group,
        envImportPlan: {
          selectedMode: envImportPlan.selectedMode,
          ready: envImportPlan.ready,
          selectedBlockers: envImportPlan.selectedBlockers,
          blockedCredentialNames: envImportPlan.blockedCredentialNames,
          readySecretEnvVariableCount: envImportPlan.readySecretEnvVariableCount,
          readySecretEnvVariableGroupCount: envImportPlan.readySecretEnvVariableGroupCount,
          blockedSecretBatchIds: envImportPlan.blockedSecretBatchIds,
          readySecretBatchIds: envImportPlan.readySecretBatchIds,
          importBatchCount: envImportPlan.importBatchCount,
          recommendedModeIds: envImportPlan.recommendedModeIds,
          writebackTemplate: envImportPlan.writebackTemplate,
          candidates: envImportPlan.candidates,
        },
      }
    }
    return group
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
  const ossAccessPlan = buildOssAccessPlan(local)
  const domainHttpsPlan = buildDomainHttpsPlan(local)
  const runtimeSlsPlan = buildRuntimeSlsPlan(local)
  const envImportPlan = buildEnvImportPlan(local)
  const writebackPlan = buildCloudConfirmationWritebackPlan(
    local,
    ossAccessPlan,
    domainHttpsPlan,
    runtimeSlsPlan,
    envImportPlan,
  )
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
    ossAccessPlan,
    domainHttpsPlan,
    runtimeSlsPlan,
    envImportPlan,
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
