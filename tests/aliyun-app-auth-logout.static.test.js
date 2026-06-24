const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

test("APP logout route exists and preserves the production-cn auth boundary", () => {
  const route = read("app", "api", "app", "auth", "logout", "route.ts")
  const requiredRoutes = read("scripts", "check-app-api-production-cn-routes.mjs")
  const smoke = read("scripts", "smoke-app-api-production-cn.mjs")
  const bridgeMap = read("deploy", "app-api-production-cn.bridge-map.json")

  assert.match(route, /export\s+async\s+function\s+POST\(/)
  assert.match(route, /createServerSupabaseClientForRequest\(request\)/)
  assert.match(route, /supabase\.auth\.getUser\(\)/)
  assert.match(route, /code:\s*"auth_required"/)
  assert.match(route, /supabase\.auth\.signOut\(\)/)
  assert.match(route, /NextResponse\.json\(\{\s*ok:\s*true\s*\}\)/)

  assert.match(requiredRoutes, /route:\s*"\/api\/app\/auth\/logout"/)
  assert.match(requiredRoutes, /file:\s*"app\/api\/app\/auth\/logout\/route\.ts"/)
  assert.match(smoke, /path:\s*"\/api\/app\/auth\/logout"/)
  assert.match(smoke, /expected:\s*\[\{\s*status:\s*401,\s*code:\s*"auth_required"\s*\}\]/)
  assert.match(bridgeMap, /"route":\s*"\/api\/app\/auth\/logout"/)
  assert.match(bridgeMap, /"productionCnStatus":\s*"bridge_ready"/)
})
