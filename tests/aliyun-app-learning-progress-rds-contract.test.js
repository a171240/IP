/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "learning-progress.server.ts")
const schemaPath = path.join(root, "deploy", "aliyun-production-cn.app-learning-progress-schema.sql")

function compileRepository(database) {
  const source = fs.readFileSync(repositoryPath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: repositoryPath,
  }).outputText

  const compiledModule = new Module(repositoryPath, module)
  compiledModule.filename = repositoryPath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(repositoryPath))
  compiledModule.require = (moduleId) => {
    if (moduleId === "server-only") return {}
    if (moduleId === "@/lib/aliyun-rds/postgres.server") {
      return {
        queryAliyunRds: (text, values) => database.query(text, values),
        withAliyunRdsTransaction: (fn) => database.withTransaction(fn),
      }
    }
    return require(moduleId)
  }
  compiledModule._compile(compiled, repositoryPath)
  return compiledModule.exports
}

class FakeLearningProgressRds {
  constructor() {
    this.events = []
    this.queries = []
    this.transactionCount = 0
  }

  async withTransaction(fn) {
    this.transactionCount += 1
    return fn({
      query: (text, values) => this.query(text, values),
    })
  }

  resetTelemetry() {
    this.queries.length = 0
    this.transactionCount = 0
  }

  async query(text, values = []) {
    const sql = normalizeSql(text)
    this.queries.push({ sql, values })

    if (sql.startsWith("insert into public.app_learning_progress_events")) {
      const uniqueKey = values.slice(1, 6).join(":")
      const existing = this.events.find((event) => event.unique_key === uniqueKey)
      if (existing) return { rows: [] }

      const row = {
        id: values[0],
        company_id: values[1],
        store_id: values[2],
        membership_id: values[3],
        user_id: values[4],
        client_event_id: values[5],
        module: values[6],
        entity_type: values[7],
        entity_id: values[8],
        action: values[9],
        occurred_at: values[10],
        metadata: JSON.parse(values[11]),
        received_at: "2026-07-11T08:00:00.000Z",
        unique_key: uniqueKey,
      }
      this.events.push(row)
      return { rows: [row] }
    }

    if (sql.includes("from public.app_learning_progress_events") && sql.includes("client_event_id = $5")) {
      return {
        rows: this.events.filter((event) =>
          event.company_id === values[0] &&
          event.store_id === values[1] &&
          event.membership_id === values[2] &&
          event.user_id === values[3] &&
          event.client_event_id === values[4]),
      }
    }

    if (sql.includes("from public.app_learning_progress_events") && sql.includes("module = any($5::text[])")) {
      return {
        rows: this.events.filter((event) =>
          event.company_id === values[0] &&
          event.store_id === values[1] &&
          event.membership_id === values[2] &&
          event.user_id === values[3] &&
          values[4].includes(event.module)),
      }
    }

    throw new Error(`unexpected_sql:${sql}`)
  }
}

function normalizeSql(text) {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase()
}

function scope(overrides = {}) {
  return {
    companyId: "11111111-1111-4111-8111-111111111111",
    storeId: "22222222-2222-4222-8222-222222222222",
    membershipId: "33333333-3333-4333-8333-333333333333",
    role: "employee",
    userId: "44444444-4444-4444-8444-444444444444",
    ...overrides,
  }
}

function event(overrides = {}) {
  return {
    action: "viewed",
    client_event_id: "client-viewed-1",
    entity_id: "skin-system-s00-01",
    entity_type: "professional_lesson",
    metadata: { source: "professional.lesson" },
    module: "professional",
    occurred_at: "2026-07-11T07:59:00.000Z",
    ...overrides,
  }
}

test("G2 learning progress persists viewed and practiced events across repository instances with scoped idempotency", async () => {
  const database = new FakeLearningProgressRds()
  const firstRepositoryInstance = compileRepository(database)
  const secondRepositoryInstance = compileRepository(database)
  const employeeScope = scope()

  const viewed = await firstRepositoryInstance.applyLearningProgressEvent(employeeScope, event())
  assert.equal(viewed.ok, true)
  assert.equal(viewed.event.deduped, false)

  const viewedRetry = await secondRepositoryInstance.applyLearningProgressEvent(employeeScope, event())
  assert.equal(viewedRetry.ok, true)
  assert.equal(viewedRetry.event.deduped, true)
  assert.equal(viewedRetry.event.server_event_id, viewed.event.server_event_id)

  const practiced = await secondRepositoryInstance.applyLearningProgressEvent(employeeScope, event({
    action: "practiced",
    client_event_id: "client-practiced-1",
    occurred_at: "2026-07-11T08:01:00.000Z",
  }))
  assert.equal(practiced.ok, true)
  assert.equal(practiced.event.deduped, false)

  const syncRetry = await firstRepositoryInstance.syncLearningProgressEvents(employeeScope, {
    client_sync_id: "sync-retry-1",
    events: [event({
      action: "practiced",
      client_event_id: "client-practiced-1",
      occurred_at: "2026-07-11T08:01:00.000Z",
    })],
  })
  assert.equal(syncRetry.ok, true)
  assert.deepEqual(syncRetry.accepted_event_ids, ["client-practiced-1"])
  assert.deepEqual(syncRetry.rejected_events, [])
  assert.equal(syncRetry.repository_mode, "aliyun_rds_event_store")

  const progressFromFirstInstance = await firstRepositoryInstance.listLearningProgress({
    includeEntities: true,
    modules: ["professional"],
    scope: employeeScope,
  })
  assert.equal(progressFromFirstInstance.repository_mode, "aliyun_rds_event_store")
  assert.equal(progressFromFirstInstance.entities.length, 1)
  assert.deepEqual(progressFromFirstInstance.entities[0], {
    entity_id: "skin-system-s00-01",
    entity_type: "professional_lesson",
    group_id: undefined,
    module: "professional",
    path_id: "skin-physiology",
    practice_count: 1,
    practiced_at: "2026-07-11T08:01:00.000Z",
    sync_state: "server",
    total_page_count: undefined,
    view_count: 1,
    viewed_at: "2026-07-11T07:59:00.000Z",
    viewed_page_count: undefined,
  })

  const otherUserProgress = await secondRepositoryInstance.listLearningProgress({
    includeEntities: true,
    modules: ["professional"],
    scope: scope({
      membershipId: "55555555-5555-4555-8555-555555555555",
      userId: "66666666-6666-4666-8666-666666666666",
    }),
  })
  assert.deepEqual(otherUserProgress.entities, [])

  const otherStoreWrite = await secondRepositoryInstance.applyLearningProgressEvent(scope({
    storeId: "77777777-7777-4777-8777-777777777777",
    membershipId: "88888888-8888-4888-8888-888888888888",
    userId: "99999999-9999-4999-8999-999999999999",
  }), event())
  assert.equal(otherStoreWrite.ok, true)
  assert.equal(otherStoreWrite.event.deduped, false)

  assert.equal(database.events.length, 3)
  assert.match(database.queries.map((query) => query.sql).join("\n"), /insert into public\.app_learning_progress_events/)
})

test("G2 learning progress rejects reused client_event_id when any normalized payload field changes", async () => {
  const database = new FakeLearningProgressRds()
  const repository = compileRepository(database)
  const employeeScope = scope()
  const original = event({
    metadata: { nested: { alpha: 1, beta: 2 }, source: "professional.lesson" },
    occurred_at: "2026-07-11T07:59:00Z",
  })

  const created = await repository.applyLearningProgressEvent(employeeScope, original)
  assert.equal(created.ok, true)

  const equivalentMetadataOrder = await repository.applyLearningProgressEvent(employeeScope, event({
    metadata: { source: "professional.lesson", nested: { beta: 2, alpha: 1 } },
    occurred_at: "2026-07-11T07:59:00.000Z",
  }))
  assert.equal(equivalentMetadataOrder.ok, true)
  assert.equal(equivalentMetadataOrder.event.deduped, true)

  const conflicts = [
    { ...original, module: "speech", entity_type: "speech_card", entity_id: "A01" },
    { ...original, entity_id: "skin-system-s00-02" },
    { ...original, action: "practiced" },
    { ...original, occurred_at: "2026-07-11T08:00:00.000Z" },
    { ...original, metadata: { source: "changed" } },
  ]
  for (const conflictingPayload of conflicts) {
    const result = await repository.applyLearningProgressEvent(employeeScope, conflictingPayload)
    assert.deepEqual(result, {
      ok: false,
      code: "learning_event_id_conflict",
      message: "client_event_id is already bound to a different learning event",
      status: 409,
    })
  }

  assert.equal(database.events.length, 1)
})

test("G2 learning progress rejects client_event_id longer than 220 characters instead of truncating it", async () => {
  const database = new FakeLearningProgressRds()
  const repository = compileRepository(database)

  const result = await repository.applyLearningProgressEvent(scope(), event({
    client_event_id: "x".repeat(221),
  }))

  assert.deepEqual(result, {
    ok: false,
    code: "invalid_learning_event",
    message: "client_event_id must be between 1 and 220 characters",
    status: 422,
  })
  assert.equal(database.transactionCount, 0)
  assert.equal(database.events.length, 0)

  const syncResult = await repository.syncLearningProgressEvents(scope(), {
    client_sync_id: "sync-long-id-1",
    events: [event({ client_event_id: "x".repeat(221) })],
  })
  assert.deepEqual(syncResult.rejected_events, [{
    client_event_id: null,
    code: "invalid_learning_event",
    message: "client_event_id must be between 1 and 220 characters",
  }])
  assert.equal(database.events.length, 0)
})

test("G2 learning progress concurrent identical retries persist once and return one deduped result", async () => {
  const database = new FakeLearningProgressRds()
  const repository = compileRepository(database)

  const results = await Promise.all([
    repository.applyLearningProgressEvent(scope(), event()),
    repository.applyLearningProgressEvent(scope(), event()),
  ])

  assert.deepEqual(results.map((result) => result.ok && result.event.deduped).sort(), [false, true])
  assert.equal(database.transactionCount, 2)
  assert.equal(database.events.length, 1)
})

test("G2 learning progress sync uses one transaction and one final history query for multiple events", async () => {
  const database = new FakeLearningProgressRds()
  const repository = compileRepository(database)

  const result = await repository.syncLearningProgressEvents(scope(), {
    client_sync_id: "sync-batch-1",
    events: [
      event(),
      event({
        action: "practiced",
        client_event_id: "client-practiced-1",
        occurred_at: "2026-07-11T08:01:00.000Z",
      }),
    ],
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.accepted_event_ids, ["client-viewed-1", "client-practiced-1"])
  assert.deepEqual(result.rejected_events, [])
  assert.equal(database.transactionCount, 1)
  assert.equal(database.queries.filter((query) => query.sql.includes("module = any($5::text[])")).length, 1)
  assert.equal(database.events.length, 2)
})

test("G2 learning progress sync rejects a conflicting id while accepting the rest in one transaction", async () => {
  const database = new FakeLearningProgressRds()
  const repository = compileRepository(database)
  await repository.applyLearningProgressEvent(scope(), event())
  database.resetTelemetry()

  const result = await repository.syncLearningProgressEvents(scope(), {
    client_sync_id: "sync-conflict-1",
    events: [
      event({ action: "practiced" }),
      event({
        action: "practiced",
        client_event_id: "client-practiced-1",
        occurred_at: "2026-07-11T08:01:00.000Z",
      }),
    ],
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.accepted_event_ids, ["client-practiced-1"])
  assert.deepEqual(result.rejected_events, [{
    client_event_id: "client-viewed-1",
    code: "learning_event_id_conflict",
    message: "client_event_id is already bound to a different learning event",
  }])
  assert.equal(database.transactionCount, 1)
  assert.equal(database.queries.filter((query) => query.sql.includes("module = any($5::text[])")).length, 1)
  assert.equal(database.events.length, 2)
})

test("G2 learning progress keeps role, binding, and cross-store scope failures at 403 before RDS access", () => {
  const repository = compileRepository(new FakeLearningProgressRds())
  const baseContext = {
    companyId: "company-a",
    storeId: "store-a",
    membershipId: "membership-a",
    role: "employee",
    userId: "user-a",
    memberships: [],
    isPlatformAdmin: false,
    isCompanyManager: false,
    isStoreManager: false,
  }

  assert.deepEqual(repository.resolveLearningProgressTenantScope(baseContext), {
    ok: true,
    scope: {
      companyId: "company-a",
      storeId: "store-a",
      membershipId: "membership-a",
      role: "employee",
      userId: "user-a",
    },
  })
  assert.deepEqual(repository.resolveLearningProgressTenantScope({ ...baseContext, role: "customer" }), {
    ok: false,
    code: "role_denied",
    message: "Role is not allowed to access learning progress",
    status: 403,
  })
  assert.equal(repository.resolveLearningProgressTenantScope({
    ...baseContext,
    companyId: "",
    membershipId: "",
    storeId: "",
  }).status, 403)
  assert.deepEqual(repository.resolveLearningProgressTenantScope(baseContext, "store-b"), {
    ok: false,
    code: "tenant_forbidden",
    message: "Store is outside the current account scope",
    status: 403,
  })
})

test("G2 learning progress schema contract is event-only and missing-schema detection is table-scoped", () => {
  const repository = compileRepository(new FakeLearningProgressRds())
  const schema = fs.readFileSync(schemaPath, "utf8")

  assert.match(schema, /create table if not exists public\.app_learning_progress_events/i)
  assert.match(schema, /unique \(company_id, store_id, membership_id, user_id, client_event_id\)/i)
  assert.match(schema, /check \(module in \('professional', 'speech'\)\)/i)
  assert.match(schema, /check \(action in \('viewed', 'practiced'\)\)/i)
  assert.match(schema, /app_learning_progress_events_scope_module_occurred_idx/i)
  assert.doesNotMatch(schema, /insert\s+into|DATABASE_URL_CN|token/i)

  assert.equal(repository.learningProgressSchemaMissing({
    code: "42P01",
    message: 'relation "public.app_learning_progress_events" does not exist',
  }), true)
  assert.equal(repository.learningProgressSchemaMissing({
    code: "42P01",
    message: 'relation "public.some_other_table" does not exist',
  }), false)
})
