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
  const updateCalls = []

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
            return { error: null }
          },
          async updateUserById(userId, input) {
            updateCalls.push({ input, userId })
            return {
              data: {
                user: {
                  ...signedInUser,
                  app_metadata: input.app_metadata,
                  user_metadata: input.user_metadata,
                },
              },
            }
          },
        },
      },
      from() {
        return {
          async upsert() {
            return { error: null }
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
            async signInWithPassword() {
              return {
                data: {
                  session: {
                    access_token: "app-access-token",
                    expires_in: 3600,
                    refresh_token: "app-refresh-token",
                    user: signedInUser,
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
  } finally {
    global.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
