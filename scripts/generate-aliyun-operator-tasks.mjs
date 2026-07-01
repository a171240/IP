#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { buildImportPlan, parseEnvFile } from "./prepare-aliyun-runtime-env.mjs"
import { SENSITIVE_ACTION_METADATA } from "./aliyun-sensitive-action-metadata.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")
const DEFAULT_RDS_MIGRATION_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const DEFAULT_IMAGE_PUBLISH_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.image-publish.local.json")
const APP_API_ONLINE_READONLY_BOUNDARY_COMMAND = "corepack pnpm aliyun:app-api:online-readonly-boundary -- --base-url https://api-cn.ipgongchang.xin --timeout-ms 15000"

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    rdsMigrationFile: DEFAULT_RDS_MIGRATION_FILE,
    imagePublishFile: DEFAULT_IMAGE_PUBLISH_FILE,
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
    if (arg === "--rds-migration") {
      args.rdsMigrationFile = resolveValue(argv[++index], "--rds-migration")
      continue
    }
    if (arg === "--image-publish") {
      args.imagePublishFile = resolveValue(argv[++index], "--image-publish")
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

const APP_LAUNCH_TASK_IDS = new Set([
  "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
  "T02_APP_LEGAL_LINKS",
])

const APP_LAUNCH_SENSITIVE_ACTION_IDS = new Set([
  "S01_WECHAT_OPEN_APP_LOGIN",
  "S02_APPLE_TEAM_ID",
  "S07_ANDROID_RELEASE_SIGNING",
])

const APP_LAUNCH_ENV_NAMES = new Set([
  "APPLE_TEAM_ID",
  "MEIYE_RELEASE_KEY_ALIAS",
  "MEIYE_RELEASE_KEY_PASSWORD",
  "MEIYE_RELEASE_STORE_FILE",
  "MEIYE_RELEASE_STORE_PASSWORD",
  "PRIVACY_POLICY_URL",
  "TERMS_URL",
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "WECHAT_OPEN_APP_REVIEW_STATUS",
])

const OPERATOR_TASK_AUTHORIZATION_PACKETS = Object.freeze({
  T02B_ALIYUN_RDS_DATA_MIGRATION: Object.freeze(["P11_ALIYUN_RDS_DATA_MIGRATION"]),
  T03_ALIYUN_RUNTIME_CONTAINER: Object.freeze(["P08_SAE_RUNTIME_SLS"]),
  T03B_ALIYUN_ACR_IMAGE_PUBLISH: Object.freeze(["P03_ACR_PURCHASE", "P04_ACR_IMAGE_AND_PULL"]),
  T04_ALIYUN_DOMAIN_DNS_HTTPS: Object.freeze(["P07_DOMAIN_DNS_HTTPS"]),
  T05_ALIYUN_OSS_AUDIO_STORAGE: Object.freeze(["P05_OSS_RAM_STS"]),
  T06_ALIYUN_ENV_IMPORT: Object.freeze(["P11_ALIYUN_RDS_DATA_MIGRATION", "P06_ENV_IMPORT"]),
  T07_ALIYUN_SLS_ALERTS: Object.freeze(["P08_SAE_RUNTIME_SLS"]),
  T08_POSTDEPLOY_REMOTE_SMOKE: Object.freeze(["P09_PRODUCTION_DEPLOY"]),
})

const OPERATOR_AUTHORIZATION_PACKET_METADATA = Object.freeze({
  P00_ALIYUN_READONLY_INVENTORY_IDENTITY: Object.freeze({
    packetId: "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    actionId: "U00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    title: "恢复阿里云 CLI/CloudShell 只读盘点身份",
    blockerClass: "readonly_cloud_inventory_identity",
    nonSecretEvidenceOnly: true,
    writeTargets: ["deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries"],
    verifyCommands: [
      "corepack pnpm aliyun:cloud:access",
      "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:evidence:writeback:backend",
    ],
  }),
  P03_ACR_PURCHASE: Object.freeze({
    packetId: "P03_ACR_PURCHASE",
    actionId: "U03_ACR_PURCHASE_CONFIRMATION",
    title: "确认 ACR 企业版付费购买",
    blockerClass: "paid_purchase",
    nonSecretEvidenceOnly: true,
    writeTargets: ["deploy/aliyun-production-cn.image-publish.local.json -> acr.purchaseCandidate / acr confirmed evidence"],
    verifyCommands: ["corepack pnpm aliyun:image:plan"],
  }),
  P04_ACR_IMAGE_AND_PULL: Object.freeze({
    packetId: "P04_ACR_IMAGE_AND_PULL",
    actionId: "U04_ACR_RUNTIME_AUTH",
    title: "配置 ACR 镜像推送和 SAE 镜像拉取权限",
    blockerClass: "registry_password_or_runtime_pull_secret",
    nonSecretEvidenceOnly: true,
    writeTargets: ["deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime"],
    verifyCommands: [
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:container:smoke",
    ],
  }),
  P05_OSS_RAM_STS: Object.freeze({
    packetId: "P05_OSS_RAM_STS",
    actionId: "U05_OSS_RAM_OR_STS",
    title: "绑定 OSS RAM 最小权限或 STS/运行时角色方案",
    blockerClass: "ram_secret_or_sts_import",
    nonSecretEvidenceOnly: false,
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
      "SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE when accessMode=sae_runtime_role",
      "fallback only: ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / ALIYUN_OSS_SECURITY_TOKEN -> KMS/Secrets Manager/SAE secret env",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:oss:runtime-access:strict",
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:health:smoke",
    ],
  }),
  P11_ALIYUN_RDS_DATA_MIGRATION: Object.freeze({
    packetId: "P11_ALIYUN_RDS_DATA_MIGRATION",
    actionId: "U11_ALIYUN_RDS_DATA_MIGRATION",
    title: "创建阿里云 RDS PostgreSQL 并完成正式数据层迁移",
    blockerClass: "database_secret_and_migration",
    nonSecretEvidenceOnly: false,
    writeTargets: [
      "DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env",
      "RDS PostgreSQL 实例、schema/data migration、rollback validation -> 非密钥证据报告",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:rds:migration:evidence",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:readiness",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
  }),
  P06_ENV_IMPORT: Object.freeze({
    packetId: "P06_ENV_IMPORT",
    actionId: "U06_ENV_IMPORT",
    title: "导入 production-cn 运行环境变量",
    blockerClass: "ready_sensitive_env_need_cloud_import",
    nonSecretEvidenceOnly: false,
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
      "SAE plain env for non-secret identifiers only",
      "KMS/Secrets Manager/SAE secret env for secret or connection values",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:env:checklist",
      "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:readiness:cloud-ready",
    ],
  }),
  P07_DOMAIN_DNS_HTTPS: Object.freeze({
    packetId: "P07_DOMAIN_DNS_HTTPS",
    actionId: "U07_DOMAIN_DNS_HTTPS_ICP",
    title: "配置 api-cn/assets-cn DNS、HTTPS 和 ICP",
    blockerClass: "public_domain_mutation",
    nonSecretEvidenceOnly: true,
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  }),
  P08_SAE_RUNTIME_SLS: Object.freeze({
    packetId: "P08_SAE_RUNTIME_SLS",
    actionId: "U08_SAE_RUNTIME_AND_SLS",
    title: "创建或确认 SAE runtime 与 SLS 告警",
    blockerClass: "cloud_resource_mutation",
    nonSecretEvidenceOnly: true,
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:runtime:plan",
      "corepack pnpm aliyun:cloud:confirmations",
      "corepack pnpm aliyun:cloud:check",
    ],
  }),
  P09_PRODUCTION_DEPLOY: Object.freeze({
    packetId: "P09_PRODUCTION_DEPLOY",
    actionId: "U09_DEPLOY_AUTHORIZATION",
    title: "阿里云 production-cn 后端部署授权",
    blockerClass: "production_release",
    nonSecretEvidenceOnly: true,
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> postdeploy evidence",
      "release artifact archive -> backend-cn status / smoke evidence",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:predeploy",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
      APP_API_ONLINE_READONLY_BOUNDARY_COMMAND,
      "corepack pnpm aliyun:completion:audit",
    ],
  }),
})
const BACKEND_CURRENT_CAN_START_PACKET_IDS = Object.freeze([
  "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
  "P11_ALIYUN_RDS_DATA_MIGRATION",
  "P05_OSS_RAM_STS",
  "P04_ACR_IMAGE_AND_PULL",
])
const BACKEND_COMPLETED_PACKET_IDS = Object.freeze([
  "P03_ACR_PURCHASE",
])
const BACKEND_DEFERRED_APP_LAUNCH_PACKET_IDS = Object.freeze([
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P10_ANDROID_RELEASE_SIGNING",
  "P02_APPLE_TEAM_ID",
])

function isAppLaunchBlocker(blocker) {
  const value = String(blocker || "")
  return /WECHAT_OPEN|wechat_open_platform|APPLE_TEAM_ID|apple_team_id|app_native|app_universal_link|legalLinks|PRIVACY_POLICY_URL|TERMS_URL|Android release signing|MEIYE_RELEASE_/i.test(value)
}

function backendOnlyTask(task, scopedEnvSummary) {
  const blockerCodes = task.blockerCodes
    .map((item) => item === "requires_runtime_domain_env_wechat_cloud_confirmations"
      ? "requires_runtime_domain_env_cloud_confirmations"
      : item)
    .filter((item) => !isAppLaunchBlocker(item))
  const status = task.id === "T06_ALIYUN_ENV_IMPORT" && blockerCodes.length === 0
    ? "ready"
    : task.status
  const actions = task.actions.map((item) => {
    if (task.id === "T06_ALIYUN_ENV_IMPORT") {
      return item.replace("、微信开放平台", "")
    }
    if (task.id === "T08_POSTDEPLOY_REMOTE_SMOKE") {
      return item
        .replace("完成前置微信、协议、运行时、ACR 镜像、域名、OSS、环境变量和 SLS 任务后部署 production-cn 后端。", "完成运行时、ACR 镜像、域名、OSS、环境变量和 SLS 任务后部署 production-cn 后端。")
        .replace("微信开放平台或正式协议 URL 未补齐时只能使用 --allow-missing appWechatLogin,legalLinks 做桥接调试，不能作为正式上线结论。", "本 backend-only 清单不把 APP 登录和协议页作为阿里云后端补齐前置项；正式 APP 发布前再补齐完整 strict health。")
    }
    return item
  })
  const evidence = task.evidence.map((item) => {
    if (task.id === "T06_ALIYUN_ENV_IMPORT" && item.startsWith("requiredReady=")) {
      return `requiredReady=${scopedEnvSummary.requiredReady}/${scopedEnvSummary.requiredTotal}`
    }
    if (task.id === "T06_ALIYUN_ENV_IMPORT" && item.startsWith("requiredBlocking=")) {
      return `requiredBlocking=${scopedEnvSummary.requiredBlocking.length ? scopedEnvSummary.requiredBlocking.join(",") : "none"}`
    }
    if (task.id === "T08_POSTDEPLOY_REMOTE_SMOKE") {
      return item.replace("strict health 不再缺 appWechatLogin 或 legalLinks", "backend health and APP API smoke pass")
    }
    return item
  })
  return {
    ...task,
    status,
    actions,
    evidence,
    blockerCodes,
    ready: status === "ready",
  }
}

function applyBackendOnlyScope(report) {
  const cloudImportedEnvNames = new Set(report.cloudImportedRequiredEnvNames || [])
  const excludedTaskIds = report.tasks
    .filter((task) => APP_LAUNCH_TASK_IDS.has(task.id))
    .map((task) => task.id)
  const excludedSensitiveActionIds = report.sensitiveActionItems
    .filter((item) => APP_LAUNCH_SENSITIVE_ACTION_IDS.has(item.id))
    .map((item) => item.id)
  const excludedRequiredBlocking = report.env.summary.requiredBlocking
    .filter((name) => APP_LAUNCH_ENV_NAMES.has(name))
  const backendRequiredBlocking = report.env.summary.requiredBlocking
    .filter((name) => !APP_LAUNCH_ENV_NAMES.has(name) && !cloudImportedEnvNames.has(name))
  const cloudImportedRequiredBlocking = report.env.summary.requiredBlocking
    .filter((name) => cloudImportedEnvNames.has(name))

  const scopedEnvSummary = {
    ...report.env.summary,
    requiredTotal: Math.max(0, report.env.summary.requiredTotal - excludedRequiredBlocking.length),
    requiredReady: Math.min(
      Math.max(0, report.env.summary.requiredTotal - excludedRequiredBlocking.length),
      (report.env.summary.requiredReady || 0) + cloudImportedRequiredBlocking.length,
    ),
    requiredBlocking: backendRequiredBlocking,
    appLaunchBlocking: Array.from(new Set([
      ...(report.env.summary.appLaunchBlocking || []),
      ...excludedRequiredBlocking,
    ])),
  }
  const tasks = report.tasks
    .filter((task) => !APP_LAUNCH_TASK_IDS.has(task.id))
    .map((task) => backendOnlyTask(task, scopedEnvSummary))
  const sensitiveActionItems = report.sensitiveActionItems
    .filter((item) => !APP_LAUNCH_SENSITIVE_ACTION_IDS.has(item.id))

  return {
    ...report,
    currentScope: "backend_aliyun_only",
    fullAppLaunchScope: "deferred_after_backend_online",
    canProceedWithoutWechat: true,
    summary: summarizeTasks(tasks),
    sensitiveActionItems,
    env: {
      ...report.env,
      summary: scopedEnvSummary,
      requiredBlocking: backendRequiredBlocking,
      requiredBlockingDetails: report.env.requiredBlockingDetails
        .filter((item) => !APP_LAUNCH_ENV_NAMES.has(item.name) && !cloudImportedEnvNames.has(item.name)),
    },
    readiness: {
      ...report.readiness,
      machineBlocking: report.readiness.machineBlocking.filter((item) =>
        !isAppLaunchBlocker(item) && !cloudImportedEnvNames.has(String(item).replace(/^missing_required_env:/u, ""))),
      manualBlocking: report.readiness.manualBlocking.filter((item) => !isAppLaunchBlocker(item)),
    },
    tasks,
    backendOnlyExclusions: {
      taskIds: excludedTaskIds,
      sensitiveActionIds: excludedSensitiveActionIds,
      envNames: Array.from(new Set([
        ...(report.env.summary.appLaunchBlocking || []),
        ...excludedRequiredBlocking,
      ])).filter((name) => APP_LAUNCH_ENV_NAMES.has(name)),
      reason: "APP launch, WeChat Open Platform, Apple Team ID, Android release signing, and legal-page publishing are deferred until after the Aliyun backend is online.",
    },
    nextCommandOrder: [
      "corepack pnpm aliyun:operator:tasks:backend",
      "corepack pnpm aliyun:env:handoff:backend",
      "corepack pnpm aliyun:user:actions:backend",
      "corepack pnpm aliyun:action:authorization:backend",
      "corepack pnpm aliyun:backend-cn:status",
      "corepack pnpm aliyun:backend-cn:apply-package",
      "corepack pnpm aliyun:cloudshell:handoff",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:cloud:confirmations:backend:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:evidence:writeback:backend",
    ],
  }
}

function resolveValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function runJson(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
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

function readJsonIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function buildCloudConfirmationIndex(readiness) {
  const items = readiness.checks?.cloudConfirmations?.items || []
  return new Map(items.map((item) => [item.key, item]))
}

function buildTasks({ envPlan, readiness, domain, cloudConfirmations, imagePublishPlan, rdsMigrationEvidence }) {
  const cloud = buildCloudConfirmationIndex(readiness)
  const tasks = []
  const wechatOpenPlatform = readiness.checks?.wechatOpenPlatform || {}
  const wechatReviewStatus = wechatOpenPlatform.reviewStatus || "unknown"
  const wechatTaskStatus = wechatOpenPlatform.ready
    ? "ready"
    : wechatReviewStatus === "reviewing"
      ? "waiting_wechat_review"
      : "blocked"
  const wechatActions = buildWechatOpenPlatformActions(wechatReviewStatus)

  addTask(tasks, {
    id: "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
    title: "微信开放平台移动应用审核和 APP 登录凭证",
    status: wechatTaskStatus,
    blockerCodes: readiness.machineBlocking.filter((item) =>
      item.includes("WECHAT_OPEN") ||
      item.includes("wechat_open_platform") ||
      item.includes("invalid_app_native_release_config") ||
      item.includes("app_native:") ||
      item.includes("invalid_app_universal_link_config") ||
      item.includes("app_universal_link:")
    ),
    owner: "用户/微信开放平台操作员",
    consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
    actions: [
      ...wechatActions,
      "确认移动应用名称为“美业话镜”，对应本机 APP 工程，而不是小程序应用。",
      "审核通过后获取移动应用 AppID，填入 WECHAT_OPEN_APP_ID。",
      "获取移动应用 AppSecret，填入 WECHAT_OPEN_APP_SECRET。",
      "确认 Android 包名为 com.ipgongchang.meiyehuajing，并从 release 签名证书取得微信开放平台要求的 Android 应用签名。",
      "确认 iOS Bundle ID 为 com.ipgongchang.meiyehuajing，并配置 HTTPS Universal Link。",
      "从 Apple Developer 确认 10 位 Team ID，填入 APPLE_TEAM_ID，用于后端 AASA 路由生成 iOS appID。",
      "运行 corepack pnpm aliyun:app-native:check，确认 APP 原生发布配置状态进入 release audit。",
      "运行 corepack pnpm aliyun:aasa:check，确认后端 AASA 路由和 APPLE_TEAM_ID 状态。",
      "在 deploy/aliyun-production-cn.cloud-confirmations.local.json 的 wechatOpenPlatform 项记录非密钥证据。",
    ],
    evidence: [
      `currentReviewStatus=${wechatReviewStatus}`,
      "targetAccountVerified=true",
      "targetMobileAppCreated=true",
      "targetMobileAppSubmitted=true",
      "targetReviewStatus=approved",
      "mobileAppName=美业话镜",
      "mobileAppIdReady=true",
      "mobileAppSecretReady=true",
      "androidPackageName=com.ipgongchang.meiyehuajing",
      "androidSignature=<release 签名证据，不是 debug keystore>",
      "androidConfigured=true",
      "iosBundleId=com.ipgongchang.meiyehuajing",
      "iosUniversalLink=https://...",
      "APPLE_TEAM_ID ready",
      "iosConfigured=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:app-native:check",
      "corepack pnpm aliyun:aasa:check",
      "corepack pnpm aliyun:readiness",
      "curl -i https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association after deployment",
      "GET https://api-cn.ipgongchang.xin/api/app/health?strict=1 after deployment",
    ],
    notes: [
      "not_started 表示微信开放平台移动应用还没创建；reviewing 表示移动应用已进入审核流程；approved 之前不要填猜测值。",
      "不能用小程序 AppID/Secret 替代 APP 微信登录。",
      "脚本只记录变量名和状态，不输出 AppSecret。",
    ],
  })

  const legalBlocking = envPlan.summary.requiredBlocking
    .filter((key) => key === "PRIVACY_POLICY_URL" || key === "TERMS_URL")
    .map((key) => `missing_required_env:${key}`)
  addTask(tasks, {
    id: "T02_APP_LEGAL_LINKS",
    title: "国内 APP 隐私政策和用户协议正式 URL",
    status: legalBlocking.length ? "blocked" : "ready",
    blockerCodes: legalBlocking,
    owner: "产品/法务/发布操作员",
    consolePath: "自有备案 HTTPS 域名或可公开访问的正式协议页面",
    actions: [
      "先确认后端包内 /privacy 与 /terms 页面存在，并由运营者复核协议文本。",
      "确认隐私政策正式页面 URL，并填入 PRIVACY_POLICY_URL。",
      "确认用户协议或服务条款正式页面 URL，并填入 TERMS_URL。",
      "两个 URL 必须是正式 HTTPS 页面，不能是 TODO、localhost、临时预览或仅本地文件。",
      "APP 国内发布材料、登录/注册入口和后端 health 门禁应使用同一组正式 URL。",
      "导入阿里云运行环境后，/api/app/health?strict=1 不应再缺 legalLinks。",
    ],
    evidence: [
      "corepack pnpm aliyun:legal:check 通过",
      "PRIVACY_POLICY_URL ready",
      "TERMS_URL ready",
      "GET /privacy 和 GET /terms 返回美业话镜 APP 协议页面",
      "GET /api/app/health?strict=1 missing 不包含 legalLinks",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:legal:check",
      "corepack pnpm aliyun:env:check",
      "corepack pnpm aliyun:health:smoke",
      "corepack pnpm aliyun:remote:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  })

  const rdsLocal = rdsMigrationEvidence.local || {}
  const rdsSourceInventory = rdsLocal.sourceInventory || {}
  const rdsMigration = rdsLocal.migration || {}
  const rdsSummary = rdsMigrationEvidence.summary || {}
  const rdsCompatibilityClosed = rdsMigration.schemaCompatibilityReviewed === true &&
    rdsMigration.supabaseSpecificSqlResolved === true &&
    rdsMigration.rdsExtensionSupportConfirmed === true
  addTask(tasks, {
    id: "T02B_ALIYUN_RDS_DATA_MIGRATION",
    title: "创建阿里云 RDS PostgreSQL 并完成正式数据层迁移",
    status: rdsLocal.ready ? "ready" : "blocked",
    blockerCodes: (rdsLocal.blockers || []).map((item) => `rdsMigration:${item}`),
    owner: "阿里云 RDS/后端数据迁移操作员",
    consolePath: "阿里云控制台 -> RDS PostgreSQL -> cn-hangzhou；本机 RDS migration runbook",
    actions: [
      "创建或确认 production-cn RDS PostgreSQL 实例、数据库、账号和网络访问策略。",
      "把 DATABASE_URL_CN 只导入阿里云 KMS/Secrets Manager/SAE secret env，不写入 JSON、Markdown、Docker 镜像、APP 包、小程序包或 git。",
      ...(rdsCompatibilityClosed ? [
        "Supabase schema 兼容性复核、Supabase-specific SQL 改写和阿里云 RDS PostgreSQL extension 支持已在 local evidence 中记录为 true。",
      ] : [
        "迁移前完成 Supabase schema 兼容性复核、Supabase-specific SQL 改写和阿里云 RDS PostgreSQL extension 支持确认。",
        "先关闭 RDS migration package 的 7 类 compatibilityReviewChecklist：supabase_auth_schema、supabase_auth_uid、supabase_storage_schema、supabase_service_role、row_level_security、policy_statement、extension_review。",
      ]),
      "按 RDS migration package 执行 schema/data 迁移、行数校验、关键记录校验、APP API smoke 和 rollback 验收。",
      "只把实例 id/name/region、迁移报告句柄、校验结果布尔值等非密钥证据写入 deploy/aliyun-production-cn.rds-migration.local.json。",
    ],
    evidence: [
      `localFile=${rdsLocal.file || DEFAULT_RDS_MIGRATION_FILE}`,
      `localExists=${rdsLocal.exists === true}`,
      `localReady=${rdsLocal.ready === true}`,
      `totalBlockers=${rdsSummary.totalBlockers ?? (rdsLocal.blockers || []).length}`,
      `appApiRoutesWithSupabase=${rdsSummary.appApiRoutesWithSupabase ?? rdsSourceInventory.appApiRoutesWithSupabase}/${rdsSummary.appApiRouteCount ?? rdsSourceInventory.appApiRouteCount}`,
      `appApiRoutesWithSupabaseDataAccess=${rdsSummary.appApiRoutesWithSupabaseDataAccess ?? rdsSourceInventory.appApiRoutesWithSupabaseDataAccess}/${rdsSummary.appApiRouteCount ?? rdsSourceInventory.appApiRouteCount}`,
      `firstVersionRdsRoutesWithSupabaseDataAccess=${rdsSummary.firstVersionRdsRoutesWithSupabaseDataAccess ?? rdsSourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess}/${rdsSummary.firstVersionRdsRouteCount ?? rdsSourceInventory.firstVersionRdsRouteCount}`,
      `postgresDataAccessAdapterDetected=${rdsSummary.postgresDataAccessAdapterDetected === true}`,
      `databaseUrlCnSecretImported=${rdsLocal.rdsPostgres?.databaseUrlCnSecretImported === true}`,
      `schemaCompatibilityReviewed=${rdsMigration.schemaCompatibilityReviewed === true}`,
      `supabaseSpecificSqlResolved=${rdsMigration.supabaseSpecificSqlResolved === true}`,
      `rdsExtensionSupportConfirmed=${rdsMigration.rdsExtensionSupportConfirmed === true}`,
    ],
    verifyCommands: [
      "corepack pnpm aliyun:rds:migration:package",
      "corepack pnpm aliyun:rds:migration:plan",
      "corepack pnpm aliyun:rds:migration:evidence",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:app-api:smoke -- --base-url https://api-cn.ipgongchang.xin",
      "corepack pnpm aliyun:completion:audit",
    ],
    notes: [
      "Supabase 只能作为迁移来源或旧链路兼容；正式 production-cn 后端必须以阿里云 RDS PostgreSQL 为数据层。",
      "RDS 创建、数据迁移、DATABASE_URL_CN 导入和任何生产数据动作都需要动作时确认。",
    ],
  })

  const runtime = cloud.get("runtime")
  addTask(tasks, {
    id: "T03_ALIYUN_RUNTIME_CONTAINER",
    title: "创建或确认阿里云后端运行容器",
    status: runtime?.ready ? "ready" : "pending_cloud",
    blockerCodes: missingList(runtime),
    owner: "阿里云操作员",
    consolePath: "阿里云控制台 -> SAE",
    actions: [
      "按 deploy/aliyun-production-cn.runtime-plan.json 创建或确认 production-cn 后端 SAE 应用，建议名称 meiye-huajing-app-api-production-cn。",
      "运行区域使用 cn-hangzhou，容器监听端口 3000。",
      "健康检查路径配置为 /api/healthz。",
      "镜像或构建上下文使用后端仓库 Dockerfile，密钥通过运行环境变量或 KMS/Secrets Manager 导入。",
      "在 cloud-confirmations.local.json 的 runtime 项写入应用名、端口和非密钥证据。",
    ],
    evidence: [
      "provider=SAE",
      "containerPort=3000",
      "healthPath=/api/healthz",
      "confirmed=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:runtime:plan",
      "corepack pnpm aliyun:docker:check",
      "corepack pnpm aliyun:health:smoke",
    ],
  })

  addTask(tasks, {
    id: "T03B_ALIYUN_ACR_IMAGE_PUBLISH",
    title: "发布后端 Docker 镜像到阿里云 ACR 并配置运行时拉取",
    status: imagePublishPlan?.ready ? "ready" : imagePublishPlan?.template?.ready === false ? "blocked" : "pending_cloud",
    blockerCodes: [
      ...(imagePublishPlan?.template?.blockers || []).map((item) => `imagePublishTemplate:${item}`),
      ...(imagePublishPlan?.local?.blockers || []).map((item) => `imagePublishLocal:${item}`),
    ],
    owner: "阿里云 ACR/后端发布操作员",
    consolePath: "阿里云控制台 -> 容器镜像服务 ACR / SAE 容器运行时",
    actions: [
      "确认 deploy/aliyun-production-cn.image-publish.local.json 已记录 ACR 企业版经济版 cn-hangzhou 购买/仓库非密钥证据。",
      "确认 ACR registry host、namespace、repository 为 meiye-huajing-app-api，tag 为 production-cn。",
      "ACR 企业版经济版 cn-hangzhou 1 个月已完成付款/确认；当前步骤进入 P04 后端镜像推送/导入和 SAE 拉取配置。",
      "先运行 corepack pnpm aliyun:docker:build 和 corepack pnpm aliyun:container:smoke。",
      "通过 docker login 或阿里云镜像构建服务把镜像推送/导入 ACR；不要把 registry 密码、RAM Secret 或 token 写入 JSON、文档或 git。",
      "配置 SAE 使用 ACR remoteImage，并确认运行时有镜像拉取权限。",
      "把 remote image、digest、push evidence 和 runtime image pull evidence 写入 image-publish.local.json。",
    ],
    evidence: [
      "acr.confirmed=true",
      "purchaseCandidate=ACR Enterprise Economic cn-hangzhou 1 month CNY 117.00 confirmed",
      "registryHost=meiye-huajing-app-api-registry.cn-hangzhou.cr.aliyuncs.com",
      "namespace=meiye-huajing-app-api",
      "repository=meiye-huajing-app-api",
      "imagePushed=true",
      "digestVerified=true",
      "runtime.remoteImageConfigured=true",
      "runtime.imagePullConfigured=true",
      "corepack pnpm aliyun:image:plan:strict pass",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:image:plan",
      "corepack pnpm aliyun:docker:build",
      "corepack pnpm aliyun:container:smoke",
      "corepack pnpm aliyun:image:plan:strict",
    ],
    notes: [
      "image-publish.local.json 只记录非密钥镜像发布证据。",
      "P03 购买/仓库证据已经 ready；P04 仍必须单独完成镜像 push/digest 和 SAE 拉取证据。",
      "ACR 登录凭证只能放在 docker credential helper、RAM/KMS/Secrets Manager 或阿里云运行时配置里。",
    ],
  })

  const apiDomain = cloud.get("apiDomainHttps")
  const assetDomain = cloud.get("assetDomainHttps")
  addTask(tasks, {
    id: "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    title: "配置 api-cn/assets-cn DNS、HTTPS 和 ICP 证据",
    status: domain.ok && apiDomain?.ready && assetDomain?.ready ? "ready" : "blocked",
    blockerCodes: [
      ...domain.machineBlocking,
      ...missingList(apiDomain),
      ...missingList(assetDomain),
    ],
    owner: "阿里云域名/证书操作员",
    consolePath: "阿里云控制台 -> 云解析 DNS / 数字证书管理服务 / SAE 或 SLB/网关 / CDN 或 OSS 域名",
    actions: [
      "把 api-cn.ipgongchang.xin 解析到公网可访问的 SAE/SLB 后端入口。",
      "把 assets-cn.ipgongchang.xin 解析到公网可访问的 OSS/CDN/静态资源入口。",
      "不要把 APP production-cn 正式域名指向 Vercel、localhost、example 或 198.18.0.x 特殊用途网段。",
      "给 api-cn 和 assets-cn 配置 HTTPS 证书。",
      "确认 ICP 备案状态满足国内 APP 正式访问要求。",
      "配置完成后运行严格域名门禁，并把证据写入 cloud-confirmations.local.json 的 apiDomainHttps 与 assetDomainHttps 项。",
    ],
    evidence: [
      "dnsResolvedToAliyun=true",
      "httpsEnabled=true",
      "icpReady=true",
      "corepack pnpm aliyun:domain:strict pass",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
    notes: [
      "dns_special_use_ip 表示当前域名仍解析到特殊用途或占位地址，不是公网可访问的阿里云入口。",
      "域名检查只能证明 DNS/HTTPS/health；ICP备案仍需阿里云或工信部备案证据。",
    ],
  })

  const oss = cloud.get("oss")
  addTask(tasks, {
    id: "T05_ALIYUN_OSS_AUDIO_STORAGE",
    title: "确认服务记录音频 OSS、CORS 和 RAM 最小权限",
    status: oss?.ready ? "ready" : "pending_cloud",
    blockerCodes: missingList(oss),
    owner: "阿里云 OSS/RAM 操作员",
    consolePath: "阿里云控制台 -> OSS Bucket / RAM 访问控制",
    actions: [
      "确认服务记录音频使用的 OSS Bucket 名称和 region。",
      "确认 CORS 允许 APP 所需上传/下载方法和 Header。",
      "确认 RAM 权限限制到服务记录音频前缀 service-records/production-cn。",
      "首选确认 SAE RRSA/OIDC runtime role 已绑定 OSS 最小权限，并由运行环境提供 ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE；如选择 fallback，再把 ALIYUN_OSS_ACCESS_KEY_ID/SECRET 或 STS token 导入受控 secret env。",
      "在 cloud-confirmations.local.json 的 oss 项记录 Bucket、region 和非密钥证据。",
    ],
    evidence: [
      "region=cn-hangzhou",
      "corsConfigured=true",
      "ramLeastPrivilege=true",
      "serviceRecordPrefix=service-records/production-cn",
      "confirmed=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:app-api:smoke",
      "postdeploy service-records upload smoke after API deployment",
    ],
  })

  const envImport = cloud.get("envImport")
  const envImportReady = envImport?.ready === true || cloudConfirmations?.items?.envImport?.confirmed === true
  const cloudImportedEnvNames = new Set(
    isDatabaseUrlCnImported({ cloudConfirmations, rdsMigrationEvidence, envImport }) ? ["DATABASE_URL_CN"] : [],
  )
  const effectiveRequiredBlocking = envPlan.summary.requiredBlocking
    .filter((key) => !cloudImportedEnvNames.has(key))
  addTask(tasks, {
    id: "T06_ALIYUN_ENV_IMPORT",
    title: "导入 production-cn 运行环境变量",
    status: envImportReady && effectiveRequiredBlocking.length === 0 ? "ready" : "blocked",
    blockerCodes: [
      ...effectiveRequiredBlocking.map((key) => `missing_required_env:${key}`),
      ...missingList(envImport),
    ],
    owner: "阿里云运行环境/密钥操作员",
    consolePath: "阿里云 SAE 环境变量 / KMS / Secrets Manager",
    actions: [
      "使用 corepack pnpm aliyun:env:plan 生成不含 value 的变量名核对清单。",
      "从现有 Vercel production、Supabase、阿里云 OSS/百炼、DeepSeek、火山引擎、微信开放平台等来源迁移变量值。",
      "密钥值只导入阿里云运行环境、KMS 或 Secrets Manager，不写入 Docker 镜像、文档或 git。",
      "导入后在 cloud-confirmations.local.json 的 envImport 项记录 importedAt、target 和 secretNotInImage=true。",
    ],
    evidence: [
      "secretNotInImage=true",
      "importedAt=实际导入时间",
      `requiredReady=${Math.min(envPlan.summary.requiredTotal, envPlan.summary.requiredReady + cloudImportedEnvNames.size)}/${envPlan.summary.requiredTotal}`,
      `requiredBlocking=${effectiveRequiredBlocking.length ? effectiveRequiredBlocking.join(",") : "none"}`,
    ],
    verifyCommands: [
      "corepack pnpm aliyun:env:check",
      "corepack pnpm aliyun:readiness:strict",
    ],
  })

  const sls = cloud.get("slsAlerts")
  addTask(tasks, {
    id: "T07_ALIYUN_SLS_ALERTS",
    title: "配置 SLS 日志和健康/5xx 告警",
    status: sls?.ready ? "ready" : "pending_cloud",
    blockerCodes: missingList(sls),
    owner: "阿里云运维操作员",
    consolePath: "阿里云控制台 -> 日志服务 SLS / 应用监控告警",
    actions: [
      "创建或确认 SLS Project 和日志采集配置。",
      "配置 /api/healthz 健康检查失败告警。",
      "配置 5xx 错误率或错误数告警。",
      "建议补 ASR、OSS 上传失败相关告警。",
      "在 cloud-confirmations.local.json 的 slsAlerts 项记录项目名和非密钥证据。",
    ],
    evidence: [
      "healthAlertConfigured=true",
      "serverErrorAlertConfigured=true",
      "confirmed=true",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:cloud:check",
    ],
  })

  addTask(tasks, {
    id: "T08_POSTDEPLOY_REMOTE_SMOKE",
    title: "阿里云部署后远端 smoke 验收",
    status: readiness.productionReady ? "ready" : "waiting_for_deploy",
    blockerCodes: readiness.productionReady ? [] : ["requires_runtime_domain_env_wechat_cloud_confirmations"],
    owner: "后端发布操作员",
    consolePath: "本机终端 + 阿里云部署控制台",
    actions: [
      "完成前置微信、协议、运行时、ACR 镜像、域名、OSS、环境变量和 SLS 任务后部署 production-cn 后端。",
      "先运行 domain strict，确认 api-cn/assets-cn DNS 和 HTTPS 可用。",
      "再运行统一 postdeploy smoke，验证 health 和 APP API guard。",
      "最后运行 APP API online-readonly-boundary，验收 404=0。",
      "微信开放平台或正式协议 URL 未补齐时只能使用 --allow-missing appWechatLogin,legalLinks 做桥接调试，不能作为正式上线结论。",
    ],
    evidence: [
      "corepack pnpm aliyun:domain:strict pass",
      "corepack pnpm aliyun:postdeploy:smoke pass",
      "online-readonly-boundary ok=true and 404=0",
      "strict health 不再缺 appWechatLogin 或 legalLinks",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
      APP_API_ONLINE_READONLY_BOUNDARY_COMMAND,
    ],
  })

  return tasks
}

function buildWechatOpenPlatformActions(reviewStatus) {
  if (reviewStatus === "reviewing") {
    return [
      "当前移动应用已是 reviewing：本地不需要再创建 APP，也不能用小程序凭证绕过。",
      "等待移动应用审核状态从 reviewing 变为 approved。",
    ]
  }
  if (reviewStatus === "not_started") {
    return [
      "当前记录为 not_started：移动应用尚未创建；账号认证完成后，需要在 open.weixin.qq.com 创建“美业话镜”移动应用。",
      "创建移动应用时使用本机 APP 工程信息，不要创建小程序应用或复用小程序凭证。",
      "提交创建前确认 Android release 签名、iOS Bundle ID、Universal Link 和应用资料齐全。",
    ]
  }
  if (reviewStatus === "rejected") {
    return [
      "当前移动应用审核被 rejected：先按微信开放平台驳回原因修正后重新提交。",
      "重新提交前不要填猜测的 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET。",
    ]
  }
  return [
    "确认微信开放平台账号已完成认证后，创建“美业话镜”移动应用并提交审核。",
    "审核通过后把 WECHAT_OPEN_APP_REVIEW_STATUS 更新为 approved，再读取 AppID/AppSecret。",
  ]
}

function wechatSensitiveRequiredUserAction(reviewStatus) {
  const importInstruction = "AppID 只导入阿里云 SAE 服务端 plain env，AppSecret 只导入 KMS/Secrets Manager/SAE secret env。"
  if (reviewStatus === "not_started") {
    return `先在微信开放平台创建“美业话镜”移动应用并提交审核；审核通过后读取 AppID/AppSecret；${importInstruction}`
  }
  if (reviewStatus === "reviewing") {
    return `等待移动应用审核通过后读取 AppID/AppSecret；${importInstruction}`
  }
  if (reviewStatus === "rejected") {
    return `先按微信开放平台驳回原因修正并重新提交；审核通过后读取 AppID/AppSecret；${importInstruction}`
  }
  return `确认微信开放平台账号已认证后创建移动应用；审核通过后读取 AppID/AppSecret；${importInstruction}`
}

function addTask(tasks, task) {
  const blockerCodes = Array.from(new Set((task.blockerCodes || []).filter(Boolean)))
  tasks.push({
    ...task,
    blockerCodes,
    ready: task.status === "ready",
  })
}

function missingList(item) {
  if (!item || item.ready) return []
  return (item.missing || []).map((field) => `${item.key || "cloud"}:${field}`)
}

function summarizeTasks(tasks) {
  return {
    total: tasks.length,
    ready: tasks.filter((task) => task.ready).length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    waitingWechatReview: tasks.filter((task) => task.status === "waiting_wechat_review").length,
    pendingCloud: tasks.filter((task) => task.status === "pending_cloud").length,
    waitingForDeploy: tasks.filter((task) => task.status === "waiting_for_deploy").length,
  }
}

function attachOperatorAuthorization(report) {
  const canStartNowPacketIds = report.currentScope === "backend_aliyun_only"
    ? [...BACKEND_CURRENT_CAN_START_PACKET_IDS]
    : []
  const canStartNowPacketIdSet = new Set(canStartNowPacketIds)
  const allTaskPacketIds = uniqueStrings(report.tasks.flatMap((task) => OPERATOR_TASK_AUTHORIZATION_PACKETS[task.id] || []))
  const deferredAppLaunchPacketIds = report.currentScope === "backend_aliyun_only"
    ? [...BACKEND_DEFERRED_APP_LAUNCH_PACKET_IDS]
    : []
  const deferredAppLaunchPacketIdSet = new Set(deferredAppLaunchPacketIds)
  const completedPacketIdSet = new Set(report.currentScope === "backend_aliyun_only"
    ? [...BACKEND_COMPLETED_PACKET_IDS]
    : [])
  const blockedByPacketDependencies = allTaskPacketIds
    .filter((packetId) => !canStartNowPacketIdSet.has(packetId))
    .filter((packetId) => !deferredAppLaunchPacketIdSet.has(packetId))
    .filter((packetId) => !completedPacketIdSet.has(packetId))
  const blockedByPacketDependencySet = new Set(blockedByPacketDependencies)
  const tasks = report.tasks.map((task) => withOperatorAuthorizationPackets({
    task,
    canStartNowPacketIdSet,
    blockedByPacketDependencySet,
  }))
  const taskPacketBindings = tasks.map((task) => ({
    taskId: task.id,
    actionPacketIds: task.actionPacketIds,
    canStartNowAuthorizationPacketIds: task.canStartNowAuthorizationPacketIds,
    blockedByAuthorizationPacketIds: task.blockedByAuthorizationPacketIds,
    requiresActionTimeConfirmation: task.requiresActionTimeConfirmation === true,
    nonSecretEvidenceOnly: task.nonSecretEvidenceOnly === true,
    writeTargets: task.writeTargets,
  }))
  const secretOrCredentialPacketIds = uniqueStrings(tasks
    .flatMap((task) => task.actionPackets || [])
    .filter((packet) => packet.nonSecretEvidenceOnly !== true)
    .map((packet) => packet.packetId))
  const summary = {
    ...report.summary,
    operatorActionPacketSummary: {
      currentScope: report.currentScope || "full_app_launch",
      canStartNowPacketIds,
      blockedByPacketDependencies,
      deferredAppLaunchPacketIds,
      taskPacketBindingCount: taskPacketBindings.length,
      secretOrCredentialPacketIds,
      taskPacketBindings,
    },
  }
  return {
    ...report,
    summary,
    actionAuthorization: {
      currentScope: report.currentScope || "full_app_launch",
      canDeployNow: false,
      verdict: report.summary.ready === report.summary.total ? "" : "blocked",
      nextActionTimeConfirmationPacketIds: canStartNowPacketIds,
      canStartNowPacketIds,
      blockedByPacketDependencies,
      deferredAppLaunchPacketIds,
    },
    tasks,
  }
}

function withOperatorAuthorizationPackets({
  task,
  canStartNowPacketIdSet,
  blockedByPacketDependencySet,
}) {
  const actionPacketIds = OPERATOR_TASK_AUTHORIZATION_PACKETS[task.id] || []
  const actionPackets = actionPacketIds
    .map((packetId) => compactActionPacket(OPERATOR_AUTHORIZATION_PACKET_METADATA[packetId]))
    .filter(Boolean)
  const canStartNowAuthorizationPacketIds = actionPacketIds.filter((packetId) => canStartNowPacketIdSet.has(packetId))
  const blockedByAuthorizationPacketIds = actionPacketIds.filter((packetId) => blockedByPacketDependencySet.has(packetId))
  return {
    ...task,
    actionPacketIds,
    canStartNowAuthorizationPacketIds,
    blockedByAuthorizationPacketIds,
    requiresActionTimeConfirmation: actionPackets.some((packet) => packet.requiresActionTimeConfirmation),
    nonSecretEvidenceOnly: actionPackets.length > 0 && actionPackets.every((packet) => packet.nonSecretEvidenceOnly),
    writeTargets: uniqueStrings(actionPackets.flatMap((packet) => packet.writeTargets)),
    actionPackets,
  }
}

function compactActionPacket(packet) {
  if (!packet) return null
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title,
    blockerClass: packet.blockerClass,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
    writeTargets: packet.writeTargets || [],
    verifyCommands: packet.verifyCommands || [],
  }
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter((value) => typeof value === "string" && value.trim()))]
}

function buildSensitiveActionItems({ envPlan, readiness, imagePublishPlan, nativeRelease, cloudConfirmations, rdsMigrationEvidence }) {
  const variables = envPlan.variables || []
  const envImport = readiness.checks?.cloudConfirmations?.items?.find((item) => item.key === "envImport")
  const oss = readiness.checks?.cloudConfirmations?.items?.find((item) => item.key === "oss")
  const wechatOpenPlatform = readiness.checks?.wechatOpenPlatform || {}
  const wechatMissing = variables.filter((item) =>
    categoryOf(item) === "wechat_open_platform" &&
    item.status !== "ready"
  )
  const appleTeamId = variables.find((item) => item.name === "APPLE_TEAM_ID")
  const readySecretGroups = groupReadySensitiveVariables(variables)
  const items = []

  if (wechatMissing.length > 0 || wechatOpenPlatform.reviewStatus !== "approved") {
    const variableNames = Array.from(new Set([
      ...wechatMissing.map((item) => item.name),
      "WECHAT_OPEN_APP_ID",
      "WECHAT_OPEN_APP_SECRET",
      "WECHAT_OPEN_APP_REVIEW_STATUS",
    ]))
    items.push({
      id: "S01_WECHAT_OPEN_APP_LOGIN",
      type: "external_credential_after_review",
      status: wechatOpenPlatform.reviewStatus === "approved" && wechatMissing.length === 0 ? "ready" : "blocked",
      owner: "用户/微信开放平台操作员",
      consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 美业话镜 App",
      variableNames,
      variableDetails: variableDetailsFor(variables, variableNames),
      requiredUserAction: wechatSensitiveRequiredUserAction(wechatOpenPlatform.reviewStatus),
      unblockCondition: "reviewStatus=approved 且 WECHAT_OPEN_APP_ID / WECHAT_OPEN_APP_SECRET ready。",
      forbidden: "不能用小程序 AppID/Secret 替代，不能把 AppID 写进 App 包，也不能把 AppSecret 写入文档、镜像或 git。",
    })
  }

  if (!appleTeamId || appleTeamId.status !== "ready") {
    items.push({
      id: "S02_APPLE_TEAM_ID",
      type: "external_identifier",
      status: "blocked",
      owner: "Apple Developer / iOS 发布操作员",
      consolePath: appleTeamId?.consolePath || "Apple Developer -> Membership",
      variableNames: ["APPLE_TEAM_ID"],
      variableDetails: variableDetailsFor(variables, ["APPLE_TEAM_ID"]),
      requiredUserAction: "从 Apple Developer 确认 10 位 Team ID 后导入阿里云 plain env，用于 AASA appID。",
      unblockCondition: "APPLE_TEAM_ID ready 且 aliyun:aasa:check 不再报 apple_team_id_missing。",
      forbidden: "不要猜测 Team ID；需与 iOS Bundle ID com.ipgongchang.meiyehuajing 一致。",
    })
  }

  const purchaseCandidate = imagePublishPlan?.local?.acr?.purchaseCandidate
  if (purchaseCandidate && purchaseCandidate.confirmed !== true) {
    items.push({
      id: "S03_ACR_PAID_PURCHASE",
      type: "paid_purchase_confirmation",
      status: "blocked",
      owner: "用户/阿里云 ACR 操作员",
      consolePath: "阿里云控制台 -> 容器镜像服务 ACR -> 企业版购买页",
      variableNames: [],
      requiredUserAction: `确认是否购买 ${purchaseCandidate.edition} / ${purchaseCandidate.region} / ${purchaseCandidate.duration} / ${purchaseCandidate.quotedAmount}。`,
      unblockCondition: "完成 ACR 企业版实例购买并创建 namespace/repository 后，填入非密钥 registry/image/digest 证据。",
      forbidden: "未获得动作前确认时，不点击付款，不把 registry 密码写入 JSON、文档或 git。",
    })
  }

  if (imagePublishPlan?.ready !== true) {
    items.push({
      id: "S04_ACR_REGISTRY_AUTH",
      type: "registry_password_or_runtime_pull_secret",
      status: "blocked",
      owner: "阿里云 ACR/SAE 操作员",
      consolePath: "阿里云控制台 -> ACR 命名空间/镜像仓库；SAE 应用 -> 镜像拉取配置",
      variableNames: [],
      requiredUserAction: "ACR 实例 ready 后，通过 docker credential helper、RAM、或 SAE 运行时镜像拉取配置完成认证。",
      unblockCondition: "imagePushed=true、digestVerified=true、runtime.remoteImageConfigured=true、runtime.imagePullConfigured=true。",
      forbidden: "registry username/password、RAM Secret、token 不能写入 image-publish.local.json、Docker 镜像、文档或 git。",
    })
  }

  if (!oss?.ready) {
    items.push({
      id: "S05_OSS_RAM_SECRET_OR_STS",
      type: "ram_secret_or_sts_import",
      status: "blocked",
      owner: "阿里云 OSS/RAM 操作员",
      consolePath: "阿里云控制台 -> RAM 访问控制 / OSS Bucket / SAE RRSA/OIDC 运行时角色或环境变量",
      variableNames: [
        "ALIBABA_CLOUD_ROLE_ARN",
        "ALIBABA_CLOUD_OIDC_PROVIDER_ARN",
        "ALIBABA_CLOUD_OIDC_TOKEN_FILE",
        "ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_SECRET",
        "ALIYUN_OSS_SECURITY_TOKEN",
      ],
      variableDetails: variableDetailsFor(variables, [
        "ALIBABA_CLOUD_ROLE_ARN",
        "ALIBABA_CLOUD_OIDC_PROVIDER_ARN",
        "ALIBABA_CLOUD_OIDC_TOKEN_FILE",
        "ALIYUN_OSS_ACCESS_KEY_ID",
        "ALIYUN_OSS_ACCESS_KEY_SECRET",
        "ALIYUN_OSS_SECURITY_TOKEN",
      ]),
      requiredUserAction: "把已创建的 OSS 最小权限策略绑定到实际运行身份；首选 SAE RRSA/OIDC runtime role，并由运行环境提供 role ARN、OIDC provider ARN 和 token file path，AccessKey/STS 仅作 fallback。",
      unblockCondition: "oss.accessMode=sae_runtime_role 时 ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE 可用；或 fallback secret/token 只通过阿里云密钥环境注入；oss.ramLeastPrivilege=true。",
      forbidden: "不创建可提交的长期明文 Secret；不把 AccessKeySecret 或 STS token 写入仓库、文档或镜像。",
    })
  }

  const databaseUrlCn = variables.find((item) => item.name === "DATABASE_URL_CN")
  const databaseUrlCnImported = isDatabaseUrlCnImported({ cloudConfirmations, rdsMigrationEvidence, envImport })
  if ((!databaseUrlCn || databaseUrlCn.status !== "ready") && !databaseUrlCnImported) {
    items.push({
      id: "S08_ALIYUN_RDS_DATABASE_URL",
      type: "database_secret_and_migration",
      status: "blocked",
      owner: "阿里云 RDS/后端数据迁移操作员",
      consolePath: "阿里云控制台 -> RDS PostgreSQL -> 实例/数据库/账号/连接信息；SAE/KMS/Secrets Manager",
      variableNames: ["DATABASE_URL_CN"],
      variableDetails: variableDetailsFor(variables, ["DATABASE_URL_CN"]),
      requiredUserAction: "创建或确认 production-cn RDS PostgreSQL、数据库账号和网络访问策略；先关闭 RDS compatibilityReviewChecklist 7 类 Supabase SQL 兼容审查；完成 Supabase 到 RDS/PostgreSQL 的迁移验收；只把 DATABASE_URL_CN 导入阿里云 secret env。",
      unblockCondition: "rdsPostgres.databaseUrlCnSecretImported=true，compatibilityReviewChecklist 7 类已处理，migration.schemaCompatibilityReviewed=true、migration.supabaseSpecificSqlResolved=true、migration.rdsExtensionSupportConfirmed=true，且 APP 首版后端数据访问不再把 Supabase 作为正式 production-cn 数据库目标。",
      forbidden: "不能把 DATABASE_URL_CN、数据库密码、dump 内容、Supabase service role key、AccessKeySecret 或 token 写入 JSON、Markdown、Docker 镜像、APP 包、小程序包或 git。",
    })
  }

  if (!envImport?.ready && readySecretGroups.length > 0) {
    items.push({
      id: "S06_READY_SENSITIVE_ENV_IMPORT",
      type: "ready_sensitive_env_need_cloud_import",
      status: "blocked",
      owner: "阿里云运行环境/密钥操作员",
      consolePath: "阿里云 SAE 应用 -> 环境变量 / KMS / Secrets Manager",
      variableGroups: readySecretGroups,
      variableNames: readySecretGroups.flatMap((group) => group.variableNames),
      variableDetails: variableDetailsFor(variables, readySecretGroups.flatMap((group) => group.variableNames)),
      requiredUserAction: "这些敏感或连接类变量名在本地已有 ready 值，但仍需导入阿里云运行环境；脚本只输出变量名，不输出值。",
      unblockCondition: "envImport.confirmed=true 且 envImport.secretNotInImage=true。",
      forbidden: "不要把任何 value 复制到文档、release manifest、Dockerfile、image 或 git。",
    })
  }

  const androidSigningItem = buildAndroidReleaseSigningSensitiveItem({ nativeRelease, wechatOpenPlatform })
  if (androidSigningItem) items.push(androidSigningItem)

  return items.map(withSensitiveActionMetadata)
}

function isDatabaseUrlCnImported({ cloudConfirmations, rdsMigrationEvidence, envImport }) {
  const cloudEnvImport = cloudConfirmations?.items?.envImport || {}
  const rdsLocal = rdsMigrationEvidence?.local || {}
  const rdsPostgres = rdsLocal.rdsPostgres || {}
  const migration = rdsLocal.migration || {}
  return (
    rdsPostgres.databaseUrlCnSecretImported === true &&
    migration.schemaMigrated === true &&
    migration.dataMigrated === true &&
    migration.appApiSmokeOnRdsPassed === true &&
    (
      envImport?.ready === true ||
      cloudEnvImport.confirmed === true ||
      cloudEnvImport.rdsSecretImported === true
    )
  )
}

function buildAndroidReleaseSigningSensitiveItem({ nativeRelease, wechatOpenPlatform }) {
  const android = nativeRelease?.android || {}
  const androidSignature = String(wechatOpenPlatform.androidSignature || "").trim()
  const hasReleaseWechatSignature = Boolean(androidSignature && !/^TODO_|^pending_/i.test(androidSignature))
  const androidConfigured = wechatOpenPlatform.androidConfigured === true
  const releaseSigningConfigReady = android.releaseSigningConfigReady === true
  const releaseUsesDebugSigning = android.releaseUsesDebugSigning === true
  const status = releaseSigningConfigReady && !releaseUsesDebugSigning && hasReleaseWechatSignature && androidConfigured
    ? "ready"
    : "blocked"

  if (status === "ready") return null

  const variableNames = [
    "MEIYE_RELEASE_STORE_FILE",
    "MEIYE_RELEASE_STORE_PASSWORD",
    "MEIYE_RELEASE_KEY_ALIAS",
    "MEIYE_RELEASE_KEY_PASSWORD",
  ]

  return {
    id: "S07_ANDROID_RELEASE_SIGNING",
    type: "android_keystore_password_or_signature",
    status,
    owner: "Android 发布操作员 / 微信开放平台操作员",
    consolePath: "本机 Android release signing / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名",
    variableNames,
    variableDetails: androidReleaseSigningVariableDetails({
      variableNames,
      releaseSigningConfigReady,
      releaseUsesDebugSigning,
      hasReleaseWechatSignature,
      androidConfigured,
    }),
    requiredUserAction: "提供或确认 Android release keystore、store password、key alias、key password；用 release APK/AAB 生成微信开放平台 Android 应用签名并回填。",
    unblockCondition: "assembleRelease 成功，release 包不是 debug keystore 签名，微信开放平台记录 release 签名且 androidConfigured=true。",
    forbidden: "不能使用 debug.keystore；不能把 keystore 文件、store password、key password、证书私钥或微信 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。",
  }
}

function androidReleaseSigningVariableDetails({
  variableNames,
  releaseSigningConfigReady,
  releaseUsesDebugSigning,
  hasReleaseWechatSignature,
  androidConfigured,
}) {
  const status = releaseSigningConfigReady && !releaseUsesDebugSigning ? "required_at_build_time" : "native_release_config_blocked"
  return variableNames.map((name) => ({
    name,
    required: true,
    status,
    sensitivity: name.endsWith("_FILE") || name.endsWith("_ALIAS") ? "controlled_identifier" : "secret",
    sourceCategory: "android_release_signing",
    owner: "Android 发布操作员 / CI Secret Store",
    consolePath: "本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。",
    obtain: "从已有 Android release keystore 管理位置或发布负责人处确认；若尚未生成，需要按公司发布流程创建并安全保存。",
    importTarget: "本机/CI Android signing secret store，不导入阿里云 SAE env。",
    cloudConfirmationKey: "wechatOpenPlatform",
    action: "动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。",
    notes: [
      `releaseSigningConfigReady=${releaseSigningConfigReady}`,
      `releaseUsesDebugSigning=${releaseUsesDebugSigning}`,
      `wechatSignatureRecorded=${hasReleaseWechatSignature}`,
      `androidConfigured=${androidConfigured}`,
    ].join("; "),
  }))
}

function variableDetailsFor(variables, names) {
  const seen = new Set()
  return names
    .filter((name) => {
      if (!name || seen.has(name)) return false
      seen.add(name)
      return true
    })
    .map((name) => {
      const item = variables.find((variable) => variable.name === name)
      if (!item) {
        return {
          name,
          required: false,
          status: "unknown",
          sensitivity: "unknown",
          sourceCategory: "unknown",
          owner: "unknown",
          consolePath: "",
          obtain: "",
          importTarget: "",
          cloudConfirmationKey: "",
          action: "变量未出现在 env import plan 中；先检查 REQUIRED_KEYS/OPTIONAL_KEYS。",
          notes: "",
        }
      }
      return {
        name: item.name,
        required: item.required,
        status: item.status,
        sensitivity: item.sensitivity,
        sourceCategory: categoryOf(item),
        owner: item.owner,
        consolePath: item.consolePath,
        obtain: item.obtain,
        importTarget: item.importTarget,
        cloudConfirmationKey: item.cloudConfirmationKey,
        action: item.action,
        notes: item.notes,
      }
    })
}

function withSensitiveActionMetadata(item) {
  const metadata = SENSITIVE_ACTION_METADATA[item.id] || {}
  return {
    ...item,
    obtainFrom: metadata.obtainFrom || item.consolePath,
    writeTargets: metadata.writeTargets || [],
    verifyCommands: metadata.verifyCommands || [],
    requiresActionTimeConfirmation: metadata.requiresActionTimeConfirmation === true,
    completionEvidence: metadata.completionEvidence || [],
  }
}

function groupReadySensitiveVariables(variables) {
  const groups = new Map()
  for (const item of variables) {
    if (item.status !== "ready") continue
    if (item.sensitivity === "public") continue
    if (item.cloudConfirmationKey !== "envImport" && item.cloudConfirmationKey !== "oss") continue
    const category = categoryOf(item)
    const key = `${category}:${item.importTarget}`
    const existing = groups.get(key) || {
      category,
      owner: item.owner,
      importTarget: item.importTarget,
      variableNames: [],
    }
    existing.variableNames.push(item.name)
    groups.set(key, existing)
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    count: group.variableNames.length,
    variableNames: group.variableNames.sort(),
  }))
}

function categoryOf(item) {
  return item.sourceCategory || item.category || "unknown"
}

function defaultBridgeDataLayer() {
  return {
    current: "Supabase migration source / legacy compatibility only",
    target: "Aliyun RDS PostgreSQL",
    status: "blocked_until_aliyun_rds_postgresql_migration_ready",
    firstBridgeDeploymentUses: "not_allowed_for_final_production_cn",
    supabaseBridgeReady: false,
    supabaseSourceReady: true,
    databaseUrlCnStatus: "unknown",
    redisUrlCnStatus: "unknown",
    rdsMigrationIncludedInThisRelease: false,
    rdsMigrationRequiredForFinalProductionCn: true,
    notes: [
      "正式国内 production-cn 目标必须使用阿里云 RDS PostgreSQL。",
      "Supabase 只能作为迁移来源或旧链路兼容，不能解除 DATABASE_URL_CN 阻塞。",
    ],
  }
}

function renderMarkdown(report) {
  const lines = [
    "# 美业话镜 APP production-cn 操作员任务清单",
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 结论",
    "",
    ...(report.currentScope ? [
      `- currentScope: ${report.currentScope}`,
      `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
      `- canProceedWithoutWechat: ${report.canProceedWithoutWechat}`,
    ] : []),
    `- productionReady: ${report.readiness.productionReady}`,
    `- localCodeReady: ${report.readiness.localCodeReady}`,
    `- domainReady: ${report.domain.ok}`,
    `- imagePublishReady: ${report.imagePublishPlan.ready}`,
    `- env requiredReady: ${report.env.summary.requiredReady} / ${report.env.summary.requiredTotal}`,
    `- tasks ready: ${report.summary.ready} / ${report.summary.total}`,
    `- waitingWechatReview: ${report.summary.waitingWechatReview}`,
    `- sensitiveActionItems: ${report.sensitiveActionItems.length}`,
    `- bridgeDataLayer: ${report.bridgeDataLayer.current} -> ${report.bridgeDataLayer.target}`,
    "",
    "## 动作包总览",
    "",
    ...(report.actionAuthorization ? [
      `- nextActionTimeConfirmationPacketIds: ${report.actionAuthorization.nextActionTimeConfirmationPacketIds.join(", ") || "none"}`,
      `- canStartNowPacketIds: ${report.actionAuthorization.canStartNowPacketIds.join(", ") || "none"}`,
      `- blockedByPacketDependencies: ${report.actionAuthorization.blockedByPacketDependencies.join(", ") || "none"}`,
      `- secretOrCredentialPacketIds: ${report.summary.operatorActionPacketSummary.secretOrCredentialPacketIds.join(", ") || "none"}`,
      "",
    ] : []),
    "## 当前阻塞",
    "",
    "### Readiness / env / APP native",
    "",
    ...(report.readiness.machineBlocking.length
      ? report.readiness.machineBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "### Domain / DNS / HTTPS",
    "",
    ...(report.domain.machineBlocking.length
      ? report.domain.machineBlocking.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## 环境变量来源清单",
    "",
    `- containsValues: ${report.env.containsValues === false ? "false" : "unknown"}`,
    `- variables: ${report.env.summary.total}`,
    `- sourceMetadataReady: ${report.env.summary.sourceMetadataReady} / ${report.env.summary.total}`,
    "",
    ...(report.env.requiredBlockingDetails.length
      ? report.env.requiredBlockingDetails.flatMap((item) => [
          `### ${item.name}`,
          "",
          `- owner: ${item.owner}`,
          `- consolePath: ${item.consolePath}`,
          `- obtain: ${item.obtain}`,
          `- importTarget: ${item.importTarget}`,
          `- cloudConfirmationKey: ${item.cloudConfirmationKey}`,
          "",
        ])
      : ["- requiredBlocking: none", ""]),
    "",
    "## RDS PostgreSQL 数据层迁移证据",
    "",
    `- file: ${report.rdsMigrationEvidence.file}`,
    `- exists: ${report.rdsMigrationEvidence.exists}`,
    `- ready: ${report.rdsMigrationEvidence.ready}`,
    `- totalBlockers: ${report.rdsMigrationEvidence.totalBlockers}`,
    `- appApiRoutesWithSupabase: ${report.rdsMigrationEvidence.appApiRoutesWithSupabase}`,
    `- appApiRoutesWithSupabaseDataAccess: ${report.rdsMigrationEvidence.appApiRoutesWithSupabaseDataAccess}`,
    `- firstVersionRdsRoutesWithSupabaseDataAccess: ${report.rdsMigrationEvidence.firstVersionRdsRoutesWithSupabaseDataAccess}`,
    `- postgresDataAccessAdapterDetected: ${report.rdsMigrationEvidence.postgresDataAccessAdapterDetected}`,
    ...(report.rdsMigrationEvidence.blockers.length
      ? report.rdsMigrationEvidence.blockers.map((item) => `- blocker: ${item}`)
      : ["- blocker: none"]),
    "",
    "## 密钥/密码/token/付款/受控标识符类人工介入项",
    "",
    ...(report.sensitiveActionItems.length
      ? report.sensitiveActionItems.flatMap((item) => [
          `### ${item.id}`,
          "",
          `- type: ${item.type}`,
          `- status: ${item.status}`,
          `- owner: ${item.owner}`,
          `- consolePath: ${item.consolePath}`,
          `- obtainFrom: ${item.obtainFrom || item.consolePath}`,
          `- writeTargets: ${(item.writeTargets || []).length ? item.writeTargets.join("; ") : "none"}`,
          `- verifyCommands: ${(item.verifyCommands || []).length ? item.verifyCommands.join("; ") : "none"}`,
          `- requiresActionTimeConfirmation: ${item.requiresActionTimeConfirmation === true}`,
          `- completionEvidence: ${(item.completionEvidence || []).length ? item.completionEvidence.join("; ") : "none"}`,
          `- variableNames: ${(item.variableNames || []).length ? item.variableNames.join(", ") : "none"}`,
          `- requiredUserAction: ${item.requiredUserAction}`,
          `- unblockCondition: ${item.unblockCondition}`,
          `- forbidden: ${item.forbidden}`,
          "",
        ])
      : ["- none", ""]),
    "",
    "## 数据层桥接状态",
    "",
    `- current: ${report.bridgeDataLayer.current}`,
    `- target: ${report.bridgeDataLayer.target}`,
    `- status: ${report.bridgeDataLayer.status}`,
    `- firstBridgeDeploymentUses: ${report.bridgeDataLayer.firstBridgeDeploymentUses}`,
    `- supabaseBridgeReady: ${report.bridgeDataLayer.supabaseBridgeReady}`,
    `- DATABASE_URL_CN: ${report.bridgeDataLayer.databaseUrlCnStatus}`,
    `- REDIS_URL_CN: ${report.bridgeDataLayer.redisUrlCnStatus}`,
    `- rdsMigrationIncludedInThisRelease: ${report.bridgeDataLayer.rdsMigrationIncludedInThisRelease}`,
    `- rdsMigrationRequiredForFinalProductionCn: ${report.bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn}`,
    ...(report.bridgeDataLayer.notes || []).map((item) => `- ${item}`),
    "",
    "## 任务",
    "",
  ]

  for (const task of report.tasks) {
    lines.push(
      `### ${task.id} ${task.title}`,
      "",
      `- status: ${task.status}`,
      `- owner: ${task.owner}`,
      `- consolePath: ${task.consolePath}`,
      `- blockers: ${task.blockerCodes.length ? task.blockerCodes.join(", ") : "none"}`,
      `- actionPacketIds: ${(task.actionPacketIds || []).length ? task.actionPacketIds.join(", ") : "none"}`,
      `- canStartNowAuthorizationPacketIds: ${(task.canStartNowAuthorizationPacketIds || []).length ? task.canStartNowAuthorizationPacketIds.join(", ") : "none"}`,
      `- blockedByAuthorizationPacketIds: ${(task.blockedByAuthorizationPacketIds || []).length ? task.blockedByAuthorizationPacketIds.join(", ") : "none"}`,
      `- requiresActionTimeConfirmation: ${task.requiresActionTimeConfirmation === true}`,
      `- nonSecretEvidenceOnly: ${task.nonSecretEvidenceOnly === true}`,
      `- writeTargets: ${(task.writeTargets || []).length ? task.writeTargets.join("; ") : "none"}`,
      "- actions:",
      ...task.actions.map((item) => `  - ${item}`),
      "- evidence:",
      ...task.evidence.map((item) => `  - ${item}`),
      "- verifyCommands:",
      ...task.verifyCommands.map((item) => `  - ${item}`),
      ...(task.notes?.length ? ["- notes:", ...task.notes.map((item) => `  - ${item}`)] : []),
      "",
    )
  }

  lines.push(
    "## 安全边界",
    "",
    "- 本清单不包含任何密钥值。",
    "- 不要把 AppSecret、Service Role Key、OSS Secret、语音/LLM Token 写入文档或 git。",
    "- 生产部署、DNS 改动、资源创建、环境变量导入、微信上传和 git push 都需要单独授权。",
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
  const env = parseEnvFile(args.envFile)
  const envPlan = buildImportPlan(env)
  const readiness = runJson("readiness", [
    "scripts/check-aliyun-production-cn-readiness.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
    "--allow-blocking",
  ])
  const domain = runJson("domain", [
    "scripts/check-aliyun-domain-readiness.mjs",
    "--env-file",
    args.envFile,
    "--allow-blocking",
  ])
  const cloudConfirmations = readJsonIfExists(args.cloudConfirmationsFile)
  const imagePublishPlan = runJson("image_publish_plan", [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--local",
    args.imagePublishFile,
    "--allow-incomplete",
  ])
  const rdsMigrationEvidence = runJson("rds_migration_evidence", [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--local",
    args.rdsMigrationFile,
  ])
  const nativeRelease = runJson("app_native_release", [
    "scripts/check-app-native-release-config.mjs",
    "--allow-blocking",
  ])
  const cloudEnvImport = readiness.checks?.cloudConfirmations?.items?.find((item) => item.key === "envImport")
  const cloudImportedRequiredEnvNames = isDatabaseUrlCnImported({
    cloudConfirmations,
    rdsMigrationEvidence,
    envImport: cloudEnvImport,
  }) ? ["DATABASE_URL_CN"] : []
  const tasks = buildTasks({ envPlan, readiness, domain, cloudConfirmations, imagePublishPlan, rdsMigrationEvidence })
  const sensitiveActionItems = buildSensitiveActionItems({
    envPlan,
    readiness,
    imagePublishPlan,
    nativeRelease,
    cloudConfirmations,
    rdsMigrationEvidence,
  })
  let report = {
    generatedAt: new Date().toISOString(),
    containsValues: false,
    envFile: args.envFile,
    cloudConfirmationsFile: existsSync(args.cloudConfirmationsFile) ? args.cloudConfirmationsFile : null,
    cloudImportedRequiredEnvNames,
    summary: summarizeTasks(tasks),
    sensitiveActionItems,
    readiness: {
      productionReady: readiness.productionReady,
      localCodeReady: readiness.localCodeReady,
      machineBlocking: readiness.machineBlocking,
      manualBlocking: readiness.manualBlocking,
    },
    domain: {
      ok: domain.ok,
      targetReady: domain.targetReady,
      targetTotal: domain.targetTotal,
      machineBlocking: domain.machineBlocking,
    },
    imagePublishPlan: {
      ready: imagePublishPlan.ready === true,
      templateReady: imagePublishPlan.summary?.templateReady === true,
      localExists: imagePublishPlan.summary?.localExists === true,
      localReady: imagePublishPlan.summary?.localReady === true,
      totalBlockers: imagePublishPlan.summary?.totalBlockers ?? 0,
      localDockerImage: imagePublishPlan.localDockerImage?.status || "unknown",
    },
    rdsMigrationEvidence: {
      file: rdsMigrationEvidence.local?.file || args.rdsMigrationFile,
      exists: rdsMigrationEvidence.local?.exists === true,
      ready: rdsMigrationEvidence.local?.ready === true,
      totalBlockers: rdsMigrationEvidence.summary?.totalBlockers ?? (rdsMigrationEvidence.local?.blockers || []).length,
      blockers: rdsMigrationEvidence.local?.blockers || [],
      appApiRoutesWithSupabase: rdsMigrationEvidence.summary?.appApiRoutesWithSupabase || 0,
      appApiRoutesWithSupabaseDataAccess: rdsMigrationEvidence.summary?.appApiRoutesWithSupabaseDataAccess || 0,
      firstVersionRdsRoutesWithSupabaseDataAccess: rdsMigrationEvidence.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0,
      postgresDataAccessAdapterDetected: rdsMigrationEvidence.summary?.postgresDataAccessAdapterDetected === true,
    },
    nativeRelease: {
      androidReady: nativeRelease.android?.ready === true,
      androidReleaseSigningConfig: nativeRelease.android?.releaseSigningConfig || "",
      androidReleaseUsesDebugSigning: nativeRelease.android?.releaseUsesDebugSigning === true,
      androidReleaseSigningConfigReady: nativeRelease.android?.releaseSigningConfigReady === true,
      iosReady: nativeRelease.ios?.ready === true,
    },
    bridgeDataLayer: readiness.checks?.bridgeDataLayer || defaultBridgeDataLayer(),
    env: {
      containsValues: false,
      summary: envPlan.summary,
      requiredBlocking: envPlan.summary.requiredBlocking,
      requiredBlockingDetails: envPlan.variables
        .filter((item) => envPlan.summary.requiredBlocking.includes(item.name))
        .map((item) => ({
          name: item.name,
          sensitivity: item.sensitivity,
          owner: item.owner,
          consolePath: item.consolePath,
          obtain: item.obtain,
          importTarget: item.importTarget,
          cloudConfirmationKey: item.cloudConfirmationKey,
        })),
    },
    tasks,
    nextCommandOrder: [
      "corepack pnpm aliyun:operator:tasks",
      "corepack pnpm aliyun:cloud:check",
      "corepack pnpm aliyun:cloud:confirmations:strict",
      "corepack pnpm aliyun:image:plan:strict",
      "corepack pnpm aliyun:domain:strict",
      "corepack pnpm aliyun:readiness:cloud-ready",
      "corepack pnpm aliyun:release:artifacts",
      "corepack pnpm aliyun:docker:build",
      "corepack pnpm aliyun:container:smoke",
      "corepack pnpm aliyun:postdeploy:smoke -- --base-url https://api-cn.ipgongchang.xin",
    ],
  }
  if (args.backendOnly) report = applyBackendOnlyScope(report)
  report = attachOperatorAuthorization(report)

  const json = JSON.stringify(report, null, 2)
  console.log(json)
  writeOutput(args.outPath, `${json}\n`)
  writeOutput(args.markdownPath, renderMarkdown(report))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-operator-tasks.mjs [--backend-only] [--env-file path] [--cloud-confirmations path] [--rds-migration path] [--image-publish path] [--out /tmp/tasks.json] [--markdown /tmp/tasks.md]",
    "",
    "Generates a non-secret Aliyun/WeChat operator task list from env plan, readiness, cloud confirmations, and domain probes.",
    "--backend-only excludes deferred WeChat Open Platform, Apple Team ID, Android signing, and APP legal-page publishing tasks.",
    "It does not create cloud resources, import secrets, deploy, or push.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
