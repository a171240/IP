/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "account-profile.server.ts")
const bootstrapRoutePath = path.join(root, "app", "api", "app", "account", "bootstrap", "route.ts")

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

function normalizedSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim()
}

function repositoryHarness() {
  const queryLog = []
  const profileRows = new Map()
  const queryAliyunRds = async (sql, values = []) => {
    const entry = { sql: normalizedSql(sql), values: [...values] }
    queryLog.push(entry)

    if (/^insert into public\.profiles\b/i.test(entry.sql)) {
      const [id, email, nickname, avatarUrl] = entry.values
      const profileAlreadyExists = profileRows.has(id)
      if (!profileAlreadyExists) {
        profileRows.set(id, {
          id,
          email,
          nickname,
          avatar_url: avatarUrl,
          account_role: "guest",
          plan: "free",
          credits_balance: 0,
          credits_unlimited: false,
        })
      }
      return { rows: [], rowCount: profileAlreadyExists ? 0 : 1 }
    }
    if (/^(select|set transaction)\b/i.test(entry.sql)) return { rows: [] }
    throw new Error(`unexpected SQL in bootstrap test: ${entry.sql}`)
  }

  const repository = compileTsModule(repositoryPath, {
    "server-only": {},
    "@/lib/aliyun-rds/postgres.server": {
      queryAliyunRds,
      withAliyunRdsTransaction: async callback =>
        callback({ query: queryAliyunRds }),
    },
    "@/lib/pricing/rules": {
      normalizePlan(value) {
        return ["free", "basic", "pro", "vip"].includes(value) ? value : "free"
      },
    },
    "@/lib/aliyun-rds/app-authorization.server": {
      buildAppFeatureDecisions: () => ({}),
      normalizeAppAccountRole: () => "guest",
    },
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      resolveAppCanonicalAuthorizationWithClient: async () => ({
        canonicalUserId: "canonical-read-regression",
        identityState: "resolved",
        authorizationVersion: 0,
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
      }),
    },
  })
  return { profileRows, queryLog, repository }
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

function bootstrapRoute(repository, user) {
  class AliyunRdsConfigurationError extends Error {}
  const access = {
    canonicalUserId: "canonical-bootstrap-1",
    accessMode: "personal_trial",
    identityState: "resolved",
    authorizationVersion: 0,
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
  return compileTsModule(bootstrapRoutePath, {
    "next/server": {
      NextRequest: class NextRequest {},
      NextResponse: { json: jsonResponse },
    },
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => jsonResponse({ ok: false, code: "auth_required" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => (user ? { user } : null),
    },
    "@/lib/aliyun-rds/postgres.server": { AliyunRdsConfigurationError },
    "@/lib/aliyun-rds/repositories/account-profile.server": repository,
    "@/lib/aliyun-rds/repositories/app-access-control.server": {
      ensureAppCanonicalIdentityAndTrial: async () => access,
    },
  })
}

const expectedBootstrapResponse = {
  ok: true,
  profile_initialized: true,
  canonical_user_id: "canonical-bootstrap-1",
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
}

function requestWithForbiddenBody() {
  let readCount = 0
  return {
    request: {
      async json() {
        readCount += 1
        return {
          role: "body-role-marker",
          company_id: "body-company-marker",
          store_id: "body-store-marker",
          membership_id: "body-membership-marker",
          plan: "body-plan-marker",
          entitlement: "body-entitlement-marker",
          nickname: "body-nickname-marker",
          avatar_url: "body-avatar-marker",
        }
      },
    },
    readCount: () => readCount,
  }
}

test("anonymous bootstrap returns auth_required before body or database access", async () => {
  const { queryLog, repository } = repositoryHarness()
  const route = bootstrapRoute(repository, null)
  const requestProbe = requestWithForbiddenBody()

  const response = await route.POST(requestProbe.request)

  assert.equal(response.status, 401)
  assert.deepEqual(response.body, { ok: false, code: "auth_required" })
  assert.equal(requestProbe.readCount(), 0)
  assert.deepEqual(queryLog, [])
})

test("authenticated bootstrap inserts bounded display fields once and ignores privilege inputs", async () => {
  const { profileRows, queryLog, repository } = repositoryHarness()
  const nickname = "昵".repeat(180)
  const avatarUrl = `https://cdn.example.invalid/avatar/${"a".repeat(2_200)}`
  const user = {
    id: "user-bootstrap-1",
    email: "bootstrap@example.invalid",
    user_metadata: {
      nickname: `  ${nickname}  `,
      avatar_url: `  ${avatarUrl}  `,
      account_role: "metadata-role-marker",
      company_id: "metadata-company-marker",
      store_id: "metadata-store-marker",
      membership_id: "metadata-membership-marker",
      plan: "metadata-plan-marker",
      entitlement: "metadata-entitlement-marker",
      credits_balance: "metadata-credits-marker",
    },
  }
  const route = bootstrapRoute(repository, user)
  const requestProbe = requestWithForbiddenBody()

  const firstResponse = await route.POST(requestProbe.request)
  const secondResponse = await route.POST(requestProbe.request)

  assert.equal(requestProbe.readCount(), 0)
  assert.deepEqual(firstResponse.body, expectedBootstrapResponse)
  assert.deepEqual(secondResponse.body, expectedBootstrapResponse)
  assert.equal(firstResponse.status, 200)
  assert.equal(secondResponse.status, 200)
  assert.equal(queryLog.length, 2)
  assert.equal(queryLog[0].sql, queryLog[1].sql)
  assert.match(
    queryLog[0].sql,
    /^insert into public\.profiles \(id, email, nickname, avatar_url, account_role, plan, credits_balance, credits_unlimited\) values \(\$1, \$2, \$3, \$4, 'guest', 'free', 0, false\) on conflict \(id\) do nothing$/i,
  )
  assert.doesNotMatch(queryLog[0].sql, /\bupdate\b/i)
  assert.doesNotMatch(queryLog[0].sql, /\b(company|store|membership|entitlement)\b/i)
  const expectedValues = [user.id, user.email, nickname.slice(0, 120), avatarUrl.slice(0, 2_048)]
  assert.equal(queryLog[0].values.length, 4)
  assert.equal(queryLog[1].values.length, 4)
  assert.deepEqual(queryLog[0].values, expectedValues)
  assert.deepEqual(queryLog[1].values, expectedValues)
  assert.equal(profileRows.size, 1)
  assert.deepEqual(profileRows.get(user.id), {
    id: user.id,
    email: user.email,
    nickname: nickname.slice(0, 120),
    avatar_url: avatarUrl.slice(0, 2_048),
    account_role: "guest",
    plan: "free",
    credits_balance: 0,
    credits_unlimited: false,
  })
  const queryParameters = JSON.stringify(queryLog.map((entry) => entry.values))
  for (const forbiddenMarker of [
    "body-role-marker",
    "body-company-marker",
    "body-store-marker",
    "body-membership-marker",
    "body-plan-marker",
    "body-entitlement-marker",
    "body-nickname-marker",
    "body-avatar-marker",
    "metadata-role-marker",
    "metadata-company-marker",
    "metadata-store-marker",
    "metadata-membership-marker",
    "metadata-plan-marker",
    "metadata-entitlement-marker",
    "metadata-credits-marker",
  ]) {
    assert.equal(queryParameters.includes(forbiddenMarker), false, forbiddenMarker)
  }
})

test("bootstrap writes null rather than stringifying non-string display metadata", async () => {
  const { queryLog, repository } = repositoryHarness()

  await repository.bootstrapAliyunRdsAppProfile({
    id: "user-bootstrap-2",
    email: null,
    user_metadata: {
      nickname: { unsafe: true },
      avatar_url: ["unsafe"],
    },
  })

  assert.deepEqual(queryLog.map((entry) => entry.values), [["user-bootstrap-2", null, null, null]])
})

test("bootstrap generic failures use a fixed public payload without reading the body", async () => {
  const exceptionMarker = "BOOTSTRAP_EXCEPTION_MUST_NOT_ESCAPE"
  const route = bootstrapRoute(
    {
      bootstrapAliyunRdsAppProfile: async () => {
        throw new Error(exceptionMarker)
      },
    },
    { id: "user-bootstrap-3" },
  )
  const requestProbe = requestWithForbiddenBody()

  const response = await route.POST(requestProbe.request)

  assert.equal(response.status, 500)
  assert.deepEqual(response.body, {
    ok: false,
    error: "account_bootstrap_failed",
    code: "account_bootstrap_failed",
  })
  assert.equal(JSON.stringify(response.body).includes(exceptionMarker), false)
  assert.equal(requestProbe.readCount(), 0)
})

test("profile and entitlements reads remain SELECT-only after bootstrap is added", async () => {
  const { queryLog, repository } = repositoryHarness()
  const user = { id: "user-read-regression", email: "read@example.invalid", user_metadata: {} }

  await repository.getAliyunRdsAppProfileContractResponse(user)
  await repository.getAliyunRdsAppEntitlementsResponse(user)

  assert.ok(queryLog.length > 0)
  for (const entry of queryLog) {
    assert.match(entry.sql, /^(select|set transaction)\b/i)
    assert.doesNotMatch(entry.sql, /\b(insert|update|delete|merge|truncate)\b/i)
  }
})
