#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import net from "node:net"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_ENV_FILE = resolve(__dirname, "../../../.env.production-cn.local")
const DEFAULT_TIMEOUT_MS = 20_000

const REQUIRED_RUNTIME_GROUPS = {
  supabase: [
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_IPgongchang_SUPABASE_URL", "IPgongchang_SUPABASE_URL"],
    [
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY",
      "IPgongchang_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY",
      "IPgongchang_SUPABASE_PUBLISHABLE_KEY",
    ],
    ["SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SECRET_KEY"],
  ],
  appWechatLogin: [
    ["WECHAT_LOGIN_SECRET"],
    ["WECHAT_OPEN_APP_ID", "WECHAT_APP_APPID", "WECHAT_APP_ID"],
    ["WECHAT_OPEN_APP_SECRET", "WECHAT_APP_SECRET", "WECHAT_OPEN_SECRET"],
  ],
  aliyunOss: [
    ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID"],
    ["ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
    ["ALIYUN_OSS_BUCKET", "SERVICE_RECORD_OSS_BUCKET"],
  ],
  bailianAsr: [["DASHSCOPE_API_KEY", "BAILIAN_API_KEY", "ALIBABA_CLOUD_BAILIAN_API_KEY"]],
  serviceRecordSummary: [["SERVICE_RECORD_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"]],
  volcSpeech: [["VOLC_SPEECH_APP_ID"], ["VOLC_SPEECH_ACCESS_TOKEN"]],
}

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
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

function isReadyEnvValue(value) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''" && !text.startsWith("TODO_"))
}

function hasAnyEnv(env, names) {
  return names.some((name) => isReadyEnvValue(env.get(name)))
}

function groupReady(env, groups) {
  return groups.every((group) => hasAnyEnv(env, group))
}

function expectedMissingGroups(env) {
  return Object.entries(REQUIRED_RUNTIME_GROUPS)
    .filter(([, groups]) => !groupReady(env, groups))
    .map(([name]) => name)
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

function mapToObject(map) {
  return Object.fromEntries(map.entries())
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

async function readJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`)
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
}

function assertHealthResult(result, expectedMissing) {
  const body = result.body
  if (!body || typeof body !== "object") throw new Error(`invalid_body:${result.path}`)
  if (!Array.isArray(body.missing)) throw new Error(`missing_not_array:${result.path}`)
  const actualMissing = [...body.missing].sort()
  const expected = [...expectedMissing].sort()
  if (JSON.stringify(actualMissing) !== JSON.stringify(expected)) {
    throw new Error(`unexpected_missing:${result.path}:${actualMissing.join(",")}`)
  }
  const expectedOk = expected.length === 0
  if (body.ok !== expectedOk) throw new Error(`unexpected_ok:${result.path}`)
  if (result.path.includes("strict=1")) {
    const expectedStatus = expectedOk ? 200 : 503
    if (result.status !== expectedStatus) throw new Error(`unexpected_strict_status:${result.status}`)
  } else if (result.status !== 200) {
    throw new Error(`unexpected_status:${result.path}:${result.status}`)
  }
}

function countSensitiveLeaks(env, results) {
  const responseText = results.map((result) => result.text).join("\n")
  let leaks = 0
  for (const [key, value] of env.entries()) {
    const text = String(value || "").trim()
    if (!isReadyEnvValue(text) || text.length < 16) continue
    if (!/(SECRET|TOKEN|KEY|PASSWORD|SUPABASE|DEEPSEEK|DASHSCOPE|VOLC|ALIYUN|OSS)/i.test(key)) continue
    if (responseText.includes(text)) leaks += 1
  }
  return leaks
}

function summarizeResult(result) {
  return {
    status: result.status,
    ok: Boolean(result.body.ok),
    missing: result.body.missing,
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill("SIGINT")
  await Promise.race([
    new Promise((resolveDone) => child.once("exit", resolveDone)),
    sleep(2_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL")
    }),
  ])
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/smoke-aliyun-health.mjs [--env-file path] [--timeout-ms 20000]",
    "",
    "Runs next start with the production-cn env file and validates health endpoints.",
    "Output contains only status, booleans, and missing group names; no env values are printed.",
  ].join("\n"))
}

async function main() {
  const args = parseArgs(process.argv)
  const env = parseEnvFile(args.envFile)
  if (!existsSync(resolve(process.cwd(), ".next"))) {
    throw new Error("next_build_not_found:run_corepack_pnpm_build_first")
  }
  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const expectedMissing = expectedMissingGroups(env)
  const { child, logs } = await startServer(env, port)
  try {
    await waitForReady(baseUrl, child, args.timeoutMs)
    const results = [
      await readJson(baseUrl, "/api/healthz"),
      await readJson(baseUrl, "/api/app/health"),
      await readJson(baseUrl, "/api/app/health?strict=1"),
    ]
    for (const result of results) assertHealthResult(result, expectedMissing)
    const sensitiveLeakCount = countSensitiveLeaks(env, results)
    if (sensitiveLeakCount > 0) throw new Error("health_response_leaked_sensitive_values")
    console.log(JSON.stringify({
      envFile: args.envFile,
      expectedMissing,
      healthz: summarizeResult(results[0]),
      health: summarizeResult(results[1]),
      strictHealth: summarizeResult(results[2]),
      sensitiveLeakCount,
    }, null, 2))
  } catch (error) {
    const recentServerLines = logs.join("").split(/\r?\n/).filter(Boolean).slice(-6)
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      recentServerLines,
    }, null, 2))
    process.exitCode = 1
  } finally {
    await stopServer(child)
  }
}

await main()
