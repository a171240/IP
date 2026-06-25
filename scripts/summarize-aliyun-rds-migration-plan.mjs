#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, extname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const APP_API_ROOT = resolve(BACKEND_ROOT, "app/api/app")
const RDS_SCHEMA_MAP_PATH = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-first-version-schema-map.json")
const APP_API_BRIDGE_MAP_PATH = resolve(BACKEND_ROOT, "deploy/app-api-production-cn.bridge-map.json")
const SHARED_SCAN_ROOTS = [
  resolve(BACKEND_ROOT, "app/api/mp"),
  resolve(BACKEND_ROOT, "lib"),
]

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])

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

const ALWAYS_REQUIRED_BLOCKERS = Object.freeze([
  "DATABASE_URL_CN",
  "rds_instance_missing_or_unverified",
  "schema_migration_not_verified",
  "data_migration_not_verified",
  "rollback_validation_not_verified",
])

const FIRST_VERSION_RDS_REQUIRED_MATCHERS = Object.freeze([
  {
    pattern: /^\/api\/app\/profile$/,
    capability: "profile_multi_tenant_permissions",
    reason: "A1 profile and tenant permission surface.",
  },
  {
    pattern: /^\/api\/app\/entitlements$/,
    capability: "profile_multi_tenant_permissions",
    reason: "A1 entitlement and permission summary without APP payments.",
  },
  {
    pattern: /^\/api\/app\/store-admin\/(?:overview|members|analytics)$/,
    capability: "store_manager_service_record_read",
    reason: "Store manager first-version workbench and store visibility.",
  },
  {
    pattern: /^\/api\/app\/store-admin\/invites(?:\/.*)?$/,
    capability: "store_invite",
    reason: "A1 store invitation preview, QR, create, and accept flow.",
  },
  {
    pattern: /^\/api\/app\/store-profiles(?:\/.*)?$/,
    capability: "profile_multi_tenant_permissions",
    reason: "Store profile context needed by tenant/service-record screens.",
  },
  {
    pattern: /^\/api\/app\/customer-profiles(?:\/.*)?$/,
    capability: "service_record_long_recording",
    reason: "Customer profile context needed by first-version service records.",
  },
  {
    pattern: /^\/api\/app\/service-records(?:\/.*)?$/,
    capability: "service_record_long_recording",
    reason: "A2 long service recording, upload, ASR, marker, and review chain.",
  },
])

function parseArgs(argv) {
  const args = {
    outPath: "",
    markdownPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--out") {
      args.outPath = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdownPath = resolveValue(argv[++index], "--markdown")
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

function walkFiles(root) {
  if (!existsSync(root)) return []
  const entries = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    const stat = statSync(current)
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue
        stack.push(resolve(current, entry))
      }
      continue
    }
    if (stat.isFile() && SOURCE_EXTENSIONS.has(extname(current))) entries.push(current)
  }
  return entries.sort()
}

function readText(filePath) {
  return readFileSync(filePath, "utf8")
}

function readJson(filePath) {
  return JSON.parse(readText(filePath))
}

function rel(filePath) {
  return relative(BACKEND_ROOT, filePath).replaceAll("\\", "/")
}

function routePathFor(filePath) {
  const relativePath = rel(filePath)
  if (!relativePath.startsWith("app/api/app/")) return ""
  return `/${relativePath
    .replace(/^app\//, "")
    .replace(/\/route\.[tj]sx?$/, "")
    .replace(/\/route\.mjs$/, "")}`
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))].sort()
}

function buildSchemaMapSummary() {
  if (!existsSync(RDS_SCHEMA_MAP_PATH)) {
    return {
      exists: false,
      ready: false,
      file: rel(RDS_SCHEMA_MAP_PATH),
      blockers: ["schema_map_missing"],
      requiredTables: [],
      requiredFunctions: [],
      requiredStorage: [],
      sourceMigrations: [],
    }
  }

  try {
    const data = readJson(RDS_SCHEMA_MAP_PATH)
    const blockers = []
    if (data.schemaVersion !== 1) blockers.push("schemaVersion=1")
    if (data.environment !== "production-cn") blockers.push("environment=production-cn")
    if (data.formalTarget !== "Aliyun RDS PostgreSQL") blockers.push("formalTarget=Aliyun RDS PostgreSQL")
    if (data.containsValues !== false) blockers.push("containsValues=false")
    if (!Array.isArray(data.requiredTables) || data.requiredTables.length === 0) blockers.push("requiredTables")
    if (!Array.isArray(data.sourceMigrations) || data.sourceMigrations.length === 0) blockers.push("sourceMigrations")
    return {
      exists: true,
      ready: blockers.length === 0,
      file: rel(RDS_SCHEMA_MAP_PATH),
      blockers,
      requiredTables: uniqueSorted((data.requiredTables || []).map((item) => item?.name)),
      requiredFunctions: uniqueSorted((data.requiredFunctions || []).map((item) => item?.name)),
      requiredStorage: uniqueSorted((data.requiredStorage || []).map((item) => item?.sourceBucket || item?.productionCnTarget)),
      sourceMigrations: uniqueSorted(data.sourceMigrations || []),
    }
  } catch (error) {
    return {
      exists: true,
      ready: false,
      file: rel(RDS_SCHEMA_MAP_PATH),
      blockers: [`schema_map_invalid_json:${error instanceof Error ? error.message : String(error)}`],
      requiredTables: [],
      requiredFunctions: [],
      requiredStorage: [],
      sourceMigrations: [],
    }
  }
}

function buildBridgeMapSummary() {
  if (!existsSync(APP_API_BRIDGE_MAP_PATH)) {
    return {
      exists: false,
      ready: false,
      file: rel(APP_API_BRIDGE_MAP_PATH),
      blockers: ["bridge_map_missing"],
      routesByPath: new Map(),
      firstVersionScope: [],
    }
  }

  try {
    const data = readJson(APP_API_BRIDGE_MAP_PATH)
    const blockers = []
    if (data.schemaVersion !== 1) blockers.push("schemaVersion=1")
    if (data.environment !== "production-cn") blockers.push("environment=production-cn")
    if (data.containsValues !== false) blockers.push("containsValues=false")
    if (!Array.isArray(data.firstVersionScope) || data.firstVersionScope.length === 0) {
      blockers.push("firstVersionScope")
    }
    if (!Array.isArray(data.routes) || data.routes.length === 0) blockers.push("routes")
    const routesByPath = new Map()
    for (const route of data.routes || []) {
      if (!route?.route || typeof route.route !== "string") continue
      routesByPath.set(route.route, {
        route: route.route,
        scope: route.scope || "",
        productionCnStatus: route.productionCnStatus || "",
        sourceType: route.sourceType || "",
      })
    }
    return {
      exists: true,
      ready: blockers.length === 0,
      file: rel(APP_API_BRIDGE_MAP_PATH),
      blockers,
      routesByPath,
      firstVersionScope: uniqueSorted(data.firstVersionScope || []),
    }
  } catch (error) {
    return {
      exists: true,
      ready: false,
      file: rel(APP_API_BRIDGE_MAP_PATH),
      blockers: [`bridge_map_invalid_json:${error instanceof Error ? error.message : String(error)}`],
      routesByPath: new Map(),
      firstVersionScope: [],
    }
  }
}

function classifyFirstVersionRdsScope(routePath, bridgeRoute) {
  if (routePath === "/api/app/health") {
    return {
      firstVersionRdsRequired: false,
      appApiScopeClass: "operational_health",
      capability: "backend_health",
      deferReason: "Health is a deployment/env smoke route; it is handled by SAE env import and health smoke, not RDS data migration.",
    }
  }
  if (routePath === "/api/app/auth/wechat" || routePath === "/api/app/wechat/login") {
    return {
      firstVersionRdsRequired: false,
      appApiScopeClass: "deferred_wechat_mobile_login",
      capability: "login",
      deferReason: "WeChat Open Platform mobile app creation and its env are explicitly deferred from the current Aliyun backend-only target.",
    }
  }
  if (routePath === "/api/app/auth/logout") {
    return {
      firstVersionRdsRequired: false,
      appApiScopeClass: "auth",
      capability: "login",
      deferReason: "Logout is an Auth session boundary and does not own first-version RDS business data.",
    }
  }
  if (/^\/api\/app\/scene-cards(?:\/.*)?$/.test(routePath)) {
    return {
      firstVersionRdsRequired: false,
      appApiScopeClass: "deferred_a3_scene_cards",
      capability: "voice_coach_scene_cards",
      deferReason: "Scene cards belong to A3 voice-coach/customer-project migration, not the current first-version backend closure.",
    }
  }

  const match = FIRST_VERSION_RDS_REQUIRED_MATCHERS.find((item) => item.pattern.test(routePath))
  if (match) {
    return {
      firstVersionRdsRequired: true,
      appApiScopeClass: bridgeRoute?.scope || "first_version_required",
      capability: match.capability,
      deferReason: "",
      reason: match.reason,
    }
  }

  return {
    firstVersionRdsRequired: false,
    appApiScopeClass: bridgeRoute?.scope ? `unclassified_${bridgeRoute.scope}` : "unclassified_app_api",
    capability: "",
    deferReason: "Route is present in the APP API inventory but is not part of the first-version RDS migration rule set.",
  }
}

function collectMatches(text, regex) {
  return uniqueSorted([...text.matchAll(regex)].map((match) => match[1]))
}

function collectImports(text) {
  return uniqueSorted([
    ...collectMatches(text, /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g),
    ...collectMatches(text, /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g),
    ...collectMatches(text, /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g),
  ])
}

function isInsideBackend(filePath) {
  const relativePath = relative(BACKEND_ROOT, filePath)
  return relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")
}

function resolveSourceImport(fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return ""
  const base = specifier.startsWith("@/")
    ? resolve(BACKEND_ROOT, specifier.slice(2))
    : resolve(dirname(fromFile), specifier)
  const candidates = [
    base,
    ...[...SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
    ...[...SOURCE_EXTENSIONS].map((extension) => resolve(base, `index${extension}`)),
  ]
  return candidates.find((candidate) =>
    isInsideBackend(candidate) && existsSync(candidate) && statSync(candidate).isFile() && SOURCE_EXTENSIONS.has(extname(candidate))
  ) || ""
}

function analyzeFile(filePath) {
  const text = readText(filePath)
  const relativePath = rel(filePath)
  const tables = collectMatches(text, /(?<!storage)\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g)
  const storageBuckets = collectMatches(text, /\.storage\s*\.\s*from\(\s*["'`]([^"'`]+)["'`]\s*\)/g)
  const rpcs = collectMatches(text, /\.rpc\(\s*["'`]([^"'`]+)["'`]\s*/g)
  const envKeys = uniqueSorted([
    ...collectMatches(text, /\b((?:NEXT_PUBLIC_)?(?:IPgongchang_)?SUPABASE_[A-Z0-9_]+)\b/g),
    ...collectMatches(text, /\b(DATABASE_URL_CN|REDIS_URL_CN)\b/g),
  ])
  const directSupabasePackageImport = /@supabase\/(?:supabase-js|ssr)/.test(text)
  const localSupabaseImport = /["'`](?:@\/lib\/supabase|\.{1,2}\/[^"'`]*supabase|lib\/supabase)[^"'`]*["'`]/.test(text)
  const createClientUsage = /\bcreate(?:Server)?Client\s*\(/.test(text)
  const supabaseIdentifierUsage = /\bsupabase\b/i.test(text)
  const supabaseDataAccessUsage = tables.length > 0
    || storageBuckets.length > 0
    || rpcs.length > 0
  const postgresPackageImport = /\b(?:from|require)\s*\(?["'`](?:pg|postgres|@vercel\/postgres|drizzle-orm|kysely)["'`]/.test(text)
  const aliyunRdsImport = /["'`]@\/lib\/aliyun-rds[^"'`]*["'`]/.test(text)
  const databaseUrlCnUsage = envKeys.includes("DATABASE_URL_CN")
  const usesSupabase = directSupabasePackageImport
    || localSupabaseImport
    || supabaseIdentifierUsage
    || envKeys.some((key) => key.includes("SUPABASE_"))
    || tables.length > 0
    || storageBuckets.length > 0
    || rpcs.length > 0

  return {
    file: relativePath,
    routePath: routePathFor(filePath),
    usesSupabase,
    supabaseDataAccessUsage,
    directSupabasePackageImport,
    localSupabaseImport,
    createClientUsage,
    supabaseIdentifierUsage,
    postgresPackageImport,
    aliyunRdsImport,
    databaseUrlCnUsage,
    envKeys,
    tables,
    rpcs,
    storageBuckets,
    imports: collectImports(text),
  }
}

function compactUsage(file) {
  return {
    file: file.file,
    routePath: file.routePath || undefined,
    appApiScopeClass: file.appApiScopeClass,
    firstVersionRdsRequired: file.firstVersionRdsRequired,
    firstVersionCapability: file.firstVersionCapability,
    firstVersionDeferReason: file.firstVersionDeferReason,
    envKeys: file.envKeys,
    tables: file.tables,
    rpcs: file.rpcs,
    storageBuckets: file.storageBuckets,
    directSupabasePackageImport: file.directSupabasePackageImport,
    localSupabaseImport: file.localSupabaseImport,
    directSupabaseDataAccess: file.directSupabaseDataAccess,
    usesSupabaseDataAccess: file.usesSupabaseDataAccess,
    directUsesSupabase: file.directUsesSupabase,
    supabaseDependencyFiles: file.supabaseDependencyFiles,
  }
}

function buildImportGraph(analysesByFile, absolutePathByRelativeFile) {
  const graph = new Map()
  for (const [relativePath, analysis] of analysesByFile.entries()) {
    const absoluteFile = absolutePathByRelativeFile.get(relativePath)
    if (!absoluteFile) continue
    const deps = analysis.imports
      .map((specifier) => resolveSourceImport(absoluteFile, specifier))
      .filter(Boolean)
      .map((filePath) => rel(filePath))
      .filter((filePath) => analysesByFile.has(filePath))
    graph.set(relativePath, uniqueSorted(deps))
  }
  return graph
}

function collectDependencyClosure(file, graph, seen = new Set()) {
  const deps = graph.get(file) || []
  for (const dep of deps) {
    if (seen.has(dep)) continue
    seen.add(dep)
    collectDependencyClosure(dep, graph, seen)
  }
  return [...seen].sort()
}

function buildReport() {
  const bridgeMap = buildBridgeMapSummary()
  const appApiFiles = walkFiles(APP_API_ROOT)
  const appApiRouteFiles = appApiFiles
    .filter((filePath) => /\/route\.[tj]sx?$/.test(filePath) || /\/route\.mjs$/.test(filePath))
  const sharedFiles = uniqueSorted(SHARED_SCAN_ROOTS.flatMap((root) => walkFiles(root))).map((file) => resolve(file))

  const allSourceFiles = uniqueSorted([...appApiFiles, ...sharedFiles]).map((file) => resolve(file))
  const absolutePathByRelativeFile = new Map(allSourceFiles.map((file) => [rel(file), file]))
  const allAnalyses = allSourceFiles.map(analyzeFile)
  const analysesByFile = new Map(allAnalyses.map((analysis) => [analysis.file, analysis]))
  const importGraph = buildImportGraph(analysesByFile, absolutePathByRelativeFile)
  const routeFiles = new Set(appApiRouteFiles.map((file) => rel(file)))
  const appApiRoutes = allAnalyses
    .filter((analysis) => routeFiles.has(analysis.file))
    .map((route) => {
      const dependencyFiles = collectDependencyClosure(route.file, importGraph)
      const supabaseDependencyFiles = dependencyFiles
        .filter((file) => analysesByFile.get(file)?.usesSupabase)
        .sort()
      const supabaseDataAccessDependencyFiles = dependencyFiles
        .filter((file) => analysesByFile.get(file)?.supabaseDataAccessUsage)
        .sort()
      const bridgeRoute = bridgeMap.routesByPath.get(route.routePath)
      const firstVersionClassification = classifyFirstVersionRdsScope(route.routePath, bridgeRoute)
      const authSessionOnly = route.routePath === "/api/app/auth/logout"
      return {
        ...route,
        directUsesSupabase: route.usesSupabase,
        directSupabaseDataAccess: authSessionOnly ? false : route.supabaseDataAccessUsage,
        usesSupabase: route.usesSupabase || supabaseDependencyFiles.length > 0,
        usesSupabaseDataAccess: authSessionOnly ? false : route.supabaseDataAccessUsage || supabaseDataAccessDependencyFiles.length > 0,
        dependencyFiles,
        supabaseDependencyFiles,
        supabaseDataAccessDependencyFiles: authSessionOnly ? [] : supabaseDataAccessDependencyFiles,
        bridgeMapScope: bridgeRoute?.scope || "",
        bridgeMapProductionCnStatus: bridgeRoute?.productionCnStatus || "",
        bridgeMapSourceType: bridgeRoute?.sourceType || "",
        appApiScopeClass: firstVersionClassification.appApiScopeClass,
        firstVersionRdsRequired: firstVersionClassification.firstVersionRdsRequired,
        firstVersionCapability: firstVersionClassification.capability,
        firstVersionRdsReason: firstVersionClassification.reason || "",
        firstVersionDeferReason: firstVersionClassification.deferReason || "",
      }
    })
  const sharedAnalyses = allAnalyses.filter((analysis) => !routeFiles.has(analysis.file))
  const supabaseUsageFiles = allAnalyses.filter((file) => file.usesSupabase)
  const appApiSupabaseRoutes = appApiRoutes.filter((file) => file.usesSupabase)
  const appApiSupabaseDataAccessRoutes = appApiRoutes.filter((file) => file.usesSupabaseDataAccess)
  const appApiDirectSupabaseRoutes = appApiRoutes.filter((file) => file.directUsesSupabase)
  const appApiDirectSupabaseDataAccessRoutes = appApiRoutes.filter((file) => file.directSupabaseDataAccess)
  const firstVersionRdsRoutes = appApiRoutes.filter((file) => file.firstVersionRdsRequired)
  const firstVersionRdsSupabaseRoutes = firstVersionRdsRoutes.filter((file) => file.usesSupabase)
  const firstVersionRdsSupabaseDataAccessRoutes = firstVersionRdsRoutes.filter((file) => file.usesSupabaseDataAccess)
  const deferredAppApiRoutes = appApiRoutes.filter((file) => !file.firstVersionRdsRequired)
  const deferredAppApiSupabaseRoutes = deferredAppApiRoutes.filter((file) => file.usesSupabase)
  const deferredAppApiSupabaseDataAccessRoutes = deferredAppApiRoutes.filter((file) => file.usesSupabaseDataAccess)
  const sharedSupabaseFiles = sharedAnalyses.filter((file) => file.usesSupabase)
  const sharedSupabaseDataAccessFiles = sharedAnalyses.filter((file) => file.supabaseDataAccessUsage)
  const directSupabasePackageImportFiles = allAnalyses.filter((file) => file.directSupabasePackageImport)
  const postgresAdapterFiles = allAnalyses.filter((file) =>
    file.postgresPackageImport || file.databaseUrlCnUsage || file.aliyunRdsImport
  )
  const databaseUrlCnFiles = allAnalyses.filter((file) => file.databaseUrlCnUsage)
  const tables = uniqueSorted(allAnalyses.flatMap((file) => file.tables))
  const rpcs = uniqueSorted(allAnalyses.flatMap((file) => file.rpcs))
  const storageBuckets = uniqueSorted(allAnalyses.flatMap((file) => file.storageBuckets))
  const envKeys = uniqueSorted(allAnalyses.flatMap((file) => file.envKeys))

  const postgresDataAccessAdapterDetected = postgresAdapterFiles.some((file) =>
    file.postgresPackageImport || /DATABASE_URL_CN/.test(file.envKeys.join(",")),
  )
  const firstVersionDataAccessReady = postgresDataAccessAdapterDetected && firstVersionRdsSupabaseDataAccessRoutes.length === 0
  const schemaMap = buildSchemaMapSummary()
  const requiredBlockers = uniqueSorted([
    ...ALWAYS_REQUIRED_BLOCKERS,
    ...(firstVersionRdsSupabaseDataAccessRoutes.length > 0 ? ["first_version_supabase_data_access_still_present"] : []),
    ...(postgresDataAccessAdapterDetected ? [] : ["postgres_data_access_adapter_missing"]),
    ...(schemaMap.ready ? [] : ["schema_inventory_map_missing_or_invalid"]),
    ...(bridgeMap.ready ? [] : ["app_api_bridge_map_missing_or_invalid"]),
  ])

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    currentDataLayer: "Supabase migration source / legacy compatibility only",
    formalTarget: "Aliyun RDS PostgreSQL",
    migrationReady: false,
    scope: {
      appApiRoot: "app/api/app",
      sharedScanRoots: SHARED_SCAN_ROOTS.map((root) => rel(root)),
      note: "Source inventory only; no environment values, cloud APIs, or database connections are read.",
    },
    summary: {
      appApiRouteCount: appApiRoutes.length,
      appApiRoutesWithSupabase: appApiSupabaseRoutes.length,
      appApiRoutesWithSupabaseDataAccess: appApiSupabaseDataAccessRoutes.length,
      appApiRoutesWithDirectSupabase: appApiDirectSupabaseRoutes.length,
      appApiRoutesWithDirectSupabaseDataAccess: appApiDirectSupabaseDataAccessRoutes.length,
      firstVersionRdsRouteCount: firstVersionRdsRoutes.length,
      firstVersionRdsRoutesWithSupabase: firstVersionRdsSupabaseRoutes.length,
      firstVersionRdsRoutesWithSupabaseDataAccess: firstVersionRdsSupabaseDataAccessRoutes.length,
      deferredAppApiRouteCount: deferredAppApiRoutes.length,
      deferredAppApiRoutesWithSupabase: deferredAppApiSupabaseRoutes.length,
      deferredAppApiRoutesWithSupabaseDataAccess: deferredAppApiSupabaseDataAccessRoutes.length,
      sharedSupabaseFileCount: sharedSupabaseFiles.length,
      sharedSupabaseDataAccessFileCount: sharedSupabaseDataAccessFiles.length,
      supabaseUsageFileCount: supabaseUsageFiles.length,
      directSupabasePackageImportFileCount: directSupabasePackageImportFiles.length,
      postgresDataAccessAdapterDetected,
      databaseUrlCnReferencedInSource: databaseUrlCnFiles.length > 0,
      schemaMapReady: schemaMap.ready,
      schemaMapRequiredTableCount: schemaMap.requiredTables.length,
      tableCount: tables.length,
      rpcCount: rpcs.length,
      storageBucketCount: storageBuckets.length,
      requiredBlocking: requiredBlockers,
      blockers: requiredBlockers,
    },
    inventory: {
      envKeys,
      tables,
      rpcs,
      storageBuckets,
      directSupabasePackageImportFiles: directSupabasePackageImportFiles.map((file) => file.file),
      databaseUrlCnFiles: databaseUrlCnFiles.map((file) => file.file),
      postgresAdapterFiles: postgresAdapterFiles.map((file) => file.file),
      schemaMap,
      bridgeMap: {
        exists: bridgeMap.exists,
        ready: bridgeMap.ready,
        file: bridgeMap.file,
        blockers: bridgeMap.blockers,
        firstVersionScope: bridgeMap.firstVersionScope,
      },
    },
    appApiRoutes: appApiRoutes.map((file) => ({
      file: file.file,
      routePath: file.routePath,
      appApiScopeClass: file.appApiScopeClass,
      bridgeMapScope: file.bridgeMapScope,
      bridgeMapProductionCnStatus: file.bridgeMapProductionCnStatus,
      firstVersionRdsRequired: file.firstVersionRdsRequired,
      firstVersionCapability: file.firstVersionCapability,
      firstVersionDeferReason: file.firstVersionDeferReason,
      usesSupabase: file.usesSupabase,
      usesSupabaseDataAccess: file.usesSupabaseDataAccess,
      tables: file.tables,
      rpcs: file.rpcs,
      storageBuckets: file.storageBuckets,
      envKeys: file.envKeys,
      directUsesSupabase: file.directUsesSupabase,
      directSupabaseDataAccess: file.directSupabaseDataAccess,
      supabaseDependencyFiles: file.supabaseDependencyFiles,
      supabaseDataAccessDependencyFiles: file.supabaseDataAccessDependencyFiles,
    })),
    appApiSupabaseRoutes: appApiSupabaseRoutes.map(compactUsage),
    appApiSupabaseDataAccessRoutes: appApiSupabaseDataAccessRoutes.map(compactUsage),
    firstVersionRdsRoutes: firstVersionRdsRoutes.map(compactUsage),
    firstVersionRdsSupabaseRoutes: firstVersionRdsSupabaseRoutes.map(compactUsage),
    firstVersionRdsSupabaseDataAccessRoutes: firstVersionRdsSupabaseDataAccessRoutes.map(compactUsage),
    deferredAppApiRoutes: deferredAppApiRoutes.map(compactUsage),
    sharedSupabaseFiles: sharedSupabaseFiles.map(compactUsage),
    sharedSupabaseDataAccessFiles: sharedSupabaseDataAccessFiles.map(compactUsage),
    requiredBlocking: [
      {
        id: "DATABASE_URL_CN",
        status: "todo",
        obtainFrom: "Aliyun console -> RDS PostgreSQL -> database connection endpoint and credential",
        importTarget: "Aliyun KMS / Secrets Manager / SAE secret env only",
        note: "A connection string alone is not enough; source code, schema, data, and rollback evidence must also be migrated.",
      },
      {
        id: "ALIYUN_RDS_POSTGRES",
        status: "not_verified",
        obtainFrom: "Aliyun console -> RDS -> PostgreSQL instance in cn-hangzhou",
        importTarget: "deploy/aliyun-production-cn.cloud-inventory-results.local.json and cloud confirmations",
        note: "Current strict read-only inventory is incomplete, so RDS PostgreSQL presence or absence is unverified; confirm in Aliyun console or allowlisted read-only inventory before treating DATABASE_URL_CN as available.",
      },
      {
        id: "SUPABASE_TO_RDS_DATA_ACCESS_MIGRATION",
        status: !postgresDataAccessAdapterDetected
          ? "not_started"
          : firstVersionRdsSupabaseDataAccessRoutes.length > 0
            ? "adapter_scaffolded_first_version_routes_still_using_supabase"
            : "first_version_routes_switched_pending_runtime_evidence",
        obtainFrom: "Code migration from Supabase SDK calls to a PostgreSQL/RDS data access layer",
        importTarget: "backend source plus migration manifest",
        note: !postgresDataAccessAdapterDetected
          ? "Current APP API inventory still has Supabase usage in production-cn business routes and has no PostgreSQL adapter."
          : firstVersionRdsSupabaseDataAccessRoutes.length > 0
            ? "A DATABASE_URL_CN/PostgreSQL server adapter exists, but first-version APP API routes still depend on Supabase business data access."
            : "First-version APP API business data access has switched to DATABASE_URL_CN-backed repositories; runtime, schema, data, smoke, and rollback evidence are still required.",
      },
      {
        id: "SCHEMA_DATA_ROLLBACK_VALIDATION",
        status: "not_started",
        obtainFrom: "schema dump, data migration runbook, smoke validation, and rollback rehearsal",
        importTarget: "release evidence package",
        note: "No production-cn RDS schema/data migration evidence is included yet.",
      },
    ],
    migrationPhases: [
      {
        id: "RDS01_FREEZE_SCHEMA_INVENTORY",
        canStartNow: !schemaMap.ready,
        status: schemaMap.ready ? "local_schema_map_ready" : "todo",
        expectedEvidence: [
          "Supabase table/RPC/storage inventory reviewed",
          "first-version APP scope confirmed",
          "deploy/aliyun-production-cn.rds-first-version-schema-map.json contains non-secret table/function/storage scope",
        ],
      },
      {
        id: "RDS02_CREATE_ALIYUN_RDS_POSTGRES",
        canStartNow: true,
        expectedEvidence: [
          "RDS PostgreSQL instance exists in cn-hangzhou",
          "DATABASE_URL_CN imported only through secret env",
        ],
      },
      {
        id: "RDS03_BUILD_POSTGRES_DATA_ACCESS_ADAPTER",
        canStartNow: !firstVersionDataAccessReady,
        status: !postgresDataAccessAdapterDetected
          ? "todo"
          : firstVersionDataAccessReady
            ? "first_version_routes_switched_pending_runtime_evidence"
            : "adapter_scaffolded_routes_not_switched",
        blockedBy: ["RDS01_FREEZE_SCHEMA_INVENTORY"],
        expectedEvidence: [
          "First-version APP API routes no longer depend on Supabase as formal production-cn data layer",
          "adapter uses DATABASE_URL_CN in server runtime only",
        ],
      },
      {
        id: "RDS04_MIGRATE_SCHEMA_AND_DATA",
        canStartNow: false,
        blockedBy: firstVersionDataAccessReady
          ? ["RDS02_CREATE_ALIYUN_RDS_POSTGRES"]
          : ["RDS02_CREATE_ALIYUN_RDS_POSTGRES", "RDS03_BUILD_POSTGRES_DATA_ACCESS_ADAPTER"],
        expectedEvidence: [
          "schema migration completed",
          "data migration completed",
          "row counts and critical records validated",
        ],
      },
      {
        id: "RDS05_VALIDATE_APP_API_ON_RDS",
        canStartNow: false,
        blockedBy: ["RDS04_MIGRATE_SCHEMA_AND_DATA"],
        expectedEvidence: [
          "profile / tenant / invite / service-record smoke passes against RDS",
          "production-cn health strict passes database dependency checks",
        ],
      },
      {
        id: "RDS06_SWITCH_PRODUCTION_CN_AND_ROLLBACK",
        canStartNow: false,
        blockedBy: ["RDS05_VALIDATE_APP_API_ON_RDS"],
        expectedEvidence: [
          "production-cn switch confirmed",
          "rollback runbook rehearsed",
        ],
      },
    ],
    safetyBoundary: [
      "This command does not connect to Supabase, Aliyun RDS, Vercel, or WeChat.",
      "This command does not read .env files or output secret values.",
      "This command does not create resources, import environment variables, push images, or deploy production-cn.",
    ],
    nextActions: [
      "Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou before importing DATABASE_URL_CN.",
      "Keep Supabase variables only as migration-source or legacy-compatibility env, not as the final production-cn database target.",
      firstVersionDataAccessReady
        ? "Keep the first-version APP-native RDS repositories in place and validate them against migrated RDS data."
        : "Plan code migration for the first-version APP API routes and shared Supabase data access files listed in this report.",
      "Add schema/data migration and rollback evidence before marking Aliyun RDS PostgreSQL migration confirmed.",
    ],
  }

  report.secretLeakCheck = {
    ok: assertNoSecretLikeValues(report).length === 0,
    matches: assertNoSecretLikeValues(report),
  }
  return report
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

function renderMarkdown(report) {
  return [
    "# APP production-cn RDS/PostgreSQL migration inventory",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Conclusion",
    "",
    `- Current data layer: ${report.currentDataLayer}`,
    `- Formal target: ${report.formalTarget}`,
    `- Migration ready: ${report.migrationReady}`,
    `- APP API routes: ${report.summary.appApiRouteCount}`,
    `- APP API routes using Supabase: ${report.summary.appApiRoutesWithSupabase}`,
    `- APP API routes using Supabase data access: ${report.summary.appApiRoutesWithSupabaseDataAccess}`,
    `- First-version RDS required APP API routes: ${report.summary.firstVersionRdsRouteCount}`,
    `- First-version RDS required routes using Supabase: ${report.summary.firstVersionRdsRoutesWithSupabase}`,
    `- First-version RDS required routes using Supabase data access: ${report.summary.firstVersionRdsRoutesWithSupabaseDataAccess}`,
    `- Deferred APP API routes: ${report.summary.deferredAppApiRouteCount}`,
    `- Deferred APP API routes using Supabase data access: ${report.summary.deferredAppApiRoutesWithSupabaseDataAccess}`,
    `- Shared Supabase files: ${report.summary.sharedSupabaseFileCount}`,
    `- Shared Supabase data access files: ${report.summary.sharedSupabaseDataAccessFileCount}`,
    `- Supabase usage files: ${report.summary.supabaseUsageFileCount}`,
    `- DATABASE_URL_CN referenced in source: ${report.summary.databaseUrlCnReferencedInSource}`,
    `- PostgreSQL data access adapter detected: ${report.summary.postgresDataAccessAdapterDetected}`,
    `- RDS schema map ready: ${report.summary.schemaMapReady}`,
    `- RDS schema map required tables: ${report.summary.schemaMapRequiredTableCount}`,
    `- requiredBlockingCodes: ${report.summary.requiredBlocking.join(", ") || "none"}`,
    `- APP API bridge map ready: ${report.inventory.bridgeMap.ready}`,
    `- Tables: ${report.inventory.tables.join(", ") || "none"}`,
    `- RPCs: ${report.inventory.rpcs.join(", ") || "none"}`,
    `- Storage buckets: ${report.inventory.storageBuckets.join(", ") || "none"}`,
    `- RDS adapter files: ${report.inventory.postgresAdapterFiles.join(", ") || "none"}`,
    `- RDS schema map file: ${report.inventory.schemaMap.file}`,
    "",
    "## Required Blockers",
    "",
    ...report.requiredBlocking.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- status: ${item.status}`,
      `- obtainFrom: ${item.obtainFrom}`,
      `- importTarget: ${item.importTarget}`,
      `- note: ${item.note}`,
      "",
    ]),
    "## First-version RDS Supabase Data Access Routes",
    "",
    ...report.firstVersionRdsSupabaseDataAccessRoutes.flatMap((item) => [
      `- ${item.routePath || item.file}`,
      `  - file: ${item.file}`,
      `  - capability: ${item.firstVersionCapability || "unknown"}`,
      `  - scopeClass: ${item.appApiScopeClass || "unknown"}`,
      `  - tables: ${item.tables.join(", ") || "none"}`,
      `  - rpcs: ${item.rpcs.join(", ") || "none"}`,
      `  - storageBuckets: ${item.storageBuckets.join(", ") || "none"}`,
      `  - envKeys: ${item.envKeys.join(", ") || "none"}`,
    ]),
    "",
    "## Deferred APP API Routes",
    "",
    ...report.deferredAppApiRoutes.flatMap((item) => [
      `- ${item.routePath || item.file}`,
      `  - file: ${item.file}`,
      `  - reason: ${item.firstVersionDeferReason || "not in first-version RDS required route set"}`,
      `  - usesSupabaseDataAccess: ${item.usesSupabaseDataAccess === true}`,
    ]),
    "",
    "## Full APP API Supabase Routes",
    "",
    ...report.appApiSupabaseRoutes.flatMap((item) => [
      `- ${item.routePath || item.file}`,
      `  - file: ${item.file}`,
      `  - tables: ${item.tables.join(", ") || "none"}`,
      `  - rpcs: ${item.rpcs.join(", ") || "none"}`,
      `  - storageBuckets: ${item.storageBuckets.join(", ") || "none"}`,
      `  - envKeys: ${item.envKeys.join(", ") || "none"}`,
    ]),
    "",
    "## Migration Phases",
    "",
    ...report.migrationPhases.flatMap((phase) => [
      `### ${phase.id}`,
      "",
      `- canStartNow: ${phase.canStartNow}`,
      phase.blockedBy?.length ? `- blockedBy: ${phase.blockedBy.join(", ")}` : "- blockedBy: none",
      `- expectedEvidence: ${phase.expectedEvidence.join("; ")}`,
      "",
    ]),
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((item) => `- ${item}`),
    "",
  ].join("\n")
}

function writeOutput(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport()
  if (args.outPath) writeOutput(args.outPath, JSON.stringify(report, null, 2))
  if (args.markdownPath) writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok || !report.secretLeakCheck.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/summarize-aliyun-rds-migration-plan.mjs [--out path] [--markdown path]",
    "",
    "Scans APP API and shared backend source files for Supabase data access dependencies.",
    "It emits a value-free Aliyun RDS PostgreSQL migration inventory and does not call cloud APIs.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
