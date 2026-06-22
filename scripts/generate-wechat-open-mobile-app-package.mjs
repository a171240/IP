#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
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

function listFilesRecursive(root, predicate, results = []) {
  if (!existsSync(root)) return results
  for (const name of readdirSync(root)) {
    const filePath = resolve(root, name)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      listFilesRecursive(filePath, predicate, results)
      continue
    }
    if (predicate(filePath)) results.push(filePath)
  }
  return results
}

function findAndroidReleaseArtifacts(appRoot) {
  const outputRoot = resolve(appRoot, "android/app/build/outputs")
  const artifacts = listFilesRecursive(outputRoot, (filePath) => {
    const lower = filePath.toLowerCase()
    return (lower.endsWith(".apk") || lower.endsWith(".aab")) && lower.includes("release")
  })
  return artifacts.map((filePath) => ({
    path: filePath,
    type: filePath.toLowerCase().endsWith(".aab") ? "aab" : "apk",
    bytes: statSync(filePath).size,
  }))
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
  const releaseArtifacts = findAndroidReleaseArtifacts(args.appRoot)
  const releaseArtifactReady = releaseArtifacts.length > 0
  const appleTeamIdMissing = status.summary?.machineBlocking?.includes("app_universal_link:apple_team_id_missing") === true
  const canCreateDraftInWechatOpenPlatform =
    wechat.accountVerified === true &&
    nativeRelease.android?.ready === true &&
    nativeRelease.ios?.ready === true
  const submissionBlockers = buildSubmissionBlockers({
    canCreateDraftInWechatOpenPlatform,
    hasReleaseWechatSignature,
    androidConfigured: wechat.androidConfigured === true,
    iosConfigured: wechat.iosConfigured === true,
    appleTeamIdMissing,
  })
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
      submissionBlockers,
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
      androidSignaturePackage: {
        ready: hasReleaseWechatSignature && wechat.androidConfigured === true,
        status: hasReleaseWechatSignature ? "recorded" : "missing_release_wechat_signature",
        packageName: nativeRelease.android?.applicationId || EXPECTED_ANDROID_PACKAGE_NAME,
        releaseSigningConfig: nativeRelease.android?.releaseSigningConfig || "",
        releaseUsesDebugSigning: nativeRelease.android?.releaseUsesDebugSigning === true,
        releaseSigningConfigReady: nativeRelease.android?.releaseSigningConfigReady === true,
        releaseArtifactReady,
        releaseArtifacts,
        wechatSignatureRecorded: hasReleaseWechatSignature,
        configuredInWechatOpenPlatform: wechat.androidConfigured === true,
        writeTargets: [
          "微信开放平台 -> 移动应用 -> Android 应用签名",
          "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature",
          "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidConfigured=true",
        ],
        obtainSteps: [
          "用 release keystore 构建正式 release APK；不要用 debug.keystore。",
          "用微信开放平台 Android 签名生成工具或 Android build-tools/apksigner 从 release APK 读取应用签名。",
          "只记录签名 hash 和非密钥 evidence handle；不要记录 keystore 文件、密码、alias password 或证书私钥。",
          "把 Android 包名 com.ipgongchang.meiyehuajing 和 release 签名填入微信开放平台移动应用。",
        ],
        verifyCommands: [
          "cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" ./gradlew assembleRelease",
          "ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk",
          "corepack pnpm aliyun:wechat-open:package",
          "corepack pnpm aliyun:app-native:check",
        ],
        forbidden: [
          "不能使用 debug.keystore 或 debug APK 的签名。",
          "不能把 MEIYE_RELEASE_STORE_PASSWORD、MEIYE_RELEASE_KEY_PASSWORD、keystore 文件、证书私钥或 AppSecret 写入 JSON、Markdown、镜像或 git。",
          "不能把 Android package name 以外的小程序信息填到移动应用 Android 配置里。",
        ],
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
    actionPacket: {
      packetId: "P01_WECHAT_OPEN_MOBILE_APP",
      title: "创建微信开放平台移动应用并提交审核",
      canStartNow: canCreateDraftInWechatOpenPlatform,
      readyToSubmitForReview,
      submissionBlockers,
      consolePath: "微信开放平台 -> 管理中心 -> 移动应用 -> 创建移动应用",
      minimumAuthorizationPhrase: "授权在微信开放平台创建“美业话镜”移动应用草稿，填写 Android 包名、iOS Bundle ID 和 Universal Link；审核通过前不读取或输出 AppSecret。",
      createDraftFields: [
        field("appName", wechat.mobileAppName || EXPECTED_APP_NAME, "product identity"),
        field("appType", "移动应用，不是小程序", "release policy"),
        field("androidPackageName", nativeRelease.android?.applicationId || EXPECTED_ANDROID_PACKAGE_NAME, "React Native Android release config"),
        field("androidReleaseSignature", hasReleaseWechatSignature ? "recorded_non_secret_signature_hash" : "missing_release_wechat_signature", "release APK signature evidence"),
        field("iosBundleId", nativeRelease.ios?.bundleIds?.[0] || EXPECTED_IOS_BUNDLE_ID, "iOS release config"),
        field("iosUniversalLink", wechat.iosUniversalLink || EXPECTED_IOS_UNIVERSAL_LINK, "WeChat Open Platform mobile app config"),
        field("iosAssociatedDomain", EXPECTED_IOS_ASSOCIATED_DOMAIN, "iOS entitlements"),
      ],
      submissionMaterials: [
        "应用图标、截图、应用介绍、官网/隐私协议等素材由操作员在微信开放平台页面填写；本报告不保存素材或账号凭证。",
        "Android 签名必须来自 release APK 的微信签名，不接受 debug keystore。",
        "iOS Universal Link 必须与 App Associated Domains 和服务端 AASA 一致。",
      ],
      acceptanceEvidence: [
        "mobileAppCreated=true",
        "mobileAppSubmitted=true",
        "reviewStatus=reviewing 或 approved",
        "审核通过后 mobileAppIdReady=true",
        "审核通过后 mobileAppSecretReady=true",
        "cloud-confirmations.local.json 只记录审核状态和非密钥 evidence handle",
      ],
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
      verifyCommands: [
        "corepack pnpm aliyun:wechat-open:package",
        "corepack pnpm aliyun:wechat-open:package:test",
        "corepack pnpm aliyun:app-native:check",
        "corepack pnpm aliyun:aasa:check",
        "corepack pnpm aliyun:readiness",
      ],
      forbidden: [
        "不能用小程序 AppID/Secret 替代移动应用 AppID/AppSecret。",
        "审核通过前不能把 WECHAT_OPEN_APP_ID/SECRET 标记为 ready。",
        "不能把 WECHAT_OPEN_APP_SECRET 写入 App 包、文档、JSON、Docker 镜像或 git。",
      ],
      mutationPerformedByThisCommand: false,
      nonSecretEvidenceOnly: true,
    },
    beforeSubmissionChecklist: [
      "确认创建的是微信开放平台移动应用，不是小程序或公众号。",
      "App 名称使用“美业话镜”，Android 包名和 iOS Bundle ID 都使用 com.ipgongchang.meiyehuajing。",
      "Android 应用签名必须来自 release 证书，不能用 debug keystore。",
      "Android release 签名需要来自 release APK；当前包会报告是否发现 release APK/AAB 产物以及是否已记录微信签名。",
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

function buildSubmissionBlockers({
  canCreateDraftInWechatOpenPlatform,
  hasReleaseWechatSignature,
  androidConfigured,
  iosConfigured,
  appleTeamIdMissing,
}) {
  const blockers = []
  if (!canCreateDraftInWechatOpenPlatform) blockers.push("native_release_config_not_ready")
  if (!hasReleaseWechatSignature) blockers.push("android_release_wechat_signature_missing")
  if (!androidConfigured) blockers.push("wechat_android_package_signature_not_recorded")
  if (!iosConfigured) blockers.push("wechat_ios_bundle_universal_link_not_recorded")
  if (appleTeamIdMissing) blockers.push("apple_team_id_missing_for_aasa")
  return blockers
}

function field(name, value, source) {
  return {
    name,
    value,
    source,
  }
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
  const actionPacket = report.actionPacket
  const androidSignature = app.androidSignaturePackage
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
    `- submissionBlockers: ${report.summary.submissionBlockers.length ? report.summary.submissionBlockers.join(", ") : "none"}`,
    `- requiredBlocking: ${report.summary.requiredBlocking.length ? report.summary.requiredBlocking.join(", ") : "none"}`,
    "",
    "## 动作确认包",
    "",
    `- packetId: ${actionPacket.packetId}`,
    `- title: ${actionPacket.title}`,
    `- canStartNow: ${actionPacket.canStartNow}`,
    `- readyToSubmitForReview: ${actionPacket.readyToSubmitForReview}`,
    `- consolePath: ${actionPacket.consolePath}`,
    `- minimumAuthorizationPhrase: ${actionPacket.minimumAuthorizationPhrase}`,
    `- submissionBlockers: ${actionPacket.submissionBlockers.length ? actionPacket.submissionBlockers.join(", ") : "none"}`,
    "- createDraftFields:",
    ...actionPacket.createDraftFields.map((item) => `  - ${item.name}: ${item.value} (${item.source})`),
    "- submissionMaterials:",
    ...actionPacket.submissionMaterials.map((item) => `  - ${item}`),
    "- acceptanceEvidence:",
    ...actionPacket.acceptanceEvidence.map((item) => `  - ${item}`),
    "- verifyCommands:",
    ...actionPacket.verifyCommands.map((item) => `  - ${item}`),
    "- forbidden:",
    ...actionPacket.forbidden.map((item) => `  - ${item}`),
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
    "## Android Release 签名材料",
    "",
    `- ready: ${androidSignature.ready}`,
    `- status: ${androidSignature.status}`,
    `- packageName: ${androidSignature.packageName}`,
    `- releaseSigningConfig: ${androidSignature.releaseSigningConfig}`,
    `- releaseUsesDebugSigning: ${androidSignature.releaseUsesDebugSigning}`,
    `- releaseSigningConfigReady: ${androidSignature.releaseSigningConfigReady}`,
    `- releaseArtifactReady: ${androidSignature.releaseArtifactReady}`,
    `- releaseArtifacts: ${androidSignature.releaseArtifacts.length ? androidSignature.releaseArtifacts.map((item) => `${item.type}:${item.path}`).join(", ") : "none"}`,
    `- wechatSignatureRecorded: ${androidSignature.wechatSignatureRecorded}`,
    `- configuredInWechatOpenPlatform: ${androidSignature.configuredInWechatOpenPlatform}`,
    "- obtainSteps:",
    ...androidSignature.obtainSteps.map((item) => `  - ${item}`),
    "- writeTargets:",
    ...androidSignature.writeTargets.map((item) => `  - ${item}`),
    "- verifyCommands:",
    ...androidSignature.verifyCommands.map((item) => `  - ${item}`),
    "- forbidden:",
    ...androidSignature.forbidden.map((item) => `  - ${item}`),
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
