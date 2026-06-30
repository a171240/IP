#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")
const DEFAULT_TIMEOUT_MS = 15_000
const HEALTH_PATHS = ["/api/healthz", "/api/app/health", "/api/app/health?strict=1"]
const KNOWN_CHECK_GROUPS = new Set([
  "aliyunRds",
  "aliyunOssRuntime",
  "supabase",
  "appWechatLogin",
  "legalLinks",
  "aliyunOss",
  "bailianAsr",
  "serviceRecordSummary",
  "volcSpeech",
])

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    baseUrl: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowMissing: new Set(),
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--base-url") {
      args.baseUrl = normalizeBaseUrl(resolveRawValue(argv[++index], "--base-url"))
      continue
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(resolveRawValue(argv[++index], "--timeout-ms"))
      if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1_000) {
        throw new Error("invalid_timeout_ms")
      }
      continue
    }
    if (arg === "--allow-missing") {
      for (const group of parseGroups(resolveRawValue(argv[++index], "--allow-missing"))) {
        args.allowMissing.add(group)
      }
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
  const raw = resolveRawValue(value, name)
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
}

function resolveRawValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return value
}

function parseGroups(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function readEnvValue(filePath, key) {
  if (!existsSync(filePath)) return ""
  const raw = readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || match[1] !== key) continue
    return unquote(match[2])
  }
  return ""
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
  return Boolean(text && text !== "\"\"" && text !== "''" && !text.startsWith("TODO_"))
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(text)) throw new Error("invalid_base_url")
  return text
}

function resolveBaseUrl(args) {
  if (args.baseUrl) return args.baseUrl
  const envBaseUrl = readEnvValue(args.envFile, "APP_API_BASE_URL")
  if (!isReadyText(envBaseUrl)) {
    throw new Error("app_api_base_url_not_ready:pass_--base-url_or_fill_APP_API_BASE_URL")
  }
  return normalizeBaseUrl(envBaseUrl)
}

async function readJson(baseUrl, path, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`invalid_json:${path}:${response.status}`)
    }
    return {
      path,
      status: response.status,
      text,
      body,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function assertNoSensitiveFieldNames(result) {
  const text = result.text
  if (/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|DASHSCOPE_API_KEY|DEEPSEEK_API_KEY)/i.test(text)) {
    throw new Error(`health_response_contains_sensitive_field_name:${result.path}`)
  }
}

function assertHealthShape(result) {
  const body = result.body
  if (!body || typeof body !== "object") throw new Error(`invalid_body:${result.path}`)
  if (typeof body.ok !== "boolean") throw new Error(`ok_not_boolean:${result.path}`)
  if (!Array.isArray(body.missing)) throw new Error(`missing_not_array:${result.path}`)
  if (!body.checks || typeof body.checks !== "object") throw new Error(`checks_not_object:${result.path}`)
  for (const group of Object.keys(body.checks)) {
    if (!KNOWN_CHECK_GROUPS.has(group)) throw new Error(`unknown_check_group:${group}`)
  }
  for (const group of body.missing) {
    if (!KNOWN_CHECK_GROUPS.has(group)) throw new Error(`unknown_missing_group:${group}`)
  }
}

function assertResult(result, allowMissing) {
  assertHealthShape(result)
  assertNoSensitiveFieldNames(result)
  const missing = new Set(result.body.missing)
  const unexpectedMissing = [...missing].filter((group) => !allowMissing.has(group))
  if (unexpectedMissing.length) {
    throw new Error(`unexpected_missing:${result.path}:${unexpectedMissing.join(",")}`)
  }
  const expectedReady = missing.size === 0
  if (result.path.includes("strict=1")) {
    const expectedStatus = expectedReady ? 200 : 503
    if (result.status !== expectedStatus) {
      throw new Error(`unexpected_strict_status:${result.status}`)
    }
  } else if (result.status !== 200) {
    throw new Error(`unexpected_status:${result.path}:${result.status}`)
  }
}

function summarize(result) {
  return {
    status: result.status,
    ok: result.body.ok,
    missing: result.body.missing,
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/smoke-aliyun-remote.mjs [--base-url https://api-cn.example.com] [--allow-missing appWechatLogin,legalLinks]",
    "",
    "Validates deployed health endpoints without reading or printing secrets.",
    "If --base-url is omitted, APP_API_BASE_URL is read from .env.production-cn.local.",
    "Default mode expects strict health to be ready; --allow-missing supports staged bridge checks.",
  ].join("\n"))
}

async function main() {
  const args = parseArgs(process.argv)
  const baseUrl = resolveBaseUrl(args)
  for (const group of args.allowMissing) {
    if (!KNOWN_CHECK_GROUPS.has(group)) throw new Error(`unknown_allowed_missing_group:${group}`)
  }
  const results = []
  for (const path of HEALTH_PATHS) {
    const result = await readJson(baseUrl, path, args.timeoutMs)
    assertResult(result, args.allowMissing)
    results.push(result)
  }
  console.log(JSON.stringify({
    baseUrl,
    allowedMissing: [...args.allowMissing],
    healthz: summarize(results[0]),
    health: summarize(results[1]),
    strictHealth: summarize(results[2]),
  }, null, 2))
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
