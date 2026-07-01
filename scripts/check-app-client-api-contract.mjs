#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { APP_CLIENT_CONTRACT_ROUTES } from "./check-app-api-production-cn-routes.mjs"

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
  "/api/app/assets/sign-read",
  "/api/app/content-drafts",
  "/api/app/posters/",
  "/api/app/xhs/",
  "/api/app/private-copy/",
  "/api/app/knowledge-spaces",
  "/api/app/learning/progress",
  "/api/app/service-records/",
  "/api/app/voice-coach/",
]

const DEFERRED_PREFIXES = []

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

function findContentWorkflowRoutePlans(source) {
  const calls = []
  const marker = /CONTENT_WORKFLOW_ROUTE_PLANS\s*=\s*\{/g
  let match
  while ((match = marker.exec(source))) {
    const openIndex = source.indexOf("{", match.index)
    const closeIndex = findMatchingBrace(source, openIndex)
    if (closeIndex < 0) continue

    const objectText = source.slice(openIndex + 1, closeIndex)
    const planPattern =
      /([A-Za-z_$][\w$]*)\s*:\s*\{[\s\S]*?\baction\s*:\s*["']([^"']+)["'][\s\S]*?\bappEndpoint\s*:\s*["'](\/api\/app\/[^"']+)["'][\s\S]*?\bmethod\s*:\s*["']([A-Z]+)["'][\s\S]*?\}/g
    let planMatch
    while ((planMatch = planPattern.exec(objectText))) {
      const route = normalizeClientPath(planMatch[3])
      calls.push({
        action: planMatch[2],
        index: openIndex + planMatch.index,
        method: planMatch[4],
        route,
        text: planMatch[0],
      })
    }
    marker.lastIndex = closeIndex + 1
  }
  return calls
}

function findVoiceCoachRoutePlans(source) {
  const baseMatch = source.match(/const\s+VOICE_COACH_SESSIONS_PATH\s*=\s*["']([^"']+)["']/)
  if (!baseMatch || !source.includes("VOICE_COACH_API_ROUTES")) return []

  const baseRoute = normalizeClientPath(baseMatch[1])
  const normalized = normalizeAppContractRoute(baseRoute)
  if (!normalized || !normalized.route.endsWith("/voice-coach/sessions")) return []

  const index = source.indexOf("VOICE_COACH_API_ROUTES")
  const base = normalized.route
  const clientBase = normalized.clientRoute || baseRoute
  return [
    {
      action: "voiceCoach.sessions.list",
      method: "GET",
      route: base,
      clientRoute: clientBase,
    },
    {
      action: "voiceCoach.sessions.create",
      method: "POST",
      route: base,
      clientRoute: clientBase,
    },
    {
      action: "voiceCoach.sessions.detail",
      method: "GET",
      route: `${base}/[sessionId]`,
      clientRoute: `${clientBase}/[sessionId]`,
    },
    {
      action: "voiceCoach.sessions.events",
      method: "GET",
      route: `${base}/[sessionId]/events`,
      clientRoute: `${clientBase}/[sessionId]/events`,
    },
    {
      action: "voiceCoach.turns.tts",
      method: "POST",
      route: `${base}/[sessionId]/turns/[turnId]/tts`,
      clientRoute: `${clientBase}/[sessionId]/turns/[turnId]/tts`,
    },
    {
      action: "voiceCoach.asrPreview",
      method: "POST",
      route: `${base}/[sessionId]/asr-preview`,
      clientRoute: `${clientBase}/[sessionId]/asr-preview`,
    },
    {
      action: "voiceCoach.beauticianTurn.submit",
      method: "POST",
      route: `${base}/[sessionId]/beautician-turn/submit`,
      clientRoute: `${clientBase}/[sessionId]/beautician-turn/submit`,
    },
    {
      action: "voiceCoach.sessions.end",
      method: "POST",
      route: `${base}/[sessionId]/end`,
      clientRoute: `${clientBase}/[sessionId]/end`,
    },
    {
      action: "voiceCoach.report",
      method: "GET",
      route: `${base}/[sessionId]/report`,
      clientRoute: `${clientBase}/[sessionId]/report`,
    },
  ].map((item) => ({ ...item, index }))
}

function findMatchingBrace(source, openIndex) {
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
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
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

function normalizeAppContractRoute(route) {
  if (route.startsWith("/api/app/")) return { route, clientRoute: null }
  if (route === "/api/voice-coach" || route.startsWith("/api/voice-coach/")) {
    return {
      route: route.replace(/^\/api\/voice-coach\b/, "/api/app/voice-coach"),
      clientRoute: route,
    }
  }
  return null
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
      const normalized = normalizeAppContractRoute(normalizeClientPath(pathExpression.literal))
      if (!normalized) continue
      const classification = classifyRoute(normalized.route)
      calls.push({
        clientRoute: normalized.clientRoute,
        file: relative(appRoot, file),
        line: lineNumberAt(source, call.index),
        method: inferMethod(call.text),
        route: normalized.route,
        signature: routeSignature(normalized.route),
        status: classification.status,
        reason: classification.reason || null,
        source: normalized.clientRoute ? "legacyApiRequest" : "apiRequest",
      })
    }
    for (const plan of findContentWorkflowRoutePlans(source)) {
      const normalized = normalizeAppContractRoute(plan.route)
      if (!normalized) continue
      const classification = classifyRoute(normalized.route)
      calls.push({
        action: plan.action,
        clientRoute: normalized.clientRoute,
        file: relative(appRoot, file),
        line: lineNumberAt(source, plan.index),
        method: plan.method,
        route: normalized.route,
        signature: routeSignature(normalized.route),
        status: classification.status,
        reason: classification.reason || null,
        source: "contentWorkflowRoutePlan",
      })
    }
    for (const plan of findVoiceCoachRoutePlans(source)) {
      const classification = classifyRoute(plan.route)
      calls.push({
        action: plan.action,
        clientRoute: plan.clientRoute,
        file: relative(appRoot, file),
        line: lineNumberAt(source, plan.index),
        method: plan.method,
        route: plan.route,
        signature: routeSignature(plan.route),
        status: classification.status,
        reason: classification.reason || null,
        source: "voiceCoachRoutePlan",
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
  const backendRoutes = APP_CLIENT_CONTRACT_ROUTES.filter((route) => route.scope !== "health")
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
