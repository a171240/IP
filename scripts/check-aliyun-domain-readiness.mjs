#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { resolve4, resolve6, resolveCname } from "node:dns/promises"
import { request } from "node:https"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_ENV_FILE = resolve(WORKSPACE_ROOT, ".env.production-cn.local")

const OLD_VERCEL_HOSTS = new Set([
  "ip.ipgongchang.xin",
  "ipnrgc.com",
  "www.ipnrgc.com",
])

const ENV_TARGETS = [
  {
    key: "APP_API_BASE_URL",
    required: true,
    expectedHostPrefix: "api-cn.",
    probePath: "/api/healthz",
    requireHttp2xx: true,
  },
  {
    key: "NEXT_PUBLIC_SITE_URL",
    required: true,
    expectedHostPrefix: "api-cn.",
    probePath: "/api/healthz",
    requireHttp2xx: true,
  },
  {
    key: "APP_ASSET_BASE_URL",
    required: false,
    expectedHostPrefix: "assets-cn.",
    probePath: "/",
    requireHttp2xx: false,
  },
]

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    includeEnv: true,
    allowBlocking: false,
    timeoutMs: 8000,
    urls: [],
    hosts: [],
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--env-file") {
      args.envFile = resolveValue(argv[++index], "--env-file")
      continue
    }
    if (arg === "--url") {
      args.urls.push(requireValue(argv[++index], "--url"))
      continue
    }
    if (arg === "--host") {
      args.hosts.push(requireValue(argv[++index], "--host"))
      continue
    }
    if (arg === "--timeout-ms") {
      args.timeoutMs = Number(requireValue(argv[++index], "--timeout-ms"))
      if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) throw new Error("invalid_timeout_ms")
      continue
    }
    if (arg === "--skip-env") {
      args.includeEnv = false
      continue
    }
    if (arg === "--allow-blocking") {
      args.allowBlocking = true
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
  return resolve(process.cwd(), requireValue(value, name))
}

function requireValue(value, name) {
  if (!value) throw new Error(`missing_value:${name}`)
  return value
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return new Map()
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

function envValueReady(value) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''" && !text.startsWith("TODO_"))
}

function normalizeUrl(value) {
  const text = String(value || "").trim()
  if (!text) return text
  if (/^https?:\/\//i.test(text)) return text
  return `https://${text}`
}

function collectTargets(args) {
  const env = args.includeEnv ? parseEnvFile(args.envFile) : new Map()
  const targets = []

  if (args.includeEnv) {
    for (const definition of ENV_TARGETS) {
      const value = env.get(definition.key)
      if (!definition.required && !envValueReady(value)) continue
      targets.push({
        label: definition.key,
        source: "env",
        url: value || "",
        required: definition.required,
        expectedHostPrefix: definition.expectedHostPrefix,
        probePath: definition.probePath,
        requireHttp2xx: definition.requireHttp2xx,
      })
    }
  }

  args.urls.forEach((url, index) => {
    targets.push({
      label: `arg_url_${index + 1}`,
      source: "arg",
      url,
      required: true,
      expectedHostPrefix: "",
      probePath: "/api/healthz",
      requireHttp2xx: false,
    })
  })

  args.hosts.forEach((host, index) => {
    targets.push({
      label: `arg_host_${index + 1}`,
      source: "arg",
      url: normalizeUrl(host),
      required: true,
      expectedHostPrefix: "",
      probePath: "/api/healthz",
      requireHttp2xx: false,
    })
  })

  return targets
}

function validateUrl(target) {
  const blocking = []
  const url = normalizeUrl(target.url)
  let parsed = null

  if (!envValueReady(url)) {
    blocking.push(`${target.label}:url_missing_or_todo`)
    return {
      ready: false,
      parsed: null,
      normalizedUrl: "",
      blocking,
      status: "missing",
    }
  }

  try {
    parsed = new URL(url)
  } catch {
    blocking.push(`${target.label}:invalid_url`)
    return {
      ready: false,
      parsed: null,
      normalizedUrl: url,
      blocking,
      status: "invalid_url",
    }
  }

  if (parsed.protocol !== "https:") blocking.push(`${target.label}:must_be_https`)
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") blocking.push(`${target.label}:local_host`)
  if (parsed.hostname.endsWith(".localhost")) blocking.push(`${target.label}:local_host`)
  if (parsed.hostname.includes("example.")) blocking.push(`${target.label}:example_host`)
  if (parsed.hostname.endsWith(".vercel.app")) blocking.push(`${target.label}:vercel_host`)
  if (OLD_VERCEL_HOSTS.has(parsed.hostname)) blocking.push(`${target.label}:legacy_vercel_domain`)
  if (target.expectedHostPrefix && !parsed.hostname.startsWith(target.expectedHostPrefix)) {
    blocking.push(`${target.label}:unexpected_host_prefix:${target.expectedHostPrefix}`)
  }

  return {
    ready: blocking.length === 0,
    parsed,
    normalizedUrl: parsed.toString().replace(/\/$/, ""),
    blocking,
    status: blocking.length === 0 ? "ready" : "blocked",
  }
}

async function resolveDns(hostname) {
  const [a, aaaa, cname] = await Promise.all([
    safeDns(() => resolve4(hostname)),
    safeDns(() => resolve6(hostname)),
    safeDns(() => resolveCname(hostname)),
  ])
  const records = {
    A: a.records,
    AAAA: aaaa.records,
    CNAME: cname.records,
  }
  const errors = {
    A: a.error,
    AAAA: aaaa.error,
    CNAME: cname.error,
  }
  const allRecords = [...records.A, ...records.AAAA, ...records.CNAME]
  const specialUseRecords = [...records.A, ...records.AAAA].filter((record) => isSpecialUseIp(record))
  const pointsToVercel = allRecords.some((record) => String(record).toLowerCase().includes("vercel"))
  return {
    ready: allRecords.length > 0 && !pointsToVercel && specialUseRecords.length === 0,
    recordCount: allRecords.length,
    records,
    errors,
    specialUseRecords,
    pointsToVercel,
  }
}

function isSpecialUseIp(value) {
  const text = String(value || "").trim().toLowerCase()
  if (!text) return false
  if (text.includes(":")) {
    return (
      text === "::1" ||
      text.startsWith("fc") ||
      text.startsWith("fd") ||
      text.startsWith("fe80:")
    )
  }

  const parts = text.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 0 && parts[2] === 2) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && parts[2] === 100) return true
  if (a === 203 && b === 0 && parts[2] === 113) return true
  if (a >= 224) return true
  return false
}

async function safeDns(fn) {
  try {
    const records = await fn()
    return {
      records,
      error: "",
    }
  } catch (error) {
    return {
      records: [],
      error: error?.code || error?.message || "dns_error",
    }
  }
}

function httpsProbe(parsed, probePath, timeoutMs) {
  const probeUrl = new URL(probePath, parsed.origin)
  return new Promise((resolveProbe) => {
    const req = request(probeUrl, {
      method: "GET",
      timeout: timeoutMs,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "meiye-aliyun-domain-readiness/1.0",
      },
    }, (res) => {
      res.resume()
      res.once("end", () => {
        resolveProbe({
          ready: true,
          statusCode: res.statusCode || 0,
          contentType: String(res.headers["content-type"] || ""),
          location: String(res.headers.location || ""),
          error: "",
        })
      })
    })

    req.once("timeout", () => {
      req.destroy(new Error("https_probe_timeout"))
    })
    req.once("error", (error) => {
      resolveProbe({
        ready: false,
        statusCode: 0,
        contentType: "",
        location: "",
        error: error?.code || error?.message || "https_probe_error",
      })
    })
    req.end()
  })
}

async function checkTarget(target, args) {
  const url = validateUrl(target)
  if (!url.parsed) {
    return {
      label: target.label,
      source: target.source,
      required: target.required,
      ready: false,
      url: url.normalizedUrl,
      host: "",
      probePath: target.probePath,
      urlCheck: url,
      dns: null,
      https: null,
      blocking: url.blocking,
    }
  }

  const [dns, https] = await Promise.all([
    resolveDns(url.parsed.hostname),
    httpsProbe(url.parsed, target.probePath, args.timeoutMs),
  ])

  const blocking = [...url.blocking]
  if (!dns.ready) {
    if (dns.pointsToVercel) {
      blocking.push(`${target.label}:dns_points_to_vercel`)
    } else if (dns.specialUseRecords.length > 0) {
      blocking.push(`${target.label}:dns_special_use_ip`)
    } else {
      blocking.push(`${target.label}:dns_not_ready`)
    }
  }
  if (!https.ready) blocking.push(`${target.label}:https_not_ready:${https.error}`)
  if (https.ready && target.requireHttp2xx && (https.statusCode < 200 || https.statusCode >= 300)) {
    blocking.push(`${target.label}:health_not_2xx:${https.statusCode}`)
  }

  return {
    label: target.label,
    source: target.source,
    required: target.required,
    ready: blocking.length === 0,
    url: url.normalizedUrl,
    host: url.parsed.hostname,
    probePath: target.probePath,
    urlCheck: {
      ready: url.ready,
      status: url.status,
      blocking: url.blocking,
    },
    dns,
    https,
    blocking,
  }
}

function nextActions(blocking) {
  const actions = []
  if (blocking.some((item) => item.includes("url_missing_or_todo"))) {
    actions.push("补齐 APP_API_BASE_URL / NEXT_PUBLIC_SITE_URL / APP_ASSET_BASE_URL 的 production-cn HTTPS 目标值。")
  }
  if (blocking.some((item) => item.includes("must_be_https") || item.includes("legacy_vercel_domain") || item.includes("vercel_host"))) {
    actions.push("把 APP production-cn 正式入口切到 api-cn/assets-cn HTTPS 域名，不使用旧 Vercel 域名。")
  }
  if (blocking.some((item) => item.includes("dns_not_ready"))) {
    actions.push("在阿里云 DNS 为 api-cn/assets-cn 添加解析，指向 SAE/SLB 或 OSS/CDN 入口。")
  }
  if (blocking.some((item) => item.includes("dns_special_use_ip"))) {
    actions.push("把 api-cn/assets-cn 从特殊用途 IP 改为公网可访问的阿里云入口地址。")
  }
  if (blocking.some((item) => item.includes("https_not_ready"))) {
    actions.push("在阿里云网关、SLB、Nginx、CDN 或证书服务里给目标域名配置 HTTPS 证书。")
  }
  if (blocking.some((item) => item.includes("health_not_2xx"))) {
    actions.push("部署后确认 /api/healthz 在 api-cn 域名下返回 2xx，再执行 postdeploy smoke。")
  }
  actions.push("ICP备案状态不能由本机 DNS/HTTPS 检查完全证明，仍需分别写入 cloud-confirmations.local.json 的 apiDomainHttps 与 assetDomainHttps 证据。")
  return [...new Set(actions)]
}

async function main() {
  const args = parseArgs(process.argv)
  const targets = collectTargets(args)
  if (targets.length === 0) throw new Error("no_domain_targets")

  const checkedTargets = await Promise.all(targets.map((target) => checkTarget(target, args)))
  const blocking = checkedTargets.flatMap((target) => target.blocking)
  const ok = blocking.length === 0
  const result = {
    ok,
    checkedAt: new Date().toISOString(),
    envFile: args.includeEnv ? args.envFile : null,
    allowBlocking: args.allowBlocking,
    targetReady: checkedTargets.filter((target) => target.ready).length,
    targetTotal: checkedTargets.length,
    machineBlocking: blocking,
    targets: checkedTargets,
    nextActions: nextActions(blocking),
  }

  console.log(JSON.stringify(result, null, 2))
  if (!ok && !args.allowBlocking) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-domain-readiness.mjs [--env-file path] [--allow-blocking]",
    "  node scripts/check-aliyun-domain-readiness.mjs --host api-cn.example.com --skip-env",
    "",
    "Checks production-cn domain shape, DNS records, HTTPS reachability, and /api/healthz for API hosts.",
    "It prints no secret values. Default mode exits non-zero until all checked targets are ready.",
  ].join("\n"))
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
