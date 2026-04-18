const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

const root = path.resolve(__dirname, "..")
const tsModuleCache = new Map()

function resolveLocalModule(parentFile, specifier) {
  const basePath = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(parentFile), specifier)

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.js"),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function loadTsModule(filePath) {
  const normalizedPath = path.resolve(filePath)
  if (tsModuleCache.has(normalizedPath)) return tsModuleCache.get(normalizedPath)

  const source = fs.readFileSync(normalizedPath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: normalizedPath,
  })

  const module = { exports: {} }
  tsModuleCache.set(normalizedPath, module.exports)

  const localRequire = (specifier) => {
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const resolved = resolveLocalModule(normalizedPath, specifier)
      if (!resolved) {
        throw new Error(`Cannot resolve local module '${specifier}' from ${normalizedPath}`)
      }
      return loadTsModule(resolved)
    }
    return require(specifier)
  }

  const wrapped = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) { ${transpiled.outputText}\n})`,
    { filename: normalizedPath },
  )
  wrapped(module.exports, localRequire, module, normalizedPath, path.dirname(normalizedPath))
  tsModuleCache.set(normalizedPath, module.exports)
  return module.exports
}

const { generateVoiceCoachReport } = loadTsModule(path.join(root, "lib", "voice-coach", "report.server.ts"))
const { refreshVoiceCoachReport } = loadTsModule(path.join(root, "lib", "voice-coach", "report-refresh.ts"))
const { buildVoiceCoachSessionSnapshot } = loadTsModule(
  path.join(root, "lib", "voice-coach", "session-context.ts"),
)
const { getScenario } = loadTsModule(path.join(root, "lib", "voice-coach", "scenarios.ts"))
const { normalizeScenarioTag } = loadTsModule(path.join(root, "lib", "voice-coach", "tag-utils.ts"))

function createTurn(overrides) {
  return {
    id: overrides.id,
    role: overrides.role,
    text: overrides.text || "",
    emotion: overrides.emotion || null,
    audio_path: overrides.audio_path || null,
    audio_seconds: overrides.audio_seconds ?? null,
    asr_confidence: overrides.asr_confidence ?? null,
    analysis_json: overrides.analysis_json || null,
    features_json: overrides.features_json || {},
    turn_index: overrides.turn_index,
  }
}

function createAnalysis(scores, extra = {}) {
  return {
    suggestions: ["先接住顾虑", "补一条证据", "再给下一步动作"],
    polished:
      "我理解你现在最在意的是安全和效果，所以我先把和你情况最相关的一条证据说明白，再告诉你可以怎么低风险地继续了解。",
    persuasion_score: scores.persuasion,
    organization_score: scores.organization,
    per_turn_scores: scores,
    ...extra,
  }
}

test("report uses the lowest-persuasion analyzed turn as the representative case", () => {
  const scenario = getScenario("objection_safety")
  const turns = [
    createTurn({
      id: "c-1",
      role: "customer",
      text: "我最担心这类护理会不会有安全隐患。",
      features_json: { tag: "安全顾虑" },
      turn_index: 0,
    }),
    createTurn({
      id: "b-1",
      role: "beautician",
      text: "我们做得很多，你先放心。",
      audio_path: "audio/b-1.mp3",
      audio_seconds: 5,
      analysis_json: createAnalysis({
        persuasion: 84,
        fluency: 78,
        expression: 74,
        pronunciation: 76,
        organization: 80,
      }),
      turn_index: 1,
    }),
    createTurn({
      id: "c-2",
      role: "customer",
      text: "你先别讲概念，我想知道有没有真实案例。",
      features_json: { tag: "案例要求" },
      turn_index: 2,
    }),
    createTurn({
      id: "b-2",
      role: "beautician",
      text: "案例之后再看，我们先做就知道了。",
      audio_path: "audio/b-2.mp3",
      audio_seconds: 6,
      analysis_json: createAnalysis({
        persuasion: 49,
        fluency: 72,
        expression: 68,
        pronunciation: 75,
        organization: 61,
      }),
      turn_index: 3,
    }),
  ]

  const report = generateVoiceCoachReport({ scenario, turns })

  assert.equal(report.meta.representative_turn_id, "b-2")
  assert.equal(report.tabs.persuasion.customer_objection, "你先别讲概念，我想知道有没有真实案例。")
  assert.equal(report.tabs.persuasion.your_response, "案例之后再看，我们先做就知道了。")
  assert.match(report.tabs.persuasion.improved_response, /我理解你现在最在意的是|我理解你现在最担心的是/)
  assert.deepEqual(report.tabs.persuasion.tags.sort(), [scenario.seedTopics[2], scenario.seedTopics[3]].sort())
})

test("organization audio examples are ordered by lowest organization score first", () => {
  const scenario = getScenario("objection_safety")
  const turns = [
    createTurn({ id: "c-1", role: "customer", text: "先看案例。", turn_index: 0 }),
    createTurn({
      id: "b-1",
      role: "beautician",
      text: "第一段回答。",
      audio_path: "audio/b-1.mp3",
      audio_seconds: 5,
      analysis_json: createAnalysis({
        persuasion: 72,
        fluency: 75,
        expression: 73,
        pronunciation: 76,
        organization: 70,
      }),
      turn_index: 1,
    }),
    createTurn({ id: "c-2", role: "customer", text: "那价格呢？", turn_index: 2 }),
    createTurn({
      id: "b-2",
      role: "beautician",
      text: "第二段回答。",
      audio_path: "audio/b-2.mp3",
      audio_seconds: 6,
      analysis_json: createAnalysis({
        persuasion: 60,
        fluency: 70,
        expression: 68,
        pronunciation: 72,
        organization: 42,
      }),
      turn_index: 3,
    }),
    createTurn({ id: "c-3", role: "customer", text: "我还是有点担心。", turn_index: 4 }),
    createTurn({
      id: "b-3",
      role: "beautician",
      text: "第三段回答。",
      audio_path: "audio/b-3.mp3",
      audio_seconds: 7,
      analysis_json: createAnalysis({
        persuasion: 66,
        fluency: 71,
        expression: 67,
        pronunciation: 74,
        organization: 58,
      }),
      turn_index: 5,
    }),
  ]

  const report = generateVoiceCoachReport({ scenario, turns })

  assert.deepEqual(
    report.tabs.organization.audio_examples.map((item) => item.turn_id),
    ["b-2", "b-3", "b-1"],
  )
  assert.deepEqual(report.meta.organization_example_turn_ids, ["b-2", "b-3", "b-1"])
})

test("summary blocks stay in a stable three-part coaching format", () => {
  const scenario = getScenario("objection_safety")
  const turns = [
    createTurn({ id: "c-1", role: "customer", text: "我怕不安全。", turn_index: 0 }),
    createTurn({
      id: "b-1",
      role: "beautician",
      text: "我们会先评估，再按规范操作。",
      audio_path: "audio/b-1.mp3",
      audio_seconds: 5,
      asr_confidence: 0.82,
      analysis_json: createAnalysis({
        persuasion: 82,
        fluency: 79,
        expression: 76,
        pronunciation: 80,
        organization: 78,
      }),
      turn_index: 1,
    }),
  ]

  const report = generateVoiceCoachReport({ scenario, turns })

  assert.equal(report.summary_blocks.length, 3)
  assert.match(report.summary_blocks[0], /^优势：/)
  assert.match(report.summary_blocks[1], /^改进：/)
  assert.match(report.summary_blocks[2], /^下一轮：/)
})

test("report meta marks incomplete analysis and aggregates only analyzed turns", () => {
  const scenario = getScenario("objection_safety")
  const turns = [
    createTurn({ id: "c-1", role: "customer", text: "我怕不安全。", turn_index: 0 }),
    createTurn({
      id: "b-1",
      role: "beautician",
      text: "我们会先评估，再按规范操作。",
      audio_path: "audio/b-1.mp3",
      audio_seconds: 5,
      analysis_json: createAnalysis({
        persuasion: 81,
        fluency: 77,
        expression: 75,
        pronunciation: 74,
        organization: 78,
      }),
      turn_index: 1,
    }),
    createTurn({ id: "c-2", role: "customer", text: "那价格呢？", turn_index: 2 }),
    createTurn({
      id: "b-2",
      role: "beautician",
      text: "价格我们可以再细讲。",
      audio_path: "audio/b-2.mp3",
      audio_seconds: 6,
      turn_index: 3,
    }),
  ]

  const report = generateVoiceCoachReport({ scenario, turns })
  const persuasionDimension = report.dimension.find((item) => item.id === "persuasion")

  assert.equal(report.meta.is_complete, false)
  assert.equal(report.meta.total_beautician_turn_count, 2)
  assert.equal(report.meta.analyzed_beautician_turn_count, 1)
  assert.equal(persuasionDimension.score, 81)
})

test("report becomes snapshot-aware for hit, miss and risk review", () => {
  const scenario = getScenario("objection_safety")
  const sessionSnapshot = buildVoiceCoachSessionSnapshot({
    customerProfile: {
      id: "cp-1",
      name: "测试顾客·林岚",
      age_label: "32岁",
      occupation: "品牌策划",
      personality_tags: ["理性", "爱比较"],
      core_concerns: ["恢复期会不会影响上班", "会不会一直被推销"],
      trust_triggers: ["真实案例", "先做评估"],
      past_experience: "之前在别家被强推过",
      notes: "明天下午到店",
    },
    sceneCard: {
      id: "sc-1",
      name: "测试场景卡·首次到店顾虑",
      scene_kind: "customer_visit",
      service_name: "补水修护护理",
      customer_stage: "首次到店",
      scene_goal: "让顾客先愿意继续了解",
      likely_questions: ["一次大概要多久", "做完恢复期怎么安排"],
      target_objections: ["价格值不值", "会不会被持续推销"],
      must_cover_points: ["先做皮肤评估", "恢复期安排"],
      do_not_say: ["保证一次就见效"],
      notes: "门店新品推广期",
    },
    liveNotes: "明天下午来店，时间比较紧。",
  })

  const turns = [
    createTurn({ id: "c-1", role: "customer", text: "我明天来做之前，想先问清楚。", turn_index: 0 }),
    createTurn({
      id: "b-1",
      role: "beautician",
      text: "我们会先做皮肤评估，再根据你的情况讲恢复期安排，而且保证一次就见效。",
      audio_path: "audio/b-1.mp3",
      audio_seconds: 8,
      analysis_json: createAnalysis({
        persuasion: 72,
        fluency: 74,
        expression: 70,
        pronunciation: 75,
        organization: 71,
      }),
      turn_index: 1,
    }),
  ]

  const report = generateVoiceCoachReport({
    scenario,
    turns,
    sessionSnapshot,
    sessionContext: { live_notes: "明天下午来店，时间比较紧。" },
  })

  assert.ok(report.training_context)
  assert.match(report.training_context.background_summary, /测试顾客·林岚/)
  assert.ok(report.training_context.hit_points.some((item) => item.includes("先做皮肤评估")))
  assert.ok(report.training_context.hit_points.some((item) => item.includes("恢复期安排")))
  assert.ok(report.training_context.missed_points.some((item) => item.includes("价格值不值")))
  assert.ok(report.training_context.risk_points.some((item) => item.includes("禁忌表达")))
  assert.match(report.summary_blocks[2], /价格值不值|禁忌表达|低压力下一步/)
})

test("refreshVoiceCoachReport pumps pending analysis and overwrites stale cached report", async () => {
  const scenario = getScenario("objection_safety")
  let pendingJobs = 1
  let pumpCalls = 0
  let savedPayload = null
  const sessionSnapshot = buildVoiceCoachSessionSnapshot({
    customerProfile: {
      id: "cp-1",
      name: "测试顾客",
      core_concerns: ["恢复期会不会影响上班"],
    },
    sceneCard: {
      id: "sc-1",
      name: "测试场景卡",
      scene_kind: "customer_visit",
      must_cover_points: ["先做皮肤评估"],
    },
    liveNotes: "尽量快一点。",
  })

  const turnsBeforePump = [
    createTurn({ id: "c-1", role: "customer", text: "我怕不安全。", turn_index: 0 }),
    createTurn({
      id: "b-1",
      role: "beautician",
      text: "我们都做过很多次。",
      audio_path: "audio/b-1.mp3",
      audio_seconds: 5,
      turn_index: 1,
    }),
  ]

  const turnsAfterPump = [
    turnsBeforePump[0],
    createTurn({
      ...turnsBeforePump[1],
      analysis_json: createAnalysis({
        persuasion: 76,
        fluency: 72,
        expression: 69,
        pronunciation: 75,
        organization: 66,
      }),
    }),
  ]

  const result = await refreshVoiceCoachReport({
    markEnded: true,
    ops: {
      async fetchSession() {
        return {
          id: "session-1",
          scenario_id: scenario.id,
          status: "active",
          ended_at: null,
          report_json: { total_score: 12 },
          customer_profile_id: "cp-1",
          scene_card_id: "sc-1",
          session_context_json: { live_notes: "尽量快一点。" },
          scenario_snapshot_json: sessionSnapshot,
        }
      },
      async fetchTurns() {
        return pendingJobs > 0 ? turnsBeforePump : turnsAfterPump
      },
      async countPendingAnalysisJobs() {
        return pendingJobs
      },
      async pumpAnalysisJobs() {
        pumpCalls += 1
        pendingJobs = 0
        return 1
      },
      async saveReport(payload) {
        savedPayload = payload
      },
      sleep: async () => {},
    },
  })

  assert.equal(pumpCalls, 1)
  assert.equal(result.pendingAnalysisJobs, 0)
  assert.equal(savedPayload.status, "ended")
  assert.equal(typeof savedPayload.endedAt, "string")
  assert.ok(savedPayload.report.total_score > 12)
  assert.equal(savedPayload.report.meta.is_complete, true)
  assert.ok(savedPayload.report.training_context)
})

test("normalizeScenarioTag collapses free-form tags into allowed scenario topics", () => {
  const scenario = getScenario("objection_safety")

  assert.equal(normalizeScenarioTag("安全顾虑", scenario), scenario.seedTopics[2])
  assert.equal(normalizeScenarioTag("案例要求", scenario), scenario.seedTopics[3])
  assert.equal(normalizeScenarioTag("价格怀疑", scenario), scenario.seedTopics[1])
  assert.equal(normalizeScenarioTag("敏感体质", scenario), scenario.seedTopics[7])
})
