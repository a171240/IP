#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const APP_ROOT = resolve(WORKSPACE_ROOT, "meiye-huajing-app")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

const REQUIRED_ENV_KEYS = [
  "APP_ENV",
  "APP_REGION",
  "APP_API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WECHAT_LOGIN_SECRET",
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "SERVICE_RECORD_OSS_PREFIX",
  "DASHSCOPE_API_KEY",
  "BAILIAN_ASR_MODEL",
  "SERVICE_RECORD_ASR_PROVIDER",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "VOLC_SPEECH_APP_ID",
  "VOLC_SPEECH_ACCESS_TOKEN",
]

const OPTIONAL_ENV_KEYS = [
  "APP_ASSET_BASE_URL",
  "PRIVACY_POLICY_URL",
  "TERMS_URL",
  "DATABASE_URL_CN",
  "REDIS_URL_CN",
  "BAILIAN_ASR_LANGUAGE_HINTS",
  "BAILIAN_ASR_DIARIZATION_ENABLED",
  "BAILIAN_ASR_SPEAKER_COUNT",
  "BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS",
  "SERVICE_RECORD_DEEPSEEK_API_KEY",
  "SERVICE_RECORD_DEEPSEEK_BASE_URL",
  "SERVICE_RECORD_DEEPSEEK_MODEL",
  "VOLC_SPEECH_SECRET_KEY",
  "VOLC_ASR_RESOURCE_ID",
  "VOLC_ASR_FLASH_RESOURCE_ID",
  "VOLC_TTS_CLUSTER",
  "VOLC_TTS_VOICE_TYPE",
  "VOLC_TTS_LANGUAGE",
  "VOICE_COACH_ENABLED",
  "VOICE_COACH_ALLOW_USER_IDS",
  "VOICE_COACH_MAX_TURNS",
  "VOICE_COACH_REPLY_PROVIDER",
  "VOICE_COACH_ANALYSIS_PROVIDER",
  "VOICE_COACH_FIRST_TURN_MODE",
  "VOICE_COACH_FIRST_TTS_MODE",
  "CRON_SECRET",
  "CREDITS_IP_SALT",
  "ADMIN_EMAILS",
  "ADMIN_USER_IDS",
  "WECHAT_OPEN_APP_REVIEW_STATUS",
  "APIMART_API_KEY",
  "APIMART_BASE_URL",
  "APIMART_MODEL",
  "APIMART_IMAGE_API_KEY",
  "APIMART_IMAGE_BASE_URL",
  "APIMART_IMAGE_MODEL",
  "WECHAT_MINI_APPID",
  "WECHAT_MINI_SECRET",
]

const REQUIRED_BACKEND_FILES = [
  "Dockerfile",
  ".dockerignore",
  "package.json",
  "pnpm-lock.yaml",
  "app/api/app/health/route.ts",
  "app/api/healthz/route.ts",
  "scripts/prepare-aliyun-runtime-env.mjs",
  "scripts/check-app-api-production-cn-routes.mjs",
  "scripts/check-aliyun-docker-context.mjs",
  "scripts/prepare-aliyun-release-artifacts.mjs",
  "scripts/run-aliyun-predeploy.mjs",
  "scripts/smoke-aliyun-health.mjs",
  "scripts/smoke-app-api-production-cn.mjs",
  "scripts/smoke-aliyun-remote.mjs",
]

const REQUIRED_BACKEND_SCRIPTS = [
  "aliyun:env:check",
  "aliyun:env:plan",
  "aliyun:cloud:check",
  "aliyun:readiness",
  "aliyun:readiness:strict",
  "aliyun:readiness:cloud-ready",
  "aliyun:readiness:assume-cloud-ready",
  "aliyun:release:artifacts",
  "aliyun:routes:check",
  "aliyun:docker:check",
  "aliyun:predeploy",
  "aliyun:docker:build",
  "aliyun:health:smoke",
  "aliyun:remote:smoke",
  "aliyun:app-api:smoke",
]

const REQUIRED_APP_FILES = [
  "package.json",
  "scripts/generate-app-runtime-config.mjs",
  "src/config/bootstrap.ts",
  "src/config/build-config.generated.ts",
]

const REQUIRED_APP_SCRIPTS = [
  "config:generate:production-cn",
  "android:assemble:production-cn",
]

const CLOUD_CONFIRMATION_ITEMS = [
  {
    key: "runtime",
    label: "阿里云 SAE 或 ECS 容器应用已创建，运行端口 3000",
    requiredFields: ["provider", "region", "appName", "containerPort", "evidence"],
    validate: (item) => {
      const missing = []
      if (!["SAE", "ECS"].includes(String(item.provider || "").trim())) missing.push("provider")
      if (Number(item.containerPort) !== 3000) missing.push("containerPort=3000")
      return missing
    },
  },
  {
    key: "apiDomainHttps",
    label: "api-cn 域名已备案、解析到阿里云入口并配置 HTTPS",
    requiredFields: ["host", "dnsResolvedToAliyun", "httpsEnabled", "icpReady", "evidence"],
    validate: (item) => {
      const missing = []
      const host = String(item.host || "").trim()
      if (!host.startsWith("api-cn.")) missing.push("host_api_cn")
      if (item.dnsResolvedToAliyun !== true) missing.push("dnsResolvedToAliyun")
      if (item.httpsEnabled !== true) missing.push("httpsEnabled")
      if (item.icpReady !== true) missing.push("icpReady")
      return missing
    },
  },
  {
    key: "oss",
    label: "OSS Bucket CORS、RAM 最小权限和服务记录音频前缀已确认",
    requiredFields: ["bucket", "region", "corsConfigured", "ramLeastPrivilege", "serviceRecordPrefix", "evidence"],
    validate: (item) => {
      const missing = []
      if (item.corsConfigured !== true) missing.push("corsConfigured")
      if (item.ramLeastPrivilege !== true) missing.push("ramLeastPrivilege")
      return missing
    },
  },
  {
    key: "wechatOpenPlatform",
    label: "微信开放平台移动应用审核已通过，并已取得 AppID/AppSecret、Android 包名/签名、iOS Bundle ID/Universal Link 配置",
    requiredFields: [
      "reviewStatus",
      "mobileAppIdReady",
      "mobileAppSecretReady",
      "androidConfigured",
      "iosConfigured",
      "evidence",
    ],
    validate: (item) => {
      const missing = []
      if (String(item.reviewStatus || "").trim() !== "approved") missing.push("reviewStatus=approved")
      if (item.mobileAppIdReady !== true) missing.push("mobileAppIdReady")
      if (item.mobileAppSecretReady !== true) missing.push("mobileAppSecretReady")
      if (item.androidConfigured !== true) missing.push("androidConfigured")
      if (item.iosConfigured !== true) missing.push("iosConfigured")
      return missing
    },
  },
  {
    key: "envImport",
    label: "生产环境变量已通过阿里云控制台、KMS 或 Secrets Manager 导入，未把密钥写进镜像",
    requiredFields: ["target", "secretNotInImage", "importedAt", "evidence"],
    validate: (item) => {
      const missing = []
      if (!["SAE", "ECS", "KMS", "SecretsManager"].includes(String(item.target || "").trim())) missing.push("target")
      if (item.secretNotInImage !== true) missing.push("secretNotInImage")
      return missing
    },
  },
  {
    key: "slsAlerts",
    label: "SLS 日志、健康检查失败告警和 5xx 告警已配置",
    requiredFields: ["slsProject", "healthAlertConfigured", "serverErrorAlertConfigured", "evidence"],
    validate: (item) => {
      const missing = []
      if (item.healthAlertConfigured !== true) missing.push("healthAlertConfigured")
      if (item.serverErrorAlertConfigured !== true) missing.push("serverErrorAlertConfigured")
      return missing
    },
  },
]

const MANUAL_CONFIRMATIONS = CLOUD_CONFIRMATION_ITEMS.map((item) => item.label)

const OLD_VERCEL_HOSTS = new Set([
  "ip.ipgongchang.xin",
  "ipnrgc.com",
  "www.ipnrgc.com",
])

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: "",
    cloudConfirmationsExplicit: false,
    allowBlocking: false,
    assumeCloudReady: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--cloud-confirmations") {
      args.cloudConfirmationsFile = resolveValue(argv[++index], "--cloud-confirmations")
      args.cloudConfirmationsExplicit = true
      continue
    }
    if (arg === "--allow-blocking") {
      args.allowBlocking = true
      continue
    }
    if (arg === "--assume-cloud-ready") {
      args.assumeCloudReady = true
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
  return resolve(process.cwd(), value)
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function nonTodoText(value) {
  const text = String(value || "").trim()
  return Boolean(text && !text.startsWith("TODO_"))
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return new Map()
  const env = new Map()
  const raw = readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    env.set(match[1], unquote(match[2]))
  }
  return env
}

function unquote(value) {
  const trimmed = String(value || "").trim()
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function isFilled(value) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''")
}

function isTodo(value) {
  return String(value || "").trim().startsWith("TODO_")
}

function envStatus(value) {
  if (!isFilled(value)) return "empty"
  if (isTodo(value)) return "todo"
  return "ready"
}

function checkUrl(key, value) {
  const status = envStatus(value)
  if (status !== "ready") return status
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return "invalid_url"
  }
  if (parsed.protocol !== "https:") return "must_be_https"
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return "local_url"
  if (parsed.hostname.endsWith(".localhost")) return "local_url"
  if (parsed.hostname.includes("example.")) return "example_url"
  if (parsed.hostname.endsWith(".vercel.app")) return "vercel_url"
  if (OLD_VERCEL_HOSTS.has(parsed.hostname)) return "existing_vercel_domain"
  if (key === "APP_API_BASE_URL" && !parsed.hostname.startsWith("api-cn.")) return "non_api_cn_host"
  return "ready"
}

function fileStatus(root, files) {
  const missing = files.filter((file) => !existsSync(resolve(root, file)))
  return {
    ready: missing.length === 0,
    checked: files.length,
    missing,
  }
}

function scriptStatus(packagePath, requiredScripts) {
  if (!existsSync(packagePath)) {
    return {
      ready: false,
      checked: requiredScripts.length,
      missing: requiredScripts,
    }
  }
  const scripts = readJson(packagePath).scripts || {}
  const missing = requiredScripts.filter((script) => !scripts[script])
  return {
    ready: missing.length === 0,
    checked: requiredScripts.length,
    missing,
  }
}

function gitIgnored(root, filePath) {
  const relative = filePath.startsWith(`${root}/`) ? filePath.slice(root.length + 1) : filePath
  const result = spawnSync("git", ["-C", root, "check-ignore", "-q", relative], {
    encoding: "utf8",
  })
  return result.status === 0
}

function fileMode(filePath) {
  if (!existsSync(filePath)) return "missing"
  return (statSync(filePath).mode & 0o777).toString(8).padStart(3, "0")
}

function dockerStatus() {
  const result = spawnSync("docker", ["info"], {
    encoding: "utf8",
    timeout: 5000,
  })
  if (result.error?.code === "ENOENT") {
    return {
      ready: false,
      status: "docker_cli_missing",
    }
  }
  if (result.status === 0) {
    return {
      ready: true,
      status: "ready",
    }
  }
  return {
    ready: false,
    status: "docker_daemon_unavailable",
  }
}

function checkWechatOpenPlatform(env) {
  const reviewStatus = normalizeWechatReviewStatus(env.get("WECHAT_OPEN_APP_REVIEW_STATUS"))
  const openAppIdStatus = envStatus(env.get("WECHAT_OPEN_APP_ID"))
  const openSecretStatus = envStatus(env.get("WECHAT_OPEN_APP_SECRET"))
  const miniAppId = env.get("WECHAT_MINI_APPID")
  const miniSecret = env.get("WECHAT_MINI_SECRET")
  const openAppId = env.get("WECHAT_OPEN_APP_ID")
  const openSecret = env.get("WECHAT_OPEN_APP_SECRET")
  const reusesMiniAppId =
    openAppIdStatus === "ready" &&
    envStatus(miniAppId) === "ready" &&
    String(openAppId).trim() === String(miniAppId).trim()
  const reusesMiniSecret =
    openSecretStatus === "ready" &&
    envStatus(miniSecret) === "ready" &&
    String(openSecret).trim() === String(miniSecret).trim()

  return {
    ready: openAppIdStatus === "ready" && openSecretStatus === "ready" && !reusesMiniAppId && !reusesMiniSecret,
    reviewStatus,
    openAppIdStatus,
    openSecretStatus,
    mobileAppRequired: true,
    miniProgramReuseDetected: reusesMiniAppId || reusesMiniSecret,
  }
}

function resolveCloudConfirmationPath(args) {
  if (args.cloudConfirmationsFile) return args.cloudConfirmationsFile
  if (existsSync(DEFAULT_CLOUD_CONFIRMATIONS_FILE)) return DEFAULT_CLOUD_CONFIRMATIONS_FILE
  return ""
}

function checkCloudConfirmations(args) {
  if (args.assumeCloudReady) {
    return {
      mode: "assumed",
      path: null,
      ready: true,
      items: CLOUD_CONFIRMATION_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        ready: true,
        status: "assumed",
        missing: [],
      })),
    }
  }

  const filePath = resolveCloudConfirmationPath(args)
  if (!filePath) {
    return {
      mode: "not_provided",
      path: null,
      ready: false,
      items: CLOUD_CONFIRMATION_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        ready: false,
        status: "not_provided",
        missing: ["confirmation_file"],
      })),
    }
  }

  if (!existsSync(filePath)) {
    return {
      mode: args.cloudConfirmationsExplicit ? "missing_file" : "not_provided",
      path: filePath,
      ready: false,
      items: CLOUD_CONFIRMATION_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        ready: false,
        status: "missing_file",
        missing: ["confirmation_file"],
      })),
    }
  }

  const data = readJson(filePath)
  const rawItems = data.items && typeof data.items === "object" ? data.items : {}
  const items = CLOUD_CONFIRMATION_ITEMS.map((definition) => {
    const item = rawItems[definition.key] && typeof rawItems[definition.key] === "object"
      ? rawItems[definition.key]
      : {}
    const missing = []
    if (item.confirmed !== true) missing.push("confirmed")
    for (const field of definition.requiredFields) {
      if (!nonTodoText(item[field])) missing.push(field)
    }
    missing.push(...definition.validate(item))
    const uniqueMissing = [...new Set(missing)]
    return {
      key: definition.key,
      label: definition.label,
      ready: uniqueMissing.length === 0,
      status: uniqueMissing.length === 0 ? "ready" : "incomplete",
      missing: uniqueMissing,
    }
  })

  return {
    mode: "file",
    path: filePath,
    ready: items.every((item) => item.ready),
    schemaVersion: data.schemaVersion || null,
    updatedAt: data.updatedAt || "",
    operator: data.operator || "",
    items,
  }
}

function normalizeWechatReviewStatus(value) {
  const status = String(value || "").trim().toLowerCase()
  if (!status || status.startsWith("todo_")) return "unknown"
  if (["not_started", "reviewing", "approved", "rejected"].includes(status)) return status
  return "unknown"
}

function wechatOpenPlatformBlocker(wechatOpenPlatform) {
  if (wechatOpenPlatform.ready) return ""
  if (wechatOpenPlatform.reviewStatus === "reviewing") return "wechat_open_platform_mobile_app_reviewing"
  if (wechatOpenPlatform.reviewStatus === "rejected") return "wechat_open_platform_mobile_app_rejected"
  return "wechat_open_platform_mobile_app_not_ready"
}

function addBlocker(blocking, condition, code) {
  if (condition) blocking.push(code)
}

function main() {
  const args = parseArgs(process.argv)
  const envFileExists = existsSync(args.envFile)
  const env = parseEnvFile(args.envFile)
  const required = REQUIRED_ENV_KEYS.map((key) => ({
    key,
    status: envStatus(env.get(key)),
  }))
  const optional = OPTIONAL_ENV_KEYS.map((key) => ({
    key,
    status: envStatus(env.get(key)),
  }))
  const missingRequired = required.filter((item) => item.status !== "ready").map((item) => item.key)
  const appApiBaseUrl = checkUrl("APP_API_BASE_URL", env.get("APP_API_BASE_URL"))
  const siteUrl = checkUrl("NEXT_PUBLIC_SITE_URL", env.get("NEXT_PUBLIC_SITE_URL"))
  const assetBaseUrlStatus = envStatus(env.get("APP_ASSET_BASE_URL"))
  const assetBaseUrl = assetBaseUrlStatus === "ready"
    ? checkUrl("APP_ASSET_BASE_URL", env.get("APP_ASSET_BASE_URL"))
    : `optional_${assetBaseUrlStatus}`
  const envMode = fileMode(args.envFile)
  const envGitIgnored = envFileExists ? gitIgnored(WORKSPACE_ROOT, args.envFile) : false
  const wechatOpenPlatform = checkWechatOpenPlatform(env)
  const backendFiles = fileStatus(BACKEND_ROOT, REQUIRED_BACKEND_FILES)
  const backendScripts = scriptStatus(resolve(BACKEND_ROOT, "package.json"), REQUIRED_BACKEND_SCRIPTS)
  const appFiles = fileStatus(APP_ROOT, REQUIRED_APP_FILES)
  const appScripts = scriptStatus(resolve(APP_ROOT, "package.json"), REQUIRED_APP_SCRIPTS)
  const docker = dockerStatus()
  const cloudConfirmations = checkCloudConfirmations(args)

  const machineBlocking = []
  const warnings = []

  addBlocker(machineBlocking, !envFileExists, "env_file_missing")
  addBlocker(machineBlocking, envFileExists && !envGitIgnored, "env_file_not_gitignored")
  addBlocker(machineBlocking, env.get("APP_ENV") !== "production-cn", "app_env_not_production_cn")
  for (const key of missingRequired) machineBlocking.push(`missing_required_env:${key}`)
  addBlocker(
    machineBlocking,
    !missingRequired.includes("APP_API_BASE_URL") && appApiBaseUrl !== "ready",
    `invalid_app_api_base_url:${appApiBaseUrl}`,
  )
  addBlocker(
    machineBlocking,
    !missingRequired.includes("NEXT_PUBLIC_SITE_URL") && siteUrl !== "ready",
    `invalid_next_public_site_url:${siteUrl}`,
  )
  addBlocker(
    machineBlocking,
    assetBaseUrl !== "ready" && assetBaseUrl !== "optional_empty" && assetBaseUrl !== "optional_todo",
    `invalid_app_asset_base_url:${assetBaseUrl}`,
  )
  addBlocker(machineBlocking, !wechatOpenPlatform.ready, wechatOpenPlatformBlocker(wechatOpenPlatform))
  addBlocker(machineBlocking, !backendFiles.ready, `missing_backend_files:${backendFiles.missing.join(",")}`)
  addBlocker(machineBlocking, !backendScripts.ready, `missing_backend_scripts:${backendScripts.missing.join(",")}`)
  addBlocker(machineBlocking, !appFiles.ready, `missing_app_config_files:${appFiles.missing.join(",")}`)
  addBlocker(machineBlocking, !appScripts.ready, `missing_app_config_scripts:${appScripts.missing.join(",")}`)

  if (envFileExists && envMode !== "600") warnings.push(`env_file_mode_should_be_600:current_${envMode}`)
  if (!docker.ready) warnings.push(docker.status)
  if (args.assumeCloudReady) warnings.push("manual_cloud_confirmations_assumed")
  if (!cloudConfirmations.ready) warnings.push("manual_cloud_confirmations_required")

  const manualBlocking = cloudConfirmations.ready
    ? []
    : cloudConfirmations.items
      .filter((item) => !item.ready)
      .map((item) => item.label)
  const localCodeReady = machineBlocking.length === 0
  const productionReady = localCodeReady && manualBlocking.length === 0

  const result = {
    ok: productionReady,
    localCodeReady,
    productionReady,
    envFile: args.envFile,
    suggestedApiHost: "api-cn.ipgongchang.xin",
    machineBlocking,
    manualBlocking,
    warnings,
    checks: {
      env: {
        fileExists: envFileExists,
        gitIgnored: envGitIgnored,
        mode: envMode,
        requiredReady: required.filter((item) => item.status === "ready").length,
        requiredTotal: required.length,
        optionalReady: optional.filter((item) => item.status === "ready").length,
        todoCount: [...required, ...optional].filter((item) => item.status === "todo").length,
        emptyCount: [...required, ...optional].filter((item) => item.status === "empty").length,
        missingRequired,
      },
      urls: {
        appApiBaseUrl,
        nextPublicSiteUrl: siteUrl,
        appAssetBaseUrl: assetBaseUrl,
      },
      wechatOpenPlatform,
      backend: {
        files: backendFiles,
        scripts: backendScripts,
      },
      appProductionConfig: {
        files: appFiles,
        scripts: appScripts,
      },
      docker,
      cloudConfirmations,
    },
    nextActions: [
      "创建或确认阿里云 SAE/ECS 容器应用、api-cn 域名和 HTTPS 证书",
      "把 APP_API_BASE_URL 和 NEXT_PUBLIC_SITE_URL 填为 api-cn HTTPS 正式地址",
      wechatOpenPlatform.reviewStatus === "reviewing"
        ? "等待微信开放平台移动应用审核通过后补 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET"
        : "从微信开放平台移动应用补 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET",
      "复制 deploy/aliyun-production-cn.cloud-confirmations.example.json 到 .local.json，并逐项填写非密钥云资源确认",
      "Docker daemon 就绪后执行 corepack pnpm aliyun:docker:build",
      "部署后执行 corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin",
      "部署后执行 corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  }

  console.log(JSON.stringify(result, null, 2))
  if (!productionReady && !args.allowBlocking) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-production-cn-readiness.mjs [--env-file path] [--cloud-confirmations path] [--allow-blocking] [--assume-cloud-ready]",
    "",
    "Default mode fails when production-cn is not ready. It never prints secret values.",
    "--allow-blocking prints the report but exits 0 for local status dashboards.",
    "--cloud-confirmations reads non-secret Aliyun resource confirmation evidence from JSON.",
    "--assume-cloud-ready bypasses manual cloud confirmations for emergency local diagnosis only.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
