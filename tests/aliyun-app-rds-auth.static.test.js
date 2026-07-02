const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("Aliyun APP auth helper gates test login by env token and device id", () => {
  const source = read("lib", "aliyun-rds", "app-auth.server.ts")

  assert.match(source, /APP_TEST_LOGIN_ENABLED/)
  assert.match(source, /APP_TEST_LOGIN_TOKEN/)
  assert.match(source, /APP_TEST_LOGIN_TOKEN_SHA256/)
  assert.match(source, /APP_TEST_LOGIN_USERS_JSON/)
  assert.match(source, /APP_TEST_LOGIN_DEVICE_IDS/)
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /APP_TEST_LOGIN_USER_ID must be a UUID/)
  assert.match(source, /auth_source:\s*"aliyun_test_login"/)
  assert.match(source, /createServerSupabaseClientForRequest\(request\)/)
})

test("Aliyun APP auth helper supports multiple hash-only test login users", () => {
  const source = read("lib", "aliyun-rds", "app-auth.server.ts")

  assert.match(source, /parseConfiguredTestLoginUsersJson/)
  assert.match(source, /APP_TEST_LOGIN_USERS_JSON must be valid JSON/)
  assert.match(source, /APP_TEST_LOGIN_USERS_JSON must be a JSON array/)
  assert.match(source, /APP_TEST_LOGIN_USERS_JSON entries require token_sha256/)
  assert.match(source, /tokenSha256/)
  assert.match(source, /sha256\(token\)/)
  assert.match(source, /token_sha256 must be a sha256 hex digest/)
  assert.match(source, /configuredTestLoginUserDeviceAllowed/)
  assert.match(source, /device_ids/)
  assert.match(source, /deviceIds/)
  assert.match(source, /account_role:\s*recordText\(user,\s*"account_role",\s*"accountRole"\)/)
  assert.match(source, /company_id:\s*recordText\(user,\s*"company_id",\s*"companyId"\)/)
  assert.match(source, /store_id:\s*recordText\(user,\s*"store_id",\s*"storeId"\)/)
  assert.doesNotMatch(source, /token:\s*recordText/)
  assert.doesNotMatch(source, /raw_token|plain_token|APP_TEST_LOGIN_USERS_JSON_TOKEN/)
})

test("first-version APP RDS auth routes use Aliyun helper instead of direct Supabase user lookup", () => {
  const files = [
    ["app", "api", "app", "profile", "route.ts"],
    ["lib", "aliyun-rds", "repositories", "service-records.server.ts"],
    ["lib", "aliyun-rds", "repositories", "store-admin.server.ts"],
    ["app", "api", "app", "customer-profiles", "route.ts"],
    ["app", "api", "app", "store-profiles", "route.ts"],
    ["app", "api", "app", "store-admin", "invites", "[token]", "accept", "route.ts"],
  ]

  for (const parts of files) {
    const source = read(...parts)
    assert.match(source, /resolveAliyunRdsAppAuthUser\(request\)/, parts.join("/"))
    assert.doesNotMatch(source, /supabase\.auth\.getUser\(\)/, parts.join("/"))
  }
})

test("RDS profile creation can hydrate test-login tenant scope from server metadata", () => {
  const source = read("lib", "aliyun-rds", "repositories", "account-profile.server.ts")

  assert.match(source, /metadataUuid\(user\.user_metadata,\s*"company_id"\)/)
  assert.match(source, /metadataUuid\(user\.user_metadata,\s*"store_id"\)/)
  assert.match(source, /account_role = coalesce\(account_role, \$2\)/)
  assert.match(source, /service_plan_label = coalesce\(service_plan_label, \$7\)/)
  assert.match(source, /account_role, company_id, company_name, store_id, store_name, service_plan_label/)
})
