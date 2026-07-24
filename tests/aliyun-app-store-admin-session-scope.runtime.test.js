/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "store-admin.server.ts")
const authorizationPath = path.join(root, "lib", "aliyun-rds", "app-authorization.server.ts")
const RAW_MARKER = "raw-store-admin-marker:tenant:session:secret"

let cachedAuthorization = null

function compileTsModule(filePath, stubs) {
  assert.equal(fs.existsSync(filePath), true, `${path.relative(root, filePath)} must exist`)
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

class FakeNextResponse {
  constructor(body, init = {}) {
    this.body = body
    this.status = init.status ?? 200
  }

  static json(body, init = {}) {
    return new FakeNextResponse(body, init)
  }
}

class AliyunRdsConfigurationError extends Error {}

function sqlHarnessError(code) {
  return new Error(`sql_harness_invalid_sql:${code}`)
}

function compactSql(sql) {
  return String(sql).replace(/[ \t\r\n]+/g, " ").trim()
}

function queryShape(name, table, parameterCount, sql, details = {}) {
  return {
    ...details,
    name,
    parameterCount,
    table,
    text: compactSql(sql),
  }
}

const storeQueryShapes = [
  queryShape("stores_company", "mp_stores", 1, `
    select id, company_id, name, status, created_at, updated_at
    from public.mp_stores
    where company_id = $1 and status = 'active'
    order by created_at asc
    limit 500
  `, { storeParameterIndexes: [] }),
  queryShape("stores_store", "mp_stores", 2, `
    select id, company_id, name, status, created_at, updated_at
    from public.mp_stores
    where company_id = $1 and status = 'active' and id = $2
    order by created_at asc
    limit 500
  `, { storeParameterIndexes: [1] }),
]

const membershipSelect = "select id, user_id, company_id, store_id, role, status, display_name, accepted_at, last_seen_at, created_at"
const membershipQueryShapes = [true, false].flatMap((activeOnly) => {
  const activeClause = activeOnly ? " and status = 'active'" : ""
  const statusLabel = activeOnly ? "active" : "all"
  return [
    queryShape(`memberships_company_${statusLabel}`, "mp_account_memberships", 2, `
      ${membershipSelect}
      from public.mp_account_memberships
      where company_id = $1${activeClause}
        and (store_id is null or store_id = any($2::uuid[]))
      order by created_at desc
      limit 2000
    `, { activeOnly, arrayParameterIndexes: [1], strictStoreScope: false }),
    queryShape(`memberships_store_${statusLabel}`, "mp_account_memberships", 2, `
      ${membershipSelect}
      from public.mp_account_memberships
      where company_id = $1${activeClause}
        and store_id = any($2::uuid[])
      order by created_at desc
      limit 2000
    `, { activeOnly, arrayParameterIndexes: [1], strictStoreScope: true }),
  ]
})

const profileQueryShapes = [
  queryShape("profiles_basic", "profiles", 1, `
    select id, nickname, avatar_url, email
    from public.profiles
    where id = any($1::uuid[])
  `, { arrayParameterIndexes: [0] }),
  queryShape("profiles_billing", "profiles", 1, `
    select id, nickname, avatar_url, email, credits_balance, credits_unlimited, service_plan_label, account_role
    from public.profiles
    where id = any($1::uuid[])
  `, { arrayParameterIndexes: [0] }),
]

const sessionSelect = `
  select
    id, user_id, company_id, store_id, membership_id, scenario_id, status, started_at, ended_at, created_at,
    total_score, report_json, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json
`
const sessionQueryShapes = [1000, 5000].flatMap((limit) => [
  queryShape(`sessions_company_${limit}`, "voice_coach_sessions", 4, `
    ${sessionSelect}
    from public.voice_coach_sessions
    where user_id = any($1::uuid[]) and company_id = $2 and data_domain = 'store' and started_at >= $3
      and (store_id is null or store_id = any($4::uuid[]))
    order by started_at desc
    limit ${limit}
  `, { arrayParameterIndexes: [0, 3], limit, strictStoreScope: false }),
  queryShape(`sessions_store_${limit}`, "voice_coach_sessions", 4, `
    ${sessionSelect}
    from public.voice_coach_sessions
    where user_id = any($1::uuid[]) and company_id = $2 and data_domain = 'store' and started_at >= $3
      and store_id = any($4::uuid[])
    order by started_at desc
    limit ${limit}
  `, { arrayParameterIndexes: [0, 3], limit, strictStoreScope: true }),
])

const turnQueryShapes = [
  queryShape("turns_all", "voice_coach_turns", 1, `
    select session_id, role, text, audio_seconds, turn_index, created_at
    from public.voice_coach_turns
    where session_id = any($1::uuid[])
    limit 15000
  `, { arrayParameterIndexes: [0], limit: 15000, onlyBeautician: false }),
  queryShape("turns_beautician", "voice_coach_turns", 1, `
    select session_id, role, text, audio_seconds, turn_index, created_at
    from public.voice_coach_turns
    where session_id = any($1::uuid[]) and role = 'beautician'
    limit 3000
  `, { arrayParameterIndexes: [0], limit: 3000, onlyBeautician: true }),
]

const ledgerSelect = "select id, user_id, company_id, store_id, action_code, action_title, page_path, delta, balance_after, status, reason, created_at"
const ledgerQueryShapes = [
  queryShape("ledger_company", "mp_ai_point_ledger", 3, `
    ${ledgerSelect}
    from public.mp_ai_point_ledger
    where company_id = $1 and created_at >= $2
      and (store_id is null or store_id = any($3::uuid[]))
    order by created_at desc
    limit 2000
  `, { arrayParameterIndexes: [2], strictStoreScope: false }),
  queryShape("ledger_store", "mp_ai_point_ledger", 3, `
    ${ledgerSelect}
    from public.mp_ai_point_ledger
    where company_id = $1 and created_at >= $2 and store_id = any($3::uuid[])
    order by created_at desc
    limit 2000
  `, { arrayParameterIndexes: [2], strictStoreScope: true }),
]

const reachableQueryShapes = [
  ...storeQueryShapes,
  ...membershipQueryShapes,
  ...profileQueryShapes,
  ...sessionQueryShapes,
  ...turnQueryShapes,
  ...ledgerQueryShapes,
]

function structuredExecutableQuery(sql, params = []) {
  const text = compactSql(sql)
  const shape = reachableQueryShapes.find(
    (candidate) =>
      candidate.text === text &&
      candidate.parameterCount === params.length &&
      (candidate.arrayParameterIndexes || []).every((index) => Array.isArray(params[index])),
  )
  if (!shape) throw sqlHarnessError("unexpected_query")
  return { ...shape, params, text }
}

function authorizationModule() {
  if (cachedAuthorization) return cachedAuthorization
  cachedAuthorization = compileTsModule(authorizationPath, { "server-only": {} })
  return cachedAuthorization
}

function todayAt(hour, minute = 0, millisecond = 0) {
  const date = new Date()
  date.setHours(hour, minute, 0, millisecond)
  return date.toISOString()
}

function sessionRowsForQuery(sourceRows, query) {
  const userIds = new Set(query.params[0])
  const storeIds = new Set(query.params[3])
  let result = sourceRows.filter(
    (row) =>
      userIds.has(row.user_id) &&
      row.company_id === query.params[1] &&
      String(row.started_at || "") >= String(query.params[2]) &&
      (storeIds.has(row.store_id) || (!query.strictStoreScope && !row.store_id)),
  )
  result.sort((left, right) => String(right.started_at || "").localeCompare(String(left.started_at || "")))
  return result.slice(0, query.limit)
}

function turnRowsForQuery(sourceRows, query) {
  const sessionIds = new Set(query.params[0])
  let result = sourceRows.filter((row) => sessionIds.has(row.session_id))
  if (query.onlyBeautician) result = result.filter((row) => row.role === "beautician")
  return result.slice(0, query.limit)
}

function storeRowsForQuery(sourceRows, query) {
  let result = sourceRows.filter((row) => row.company_id === query.params[0] && row.status === "active")
  for (const storeParameterIndex of query.storeParameterIndexes) {
    const storeId = query.params[storeParameterIndex]
    result = result.filter((row) => row.id === storeId)
  }
  result.sort((left, right) => String(left.created_at || "").localeCompare(String(right.created_at || "")))
  return result.slice(0, 500)
}

function membershipRowsForQuery(sourceRows, query) {
  const storeIds = new Set(query.params[1])
  let result = sourceRows.filter(
    (row) =>
      row.company_id === query.params[0] &&
      (!query.activeOnly || row.status === "active") &&
      (storeIds.has(row.store_id) || (!query.strictStoreScope && !row.store_id)),
  )
  result.sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))
  return result.slice(0, 2000)
}

function profileRowsForQuery(sourceRows, query) {
  const userIds = new Set(query.params[0])
  return sourceRows.filter((row) => userIds.has(row.id))
}

function ledgerRowsForQuery(sourceRows, query) {
  const storeIds = new Set(query.params[2])
  let result = sourceRows.filter(
    (row) =>
      row.company_id === query.params[0] &&
      String(row.created_at || "") >= String(query.params[1]) &&
      (storeIds.has(row.store_id) || (!query.strictStoreScope && !row.store_id)),
  )
  result.sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))
  return result.slice(0, 2000)
}

function request(query = "") {
  return { url: `https://local.invalid/api/app/store-admin/members${query}` }
}

function accountContext(overrides = {}) {
  return {
    accountStatus: "bound",
    userId: "manager-user",
    userEmail: "manager@example.invalid",
    membershipId: "manager-membership",
    role: "company_admin",
    roleLabel: "公司管理员",
    companyId: "company-1",
    companyName: "公司一",
    storeId: null,
    storeName: null,
    scopeLabel: "公司一",
    memberships: [],
    isManager: true,
    isCompanyManager: true,
    isStoreManager: false,
    isPlatformAdmin: false,
    features: {},
    ...overrides,
  }
}

function authorizedAccountContext(overrides = {}) {
  const ctx = accountContext(overrides)
  return {
    ...ctx,
    features: authorizationModule().buildAppFeatureDecisions(ctx, {
      aiPointsBalance: 12,
      aiPointsUnlimited: false,
    }),
  }
}

function storeRow(overrides = {}) {
  return {
    id: "store-1",
    company_id: "company-1",
    name: "门店一",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function membershipRow(overrides = {}) {
  return {
    id: "membership-1",
    user_id: "shared-user",
    company_id: "company-1",
    store_id: "store-1",
    role: "employee",
    status: "active",
    display_name: "员工一",
    accepted_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-07-10T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function profileRow(overrides = {}) {
  return {
    id: "shared-user",
    nickname: "员工一",
    avatar_url: null,
    email: "employee@example.invalid",
    ...overrides,
  }
}

function sessionRow(overrides = {}) {
  return {
    id: "session-1",
    user_id: "shared-user",
    company_id: "company-1",
    store_id: "store-1",
    membership_id: "membership-1",
    scenario_id: "scenario-1",
    status: "ended",
    started_at: todayAt(10),
    ended_at: todayAt(10, 5),
    created_at: todayAt(10),
    total_score: 80,
    report_json: { total_score: 80 },
    customer_profile_id: null,
    scene_card_id: null,
    session_context_json: null,
    scenario_snapshot_json: null,
    ...overrides,
  }
}

function turnRow(overrides = {}) {
  return {
    session_id: "session-1",
    role: "beautician",
    text: "本地测试话术",
    audio_seconds: 10,
    turn_index: 1,
    created_at: "2026-07-11T01:01:00.000Z",
    ...overrides,
  }
}

function ledgerRow(overrides = {}) {
  return {
    id: "ledger-1",
    user_id: "shared-user",
    company_id: "company-1",
    store_id: "store-1",
    action_code: "voice_coach_session",
    action_title: "话术练习",
    page_path: "/pages/voice-coach/index",
    delta: -5,
    balance_after: 95,
    status: "success",
    reason: null,
    created_at: todayAt(10),
    ...overrides,
  }
}

function repositoryHarness(rows = {}, options = {}) {
  const queryLog = []
  const authorization = authorizationModule()
  const repository = compileTsModule(repositoryPath, {
    "server-only": {},
    "next/server": {
      NextRequest: class NextRequest {},
      NextResponse: FakeNextResponse,
    },
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => FakeNextResponse.json({ ok: false, code: "auth_required" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () =>
        options.authContext
          ? { user: { id: options.authContext.userId, email: options.authContext.userEmail } }
          : null,
    },
    "@/lib/aliyun-rds/postgres.server": {
      AliyunRdsConfigurationError,
      isAliyunRdsRuntimeUnavailableError: () => false,
      queryAliyunRds: async (sql, params = []) => {
        const query = structuredExecutableQuery(sql, params)
        queryLog.push(query)
        if (query.table === "mp_stores") {
          return { rows: storeRowsForQuery(rows.stores || [], query) }
        }
        if (query.table === "mp_account_memberships") {
          return { rows: membershipRowsForQuery(rows.memberships || [], query) }
        }
        if (query.table === "profiles") return { rows: profileRowsForQuery(rows.profiles || [], query) }
        if (query.table === "voice_coach_sessions") {
          return { rows: sessionRowsForQuery(rows.sessions || [], query) }
        }
        if (query.table === "voice_coach_turns") {
          return { rows: turnRowsForQuery(rows.turns || [], query) }
        }
        if (query.table === "mp_ai_point_ledger") {
          return { rows: ledgerRowsForQuery(rows.ledger || [], query) }
        }
        throw new Error(`unexpected query: ${query.text}`)
      },
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: (ctx) => ({ account: { user_id: ctx.userId } }),
      getAliyunRdsAppAccountContext: async () => {
        if (options.authContext) return options.authContext
        throw new Error("account_context_must_not_run")
      },
      getAliyunRdsAppAccountRoleLabel: (role) => role || "当前账号",
    },
    "@/lib/aliyun-rds/app-authorization.server": authorization,
    "@/lib/voice-coach/session-context": {
      getVoiceCoachSessionClientContext: () => ({}),
    },
    "@/lib/voice-coach/scenarios": {
      getScenario: () => ({ id: "scenario-1", name: "测试场景", goal: "本地目标" }),
    },
  })
  return { queryLog, repository }
}

function queriesFor(queryLog, tableName) {
  return queryLog.filter((entry) => entry.table === tableName)
}

function assertStoreSqlScope(query, { companyId, storeIds }) {
  assert.equal(query.name, storeIds.length ? "stores_store" : "stores_company")
  assert.equal(query.params[0], companyId)
  assert.deepEqual(
    query.storeParameterIndexes.map((index) => query.params[index]),
    storeIds,
  )
}

function assertTurnSqlScope(query, { sessionIds, onlyBeautician }) {
  assert.equal(query.name, onlyBeautician ? "turns_beautician" : "turns_all")
  assert.deepEqual(query.params, [sessionIds])
}

function assertMembershipSqlScope(query, { activeOnly, companyId, storeIds, strictStoreScope }) {
  assert.equal(
    query.name,
    `memberships_${strictStoreScope ? "store" : "company"}_${activeOnly ? "active" : "all"}`,
  )
  assert.deepEqual(query.params, [companyId, storeIds])
}

function assertSessionSqlScope(query, { companyId, storeIds, strictStoreScope, userIds, limit }) {
  assert.equal(query.name, `sessions_${strictStoreScope ? "store" : "company"}_${limit}`)
  assert.deepEqual(query.params[0], userIds)
  assert.equal(query.params[1], companyId)
  assert.equal(typeof query.params[2], "string")
  assert.deepEqual(query.params[3], storeIds)
}

function assertLedgerSqlScope(query, { companyId, storeIds, strictStoreScope }) {
  assert.equal(query.name, strictStoreScope ? "ledger_store" : "ledger_company")
  assert.equal(query.params[0], companyId)
  assert.equal(typeof query.params[1], "string")
  assert.deepEqual(query.params[2], storeIds)
}

async function authorizedMembers(repository, query) {
  const scopedRequest = request(query)
  const auth = await repository.resolveAliyunRdsStoreManagerAuth(scopedRequest)
  if (!auth.ok) return auth
  return repository.getAliyunRdsStoreAdminMembers(auth.ctx, scopedRequest)
}

test("raw query whitelist rejects every non-reachable SQL or binding shape", () => {
  const store = storeQueryShapes[0]
  const membership = membershipQueryShapes[1]
  const session = sessionQueryShapes.find((shape) => shape.name === "sessions_store_1000")
  const turn = turnQueryShapes.find((shape) => shape.name === "turns_beautician")
  const ledger = ledgerQueryShapes.find((shape) => shape.name === "ledger_store")
  const storeParams = ["company-1"]
  const membershipParams = ["company-1", ["store-1"]]
  const sessionParams = [["shared-user"], "company-1", todayAt(0), ["store-1"]]
  const turnParams = [["session-1"]]
  const ledgerParams = ["company-1", todayAt(0), ["store-1"]]
  const invalidQueries = [
    [store.text.replace("from public", `from${String.fromCharCode(0xa0)}public`), storeParams],
    [store.text.replace("status = 'active'", "status = b'active'"), storeParams],
    [store.text.replace("status = 'active'", "status = x'active'"), storeParams],
    [store.text.replace("status = 'active'", "status = n'active'"), storeParams],
    [store.text.replace("status = 'active'", "status = u&'active'"), storeParams],
    [store.text.replace("status = 'active'", "status = $$active$$"), storeParams],
    [store.text.replace("status = 'active'", "status = 'active' or true"), storeParams],
    [store.text.replace("from public.mp_stores", "from public.voice_coach_sessions"), storeParams],
    [turn.text.replace("role = 'beautician'", "role = b'beautician'"), turnParams],
    [turn.text.replace("role = 'beautician'", "role = 'beautician' or true"), turnParams],
    [membership.text.replace("store_id = any($2::uuid[])", "store_id = any($2::uuid[]) or true"), membershipParams],
    [membership.text.replace("order by created_at desc", "order by created_at asc"), membershipParams],
    [membership.text.replace("limit 2000", "limit 1"), membershipParams],
    [membership.text, [...membershipParams, "unused-trailing-bind"]],
    [session.text.replace("and company_id = $2", "/* fake */ and company_id = $2"), sessionParams],
    [session.text.replace("select ", "select 'fake predicate' as fake, "), sessionParams],
    [session.text.replace("select ", "select e'escaped \\\\' fake' as fake, "), sessionParams],
    [session.text, [...sessionParams, "unused-trailing-bind"]],
    [ledger.text.replace("and store_id", "-- fake scope and store_id"), ledgerParams],
    [ledger.text.replace("select ", "select $tag$fake scope$tag$ as fake, "), ledgerParams],
    [ledger.text, [...ledgerParams, "unused-trailing-bind"]],
    ["select 'unterminated", []],
    ["select /* unterminated", []],
  ]

  for (const [sql, params] of invalidQueries) {
    assert.throws(
      () => structuredExecutableQuery(sql, params),
      error => error instanceof Error && error.message === "sql_harness_invalid_sql:unexpected_query",
    )
  }
})
test("store manager overview and members exclude the same user's sessions from another store", async () => {
  const allowedSession = sessionRow()
  const otherStoreSession = sessionRow({
    id: "session-other-store",
    store_id: "store-2",
    started_at: todayAt(11),
    total_score: 20,
    report_json: { total_score: 20 },
  })
  const { queryLog, repository } = repositoryHarness({
    stores: [storeRow()],
    memberships: [membershipRow()],
    profiles: [profileRow()],
    sessions: [allowedSession, otherStoreSession],
    turns: [turnRow(), turnRow({ session_id: otherStoreSession.id, audio_seconds: 90 })],
  })
  const ctx = accountContext({
    role: "store_admin",
    companyId: "company-1",
    storeId: "store-1",
    isCompanyManager: false,
    isStoreManager: true,
  })

  const overview = await repository.getAliyunRdsStoreAdminOverview(ctx, request())
  const members = await repository.getAliyunRdsStoreAdminMembers(ctx, request())

  assert.equal(overview.stats.today_session_count, 1)
  assert.equal(overview.stats.today_practice_seconds, 10)
  assert.equal(overview.stats.today_avg_score, 80)
  assert.equal(members.members[0].today_session_count, 1)
  assert.equal(members.members[0].today_practice_seconds, 10)
  assert.equal(members.members[0].today_avg_score, 80)

  const storeQueries = queriesFor(queryLog, "mp_stores")
  assert.equal(storeQueries.length, 2)
  for (const query of storeQueries) {
    assertStoreSqlScope(query, { companyId: "company-1", storeIds: ["store-1"] })
  }
  for (const [index, query] of queriesFor(queryLog, "mp_account_memberships").entries()) {
    assertMembershipSqlScope(query, {
      activeOnly: index === 0,
      companyId: "company-1",
      storeIds: ["store-1"],
      strictStoreScope: true,
    })
  }
  const sessionQueries = queriesFor(queryLog, "voice_coach_sessions")
  assert.equal(sessionQueries.length, 2)
  for (const query of sessionQueries) {
    assertSessionSqlScope(query, {
      companyId: "company-1",
      limit: 1000,
      storeIds: ["store-1"],
      strictStoreScope: true,
      userIds: ["shared-user"],
    })
  }
  for (const query of queriesFor(queryLog, "voice_coach_turns")) {
    assertTurnSqlScope(query, { onlyBeautician: true, sessionIds: [allowedSession.id] })
  }
})

test("company manager company scope includes null or active-store sessions only", async () => {
  const companySessions = [
    sessionRow(),
    sessionRow({
      id: "session-store-2",
      user_id: "user-2",
      store_id: "store-2",
      membership_id: "membership-2",
      started_at: todayAt(9),
      total_score: 90,
      report_json: { total_score: 90 },
    }),
    sessionRow({
      id: "session-company-level",
      store_id: null,
      started_at: todayAt(8),
      total_score: 70,
      report_json: { total_score: 70 },
    }),
  ]
  const externalSession = sessionRow({
    id: "session-external-company",
    company_id: "company-2",
    store_id: "store-3",
    started_at: todayAt(11),
    total_score: 10,
    report_json: { total_score: 10 },
  })
  const { queryLog, repository } = repositoryHarness({
    stores: [storeRow(), storeRow({ id: "store-2", name: "门店二" })],
    memberships: [membershipRow(), membershipRow({ id: "membership-2", user_id: "user-2", store_id: "store-2" })],
    profiles: [profileRow(), profileRow({ id: "user-2", nickname: "员工二" })],
    sessions: [...companySessions, externalSession],
    turns: [
      turnRow(),
      turnRow({ session_id: "session-store-2", audio_seconds: 20 }),
      turnRow({ session_id: "session-company-level", audio_seconds: 15 }),
      turnRow({ session_id: externalSession.id, audio_seconds: 70 }),
    ],
  })
  const ctx = accountContext()

  const overview = await repository.getAliyunRdsStoreAdminOverview(ctx, request())
  const members = await repository.getAliyunRdsStoreAdminMembers(ctx, request())

  assert.equal(overview.stats.today_session_count, 3)
  assert.equal(overview.stats.today_practice_seconds, 45)
  assert.equal(overview.stats.today_avg_score, 80)
  assert.deepEqual(
    members.members.map((member) => [member.user_id, member.today_session_count]),
    [["shared-user", 2], ["user-2", 1]],
  )

  const storeQueries = queriesFor(queryLog, "mp_stores")
  assert.equal(storeQueries.length, 2)
  for (const query of storeQueries) {
    assertStoreSqlScope(query, { companyId: "company-1", storeIds: [] })
  }
  for (const [index, query] of queriesFor(queryLog, "mp_account_memberships").entries()) {
    assertMembershipSqlScope(query, {
      activeOnly: index === 0,
      companyId: "company-1",
      storeIds: ["store-1", "store-2"],
      strictStoreScope: false,
    })
  }
  const sessionQueries = queriesFor(queryLog, "voice_coach_sessions")
  assert.equal(sessionQueries.length, 2)
  for (const query of sessionQueries) {
    assertSessionSqlScope(query, {
      companyId: "company-1",
      limit: 1000,
      storeIds: ["store-1", "store-2"],
      strictStoreScope: false,
      userIds: ["shared-user", "user-2"],
    })
  }
  for (const query of queriesFor(queryLog, "voice_coach_turns")) {
    assertTurnSqlScope(query, {
      onlyBeautician: true,
      sessionIds: ["session-1", "session-store-2", "session-company-level"],
    })
  }
})

test("members preserves suspended membership while overview and analytics remain active-only", async () => {
  const suspendedMembership = membershipRow({
    id: "membership-suspended",
    status: "suspended",
    user_id: "suspended-user",
  })
  const { queryLog, repository } = repositoryHarness({
    memberships: [membershipRow(), suspendedMembership],
    profiles: [profileRow(), profileRow({ id: "suspended-user", nickname: "暂停员工" })],
    stores: [storeRow()],
  })
  const ctx = accountContext()

  const overview = await repository.getAliyunRdsStoreAdminOverview(ctx, request())
  const members = await repository.getAliyunRdsStoreAdminMembers(ctx, request())
  const analytics = await repository.getAliyunRdsStoreAdminAnalytics(ctx, request("?days=7"))

  assert.equal(overview.stats.member_count, 1)
  assert.deepEqual(
    members.members.map((member) => [member.id, member.status]),
    [["membership-1", "active"], [suspendedMembership.id, "suspended"]],
  )
  assert.equal(analytics.stats.member_count, 1)
  assert.deepEqual(analytics.members.map((member) => member.id), ["membership-1"])
  const membershipQueries = queriesFor(queryLog, "mp_account_memberships")
  assert.equal(membershipQueries.length, 3)
  assert.equal(membershipQueries[0].activeOnly, true)
  assert.equal(membershipQueries[1].activeOnly, false)
  assert.equal(membershipQueries[2].activeOnly, true)
})

test("SQL tenant scope filters foreign and inactive-store sessions before limit", async () => {
  const allowedStoreSession = sessionRow({ id: "session-allowed-store", started_at: todayAt(8) })
  const allowedCompanySession = sessionRow({
    id: "session-allowed-company",
    started_at: todayAt(7),
    store_id: null,
  })
  const foreignCompanySessions = Array.from({ length: 600 }, (_, index) =>
    sessionRow({
      company_id: "company-2",
      id: `session-foreign-${index}`,
      started_at: todayAt(12, 0, index),
      store_id: "store-1",
    }),
  )
  const inactiveStoreSessions = Array.from({ length: 600 }, (_, index) =>
    sessionRow({
      id: `session-inactive-store-${index}`,
      started_at: todayAt(13, 0, index),
      store_id: "store-inactive",
    }),
  )
  const ctx = authorizedAccountContext()
  const { queryLog, repository } = repositoryHarness(
    {
      stores: [storeRow()],
      memberships: [membershipRow()],
      profiles: [profileRow()],
      sessions: [
        allowedStoreSession,
        allowedCompanySession,
        ...foreignCompanySessions,
        ...inactiveStoreSessions,
      ],
      turns: [
        turnRow({ session_id: allowedStoreSession.id }),
        turnRow({ session_id: allowedCompanySession.id, audio_seconds: 20 }),
      ],
    },
    { authContext: ctx },
  )
  const scopedRequest = request("?company_id=company-1")
  const auth = await repository.resolveAliyunRdsStoreManagerAuth(scopedRequest)
  assert.equal(auth.ok, true)

  const overview = await repository.getAliyunRdsStoreAdminOverview(auth.ctx, scopedRequest)
  const members = await repository.getAliyunRdsStoreAdminMembers(auth.ctx, scopedRequest)

  assert.equal(overview.stats.today_session_count, 2)
  assert.equal(overview.stats.today_practice_seconds, 30)
  assert.equal(members.members[0].today_session_count, 2)
  assert.equal(members.members[0].today_practice_seconds, 30)
  const storeQueries = queriesFor(queryLog, "mp_stores")
  assert.equal(storeQueries.length, 2)
  for (const query of storeQueries) {
    assertStoreSqlScope(query, { companyId: "company-1", storeIds: [] })
  }
  for (const [index, query] of queriesFor(queryLog, "mp_account_memberships").entries()) {
    assertMembershipSqlScope(query, {
      activeOnly: index === 0,
      companyId: "company-1",
      storeIds: ["store-1"],
      strictStoreScope: false,
    })
  }
  for (const query of queriesFor(queryLog, "voice_coach_sessions")) {
    assertSessionSqlScope(query, {
      companyId: "company-1",
      limit: 1000,
      storeIds: ["store-1"],
      strictStoreScope: false,
      userIds: ["shared-user"],
    })
  }
  for (const query of queriesFor(queryLog, "voice_coach_turns")) {
    assertTurnSqlScope(query, {
      onlyBeautician: true,
      sessionIds: [allowedStoreSession.id, allowedCompanySession.id],
    })
  }
})

test("reachable store-manager and platform scopes use strict or company session SQL", async () => {
  const storeSession = sessionRow()
  const companySession = sessionRow({ id: "session-company-level", started_at: todayAt(9), store_id: null })
  const cases = [
    {
      ctx: authorizedAccountContext({
        isCompanyManager: false,
        isStoreManager: true,
        role: "store_admin",
        storeId: "store-1",
      }),
      expectedSessionIds: [storeSession.id],
      expectedStoreIds: ["store-1"],
      query: "?company_id=company-1&store_id=store-1",
      strictStoreScope: true,
    },
    {
      ctx: authorizedAccountContext({
        companyId: null,
        companyName: null,
        isCompanyManager: false,
        isPlatformAdmin: true,
        membershipId: null,
        role: "platform_admin",
      }),
      expectedSessionIds: [storeSession.id, companySession.id],
      expectedStoreIds: [],
      query: "?company_id=company-1",
      strictStoreScope: false,
    },
    {
      ctx: authorizedAccountContext({
        companyId: null,
        companyName: null,
        isCompanyManager: false,
        isPlatformAdmin: true,
        membershipId: null,
        role: "platform_admin",
      }),
      expectedSessionIds: [storeSession.id],
      expectedStoreIds: ["store-1"],
      query: "?company_id=company-1&store_id=store-1",
      strictStoreScope: true,
    },
  ]

  for (const item of cases) {
    const { queryLog, repository } = repositoryHarness(
      {
        stores: [storeRow()],
        memberships: [membershipRow()],
        profiles: [profileRow()],
        sessions: [storeSession, companySession],
        turns: [turnRow(), turnRow({ audio_seconds: 20, session_id: companySession.id })],
      },
      { authContext: item.ctx },
    )

    const result = await authorizedMembers(repository, item.query)

    assert.equal(result.ok, true)
    assert.equal(result.members[0].today_session_count, item.expectedSessionIds.length)
    assertStoreSqlScope(queriesFor(queryLog, "mp_stores")[0], {
      companyId: "company-1",
      storeIds: item.expectedStoreIds,
    })
    assertMembershipSqlScope(queriesFor(queryLog, "mp_account_memberships")[0], {
      activeOnly: false,
      companyId: "company-1",
      storeIds: ["store-1"],
      strictStoreScope: item.strictStoreScope,
    })
    const sessionQuery = queriesFor(queryLog, "voice_coach_sessions")[0]
    assertSessionSqlScope(sessionQuery, {
      companyId: "company-1",
      limit: 1000,
      storeIds: ["store-1"],
      strictStoreScope: item.strictStoreScope,
      userIds: ["shared-user"],
    })
    assertTurnSqlScope(queriesFor(queryLog, "voice_coach_turns")[0], {
      onlyBeautician: true,
      sessionIds: item.expectedSessionIds,
    })
  }
})

test("platform active-store membership scope is applied before limit across all store-admin reads", async () => {
  const targetMembership = membershipRow({
    created_at: "2026-07-01T00:00:00.000Z",
    id: "membership-target-store",
  })
  const newerOtherStoreMemberships = Array.from({ length: 2001 }, (_, index) =>
    membershipRow({
      created_at: new Date(Date.parse("2026-07-10T00:00:00.000Z") + index).toISOString(),
      id: `membership-other-store-${index}`,
      store_id: "store-2",
      user_id: `other-user-${index}`,
    }),
  )
  const targetSession = sessionRow({ id: "session-target-store" })
  const ctx = authorizedAccountContext({
    companyId: null,
    companyName: null,
    isCompanyManager: false,
    isPlatformAdmin: true,
    membershipId: null,
    role: "platform_admin",
  })
  const { queryLog, repository } = repositoryHarness(
    {
      memberships: [...newerOtherStoreMemberships, targetMembership],
      profiles: [profileRow()],
      sessions: [targetSession],
      stores: [storeRow()],
      turns: [turnRow({ session_id: targetSession.id })],
    },
    { authContext: ctx },
  )
  const scopedRequest = request("?company_id=company-1&store_id=store-1&days=7")

  const overview = await repository.getAliyunRdsStoreAdminOverview(ctx, scopedRequest)
  const members = await repository.getAliyunRdsStoreAdminMembers(ctx, scopedRequest)
  const analytics = await repository.getAliyunRdsStoreAdminAnalytics(ctx, scopedRequest)

  assert.equal(overview.stats.member_count, 1)
  assert.equal(overview.stats.today_session_count, 1)
  assert.deepEqual(members.members.map((item) => item.id), [targetMembership.id])
  assert.equal(analytics.stats.member_count, 1)
  assert.equal(analytics.stats.session_count, 1)
  assert.deepEqual(analytics.members.map((item) => item.id), [targetMembership.id])
  const membershipQueries = queriesFor(queryLog, "mp_account_memberships")
  assert.equal(membershipQueries.length, 3)
  for (const [index, query] of membershipQueries.entries()) {
    assertMembershipSqlScope(query, {
      activeOnly: index !== 1,
      companyId: "company-1",
      storeIds: ["store-1"],
      strictStoreScope: true,
    })
  }
})

test("analytics scopes sessions and non-strict ledger before their limits", async () => {
  const allowedStoreSession = sessionRow({ id: "analytics-allowed-store", started_at: todayAt(8) })
  const allowedCompanySession = sessionRow({
    id: "analytics-allowed-company",
    started_at: todayAt(7),
    store_id: null,
  })
  const foreignCompanySessions = Array.from({ length: 2500 }, (_, index) =>
    sessionRow({
      company_id: "company-2",
      id: `analytics-foreign-${index}`,
      started_at: todayAt(12, 0, index),
      store_id: "store-1",
    }),
  )
  const inactiveStoreSessions = Array.from({ length: 2500 }, (_, index) =>
    sessionRow({
      id: `analytics-inactive-store-${index}`,
      started_at: todayAt(13, 0, index),
      store_id: "store-inactive",
    }),
  )
  const ctx = authorizedAccountContext()
  const allowedStoreLedger = ledgerRow()
  const allowedCompanyLedger = ledgerRow({
    created_at: todayAt(9),
    delta: -7,
    id: "ledger-company-level",
    store_id: null,
  })
  const { queryLog, repository } = repositoryHarness(
    {
      ledger: [
        allowedStoreLedger,
        allowedCompanyLedger,
        ledgerRow({ company_id: "company-2", created_at: todayAt(13), delta: -100, id: "ledger-foreign" }),
        ledgerRow({ created_at: todayAt(12), delta: -100, id: "ledger-inactive-store", store_id: "store-inactive" }),
      ],
      memberships: [membershipRow()],
      profiles: [profileRow()],
      sessions: [
        allowedStoreSession,
        allowedCompanySession,
        ...foreignCompanySessions,
        ...inactiveStoreSessions,
      ],
      stores: [storeRow()],
      turns: [
        turnRow({ session_id: allowedStoreSession.id }),
        turnRow({ audio_seconds: 20, session_id: allowedCompanySession.id }),
      ],
    },
    { authContext: ctx },
  )
  const scopedRequest = request("?company_id=company-1&days=7")
  const auth = await repository.resolveAliyunRdsStoreManagerAuth(scopedRequest)
  assert.equal(auth.ok, true)

  const result = await repository.getAliyunRdsStoreAdminAnalytics(auth.ctx, scopedRequest)

  assert.equal(result.ok, true)
  assert.equal(result.stats.session_count, 2)
  assert.equal(result.stats.practice_seconds, 30)
  assert.deepEqual(result.recent_sessions.map((session) => session.id), [
    allowedStoreSession.id,
    allowedCompanySession.id,
  ])
  assertStoreSqlScope(queriesFor(queryLog, "mp_stores")[0], {
    companyId: "company-1",
    storeIds: [],
  })
  assertMembershipSqlScope(queriesFor(queryLog, "mp_account_memberships")[0], {
    activeOnly: true,
    companyId: "company-1",
    storeIds: ["store-1"],
    strictStoreScope: false,
  })
  const sessionQuery = queriesFor(queryLog, "voice_coach_sessions")[0]
  assertSessionSqlScope(sessionQuery, {
    companyId: "company-1",
    limit: 5000,
    storeIds: ["store-1"],
    strictStoreScope: false,
    userIds: ["shared-user"],
  })
  assertTurnSqlScope(queriesFor(queryLog, "voice_coach_turns")[0], {
    onlyBeautician: false,
    sessionIds: [allowedStoreSession.id, allowedCompanySession.id],
  })
  const ledgerQueries = queriesFor(queryLog, "mp_ai_point_ledger")
  assert.equal(ledgerQueries.length, 1)
  assertLedgerSqlScope(ledgerQueries[0], {
    companyId: "company-1",
    storeIds: ["store-1"],
    strictStoreScope: false,
  })
  assert.deepEqual(result.ai_ledger.map((entry) => entry.id), [allowedStoreLedger.id, allowedCompanyLedger.id])
  assert.equal(result.stats.ledger_count, 2)
  assert.equal(result.stats.ai_points_spent, 12)
})

test("strict analytics ledger scope filters other stores before limit 2000", async () => {
  const allowedSession = sessionRow({ id: "analytics-strict-session", started_at: todayAt(8) })
  const allowedLedger = ledgerRow({ created_at: todayAt(7), delta: -25, id: "ledger-allowed-store" })
  const otherStoreLedger = Array.from({ length: 2001 }, (_, index) =>
    ledgerRow({
      created_at: todayAt(13, 0, index),
      delta: -1,
      id: `ledger-other-store-${index}`,
      store_id: "store-2",
    }),
  )
  const ctx = authorizedAccountContext({
    isCompanyManager: false,
    isStoreManager: true,
    role: "store_admin",
    storeId: "store-1",
  })
  const { queryLog, repository } = repositoryHarness(
    {
      ledger: [allowedLedger, ...otherStoreLedger],
      memberships: [membershipRow()],
      profiles: [profileRow()],
      sessions: [allowedSession],
      stores: [storeRow(), storeRow({ id: "store-2", name: "门店二" })],
      turns: [turnRow({ session_id: allowedSession.id })],
    },
    { authContext: ctx },
  )
  const scopedRequest = request("?company_id=company-1&store_id=store-1&days=7")
  const auth = await repository.resolveAliyunRdsStoreManagerAuth(scopedRequest)
  assert.equal(auth.ok, true)

  const result = await repository.getAliyunRdsStoreAdminAnalytics(auth.ctx, scopedRequest)

  assert.equal(result.ok, true)
  assert.equal(result.stats.session_count, 1)
  assert.equal(result.stats.practice_seconds, 10)
  assert.equal(result.stats.ai_points_spent, 25)
  assert.equal(result.stats.ledger_count, 1)
  assert.deepEqual(result.ai_ledger.map((entry) => entry.id), [allowedLedger.id])
  assert.deepEqual(result.recent_sessions.map((session) => session.id), [allowedSession.id])
  assertStoreSqlScope(queriesFor(queryLog, "mp_stores")[0], {
    companyId: "company-1",
    storeIds: ["store-1"],
  })
  assertMembershipSqlScope(queriesFor(queryLog, "mp_account_memberships")[0], {
    activeOnly: true,
    companyId: "company-1",
    storeIds: ["store-1"],
    strictStoreScope: true,
  })
  assertSessionSqlScope(queriesFor(queryLog, "voice_coach_sessions")[0], {
    companyId: "company-1",
    limit: 5000,
    storeIds: ["store-1"],
    strictStoreScope: true,
    userIds: ["shared-user"],
  })
  assertTurnSqlScope(queriesFor(queryLog, "voice_coach_turns")[0], {
    onlyBeautician: false,
    sessionIds: [allowedSession.id],
  })
  assertLedgerSqlScope(queriesFor(queryLog, "mp_ai_point_ledger")[0], {
    companyId: "company-1",
    storeIds: ["store-1"],
    strictStoreScope: true,
  })
})

test("platform inactive requested store resolves to zero scope across all store-admin reads", async () => {
  const ctx = authorizedAccountContext({
    companyId: null,
    companyName: null,
    isCompanyManager: false,
    isPlatformAdmin: true,
    membershipId: null,
    role: "platform_admin",
  })
  const { queryLog, repository } = repositoryHarness(
    {
      ledger: [
        ledgerRow({ id: "ledger-inactive-request", store_id: "store-inactive" }),
        ledgerRow({ id: "ledger-company-level", store_id: null }),
      ],
      memberships: [
        membershipRow({ id: "membership-inactive-request", store_id: "store-inactive" }),
        membershipRow({ id: "membership-company-level", store_id: null, user_id: "company-user" }),
      ],
      profiles: [profileRow(), profileRow({ id: "company-user" })],
      sessions: [
        sessionRow({ id: "session-inactive-request", store_id: "store-inactive" }),
        sessionRow({ id: "session-company-level", store_id: null, user_id: "company-user" }),
      ],
      stores: [storeRow({ id: "store-inactive", status: "inactive" })],
      turns: [
        turnRow({ session_id: "session-inactive-request" }),
        turnRow({ session_id: "session-company-level" }),
      ],
    },
    { authContext: ctx },
  )
  const scopedRequest = request("?company_id=company-1&store_id=store-inactive&days=7")
  const auth = await repository.resolveAliyunRdsStoreManagerAuth(scopedRequest)
  assert.equal(auth.ok, true)

  const overview = await repository.getAliyunRdsStoreAdminOverview(auth.ctx, scopedRequest)
  const members = await repository.getAliyunRdsStoreAdminMembers(auth.ctx, scopedRequest)
  const analytics = await repository.getAliyunRdsStoreAdminAnalytics(auth.ctx, scopedRequest)

  assert.equal(overview.stats.member_count, 0)
  assert.equal(overview.stats.today_session_count, 0)
  assert.deepEqual(overview.members_preview, [])
  assert.deepEqual(members.members, [])
  assert.equal(analytics.ok, true)
  assert.deepEqual(analytics.stores, [])
  assert.deepEqual(analytics.members, [])
  assert.equal(analytics.stats.member_count, 0)
  assert.equal(analytics.stats.session_count, 0)
  assert.equal(analytics.stats.practice_seconds, 0)
  assert.equal(analytics.stats.ledger_count, 0)
  assert.equal(analytics.stats.ai_points_spent, 0)
  assert.deepEqual(analytics.recent_sessions, [])
  assert.deepEqual(analytics.ai_ledger, [])
  const storeQueries = queriesFor(queryLog, "mp_stores")
  assert.equal(storeQueries.length, 3)
  for (const query of storeQueries) {
    assertStoreSqlScope(query, { companyId: "company-1", storeIds: ["store-inactive"] })
  }
  assert.equal(queriesFor(queryLog, "mp_account_memberships").length, 0)
  assert.equal(queriesFor(queryLog, "profiles").length, 0)
  assert.equal(queriesFor(queryLog, "voice_coach_sessions").length, 0)
  assert.equal(queriesFor(queryLog, "voice_coach_turns").length, 0)
  assert.equal(queriesFor(queryLog, "mp_ai_point_ledger").length, 0)
})

test("resolver rejects company-manager explicit store and platform missing company before repository", async () => {
  const cases = [
    {
      ctx: authorizedAccountContext(),
      query: "?company_id=company-1&store_id=store-1",
    },
    {
      ctx: authorizedAccountContext({
        companyId: null,
        companyName: null,
        isCompanyManager: false,
        isPlatformAdmin: true,
        membershipId: null,
        role: "platform_admin",
      }),
      query: "",
    },
  ]

  for (const item of cases) {
    const { queryLog, repository } = repositoryHarness({}, { authContext: item.ctx })

    const result = await repository.resolveAliyunRdsStoreManagerAuth(request(item.query))

    assert.equal(result.ok, false)
    assert.equal(result.error.status, 403)
    assert.deepEqual(result.error.body, {
      ok: false,
      code: "tenant_scope_denied",
      feature: "store_admin",
    })
    assert.equal(queryLog.length, 0)
  }
})

test("unknown store-admin errors return a fixed safe envelope", () => {
  const { repository } = repositoryHarness()

  const response = repository.rdsStoreAdminErrorResponse(
    new Error(RAW_MARKER),
    "store_admin_members_failed",
  )

  assert.equal(response.status, 500)
  assert.deepEqual(response.body, {
    ok: false,
    error: "store_admin_members_failed",
    code: "store_admin_members_failed",
  })
  assert.equal(JSON.stringify(response.body).includes(RAW_MARKER), false)
})
