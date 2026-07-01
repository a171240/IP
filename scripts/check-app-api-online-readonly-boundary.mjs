#!/usr/bin/env node

import { pathToFileURL } from "node:url"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { APP_CLIENT_CONTRACT_ROUTES } from "./check-app-api-production-cn-routes.mjs"
import { READ_ONLY_PROBES } from "./check-app-api-live-smoke-env.mjs"

const DEFAULT_BASE_URL = "https://api-cn.ipgongchang.xin"
const DEFAULT_TIMEOUT_MS = 12_000
const HEALTH_PROBES = [
  {
    id: "healthz",
    scope: "health",
    method: "GET",
    path: "/api/healthz",
    description: "production-cn health endpoint",
  },
  {
    id: "app_health",
    scope: "health",
    method: "GET",
    path: "/api/app/health",
    description: "production-cn App API health endpoint",
  },
]

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--base-url") {
      args.baseUrl = normalizeBaseUrl(argv[++index], "--base-url")
      continue
    }
    if (arg === "--timeout-ms") {
      const value = Number(argv[++index])
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

function normalizeBaseUrl(rawValue, name) {
  const value = String(rawValue || "").trim()
  if (!value) throw new Error(`missing_value:${name}`)
  const url = new URL(value)
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("online_readonly_boundary_requires_https")
  }
  url.hash = ""
  url.search = ""
  url.pathname = url.pathname.replace(/\/+$/, "")
  return url.toString().replace(/\/+$/, "")
}

function publicProbe(probe) {
  return {
    id: probe.id,
    scope: probe.scope,
    method: probe.method,
    path: probe.path,
    description: probe.description,
  }
}

async function runOnlineReadonlyBoundary(args) {
  const probes = [...HEALTH_PROBES, ...READ_ONLY_PROBES].map(publicProbe)
  const results = []

  for (const probe of probes) {
    if (probe.method !== "GET") {
      throw new Error(`non_get_probe_not_allowed:${probe.id}`)
    }
    results.push(await requestProbe(args.baseUrl, probe, args.timeoutMs))
  }

  const enrichedResults = results.map((result) => ({
    ...result,
    localRoute: findLocalRoute(result),
  }))
  const grouped = summarizeByStatus(results)
  const routeBlockers = enrichedResults.filter((result) => {
    if (result.scope === "health") return result.status == null || result.status >= 500
    return result.status == null || result.status === 404 || result.status >= 500
  })
  const sourceRouteAudit = summarizeSourceRouteAudit(enrichedResults)

  return {
    ok: routeBlockers.length === 0 && sourceRouteAudit.missingSourceRoutes.length === 0,
    baseUrl: args.baseUrl,
    getOnly: true,
    tokenSent: false,
    requestBodySent: false,
    networkRequestsAttempted: true,
    checked: results.length,
    routeBlockers: routeBlockers.map(({ id, scope, path, status, code, contentType, error, localRoute }) => ({
      id,
      scope,
      path,
      status,
      code,
      contentType,
      error,
      localRoute,
    })),
    sourceRouteAudit,
    grouped,
    results: enrichedResults,
  }
}

function findLocalRoute(probe) {
  const pathname = pathnameOf(probe.path)
  const route = APP_CLIENT_CONTRACT_ROUTES.find((item) => {
    return item.methods.includes(probe.method) && routePattern(item.route).test(pathname)
  })
  if (!route) {
    return {
      status: "SOURCE_ROUTE_MISSING",
      route: "",
      file: "",
      sourcePresent: false,
    }
  }

  const sourcePresent = existsSync(resolve(process.cwd(), route.file))
  return {
    status: sourcePresent ? "SOURCE_ROUTE_PRESENT" : "SOURCE_ROUTE_FILE_MISSING",
    route: route.route,
    file: route.file,
    sourcePresent,
  }
}

function summarizeSourceRouteAudit(results) {
  const missingSourceRoutes = []
  const deployed404WithSourcePresent = []

  for (const result of results) {
    if (!result.localRoute.sourcePresent) {
      missingSourceRoutes.push({
        id: result.id,
        method: result.method,
        path: result.path,
        status: result.localRoute.status,
        route: result.localRoute.route,
        file: result.localRoute.file,
      })
      continue
    }
    if (result.status === 404) {
      deployed404WithSourcePresent.push({
        id: result.id,
        method: result.method,
        path: result.path,
        file: result.localRoute.file,
      })
    }
  }

  return {
    checked: results.length,
    missingSourceRoutes,
    deployed404WithSourcePresent,
    localSourceReadyForBlocked404: missingSourceRoutes.length === 0 && deployed404WithSourcePresent.length > 0,
    note: "SOURCE_ROUTE_PRESENT plus deployed 404 means the local source contains the route, but the current online artifact does not serve it.",
  }
}

function pathnameOf(path) {
  return new URL(path, "https://local.invalid").pathname
}

function routePattern(route) {
  const pattern = route
    .split("/")
    .map((part) => {
      if (!part) return ""
      if (/^\[[^\]]+\]$/.test(part)) return "[^/]+"
      return escapeRegex(part)
    })
    .join("/")
  return new RegExp(`^${pattern}$`)
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function requestProbe(baseUrl, probe, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()

  try {
    const response = await fetch(new URL(probe.path, `${baseUrl}/`).toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "x-device-id": "codex-readonly-route-boundary",
        "x-app-live-smoke": "online-readonly-boundary",
      },
    })
    const text = await response.text()
    const bodyInfo = parseBodyInfo(text)
    return {
      ...probe,
      status: response.status,
      code: bodyInfo.code,
      contentType: String(response.headers.get("content-type") || "").split(";")[0],
      json: bodyInfo.json,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return {
      ...probe,
      status: null,
      code: "",
      contentType: "",
      json: false,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.name : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function parseBodyInfo(text) {
  if (!String(text || "").trim()) return { json: false, code: "" }
  try {
    const body = JSON.parse(text)
    const code = body && typeof body === "object" && !Array.isArray(body)
      ? String(body.code || body.error || body.status || "")
      : ""
    return { json: true, code }
  } catch {
    return { json: false, code: "" }
  }
}

function summarizeByStatus(results) {
  const grouped = new Map()
  for (const result of results) {
    const key = result.status == null ? `ERROR:${result.error || "unknown"}` : String(result.status)
    grouped.set(key, (grouped.get(key) || 0) + 1)
  }
  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-api-online-readonly-boundary.mjs",
    "  node scripts/check-app-api-online-readonly-boundary.mjs --base-url https://api-cn.ipgongchang.xin",
    "",
    "Safety:",
    "  Sends GET requests only.",
    "  Sends no token and no request body.",
    "  Treats 404 and 5xx on App route probes as deployed-boundary blockers.",
  ].join("\n"))
}

async function main() {
  try {
    const report = await runOnlineReadonlyBoundary(parseArgs(process.argv))
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      getOnly: true,
      tokenSent: false,
      requestBodySent: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

export {
  HEALTH_PROBES,
  findLocalRoute,
  parseArgs,
  runOnlineReadonlyBoundary,
  summarizeSourceRouteAudit,
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
