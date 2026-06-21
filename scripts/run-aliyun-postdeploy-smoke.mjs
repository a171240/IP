#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")
const DEFAULT_OUT_PARENT = "/tmp"
const DEFAULT_TIMEOUT_MS = 20_000
const FORBIDDEN_HOSTS = new Set([
  "ip.ipgongchang.xin",
  "www.ipnrgc.com",
  "ipnrgc.com",
])

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    baseUrl: "",
    outDir: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowMissing: "",
    allowCustomHost: false,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--base-url") {
      args.baseUrl = normalizeBaseUrl(requireValue(argv[++index], "--base-url"))
      continue
    }
    if (arg === "--out-dir") {
      args.outDir = resolveValue(argv[++index], "--out-dir")
      continue
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(requireValue(argv[++index], "--timeout-ms"))
      if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1_000) throw new Error("invalid_timeout_ms")
      continue
    }
    if (arg === "--allow-missing") {
      args.allowMissing = requireValue(argv[++index], "--allow-missing")
      continue
    }
    if (arg === "--allow-custom-host") {
      args.allowCustomHost = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }
    throw new Error(`unknown_arg:${arg}`)
  }
  if (!args.baseUrl) {
    args.baseUrl = normalizeBaseUrl(readEnvValue(args.envFile, "APP_API_BASE_URL"))
  }
  assertProductionCnBaseUrl(args.baseUrl, args.allowCustomHost)
  if (!args.outDir) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    args.outDir = resolve(DEFAULT_OUT_PARENT, `meiye-huajing-aliyun-postdeploy-smoke-${stamp}`)
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

function readEnvValue(filePath, key) {
  if (!existsSync(filePath)) throw new Error(`env_file_not_found:${filePath}`)
  const raw = readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || match[1] !== key) continue
    return unquote(match[2])
  }
  throw new Error(`env_key_not_found:${key}`)
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

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "")
  if (!text || text.startsWith("TODO_")) throw new Error("base_url_not_ready")
  if (!/^https?:\/\//.test(text)) throw new Error("invalid_base_url")
  return text
}

function assertProductionCnBaseUrl(baseUrl, allowCustomHost) {
  const parsed = new URL(baseUrl)
  const isLocalhost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"
  if (!isLocalhost && parsed.protocol !== "https:") throw new Error("production_cn_base_url_must_be_https")
  if (FORBIDDEN_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith(".vercel.app")) {
    throw new Error(`forbidden_legacy_or_vercel_host:${parsed.hostname}`)
  }
  if (!isLocalhost && !allowCustomHost && !parsed.hostname.startsWith("api-cn.")) {
    throw new Error(`non_api_cn_host:${parsed.hostname}`)
  }
}

function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  }
}

function parseJsonStep(label, output) {
  if (output.status !== 0) {
    return {
      ok: false,
      status: output.status,
      error: compactError(output),
      result: null,
    }
  }
  try {
    return {
      ok: true,
      status: 0,
      error: null,
      result: JSON.parse(output.stdout),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`,
      result: null,
    }
  }
}

function compactError(output) {
  return (output.stderr || output.stdout || `exit ${output.status}`)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 10)
    .join(" | ")
}

function assertNoSecretValues(report) {
  const text = JSON.stringify(report)
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /eyJ[A-Za-z0-9_-]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
    /gh[pousr]_[A-Za-z0-9_]{30,}/,
    /AKIA[0-9A-Z]{16}/,
    /LTAI[A-Za-z0-9]{12,}/,
    /secret_[A-Za-z0-9]{20,}/,
    /:\/\/[^\s:@]+:[^\s@]+@/,
  ]
  if (patterns.some((pattern) => pattern.test(text))) throw new Error("postdeploy_report_contains_secret_value_pattern")
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 })
}

function writeMarkdown(filePath, report) {
  const lines = [
    "# 美业话镜 APP production-cn 阿里云 postdeploy smoke",
    "",
    `生成时间：${report.generatedAt}`,
    `baseUrl：${report.baseUrl}`,
    `ok：${report.ok}`,
    "",
    "## 结果",
    "",
    `- remoteHealth: ${report.steps.remoteHealth.ok ? "ok" : "failed"}`,
    `- appApiSmoke: ${report.steps.appApiSmoke.ok ? "ok" : "failed"}`,
    "",
    "## 输出文件",
    "",
    `- remoteHealth: ${report.outputFiles.remoteHealth}`,
    `- appApiSmoke: ${report.outputFiles.appApiSmoke}`,
    `- reportJson: ${report.outputFiles.reportJson}`,
    "",
    "## 说明",
    "",
    "- 报告只包含路径、状态码、公开错误码和健康检查组，不包含环境变量值。",
    "- 正式 production-cn 不应使用 Vercel、旧域名或非 HTTPS 域名作为 baseUrl。",
  ]
  if (!report.ok) {
    lines.push("", "## 错误", "")
    if (report.steps.remoteHealth.error) lines.push(`- remoteHealth: ${report.steps.remoteHealth.error}`)
    if (report.steps.appApiSmoke.error) lines.push(`- appApiSmoke: ${report.steps.appApiSmoke.error}`)
  }
  writeFileSync(filePath, `${lines.join("\n")}\n`, { mode: 0o600 })
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/run-aliyun-postdeploy-smoke.mjs --base-url https://api-cn.ipgongchang.xin [--allow-missing appWechatLogin] [--out-dir /tmp/path]",
    "",
    "Runs deployed Aliyun health smoke and APP API smoke, then writes non-secret JSON/Markdown reports outside the repo.",
    "If --base-url is omitted, APP_API_BASE_URL is read from .env.production-cn.local.",
    "Production base URL must be HTTPS and api-cn.* unless --allow-custom-host is passed for temporary diagnostics.",
  ].join("\n"))
}

function main() {
  const args = parseArgs(process.argv)
  if (existsSync(args.outDir)) throw new Error(`out_dir_already_exists:${args.outDir}`)
  mkdirSync(args.outDir, { recursive: false, mode: 0o700 })

  const healthArgs = [
    "--base-url",
    args.baseUrl,
    "--timeout-ms",
    String(args.timeoutMs),
  ]
  if (args.allowMissing) healthArgs.push("--allow-missing", args.allowMissing)
  const appApiArgs = [
    "--base-url",
    args.baseUrl,
    "--timeout-ms",
    String(args.timeoutMs),
  ]

  const remoteHealth = parseJsonStep("remote_health", runNode("scripts/smoke-aliyun-remote.mjs", healthArgs))
  const appApiSmoke = parseJsonStep("app_api_smoke", runNode("scripts/smoke-app-api-production-cn.mjs", appApiArgs))

  const outputFiles = {
    remoteHealth: resolve(args.outDir, "remote-health-smoke.json"),
    appApiSmoke: resolve(args.outDir, "app-api-smoke.json"),
    reportJson: resolve(args.outDir, "postdeploy-smoke.json"),
    reportMarkdown: resolve(args.outDir, "postdeploy-smoke.md"),
  }
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    allowedMissing: args.allowMissing ? args.allowMissing.split(",").map((item) => item.trim()).filter(Boolean) : [],
    ok: remoteHealth.ok && appApiSmoke.ok,
    steps: {
      remoteHealth,
      appApiSmoke,
    },
    outputFiles,
  }

  assertNoSecretValues(report)
  writeJson(outputFiles.remoteHealth, remoteHealth)
  writeJson(outputFiles.appApiSmoke, appApiSmoke)
  writeJson(outputFiles.reportJson, report)
  writeMarkdown(outputFiles.reportMarkdown, report)
  console.log(JSON.stringify({
    ok: report.ok,
    baseUrl: report.baseUrl,
    outDir: args.outDir,
    allowedMissing: report.allowedMissing,
    remoteHealth: {
      ok: remoteHealth.ok,
      status: remoteHealth.status,
      summary: remoteHealth.result
        ? {
            healthz: remoteHealth.result.healthz,
            health: remoteHealth.result.health,
            strictHealth: remoteHealth.result.strictHealth,
          }
        : null,
      error: remoteHealth.error,
    },
    appApiSmoke: {
      ok: appApiSmoke.ok,
      status: appApiSmoke.status,
      checkedProbes: appApiSmoke.result?.checkedProbes || 0,
      scopes: appApiSmoke.result?.scopes || null,
      error: appApiSmoke.error,
    },
    reportJson: outputFiles.reportJson,
    reportMarkdown: outputFiles.reportMarkdown,
  }, null, 2))
  if (!report.ok) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
