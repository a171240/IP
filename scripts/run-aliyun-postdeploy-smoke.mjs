#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"

import {
  canonicalizeDeploymentIdentity,
  canonicalIsoTimestampMs,
  observeDeploymentIdentities,
  publicProvenanceErrorCode,
} from "./lib/aliyun-deployment-identity.mjs"
import {
  APP_API_SMOKE_PROBE_SET_ID,
  PROBES,
} from "./smoke-app-api-production-cn.mjs"

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
const PRODUCTION_HEALTH_CHECK_GROUPS = Object.freeze([
  "aliyunRds",
  "legalLinks",
  "aliyunOssRuntime",
  "bailianAsr",
  "serviceRecordSummary",
  "volcSpeech",
])
const PRODUCTION_HEALTH_METADATA = Object.freeze({
  service: "meiye-huajing-app-api",
  env: "production-cn",
  region: "cn-hangzhou",
  mode: "aliyun-production-cn",
})
const REMOTE_LOCAL_RDS_UNAVAILABLE_EXPECTED_COUNT = PROBES.filter(
  (probe) => probe.runtimeExpectation === "local_rds_unavailable",
).length

function canonicalizeAllowedMissing(value) {
  if (!Array.isArray(value)) throw new Error("invalid_allowed_missing")
  const groups = new Set()
  for (const group of value) {
    if (
      typeof group !== "string" ||
      !PRODUCTION_HEALTH_CHECK_GROUPS.includes(group) ||
      groups.has(group)
    ) {
      throw new Error("invalid_allowed_missing")
    }
    groups.add(group)
  }
  return PRODUCTION_HEALTH_CHECK_GROUPS.filter((group) => groups.has(group))
}

function parseAllowedMissing(value) {
  if (!value) return []
  const groups = value.split(",").map((group) => group.trim())
  if (groups.some((group) => group.length === 0)) throw new Error("invalid_allowed_missing")
  return canonicalizeAllowedMissing(groups)
}

function closeAllowedMissing(value) {
  try {
    return { ok: true, groups: canonicalizeAllowedMissing(value) }
  } catch {
    return { ok: false, groups: [] }
  }
}

function closeBaseUrl(value) {
  try {
    const normalized = normalizeBaseUrl(value)
    return typeof value === "string" && value === normalized ? normalized : null
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const args = {
    envFile: DEFAULT_ENV_FILE,
    baseUrl: "",
    outDir: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    allowedMissing: [],
    allowCustomHost: false,
  }
  let allowedMissingProvided = false
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
      if (allowedMissingProvided) throw new Error("invalid_allowed_missing")
      args.allowedMissing = parseAllowedMissing(requireValue(argv[++index], "--allow-missing"))
      allowedMissingProvided = true
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

export function buildPostdeploySmokeReport({
  generatedAt,
  baseUrl,
  allowedMissing,
  steps,
  outputFiles,
}) {
  const generatedAtMs = canonicalIsoTimestampMs(generatedAt)
  if (generatedAtMs === null) throw new Error("invalid_smoke_generated_at")
  const closedBaseUrl = closeBaseUrl(baseUrl)
  const closedAllowedMissing = closeAllowedMissing(allowedMissing)
  const closedSteps = {
    remoteHealth: closeSmokeStep("remote_health", steps?.remoteHealth, {
      now: generatedAtMs,
      expectedBaseUrl: closedBaseUrl,
      expectedAllowedMissing: closedAllowedMissing.ok ? closedAllowedMissing.groups : null,
    }),
    appApiSmoke: closeSmokeStep("app_api_smoke", steps?.appApiSmoke, {
      now: generatedAtMs,
      expectedBaseUrl: closedBaseUrl,
    }),
  }
  const remoteResult = closedSteps.remoteHealth.result
  const observed = observeDeploymentIdentities([
    remoteResult?.healthz?.observedDeploymentIdentity,
    remoteResult?.health?.observedDeploymentIdentity,
    remoteResult?.strictHealth?.observedDeploymentIdentity,
  ], { now: generatedAtMs })
  let provenanceErrorCode = remoteResult
    ? publicProvenanceErrorCode(observed.errorCode)
    : "REMOTE_DEPLOYMENT_IDENTITY_INVALID"
  if (remoteResult && remoteResult.provenanceErrorCode !== provenanceErrorCode) {
    provenanceErrorCode = "REMOTE_DEPLOYMENT_IDENTITY_INVALID"
  }
  if (!observed.ready && remoteResult) {
    for (const healthKey of ["healthz", "health", "strictHealth"]) {
      remoteResult[healthKey].observedDeploymentIdentity = null
    }
  }
  const observedBaseUrls = [
    steps?.remoteHealth?.result?.baseUrl,
    steps?.appApiSmoke?.result?.baseUrl,
  ]
  const hasBaseUrlMismatch = observedBaseUrls.some((observedBaseUrl) => (
    typeof observedBaseUrl === "string" && observedBaseUrl !== closedBaseUrl
  ))
  return {
    generatedAt,
    baseUrl: closedBaseUrl !== null && !hasBaseUrlMismatch ? closedBaseUrl : "",
    deploymentIdentity: observed.ready ? observed.identity : null,
    provenanceErrorCode,
    allowedMissing: closedAllowedMissing.groups,
    ok: provenanceErrorCode === null && observed.ready && closedSteps.remoteHealth.ok && closedSteps.appApiSmoke.ok,
    steps: closedSteps,
    outputFiles: closeOutputFiles(outputFiles),
  }
}

const STEP_FIELDS = Object.freeze(["ok", "status", "errorCode", "result"])
const OUTPUT_FILE_FIELDS = Object.freeze([
  "remoteHealth",
  "appApiSmoke",
  "reportJson",
  "reportMarkdown",
])
const REMOTE_RESULT_FIELDS = Object.freeze([
  "baseUrl",
  "allowedMissing",
  "provenanceErrorCode",
  "healthz",
  "health",
  "strictHealth",
])
const HEALTH_SUMMARY_FIELDS = Object.freeze([
  "status",
  "service",
  "env",
  "region",
  "mode",
  "checks",
  "ok",
  "missing",
  "observedDeploymentIdentity",
])
const APP_RESULT_FIELDS = Object.freeze([
  "baseUrl",
  "probeSetId",
  "runtimePlan",
  "checkedProbes",
  "scopes",
  "probes",
])
const RUNTIME_PLAN_FIELDS = Object.freeze([
  "localMode",
  "aliyunRdsReady",
  "localRdsUnavailableExpected",
])
const ALLOWED_STEP_ERROR_CODES = Object.freeze({
  remote_health: new Set([
    "REMOTE_HEALTH_CHILD_FAILED",
    "REMOTE_HEALTH_OUTPUT_INVALID",
    "REMOTE_HEALTH_STEP_INVALID",
    "REMOTE_HEALTH_RESULT_INVALID",
  ]),
  app_api_smoke: new Set([
    "APP_API_SMOKE_CHILD_FAILED",
    "APP_API_SMOKE_OUTPUT_INVALID",
    "APP_API_SMOKE_STEP_INVALID",
    "APP_API_SMOKE_RESULT_INVALID",
  ]),
})

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function hasExactFields(value, requiredFields) {
  if (!isPlainObject(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...requiredFields].sort()
  return actual.length === expected.length && actual.every((field, index) => field === expected[index])
}

function sanitizeRemoteHealthSummary(value, healthKey, now, allowedMissing) {
  if (!hasExactFields(value, HEALTH_SUMMARY_FIELDS)) throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  if (
    !Number.isInteger(value.status) ||
    typeof value.ok !== "boolean" ||
    !Array.isArray(value.missing) ||
    !hasExactFields(value.checks, PRODUCTION_HEALTH_CHECK_GROUPS)
  ) {
    throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  }
  for (const [field, expected] of Object.entries(PRODUCTION_HEALTH_METADATA)) {
    if (value[field] !== expected) throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  }
  if (PRODUCTION_HEALTH_CHECK_GROUPS.some((group) => typeof value.checks[group] !== "boolean")) {
    throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  }
  const checks = Object.fromEntries(
    PRODUCTION_HEALTH_CHECK_GROUPS.map((group) => [group, value.checks[group]]),
  )
  const expectedMissing = PRODUCTION_HEALTH_CHECK_GROUPS.filter((group) => checks[group] === false)
  const expectedStatus = healthKey === "strictHealth" && expectedMissing.length > 0 ? 503 : 200
  if (
    value.missing.length !== expectedMissing.length ||
    value.missing.some((item, index) => item !== expectedMissing[index]) ||
    expectedMissing.some((group) => !allowedMissing.has(group)) ||
    value.ok !== (expectedMissing.length === 0) ||
    value.status !== expectedStatus
  ) {
    throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  }
  let observedDeploymentIdentity = null
  if (value.observedDeploymentIdentity !== null) {
    const canonical = canonicalizeDeploymentIdentity(value.observedDeploymentIdentity, { now })
    if (canonical.ok) observedDeploymentIdentity = canonical.identity
  }
  return {
    status: value.status,
    ...PRODUCTION_HEALTH_METADATA,
    checks,
    ok: value.ok,
    missing: expectedMissing,
    observedDeploymentIdentity,
  }
}

function sanitizeRemoteHealthResult(value, options) {
  if (!hasExactFields(value, REMOTE_RESULT_FIELDS)) throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  if (options.expectedBaseUrl === null || value.baseUrl !== options.expectedBaseUrl) {
    throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  }
  const remoteAllowedMissing = closeAllowedMissing(value.allowedMissing)
  if (
    !remoteAllowedMissing.ok ||
    !Array.isArray(options.expectedAllowedMissing) ||
    remoteAllowedMissing.groups.length !== options.expectedAllowedMissing.length ||
    remoteAllowedMissing.groups.some((group, index) => group !== options.expectedAllowedMissing[index])
  ) {
    throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  }
  const allowedMissing = new Set(remoteAllowedMissing.groups)
  const allowedProvenanceCodes = new Set([
    null,
    "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE",
    "REMOTE_DEPLOYMENT_IDENTITY_INVALID",
    "REMOTE_DEPLOYMENT_IDENTITY_MIXED",
  ])
  if (!allowedProvenanceCodes.has(value.provenanceErrorCode)) throw new Error("REMOTE_HEALTH_RESULT_INVALID")
  return {
    baseUrl: options.expectedBaseUrl,
    allowedMissing: remoteAllowedMissing.groups,
    provenanceErrorCode: value.provenanceErrorCode,
    healthz: sanitizeRemoteHealthSummary(value.healthz, "healthz", options.now, allowedMissing),
    health: sanitizeRemoteHealthSummary(value.health, "health", options.now, allowedMissing),
    strictHealth: sanitizeRemoteHealthSummary(value.strictHealth, "strictHealth", options.now, allowedMissing),
  }
}

function expectedScopeCounts() {
  const counts = new Map()
  for (const probe of PROBES) counts.set(probe.scope, (counts.get(probe.scope) || 0) + 1)
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function sanitizeAppApiResult(value, expectedBaseUrl) {
  if (!hasExactFields(value, APP_RESULT_FIELDS)) throw new Error("APP_API_SMOKE_RESULT_INVALID")
  if (
    expectedBaseUrl === null ||
    value.baseUrl !== expectedBaseUrl ||
    value.probeSetId !== APP_API_SMOKE_PROBE_SET_ID ||
    value.checkedProbes !== PROBES.length ||
    !hasExactFields(value.runtimePlan, RUNTIME_PLAN_FIELDS) ||
    value.runtimePlan.localMode !== false ||
    value.runtimePlan.aliyunRdsReady !== "not_checked_for_remote_base_url" ||
    value.runtimePlan.localRdsUnavailableExpected !== REMOTE_LOCAL_RDS_UNAVAILABLE_EXPECTED_COUNT ||
    !hasExactFields(value.scopes, Object.keys(expectedScopeCounts())) ||
    !Array.isArray(value.probes) ||
    value.probes.length !== PROBES.length
  ) {
    throw new Error("APP_API_SMOKE_RESULT_INVALID")
  }
  const scopes = expectedScopeCounts()
  if (Object.keys(scopes).some((scope) => value.scopes[scope] !== scopes[scope])) {
    throw new Error("APP_API_SMOKE_RESULT_INVALID")
  }
  const probes = value.probes.map((observed, index) => {
    const expectedProbe = PROBES[index]
    const expectedFields = ["scope", "method", "path", "status", "code"]
    if (expectedProbe.runtimeExpectation) expectedFields.push("runtimeExpectation")
    if (!hasExactFields(observed, expectedFields)) throw new Error("APP_API_SMOKE_RESULT_INVALID")
    const matched = expectedProbe.expected.some((expected) => (
      observed.status === expected.status && observed.code === expected.code
    ))
    if (
      !matched ||
      observed.scope !== expectedProbe.scope ||
      observed.method !== expectedProbe.method ||
      observed.path !== expectedProbe.path ||
      observed.runtimeExpectation !== expectedProbe.runtimeExpectation
    ) {
      throw new Error("APP_API_SMOKE_RESULT_INVALID")
    }
    return {
      scope: expectedProbe.scope,
      method: expectedProbe.method,
      path: expectedProbe.path,
      status: observed.status,
      code: observed.code,
      ...(expectedProbe.runtimeExpectation ? { runtimeExpectation: expectedProbe.runtimeExpectation } : {}),
    }
  })
  return {
    baseUrl: expectedBaseUrl,
    probeSetId: APP_API_SMOKE_PROBE_SET_ID,
    runtimePlan: {
      localMode: false,
      aliyunRdsReady: "not_checked_for_remote_base_url",
      localRdsUnavailableExpected: REMOTE_LOCAL_RDS_UNAVAILABLE_EXPECTED_COUNT,
    },
    checkedProbes: PROBES.length,
    scopes,
    probes,
  }
}

function closeSmokeStep(label, step, options = {}) {
  if (!hasExactFields(step, STEP_FIELDS)) {
    return {
      ok: false,
      status: Number.isInteger(step?.status) ? step.status : -1,
      errorCode: label === "remote_health" ? "REMOTE_HEALTH_STEP_INVALID" : "APP_API_SMOKE_STEP_INVALID",
      result: null,
    }
  }
  const status = Number.isInteger(step.status) ? step.status : -1
  if (step.ok !== true || status !== 0 || step.errorCode !== null) {
    return {
      ok: false,
      status,
      errorCode: ALLOWED_STEP_ERROR_CODES[label].has(step.errorCode)
        ? step.errorCode
        : label === "remote_health" ? "REMOTE_HEALTH_CHILD_FAILED" : "APP_API_SMOKE_CHILD_FAILED",
      result: null,
    }
  }
  try {
    return {
      ok: true,
      status: 0,
      errorCode: null,
      result: label === "remote_health"
        ? sanitizeRemoteHealthResult(step.result, options)
        : sanitizeAppApiResult(step.result, options.expectedBaseUrl),
    }
  } catch {
    return {
      ok: false,
      status: 0,
      errorCode: label === "remote_health" ? "REMOTE_HEALTH_RESULT_INVALID" : "APP_API_SMOKE_RESULT_INVALID",
      result: null,
    }
  }
}

function closeOutputFiles(outputFiles) {
  if (!hasExactFields(outputFiles, OUTPUT_FILE_FIELDS)) throw new Error("invalid_output_files")
  if (OUTPUT_FILE_FIELDS.some((field) => typeof outputFiles[field] !== "string" || outputFiles[field].trim().length === 0)) {
    throw new Error("invalid_output_files")
  }
  return Object.fromEntries(OUTPUT_FILE_FIELDS.map((field) => [field, outputFiles[field]]))
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
  if (result.error) {
    return { status: -1, stdout: "", stderr: "" }
  }
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  }
}

export function buildSmokeChildStep(label, output) {
  const errorCodePrefix = label === "remote_health" ? "REMOTE_HEALTH" : "APP_API_SMOKE"
  if (output.status !== 0) {
    return {
      ok: false,
      status: Number.isInteger(output.status) ? output.status : -1,
      errorCode: `${errorCodePrefix}_CHILD_FAILED`,
      result: null,
    }
  }
  try {
    return {
      ok: true,
      status: 0,
      errorCode: null,
      result: JSON.parse(output.stdout),
    }
  } catch {
    return {
      ok: false,
      status: 0,
      errorCode: `${errorCodePrefix}_OUTPUT_INVALID`,
      result: null,
    }
  }
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

export function renderPostdeploySmokeMarkdown(report) {
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
    if (report.provenanceErrorCode) lines.push(`- provenance: ${report.provenanceErrorCode}`)
    if (report.steps.remoteHealth.errorCode) lines.push(`- remoteHealth: ${report.steps.remoteHealth.errorCode}`)
    if (report.steps.appApiSmoke.errorCode) lines.push(`- appApiSmoke: ${report.steps.appApiSmoke.errorCode}`)
  }
  return `${lines.join("\n")}\n`
}

function writeMarkdown(filePath, report) {
  writeFileSync(filePath, renderPostdeploySmokeMarkdown(report), { mode: 0o600 })
}

export function buildPostdeployConsoleSummary(report, outDir) {
  return {
    ok: report.ok,
    baseUrl: report.baseUrl,
    outDir,
    allowedMissing: report.allowedMissing,
    provenanceErrorCode: report.provenanceErrorCode,
    remoteHealth: {
      ok: report.steps.remoteHealth.ok,
      status: report.steps.remoteHealth.status,
      errorCode: report.steps.remoteHealth.errorCode,
    },
    appApiSmoke: {
      ok: report.steps.appApiSmoke.ok,
      status: report.steps.appApiSmoke.status,
      checkedProbes: report.steps.appApiSmoke.result?.checkedProbes || 0,
      errorCode: report.steps.appApiSmoke.errorCode,
    },
    reportJson: report.outputFiles.reportJson,
    reportMarkdown: report.outputFiles.reportMarkdown,
  }
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/run-aliyun-postdeploy-smoke.mjs --base-url https://api-cn.ipgongchang.xin [--out-dir /tmp/path]",
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
  if (args.allowedMissing.length > 0) {
    healthArgs.push("--allow-missing", args.allowedMissing.join(","))
  }
  const appApiArgs = [
    "--base-url",
    args.baseUrl,
    "--timeout-ms",
    String(args.timeoutMs),
  ]

  const remoteHealth = buildSmokeChildStep("remote_health", runNode("scripts/smoke-aliyun-remote.mjs", healthArgs))
  const appApiSmoke = buildSmokeChildStep("app_api_smoke", runNode("scripts/smoke-app-api-production-cn.mjs", appApiArgs))

  const outputFiles = {
    remoteHealth: resolve(args.outDir, "remote-health-smoke.json"),
    appApiSmoke: resolve(args.outDir, "app-api-smoke.json"),
    reportJson: resolve(args.outDir, "postdeploy-smoke.json"),
    reportMarkdown: resolve(args.outDir, "postdeploy-smoke.md"),
  }
  const report = buildPostdeploySmokeReport({
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    allowedMissing: args.allowedMissing,
    steps: {
      remoteHealth,
      appApiSmoke,
    },
    outputFiles,
  })

  assertNoSecretValues(report)
  writeJson(outputFiles.remoteHealth, report.steps.remoteHealth)
  writeJson(outputFiles.appApiSmoke, report.steps.appApiSmoke)
  writeJson(outputFiles.reportJson, report)
  writeMarkdown(outputFiles.reportMarkdown, report)
  console.log(JSON.stringify(buildPostdeployConsoleSummary(report, args.outDir), null, 2))
  if (!report.ok) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch {
    console.error("POSTDEPLOY_SMOKE_FAILED")
    process.exit(1)
  }
}
