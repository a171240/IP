/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const ROUTES = [
  ["app", "api", "app", "posters", "templates", "route.ts"],
  ["app", "api", "app", "posters", "history", "route.ts"],
  ["app", "api", "app", "posters", "generate", "route.ts"],
  ["app", "api", "app", "xhs", "generate-v4", "route.ts"],
  ["app", "api", "app", "xhs", "content", "danger-check", "route.ts"],
  ["app", "api", "app", "xhs", "drafts", "route.ts"],
  ["app", "api", "app", "xhs", "generate-cover-image", "route.ts"],
  ["app", "api", "app", "private-copy", "generate", "route.ts"],
  ["app", "api", "app", "private-copy", "drafts", "route.ts"],
]

function routeSource(parts) {
  return read(...parts)
}

test("APP content workflow helper is auth-gated and tenant scoped from account context", () => {
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")

  assert.match(helper, /resolveAliyunRdsAppAuthUser\(request\)/)
  assert.match(helper, /appAuthRequiredResponse\(\)/)
  assert.match(helper, /getAliyunRdsAppAccountContext\(auth\.user\)/)
  assert.match(helper, /accountContextPayload\(ctx\)/)
  assert.match(helper, /requestedCompanyId !== ctx\.companyId/)
  assert.match(helper, /requestedStoreId !== ctx\.storeId/)
  assert.match(helper, /tenant_scope_denied/)
  assert.match(helper, /company_id: scope\.companyId/)
  assert.match(helper, /store_id: scope\.storeId/)
  assert.match(helper, /APP_CONTENT_FORBIDDEN_SIDE_EFFECTS/)
  assert.match(helper, /"ai_generation"/)
  assert.match(helper, /"ai_point_charge"/)
  assert.match(helper, /"wechat_pay"/)
  assert.match(helper, /"external_xhs_or_wechat_call"/)
  assert.match(helper, /"production_write"/)
  assert.doesNotMatch(helper, /payload\.(company_id|companyId|store_id|storeId)/)
  assert.doesNotMatch(helper, /createServerSupabaseClientForRequest/)
  assert.doesNotMatch(helper, /resolveMpAiBillingContext/)
  assert.doesNotMatch(helper, /chargeMpAiPoints/)
})

test("APP content workflow facades expose only safe accepted, template, or list shapes", () => {
  const helper = read("lib", "aliyun-rds", "repositories", "app-content-workflows.server.ts")
  const combinedRoutes = ROUTES.map(routeSource).join("\n")

  assert.match(helper, /generation_status: "not_configured"/)
  assert.match(helper, /status: "not_persisted"/)
  assert.match(helper, /from public\.content_drafts/)
  assert.match(helper, /status = 'draft'/)
  assert.match(combinedRoutes, /getPublicPosterTemplates/)
  assert.match(combinedRoutes, /safeListAppContentDrafts/)
  assert.match(combinedRoutes, /appContentAcceptedResponse/)
  assert.match(combinedRoutes, /check_status: "not_configured"/)
  assert.match(combinedRoutes, /manualReviewRequired: true/)
  assert.doesNotMatch(combinedRoutes, /resolveMpAiBillingContext/)
  assert.doesNotMatch(combinedRoutes, /resolveBillingContext/)
  assert.doesNotMatch(combinedRoutes, /chargeMpAiPoints/)
  assert.doesNotMatch(combinedRoutes, /refundMpAiPoints/)
  assert.doesNotMatch(combinedRoutes, /generateGptImage2/)
  assert.doesNotMatch(combinedRoutes, /generateXhsV4/)
  assert.doesNotMatch(combinedRoutes, /generatePrivateCopyContent/)
  assert.doesNotMatch(combinedRoutes, /trackServerEvent/)
  assert.doesNotMatch(combinedRoutes, /\bfetch\(/)
  assert.doesNotMatch(combinedRoutes, /insert into public\./i)
  assert.doesNotMatch(combinedRoutes, /update public\./i)
  assert.doesNotMatch(combinedRoutes, /delete from public\./i)
  assert.doesNotMatch(combinedRoutes, /upload[A-Za-z]+Asset/)
  assert.doesNotMatch(combinedRoutes, /wechatpay|iap|publish/i)
})

test("APP content workflow route, coverage, and contract gates include the App client route plans", () => {
  const routes = read("scripts", "check-app-api-production-cn-routes.mjs")
  const coverage = read("scripts", "check-app-api-smoke-coverage.mjs")
  const contract = read("scripts", "check-app-client-api-contract.mjs")

  for (const route of [
    "/api/app/posters/templates",
    "/api/app/posters/history",
    "/api/app/posters/generate",
    "/api/app/xhs/generate-v4",
    "/api/app/xhs/content/danger-check",
    "/api/app/xhs/drafts",
    "/api/app/xhs/generate-cover-image",
    "/api/app/private-copy/generate",
    "/api/app/private-copy/drafts",
  ]) {
    assert.match(routes, new RegExp(route.replaceAll("/", "\\/")))
    assert.match(coverage, new RegExp(route.replaceAll("/", "\\/")))
  }

  assert.match(routes, /scope:\s*"content-poster"/)
  assert.match(routes, /scope:\s*"content-xhs"/)
  assert.match(routes, /scope:\s*"content-private-copy"/)
  assert.match(coverage, /expected:\s*\[\{\s*status:\s*401\s*\}\]/)
  assert.match(contract, /findContentWorkflowRoutePlans/)
  assert.match(contract, /source: "contentWorkflowRoutePlan"/)
  assert.match(contract, /"\/api\/app\/posters\/"/)
  assert.match(contract, /"\/api\/app\/xhs\/"/)
  assert.match(contract, /"\/api\/app\/private-copy\/"/)
  assert.match(contract, /const DEFERRED_PREFIXES = \[\]/)
})
