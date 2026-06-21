#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_APP_ROOT = resolve(WORKSPACE_ROOT, "meiye-huajing-app")

const EXPECTED_APP_NAME = "美业话镜"
const EXPECTED_ANDROID_PACKAGE_NAME = "com.ipgongchang.meiyehuajing"
const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"

function parseArgs(argv) {
  const args = {
    appRoot: DEFAULT_APP_ROOT,
    allowBlocking: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--app-root") {
      args.appRoot = resolveValue(argv[++index], "--app-root")
      continue
    }
    if (arg === "--allow-blocking") {
      args.allowBlocking = true
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

function readTextIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : ""
}

function firstMatch(source, pattern) {
  return source.match(pattern)?.[1]?.trim() || ""
}

function allMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]?.trim()).filter(Boolean)
}

function findBlock(source, name) {
  const start = source.search(new RegExp(`\\b${name}\\s*\\{`))
  if (start < 0) return ""
  const openIndex = source.indexOf("{", start)
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return source.slice(openIndex + 1, index)
    }
  }
  return ""
}

function findNestedBlock(source, outerName, innerName) {
  const outer = findBlock(source, outerName)
  return outer ? findBlock(outer, innerName) : ""
}

function checkAndroid(appRoot) {
  const buildGradlePath = resolve(appRoot, "android/app/build.gradle")
  const source = readTextIfExists(buildGradlePath)
  const blockers = []
  if (!source) {
    return {
      ready: false,
      buildGradlePath,
      blockers: ["android_build_gradle_missing"],
      namespace: "",
      applicationId: "",
      releaseSigningConfig: "",
      releaseUsesDebugSigning: false,
      releaseSigningConfigReady: false,
    }
  }

  const namespace = firstMatch(source, /\bnamespace\s+["']([^"']+)["']/)
  const applicationId = firstMatch(source, /\bapplicationId\s+["']([^"']+)["']/)
  const releaseBlock = findNestedBlock(source, "buildTypes", "release")
  const releaseSigningConfig = firstMatch(releaseBlock, /\bsigningConfig\s+signingConfigs\.([A-Za-z0-9_]+)/)
  const hasReleaseSigningConfig = /\brelease\s*\{/.test(findBlock(source, "signingConfigs"))
  const releaseUsesDebugSigning = releaseSigningConfig === "debug"
  const releaseSigningConfigReady = Boolean(
    releaseSigningConfig &&
    releaseSigningConfig !== "debug" &&
    hasReleaseSigningConfig,
  )

  if (namespace !== EXPECTED_ANDROID_PACKAGE_NAME) blockers.push(`android_namespace=${EXPECTED_ANDROID_PACKAGE_NAME}`)
  if (applicationId !== EXPECTED_ANDROID_PACKAGE_NAME) blockers.push(`android_application_id=${EXPECTED_ANDROID_PACKAGE_NAME}`)
  if (!releaseSigningConfig) blockers.push("android_release_signing_config_missing")
  if (releaseUsesDebugSigning) blockers.push("android_release_uses_debug_signing")
  if (releaseSigningConfig && !releaseSigningConfigReady) blockers.push("android_release_signing_config_not_ready")

  return {
    ready: blockers.length === 0,
    buildGradlePath,
    blockers: [...new Set(blockers)],
    namespace,
    applicationId,
    releaseSigningConfig: releaseSigningConfig || "",
    releaseUsesDebugSigning,
    releaseSigningConfigReady,
  }
}

function checkIos(appRoot) {
  const projectPath = resolve(appRoot, "ios/MeiyeHuajingApp.xcodeproj/project.pbxproj")
  const infoPlistPath = resolve(appRoot, "ios/MeiyeHuajingApp/Info.plist")
  const project = readTextIfExists(projectPath)
  const infoPlist = readTextIfExists(infoPlistPath)
  const blockers = []
  if (!project) blockers.push("ios_project_missing")
  if (!infoPlist) blockers.push("ios_info_plist_missing")

  const bundleIds = [...new Set(allMatches(project, /\bPRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g))]
  const displayName = firstMatch(infoPlist, /<key>CFBundleDisplayName<\/key>\s*<string>([^<]+)<\/string>/)
  const associatedDomainsConfigured =
    /com\.apple\.developer\.associated-domains/.test(project) ||
    /com\.apple\.developer\.associated-domains/.test(infoPlist) ||
    /applinks:/.test(project) ||
    /applinks:/.test(infoPlist)
  const allBundleIdsExpected = bundleIds.length > 0 && bundleIds.every((item) => item === EXPECTED_IOS_BUNDLE_ID)

  if (!allBundleIdsExpected) blockers.push(`ios_bundle_id=${EXPECTED_IOS_BUNDLE_ID}`)
  if (displayName !== EXPECTED_APP_NAME) blockers.push(`ios_display_name=${EXPECTED_APP_NAME}`)
  if (!associatedDomainsConfigured) blockers.push("ios_associated_domains_missing")

  return {
    ready: blockers.length === 0,
    projectPath,
    infoPlistPath,
    blockers: [...new Set(blockers)],
    bundleIds,
    displayName,
    associatedDomainsConfigured,
  }
}

function main() {
  const args = parseArgs(process.argv)
  const blockers = []
  if (!existsSync(args.appRoot)) blockers.push("app_root_missing")

  const android = checkAndroid(args.appRoot)
  const ios = checkIos(args.appRoot)
  blockers.push(...android.blockers, ...ios.blockers)
  const uniqueBlockers = [...new Set(blockers)]
  const report = {
    ok: uniqueBlockers.length === 0,
    allowBlocking: args.allowBlocking,
    containsValues: false,
    appRoot: args.appRoot,
    expected: {
      appName: EXPECTED_APP_NAME,
      androidPackageName: EXPECTED_ANDROID_PACKAGE_NAME,
      iosBundleId: EXPECTED_IOS_BUNDLE_ID,
    },
    android,
    ios,
    blockers: uniqueBlockers,
    nextActions: [
      "Android release 应使用 signingConfigs.release；正式打包前在 ~/.gradle/gradle.properties 或环境变量中提供 release keystore 路径、别名和密码，并把微信开放平台 Android 应用签名按 release 证书填写。",
      "iOS 需要配置 Associated Domains / Universal Link，并确保微信开放平台的 iOS Universal Link 与 AASA 文件一致。",
      "确认微信开放平台移动应用审核通过后，再把 AppID/AppSecret 导入阿里云运行环境或 KMS/Secrets Manager。",
    ],
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok && !args.allowBlocking) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-native-release-config.mjs [--app-root path] [--allow-blocking]",
    "",
    "Checks non-secret React Native native release identifiers needed by WeChat Open Platform and China APP release.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
