const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("APP live-smoke test account registration is explicit and redacted", () => {
  const source = read("scripts", "register-app-live-smoke-test-accounts.mjs")

  assert.match(source, /MEIYE_ALLOW_APP_TEST_ACCOUNT_REGISTRATION/)
  assert.match(source, /--execute/)
  assert.match(source, /mode:\s*"dry_run"/)
  assert.match(source, /writesAuthorizedHere:\s*false/)
  assert.match(source, /deploy\/app-live-smoke-test-accounts\.local\.json/)
  assert.match(source, /containsSecretTokens:\s*true/)
  assert.match(source, /stdoutContainsSecretTokens:\s*false/)
  assert.match(source, /accessToken:\s*accessToken\s*\?\s*"\[written_to_local_file\]"/)
  assert.match(source, /refreshToken:\s*refreshToken\s*\?\s*"\[written_to_local_file\]"/)
  assert.match(source, /chmodSync\(filePath,\s*0o600\)/)
  assert.match(source, /--database-url-kms-secret-name/)
  assert.match(source, /--profile-through-api/)
  assert.match(source, /not_used_profile_through_api/)
  assert.match(source, /readDatabaseUrlFromAliyunKms/)
  assert.match(source, /DATABASE_URL_CN is read from KMS only in memory/)
})

test("APP live-smoke test accounts cover employee and manager permission boundary", () => {
  const source = read("scripts", "register-app-live-smoke-test-accounts.mjs")

  assert.match(source, /APP_EMPLOYEE_TOKEN/)
  assert.match(source, /APP_MANAGER_TOKEN/)
  assert.match(source, /meiye-app-live-smoke-employee@ipgongchang\.xin/)
  assert.match(source, /meiye-app-live-smoke-manager@ipgongchang\.xin/)
  assert.match(source, /role:\s*"employee"/)
  assert.match(source, /role:\s*"store_admin"/)
  assert.match(source, /\/api\/app\/store-admin\/service-records\?limit=1/)
  assert.match(source, /store_admin_required/)
})

test("APP live-smoke test account script only touches auth test users and RDS account rows", () => {
  const source = read("scripts", "register-app-live-smoke-test-accounts.mjs")

  assert.match(source, /public\.profiles/)
  assert.match(source, /public\.mp_account_memberships/)
  assert.match(source, /resolveScopeFromSupabase/)
  assert.match(source, /hydrateProfileViaApi/)
  assert.match(source, /aliyun_kms_get_secret_value_failed/)
  assert.doesNotMatch(source, /DeployApplication|docker\s+push|mp:upload|oss\s+cp|oss\s+rm/)
  const consoleLogLines = source
    .split(/\r?\n/)
    .filter((line) => /console\.(?:log|error)\(/.test(line))
    .join("\n")
  assert.doesNotMatch(consoleLogLines, /accessToken|refreshToken/)
})

test("APP live-smoke test account script is exposed through package scripts", () => {
  const pkg = JSON.parse(read("package.json"))

  assert.equal(
    pkg.scripts["aliyun:app-api:test-accounts"],
    "node ./scripts/register-app-live-smoke-test-accounts.mjs",
  )
  assert.equal(
    pkg.scripts["aliyun:app-api:test-accounts:test"],
    "node --test tests/app-api-test-accounts.static.test.js",
  )
})
