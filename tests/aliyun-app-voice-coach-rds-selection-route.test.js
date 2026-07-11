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
const SESSION_ID = "77777777-7777-4777-8777-777777777777"
const CUSTOMER_PROFILE_ID = "11111111-1111-4111-8111-111111111111"
const SCENE_CARD_ID = "22222222-2222-4222-8222-222222222222"
const FOREIGN_ID = "88888888-8888-4888-8888-888888888888"
const testAccountContext = {
  accountStatus: "bound",
  userId: "app-user-route-rds-1",
  userEmail: null,
  membershipId: "membership-route-rds-1",
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
let currentAccountContext = { ...testAccountContext }

function requireAuthorizedVoiceCoachAccess(ctx, features, feature, requestedScope) {
  assert.equal(ctx, currentAccountContext)
  assert.equal(features, currentAccountContext.features)
  assert.equal(feature, "voice_coach")
  assert.deepEqual(features.voice_coach, voiceCoachFeatureDecision)
  if (requestedScope) {
    assert.deepEqual(requestedScope, {
      companyId: currentAccountContext.companyId,
      storeId: currentAccountContext.storeId,
    })
  }
  authorizationChecks.push(requestedScope || null)
  return { ok: true, account: ctx }
}

function resetAuthorizationChecks() {
  authorizationChecks.length = 0
  currentAccountContext = { ...testAccountContext }
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

function setAccountContext(overrides) {
  currentAccountContext = { ...testAccountContext, ...overrides }
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

function createRdsMock() {
  const calls = []
  const callArgs = []
  const sessions = new Map()
  const turns = new Map()
  const mode = "rds_voice_coach_text_session_contract"
  const customerProfiles = new Map([
    [CUSTOMER_PROFILE_ID, { id: CUSTOMER_PROFILE_ID, user_id: testAccountContext.userId, name: "张女士" }],
  ])
  const sceneCards = new Map([
    [SCENE_CARD_ID, { id: SCENE_CARD_ID, user_id: testAccountContext.userId, name: "敏感肌到店咨询", service_name: "舒缓护理" }],
  ])

  function remember(name, args) {
    calls.push(name)
    callArgs.push({ name, args: { ...args } })
  }

  function belongsToScope(session, args) {
    return Boolean(
      session &&
        session.user_id === args.userId &&
        session.company_id === args.companyId &&
        session.store_id === args.storeId &&
        session.membership_id === args.membershipId,
    )
  }

  function selectionErrorCode(error) {
    if (error instanceof Error && error.message === "voice_coach_rds_customer_profile_not_found") {
      return "customer_profile_not_found"
    }
    if (error instanceof Error && error.message === "voice_coach_rds_scene_card_not_found") {
      return "scene_card_not_found"
    }
    return null
  }

  function turn(args) {
    return {
      id: `rds-turn-${args.turnIndex + 1}`,
      created_at: "2026-07-06T10:00:00.000Z",
      session_id: args.sessionId,
      turn_index: args.turnIndex,
      role: args.role,
      text: args.text,
      emotion: "neutral",
      audio_path: null,
      audio_seconds: null,
      asr_confidence: null,
      analysis_json: {},
      features_json: {},
    }
  }

  return {
    calls,
    callArgs,
    sessions,
    module: {
      APP_VOICE_COACH_RDS_REPOSITORY_MODE: mode,
      getAliyunRdsVoiceCoachSelectionErrorCode: selectionErrorCode,
      async createAliyunRdsVoiceCoachTextSession(args) {
        remember("createAliyunRdsVoiceCoachTextSession", args)
        args.timing?.recordStage("rds_mock_create", Date.now())
        if (args.scenario.id === "explode") {
          throw new Error("select * from secret_table at /private/backend/file.ts")
        }
        const customer = args.customerProfileId ? customerProfiles.get(args.customerProfileId) : null
        const scene = args.sceneCardId ? sceneCards.get(args.sceneCardId) : null
        if (args.customerProfileId && (!customer || customer.user_id !== args.userId)) {
          throw new Error("voice_coach_rds_customer_profile_not_found")
        }
        if (args.sceneCardId && (!scene || scene.user_id !== args.userId)) {
          throw new Error("voice_coach_rds_scene_card_not_found")
        }
        const safeContext = {
          customer_profile_id: args.customerProfileId || null,
          customer_name: customer?.name || null,
          scene_card_id: args.sceneCardId || null,
          scene_name: scene?.name || null,
          service_name: scene?.service_name || null,
          company_id: args.companyId,
          store_id: args.storeId,
          membership_id: args.membershipId,
        }
        const session = {
          id: SESSION_ID,
          created_at: "2026-07-06T10:00:00.000Z",
          user_id: args.userId,
          company_id: args.companyId,
          store_id: args.storeId,
          membership_id: args.membershipId,
          scenario_id: args.scenario.id,
          status: "active",
          started_at: "2026-07-06T10:00:00.000Z",
          ended_at: null,
          report_json: null,
          total_score: null,
          dimension_scores: null,
          customer_profile_id: args.customerProfileId || null,
          scene_card_id: args.sceneCardId || null,
          session_context_json: safeContext,
          scenario_snapshot_json: args.scenario,
        }
        const firstCustomerTurn = turn({
          role: "customer",
          sessionId: session.id,
          text: args.firstCustomerText,
          turnIndex: 0,
        })
        sessions.set(session.id, session)
        turns.set(session.id, [firstCustomerTurn])
        return { firstCustomerTurn, session }
      },
      async getAliyunRdsVoiceCoachTextSessionWithClient(_client, args) {
        remember("getAliyunRdsVoiceCoachTextSessionWithClient", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) return null
        return { session, turns: turns.get(args.sessionId) || [] }
      },
      async getAliyunRdsVoiceCoachTextSession(args) {
        remember("getAliyunRdsVoiceCoachTextSession", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) return null
        return { session, turns: turns.get(args.sessionId) || [] }
      },
      async appendAliyunRdsVoiceCoachTextReplyWithClient(_client, args) {
        remember("appendAliyunRdsVoiceCoachTextReplyWithClient", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) throw new Error("voice_coach_rds_session_not_found")
        const currentTurns = turns.get(args.sessionId) || []
        const beauticianTurn = turn({
          role: "beautician",
          sessionId: args.sessionId,
          text: args.replyText,
          turnIndex: currentTurns.length,
        })
        const nextCustomerTurn = args.nextCustomerText
          ? turn({
              role: "customer",
              sessionId: args.sessionId,
              text: args.nextCustomerText,
              turnIndex: currentTurns.length + 1,
            })
          : null
        turns.set(args.sessionId, nextCustomerTurn ? [...currentTurns, beauticianTurn, nextCustomerTurn] : [...currentTurns, beauticianTurn])
        return { beauticianTurn, nextCustomerTurn }
      },
      async appendAliyunRdsVoiceCoachTextReply(args) {
        remember("appendAliyunRdsVoiceCoachTextReply", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) throw new Error("voice_coach_rds_session_not_found")
        const currentTurns = turns.get(args.sessionId) || []
        const beauticianTurn = turn({
          role: "beautician",
          sessionId: args.sessionId,
          text: args.replyText,
          turnIndex: currentTurns.length,
        })
        const nextCustomerTurn = args.nextCustomerText
          ? turn({
              role: "customer",
              sessionId: args.sessionId,
              text: args.nextCustomerText,
              turnIndex: currentTurns.length + 1,
            })
          : null
        turns.set(args.sessionId, nextCustomerTurn ? [...currentTurns, beauticianTurn, nextCustomerTurn] : [...currentTurns, beauticianTurn])
        return { beauticianTurn, nextCustomerTurn }
      },
      async endAliyunRdsVoiceCoachTextSessionWithClient(_client, args) {
        remember("endAliyunRdsVoiceCoachTextSessionWithClient", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) throw new Error("voice_coach_rds_session_end_failed")
        session.status = "ended"
        session.ended_at = "2026-07-06T10:06:00.000Z"
        session.report_json = args.report
        session.total_score = args.totalScore
        session.dimension_scores = args.dimensionScores
        return session
      },
      async endAliyunRdsVoiceCoachTextSession(args) {
        remember("endAliyunRdsVoiceCoachTextSession", args)
        const session = sessions.get(args.sessionId)
        if (!belongsToScope(session, args)) throw new Error("voice_coach_rds_session_end_failed")
        session.status = "ended"
        session.ended_at = "2026-07-06T10:06:00.000Z"
        session.report_json = args.report
        session.total_score = args.totalScore
        session.dimension_scores = args.dimensionScores
        return session
      },
      async listAliyunRdsVoiceCoachTextSessionHistoryWithClient(_client, args) {
        remember("listAliyunRdsVoiceCoachTextSessionHistoryWithClient", args)
        return Array.from(sessions.values()).filter((session) => belongsToScope(session, args))
      },
      async listAliyunRdsVoiceCoachTextSessionHistory(args) {
        remember("listAliyunRdsVoiceCoachTextSessionHistory", args)
        return Array.from(sessions.values()).filter((session) => belongsToScope(session, args))
      },
      deriveAliyunRdsVoiceCoachTextEvents(session, rows) {
        remember("deriveAliyunRdsVoiceCoachTextEvents", { sessionId: session.id })
        const events = [
          {
            cursor: 1,
            created_at: session.created_at,
            event_id: `${session.id}:session.created`,
            payload: { session_id: session.id },
            type: "session.created",
          },
        ]
        for (const row of rows) {
          if (row.role === "beautician") {
            events.push({
              cursor: events.length + 1,
              created_at: row.created_at,
              event_id: `${row.id}:beautician_turn.submitted`,
              payload: { turn_id: row.id },
              type: "beautician_turn.submitted",
            })
          }
          if (row.role === "customer" && row.turn_index > 0) {
            events.push({
              cursor: events.length + 1,
              created_at: row.created_at,
              event_id: `${row.id}:customer_turn.ready`,
              payload: { turn_id: row.id },
              type: "customer_turn.ready",
            })
          }
        }
        if (session.status === "ended") {
          events.push({
            cursor: events.length + 1,
            created_at: session.ended_at,
            event_id: `${session.id}:session.ended`,
            payload: { report_ready: true },
            type: "session.ended",
          })
        }
        return events
      },
    },
  }
}

function helperStubs(rdsMock) {
  return {
    "server-only": {},
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => jsonResponse({ ok: false, code: "unauthorized" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => ({ user: { id: currentAccountContext.userId } }),
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
      getAliyunRdsAppAccountContext: async () => currentAccountContext,
    },
    "@/lib/aliyun-rds/repositories/app-voice-coach-rds.server": rdsMock.module,
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
}

function routeModule(helperExports, ...parts) {
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

function sessionContext(sessionId) {
  return { params: Promise.resolve({ sessionId }) }
}

function compileHelperWithMode(t, mode) {
  const rdsMock = createRdsMock()
  const previousMode = process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
  const previousStorePath = process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-rds-selection-"))
  process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = mode
  process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = path.join(tempDir, "sessions.json")
  t.after(() => {
    if (previousMode === undefined) delete process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
    else process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = previousMode
    if (previousStorePath === undefined) delete process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
    else process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = previousStorePath
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
  return {
    helperExports: compileTsModule(helperPath, helperStubs(rdsMock)),
    rdsMock,
  }
}

function compileHelperWithRdsMock(t) {
  return compileHelperWithMode(t, "rds")
}

test("VC-L4-05 route handlers use explicit RDS repository selection when configured", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const submitRoute = routeModule(
    helperExports,
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
  const eventsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      customer_profile_id: CUSTOMER_PROFILE_ID,
      scenario_id: "objection_safety",
      scene_card_id: SCENE_CARD_ID,
    }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)
  assert.equal(created.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(created.session_id, SESSION_ID)
  assert.equal(created.session_context.customer_name, "张女士")
  assert.equal(created.session_context.scene_name, "敏感肌到店咨询")
  assert.equal(created.session_context.service_name, "舒缓护理")
  assert.equal(created.session_context.membership_id, testAccountContext.membershipId)
  assert.deepEqual(rdsMock.calls, ["createAliyunRdsVoiceCoachTextSession"])
  assert.deepEqual(
    {
      companyId: rdsMock.callArgs[0].args.companyId,
      membershipId: rdsMock.callArgs[0].args.membershipId,
      storeId: rdsMock.callArgs[0].args.storeId,
      userId: rdsMock.callArgs[0].args.userId,
    },
    {
      companyId: testAccountContext.companyId,
      membershipId: testAccountContext.membershipId,
      storeId: testAccountContext.storeId,
      userId: testAccountContext.userId,
    },
  )

  const detailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  const detail = await payload(detailResponse)
  assert.equal(detailResponse.status, 200)
  assert.equal(detail.session.context.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(detail.session.context.customer_name, created.session_context.customer_name)
  assert.equal(detail.session.context.scene_name, created.session_context.scene_name)
  assert.equal(detail.session.context.service_name, created.session_context.service_name)
  assert.equal(detail.turns[0].turn_id, "rds-turn-1")

  const submitResponse = await submitRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/beautician-turn/submit`, {
      transcript_text: "我会先确认敏感风险，再从低刺激护理开始。",
    }),
    sessionContext(created.session_id),
  )
  const submitted = await payload(submitResponse)
  assert.equal(submitResponse.status, 200)
  assert.equal(submitted.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(submitted.beautician_turn.turn_id, "rds-turn-2")
  assert.equal(submitted.next_customer_turn.turn_id, "rds-turn-3")

  const eventsResponse = await eventsRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/events?cursor=0`),
    sessionContext(created.session_id),
  )
  const events = await payload(eventsResponse)
  assert.equal(eventsResponse.status, 200)
  assert.deepEqual(
    events.events.map((event) => event.type),
    ["session.created", "beautician_turn.submitted", "customer_turn.ready"],
  )

  const endResponse = await endRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/end`, {}),
    sessionContext(created.session_id),
  )
  const ended = await payload(endResponse)
  assert.equal(endResponse.status, 200)
  assert.equal(ended.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(ended.session.status, "ended")

  const reportResponse = await reportRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/report`),
    sessionContext(created.session_id),
  )
  const report = await payload(reportResponse)
  assert.equal(reportResponse.status, 200)
  assert.equal(report.report.status, "ready")
  assert.equal(report.report.meta.generated_from, "rds_voice_coach_text_session_contract")

  const listResponse = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions?limit=5"))
  const list = await payload(listResponse)
  assert.equal(listResponse.status, 200)
  assert.equal(list.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(list.sessions[0].id, created.session_id)
  assert.equal(list.sessions[0].customer_name, created.session_context.customer_name)
  assert.equal(list.sessions[0].scene_name, created.session_context.scene_name)
  assert.equal(list.sessions[0].service_name, created.session_context.service_name)
  assert(rdsMock.calls.includes("listAliyunRdsVoiceCoachTextSessionHistory"))
  assertAuthorizationChecks(7)
})

test("VC-L4-05 route repository selection fails fast on unknown mode", async (t) => {
  resetAuthorizationChecks()
  const rdsMock = createRdsMock()
  const previousMode = process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
  process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = "mystery"
  t.after(() => {
    if (previousMode === undefined) delete process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
    else process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = previousMode
  })
  const helperExports = compileTsModule(helperPath, helperStubs(rdsMock))
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 500)
  assert.equal(created.code, "app_voice_coach_session_create_failed")
  assert.equal(created.error, "app_voice_coach_session_create_failed")
  assert.doesNotMatch(JSON.stringify(created), /mystery|repository_mode_unsupported/)
  assert.deepEqual(rdsMock.calls, [])
  assertAuthorizationChecks(1)
})

test("VC-L4-05 route requires an active membership before any voice-coach repository access", async (t) => {
  resetAuthorizationChecks()
  setAccountContext({ membershipId: null })
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

  const response = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions"))
  const body = await payload(response)

  assert.equal(response.status, 403)
  assert.equal(body.code, "tenant_scope_denied")
  assert.deepEqual(rdsMock.calls, [])
})

test("VC-L4-05 route fails closed when company, store, or membership changes after RDS create", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const eventsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const submitRoute = routeModule(
    helperExports,
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
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const scopeChanges = [
    ["company", { companyId: "company-chunshe-2" }],
    ["store", { storeId: "store-chunshe-2" }],
    ["membership", { membershipId: "membership-route-rds-2" }],
  ]
  for (const [dimension, changedAccount] of scopeChanges) {
    setAccountContext({})
    rdsMock.calls.length = 0
    rdsMock.callArgs.length = 0
    const createResponse = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
    )
    assert.equal(createResponse.status, 201, `${dimension} case must create an owner session`)
    const originalSession = rdsMock.sessions.get(SESSION_ID)
    assert.equal(originalSession.status, "active")

    setAccountContext(changedAccount)
    const listResponse = await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions"))
    assert.deepEqual((await payload(listResponse)).sessions, [], `${dimension} change must hide history`)

    const responses = await Promise.all([
      detailRoute.GET(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}`), sessionContext(SESSION_ID)),
      eventsRoute.GET(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/events`), sessionContext(SESSION_ID)),
      submitRoute.POST(
        request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/beautician-turn/submit`, {
          transcript_text: "不应写入",
        }),
        sessionContext(SESSION_ID),
      ),
      reportRoute.GET(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/report`), sessionContext(SESSION_ID)),
      endRoute.POST(request(`https://local.test/api/app/voice-coach/sessions/${SESSION_ID}/end`), sessionContext(SESSION_ID)),
    ])
    for (const response of responses) {
      const body = await payload(response)
      assert.equal(response.status, 404, `${dimension} change must fail closed`)
      assert.equal(body.code, "voice_coach_session_not_found")
    }
    assert(!rdsMock.calls.includes("appendAliyunRdsVoiceCoachTextReply"))
    assert(!rdsMock.calls.includes("endAliyunRdsVoiceCoachTextSession"))
    assert.equal(originalSession.status, "active", `${dimension} change must not end original session`)
    assert.equal(originalSession.report_json, null, `${dimension} change must not write original report`)
  }
})

test("VC-L4-05 malformed RDS session ids skip repository while canonical UUIDv7 reaches it", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const malformedId = "not-a-uuid"
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const eventsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
  const submitRoute = routeModule(
    helperExports,
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
  const endRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const reportRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")

  const responses = await Promise.all([
    detailRoute.GET(request(`https://local.test/${malformedId}`), sessionContext(malformedId)),
    eventsRoute.GET(request(`https://local.test/${malformedId}/events`), sessionContext(malformedId)),
    submitRoute.POST(
      request(`https://local.test/${malformedId}/submit`, { transcript_text: "不会写入" }),
      sessionContext(malformedId),
    ),
    reportRoute.GET(request(`https://local.test/${malformedId}/report`), sessionContext(malformedId)),
    endRoute.POST(request(`https://local.test/${malformedId}/end`), sessionContext(malformedId)),
  ])
  for (const response of responses) {
    const body = await payload(response)
    assert.equal(response.status, 404)
    assert.equal(body.error, "voice_coach_session_not_found")
    assert.equal(body.code, "voice_coach_session_not_found")
  }
  assert.deepEqual(rdsMock.calls, [])

  const canonicalV7Id = "019f4f78-6dc8-73b1-8123-91f4aff1a7e2"
  const canonicalV7Response = await detailRoute.GET(
    request(`https://local.test/${canonicalV7Id}`),
    sessionContext(canonicalV7Id),
  )
  assert.equal(canonicalV7Response.status, 404)
  assert.deepEqual(rdsMock.calls, ["getAliyunRdsVoiceCoachTextSession"])
})

test("VC-L4-05 malformed and foreign RDS selections preserve stable mini-program 400 codes", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

  const cases = [
    [{ customer_profile_id: "not-a-uuid" }, "customer_profile_not_found", false],
    [{ customer_profile_id: FOREIGN_ID }, "customer_profile_not_found", true],
    [{ scene_card_id: "not-a-uuid" }, "scene_card_not_found", false],
    [{ scene_card_id: FOREIGN_ID }, "scene_card_not_found", true],
  ]
  for (const [selection, code, shouldReachRepository] of cases) {
    rdsMock.calls.length = 0
    rdsMock.callArgs.length = 0
    const response = await sessionsRoute.POST(
      request("https://local.test/api/app/voice-coach/sessions", {
        scenario_id: "objection_safety",
        ...selection,
      }),
    )
    const body = await payload(response)
    assert.equal(response.status, 400)
    assert.equal(body.error, code)
    assert.equal(body.code, code)
    assert.equal(rdsMock.calls.includes("createAliyunRdsVoiceCoachTextSession"), shouldReachRepository)
  }
})

test("VC-L4-05 unexpected RDS failures return only the stable route fallback code", async (t) => {
  resetAuthorizationChecks()
  const { helperExports } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")

  const response = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "explode" }),
  )
  const body = await payload(response)

  assert.equal(response.status, 500)
  assert.equal(body.error, "app_voice_coach_session_create_failed")
  assert.equal(body.code, "app_voice_coach_session_create_failed")
  assert.doesNotMatch(JSON.stringify(body), /secret_table|private\/backend|select \*/i)
})

test("VC-L4-05 local durable sessions are isolated by membership as well as user and tenant", async (t) => {
  resetAuthorizationChecks()
  const { helperExports } = compileHelperWithMode(t, "local_durable")
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const detailRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)

  setAccountContext({ membershipId: "membership-route-rds-2" })
  const hiddenList = await payload(await sessionsRoute.GET(request("https://local.test/api/app/voice-coach/sessions")))
  assert.deepEqual(hiddenList.sessions, [])
  const hiddenDetailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  assert.equal(hiddenDetailResponse.status, 404)

  setAccountContext({ membershipId: testAccountContext.membershipId })
  const ownerDetailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  assert.equal(ownerDetailResponse.status, 200)
})

test("VC-L4-05 RDS mode keeps TTS and ASR at fixed 501 without session lookup", async (t) => {
  resetAuthorizationChecks()
  const { helperExports, rdsMock } = compileHelperWithRdsMock(t)
  const ttsRoute = routeModule(
    helperExports,
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
  const asrRoute = routeModule(
    helperExports,
    "app",
    "api",
    "app",
    "voice-coach",
    "sessions",
    "[sessionId]",
    "asr-preview",
    "route.ts",
  )

  const ttsResponse = await ttsRoute.POST(
    request("https://local.test/not-a-uuid/turns/turn-1/tts"),
    { params: Promise.resolve({ sessionId: "not-a-uuid", turnId: "turn-1" }) },
  )
  const asrResponse = await asrRoute.POST(
    request("https://local.test/not-a-uuid/asr-preview"),
    sessionContext("not-a-uuid"),
  )

  assert.equal(ttsResponse.status, 501)
  assert.equal((await payload(ttsResponse)).code, "voice_coach_tts_provider_required")
  assert.equal(asrResponse.status, 501)
  assert.equal((await payload(asrResponse)).code, "voice_coach_asr_provider_required")
  assert.deepEqual(rdsMock.calls, [])
})

test("VC-L4-10B route create emits sanitized timing evidence for RDS mode", async (t) => {
  resetAuthorizationChecks()
  const { helperExports } = compileHelperWithRdsMock(t)
  const sessionsRoute = routeModule(helperExports, "app", "api", "app", "voice-coach", "sessions", "route.ts")
  const originalConsoleInfo = console.info
  const infoLogs = []
  console.info = (message) => {
    infoLogs.push(String(message))
  }
  t.after(() => {
    console.info = originalConsoleInfo
  })

  const createResponse = await sessionsRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", {
      customer_profile_id: CUSTOMER_PROFILE_ID,
      scenario_id: "objection_safety",
      scene_card_id: SCENE_CARD_ID,
    }),
  )
  assert.equal(createResponse.status, 201)

  const timingEvents = infoLogs
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === "app_voice_coach_create_timing")

  assert.equal(timingEvents.length, 1)
  const timingEvent = timingEvents[0]
  assert.match(timingEvent.request_id, /^[0-9a-f]{12}$/)
  assert.equal(timingEvent.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(timingEvent.status, 201)
  assert.equal(timingEvent.session_id_fragment, "77777777...77777")
  assert(Number.isInteger(timingEvent.total_ms))
  assert.deepEqual(
    timingEvent.stages.map((stage) => stage.name),
    ["auth_context", "body_read", "rds_repository_import", "rds_prepare_payload", "rds_mock_create"],
  )
  for (const stage of timingEvent.stages) {
    assert(Number.isInteger(stage.duration_ms), `stage ${stage.name} must include integer duration_ms`)
  }

  const serialized = JSON.stringify(timingEvent)
  assert.doesNotMatch(serialized, /Authorization|DATABASE_URL_CN|postgres:\/\//i)
  assert.doesNotMatch(serialized, /我担心皮肤敏感|我会先确认敏感风险/)
  assert.doesNotMatch(serialized, new RegExp(CUSTOMER_PROFILE_ID))
  assert.doesNotMatch(serialized, new RegExp(SCENE_CARD_ID))
  assertAuthorizationChecks(1)
})
