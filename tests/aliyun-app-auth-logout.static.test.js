const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const assertFileExists = (...parts) => {
  const filePath = path.join(root, ...parts)
  assert.equal(fs.existsSync(filePath), true, `${parts.join("/")} must exist`)
  return fs.readFileSync(filePath, "utf8")
}

test("APP logout route exists and preserves the production-cn auth boundary", () => {
  const route = read("app", "api", "app", "auth", "logout", "route.ts")
  const requiredRoutes = read("scripts", "check-app-api-production-cn-routes.mjs")
  const smoke = read("scripts", "smoke-app-api-production-cn.mjs")
  const bridgeMap = read("deploy", "app-api-production-cn.bridge-map.json")

  assert.match(route, /export\s+async\s+function\s+POST\(/)
  assert.match(route, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(route, /appAuthRequiredResponse\(\)/)
  assert.match(route, /appAuthConfigurationErrorResponse\(error\)/)
  assert.doesNotMatch(route, /createServerSupabaseClientForRequest\(request\)/)
  assert.doesNotMatch(route, /supabase\.auth\.signOut\(\)/)
  assert.match(route, /NextResponse\.json\(\{\s*ok:\s*true\s*\}\)/)

  assert.match(requiredRoutes, /route:\s*"\/api\/app\/auth\/logout"/)
  assert.match(requiredRoutes, /file:\s*"app\/api\/app\/auth\/logout\/route\.ts"/)
  assert.match(smoke, /path:\s*"\/api\/app\/auth\/logout"/)
  assert.match(smoke, /expected:\s*\[\{\s*status:\s*401,\s*code:\s*"auth_required"\s*\}\]/)
  assert.match(bridgeMap, /"route":\s*"\/api\/app\/auth\/logout"/)
  assert.match(bridgeMap, /"productionCnStatus":\s*"bridge_ready"/)
})

test("APP logout route records a hashed server-side revocation contract", () => {
  const route = read("app", "api", "app", "auth", "logout", "route.ts")
  const authHelper = read("lib", "aliyun-rds", "app-auth.server.ts")
  const revocations = assertFileExists("lib", "aliyun-rds", "app-auth-revocations.server.ts")

  assert.match(route, /revokeAliyunRdsAppAuthToken\(/)
  assert.match(route, /getAliyunRdsAppAuthBearerTokenHash\(request\)/)
  assert.match(route, /getAliyunRdsAppAuthDeviceId\(request\)/)
  assert.match(route, /tokenHash/)
  assert.doesNotMatch(route, /catch\s*\([^)]*\)\s*\{[^}]*NextResponse\.json\(\{\s*ok:\s*true\s*\}\)/s)

  assert.match(authHelper, /isAliyunRdsAppAuthTokenRevoked\(/)
  assert.match(authHelper, /getAliyunRdsAppAuthBearerTokenHash\(request\)/)
  assert.match(authHelper, /source:\s*"aliyun_test_login"/)
  assert.match(authHelper, /source:\s*"supabase"/)

  assert.match(revocations, /queryAliyunRds/)
  assert.match(revocations, /public\.app_auth_token_revocations/)
  assert.match(revocations, /token_hash/)
  assert.match(revocations, /revoked_at/)
  assert.match(revocations, /expires_at/)
  assert.match(revocations, /sha256/)
  assert.doesNotMatch(revocations, /raw_token|plain_token|authorization|Bearer|console\.(log|error|warn)/i)
})
