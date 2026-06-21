#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_IMAGE = "meiye-huajing-app-api:production-cn"
const DEFAULT_PORT = 3023
const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_ALLOWED_MISSING = ["appWechatLogin", "legalLinks"]

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
  legalLinks: [["PRIVACY_POLICY_URL"], ["TERMS_URL"]],
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
    image: DEFAULT_IMAGE,
    envFile: DEFAULT_ENV_FILE,
    port: DEFAULT_PORT,
    name: `meiye-aliyun-smoke-${Date.now()}`,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowedMissing: DEFAULT_ALLOWED_MISSING,
    keep: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--image") {
      args.image = requireValue(argv[++index], "--image")
      continue
    }
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--port") {
      args.port = Number(requireValue(argv[++index], "--port"))
      if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error("invalid_port")
      continue
    }
    if (arg === "--name") {
      args.name = requireValue(argv[++index], "--name")
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]+$/.test(args.name)) throw new Error("invalid_container_name")
      continue
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(requireValue(argv[++index], "--timeout-ms"))
      if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1_000) throw new Error("invalid_timeout_ms")
      continue
    }
    if (arg === "--allow-missing") {
      args.allowedMissing = requireValue(argv[++index], "--allow-missing")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
      continue
    }
    if (arg === "--keep") {
      args.keep = true
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

function requireValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return value
}

function resolveValue(value, name) {
  const raw = requireValue(value, name)
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
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

function writeSanitizedEnvFile(env) {
  const dir = mkdtempSync(resolve(tmpdir(), "meiye-aliyun-container-smoke-"))
  const filePath = resolve(dir, "runtime.env")
  const lines = []
  for (const [key, value] of env.entries()) {
    const text = String(value || "")
    if (text.includes("\n") || text.includes("\r")) throw new Error(`env_value_contains_newline:${key}`)
    lines.push(`${key}=${text}`)
  }
  writeFileSync(filePath, `${lines.join("\n")}\n`, { mode: 0o600 })
  return { dir, filePath }
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 1024 * 1024 * 20,
    timeout: options.timeout,
  })
  if (result.error) throw result.error
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${command}_failed:${args.join(" ")}:${compactCommandOutput(result)}`)
  }
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  }
}

function compactCommandOutput(result) {
  return (result.stderr || result.stdout || `exit ${result.status}`)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" | ")
}

function assertDockerReady() {
  const result = run("docker", ["info"], { allowFailure: true, timeout: 5_000 })
  if (result.status !== 0) throw new Error(`docker_not_ready:${compactCommandOutput(result)}`)
}

function assertContainerNameAvailable(name) {
  const result = run("docker", ["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"])
  const names = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (names.includes(name)) throw new Error(`container_name_already_exists:${name}`)
}

function startContainer(args, sanitizedEnvFile) {
  assertContainerNameAvailable(args.name)
  const dockerArgs = [
    "run",
    ...(args.keep ? [] : ["--rm"]),
    "-d",
    "--name",
    args.name,
    "--env-file",
    sanitizedEnvFile,
    "-p",
    `127.0.0.1:${args.port}:3000`,
    args.image,
  ]
  const result = run("docker", dockerArgs, { allowFailure: true })
  if (result.status !== 0) throw new Error(`docker_run_failed:${compactCommandOutput(result)}`)
  return result.stdout.trim()
}

function containerRunning(name) {
  const result = run("docker", ["inspect", "-f", "{{.State.Running}}", name], { allowFailure: true })
  return result.status === 0 && result.stdout.trim() === "true"
}

function dockerLogs(name, env) {
  const result = run("docker", ["logs", "--tail", "120", name], { allowFailure: true })
  return redactSensitiveText(`${result.stdout}${result.stderr}`, env)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-120)
}

function stopContainer(name) {
  run("docker", ["stop", name], { allowFailure: true, timeout: 15_000 })
}

async function waitForHealth(baseUrl, args, env, expectedMissing) {
  const deadline = Date.now() + args.timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (!containerRunning(args.name)) {
      throw new Error(`container_exited:${dockerLogs(args.name, env).slice(-8).join(" | ")}`)
    }
    try {
      const result = await requestJson(`${baseUrl}/api/healthz`, args.timeoutMs)
      assertHealthMissing("healthz", result, expectedMissing, args.allowedMissing)
      return result
    } catch (error) {
      lastError = error
    }
    await sleep(400)
  }
  throw new Error(`container_health_not_ready:${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function runHealthChecks(baseUrl, args, expectedMissing) {
  const healthz = await requestJson(`${baseUrl}/api/healthz`, args.timeoutMs)
  const appHealth = await requestJson(`${baseUrl}/api/app/health`, args.timeoutMs)
  const strictHealth = await requestJson(`${baseUrl}/api/app/health?strict=1`, args.timeoutMs)
  assertHealthMissing("healthz", healthz, expectedMissing, args.allowedMissing)
  assertHealthMissing("appHealth", appHealth, expectedMissing, args.allowedMissing)
  assertHealthMissing("strictHealth", strictHealth, expectedMissing, args.allowedMissing)
  const expectedOk = expectedMissing.length === 0
  if (strictHealth.status !== (expectedOk ? 200 : 503)) {
    throw new Error(`unexpected_strict_health_status:${strictHealth.status}`)
  }
  return {
    healthz: summarizeHealth(healthz),
    appHealth: summarizeHealth(appHealth),
    strictHealth: summarizeHealth(strictHealth),
  }
}

async function requestJson(url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`invalid_json:${url}:${response.status}`)
    }
    assertNoSensitiveFieldNames(text, url)
    return {
      status: response.status,
      body,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function assertHealthMissing(label, result, expectedMissing, allowedMissing) {
  const body = result.body
  if (!body || typeof body !== "object") throw new Error(`invalid_health_body:${label}`)
  if (!Array.isArray(body.missing)) throw new Error(`health_missing_not_array:${label}`)
  const actual = [...body.missing].sort()
  const expected = [...expectedMissing].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`unexpected_health_missing:${label}:actual_${actual.join(",")}:expected_${expected.join(",")}`)
  }
  const disallowed = actual.filter((item) => !allowedMissing.includes(item))
  if (disallowed.length > 0) throw new Error(`health_missing_not_allowed:${label}:${disallowed.join(",")}`)
  if (body.ok !== (expected.length === 0)) throw new Error(`unexpected_health_ok:${label}`)
  if (result.status !== 200 && label !== "strictHealth") throw new Error(`unexpected_health_status:${label}:${result.status}`)
}

function assertNoSensitiveFieldNames(text, label) {
  if (/(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|DASHSCOPE_API_KEY|DEEPSEEK_API_KEY)/i.test(text)) {
    throw new Error(`health_response_contains_sensitive_field_name:${label}`)
  }
}

function summarizeHealth(result) {
  return {
    status: result.status,
    ok: Boolean(result.body.ok),
    missing: Array.isArray(result.body.missing) ? result.body.missing : [],
  }
}

function runAppApiSmoke(baseUrl, timeoutMs) {
  const result = run(process.execPath, [
    "scripts/smoke-app-api-production-cn.mjs",
    "--base-url",
    baseUrl,
    "--timeout-ms",
    String(timeoutMs),
  ], { allowFailure: true })
  if (result.status !== 0) {
    throw new Error(`app_api_smoke_failed:${compactCommandOutput(result)}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`app_api_smoke_invalid_json:${error instanceof Error ? error.message : String(error)}`)
  }
}

function redactSensitiveText(text, env) {
  let redacted = String(text || "")
  for (const [key, value] of env.entries()) {
    const raw = String(value || "")
    if (raw.length < 8) continue
    if (!isSensitiveEnvKey(key)) continue
    redacted = redacted.split(raw).join(`[REDACTED:${key}]`)
  }
  return redacted
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED:secret]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}/g, "[REDACTED:jwt]")
    .replace(/LTAI[A-Za-z0-9]{12,}/g, "[REDACTED:aliyun_key]")
    .replace(/:\/\/[^\s:@]+:[^\s@]+@/g, "://[REDACTED]@")
}

function isSensitiveEnvKey(key) {
  return /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_KEY|API_KEY|ANON_KEY)/i.test(key)
}

function assertNoSecretValues(report, env) {
  const redacted = redactSensitiveText(JSON.stringify(report), env)
  if (redacted !== JSON.stringify(report)) throw new Error("container_smoke_report_contains_secret_value")
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/run-aliyun-container-smoke.mjs [--port 3023] [--image meiye-huajing-app-api:production-cn]",
    "",
    "Starts the local Aliyun Docker image with a sanitized copy of .env.production-cn.local,",
    "validates health endpoints, runs the APP API smoke probes, then stops the container.",
    "",
    "Options:",
    "  --env-file path              Defaults to /Users/Admin/Documents/美业话镜APP/.env.production-cn.local",
    "  --allow-missing a,b          Defaults to appWechatLogin,legalLinks",
    "  --name container-name        Defaults to a generated unique name",
    "  --keep                       Leave the container running for manual debugging",
  ].join("\n"))
}

async function main() {
  const args = parseArgs(process.argv)
  const env = parseEnvFile(args.envFile)
  const expectedMissing = expectedMissingGroups(env)
  const sanitized = writeSanitizedEnvFile(env)
  let containerId = ""
  let sanitizedEnvDeleted = false
  try {
    assertDockerReady()
    containerId = startContainer(args, sanitized.filePath)
    rmSync(sanitized.dir, { recursive: true, force: true })
    sanitizedEnvDeleted = true

    const baseUrl = `http://127.0.0.1:${args.port}`
    await waitForHealth(baseUrl, args, env, expectedMissing)
    const health = await runHealthChecks(baseUrl, args, expectedMissing)
    const appApiSmoke = runAppApiSmoke(baseUrl, args.timeoutMs)
    const report = {
      ok: true,
      image: args.image,
      containerName: args.name,
      containerId,
      baseUrl,
      envFile: args.envFile,
      sanitizedEnvFileDeleted: sanitizedEnvDeleted,
      keep: args.keep,
      allowedMissing: args.allowedMissing,
      expectedMissing,
      health,
      appApiSmoke: {
        checkedProbes: appApiSmoke.checkedProbes,
        scopes: appApiSmoke.scopes,
      },
    }
    assertNoSecretValues(report, env)
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    const logs = containerId ? dockerLogs(args.name, env).slice(-20) : []
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      image: args.image,
      containerName: args.name,
      containerStarted: Boolean(containerId),
      sanitizedEnvFileDeleted: sanitizedEnvDeleted,
      recentContainerLogs: logs,
    }, null, 2))
    process.exitCode = 1
  } finally {
    if (!sanitizedEnvDeleted) {
      rmSync(sanitized.dir, { recursive: true, force: true })
      sanitizedEnvDeleted = true
    }
    if (containerId && !args.keep) stopContainer(args.name)
  }
}

await main()
