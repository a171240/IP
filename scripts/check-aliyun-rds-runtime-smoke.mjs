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
const POSTGRES_CONSTRAINT_TYPES = Object.freeze({
  check: "c",
  foreign_key: "f",
  primary_key: "p",
  unique: "u",
})
const POSTGRES_DELETE_ACTIONS = Object.freeze({
  cascade: "c",
  restrict: "r",
  set_default: "d",
  set_null: "n",
  no_action: "a",
})
const ALLOWED_NODE_PG_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
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

function requiredString(value, kind) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`required_${kind}_string`)
  }
  return value
}

function requiredBoolean(value, kind) {
  if (typeof value !== "boolean") throw new Error(`required_${kind}_boolean`)
  return value
}

function safeIdentifierList(value, kind) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`required_${kind}_list`)
  return value.map((item) => safeIdentifier(item, kind))
}

function getRequiredNames(schemaMap, key) {
  const items = Array.isArray(schemaMap[key]) ? schemaMap[key] : []
  return items.map((item) => safeIdentifier(item?.name, key)).sort()
}

function getRequiredSchemaContract(schemaMap) {
  const tableItems = Array.isArray(schemaMap.requiredTables) ? schemaMap.requiredTables : []
  const tables = []
  const columns = []
  const constraints = []
  const indexes = []

  for (const table of tableItems) {
    const tableName = safeIdentifier(table?.name, "requiredTables")
    tables.push(tableName)
    for (const column of table?.requiredColumns || []) {
      if (!column || typeof column !== "object" || Array.isArray(column)) {
        throw new Error(`required_column_contract:${tableName}`)
      }
      columns.push({
        table_name: tableName,
        column_name: safeIdentifier(column.name, "requiredColumns"),
        data_type: requiredString(column.dataType, "column_data_type"),
        udt_name: requiredString(column.udtName, "column_udt_name"),
        nullable: requiredBoolean(column.nullable, "column_nullable"),
        default_expression:
          column.defaultExpression === null
            ? null
            : requiredString(column.defaultExpression, "column_default_expression"),
      })
    }
    for (const constraint of table?.requiredConstraints || []) {
      const type = String(constraint?.type || "")
      const postgresType = POSTGRES_CONSTRAINT_TYPES[type]
      if (!postgresType) throw new Error(`unsupported_constraint_type:${type}`)
      const columnNames = safeIdentifierList(constraint?.columns, "constraint_columns")
      const checkExpression =
        postgresType === "c"
          ? requiredString(constraint?.checkExpression, "constraint_check_expression")
          : null
      const referencedTable =
        postgresType === "f"
          ? safeIdentifier(constraint?.referencedTable, "constraint_referenced_table")
          : null
      const referencedColumns =
        postgresType === "f"
          ? safeIdentifierList(constraint?.referencedColumns, "constraint_referenced_columns")
          : []
      const onDelete = postgresType === "f" ? String(constraint?.onDelete || "") : ""
      const onDeleteCode = postgresType === "f" ? POSTGRES_DELETE_ACTIONS[onDelete] : null
      if (postgresType === "f" && !onDeleteCode) {
        throw new Error(`unsupported_foreign_key_delete_action:${onDelete}`)
      }
      const expectedValidated = requiredBoolean(constraint?.validated, "constraint_validated")
      if (!expectedValidated) throw new Error(`required_constraint_validated_true:${String(constraint?.name || "")}`)
      constraints.push({
        table_name: tableName,
        constraint_name: safeIdentifier(constraint?.name, "requiredConstraints"),
        constraint_type: postgresType,
        column_names: columnNames,
        check_expression: checkExpression,
        referenced_table: referencedTable,
        referenced_column_names: referencedColumns,
        delete_action: onDeleteCode,
        expected_validated: expectedValidated,
      })
    }
    for (const index of table?.requiredIndexes || []) {
      if (typeof index?.unique !== "boolean") {
        throw new Error(`required_index_unique_boolean:${String(index?.name || "")}`)
      }
      const method = safeIdentifier(index?.method, "requiredIndexMethod")
      if (method !== "btree") throw new Error(`unsupported_required_index_method:${method}`)
      if (!Array.isArray(index?.columns) || index.columns.length === 0) {
        throw new Error(`required_index_columns:${String(index?.name || "")}`)
      }
      const indexColumns = index.columns.map((column) => {
        const direction = String(column?.direction || "")
        if (!new Set(["ASC", "DESC"]).has(direction)) {
          throw new Error(`required_index_direction:${direction}`)
        }
        return {
          name: safeIdentifier(column?.name, "requiredIndexColumns"),
          direction,
        }
      })
      if (index.predicate !== null || index.expression !== null) {
        throw new Error(`required_plain_index_only:${String(index?.name || "")}`)
      }
      const expectedValid = requiredBoolean(index.valid, "index_valid")
      const expectedReady = requiredBoolean(index.ready, "index_ready")
      if (!expectedValid || !expectedReady) {
        throw new Error(`required_index_valid_and_ready:${String(index?.name || "")}`)
      }
      indexes.push({
        table_name: tableName,
        index_name: safeIdentifier(index?.name, "requiredIndexes"),
        expected_method: method,
        column_names: indexColumns.map((column) => column.name),
        directions: indexColumns.map((column) => column.direction),
        expected_unique: index.unique,
        expected_valid: expectedValid,
        expected_ready: expectedReady,
      })
    }
  }

  tables.sort()
  columns.sort((left, right) => `${left.table_name}.${left.column_name}`.localeCompare(`${right.table_name}.${right.column_name}`))
  constraints.sort((left, right) => `${left.table_name}.${left.constraint_name}`.localeCompare(`${right.table_name}.${right.constraint_name}`))
  indexes.sort((left, right) => `${left.table_name}.${left.index_name}`.localeCompare(`${right.table_name}.${right.index_name}`))
  return { columns, constraints, indexes, tables }
}

export function isRequiredColumnContractSatisfied(row) {
  return row?.exists === true &&
    row?.data_type_matches === true &&
    row?.udt_name_matches === true &&
    row?.nullable_matches === true &&
    row?.default_matches === true
}

export function isRequiredConstraintContractSatisfied(row) {
  return row?.exists === true &&
    row?.type_matches === true &&
    row?.columns_match === true &&
    row?.check_definition_matches === true &&
    row?.foreign_key_target_matches === true &&
    row?.delete_action_matches === true &&
    row?.validated === true
}

export function isRequiredIndexContractSatisfied(row) {
  return row?.exists === true &&
    row?.method_matches === true &&
    row?.columns_match === true &&
    row?.directions_match === true &&
    row?.unique_matches === true &&
    row?.no_predicate === true &&
    row?.no_expression === true &&
    row?.no_extra_columns === true &&
    row?.valid === true &&
    row?.ready === true
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

export function sanitizePgErrorCode(value) {
  const code = typeof value === "string" ? value : ""
  if (/^[0-9A-Z]{5}$/.test(code)) return code
  return ALLOWED_NODE_PG_ERROR_CODES.has(code) ? code : ""
}

export function classifyPgError(error, operation = "") {
  const code = sanitizePgErrorCode(error?.code)
  if (code === "42883" && operation === "gen_random_uuid_extension_probe") {
    return "pgcrypto_or_function_missing"
  }
  if (["28P01", "28000", "3D000"].includes(code)) {
    return "database_connection_or_auth_failed"
  }
  if (["08000", "08001", "08003", "08004", "08006", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"].includes(code)) {
    return "database_network_or_timeout"
  }
  return "rds_runtime_smoke_failed"
}

function emptyRuntimeChecks(schemaContract, requiredFunctions) {
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
      requiredTableCount: schemaContract.tables.length,
      presentTableCount: 0,
      missingTables: schemaContract.tables,
      requiredColumnCount: schemaContract.columns.length,
      presentColumnCount: 0,
      missingColumns: schemaContract.columns.map((item) => `${item.table_name}.${item.column_name}`),
      requiredConstraintCount: schemaContract.constraints.length,
      presentConstraintCount: 0,
      missingConstraints: schemaContract.constraints.map((item) => `${item.table_name}.${item.constraint_name}`),
      requiredIndexCount: schemaContract.indexes.length,
      presentIndexCount: 0,
      missingIndexes: schemaContract.indexes.map((item) => `${item.table_name}.${item.index_name}`),
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

async function executeRuntimeSmoke(databaseUrl, schemaContract, requiredFunctions) {
  let pool = null
  let client = null
  let operation = "load_pg_pool"
  let runtimeResult
  let cleanupFailed = false
  try {
    const Pool = await loadPgPool()
    operation = "construct_pg_pool"
    pool = new Pool({
      connectionString: databaseUrl,
      application_name: "meiye-huajing-rds-runtime-smoke",
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 1_000,
    })
    operation = "pool_connect"
    client = await pool.connect()
    operation = "begin_read_only"
    await client.query("BEGIN READ ONLY")
    operation = "gen_random_uuid_extension_probe"
    const extensionResult = await client.query("select gen_random_uuid() is not null as ok")
    operation = "request_context_probe"
    const contextResult = await client.query(
      [
        "select",
        "set_config('app.current_user_id', $1, true) = $1 as configured,",
        "nullif(current_setting('app.current_user_id', true), '')::uuid = $1::uuid as roundtrip",
      ].join(" "),
      [SMOKE_USER_ID],
    )
    operation = "required_table_contract_query"
    const tableResult = await client.query(
      [
        "select item_name, to_regclass('public.' || item_name) is not null as exists",
        "from unnest($1::text[]) as item_name",
        "order by item_name",
      ].join(" "),
      [schemaContract.tables],
    )
    operation = "required_column_contract_query"
    const columnResult = await client.query(
      [
        "select required.table_name, required.column_name,",
        "  c.column_name is not null as exists,",
        "  c.data_type is not distinct from required.data_type as data_type_matches,",
        "  c.udt_name is not distinct from required.udt_name as udt_name_matches,",
        "  (c.is_nullable = case when required.nullable then 'YES' else 'NO' end) as nullable_matches,",
        "  case",
        "    when required.default_expression is null then c.column_default is null",
        "    else regexp_replace(coalesce(c.column_default, ''), '\\s+', ' ', 'g') = regexp_replace(required.default_expression, '\\s+', ' ', 'g')",
        "  end as default_matches",
        "from jsonb_to_recordset($1::jsonb) as required(",
        "  table_name text, column_name text, data_type text, udt_name text, nullable boolean, default_expression text",
        ")",
        "left join information_schema.columns c",
        "  on c.table_schema = 'public'",
        " and c.table_name = required.table_name",
        " and c.column_name = required.column_name",
        "order by required.table_name, required.column_name",
      ].join(" "),
      [JSON.stringify(schemaContract.columns)],
    )
    operation = "required_constraint_contract_query"
    const constraintResult = await client.query(
      [
        "select required.table_name, required.constraint_name,",
        "  constraint_row.oid is not null as exists,",
        "  constraint_row.contype::text is not distinct from required.constraint_type as type_matches,",
        "  constraint_columns.column_names is not distinct from required.column_names as columns_match,",
        "  case when required.constraint_type <> 'c' then true else",
        "    regexp_replace(coalesce(pg_get_expr(constraint_row.conbin, constraint_row.conrelid, true), ''), '\\s+', ' ', 'g') =",
        "    regexp_replace(coalesce(required.check_expression, ''), '\\s+', ' ', 'g')",
        "  end as check_definition_matches,",
        "  case when required.constraint_type <> 'f' then true else",
        "    referenced_namespace.nspname = 'public' and referenced_table.relname = required.referenced_table and",
        "    referenced_columns.column_names is not distinct from required.referenced_column_names",
        "  end as foreign_key_target_matches,",
        "  case when required.constraint_type <> 'f' then true else constraint_row.confdeltype::text = required.delete_action end as delete_action_matches,",
        "  constraint_row.convalidated is not distinct from required.expected_validated as validated",
        "from jsonb_to_recordset($1::jsonb) as required(",
        "  table_name text, constraint_name text, constraint_type text, column_names text[], check_expression text,",
        "  referenced_table text, referenced_column_names text[], delete_action text, expected_validated boolean",
        ")",
        "left join pg_namespace table_namespace on table_namespace.nspname = 'public'",
        "left join pg_class table_class on table_class.relnamespace = table_namespace.oid and table_class.relname = required.table_name",
        "left join pg_constraint constraint_row on constraint_row.conrelid = table_class.oid and constraint_row.conname = required.constraint_name",
        "left join pg_class referenced_table on referenced_table.oid = constraint_row.confrelid",
        "left join pg_namespace referenced_namespace on referenced_namespace.oid = referenced_table.relnamespace",
        "left join lateral (",
        "  select array_agg(attribute.attname::text order by key_column.ordinality) as column_names",
        "  from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)",
        "  join pg_attribute attribute on attribute.attrelid = constraint_row.conrelid and attribute.attnum = key_column.attnum",
        ") constraint_columns on true",
        "left join lateral (",
        "  select array_agg(attribute.attname::text order by key_column.ordinality) as column_names",
        "  from unnest(constraint_row.confkey) with ordinality as key_column(attnum, ordinality)",
        "  join pg_attribute attribute on attribute.attrelid = constraint_row.confrelid and attribute.attnum = key_column.attnum",
        ") referenced_columns on true",
        "order by required.table_name, required.constraint_name",
      ].join(" "),
      [JSON.stringify(schemaContract.constraints)],
    )
    operation = "required_index_contract_query"
    const indexResult = await client.query(
      [
        "select required.table_name, required.index_name,",
        "  index_row.indexrelid is not null as exists,",
        "  access_method.amname is not distinct from required.expected_method as method_matches,",
        "  index_columns.column_names is not distinct from required.column_names as columns_match,",
        "  index_columns.directions is not distinct from required.directions as directions_match,",
        "  index_row.indisunique is not distinct from required.expected_unique as unique_matches,",
        "  index_row.indpred is null as no_predicate,",
        "  index_row.indexprs is null as no_expression,",
        "  index_row.indnatts = index_row.indnkeyatts as no_extra_columns,",
        "  index_row.indisvalid is not distinct from required.expected_valid as valid,",
        "  index_row.indisready is not distinct from required.expected_ready as ready",
        "from jsonb_to_recordset($1::jsonb) as required(",
        "  table_name text, index_name text, expected_method text, column_names text[], directions text[],",
        "  expected_unique boolean, expected_valid boolean, expected_ready boolean",
        ")",
        "left join pg_namespace table_namespace on table_namespace.nspname = 'public'",
        "left join pg_class table_class on table_class.relnamespace = table_namespace.oid and table_class.relname = required.table_name",
        "left join pg_class index_class on index_class.relnamespace = table_namespace.oid and index_class.relname = required.index_name",
        "left join pg_am access_method on access_method.oid = index_class.relam",
        "left join pg_index index_row on index_row.indrelid = table_class.oid and index_row.indexrelid = index_class.oid",
        "left join lateral (",
        "  select",
        "    array_agg(attribute.attname::text order by key_column.ordinality) as column_names,",
        "    array_agg(case when (key_column.option_bits & 1) = 1 then 'DESC' else 'ASC' end order by key_column.ordinality) as directions",
        "  from unnest(index_row.indkey::smallint[], index_row.indoption::smallint[]) with ordinality as key_column(attnum, option_bits, ordinality)",
        "  join pg_attribute attribute on attribute.attrelid = index_row.indrelid and attribute.attnum = key_column.attnum",
        "  where key_column.ordinality <= index_row.indnkeyatts",
        ") index_columns on true",
        "order by required.table_name, required.index_name",
      ].join(" "),
      [JSON.stringify(schemaContract.indexes)],
    )
    operation = "required_function_contract_query"
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
    const missingColumns = columnResult.rows
      .filter((row) => !isRequiredColumnContractSatisfied(row))
      .map((row) => `${String(row.table_name)}.${String(row.column_name)}`)
    const missingConstraints = constraintResult.rows
      .filter((row) => !isRequiredConstraintContractSatisfied(row))
      .map((row) => `${String(row.table_name)}.${String(row.constraint_name)}`)
    const missingIndexes = indexResult.rows
      .filter((row) => !isRequiredIndexContractSatisfied(row))
      .map((row) => `${String(row.table_name)}.${String(row.index_name)}`)
    const missingFunctions = functionResult.rows
      .filter((row) => row.exists !== true)
      .map((row) => String(row.item_name))
    const extensionOk = extensionResult.rows[0]?.ok === true
    const requestContextOk =
      contextResult.rows[0]?.configured === true && contextResult.rows[0]?.roundtrip === true
    runtimeResult = {
      ok:
        extensionOk &&
        requestContextOk &&
        missingTables.length === 0 &&
        missingColumns.length === 0 &&
        missingConstraints.length === 0 &&
        missingIndexes.length === 0 &&
        missingFunctions.length === 0,
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
          status:
            missingTables.length === 0 &&
            missingColumns.length === 0 &&
            missingConstraints.length === 0 &&
            missingIndexes.length === 0 &&
            missingFunctions.length === 0
              ? "passed"
              : "failed",
          requiredTableCount: schemaContract.tables.length,
          presentTableCount: schemaContract.tables.length - missingTables.length,
          missingTables,
          requiredColumnCount: schemaContract.columns.length,
          presentColumnCount: schemaContract.columns.length - missingColumns.length,
          missingColumns,
          requiredConstraintCount: schemaContract.constraints.length,
          presentConstraintCount: schemaContract.constraints.length - missingConstraints.length,
          missingConstraints,
          requiredIndexCount: schemaContract.indexes.length,
          presentIndexCount: schemaContract.indexes.length - missingIndexes.length,
          missingIndexes,
          requiredFunctionCount: requiredFunctions.length,
          presentFunctionCount: requiredFunctions.length - missingFunctions.length,
          missingFunctions,
          evidence: "to_regclass_information_schema_pg_constraint_pg_index_pg_am_structure_and_pg_proc_checks",
        },
      },
      failureCategory: "",
    }
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK")
      } catch {
        // A rollback failure cannot replace the original sanitized failure evidence.
      }
    }
    runtimeResult = {
      ok: false,
      checks: emptyRuntimeChecks(schemaContract, requiredFunctions),
      failureCategory: classifyPgError(error, operation),
      pgErrorCode: sanitizePgErrorCode(error?.code),
    }
  } finally {
    try {
      client?.release()
    } catch {
      cleanupFailed = true
    }
    try {
      await pool?.end()
    } catch {
      cleanupFailed = true
    }
  }

  if (cleanupFailed && runtimeResult.ok) {
    return {
      ...runtimeResult,
      ok: false,
      failureCategory: "rds_runtime_smoke_cleanup_failed",
      pgErrorCode: "",
    }
  }
  return runtimeResult
}

async function buildReport(args) {
  if (!existsSync(args.schemaMap)) throw new Error(`schema_map_missing:${args.schemaMap}`)
  const schemaMap = readJson(args.schemaMap)
  const schemaContract = getRequiredSchemaContract(schemaMap)
  const requiredFunctions = getRequiredNames(schemaMap, "requiredFunctions")
  const blockers = []
  const warnings = []
  const databaseUrl = String(process.env.DATABASE_URL_CN || "").trim()
  const allowEnvSet = String(process.env[ALLOW_ENV] || "") === "1"
  let runtime = {
    ok: false,
    checks: emptyRuntimeChecks(schemaContract, requiredFunctions),
    failureCategory: "",
  }

  if (!args.execute) {
    blockers.push("execute_not_requested")
  } else if (!allowEnvSet) {
    blockers.push(`${ALLOW_ENV}=1`)
  } else if (!databaseUrl) {
    blockers.push("DATABASE_URL_CN")
  } else {
    runtime = await executeRuntimeSmoke(databaseUrl, schemaContract, requiredFunctions)
    if (!runtime.ok) {
      if (runtime.checks.extension.status !== "passed") blockers.push("rds_extension_support_unconfirmed")
      if (runtime.checks.requestContext.status !== "passed") blockers.push("backend_request_context_unconfirmed")
      if (runtime.checks.schemaObjects.missingTables.length) blockers.push("rds_required_tables_missing")
      if (runtime.checks.schemaObjects.missingColumns.length) blockers.push("rds_required_columns_missing")
      if (runtime.checks.schemaObjects.missingConstraints.length) blockers.push("rds_required_constraints_missing")
      if (runtime.checks.schemaObjects.missingIndexes.length) blockers.push("rds_required_indexes_missing")
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
    `- requiredColumnCount: ${report.runtimeChecks.schemaObjects.requiredColumnCount}`,
    `- presentColumnCount: ${report.runtimeChecks.schemaObjects.presentColumnCount}`,
    `- missingColumns: ${report.runtimeChecks.schemaObjects.missingColumns.join(", ") || "none"}`,
    `- requiredConstraintCount: ${report.runtimeChecks.schemaObjects.requiredConstraintCount}`,
    `- presentConstraintCount: ${report.runtimeChecks.schemaObjects.presentConstraintCount}`,
    `- missingConstraints: ${report.runtimeChecks.schemaObjects.missingConstraints.join(", ") || "none"}`,
    `- requiredIndexCount: ${report.runtimeChecks.schemaObjects.requiredIndexCount}`,
    `- presentIndexCount: ${report.runtimeChecks.schemaObjects.presentIndexCount}`,
    `- missingIndexes: ${report.runtimeChecks.schemaObjects.missingIndexes.join(", ") || "none"}`,
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

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
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
        failureCategory: classifyPgError(error),
        pgErrorCode: sanitizePgErrorCode(error?.code),
        containsValues: false,
        mutationPerformed: false,
      }))
      process.exitCode = 1
    })
}
