/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

function appAssetSignReadRouteSource() {
  return read("app", "api", "app", "assets", "sign-read", "route.ts")
}

test("APP assets sign-read POST route is auth protected and tenant scoped", () => {
  const source = appAssetSignReadRouteSource()

  assert.match(source, /export const runtime = "nodejs"/)
  assert.match(source, /export async function POST\(request: NextRequest\)/)
  assert.match(source, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(source, /appAuthRequiredResponse\(\)/)
  assert.match(source, /getAliyunRdsAppAccountContext\(auth\.user\)/)
  assert.match(source, /resolveAssetReadScope/)
  assert.match(source, /ctx\.isPlatformAdmin/)
  assert.match(source, /requestedCompanyId !== ctx\.companyId/)
  assert.match(source, /requestedStoreId !== ctx\.storeId/)
  assert.match(source, /tenant_scope_denied/)
  assert.match(source, /CUSTOMER_KNOWLEDGE_PREFIX = "customer-knowledge"/)
  assert.match(source, /expectedTenantObjectPrefix/)
  assert.match(source, /objectKey\.startsWith\(expectedPrefix\)/)
})

test("APP assets sign-read route returns a short-lived Aliyun OSS signed GET URL", () => {
  const source = appAssetSignReadRouteSource()

  assert.match(source, /ASSET_SIGN_READ_TTL_SECONDS = 300/)
  assert.match(source, /APP_ASSET_SIGN_READ_BASE_URL/)
  assert.match(source, /APP_ASSET_BASE_URL/)
  assert.match(source, /asset_read_endpoint_must_use_https/)
  assert.match(source, /asset_read_endpoint_exposes_private_bucket/)
  assert.match(source, /ALIYUN_OSS_ACCESS_KEY_ID/)
  assert.match(source, /ALIYUN_OSS_ACCESS_KEY_SECRET/)
  assert.match(source, /ALIYUN_OSS_SECURITY_TOKEN/)
  assert.match(source, /createHmac\("sha1", secret\)/)
  assert.match(source, /`GET\\n\\n\\n\$\{expires\}\\n\$\{canonicalResource\}`/)
  assert.match(source, /OSSAccessKeyId/)
  assert.match(source, /params\.set\("security-token", credentials\.securityToken\)/)
  assert.match(source, /provider: PROVIDER/)
  assert.match(source, /visibility: VISIBILITY/)
  assert.match(source, /signed_url: signed\.signedUrl/)
  assert.match(source, /expires_at: signed\.expiresAt/)
  assert.match(source, /signed_action: "get_customer_knowledge_asset"/)
})

test("APP assets sign-read route has no OSS writes, DB writes, or private bucket response field", () => {
  const source = appAssetSignReadRouteSource()
  const responseStart = source.indexOf("return NextResponse.json({\n      ok: true")
  const responseEnd = source.indexOf("\n    })", responseStart)
  const responseBlock = source.slice(responseStart, responseEnd)

  assert.ok(responseStart >= 0, "success response block should be present")
  assert.doesNotMatch(responseBlock, /\bbucket\b/)
  assert.doesNotMatch(source, /bucket:\s*credentials\.bucket/)
  assert.doesNotMatch(source, /createAliyunRdsServiceRecordOssPostPolicy/)
  assert.doesNotMatch(source, /uploadAliyunRdsServiceRecordOssObject/)
  assert.doesNotMatch(source, /createAliyunOssPostPolicy/)
  assert.doesNotMatch(source, /method:\s*"PUT"/)
  assert.doesNotMatch(source, /insert into public\./)
  assert.doesNotMatch(source, /update public\./)
  assert.doesNotMatch(source, /delete from public\./)
  assert.doesNotMatch(source, /withAliyunRdsTransaction/)
  assert.doesNotMatch(source, /createServerSupabaseClientForRequest/)
  assert.doesNotMatch(source, /public-read/)
})

test("APP assets sign-read is included in App client contract routes and coverage", () => {
  const contract = read("scripts", "check-app-client-api-contract.mjs")
  const routes = read("scripts", "check-app-api-production-cn-routes.mjs")
  const coverage = read("scripts", "check-app-api-smoke-coverage.mjs")

  assert.match(contract, /"\/api\/app\/assets\/sign-read"/)
  assert.match(contract, /const DEFERRED_PREFIXES = \[\]/)
  assert.match(routes, /scope:\s*"assets"/)
  assert.match(routes, /route:\s*"\/api\/app\/assets\/sign-read"/)
  assert.match(routes, /file:\s*"app\/api\/app\/assets\/sign-read\/route\.ts"/)
  assert.match(routes, /methods:\s*\["POST"\]/)
  assert.match(coverage, /scope:\s*"assets"/)
  assert.match(coverage, /path:\s*"\/api\/app\/assets\/sign-read"/)
  assert.match(coverage, /expected:\s*\[\{\s*status:\s*401\s*\}\]/)
})
