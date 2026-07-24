/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()

function jsonResponse(body, init = {}) {
  return {
    status: init.status || 200,
    body,
    async json() {
      return body
    },
  }
}

const nextServerStub = {
  NextRequest: class NextRequest {},
  NextResponse: { json: jsonResponse },
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

function request(body, idempotencyKey = "grant-key-0001") {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === "idempotency-key" ? idempotencyKey : null
      },
    },
    json: async () => body,
  }
}

test("bootstrap initializes profile and canonical personal trial in one endpoint", async () => {
  const calls = []
  const route = compileTsModule(
    path.join(root, "app", "api", "app", "account", "bootstrap", "route.ts"),
    {
      "next/server": nextServerStub,
      "@/lib/aliyun-rds/app-auth.server": {
        appAuthConfigurationErrorResponse: () => null,
        appAuthRequiredResponse: () => jsonResponse({ code: "auth_required" }, { status: 401 }),
        resolveAliyunRdsAppAuthUser: async () => ({ user: { id: "user-1" } }),
      },
      "@/lib/aliyun-rds/postgres.server": {
        AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      },
      "@/lib/aliyun-rds/repositories/account-profile.server": {
        bootstrapAliyunRdsAppProfile: async () => calls.push("profile"),
      },
      "@/lib/aliyun-rds/repositories/app-access-control.server": {
        ensureAppCanonicalIdentityAndTrial: async () => {
          calls.push("canonical_trial")
          return {
            canonicalUserId: "canonical-1",
            authorizationVersion: 0,
            accessMode: "personal_trial",
            identityState: "resolved",
            trial: {
              kind: "personal_trial",
              dataDomain: "personal_trial",
              status: "active",
              sessionLimit: 2,
              aiCoachPublicEnabled: false,
              sessionsReserved: 0,
              sessionsUsed: 0,
              sessionsRemaining: 2,
            },
          }
        },
      },
    },
  )

  const response = await route.POST({})
  assert.equal(response.status, 200)
  assert.deepEqual(calls, ["profile", "canonical_trial"])
  assert.deepEqual(response.body, {
    ok: true,
    profile_initialized: true,
    canonical_user_id: "canonical-1",
    access_mode: "personal_trial",
    identity_state: "resolved",
    authorization_version: 0,
    trial: {
      kind: "personal_trial",
      data_domain: "personal_trial",
      status: "active",
      ai_coach_session_limit: 2,
      ai_coach_sessions_reserved: 0,
      ai_coach_sessions_used: 0,
      ai_coach_sessions_remaining: 2,
      ai_coach_public_enabled: false,
    },
  })
})

test("bootstrap fails closed with a stable identity review response", async () => {
  const route = compileTsModule(
    path.join(root, "app", "api", "app", "account", "bootstrap", "route.ts"),
    {
      "next/server": nextServerStub,
      "@/lib/aliyun-rds/app-auth.server": {
        appAuthConfigurationErrorResponse: () => null,
        appAuthRequiredResponse: () => jsonResponse({ code: "auth_required" }, { status: 401 }),
        resolveAliyunRdsAppAuthUser: async () => ({ user: { id: "user-conflict" } }),
      },
      "@/lib/aliyun-rds/postgres.server": {
        AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      },
      "@/lib/aliyun-rds/repositories/account-profile.server": {
        bootstrapAliyunRdsAppProfile: async () => {},
      },
      "@/lib/aliyun-rds/repositories/app-access-control.server": {
        ensureAppCanonicalIdentityAndTrial: async () => {
          throw new Error("app_identity_conflict")
        },
      },
    },
  )

  const response = await route.POST({})
  assert.equal(response.status, 409)
  assert.deepEqual(response.body, {
    ok: false,
    error: "identity_review_required",
    code: "identity_review_required",
  })
})

test("admin access grant requires platform admin and forwards the idempotency contract", async () => {
  const grantCalls = []
  const routePath = path.join(root, "app", "api", "admin", "v1", "access-grants", "route.ts")
  const route = compileTsModule(routePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => jsonResponse({ code: "auth_required" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => ({ user: { id: "10000000-0000-4000-8000-000000000003" } }),
    },
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      getAliyunRdsAppAccountContext: async () => ({
        isPlatformAdmin: true,
        role: "platform_admin",
      }),
    },
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      grantAppAccess: async (input) => {
        grantCalls.push(input)
        return {
          authorizationVersion: 4,
          canonicalUserId: input.canonicalUserId,
          membershipId: "membership-1",
          deduped: false,
        }
      },
    },
  })
  const body = {
    canonical_user_id: "10000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
    store_id: "30000000-0000-4000-8000-000000000001",
    role: "employee",
    plan: "pro",
    reason: "runtime route grant",
    feature_keys: ["voice_coach"],
  }

  const response = await route.POST(request(body))
  assert.equal(response.status, 201)
  assert.equal(response.body.authorization_version, 4)
  assert.deepEqual(grantCalls, [
    {
      canonicalUserId: body.canonical_user_id,
      companyId: body.company_id,
      featureKeys: body.feature_keys,
      idempotencyKey: "grant-key-0001",
      operatorUserId: "10000000-0000-4000-8000-000000000003",
      operatorRole: "platform_admin",
      plan: "pro",
      reason: "runtime route grant",
      role: "employee",
      storeId: body.store_id,
    },
  ])
})

test("admin access grant exposes a stable conflict code for a reused idempotency key", async () => {
  const route = compileTsModule(
    path.join(root, "app", "api", "admin", "v1", "access-grants", "route.ts"),
    {
      "next/server": nextServerStub,
      "@/lib/aliyun-rds/app-auth.server": {
        appAuthConfigurationErrorResponse: () => null,
        appAuthRequiredResponse: () => jsonResponse({ code: "auth_required" }, { status: 401 }),
        resolveAliyunRdsAppAuthUser: async () => ({
          user: { id: "10000000-0000-4000-8000-000000000003" },
        }),
      },
      "@/lib/aliyun-rds/postgres.server": {
        AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      },
      "@/lib/aliyun-rds/repositories/account-profile.server": {
        getAliyunRdsAppAccountContext: async () => ({ isPlatformAdmin: true }),
      },
      "@/lib/aliyun-rds/repositories/app-access-control.server": {
        grantAppAccess: async () => {
          throw new Error("app_idempotency_conflict")
        },
      },
    },
  )

  const response = await route.POST(request({
    canonical_user_id: "10000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
    store_id: "30000000-0000-4000-8000-000000000001",
    role: "employee",
    plan: "pro",
    feature_keys: ["voice_coach"],
  }))
  assert.equal(response.status, 409)
  assert.equal(response.body.code, "idempotency_key_reused")
})

test("admin access grant fails closed for identity review and legacy membership conflicts", async () => {
  const routePath = path.join(
    root,
    "app",
    "api",
    "admin",
    "v1",
    "access-grants",
    "route.ts",
  )
  const authStub = {
    appAuthConfigurationErrorResponse: () => null,
    appAuthRequiredResponse: () =>
      jsonResponse({ code: "auth_required" }, { status: 401 }),
    resolveAliyunRdsAppAuthUser: async () => ({
      user: { id: "10000000-0000-4000-8000-000000000003" },
    }),
  }
  const postgresStub = {
    AliyunRdsConfigurationError:
      class AliyunRdsConfigurationError extends Error {},
  }
  const identityReviewRoute = compileTsModule(routePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/app-auth.server": authStub,
    "@/lib/aliyun-rds/postgres.server": postgresStub,
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      getAliyunRdsAppAccountContext: async () => {
        throw new Error("app_identity_review_required")
      },
    },
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      grantAppAccess: async () => {
        throw new Error("must_not_be_called")
      },
    },
  })
  const identityReviewResponse = await identityReviewRoute.POST(request({}))
  assert.equal(identityReviewResponse.status, 409)
  assert.equal(
    identityReviewResponse.body.code,
    "identity_review_required",
  )

  const membershipConflictRoute = compileTsModule(routePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/app-auth.server": authStub,
    "@/lib/aliyun-rds/postgres.server": postgresStub,
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      getAliyunRdsAppAccountContext: async () => ({
        isPlatformAdmin: true,
        role: "platform_admin",
      }),
    },
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      grantAppAccess: async () => {
        throw new Error("membership_conflict")
      },
    },
  })
  const membershipConflictResponse = await membershipConflictRoute.POST(
    request({
      canonical_user_id: "10000000-0000-4000-8000-000000000001",
      company_id: "20000000-0000-4000-8000-000000000001",
      store_id: "30000000-0000-4000-8000-000000000001",
      role: "employee",
      plan: "pro",
      reason: "legacy conflict",
      feature_keys: ["voice_coach"],
    }),
  )
  assert.equal(membershipConflictResponse.status, 409)
  assert.equal(membershipConflictResponse.body.code, "membership_conflict")
})

test("admin access grant rejects a signed-in non-platform account", async () => {
  const route = compileTsModule(
    path.join(root, "app", "api", "admin", "v1", "access-grants", "route.ts"),
    {
      "next/server": nextServerStub,
      "@/lib/aliyun-rds/app-auth.server": {
        appAuthConfigurationErrorResponse: () => null,
        appAuthRequiredResponse: () => jsonResponse({ code: "auth_required" }, { status: 401 }),
        resolveAliyunRdsAppAuthUser: async () => ({ user: { id: "user-employee" } }),
      },
      "@/lib/aliyun-rds/postgres.server": {
        AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      },
      "@/lib/aliyun-rds/repositories/account-profile.server": {
        getAliyunRdsAppAccountContext: async () => ({ isPlatformAdmin: false }),
      },
      "@/lib/aliyun-rds/repositories/app-access-control.server": {
        grantAppAccess: async () => {
          throw new Error("must_not_be_called")
        },
      },
    },
  )

  const response = await route.POST(request({}))
  assert.equal(response.status, 403)
  assert.equal(response.body.code, "platform_admin_required")
})

test("APP access snapshot exposes refreshable trial and authorization version without mutating profile", async () => {
  const route = compileTsModule(
    path.join(root, "app", "api", "app", "access", "route.ts"),
    {
      "next/server": nextServerStub,
      "@/lib/aliyun-rds/app-auth.server": {
        appAuthConfigurationErrorResponse: () => null,
        appAuthRequiredResponse: () => jsonResponse({ code: "auth_required" }, { status: 401 }),
        resolveAliyunRdsAppAuthUser: async () => ({ user: { id: "user-1" } }),
      },
      "@/lib/aliyun-rds/postgres.server": {
        AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
      },
      "@/lib/aliyun-rds/repositories/account-profile.server": {
        getAliyunRdsAppAccessSnapshot: async () => ({
          canonical_user_id: "canonical-1",
          identity_state: "resolved",
          access_mode: "personal_trial",
          authorization_version: 3,
          trial: {
            kind: "personal_trial",
            data_domain: "personal_trial",
            status: "active",
            ai_coach_session_limit: 2,
            ai_coach_sessions_reserved: 1,
            ai_coach_sessions_used: 0,
            ai_coach_sessions_remaining: 1,
            ai_coach_public_enabled: false,
          },
        }),
      },
    },
  )

  const response = await route.GET({})
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    ok: true,
    canonical_user_id: "canonical-1",
    identity_state: "resolved",
    access_mode: "personal_trial",
    authorization_version: 3,
    trial: {
      kind: "personal_trial",
      data_domain: "personal_trial",
      status: "active",
      ai_coach_session_limit: 2,
      ai_coach_sessions_reserved: 1,
      ai_coach_sessions_used: 0,
      ai_coach_sessions_remaining: 1,
      ai_coach_public_enabled: false,
    },
  })
})
