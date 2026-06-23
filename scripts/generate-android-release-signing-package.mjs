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

const EXPECTED_ANDROID_PACKAGE_NAME = "com.ipgongchang.meiyehuajing"
const SIGNING_VARIABLE_NAMES = [
  "MEIYE_RELEASE_STORE_FILE",
  "MEIYE_RELEASE_STORE_PASSWORD",
  "MEIYE_RELEASE_KEY_ALIAS",
  "MEIYE_RELEASE_KEY_PASSWORD",
]

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
  return listFilesRecursive(outputRoot, (filePath) => {
    const lower = filePath.toLowerCase()
    return (lower.endsWith(".apk") || lower.endsWith(".aab")) && lower.includes("release")
  }).map((filePath) => ({
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
  const sensitive = runJson("sensitive_blockers", [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
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
  const androidSigning = (sensitive.items || []).find((item) => item.id === "S07_ANDROID_RELEASE_SIGNING") || {}
  const nativeAndroid = nativeRelease.android || {}
  const releaseSigningConfigReady = nativeAndroid.releaseSigningConfigReady === true
  const releaseUsesDebugSigning = nativeAndroid.releaseUsesDebugSigning === true
  const releaseArtifactReady = releaseArtifacts.length > 0
  const androidConfigured = wechat.androidConfigured === true
  const readyForWechatAndroidSignature =
    releaseSigningConfigReady &&
    !releaseUsesDebugSigning &&
    releaseArtifactReady &&
    hasReleaseWechatSignature &&
    androidConfigured
  const canStartNow = releaseSigningConfigReady && !releaseUsesDebugSigning
  const currentBlockers = [
    ...(androidSigning.status === "ready" ? [] : [`S07_ANDROID_RELEASE_SIGNING:${androidSigning.status || "blocked"}`]),
    ...(releaseArtifactReady ? [] : ["android_release_artifact_missing"]),
    ...(hasReleaseWechatSignature ? [] : ["wechatOpenPlatform:androidSignature"]),
    ...(androidConfigured ? [] : ["wechatOpenPlatform:androidConfigured"]),
    ...(releaseUsesDebugSigning ? ["android_release_uses_debug_signing"] : []),
    ...(releaseSigningConfigReady ? [] : ["android_release_signing_config_not_ready"]),
  ]

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    currentAnswer: readyForWechatAndroidSignature
      ? "Android release signing 和微信开放平台 Android 签名证据已 ready；本报告只输出非密钥验收材料。"
      : "Android release signing 还没完成；本报告给出 P10 动作时确认范围、变量名、签名生成步骤和禁止项，不读取 keystore 密码。",
    summary: {
      packetId: "P10_ANDROID_RELEASE_SIGNING",
      status: androidSigning.status || "blocked",
      canStartNow,
      readyForWechatAndroidSignature,
      androidPackageName: nativeAndroid.applicationId || EXPECTED_ANDROID_PACKAGE_NAME,
      releaseSigningConfig: nativeAndroid.releaseSigningConfig || "",
      releaseSigningConfigReady,
      releaseUsesDebugSigning,
      releaseArtifactReady,
      releaseArtifacts: releaseArtifacts.length,
      wechatSignatureRecorded: hasReleaseWechatSignature,
      androidConfigured,
      currentBlockers,
      sensitiveBlockerId: androidSigning.id || "S07_ANDROID_RELEASE_SIGNING",
    },
    actionPacket: {
      packetId: "P10_ANDROID_RELEASE_SIGNING",
      title: "配置 Android release signing 并生成微信开放平台 Android 签名",
      canStartNow,
      readyForWechatAndroidSignature,
      minimumAuthorizationPhrase: "授权使用受控 Android release keystore 构建/签名 release 包并读取微信开放平台 Android 应用签名；不输出 keystore 密码。",
      allowedActions: [
        "只在本机或 CI 受控 signing secret store 配置 release signing 变量名。",
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
      writeTargets: androidSigning.writeTargets || [
        "MEIYE_RELEASE_STORE_FILE / MEIYE_RELEASE_STORE_PASSWORD / MEIYE_RELEASE_KEY_ALIAS / MEIYE_RELEASE_KEY_PASSWORD -> 本机或 CI 受控 signing secret store",
        "微信开放平台 -> 移动应用 -> Android 应用签名",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature / androidConfigured",
      ],
      verifyCommands: androidSigning.verifyCommands || [
        "cd /Users/Admin/Documents/美业话镜APP/meiye-huajing-app/android && ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" ./gradlew assembleRelease",
        "ANDROID_HOME=\"$HOME/Library/Android/sdk\" ANDROID_SDK_ROOT=\"$HOME/Library/Android/sdk\" $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/release/*.apk",
        "corepack pnpm aliyun:android-signing:package",
        "corepack pnpm aliyun:wechat-open:package",
      ],
      nonSecretEvidenceOnly: false,
    },
    signingInputs: {
      variableNames: androidSigning.variableNames?.length ? androidSigning.variableNames : SIGNING_VARIABLE_NAMES,
      variableDetails: sanitizeVariableDetails(androidSigning.variableDetails || []),
      importTarget: "本机/CI Android signing secret store，不导入阿里云 SAE env。",
      source: "Android release keystore 管理位置 / CI Secret Store / 发布负责人",
    },
    nativeRelease: {
      androidPackageName: nativeAndroid.applicationId || EXPECTED_ANDROID_PACKAGE_NAME,
      namespace: nativeAndroid.namespace || "",
      releaseSigningConfig: nativeAndroid.releaseSigningConfig || "",
      releaseSigningConfigReady,
      releaseUsesDebugSigning,
    },
    releaseArtifacts,
    wechatOpenPlatformWriteback: {
      androidSignatureStatus: hasReleaseWechatSignature ? "recorded_non_secret_signature_hash" : "missing_release_wechat_signature",
      androidConfigured,
      writeTargets: [
        "微信开放平台 -> 移动应用 -> Android 应用签名",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidSignature",
        "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.wechatOpenPlatform.androidConfigured=true",
      ],
    },
    currentBlockers,
    verifyCommands: [
      "corepack pnpm aliyun:android-signing:package",
      "corepack pnpm aliyun:app-native:check",
      "corepack pnpm aliyun:wechat-open:package",
      "corepack pnpm aliyun:sensitive:blockers",
    ],
    safetyBoundary: [
      "本报告不执行 assembleRelease、不读取 keystore、不读取或输出 store/key password。",
      "Android release signing secret 只进入本机或 CI 受控 signing secret store，不进入阿里云 SAE env。",
      "微信开放平台只记录 release APK/AAB 的 Android 签名 hash 和非密钥 evidence handle。",
      "本报告不创建微信移动应用、不提交审核、不导入环境变量、不部署 production-cn。",
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

function sanitizeVariableDetails(details) {
  return details.map((detail) => ({
    name: detail.name,
    required: detail.required === true,
    status: detail.status || "unknown",
    sensitivity: detail.sensitivity || "unknown",
    sourceCategory: detail.sourceCategory || "android_release_signing",
    owner: detail.owner || "Android 发布操作员 / CI Secret Store",
    consolePath: detail.consolePath || "本机 ~/.gradle/gradle.properties、环境变量或 CI Secret Store；不要写入仓库。",
    obtain: detail.obtain || "从已有 Android release keystore 管理位置或发布负责人处确认。",
    importTarget: detail.importTarget || "本机/CI Android signing secret store，不导入阿里云 SAE env。",
    cloudConfirmationKey: detail.cloudConfirmationKey || "wechatOpenPlatform",
    action: detail.action || "动作时用于 assembleRelease；随后用 release APK/AAB 读取微信开放平台 Android 应用签名。",
    notes: detail.notes || "",
  }))
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
  const packet = report.actionPacket
  return [
    "# Android Release Signing 动作确认包",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- packetId: ${report.summary.packetId}`,
    `- canStartNow: ${report.summary.canStartNow}`,
    `- readyForWechatAndroidSignature: ${report.summary.readyForWechatAndroidSignature}`,
    `- androidPackageName: ${report.summary.androidPackageName}`,
    `- releaseSigningConfig: ${report.summary.releaseSigningConfig}`,
    `- releaseSigningConfigReady: ${report.summary.releaseSigningConfigReady}`,
    `- releaseUsesDebugSigning: ${report.summary.releaseUsesDebugSigning}`,
    `- releaseArtifactReady: ${report.summary.releaseArtifactReady}`,
    `- wechatSignatureRecorded: ${report.summary.wechatSignatureRecorded}`,
    `- androidConfigured: ${report.summary.androidConfigured}`,
    `- currentBlockers: ${report.currentBlockers.join(", ") || "none"}`,
    "",
    "## 动作确认包",
    "",
    `- packetId: ${packet.packetId}`,
    `- title: ${packet.title}`,
    `- minimumAuthorizationPhrase: ${packet.minimumAuthorizationPhrase}`,
    "- allowedActions:",
    ...packet.allowedActions.map((item) => `  - ${item}`),
    "- explicitlyExcluded:",
    ...packet.explicitlyExcluded.map((item) => `  - ${item}`),
    "- completionEvidence:",
    ...packet.completionEvidence.map((item) => `  - ${item}`),
    "- writeTargets:",
    ...packet.writeTargets.map((item) => `  - ${item}`),
    "- verifyCommands:",
    ...packet.verifyCommands.map((item) => `  - ${item}`),
    "",
    "## Signing Inputs",
    "",
    `- importTarget: ${report.signingInputs.importTarget}`,
    `- source: ${report.signingInputs.source}`,
    "- variableNames:",
    ...report.signingInputs.variableNames.map((item) => `  - ${item}`),
    "- variableDetails:",
    ...report.signingInputs.variableDetails.map((item) => `  - ${item.name}: ${item.status}, ${item.sensitivity}, ${item.importTarget}`),
    "",
    "## Release Artifacts",
    "",
    ...(report.releaseArtifacts.length
      ? report.releaseArtifacts.map((item) => `- ${item.type}: ${item.path} (${item.bytes} bytes)`)
      : ["- none"]),
    "",
    "## 微信开放平台回填",
    "",
    `- androidSignatureStatus: ${report.wechatOpenPlatformWriteback.androidSignatureStatus}`,
    `- androidConfigured: ${report.wechatOpenPlatformWriteback.androidConfigured}`,
    ...report.wechatOpenPlatformWriteback.writeTargets.map((item) => `- ${item}`),
    "",
    "## 安全边界",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
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
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-android-release-signing-package.mjs [--app-root path] [--env-file path] [--cloud-confirmations path] [--out /tmp/android-signing.json] [--markdown /tmp/android-signing.md]",
    "",
    "Builds a non-secret Android release signing action package for P10_ANDROID_RELEASE_SIGNING.",
    "It does not build release packages, read keystore passwords, mutate WeChat/Aliyun resources, import env vars, deploy, or git push.",
  ].join("\n"))
}

main()
