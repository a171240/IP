/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-rds.server.ts")

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

function compileRepository() {
  return compileTsModule(repositoryPath, {
    "server-only": {},
    "@/lib/aliyun-rds/postgres.server": {
      withAliyunRdsTransaction: async (fn) => fn(new FakeVoiceCoachRdsClient()),
    },
  })
}

class FakeVoiceCoachRdsClient {
  constructor() {
    this.queries = []
    this.sessions = []
    this.turns = []
  }

  async query(text, values = []) {
    this.queries.push({ text: normalizeSql(text), values })
    const sql = normalizeSql(text)

    if (sql.startsWith("insert into public.voice_coach_sessions")) {
      const row = {
        id: `session-${this.sessions.length + 1}`,
        created_at: "2026-07-06T10:00:00.000Z",
        user_id: values[0],
        scenario_id: values[1],
        status: "active",
        started_at: "2026-07-06T10:00:00.000Z",
        ended_at: null,
        report_json: null,
        total_score: null,
        dimension_scores: null,
        customer_profile_id: values[2] || null,
        scene_card_id: values[3] || null,
        session_context_json: JSON.parse(values[4]),
        scenario_snapshot_json: JSON.parse(values[5]),
      }
      this.sessions.push(row)
      return { rows: [row] }
    }

    if (sql.startsWith("insert into public.voice_coach_turns")) {
      const row = {
        id: `turn-${this.turns.length + 1}`,
        created_at: "2026-07-06T10:00:00.000Z",
        session_id: values[0],
        turn_index: values[1],
        role: values[2],
        text: values[3],
        emotion: values[4] || null,
        audio_path: null,
        audio_seconds: null,
        asr_confidence: null,
        analysis_json: JSON.parse(values[5]),
        features_json: JSON.parse(values[6]),
      }
      this.turns.push(row)
      return { rows: [row] }
    }

    if (sql.startsWith("select * from public.voice_coach_sessions where id = $1 and user_id = $2")) {
      return {
        rows: this.sessions.filter((session) => session.id === values[0] && session.user_id === values[1]),
      }
    }

    if (sql.startsWith("select * from public.voice_coach_turns where session_id = $1")) {
      return {
        rows: this.turns
          .filter((turn) => turn.session_id === values[0])
          .sort((left, right) => left.turn_index - right.turn_index),
      }
    }

    if (sql.startsWith("select coalesce(max(turn_index), -1)::int as max_turn_index")) {
      const indexes = this.turns
        .filter((turn) => turn.session_id === values[0])
        .map((turn) => Number(turn.turn_index))
      return { rows: [{ max_turn_index: indexes.length ? Math.max(...indexes) : -1 }] }
    }

    if (sql.startsWith("update public.voice_coach_sessions")) {
      const session = this.sessions.find((item) => item.id === values[0] && item.user_id === values[1])
      if (!session) return { rows: [] }
      session.status = "ended"
      session.ended_at = "2026-07-06T10:06:00.000Z"
      session.report_json = JSON.parse(values[2])
      session.total_score = values[3]
      session.dimension_scores = JSON.parse(values[4])
      return { rows: [session] }
    }

    if (sql.startsWith("select * from public.voice_coach_sessions where user_id = $1")) {
      return { rows: this.sessions.filter((session) => session.user_id === values[0]) }
    }

    throw new Error(`unexpected_sql:${sql}`)
  }
}

function normalizeSql(text) {
  return String(text).replace(/\s+/g, " ").trim()
}

test("VC-L4-04 RDS repository contract maps text-first voiceCoach closure to sessions and turns tables", async () => {
  const repository = compileRepository()
  const client = new FakeVoiceCoachRdsClient()

  const created = await repository.createAliyunRdsVoiceCoachTextSessionWithClient(client, {
    customerProfileId: "11111111-1111-4111-8111-111111111111",
    firstCustomerText: "我担心皮肤敏感，做完会不会不舒服？",
    scenario: {
      id: "objection_safety",
      name: "顾客顾虑处理",
      goal: "把顾客顾虑复述清楚并给出下一步建议",
    },
    sceneCardId: "22222222-2222-4222-8222-222222222222",
    sessionContext: { source: "contract-test" },
    userId: "33333333-3333-4333-8333-333333333333",
  })

  assert.equal(created.session.status, "active")
  assert.equal(created.firstCustomerTurn.role, "customer")
  assert.equal(created.firstCustomerTurn.turn_index, 0)

  const detailAfterCreate = await repository.getAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId: created.session.id,
    userId: created.session.user_id,
  })
  assert.equal(detailAfterCreate.turns.length, 1)

  const submitted = await repository.appendAliyunRdsVoiceCoachTextReplyWithClient(client, {
    nextCustomerText: "那如果我中途觉得刺痛，你们会怎么处理？",
    replyText: "我会先确认敏感风险，再从低刺激护理开始。",
    sessionId: created.session.id,
    userId: created.session.user_id,
  })
  assert.equal(submitted.beauticianTurn.role, "beautician")
  assert.equal(submitted.nextCustomerTurn.role, "customer")
  assert.equal(submitted.nextCustomerTurn.turn_index, 2)

  const detailAfterSubmit = await repository.getAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId: created.session.id,
    userId: created.session.user_id,
  })
  const events = repository.deriveAliyunRdsVoiceCoachTextEvents(detailAfterSubmit.session, detailAfterSubmit.turns)
  assert.deepEqual(
    events.map((event) => event.type),
    ["session.created", "beautician_turn.submitted", "customer_turn.ready"],
  )

  const ended = await repository.endAliyunRdsVoiceCoachTextSessionWithClient(client, {
    dimensionScores: [{ key: "empathy", score: 82 }],
    report: { status: "ready", total_score: 82, tabs: { transcript: [] } },
    sessionId: created.session.id,
    totalScore: 82,
    userId: created.session.user_id,
  })
  assert.equal(ended.status, "ended")
  assert.equal(ended.report_json.status, "ready")

  const history = await repository.listAliyunRdsVoiceCoachTextSessionHistoryWithClient(client, {
    limit: 5,
    userId: created.session.user_id,
  })
  assert.deepEqual(
    history.map((session) => session.id),
    [created.session.id],
  )

  const joinedSql = client.queries.map((query) => query.text).join("\n")
  assert.match(joinedSql, /insert into public\.voice_coach_sessions/)
  assert.match(joinedSql, /insert into public\.voice_coach_turns/)
  assert.match(joinedSql, /update public\.voice_coach_sessions/)
  assert.doesNotMatch(joinedSql, /voice_coach_customer_profiles/)
  assert.doesNotMatch(joinedSql, /voice_coach_scene_cards/)
})

test("VC-L4-04 RDS repository contract remains separate from local JSON durable store", () => {
  const source = fs.readFileSync(repositoryPath, "utf8")
  assert.doesNotMatch(source, /APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH/)
  assert.doesNotMatch(source, /readFileSync|writeFileSync|renameSync|mkdirSync/)
  assert.match(source, /withAliyunRdsTransaction/)
  assert.match(source, /public\.voice_coach_sessions/)
  assert.match(source, /public\.voice_coach_turns/)
})
