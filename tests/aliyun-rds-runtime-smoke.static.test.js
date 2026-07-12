/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const root = process.cwd()
const fixtureSchemaMap = path.join(
  "tests",
  "fixtures",
  "aliyun-rds-runtime-smoke",
  "schema-map.fixture.json",
)
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

test("Aliyun RDS runtime smoke is guarded by explicit operator execution", () => {
  const source = read("scripts", "check-aliyun-rds-runtime-smoke.mjs")

  assert.match(source, /MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE/)
  assert.match(source, /DATABASE_URL_CN/)
  assert.match(source, /await import\("pg"\)/)
  assert.doesNotMatch(source, /^import pg from "pg"/m)
  assert.match(source, /if \(!args\.execute\)/)
  assert.match(source, /else if \(!allowEnvSet\)/)
  assert.match(source, /else if \(!databaseUrl\)/)
  assert.match(source, /gen_random_uuid\(\) is not null/)
  assert.match(source, /set_config\('app\.current_user_id', \$1, true\)/)
  assert.match(source, /to_regclass\('public\.' \|\| item_name\)/)
  assert.match(source, /pg_proc/)
  assert.match(source, /BEGIN READ ONLY/)
  assert.match(source, /information_schema\.columns/)
  assert.match(source, /jsonb_to_recordset/)
  assert.match(source, /data_type_matches/)
  assert.match(source, /default_matches/)
  assert.match(source, /pg_constraint/)
  assert.match(source, /check_definition_matches/)
  assert.match(source, /foreign_key_target_matches/)
  assert.match(source, /delete_action_matches/)
  assert.match(source, /pg_index/)
  assert.match(source, /pg_am/)
  assert.match(source, /method_matches/)
  assert.match(source, /directions_match/)
  assert.match(source, /no_predicate/)
  assert.match(source, /no_expression/)
  assert.match(source, /indisvalid/)
  assert.match(source, /indisready/)
  assert.equal((source.match(/attribute\.attname::text/g) || []).length, 3)
  assert.doesNotMatch(source, /attribute\.attname(?!::text)/)
  assert.match(source, /failureCategory: classifyPgError\(error\)/)
  assert.match(source, /sanitizePgErrorCode/)
  assert.doesNotMatch(source, /pgErrorCode: String\(error\?\.code \|\| ""\)/)
  assert.doesNotMatch(source, /error:\s*String\(error\?\.message/)
  assert.doesNotMatch(source, /\bANALYZE\b/i)
  assert.match(source, /does not contain|never prints DATABASE_URL_CN|database passwords/i)
})

test("Aliyun RDS runtime smoke dry run emits non-secret blockers and required schema counts", () => {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-runtime-smoke.mjs",
    "--schema-map",
    fixtureSchemaMap,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, false)
  assert.equal(report.executionMode, "dry_run")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.databaseConnected, false)
  assert.deepEqual(report.blockers, ["execute_not_requested"])
  assert.equal(report.runtimeChecks.extension.status, "not_executed")
  assert.equal(report.runtimeChecks.requestContext.status, "not_executed")
  assert.equal(report.runtimeChecks.schemaObjects.requiredTableCount, 16)
  assert.equal(report.runtimeChecks.schemaObjects.missingTables.length, 16)
  assert.equal(report.runtimeChecks.schemaObjects.requiredFunctionCount, 0)
  assert.deepEqual(report.runtimeChecks.schemaObjects.missingFunctions, [])
  assert.equal(report.runtimeChecks.schemaObjects.requiredColumnCount, 58)
  assert.equal(report.runtimeChecks.schemaObjects.missingColumns.length, 58)
  assert.equal(report.runtimeChecks.schemaObjects.requiredConstraintCount, 13)
  assert.equal(report.runtimeChecks.schemaObjects.missingConstraints.length, 13)
  assert.equal(report.runtimeChecks.schemaObjects.requiredIndexCount, 11)
  assert.equal(report.runtimeChecks.schemaObjects.missingIndexes.length, 11)
  assert.ok(report.runtimeChecks.schemaObjects.missingColumns.includes("voice_coach_sessions.company_id"))
  assert.ok(report.runtimeChecks.schemaObjects.missingColumns.includes("voice_coach_scene_cards.service_name"))
  assert.ok(report.runtimeChecks.schemaObjects.missingConstraints.includes("voice_coach_turns.voice_coach_turns_session_id_fkey"))
  assert.ok(report.runtimeChecks.schemaObjects.missingIndexes.includes("voice_coach_turns.voice_coach_turns_session_turn_index_key"))
  assert.ok(report.writebackFieldsWhenPassed.includes("migration.rdsExtensionSupportConfirmed=true"))
  assert.ok(report.writebackFieldsWhenPassed.some((item) => item.includes("migration.appApiSmokeOnRdsPassed")))
  assert.equal(report.secretLeakCheck.ok, true)
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun RDS runtime smoke strict execution refuses to connect without explicit allow env", () => {
  const result = spawnSync(process.execPath, [
    "scripts/check-aliyun-rds-runtime-smoke.mjs",
    "--schema-map",
    fixtureSchemaMap,
    "--execute",
    "--strict",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL_CN: "",
      MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE: "",
    },
    maxBuffer: 1024 * 1024 * 10,
  })
  const report = JSON.parse(result.stdout)

  assert.equal(result.status, 1)
  assert.equal(report.ok, false)
  assert.equal(report.executionMode, "execute_runtime_smoke")
  assert.equal(report.databaseConnected, false)
  assert.deepEqual(report.blockers, ["MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE=1"])
  assert.equal(report.secretLeakCheck.ok, true)
  assert.doesNotMatch(result.stdout + result.stderr, secretLike)
})

test("Aliyun RDS runtime smoke sanitizes Pool connect rejection and always ends the pool", (t) => {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-connect-reject-")))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const copiedScriptDir = path.join(tmpDir, "scripts")
  const fakePgDir = path.join(tmpDir, "node_modules", "pg")
  const poolEndMarker = path.join(tmpDir, "pool-ended.txt")
  const sensitiveSentinel = "CONNECT_REJECT_SENSITIVE_SENTINEL"
  const cleanupCodeSentinel = "POOL_END_CODE_SENSITIVE_SENTINEL"
  const cleanupMessageSentinel = "POOL_END_MESSAGE_SENSITIVE_SENTINEL"
  fs.mkdirSync(copiedScriptDir, { recursive: true })
  fs.mkdirSync(fakePgDir, { recursive: true })
  fs.copyFileSync(
    path.join(root, "scripts", "check-aliyun-rds-runtime-smoke.mjs"),
    path.join(copiedScriptDir, "check-aliyun-rds-runtime-smoke.mjs"),
  )
  fs.writeFileSync(
    path.join(fakePgDir, "package.json"),
    JSON.stringify({ name: "pg", version: "0.0.0", type: "module", exports: "./index.js" }),
  )
  fs.writeFileSync(
    path.join(fakePgDir, "index.js"),
    [
      'import { writeFileSync } from "node:fs"',
      "export class Pool {",
      "  async connect() {",
      `    const error = new Error(${JSON.stringify(sensitiveSentinel)})`,
      '    error.code = "28P01"',
      "    throw error",
      "  }",
      "  async end() {",
      '    writeFileSync(process.env.FAKE_POOL_END_MARKER, "ended")',
      '    if (process.env.FAKE_POOL_END_REJECT === "1") {',
      `      const error = new Error(${JSON.stringify(cleanupMessageSentinel)})`,
      `      error.code = ${JSON.stringify(cleanupCodeSentinel)}`,
      "      throw error",
      "    }",
      "  }",
      "}",
    ].join("\n"),
  )

  const result = spawnSync(process.execPath, [
    path.join(copiedScriptDir, "check-aliyun-rds-runtime-smoke.mjs"),
    "--schema-map",
    path.join(root, fixtureSchemaMap),
    "--execute",
    "--strict",
  ], {
    cwd: tmpDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL_CN: "fake-local-test-url",
      FAKE_POOL_END_MARKER: poolEndMarker,
      MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE: "1",
    },
    maxBuffer: 1024 * 1024 * 10,
  })
  const combinedOutput = result.stdout + result.stderr
  const report = JSON.parse(result.stdout || result.stderr)

  assert.equal(result.status, 1)
  assert.doesNotMatch(combinedOutput, new RegExp(sensitiveSentinel))
  assert.equal(report.ok, false)
  assert.equal(report.failureCategory, "database_connection_or_auth_failed")
  assert.equal(report.pgErrorCode, "28P01")
  assert.equal("error" in report, false)
  assert.equal(fs.readFileSync(poolEndMarker, "utf8"), "ended")

  const rejectingPoolEndMarker = path.join(tmpDir, "rejecting-pool-ended.txt")
  const cleanupRejectResult = spawnSync(process.execPath, [
    path.join(copiedScriptDir, "check-aliyun-rds-runtime-smoke.mjs"),
    "--schema-map",
    path.join(root, fixtureSchemaMap),
    "--execute",
    "--strict",
  ], {
    cwd: tmpDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL_CN: "fake-local-test-url",
      FAKE_POOL_END_MARKER: rejectingPoolEndMarker,
      FAKE_POOL_END_REJECT: "1",
      MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE: "1",
    },
    maxBuffer: 1024 * 1024 * 10,
  })
  const cleanupRejectOutput = cleanupRejectResult.stdout + cleanupRejectResult.stderr
  const cleanupRejectReport = JSON.parse(cleanupRejectResult.stdout || cleanupRejectResult.stderr)

  assert.equal(cleanupRejectResult.status, 1)
  assert.equal(cleanupRejectReport.failureCategory, "database_connection_or_auth_failed")
  assert.equal(cleanupRejectReport.pgErrorCode, "28P01")
  assert.doesNotMatch(cleanupRejectOutput, new RegExp(sensitiveSentinel))
  assert.doesNotMatch(cleanupRejectOutput, new RegExp(cleanupCodeSentinel))
  assert.doesNotMatch(cleanupRejectOutput, new RegExp(cleanupMessageSentinel))
  assert.equal(fs.readFileSync(rejectingPoolEndMarker, "utf8"), "ended")
})

test("Aliyun RDS runtime smoke reports sanitized cleanup failure after successful checks", (t) => {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-cleanup-reject-")))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const copiedScriptDir = path.join(tmpDir, "scripts")
  const fakePgDir = path.join(tmpDir, "node_modules", "pg")
  const poolEndMarker = path.join(tmpDir, "pool-ended.txt")
  const clientReleaseMarker = path.join(tmpDir, "client-released.txt")
  const cleanupCodeSentinel = "SUCCESS_CLEANUP_CODE_SENSITIVE_SENTINEL"
  const cleanupMessageSentinel = "SUCCESS_CLEANUP_MESSAGE_SENSITIVE_SENTINEL"
  fs.mkdirSync(copiedScriptDir, { recursive: true })
  fs.mkdirSync(fakePgDir, { recursive: true })
  fs.copyFileSync(
    path.join(root, "scripts", "check-aliyun-rds-runtime-smoke.mjs"),
    path.join(copiedScriptDir, "check-aliyun-rds-runtime-smoke.mjs"),
  )
  fs.writeFileSync(
    path.join(fakePgDir, "package.json"),
    JSON.stringify({ name: "pg", version: "0.0.0", type: "module", exports: "./index.js" }),
  )
  fs.writeFileSync(
    path.join(fakePgDir, "index.js"),
    [
      'import { writeFileSync } from "node:fs"',
      "class FakeClient {",
      "  async query(text, values = []) {",
      '    if (text === "BEGIN READ ONLY" || text === "ROLLBACK") return { rows: [] }',
      '    if (text.includes("gen_random_uuid() is not null")) return { rows: [{ ok: true }] }',
      '    if (text.includes("set_config(\'app.current_user_id\'")) return { rows: [{ configured: true, roundtrip: true }] }',
      '    if (text.includes("to_regclass(\'public.\' || item_name)")) return { rows: values[0].map((item_name) => ({ item_name, exists: true })) }',
      '    if (text.includes("required.table_name, required.column_name,")) return { rows: JSON.parse(values[0]).map((item) => ({ ...item, exists: true, data_type_matches: true, udt_name_matches: true, nullable_matches: true, default_matches: true })) }',
      '    if (text.includes("required.table_name, required.constraint_name,")) return { rows: JSON.parse(values[0]).map((item) => ({ ...item, exists: true, type_matches: true, columns_match: true, check_definition_matches: true, foreign_key_target_matches: true, delete_action_matches: true, validated: true })) }',
      '    if (text.includes("required.table_name, required.index_name,")) return { rows: JSON.parse(values[0]).map((item) => ({ ...item, exists: true, method_matches: true, columns_match: true, directions_match: true, unique_matches: true, no_predicate: true, no_expression: true, no_extra_columns: true, valid: true, ready: true })) }',
      '    if (text.includes("from unnest($1::text[]) as item_name")) return { rows: values[0].map((item_name) => ({ item_name, exists: true })) }',
      '    throw new Error("unexpected_fake_query")',
      "  }",
      '  release() { writeFileSync(process.env.FAKE_CLIENT_RELEASE_MARKER, "released") }',
      "}",
      "export class Pool {",
      "  async connect() { return new FakeClient() }",
      "  async end() {",
      '    writeFileSync(process.env.FAKE_POOL_END_MARKER, "ended")',
      `    const error = new Error(${JSON.stringify(cleanupMessageSentinel)})`,
      `    error.code = ${JSON.stringify(cleanupCodeSentinel)}`,
      "    throw error",
      "  }",
      "}",
    ].join("\n"),
  )

  const result = spawnSync(process.execPath, [
    path.join(copiedScriptDir, "check-aliyun-rds-runtime-smoke.mjs"),
    "--schema-map",
    path.join(root, fixtureSchemaMap),
    "--execute",
    "--strict",
  ], {
    cwd: tmpDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL_CN: "fake-local-test-url",
      FAKE_CLIENT_RELEASE_MARKER: clientReleaseMarker,
      FAKE_POOL_END_MARKER: poolEndMarker,
      MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE: "1",
    },
    maxBuffer: 1024 * 1024 * 10,
  })
  const combinedOutput = result.stdout + result.stderr
  const report = JSON.parse(result.stdout || result.stderr)

  assert.equal(result.status, 1)
  assert.equal(report.ok, false)
  assert.equal(report.failureCategory, "rds_runtime_smoke_cleanup_failed")
  assert.equal(report.pgErrorCode, "")
  assert.equal(report.runtimeChecks.schemaObjects.status, "passed")
  assert.ok(report.blockers.includes("rds_runtime_smoke_cleanup_failed"))
  assert.doesNotMatch(combinedOutput, new RegExp(cleanupCodeSentinel))
  assert.doesNotMatch(combinedOutput, new RegExp(cleanupMessageSentinel))
  assert.equal(fs.readFileSync(clientReleaseMarker, "utf8"), "released")
  assert.equal(fs.readFileSync(poolEndMarker, "utf8"), "ended")
})

test("Aliyun RDS runtime smoke can write optional non-secret JSON and Markdown", (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-runtime-smoke-"))
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
  const jsonPath = path.join(tmpDir, "runtime-smoke.json")
  const markdownPath = path.join(tmpDir, "runtime-smoke.md")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-runtime-smoke.mjs",
    "--schema-map",
    fixtureSchemaMap,
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const writtenJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(writtenJson.executionMode, "dry_run")
  assert.match(markdown, /# Aliyun RDS Runtime Smoke/)
  assert.match(markdown, /execute_not_requested/)
  assert.match(markdown, /requiredTableCount: 16/)
  assert.match(markdown, /requiredColumnCount: 58/)
  assert.match(markdown, /requiredConstraintCount: 13/)
  assert.match(markdown, /requiredIndexCount: 11/)
  assert.match(markdown, /requiredFunctionCount: 0/)
  assert.doesNotMatch(output + JSON.stringify(writtenJson) + markdown, secretLike)
})

test("Aliyun RDS schema contract predicates fail closed for every reviewed mismatch", async () => {
  const moduleUrl = `${pathToFileURL(path.join(root, "scripts", "check-aliyun-rds-runtime-smoke.mjs")).href}?contract-test=${Date.now()}`
  const runtimeSmoke = await import(moduleUrl)
  const columnPass = {
    exists: true,
    data_type_matches: true,
    udt_name_matches: true,
    nullable_matches: true,
    default_matches: true,
  }
  for (const field of ["exists", "data_type_matches", "udt_name_matches", "nullable_matches", "default_matches"]) {
    assert.equal(
      runtimeSmoke.isRequiredColumnContractSatisfied({ ...columnPass, [field]: false }),
      false,
      field,
    )
  }

  const constraintPass = {
    exists: true,
    type_matches: true,
    columns_match: true,
    check_definition_matches: true,
    foreign_key_target_matches: true,
    delete_action_matches: true,
    validated: true,
  }
  for (const field of [
    "exists",
    "type_matches",
    "columns_match",
    "check_definition_matches",
    "foreign_key_target_matches",
    "delete_action_matches",
    "validated",
  ]) {
    assert.equal(
      runtimeSmoke.isRequiredConstraintContractSatisfied({ ...constraintPass, [field]: false }),
      false,
      field,
    )
  }

  const indexPass = {
    exists: true,
    method_matches: true,
    columns_match: true,
    directions_match: true,
    unique_matches: true,
    no_predicate: true,
    no_expression: true,
    no_extra_columns: true,
    valid: true,
    ready: true,
  }
  for (const field of [
    "exists",
    "method_matches",
    "columns_match",
    "directions_match",
    "unique_matches",
    "no_predicate",
    "no_expression",
    "no_extra_columns",
    "valid",
    "ready",
  ]) {
    assert.equal(
      runtimeSmoke.isRequiredIndexContractSatisfied({ ...indexPass, [field]: false }),
      false,
      field,
    )
  }

  const sensitiveSentinel = "UNDEFINED_FUNCTION_SENSITIVE_SENTINEL"
  assert.equal(
    runtimeSmoke.classifyPgError({ code: "42883", message: sensitiveSentinel }, "schema_contract_query"),
    "rds_runtime_smoke_failed",
  )
  assert.equal(
    runtimeSmoke.classifyPgError({ code: "42883", message: sensitiveSentinel }, "gen_random_uuid_extension_probe"),
    "pgcrypto_or_function_missing",
  )
  assert.equal(runtimeSmoke.sanitizePgErrorCode("28P01"), "28P01")
  assert.equal(runtimeSmoke.sanitizePgErrorCode("42P01"), "42P01")
  assert.equal(runtimeSmoke.sanitizePgErrorCode("ECONNREFUSED"), "ECONNREFUSED")
  assert.equal(runtimeSmoke.sanitizePgErrorCode("POOL_END_CODE_SENSITIVE_SENTINEL"), "")
  assert.equal(runtimeSmoke.sanitizePgErrorCode("28p01"), "")
})
