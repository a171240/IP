/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const FIRST_VERSION_ROUTES = [
  { method: "POST", route: "/api/app/auth/wechat", smokePath: "/api/app/auth/wechat", smokeStatus: 400 },
  { method: "POST", route: "/api/app/auth/logout", smokePath: "/api/app/auth/logout", smokeStatus: 401 },
  { method: "GET", route: "/api/app/profile", smokePath: "/api/app/profile", smokeStatus: 401 },
  { method: "GET", route: "/api/app/entitlements", smokePath: "/api/app/entitlements", smokeStatus: 401 },
  { method: "POST", route: "/api/app/account/bootstrap", smokeExcluded: "authenticated_mutation" },
  { method: "POST", route: "/api/app/store-admin/invites", smokePath: "/api/app/store-admin/invites", smokeStatus: 401 },
  {
    method: "GET",
    route: "/api/app/store-admin/invites/[token]/preview",
    smokePath: "/api/app/store-admin/invites/app-smoke-invalid-token/preview",
    smokeStatus: 404,
  },
  {
    method: "GET",
    route: "/api/app/store-admin/invites/[token]/qrcode",
    smokePath: "/api/app/store-admin/invites/app-smoke-invalid-token/qrcode",
    smokeStatus: 404,
  },
  {
    method: "POST",
    route: "/api/app/store-admin/invites/[token]/accept",
    smokePath: "/api/app/store-admin/invites/app-smoke-invalid-token/accept",
    smokeStatus: 401,
  },
  {
    method: "GET",
    route: "/api/app/service-records/sessions",
    smokePath: "/api/app/service-records/sessions",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions",
    smokePath: "/api/app/service-records/sessions",
    smokeStatus: 401,
  },
  {
    method: "GET",
    route: "/api/app/service-records/sessions/[sessionId]",
    smokePath: "/api/app/service-records/sessions/app-smoke-session",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/segments",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/segments",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/device-files/check",
    smokePath: "/api/app/service-records/device-files/check",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/oss-upload",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/oss-upload",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/segments/oss",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/segments/oss",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/resume",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/resume",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/end",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/end",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/process",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/process",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/markers",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/markers",
    smokeStatus: 401,
  },
  {
    method: "POST",
    route: "/api/app/service-records/sessions/[sessionId]/asr/poll",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/asr/poll",
    smokeStatus: 401,
  },
  {
    method: "GET",
    route: "/api/app/service-records/sessions/[sessionId]/audio/[segmentId]",
    smokePath: "/api/app/service-records/sessions/app-smoke-session/audio/app-smoke-segment",
    smokeStatus: 401,
  },
  {
    method: "GET",
    route: "/api/app/store-admin/service-records",
    smokePath: "/api/app/store-admin/service-records",
    smokeStatus: 401,
  },
]

const EXPECTED_LIVE_PROBE_KEYS = [
  "POST /api/app/auth/wechat",
  "POST /api/app/auth/logout",
  "POST /api/app/wechat/login",
  "GET /api/app/profile",
  "GET /api/app/entitlements",
  "GET /api/app/store-admin/overview",
  "GET /api/app/store-admin/members",
  "GET /api/app/store-admin/analytics",
  "GET /api/app/store-admin/service-records",
  "POST /api/app/store-admin/invites",
  "GET /api/app/store-admin/invites/app-smoke-invalid-token/preview",
  "GET /api/app/store-admin/invites/app-smoke-invalid-token/qrcode",
  "POST /api/app/store-admin/invites/app-smoke-invalid-token/accept",
  "GET /api/app/store-profiles",
  "GET /api/app/store-profiles/app-smoke-profile",
  "GET /api/app/customer-profiles",
  "GET /api/app/customer-profiles/app-smoke-profile",
  "GET /api/app/scene-cards",
  "GET /api/app/scene-cards/app-smoke-card",
  "GET /api/app/service-records/sessions",
  "POST /api/app/service-records/sessions",
  "POST /api/app/service-records/device-files/check",
  "GET /api/app/service-records/sessions/app-smoke-session",
  "POST /api/app/service-records/sessions/app-smoke-session/segments",
  "POST /api/app/service-records/sessions/app-smoke-session/oss-upload",
  "POST /api/app/service-records/sessions/app-smoke-session/segments/oss",
  "POST /api/app/service-records/sessions/app-smoke-session/markers",
  "POST /api/app/service-records/sessions/app-smoke-session/resume",
  "POST /api/app/service-records/sessions/app-smoke-session/end",
  "POST /api/app/service-records/sessions/app-smoke-session/process",
  "POST /api/app/service-records/sessions/app-smoke-session/asr/poll",
  "GET /api/app/service-records/sessions/app-smoke-session/audio/app-smoke-segment",
]

const OUT_OF_FIRST_VERSION_ROUTES = [
  "/api/app/posters/generate",
  "/api/app/xhs/generate-v4",
  "/api/app/private-copy/generate",
  "/api/app/xhs/generate-cover-image",
]

async function importScript(...parts) {
  return import(pathToFileURL(path.join(root, ...parts)).href)
}

function probeKey(item) {
  return `${item.method} ${item.path}`
}

test("first-version APP API routes are present in the production-cn route registry", async () => {
  const { REQUIRED_ROUTES } = await importScript("scripts", "check-app-api-production-cn-routes.mjs")
  const routes = new Map()
  for (const item of REQUIRED_ROUTES) {
    for (const method of item.methods) {
      routes.set(`${method} ${item.route}`, item)
    }
  }

  for (const expected of FIRST_VERSION_ROUTES) {
    const registryItem = routes.get(`${expected.method} ${expected.route}`)
    assert.ok(registryItem, `${expected.method} ${expected.route} should be registered`)
    assert.ok(fs.existsSync(path.join(root, registryItem.file)), `${registryItem.file} should exist`)
    assert.ok(registryItem.methods.includes(expected.method), `${expected.route} should export ${expected.method}`)
  }

  for (const route of OUT_OF_FIRST_VERSION_ROUTES) {
    assert.equal(
      [...routes.values()].some((item) => item.route === route),
      false,
      `${route} should stay outside the first-version required route gate`,
    )
  }
})

test("first-version APP API smoke plan proves routes with auth or payload guards only", async () => {
  const { MUTATION_EXCLUDED_ROUTES, PROBES, buildProbePlanForRuntime } = await importScript(
    "scripts",
    "smoke-app-api-production-cn.mjs",
  )
  const probes = new Map(PROBES.map((item) => [probeKey(item), item]))

  for (const expected of FIRST_VERSION_ROUTES) {
    if (!expected.smokePath) continue
    const probe = probes.get(`${expected.method} ${expected.smokePath}`)
    assert.ok(probe, `${expected.method} ${expected.smokePath} should have a smoke probe`)
    assert.ok(
      probe.expected.some((item) => item.status === expected.smokeStatus),
      `${expected.method} ${expected.smokePath} should expect ${expected.smokeStatus}`,
    )
  }

  const wechatLoginProbe = probes.get("POST /api/app/auth/wechat")
  assert.ok(wechatLoginProbe.expected.some((item) => item.status === 400 && item.code === "missing_code"))
  assert.deepEqual(PROBES.map(probeKey), EXPECTED_LIVE_PROBE_KEYS)
  assert.equal(PROBES.length, 32)
  assert.equal(probes.has("POST /api/app/account/bootstrap"), false)
  assert.deepEqual(MUTATION_EXCLUDED_ROUTES, [
    {
      scope: "account",
      method: "POST",
      path: "/api/app/account/bootstrap",
      reason: "authenticated_profile_mutation",
    },
  ])
  assert.equal(
    PROBES.some((item) => OUT_OF_FIRST_VERSION_ROUTES.includes(item.path)),
    false,
    "A5 generation routes should not enter first-version production smoke",
  )

  const localPlan = buildProbePlanForRuntime(PROBES, {
    env: new Map([["DATABASE_URL_CN", "TODO_REPLACE_WITH_ALIYUN_RDS_URL"]]),
    allowLocalRdsUnavailable: true,
  })
  const localPreviewProbe = localPlan.find(
    (item) => item.path === "/api/app/store-admin/invites/app-smoke-invalid-token/preview",
  )
  const localQrProbe = localPlan.find(
    (item) => item.path === "/api/app/store-admin/invites/app-smoke-invalid-token/qrcode",
  )
  assert.deepEqual(localPreviewProbe.expected, [
    { status: 503, code: "rds_not_configured" },
    { status: 503, code: "rds_unavailable" },
  ])
  assert.deepEqual(localQrProbe.expected, [
    { status: 503, code: "rds_not_configured" },
    { status: 503, code: "rds_unavailable" },
  ])
  assert.equal(localPreviewProbe.runtimeExpectation, "local_rds_unavailable")
})

test("first-version bridge map keeps scope narrow and records the committed facade status", () => {
  const bridgeMap = JSON.parse(read("deploy", "app-api-production-cn.bridge-map.json"))
  const bridgeRoutes = new Map(bridgeMap.routes.map((item) => [item.route, item]))

  assert.equal(bridgeMap.routes.length, 34)
  assert.deepEqual(bridgeMap.firstVersionScope, [
    "login",
    "test-token",
    "profile",
    "multi-tenant-permissions",
    "store-invites",
    "long-service-recording",
    "store-admin-service-records",
  ])
  assert.equal(bridgeRoutes.get("/api/app/profile").productionCnStatus, "bridge_ready")
  const bootstrapRoute = bridgeRoutes.get("/api/app/account/bootstrap")
  assert.ok(bootstrapRoute)
  assert.deepEqual(bootstrapRoute.methods, ["POST"])
  assert.equal(bootstrapRoute.appFile, "app/api/app/account/bootstrap/route.ts")
  assert.equal(bootstrapRoute.sourceType, "app_native")
  assert.equal(bootstrapRoute.productionCnStatus, "bridge_ready")
  const entitlementsRoute = bridgeRoutes.get("/api/app/entitlements")
  assert.equal(entitlementsRoute.sourceType, "app_native")
  assert.equal(Object.prototype.hasOwnProperty.call(entitlementsRoute, "sourceRoute"), false)
  assert.deepEqual(entitlementsRoute.sourceFiles, [
    "app/api/app/entitlements/route.ts",
    "lib/aliyun-rds/repositories/account-profile.server.ts",
    "lib/aliyun-rds/postgres.server.ts",
  ])
  assert.equal(bridgeRoutes.get("/api/app/store-admin/service-records").productionCnStatus, "bridge_ready")
  assert.equal(bridgeRoutes.get("/api/app/auth/wechat").productionCnStatus, "external_env_blocked")

  for (const route of OUT_OF_FIRST_VERSION_ROUTES) {
    assert.equal(bridgeRoutes.has(route), false, `${route} should stay out of first-version bridge map`)
  }
})
