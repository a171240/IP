#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const READ_ONLY_SWITCH_ENV = "APP_READ_ONLY_LIVE_SMOKE"
const L3_PERMISSION_SWITCH_ENV = "APP_L3_PERMISSION_SMOKE"
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
    description: "employee or unbound test token for profile, content, learning, knowledge, voiceCoach, and service-record reads",
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
    id: "employee_poster_templates",
    scope: "content-poster",
    role: "employee",
    method: "GET",
    path: "/api/app/posters/templates",
    description: "poster template list for content tab",
  },
  {
    id: "employee_poster_history",
    scope: "content-poster",
    role: "employee",
    method: "GET",
    path: "/api/app/posters/history",
    description: "poster history list for content tab",
  },
  {
    id: "employee_xhs_drafts",
    scope: "content-xhs",
    role: "employee",
    method: "GET",
    path: "/api/app/xhs/drafts",
    description: "XHS draft list for content tab",
  },
  {
    id: "employee_private_copy_drafts",
    scope: "content-private-copy",
    role: "employee",
    method: "GET",
    path: "/api/app/private-copy/drafts",
    description: "private-copy draft list for content tab",
  },
  {
    id: "employee_learning_progress",
    scope: "learning-progress",
    role: "employee",
    method: "GET",
    path: "/api/app/learning/progress?modules=professional,speech&include_entities=true",
    description: "professional and speech learning progress payload",
  },
  {
    id: "employee_voice_coach_sessions",
    scope: "voice-coach",
    role: "employee",
    method: "GET",
    path: "/api/app/voice-coach/sessions?limit=5",
    description: "voiceCoach session list read boundary",
  },
  {
    id: "employee_customer_profiles",
    scope: "context",
    role: "employee",
    method: "GET",
    path: "/api/app/customer-profiles?limit=5",
    description: "tenant-scoped customer profile list",
  },
  {
    id: "employee_scene_cards",
    scope: "context",
    role: "employee",
    method: "GET",
    path: "/api/app/scene-cards?limit=5",
    description: "tenant-scoped scene card list",
  },
  {
    id: "employee_store_profiles",
    scope: "context",
    role: "employee",
    method: "GET",
    path: "/api/app/store-profiles?limit=5",
    description: "tenant-scoped store profile list with employee token",
  },
  {
    id: "employee_knowledge_spaces",
    scope: "knowledge-spaces",
    role: "employee",
    method: "GET",
    path: "/api/app/knowledge-spaces",
    description: "knowledge space list for Manbeilian tab",
  },
  {
    id: "manager_profile",
    scope: "account",
    role: "manager",
    method: "GET",
    path: "/api/app/profile",
    description: "manager profile, tenant, and role payload",
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

const L3_PERMISSION_VARIABLES = [
  {
    name: "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    kind: "opaque_id",
    required: true,
    description: "same-store service-record session id selected from the manager list probe for L3 detail positive/negative checks",
  },
  {
    name: "APP_CROSS_STORE_SESSION_ID_READONLY",
    kind: "opaque_id",
    required: true,
    description: "cross-store service-record session id required for tenant isolation negative check",
  },
  {
    name: "APP_CROSS_STORE_MANAGER_TOKEN",
    kind: "secret_token",
    required: false,
    description: "optional manager token from another store; omitted runs the cross-store id against APP_MANAGER_TOKEN",
  },
]

const L3_PERMISSION_PROBES = [
  {
    id: "manager_service_records_list_positive",
    scope: "l3-permission",
    role: "manager",
    method: "GET",
    path: "/api/app/store-admin/service-records?limit=5",
    containsSessionEnvName: "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    expectedStatuses: [200],
    description: "manager can read same-store service-record list containing the selected detail id",
  },
  {
    id: "manager_service_record_detail_positive",
    scope: "l3-permission",
    role: "manager",
    method: "GET",
    path: "/api/app/service-records/sessions/$APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    pathEnvName: "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    expectedStatuses: [200],
    description: "manager can read same-store service-record detail selected from the list",
  },
  {
    id: "employee_store_admin_records_negative",
    scope: "l3-permission",
    role: "employee",
    method: "GET",
    path: "/api/app/store-admin/service-records?limit=5",
    expectedStatuses: [403],
    negativePermissionProbe: true,
    description: "employee must not read manager store-admin service-record list",
  },
  {
    id: "employee_manager_record_detail_negative",
    scope: "l3-permission",
    role: "employee",
    method: "GET",
    path: "/api/app/service-records/sessions/$APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    pathEnvName: "APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY",
    expectedStatuses: [403, 404],
    negativePermissionProbe: true,
    description: "employee must not read the manager-selected service-record detail",
  },
  {
    id: "cross_store_record_isolation_negative",
    scope: "l3-permission",
    role: "cross_store_manager",
    method: "GET",
    path: "/api/app/service-records/sessions/$APP_CROSS_STORE_SESSION_ID_READONLY",
    pathEnvName: "APP_CROSS_STORE_SESSION_ID_READONLY",
    expectedStatuses: [403, 404],
    negativePermissionProbe: true,
    optionalInputBlocker: "BLOCKED_CROSS_STORE_INPUT",
    description: "cross-store record must be denied or hidden and must not return session data",
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
    executeL3Permission: false,
    executeReadOnly: false,
    onlineBoundaryReport: null,
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
    if (arg === "--execute-l3-permission") {
      args.executeL3Permission = true
      continue
    }
    if (arg === "--online-boundary-report") {
      args.onlineBoundaryReport = resolveRawValue(argv[++index], "--online-boundary-report")
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
  if (item.kind === "opaque_id") return validateOpaqueId(value)
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

function validateOpaqueId(value) {
  if (value.length < 3) return { status: "invalid", reason: "id_too_short" }
  if (/\s/.test(value)) return { status: "invalid", reason: "id_contains_space" }
  return { status: "ready" }
}

function isReadOnlySwitchEnabled(env, args) {
  return args.executeReadOnly || String(env[READ_ONLY_SWITCH_ENV] || "").trim().toLowerCase() === "true"
}

function isL3PermissionSwitchEnabled(env, args) {
  return args.executeL3Permission || String(env[L3_PERMISSION_SWITCH_ENV] || "").trim().toLowerCase() === "true"
}

function buildReport(env, args) {
  let baseUrl = null
  const onlineBoundary = validateOnlineBoundaryReport(args.onlineBoundaryReport)
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
  const l3PermissionSwitchEnabled = isL3PermissionSwitchEnabled(env, args)
  const l3PermissionInputs = validateL3PermissionInputs(env, args)
  const baseExecutionBlockers = [
    ...envBlockers,
    ...onlineBoundary.executionBlockers,
  ]
  const executionBlockers = [
    ...baseExecutionBlockers,
    ...(readOnlySwitchEnabled ? [] : [`${READ_ONLY_SWITCH_ENV}:missing_or_false`]),
  ]
  const canExecuteReadOnly = liveSmokeEnvReady && readOnlySwitchEnabled && onlineBoundary.ready
  const l3ExecutionBlockers = [
    ...baseExecutionBlockers,
    ...(l3PermissionSwitchEnabled ? [] : [`${L3_PERMISSION_SWITCH_ENV}:missing_or_false`]),
    ...l3PermissionInputs.blockers,
  ]
  const canExecuteL3Permission = liveSmokeEnvReady
    && onlineBoundary.ready
    && l3PermissionSwitchEnabled
    && l3PermissionInputs.ready
  const mode = canExecuteReadOnly && canExecuteL3Permission
    ? "read_only_and_l3_permission_execute_pending"
    : canExecuteL3Permission
      ? "l3_permission_execute_pending"
      : canExecuteReadOnly
        ? "read_only_execute_pending"
        : "plan_only"

  return {
    ok: false,
    mode,
    networkRequestsAttempted: false,
    liveSmokeEnvReady,
    readOnlySwitchEnabled,
    l3PermissionSwitchEnabled,
    readOnlyExecutionReady: canExecuteReadOnly,
    l3PermissionExecutionReady: canExecuteL3Permission,
    required,
    blockers: envBlockers,
    executionBlockers,
    onlineBoundary,
    policy: {
      noSecretValuesPrinted: true,
      envFileRead: false,
      onlyGetRequests: true,
      baseUrlMustUseHttps: !args.allowLocal,
      localHostsRejectedByDefault: !args.allowLocal,
      readOnlySmokeRequires: `${READ_ONLY_SWITCH_ENV}=true or --execute-read-only`,
      onlineBoundaryRequires: "--online-boundary-report with ok=true, routeBlockers=[], and 404=0",
      mutatingSmokeAuthorizedHere: false,
    },
    readOnlySmoke: {
      baseUrl: baseUrl ? publicBaseUrl(baseUrl) : null,
      ready: canExecuteReadOnly,
      probes: READ_ONLY_PROBES.map(publicProbe),
      command: "APP_READ_ONLY_LIVE_SMOKE=true node scripts/check-app-api-live-smoke-env.mjs --online-boundary-report <online-readonly-boundary.json>",
      alternativeCommand: "node scripts/check-app-api-live-smoke-env.mjs --execute-read-only --online-boundary-report <online-readonly-boundary.json>",
    },
    l3PermissionSmoke: {
      status: canExecuteL3Permission ? "ready_to_execute" : "plan_only",
      ready: canExecuteL3Permission,
      executed: false,
      l3PermissionPass: false,
      requires: `${L3_PERMISSION_SWITCH_ENV}=true or --execute-l3-permission`,
      expectedEvidenceStatus: "L3_PERMISSION_SMOKE_EXECUTED",
      planReference: "docs/app-l3-permission-smoke-plan-2026-07-02.md",
      requiredInputs: l3PermissionInputs.publicInputs,
      executionBlockers: l3ExecutionBlockers,
      blockedOutcomes: [
        "BLOCKED_NO_MANAGER_RECORD_ID",
        "BLOCKED_CROSS_STORE_INPUT",
      ],
      probes: L3_PERMISSION_PROBES.map(publicProbe),
      command: "APP_L3_PERMISSION_SMOKE=true node scripts/check-app-api-live-smoke-env.mjs --online-boundary-report <online-readonly-boundary.json>",
      alternativeCommand: "node scripts/check-app-api-live-smoke-env.mjs --execute-l3-permission --online-boundary-report <online-readonly-boundary.json>",
    },
    skippedMutatingEndpoints: SKIPPED_MUTATING_ENDPOINTS,
  }
}

function validateL3PermissionInputs(env, args) {
  const publicInputs = L3_PERMISSION_VARIABLES.map((item) => {
    const validation = validateValue(item, env[item.name], args)
    return {
      name: item.name,
      required: item.required === true,
      description: item.description,
      status: validation.status,
      reason: validation.reason || null,
      value: item.kind === "secret_token" || item.kind === "opaque_id"
        ? "redacted"
        : validation.status === "ready" ? "present" : "redacted",
    }
  })
  const blockers = publicInputs
    .filter((item) => item.required && item.status !== "ready")
    .map((item) => `${item.name}:${item.status}${item.reason ? `:${item.reason}` : ""}`)
  return {
    ready: blockers.length === 0,
    blockers,
    publicInputs,
  }
}

function validateOnlineBoundaryReport(filePath) {
  if (!filePath) {
    return {
      ready: false,
      status: "missing",
      path: null,
      executionBlockers: ["APP_ONLINE_BOUNDARY_REPORT:missing"],
      requiredForExecution: true,
    }
  }

  let report
  try {
    report = JSON.parse(readFileSync(filePath, "utf8"))
  } catch (error) {
    return {
      ready: false,
      status: "invalid",
      path: filePath,
      reason: error instanceof Error ? error.message : String(error),
      executionBlockers: ["APP_ONLINE_BOUNDARY_REPORT:invalid"],
      requiredForExecution: true,
    }
  }

  const grouped404 = Number(report?.grouped?.["404"] || 0)
  const routeBlockers = Array.isArray(report?.routeBlockers) ? report.routeBlockers : []
  const blockers = []
  if (report?.ok !== true) blockers.push("ok_not_true")
  if (routeBlockers.length > 0) blockers.push("route_blockers_not_empty")
  if (grouped404 !== 0) blockers.push("http_404_not_zero")

  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "blocked",
    path: filePath,
    ok: report?.ok === true,
    checked: Number(report?.checked || 0),
    grouped404,
    routeBlockers: routeBlockers.map((item) => ({
      id: item.id || "",
      path: item.path || "",
      status: item.status || null,
      contentType: item.contentType || "",
    })),
    executionBlockers: blockers.map((item) => `APP_ONLINE_BOUNDARY_REPORT:${item}`),
    requiredForExecution: true,
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
    expectedStatuses: probe.expectedStatuses || null,
    negativePermissionProbe: probe.negativePermissionProbe === true,
    containsSessionEnvName: probe.containsSessionEnvName || null,
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

async function runL3PermissionSmoke(baseUrl, env, args) {
  const startedAt = new Date().toISOString()
  const probes = []
  for (const probe of L3_PERMISSION_PROBES) {
    const resolved = resolveProbeForEnv(probe, env)
    if (resolved.blocked) {
      probes.push({
        ...publicProbe(probe),
        ok: false,
        status: null,
        code: resolved.blocked,
        json: false,
        bodyType: null,
        bodyHasSession: false,
        durationMs: 0,
        blocked: true,
      })
      continue
    }
    probes.push(await requestProbe(baseUrl, resolved.probe, env, args.timeoutMs))
  }
  const bodyHasSessionForNegativeProbes = probes
    .filter((probe) => probe.negativePermissionProbe === true)
    .some((probe) => probe.bodyHasSession === true)
  const ok = probes.every((probe) => probe.ok) && !bodyHasSessionForNegativeProbes
  return {
    ok,
    status: ok ? "L3_PERMISSION_SMOKE_EXECUTED" : "L3_PERMISSION_SMOKE_INCOMPLETE",
    startedAt,
    finishedAt: new Date().toISOString(),
    baseUrl: publicBaseUrl(baseUrl),
    checkedProbes: probes.length,
    probes,
    bodyHasSessionForNegativeProbes,
  }
}

function resolveProbeForEnv(probe, env) {
  if (!probe.pathEnvName) return { probe }
  const rawValue = String(env[probe.pathEnvName] || "").trim()
  if (!rawValue) {
    return {
      blocked: probe.optionalInputBlocker || "BLOCKED_NO_MANAGER_RECORD_ID",
    }
  }
  return {
    probe: {
      ...probe,
      actualPath: probe.path.replace(`$${probe.pathEnvName}`, encodeURIComponent(rawValue)),
    },
  }
}

async function requestProbe(baseUrl, probe, env, timeoutMs) {
  const started = Date.now()
  const token = tokenForRole(probe.role, env)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(new URL(probe.actualPath || probe.path, `${baseUrl}/`).toString(), {
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
    const bodyContainsExpectedSession = probe.containsSessionEnvName
      ? bodyInfo.sessionIds.includes(String(env[probe.containsSessionEnvName] || "").trim())
      : null
    const statusOk = Array.isArray(probe.expectedStatuses)
      ? probe.expectedStatuses.includes(response.status)
      : response.status >= 200 && response.status < 300
    const ok = statusOk
      && !(probe.negativePermissionProbe === true && bodyInfo.bodyHasSession)
      && !(probe.containsSessionEnvName && bodyContainsExpectedSession !== true)

    return {
      ...publicProbe(probe),
      ok,
      status: response.status,
      code: bodyInfo.code,
      json: bodyInfo.json,
      bodyType: bodyInfo.bodyType,
      bodyHasSession: bodyInfo.bodyHasSession,
      bodyContainsExpectedSession,
      negativePermissionProbe: probe.negativePermissionProbe === true,
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
      bodyHasSession: false,
      bodyContainsExpectedSession: null,
      negativePermissionProbe: probe.negativePermissionProbe === true,
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
  if (role === "cross_store_manager") {
    return String(env.APP_CROSS_STORE_MANAGER_TOKEN || env.APP_MANAGER_TOKEN || "")
  }
  throw new Error(`unknown_probe_role:${role}`)
}

function parseJsonBodyInfo(text, probe) {
  if (!text.trim()) {
    return { json: false, bodyType: "empty", code: "", bodyHasSession: false, sessionIds: [] }
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
    bodyHasSession: hasSessionPayload(body),
    sessionIds: extractSessionIds(body),
  }
}

function hasSessionPayload(body) {
  if (!body || typeof body !== "object") return false
  if (Array.isArray(body)) return body.some((item) => hasSessionPayload(item))
  if (Object.prototype.hasOwnProperty.call(body, "session")) return body.session != null
  if (Array.isArray(body.sessions) && body.sessions.length > 0) return true
  for (const key of ["session_id", "sessionId", "client_session_id", "clientSessionId"]) {
    if (typeof body[key] === "string" && body[key].length > 0) return true
  }
  return Object.values(body).some((value) => hasSessionPayload(value))
}

function extractSessionIds(body) {
  const ids = new Set()
  collectSessionIds(body, ids)
  return [...ids]
}

function collectSessionIds(value, ids) {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) collectSessionIds(item, ids)
    return
  }
  for (const key of ["id", "session_id", "sessionId", "client_session_id", "clientSessionId"]) {
    if (typeof value[key] === "string" && value[key].trim()) ids.add(value[key].trim())
  }
  for (const child of Object.values(value)) collectSessionIds(child, ids)
}

function assertResponseDoesNotContainInputSecrets(text, env, probe) {
  for (const name of ["APP_EMPLOYEE_TOKEN", "APP_MANAGER_TOKEN", "APP_CROSS_STORE_MANAGER_TOKEN"]) {
    const secret = String(env[name] || "")
    if (secret.length >= 8 && text.includes(secret)) {
      throw new Error(`probe_response_echoed_input_secret:${probe.method}:${probe.path}:${name}`)
    }
  }
}

function redactSensitiveText(text, env) {
  let redacted = String(text || "")
  for (const name of ["APP_EMPLOYEE_TOKEN", "APP_MANAGER_TOKEN", "APP_CROSS_STORE_MANAGER_TOKEN"]) {
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
    "  node scripts/check-app-api-live-smoke-env.mjs --execute-l3-permission",
    "  node scripts/check-app-api-live-smoke-env.mjs --execute-read-only --online-boundary-report /tmp/app-api-online-readonly-boundary.json",
    "",
    "Required environment variables:",
    "  APP_BASE_URL",
    "  APP_DEVICE_ID",
    "  APP_EMPLOYEE_TOKEN",
    "  APP_MANAGER_TOKEN",
    "  APP_MANAGER_SERVICE_RECORD_SESSION_ID_READONLY (L3 only)",
    "  APP_CROSS_STORE_SESSION_ID_READONLY (L3 cross-store negative)",
    "  APP_CROSS_STORE_MANAGER_TOKEN (optional L3 cross-store role)",
    "",
    "Safety:",
    "  The default mode prints missing prerequisites and a read-only plan only.",
    "  Read-only network requests run only when the env is complete, APP_READ_ONLY_LIVE_SMOKE=true or --execute-read-only is set, and online boundary report is 404-free.",
    "  L3 permission probes additionally require APP_L3_PERMISSION_SMOKE=true or --execute-l3-permission plus manager-selected and cross-store session ids.",
    "  The live smoke uses GET probes only and never prints token values or response bodies.",
  ].join("\n"))
}

async function main() {
  try {
    const args = parseArgs(process.argv)
    const report = buildReport(process.env, args)
    if (report.readOnlyExecutionReady || report.l3PermissionExecutionReady) {
      const baseUrl = validateBaseUrl(String(process.env.APP_BASE_URL || ""), args).baseUrl
      const smoke = report.readOnlyExecutionReady
        ? await runReadOnlySmoke(baseUrl, process.env, args)
        : null
      const l3Smoke = report.l3PermissionExecutionReady
        ? await runL3PermissionSmoke(baseUrl, process.env, args)
        : null
      const mode = smoke && l3Smoke
        ? "read_only_and_l3_permission_executed"
        : l3Smoke
          ? "l3_permission_executed"
          : "read_only_executed"
      const result = {
        ...report,
        ok: (smoke ? smoke.ok : true) && (l3Smoke ? l3Smoke.ok : true),
        mode,
        networkRequestsAttempted: true,
        readOnlySmoke: {
          ...report.readOnlySmoke,
          result: smoke,
        },
        l3PermissionSmoke: {
          ...report.l3PermissionSmoke,
          executed: Boolean(l3Smoke),
          l3PermissionPass: Boolean(l3Smoke?.ok),
          result: l3Smoke,
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
  L3_PERMISSION_PROBES,
  L3_PERMISSION_VARIABLES,
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
