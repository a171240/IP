const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("test-account membership SAE job is guarded and scoped to two membership rows", () => {
  const source = read("scripts", "apply-production-cn-rds-test-account-membership-via-sae-job.mjs")

  assert.match(source, /MEIYE_ALLOW_PRODUCTION_CN_RDS_TEST_ACCOUNT_MEMBERSHIP/)
  assert.match(source, /--execute/)
  assert.match(source, /deploy\/app-live-smoke-test-login-users\.local\.json/)
  assert.match(source, /expected_employee_and_manager_accounts/)
  assert.match(source, /test_accounts_must_share_one_company_store/)
  assert.match(source, /upsert public\.mp_account_memberships for employee and manager test accounts only/)
  assert.match(source, /on conflict \(user_id, company_id, store_id, role\) do update/)
  assert.doesNotMatch(source, /public\.profiles/)
  assert.doesNotMatch(source, /mp_knowledge_spaces|mp_knowledge_space_access|voice_training_packs/)
})

test("test-account membership SAE job redacts secrets and raw ids from output", () => {
  const source = read("scripts", "apply-production-cn-rds-test-account-membership-via-sae-job.mjs")

  assert.match(source, /secretValuesPrinted:\s*false/)
  assert.match(source, /rawIdsPrinted:\s*false/)
  assert.match(source, /scopeHash12/)
  assert.match(source, /userHash12ByKey/)
  assert.match(source, /userHash12ByRole/)
  assert.match(source, /DATABASE_URL_CN_REDACTED/)
  assert.match(source, /UUID_REDACTED/)
  assert.doesNotMatch(source, /console\.log\(databaseUrl\)|console\.log\(payloadJson\)/)
  assert.doesNotMatch(source, /accessToken|refreshToken|Authorization|Bearer/)
})

test("test-account membership SAE job reuses production app runtime without deploying", () => {
  const source = read("scripts", "apply-production-cn-rds-test-account-membership-via-sae-job.mjs")

  assert.match(source, /DescribeApplicationConfig/)
  assert.match(source, /CreateJob/)
  assert.match(source, /ExecJob/)
  assert.match(source, /MEIYE_MEMBERSHIP_RUNNER_B64/)
  assert.match(source, /DeleteHistoryJob/)
  assert.match(source, /DeleteJob/)
  assert.match(source, /SOURCE_APP_ID = "41b347a0-ae54-4215-9ee6-8dc82c427dd2"/)
  assert.match(source, /DATABASE_URL_CN/)
  assert.doesNotMatch(source, /DeployApplication|docker\s+push|mp:upload|oss\s+cp|oss\s+rm/)
})

test("test-account membership SAE job is exposed through package scripts", () => {
  const pkg = JSON.parse(read("package.json"))

  assert.equal(
    pkg.scripts["aliyun:app-api:test-account-membership:sae"],
    "node ./scripts/apply-production-cn-rds-test-account-membership-via-sae-job.mjs",
  )
  assert.equal(
    pkg.scripts["aliyun:app-api:test-account-membership:sae:test"],
    "node --test tests/app-api-test-account-membership-sae-job.static.test.js",
  )
})
