const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const scriptPath = path.join(root, "scripts", "apply-production-cn-rds-auth-revocation-schema-via-sae-job.mjs")

function readScript() {
  assert.equal(fs.existsSync(scriptPath), true, "SAE job schema apply script must exist")
  return fs.readFileSync(scriptPath, "utf8")
}

test("auth revocation SAE job script uses a guarded schema-only execution path", () => {
  const script = readScript()

  assert.match(script, /MEIYE_ALLOW_PRODUCTION_CN_RDS_AUTH_REVOCATION_SCHEMA/)
  assert.match(script, /DescribeApplicationConfig/)
  assert.match(script, /CreateJob/)
  assert.match(script, /ExecJob/)
  assert.match(script, /DeleteHistoryJob/)
  assert.match(script, /DeleteJob/)
  assert.match(script, /create table if not exists public\\\.app_auth_token_revocations/)
  assert.match(script, /revocation_index_count_too_low/)
})

test("auth revocation SAE job script keeps sensitive runtime values out of reports", () => {
  const script = readScript()

  assert.match(script, /secretValuesPrinted:\s*false/)
  assert.match(script, /redactOutput/)
  assert.match(script, /\[DATABASE_URL_REDACTED\]/)
  assert.match(script, /\[DATABASE_URL_CN_REDACTED\]/)
  assert.doesNotMatch(script, /console\.log\([^)]*databaseUrl/i)
  assert.doesNotMatch(script, /writeFileSync|appendFileSync/)
  assert.doesNotMatch(script, /--skip-secure-verify/)
})
