/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const helperPath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-facade.server.ts")

const voiceCoachFeatureDecision = { enabled: true, reason: "ok", source: "ai_points" }
const authorizationChecks = []
const testAccountContext = {
  accountStatus: "bound",
  userId: "app-user-employee-1",
  userEmail: null,
  membershipId: "membership-employee-1",
  companyId: "company-chunshe",
  companyName: "春舍公司",
  storeId: "store-chunshe",
  storeName: "春舍门店",
  role: "employee",
  roleLabel: "员工",
  scopeLabel: "春舍门店",
  memberships: [],
  isManager: false,
  isCompanyManager: false,
  isStoreManager: false,
  isPlatformAdmin: false,
  features: { voice_coach: voiceCoachFeatureDecision },
}

function requireAuthorizedVoiceCoachAccess(ctx, features, feature, requestedScope) {
  assert.equal(ctx, testAccountContext)
  assert.equal(features, testAccountContext.features)
  assert.equal(feature, "voice_coach")
  assert.deepEqual(features.voice_coach, voiceCoachFeatureDecision)
  if (requestedScope) {
    assert.deepEqual(requestedScope, {
      companyId: testAccountContext.companyId,
      storeId: testAccountContext.storeId,
    })
  }
  authorizationChecks.push(requestedScope || null)
  return { ok: true, account: ctx }
}

function resetAuthorizationChecks() {
  authorizationChecks.length = 0
}

function assertAuthorizationChecks(requestCount) {
  assert.equal(authorizationChecks.length, requestCount * 2)
  for (let index = 0; index < authorizationChecks.length; index += 2) {
    assert.equal(authorizationChecks[index], null)
    assert.deepEqual(authorizationChecks[index + 1], {
      companyId: testAccountContext.companyId,
      storeId: testAccountContext.storeId,
    })
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

const nextServerStub = {
  NextRequest: class NextRequest {},
  NextResponse: {
    json: jsonResponse,
  },
}

const helperStubs = {
  "server-only": {},
  "next/server": nextServerStub,
  "@/lib/aliyun-rds/app-auth.server": {
    appAuthConfigurationErrorResponse: () => null,
    appAuthRequiredResponse: () => jsonResponse({ ok: false, code: "unauthorized" }, { status: 401 }),
    resolveAliyunRdsAppAuthUser: async () => ({ user: { id: testAccountContext.userId } }),
  },
  "@/lib/aliyun-rds/app-authorization.server": {
    requireAppFeatureAccess: requireAuthorizedVoiceCoachAccess,
  },
  "@/lib/aliyun-rds/postgres.server": {
    AliyunRdsConfigurationError: class AliyunRdsConfigurationError extends Error {},
    isAliyunRdsRuntimeUnavailableError: () => false,
  },
  "@/lib/aliyun-rds/repositories/account-profile.server": {
    accountContextPayload: (ctx) => ({
      account: {
        user_id: ctx.userId,
        role: ctx.role,
      },
      tenant: {
        company_id: ctx.companyId,
        store_id: ctx.storeId,
      },
    }),
    getAliyunRdsAppAccountContext: async () => testAccountContext,
  },
  "@/lib/voice-coach/scenarios": {
    getScenario: (scenarioId) => ({
      id: scenarioId || "objection_safety",
      name: "顾客顾虑处理",
      goal: "把顾客顾虑复述清楚并给出下一步建议",
      seedTopics: ["敏感肌", "效果预期"],
      firstTurnPool: [{ text: "我担心皮肤敏感，做完会不会不舒服？" }],
    }),
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

const helperExports = compileTsModule(helperPath, helperStubs)

function routeModule(...parts) {
  return compileTsModule(path.join(root, ...parts), {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/repositories/app-voice-coach-facade.server": helperExports,
  })
}

function request(url, body = {}, contentType = "application/json") {
  return {
    url,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null
      },
    },
    async json() {
      return body
    },
    async formData() {
      return {
        entries: function* entries() {
          for (const [key, value] of Object.entries(body)) {
            yield [key, String(value)]
          }
        },
      }
    },
  }
}

async function payload(response) {
  return response.json()
}

function setDurableStoreForTest(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-runtime-"))
  process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = path.join(tempDir, "sessions.json")
  t.after(() => {
    delete process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
}

test("VC-L4-02 local route runtime closes a text-first voiceCoach session", async (t) => {
  resetAuthorizationChecks()
  setDurableStoreForTest(t)
  const sessionsRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const submitRoute = routeModule(
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "beautician-turn",
    "submit",
    "route.ts",
  )
  const eventsRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const endRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)
  assert.equal(created.ok, true)
  assert.equal(created.repository_mode, "text_first_local_durable_session_store")
  assert.equal(created.provider_mode, "text_only_no_audio_provider")
  assert.equal(created.first_customer_turn.pending, false)
  assert.match(created.session_id, /^app-vc-/)

  const sessionContext = { params: Promise.resolve({ sessionId: created.session_id }) }
  const detailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext,
  )
  const detail = await payload(detailResponse)
  assert.equal(detailResponse.status, 200)
  assert.equal(detail.turns.length, 1)
  assert.equal(detail.turns[0].role, "customer")

  const submitResponse = await submitRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/beautician-turn/submit`, {
      transcript_text: "我先确认你的敏感情况，再建议从低刺激护理开始。",
      client_attempt_id: "runtime-proof-1",
    }),
    sessionContext,
  )
  const submitted = await payload(submitResponse)
  assert.equal(submitResponse.status, 200)
  assert.equal(submitted.ok, true)
  assert.equal(submitted.beautician_turn.pending, false)
  assert.equal(submitted.server_advanced, true)
  assert.equal(submitted.next_customer_turn.role, "customer")

  const eventsResponse = await eventsRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/events?cursor=0`),
    sessionContext,
  )
  const events = await payload(eventsResponse)
  assert.equal(eventsResponse.status, 200)
  assert.deepEqual(
    events.events.map((event) => event.type),
    ["session.created", "beautician_turn.submitted", "customer_turn.ready"],
  )

  const reportBeforeEndResponse = await reportRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/report`),
    sessionContext,
  )
  assert.equal(reportBeforeEndResponse.status, 409)

  const endResponse = await endRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/end`, {}),
    sessionContext,
  )
  const ended = await payload(endResponse)
  assert.equal(endResponse.status, 200)
  assert.equal(ended.session.status, "ended")
  assert.equal(ended.report.status, "ready")
  assert.equal(ended.report.meta.generated_from, "text_first_local_durable_session_store")

  const reportAfterEndResponse = await reportRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/report`),
    sessionContext,
  )
  const report = await payload(reportAfterEndResponse)
  assert.equal(reportAfterEndResponse.status, 200)
  assert.equal(report.report.status, "ready")
  assert.equal(report.report.tabs.transcript.length, 3)

  const listResponse = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions?limit=5"))
  const list = await payload(listResponse)
  assert.equal(listResponse.status, 200)
  assert.equal(list.sessions.length, 1)
  assert.equal(list.sessions[0].id, created.session_id)
  assert.equal(list.sessions[0].can_view_report, true)
  assertAuthorizationChecks(8)
})

test("VC-L4-02 local route runtime keeps audio/provider routes outside L4", async (t) => {
  resetAuthorizationChecks()
  setDurableStoreForTest(t)
  const sessionsRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "route.ts")
  const ttsRoute = routeModule(
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "turns",
    "[turnId]",
    "tts",
    "route.ts",
  )
  const asrRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "asr-preview", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  const created = await payload(createResponse)

  const ttsResponse = await ttsRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/turns/${created.first_customer_turn.turn_id}/tts`),
    { params: Promise.resolve({ sessionId: created.session_id, turnId: created.first_customer_turn.turn_id }) },
  )
  const tts = await payload(ttsResponse)
  assert.equal(ttsResponse.status, 501)
  assert.equal(tts.code, "voice_coach_tts_provider_required")

  const asrResponse = await asrRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/asr-preview`, {}),
    { params: Promise.resolve({ sessionId: created.session_id }) },
  )
  const asr = await payload(asrResponse)
  assert.equal(asrResponse.status, 501)
  assert.equal(asr.code, "voice_coach_asr_provider_required")
  assertAuthorizationChecks(3)
})
