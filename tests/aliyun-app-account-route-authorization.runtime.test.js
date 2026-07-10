/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const authorizationPath = path.join(root, "lib", "aliyun-rds", "app-authorization.server.ts")
const serviceRepositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "service-records.server.ts")
const storeRepositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "store-admin.server.ts")
const voiceFacadePath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")
const serviceListRoutePath = path.join(root, "app", "api", "app", "service-records", "sessions", "route.ts")
const serviceDetailRoutePath = path.join(
  root,
  "app",
  "api",
  "app",
  "service-records",
  "sessions",
  "[sessionId]",
  "route.ts",
)
const storeServiceRecordsRoutePath = path.join(root, "app", "api", "app", "store-admin", "service-records", "route.ts")
const voiceSessionsRoutePath = path.join(root, "app", "api", "app", "voice-coach", "sessions", "route.ts")

let cachedAuthorization = null

function compileTsModule(filePath, stubs) {
  assert.equal(fs.existsSync(filePath), true, `${path.relative(root, filePath)} must exist`)
  const source = fs.readFileSync(filePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText
  const compiledModule = new Module(filePath, module)
  compiledModule.filename = filePath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filePath))
  compiledModule.require = (moduleId) => {
    if (moduleId in stubs) return stubs[moduleId]
    return require(moduleId)
  }
  compiledModule._compile(compiled, filePath)
  return compiledModule.exports
}

function authorizationModule() {
  if (!cachedAuthorization) {
    cachedAuthorization = compileTsModule(authorizationPath, { "server-only": {} })
  }
  return cachedAuthorization
}

function jsonResponse(body, init = {}) {
  return {
    status: init.status ?? 200,
    body,
    async json() {
      return body
    },
  }
}

const nextServer = {
  NextRequest: class NextRequest {},
  NextResponse: { json: jsonResponse },
}

function request(pathname) {
  return {
    url: `https://api.example.invalid${pathname}`,
    headers: { get: () => null },
  }
}

function appAccountContext(overrides = {}, billing = { aiPointsBalance: 12, aiPointsUnlimited: false }) {
  const identity = {
    accountStatus: "bound",
    userId: "user-1",
    membershipId: "membership-1",
    role: "employee",
    companyId: "company-1",
    storeId: "store-1",
    isCompanyManager: false,
    isStoreManager: false,
    isPlatformAdmin: false,
    ...overrides,
  }
  const features = authorizationModule().buildAppFeatureDecisions(identity, billing)
  return {
    ...identity,
    userEmail: "account@example.invalid",
    roleLabel: "员工",
    companyName: identity.companyId ? "测试公司" : null,
    storeName: identity.storeId ? "测试门店" : null,
    scopeLabel: identity.storeId || identity.companyId || "",
    memberships: [],
    isManager: identity.isCompanyManager || identity.isStoreManager || identity.isPlatformAdmin,
    features,
  }
}

function authStubs(ctx, counters) {
  return {
    appAuthConfigurationErrorResponse: () => null,
    appAuthRequiredResponse: () => jsonResponse({ ok: false, code: "auth_required" }, { status: 401 }),
    resolveAliyunRdsAppAuthUser: async () => {
      counters.authResolutions += 1
      return { user: { id: ctx.userId, email: ctx.userEmail, user_metadata: {} } }
    },
  }
}

function sessionRow(overrides = {}) {
  return {
    id: "session-1",
    created_at: "2026-07-01T08:00:00.000Z",
    updated_at: "2026-07-01T08:00:00.000Z",
    user_id: "other-user",
    company_id: "company-1",
    store_id: "store-1",
    membership_id: "membership-other",
    client_session_id: "client-session-1",
    customer_profile_id: null,
    scene_card_id: null,
    status: "recording",
    objective: null,
    participants: [],
    consent_confirmed: true,
    consent_note: null,
    started_at: "2026-07-01T08:00:00.000Z",
    ended_at: null,
    resume_deadline_at: null,
    processing_started_at: null,
    completed_at: null,
    audio_seconds: 0,
    segment_count: 0,
    customer_snapshot_json: null,
    scene_snapshot_json: null,
    context_snapshot_json: null,
    result_json: null,
    note_markdown: null,
    profile_suggestions_json: null,
    xhs_draft_id: null,
    metadata: null,
    ...overrides,
  }
}

function serviceHarness(ctx, options = {}) {
  const counters = {
    authResolutions: 0,
    accountResolutions: 0,
    listQueries: 0,
    sessionQueries: 0,
    segmentQueries: 0,
    markerQueries: 0,
    transactionCalls: 0,
  }
  const queryAliyunRds = async (sql) => {
    const text = String(sql).replace(/\s+/g, " ").trim()
    if (text.includes("from public.service_record_segments")) {
      counters.segmentQueries += 1
      return { rows: [] }
    }
    if (text.includes("from public.service_record_markers")) {
      counters.markerQueries += 1
      return { rows: [] }
    }
    if (text.includes("from public.service_record_sessions")) {
      if (/where id = \$1 limit 1/i.test(text)) {
        counters.sessionQueries += 1
        return { rows: options.readableSession ? [options.readableSession] : [] }
      }
      counters.listQueries += 1
      return { rows: [] }
    }
    throw new Error(`unexpected service-record query: ${text}`)
  }
  const serviceRepository = compileTsModule(serviceRepositoryPath, {
    "server-only": {},
    "next/server": nextServer,
    "@/lib/aliyun-rds/app-auth.server": authStubs(ctx, counters),
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      queryAliyunRds,
      withAliyunRdsTransaction: async () => {
        counters.transactionCalls += 1
        throw new Error("transaction_must_not_run")
      },
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: () => ({ account_status: ctx.accountStatus }),
      getAliyunRdsAppAccountContext: async () => {
        counters.accountResolutions += 1
        return ctx
      },
    },
    "@/lib/aliyun-rds/app-authorization.server": authorizationModule(),
  })
  return { counters, serviceRepository }
}

function serviceListRoute(serviceRepository) {
  return compileTsModule(serviceListRoutePath, {
    "next/server": nextServer,
    "@/lib/aliyun-rds/repositories/service-records.server": serviceRepository,
  })
}

function serviceDetailRoute(serviceRepository) {
  return compileTsModule(serviceDetailRoutePath, {
    "next/server": nextServer,
    "@/lib/aliyun-rds/repositories/service-records.server": serviceRepository,
  })
}

function storeHarness(ctx) {
  const counters = {
    authResolutions: 0,
    accountResolutions: 0,
    businessQueries: 0,
    listCalls: 0,
  }
  const storeRepository = compileTsModule(storeRepositoryPath, {
    "server-only": {},
    "next/server": nextServer,
    "@/lib/aliyun-rds/app-auth.server": authStubs(ctx, counters),
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      isAliyunRdsRuntimeUnavailableError: () => false,
      queryAliyunRds: async () => {
        counters.businessQueries += 1
        return { rows: [] }
      },
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: () => ({ account_status: ctx.accountStatus }),
      getAliyunRdsAppAccountContext: async () => {
        counters.accountResolutions += 1
        return ctx
      },
      getAliyunRdsAppAccountRoleLabel: () => "员工",
    },
    "@/lib/aliyun-rds/app-authorization.server": authorizationModule(),
    "@/lib/voice-coach/session-context": { getVoiceCoachSessionClientContext: () => ({}) },
    "@/lib/voice-coach/scenarios": { getScenario: () => ({ id: "scenario-1", name: "测试" }) },
  })
  const route = compileTsModule(storeServiceRecordsRoutePath, {
    "next/server": nextServer,
    "@/lib/aliyun-rds/repositories/store-admin.server": storeRepository,
    "@/lib/aliyun-rds/repositories/service-records.server": {
      accountPayload: () => ({ account_status: ctx.accountStatus }),
      cleanText: (value) => String(value || "").trim(),
      listAliyunRdsServiceRecordSessions: async () => {
        counters.listCalls += 1
        return []
      },
      rdsServiceRecordErrorResponse: () => jsonResponse({ ok: false, code: "query_failed" }, { status: 500 }),
      toPublicSession: (value) => value,
    },
  })
  return { counters, route, storeRepository }
}

function voiceHarness(ctx) {
  const counters = {
    authResolutions: 0,
    accountResolutions: 0,
    listCalls: 0,
    localStoreCalls: 0,
  }
  const fileSystemStub = {
    existsSync: () => {
      counters.localStoreCalls += 1
      return false
    },
    mkdirSync: () => {
      counters.localStoreCalls += 1
    },
    readFileSync: () => {
      counters.localStoreCalls += 1
      return ""
    },
    renameSync: () => {
      counters.localStoreCalls += 1
    },
    writeFileSync: () => {
      counters.localStoreCalls += 1
    },
  }
  const facade = compileTsModule(voiceFacadePath, {
    "server-only": {},
    "node:fs": fileSystemStub,
    "next/server": nextServer,
    "@/lib/aliyun-rds/app-auth.server": authStubs(ctx, counters),
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      isAliyunRdsRuntimeUnavailableError: () => false,
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: () => ({ account_status: ctx.accountStatus }),
      getAliyunRdsAppAccountContext: async () => {
        counters.accountResolutions += 1
        return ctx
      },
    },
    "@/lib/aliyun-rds/app-authorization.server": authorizationModule(),
    "@/lib/voice-coach/scenarios": { getScenario: () => ({ id: "scenario-1", name: "测试" }) },
  })
  const route = compileTsModule(voiceSessionsRoutePath, {
    "next/server": nextServer,
    "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server": {
      ...facade,
      listAppVoiceCoachTextSessionsResponse: async () => {
        counters.listCalls += 1
        return jsonResponse({ ok: true, sessions: [] })
      },
    },
  })
  return { counters, facade, route }
}

test("service-record collection denies account states before list queries", async () => {
  const cases = [
    {
      name: "unbound",
      ctx: appAccountContext({ accountStatus: "not_bound", membershipId: null, companyId: null, storeId: null }),
      code: "not_bound",
    },
    {
      name: "customer",
      ctx: appAccountContext({
        accountStatus: "role_denied",
        membershipId: null,
        role: "customer",
        companyId: null,
        storeId: null,
      }),
      code: "role_denied",
    },
    {
      name: "unknown",
      ctx: appAccountContext({
        accountStatus: "role_denied",
        membershipId: null,
        role: null,
        companyId: null,
        storeId: null,
      }),
      code: "role_denied",
    },
    { name: "suspended", ctx: appAccountContext({ accountStatus: "suspended" }), code: "suspended" },
    { name: "inactive", ctx: appAccountContext({ accountStatus: "inactive" }), code: "inactive" },
  ]
  const observations = []

  for (const item of cases) {
    const { counters, serviceRepository } = serviceHarness(item.ctx)
    const response = await serviceListRoute(serviceRepository).GET(request("/api/app/service-records/sessions?limit=5"))
    observations.push({
      name: item.name,
      status: response.status,
      body: response.body,
      authResolutions: counters.authResolutions,
      accountResolutions: counters.accountResolutions,
      listQueries: counters.listQueries,
    })
  }

  assert.deepEqual(
    observations,
    cases.map((item) => ({
      name: item.name,
      status: 403,
      body: { ok: false, code: item.code, feature: "service_record" },
      authResolutions: 1,
      accountResolutions: 1,
      listQueries: 0,
    })),
  )
})

test("service-record collection enforces role-aware effective scope before queries", async () => {
  const cases = [
    {
      name: "employee_other_store",
      ctx: appAccountContext(),
      url: "/api/app/service-records/sessions?store_id=store-2",
    },
    {
      name: "employee_company_only",
      ctx: appAccountContext(),
      url: "/api/app/service-records/sessions?company_id=company-1",
    },
    {
      name: "company_admin_store",
      ctx: appAccountContext({
        role: "company_owner",
        storeId: null,
        isCompanyManager: true,
      }),
      url: "/api/app/service-records/sessions?company_id=company-1&store_id=store-1",
    },
    {
      name: "employee_explicit_empty_store",
      ctx: appAccountContext(),
      url: "/api/app/service-records/sessions?store_id=",
    },
  ]
  const observations = []

  for (const item of cases) {
    const { counters, serviceRepository } = serviceHarness(item.ctx)
    const response = await serviceListRoute(serviceRepository).GET(request(item.url))
    observations.push({ name: item.name, status: response.status, body: response.body, listQueries: counters.listQueries })
  }

  assert.deepEqual(
    observations,
    cases.map((item) => ({
      name: item.name,
      status: 403,
      body: { ok: false, code: "tenant_scope_denied", feature: "service_record" },
      listQueries: 0,
    })),
  )
})

test("valid employee service-record collection reaches the list query exactly once", async () => {
  const { counters, serviceRepository } = serviceHarness(appAccountContext())

  const response = await serviceListRoute(serviceRepository).GET(request("/api/app/service-records/sessions?limit=5"))

  assert.equal(response.status, 200)
  assert.equal(counters.authResolutions, 1)
  assert.equal(counters.accountResolutions, 1)
  assert.equal(counters.listQueries, 1)
  assert.equal(counters.sessionQueries, 0)
})

test("store-admin resolver denies employees canonically and valid managers continue once", async () => {
  const employeeHarness = storeHarness(appAccountContext())
  const employeeResponse = await employeeHarness.route.GET(
    request("/api/app/store-admin/service-records?limit=5"),
  )
  assert.equal(employeeResponse.status, 403)
  assert.deepEqual(employeeResponse.body, { ok: false, code: "role_denied", feature: "store_admin" })
  assert.equal(employeeHarness.counters.listCalls, 0)
  assert.equal(employeeHarness.counters.businessQueries, 0)

  const manager = appAccountContext({ role: "store_admin", isStoreManager: true })
  const managerHarness = storeHarness(manager)
  const managerResponse = await managerHarness.route.GET(
    request("/api/app/store-admin/service-records?limit=5"),
  )
  assert.equal(managerResponse.status, 200)
  assert.equal(managerHarness.counters.authResolutions, 1)
  assert.equal(managerHarness.counters.accountResolutions, 1)
  assert.equal(managerHarness.counters.listCalls, 1)
  assert.equal(managerHarness.counters.businessQueries, 0)

  const inconsistentManagerHarness = storeHarness({ ...manager, isManager: false })
  const inconsistentManagerResponse = await inconsistentManagerHarness.route.GET(
    request("/api/app/store-admin/service-records?limit=5"),
  )
  assert.equal(inconsistentManagerResponse.status, 403)
  assert.deepEqual(inconsistentManagerResponse.body, {
    ok: false,
    code: "role_denied",
    feature: "store_admin",
  })
  assert.equal(inconsistentManagerHarness.counters.listCalls, 0)

  const malformedManagerHarness = storeHarness(manager)
  const malformedManagerResponse = await malformedManagerHarness.route.GET(
    request("/api/app/store-admin/service-records?store_id="),
  )
  assert.equal(malformedManagerResponse.status, 403)
  assert.deepEqual(malformedManagerResponse.body, {
    ok: false,
    code: "tenant_scope_denied",
    feature: "store_admin",
  })
  assert.equal(malformedManagerHarness.counters.listCalls, 0)

  const companyAdmin = appAccountContext({ role: "company_owner", storeId: null, isCompanyManager: true })
  const companyAdminHarness = storeHarness(companyAdmin)
  const companyAdminResponse = await companyAdminHarness.route.GET(
    request("/api/app/store-admin/service-records?store_id=store-1"),
  )
  assert.equal(companyAdminResponse.status, 403)
  assert.deepEqual(companyAdminResponse.body, {
    ok: false,
    code: "tenant_scope_denied",
    feature: "store_admin",
  })
  assert.equal(companyAdminHarness.counters.listCalls, 0)
})

test("cross-store object lookup returns exact not_found without child queries or metadata", async () => {
  const manager = appAccountContext({ role: "store_admin", isStoreManager: true })
  const foreignSession = sessionRow({ id: "foreign-session-secret", store_id: "store-2", metadata: { secret: true } })
  const { counters, serviceRepository } = serviceHarness(manager, { readableSession: foreignSession })

  const response = await serviceDetailRoute(serviceRepository).GET(
    request("/api/app/service-records/sessions/foreign-session-secret"),
    { params: Promise.resolve({ sessionId: "foreign-session-secret" }) },
  )

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { ok: false, code: "not_found" })
  assert.equal(JSON.stringify(response.body).includes("foreign-session-secret"), false)
  assert.equal(JSON.stringify(response.body).includes("secret"), false)
  assert.equal(counters.sessionQueries, 1)
  assert.equal(counters.segmentQueries, 0)
  assert.equal(counters.markerQueries, 0)
})

test("same-store employee cannot read another employee service record", async () => {
  const requestedSessionId = "requested-session-secret"
  const resourceSessionId = "resource-session-secret"
  const otherEmployeeSession = sessionRow({ id: resourceSessionId, user_id: "other-employee" })
  const { counters, serviceRepository } = serviceHarness(appAccountContext(), {
    readableSession: otherEmployeeSession,
  })

  const response = await serviceDetailRoute(serviceRepository).GET(
    request(`/api/app/service-records/sessions/${requestedSessionId}`),
    { params: Promise.resolve({ sessionId: requestedSessionId }) },
  )

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { ok: false, code: "not_found" })
  assert.equal(JSON.stringify(response.body).includes(requestedSessionId), false)
  assert.equal(JSON.stringify(response.body).includes(resourceSessionId), false)
  assert.equal(counters.sessionQueries, 1)
  assert.equal(counters.segmentQueries, 0)
  assert.equal(counters.markerQueries, 0)
})

test("same-store employee can read their own service record exactly once", async () => {
  const ownedSession = sessionRow({ id: "owned-session", user_id: "user-1" })
  const { counters, serviceRepository } = serviceHarness(appAccountContext(), {
    readableSession: ownedSession,
  })

  const response = await serviceDetailRoute(serviceRepository).GET(
    request("/api/app/service-records/sessions/owned-session"),
    { params: Promise.resolve({ sessionId: "owned-session" }) },
  )

  assert.equal(response.status, 200)
  assert.equal(response.body.session.id, "owned-session")
  assert.equal(counters.sessionQueries, 1)
  assert.equal(counters.segmentQueries, 1)
  assert.equal(counters.markerQueries, 1)
})

test("company and platform managers retain valid service-record object access", async () => {
  const cases = [
    {
      name: "company_manager",
      ctx: appAccountContext({
        role: "company_owner",
        storeId: null,
        isCompanyManager: true,
      }),
      session: sessionRow(),
      url: "/api/app/service-records/sessions/session-1",
    },
    {
      name: "platform_manager",
      ctx: appAccountContext({
        role: "platform_admin",
        membershipId: null,
        companyId: null,
        storeId: null,
        isCompanyManager: true,
        isPlatformAdmin: true,
      }),
      session: sessionRow({ company_id: "company-2", store_id: "store-2" }),
      url: "/api/app/service-records/sessions/session-1?company_id=company-2&store_id=store-2",
    },
  ]
  const observations = []

  for (const item of cases) {
    const { counters, serviceRepository } = serviceHarness(item.ctx, { readableSession: item.session })
    const response = await serviceDetailRoute(serviceRepository).GET(
      request(item.url),
      { params: Promise.resolve({ sessionId: "session-1" }) },
    )
    observations.push({ name: item.name, status: response.status, counters })
  }

  assert.deepEqual(
    observations.map(({ name, status, counters }) => ({
      name,
      status,
      sessionQueries: counters.sessionQueries,
      segmentQueries: counters.segmentQueries,
      markerQueries: counters.markerQueries,
    })),
    cases.map(({ name }) => ({
      name,
      status: 200,
      sessionQueries: 1,
      segmentQueries: 1,
      markerQueries: 1,
    })),
  )
})

test("company manager cannot read another company service record", async () => {
  const requestedSessionId = "cross-company-request-secret"
  const resourceSessionId = "cross-company-resource-secret"
  const companyManager = appAccountContext({
    role: "company_owner",
    storeId: null,
    isCompanyManager: true,
  })
  const otherCompanySession = sessionRow({
    id: resourceSessionId,
    company_id: "company-2",
    store_id: "store-2",
    metadata: { secret: true },
  })
  const { counters, serviceRepository } = serviceHarness(companyManager, {
    readableSession: otherCompanySession,
  })

  const response = await serviceDetailRoute(serviceRepository).GET(
    request(`/api/app/service-records/sessions/${requestedSessionId}`),
    { params: Promise.resolve({ sessionId: requestedSessionId }) },
  )

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { ok: false, code: "not_found" })
  assert.equal(JSON.stringify(response.body).includes(requestedSessionId), false)
  assert.equal(JSON.stringify(response.body).includes(resourceSessionId), false)
  assert.equal(JSON.stringify(response.body).includes("secret"), false)
  assert.equal(counters.sessionQueries, 1)
  assert.equal(counters.segmentQueries, 0)
  assert.equal(counters.markerQueries, 0)
})

test("same-store manager object lookup reaches each existing reader exactly once", async () => {
  const manager = appAccountContext({ role: "store_admin", isStoreManager: true })
  const { counters, serviceRepository } = serviceHarness(manager, { readableSession: sessionRow() })

  const response = await serviceDetailRoute(serviceRepository).GET(
    request("/api/app/service-records/sessions/session-1"),
    { params: Promise.resolve({ sessionId: "session-1" }) },
  )

  assert.equal(response.status, 200)
  assert.equal(counters.sessionQueries, 1)
  assert.equal(counters.segmentQueries, 1)
  assert.equal(counters.markerQueries, 1)
})

test("voice-coach entitlement denial precedes list or local-store work and valid employee continues once", async () => {
  const zeroPointHarness = voiceHarness(
    appAccountContext({}, { aiPointsBalance: 0, aiPointsUnlimited: false }),
  )
  const deniedResponse = await zeroPointHarness.route.GET(
    request("/api/app/voice-coach/sessions?limit=5"),
  )
  assert.equal(deniedResponse.status, 403)
  assert.deepEqual(deniedResponse.body, {
    ok: false,
    code: "entitlement_denied",
    feature: "voice_coach",
  })
  assert.equal(zeroPointHarness.counters.listCalls, 0)
  assert.equal(zeroPointHarness.counters.localStoreCalls, 0)

  const positiveHarness = voiceHarness(appAccountContext())
  const allowedResponse = await positiveHarness.route.GET(
    request("/api/app/voice-coach/sessions?limit=5"),
  )
  assert.equal(allowedResponse.status, 200)
  assert.equal(positiveHarness.counters.authResolutions, 1)
  assert.equal(positiveHarness.counters.accountResolutions, 1)
  assert.equal(positiveHarness.counters.listCalls, 1)
  assert.equal(positiveHarness.counters.localStoreCalls, 0)

  const companyAdminHarness = voiceHarness(
    appAccountContext({ role: "company_owner", storeId: null, isCompanyManager: true }),
  )
  const companyAdminResponse = await companyAdminHarness.route.GET(
    request("/api/app/voice-coach/sessions?company_id=company-1&store_id=store-1"),
  )
  assert.equal(companyAdminResponse.status, 403)
  assert.deepEqual(companyAdminResponse.body, {
    ok: false,
    code: "tenant_scope_denied",
    feature: "voice_coach",
  })
  assert.equal(companyAdminHarness.counters.listCalls, 0)
  assert.equal(companyAdminHarness.counters.localStoreCalls, 0)

  const platformHarness = voiceHarness(
    appAccountContext({
      membershipId: null,
      role: "platform_admin",
      companyId: null,
      storeId: null,
      isPlatformAdmin: true,
    }),
  )
  const platformResponse = await platformHarness.route.GET(
    request("/api/app/voice-coach/sessions?company_id=company-2&store_id=store-2"),
  )
  assert.equal(platformResponse.status, 200)
  assert.equal(platformHarness.counters.listCalls, 1)
  assert.equal(platformHarness.counters.localStoreCalls, 0)
})
