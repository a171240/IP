#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")

const EXPECTED_HOSTS = new Set(["api-cn.ipgongchang.xin", "app-cn.ipgongchang.xin"])
const LEGAL_PAGES = [
  {
    key: "privacy",
    envKey: "PRIVACY_POLICY_URL",
    routePath: "/privacy",
    file: "app/privacy/page.tsx",
    title: "隐私政策",
    requiredText: [
      "美业话镜",
      "隐私政策",
      "production-cn",
      "吴江区美之约网络科技工作室",
      "最近更新：2026-06-22",
      "发布文本基础",
      "正式上线前需由运营者复核确认",
    ],
  },
  {
    key: "terms",
    envKey: "TERMS_URL",
    routePath: "/terms",
    file: "app/terms/page.tsx",
    title: "用户协议",
    requiredText: [
      "美业话镜",
      "用户协议",
      "production-cn",
      "吴江区美之约网络科技工作室",
      "最近更新：2026-06-22",
      "发布文本基础",
      "正式上线前需由运营者复核确认",
    ],
  },
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    allowMissingEnv: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") {
      args.envFile = resolve(process.cwd(), argv[++index])
      continue
    }
    if (arg === "--allow-missing-env") {
      args.allowMissingEnv = true
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

function isReadyText(value) {
  const text = String(value || "").trim()
  return Boolean(text && !text.startsWith("TODO_"))
}

function checkUrl(value, expectedRoutePath) {
  if (!isReadyText(value)) return { ready: false, status: "missing", url: "" }
  let url
  try {
    url = new URL(value)
  } catch {
    return { ready: false, status: "invalid_url", url: value }
  }
  if (url.protocol !== "https:") return { ready: false, status: "not_https", url: value }
  if (!EXPECTED_HOSTS.has(url.hostname)) return { ready: false, status: "unexpected_host", url: value }
  if (url.pathname !== expectedRoutePath) return { ready: false, status: "unexpected_path", url: value }
  return { ready: true, status: "ready", url: value }
}

function checkPage(page, env) {
  const filePath = resolve(BACKEND_ROOT, page.file)
  const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : ""
  const missingText = page.requiredText.filter((item) => !source.includes(item))
  const envUrl = checkUrl(env.get(page.envKey), page.routePath)
  return {
    key: page.key,
    title: page.title,
    routePath: page.routePath,
    file: page.file,
    exists: Boolean(source),
    missingText,
    envKey: page.envKey,
    envUrl,
    recommendedUrls: [
      `https://api-cn.ipgongchang.xin${page.routePath}`,
      `https://app-cn.ipgongchang.xin${page.routePath}`,
    ],
  }
}

function main() {
  const args = parseArgs(process.argv)
  const env = parseEnvFile(args.envFile)
  const pages = LEGAL_PAGES.map((page) => checkPage(page, env))
  const blockers = []

  for (const page of pages) {
    if (!page.exists) blockers.push(`missing_legal_page:${page.file}`)
    for (const text of page.missingText) blockers.push(`missing_legal_text:${page.key}:${text}`)
    if (!args.allowMissingEnv && !page.envUrl.ready) {
      blockers.push(`invalid_legal_env:${page.envKey}:${page.envUrl.status}`)
    }
    if (args.allowMissingEnv && page.envUrl.status !== "missing" && !page.envUrl.ready) {
      blockers.push(`invalid_legal_env:${page.envKey}:${page.envUrl.status}`)
    }
  }

  const report = {
    ok: blockers.length === 0,
    allowMissingEnv: args.allowMissingEnv,
    containsValues: false,
    envFile: args.envFile,
    expectedHosts: [...EXPECTED_HOSTS],
    pages,
    blockers,
    nextActions: [
      "正式上线前由运营者确认隐私政策和用户协议文本。",
      "PRIVACY_POLICY_URL 建议使用 https://api-cn.ipgongchang.xin/privacy 或 https://app-cn.ipgongchang.xin/privacy。",
      "TERMS_URL 建议使用 https://api-cn.ipgongchang.xin/terms 或 https://app-cn.ipgongchang.xin/terms。",
      "部署后分别 GET 两个 URL，状态应为 200 且页面内容为美业话镜 APP 协议文本。",
    ],
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-legal-pages.mjs [--env-file path] [--allow-missing-env]",
    "",
    "Checks the APP production-cn privacy policy and terms page route files plus optional env URL shape.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
