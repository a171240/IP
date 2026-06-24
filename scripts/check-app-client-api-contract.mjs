#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { REQUIRED_ROUTES } from "./check-app-api-production-cn-routes.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const WORKSPACE_ROOT = resolve(BACKEND_ROOT, "../..")
const DEFAULT_APP_ROOT = resolve(WORKSPACE_ROOT, "meiye-huajing-app")

const AUDITED_PREFIXES = [
  "/api/app/auth/",
  "/api/app/profile",
  "/api/app/entitlements",
  "/api/app/store-admin/",
  "/api/app/store-profiles",
  "/api/app/customer-profiles",
  "/api/app/scene-cards",
  "/api/app/service-records/",
]

const DEFERRED_PREFIXES = [
  {
    prefix: "/api/app/knowledge-spaces",
    reason: "package-2 knowledge space template is outside production-cn first-version backend scope",
  },
  {
    prefix: "/api/app/assets/sign-read",
    reason: "package-2 signed media asset read is outside production-cn first-version backend scope",
  },
  {
    prefix: "/api/app/content-drafts",
    reason: "package-2 content drafts for poster/xhs/private copy are outside production-cn first-version backend scope",
  },
]

function parseArgs(argv) {
  const args = {
    appRoot: DEFAULT_APP_ROOT,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--app-root") {
      args.appRoot = resolveValue(argv[++index], "--app-root")
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
  if (!value) throw new Error(`missing_value:${name}`)
  return resolve(process.cwd(), value)
}

function printHelp() {
  console.log(`Usage: node scripts/check-app-client-api-contract.mjs [--app-root ../meiye-huajing-app]

Checks the React Native APP client apiRequest(...) calls against the backend
production-cn /api/app route list. Deferred API groups are reported but do not
block the first production-cn scope.`)
}

function listSourceFiles(root) {
  const apiRoot = resolve(root, "src/api")
  if (!existsSync(apiRoot)) return []
  const files = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const absolute = resolve(dir, entry)
      const stats = statSync(absolute)
      if (stats.isDirectory()) {
        visit(absolute)
        continue
      }
      if ([".ts", ".tsx"].includes(extname(absolute))) files.push(absolute)
    }
  }
  visit(apiRoot)
  return files.sort()
}

function findApiRequestCalls(source) {
  const calls = []
  const marker = /apiRequest(?:<[^>]+>)?\s*\(/g
  let match
  while ((match = marker.exec(source))) {
    const openIndex = source.indexOf("(", match.index)
    const closeIndex = findMatchingParen(source, openIndex)
    if (closeIndex < 0) continue
    calls.push({
      text: source.slice(openIndex + 1, closeIndex),
      index: match.index,
    })
    marker.lastIndex = closeIndex + 1
  }
  return calls
}

function findMatchingParen(source, openIndex) {
  let depth = 0
  let quote = ""
  let escaped = false
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === quote) quote = ""
      continue
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char
      continue
    }
    if (char === "(") depth += 1
    if (char === ")") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length
}

function extractPathExpression(callText) {
  const trimmed = callText.trimStart()
  const quote = trimmed[0]
  if (!["\"", "'", "`"].includes(quote)) return null
  let escaped = false
  for (let index = 1; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === quote) {
      return {
        raw: trimmed.slice(0, index + 1),
        literal: trimmed.slice(1, index),
      }
    }
  }
  return null
}

function inferMethod(callText) {
  const explicit = callText.match(/\bmethod\s*:\s*["']([A-Z]+)["']/)
  if (explicit) return explicit[1]
  return /\bbody\s*:/.test(callText) ? "POST" : "GET"
}

function normalizeClientPath(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  const route = text.replace(/\$\{([^}]+)\}/g, (_, expression) => {
    const expr = String(expression || "")
    const encoded = expr.match(/encodeURIComponent\s*\(\s*([A-Za-z_$][\w$]*)/)
    const direct = expr.match(/^\s*([A-Za-z_$][\w$]*)\s*$/)
    const name = encoded?.[1] || direct?.[1] || "param"
    return `[${name}]`
  })
  return route.replace(/\/+/g, "/")
}

function routeSignature(route) {
  return String(route)
    .split("/")
    .map((part) => {
      if (!part) return ""
      if (/^\[[^\]]+\]$/.test(part) || /^:[A-Za-z0-9_]+$/.test(part)) return "[]"
      return part
    })
    .join("/")
}

function classifyRoute(route) {
  const deferred = DEFERRED_PREFIXES.find((item) => route === item.prefix || route.startsWith(`${item.prefix}/`))
  if (deferred) return { status: "deferred", reason: deferred.reason }
  if (AUDITED_PREFIXES.some((prefix) => route === prefix.replace(/\/$/, "") || route.startsWith(prefix))) {
    return { status: "audited" }
  }
  return { status: "unclassified" }
}

function extractClientCalls(appRoot) {
  const files = listSourceFiles(appRoot)
  const calls = []
  for (const file of files) {
    const source = readFileSync(file, "utf8")
    for (const call of findApiRequestCalls(source)) {
      const pathExpression = extractPathExpression(call.text)
      if (!pathExpression) continue
      const route = normalizeClientPath(pathExpression.literal)
      if (!route.startsWith("/api/app/")) continue
      const classification = classifyRoute(route)
      calls.push({
        file: relative(appRoot, file),
        line: lineNumberAt(source, call.index),
        method: inferMethod(call.text),
        route,
        signature: routeSignature(route),
        status: classification.status,
        reason: classification.reason || null,
      })
    }
  }
  return { files, calls }
}

function summarizeScopes(items) {
  const scopes = new Map()
  for (const item of items) {
    scopes.set(item.scope, (scopes.get(item.scope) || 0) + 1)
  }
  return Object.fromEntries([...scopes.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function uniqueBy(items, keyFn) {
  const seen = new Set()
  const unique = []
  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}

function main() {
  const args = parseArgs(process.argv)
  const appSrcApi = resolve(args.appRoot, "src/api")
  const backendRoutes = REQUIRED_ROUTES.filter((route) => route.scope !== "health")
  const backendBySignature = new Map(backendRoutes.map((route) => [routeSignature(route.route), route]))
  const failures = {
    missingBackendRoutes: [],
    methodMismatches: [],
    unclassifiedRoutes: [],
  }

  const { files, calls } = extractClientCalls(args.appRoot)
  const auditedCalls = calls.filter((call) => call.status === "audited")
  const deferredCalls = calls.filter((call) => call.status === "deferred")
  const unclassifiedCalls = calls.filter((call) => call.status === "unclassified")

  for (const call of uniqueBy(auditedCalls, (item) => `${item.method} ${item.signature}`)) {
    const backendRoute = backendBySignature.get(call.signature)
    if (!backendRoute) {
      failures.missingBackendRoutes.push(call)
      continue
    }
    if (!backendRoute.methods.includes(call.method)) {
      failures.methodMismatches.push({
        ...call,
        backendRoute: backendRoute.route,
        backendMethods: backendRoute.methods,
      })
    }
  }

  failures.unclassifiedRoutes = uniqueBy(unclassifiedCalls, (item) => `${item.method} ${item.signature}`)

  const matchedBackendRoutes = auditedCalls
    .map((call) => backendBySignature.get(call.signature))
    .filter(Boolean)

  const result = {
    ok:
      failures.missingBackendRoutes.length === 0 &&
      failures.methodMismatches.length === 0 &&
      failures.unclassifiedRoutes.length === 0,
    appRoot: args.appRoot,
    appSrcApiExists: existsSync(appSrcApi),
    scannedFiles: files.length,
    clientApiCalls: calls.length,
    auditedClientApiCalls: auditedCalls.length,
    uniqueAuditedClientRoutes: uniqueBy(auditedCalls, (item) => `${item.method} ${item.signature}`).length,
    deferredClientApiCalls: deferredCalls.length,
    matchedBackendRoutes: uniqueBy(matchedBackendRoutes, (item) => item.route).length,
    scopes: summarizeScopes(uniqueBy(matchedBackendRoutes, (item) => item.route)),
    failures,
    deferredRoutes: uniqueBy(deferredCalls, (item) => `${item.method} ${item.signature}`).map((call) => ({
      method: call.method,
      route: call.route,
      file: call.file,
      line: call.line,
      reason: call.reason,
    })),
  }

  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
