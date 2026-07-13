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
const runtimeConfigPath = path.join(root, "lib", "aliyun-rds", "app-voice-coach-runtime-config.server.ts")

const voiceCoachFeatureDecision = { enabled: true, reason: "ok", source: "ai_points" }
const authorizationChecks = []
const audioProviderCalls = { asr: 0, tts: 0, uploads: 0 }
const audioBoundaryFailures = { asr: null, tts: null, upload: null, sign: null }
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
  "@/lib/aliyun-rds/app-voice-coach-runtime-config.server": compileTsModule(runtimeConfigPath, {
    "server-only": {},
  }),
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
  "@/lib/voice-coach/speech/doubao.server": {
    doubaoAsrFlash: async () => {
      audioProviderCalls.asr += 1
      if (audioBoundaryFailures.asr) throw new Error(audioBoundaryFailures.asr)
      return { text: "真实转写文本", confidence: 0.99, durationSeconds: 1.2, requestId: "asr-g4a-test" }
    },
    doubaoTts: async () => {
      audioProviderCalls.tts += 1
      if (audioBoundaryFailures.tts) throw new Error(audioBoundaryFailures.tts)
      return { audio: Buffer.from("audio"), durationSeconds: 1.4, requestId: "tts-g4a-test" }
    },
  },
  "@/lib/voice-coach/storage.server": {
    signVoiceCoachAudio: async (path) => {
      if (audioBoundaryFailures.sign) throw new Error(audioBoundaryFailures.sign)
      return `https://audio.local/${path}`
    },
    uploadVoiceCoachAudio: async () => {
      audioProviderCalls.uploads += 1
      if (audioBoundaryFailures.upload) throw new Error(audioBoundaryFailures.upload)
    },
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
            yield [key, typeof value === "string" ? value : value]
          }
        },
      }
    },
  }
}

function audioUpload() {
  return {
    name: "voice.mp3",
    type: "audio/mpeg",
    async arrayBuffer() {
      return Uint8Array.from([1, 2, 3]).buffer
    },
  }
}

async function payload(response) {
  return response.json()
}

function setDurableStoreForTest(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-runtime-"))
  const previous = {
    appEnv: process.env.APP_ENV,
    appRegion: process.env.APP_REGION,
    repositoryMode: process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE,
    storePath: process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH,
  }
  process.env.APP_ENV = "test"
  delete process.env.APP_REGION
  delete process.env.APP_VOICE_COACH_TEXT_REPOSITORY_MODE
  process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = path.join(tempDir, "sessions.json")
  t.after(() => {
    restoreEnv("APP_ENV", previous.appEnv)
    restoreEnv("APP_REGION", previous.appRegion)
    restoreEnv("APP_VOICE_COACH_TEXT_REPOSITORY_MODE", previous.repositoryMode)
    restoreEnv("APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH", previous.storePath)
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function resetAudioBoundaryFailures() {
  for (const key of Object.keys(audioBoundaryFailures)) audioBoundaryFailures[key] = null
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
    request(
      `https://local.test/api/app/voice-coach/sessions/${created.session_id}/beautician-turn/submit`,
      {
        audio: audioUpload(),
        reply_to_turn_id: created.first_customer_turn.turn_id,
        transcript_text: "我先确认你的敏感情况，再建议从低刺激护理开始。",
        client_attempt_id: "runtime-proof-1",
      },
      "multipart/form-data; boundary=g4a",
    ),
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

test("VC-G4A-01 local route runtime invokes the real App audio contract", async (t) => {
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
  assert.equal(ttsResponse.status, 200)
  assert.equal(tts.ok, true)
  assert.equal(typeof tts.audio_url, "string")
  assert.equal(tts.turn_id, created.first_customer_turn.turn_id)
  assert.equal(tts.provider_mode, "volc_speech_tts")
  assert.equal(audioProviderCalls.tts, 1)
  assert.equal(tts.repository_mode, "text_first_local_durable_session_store")
  assert.ok(Array.isArray(tts.local_side_effects))

  const asrResponse = await asrRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/asr-preview`, {
      audio_b64: "AQID",
      format: "mp3",
    }),
    { params: Promise.resolve({ sessionId: created.session_id }) },
  )
  const asr = await payload(asrResponse)
  assert.equal(asrResponse.status, 200)
  assert.equal(asr.ok, true)
  assert.equal(typeof asr.text, "string")
  assert.equal(asr.provider_mode, "volc_speech_asr_flash")
  assert.equal(audioProviderCalls.asr, 1)
  assert.equal(asr.repository_mode, "text_first_local_durable_session_store")
  assert.ok(Array.isArray(asr.local_side_effects))
  assertAuthorizationChecks(3)
})

test("VC-G4A-02 local submit rejects a turn without transcript_text", async (t) => {
  resetAuthorizationChecks()
  setDurableStoreForTest(t)
  const sessionsRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "route.ts")
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
  const created = await payload(
    await sessionsRoute.POST(request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" })),
  )

  const response = await submitRoute.POST(
    request(
      `https://local.test/api/app/voice-coach/sessions/${created.session_id}/beautician-turn/submit`,
      {
        client_attempt_id: "g4a-missing-transcript",
        reply_to_turn_id: created.first_customer_turn.turn_id,
      },
      "multipart/form-data; boundary=g4a",
    ),
    { params: Promise.resolve({ sessionId: created.session_id }) },
  )

  assert.equal(response.status, 422)
  assert.equal((await payload(response)).code, "transcript_text_required")
})

test("VC-G4A-B malformed JSON and non-multipart submit return matrix 422 invalid_payload", async (t) => {
  resetAuthorizationChecks()
  setDurableStoreForTest(t)
  const sessionsRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "route.ts")
  const asrRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "asr-preview", "route.ts")
  const submitRoute = routeModule(
    "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "beautician-turn", "submit", "route.ts",
  )
  const created = await payload(
    await sessionsRoute.POST(request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" })),
  )
  const malformedJsonRequest = request(`https://local.test/${created.session_id}/asr-preview`)
  malformedJsonRequest.json = async () => { throw new SyntaxError("malformed JSON fixture") }

  const asrResponse = await asrRoute.POST(malformedJsonRequest, {
    params: Promise.resolve({ sessionId: created.session_id }),
  })
  const submitResponse = await submitRoute.POST(
    request(`https://local.test/${created.session_id}/submit`, {
      audio: audioUpload(),
      client_attempt_id: "g4a-invalid-content-type",
      reply_to_turn_id: created.first_customer_turn.turn_id,
      transcript_text: "请先说说您的顾虑。",
    }),
    { params: Promise.resolve({ sessionId: created.session_id }) },
  )

  for (const response of [asrResponse, submitResponse]) {
    assert.equal(response.status, 422)
    assert.equal((await payload(response)).code, "invalid_payload")
  }
})

test("VC-G4A-B provider and persist failures retain stable 502 business codes", async (t) => {
  resetAuthorizationChecks()
  resetAudioBoundaryFailures()
  t.after(resetAudioBoundaryFailures)
  setDurableStoreForTest(t)
  const sessionsRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "route.ts")
  const asrRoute = routeModule("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "asr-preview", "route.ts")
  const ttsRoute = routeModule(
    "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "turns", "[turnId]", "tts", "route.ts",
  )
  const submitRoute = routeModule(
    "app", "api", "app", "voice-coach", "sessions", "[sessionId]", "beautician-turn", "submit", "route.ts",
  )
  const created = await payload(
    await sessionsRoute.POST(request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" })),
  )
  const sessionContext = { params: Promise.resolve({ sessionId: created.session_id }) }
  const ttsContext = {
    params: Promise.resolve({ sessionId: created.session_id, turnId: created.first_customer_turn.turn_id }),
  }

  audioBoundaryFailures.asr = "asr_flash_timeout"
  let response = await asrRoute.POST(
    request(`https://local.test/${created.session_id}/asr-preview`, { audio_b64: "AQID", format: "mp3" }),
    sessionContext,
  )
  assert.equal(response.status, 502)
  assert.equal((await payload(response)).code, "voice_coach_asr_provider_unavailable")

  audioBoundaryFailures.asr = "asr_invalid_response"
  response = await asrRoute.POST(
    request(`https://local.test/${created.session_id}/asr-preview`, { audio_b64: "AQID", format: "mp3" }),
    sessionContext,
  )
  assert.equal(response.status, 502)
  assert.equal((await payload(response)).code, "voice_coach_asr_provider_failed")

  audioBoundaryFailures.asr = null
  audioBoundaryFailures.tts = "tts_provider_fixture"
  response = await ttsRoute.POST(request(`https://local.test/${created.session_id}/tts`), ttsContext)
  assert.equal(response.status, 502)
  assert.equal((await payload(response)).code, "voice_coach_tts_provider_failed")

  audioBoundaryFailures.tts = null
  audioBoundaryFailures.upload = "storage_upload_fixture"
  response = await ttsRoute.POST(request(`https://local.test/${created.session_id}/tts`), ttsContext)
  assert.equal(response.status, 502)
  assert.equal((await payload(response)).code, "voice_coach_tts_persist_failed")

  response = await submitRoute.POST(
    request(
      `https://local.test/${created.session_id}/submit`,
      {
        audio: audioUpload(),
        client_attempt_id: "g4a-persist-failure",
        reply_to_turn_id: created.first_customer_turn.turn_id,
        transcript_text: "请先说说您的顾虑。",
      },
      "multipart/form-data; boundary=g4a",
    ),
    sessionContext,
  )
  assert.equal(response.status, 502)
  assert.equal((await payload(response)).code, "voice_coach_audio_persist_failed")
})
