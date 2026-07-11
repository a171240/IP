/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "app-voice-coach-rds.server.ts")

const CUSTOMER_PROFILE_ID = "11111111-1111-4111-8111-111111111111"
const SCENE_CARD_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const COMPANY_ID = "44444444-4444-4444-8444-444444444444"
const STORE_ID = "55555555-5555-4555-8555-555555555555"
const MEMBERSHIP_ID = "66666666-6666-4666-8666-666666666666"
const SESSION_ID = "77777777-7777-4777-8777-777777777777"
const FOREIGN_ID = "88888888-8888-4888-8888-888888888888"

const SESSION_SCOPE = {
  companyId: COMPANY_ID,
  membershipId: MEMBERSHIP_ID,
  storeId: STORE_ID,
  userId: USER_ID,
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
    this.customerProfiles = [
      { id: CUSTOMER_PROFILE_ID, user_id: USER_ID, name: "张女士" },
    ]
    this.sceneCards = [
      { id: SCENE_CARD_ID, user_id: USER_ID, name: "敏感肌到店咨询", service_name: "舒缓护理" },
    ]
  }

  async query(text, values = []) {
    this.queries.push({ text: normalizeSql(text), values })
    const sql = normalizeSql(text)

    if (sql.includes("from public.voice_coach_customer_profiles")) {
      return {
        rows: this.customerProfiles.filter((profile) => profile.id === values[0] && profile.user_id === values[1]),
      }
    }

    if (sql.includes("from public.voice_coach_scene_cards")) {
      return {
        rows: this.sceneCards.filter((scene) => scene.id === values[0] && scene.user_id === values[1]),
      }
    }

    if (sql.startsWith("insert into public.voice_coach_sessions")) {
      const scopedInsert = sql.includes("company_id") && sql.includes("membership_id")
      const row = scopedInsert
        ? {
            id: SESSION_ID,
            created_at: "2026-07-06T10:00:00.000Z",
            user_id: values[0],
            company_id: values[1],
            store_id: values[2],
            membership_id: values[3],
            scenario_id: values[4],
            status: "active",
            started_at: "2026-07-06T10:00:00.000Z",
            ended_at: null,
            report_json: null,
            total_score: null,
            dimension_scores: null,
            customer_profile_id: values[5] || null,
            scene_card_id: values[6] || null,
            session_context_json: JSON.parse(values[7]),
            scenario_snapshot_json: JSON.parse(values[8]),
          }
        : {
            id: SESSION_ID,
            created_at: "2026-07-06T10:00:00.000Z",
            user_id: values[0],
            company_id: null,
            store_id: null,
            membership_id: null,
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
      const scopedQuery = sql.includes("company_id = $3") && sql.includes("membership_id = $5")
      return {
        rows: this.sessions.filter((session) =>
          session.id === values[0] &&
          session.user_id === values[1] &&
          (!scopedQuery || (
            session.company_id === values[2] &&
            session.store_id === values[3] &&
            session.membership_id === values[4]
          )),
        ),
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
      const scopedUpdate = sql.includes("company_id = $3") && sql.includes("membership_id = $5")
      const session = this.sessions.find((item) =>
        item.id === values[0] &&
        item.user_id === values[1] &&
        (!scopedUpdate || (
          item.company_id === values[2] &&
          item.store_id === values[3] &&
          item.membership_id === values[4]
        )),
      )
      if (!session) return { rows: [] }
      const valueOffset = scopedUpdate ? 5 : 2
      session.status = "ended"
      session.ended_at = "2026-07-06T10:06:00.000Z"
      session.report_json = JSON.parse(values[valueOffset])
      session.total_score = values[valueOffset + 1]
      session.dimension_scores = JSON.parse(values[valueOffset + 2])
      return { rows: [session] }
    }

    if (sql.startsWith("select * from public.voice_coach_sessions where user_id = $1")) {
      const scopedQuery = sql.includes("company_id = $2") && sql.includes("membership_id = $4")
      const limit = Number(values[scopedQuery ? 4 : 1])
      return {
        rows: this.sessions
          .filter((session) =>
            session.user_id === values[0] &&
            (!scopedQuery || (
              session.company_id === values[1] &&
              session.store_id === values[2] &&
              session.membership_id === values[3]
            )),
          )
          .slice(0, limit),
      }
    }

    throw new Error(`unexpected_sql:${sql}`)
  }
}

function normalizeSql(text) {
  return String(text).replace(/\s+/g, " ").trim()
}

function createArgs(overrides = {}) {
  return {
    ...SESSION_SCOPE,
    customerProfileId: CUSTOMER_PROFILE_ID,
    firstCustomerText: "我担心皮肤敏感，做完会不会不舒服？",
    scenario: {
      id: "objection_safety",
      name: "顾客顾虑处理",
      goal: "把顾客顾虑复述清楚并给出下一步建议",
    },
    sceneCardId: SCENE_CARD_ID,
    ...overrides,
  }
}

test("VC-L4-04 RDS repository persists four-dimensional scope and a user-owned safe selection projection", async () => {
  const repository = compileRepository()
  const client = new FakeVoiceCoachRdsClient()

  const created = await repository.createAliyunRdsVoiceCoachTextSessionWithClient(client, createArgs())

  assert.equal(created.session.status, "active")
  assert.equal(created.session.company_id, COMPANY_ID)
  assert.equal(created.session.store_id, STORE_ID)
  assert.equal(created.session.membership_id, MEMBERSHIP_ID)
  assert.deepEqual(created.session.session_context_json, {
    customer_profile_id: CUSTOMER_PROFILE_ID,
    customer_name: "张女士",
    scene_card_id: SCENE_CARD_ID,
    scene_name: "敏感肌到店咨询",
    service_name: "舒缓护理",
    company_id: COMPANY_ID,
    store_id: STORE_ID,
    membership_id: MEMBERSHIP_ID,
  })
  assert.equal(created.firstCustomerTurn.role, "customer")
  assert.equal(created.firstCustomerTurn.turn_index, 0)

  const detailAfterCreate = await repository.getAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId: created.session.id,
    ...SESSION_SCOPE,
  })
  assert.equal(detailAfterCreate.turns.length, 1)

  const submitted = await repository.appendAliyunRdsVoiceCoachTextReplyWithClient(client, {
    nextCustomerText: "那如果我中途觉得刺痛，你们会怎么处理？",
    replyText: "我会先确认敏感风险，再从低刺激护理开始。",
    sessionId: created.session.id,
    ...SESSION_SCOPE,
  })
  assert.equal(submitted.beauticianTurn.role, "beautician")
  assert.equal(submitted.nextCustomerTurn.role, "customer")
  assert.equal(submitted.nextCustomerTurn.turn_index, 2)

  const detailAfterSubmit = await repository.getAliyunRdsVoiceCoachTextSessionWithClient(client, {
    sessionId: created.session.id,
    ...SESSION_SCOPE,
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
    ...SESSION_SCOPE,
  })
  assert.equal(ended.status, "ended")
  assert.equal(ended.report_json.status, "ready")

  const history = await repository.listAliyunRdsVoiceCoachTextSessionHistoryWithClient(client, {
    limit: 5,
    ...SESSION_SCOPE,
  })
  assert.deepEqual(history.map((session) => session.id), [created.session.id])

  const joinedSql = client.queries.map((query) => query.text).join("\n")
  assert.match(joinedSql, /insert into public\.voice_coach_sessions \( user_id, company_id, store_id, membership_id,/)
  assert.match(joinedSql, /from public\.voice_coach_customer_profiles where id = \$1 and user_id = \$2/)
  assert.match(joinedSql, /from public\.voice_coach_scene_cards where id = \$1 and user_id = \$2/)
  assert.match(joinedSql, /company_id = \$3 and store_id = \$4 and membership_id = \$5/)
  for (const query of client.queries.filter((item) => /voice_coach_(customer_profiles|scene_cards)/.test(item.text))) {
    assert.doesNotMatch(query.text, /company_id|store_id|membership_id/)
  }
})

test("VC-L4-04 RDS repository fails closed across every tenant dimension and legacy null-scope rows", async () => {
  const repository = compileRepository()
  const client = new FakeVoiceCoachRdsClient()
  const created = await repository.createAliyunRdsVoiceCoachTextSessionWithClient(client, createArgs())
  const scopeChanges = [
    ["company", { ...SESSION_SCOPE, companyId: FOREIGN_ID }],
    ["store", { ...SESSION_SCOPE, storeId: FOREIGN_ID }],
    ["membership", { ...SESSION_SCOPE, membershipId: FOREIGN_ID }],
  ]

  for (const [dimension, changedScope] of scopeChanges) {
    assert.equal(
      await repository.getAliyunRdsVoiceCoachTextSessionWithClient(client, {
        sessionId: created.session.id,
        ...changedScope,
      }),
      null,
      `${dimension} change must hide detail`,
    )
    assert.deepEqual(
      await repository.listAliyunRdsVoiceCoachTextSessionHistoryWithClient(client, {
        limit: 5,
        ...changedScope,
      }),
      [],
      `${dimension} change must hide history`,
    )
    await assert.rejects(
      repository.appendAliyunRdsVoiceCoachTextReplyWithClient(client, {
        replyText: "不应写入",
        sessionId: created.session.id,
        ...changedScope,
      }),
      /voice_coach_rds_session_not_found/,
      `${dimension} change must block append`,
    )
    await assert.rejects(
      repository.endAliyunRdsVoiceCoachTextSessionWithClient(client, {
        dimensionScores: [],
        report: { status: "must_not_persist" },
        sessionId: created.session.id,
        totalScore: 0,
        ...changedScope,
      }),
      /voice_coach_rds_session_end_failed/,
      `${dimension} change must block end`,
    )
    assert.equal(created.session.status, "active", `${dimension} change must not end the original session`)
    assert.equal(created.session.report_json, null, `${dimension} change must not write the original report`)
  }

  const endQueries = client.queries.filter((query) => query.text.startsWith("update public.voice_coach_sessions"))
  assert.equal(endQueries.length, scopeChanges.length)
  for (const query of endQueries) {
    assert.match(query.text, /company_id = \$3 and store_id = \$4 and membership_id = \$5/)
  }

  client.sessions.push({
    ...created.session,
    id: FOREIGN_ID,
    company_id: null,
    store_id: null,
    membership_id: null,
  })
  assert.equal(
    await repository.getAliyunRdsVoiceCoachTextSessionWithClient(client, {
      sessionId: FOREIGN_ID,
      ...SESSION_SCOPE,
    }),
    null,
  )
})

test("VC-L4-04 RDS repository rejects foreign customer and scene selections", async () => {
  const repository = compileRepository()

  await assert.rejects(
    repository.createAliyunRdsVoiceCoachTextSessionWithClient(
      new FakeVoiceCoachRdsClient(),
      createArgs({ customerProfileId: FOREIGN_ID }),
    ),
    /voice_coach_rds_customer_profile_not_found/,
  )
  await assert.rejects(
    repository.createAliyunRdsVoiceCoachTextSessionWithClient(
      new FakeVoiceCoachRdsClient(),
      createArgs({ sceneCardId: FOREIGN_ID }),
    ),
    /voice_coach_rds_scene_card_not_found/,
  )
})

test("VC-L4-04 RDS repository contract remains separate from local JSON durable store", () => {
  const source = fs.readFileSync(repositoryPath, "utf8")
  assert.doesNotMatch(source, /APP_VOICE_COACH_LOCAL_DURABLE_STORE_PATH/)
  assert.doesNotMatch(source, /readFileSync|writeFileSync|renameSync|mkdirSync/)
  assert.match(source, /withAliyunRdsTransaction/)
  assert.match(source, /public\.voice_coach_sessions/)
  assert.match(source, /public\.voice_coach_turns/)
})
