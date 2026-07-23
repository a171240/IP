/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "account-profile.server.ts")
const authorizationPath = path.join(root, "lib", "aliyun-rds", "app-authorization.server.ts")
const profileRoutePath = path.join(root, "app", "api", "app", "profile", "route.ts")
const entitlementsRoutePath = path.join(root, "app", "api", "app", "entitlements", "route.ts")
const contractPath = path.join(root, "contracts", "app-account-access-v1.json")

const expectedContract = {
  schema_version: 1,
  api_contract_id: "APP_G1_ACCOUNT_ACCESS_V1",
  routes: {
    profile: { method: "GET", path: "/api/app/profile" },
    entitlements: { method: "GET", path: "/api/app/entitlements" },
    bootstrap: { method: "POST", path: "/api/app/account/bootstrap" },
    invite_preview: { method: "GET", path: "/api/app/store-admin/invites/:token/preview" },
    invite_accept: { method: "POST", path: "/api/app/store-admin/invites/:token/accept" },
  },
  account_statuses: ["bound", "not_bound", "role_denied", "suspended", "inactive"],
  access_reasons: [
    "ok",
    "not_authenticated",
    "not_bound",
    "role_denied",
    "entitlement_denied",
    "suspended",
    "inactive",
    "tenant_scope_denied",
  ],
  profile_envelope: {
    top_level_keys: [
      "ok",
      "user",
      "account_status",
      "active_membership_id",
      "memberships",
      "entitlements",
      "features",
      "profile",
      "canonical_user_id",
      "identity_state",
      "access_mode",
      "authorization_version",
      "trial",
    ],
    user_keys: ["id"],
    membership_keys: [
      "id",
      "user_id",
      "role",
      "role_label",
      "scope",
      "status",
      "is_active",
      "company_id",
      "company_name",
      "store_id",
      "store_name",
      "joined_at",
    ],
    entitlement_keys: ["plan", "pro_expires_at"],
    feature_decision_keys: ["enabled", "reason", "source"],
    profile_keys: [
      "account_status",
      "membership_id",
      "account_role",
      "account_role_label",
      "company_id",
      "company_name",
      "store_id",
      "store_name",
      "plan",
      "plan_label",
      "service_plan_label",
      "ai_points_balance",
      "ai_points_unlimited",
      "nickname",
      "avatar_url",
    ],
  },
  entitlements_envelope: {
    top_level_keys: ["ok", "plan", "pro_expires_at", "features"],
    feature_decision_keys: ["enabled", "reason", "source"],
  },
  bootstrap_envelope: { top_level_keys: ["ok", "profile_initialized"] },
  feature_policy: {
    all_keys: [
      "auth",
      "account",
      "home",
      "entitlements",
      "orders",
      "service_record",
      "service_record_review",
      "store_admin",
      "member_invite",
      "company_admin",
      "platform_admin",
      "professional_learning",
      "speech_library",
      "voice_coach",
      "knowledge_context",
      "store_profiles",
      "customer_knowledge_base",
      "content",
      "poster",
      "xiaohongshu",
      "private_copy",
      "content_studio",
      "content_library",
    ],
    recovery_keys: ["auth", "account"],
    tenant_base_keys: [
      "home",
      "entitlements",
      "orders",
      "service_record",
      "professional_learning",
      "speech_library",
      "knowledge_context",
      "store_profiles",
      "customer_knowledge_base",
      "content_library",
    ],
    ai_point_keys: ["voice_coach", "content", "poster", "xiaohongshu", "private_copy", "content_studio"],
    manager_keys: ["service_record_review", "store_admin", "member_invite"],
    company_keys: ["company_admin"],
    platform_keys: ["platform_admin"],
    tenant_decision_precedence: [
      "suspended",
      "inactive",
      "role_denied",
      "not_bound",
      "entitlement_denied",
      "ok",
    ],
    missing_feature_decision: "entitlement_denied",
  },
  role_policy: {
    tenant_membership_roles: [
      "company_owner",
      "company_admin",
      "merchant_owner",
      "merchant_admin",
      "store_owner",
      "store_admin",
      "staff",
      "employee",
    ],
    normalized_role_map: {
      company_owner: "company_admin",
      company_admin: "company_admin",
      merchant_owner: "company_admin",
      merchant_admin: "company_admin",
      store_owner: "store_manager",
      store_admin: "store_manager",
      staff: "employee",
      employee: "employee",
      customer: "customer",
    },
    customer_role: "customer",
    platform_authority: "server_allowlist_only",
    platform_allowlist_override: "platform_admin",
    untrusted_membership_aliases: ["store_manager", "platform_admin", "service_operator"],
    untrusted_service_operator: { normalized_role: "guest", account_status: "role_denied" },
    unknown_or_null_role: { normalized_role: "guest", account_status: "role_denied" },
  },
  authorization_errors: {
    status: 403,
    body_keys: ["ok", "code", "feature"],
    collection_cross_scope: { status: 403, code: "tenant_scope_denied" },
    object_cross_scope: { status: 404, code: "not_found" },
  },
  invite_contract: {
    states: ["invalid", "unusable", "usable"],
    preview_keys: ["ok", "state", "usable", "unusable_reason", "invite"],
    invite_keys: [
      "id",
      "role",
      "role_label",
      "max_uses",
      "used_count",
      "expires_at",
      "status",
      "note",
      "company_id",
      "company_name",
      "store_id",
      "store_name",
    ],
    unusable_reasons: [
      "inactive",
      "expired",
      "exhausted",
      "company_inactive",
      "store_inactive",
      "role_denied",
    ],
    unknown_token: { status: 404, code: "invite_not_found" },
    role_denied: { status: 403, code: "role_denied" },
    found_unusable: { status: 410, code: "invite_unusable" },
  },
}

function compileTsModule(filePath, stubs) {
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

function profileRow(overrides = {}) {
  return {
    id: "user-1",
    email: "private@example.invalid",
    nickname: "测试用户",
    avatar_url: null,
    plan: "free",
    credits_balance: 12,
    credits_unlimited: false,
    trial_granted_at: null,
    account_role: "employee",
    company_id: "company-1",
    company_name: "旧公司字段",
    store_id: "store-1",
    store_name: "旧门店字段",
    service_plan_label: "AI 点服务",
    ...overrides,
  }
}

function membershipRow(overrides = {}) {
  return {
    id: "membership-1",
    user_id: "user-1",
    company_id: "company-1",
    company_name: "春舍公司",
    company_status: "active",
    store_id: "store-1",
    store_name: "春舍一店",
    store_status: "active",
    store_company_id: "company-1",
    role: "employee",
    status: "active",
    display_name: null,
    accepted_at: "2026-07-01T09:00:00.000Z",
    last_seen_at: null,
    created_at: "2026-07-01T08:00:00.000Z",
    ...overrides,
  }
}

function jsonResponse(body, init = {}) {
  return {
    status: init.status || 200,
    body,
    async json() {
      return body
    },
  }
}

function repositoryHarness() {
  const sqlLog = []
  const queryAliyunRds = async (sql) => {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim()
    sqlLog.push(normalizedSql)
    if (normalizedSql === "set transaction isolation level repeatable read read only") {
      return { rows: [] }
    }
    if (normalizedSql.includes("join public.profiles profile")) return { rows: [] }
    if (normalizedSql.includes("from public.app_membership_entitlements entitlement")) {
      return {
        rows: [{
          entitlement_source: "membership",
          membership_id: "membership-1",
          plan: "pro",
          pro_expires_at: null,
          status: "active",
          feature_keys: ["home"],
          authorization_version: 3,
        }],
      }
    }
    if (normalizedSql.includes("from public.mp_account_memberships membership")) {
      return { rows: [membershipRow()] }
    }
    if (normalizedSql.includes("from public.entitlements")) {
      return { rows: [{ plan: "pro", pro_expires_at: "2026-12-31T00:00:00.000Z" }] }
    }
    if (normalizedSql.includes("from public.profiles where id")) return { rows: [profileRow()] }
    throw new Error(`unexpected SQL in account response test: ${normalizedSql}`)
  }

  const authorization = fs.existsSync(authorizationPath)
    ? compileTsModule(authorizationPath, { "server-only": {} })
    : {}
  const repository = compileTsModule(repositoryPath, {
    "server-only": {},
    "@/lib/aliyun-rds/postgres.server": {
      queryAliyunRds,
      withAliyunRdsTransaction: async fn =>
        fn({ query: queryAliyunRds }),
    },
    "@/lib/pricing/rules": {
      normalizePlan(value) {
        return ["free", "basic", "pro", "vip"].includes(value) ? value : "free"
      },
    },
    "@/lib/aliyun-rds/app-authorization.server": authorization,
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      resolveAppCanonicalAuthorizationWithClient: async () => ({
        canonicalUserId: "canonical-user-1",
        identityState: "resolved",
        authorizationVersion: 3,
        trial: {
          kind: "personal_trial",
          dataDomain: "personal_trial",
          status: "active",
          sessionLimit: 2,
          sessionsUsed: 1,
          sessionsRemaining: 1,
        },
      }),
    },
  })
  return { repository, sqlLog }
}

function routeModules(repository, user) {
  class AliyunRdsConfigurationError extends Error {}
  const nextServer = {
    NextRequest: class NextRequest {},
    NextResponse: { json: jsonResponse },
  }
  const commonStubs = {
    "next/server": nextServer,
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => jsonResponse({ ok: false, code: "auth_required" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => ({ user }),
    },
    "@/lib/aliyun-rds/postgres.server": { AliyunRdsConfigurationError },
    "@/lib/aliyun-rds/repositories/account-profile.server": repository,
  }
  const profileRoute = compileTsModule(profileRoutePath, commonStubs)
  const entitlementsRoute = compileTsModule(entitlementsRoutePath, {
    ...commonStubs,
    "@/app/api/app/profile/route": profileRoute,
  })
  return { profileRoute, entitlementsRoute }
}

function assertSelectOnly(sqlLog) {
  assert.ok(sqlLog.length > 0)
  for (const sql of sqlLog) {
    assert.match(
      sql,
      /^(select\b|set transaction isolation level repeatable read read only$)/i,
    )
    assert.doesNotMatch(sql, /\b(insert|update|delete|merge|truncate)\b/i)
  }
}

test("tracked APP G1 contract equals the complete frozen JSON contract", () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(contractPath, "utf8")), expectedContract)
})

test("profile GET emits one exact profile and authorization snapshot without private identity metadata", async () => {
  const { repository, sqlLog } = repositoryHarness()
  const user = {
    id: "user-1",
    email: "private@example.invalid",
    user_metadata: { secret_marker: "must-not-escape", account_role: "service_operator" },
  }
  const { profileRoute } = routeModules(repository, user)
  const response = await profileRoute.GET({})

  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(response.body), expectedContract.profile_envelope.top_level_keys)
  assert.deepEqual(Object.keys(response.body.user), expectedContract.profile_envelope.user_keys)
  assert.deepEqual(response.body.user, { id: "user-1" })
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, "account"), false)
  assert.equal(JSON.stringify(response.body).includes("private@example.invalid"), false)
  assert.equal(JSON.stringify(response.body).includes("must-not-escape"), false)
  assert.equal(response.body.account_status, "bound")
  assert.equal(response.body.active_membership_id, "membership-1")
  assert.equal(response.body.canonical_user_id, "canonical-user-1")
  assert.equal(response.body.identity_state, "resolved")
  assert.equal(response.body.access_mode, "formal")
  assert.equal(response.body.authorization_version, 3)
  assert.equal(
    sqlLog[0],
    "set transaction isolation level repeatable read read only",
  )
  assert.deepEqual(Object.keys(response.body.memberships[0]), expectedContract.profile_envelope.membership_keys)
  assert.deepEqual(Object.keys(response.body.entitlements), expectedContract.profile_envelope.entitlement_keys)
  assert.deepEqual(Object.keys(response.body.features), expectedContract.feature_policy.all_keys)
  assert.deepEqual(Object.keys(response.body.profile), expectedContract.profile_envelope.profile_keys)
  assert.equal(response.body.profile.account_role, "employee")
  for (const feature of expectedContract.feature_policy.all_keys) {
    assert.deepEqual(
      Object.keys(response.body.features[feature]),
      expectedContract.profile_envelope.feature_decision_keys,
      feature,
    )
  }
  const membershipSql = sqlLog.find(sql =>
    sql.includes("from public.mp_account_memberships membership"),
  )
  assert.match(
    membershipSql,
    /membership\.canonical_user_id = \$2 or \( membership\.canonical_user_id is null and membership\.user_id = \$1 \)/,
  )
  assertSelectOnly(sqlLog)
})

test("entitlements GET is narrow and shares the complete feature map", async () => {
  const { repository, sqlLog } = repositoryHarness()
  const user = { id: "user-1", email: "private@example.invalid", user_metadata: { secret_marker: "hidden" } }
  const { profileRoute, entitlementsRoute } = routeModules(repository, user)
  const profileResponse = await profileRoute.GET({})
  const entitlementsResponse = await entitlementsRoute.GET({})

  assert.equal(entitlementsResponse.status, 200)
  assert.deepEqual(Object.keys(entitlementsResponse.body), expectedContract.entitlements_envelope.top_level_keys)
  assert.equal(entitlementsResponse.body.plan, "pro")
  assert.equal(entitlementsResponse.body.pro_expires_at, null)
  assert.deepEqual(entitlementsResponse.body.features, profileResponse.body.features)
  for (const forbiddenKey of [
    "user",
    "profile",
    "memberships",
    "membership_id",
    "active_membership_id",
    "account_status",
    "company_id",
    "store_id",
    "account",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(entitlementsResponse.body, forbiddenKey), false, forbiddenKey)
  }
  assertSelectOnly(sqlLog)
})

test("protected-route account context carries the same complete feature map", async () => {
  const { repository, sqlLog } = repositoryHarness()
  const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })

  assert.deepEqual(Object.keys(context.features), expectedContract.feature_policy.all_keys)
  assert.equal(context.features.home.enabled, true)
  assert.equal(context.features.store_admin.enabled, false)
  assertSelectOnly(sqlLog)
})

test("generic route failures return fixed public payloads without exception markers", async () => {
  const profileExceptionMarker = "PROFILE_EXCEPTION_MUST_NOT_ESCAPE"
  const entitlementsExceptionMarker = "ENTITLEMENTS_EXCEPTION_MUST_NOT_ESCAPE"
  const repository = {
    getAliyunRdsAppProfileContractResponse: async () => {
      throw new Error(profileExceptionMarker)
    },
    getAliyunRdsAppEntitlementsResponse: async () => {
      throw new Error(entitlementsExceptionMarker)
    },
  }
  const { profileRoute, entitlementsRoute } = routeModules(repository, { id: "user-1" })

  const profileResponse = await profileRoute.GET({})
  assert.equal(profileResponse.status, 500)
  assert.deepEqual(profileResponse.body, {
    ok: false,
    error: "profile_query_failed",
    code: "profile_query_failed",
  })
  assert.equal(JSON.stringify(profileResponse.body).includes(profileExceptionMarker), false)

  const entitlementsResponse = await entitlementsRoute.GET({})
  assert.equal(entitlementsResponse.status, 500)
  assert.deepEqual(entitlementsResponse.body, {
    ok: false,
    error: "entitlements_query_failed",
    code: "entitlements_query_failed",
  })
  assert.equal(JSON.stringify(entitlementsResponse.body).includes(entitlementsExceptionMarker), false)
})
