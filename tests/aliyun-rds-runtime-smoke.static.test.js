const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

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
  assert.equal(report.runtimeChecks.schemaObjects.requiredTableCount, 15)
  assert.equal(report.runtimeChecks.schemaObjects.missingTables.length, 15)
  assert.equal(report.runtimeChecks.schemaObjects.requiredFunctionCount, 0)
  assert.deepEqual(report.runtimeChecks.schemaObjects.missingFunctions, [])
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

test("Aliyun RDS runtime smoke can write optional non-secret JSON and Markdown", () => {
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "aliyun-rds-runtime-smoke-"))
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
  assert.match(markdown, /requiredTableCount: 15/)
  assert.match(markdown, /requiredFunctionCount: 0/)
  assert.doesNotMatch(output + JSON.stringify(writtenJson) + markdown, secretLike)
})
