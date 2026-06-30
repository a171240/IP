#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BACKEND_ROOT = resolve(__dirname, "..")
const DEFAULT_SCHEMA_MAP = resolve(BACKEND_ROOT, "deploy/aliyun-production-cn.rds-first-version-schema-map.json")
const ALLOW_ENV = "MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE"
const SMOKE_USER_ID = "00000000-0000-4000-8000-000000000001"
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
    execute: false,
    strict: false,
    schemaMap: DEFAULT_SCHEMA_MAP,
    out: "",
    markdown: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--") continue
    if (arg === "--execute") {
      args.execute = true
      continue
    }
    if (arg === "--strict") {
      args.strict = true
      continue
    }
    if (arg === "--schema-map") {
      args.schemaMap = resolveValue(argv[++index], "--schema-map")
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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function writeText(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, { mode: 0o600 })
}

function safeIdentifier(name, kind) {
  const value = String(name || "")
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`unsafe_${kind}_identifier:${value}`)
  }
  return value
}

function getRequiredNames(schemaMap, key) {
  const items = Array.isArray(schemaMap[key]) ? schemaMap[key] : []
  return items.map((item) => safeIdentifier(item?.name, key)).sort()
}

function findSecretLikeValues(value, path = "$", matches = []) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) matches.push(path)
    return matches
  }
  if (!value || typeof value !== "object") return matches
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeValues(item, `${path}[${index}]`, matches))
    return matches
  }
  for (const [key, nested] of Object.entries(value)) {
    findSecretLikeValues(nested, `${path}.${key}`, matches)
  }
  return matches
}

function classifyPgError(error) {
  const code = String(error?.code || "")
  const message = String(error?.message || "")
  if (code === "42883" || /gen_random_uuid|function .* does not exist/i.test(message)) {
    return "pgcrypto_or_function_missing"
  }
  if (["28P01", "28000", "3D000", "08000", "08001", "08003", "08004", "08006"].includes(code)) {
    return "database_connection_or_auth_failed"
  }
  if (/timeout|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|connection/i.test(message)) {
    return "database_network_or_timeout"
  }
  return "rds_runtime_smoke_failed"
}

function emptyRuntimeChecks(requiredTables, requiredFunctions) {
  return {
    extension: {
      status: "not_executed",
      evidence: "not_executed",
    },
    requestContext: {
      status: "not_executed",
      evidence: "not_executed",
    },
    schemaObjects: {
      status: "not_executed",
      requiredTableCount: requiredTables.length,
      presentTableCount: 0,
      missingTables: requiredTables,
      requiredFunctionCount: requiredFunctions.length,
      presentFunctionCount: 0,
      missingFunctions: requiredFunctions,
      evidence: "not_executed",
    },
  }
}

async function loadPgPool() {
  const pgModule = await import("pg")
  return (pgModule.default || pgModule).Pool
}

async function executeRuntimeSmoke(databaseUrl, requiredTables, requiredFunctions) {
  const Pool = await loadPgPool()
  const pool = new Pool({
    connectionString: databaseUrl,
    application_name: "meiye-huajing-rds-runtime-smoke",
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
  })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const extensionResult = await client.query("select gen_random_uuid() is not null as ok")
    const contextResult = await client.query(
      [
        "select",
        "set_config('app.current_user_id', $1, true) = $1 as configured,",
        "nullif(current_setting('app.current_user_id', true), '')::uuid = $1::uuid as roundtrip",
      ].join(" "),
      [SMOKE_USER_ID],
    )
    const tableResult = await client.query(
      [
        "select item_name, to_regclass('public.' || item_name) is not null as exists",
        "from unnest($1::text[]) as item_name",
        "order by item_name",
      ].join(" "),
      [requiredTables],
    )
    const functionResult = await client.query(
      [
        "select item_name, exists (",
        "  select 1 from pg_proc p",
        "  join pg_namespace n on n.oid = p.pronamespace",
        "  where n.nspname = 'public' and p.proname = item_name",
        ") as exists",
        "from unnest($1::text[]) as item_name",
        "order by item_name",
      ].join(" "),
      [requiredFunctions],
    )
    await client.query("ROLLBACK")

    const missingTables = tableResult.rows
      .filter((row) => row.exists !== true)
      .map((row) => String(row.item_name))
    const missingFunctions = functionResult.rows
      .filter((row) => row.exists !== true)
      .map((row) => String(row.item_name))
    const extensionOk = extensionResult.rows[0]?.ok === true
    const requestContextOk =
      contextResult.rows[0]?.configured === true && contextResult.rows[0]?.roundtrip === true
    return {
      ok: extensionOk && requestContextOk && missingTables.length === 0 && missingFunctions.length === 0,
      checks: {
        extension: {
          status: extensionOk ? "passed" : "failed",
          evidence: "gen_random_uuid_select_true",
        },
        requestContext: {
          status: requestContextOk ? "passed" : "failed",
          evidence: "set_config_app_current_user_id_parameterized_roundtrip",
        },
        schemaObjects: {
          status: missingTables.length === 0 && missingFunctions.length === 0 ? "passed" : "failed",
          requiredTableCount: requiredTables.length,
          presentTableCount: requiredTables.length - missingTables.length,
          missingTables,
          requiredFunctionCount: requiredFunctions.length,
          presentFunctionCount: requiredFunctions.length - missingFunctions.length,
          missingFunctions,
          evidence: "to_regclass_and_pg_proc_public_name_checks",
        },
      },
      failureCategory: "",
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // Ignore rollback errors; the sanitized failure category below is the evidence.
    }
    return {
      ok: false,
      checks: emptyRuntimeChecks(requiredTables, requiredFunctions),
      failureCategory: classifyPgError(error),
      pgErrorCode: String(error?.code || ""),
    }
  } finally {
    client.release()
    await pool.end()
  }
}

async function buildReport(args) {
  if (!existsSync(args.schemaMap)) throw new Error(`schema_map_missing:${args.schemaMap}`)
  const schemaMap = readJson(args.schemaMap)
  const requiredTables = getRequiredNames(schemaMap, "requiredTables")
  const requiredFunctions = getRequiredNames(schemaMap, "requiredFunctions")
  const blockers = []
  const warnings = []
  const databaseUrl = String(process.env.DATABASE_URL_CN || "").trim()
  const allowEnvSet = String(process.env[ALLOW_ENV] || "") === "1"
  let runtime = {
    ok: false,
    checks: emptyRuntimeChecks(requiredTables, requiredFunctions),
    failureCategory: "",
  }

  if (!args.execute) {
    blockers.push("execute_not_requested")
  } else if (!allowEnvSet) {
    blockers.push(`${ALLOW_ENV}=1`)
  } else if (!databaseUrl) {
    blockers.push("DATABASE_URL_CN")
  } else {
    runtime = await executeRuntimeSmoke(databaseUrl, requiredTables, requiredFunctions)
    if (!runtime.ok) {
      if (runtime.checks.extension.status !== "passed") blockers.push("rds_extension_support_unconfirmed")
      if (runtime.checks.requestContext.status !== "passed") blockers.push("backend_request_context_unconfirmed")
      if (runtime.checks.schemaObjects.missingTables.length) blockers.push("rds_required_tables_missing")
      if (runtime.checks.schemaObjects.missingFunctions.length) blockers.push("rds_required_functions_missing")
      if (runtime.failureCategory) blockers.push(runtime.failureCategory)
    }
  }

  const report = {
    ok: args.execute && allowEnvSet && Boolean(databaseUrl) && runtime.ok && blockers.length === 0,
    generatedAt: new Date().toISOString(),
    environment: "production-cn",
    currentScope: "backend_aliyun_only",
    executionMode: args.execute ? "execute_runtime_smoke" : "dry_run",
    containsValues: false,
    readOnlyOnly: true,
    mutationPerformed: false,
    cloudApiCalled: false,
    databaseConnected: args.execute && allowEnvSet && Boolean(databaseUrl) && !runtime.failureCategory,
    schemaMap: args.schemaMap,
    allowEnv: ALLOW_ENV,
    blockers: [...new Set(blockers)],
    warnings,
    runtimeChecks: runtime.checks,
    failureCategory: runtime.failureCategory || "",
    pgErrorCode: runtime.pgErrorCode || "",
    writebackFieldsWhenPassed: [
      "migration.rdsExtensionSupportConfirmed=true",
      "migration.schemaCompatibilityReviewed=true for backend request context disposition",
      "migration.appApiSmokeOnRdsPassed=true after API smoke also passes",
    ],
    forbiddenValues: [
      "DATABASE_URL_CN value",
      "database password",
      "customer row payloads",
      "dump contents",
      "Supabase service role key",
      "AccessKeySecret",
      "STS token",
      "cookie",
    ],
    nextActions: [
      "Create or confirm Aliyun RDS PostgreSQL and import DATABASE_URL_CN only into Aliyun secret env.",
      `Run with ${ALLOW_ENV}=1 and --execute only from a controlled operator shell after DATABASE_URL_CN is present.`,
      "Record only booleans, object names, counts, and non-secret evidence handles in local evidence files.",
    ],
  }

  const secretMatches = findSecretLikeValues(report)
  report.secretLeakCheck = {
    ok: secretMatches.length === 0,
    matches: secretMatches,
  }
  if (secretMatches.length) {
    report.ok = false
    report.containsValues = true
    report.blockers.push(`contains_secret_like_values:${secretMatches.join(",")}`)
  }
  return report
}

function renderMarkdown(report) {
  return [
    "# Aliyun RDS Runtime Smoke",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- ok: ${report.ok}`,
    `- executionMode: ${report.executionMode}`,
    `- containsValues: ${report.containsValues}`,
    `- mutationPerformed: ${report.mutationPerformed}`,
    `- databaseConnected: ${report.databaseConnected}`,
    `- blockers: ${report.blockers.join(", ") || "none"}`,
    `- failureCategory: ${report.failureCategory || "none"}`,
    "",
    "## Checks",
    "",
    `- extension: ${report.runtimeChecks.extension.status}`,
    `- requestContext: ${report.runtimeChecks.requestContext.status}`,
    `- schemaObjects: ${report.runtimeChecks.schemaObjects.status}`,
    `- requiredTableCount: ${report.runtimeChecks.schemaObjects.requiredTableCount}`,
    `- presentTableCount: ${report.runtimeChecks.schemaObjects.presentTableCount}`,
    `- missingTables: ${report.runtimeChecks.schemaObjects.missingTables.join(", ") || "none"}`,
    `- requiredFunctionCount: ${report.runtimeChecks.schemaObjects.requiredFunctionCount}`,
    `- presentFunctionCount: ${report.runtimeChecks.schemaObjects.presentFunctionCount}`,
    `- missingFunctions: ${report.runtimeChecks.schemaObjects.missingFunctions.join(", ") || "none"}`,
    "",
  ].join("\n")
}

function printHelp() {
  console.log(`Usage: node scripts/check-aliyun-rds-runtime-smoke.mjs [--execute] [--strict] [--out file] [--markdown file]

Default mode is a dry run and does not connect to RDS.
Execution requires --execute, DATABASE_URL_CN, and ${ALLOW_ENV}=1.
The report never prints DATABASE_URL_CN, database passwords, row payloads, or raw database errors.`)
}

const args = parseArgs(process.argv)
buildReport(args)
  .then((report) => {
    const rendered = JSON.stringify(report, null, 2)
    if (args.out) writeText(args.out, rendered)
    if (args.markdown) writeText(args.markdown, renderMarkdown(report))
    console.log(rendered)
    if (args.strict && !report.ok) process.exitCode = 1
  })
  .catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: String(error?.message || error),
      containsValues: false,
      mutationPerformed: false,
    }))
    process.exitCode = 1
  })
