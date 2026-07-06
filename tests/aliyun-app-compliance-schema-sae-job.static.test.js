const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const scriptPath = path.join(root, "scripts", "apply-production-cn-rds-app-compliance-schema-via-sae-job.mjs")

function readScript() {
  assert.equal(fs.existsSync(scriptPath), true, "SAE job compliance schema apply script must exist")
  return fs.readFileSync(scriptPath, "utf8")
}

test("app compliance SAE job script uses a guarded schema-only execution path", () => {
  const script = readScript()

  assert.match(script, /MEIYE_ALLOW_PRODUCTION_CN_RDS_APP_COMPLIANCE_SCHEMA/)
  assert.match(script, /DescribeApplicationConfig/)
  assert.match(script, /CreateJob/)
  assert.match(script, /ExecJob/)
  assert.match(script, /DeleteHistoryJob/)
  assert.match(script, /DeleteJob/)
  assert.match(script, /create table if not exists public\\\.app_compliance_requests/)
  assert.match(script, /app_compliance_requests_index_count_too_low/)
  assert.match(script, /app_compliance_requests_confirm_text_missing/)
  assert.match(script, /schema_sql_contains_wrong_compliance_table_or_identity_reference/)
  assert.match(script, /references public\\\.app_users/)
})

test("app compliance SAE job script keeps sensitive runtime values out of reports", () => {
  const script = readScript()

  assert.match(script, /secretValuesPrinted:\s*false/)
  assert.match(script, /redactOutput/)
  assert.match(script, /\[DATABASE_URL_REDACTED\]/)
  assert.match(script, /\[DATABASE_URL_CN_REDACTED\]/)
  assert.doesNotMatch(script, /console\.log\([^)]*databaseUrl/i)
  assert.doesNotMatch(script, /writeFileSync|appendFileSync/)
  assert.doesNotMatch(script, /--skip-secure-verify/)
})
