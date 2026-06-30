#!/usr/bin/env node

import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import net from "node:net"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")
const DEFAULT_TIMEOUT_MS = 20_000

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
    expected: [{ status: 401 }],
  },
  {
    scope: "account",
    method: "GET",
    path: "/api/app/entitlements",
    expected: [{ status: 401 }],
  },
  {
    scope: "store-admin",
    method: "GET",
    path: "/api/app/store-admin/overview",
    expected: [{ status: 401 }],
  },
  {
    scope: "store-admin",
    method: "GET",
    path: "/api/app/store-admin/members",
    expected: [{ status: 401 }],
  },
  {
    scope: "store-admin",
    method: "GET",
    path: "/api/app/store-admin/analytics",
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/store-admin/service-records",
    expected: [{ status: 401 }],
  },
  {
    scope: "invites",
    method: "POST",
    path: "/api/app/store-admin/invites",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "invites",
    method: "GET",
    path: "/api/app/store-admin/invites/app-smoke-invalid-token/preview",
    expected: [{ status: 404, code: "invite_not_found" }],
  },
  {
    scope: "invites",
    method: "GET",
    path: "/api/app/store-admin/invites/app-smoke-invalid-token/qrcode",
    expected: [{ status: 404, code: "invite_not_found" }],
  },
  {
    scope: "invites",
    method: "POST",
    path: "/api/app/store-admin/invites/app-smoke-invalid-token/accept",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/store-profiles",
    expected: [{ status: 401 }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/store-profiles/app-smoke-profile",
    expected: [{ status: 401 }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/customer-profiles",
    expected: [{ status: 401 }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/customer-profiles/app-smoke-profile",
    expected: [{ status: 401 }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/scene-cards",
    expected: [{ status: 401 }],
  },
  {
    scope: "context",
    method: "GET",
    path: "/api/app/scene-cards/app-smoke-card",
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/service-records/sessions",
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/device-files/check",
    body: { files: [] },
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/service-records/sessions/app-smoke-session",
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/segments",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/oss-upload",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/segments/oss",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/markers",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/resume",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/end",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/process",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "POST",
    path: "/api/app/service-records/sessions/app-smoke-session/asr/poll",
    body: {},
    expected: [{ status: 401 }],
  },
  {
    scope: "service-records",
    method: "GET",
    path: "/api/app/service-records/sessions/app-smoke-session/audio/app-smoke-segment",
    expected: [{ status: 401 }],
  },
]

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

async function requestProbe(baseUrl, probe, timeoutMs) {
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
      throw new Error(`invalid_json:${probe.method}:${probe.path}:${response.status}`)
    }
    assertNoSensitiveFields(text, probe)
    const code = body && typeof body === "object" ? String(body.code || body.error || "") : ""
    const matched = probe.expected.some((item) => {
      if (item.status !== response.status) return false
      return !item.code || item.code === code
    })
    if (!matched) {
      const expected = probe.expected.map((item) => `${item.status}${item.code ? `/${item.code}` : ""}`).join("|")
      throw new Error(`unexpected_probe_result:${probe.method}:${probe.path}:got_${response.status}/${code}:expected_${expected}`)
    }
    return {
      scope: probe.scope,
      method: probe.method,
      path: probe.path,
      status: response.status,
      code,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function assertNoSensitiveFields(text, probe) {
  if (/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|DASHSCOPE_API_KEY|DEEPSEEK_API_KEY)/i.test(text)) {
    throw new Error(`probe_response_contains_sensitive_field_name:${probe.method}:${probe.path}`)
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

async function runWithBaseUrl(baseUrl, timeoutMs) {
  const results = []
  for (const probe of PROBES) {
    results.push(await requestProbe(baseUrl, probe, timeoutMs))
  }
  return results
}

async function main() {
  const args = parseArgs(process.argv)
  let server = null
  let baseUrl = args.baseUrl
  try {
    if (!baseUrl) {
      if (!existsSync(resolve(process.cwd(), ".next"))) {
        throw new Error("next_build_not_found:run_corepack_pnpm_build_first")
      }
      const env = parseEnvFile(args.envFile)
      const port = await getFreePort()
      baseUrl = `http://127.0.0.1:${port}`
      server = await startServer(env, port)
      await waitForReady(baseUrl, server.child, args.timeoutMs)
    }

    const probes = await runWithBaseUrl(baseUrl, args.timeoutMs)
    console.log(JSON.stringify({
      baseUrl,
      checkedProbes: probes.length,
      scopes: summarizeScopes(probes),
      probes,
    }, null, 2))
  } catch (error) {
    const recentServerLines = server?.logs?.join("").split(/\r?\n/).filter(Boolean).slice(-6) || []
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      recentServerLines,
    }, null, 2))
    process.exitCode = 1
  } finally {
    await stopServer(server?.child)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
