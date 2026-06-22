#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"

const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"
const EXPECTED_ASSOCIATED_DOMAIN = "applinks:api-cn.ipgongchang.xin"
const EXPECTED_UNIVERSAL_LINK = "https://api-cn.ipgongchang.xin/app/wechat/"
const EXPECTED_AASA_URL = "https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association"
const APPLE_TEAM_ID_KEYS = ["APPLE_TEAM_ID", "IOS_TEAM_ID", "APP_IOS_TEAM_ID"]

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
    envFile: "",
    outPath: "",
    markdownPath: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
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
    cwd: process.cwd(),
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

function buildPackage(args) {
  const aasaArgs = ["scripts/check-apple-app-site-association.mjs", "--allow-blocking"]
  if (args.envFile) aasaArgs.push("--env-file", args.envFile)
  const aasa = runJson("aasa_check", aasaArgs)
  const nativeRelease = runJson("app_native_release", [
    "scripts/check-app-native-release-config.mjs",
    "--allow-blocking",
  ])
  const teamIdMissing = aasa.teamIdStatus !== "ready"
  const routeFilesReady = (aasa.routeFiles || []).every((item) => item.exists === true)
  const iosNativeReady = nativeRelease.ios?.ready === true
  const blockers = [
    ...(aasa.blockers || []),
    ...(iosNativeReady ? [] : ["ios_native_release_config_not_ready"]),
  ]
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    currentAnswer: teamIdMissing
      ? "Apple Team ID 还未确认；AASA 路由和 iOS Associated Domains 已有本地证据，但 iOS Universal Link 仍不能验收。"
      : "Apple Team ID 已具备；本报告只输出 AASA/Universal Link 验收材料，不输出账号凭据。",
    summary: {
      teamIdStatus: aasa.teamIdStatus,
      aasaOk: aasa.ok === true,
      routeFilesReady,
      iosNativeReady,
      expectedIosBundleId: EXPECTED_IOS_BUNDLE_ID,
      associatedDomain: EXPECTED_ASSOCIATED_DOMAIN,
      universalLink: EXPECTED_UNIVERSAL_LINK,
      aasaUrl: EXPECTED_AASA_URL,
      blockers,
    },
    actionPacket: {
      packetId: "P02_APPLE_TEAM_ID",
      title: "确认 Apple Team ID 并完成 AASA/Universal Link 验收",
      canStartNow: true,
      readyForAasa: !teamIdMissing && routeFilesReady && iosNativeReady,
      consolePath: "Apple Developer -> Membership 或 Certificates, Identifiers & Profiles -> Identifiers",
      minimumAuthorizationPhrase: "授权读取当前 Apple Developer 团队的 10 位 Team ID，并把 APPLE_TEAM_ID 导入阿里云 SAE plain env；该值不是密钥，但不能猜测。",
      targetFields: [
        field("APPLE_TEAM_ID", teamIdMissing ? "missing" : "ready_non_secret_identifier", "Apple Developer current team"),
        field("iosBundleId", EXPECTED_IOS_BUNDLE_ID, "iOS release config"),
        field("associatedDomain", EXPECTED_ASSOCIATED_DOMAIN, "iOS entitlements"),
        field("universalLink", EXPECTED_UNIVERSAL_LINK, "WeChat Open Platform mobile app config"),
        field("aasaUrl", EXPECTED_AASA_URL, "production-cn backend route"),
        field("envKeyFallbacks", APPLE_TEAM_ID_KEYS.join(", "), "AASA checker accepted keys"),
      ],
      acceptanceEvidence: [
        "APPLE_TEAM_ID 为 Apple Developer 当前团队的 10 位 Team ID",
        "corepack pnpm aliyun:aasa:check 不再报告 apple_team_id_missing",
        "AASA appID 形如 TEAMID.com.ipgongchang.meiyehuajing",
        "部署 api-cn 后 GET /.well-known/apple-app-site-association 返回 200 application/json",
        "iOS Associated Domains 保持 applinks:api-cn.ipgongchang.xin",
      ],
      writeTargets: [
        "APPLE_TEAM_ID -> 阿里云 SAE plain env",
        "/Users/Admin/Documents/美业话镜APP/.env.production-cn.local -> local non-secret env only when explicitly updating local readiness",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:apple-team:package",
        "corepack pnpm aliyun:aasa:check",
        "corepack pnpm aliyun:app-native:check",
        "corepack pnpm aliyun:readiness",
      ],
      currentBlockers: blockers,
      forbidden: [
        "不能猜测 Apple Team ID；必须从 Apple Developer 当前团队读取。",
        "不能用个人 Apple ID、Bundle ID、App Store Connect App ID 或 Team Name 替代 Team ID。",
        "不要把 Apple 账号密码、2FA、session cookie、证书私钥或 provisioning profile 写入文档、JSON、镜像或 git。",
      ],
      mutationPerformedByThisCommand: false,
      nonSecretEvidenceOnly: true,
    },
    verifyCommands: [
      "corepack pnpm aliyun:apple-team:package",
      "corepack pnpm aliyun:aasa:check",
      "corepack pnpm aliyun:aasa:strict",
      "corepack pnpm aliyun:app-native:check",
    ],
    safetyBoundary: [
      "本报告不登录 Apple Developer、不读取 Apple 账号凭据、不生成证书、不修改 App ID。",
      "APPLE_TEAM_ID 不是密钥，但仍必须来自 Apple Developer 当前团队，不能猜测。",
      "本报告不导入阿里云环境变量、不部署、不修改 DNS/HTTPS。",
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
  const packet = report.actionPacket
  return [
    "# Apple Team ID / AASA 动作确认包",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 结论",
    "",
    `- ${report.currentAnswer}`,
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- teamIdStatus: ${report.summary.teamIdStatus}`,
    `- aasaOk: ${report.summary.aasaOk}`,
    `- routeFilesReady: ${report.summary.routeFilesReady}`,
    `- iosNativeReady: ${report.summary.iosNativeReady}`,
    `- blockers: ${report.summary.blockers.length ? report.summary.blockers.join(", ") : "none"}`,
    "",
    "## 动作确认包",
    "",
    `- packetId: ${packet.packetId}`,
    `- title: ${packet.title}`,
    `- canStartNow: ${packet.canStartNow}`,
    `- readyForAasa: ${packet.readyForAasa}`,
    `- consolePath: ${packet.consolePath}`,
    `- minimumAuthorizationPhrase: ${packet.minimumAuthorizationPhrase}`,
    "- targetFields:",
    ...packet.targetFields.map((item) => `  - ${item.name}: ${item.value} (${item.source})`),
    "- acceptanceEvidence:",
    ...packet.acceptanceEvidence.map((item) => `  - ${item}`),
    "- writeTargets:",
    ...packet.writeTargets.map((item) => `  - ${item}`),
    "- verifyCommands:",
    ...packet.verifyCommands.map((item) => `  - ${item}`),
    "- forbidden:",
    ...packet.forbidden.map((item) => `  - ${item}`),
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
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-apple-team-aasa-package.mjs [--env-file path] [--out /tmp/apple-team.json] [--markdown /tmp/apple-team.md]",
    "",
    "Builds a non-secret Apple Team ID / AASA action package from current APP native config and AASA checker evidence.",
    "It does not log into Apple Developer, read Apple credentials, import env vars, deploy, or mutate cloud resources.",
  ].join("\n"))
}

main()
