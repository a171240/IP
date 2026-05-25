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

  const moduleRef = { exports: {} }
  tsModuleCache.set(normalizedPath, moduleRef.exports)

  const localRequire = (specifier) => {
    if (specifier === "server-only") return {}
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
  wrapped(moduleRef.exports, localRequire, moduleRef, normalizedPath, path.dirname(normalizedPath))
  tsModuleCache.set(normalizedPath, moduleRef.exports)
  return moduleRef.exports
}

class MockQuery {
  constructor(state, tableName) {
    this.state = state
    this.tableName = tableName
    this.filters = []
    this.sort = null
    this.operation = "select"
    this.payload = null
    this.options = {}
  }

  select() {
    if (!this.operation) this.operation = "select"
    return this
  }

  eq(column, value) {
    this.filters.push({ column, value })
    return this
  }

  order(column, options) {
    this.sort = { column, ascending: options && options.ascending !== false }
    return this
  }

  upsert(payload, options) {
    this.operation = "upsert"
    this.payload = payload
    this.options = options || {}
    return this
  }

  update(payload) {
    this.operation = "update"
    this.payload = payload
    return this
  }

  maybeSingle() {
    return this.execute().then((result) => ({
      data: Array.isArray(result.data) ? (result.data[0] || null) : result.data,
      error: result.error || null,
    }))
  }

  single() {
    return this.execute().then((result) => ({
      data: Array.isArray(result.data) ? (result.data[0] || null) : result.data,
      error: result.error || null,
    }))
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  table() {
    if (!this.state[this.tableName]) this.state[this.tableName] = []
    return this.state[this.tableName]
  }

  matches(row) {
    return this.filters.every((filter) => row[filter.column] === filter.value)
  }

  applySort(rows) {
    if (!this.sort) return rows
    const { column, ascending } = this.sort
    return rows.slice().sort((left, right) => {
      if (left[column] === right[column]) return 0
      if (left[column] === null || typeof left[column] === "undefined") return ascending ? -1 : 1
      if (right[column] === null || typeof right[column] === "undefined") return ascending ? 1 : -1
      return left[column] < right[column] ? (ascending ? -1 : 1) : (ascending ? 1 : -1)
    })
  }

  conflictColumns(row) {
    const conflict = String(this.options.onConflict || "").trim()
    if (conflict) return conflict.split(",").map((item) => item.trim()).filter(Boolean)
    if (row.id) return ["id"]
    if (row.session_id) return ["session_id"]
    return []
  }

  upsertOne(row) {
    const table = this.table()
    const next = { ...row }
    if (!next.id && this.tableName !== "voice_training_tasks") {
      next.id = `${this.tableName}_${table.length + 1}`
    }
    const columns = this.conflictColumns(next)
    const existing = columns.length
      ? table.find((candidate) => columns.every((column) => candidate[column] === next[column]))
      : null
    if (existing) {
      Object.assign(existing, next)
      return existing
    }
    table.push(next)
    return next
  }

  async execute() {
    if (this.operation === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload]
      return { data: rows.map((row) => this.upsertOne(row)), error: null }
    }

    if (this.operation === "update") {
      const updated = this.table().filter((row) => this.matches(row))
      updated.forEach((row) => Object.assign(row, this.payload))
      return { data: updated, error: null }
    }

    return {
      data: this.applySort(this.table().filter((row) => this.matches(row))),
      error: null,
    }
  }
}

function createMockAdmin(initialState = {}) {
  const state = {
    profiles: [],
    mp_account_memberships: [],
    mp_companies: [],
    mp_stores: [],
    voice_training_packs: [],
    voice_training_tasks: [],
    voice_training_session_links: [],
    voice_training_progress: [],
    voice_training_rewards: [],
    ...initialState,
  }
  return {
    from(tableName) {
      return new MockQuery(state, tableName)
    },
    rows(tableName) {
      return state[tableName] || []
    },
  }
}

const training = loadTsModule(path.join(root, "lib", "voice-training", "baibaitu.server.ts"))

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8")
}

test("Baibaitu mp API routes keep the required auth, access, and persistence contracts", () => {
  const homeRoute = read("app/api/mp/voice-coach/training-home/route.ts")
  const progressRoute = read("app/api/mp/voice-coach/training-progress/route.ts")
  const startRoute = read("app/api/mp/voice-coach/training-tasks/[taskId]/start/route.ts")
  const completeRoute = read("app/api/mp/voice-coach/training-sessions/[sessionId]/complete/route.ts")
  const sessionRoute = read("app/api/voice-coach/sessions/route.ts")

  assert.match(homeRoute, /resolveMpAccountContext/)
  assert.match(homeRoute, /resolveBaibaituTrainingAccess/)
  assert.match(homeRoute, /loadBaibaituTrainingDashboard/)
  assert.match(progressRoute, /resolveBaibaituTrainingAccess/)
  assert.match(progressRoute, /loadBaibaituTrainingDashboard/)
  assert.match(startRoute, /buildBaibaituTaskSetup/)
  assert.match(startRoute, /task_locked/)
  assert.match(completeRoute, /buildBaibaituTrainingResult/)
  assert.match(completeRoute, /saveBaibaituTrainingResult/)
  assert.match(completeRoute, /loadBaibaituTrainingDashboard/)
  assert.match(sessionRoute, /training_task_id/)
  assert.match(sessionRoute, /resolveBaibaituTrainingAccess/)
  assert.match(sessionRoute, /linkBaibaituVoiceSession/)
  assert.match(sessionRoute, /training_task:\s*trainingTaskContext/)
})

test("Baibaitu task start setup carries server-owned training context", () => {
  const task = training.findBaibaituTrainingTask("day1_brand_intro")
  const setup = training.buildBaibaituTaskSetup(task)

  assert.equal(setup.training_brand_code, training.BAIBAITU_BRAND_CODE)
  assert.equal(setup.training_pack_id, training.BAIBAITU_PACK_ID)
  assert.equal(setup.training_task_id, "day1_brand_intro")
  assert.equal(setup.training_context.task_id, "day1_brand_intro")
  assert.match(setup.live_notes, /白白兔训练任务：品牌文化入职/)
  assert.deepEqual(setup.training_task_preview.pass_goals, task.passGoals.slice(0, 3))
})

test("Baibaitu access can be granted by env, profile feature flags, or company brand", async () => {
  const originalAllowlist = process.env.BAIBAITU_TRAINING_USER_IDS
  process.env.BAIBAITU_TRAINING_USER_IDS = "user-env"

  try {
    const envAccess = await training.resolveBaibaituTrainingAccess({
      admin: createMockAdmin(),
      ctx: { companyId: null, storeId: null, membershipId: null },
      user: { id: "user-env", email: "env@example.com" },
    })
    assert.equal(envAccess.enabled, true)
    assert.equal(envAccess.source, "env_user")
  } finally {
    if (typeof originalAllowlist === "undefined") delete process.env.BAIBAITU_TRAINING_USER_IDS
    else process.env.BAIBAITU_TRAINING_USER_IDS = originalAllowlist
  }

  const profileAccess = await training.resolveBaibaituTrainingAccess({
    admin: createMockAdmin({
      profiles: [{ id: "user-profile", brand_code: "", feature_flags: ["baibaitu_training"] }],
    }),
    ctx: { companyId: null, storeId: null, membershipId: null },
    user: { id: "user-profile", email: "profile@example.com" },
  })
  assert.equal(profileAccess.enabled, true)
  assert.equal(profileAccess.source, "profile")

  const companyAccess = await training.resolveBaibaituTrainingAccess({
    admin: createMockAdmin({
      mp_companies: [{ id: "company-a", brand_code: "baibaitu", metadata: {} }],
    }),
    ctx: { companyId: "company-a", storeId: null, membershipId: null },
    user: { id: "user-company", email: "company@example.com" },
  })
  assert.equal(companyAccess.enabled, true)
  assert.equal(companyAccess.source, "company")
})

test("Baibaitu complete flow persists progress, stars, and all reward types", async () => {
  const admin = createMockAdmin()
  const ctx = { companyId: "company-a", storeId: "store-a", membershipId: "membership-a" }
  const user = { id: "staff-a", email: "staff@example.com" }
  const task = training.findBaibaituTrainingTask("day1_brand_intro")
  const sessionId = "session-a"

  await training.linkBaibaituVoiceSession({ admin, ctx, user, sessionId, taskId: task.id })

  const result = training.buildBaibaituTrainingResult({
    task,
    sessionId,
    report: { total_score: 86, summary_blocks: ["优势：表达清楚。"] },
    turns: [
      {
        role: "beautician",
        text: "我们会先看您现在的肤况，再判断适合做哪一类护理，不急着直接推项目。",
      },
    ],
  })

  assert.equal(result.stars, 3)
  assert.equal(result.passed, true)
  assert.equal(result.eggUnlocked, true)

  const saved = await training.saveBaibaituTrainingResult({ admin, ctx, user, sessionId, task, result })
  const progressRows = admin.rows("voice_training_progress")
  const linkRows = admin.rows("voice_training_session_links")
  const rewardRows = admin.rows("voice_training_rewards")

  assert.equal(progressRows.length, 1)
  assert.equal(progressRows[0].completed_task_count, 1)
  assert.equal(progressRows[0].stars_total, 3)
  assert.equal(progressRows[0].reward_count, 4)
  assert.equal(progressRows[0].progress_json.completed_task_ids.day1_brand_intro, true)
  assert.equal(progressRows[0].progress_json.rewards.easter_eggs.day1_brand_intro, true)
  assert.equal(linkRows[0].status, "completed")
  assert.deepEqual(
    rewardRows.map((row) => row.reward_type).sort(),
    ["badge", "easter_egg", "gold_line", "hidden_customer"],
  )
  assert.deepEqual(
    saved.rewards.map((item) => item.type).sort(),
    ["彩蛋", "徽章", "金句", "隐藏顾客"].sort(),
  )

  const dashboard = await training.loadBaibaituTrainingDashboard({ admin, ctx, user })
  assert.equal(dashboard.completedCount, 1)
  assert.equal(dashboard.currentTask.id, "day2_clean_pores")
  assert.equal(dashboard.rewardCount, 4)
  assert.equal(dashboard.rewards.some((item) => item.type === "彩蛋"), true)
})
