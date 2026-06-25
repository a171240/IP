#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_SCHEMA_MAP = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-first-version-schema-map.json")
const DEFAULT_BRIDGE_MAP = resolve(BACKEND_ROOT, "deploy/app-api-production-cn.bridge-map.json")

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /DATABASE_URL_CN\s*=\s*\S{8,}/i,
  /AccessKeySecret\s*[:=]\s*\S{8,}/i,
]

const IMPLEMENTATION_WORK_PACKAGE_TEMPLATES = [
  {
    id: "RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS",
    scope: "account",
    title: "Profile, entitlement, account context, and AI point billing repositories",
    proposedRepositoryFiles: [
      "lib/aliyun-rds/repositories/account-context.server.ts",
      "lib/aliyun-rds/repositories/ai-points.server.ts",
      "lib/aliyun-rds/repositories/pricing-profile.server.ts",
    ],
    blockedBy: [
      "request_auth_identity_boundary_ready",
      "profiles_entitlements_membership_rows_migrated",
    ],
    acceptanceGates: [
      "/api/app/profile and /api/app/entitlements read profile, membership, entitlement, and point data through DATABASE_URL_CN.",
      "First-version account routes no longer require Supabase SDK business data access files.",
      "consume_credits and grant_trial_credits are implemented as PostgreSQL functions or equivalent transactions on RDS.",
    ],
  },
  {
    id: "RDS_WP02_CONTEXT_PROFILES",
    scope: "context",
    title: "Store profile and customer profile repositories",
    proposedRepositoryFiles: [
      "lib/aliyun-rds/repositories/store-profiles.server.ts",
      "lib/aliyun-rds/repositories/customer-profiles.server.ts",
    ],
    blockedBy: [
      "request_auth_identity_boundary_ready",
      "store_profiles_and_customer_profiles_migrated",
    ],
    acceptanceGates: [
      "/api/app/store-profiles and /api/app/customer-profiles CRUD use DATABASE_URL_CN-backed repositories.",
      "Profile ownership and tenant filters are enforced in SQL or repository guards before returning rows.",
      "Create/update/delete paths preserve existing API response shapes used by the APP bridge.",
    ],
  },
  {
    id: "RDS_WP03_SERVICE_RECORDS_CORE",
    scope: "service-records",
    title: "Service record session, segment, marker, and playback repositories",
    proposedRepositoryFiles: [
      "lib/aliyun-rds/repositories/service-records.server.ts",
      "lib/aliyun-rds/repositories/service-record-segments.server.ts",
      "lib/aliyun-rds/repositories/service-record-processing.server.ts",
    ],
    blockedBy: [
      "request_auth_identity_boundary_ready",
      "oss_audio_runtime_access_ready",
      "service_record_tables_migrated",
    ],
    acceptanceGates: [
      "Long-recording create/resume/end/process/poll/audio routes persist and read sessions through DATABASE_URL_CN.",
      "Segment and marker mutations run in PostgreSQL transactions where the previous Supabase chain used multiple writes.",
      "Playback routes use RDS metadata plus Aliyun OSS storage access and keep unauthenticated access blocked.",
    ],
  },
  {
    id: "RDS_WP04_STORE_ADMIN_READ_MODELS",
    scope: "store-admin",
    title: "Store-admin overview, member, and analytics read models",
    proposedRepositoryFiles: [
      "lib/aliyun-rds/repositories/store-admin.server.ts",
      "lib/aliyun-rds/repositories/org-analytics.server.ts",
    ],
    blockedBy: [
      "account_context_repository_ready",
      "voice_session_history_rows_migrated",
    ],
    acceptanceGates: [
      "Store manager overview, members, and analytics routes query RDS with tenant/company/store scoping.",
      "Manager-only access remains enforced before analytics or member lists are returned.",
      "APP smoke confirms store managers can view their own store records and cannot view other tenant records.",
    ],
  },
  {
    id: "RDS_WP05_STORE_INVITES",
    scope: "invites",
    title: "Store invitation repositories and token lookup",
    proposedRepositoryFiles: [
      "lib/aliyun-rds/repositories/store-invites.server.ts",
    ],
    blockedBy: [
      "account_context_repository_ready",
      "mp_account_invites_rows_migrated",
      "production_cn_public_base_url_ready",
    ],
    acceptanceGates: [
      "Invite create, preview, accept, and qrcode routes use RDS invite rows and existing hashed-token semantics.",
      "Accept flow inserts or updates memberships in a PostgreSQL transaction.",
      "Generated invite links point to the production-cn backend/app base URL without exposing token hashes.",
    ],
  },
]

function parseArgs(argv) {
  const args = {
    schemaMap: DEFAULT_SCHEMA_MAP,
    bridgeMap: DEFAULT_BRIDGE_MAP,
    out: "",
    markdown: "",
  }
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--schema-map") {
      args.schemaMap = resolveValue(argv[++index], "--schema-map")
      continue
    }
    if (arg === "--bridge-map") {
      args.bridgeMap = resolveValue(argv[++index], "--bridge-map")
      continue
    }
    if (arg === "--out") {
      args.out = resolveValue(argv[++index], "--out")
      continue
    }
    if (arg === "--markdown") {
      args.markdown = resolveValue(argv[++index], "--markdown")
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

function readText(filePath) {
  return readFileSync(filePath, "utf8")
}

function readJson(filePath) {
  return JSON.parse(readText(filePath))
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function rel(filePath) {
  return relative(BACKEND_ROOT, filePath).replaceAll("\\", "/")
}

function resolveRepoPath(repoPath) {
  const filePath = resolve(BACKEND_ROOT, repoPath)
  if (filePath !== BACKEND_ROOT && !filePath.startsWith(`${BACKEND_ROOT}/`)) {
    throw new Error(`path_outside_repo:${repoPath}`)
  }
  return filePath
}

function runJson(label, scriptArgs) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label}_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort()
}

function readSourceFile(repoPath) {
  const filePath = resolveRepoPath(repoPath)
  if (!existsSync(filePath)) return null
  return {
    repoPath: rel(filePath),
    filePath,
    text: readText(filePath),
  }
}

function resolveImport(fromFilePath, specifier) {
  if (!specifier.startsWith("@/") && !specifier.startsWith("./") && !specifier.startsWith("../")) return ""
  const basePath = specifier.startsWith("@/")
    ? resolve(BACKEND_ROOT, specifier.slice(2))
    : resolve(dirname(fromFilePath), specifier)
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    resolve(basePath, "index.ts"),
    resolve(basePath, "index.tsx"),
    resolve(basePath, "index.js"),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found || (found !== BACKEND_ROOT && !found.startsWith(`${BACKEND_ROOT}/`))) return ""
  return rel(found)
}

function importedRepoPaths(source) {
  const matches = []
  const importPattern = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g
  for (const match of source.text.matchAll(importPattern)) {
    const repoPath = resolveImport(source.filePath, match[1])
    if (repoPath) matches.push(repoPath)
  }
  return unique(matches)
}

function collectDependencyGraph(seedPaths, maxDepth = 4) {
  const queue = seedPaths.map((repoPath) => ({ repoPath, depth: 0 }))
  const visited = new Map()

  while (queue.length) {
    const item = queue.shift()
    if (!item || visited.has(item.repoPath)) continue
    const source = readSourceFile(item.repoPath)
    if (!source) continue
    const imports = item.depth >= maxDepth ? [] : importedRepoPaths(source)
    visited.set(item.repoPath, {
      file: item.repoPath,
      depth: item.depth,
      imports,
      analysis: analyzeSource(source.text),
    })
    for (const imported of imports) {
      if (!visited.has(imported) && (/^(app|lib)\//.test(imported))) {
        queue.push({ repoPath: imported, depth: item.depth + 1 })
      }
    }
  }

  return Array.from(visited.values())
}

function analyzeSource(text) {
  return {
    importsSupabase: /@\/lib\/supabase|@supabase\/(?:supabase-js|ssr)/.test(text),
    createsSupabaseClient: /\bcreate(?:Admin|Server)?SupabaseClient(?:ForRequest)?\s*\(/.test(text),
    usesSupabaseIdentifier: /\bsupabase\b/.test(text),
    usesAliyunRds: /@\/lib\/aliyun-rds|DATABASE_URL_CN|\bqueryAliyunRds\b|\bwithAliyunRds/.test(text),
    tables: unique(Array.from(text.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g)).map((match) => match[1])),
    rpcs: unique(Array.from(text.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]\s*[,)]/g)).map((match) => match[1])),
    rdsTables: unique(Array.from(text.matchAll(/\bpublic\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g)).map((match) => match[1])),
  }
}

function capabilityForRoute(route) {
  const scope = String(route.scope || "")
  const path = String(route.route || "")
  if (scope === "account") return ["login_test_token", "profile_multi_tenant_permissions"]
  if (scope === "invites") return ["store_invite"]
  if (scope === "store-admin") return ["profile_multi_tenant_permissions", "store_manager_service_record_read"]
  if (path.includes("/store-profiles")) return ["profile_multi_tenant_permissions"]
  if (path.includes("/customer-profiles")) return ["service_record_long_recording", "store_manager_service_record_read"]
  if (scope === "service-records") return ["service_record_long_recording", "store_manager_service_record_read"]
  return []
}

function buildImplementationWorkPackages(routeGroups) {
  const byScope = new Map(routeGroups.map((group) => [group.scope, group]))
  return IMPLEMENTATION_WORK_PACKAGE_TEMPLATES.map((template, index) => {
    const group = byScope.get(template.scope) || {
      routeCount: 0,
      routes: [],
      tableNames: [],
      rpcNames: [],
      dataAccessFiles: [],
      rdsDataAccessFiles: [],
      routesStillUsingSupabaseDataAccess: 0,
    }
    const remainingSupabaseRoutes = group.routesStillUsingSupabaseDataAccess || 0
    return {
      id: template.id,
      order: index + 1,
      title: template.title,
      scope: template.scope,
      status: !group.routeCount
        ? "no_first_version_routes_observed"
        : remainingSupabaseRoutes > 0
          ? "blocked_until_repository_uses_database_url_cn"
          : "rds_repository_in_source_pending_runtime_evidence",
      routeCount: group.routeCount,
      routesStillUsingSupabaseDataAccess: remainingSupabaseRoutes,
      routes: group.routes,
      tableNames: group.tableNames,
      rpcNames: group.rpcNames,
      currentSupabaseDataAccessFiles: group.dataAccessFiles,
      rdsDataAccessFiles: group.rdsDataAccessFiles,
      proposedRepositoryFiles: template.proposedRepositoryFiles,
      blockedBy: unique(["DATABASE_URL_CN", "schema_data_rollback_validation", ...template.blockedBy]),
      acceptanceGates: template.acceptanceGates,
    }
  })
}

function buildReport(args) {
  const schemaMap = readJson(args.schemaMap)
  const bridgeMap = readJson(args.bridgeMap)
  const rdsPlan = runJson("rds_migration_plan", ["scripts/summarize-aliyun-rds-migration-plan.mjs"])
  const firstVersionByFile = new Map(
    (rdsPlan.firstVersionRdsRoutes || []).map((item) => [item.file, item]),
  )
  const firstVersionSupabaseDataAccessByFile = new Map(
    (rdsPlan.firstVersionRdsSupabaseDataAccessRoutes || []).map((item) => [item.file, item]),
  )
  const requiredTableNames = new Set((schemaMap.requiredTables || []).map((item) => item.name))
  const requiredFunctionNames = new Set((schemaMap.requiredFunctions || []).map((item) => item.name))
  const routes = (bridgeMap.routes || [])
    .filter((route) => firstVersionByFile.has(route.appFile))
    .map((route) => {
      const seedPaths = unique([route.appFile])
      const dependencies = collectDependencyGraph(seedPaths)
      const dataAccessFiles = dependencies.filter((file) =>
        file.analysis.tables.length
          || file.analysis.rpcs.length,
      )
      const rdsDataAccessFiles = dependencies.filter((file) => file.analysis.usesAliyunRds || file.analysis.rdsTables.length)
      const tables = unique(dataAccessFiles.flatMap((file) => file.analysis.tables))
      const rpcs = unique(dataAccessFiles.flatMap((file) => file.analysis.rpcs))
      const rdsTables = unique(rdsDataAccessFiles.flatMap((file) => file.analysis.rdsTables))
      const stillUsesSupabaseDataAccess = firstVersionSupabaseDataAccessByFile.has(route.appFile)
      return {
        route: route.route,
        methods: route.methods || [],
        scope: route.scope || "",
        appFile: route.appFile,
        sourceType: route.sourceType || "",
        sourceRoute: route.sourceRoute || "",
        sourceFiles: route.sourceFiles || [],
        sourcePages: route.sourcePages || [],
        productionCnStatus: route.productionCnStatus || "",
        firstVersionCapabilities: capabilityForRoute(route),
        stillUsesSupabaseDataAccess,
        usesAliyunRdsDataAccess: rdsDataAccessFiles.length > 0,
        directSupabaseDataAccess: firstVersionByFile.get(route.appFile)?.directSupabaseDataAccess === true,
        tableNames: tables,
        rpcNames: rpcs,
        rdsTableNames: rdsTables,
        dataAccessFiles: dataAccessFiles.map((file) => ({
          file: file.file,
          importsSupabase: file.analysis.importsSupabase,
          createsSupabaseClient: file.analysis.createsSupabaseClient,
          tableNames: file.analysis.tables,
          rpcNames: file.analysis.rpcs,
        })),
        rdsDataAccessFiles: rdsDataAccessFiles.map((file) => ({
          file: file.file,
          rdsTableNames: file.analysis.rdsTables,
        })),
        rdsMigrationStatus: stillUsesSupabaseDataAccess
          ? "blocked_until_route_repository_uses_database_url_cn"
          : "rds_repository_in_source_pending_runtime_evidence",
      }
    })

  const observedTables = unique(routes.flatMap((route) => [...route.tableNames, ...route.rdsTableNames]))
  const observedRpcs = unique(routes.flatMap((route) => route.rpcNames))
  const sharedDataAccessFiles = unique(routes.flatMap((route) => route.dataAccessFiles.map((item) => item.file)))
  const sharedRdsDataAccessFiles = unique(routes.flatMap((route) => route.rdsDataAccessFiles.map((item) => item.file)))
  const schemaMapMissingObservedTables = observedTables.filter((name) => !requiredTableNames.has(name))
  const schemaMapMissingObservedRpcs = observedRpcs.filter((name) => !requiredFunctionNames.has(name))
  const requiredTablesWithoutRouteObservation = unique(
    Array.from(requiredTableNames).filter((name) => !observedTables.includes(name)),
  )

  const routesByScope = new Map()
  for (const route of routes) {
    const scope = route.scope || "unknown"
    routesByScope.set(scope, [...(routesByScope.get(scope) || []), route])
  }
  const routeGroups = Array.from(routesByScope.entries())
    .map(([scope, group]) => ({
      scope,
      routeCount: group.length,
      routesStillUsingSupabaseDataAccess: group.filter((route) => route.stillUsesSupabaseDataAccess).length,
      routes: group.map((route) => route.route),
      tableNames: unique(group.flatMap((route) => [...route.tableNames, ...route.rdsTableNames])),
      rpcNames: unique(group.flatMap((route) => route.rpcNames)),
      dataAccessFiles: unique(group.flatMap((route) => route.dataAccessFiles.map((item) => item.file))),
      rdsDataAccessFiles: unique(group.flatMap((route) => route.rdsDataAccessFiles.map((item) => item.file))),
    }))
  const implementationWorkPackages = buildImplementationWorkPackages(routeGroups)

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    formalTarget: "Aliyun RDS PostgreSQL",
    currentSource: "Supabase migration source / legacy compatibility only",
    containsValues: false,
    readOnlyOnly: true,
    cloudApiCalled: false,
    mutationPerformed: false,
    summary: {
      bridgeRouteCount: (bridgeMap.routes || []).length,
      firstVersionRouteCount: routes.length,
      routesStillUsingSupabaseDataAccess: routes.filter((route) => route.stillUsesSupabaseDataAccess).length,
      routesUsingAliyunRdsDataAccess: routes.filter((route) => route.usesAliyunRdsDataAccess).length,
      sharedDataAccessFileCount: sharedDataAccessFiles.length,
      sharedRdsDataAccessFileCount: sharedRdsDataAccessFiles.length,
      observedTableCount: observedTables.length,
      observedRpcCount: observedRpcs.length,
      requiredTableCount: requiredTableNames.size,
      requiredFunctionCount: requiredFunctionNames.size,
      schemaMapMissingObservedTables,
      schemaMapMissingObservedRpcs,
      requiredTablesWithoutRouteObservation,
      implementationWorkPackageCount: implementationWorkPackages.length,
      proposedRepositoryFileCount: unique(
        implementationWorkPackages.flatMap((item) => item.proposedRepositoryFiles),
      ).length,
      rdsPlanRequiredBlocking: rdsPlan.summary?.requiredBlocking || [],
      blockedCredentialNames: ["DATABASE_URL_CN"],
    },
    routeGroups,
    implementationWorkPackages,
    routes,
    observedTables,
    observedRpcs,
    sharedDataAccessFiles,
    sharedRdsDataAccessFiles,
    rdsAdapterFiles: rdsPlan.inventory?.postgresAdapterFiles || [],
    nextRequiredActions: routes.filter((route) => route.stillUsesSupabaseDataAccess).length === 0
      ? [
          "Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou before importing DATABASE_URL_CN.",
          "Keep the APP-native RDS work packages in place and validate account, context, service-records, store-admin, and invites against migrated RDS data.",
          "Run schema/data migration, row-count validation, critical-record validation, APP API smoke, and rollback rehearsal.",
        ]
      : [
          "Create or confirm Aliyun RDS PostgreSQL in cn-hangzhou before importing DATABASE_URL_CN.",
          "Implement the RDS work packages in order: account, context, service-records, store-admin, then invites.",
          "For any first-version APP API route that still reports Supabase data access, replace that shared access with PostgreSQL repositories backed by DATABASE_URL_CN.",
          "Run schema/data migration, row-count validation, critical-record validation, APP API smoke, and rollback rehearsal.",
        ],
    safetyBoundary: [
      "This report scans local source and non-secret maps only.",
      "It does not connect to Supabase, Aliyun RDS, Vercel, or WeChat.",
      "It must not contain DATABASE_URL_CN, database passwords, dump contents, Supabase service role keys, AccessKeySecret, tokens, or cookies.",
    ],
  }

  const secretMatches = findSecretLikeValues(JSON.stringify(report))
  report.secretLeakCheck = {
    ok: secretMatches.length === 0,
    matches: secretMatches,
  }
  report.ok = report.secretLeakCheck.ok

  if (args.out) writeText(args.out, JSON.stringify(report, null, 2))
  if (args.markdown) writeText(args.markdown, renderMarkdown(report))
  return report
}

function findSecretLikeValues(text) {
  return SECRET_VALUE_PATTERNS.flatMap((pattern) => {
    const match = text.match(pattern)
    return match ? [match[0].slice(0, 80)] : []
  })
}

function renderMarkdown(report) {
  return [
    "# Aliyun RDS Route Migration Map",
    "",
    `- ok: ${report.ok}`,
    `- containsValues: ${report.containsValues}`,
    `- readOnlyOnly: ${report.readOnlyOnly}`,
    `- cloudApiCalled: ${report.cloudApiCalled}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- currentScope: ${report.currentScope}`,
    `- formalTarget: ${report.formalTarget}`,
    `- currentSource: ${report.currentSource}`,
    `- firstVersionRouteCount: ${report.summary.firstVersionRouteCount}`,
    `- routesStillUsingSupabaseDataAccess: ${report.summary.routesStillUsingSupabaseDataAccess}`,
    `- routesUsingAliyunRdsDataAccess: ${report.summary.routesUsingAliyunRdsDataAccess}`,
    `- sharedDataAccessFileCount: ${report.summary.sharedDataAccessFileCount}`,
    `- sharedRdsDataAccessFileCount: ${report.summary.sharedRdsDataAccessFileCount}`,
    `- implementationWorkPackageCount: ${report.summary.implementationWorkPackageCount}`,
    `- proposedRepositoryFileCount: ${report.summary.proposedRepositoryFileCount}`,
    `- observedTables: ${report.observedTables.join(", ") || "none"}`,
    `- observedRpcs: ${report.observedRpcs.join(", ") || "none"}`,
    `- schemaMapMissingObservedTables: ${report.summary.schemaMapMissingObservedTables.join(", ") || "none"}`,
    `- requiredTablesWithoutRouteObservation: ${report.summary.requiredTablesWithoutRouteObservation.join(", ") || "none"}`,
    `- blockedCredentialNames: ${report.summary.blockedCredentialNames.join(", ")}`,
    "",
    "## Route Groups",
    "",
    ...report.routeGroups.flatMap((group) => [
      `### ${group.scope}`,
      "",
      `- routeCount: ${group.routeCount}`,
      `- routesStillUsingSupabaseDataAccess: ${group.routesStillUsingSupabaseDataAccess}`,
      `- tableNames: ${group.tableNames.join(", ") || "none"}`,
      `- rpcNames: ${group.rpcNames.join(", ") || "none"}`,
      `- dataAccessFiles: ${group.dataAccessFiles.join(", ") || "none"}`,
      `- rdsDataAccessFiles: ${group.rdsDataAccessFiles.join(", ") || "none"}`,
      ...group.routes.map((route) => `- ${route}`),
      "",
    ]),
    "## Implementation Work Packages",
    "",
    ...report.implementationWorkPackages.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- order: ${item.order}`,
      `- title: ${item.title}`,
      `- status: ${item.status}`,
      `- scope: ${item.scope}`,
      `- routeCount: ${item.routeCount}`,
      `- routesStillUsingSupabaseDataAccess: ${item.routesStillUsingSupabaseDataAccess}`,
      `- routes: ${item.routes.join(", ") || "none"}`,
      `- tableNames: ${item.tableNames.join(", ") || "none"}`,
      `- rpcNames: ${item.rpcNames.join(", ") || "none"}`,
      `- currentSupabaseDataAccessFiles: ${item.currentSupabaseDataAccessFiles.join(", ") || "none"}`,
      `- rdsDataAccessFiles: ${item.rdsDataAccessFiles.join(", ") || "none"}`,
      `- proposedRepositoryFiles: ${item.proposedRepositoryFiles.join(", ") || "none"}`,
      `- blockedBy: ${item.blockedBy.join(", ") || "none"}`,
      ...item.acceptanceGates.map((gate) => `- acceptanceGate: ${gate}`),
      "",
    ]),
    "## Route Details",
    "",
    ...report.routes.flatMap((route) => [
      `### ${route.route}`,
      "",
      `- methods: ${route.methods.join(", ")}`,
      `- scope: ${route.scope}`,
      `- appFile: ${route.appFile}`,
      `- sourceRoute: ${route.sourceRoute || "none"}`,
      `- sourceFiles: ${route.sourceFiles.join(", ") || "none"}`,
      `- tableNames: ${route.tableNames.join(", ") || "none"}`,
      `- rpcNames: ${route.rpcNames.join(", ") || "none"}`,
      `- rdsTableNames: ${route.rdsTableNames.join(", ") || "none"}`,
      `- dataAccessFiles: ${route.dataAccessFiles.map((item) => item.file).join(", ") || "none"}`,
      `- rdsDataAccessFiles: ${route.rdsDataAccessFiles.map((item) => item.file).join(", ") || "none"}`,
      `- rdsMigrationStatus: ${route.rdsMigrationStatus}`,
      "",
    ]),
    "## Next Required Actions",
    "",
    ...report.nextRequiredActions.map((item) => `- ${item}`),
  ].join("\n")
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/generate-aliyun-rds-route-migration-map.mjs [--schema-map path] [--bridge-map path] [--out /tmp/map.json] [--markdown /tmp/map.md]",
    "",
    "Builds a non-secret first-version APP API route-to-RDS migration map.",
    "It scans local source only and does not connect to Supabase or Aliyun RDS.",
  ].join("\n"))
}

try {
  console.log(JSON.stringify(buildReport(parseArgs(process.argv)), null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
