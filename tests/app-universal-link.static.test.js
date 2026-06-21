const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const aasaSource = read("lib", "app-universal-link", "aasa.ts")
const wellKnownRoute = read("app", ".well-known", "apple-app-site-association", "route.ts")
const rootRoute = read("app", "apple-app-site-association", "route.ts")
const checkScript = read("scripts", "check-apple-app-site-association.mjs")

test("AASA route is wired for the production-cn iOS universal link", () => {
  assert.match(aasaSource, /EXPECTED_IOS_BUNDLE_ID = "com\.ipgongchang\.meiyehuajing"/)
  assert.match(aasaSource, /APPLE_TEAM_ID/)
  assert.match(aasaSource, /IOS_TEAM_ID/)
  assert.match(aasaSource, /APP_IOS_TEAM_ID/)
  assert.match(aasaSource, /\/app\/wechat\/\*/)
  assert.match(aasaSource, /\/wechat\/\*/)
  assert.match(aasaSource, /appID: `\$\{config\.teamId\}\.\$\{config\.bundleId\}`/)
})

test("AASA endpoint returns JSON and refuses to look ready without Apple Team ID", () => {
  assert.match(wellKnownRoute, /Content-Type": "application\/json"/)
  assert.match(wellKnownRoute, /status: 503/)
  assert.match(wellKnownRoute, /missing: config\.missing/)
  assert.match(wellKnownRoute, /NextResponse\.json\(payload/)
  assert.match(rootRoute, /runtime = "nodejs"/)
  assert.match(rootRoute, /dynamic = "force-dynamic"/)
  assert.match(rootRoute, /wellKnownAppleAppSiteAssociationGet/)
})

test("AASA checker documents the operator evidence without printing secret values", () => {
  assert.match(checkScript, /containsValues: false/)
  assert.match(checkScript, /apple_team_id_missing/)
  assert.match(checkScript, /https:\/\/api-cn\.ipgongchang\.xin\/app\/wechat\//)
  assert.match(checkScript, /curl -i https:\/\/api-cn\.ipgongchang\.xin\/\.well-known\/apple-app-site-association/)
})
