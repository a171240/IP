#!/usr/bin/env node

import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import net from "node:net"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")
const DEFAULT_TIMEOUT_MS = 20_000
const LOCAL_RDS_UNAVAILABLE_EXPECTED = Object.freeze([
  { status: 503, code: "rds_not_configured" },
  { status: 503, code: "rds_unavailable" },
])
const ALLOWED_HTTP_METHODS = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"])
const PUBLIC_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]*$/

export const MUTATION_EXCLUDED_ROUTES = [
  {
    scope: "account",
    method: "POST",
    path: "/api/app/account/bootstrap",
    reason: "authenticated_profile_mutation",
  },
]

export const PROBES = [
  {
    scope: "auth",
    method: "POST",
    path: "/api/app/auth/wechat",
    body: {},
    expected: [{ status: 400, code: "missing_code" }],
  },
  {
    scope: "auth",
    method: "POST",
    path: "/api/app/auth/logout",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "auth",
    method: "POST",
    path: "/api/app/wechat/login",
    body: {},
    expected: [{ status: 400, code: "missing_code" }],
  },
  {
    scope: "account",
    method: "GET",
    path: "/api/app/profile",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "account",
    method: "GET",
    path: "/api/app/entitlements",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "store-admin",
    method: "GET",
    path: "/api/app/store-admin/overview",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "store-admin",
    method: "GET",
    path: "/api/app/store-admin/members",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "store-admin",
    method: "GET",
    path: "/api/app/store-admin/analytics",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/store-admin/service-records",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "invites",
    method: "POST",
    path: "/api/app/store-admin/invites",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "invites",
    method: "GET",
    path: "/api/app/store-admin/invites/app-smoke-invalid-token/preview",
    expected: [{ status: 404, code: "invite_not_found" }],
    allowLocalRdsUnavailable: true,
  },
  {
    scope: "invites",
    method: "GET",
    path: "/api/app/store-admin/invites/app-smoke-invalid-token/qrcode",
    expected: [{ status: 404, code: "invite_not_found" }],
    allowLocalRdsUnavailable: true,
  },
  {
    scope: "invites",
    method: "POST",
    path: "/api/app/store-admin/invites/app-smoke-invalid-token/accept",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/store-profiles",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/store-profiles/app-smoke-profile",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/customer-profiles",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/customer-profiles/app-smoke-profile",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/scene-cards",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/scene-cards/app-smoke-card",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "learning-progress",
    method: "GET",
    path: "/api/app/learning/progress",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "learning-progress",
    method: "POST",
    path: "/api/app/learning/progress/events",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "learning-progress",
    method: "POST",
    path: "/api/app/learning/progress/sync",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/service-records/sessions",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/device-files/check",
    body: { files: [] },
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/service-records/sessions/app-smoke-session",
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/segments",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/oss-upload",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/segments/oss",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/markers",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/resume",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/end",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/process",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/asr/poll",
    body: {},
    expected: [{ status: 401, code: "auth_required" }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/service-records/sessions/app-smoke-session/audio/app-smoke-segment",
    expected: [{ status: 401, code: "auth_required" }],
  },
]

function normalizeProbeContractValue(value, path = "$probes") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non_finite_probe_contract_number:${path}`)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeProbeContractValue(item, `${path}[${index}]`))
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype) {
      throw new Error(`unsupported_probe_contract_object:${path}`)
    }
    return Object.fromEntries(Object.keys(value).sort().map((key, index) => [
      key,
      normalizeProbeContractValue(value[key], `${path}.key[${index}]`),
    ]))
  }
  throw new Error(`unsupported_probe_contract_value:${path}:${typeof value}`)
}

function validateProbeContract(probes) {
  if (!Array.isArray(probes) || probes.length === 0) {
    throw new Error("invalid_probe_contract:probes:not_nonempty_array")
  }

  const routeKeys = new Set()
  probes.forEach((probe, probeIndex) => {
    if (!probe || typeof probe !== "object" || Array.isArray(probe) || Object.getPrototypeOf(probe) !== Object.prototype) {
      throw new Error(`invalid_probe_contract:item:${probeIndex}:not_plain_object`)
    }
    if (typeof probe.scope !== "string" || probe.scope.trim().length === 0) {
      throw new Error(`invalid_probe_contract:item:${probeIndex}:scope`)
    }
    if (typeof probe.method !== "string" || !ALLOWED_HTTP_METHODS.has(probe.method)) {
      throw new Error(`invalid_probe_contract:item:${probeIndex}:method`)
    }
    if (typeof probe.path !== "string" || !probe.path.startsWith("/")) {
      throw new Error(`invalid_probe_contract:item:${probeIndex}:path`)
    }
    if (!Array.isArray(probe.expected) || probe.expected.length === 0) {
      throw new Error(`invalid_probe_contract:item:${probeIndex}:expected`)
    }
    probe.expected.forEach((expected, expectedIndex) => {
      if (!expected || typeof expected !== "object" || Array.isArray(expected) || Object.getPrototypeOf(expected) !== Object.prototype) {
        throw new Error(`invalid_probe_contract:item:${probeIndex}:expected:${expectedIndex}:not_plain_object`)
      }
      if (!Number.isInteger(expected.status) || expected.status < 100 || expected.status > 599) {
        throw new Error(`invalid_probe_contract:item:${probeIndex}:expected:${expectedIndex}:status`)
      }
      if (
        !Object.hasOwn(expected, "code") ||
        typeof expected.code !== "string" ||
        expected.code.length === 0 ||
        expected.code !== expected.code.trim() ||
        !PUBLIC_ERROR_CODE_PATTERN.test(expected.code)
      ) {
        throw new Error(`invalid_probe_contract:item:${probeIndex}:expected:${expectedIndex}:code`)
      }
    })

    const routeKey = `${probe.method} ${probe.path}`
    if (routeKeys.has(routeKey)) {
      throw new Error(`invalid_probe_contract:item:${probeIndex}:duplicate_method_path`)
    }
    routeKeys.add(routeKey)
  })
}

export function buildAppApiSmokeProbeSetId(probes) {
  validateProbeContract(probes)
  let safeProbeContract
  try {
    safeProbeContract = normalizeProbeContractValue(probes)
  } catch {
    throw new Error("invalid_probe_contract:value")
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(safeProbeContract))
    .digest("hex")
  return `app_api_smoke_probe_set_v1:${safeProbeContract.length}:${digest}`
}

export const APP_API_SMOKE_PROBE_SET_ID = buildAppApiSmokeProbeSetId(PROBES)

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    baseUrl: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
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

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(text)) throw new Error("invalid_base_url")
  return text
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`env_file_not_found:${filePath}`)
  const env = new Map()
  const raw = readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
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

function mapToObject(map) {
  return Object.fromEntries(map.entries())
}

function isReadyEnvValue(value) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''" && !text.startsWith("TODO_"))
}

function getEnvText(env, ...names) {
  for (const name of names) {
    const value = String(env.get(name) || "").trim()
    if (isReadyEnvValue(value)) return value
  }
  return ""
}

function isAliyunKmsSecretDatabaseUrlConfigured(env) {
  const secretName = getEnvText(
    env,
    "DATABASE_URL_CN_SECRET_NAME",
    "ALIYUN_RDS_DATABASE_URL_CN_SECRET_NAME",
    "ALIYUN_KMS_DATABASE_URL_CN_SECRET_NAME",
  )
  const envCredential = getEnvText(env, "ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIYUN_KMS_ACCESS_KEY_ID") &&
    getEnvText(env, "ALIBABA_CLOUD_ACCESS_KEY_SECRET", "ALIYUN_KMS_ACCESS_KEY_SECRET")
  const oidcCredential = getEnvText(env, "ALIBABA_CLOUD_ROLE_ARN", "ALIYUN_KMS_ROLE_ARN") &&
    getEnvText(env, "ALIBABA_CLOUD_OIDC_PROVIDER_ARN", "ALIYUN_KMS_OIDC_PROVIDER_ARN") &&
    getEnvText(env, "ALIBABA_CLOUD_OIDC_TOKEN_FILE", "ALIYUN_KMS_OIDC_TOKEN_FILE")
  return Boolean(secretName && (envCredential || oidcCredential))
}

function isAliyunRdsConfigured(env) {
  return Boolean(getEnvText(env, "DATABASE_URL_CN") || isAliyunKmsSecretDatabaseUrlConfigured(env))
}

export function buildProbePlanForRuntime(probes, options = {}) {
  const env = options.env instanceof Map ? options.env : new Map()
  const allowLocalRdsUnavailable = Boolean(options.allowLocalRdsUnavailable && !isAliyunRdsConfigured(env))
  return probes.map((probe) => {
    if (!allowLocalRdsUnavailable || !probe.allowLocalRdsUnavailable) return probe
    return {
      ...probe,
      expected: LOCAL_RDS_UNAVAILABLE_EXPECTED.map((item) => ({ ...item })),
      runtimeExpectation: "local_rds_unavailable",
    }
  })
}

function summarizeRuntimePlan(probes, options) {
  const localRdsUnavailableProbes = probes.filter((probe) => probe.runtimeExpectation === "local_rds_unavailable")
  return {
    localMode: Boolean(options.localMode),
    aliyunRdsReady: options.localMode ? isAliyunRdsConfigured(options.env) : "not_checked_for_remote_base_url",
    localRdsUnavailableExpected: localRdsUnavailableProbes.length,
  }
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("failed_to_resolve_free_port"))
          return
        }
        resolvePort(address.port)
      })
    })
  })
}

async function startServer(env, port) {
  const child = spawn("corepack", ["pnpm", "start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...mapToObject(env),
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const logs = []
  const collect = (chunk) => {
    logs.push(String(chunk))
    if (logs.length > 20) logs.shift()
  }
  child.stdout.on("data", collect)
  child.stderr.on("data", collect)
  return { child, logs }
}

async function waitForReady(baseUrl, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server_exited:${child.exitCode}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`)
      if (response.status === 200) return
    } catch (error) {
      lastError = error
    }
    await sleep(300)
  }
  throw new Error(`server_not_ready:${lastError instanceof Error ? lastError.message : "timeout"}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill("SIGINT")
  await Promise.race([
    new Promise((resolveDone) => child.once("exit", resolveDone)),
    sleep(2_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL")
    }),
  ])
}

async function requestProbe(baseUrl, probe, timeoutMs, probeOrdinal) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${probe.path}`, {
      method: probe.method,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(probe.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(probe.body === undefined ? {} : { body: JSON.stringify(probe.body) }),
    })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`APP_API_PROBE_INVALID_JSON:${probeOrdinal}:${safeNumericStatus(response.status)}`)
    }
    assertNoSensitiveFields(text, probeOrdinal, response.status)
    const code = body && typeof body === "object" ? String(body.code || body.error || "") : ""
    const matched = probe.expected.some((item) => {
      if (item.status !== response.status) return false
      return item.code === code
    })
    if (!matched) {
      throw new Error(`APP_API_PROBE_RESULT_MISMATCH:${probeOrdinal}:${safeNumericStatus(response.status)}`)
    }
    return {
      scope: probe.scope,
      method: probe.method,
      path: probe.path,
      status: response.status,
      code,
      ...(probe.runtimeExpectation ? { runtimeExpectation: probe.runtimeExpectation } : {}),
    }
  } catch (error) {
    if (error instanceof Error && /^APP_API_PROBE_[A-Z_]+:\d+:\d+$/.test(error.message)) throw error
    throw new Error(`APP_API_PROBE_REQUEST_FAILED:${probeOrdinal}:0`)
  } finally {
    clearTimeout(timeout)
  }
}

function safeNumericStatus(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0
}

function assertNoSensitiveFields(text, probeOrdinal, status) {
  if (/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|DASHSCOPE_API_KEY|DEEPSEEK_API_KEY)/i.test(text)) {
    throw new Error(`APP_API_PROBE_SENSITIVE_RESPONSE:${probeOrdinal}:${safeNumericStatus(status)}`)
  }
}

function summarizeScopes(results) {
  const scopes = new Map()
  for (const result of results) {
    scopes.set(result.scope, (scopes.get(result.scope) || 0) + 1)
  }
  return Object.fromEntries([...scopes.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/smoke-app-api-production-cn.mjs [--base-url https://api-cn.example.com] [--env-file path]",
    "",
    "Without --base-url, starts local next production server with .env.production-cn.local.",
    "The probes are unauthenticated or invalid-token requests that should reach route/business guards without writing data.",
    "Output contains only method, path, status, and public error codes.",
  ].join("\n"))
}

async function runWithBaseUrl(baseUrl, timeoutMs, probes = PROBES) {
  const results = []
  for (const [probeOrdinal, probe] of probes.entries()) {
    results.push(await requestProbe(baseUrl, probe, timeoutMs, probeOrdinal))
  }
  return results
}

async function main() {
  const args = parseArgs(process.argv)
  let server = null
  let baseUrl = args.baseUrl
  let env = new Map()
  const localMode = !baseUrl
  try {
    if (!baseUrl) {
      if (!existsSync(resolve(process.cwd(), ".next"))) {
        throw new Error("next_build_not_found:run_corepack_pnpm_build_first")
      }
      env = parseEnvFile(args.envFile)
      const port = await getFreePort()
      baseUrl = `http://127.0.0.1:${port}`
      server = await startServer(env, port)
      await waitForReady(baseUrl, server.child, args.timeoutMs)
    }

    const probePlan = buildProbePlanForRuntime(PROBES, { env, allowLocalRdsUnavailable: localMode })
    const probes = await runWithBaseUrl(baseUrl, args.timeoutMs, probePlan)
    console.log(JSON.stringify({
      baseUrl,
      probeSetId: APP_API_SMOKE_PROBE_SET_ID,
      runtimePlan: summarizeRuntimePlan(probePlan, { env, localMode }),
      checkedProbes: probes.length,
      scopes: summarizeScopes(probes),
      probes,
    }, null, 2))
  } catch (error) {
    const errorCode = error instanceof Error && /^APP_API_PROBE_[A-Z_]+:\d+:\d+$/.test(error.message)
      ? error.message
      : "APP_API_SMOKE_FAILED"
    console.error(JSON.stringify({
      errorCode,
    }, null, 2))
    process.exitCode = 1
  } finally {
    await stopServer(server?.child)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
