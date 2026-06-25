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

const CURRENT_SCOPE = "backend_aliyun_only"
const FULL_APP_LAUNCH_SCOPE = "deferred_after_backend_online"
const APP_LAUNCH_ACTION_IDS = new Set([
  "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
  "U10_ANDROID_RELEASE_SIGNING",
  "U02_APPLE_TEAM_ID",
])
const APP_LAUNCH_PACKET_IDS = new Set([
  "P01_WECHAT_OPEN_MOBILE_APP",
  "P10_ANDROID_RELEASE_SIGNING",
  "P02_APPLE_TEAM_ID",
])
const APP_LAUNCH_REQUIRED_NAMES = new Set([
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
  "APPLE_TEAM_ID",
])
const APP_LAUNCH_BLOCKER_PATTERNS = [
  /WECHAT_OPEN_APP_ID/,
  /WECHAT_OPEN_APP_SECRET/,
  /APPLE_TEAM_ID/,
  /MEIYE_RELEASE_/,
  /wechat_open_platform/i,
  /app_universal_link/i,
  /微信开放平台移动应用/,
  /Apple Developer Team ID/,
  /Android release signing/i,
]

const POLICY_BY_ACTION_ID = Object.freeze({
  U00_ALIYUN_READONLY_INVENTORY_IDENTITY: Object.freeze({
    automationPolicy: "readonly_inventory_identity_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "readonly_cloud_inventory_identity",
    why: "严格云证据必须来自 allowlisted Aliyun CLI/CloudShell 只读盘点；浏览器已登录不能直接等同于 cloudInventory strict ready。",
  }),
  U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE: Object.freeze({
    automationPolicy: "external_platform_review_required",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "external_identifier_and_secret_after_review",
    why: "微信开放平台账号认证不等于移动应用已创建；移动应用审核通过前没有 APP 登录 AppID/AppSecret。",
  }),
  U10_ANDROID_RELEASE_SIGNING: Object.freeze({
    automationPolicy: "android_release_signing_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "android_keystore_password_or_signature",
    why: "Android release keystore、签名密码和微信开放平台 Android 应用签名必须来自受控发布链路，不能用 debug 签名或写入仓库。",
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
  U11_ALIYUN_RDS_DATA_MIGRATION: Object.freeze({
    automationPolicy: "rds_creation_and_database_migration_requires_action_time_confirmation",
    canCodexProceedWithoutUser: false,
    requiresActionTimeConfirmation: true,
    blockerClass: "database_secret_and_migration",
    why: "正式国内 production-cn 数据库目标必须是阿里云 RDS PostgreSQL；创建实例、导入 DATABASE_URL_CN 和迁移数据都需要动作时确认。",
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

const AUTHORIZATION_PACKET_BY_ACTION_ID = Object.freeze({
  U00_ALIYUN_READONLY_INVENTORY_IDENTITY: Object.freeze({
    packetId: "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    sequenceGroup: "readonly_inventory",
    dependsOn: [],
    minimumUserPhrase: "授权重新连接阿里云 CloudShell 或配置 Aliyun CLI，只运行 allowlisted 只读盘点命令并写入非密钥 evidence。",
    allowedActions: [
      "使用阿里云官方 CLI 或 CloudShell 的只读身份。",
      "只运行本仓库生成的 List/Describe/stat/get inventory 命令。",
      "只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。",
    ],
    explicitlyExcluded: [
      "不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。",
      "不执行 docker login/push。",
      "不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。",
      "不做 production-cn deploy、env import、资源创建或计费动作。",
    ],
    completionEvidence: [
      "cloudInventoryResults.localReady=true",
      "readyLocalOperations=9/9",
      "executedCommandResults=9/9",
      "mutationPerformedCommandResults=0",
    ],
  }),
  U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE: Object.freeze({
    packetId: "P01_WECHAT_OPEN_MOBILE_APP",
    sequenceGroup: "identity",
    dependsOn: [],
    minimumUserPhrase: "授权在微信开放平台创建/补全美业话镜移动应用资料并提交审核；不读取或输出 AppSecret。",
    allowedActions: [
      "只在微信开放平台移动应用页面填写 APP 资料、Android 包名/签名、iOS Bundle ID/Universal Link。",
      "提交移动应用审核，并在审核通过后记录 AppID ready 状态。",
      "只把 AppID 导入 SAE plain env；AppSecret 只能在动作时导入 KMS/Secrets Manager/SAE secret env。",
    ],
    explicitlyExcluded: [
      "不使用小程序 AppID/Secret 替代移动应用凭证。",
      "不把 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。",
      "不做小程序上传或 APP 商店提交。",
    ],
    completionEvidence: [
      "wechatOpenPlatform.mobileAppCreated=true",
      "wechatOpenPlatform.reviewStatus=approved",
      "WECHAT_OPEN_APP_ID ready",
      "WECHAT_OPEN_APP_SECRET imported through secret env only",
    ],
  }),
  U10_ANDROID_RELEASE_SIGNING: Object.freeze({
    packetId: "P10_ANDROID_RELEASE_SIGNING",
    sequenceGroup: "app_signing",
    dependsOn: [],
    minimumUserPhrase: "授权使用受控 Android release keystore 构建/签名 release 包并读取微信开放平台 Android 应用签名；不输出 keystore 密码。",
    allowedActions: [
      "只在本机或 CI 受控 signing secret store 配置 MEIYE_RELEASE_STORE_FILE、MEIYE_RELEASE_STORE_PASSWORD、MEIYE_RELEASE_KEY_ALIAS、MEIYE_RELEASE_KEY_PASSWORD。",
      "运行 assembleRelease 或等价 release 包构建，并用 apksigner/微信签名工具从 release APK/AAB 读取 Android 应用签名。",
      "只把签名 hash、非密钥证据句柄和 androidConfigured 布尔状态记录到微信开放平台与 .local.json。",
    ],
    explicitlyExcluded: [
      "不使用 debug.keystore、debug APK 或 debug 签名。",
      "不把 keystore 文件、store password、key password、证书私钥或微信 AppSecret 写入 JSON、Markdown、Docker 镜像或 git。",
      "不创建微信开放平台移动应用、不提交审核；这些必须由 P01 单独授权。",
    ],
    completionEvidence: [
      "Android release build succeeds with signingConfigs.release",
      "release APK/AAB exists and is not signed with debug.keystore",
      "wechatOpenPlatform.androidSignature records release signature evidence only",
      "wechatOpenPlatform.androidConfigured=true",
    ],
  }),
  U02_APPLE_TEAM_ID: Object.freeze({
    packetId: "P02_APPLE_TEAM_ID",
    sequenceGroup: "identity",
    dependsOn: [],
    minimumUserPhrase: "授权读取 Apple Developer Team ID 并导入阿里云 plain env。",
    allowedActions: [
      "从 Apple Developer Membership 或 Identifiers 页面读取 10 位 Team ID。",
      "把 APPLE_TEAM_ID 导入 SAE plain env，用于 AASA appID。",
      "记录非密钥证据句柄。",
    ],
    explicitlyExcluded: [
      "不猜测 Team ID。",
      "不创建/修改证书、描述文件或 App Store Connect 记录。",
    ],
    completionEvidence: [
      "APPLE_TEAM_ID ready",
      "aliyun:aasa:check no longer reports apple_team_id_missing",
    ],
  }),
  U03_ACR_PURCHASE_CONFIRMATION: Object.freeze({
    packetId: "P03_ACR_PURCHASE",
    sequenceGroup: "cloud_foundation",
    dependsOn: [],
    minimumUserPhrase: "授权购买 ACR Enterprise Economic，cn-hangzhou，1 个月，当前报价 CNY 117.00。",
    allowedActions: [
      "在阿里云 ACR 企业版购买页确认规格、地域、时长和金额。",
      "完成购买后创建或确认实例、namespace 和 repository。",
      "只记录 registry host、namespace、repository 和非密钥购买证据。",
    ],
    explicitlyExcluded: [
      "未明确确认金额前不点击付款。",
      "不执行 docker login/push。",
      "不记录 registry password、RAM Secret 或 token。",
    ],
    completionEvidence: [
      "acr.purchaseCandidate.confirmed=true",
      "acr.registryHost actual aliyuncs.com host",
      "acr.namespace created",
      "repository=meiye-huajing-app-api",
    ],
  }),
  U04_ACR_RUNTIME_AUTH: Object.freeze({
    packetId: "P04_ACR_IMAGE_AND_PULL",
    sequenceGroup: "image_runtime",
    dependsOn: ["P03_ACR_PURCHASE"],
    minimumUserPhrase: "授权把后端镜像推送到已创建的 ACR，并配置 SAE 拉取该镜像；不输出 registry 密码。",
    allowedActions: [
      "构建并 smoke 本地 Docker 镜像。",
      "通过受控 docker credential helper、RAM 或阿里云运行时配置完成镜像推送/拉取。",
      "在 image-publish.local.json 记录 remote image、sha256 digest 和布尔证据。",
    ],
    explicitlyExcluded: [
      "不购买 ACR。",
      "不把 registry username/password、RAM Secret 或 token 写入文件、镜像或 git。",
      "不部署 production-cn，除非 U09 单独授权。",
    ],
    completionEvidence: [
      "acr.imagePushed=true",
      "acr.digestVerified=true",
      "runtime.remoteImageConfigured=true",
      "runtime.imagePullConfigured=true",
      "remoteDigest sha256 verified",
    ],
  }),
  U05_OSS_RAM_OR_STS: Object.freeze({
    packetId: "P05_OSS_RAM_STS",
    sequenceGroup: "cloud_foundation",
    dependsOn: [],
    minimumUserPhrase: "授权为服务记录音频 OSS 配置最小权限 RAM/STS 或运行时角色，并只通过密钥环境注入。",
    allowedActions: [
      "确认 bucket、region、CORS 和 service-records/production-cn 前缀。",
      "绑定最小权限 RAM 策略或配置 STS/运行时角色。",
      "只把 AccessKeySecret 或 STS token 导入 KMS/Secrets Manager/SAE secret env。",
    ],
    explicitlyExcluded: [
      "不创建可提交的长期明文 Secret。",
      "不下载 OSS 对象内容。",
      "不把 AccessKeySecret 或 STS token 写入 JSON、Markdown、镜像或 git。",
    ],
    completionEvidence: [
      "oss.confirmed=true",
      "oss.ramLeastPrivilege=true",
      "serviceRecordPrefix=service-records/production-cn",
      "secret imported through Aliyun controlled secret env only",
    ],
  }),
  U11_ALIYUN_RDS_DATA_MIGRATION: Object.freeze({
    packetId: "P11_ALIYUN_RDS_DATA_MIGRATION",
    sequenceGroup: "cloud_foundation",
    dependsOn: [],
    minimumUserPhrase: "授权创建/确认阿里云 RDS PostgreSQL production-cn 数据库并完成数据迁移；DATABASE_URL_CN 只能进入阿里云 secret env。",
    allowedActions: [
      "创建或确认 cn-hangzhou RDS PostgreSQL 实例、数据库、账号和网络白名单/内网访问策略。",
      "执行 Supabase 到 RDS/PostgreSQL 的 schema/data 迁移与回滚验收。",
      "只把 DATABASE_URL_CN 导入 KMS/Secrets Manager/SAE secret env，并记录非密钥迁移证据。",
    ],
    explicitlyExcluded: [
      "不把数据库密码、连接串 value 或 Supabase service role key 写入 JSON、Markdown、Docker 镜像或 git。",
      "不把 Supabase 当作正式 production-cn 数据库目标。",
      "不执行破坏性数据迁移，除非迁移计划和回滚验收已单独确认。",
    ],
    completionEvidence: [
      "Aliyun RDS PostgreSQL instance exists in cn-hangzhou",
      "DATABASE_URL_CN imported through secret env only",
      "backend production-cn data access no longer depends on Supabase as formal database target",
      "migration and rollback validation pass",
    ],
  }),
  U06_ENV_IMPORT: Object.freeze({
    packetId: "P06_ENV_IMPORT",
    sequenceGroup: "runtime_config",
    dependsOn: ["P05_OSS_RAM_STS", "P11_ALIYUN_RDS_DATA_MIGRATION"],
    minimumUserPhrase: "授权把已准备好的 production-cn 环境变量导入 SAE/KMS/Secrets Manager；不在报告中显示任何 value。",
    allowedActions: [
      "按 env handoff 清单导入 plain env 和 secret env。",
      "plain env 只放非密钥标识符和公开配置。",
      "secret env 通过 KMS/Secrets Manager/SAE secret env 导入。",
      "完成后只记录 importedAt、target 和 secretNotInImage=true。",
    ],
    explicitlyExcluded: [
      "不把任何 value 粘贴到 Markdown、JSON、Dockerfile、镜像或 git。",
      "不导入 WECHAT_OPEN_APP_ID/SECRET，除非移动应用审核已通过并单独授权。",
      "不部署 production-cn。",
    ],
    completionEvidence: [
      "envImport.confirmed=true",
      "envImport.secretNotInImage=true",
      "importedAt actual timestamp",
      "corepack pnpm aliyun:readiness:cloud-ready no longer reports envImport blockers",
    ],
  }),
  U07_DOMAIN_DNS_HTTPS_ICP: Object.freeze({
    packetId: "P07_DOMAIN_DNS_HTTPS",
    sequenceGroup: "public_entry",
    dependsOn: ["P08_SAE_RUNTIME_SLS"],
    minimumUserPhrase: "授权配置 api-cn/assets-cn 的 DNS、HTTPS 和 ICP 证据，目标必须是阿里云公网入口。",
    allowedActions: [
      "把 api-cn.ipgongchang.xin 指向 SAE/SLB/API 公网入口。",
      "把 assets-cn.ipgongchang.xin 指向 OSS/CDN 静态资源入口。",
      "绑定 HTTPS 证书并记录 ICP ready 证据。",
    ],
    explicitlyExcluded: [
      "不指向 Vercel、localhost、example 或 198.18.0.x 特殊用途地址。",
      "不下载证书私钥。",
      "不部署 production-cn。",
    ],
    completionEvidence: [
      "apiDomainHttps.dnsResolvedToAliyun=true",
      "apiDomainHttps.httpsEnabled=true",
      "apiDomainHttps.icpReady=true",
      "assetDomainHttps.dnsResolvedToAliyun=true",
      "assetDomainHttps.httpsEnabled=true",
      "assetDomainHttps.icpReady=true",
    ],
  }),
  U08_SAE_RUNTIME_AND_SLS: Object.freeze({
    packetId: "P08_SAE_RUNTIME_SLS",
    sequenceGroup: "runtime_observability",
    dependsOn: ["P03_ACR_PURCHASE", "P04_ACR_IMAGE_AND_PULL", "P05_OSS_RAM_STS", "P06_ENV_IMPORT"],
    minimumUserPhrase: "授权创建/确认 SAE production-cn 应用和 SLS health/5xx 告警；不导入密钥、不部署镜像。",
    allowedActions: [
      "创建或确认 cn-hangzhou SAE 自定义容器应用，端口 3000，健康检查 /api/healthz。",
      "绑定 SLS 日志采集。",
      "配置 /api/healthz 健康失败告警和 5xx 告警。",
      "只记录资源名、布尔状态和非密钥证据。",
    ],
    explicitlyExcluded: [
      "不购买 ACR。",
      "不导入环境变量 value。",
      "不推送镜像、不执行生产部署。",
    ],
    completionEvidence: [
      "runtime.confirmed=true",
      "runtime.containerPort=3000",
      "runtime.healthPath=/api/healthz",
      "slsAlerts.healthAlertConfigured=true",
      "slsAlerts.serverErrorAlertConfigured=true",
    ],
  }),
  U09_DEPLOY_AUTHORIZATION: Object.freeze({
    packetId: "P09_PRODUCTION_DEPLOY",
    sequenceGroup: "production_release",
    dependsOn: [
      "P03_ACR_PURCHASE",
      "P04_ACR_IMAGE_AND_PULL",
      "P05_OSS_RAM_STS",
      "P11_ALIYUN_RDS_DATA_MIGRATION",
      "P06_ENV_IMPORT",
      "P07_DOMAIN_DNS_HTTPS",
      "P08_SAE_RUNTIME_SLS",
    ],
    minimumUserPhrase: "授权在所有 strict 门禁通过后执行 production-cn 部署；不包含 git push 或小程序上传。",
    allowedActions: [
      "确认 cloud confirmations、image plan、domain、readiness 和 predeploy strict 全部通过。",
      "执行 production-cn 后端部署。",
      "运行 postdeploy smoke 并记录部署证据。",
    ],
    explicitlyExcluded: [
      "不 git push，除非单独授权。",
      "不上传微信小程序或 APP 商店包。",
      "不修改 Supabase production schema/data。",
    ],
    completionEvidence: [
      "corepack pnpm aliyun:cloud:confirmations:strict pass",
      "corepack pnpm aliyun:image:plan:strict pass",
      "corepack pnpm aliyun:domain:strict pass",
      "corepack pnpm aliyun:readiness:cloud-ready pass",
      "corepack pnpm aliyun:postdeploy:smoke pass",
    ],
  }),
})

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    outPath: "",
    markdownPath: "",
    backendOnly: false,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--backend-only") {
      args.backendOnly = true
      continue
    }
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
  const backendOnlyArg = args.backendOnly ? ["--backend-only"] : []
  const userActions = runJson("user_actions", [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    ...backendOnlyArg,
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
  const authorizationPackets = buildAuthorizationPackets(actions)
    .map((packet) => args.backendOnly ? filterBackendOnlyPacket(packet) : packet)
  const backendAuthorizationPackets = authorizationPackets.filter((packet) => !APP_LAUNCH_PACKET_IDS.has(packet.packetId))
  const deferredAppLaunchPackets = authorizationPackets.filter((packet) => APP_LAUNCH_PACKET_IDS.has(packet.packetId))
  const reportedDeferredAppLaunchPackets = args.backendOnly
    ? (userActions.deferredAppLaunchConfirmations || []).map(compactDeferredPacket)
    : deferredAppLaunchPackets
  const canStartNowPackets = backendAuthorizationPackets
    .filter((packet) => packet.canStartNow)
    .map((packet) => packet.packetId)
  const allCanStartNowPackets = authorizationPackets
    .filter((packet) => packet.canStartNow)
    .map((packet) => packet.packetId)
  const nextActionTimeConfirmations = backendAuthorizationPackets
    .filter((packet) => packet.canStartNow && packet.requiresActionTimeConfirmation)
    .map((packet) => compactActionTimeConfirmation(packet))
  const deferredAppLaunchConfirmations = deferredAppLaunchPackets
    .filter((packet) => packet.requiresActionTimeConfirmation)
    .map((packet) => compactActionTimeConfirmation(packet))
  const reportedDeferredAppLaunchConfirmations = args.backendOnly
    ? (userActions.deferredAppLaunchConfirmations || []).map(compactDeferredConfirmation)
    : deferredAppLaunchConfirmations
  const actionTimeConfirmationRequired = actions
    .filter((action) => action.requiresActionTimeConfirmation)
    .map((action) => action.id)
  const backendActions = actions.filter((action) => !APP_LAUNCH_ACTION_IDS.has(action.id))
  const deferredAppLaunchActions = actions.filter((action) => APP_LAUNCH_ACTION_IDS.has(action.id))
  const currentExternalBlockers = backendActions
    .filter((action) => action.status !== "ready")
    .map((action) => action.id)
  const deferredExternalBlockers = deferredAppLaunchActions
    .filter((action) => action.status !== "ready")
    .map((action) => action.id)
  const authorizationClosureBrief = buildAuthorizationClosureBrief({
    consoleRunbook,
    userActions,
    authorizationPackets,
    nextActionTimeConfirmations,
    deferredAppLaunchConfirmations: reportedDeferredAppLaunchConfirmations,
    backendOnly: args.backendOnly,
  })
  const requiredBlocking = status.summary?.requiredBlocking || []
  const backendRequiredBlocking = requiredBlocking.filter((name) => !APP_LAUNCH_REQUIRED_NAMES.has(name))
  const deferredAppLaunchBlocking = requiredBlocking.filter((name) => APP_LAUNCH_REQUIRED_NAMES.has(name))
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    backendOnly: args.backendOnly,
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    canDeployNow: status.canDeployNow === true,
    verdict: status.verdict || "blocked",
    currentAnswer: status.canDeployNow === true
      ? "阿里云后端门禁接近可部署，但生产动作仍需逐项授权。"
      : "现在不能部署；当前只推进阿里云后端，微信/Apple/Android 发布项已延期，后端仍缺 RDS、ACR、OSS、SAE、DNS、env、SLS 和 smoke 证据。",
    sourceCommands: [
      args.backendOnly ? "corepack pnpm aliyun:user:actions:backend" : "corepack pnpm aliyun:user:actions",
      "corepack pnpm aliyun:console:runbook",
      "corepack pnpm aliyun:status",
    ],
    files: {
      envFile: args.envFile,
      cloudConfirmationsFile: args.cloudConfirmationsFile,
    },
    summary: {
      currentScope: CURRENT_SCOPE,
      fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
      backendOnly: args.backendOnly,
      actions: actions.length,
      canCodexProceedWithoutUser: actions.filter((action) => action.canCodexProceedWithoutUser).map((action) => action.id),
      currentExternalBlockers,
      deferredExternalBlockers,
      actionTimeConfirmationRequired,
      policyClasses: unique(actions.map((action) => action.blockerClass)),
      cloudConsoleTasks: consoleRunbook.consoleTasks?.length || 0,
      cloudResourceReady: consoleRunbook.summary?.resourceReady || "unknown",
      userActionReady: userActions.summary ? `${userActions.summary.ready}/${userActions.summary.total}` : "unknown",
      requiredBlocking: backendRequiredBlocking,
      fullAppRequiredBlocking: args.backendOnly ? backendRequiredBlocking : requiredBlocking,
      deferredAppLaunchBlocking: args.backendOnly ? [] : deferredAppLaunchBlocking,
      deferredAppLaunchBlockingCount: deferredAppLaunchBlocking.length,
      sensitiveActionItems: args.backendOnly
        ? {
          currentScope: CURRENT_SCOPE,
          blocked: userActions.summary?.sensitiveBlockers || 0,
        }
        : status.summary?.sensitiveActionItems || {},
      authorizationPackets: authorizationPackets.length,
      canStartNowPackets,
      allCanStartNowPackets,
      nextActionTimeConfirmations: nextActionTimeConfirmations.map((item) => item.packetId),
      deferredAppLaunchPackets: reportedDeferredAppLaunchPackets.map((item) => item.packetId),
      deferredAppLaunchConfirmations: reportedDeferredAppLaunchConfirmations.map((item) => item.packetId),
      blockedCredentialCount: authorizationClosureBrief.blockedCredentialCount,
      readySecretEnvVariableCount: authorizationClosureBrief.readySecretEnvVariableCount,
      resourceEvidenceReady: authorizationClosureBrief.resourceEvidenceReady,
      blockedResourceEvidenceIds: authorizationClosureBrief.blockedResourceEvidenceIds,
      partiallyObservedResourceEvidenceIds: authorizationClosureBrief.partiallyObservedResourceEvidenceIds,
      blockedByPacketDependencies: authorizationPackets
        .filter((packet) => !APP_LAUNCH_PACKET_IDS.has(packet.packetId) && packet.blockingDependencies.length > 0)
        .map((packet) => packet.packetId),
    },
    authorizationClosureBrief,
    nextActionTimeConfirmations,
    deferredAppLaunchConfirmations: reportedDeferredAppLaunchConfirmations,
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
    authorizationPackets,
    backendAuthorizationPackets,
    deferredAppLaunchPackets: reportedDeferredAppLaunchPackets,
    nextVerifyCommands: args.backendOnly
      ? [
        "corepack pnpm aliyun:action:authorization:backend",
        "corepack pnpm aliyun:user:actions:backend",
        "corepack pnpm aliyun:sensitive:blockers:backend",
        "corepack pnpm aliyun:env:handoff:backend",
        "corepack pnpm aliyun:operator:tasks:backend",
        "corepack pnpm aliyun:backend-cn:status",
      ]
      : [
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

function buildAuthorizationClosureBrief({
  consoleRunbook,
  userActions,
  authorizationPackets,
  nextActionTimeConfirmations,
  deferredAppLaunchConfirmations,
  backendOnly,
}) {
  const runbookBrief = consoleRunbook.consoleClosureBrief || {}
  const credentialSummary = userActions.credentialAcquisitionSummary || {}
  const blockedCredentialNames = backendOnly
    ? credentialSummary.blockedCredentialNames || []
    : runbookBrief.blockedCredentialNames || []
  const readySecretEnvVariableNames = backendOnly
    ? credentialSummary.readySecretEnvVariableNames || []
    : runbookBrief.readySecretEnvVariableNames || []
  const blockedResourceEvidence = runbookBrief.blockedResourceEvidence || []
  const canStartNowPackets = nextActionTimeConfirmations.map((item) => item.packetId)
  const blockedByPacketDependencies = authorizationPackets
    .filter((packet) => packet.blockingDependencies.length > 0)
    .map((packet) => packet.packetId)

  return {
    conclusion: "现在不能部署；这些 packet 只是阿里云后端动作时确认入口，不能替代 RDS/ACR/OSS/SAE/DNS/env/SLS/smoke 证据闭环。",
    currentScope: CURRENT_SCOPE,
    fullAppLaunchScope: FULL_APP_LAUNCH_SCOPE,
    canDeployNow: consoleRunbook.summary?.canDeployNow === true,
    canCodexProceedWithoutUser: false,
    blockedCredentialCount: backendOnly
      ? blockedCredentialNames.length
      : runbookBrief.blockedCredentialCount ?? blockedCredentialNames.length,
    blockedCredentialNames,
    readySecretEnvVariableCount: backendOnly
      ? readySecretEnvVariableNames.length
      : runbookBrief.readySecretEnvVariableCount ?? readySecretEnvVariableNames.length,
    readySecretEnvVariableNames,
    resourceEvidenceReady: runbookBrief.resourceEvidenceReady || consoleRunbook.summary?.resourceEvidenceReady || "unknown",
    blockedResourceEvidenceIds: runbookBrief.blockedResourceEvidenceIds || consoleRunbook.summary?.blockedResourceEvidenceIds || [],
    partiallyObservedResourceEvidenceIds:
      runbookBrief.partiallyObservedResourceEvidenceIds ||
      consoleRunbook.summary?.partiallyObservedResourceEvidenceIds ||
      [],
    blockedResourceEvidence: backendOnly
      ? blockedResourceEvidence.map((item) => filterBackendOnlyResourceEvidence(item))
      : blockedResourceEvidence,
    canStartNowPackets,
    deferredAppLaunchPackets: deferredAppLaunchConfirmations.map((item) => item.packetId),
    canStartNowConsoleTasks: consoleRunbook.summary?.canStartNowConsoleTasks || [],
    blockedByPacketDependencies,
    blockedByTaskDependencies: consoleRunbook.summary?.blockedByTaskDependencies || [],
    actionTimeConfirmationRequired: unique([
      ...(backendOnly ? [] : runbookBrief.actionTimeConfirmationRequiredIds || []),
      ...authorizationPackets
        .filter((packet) => packet.requiresActionTimeConfirmation && !APP_LAUNCH_PACKET_IDS.has(packet.packetId))
        .map((packet) => packet.packetId),
    ]),
  }
}

function compactDeferredPacket(item) {
  return {
    packetId: item.packetId,
    actionId: item.actionId,
    title: item.title,
    owner: item.owner,
    sequenceGroup: item.sequenceGroup,
    deferredUntil: FULL_APP_LAUNCH_SCOPE,
    deferReason: "不属于当前阿里云后端补齐目标。",
  }
}

function compactDeferredConfirmation(item) {
  return {
    packetId: item.packetId,
    actionId: item.actionId,
    title: item.title,
    owner: item.owner,
    sequenceGroup: item.sequenceGroup,
    deferredUntil: FULL_APP_LAUNCH_SCOPE,
    deferReason: "微信开放平台移动应用、Android release signing 和 Apple Team ID 已延期到阿里云后端上线后处理。",
  }
}

function filterBackendOnlyPacket(packet) {
  return {
    ...packet,
    explicitlyExcluded: (packet.explicitlyExcluded || []).filter((item) => !isDeferredAppLaunchText(item)),
    completionEvidence: (packet.completionEvidence || []).filter((item) => !isDeferredAppLaunchText(item)),
    writeTargets: (packet.writeTargets || []).filter((item) => !isDeferredAppLaunchText(item)),
    variableNames: (packet.variableNames || []).filter((item) => !isDeferredAppLaunchText(item)),
    verifyCommands: (packet.verifyCommands || []).map((item) =>
      item === "corepack pnpm aliyun:cloud:confirmations:strict"
        ? "corepack pnpm aliyun:cloud:confirmations:backend:strict"
        : item,
    ),
  }
}

function filterBackendOnlyResourceEvidence(item) {
  return {
    ...item,
    currentEvidence: (item.currentEvidence || []).filter((value) => !isDeferredAppLaunchText(value)),
    missingEvidence: (item.missingEvidence || []).filter((value) => !isDeferredAppLaunchText(value)),
    writeTargets: (item.writeTargets || []).filter((value) => !isDeferredAppLaunchText(value)),
  }
}

function isDeferredAppLaunchText(value) {
  const text = String(value || "")
  return APP_LAUNCH_BLOCKER_PATTERNS.some((pattern) => pattern.test(text))
}

function compactActionTimeConfirmation(packet) {
  return {
    packetId: packet.packetId,
    actionId: packet.actionId,
    title: packet.title,
    owner: packet.owner,
    sequenceGroup: packet.sequenceGroup,
    minimumUserPhrase: packet.minimumUserPhrase,
    allowedActions: packet.allowedActions,
    explicitlyExcluded: packet.explicitlyExcluded,
    completionEvidence: packet.completionEvidence,
    writeTargets: packet.writeTargets,
    verifyCommands: packet.verifyCommands,
    nonSecretEvidenceOnly: packet.nonSecretEvidenceOnly === true,
  }
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

function buildAuthorizationPackets(actions) {
  const packetByActionId = new Map(
    actions.map((action) => {
      const packet = AUTHORIZATION_PACKET_BY_ACTION_ID[action.id]
      return [action.id, packet ? packet.packetId : `P_UNKNOWN_${action.id || "ACTION"}`]
    }),
  )
  const statusByPacketId = new Map(
    actions.map((action) => [packetByActionId.get(action.id), action.status || "unknown"]),
  )
  return actions.map((action) => buildAuthorizationPacket(action, statusByPacketId))
}

function buildAuthorizationPacket(action, statusByPacketId) {
  const packet = AUTHORIZATION_PACKET_BY_ACTION_ID[action.id] || {
    packetId: `P_UNKNOWN_${action.id || "ACTION"}`,
    sequenceGroup: "unknown",
    dependsOn: [],
    minimumUserPhrase: `授权执行 ${action.title || action.id}；先人工复核范围。`,
    allowedActions: [],
    explicitlyExcluded: ["未配置的动作包不能自动执行。"],
    completionEvidence: [],
  }
  const dependsOn = packet.dependsOn || []
  const blockingDependencies = dependsOn.filter((packetId) => statusByPacketId.get(packetId) !== "ready")
  return {
    packetId: packet.packetId,
    actionId: action.id,
    title: action.title,
    status: action.status,
    owner: action.owner,
    blockerClass: action.blockerClass,
    sequenceGroup: packet.sequenceGroup,
    dependsOn,
    blockingDependencies,
    canStartNow: action.status !== "ready" && blockingDependencies.length === 0,
    requiresActionTimeConfirmation: action.requiresActionTimeConfirmation,
    minimumUserPhrase: packet.minimumUserPhrase,
    allowedActions: packet.allowedActions,
    explicitlyExcluded: packet.explicitlyExcluded,
    completionEvidence: packet.completionEvidence,
    writeTargets: action.writeTargets,
    variableNames: action.variableNames,
    verifyCommands: action.verifyCommands,
    nonSecretEvidenceOnly: action.nonSecretEvidenceOnly,
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
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- containsValues: ${report.containsValues}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- actionTimeConfirmationRequired: ${report.summary.actionTimeConfirmationRequired.join(", ")}`,
    `- nextActionTimeConfirmations: ${report.summary.nextActionTimeConfirmations.join(", ") || "none"}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- resourceEvidenceReady: ${report.summary.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.summary.blockedResourceEvidenceIds.length ? report.summary.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.summary.partiallyObservedResourceEvidenceIds.length ? report.summary.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    "",
    "## 目标闭环证据简表",
    "",
    `- conclusion: ${report.authorizationClosureBrief.conclusion}`,
    `- canDeployNow: ${report.authorizationClosureBrief.canDeployNow}`,
    `- canCodexProceedWithoutUser: ${report.authorizationClosureBrief.canCodexProceedWithoutUser}`,
    `- blockedCredentialCount: ${report.authorizationClosureBrief.blockedCredentialCount}`,
    `- blockedCredentialNames: ${report.authorizationClosureBrief.blockedCredentialNames.length ? report.authorizationClosureBrief.blockedCredentialNames.join(", ") : "none"}`,
    `- readySecretEnvVariableCount: ${report.authorizationClosureBrief.readySecretEnvVariableCount}`,
    `- resourceEvidenceReady: ${report.authorizationClosureBrief.resourceEvidenceReady}`,
    `- blockedResourceEvidenceIds: ${report.authorizationClosureBrief.blockedResourceEvidenceIds.length ? report.authorizationClosureBrief.blockedResourceEvidenceIds.join(", ") : "none"}`,
    `- partiallyObservedResourceEvidenceIds: ${report.authorizationClosureBrief.partiallyObservedResourceEvidenceIds.length ? report.authorizationClosureBrief.partiallyObservedResourceEvidenceIds.join(", ") : "none"}`,
    `- canStartNowPackets: ${report.authorizationClosureBrief.canStartNowPackets.length ? report.authorizationClosureBrief.canStartNowPackets.join(", ") : "none"}`,
    `- deferredAppLaunchPackets: ${report.authorizationClosureBrief.deferredAppLaunchPackets.length ? report.authorizationClosureBrief.deferredAppLaunchPackets.join(", ") : "none"}`,
    `- canStartNowConsoleTasks: ${report.authorizationClosureBrief.canStartNowConsoleTasks.length ? report.authorizationClosureBrief.canStartNowConsoleTasks.join(", ") : "none"}`,
    `- blockedByPacketDependencies: ${report.authorizationClosureBrief.blockedByPacketDependencies.length ? report.authorizationClosureBrief.blockedByPacketDependencies.join(", ") : "none"}`,
    "",
    "## 允许的本地工作",
    "",
    ...report.safeLocalWorkStillAllowed.map((item) => `- ${item}`),
    "",
    "## 未获动作时确认前禁止",
    "",
    ...report.prohibitedWithoutActionTimeConfirmation.map((item) => `- ${item}`),
    "",
    "## 当前可开始的动作时确认",
    "",
  ]

  for (const item of report.nextActionTimeConfirmations) {
    lines.push(
      `### ${item.packetId} ${item.title}`,
      "",
      `- actionId: ${item.actionId}`,
      `- owner: ${item.owner}`,
      `- sequenceGroup: ${item.sequenceGroup}`,
      `- minimumUserPhrase: ${item.minimumUserPhrase}`,
      `- allowedActions: ${item.allowedActions.join("; ") || "none"}`,
      `- explicitlyExcluded: ${item.explicitlyExcluded.join("; ") || "none"}`,
      `- completionEvidence: ${item.completionEvidence.join("; ") || "none"}`,
      `- writeTargets: ${item.writeTargets.join("; ") || "none"}`,
      `- verifyCommands: ${item.verifyCommands.join("; ") || "none"}`,
      `- nonSecretEvidenceOnly: ${item.nonSecretEvidenceOnly}`,
      "",
    )
  }

  lines.push(
    "## 动作分类",
    "",
  )

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
    "## 最小授权动作包",
    "",
  )

  for (const packet of report.authorizationPackets) {
    lines.push(
      `### ${packet.packetId} ${packet.title}`,
      "",
      `- actionId: ${packet.actionId}`,
      `- status: ${packet.status}`,
      `- owner: ${packet.owner}`,
      `- sequenceGroup: ${packet.sequenceGroup}`,
      `- dependsOn: ${packet.dependsOn.join(", ") || "none"}`,
      `- blockingDependencies: ${packet.blockingDependencies.join(", ") || "none"}`,
      `- canStartNow: ${packet.canStartNow}`,
      `- requiresActionTimeConfirmation: ${packet.requiresActionTimeConfirmation}`,
      `- minimumUserPhrase: ${packet.minimumUserPhrase}`,
      `- allowedActions: ${packet.allowedActions.join("; ") || "none"}`,
      `- explicitlyExcluded: ${packet.explicitlyExcluded.join("; ") || "none"}`,
      `- completionEvidence: ${packet.completionEvidence.join("; ") || "none"}`,
      `- writeTargets: ${packet.writeTargets.join("; ") || "none"}`,
      `- variableNames: ${packet.variableNames.join(", ") || "none"}`,
      `- verifyCommands: ${packet.verifyCommands.join("; ") || "none"}`,
      "",
    )
  }

  lines.push(
    "## 下一组验证命令",
    "",
    ...report.nextVerifyCommands.map((command) => `- \`${command}\``),
    "",
  )
  return `${lines.join("\n").trimEnd()}\n`
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
    "  node scripts/summarize-aliyun-action-authorization.mjs [--backend-only] [--env-file path] [--cloud-confirmations path] [--out /tmp/report.json] [--markdown /tmp/report.md]",
    "",
    "Builds a non-secret action-time authorization matrix for APP production-cn Aliyun work.",
    "--backend-only excludes deferred WeChat Open Platform mobile app, Android signing, and Apple Team ID launch work from the current authorization matrix.",
    "It does not create resources, pay, change DNS, import env values, push images, deploy, or git push.",
  ].join("\n"))
}

main()
