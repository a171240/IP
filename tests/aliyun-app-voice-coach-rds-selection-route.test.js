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

const testAccountContext = {
  userId: "app-user-route-rds-1",
  companyId: "company-chunshe",
  storeId: "store-chunshe",
  role: "employee",
  isPlatformAdmin: false,
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
  const sessions = new Map()
  const turns = new Map()
  const mode = "rds_voice_coach_text_session_contract"

  function remember(name) {
    calls.push(name)
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
    module: {
      APP_VOICE_COACH_RDS_REPOSITORY_MODE: mode,
      async createAliyunRdsVoiceCoachTextSession(args) {
        remember("createAliyunRdsVoiceCoachTextSession")
        args.timing?.recordStage("rds_mock_create", Date.now())
        const session = {
          id: "rds-session-1",
          created_at: "2026-07-06T10:00:00.000Z",
          user_id: args.userId,
          scenario_id: args.scenario.id,
          status: "active",
          started_at: "2026-07-06T10:00:00.000Z",
          ended_at: null,
          report_json: null,
          total_score: null,
          dimension_scores: null,
          customer_profile_id: args.customerProfileId || null,
          scene_card_id: args.sceneCardId || null,
          session_context_json: args.sessionContext || {},
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
        remember("getAliyunRdsVoiceCoachTextSessionWithClient")
        const session = sessions.get(args.sessionId)
        if (!session || session.user_id !== args.userId) return null
        return { session, turns: turns.get(args.sessionId) || [] }
      },
      async getAliyunRdsVoiceCoachTextSession(args) {
        remember("getAliyunRdsVoiceCoachTextSession")
        const session = sessions.get(args.sessionId)
        if (!session || session.user_id !== args.userId) return null
        return { session, turns: turns.get(args.sessionId) || [] }
      },
      async appendAliyunRdsVoiceCoachTextReplyWithClient(_client, args) {
        remember("appendAliyunRdsVoiceCoachTextReplyWithClient")
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
        remember("appendAliyunRdsVoiceCoachTextReply")
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
        remember("endAliyunRdsVoiceCoachTextSessionWithClient")
        const session = sessions.get(args.sessionId)
        session.status = "ended"
        session.ended_at = "2026-07-06T10:06:00.000Z"
        session.report_json = args.report
        session.total_score = args.totalScore
        session.dimension_scores = args.dimensionScores
        return session
      },
      async endAliyunRdsVoiceCoachTextSession(args) {
        remember("endAliyunRdsVoiceCoachTextSession")
        const session = sessions.get(args.sessionId)
        session.status = "ended"
        session.ended_at = "2026-07-06T10:06:00.000Z"
        session.report_json = args.report
        session.total_score = args.totalScore
        session.dimension_scores = args.dimensionScores
        return session
      },
      async listAliyunRdsVoiceCoachTextSessionHistoryWithClient(_client, args) {
        remember("listAliyunRdsVoiceCoachTextSessionHistoryWithClient")
        return Array.from(sessions.values()).filter((session) => session.user_id === args.userId)
      },
      async listAliyunRdsVoiceCoachTextSessionHistory(args) {
        remember("listAliyunRdsVoiceCoachTextSessionHistory")
        return Array.from(sessions.values()).filter((session) => session.user_id === args.userId)
      },
      deriveAliyunRdsVoiceCoachTextEvents(session, rows) {
        remember("deriveAliyunRdsVoiceCoachTextEvents")
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
      resolveAliyunRdsAppAuthUser: async () => ({ user: { id: testAccountContext.userId } }),
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

function compileHelperWithRdsMock(t) {
  const rdsMock = createRdsMock()
  const previousMode = process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-rds-selection-"))
  process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = "rds"
  process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = path.join(tempDir, "sessions.json")
  t.after(() => {
    if (previousMode === undefined) delete process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
    else process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE = previousMode
    delete process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
  return {
    helperExports: compileTsModule(helperPath, helperStubs(rdsMock)),
    rdsMock,
  }
}

test("VC-L4-05 route handlers use explicit RDS repository selection when configured", async (t) => {
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
      customer_profile_id: "11111111-1111-4111-8111-111111111111",
      scenario_id: "objection_safety",
      scene_card_id: "22222222-2222-4222-8222-222222222222",
    }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)
  assert.equal(created.repository_mode, "rds_voice_coach_text_session_contract")
  assert.equal(created.session_id, "rds-session-1")
  assert.deepEqual(rdsMock.calls, ["createAliyunRdsVoiceCoachTextSession"])

  const detailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  const detail = await payload(detailResponse)
  assert.equal(detailResponse.status, 200)
  assert.equal(detail.session.context.repository_mode, "rds_voice_coach_text_session_contract")
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
  assert(rdsMock.calls.includes("listAliyunRdsVoiceCoachTextSessionHistory"))
})

test("VC-L4-05 route repository selection fails fast on unknown mode", async (t) => {
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
  assert.match(created.error, /app_voice_coach_repository_mode_unsupported:mystery/)
  assert.deepEqual(rdsMock.calls, [])
})

test("VC-L4-10B route create emits sanitized timing evidence for RDS mode", async (t) => {
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
      customer_profile_id: "11111111-1111-4111-8111-111111111111",
      scenario_id: "objection_safety",
      scene_card_id: "22222222-2222-4222-8222-222222222222",
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
  assert.match(timingEvent.session_id_fragment, /^rds-sess\.\.\.ion-1$/)
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
  assert.doesNotMatch(serialized, /11111111-1111-4111-8111-111111111111/)
  assert.doesNotMatch(serialized, /22222222-2222-4222-8222-222222222222/)
})
