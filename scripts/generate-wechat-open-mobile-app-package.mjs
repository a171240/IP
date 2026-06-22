#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_APP_ROOT = resolve(WORKSPACE_ROOT, "meiye-huajing-app")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_CLOUD_CONFIRMATIONS_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.cloud-confirmations.local.json")

const EXPECTED_APP_NAME = "美业话镜"
const EXPECTED_ANDROID_PACKAGE_NAME = "com.ipgongchang.meiyehuajing"
const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"
const EXPECTED_IOS_ASSOCIATED_DOMAIN = "applinks:api-cn.ipgongchang.xin"
const EXPECTED_IOS_UNIVERSAL_LINK = "https://api-cn.ipgongchang.xin/app/wechat/"
const EXPECTED_AASA_URL = "https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association"

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
    appRoot: DEFAULT_APP_ROOT,
    envFile: DEFAULT_ENV_FILE,
    cloudConfirmationsFile: DEFAULT_CLOUD_CONFIRMATIONS_FILE,
    outPath: "",
    markdownPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--app-root") {
      args.appRoot = resolveValue(argv[++index], "--app-root")
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

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function buildPackage(args) {
  const nativeRelease = runJson("app_native_release", [
    "scripts/check-app-native-release-config.mjs",
    "--allow-blocking",
    "--app-root",
    args.appRoot,
  ])
  const status = runJson("production_status", [
    "scripts/summarize-aliyun-production-cn-status.mjs",
    "--env-file",
    args.envFile,
    "--cloud-confirmations",
    args.cloudConfirmationsFile,
  ])
  const cloudConfirmations = readJsonIfExists(args.cloudConfirmationsFile)
  const wechat = cloudConfirmations?.items?.wechatOpenPlatform || {}
  const androidSignature = String(wechat.androidSignature || "").trim()
  const hasReleaseWechatSignature = Boolean(androidSignature && !/^TODO_|^pending_/i.test(androidSignature))
  const appleTeamIdMissing = status.summary?.machineBlocking?.includes("app_universal_link:apple_team_id_missing") === true
  const canCreateDraftInWechatOpenPlatform =
    wechat.accountVerified === true &&
    nativeRelease.android?.ready === true &&
    nativeRelease.ios?.ready === true
  const readyToSubmitForReview =
    canCreateDraftInWechatOpenPlatform &&
    hasReleaseWechatSignature &&
    wechat.androidConfigured === true &&
    wechat.iosConfigured === true &&
    !appleTeamIdMissing

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    currentAnswer: wechat.mobileAppCreated === true
      ? "微信开放平台移动 App 已记录为已创建；本报告只核对创建材料和回填目标，不读取 AppSecret。"
      : "微信开放平台账号已认证但移动 App 还没创建；本报告给出创建移动应用所需的非密钥材料和回填目标。",
    summary: {
      accountVerified: wechat.accountVerified === true,
      mobileAppCreated: wechat.mobileAppCreated === true,
      mobileAppSubmitted: wechat.mobileAppSubmitted === true,
      reviewStatus: wechat.reviewStatus || "unknown",
      canCreateDraftInWechatOpenPlatform,
      readyToSubmitForReview,
      mobileAppCredentialsAvailable: wechat.mobileAppIdReady === true && wechat.mobileAppSecretReady === true,
      requiredBlocking: status.summary?.requiredBlocking || [],
      machineBlocking: status.summary?.machineBlocking || [],
    },
    mobileAppCreationPackage: {
      consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 创建移动应用",
      appName: wechat.mobileAppName || EXPECTED_APP_NAME,
      appType: "移动应用，不是小程序",
      android: {
        packageName: nativeRelease.android?.applicationId || EXPECTED_ANDROID_PACKAGE_NAME,
        namespace: nativeRelease.android?.namespace || "",
        releaseSigningConfig: nativeRelease.android?.releaseSigningConfig || "",
        releaseUsesDebugSigning: nativeRelease.android?.releaseUsesDebugSigning === true,
        releaseSigningConfigReady: nativeRelease.android?.releaseSigningConfigReady === true,
        wechatSignatureRequired: true,
        wechatSignatureRecorded: hasReleaseWechatSignature,
        wechatSignatureEvidence: hasReleaseWechatSignature ? androidSignature : "missing_release_wechat_signature",
        currentConfiguredInWechatOpenPlatform: wechat.androidConfigured === true,
      },
      ios: {
        bundleId: nativeRelease.ios?.bundleIds?.[0] || EXPECTED_IOS_BUNDLE_ID,
        associatedDomain: EXPECTED_IOS_ASSOCIATED_DOMAIN,
        associatedDomainsConfiguredInApp: nativeRelease.ios?.associatedDomainsConfigured === true,
        universalLink: wechat.iosUniversalLink || EXPECTED_IOS_UNIVERSAL_LINK,
        aasaUrl: EXPECTED_AASA_URL,
        appleTeamIdRequiredForAasa: true,
        appleTeamIdMissing,
        currentConfiguredInWechatOpenPlatform: wechat.iosConfigured === true,
      },
      backendWriteTargetsAfterApproval: [
        "WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env",
        "WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env",
        "WECHAT_OPEN_APP_REVIEW_STATUS=approved -> 阿里云 SAE plain env",
      ],
      localEvidenceWriteTargetsAfterApproval: [
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.confirmed=true",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> mobileAppCreated/mobileAppSubmitted/mobileAppIdReady/mobileAppSecretReady=true",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> reviewStatus=approved and non-secret evidence handle",
      ],
    },
    beforeSubmissionChecklist: [
      "确认创建的是微信开放平台移动应用，不是小程序或公众号。",
      "App 名称使用“美业话镜”，Android 包名和 iOS Bundle ID 都使用 com.ipgongchang.meiyehuajing。",
      "Android 应用签名必须来自 release 证书，不能用 debug keystore。",
      "iOS Universal Link 使用 https://api-cn.ipgongchang.xin/app/wechat/，并确保 Associated Domains 保持 applinks:api-cn.ipgongchang.xin。",
      "Apple Team ID 需要从 Apple Developer 获取后导入 SAE plain env，用于 AASA appID。",
      "审核资料、图标、截图、应用介绍和隐私协议由操作员在微信开放平台页面填写，本报告不保存这些素材或账号凭证。",
    ],
    afterApprovalChecklist: [
      "审核通过后才读取移动应用 AppID/AppSecret。",
      "AppID 只导入阿里云 SAE 服务端 plain env，不写进 App 包。",
      "AppSecret 只导入 KMS/Secrets Manager/SAE secret env，不写入文档、JSON、镜像或 git。",
      "回填 cloud-confirmations.local.json 时只记录 confirmed 布尔值、审核状态和非密钥证据编号。",
      "再运行 aliyun:readiness、aliyun:aasa:check、aliyun:health:smoke 和 aliyun:app-api:smoke。",
    ],
    verifyCommands: [
      "corepack pnpm aliyun:wechat-open:package",
      "corepack pnpm aliyun:app-native:check",
      "corepack pnpm aliyun:aasa:check",
      "corepack pnpm aliyun:readiness",
      "corepack pnpm aliyun:health:smoke",
      "corepack pnpm aliyun:app-api:smoke",
    ],
    forbidden: [
      "不能用小程序 AppID/Secret 替代移动应用 AppID/AppSecret。",
      "不能把 WECHAT_OPEN_APP_SECRET 写入 App 包、文档、JSON、Docker 镜像或 git。",
      "不能把 Android debug 签名填到微信开放平台移动应用。",
      "不能在移动应用未审核通过前把 WECHAT_OPEN_APP_ID/SECRET 标记为 ready。",
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
  const app = report.mobileAppCreationPackage
  return [
    "# 微信开放平台移动应用创建材料包",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- accountVerified: ${report.summary.accountVerified}`,
    `- mobileAppCreated: ${report.summary.mobileAppCreated}`,
    `- reviewStatus: ${report.summary.reviewStatus}`,
    `- canCreateDraftInWechatOpenPlatform: ${report.summary.canCreateDraftInWechatOpenPlatform}`,
    `- readyToSubmitForReview: ${report.summary.readyToSubmitForReview}`,
    `- requiredBlocking: ${report.summary.requiredBlocking.length ? report.summary.requiredBlocking.join(", ") : "none"}`,
    "",
    "## 创建材料",
    "",
    `- consolePath: ${app.consolePath}`,
    `- appName: ${app.appName}`,
    `- appType: ${app.appType}`,
    `- androidPackageName: ${app.android.packageName}`,
    `- androidReleaseSigningConfig: ${app.android.releaseSigningConfig}`,
    `- androidWechatSignatureRecorded: ${app.android.wechatSignatureRecorded}`,
    `- iosBundleId: ${app.ios.bundleId}`,
    `- iosAssociatedDomain: ${app.ios.associatedDomain}`,
    `- iosUniversalLink: ${app.ios.universalLink}`,
    `- aasaUrl: ${app.ios.aasaUrl}`,
    `- appleTeamIdMissing: ${app.ios.appleTeamIdMissing}`,
    "",
    "## 审核前检查",
    "",
    ...report.beforeSubmissionChecklist.map((item) => `- ${item}`),
    "",
    "## 审核通过后回填",
    "",
    ...report.afterApprovalChecklist.map((item) => `- ${item}`),
    "",
    "## 写入目标",
    "",
    ...app.backendWriteTargetsAfterApproval.map((item) => `- ${item}`),
    ...app.localEvidenceWriteTargetsAfterApproval.map((item) => `- ${item}`),
    "",
    "## 验证命令",
    "",
    ...report.verifyCommands.map((item) => `- \`${item}\``),
    "",
    "## 禁止事项",
    "",
    ...report.forbidden.map((item) => `- ${item}`),
    "",
  ].join("\n")
}

function writeOutput(filePath, content) {
  if (!filePath) return
  if (!isAbsolute(filePath)) throw new Error("output_path_must_be_absolute")
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildPackage(args)
  writeOutput(args.outPath, JSON.stringify(report, null, 2))
  writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-wechat-open-mobile-app-package.mjs [--app-root path] [--env-file path] [--cloud-confirmations path] [--out /tmp/wechat.json] [--markdown /tmp/wechat.md]",
    "",
    "Builds a non-secret WeChat Open Platform mobile app creation package from the current React Native native release config and production-cn readiness evidence.",
    "It does not create a WeChat mobile app, read AppSecret values, import env vars, deploy, or mutate cloud resources.",
  ].join("\n"))
}

main()
