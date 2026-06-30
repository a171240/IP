#!/usr/bin/env node

import { pathToFileURL } from "node:url"

const REQUIRED_VARIABLES = [
  {
    name: "APP_BASE_URL",
    kind: "https_url",
    description: "production-cn APP API base URL used by live smoke commands",
  },
  {
    name: "APP_DEVICE_ID",
    kind: "device_id",
    description: "x-device-id value allowlisted for the smoke operator/device",
  },
  {
    name: "APP_EMPLOYEE_TOKEN",
    kind: "secret_token",
    description: "employee or unbound test token for profile and service-record reads",
  },
  {
    name: "APP_MANAGER_TOKEN",
    kind: "secret_token",
    description: "store manager or company manager test token for store-admin reads",
  },
]

const PLACEHOLDER_RE = /^(?:|<[^>]*>|todo|tbd|xxx+|replace(?:_me)?|changeme|null|undefined|token|test-token|example(?:\..*)?)$/i
const PLACEHOLDER_TEXT_RE = /(?:<[^>]+>|todo|replace(?:_me)?|changeme|your[_-]?|example\.com|localhost|127\.0\.0\.1)/i
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

function parseArgs(argv) {
  const args = {
    allowLocal: false,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--allow-local") {
      args.allowLocal = true
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

  return { status: "ready", origin: url.origin.replace(/\/+$/, "") }
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

function buildReport(env, args) {
  const required = REQUIRED_VARIABLES.map((item) => {
    const validation = validateValue(item, env[item.name], args)
    return {
      name: item.name,
      required: true,
      description: item.description,
      status: validation.status,
      reason: validation.reason || null,
      value: item.kind === "secret_token" ? "redacted" : validation.origin || (validation.status === "ready" ? "present" : "redacted"),
    }
  })

  const blockers = required
    .filter((item) => item.status !== "ready")
    .map((item) => `${item.name}:${item.status}${item.reason ? `:${item.reason}` : ""}`)

  const writeSmokeAuthorized = String(env.APP_WRITE_SMOKE_AUTHORIZED || "").trim() === "true"
  const liveSmokeEnvReady = blockers.length === 0

  return {
    ok: liveSmokeEnvReady,
    liveSmokeEnvReady,
    required,
    blockers,
    policy: {
      noSecretValuesPrinted: true,
      baseUrlMustUseHttps: !args.allowLocal,
      localHostsRejectedByDefault: !args.allowLocal,
      writeSmokeRequires: "APP_WRITE_SMOKE_AUTHORIZED=true",
    },
    readOnlySmoke: {
      ready: liveSmokeEnvReady,
      commands: liveSmokeEnvReady ? [
        "node scripts/smoke-app-api-production-cn.mjs --base-url \"$APP_BASE_URL\" --timeout-ms 15000",
        "curl -sS -i \"$APP_BASE_URL/api/app/profile\" -H \"authorization: Bearer $APP_EMPLOYEE_TOKEN\" -H \"x-device-id: $APP_DEVICE_ID\"",
        "curl -sS -i \"$APP_BASE_URL/api/app/entitlements\" -H \"authorization: Bearer $APP_EMPLOYEE_TOKEN\" -H \"x-device-id: $APP_DEVICE_ID\"",
        "curl -sS -i \"$APP_BASE_URL/api/app/service-records/sessions?limit=5\" -H \"authorization: Bearer $APP_EMPLOYEE_TOKEN\" -H \"x-device-id: $APP_DEVICE_ID\"",
        "curl -sS -i \"$APP_BASE_URL/api/app/store-admin/service-records?limit=5\" -H \"authorization: Bearer $APP_MANAGER_TOKEN\" -H \"x-device-id: $APP_DEVICE_ID\"",
      ] : [],
    },
    writeSmoke: {
      authorized: writeSmokeAuthorized,
      status: writeSmokeAuthorized ? "authorized_by_env" : "blocked_until_explicit_env_authorization",
      env: "APP_WRITE_SMOKE_AUTHORIZED=true",
      operations: [
        "POST /api/app/store-admin/invites",
        "POST /api/app/store-admin/invites/:token/accept",
        "POST /api/app/service-records/sessions",
        "POST /api/app/service-records/sessions/:sessionId/oss-upload",
        "POST /api/app/service-records/sessions/:sessionId/segments",
        "POST /api/app/service-records/sessions/:sessionId/segments/oss",
        "POST /api/app/service-records/sessions/:sessionId/end",
        "POST /api/app/service-records/sessions/:sessionId/process",
        "POST /api/app/service-records/sessions/:sessionId/asr/poll",
      ],
    },
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-api-live-smoke-env.mjs",
    "",
    "Required environment variables:",
    "  APP_BASE_URL",
    "  APP_DEVICE_ID",
    "  APP_EMPLOYEE_TOKEN",
    "  APP_MANAGER_TOKEN",
    "",
    "Optional:",
    "  APP_WRITE_SMOKE_AUTHORIZED=true",
    "",
    "The command validates presence and placeholder shape only. It never prints token values.",
  ].join("\n"))
}

async function main() {
  try {
    const args = parseArgs(process.argv)
    const report = buildReport(process.env, args)
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

export {
  REQUIRED_VARIABLES,
  buildReport,
  validateValue,
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
