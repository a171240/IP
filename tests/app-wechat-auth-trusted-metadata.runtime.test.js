/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const routePath = path.join(
  root,
  "app",
  "api",
  "app",
  "auth",
  "wechat",
  "route.ts",
)

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
  compiledModule.require = moduleId =>
    moduleId in stubs ? stubs[moduleId] : require(moduleId)
  compiledModule._compile(compiled, filePath)
  return compiledModule.exports
}

function jsonResponse(body, init = {}) {
  return {
    body,
    status: init.status || 200,
    async json() {
      return body
    },
  }
}

test("WeChat login stores canonical identity only in admin-controlled app_metadata", async () => {
  const originalEnvironment = {
    WECHAT_LOGIN_SECRET: process.env.WECHAT_LOGIN_SECRET,
    WECHAT_OPEN_APP_ID: process.env.WECHAT_OPEN_APP_ID,
    WECHAT_OPEN_APP_SECRET: process.env.WECHAT_OPEN_APP_SECRET,
    WECHAT_OPEN_PLATFORM_SCOPE_ID: process.env.WECHAT_OPEN_PLATFORM_SCOPE_ID,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
  const originalFetch = global.fetch
  const createCalls = []
  const listUsersCalls = []
  const signInCalls = []
  const updateCalls = []
  let adminUsers = []
  let listUsersError = null
  let profileUpsertError = null
  let legacySignedInUser = null
  let scopedSignedInUser = null
  let trustedMetadataUpdateError = null

  try {
    Object.assign(process.env, {
      WECHAT_LOGIN_SECRET: "local-test-login-secret",
      WECHAT_OPEN_APP_ID: "wx-open-app-trusted",
      WECHAT_OPEN_APP_SECRET: "local-test-open-secret",
      WECHAT_OPEN_PLATFORM_SCOPE_ID: "open-platform-trusted",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test-anon-key",
    })
    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          access_token: "wechat-access-token",
          openid: "openid-trusted",
          unionid: "unionid-trusted",
        }
      },
    })

    const signedInUser = {
      id: "10000000-0000-4000-8000-000000000099",
      app_metadata: {
        existing_admin_claim: "preserved",
        wechat_unionid: "stale-trusted-unionid",
      },
      user_metadata: {
        nickname: "旧昵称",
        custom_public_field: "preserved",
        auth_source: "wechat_open_app",
        wechat_open_app_id: "forged-app-id",
        wechat_app_openid: "forged-openid",
        wechat_unionid: "forged-unionid",
        wechat_union_issuer: "forged-issuer",
      },
    }
    const admin = {
      auth: {
        admin: {
          async createUser(input) {
            createCalls.push(input)
            scopedSignedInUser = signedInUser
            return { error: null }
          },
          async listUsers(input) {
            listUsersCalls.push(input)
            return {
              data: {
                nextPage: null,
                users: adminUsers,
              },
              error: listUsersError,
            }
          },
          async updateUserById(userId, input) {
            updateCalls.push({ input, userId })
            if (trustedMetadataUpdateError) {
              return {
                data: { user: null },
                error: trustedMetadataUpdateError,
              }
            }
            const sourceUser =
              legacySignedInUser?.id === userId
                ? legacySignedInUser
                : adminUsers.find(user => user.id === userId) || signedInUser
            const updatedUser = {
              ...sourceUser,
              email: input.email || sourceUser.email,
              app_metadata: input.app_metadata,
              user_metadata: input.user_metadata,
            }
            if (
              typeof input.email === "string" &&
              input.email.includes(
                "union_open-platform-trusted_unionid-trusted",
              )
            ) {
              scopedSignedInUser = updatedUser
            }
            return {
              data: {
                user: updatedUser,
              },
            }
          },
        },
      },
      from() {
        return {
          async upsert() {
            return { error: profileUpsertError }
          },
        }
      },
    }
    const route = compileTsModule(routePath, {
      "next/server": {
        NextRequest: class NextRequest {},
        NextResponse: { json: jsonResponse },
      },
      "@supabase/supabase-js": {
        createClient: () => ({
          auth: {
            async signInWithPassword(input) {
              signInCalls.push(input)
              const isScopedPrincipal = input.email.includes(
                "union_open-platform-trusted_unionid-trusted",
              )
              const isLegacyPrincipal = input.email.includes(
                "union_unionid-trusted",
              )
              const selectedUser =
                isScopedPrincipal
                  ? scopedSignedInUser
                  : isLegacyPrincipal
                    ? legacySignedInUser
                    : null
              if (!selectedUser) {
                return {
                  data: { session: null },
                  error: {
                    code: "invalid_credentials",
                    message: "Invalid login credentials",
                    status: 400,
                  },
                }
              }
              return {
                data: {
                  session: {
                    access_token: "app-access-token",
                    expires_in: 3600,
                    refresh_token: "app-refresh-token",
                    user: selectedUser,
                  },
                },
                error: null,
              }
            },
          },
        }),
      },
      "@/lib/supabase/admin.server": {
        createAdminSupabaseClient: () => admin,
      },
    })

    const response = await route.POST({
      async json() {
        return {
          avatar_url: "https://images.test.invalid/avatar.png",
          code: "one-time-code",
          nickname: "可信昵称",
        }
      },
    })

    assert.equal(response.status, 200)
    assert.equal(createCalls.length, 1)
    assert.match(
      createCalls[0].email,
      /union_open-platform-trusted_unionid-trusted/,
    )
    assert.equal(signInCalls.at(-1).email, createCalls[0].email)
    assert.deepEqual(createCalls[0].user_metadata, {
      avatar_url: "https://images.test.invalid/avatar.png",
      nickname: "可信昵称",
    })
    assert.deepEqual(createCalls[0].app_metadata, {
      auth_source: "wechat_open_app",
      wechat_app_openid: "openid-trusted",
      wechat_open_app_id: "wx-open-app-trusted",
      wechat_union_issuer: "open-platform-trusted",
      wechat_unionid: "unionid-trusted",
    })

    assert.equal(updateCalls.length, 1)
    assert.equal(updateCalls[0].userId, signedInUser.id)
    assert.deepEqual(updateCalls[0].input.user_metadata, {
      avatar_url: "https://images.test.invalid/avatar.png",
      custom_public_field: "preserved",
      nickname: "可信昵称",
    })
    assert.deepEqual(updateCalls[0].input.app_metadata, {
      auth_source: "wechat_open_app",
      existing_admin_claim: "preserved",
      wechat_app_openid: "openid-trusted",
      wechat_open_app_id: "wx-open-app-trusted",
      wechat_union_issuer: "open-platform-trusted",
      wechat_unionid: "unionid-trusted",
    })

    trustedMetadataUpdateError = { message: "fixture update failure" }
    const metadataFailure = await route.POST({
      async json() {
        return { code: "metadata-failure-code" }
      },
    })
    assert.equal(metadataFailure.status, 500)
    assert.deepEqual(metadataFailure.body, {
      error: "trusted_identity_metadata_update_failed",
    })

    trustedMetadataUpdateError = null
    profileUpsertError = { message: "fixture profile failure" }
    const profileFailure = await route.POST({
      async json() {
        return { code: "profile-failure-code" }
      },
    })
    assert.equal(profileFailure.status, 500)
    assert.deepEqual(profileFailure.body, {
      error: "profile_upsert_failed",
    })

    profileUpsertError = null
    scopedSignedInUser = null
    legacySignedInUser = {
      id: "10000000-0000-4000-8000-000000000088",
      app_metadata: {
        auth_source: "wechat_open_app",
        wechat_open_app_id: "wx-open-app-trusted",
        wechat_unionid: "unionid-trusted",
        wechat_union_issuer: "open-platform-trusted",
      },
      user_metadata: { nickname: "存量用户" },
    }
    const createCountBeforeLegacy = createCalls.length
    const updateCountBeforeLegacy = updateCalls.length
    const legacyMigration = await route.POST({
      async json() {
        return { code: "legacy-migration-code" }
      },
    })
    assert.equal(legacyMigration.status, 200)
    assert.equal(createCalls.length, createCountBeforeLegacy)
    assert.equal(updateCalls.length, updateCountBeforeLegacy + 1)
    assert.equal(
      updateCalls.at(-1).userId,
      legacySignedInUser.id,
    )
    assert.match(
      updateCalls.at(-1).input.email,
      /union_open-platform-trusted_unionid-trusted/,
    )
    assert.equal(typeof updateCalls.at(-1).input.password, "string")

    scopedSignedInUser = null
    legacySignedInUser = {
      ...legacySignedInUser,
      app_metadata: {
        ...legacySignedInUser.app_metadata,
        wechat_union_issuer: "different-open-platform",
      },
    }
    const updateCountBeforeConflict = updateCalls.length
    const legacyConflict = await route.POST({
      async json() {
        return { code: "legacy-conflict-code" }
      },
    })
    assert.equal(legacyConflict.status, 409)
    assert.deepEqual(legacyConflict.body, {
      error: "legacy_identity_review_required",
    })
    assert.equal(createCalls.length, createCountBeforeLegacy)
    assert.equal(updateCalls.length, updateCountBeforeConflict)

    legacySignedInUser = null
    const passwordDriftLegacyUser = {
      id: "10000000-0000-4000-8000-000000000077",
      email: "wxapp_union_unionid-trusted@ipgongchang.xin",
      app_metadata: {
        auth_source: "wechat_open_app",
        wechat_open_app_id: "wx-open-app-trusted",
        wechat_unionid: "unionid-trusted",
        wechat_union_issuer: "open-platform-trusted",
      },
      user_metadata: { nickname: "密码漂移存量用户" },
    }
    adminUsers = [passwordDriftLegacyUser]
    const createCountBeforePasswordDrift = createCalls.length
    const updateCountBeforePasswordDrift = updateCalls.length
    const passwordDriftMigration = await route.POST({
      async json() {
        return { code: "legacy-password-drift-code" }
      },
    })
    assert.equal(passwordDriftMigration.status, 200)
    assert.equal(createCalls.length, createCountBeforePasswordDrift)
    assert.equal(updateCalls.length, updateCountBeforePasswordDrift + 1)
    assert.equal(updateCalls.at(-1).userId, passwordDriftLegacyUser.id)
    assert.equal(listUsersCalls.length > 0, true)

    scopedSignedInUser = null
    adminUsers = [{
      ...passwordDriftLegacyUser,
      app_metadata: {
        ...passwordDriftLegacyUser.app_metadata,
        wechat_union_issuer: "different-open-platform",
      },
    }]
    const createCountBeforeAdminConflict = createCalls.length
    const updateCountBeforeAdminConflict = updateCalls.length
    const adminConflict = await route.POST({
      async json() {
        return { code: "legacy-admin-conflict-code" }
      },
    })
    assert.equal(adminConflict.status, 409)
    assert.deepEqual(adminConflict.body, {
      error: "legacy_identity_review_required",
    })
    assert.equal(createCalls.length, createCountBeforeAdminConflict)
    assert.equal(updateCalls.length, updateCountBeforeAdminConflict)

    adminUsers = []
    listUsersError = { message: "fixture admin lookup failure" }
    const createCountBeforeLookupFailure = createCalls.length
    const lookupFailure = await route.POST({
      async json() {
        return { code: "legacy-lookup-failure-code" }
      },
    })
    assert.equal(lookupFailure.status, 500)
    assert.deepEqual(lookupFailure.body, {
      error: "legacy_identity_lookup_failed",
    })
    assert.equal(createCalls.length, createCountBeforeLookupFailure)
  } finally {
    global.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
