#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"
const APPLE_TEAM_ID_KEYS = ["APPLE_TEAM_ID", "IOS_TEAM_ID", "APP_IOS_TEAM_ID"]
const REQUIRED_ROUTE_FILES = [
  "app/.well-known/apple-app-site-association/route.ts",
  "app/apple-app-site-association/route.ts",
  "lib/app-universal-link/aasa.ts",
]
const REQUIRED_PATHS = ["/app/wechat/*", "/wechat/*"]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    allowBlocking: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") {
      args.envFile = resolve(process.cwd(), argv[++index])
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

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return new Map()
  const env = new Map()
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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

function envValue(env, key) {
  return String(process.env[key] || env.get(key) || "").trim()
}

function firstReadyValue(env, keys) {
  for (const key of keys) {
    const value = envValue(env, key)
    if (value && !value.startsWith("TODO_")) return value
  }
  return ""
}

function routeFileStatus() {
  return REQUIRED_ROUTE_FILES.map((file) => ({
    file,
    exists: existsSync(resolve(BACKEND_ROOT, file)),
  }))
}

function main() {
  const args = parseArgs(process.argv)
  const env = parseEnvFile(args.envFile)
  const routeFiles = routeFileStatus()
  const source = existsSync(resolve(BACKEND_ROOT, "lib/app-universal-link/aasa.ts"))
    ? readFileSync(resolve(BACKEND_ROOT, "lib/app-universal-link/aasa.ts"), "utf8")
    : ""
  const blockers = []
  const teamId = firstReadyValue(env, APPLE_TEAM_ID_KEYS).toUpperCase()
  const bundleId = envValue(env, "IOS_BUNDLE_ID") || EXPECTED_IOS_BUNDLE_ID

  for (const routeFile of routeFiles) {
    if (!routeFile.exists) blockers.push(`missing_route_file:${routeFile.file}`)
  }
  if (!teamId) {
    blockers.push("apple_team_id_missing")
  } else if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    blockers.push("apple_team_id_invalid_format")
  }
  if (bundleId !== EXPECTED_IOS_BUNDLE_ID) blockers.push(`ios_bundle_id=${EXPECTED_IOS_BUNDLE_ID}`)
  for (const universalLinkPath of REQUIRED_PATHS) {
    if (!source.includes(universalLinkPath)) blockers.push(`missing_universal_link_path:${universalLinkPath}`)
  }

  const report = {
    ok: blockers.length === 0,
    allowBlocking: args.allowBlocking,
    containsValues: false,
    envFile: args.envFile,
    endpointPaths: [
      "/.well-known/apple-app-site-association",
      "/apple-app-site-association",
    ],
    appleTeamIdKeys: APPLE_TEAM_ID_KEYS,
    teamIdStatus: teamId ? "ready" : "missing",
    expectedIosBundleId: EXPECTED_IOS_BUNDLE_ID,
    universalLinkPath: "https://api-cn.ipgongchang.xin/app/wechat/",
    routeFiles,
    blockers,
    nextActions: [
      "从 Apple Developer 账号 Membership 或 Identifiers/App ID 页面确认 10 位 Team ID，导入 APPLE_TEAM_ID。",
      "保持 iOS Associated Domains 为 applinks:api-cn.ipgongchang.xin，并与微信开放平台 Universal Link 域名一致。",
      "微信开放平台 iOS Universal Link 使用 https://api-cn.ipgongchang.xin/app/wechat/，并确保该域名部署后可 GET AASA。",
      "部署后执行 curl -i https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association，状态应为 200 且 Content-Type 为 application/json。",
    ],
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok && !args.allowBlocking) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-apple-app-site-association.mjs [--env-file path] [--allow-blocking]",
    "",
    "Checks the non-secret iOS Universal Link / AASA route wiring for the APP production-cn bridge.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
