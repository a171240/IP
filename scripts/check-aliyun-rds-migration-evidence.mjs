#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_TEMPLATE_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.example.json")
const DEFAULT_LOCAL_FILE = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-migration.local.json")
const EXPECTED_REGION = "cn-hangzhou"
const EXPECTED_PROVIDER = "Aliyun RDS PostgreSQL"
const EXPECTED_APP_API_ROUTE_COUNT = 30
const EXPECTED_APP_API_ROUTES_WITH_SUPABASE = 30
const EXPECTED_APP_API_ROUTES_WITH_SUPABASE_DATA_ACCESS = 29
const EXPECTED_FIRST_VERSION_RDS_ROUTE_COUNT = 25
const EXPECTED_FIRST_VERSION_RDS_ROUTES_WITH_SUPABASE = 25
const EXPECTED_FIRST_VERSION_RDS_ROUTES_WITH_SUPABASE_DATA_ACCESS = 25
const EXPECTED_DEFERRED_APP_API_ROUTE_COUNT = 5
const EXPECTED_DEFERRED_APP_API_ROUTES_WITH_SUPABASE_DATA_ACCESS = 4

const TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "environment",
  "updatedAt",
  "operator",
  "notes",
  "rdsPostgres",
  "sourceInventory",
  "migration",
  "security",
  "verifyCommands",
])

const REQUIRED_FIELDS = {
  rdsPostgres: [
    "confirmed",
    "provider",
    "region",
    "instanceId",
    "instanceName",
    "engine",
    "engineVersion",
    "networkAccess",
    "databaseName",
    "databaseAccountReady",
    "databaseUrlCnSecretImported",
    "databaseUrlCnSecretTarget",
    "evidence",
  ],
  sourceInventory: [
    "generatedBy",
    "appApiRouteCount",
    "appApiRoutesWithSupabase",
    "appApiRoutesWithSupabaseDataAccess",
    "firstVersionRdsRouteCount",
    "firstVersionRdsRoutesWithSupabase",
    "firstVersionRdsRoutesWithSupabaseDataAccess",
    "deferredAppApiRouteCount",
    "deferredAppApiRoutesWithSupabaseDataAccess",
    "tableCount",
    "rpcCount",
    "storageBucketCount",
    "databaseUrlCnReferencedInSource",
    "postgresDataAccessAdapterDetected",
    "evidence",
  ],
  migration: [
    "schemaInventoryReviewed",
    "dataAccessAdapterReady",
    "schemaMigrated",
    "dataMigrated",
    "rowCountValidationPassed",
    "criticalRecordValidationPassed",
    "appApiSmokeOnRdsPassed",
    "supabaseNoLongerFormalTarget",
    "rollbackRunbookReviewed",
    "rollbackValidationPassed",
    "evidence",
  ],
  security: [
    "containsDatabasePassword",
    "containsConnectionString",
    "containsSupabaseServiceRoleKey",
    "secretPolicy",
  ],
}

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /LTAI[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /:\/\/[^\s:@]+:[^\s@]+@/,
  /(password|passwd|pwd|token|secret|access[_-]?key)\s*[:=]\s*[^,\s]{8,}/i,
]

function parseArgs(argv) {
  const args = {
    templateFile: DEFAULT_TEMPLATE_FILE,
    localFile: DEFAULT_LOCAL_FILE,
    allowIncomplete: false,
    initLocal: false,
    outPath: "",
    markdownPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--template") {
      args.templateFile = resolveValue(argv[++index], "--template")
      continue
    }
    if (arg === "--local") {
      args.localFile = resolveValue(argv[++index], "--local")
      continue
    }
    if (arg === "--allow-incomplete") {
      args.allowIncomplete = true
      continue
    }
    if (arg === "--init-local") {
      args.initLocal = true
      continue
    }
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function text(value) {
  return String(value || "").trim()
}

function isTodo(value) {
  return text(value).startsWith("TODO_")
}

function isNonTodoText(value) {
  const valueText = text(value)
  return Boolean(valueText && !isTodo(valueText))
}

function missingObjectFields(data, objectName) {
  const value = data?.[objectName]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return REQUIRED_FIELDS[objectName].map((field) => `${objectName}.${field}`)
  }
  return REQUIRED_FIELDS[objectName]
    .filter((field) => !Object.prototype.hasOwnProperty.call(value, field))
    .map((field) => `${objectName}.${field}`)
}

function requireLocalField(data, path, blockers) {
  const [objectName, fieldName] = path.split(".")
  const value = data?.[objectName]?.[fieldName]
  if (typeof value === "string") {
    if (!value.trim()) blockers.push(`empty:${path}`)
    if (isTodo(value)) blockers.push(`todo:${path}`)
    return
  }
  if (value === null || typeof value === "undefined") blockers.push(`empty:${path}`)
}

function validateFile(filePath, mode, sourceInventory) {
  if (!existsSync(filePath)) {
    return {
      file: filePath,
      mode,
      exists: false,
      ready: false,
      blockers: ["file_missing"],
      warnings: [],
    }
  }

  const data = readJson(filePath)
  const blockers = []
  const warnings = []
  const unknownTopLevel = Object.keys(data).filter((field) => !TOP_LEVEL_FIELDS.has(field))
  if (unknownTopLevel.length) warnings.push(`unknown_top_level_fields:${unknownTopLevel.join(",")}`)
  if (data.schemaVersion !== 1) blockers.push("schemaVersion=1")
  if (data.environment !== "production-cn") blockers.push("environment=production-cn")

  for (const objectName of Object.keys(REQUIRED_FIELDS)) {
    blockers.push(...missingObjectFields(data, objectName).map((field) => `missing:${field}`))
  }

  const secretMatches = findSecretLikeValues(data)
  if (secretMatches.length) blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)

  validateCommonValues(data, blockers, sourceInventory)
  if (mode === "local") validateLocalValues(data, blockers)

  return {
    file: filePath,
    mode,
    exists: true,
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings,
    rdsPostgres: {
      confirmed: data.rdsPostgres?.confirmed === true,
      provider: data.rdsPostgres?.provider || "",
      region: data.rdsPostgres?.region || "",
      instanceIdReady: isNonTodoText(data.rdsPostgres?.instanceId),
      databaseAccountReady: data.rdsPostgres?.databaseAccountReady === true,
      databaseUrlCnSecretImported: data.rdsPostgres?.databaseUrlCnSecretImported === true,
    },
    sourceInventory: {
      appApiRouteCount: data.sourceInventory?.appApiRouteCount ?? 0,
      appApiRoutesWithSupabase: data.sourceInventory?.appApiRoutesWithSupabase ?? 0,
      appApiRoutesWithSupabaseDataAccess: data.sourceInventory?.appApiRoutesWithSupabaseDataAccess ?? 0,
      firstVersionRdsRouteCount: data.sourceInventory?.firstVersionRdsRouteCount ?? 0,
      firstVersionRdsRoutesWithSupabase: data.sourceInventory?.firstVersionRdsRoutesWithSupabase ?? 0,
      firstVersionRdsRoutesWithSupabaseDataAccess: data.sourceInventory?.firstVersionRdsRoutesWithSupabaseDataAccess ?? 0,
      deferredAppApiRouteCount: data.sourceInventory?.deferredAppApiRouteCount ?? 0,
      deferredAppApiRoutesWithSupabaseDataAccess: data.sourceInventory?.deferredAppApiRoutesWithSupabaseDataAccess ?? 0,
      databaseUrlCnReferencedInSource: data.sourceInventory?.databaseUrlCnReferencedInSource === true,
      postgresDataAccessAdapterDetected: data.sourceInventory?.postgresDataAccessAdapterDetected === true,
    },
    migration: {
      schemaInventoryReviewed: data.migration?.schemaInventoryReviewed === true,
      dataAccessAdapterReady: data.migration?.dataAccessAdapterReady === true,
      schemaMigrated: data.migration?.schemaMigrated === true,
      dataMigrated: data.migration?.dataMigrated === true,
      rowCountValidationPassed: data.migration?.rowCountValidationPassed === true,
      criticalRecordValidationPassed: data.migration?.criticalRecordValidationPassed === true,
      appApiSmokeOnRdsPassed: data.migration?.appApiSmokeOnRdsPassed === true,
      supabaseNoLongerFormalTarget: data.migration?.supabaseNoLongerFormalTarget === true,
      rollbackValidationPassed: data.migration?.rollbackValidationPassed === true,
    },
  }
}

function validateCommonValues(data, blockers, sourceInventory) {
  const rds = data.rdsPostgres || {}
  const inventory = data.sourceInventory || {}
  const security = data.security || {}

  if (rds.provider !== EXPECTED_PROVIDER) blockers.push(`rdsPostgres.provider=${EXPECTED_PROVIDER}`)
  if (rds.region !== EXPECTED_REGION) blockers.push(`rdsPostgres.region=${EXPECTED_REGION}`)
  if (rds.engine !== "PostgreSQL") blockers.push("rdsPostgres.engine=PostgreSQL")
  if (text(rds.databaseUrlCnSecretTarget) !== "Aliyun KMS / Secrets Manager / SAE secret env") {
    blockers.push("rdsPostgres.databaseUrlCnSecretTarget")
  }

  if (inventory.generatedBy !== "corepack pnpm aliyun:rds:migration:plan") {
    blockers.push("sourceInventory.generatedBy")
  }
  if (Number(inventory.appApiRouteCount) !== EXPECTED_APP_API_ROUTE_COUNT) {
    blockers.push(`sourceInventory.appApiRouteCount=${EXPECTED_APP_API_ROUTE_COUNT}`)
  }
  if (Number(inventory.appApiRoutesWithSupabase) !== EXPECTED_APP_API_ROUTES_WITH_SUPABASE) {
    blockers.push(`sourceInventory.appApiRoutesWithSupabase=${EXPECTED_APP_API_ROUTES_WITH_SUPABASE}`)
  }
  if (Number(inventory.appApiRoutesWithSupabaseDataAccess) !== EXPECTED_APP_API_ROUTES_WITH_SUPABASE_DATA_ACCESS) {
    blockers.push(`sourceInventory.appApiRoutesWithSupabaseDataAccess=${EXPECTED_APP_API_ROUTES_WITH_SUPABASE_DATA_ACCESS}`)
  }
  if (Number(inventory.firstVersionRdsRouteCount) !== EXPECTED_FIRST_VERSION_RDS_ROUTE_COUNT) {
    blockers.push(`sourceInventory.firstVersionRdsRouteCount=${EXPECTED_FIRST_VERSION_RDS_ROUTE_COUNT}`)
  }
  if (Number(inventory.firstVersionRdsRoutesWithSupabase) !== EXPECTED_FIRST_VERSION_RDS_ROUTES_WITH_SUPABASE) {
    blockers.push(`sourceInventory.firstVersionRdsRoutesWithSupabase=${EXPECTED_FIRST_VERSION_RDS_ROUTES_WITH_SUPABASE}`)
  }
  if (Number(inventory.firstVersionRdsRoutesWithSupabaseDataAccess) !== EXPECTED_FIRST_VERSION_RDS_ROUTES_WITH_SUPABASE_DATA_ACCESS) {
    blockers.push(`sourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess=${EXPECTED_FIRST_VERSION_RDS_ROUTES_WITH_SUPABASE_DATA_ACCESS}`)
  }
  if (Number(inventory.deferredAppApiRouteCount) !== EXPECTED_DEFERRED_APP_API_ROUTE_COUNT) {
    blockers.push(`sourceInventory.deferredAppApiRouteCount=${EXPECTED_DEFERRED_APP_API_ROUTE_COUNT}`)
  }
  if (Number(inventory.deferredAppApiRoutesWithSupabaseDataAccess) !== EXPECTED_DEFERRED_APP_API_ROUTES_WITH_SUPABASE_DATA_ACCESS) {
    blockers.push(`sourceInventory.deferredAppApiRoutesWithSupabaseDataAccess=${EXPECTED_DEFERRED_APP_API_ROUTES_WITH_SUPABASE_DATA_ACCESS}`)
  }
  if (Number(inventory.appApiRouteCount) !== Number(sourceInventory.summary?.appApiRouteCount || 0)) {
    blockers.push("sourceInventory.appApiRouteCount_mismatch_current_plan")
  }
  if (Number(inventory.appApiRoutesWithSupabase) !== Number(sourceInventory.summary?.appApiRoutesWithSupabase || 0)) {
    blockers.push("sourceInventory.appApiRoutesWithSupabase_mismatch_current_plan")
  }
  if (Number(inventory.appApiRoutesWithSupabaseDataAccess) !== Number(sourceInventory.summary?.appApiRoutesWithSupabaseDataAccess || 0)) {
    blockers.push("sourceInventory.appApiRoutesWithSupabaseDataAccess_mismatch_current_plan")
  }
  if (Number(inventory.firstVersionRdsRouteCount) !== Number(sourceInventory.summary?.firstVersionRdsRouteCount || 0)) {
    blockers.push("sourceInventory.firstVersionRdsRouteCount_mismatch_current_plan")
  }
  if (Number(inventory.firstVersionRdsRoutesWithSupabase) !== Number(sourceInventory.summary?.firstVersionRdsRoutesWithSupabase || 0)) {
    blockers.push("sourceInventory.firstVersionRdsRoutesWithSupabase_mismatch_current_plan")
  }
  if (Number(inventory.firstVersionRdsRoutesWithSupabaseDataAccess) !== Number(sourceInventory.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0)) {
    blockers.push("sourceInventory.firstVersionRdsRoutesWithSupabaseDataAccess_mismatch_current_plan")
  }
  if (Number(inventory.deferredAppApiRouteCount) !== Number(sourceInventory.summary?.deferredAppApiRouteCount || 0)) {
    blockers.push("sourceInventory.deferredAppApiRouteCount_mismatch_current_plan")
  }
  if (Number(inventory.deferredAppApiRoutesWithSupabaseDataAccess) !== Number(sourceInventory.summary?.deferredAppApiRoutesWithSupabaseDataAccess || 0)) {
    blockers.push("sourceInventory.deferredAppApiRoutesWithSupabaseDataAccess_mismatch_current_plan")
  }

  if (security.containsDatabasePassword !== false) blockers.push("security.containsDatabasePassword=false")
  if (security.containsConnectionString !== false) blockers.push("security.containsConnectionString=false")
  if (security.containsSupabaseServiceRoleKey !== false) blockers.push("security.containsSupabaseServiceRoleKey=false")
  if (!text(security.secretPolicy).includes("Do not store DATABASE_URL_CN")) blockers.push("security.secretPolicy")
}

function validateLocalValues(data, blockers) {
  const requiredLocalPaths = [
    "rdsPostgres.instanceId",
    "rdsPostgres.instanceName",
    "rdsPostgres.engineVersion",
    "rdsPostgres.networkAccess",
    "rdsPostgres.databaseName",
    "rdsPostgres.evidence",
    "sourceInventory.evidence",
    "migration.evidence",
  ]
  for (const path of requiredLocalPaths) requireLocalField(data, path, blockers)

  const rds = data.rdsPostgres || {}
  const migration = data.migration || {}
  if (rds.confirmed !== true) blockers.push("rdsPostgres.confirmed")
  if (rds.databaseAccountReady !== true) blockers.push("rdsPostgres.databaseAccountReady")
  if (rds.databaseUrlCnSecretImported !== true) blockers.push("rdsPostgres.databaseUrlCnSecretImported")

  for (const field of [
    "schemaInventoryReviewed",
    "dataAccessAdapterReady",
    "schemaMigrated",
    "dataMigrated",
    "rowCountValidationPassed",
    "criticalRecordValidationPassed",
    "appApiSmokeOnRdsPassed",
    "supabaseNoLongerFormalTarget",
    "rollbackRunbookReviewed",
    "rollbackValidationPassed",
  ]) {
    if (migration[field] !== true) blockers.push(`migration.${field}`)
  }
}

function runRdsMigrationPlan() {
  const result = spawnSync(process.execPath, ["scripts/summarize-aliyun-rds-migration-plan.mjs"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`rds_migration_plan_failed:${result.status}\n${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

function buildInitialLocalEvidence(sourceInventory) {
  const summary = sourceInventory.summary || {}
  const schemaMapReady = summary.schemaMapReady === true
  const bridgeMapReady = sourceInventory.inventory?.bridgeMap?.ready === true
  const schemaMapFile = sourceInventory.inventory?.schemaMap?.file || "deploy/aliyun-production-cn.rds-first-version-schema-map.json"
  const bridgeMapFile = sourceInventory.inventory?.bridgeMap?.file || "deploy/app-api-production-cn.bridge-map.json"

  return {
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: new Date().toISOString(),
    operator: "codex-local-rds-evidence-init",
    notes: "Generated by aliyun:rds:migration:evidence:init. This file is ignored by git and contains only non-secret local evidence handles and TODO placeholders. It does not prove RDS has been created or migrated.",
    rdsPostgres: {
      confirmed: false,
      provider: EXPECTED_PROVIDER,
      region: EXPECTED_REGION,
      instanceId: "TODO_NON_SECRET_RDS_INSTANCE_ID_AFTER_P11_AUTHORIZATION",
      instanceName: "meiye-huajing-app-api-production-cn",
      engine: "PostgreSQL",
      engineVersion: "TODO_POSTGRES_VERSION_AFTER_RDS_CREATED",
      networkAccess: "TODO_VPC_OR_SAE_INTERNAL_ACCESS_AFTER_RDS_CREATED",
      databaseName: "TODO_DATABASE_NAME_AFTER_RDS_CREATED",
      databaseAccountReady: false,
      databaseUrlCnSecretImported: false,
      databaseUrlCnSecretTarget: "Aliyun KMS / Secrets Manager / SAE secret env",
      evidence: "TODO_NON_SECRET_RDS_CONSOLE_EVIDENCE_AFTER_P11_AUTHORIZATION",
    },
    sourceInventory: {
      generatedBy: "corepack pnpm aliyun:rds:migration:plan",
      appApiRouteCount: Number(summary.appApiRouteCount || 0),
      appApiRoutesWithSupabase: Number(summary.appApiRoutesWithSupabase || 0),
      appApiRoutesWithSupabaseDataAccess: Number(summary.appApiRoutesWithSupabaseDataAccess || 0),
      firstVersionRdsRouteCount: Number(summary.firstVersionRdsRouteCount || 0),
      firstVersionRdsRoutesWithSupabase: Number(summary.firstVersionRdsRoutesWithSupabase || 0),
      firstVersionRdsRoutesWithSupabaseDataAccess: Number(summary.firstVersionRdsRoutesWithSupabaseDataAccess || 0),
      deferredAppApiRouteCount: Number(summary.deferredAppApiRouteCount || 0),
      deferredAppApiRoutesWithSupabaseDataAccess: Number(summary.deferredAppApiRoutesWithSupabaseDataAccess || 0),
      tableCount: Number(summary.tableCount || 0),
      rpcCount: Number(summary.rpcCount || 0),
      storageBucketCount: Number(summary.storageBucketCount || 0),
      databaseUrlCnReferencedInSource: summary.databaseUrlCnReferencedInSource === true,
      postgresDataAccessAdapterDetected: summary.postgresDataAccessAdapterDetected === true,
      evidence: `generated_from_current_source_inventory; planGeneratedAt=${sourceInventory.generatedAt}; adapter=lib/aliyun-rds/postgres.server.ts; schemaMap=${schemaMapFile}; bridgeMap=${bridgeMapFile}; firstVersionRdsRoutes=${Number(summary.firstVersionRdsRouteCount || 0)}; firstVersionSupabaseDataAccessRoutes=${Number(summary.firstVersionRdsRoutesWithSupabaseDataAccess || 0)}`,
    },
    migration: {
      schemaInventoryReviewed: schemaMapReady && bridgeMapReady,
      dataAccessAdapterReady: false,
      schemaMigrated: false,
      dataMigrated: false,
      rowCountValidationPassed: false,
      criticalRecordValidationPassed: false,
      appApiSmokeOnRdsPassed: false,
      supabaseNoLongerFormalTarget: false,
      rollbackRunbookReviewed: false,
      rollbackValidationPassed: false,
      evidence: schemaMapReady && bridgeMapReady
        ? "local_schema_inventory_ready; schema and bridge maps are non-secret and tracked; TODO_NON_SECRET_MIGRATION_AND_ROLLBACK_EVIDENCE_AFTER_RDS_AUTHORIZATION"
        : "TODO_NON_SECRET_MIGRATION_AND_ROLLBACK_EVIDENCE_AFTER_RDS_AUTHORIZATION",
    },
    security: {
      containsDatabasePassword: false,
      containsConnectionString: false,
      containsSupabaseServiceRoleKey: false,
      secretPolicy: "Do not store DATABASE_URL_CN, database password, dump contents, Supabase service role key, AccessKeySecret, AppSecret, STS token, or cookie in git, JSON, Markdown, Docker image, APP bundle, or mini-program package.",
    },
    verifyCommands: [
      "corepack pnpm aliyun:rds:migration:plan",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:env:check",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
  }
}

function initLocalEvidence(localFile, sourceInventory) {
  if (existsSync(localFile)) {
    return {
      requested: true,
      written: false,
      skipped: true,
      reason: "local_file_already_exists",
      file: localFile,
    }
  }

  const initialEvidence = buildInitialLocalEvidence(sourceInventory)
  const secretLikePaths = findSecretLikeValues(initialEvidence)
  if (secretLikePaths.length > 0) {
    throw new Error(`init_local_secret_like_values:${secretLikePaths.join(",")}`)
  }
  writeOutput(localFile, JSON.stringify(initialEvidence, null, 2))
  return {
    requested: true,
    written: true,
    skipped: false,
    file: localFile,
    fieldsInitialized: [
      "rdsPostgres",
      "sourceInventory",
      "migration",
      "security",
    ],
  }
}

function buildWritebackPlan(localValidation) {
  const blockerFields = uniqueStrings(localValidation.blockers.map(fieldFromBlocker))
  const groups = [
    {
      id: "rdsInstanceAndSecret",
      title: "RDS PostgreSQL 实例、数据库账号和 DATABASE_URL_CN secret env",
      canStartNow: true,
      requiresActionTimeConfirmation: true,
      requiredAuthorizationPackets: ["P11_ALIYUN_RDS_DATA_MIGRATION"],
      blockerFields: blockerFields.filter((field) =>
        field.startsWith("rdsPostgres.") || field === "file_missing"),
      writeTargets: [
        "deploy/aliyun-production-cn.rds-migration.local.json -> rdsPostgres.* non-secret evidence",
        "/Users/Admin/Documents/美业话镜APP/.env.production-cn.local -> DATABASE_URL_CN status only, never committed",
        "Aliyun KMS / Secrets Manager / SAE secret env -> DATABASE_URL_CN value",
      ],
      expectedEvidence: [
        "RDS PostgreSQL instance exists in cn-hangzhou",
        "database account and database are ready",
        "DATABASE_URL_CN imported only through secret env",
      ],
      forbidden: [
        "Do not record database password or connection string value",
        "Do not store DATABASE_URL_CN in git, JSON, Markdown, Docker image, APP bundle, or mini-program package",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:rds:migration:evidence",
        "corepack pnpm aliyun:env:check",
      ],
    },
    {
      id: "schemaDataAndRollback",
      title: "Supabase 到 RDS/PostgreSQL schema、data 和 rollback 验收",
      canStartNow: false,
      dependsOnGroups: ["rdsInstanceAndSecret"],
      requiresActionTimeConfirmation: true,
      requiredAuthorizationPackets: ["P11_ALIYUN_RDS_DATA_MIGRATION"],
      blockerFields: blockerFields.filter((field) =>
        field.startsWith("migration.") || field.startsWith("sourceInventory.")),
      writeTargets: [
        "deploy/aliyun-production-cn.rds-migration.local.json -> sourceInventory / migration non-secret evidence",
        "release manifest / migration report -> non-secret migration evidence handle",
      ],
      expectedEvidence: [
        "APP API data access adapter uses RDS/PostgreSQL as formal production-cn data layer",
        "schema and data migration validated",
        "row counts, critical records, APP API smoke, and rollback validation passed",
      ],
      forbidden: [
        "Do not run destructive migration without reviewed migration and rollback plan",
        "Do not store dump contents, customer data, Supabase service role key, or database password in reports",
      ],
      verifyCommands: [
        "corepack pnpm aliyun:rds:migration:plan",
        "corepack pnpm aliyun:rds:migration:evidence:strict",
        "corepack pnpm aliyun:completion:audit",
      ],
    },
  ]

  return {
    groups,
    blockingGroups: groups.filter((group) => group.blockerFields.length > 0).map((group) => group.id),
    requiredAuthorizationPackets: uniqueStrings(groups.flatMap((group) => group.requiredAuthorizationPackets)),
  }
}

function summarize(template, local, sourceInventory) {
  const writebackPlan = buildWritebackPlan(local)
  return {
    templateReady: template.ready,
    localExists: local.exists,
    localReady: local.ready,
    migrationReady: local.ready,
    totalBlockers: template.blockers.length + local.blockers.length,
    totalWarnings: template.warnings.length + local.warnings.length,
    appApiRouteCount: sourceInventory.summary?.appApiRouteCount || 0,
    appApiRoutesWithSupabase: sourceInventory.summary?.appApiRoutesWithSupabase || 0,
    appApiRoutesWithSupabaseDataAccess: sourceInventory.summary?.appApiRoutesWithSupabaseDataAccess || 0,
    firstVersionRdsRouteCount: sourceInventory.summary?.firstVersionRdsRouteCount || 0,
    firstVersionRdsRoutesWithSupabase: sourceInventory.summary?.firstVersionRdsRoutesWithSupabase || 0,
    firstVersionRdsRoutesWithSupabaseDataAccess: sourceInventory.summary?.firstVersionRdsRoutesWithSupabaseDataAccess || 0,
    deferredAppApiRouteCount: sourceInventory.summary?.deferredAppApiRouteCount || 0,
    deferredAppApiRoutesWithSupabaseDataAccess: sourceInventory.summary?.deferredAppApiRoutesWithSupabaseDataAccess || 0,
    databaseUrlCnReferencedInSource: sourceInventory.summary?.databaseUrlCnReferencedInSource === true,
    postgresDataAccessAdapterDetected: sourceInventory.summary?.postgresDataAccessAdapterDetected === true,
    writebackBlockingGroups: writebackPlan.blockingGroups,
    requiredAuthorizationPackets: writebackPlan.requiredAuthorizationPackets,
  }
}

function buildReport(args) {
  let localInit = {
    requested: args.initLocal === true,
    written: false,
    skipped: false,
  }
  if (args.initLocal) {
    const initSourceInventory = runRdsMigrationPlan()
    localInit = initLocalEvidence(args.localFile, initSourceInventory)
  }

  const sourceInventory = runRdsMigrationPlan()
  const template = validateFile(args.templateFile, "template", sourceInventory)
  const local = validateFile(args.localFile, "local", sourceInventory)
  const writebackPlan = buildWritebackPlan(local)
  const summary = summarize(template, local, sourceInventory)
  const ready = template.ready && local.ready
  const report = {
    ok: ready,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    currentAnswer: ready
      ? "RDS migration evidence is ready; continue with strict completion audit before production-cn deploy."
      : "RDS migration evidence is not ready; this report lists the non-secret fields that must be filled after authorized RDS creation and migration validation.",
    files: {
      template: args.templateFile,
      local: args.localFile,
    },
    localInit,
    template,
    local,
    sourceInventory: {
      currentDataLayer: sourceInventory.currentDataLayer,
      formalTarget: sourceInventory.formalTarget,
      migrationReady: sourceInventory.migrationReady === true,
      summary: sourceInventory.summary,
      inventory: sourceInventory.inventory,
    },
    summary,
    writebackPlan,
    strictVerificationOrder: [
      "corepack pnpm aliyun:rds:migration:plan",
      "corepack pnpm aliyun:rds:migration:evidence:strict",
      "corepack pnpm aliyun:env:check",
      "corepack pnpm aliyun:completion:audit",
      "corepack pnpm aliyun:predeploy",
    ],
    safetyBoundary: [
      "This checker never connects to Supabase, Aliyun RDS, Vercel, or WeChat.",
      "Only non-secret evidence handles, booleans, resource names, and counts may be stored in the .local.json evidence file.",
      "DATABASE_URL_CN, database password, dump contents, Supabase service role key, AccessKeySecret, AppSecret, STS token, and cookies must never be written to JSON, Markdown, Docker image, APP bundle, mini-program package, or git.",
    ],
  }
  const secretLikePaths = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretLikePaths.length === 0,
    matches: secretLikePaths,
  }
  if (secretLikePaths.length > 0) {
    report.ok = false
    report.containsValues = true
  }
  return report
}

function renderMarkdown(report) {
  return [
    "# APP production-cn RDS migration evidence check",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Conclusion",
    "",
    `- ok: ${report.ok}`,
    `- templateReady: ${report.summary.templateReady}`,
    `- localExists: ${report.summary.localExists}`,
    `- localReady: ${report.summary.localReady}`,
    `- migrationReady: ${report.summary.migrationReady}`,
    `- appApiRoutesWithSupabase: ${report.summary.appApiRoutesWithSupabase}/${report.summary.appApiRouteCount}`,
    `- appApiRoutesWithSupabaseDataAccess: ${report.summary.appApiRoutesWithSupabaseDataAccess}/${report.summary.appApiRouteCount}`,
    `- firstVersionRdsRoutesWithSupabaseDataAccess: ${report.summary.firstVersionRdsRoutesWithSupabaseDataAccess}/${report.summary.firstVersionRdsRouteCount}`,
    `- deferredAppApiRoutesWithSupabaseDataAccess: ${report.summary.deferredAppApiRoutesWithSupabaseDataAccess}/${report.summary.deferredAppApiRouteCount}`,
    `- databaseUrlCnReferencedInSource: ${report.summary.databaseUrlCnReferencedInSource}`,
    `- postgresDataAccessAdapterDetected: ${report.summary.postgresDataAccessAdapterDetected}`,
    `- writebackBlockingGroups: ${report.summary.writebackBlockingGroups.join(", ") || "none"}`,
    `- requiredAuthorizationPackets: ${report.summary.requiredAuthorizationPackets.join(", ") || "none"}`,
    "",
    "## Files",
    "",
    `- template: ${report.files.template}`,
    `- local: ${report.files.local}`,
    "",
    "## Local Blockers",
    "",
    ...(report.local.blockers.length ? report.local.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Writeback Plan",
    "",
    ...report.writebackPlan.groups.flatMap((group) => [
      `### ${group.id}`,
      "",
      `- canStartNow: ${group.canStartNow}`,
      group.dependsOnGroups?.length ? `- dependsOnGroups: ${group.dependsOnGroups.join(", ")}` : "- dependsOnGroups: none",
      `- requiredAuthorizationPackets: ${group.requiredAuthorizationPackets.join(", ")}`,
      `- blockerFields: ${group.blockerFields.join(", ") || "none"}`,
      `- writeTargets: ${group.writeTargets.join("; ")}`,
      `- expectedEvidence: ${group.expectedEvidence.join("; ")}`,
      `- forbidden: ${group.forbidden.join("; ")}`,
      `- verifyCommands: ${group.verifyCommands.join("; ")}`,
      "",
    ]),
    "## Strict Verification Order",
    "",
    ...report.strictVerificationOrder.map((item) => `- ${item}`),
    "",
    "## Safety Boundary",
    "",
    ...report.safetyBoundary.map((item) => `- ${item}`),
    "",
  ].join("\n")
}

function findSecretLikeValues(value, path = "$") {
  const matches = []
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => matches.push(...findSecretLikeValues(item, `${path}[${index}]`)))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    matches.push(...findSecretLikeValues(nested, `${path}.${key}`))
  }
  return matches
}

function fieldFromBlocker(value) {
  const blocker = String(value || "")
  const prefixed = blocker.match(/^(?:missing|todo|empty):(.+)$/)
  if (prefixed) return prefixed[1]
  const expected = blocker.match(/^([^=]+)=/)
  if (expected) return expected[1]
  return blocker
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const item = String(value || "").trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function writeOutput(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 })
}

function main() {
  const args = parseArgs(process.argv)
  const report = buildReport(args)
  if (args.outPath) writeOutput(args.outPath, JSON.stringify(report, null, 2))
  if (args.markdownPath) writeOutput(args.markdownPath, renderMarkdown(report))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok && !args.allowIncomplete) process.exit(1)
  if (!report.secretLeakCheck.ok) process.exit(1)
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/check-aliyun-rds-migration-evidence.mjs [--allow-incomplete] [--init-local] [--out path] [--markdown path]",
    "",
    "Validates non-secret RDS PostgreSQL migration evidence for APP production-cn.",
    "--init-local creates the ignored local evidence file when it is missing. It writes only TODO placeholders, counts, booleans, and non-secret evidence handles.",
    "Strict mode requires deploy/aliyun-production-cn.rds-migration.local.json to prove RDS, migration, and rollback closure.",
  ].join("\n"))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
