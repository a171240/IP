#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { REQUIRED_ROUTES } from "./check-app-api-production-cn-routes.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_MAP_FILE = resolve(BACKEND_ROOT, "deploy/app-api-production-cn.bridge-map.json")
const ALLOWED_SOURCE_TYPES = new Set([
  "native_health",
  "app_native",
  "app_alias",
  "mp_reexport",
  "mp_adapter",
])

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
]

function parseArgs(argv) {
  const args = {
    mapFile: DEFAULT_MAP_FILE,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--map") {
      args.mapFile = resolveValue(argv[++index], "--map")
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
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function resolveProjectPath(filePath) {
  return isAbsolute(filePath) ? filePath : resolve(BACKEND_ROOT, filePath)
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function sortedMethods(methods) {
  return normalizeArray(methods).map((method) => String(method).toUpperCase()).sort()
}

function sameMethods(left, right) {
  const a = sortedMethods(left)
  const b = sortedMethods(right)
  return a.length === b.length && a.every((method, index) => method === b[index])
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function importSpecifier(filePath) {
  return `@/${String(filePath).replace(/\.ts$/, "")}`
}

function readText(filePath) {
  return readFileSync(resolveProjectPath(filePath), "utf8")
}

function referencesSourceFile(appSource, sourceFile) {
  const specifier = importSpecifier(sourceFile)
  return new RegExp(`from\\s+["']${escapeRegex(specifier)}["']`).test(appSource)
}

function hasDirectReexport(appSource, sourceFile) {
  const specifier = importSpecifier(sourceFile)
  return new RegExp(`export\\s*\\{[\\s\\S]*?\\}\\s*from\\s+["']${escapeRegex(specifier)}["']`).test(appSource)
}

function hasImportAdapter(appSource, sourceFile) {
  const specifier = importSpecifier(sourceFile)
  return new RegExp(`import\\s+[\\s\\S]*?\\s+from\\s+["']${escapeRegex(specifier)}["']`).test(appSource)
}

function assertNoSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    assertNoSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function countBy(items, key) {
  const counts = new Map()
  for (const item of items) {
    const value = String(item[key] || "unknown")
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function validateTopLevel(map, failures) {
  if (map.schemaVersion !== 1) failures.push({ path: "$.schemaVersion", error: "schema_version_must_be_1" })
  if (map.environment !== "production-cn") failures.push({ path: "$.environment", error: "environment_must_be_production_cn" })
  if (map.containsValues !== false) failures.push({ path: "$.containsValues", error: "contains_values_must_be_false" })

  const sourceDocs = normalizeArray(map.sourceDocs)
  if (!sourceDocs.length) failures.push({ path: "$.sourceDocs", error: "missing_source_docs" })
  for (const sourceDoc of sourceDocs) {
    if (!existsSync(resolveProjectPath(sourceDoc))) {
      failures.push({ path: "$.sourceDocs", value: sourceDoc, error: "source_doc_not_found" })
    }
  }

  const wechatRule = map.rules?.wechatAppLogin || {}
  if (wechatRule.miniProgramCredentialReuse !== false) {
    failures.push({ path: "$.rules.wechatAppLogin.miniProgramCredentialReuse", error: "wechat_app_login_must_not_reuse_mini_program_credentials" })
  }
  for (const envKey of ["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET"]) {
    if (!normalizeArray(wechatRule.requiredEnv).includes(envKey)) {
      failures.push({ path: "$.rules.wechatAppLogin.requiredEnv", value: envKey, error: "missing_required_wechat_open_env" })
    }
  }

  const secretLikePaths = assertNoSecretLikeValues(map)
  if (secretLikePaths.length) {
    failures.push({ path: "$", error: "contains_secret_like_values", matches: secretLikePaths })
  }
}

function validateRouteImplementation(requiredRoute, mappedRoute, failures, warnings) {
  const routeLabel = mappedRoute?.route || requiredRoute.route
  if (!mappedRoute) {
    failures.push({ route: requiredRoute.route, error: "missing_bridge_map_route" })
    return
  }

  if (mappedRoute.scope !== requiredRoute.scope) {
    failures.push({ route: routeLabel, error: "scope_mismatch", expected: requiredRoute.scope, actual: mappedRoute.scope })
  }
  if (mappedRoute.appFile !== requiredRoute.file) {
    failures.push({ route: routeLabel, error: "app_file_mismatch", expected: requiredRoute.file, actual: mappedRoute.appFile })
  }
  if (!sameMethods(mappedRoute.methods, requiredRoute.methods)) {
    failures.push({ route: routeLabel, error: "methods_mismatch", expected: sortedMethods(requiredRoute.methods), actual: sortedMethods(mappedRoute.methods) })
  }
  if (!ALLOWED_SOURCE_TYPES.has(mappedRoute.sourceType)) {
    failures.push({ route: routeLabel, error: "invalid_source_type", sourceType: mappedRoute.sourceType })
  }
  if (!existsSync(resolveProjectPath(mappedRoute.appFile || ""))) {
    failures.push({ route: routeLabel, file: mappedRoute.appFile, error: "app_file_not_found" })
    return
  }

  const sourceFiles = normalizeArray(mappedRoute.sourceFiles)
  if (!sourceFiles.length) {
    failures.push({ route: routeLabel, error: "missing_source_files" })
  }
  for (const sourceFile of sourceFiles) {
    if (!existsSync(resolveProjectPath(sourceFile))) {
      failures.push({ route: routeLabel, file: sourceFile, error: "source_file_not_found" })
    }
  }
  for (const sourcePage of normalizeArray(mappedRoute.sourcePages)) {
    if (!existsSync(resolveProjectPath(sourcePage))) {
      failures.push({ route: routeLabel, file: sourcePage, error: "source_page_not_found" })
    }
  }
  if (sourceFiles.some((sourceFile) => !existsSync(resolveProjectPath(sourceFile)))) return

  const appSource = readText(mappedRoute.appFile)
  const primarySourceFile = sourceFiles[0]
  if (mappedRoute.sourceType === "mp_reexport") {
    if (!String(mappedRoute.sourceRoute || "").startsWith("/api/mp/")) {
      failures.push({ route: routeLabel, error: "mp_reexport_source_route_must_be_mp", sourceRoute: mappedRoute.sourceRoute })
    }
    if (!hasDirectReexport(appSource, primarySourceFile)) {
      failures.push({ route: routeLabel, file: mappedRoute.appFile, sourceFile: primarySourceFile, error: "mp_reexport_not_reflected_in_app_file" })
    }
  }
  if (mappedRoute.sourceType === "mp_adapter") {
    if (!String(mappedRoute.sourceRoute || "").startsWith("/api/mp/")) {
      failures.push({ route: routeLabel, error: "mp_adapter_source_route_must_be_mp", sourceRoute: mappedRoute.sourceRoute })
    }
    if (!hasImportAdapter(appSource, primarySourceFile)) {
      failures.push({ route: routeLabel, file: mappedRoute.appFile, sourceFile: primarySourceFile, error: "mp_adapter_not_reflected_in_app_file" })
    }
  }
  if (mappedRoute.sourceType === "app_alias") {
    if (!String(mappedRoute.sourceRoute || "").startsWith("/api/app/")) {
      failures.push({ route: routeLabel, error: "app_alias_source_route_must_be_app", sourceRoute: mappedRoute.sourceRoute })
    }
    if (!referencesSourceFile(appSource, primarySourceFile)) {
      failures.push({ route: routeLabel, file: mappedRoute.appFile, sourceFile: primarySourceFile, error: "app_alias_not_reflected_in_app_file" })
    }
  }
  if (mappedRoute.sourceType === "app_native" && /from\s+["']@\/app\/api\/mp\//.test(appSource)) {
    failures.push({ route: routeLabel, file: mappedRoute.appFile, error: "app_native_must_not_import_mp_route" })
  }
  if (mappedRoute.scope === "auth" && mappedRoute.sourceType.startsWith("mp_")) {
    failures.push({ route: routeLabel, sourceType: mappedRoute.sourceType, error: "auth_routes_must_not_reuse_mini_program_login" })
  }
  if (mappedRoute.route === "/api/app/auth/wechat") {
    if (mappedRoute.sourceType !== "app_native") {
      failures.push({ route: routeLabel, error: "wechat_auth_route_must_be_app_native" })
    }
    for (const envKey of ["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET"]) {
      if (!normalizeArray(mappedRoute.blocksUntilEnvReady).includes(envKey)) {
        failures.push({ route: routeLabel, envKey, error: "wechat_auth_route_missing_env_blocker" })
      }
    }
  }
  if (mappedRoute.route === "/api/app/wechat/login" && mappedRoute.sourceType !== "app_alias") {
    failures.push({ route: routeLabel, error: "wechat_login_alias_must_point_to_app_native_route" })
  }
  if (mappedRoute.productionCnStatus === "bridge_ready" && mappedRoute.route.includes("wechat")) {
    warnings.push({ route: routeLabel, warning: "wechat_route_marked_bridge_ready" })
  }
}

function validateMap(map) {
  const failures = []
  const warnings = []
  validateTopLevel(map, failures)

  const routes = normalizeArray(map.routes)
  const routesByRoute = new Map()
  for (const route of routes) {
    if (!route || typeof route !== "object") {
      failures.push({ path: "$.routes", error: "route_entry_must_be_object" })
      continue
    }
    const routePath = String(route.route || "").trim()
    if (!routePath) {
      failures.push({ path: "$.routes", error: "route_missing_route" })
      continue
    }
    if (routesByRoute.has(routePath)) {
      failures.push({ route: routePath, error: "duplicate_route" })
      continue
    }
    routesByRoute.set(routePath, route)
  }

  for (const requiredRoute of REQUIRED_ROUTES) {
    validateRouteImplementation(requiredRoute, routesByRoute.get(requiredRoute.route), failures, warnings)
  }

  const requiredRouteSet = new Set(REQUIRED_ROUTES.map((route) => route.route))
  for (const mappedRoute of routesByRoute.values()) {
    if (!requiredRouteSet.has(mappedRoute.route)) {
      failures.push({ route: mappedRoute.route, error: "route_not_in_required_routes" })
    }
  }

  const sourceTypes = countBy(routes, "sourceType")
  const scopes = countBy(routes, "scope")
  return {
    ok: failures.length === 0,
    checkedRoutes: REQUIRED_ROUTES.length,
    mappedRoutes: routes.length,
    sourceTypes,
    scopes,
    bridgeReadyRoutes: routes.filter((route) => route.productionCnStatus === "bridge_ready").length,
    externalEnvBlockedRoutes: routes.filter((route) => route.productionCnStatus === "external_env_blocked").length,
    failures,
    warnings,
  }
}

function main() {
  const args = parseArgs(process.argv)
  if (!existsSync(args.mapFile)) throw new Error(`bridge_map_not_found:${args.mapFile}`)
  const map = readJson(args.mapFile)
  const validation = validateMap(map)
  console.log(JSON.stringify({
    ok: validation.ok,
    mapFile: args.mapFile,
    environment: map.environment || "",
    containsValues: map.containsValues === true,
    checkedRoutes: validation.checkedRoutes,
    mappedRoutes: validation.mappedRoutes,
    sourceTypes: validation.sourceTypes,
    scopes: validation.scopes,
    bridgeReadyRoutes: validation.bridgeReadyRoutes,
    externalEnvBlockedRoutes: validation.externalEnvBlockedRoutes,
    failures: validation.failures,
    warnings: validation.warnings,
  }, null, 2))
  if (!validation.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-app-api-bridge-map.mjs [--map deploy/app-api-production-cn.bridge-map.json]",
    "",
    "Validates the production-cn App API bridge map against route files and mini-program source files.",
    "The check is read-only and must not contain or print secret values.",
  ].join("\n"))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
