#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  observeDeploymentIdentities,
  publicProvenanceErrorCode,
} from "./lib/aliyun-deployment-identity.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")
const DEFAULT_TIMEOUT_MS = 15_000
const HEALTH_PATHS = ["/api/healthz", "/api/app/health", "/api/app/health?strict=1"]
const PRODUCTION_HEALTH_CHECK_GROUPS = Object.freeze([
  "aliyunRds",
  "legalLinks",
  "aliyunOssRuntime",
  "bailianAsr",
  "serviceRecordSummary",
  "volcSpeech",
])
const PRODUCTION_HEALTH_CHECK_GROUP_SET = new Set(PRODUCTION_HEALTH_CHECK_GROUPS)
const PRODUCTION_HEALTH_METADATA = Object.freeze({
  service: "meiye-huajing-app-api",
  env: "production-cn",
  region: "cn-hangzhou",
  mode: "aliyun-production-cn",
})
const KNOWN_HEALTH_FIELDS = new Set([
  "ok",
  "service",
  "env",
  "region",
  "mode",
  "checks",
  "missing",
  "deferred",
  "deploymentIdentity",
])
const KNOWN_DEFERRED_FIELDS = new Set(["supabase", "appWechatLogin"])
const FIXED_REMOTE_ERRORS = new Set([
  "REMOTE_HEALTH_ARGUMENT_INVALID",
  "REMOTE_HEALTH_REQUEST_FAILED",
  "REMOTE_HEALTH_RESPONSE_INVALID",
  "REMOTE_HEALTH_SCHEMA_INVALID",
  "REMOTE_HEALTH_SENSITIVE_FIELD",
  "REMOTE_HEALTH_UNEXPECTED_MISSING",
  "REMOTE_HEALTH_STATUS_INVALID",
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
      throw new Error("REMOTE_HEALTH_RESPONSE_INVALID")
    }
    return {
      path,
      status: response.status,
      text,
      body,
    }
  } catch (error) {
    if (error instanceof Error && FIXED_REMOTE_ERRORS.has(error.message)) throw error
    throw new Error("REMOTE_HEALTH_REQUEST_FAILED")
  } finally {
    clearTimeout(timeout)
  }
}

function assertNoSensitiveFieldNames(result) {
  const text = result.text
  if (/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|DASHSCOPE_API_KEY|DEEPSEEK_API_KEY)/i.test(text)) {
    throw new Error("REMOTE_HEALTH_SENSITIVE_FIELD")
  }
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function assertHealthShape(result) {
  const body = result.body
  if (!isPlainObject(body)) throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  if (Object.keys(body).some((field) => !KNOWN_HEALTH_FIELDS.has(field))) {
    throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  }
  if (typeof body.ok !== "boolean") throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  if (!Array.isArray(body.missing)) throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  if (!isPlainObject(body.checks)) throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  for (const [field, expected] of Object.entries(PRODUCTION_HEALTH_METADATA)) {
    if (body[field] !== expected) throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  }
  if (body.deferred !== undefined) {
    if (
      !isPlainObject(body.deferred) ||
      Object.keys(body.deferred).some((field) => !KNOWN_DEFERRED_FIELDS.has(field)) ||
      Object.values(body.deferred).some((value) => typeof value !== "string")
    ) {
      throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
    }
  }
  const checkGroups = Object.keys(body.checks)
  if (
    checkGroups.length !== PRODUCTION_HEALTH_CHECK_GROUPS.length ||
    PRODUCTION_HEALTH_CHECK_GROUPS.some((group) => typeof body.checks[group] !== "boolean")
  ) {
    throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  }
  const expectedMissing = PRODUCTION_HEALTH_CHECK_GROUPS.filter((group) => body.checks[group] === false)
  if (
    body.missing.length !== expectedMissing.length ||
    body.missing.some((group, index) => group !== expectedMissing[index]) ||
    body.ok !== (expectedMissing.length === 0)
  ) {
    throw new Error("REMOTE_HEALTH_SCHEMA_INVALID")
  }
}

function assertResult(result, allowMissing) {
  assertHealthShape(result)
  assertNoSensitiveFieldNames(result)
  const missing = new Set(result.body.missing)
  const unexpectedMissing = [...missing].filter((group) => !allowMissing.has(group))
  if (unexpectedMissing.length) {
    throw new Error("REMOTE_HEALTH_UNEXPECTED_MISSING")
  }
  const expectedReady = missing.size === 0
  if (result.path.includes("strict=1")) {
    const expectedStatus = expectedReady ? 200 : 503
    if (result.status !== expectedStatus) {
      throw new Error("REMOTE_HEALTH_STATUS_INVALID")
    }
  } else if (result.status !== 200) {
    throw new Error("REMOTE_HEALTH_STATUS_INVALID")
  }
}

function summarize(result, observedDeploymentIdentity) {
  return {
    status: result.status,
    service: result.body.service,
    env: result.body.env,
    region: result.body.region,
    mode: result.body.mode,
    checks: Object.fromEntries(
      PRODUCTION_HEALTH_CHECK_GROUPS.map((group) => [group, result.body.checks[group]]),
    ),
    ok: result.body.ok,
    missing: [...result.body.missing],
    observedDeploymentIdentity,
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/smoke-aliyun-remote.mjs [--base-url https://api-cn.example.com] [--allow-missing legalLinks,bailianAsr]",
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
    if (!PRODUCTION_HEALTH_CHECK_GROUP_SET.has(group)) throw new Error(`unknown_allowed_missing_group:${group}`)
  }
  const results = []
  for (const path of HEALTH_PATHS) {
    const result = await readJson(baseUrl, path, args.timeoutMs)
    assertResult(result, args.allowMissing)
    results.push(result)
  }
  const observed = observeDeploymentIdentities(
    results.map((result) => result.body.deploymentIdentity ?? null),
    { now: Date.now() },
  )
  const provenanceErrorCode = publicProvenanceErrorCode(observed.errorCode)
  const observedDeploymentIdentity = observed.ready ? observed.identity : null
  console.log(JSON.stringify({
    baseUrl,
    allowedMissing: [...args.allowMissing],
    provenanceErrorCode,
    healthz: summarize(results[0], observedDeploymentIdentity),
    health: summarize(results[1], observedDeploymentIdentity),
    strictHealth: summarize(results[2], observedDeploymentIdentity),
  }, null, 2))
}

try {
  await main()
} catch (error) {
  const errorCode = error instanceof Error && FIXED_REMOTE_ERRORS.has(error.message)
    ? error.message
    : "REMOTE_HEALTH_FAILED"
  console.error(errorCode)
  process.exit(1)
}
