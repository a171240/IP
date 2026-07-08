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
  userId: "app-user-employee-durable",
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

const helperStubs = {
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

function compileHelperExports() {
  return compileTsModule(helperPath, helperStubs)
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

function durableRoute(...parts) {
  return routeModule(compileHelperExports(), ...parts)
}

test("VC-L4-03 local durable voiceCoach contract survives helper reloads", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-vc-durable-"))
  process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH = path.join(tempDir, "sessions.json")
  t.after(() => {
    delete process.env.APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  const createRoute = durableRoute("app", "api", "app", "voice-coach", "sessions", "route.ts")
  const createResponse = await createRoute.POST(
    request("https://local.test/api/app/voice-coach/sessions", { scenario_id: "objection_safety" }),
  )
  const created = await payload(createResponse)
  assert.equal(createResponse.status, 201)
  assert.match(created.repository_mode, /durable/)
  assert.notEqual(created.repository_mode, "text_first_memory_session")

  const detailRoute = durableRoute("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "route.ts")
  const detailResponse = await detailRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}`),
    sessionContext(created.session_id),
  )
  const detail = await payload(detailResponse)
  assert.equal(detailResponse.status, 200)
  assert.equal(detail.turns.length, 1)

  const submitRoute = durableRoute(
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
  const submitResponse = await submitRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/beautician-turn/submit`, {
      transcript_text: "我先确认敏感风险，再从低刺激护理开始。",
    }),
    sessionContext(created.session_id),
  )
  const submitted = await payload(submitResponse)
  assert.equal(submitResponse.status, 200)
  assert.equal(submitted.beautician_turn.role, "beautician")

  const eventsRoute = durableRoute("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "events", "route.ts")
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

  const endRoute = durableRoute("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "end", "route.ts")
  const endResponse = await endRoute.POST(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/end`, {}),
    sessionContext(created.session_id),
  )
  const ended = await payload(endResponse)
  assert.equal(endResponse.status, 200)
  assert.equal(ended.session.status, "ended")
  assert.equal(ended.report.status, "ready")

  const reportRoute = durableRoute("app", "api", "app", "voice-coach", "sessions", "[sessionId]", "report", "route.ts")
  const reportResponse = await reportRoute.GET(
    request(`https://local.test/api/app/voice-coach/sessions/${created.session_id}/report`),
    sessionContext(created.session_id),
  )
  const report = await payload(reportResponse)
  assert.equal(reportResponse.status, 200)
  assert.equal(report.report.meta.generated_from, created.repository_mode)
  assert.equal(report.report.tabs.transcript.length, 3)

  const listRoute = durableRoute("app", "api", "app", "voice-coach", "sessions", "route.ts")
  const listResponse = await listRoute.GET(request("https://local.test/api/app/voice-coach/sessions?limit=5"))
  const list = await payload(listResponse)
  assert.equal(listResponse.status, 200)
  assert.deepEqual(
    list.sessions.map((session) => session.id),
    [created.session_id],
  )
  assert.equal(list.sessions[0].can_view_report, true)
})
