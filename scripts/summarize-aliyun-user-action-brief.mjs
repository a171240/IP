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
  "U10_ANDROID_RELEASE_SIGNING",
  "U02_APPLE_TEAM_ID",
  "U00_ALIYUN_READONLY_INVENTORY_IDENTITY",
  "U03_ACR_PURCHASE_CONFIRMATION",
  "U04_ACR_RUNTIME_AUTH",
  "U05_OSS_RAM_OR_STS",
  "U11_ALIYUN_RDS_DATA_MIGRATION",
  "U06_ENV_IMPORT",
  "U07_DOMAIN_DNS_HTTPS_ICP",
  "U08_SAE_RUNTIME_AND_SLS",
  "U09_DEPLOY_AUTHORIZATION",
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

const NEXT_ACTION_TIME_CONFIRMATION_BY_ACTION_ID = Object.freeze({
  U00_ALIYUN_READONLY_INVENTORY_IDENTITY: Object.freeze({
    packetId: "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    sequenceGroup: "readonly_inventory",
    minimumUserPhrase: "授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。",
    allowedActions: [
      "如 CloudShell 页面要求开通，先确认性能型 NAS 费用提示，再进入只读盘点。",
      "使用阿里云官方 CLI 或 CloudShell 的只读身份。",
      "只运行本仓库生成的 List/Describe/stat/get inventory 命令。",
      "只记录资源名、布尔值、时间戳、命令状态、sha256 指纹和非密钥 evidence handle。",
    ],
    explicitlyExcluded: [
      "不运行 Create/Update/Delete/Deploy/Start/Stop/Purchase/DNS mutation 命令。",
      "不执行 docker login/push。",
      "不读取、复制、粘贴或输出 AccessKeySecret、STS token、cookie、registry password、RAM Secret 或证书私钥。",
      "除用户明确确认 CloudShell 开通页的性能型 NAS 费用提示外，不做任何 production-cn deploy、env import、资源创建或计费动作。",
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
  U05_OSS_RAM_OR_STS: Object.freeze({
    packetId: "P05_OSS_RAM_STS",
    sequenceGroup: "cloud_foundation",
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
  const backendOnlyArg = args.backendOnly ? ["--backend-only"] : []
  const sensitive = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    ...backendOnlyArg,
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
  const backendActions = actions.filter((action) => !APP_LAUNCH_ACTION_IDS.has(action.id))
  const deferredAppLaunchActions = actions.filter((action) => APP_LAUNCH_ACTION_IDS.has(action.id))
  const nextActionTimeConfirmations = buildNextActionTimeConfirmations(backendActions)
  const deferredAppLaunchConfirmations = buildNextActionTimeConfirmations(deferredAppLaunchActions)
  const credentialAcquisitionSummary = buildCredentialAcquisitionSummary(sensitive)
  const currentActions = args.backendOnly ? backendActions.map(filterBackendOnlyAction) : actions
  const reportBackendActions = args.backendOnly ? currentActions : backendActions
  const reportDeferredAppLaunchActions = args.backendOnly
    ? deferredAppLaunchActions.map(compactDeferredAction)
    : deferredAppLaunchActions
  const reportDeferredAppLaunchConfirmations = args.backendOnly
    ? deferredAppLaunchConfirmations.map(compactDeferredConfirmation)
    : deferredAppLaunchConfirmations
  const actionTimeAuthorizationRequest = buildActionTimeAuthorizationRequest({
    backendOnly: args.backendOnly,
    nextActionTimeConfirmations,
  })
  const blocked = currentActions.filter((item) => item.status !== "ready")
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
    sourceCommands: [
      args.backendOnly ? "corepack pnpm aliyun:sensitive:blockers:backend" : "corepack pnpm aliyun:sensitive:blockers",
      "corepack pnpm aliyun:resources:matrix",
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
      total: currentActions.length,
      ready: currentActions.length - blocked.length,
      blocked: blocked.length,
      blockedIds: blocked.map((item) => item.id),
      backendActions: backendActions.map((item) => item.id),
      deferredAppLaunchActions: deferredAppLaunchActions.map((item) => item.id),
      userMustAct: currentActions.filter((item) => item.requiresUserAction).map((item) => item.id),
      actionTimeConfirmationRequired: currentActions
        .filter((item) => item.requiresActionTimeConfirmation)
        .map((item) => item.id),
      nextActionTimeConfirmations: nextActionTimeConfirmations.map((item) => item.packetId),
      deferredAppLaunchConfirmations: deferredAppLaunchConfirmations.map((item) => item.packetId),
      canBeRecordedAsNonSecretEvidence: currentActions
        .filter((item) => item.nonSecretEvidenceOnly)
        .map((item) => item.id),
      sensitiveBlockers: sensitive.summary?.blocked || 0,
      blockedCredentialCount: credentialAcquisitionSummary.blockedCredentialCount,
      blockedCredentialNames: credentialAcquisitionSummary.blockedCredentialNames,
      readySecretEnvVariableCount: credentialAcquisitionSummary.readySecretEnvVariableCount,
      readySecretEnvVariableNames: credentialAcquisitionSummary.readySecretEnvVariableNames,
      aliyunResourcesReady: resources.summary ? `${resources.summary.ready}/${resources.summary.total}` : "unknown",
    },
    currentAnswer: "现在不能部署；当前只推进阿里云后端，微信/Android/Apple 发布项已延期，本简报只列用户/操作员还要做什么、从哪里取得、写到哪里，不输出任何密钥值。",
    credentialAcquisitionSummary,
    actionTimeAuthorizationRequest,
    actions: currentActions,
    backendActions: reportBackendActions,
    deferredAppLaunchActions: reportDeferredAppLaunchActions,
    nextActionTimeConfirmations,
    deferredAppLaunchConfirmations: reportDeferredAppLaunchConfirmations,
    nextSafeLocalCommands: args.backendOnly
      ? [
        "corepack pnpm aliyun:user:actions:backend",
        "corepack pnpm aliyun:sensitive:blockers:backend",
        "corepack pnpm aliyun:env:handoff:backend",
        "corepack pnpm aliyun:operator:tasks:backend",
        "corepack pnpm aliyun:backend-cn:status",
      ]
      : [
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

function buildActionTimeAuthorizationRequest({ backendOnly, nextActionTimeConfirmations }) {
  const packetIds = nextActionTimeConfirmations.map((item) => item.packetId)
  const allowedActions = uniqueStrings(nextActionTimeConfirmations.flatMap((item) => item.allowedActions || []))
  const explicitlyExcluded = uniqueStrings(nextActionTimeConfirmations.flatMap((item) => item.explicitlyExcluded || []))
  const writeTargets = uniqueStrings(nextActionTimeConfirmations.flatMap((item) => item.writeTargets || []))
  const verifyCommands = uniqueStrings(nextActionTimeConfirmations.flatMap((item) => item.verifyCommands || []))
  const minimumUserPhrases = nextActionTimeConfirmations.map((item) => item.minimumUserPhrase)

  return {
    required: packetIds.length > 0,
    currentScope: CURRENT_SCOPE,
    backendOnly,
    packetIds,
    recommendedUserReply: backendOnly
      ? "授权本轮只做阿里云后端第一批动作：只读盘点、创建/确认 RDS PostgreSQL 并处理数据库密码、确认 OSS RAM/STS，购买/确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117；密钥只进入阿里云 KMS/Secrets Manager/SAE secret env，不写文档/代码/git；仅处理 RDS/OSS 所需的受控 secret env，暂不执行全量 SAE env import；不做微信/Android/iOS、不部署上线、不改 DNS。"
      : "请逐项明确授权 nextActionTimeConfirmations 中的动作；未明确授权前不做云端变更、购买、密钥导入、部署、DNS 或 git push。",
    minimumUserPhrases,
    allowedActions,
    explicitlyExcluded: backendOnly
      ? uniqueStrings([
        ...explicitlyExcluded,
        "不创建微信开放平台移动应用，不处理 Android release signing，不读取 Apple Team ID/AASA。",
        "不执行 production-cn 部署、postdeploy smoke、DNS/HTTPS/ICP 变更或 git push。",
        "不执行全量 SAE 环境变量导入；只允许本批 RDS/OSS 动作要求的受控 secret env 写入。",
      ])
      : explicitlyExcluded,
    writeTargets,
    verifyCommands,
    valueHandling: [
      "只允许记录变量名、资源名、布尔值、时间戳、digest、控制台路径和非密钥 evidence handle。",
      "DATABASE_URL_CN、数据库密码、AccessKeySecret、STS token、registry password、Supabase service role key、cookie 和证书私钥不得写入 JSON、Markdown、Docker 镜像、App 包、小程序包、shell history 或 git。",
    ],
  }
}

function buildActions({ sensitiveById, resourcesById, status, cloudItems }) {
  const actionMap = new Map()
  const cloudInventoryResults = status.summary?.cloudInventoryResults || {}
  const cloudInventoryObservation = cloudInventoryResults.observationSummary || {}

  addAction(actionMap, {
    id: "U00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    title: "恢复阿里云 CLI/CloudShell 只读盘点身份",
    status: cloudInventoryResults.localReady === true ? "ready" : "blocked",
    owner: "用户/阿里云只读盘点操作员",
    obtainFrom: "本机 Aliyun CLI default profile 或阿里云控制台 -> CloudShell",
    writeTargets: [
      "deploy/aliyun-production-cn.cloud-inventory-results.local.json -> non-secret read-only inventory summaries",
    ],
    requiredUserAction: "授权开通/重新连接阿里云 CloudShell 或配置 Aliyun CLI；如 CloudShell 提示会创建性能型 NAS 并可能产生费用，确认后才可点击开通；只运行 allowlisted 只读盘点命令并写入非密钥 evidence。",
    unblockCondition: "cloudInventoryResults.localReady=true，readyLocalOperations=9/9，executedCommandResults=9/9，mutationPerformedCommandResults=0。",
    variableNames: [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: true,
    sourceIds: ["cloudInventoryResults", "BAP00_READONLY_INVENTORY_IDENTITY"],
    currentBlockers: [
      ...(cloudInventoryResults.localReady === true ? [] : cloudInventoryResults.localBlockers || []),
      ...(cloudInventoryObservation.blockedOperationIds || []).map((id) => `cloudInventory:${id}`),
    ],
    currentEvidence: [
      `cloudInventoryResults.templateReady=${cloudInventoryResults.templateReady === true}`,
      `cloudInventoryResults.localExists=${cloudInventoryResults.localExists === true}`,
      `cloudInventoryResults.localReady=${cloudInventoryResults.localReady === true}`,
      `readyLocalOperations=${cloudInventoryResults.readyLocalOperations || 0}/${cloudInventoryResults.localOperations || 0}`,
      `executedCommandResults=${cloudInventoryObservation.executedCommandResults || 0}/${cloudInventoryObservation.commandResults || 0}`,
      `cloudApiCalledCommandResults=${cloudInventoryObservation.cloudApiCalledCommandResults || 0}`,
      `mutationPerformedCommandResults=${cloudInventoryObservation.mutationPerformedCommandResults || 0}`,
    ],
    verifyCommands: [
      "corepack pnpm aliyun:cloud:access",
      "MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1 corepack pnpm aliyun:cloud:inventory-run -- --execute-readonly --write-local deploy/aliyun-production-cn.cloud-inventory-results.local.json",
      "corepack pnpm aliyun:cloud:inventory-results:strict",
      "corepack pnpm aliyun:evidence:writeback:backend",
    ],
  })

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

  const androidSigning = sensitiveById.get("S07_ANDROID_RELEASE_SIGNING")
  addAction(actionMap, {
    id: "U10_ANDROID_RELEASE_SIGNING",
    title: "配置 Android release signing 并生成微信开放平台 Android 签名",
    status: androidSigning?.status || "blocked",
    owner: androidSigning?.owner || "Android 发布操作员 / 微信开放平台操作员",
    obtainFrom: androidSigning?.obtainFrom || "Android release keystore 管理位置 / CI Secret Store；微信开放平台 -> 移动应用 -> Android 应用签名",
    writeTargets: androidSigning?.writeTargets || [
      "MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store",
      "微信开放平台 -> 移动应用 -> Android 应用签名",
      "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured",
    ],
    requiredUserAction: androidSigning?.requiredUserAction,
    unblockCondition: androidSigning?.unblockCondition,
    variableNames: androidSigning?.variableNames || [],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: false,
    sourceIds: ["S07_ANDROID_RELEASE_SIGNING"],
    currentBlockers: [
      ...sensitiveStatusBlockers(sensitiveById, ["S07_ANDROID_RELEASE_SIGNING"]),
      ...cloudMissing(status, "wechatOpenPlatform").filter((item) =>
        item.includes("androidSignature") || item.includes("androidConfigured")
      ),
    ],
    currentEvidence: [
      ...cloudEvidence(cloudItems, "wechatOpenPlatform", [
        "androidSignature",
        "androidConfigured",
      ]),
      ...sensitiveVariableNotes(androidSigning),
    ],
    verifyCommands: androidSigning?.verifyCommands || [
      "cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" ./gradlew assembleRelease",
      "ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk",
      "corepack pnpm aliyun:wechat-open:package",
      "corepack pnpm aliyun:app-native:check",
    ],
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

  const bridgeDataLayer = status.summary?.bridgeDataLayer || {}
  const rdsMigrationIncluded = bridgeDataLayer.rdsMigrationIncludedInThisRelease === true
  addAction(actionMap, {
    id: "U11_ALIYUN_RDS_DATA_MIGRATION",
    title: "创建阿里云 RDS PostgreSQL 并完成正式数据层迁移",
    status: rdsMigrationIncluded && bridgeDataLayer.databaseUrlCnStatus === "ready" ? "ready" : "blocked",
    owner: "阿里云 RDS/后端数据迁移操作员",
    obtainFrom: "阿里云控制台 -> RDS PostgreSQL -> cn-hangzhou 实例；后端 Supabase 到 RDS/PostgreSQL 迁移 runbook",
    writeTargets: [
      "DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env",
      "RDS PostgreSQL 实例、schema/data migration、rollback validation -> 非密钥证据报告",
    ],
    requiredUserAction: "创建或确认阿里云 RDS PostgreSQL，生成受控连接串，完成 Supabase 到 RDS/PostgreSQL 的代码、schema、数据和回滚迁移验收。",
    unblockCondition: "DATABASE_URL_CN ready，RDS PostgreSQL 迁移和回滚验收通过，production-cn 后端正式数据库目标不再是 Supabase。",
    variableNames: ["DATABASE_URL_CN"],
    requiresUserAction: true,
    requiresActionTimeConfirmation: true,
    nonSecretEvidenceOnly: false,
    sourceIds: ["G02B_ALIYUN_RDS_DATA_LAYER_READY", "DATABASE_URL_CN"],
    currentBlockers: uniqueStrings([
      ...requiredBlocking(status).filter((item) => item.includes("DATABASE_URL_CN")),
      ...(bridgeDataLayer.databaseUrlCnStatus === "ready" ? [] : [`DATABASE_URL_CN_status:${bridgeDataLayer.databaseUrlCnStatus || "unknown"}`]),
      ...(rdsMigrationIncluded ? [] : ["rdsMigrationIncludedInThisRelease=false"]),
    ]),
    currentEvidence: [
      `bridgeDataLayer.current=${bridgeDataLayer.current || "unknown"}`,
      `bridgeDataLayer.target=${bridgeDataLayer.target || "unknown"}`,
      `databaseUrlCnStatus=${bridgeDataLayer.databaseUrlCnStatus || "unknown"}`,
      `rdsMigrationIncludedInThisRelease=${rdsMigrationIncluded}`,
      `rdsMigrationRequiredForFinalProductionCn=${bridgeDataLayer.rdsMigrationRequiredForFinalProductionCn === true}`,
    ],
    verifyCommands: [
      "corepack pnpm aliyun:readiness",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
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

function buildNextActionTimeConfirmations(actions) {
  return actions
    .filter((action) => action.status !== "ready" && action.requiresActionTimeConfirmation)
    .map((action) => {
      const packet = NEXT_ACTION_TIME_CONFIRMATION_BY_ACTION_ID[action.id]
      if (!packet) return null
      return {
        packetId: packet.packetId,
        actionId: action.id,
        title: action.title,
        owner: action.owner,
        sequenceGroup: packet.sequenceGroup,
        minimumUserPhrase: packet.minimumUserPhrase,
        allowedActions: packet.allowedActions,
        explicitlyExcluded: packet.explicitlyExcluded,
        completionEvidence: packet.completionEvidence,
        writeTargets: action.writeTargets,
        verifyCommands: action.verifyCommands,
        nonSecretEvidenceOnly: action.nonSecretEvidenceOnly === true,
      }
    })
    .filter(Boolean)
}

function buildCredentialAcquisitionSummary(sensitive) {
  const brief = sensitive.credentialInterventionBrief
    || sensitive.summary?.credentialInterventionBrief
    || sensitive.summary?.userIntervention
    || {}
  return {
    canCodexProceedWithoutUser: brief.canCodexProceedWithoutUser === true,
    blockedCredentialCount: brief.blockedCredentialCount || 0,
    blockedCredentialNames: brief.blockedCredentialNames || [],
    readySecretEnvVariableCount: brief.readySecretEnvVariableCount || 0,
    readySecretEnvVariableNames: brief.readySecretEnvVariableNames || [],
    actionTimeConfirmationRequiredIds: brief.actionTimeConfirmationRequiredIds
      || brief.actionTimeConfirmationRequired
      || [],
    forbiddenStorage: brief.forbiddenStorage || [
      "git",
      "JSON/Markdown 报告",
      "Docker image",
      "App bundle",
      "小程序或 App 前端包",
    ],
    valueHandlingRules: brief.valueHandlingRules || [
      "blockedCredentialNames 只说明还缺哪些变量名，不包含 value。",
      "readySecretEnvVariableNames 表示本机已有 ready 状态但仍只能通过 KMS/Secrets Manager/SAE secret env 导入。",
      "AppSecret、AccessKeySecret、registry password、RAM Secret、STS token、keystore password 和 Supabase service role key 不能写入 JSON、Markdown、Docker 镜像或 git。",
    ],
    groups: (brief.groups || []).map((group) => ({
      category: group.category,
      actionId: group.actionId,
      userQuestion: group.userQuestion || "",
      status: group.status,
      owner: group.owner || "",
      type: group.type || "",
      blockedCredentialNames: group.blockedCredentialNames || [],
      readySecretEnvVariableNames: group.readySecretEnvVariableNames || [],
      variableNames: group.variableNames || [],
      obtainFrom: group.obtainFrom || "",
      importTargets: group.importTargets || [],
      writeTargets: group.writeTargets || [],
      requiresActionTimeConfirmation: group.requiresActionTimeConfirmation === true,
      valueHandling: group.valueHandling || "",
      forbiddenStorage: group.forbiddenStorage || [],
      verifyCommands: group.verifyCommands || [],
      unblockCondition: group.unblockCondition || "",
    })),
    readySecretEnvVariableGroups: (
      sensitive.readySensitiveEnvVariableGroups
      || sensitive.summary?.readySensitiveEnvVariableGroups
      || []
    ).map((group) => ({
      category: group.category,
      owner: group.owner,
      importTarget: group.importTarget,
      count: group.count,
      variableNames: group.variableNames || [],
    })),
  }
}

function compactDeferredAction(action) {
  return {
    id: action.id,
    title: action.title,
    status: action.status,
    owner: action.owner,
    deferredUntil: FULL_APP_LAUNCH_SCOPE,
    deferReason: "微信开放平台移动应用、Android release signing 和 Apple Team ID 已延期到阿里云后端上线后处理。",
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
    deferReason: "不属于当前阿里云后端补齐目标。",
  }
}

function filterBackendOnlyAction(action) {
  return {
    ...action,
    variableNames: (action.variableNames || []).filter((item) => !isDeferredAppLaunchText(item)),
    currentBlockers: (action.currentBlockers || []).filter((item) => !isDeferredAppLaunchText(item)),
    currentEvidence: (action.currentEvidence || []).filter((item) => !isDeferredAppLaunchText(item)),
    writeTargets: (action.writeTargets || []).filter((item) => !isDeferredAppLaunchText(item)),
    verifyCommands: action.id === "U09_DEPLOY_AUTHORIZATION"
      ? (action.verifyCommands || []).map((item) =>
        item === "corepack pnpm aliyun:cloud:confirmations:strict"
          ? "corepack pnpm aliyun:cloud:confirmations:backend:strict"
          : item,
      )
      : action.verifyCommands || [],
  }
}

function isDeferredAppLaunchText(value) {
  const text = String(value || "")
  return APP_LAUNCH_BLOCKER_PATTERNS.some((pattern) => pattern.test(text))
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

function sensitiveVariableNotes(item) {
  const notes = (item?.variableDetails || [])
    .map((detail) => detail?.notes)
    .filter(Boolean)
  return uniqueStrings(notes.map((note) => `S07_ANDROID_RELEASE_SIGNING:${note}`))
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
    `- currentScope: ${report.currentScope}`,
    `- fullAppLaunchScope: ${report.fullAppLaunchScope}`,
    `- canDeployNow: ${report.canDeployNow}`,
    `- ready: ${report.summary.ready} / ${report.summary.total}`,
    `- blocked: ${report.summary.blocked}`,
    `- nextActionTimeConfirmations: ${report.summary.nextActionTimeConfirmations.join(", ") || "none"}`,
    `- deferredAppLaunchConfirmations: ${report.deferredAppLaunchConfirmations.map((item) => item.packetId).join(", ") || "none"}`,
    `- blockedCredentialCount: ${report.summary.blockedCredentialCount}`,
    `- readySecretEnvVariableCount: ${report.summary.readySecretEnvVariableCount}`,
    `- containsValues: ${report.containsValues}`,
    `- secretLeakCheck: ${report.secretLeakCheck.ok}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    "",
    "## 动作时授权请求",
    "",
    `- required: ${report.actionTimeAuthorizationRequest.required}`,
    `- currentScope: ${report.actionTimeAuthorizationRequest.currentScope}`,
    `- packetIds: ${report.actionTimeAuthorizationRequest.packetIds.join(", ") || "none"}`,
    `- recommendedUserReply: ${report.actionTimeAuthorizationRequest.recommendedUserReply}`,
    `- valueHandling: ${report.actionTimeAuthorizationRequest.valueHandling.join("; ")}`,
    `- explicitlyExcluded: ${report.actionTimeAuthorizationRequest.explicitlyExcluded.join("; ") || "none"}`,
    "",
    "## 密钥/密码/受控变量获取摘要",
    "",
    ...renderCredentialAcquisitionSummary(report.credentialAcquisitionSummary),
    "## 当前可开始的动作时确认",
    "",
  ]

  for (const item of report.nextActionTimeConfirmations) {
    lines.push(
      `### ${item.packetId} ${item.title}`,
      "",
      `- actionId: ${item.actionId}`,
      `- owner: ${item.owner}`,
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

  if (report.backendOnly) {
    lines.push(
      "## 延期的完整 APP 发布项",
      "",
      "- 微信开放平台移动应用、Android release signing 和 Apple Team ID 已延期到阿里云后端上线后处理；本 backend-only 输出不列这些延期项的密钥、密码或签名环境变量。",
      `- deferredAppLaunchConfirmations: ${report.deferredAppLaunchConfirmations.map((item) => item.packetId).join(", ") || "none"}`,
      "",
    )
  } else {
    lines.push(
      "## 延期的完整 APP 发布项",
      "",
    )
    for (const item of report.deferredAppLaunchConfirmations) {
      lines.push(
        `### ${item.packetId} ${item.title}`,
        "",
        `- actionId: ${item.actionId}`,
        `- owner: ${item.owner}`,
        `- minimumUserPhrase: ${item.minimumUserPhrase}`,
        `- writeTargets: ${item.writeTargets.join("; ") || "none"}`,
        `- verifyCommands: ${item.verifyCommands.join("; ") || "none"}`,
        "",
      )
    }
  }

  lines.push(
    "## 动作清单",
    "",
  )

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
  return `${lines.join("\n").trimEnd()}\n`
}

function renderCredentialAcquisitionSummary(summary) {
  if (!summary) return ["- none", ""]
  return [
    `- canCodexProceedWithoutUser: ${summary.canCodexProceedWithoutUser}`,
    `- blockedCredentialCount: ${summary.blockedCredentialCount}`,
    `- blockedCredentialNames: ${summary.blockedCredentialNames.join(", ") || "none"}`,
    `- readySecretEnvVariableCount: ${summary.readySecretEnvVariableCount}`,
    `- readySecretEnvVariableNames: ${summary.readySecretEnvVariableNames.join(", ") || "none"}`,
    `- actionTimeConfirmationRequiredIds: ${summary.actionTimeConfirmationRequiredIds.join(", ") || "none"}`,
    `- forbiddenStorage: ${summary.forbiddenStorage.join(", ") || "none"}`,
    "",
    "| 类别 | 动作 ID | 状态 | 缺失变量 | 已 ready 但需导入 secret env | 获取位置 | 导入/写入目标 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...summary.groups.map((group) => [
      codeCell(group.category),
      codeCell(group.actionId),
      escapeTableCell(group.status),
      escapeTableCell((group.blockedCredentialNames || []).join(", ") || "none"),
      escapeTableCell((group.readySecretEnvVariableNames || []).join(", ") || "none"),
      escapeTableCell(group.obtainFrom),
      escapeTableCell((group.writeTargets || group.importTargets || []).join("; ") || "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "### 已 ready 但仍需导入阿里云 secret env 的变量组",
    "",
    ...(summary.readySecretEnvVariableGroups.length
      ? [
        "| 类别 | owner | 导入目标 | 变量名 |",
        "| --- | --- | --- | --- |",
        ...summary.readySecretEnvVariableGroups.map((group) => [
          codeCell(group.category),
          escapeTableCell(group.owner),
          escapeTableCell(group.importTarget),
          escapeTableCell((group.variableNames || []).join(", ") || "none"),
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
        "",
      ]
      : ["- none", ""]),
    "### 处理规则",
    "",
    ...(summary.valueHandlingRules.length
      ? summary.valueHandlingRules.map((item) => `- ${item}`)
      : ["- none"]),
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
    "  node scripts/summarize-aliyun-user-action-brief.mjs [--backend-only] [--env-file path] [--cloud-confirmations path] [--out /tmp/user-actions.json] [--markdown /tmp/user-actions.md]",
    "",
    "Builds a non-secret user action brief for Aliyun production-cn release blockers.",
    "--backend-only excludes deferred WeChat Open Platform mobile app, Android signing, and Apple Team ID launch work from the current output.",
    "It does not create resources, import secrets, mutate DNS, push images, deploy, or pay for ACR.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
