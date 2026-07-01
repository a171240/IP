#!/usr/bin/env node

import { pathToFileURL } from "node:url"

const READ_ONLY_SWITCH_ENV = "APP_READ_ONLY_LIVE_SMOKE"
const DEFAULT_TIMEOUT_MS = 15_000

const REQUIRED_VARIABLES = [
  {
    name: "APP_BASE_URL",
    kind: "https_url",
    description: "production-cn APP API base URL used by read-only live smoke commands",
  },
  {
    name: "APP_DEVICE_ID",
    kind: "device_id",
    description: "x-device-id value allowlisted for the smoke operator/device",
  },
  {
    name: "APP_EMPLOYEE_TOKEN",
    kind: "secret_token",
    description: "employee or unbound test token for profile, entitlements, and service-record reads",
  },
  {
    name: "APP_MANAGER_TOKEN",
    kind: "secret_token",
    description: "store manager or company manager test token for store-admin reads",
  },
]

const READ_ONLY_PROBES = [
  {
    id: "employee_profile",
    scope: "account",
    role: "employee",
    method: "GET",
    path: "/api/app/profile",
    description: "employee profile, tenant, and role payload",
  },
  {
    id: "employee_entitlements",
    scope: "account",
    role: "employee",
    method: "GET",
    path: "/api/app/entitlements",
    description: "employee feature entitlement payload",
  },
  {
    id: "employee_service_record_sessions",
    scope: "service-records",
    role: "employee",
    method: "GET",
    path: "/api/app/service-records/sessions?limit=5",
    description: "employee service-record session list",
  },
  {
    id: "manager_store_admin_overview",
    scope: "store-admin",
    role: "manager",
    method: "GET",
    path: "/api/app/store-admin/overview",
    description: "manager store overview",
  },
  {
    id: "manager_store_admin_members",
    scope: "store-admin",
    role: "manager",
    method: "GET",
    path: "/api/app/store-admin/members?limit=5",
    description: "manager member list",
  },
  {
    id: "manager_store_admin_service_records",
    scope: "store-admin",
    role: "manager",
    method: "GET",
    path: "/api/app/store-admin/service-records?limit=5",
    description: "manager store service-record list",
  },
  {
    id: "manager_store_profiles",
    scope: "context",
    role: "manager",
    method: "GET",
    path: "/api/app/store-profiles?limit=5",
    description: "tenant-scoped store profile list",
  },
]

const SKIPPED_MUTATING_ENDPOINTS = [
  { method: "POST", path: "/api/app/auth/wechat", reason: "login/auth exchange is not part of read-only smoke" },
  { method: "POST", path: "/api/app/auth/logout", reason: "state-changing auth operation" },
  { method: "POST", path: "/api/app/wechat/login", reason: "login/auth exchange is not part of read-only smoke" },
  { method: "POST", path: "/api/app/store-admin/invites", reason: "creates invite records" },
  { method: "POST", path: "/api/app/store-admin/invites/:token/accept", reason: "accepts invite and may create membership" },
  { method: "POST", path: "/api/app/service-records/sessions", reason: "creates service-record sessions" },
  { method: "POST", path: "/api/app/service-records/device-files/check", reason: "device-file check is POST and outside read-only live smoke" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/segments", reason: "registers service-record segments" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/oss-upload", reason: "creates upload policy" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/segments/oss", reason: "registers OSS segment metadata" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/markers", reason: "writes service markers" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/resume", reason: "changes service-record state" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/end", reason: "ends service-record session" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/process", reason: "starts processing" },
  { method: "POST", path: "/api/app/service-records/sessions/:sessionId/asr/poll", reason: "polling endpoint can change processing state" },
  { method: "POST", path: "/api/app/assets/sign-read", reason: "signed URL minting is excluded from strict read-only live smoke" },
  { method: "POST", path: "/api/app/content-drafts", reason: "creates draft rows" },
  { method: "POST", path: "/api/app/learning/progress/events", reason: "writes learning progress events" },
  { method: "POST", path: "/api/app/learning/progress/sync", reason: "writes learning progress sync state" },
  { method: "POST", path: "/api/app/posters/generate", reason: "generation endpoint skipped" },
  { method: "POST", path: "/api/app/xhs/generate-v4", reason: "generation endpoint skipped" },
  { method: "POST", path: "/api/app/xhs/content/danger-check", reason: "AI/content workflow POST skipped" },
  { method: "POST", path: "/api/app/xhs/generate-cover-image", reason: "generation endpoint skipped" },
  { method: "POST", path: "/api/app/private-copy/generate", reason: "generation endpoint skipped" },
  { method: "POST", path: "/api/app/pay/*", reason: "payment endpoints skipped" },
  { method: "POST", path: "/api/app/*/publish", reason: "publish endpoints skipped" },
  { method: "POST", path: "/api/app/*/submit", reason: "submit endpoints skipped" },
]

const PLACEHOLDER_RE = /^(?:|<[^>]*>|todo|tbd|xxx+|replace(?:_me)?|changeme|null|undefined|token|test-token|example(?:\..*)?)$/i
const PLACEHOLDER_TEXT_RE = /(?:<[^>]+>|todo|replace(?:_me)?|changeme|your[_-]?|example\.com)/i
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

function parseArgs(argv) {
  const args = {
    allowLocal: false,
    executeReadOnly: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--allow-local") {
      args.allowLocal = true
      continue
    }
    if (arg === "--execute-read-only") {
      args.executeReadOnly = true
      continue
    }
    if (arg === "--timeout-ms") {
      const value = Number(resolveRawValue(argv[++index], "--timeout-ms"))
      if (!Number.isFinite(value) || value < 1_000) throw new Error("invalid_timeout_ms")
      args.timeoutMs = value
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

function resolveRawValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return value
}

function validateValue(item, rawValue, args) {
  const value = String(rawValue || "").trim()
  if (!value) return { status: "missing", reason: "not_set" }
  if (PLACEHOLDER_RE.test(value) || PLACEHOLDER_TEXT_RE.test(value)) {
    return { status: "placeholder", reason: "looks_like_placeholder" }
  }

  if (item.kind === "https_url") return validateBaseUrl(value, args)
  if (item.kind === "device_id") return validateDeviceId(value)
  if (item.kind === "secret_token") return validateToken(value)
  return { status: "ready" }
}

function validateBaseUrl(value, args) {
  let url
  try {
    url = new URL(value)
  } catch {
    return { status: "invalid", reason: "invalid_url" }
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    return { status: "invalid", reason: "unsupported_protocol" }
  }
  if (!args.allowLocal && url.protocol !== "https:") {
    return { status: "invalid", reason: "https_required_for_live_smoke" }
  }
  if (!args.allowLocal && isLocalOrExampleHost(url.hostname)) {
    return { status: "invalid", reason: "live_smoke_requires_non_local_host" }
  }

  url.hash = ""
  url.search = ""
  const pathname = url.pathname.replace(/\/+$/, "")
  const baseUrl = `${url.origin}${pathname === "" || pathname === "/" ? "" : pathname}`
  return { status: "ready", origin: url.origin, baseUrl }
}

function isLocalOrExampleHost(hostname) {
  const host = String(hostname || "").toLowerCase()
  return LOCAL_HOSTS.has(host) || host === "example.com" || host.endsWith(".example.com")
}

function validateDeviceId(value) {
  if (value.length < 8) return { status: "invalid", reason: "device_id_too_short" }
  if (/\s/.test(value)) return { status: "invalid", reason: "device_id_contains_space" }
  return { status: "ready" }
}

function validateToken(value) {
  if (value.length < 16) return { status: "invalid", reason: "token_too_short" }
  if (/\s/.test(value)) return { status: "invalid", reason: "token_contains_space" }
  return { status: "ready" }
}

function isReadOnlySwitchEnabled(env, args) {
  return args.executeReadOnly || String(env[READ_ONLY_SWITCH_ENV] || "").trim().toLowerCase() === "true"
}

function buildReport(env, args) {
  let baseUrl = null
  const required = REQUIRED_VARIABLES.map((item) => {
    const validation = validateValue(item, env[item.name], args)
    if (item.name === "APP_BASE_URL" && validation.status === "ready") baseUrl = validation.baseUrl
    return {
      name: item.name,
      required: true,
      description: item.description,
      status: validation.status,
      reason: validation.reason || null,
      value: item.kind === "secret_token" ? "redacted" : validation.origin || (validation.status === "ready" ? "present" : "redacted"),
    }
  })

  const envBlockers = required
    .filter((item) => item.status !== "ready")
    .map((item) => `${item.name}:${item.status}${item.reason ? `:${item.reason}` : ""}`)
  const liveSmokeEnvReady = envBlockers.length === 0
  const readOnlySwitchEnabled = isReadOnlySwitchEnabled(env, args)
  const executionBlockers = [
    ...envBlockers,
    ...(readOnlySwitchEnabled ? [] : [`${READ_ONLY_SWITCH_ENV}:missing_or_false`]),
  ]
  const canExecuteReadOnly = liveSmokeEnvReady && readOnlySwitchEnabled

  return {
    ok: false,
    mode: canExecuteReadOnly ? "read_only_execute_pending" : "plan_only",
    networkRequestsAttempted: false,
    liveSmokeEnvReady,
    readOnlySwitchEnabled,
    readOnlyExecutionReady: canExecuteReadOnly,
    required,
    blockers: envBlockers,
    executionBlockers,
    policy: {
      noSecretValuesPrinted: true,
      envFileRead: false,
      onlyGetRequests: true,
      baseUrlMustUseHttps: !args.allowLocal,
      localHostsRejectedByDefault: !args.allowLocal,
      readOnlySmokeRequires: `${READ_ONLY_SWITCH_ENV}=true or --execute-read-only`,
      mutatingSmokeAuthorizedHere: false,
    },
    readOnlySmoke: {
      baseUrl: baseUrl ? publicBaseUrl(baseUrl) : null,
      ready: canExecuteReadOnly,
      probes: READ_ONLY_PROBES.map(publicProbe),
      command: "APP_READ_ONLY_LIVE_SMOKE=true node scripts/check-app-api-live-smoke-env.mjs",
      alternativeCommand: "node scripts/check-app-api-live-smoke-env.mjs --execute-read-only",
    },
    skippedMutatingEndpoints: SKIPPED_MUTATING_ENDPOINTS,
  }
}

function publicBaseUrl(baseUrl) {
  const url = new URL(baseUrl)
  return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`
}

function publicProbe(probe) {
  return {
    id: probe.id,
    scope: probe.scope,
    role: probe.role,
    method: probe.method,
    path: probe.path,
    description: probe.description,
  }
}

async function runReadOnlySmoke(baseUrl, env, args) {
  const startedAt = new Date().toISOString()
  const probes = []
  for (const probe of READ_ONLY_PROBES) {
    probes.push(await requestProbe(baseUrl, probe, env, args.timeoutMs))
  }
  const ok = probes.every((probe) => probe.ok)
  return {
    ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: publicBaseUrl(baseUrl),
    checkedProbes: probes.length,
    scopes: summarizeScopes(probes),
    probes,
  }
}

async function requestProbe(baseUrl, probe, env, timeoutMs) {
  const started = Date.now()
  const token = tokenForRole(probe.role, env)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL(probe.path, `${baseUrl}/`).toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "x-device-id": String(env.APP_DEVICE_ID || ""),
        "x-app-live-smoke": "read-only",
      },
    })
    const text = await response.text()
    assertResponseDoesNotContainInputSecrets(text, env, probe)
    const bodyInfo = parseJsonBodyInfo(text, probe)
    const ok = response.status >= 200 && response.status < 300

    return {
      ...publicProbe(probe),
      ok,
      status: response.status,
      code: bodyInfo.code,
      json: bodyInfo.json,
      bodyType: bodyInfo.bodyType,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return {
      ...publicProbe(probe),
      ok: false,
      status: null,
      code: "",
      json: false,
      bodyType: null,
      durationMs: Date.now() - started,
      error: redactSensitiveText(error instanceof Error ? error.message : String(error), env),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function tokenForRole(role, env) {
  if (role === "employee") return String(env.APP_EMPLOYEE_TOKEN || "")
  if (role === "manager") return String(env.APP_MANAGER_TOKEN || "")
  throw new Error(`unknown_probe_role:${role}`)
}

function parseJsonBodyInfo(text, probe) {
  if (!text.trim()) {
    return { json: false, bodyType: "empty", code: "" }
  }

  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`invalid_json:${probe.method}:${probe.path}`)
  }

  const code = body && typeof body === "object" && !Array.isArray(body)
    ? String(body.code || body.error || "")
    : ""
  return {
    json: true,
    bodyType: Array.isArray(body) ? "array" : typeof body,
    code,
  }
}

function assertResponseDoesNotContainInputSecrets(text, env, probe) {
  for (const name of ["APP_EMPLOYEE_TOKEN", "APP_MANAGER_TOKEN"]) {
    const secret = String(env[name] || "")
    if (secret.length >= 8 && text.includes(secret)) {
      throw new Error(`probe_response_echoed_input_secret:${probe.method}:${probe.path}:${name}`)
    }
  }
}

function redactSensitiveText(text, env) {
  let redacted = String(text || "")
  for (const name of ["APP_EMPLOYEE_TOKEN", "APP_MANAGER_TOKEN"]) {
    const secret = String(env[name] || "")
    if (secret.length >= 8) redacted = redacted.split(secret).join(`[REDACTED:${name}]`)
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED:jwt]")
}

function summarizeScopes(results) {
  const scopes = new Map()
  for (const result of results) {
    scopes.set(result.scope, (scopes.get(result.scope) || 0) + 1)
  }
  return Object.fromEntries([...scopes.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-api-live-smoke-env.mjs",
    "  APP_READ_ONLY_LIVE_SMOKE=true node scripts/check-app-api-live-smoke-env.mjs",
    "  node scripts/check-app-api-live-smoke-env.mjs --execute-read-only",
    "",
    "Required environment variables:",
    "  APP_BASE_URL",
    "  APP_DEVICE_ID",
    "  APP_EMPLOYEE_TOKEN",
    "  APP_MANAGER_TOKEN",
    "",
    "Safety:",
    "  The default mode prints missing prerequisites and a read-only plan only.",
    "  Network requests run only when the env is complete and APP_READ_ONLY_LIVE_SMOKE=true or --execute-read-only is set.",
    "  The live smoke uses GET probes only and never prints token values or response bodies.",
  ].join("\n"))
}

async function main() {
  try {
    const args = parseArgs(process.argv)
    const report = buildReport(process.env, args)
    if (report.readOnlyExecutionReady) {
      const baseUrl = validateBaseUrl(String(process.env.APP_BASE_URL || ""), args).baseUrl
      const smoke = await runReadOnlySmoke(baseUrl, process.env, args)
      const result = {
        ...report,
        ok: smoke.ok,
        mode: "read_only_executed",
        networkRequestsAttempted: true,
        readOnlySmoke: {
          ...report.readOnlySmoke,
          result: smoke,
        },
      }
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) process.exitCode = 1
      return
    }

    console.log(JSON.stringify(report, null, 2))
    process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      networkRequestsAttempted: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

export {
  READ_ONLY_PROBES,
  REQUIRED_VARIABLES,
  SKIPPED_MUTATING_ENDPOINTS,
  buildReport,
  parseArgs,
  runReadOnlySmoke,
  validateValue,
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
