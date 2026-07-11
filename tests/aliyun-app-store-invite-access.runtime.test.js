/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "store-invites.server.ts")
const authorizationPath = path.join(root, "lib", "aliyun-rds", "app-authorization.server.ts")
const previewRoutePath = path.join(root, "app", "api", "app", "store-admin", "invites", "[token]", "preview", "route.ts")
const acceptRoutePath = path.join(root, "app", "api", "app", "store-admin", "invites", "[token]", "accept", "route.ts")
const qrcodeRoutePath = path.join(root, "app", "api", "app", "store-admin", "invites", "[token]", "qrcode", "route.ts")
const createRoutePath = path.join(root, "app", "api", "app", "store-admin", "invites", "route.ts")

const FIXED_NOW = "2026-07-10T10:00:00.000Z"
const FIXED_NOW_MS = Date.parse(FIXED_NOW)
const FUTURE_EXPIRY = "2026-07-11T10:00:00.000Z"
const PAST_EXPIRY = "2026-07-09T10:00:00.000Z"
const RAW_MARKER = "raw-token-marker:hash-marker:tenant-marker:user-marker"

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

let cachedAuthorization = null

function authorizationModule() {
  if (!cachedAuthorization) {
    cachedAuthorization = compileTsModule(authorizationPath, { "server-only": {} })
  }
  return cachedAuthorization
}

class FakeNextResponse {
  constructor(body, init = {}) {
    this.body = body
    this.status = init.status ?? 200
    this.headers = init.headers || {}
  }

  static json(body, init = {}) {
    return new FakeNextResponse(body, init)
  }

  async json() {
    return this.body
  }
}

const nextServerStub = {
  NextRequest: class NextRequest {},
  NextResponse: FakeNextResponse,
}

class AliyunRdsConfigurationError extends Error {}

const routePostgresStub = {
  AliyunRdsConfigurationError,
  isAliyunRdsRuntimeUnavailableError: () => false,
}

const TENANT_ROLES = new Set([
  "company_owner",
  "company_admin",
  "merchant_owner",
  "merchant_admin",
  "store_owner",
  "store_admin",
  "staff",
  "employee",
])
const STORE_ROLES = new Set(["store_owner", "store_admin", "staff", "employee"])
const ROLE_LABELS = {
  company_owner: "公司负责人",
  company_admin: "公司管理员",
  merchant_owner: "商户负责人",
  merchant_admin: "商户管理员",
  store_owner: "门店负责人",
  store_admin: "店长",
  staff: "员工",
  employee: "员工",
}

function canInviteRole(ctx, role) {
  if (!TENANT_ROLES.has(role)) return false
  if (ctx.isPlatformAdmin) return true
  if (ctx.isCompanyManager) return role !== "company_owner" && role !== "merchant_owner"
  if (ctx.isStoreManager) return role === "staff" || role === "employee"
  return false
}

function appAccountContext(overrides = {}) {
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

function inviteRow(overrides = {}) {
  return {
    id: "invite-1",
    company_id: "company-1",
    store_id: "store-1",
    role: "employee",
    max_uses: 3,
    used_count: 0,
    expires_at: FUTURE_EXPIRY,
    status: "active",
    note: "安全邀请",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function companyRow(overrides = {}) {
  return {
    id: "company-1",
    name: "公司一",
    status: "active",
    ...overrides,
  }
}

function storeRow(overrides = {}) {
  return {
    id: "store-1",
    company_id: "company-1",
    name: "门店一",
    status: "active",
    ...overrides,
  }
}

function membershipRow(overrides = {}) {
  return {
    id: "membership-1",
    user_id: "invitee-user",
    company_id: "company-1",
    store_id: "store-1",
    role: "employee",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function previewQueryRow(options = {}) {
  const invite = options.invite || inviteRow()
  const company = Object.prototype.hasOwnProperty.call(options, "company") ? options.company : companyRow()
  const store = Object.prototype.hasOwnProperty.call(options, "store") ? options.store : storeRow()
  return {
    ...invite,
    company_row_id: company?.id || null,
    company_name: company?.name || null,
    company_status: company?.status || null,
    store_row_id: store?.id || null,
    store_company_id: store?.company_id || null,
    store_name: store?.name || null,
    store_status: store?.status || null,
  }
}

function compactSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim().toLowerCase()
}

async function withFixedNow(callback) {
  const originalDateNow = Date.now
  Date.now = () => FIXED_NOW_MS
  try {
    return await callback()
  } finally {
    Date.now = originalDateNow
  }
}

function repositoryHarness(options = {}) {
  const counters = {
    accountContextReads: 0,
    topLevelQueries: 0,
    transactionCalls: 0,
  }
  const repository = compileTsModule(repositoryPath, {
    "server-only": {},
    "@/lib/aliyun-rds/app-authorization.server": authorizationModule(),
    "@/lib/aliyun-rds/postgres.server": {
      queryAliyunRds: async (sql, params) => {
        counters.topLevelQueries += 1
        if (!options.queryAliyunRds) throw new Error(`unexpected top-level query: ${compactSql(sql)}`)
        return options.queryAliyunRds(sql, params)
      },
      withAliyunRdsTransaction: async (callback) => {
        counters.transactionCalls += 1
        if (!options.client) throw new Error("unexpected transaction")
        return callback(options.client)
      },
    },
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      accountContextPayload: () => ({ account: { user_id: "manager-user" } }),
      canAliyunRdsInviteRole: canInviteRole,
      getAliyunRdsAppAccountContext: async () => {
        counters.accountContextReads += 1
        throw new Error("post_commit_account_context_read_forbidden")
      },
      getAliyunRdsAppAccountRoleLabel: (role) => ROLE_LABELS[role] || "当前账号",
      isAliyunRdsStoreScopedRole: (role) => STORE_ROLES.has(role),
    },
  })
  return { counters, repository }
}

function transactionClient(options = {}) {
  const trace = []
  const statements = []
  const writes = []
  const client = {
    async query(sql, params = []) {
      const text = compactSql(sql)
      statements.push({ text, params })

      if (text.includes("from public.mp_account_invites")) {
        assert.match(text, /for update$/)
        trace.push("invite_for_update")
        return { rows: options.invite ? [options.invite] : [] }
      }
      if (text.includes("from public.mp_companies")) {
        assert.match(text, /for share$/)
        trace.push("company_for_share")
        return { rows: options.company ? [options.company] : [] }
      }
      if (text.includes("from public.mp_stores")) {
        assert.match(text, /for share$/)
        trace.push("store_for_share")
        return { rows: options.store ? [options.store] : [] }
      }
      if (text.includes("from public.mp_account_memberships")) {
        assert.match(text, /for update$/)
        trace.push("membership_for_update")
        return { rows: options.membership ? [options.membership] : [] }
      }
      if (text.startsWith("insert into public.mp_account_memberships")) {
        trace.push("membership_upsert")
        writes.push("membership_upsert")
        return { rows: options.upsertedMembership === null ? [] : [options.upsertedMembership || membershipRow()] }
      }
      if (text.startsWith("update public.mp_account_invites")) {
        trace.push("invite_update")
        writes.push("invite_update")
        return { rows: [] }
      }
      if (text.startsWith("update public.profiles")) {
        trace.push("profile_update")
        writes.push("profile_update")
        return { rows: [] }
      }
      throw new Error(`unexpected transaction query: ${text}`)
    },
  }
  return { client, statements, trace, writes }
}

function request(url, body = {}) {
  return {
    url,
    headers: { get: () => "application/json" },
    async json() {
      return body
    },
  }
}

function routeRepositoryStub(repository, overrides = {}) {
  return { ...repository, ...overrides }
}

function compilePreviewRoute(repository) {
  return compileTsModule(previewRoutePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/postgres.server": routePostgresStub,
    "@/lib/aliyun-rds/repositories/store-invites.server": repository,
  })
}

function compileAcceptRoute(repository, authOverrides = {}, accountProfileOverrides = {}) {
  return compileTsModule(acceptRoutePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/app-auth.server": {
      appAuthConfigurationErrorResponse: () => null,
      appAuthRequiredResponse: () => FakeNextResponse.json({ ok: false, code: "auth_required" }, { status: 401 }),
      resolveAliyunRdsAppAuthUser: async () => ({ user: { id: "invitee-user" } }),
      ...authOverrides,
    },
    "@/lib/aliyun-rds/postgres.server": routePostgresStub,
    "@/lib/aliyun-rds/repositories/account-profile.server": {
      getAliyunRdsAppAccountContext: async () => appAccountContext({ userId: "invitee-user" }),
      ...accountProfileOverrides,
    },
    "@/lib/aliyun-rds/repositories/store-invites.server": repository,
  })
}

function compileQrcodeRoute(repository, createMiniProgramCode) {
  return compileTsModule(qrcodeRoutePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/postgres.server": routePostgresStub,
    "@/lib/aliyun-rds/repositories/store-invites.server": repository,
    "@/lib/wechat/mini-program.server": { createMiniProgramCode },
  })
}

function compileCreateRoute(repository, postgresOverrides = {}) {
  return compileTsModule(createRoutePath, {
    "next/server": nextServerStub,
    "@/lib/aliyun-rds/postgres.server": {
      ...routePostgresStub,
      ...postgresOverrides,
    },
    "@/lib/aliyun-rds/repositories/store-admin.server": {
      resolveAliyunRdsStoreManagerAuth: async () => ({
        ok: true,
        ctx: appAccountContext(),
        user: { id: "manager-user" },
      }),
    },
    "@/lib/aliyun-rds/repositories/store-invites.server": repository,
  })
}

function errorObservation(error) {
  return {
    name: error?.name,
    status: error?.status,
    code: error?.code,
    reason: error?.reason ?? null,
  }
}

test("pure invite evaluator accepts only the eight frozen tenant roles", () => {
  const { repository } = repositoryHarness()
  assert.equal(typeof repository.evaluateStoreInviteUsability, "function")

  const companyRoles = ["company_owner", "company_admin", "merchant_owner", "merchant_admin"]
  const storeRoles = ["store_owner", "store_admin", "staff", "employee"]
  for (const role of companyRoles) {
    assert.deepEqual(
      repository.evaluateStoreInviteUsability({
        invite: inviteRow({ role, store_id: null }),
        company: companyRow(),
        store: null,
        now: FIXED_NOW,
      }),
      { state: "usable", usable: true, unusableReason: null, validatedStoreId: null },
      role,
    )
  }
  for (const role of storeRoles) {
    assert.deepEqual(
      repository.evaluateStoreInviteUsability({
        invite: inviteRow({ role }),
        company: companyRow(),
        store: storeRow(),
        now: FIXED_NOW,
      }),
      { state: "usable", usable: true, unusableReason: null, validatedStoreId: "store-1" },
      role,
    )
  }

  for (const role of ["service_operator", "store_manager", "platform_admin", "customer", "guest", "unknown", null]) {
    assert.deepEqual(
      repository.evaluateStoreInviteUsability({
        invite: inviteRow({ role }),
        company: companyRow(),
        store: storeRow(),
        now: FIXED_NOW,
      }),
      { state: "unusable", usable: false, unusableReason: "role_denied", validatedStoreId: null },
      String(role),
    )
  }
})

test("invite evaluator requires exact raw role spelling before normalization", () => {
  const { repository } = repositoryHarness()
  const alteredEmployeeRoles = [" employee ", "\temployee\t", "Employee"]

  for (const role of alteredEmployeeRoles) {
    assert.deepEqual(
      repository.evaluateStoreInviteUsability({
        invite: inviteRow({ role }),
        company: companyRow(),
        store: storeRow(),
        now: FIXED_NOW,
      }),
      { state: "unusable", usable: false, unusableReason: "role_denied", validatedStoreId: null },
      JSON.stringify(role),
    )
  }
})

test("invite evaluator freezes reason precedence", () => {
  const { repository } = repositoryHarness()
  assert.equal(typeof repository.evaluateStoreInviteUsability, "function")
  const allLaterFailures = {
    status: "revoked",
    expires_at: PAST_EXPIRY,
    max_uses: 1,
    used_count: 1,
  }
  const cases = [
    {
      name: "role_denied",
      invite: inviteRow({ ...allLaterFailures, role: "service_operator" }),
      company: companyRow({ status: "inactive" }),
      store: storeRow({ status: "inactive" }),
      reason: "role_denied",
    },
    {
      name: "inactive",
      invite: inviteRow(allLaterFailures),
      company: companyRow({ status: "inactive" }),
      store: storeRow({ status: "inactive" }),
      reason: "inactive",
    },
    {
      name: "expired",
      invite: inviteRow({ expires_at: PAST_EXPIRY, max_uses: 1, used_count: 1 }),
      company: companyRow({ status: "inactive" }),
      store: storeRow({ status: "inactive" }),
      reason: "expired",
    },
    {
      name: "exhausted",
      invite: inviteRow({ max_uses: 1, used_count: 1 }),
      company: companyRow({ status: "inactive" }),
      store: storeRow({ status: "inactive" }),
      reason: "exhausted",
    },
    {
      name: "company_inactive",
      invite: inviteRow(),
      company: companyRow({ status: "inactive" }),
      store: storeRow({ status: "inactive" }),
      reason: "company_inactive",
    },
    {
      name: "store_inactive",
      invite: inviteRow(),
      company: companyRow(),
      store: storeRow({ status: "inactive" }),
      reason: "store_inactive",
    },
  ]

  for (const item of cases) {
    assert.deepEqual(
      repository.evaluateStoreInviteUsability({
        invite: item.invite,
        company: item.company,
        store: item.store,
        now: FIXED_NOW,
      }),
      { state: "unusable", usable: false, unusableReason: item.reason, validatedStoreId: null },
      item.name,
    )
  }
})

test("invite evaluator fails closed on invalid expiry counters and parent topology", () => {
  const { repository } = repositoryHarness()
  assert.equal(typeof repository.evaluateStoreInviteUsability, "function")

  for (const expiresAt of [null, "not-a-date", FIXED_NOW]) {
    const result = repository.evaluateStoreInviteUsability({
      invite: inviteRow({ expires_at: expiresAt }),
      company: companyRow(),
      store: storeRow(),
      now: FIXED_NOW,
    })
    assert.equal(result.unusableReason, "expired", String(expiresAt))
  }
  assert.equal(
    repository.evaluateStoreInviteUsability({
      invite: inviteRow({ expires_at: new Date(FUTURE_EXPIRY) }),
      company: companyRow(),
      store: storeRow(),
      now: FIXED_NOW,
    }).usable,
    true,
  )

  const invalidCounters = [
    { max_uses: null },
    { max_uses: 0 },
    { max_uses: 1.5 },
    { max_uses: "3" },
    { used_count: null },
    { used_count: -1 },
    { used_count: 0.5 },
    { used_count: "0" },
    { used_count: Number.NaN },
  ]
  for (const counters of invalidCounters) {
    const result = repository.evaluateStoreInviteUsability({
      invite: inviteRow(counters),
      company: companyRow(),
      store: storeRow(),
      now: FIXED_NOW,
    })
    assert.equal(result.unusableReason, "exhausted", JSON.stringify(counters))
  }

  const topologyCases = [
    {
      name: "company_role_with_store",
      invite: inviteRow({ role: "company_admin", store_id: "store-1" }),
      company: companyRow(),
      store: storeRow(),
      reason: "role_denied",
    },
    {
      name: "company_role_with_empty_store",
      invite: inviteRow({ role: "company_admin", store_id: "" }),
      company: companyRow(),
      store: null,
      reason: "role_denied",
    },
    {
      name: "company_role_with_undefined_store",
      invite: inviteRow({ role: "company_admin", store_id: undefined }),
      company: companyRow(),
      store: null,
      reason: "role_denied",
    },
    {
      name: "store_role_without_store_id",
      invite: inviteRow({ store_id: null }),
      company: companyRow(),
      store: null,
      reason: "store_inactive",
    },
    {
      name: "missing_company",
      invite: inviteRow(),
      company: null,
      store: storeRow(),
      reason: "company_inactive",
    },
    {
      name: "missing_store",
      invite: inviteRow(),
      company: companyRow(),
      store: null,
      reason: "store_inactive",
    },
    {
      name: "cross_company_store",
      invite: inviteRow(),
      company: companyRow(),
      store: storeRow({ company_id: "company-2" }),
      reason: "store_inactive",
    },
  ]
  for (const item of topologyCases) {
    const result = repository.evaluateStoreInviteUsability({
      invite: item.invite,
      company: item.company,
      store: item.store,
      now: FIXED_NOW,
    })
    assert.deepEqual(
      result,
      { state: "unusable", usable: false, unusableReason: item.reason, validatedStoreId: null },
      item.name,
    )
  }
})

test("invite evaluator enforces the frozen max-use upper boundary", () => {
  const { repository } = repositoryHarness()

  assert.deepEqual(
    repository.evaluateStoreInviteUsability({
      invite: inviteRow({ max_uses: 200, used_count: 199 }),
      company: companyRow(),
      store: storeRow(),
      now: FIXED_NOW,
    }),
    { state: "usable", usable: true, unusableReason: null, validatedStoreId: "store-1" },
  )
  assert.deepEqual(
    repository.evaluateStoreInviteUsability({
      invite: inviteRow({ max_uses: 201, used_count: 199 }),
      company: companyRow(),
      store: storeRow(),
      now: FIXED_NOW,
    }),
    { state: "unusable", usable: false, unusableReason: "exhausted", validatedStoreId: null },
  )
})

test("preview returns the exact five-key usable envelope from resolved parents", async () => {
  let previewSql = ""
  let previewParams = []
  const row = previewQueryRow()
  const { counters, repository } = repositoryHarness({
    queryAliyunRds: async (sql, params) => {
      previewSql = compactSql(sql)
      previewParams = params
      return { rows: [row] }
    },
  })

  const preview = await withFixedNow(() => repository.getAliyunRdsStoreInvitePreview("safe-token"))

  assert.deepEqual(Object.keys(preview), ["ok", "state", "usable", "unusable_reason", "invite"])
  assert.deepEqual(
    { ok: preview.ok, state: preview.state, usable: preview.usable, reason: preview.unusable_reason },
    { ok: true, state: "usable", usable: true, reason: null },
  )
  assert.deepEqual(Object.keys(preview.invite), [
    "id",
    "role",
    "role_label",
    "max_uses",
    "used_count",
    "expires_at",
    "status",
    "note",
    "company_id",
    "company_name",
    "store_id",
    "store_name",
  ])
  assert.equal(preview.invite.company_id, "company-1")
  assert.equal(preview.invite.store_id, "store-1")
  assert.equal(preview.invite.store_name, "门店一")
  assert.match(previewSql, /company\.status as company_status/)
  assert.match(previewSql, /store\.id as store_row_id/)
  assert.match(previewSql, /store\.company_id = invite\.company_id/)
  assert.deepEqual(previewParams, [repository.hashAliyunRdsInviteToken("safe-token")])
  assert.equal(counters.topLevelQueries, 1)
})

test("preview exposes safe unusable reasons without raw parent identifiers", async () => {
  const cases = [
    {
      name: "role_denied",
      row: previewQueryRow({ invite: inviteRow({ role: "service_operator" }) }),
      reason: "role_denied",
    },
    {
      name: "inactive",
      row: previewQueryRow({ invite: inviteRow({ status: "revoked" }) }),
      reason: "inactive",
    },
    {
      name: "expired",
      row: previewQueryRow({ invite: inviteRow({ expires_at: PAST_EXPIRY }) }),
      reason: "expired",
    },
    {
      name: "exhausted",
      row: previewQueryRow({ invite: inviteRow({ max_uses: 1, used_count: 1 }) }),
      reason: "exhausted",
    },
    {
      name: "company_inactive",
      row: previewQueryRow({ company: companyRow({ status: "inactive" }) }),
      reason: "company_inactive",
    },
    {
      name: "company_missing",
      row: previewQueryRow({ company: null, store: null }),
      reason: "company_inactive",
    },
    {
      name: "store_inactive",
      row: previewQueryRow({ store: storeRow({ status: "inactive" }) }),
      reason: "store_inactive",
    },
    {
      name: "cross_company_store",
      row: previewQueryRow({
        invite: inviteRow({ store_id: "raw-cross-company-store" }),
        store: null,
      }),
      reason: "store_inactive",
    },
  ]

  for (const item of cases) {
    const { repository } = repositoryHarness({
      queryAliyunRds: async () => ({ rows: [item.row] }),
    })
    const preview = await withFixedNow(() => repository.getAliyunRdsStoreInvitePreview("safe-token"))
    assert.deepEqual(Object.keys(preview), ["ok", "state", "usable", "unusable_reason", "invite"])
    assert.equal(preview.state, "unusable", item.name)
    assert.equal(preview.usable, false, item.name)
    assert.equal(preview.unusable_reason, item.reason, item.name)
    if (item.name === "cross_company_store") {
      assert.equal(preview.invite.store_id, null)
      assert.equal(preview.invite.store_name, "")
      assert.equal(JSON.stringify(preview).includes("raw-cross-company-store"), false)
    }
    if (item.name === "company_missing") {
      assert.equal(preview.invite.company_id, null)
      assert.equal(preview.invite.company_name, "")
      assert.equal(preview.invite.store_id, null)
      assert.equal(preview.invite.store_name, "")
      assert.equal(JSON.stringify(preview).includes("company-1"), false)
      assert.equal(JSON.stringify(preview).includes("store-1"), false)
    }
  }
})

test("repository usability assertion reuses precise preview decisions", async () => {
  const cases = [
    { name: "usable", row: previewQueryRow(), expected: null },
    {
      name: "role_denied",
      row: previewQueryRow({ invite: inviteRow({ role: "service_operator" }) }),
      expected: { name: "StoreInviteHttpError", status: 403, code: "role_denied", reason: null },
    },
    {
      name: "expired",
      row: previewQueryRow({ invite: inviteRow({ expires_at: PAST_EXPIRY }) }),
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "expired" },
    },
  ]

  for (const item of cases) {
    const { repository } = repositoryHarness({ queryAliyunRds: async () => ({ rows: [item.row] }) })
    if (!item.expected) {
      const preview = await withFixedNow(() => repository.assertAliyunRdsStoreInviteUsable("safe-token"))
      assert.equal(preview.state, "usable")
      continue
    }
    let caught = null
    try {
      await withFixedNow(() => repository.assertAliyunRdsStoreInviteUsable("safe-token"))
    } catch (error) {
      caught = error
    }
    assert.deepEqual(errorObservation(caught), item.expected, item.name)
  }
})

test("preview route returns exact unknown-token and fixed internal-error envelopes", async () => {
  const unknownHarness = repositoryHarness({ queryAliyunRds: async () => ({ rows: [] }) })
  const unknownRoute = compilePreviewRoute(unknownHarness.repository)
  const unknownResponse = await unknownRoute.GET(
    request("https://local.invalid/api/app/store-admin/invites/unknown/preview"),
    { params: Promise.resolve({ token: "unknown-token" }) },
  )
  assert.equal(unknownResponse.status, 404)
  assert.deepEqual(unknownResponse.body, { ok: false, code: "invite_not_found" })
  assert.equal(JSON.stringify(unknownResponse.body).includes("unknown-token"), false)
  assert.equal(JSON.stringify(unknownResponse.body).includes("token_hash"), false)

  const baseRepository = repositoryHarness().repository
  const failingRoute = compilePreviewRoute(routeRepositoryStub(baseRepository, {
    getAliyunRdsStoreInvitePreview: async () => {
      throw new Error(RAW_MARKER)
    },
  }))
  const failingResponse = await failingRoute.GET(
    request("https://local.invalid/api/app/store-admin/invites/raw/preview"),
    { params: Promise.resolve({ token: "raw-token" }) },
  )
  assert.equal(failingResponse.status, 500)
  assert.deepEqual(failingResponse.body, { ok: false, code: "invite_preview_failed" })
  assert.equal(JSON.stringify(failingResponse.body).includes(RAW_MARKER), false)
})

test("accept route authenticates before resolving token params", async () => {
  const events = []
  let acceptCalls = 0
  const baseRepository = repositoryHarness().repository
  const route = compileAcceptRoute(routeRepositoryStub(baseRepository, {
    acceptAliyunRdsStoreInvite: async () => {
      acceptCalls += 1
      throw new Error("accept_must_not_run")
    },
  }), {
    resolveAliyunRdsAppAuthUser: async () => {
      events.push("auth")
      return null
    },
  })
  const params = {
    then(resolve) {
      events.push("params")
      resolve({ token: "anonymous-token" })
    },
  }

  const response = await route.POST(request("https://local.invalid/api/app/store-admin/invites/token/accept"), { params })

  assert.equal(response.status, 401)
  assert.deepEqual(response.body, { ok: false, code: "auth_required" })
  assert.deepEqual(events, ["auth"])
  assert.equal(acceptCalls, 0)
})

test("accept route maps suspended and inactive accounts to role_denied before params or repository writes", async () => {
  for (const accountStatus of ["suspended", "inactive"]) {
    const events = []
    const transaction = transactionClient({
      invite: inviteRow(),
      company: companyRow(),
      store: storeRow(),
      membership: membershipRow(),
      upsertedMembership: membershipRow(),
    })
    const { counters, repository } = repositoryHarness({ client: transaction.client })
    const route = compileAcceptRoute(repository, {
      resolveAliyunRdsAppAuthUser: async () => {
        events.push("auth")
        return { user: { id: "invitee-user" } }
      },
    }, {
      getAliyunRdsAppAccountContext: async () => {
        events.push("account")
        return appAccountContext({ accountStatus, userId: "invitee-user" })
      },
    })
    const params = {
      then(resolve) {
        events.push("params")
        resolve({ token: "sensitive-token" })
      },
    }

    const response = await route.POST(
      request("https://local.invalid/api/app/store-admin/invites/token/accept"),
      { params },
    )

    assert.deepEqual({
      status: response.status,
      body: response.body,
      events,
      transactionCalls: counters.transactionCalls,
      transactionWrites: transaction.writes,
    }, {
      status: 403,
      body: { ok: false, code: "role_denied" },
      events: ["auth", "account"],
      transactionCalls: 0,
      transactionWrites: [],
    }, accountStatus)
  }
})

test("accept route lets recovery account states reach a valid invite", async () => {
  const cases = [
    { name: "not_bound", accountStatus: "not_bound", role: null },
    { name: "customer", accountStatus: "role_denied", role: "customer" },
    { name: "unknown_role", accountStatus: "role_denied", role: "legacy_unknown_role" },
  ]

  for (const item of cases) {
    const events = []
    const baseRepository = repositoryHarness().repository
    const route = compileAcceptRoute(routeRepositoryStub(baseRepository, {
      acceptAliyunRdsStoreInvite: async () => {
        events.push("accept")
        return { ok: true, recovery: item.name }
      },
    }), {
      resolveAliyunRdsAppAuthUser: async () => {
        events.push("auth")
        return { user: { id: "invitee-user" } }
      },
    }, {
      getAliyunRdsAppAccountContext: async () => {
        events.push("account")
        return appAccountContext({
          accountStatus: item.accountStatus,
          role: item.role,
          userId: "invitee-user",
        })
      },
    })

    const response = await route.POST(
      request("https://local.invalid/api/app/store-admin/invites/token/accept"),
      { params: Promise.resolve({ token: "valid-token" }) },
    )

    assert.equal(response.status, 200, item.name)
    assert.deepEqual(response.body, { ok: true, recovery: item.name }, item.name)
    assert.deepEqual(events, ["auth", "account", "accept"], item.name)
  }
})

test("accept locks parents then rejects every unusable reason before membership work", async () => {
  const cases = [
    {
      name: "role_denied",
      invite: inviteRow({ role: "company_admin", store_id: "store-1" }),
      company: companyRow(),
      store: storeRow(),
      expected: { name: "StoreInviteHttpError", status: 403, code: "role_denied", reason: null },
    },
    {
      name: "inactive",
      invite: inviteRow({ status: "revoked" }),
      company: companyRow(),
      store: storeRow(),
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "inactive" },
    },
    {
      name: "expired",
      invite: inviteRow({ expires_at: PAST_EXPIRY }),
      company: companyRow(),
      store: storeRow(),
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "expired" },
    },
    {
      name: "exhausted",
      invite: inviteRow({ max_uses: 1, used_count: 1 }),
      company: companyRow(),
      store: storeRow(),
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "exhausted" },
    },
    {
      name: "company_inactive",
      invite: inviteRow(),
      company: companyRow({ status: "inactive" }),
      store: storeRow(),
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "company_inactive" },
    },
    {
      name: "store_inactive",
      invite: inviteRow(),
      company: companyRow(),
      store: storeRow({ status: "inactive" }),
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "store_inactive" },
    },
    {
      name: "company_missing",
      invite: inviteRow(),
      company: null,
      store: null,
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "company_inactive" },
    },
    {
      name: "store_missing",
      invite: inviteRow(),
      company: companyRow(),
      store: null,
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "store_inactive" },
    },
    {
      name: "cross_company_store",
      invite: inviteRow({ store_id: "raw-cross-company-store" }),
      company: companyRow(),
      store: null,
      expected: { name: "StoreInviteHttpError", status: 410, code: "invite_unusable", reason: "store_inactive" },
    },
  ]

  for (const item of cases) {
    const transaction = transactionClient({
      invite: item.invite,
      company: item.company,
      store: item.store,
      membership: membershipRow(),
    })
    const { counters, repository } = repositoryHarness({ client: transaction.client })
    let caught = null
    try {
      await withFixedNow(() => repository.acceptAliyunRdsStoreInvite("safe-token", { id: "invitee-user" }))
    } catch (error) {
      caught = error
    }
    assert.deepEqual(errorObservation(caught), item.expected, item.name)
    assert.deepEqual(
      transaction.trace,
      ["invite_for_update", "company_for_share", "store_for_share"],
      item.name,
    )
    assert.deepEqual(transaction.writes, [], item.name)
    assert.equal(counters.transactionCalls, 1, item.name)
    assert.equal(counters.accountContextReads, 0, item.name)
  }
})

test("accept unknown invite is exact 404 after only the invite lock", async () => {
  const transaction = transactionClient({ invite: null })
  const { repository } = repositoryHarness({ client: transaction.client })
  let caught = null
  try {
    await repository.acceptAliyunRdsStoreInvite("unknown-token", { id: "invitee-user" })
  } catch (error) {
    caught = error
  }
  assert.deepEqual(errorObservation(caught), {
    name: "StoreInviteHttpError",
    status: 404,
    code: "invite_not_found",
    reason: null,
  })
  assert.deepEqual(transaction.trace, ["invite_for_update"])
  assert.deepEqual(transaction.writes, [])
})

test("accept rejects a non-active matching membership without reactivation", async () => {
  const transaction = transactionClient({
    invite: inviteRow(),
    company: companyRow(),
    store: storeRow(),
    membership: membershipRow({ status: "suspended" }),
  })
  const { counters, repository } = repositoryHarness({ client: transaction.client })
  let caught = null
  try {
    await withFixedNow(() => repository.acceptAliyunRdsStoreInvite("safe-token", { id: "invitee-user" }))
  } catch (error) {
    caught = error
  }

  assert.deepEqual(errorObservation(caught), {
    name: "StoreInviteHttpError",
    status: 403,
    code: "role_denied",
    reason: null,
  })
  assert.deepEqual(transaction.trace, [
    "invite_for_update",
    "company_for_share",
    "store_for_share",
    "membership_for_update",
  ])
  assert.deepEqual(transaction.writes, [])
  assert.equal(counters.accountContextReads, 0)
})

test("accept fails closed when a concurrent membership conflict returns no active row", async () => {
  const transaction = transactionClient({
    invite: inviteRow(),
    company: companyRow(),
    store: storeRow(),
    membership: null,
    upsertedMembership: null,
  })
  const { counters, repository } = repositoryHarness({ client: transaction.client })
  let caught = null
  let result = null
  try {
    result = await withFixedNow(() => repository.acceptAliyunRdsStoreInvite("safe-token", { id: "invitee-user" }))
  } catch (error) {
    caught = error
  }

  assert.deepEqual(errorObservation(caught), {
    name: "StoreInviteHttpError",
    status: 403,
    code: "role_denied",
    reason: null,
  })
  assert.equal(result, null)
  assert.deepEqual(transaction.trace, [
    "invite_for_update",
    "company_for_share",
    "store_for_share",
    "membership_for_update",
    "membership_upsert",
  ])
  assert.deepEqual(transaction.writes, ["membership_upsert"])
  assert.equal(transaction.trace.includes("invite_update"), false)
  assert.equal(transaction.trace.includes("profile_update"), false)
  assert.equal(counters.accountContextReads, 0)
})

test("usable accept preserves active duplicate counting and active-only upsert defenses", async () => {
  const cases = [
    {
      name: "store_role",
      invite: inviteRow(),
      store: storeRow(),
      membership: membershipRow(),
      upsertedMembership: membershipRow(),
      expectedTrace: [
        "invite_for_update",
        "company_for_share",
        "store_for_share",
        "membership_for_update",
        "membership_upsert",
        "invite_update",
        "profile_update",
      ],
      expectedStoreId: "store-1",
      expectedStoreName: "门店一",
      conflictPredicate: "where store_id is not null",
      expectedMembershipLockParams: ["invitee-user", "company-1", "store-1", "employee"],
      expectedMembershipUpsertParams: ["invitee-user", "company-1", "store-1", "employee", FIXED_NOW],
      expectedStoreQueryParams: ["store-1", "company-1"],
    },
    {
      name: "company_role",
      invite: inviteRow({ role: "company_admin", store_id: null }),
      store: null,
      membership: membershipRow({ store_id: null, role: "company_admin" }),
      upsertedMembership: membershipRow({ store_id: null, role: "company_admin" }),
      expectedTrace: [
        "invite_for_update",
        "company_for_share",
        "membership_for_update",
        "membership_upsert",
        "invite_update",
        "profile_update",
      ],
      expectedStoreId: null,
      expectedStoreName: null,
      conflictPredicate: "where store_id is null",
      expectedMembershipLockParams: ["invitee-user", "company-1", "company_admin"],
      expectedMembershipUpsertParams: ["invitee-user", "company-1", "company_admin", FIXED_NOW],
      expectedStoreQueryParams: null,
    },
  ]

  for (const item of cases) {
    const transaction = transactionClient({
      invite: item.invite,
      company: companyRow(),
      store: item.store,
      membership: item.membership,
      upsertedMembership: item.upsertedMembership,
    })
    const { counters, repository } = repositoryHarness({ client: transaction.client })
    const result = await withFixedNow(() => repository.acceptAliyunRdsStoreInvite("safe-token", { id: "invitee-user" }))

    assert.deepEqual(transaction.trace, item.expectedTrace, item.name)
    assert.deepEqual(transaction.writes, ["membership_upsert", "invite_update", "profile_update"], item.name)
    assert.equal(transaction.trace.filter((step) => step === "invite_update").length, 1, item.name)
    assert.equal(counters.accountContextReads, 0, item.name)
    assert.equal(Object.prototype.hasOwnProperty.call(result, "context"), false, item.name)
    assert.equal(result.ok, true, item.name)

    const inviteLookup = transaction.statements.find((statement) => statement.text.includes("from public.mp_account_invites"))
    const companyQuery = transaction.statements.find((statement) => statement.text.includes("from public.mp_companies"))
    const storeQuery = transaction.statements.find((statement) => statement.text.includes("from public.mp_stores"))
    const membershipLock = transaction.statements.find((statement) => statement.text.includes("from public.mp_account_memberships"))
    const membershipUpsert = transaction.statements.find((statement) => statement.text.startsWith("insert into public.mp_account_memberships"))
    const profileUpdate = transaction.statements.find((statement) => statement.text.startsWith("update public.profiles"))
    assert.ok(inviteLookup, item.name)
    assert.ok(companyQuery, item.name)
    assert.ok(membershipLock, item.name)
    assert.ok(membershipUpsert, item.name)
    assert.ok(profileUpdate, item.name)
    assert.equal(inviteLookup.params.length, 1, item.name)
    assert.match(inviteLookup.params[0], /^[0-9a-f]{64}$/, item.name)
    assert.notEqual(inviteLookup.params[0], "safe-token", item.name)
    assert.equal(inviteLookup.params[0], repository.hashAliyunRdsInviteToken("safe-token"), item.name)
    assert.deepEqual(companyQuery.params, ["company-1"], item.name)
    if (item.expectedStoreQueryParams) {
      assert.ok(storeQuery, item.name)
      assert.deepEqual(storeQuery.params, item.expectedStoreQueryParams, item.name)
    } else {
      assert.equal(storeQuery, undefined, item.name)
    }
    assert.match(membershipLock.text, /for update$/)
    assert.deepEqual(membershipLock.params, item.expectedMembershipLockParams, item.name)
    assert.match(membershipUpsert.text, new RegExp(item.conflictPredicate))
    assert.match(membershipUpsert.text, /do update .* where (?:public\.)?mp_account_memberships\.status = 'active'/)
    assert.doesNotMatch(membershipUpsert.text, /set status = 'active'/)
    assert.deepEqual(membershipUpsert.params, item.expectedMembershipUpsertParams, item.name)
    assert.equal(profileUpdate.params[4], item.expectedStoreId, item.name)
    assert.equal(profileUpdate.params[5], item.expectedStoreName, item.name)
  }
})

test("accept route emits exact contract errors and hides unknown exception markers", async () => {
  const baseRepository = repositoryHarness().repository
  const unsafeReasonError = new baseRepository.StoreInviteHttpError(
    410,
    RAW_MARKER,
    "invite_unusable",
    RAW_MARKER,
  )
  assert.equal(unsafeReasonError.reason, null)
  const cases = [
    {
      name: "not_found",
      error: new baseRepository.StoreInviteHttpError(404, RAW_MARKER, "invite_not_found"),
      expectedStatus: 404,
      expectedBody: { ok: false, code: "invite_not_found" },
    },
    {
      name: "role_denied",
      error: new baseRepository.StoreInviteHttpError(403, RAW_MARKER, "role_denied", "expired"),
      expectedStatus: 403,
      expectedBody: { ok: false, code: "role_denied" },
    },
    {
      name: "unusable",
      error: new baseRepository.StoreInviteHttpError(410, RAW_MARKER, "invite_unusable", "expired"),
      expectedStatus: 410,
      expectedBody: { ok: false, code: "invite_unusable", reason: "expired" },
    },
    {
      name: "unsafe_reason",
      error: unsafeReasonError,
      expectedStatus: 410,
      expectedBody: { ok: false, code: "invite_unusable" },
    },
    {
      name: "unknown",
      error: new Error(RAW_MARKER),
      expectedStatus: 500,
      expectedBody: { ok: false, code: "invite_accept_failed" },
    },
  ]

  for (const item of cases) {
    const route = compileAcceptRoute(routeRepositoryStub(baseRepository, {
      acceptAliyunRdsStoreInvite: async () => {
        throw item.error
      },
    }))
    const response = await route.POST(
      request("https://local.invalid/api/app/store-admin/invites/token/accept"),
      { params: Promise.resolve({ token: "raw-token" }) },
    )
    assert.equal(response.status, item.expectedStatus, item.name)
    assert.deepEqual(response.body, item.expectedBody, item.name)
    assert.equal(JSON.stringify(response.body).includes(RAW_MARKER), false, item.name)
    assert.equal(JSON.stringify(response.body).includes("raw-token"), false, item.name)
  }
})

test("QR rejects before code generation and hides post-scene exception markers", async () => {
  const baseRepository = repositoryHarness().repository
  let codegenCalls = 0
  const unknownRoute = compileQrcodeRoute(routeRepositoryStub(baseRepository, {
    assertAliyunRdsStoreInviteUsable: async () => {
      throw new baseRepository.StoreInviteHttpError(404, RAW_MARKER, "invite_not_found")
    },
  }), async () => {
    codegenCalls += 1
    throw new Error("codegen_must_not_run")
  })
  const unknownResponse = await unknownRoute.GET(
    request("https://local.invalid/api/app/store-admin/invites/raw/qrcode"),
    { params: Promise.resolve({ token: "raw-scene-token" }) },
  )
  assert.equal(unknownResponse.status, 404)
  assert.deepEqual(unknownResponse.body, { ok: false, code: "invite_not_found" })
  assert.equal(codegenCalls, 0)

  const deniedRoute = compileQrcodeRoute(routeRepositoryStub(baseRepository, {
    assertAliyunRdsStoreInviteUsable: async () => {
      throw new baseRepository.StoreInviteHttpError(410, RAW_MARKER, "invite_unusable", "store_inactive")
    },
  }), async () => {
    codegenCalls += 1
    throw new Error("codegen_must_not_run")
  })
  const deniedResponse = await deniedRoute.GET(
    request("https://local.invalid/api/app/store-admin/invites/raw/qrcode"),
    { params: Promise.resolve({ token: "raw-scene-token" }) },
  )
  assert.equal(deniedResponse.status, 410)
  assert.deepEqual(deniedResponse.body, {
    ok: false,
    code: "invite_unusable",
    reason: "store_inactive",
  })
  assert.equal(codegenCalls, 0)

  let observedScene = null
  const failingRoute = compileQrcodeRoute(routeRepositoryStub(baseRepository, {
    assertAliyunRdsStoreInviteUsable: async () => ({ usable: true }),
  }), async (args) => {
    codegenCalls += 1
    observedScene = args.scene
    throw new Error(`${RAW_MARKER}:${args.scene}`)
  })
  const failingResponse = await failingRoute.GET(
    request("https://local.invalid/api/app/store-admin/invites/raw/qrcode"),
    { params: Promise.resolve({ token: "raw-scene-token" }) },
  )
  assert.equal(observedScene, "raw-scene-token")
  assert.equal(failingResponse.status, 500)
  assert.deepEqual(failingResponse.body, { ok: false, code: "qrcode_create_failed" })
  assert.equal(JSON.stringify(failingResponse.body).includes(RAW_MARKER), false)
  assert.equal(JSON.stringify(failingResponse.body).includes("raw-scene-token"), false)
})

test("create rejects company role with store before any query or insert", async () => {
  const { counters, repository } = repositoryHarness({
    queryAliyunRds: async () => {
      throw new Error("database_query_forbidden")
    },
  })
  const route = compileCreateRoute(repository)
  const response = await route.POST(request("https://local.invalid/api/app/store-admin/invites", {
    role: "company_admin",
    store_id: "store-1",
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(response.body, { ok: false, code: "store_id_not_allowed" })
  assert.equal(counters.topLevelQueries, 0)
})

test("create defaults a truly omitted role to staff", async () => {
  let insertParams = null
  const { counters, repository } = repositoryHarness({
    queryAliyunRds: async (sql, params) => {
      const text = compactSql(sql)
      if (text.includes("from public.mp_companies")) return { rows: [companyRow()] }
      if (text.includes("from public.mp_stores")) return { rows: [storeRow()] }
      if (text.startsWith("insert into public.mp_account_invites")) {
        insertParams = params
        return { rows: [inviteRow({ role: params[2] })] }
      }
      throw new Error(`unexpected invite create query: ${text}`)
    },
  })

  const result = await repository.createAliyunRdsStoreInvite({
    ctx: appAccountContext(),
    user: { id: "manager-user" },
    body: { store_id: "store-1" },
  })

  assert.equal(result.ok, true)
  assert.equal(result.invite.role, "staff")
  assert.equal(insertParams[2], "staff")
  assert.equal(counters.topLevelQueries, 3)
  assert.equal(counters.transactionCalls, 0)
})

test("create rejects every explicitly malformed role before database access", async (t) => {
  const malformedRoles = [
    { name: "undefined", value: undefined },
    { name: "number", value: 0 },
    { name: "boolean", value: false },
    { name: "null", value: null },
    { name: "array", value: ["staff"] },
    { name: "object", value: { role: "staff" } },
    { name: "empty", value: "" },
    { name: "whitespace", value: " \t\n " },
  ]

  for (const item of malformedRoles) {
    await t.test(item.name, async () => {
      const { counters, repository } = repositoryHarness({
        queryAliyunRds: async () => {
          throw new Error("database_query_forbidden")
        },
      })
      const route = compileCreateRoute(repository)

      const response = await route.POST(request("https://local.invalid/api/app/store-admin/invites", {
        role: item.value,
        store_id: "store-1",
      }))

      assert.equal(response.status, 403)
      assert.deepEqual(response.body, { ok: false, code: "role_not_allowed" })
      assert.equal(counters.topLevelQueries, 0)
      assert.equal(counters.transactionCalls, 0)
    })
  }
})

test("create route projects the exact App success contract without repository context", async () => {
  const baseRepository = repositoryHarness().repository
  const invite = {
    ...inviteRow(),
    role_label: "员工",
    company_name: "公司一",
    store_name: "门店一",
  }
  const route = compileCreateRoute(routeRepositoryStub(baseRepository, {
    createAliyunRdsStoreInvite: async () => ({
      ok: true,
      context: { unsafe_repository_context: RAW_MARKER },
      invite,
      token: "fixture-invite-token",
      path: "/pages/store-admin/invite-accept/index?token=fixture-invite-token",
    }),
  }))

  const response = await route.POST(request("https://local.invalid/api/app/store-admin/invites", {
    role: "employee",
    store_id: "store-1",
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    ok: true,
    invite,
    token: "fixture-invite-token",
    path: "/pages/store-admin/invite-accept/index?token=fixture-invite-token",
  })
  assert.equal(JSON.stringify(response.body).includes(RAW_MARKER), false)
})

test("create route returns code-only errors without raw exception markers", async () => {
  const baseRepository = repositoryHarness().repository
  const runtimeError = new Error(RAW_MARKER)
  const cases = [
    {
      name: "known_invite_error",
      error: new baseRepository.StoreInviteHttpError(400, RAW_MARKER, "store_id_required"),
      expectedStatus: 400,
      expectedBody: { ok: false, code: "store_id_required" },
      postgresOverrides: {},
    },
    {
      name: "configuration_error",
      error: new AliyunRdsConfigurationError(RAW_MARKER),
      expectedStatus: 503,
      expectedBody: { ok: false, code: "rds_not_configured" },
      postgresOverrides: {},
    },
    {
      name: "runtime_error",
      error: runtimeError,
      expectedStatus: 503,
      expectedBody: { ok: false, code: "rds_unavailable" },
      postgresOverrides: {
        isAliyunRdsRuntimeUnavailableError: (error) => error === runtimeError,
      },
    },
    {
      name: "unknown_error",
      error: new Error(RAW_MARKER),
      expectedStatus: 500,
      expectedBody: { ok: false, code: "invite_create_failed" },
      postgresOverrides: {},
    },
  ]

  for (const item of cases) {
    const route = compileCreateRoute(routeRepositoryStub(baseRepository, {
      createAliyunRdsStoreInvite: async () => {
        throw item.error
      },
    }), item.postgresOverrides)

    const response = await route.POST(request("https://local.invalid/api/app/store-admin/invites", {
      role: "employee",
      store_id: "store-1",
    }))

    assert.equal(response.status, item.expectedStatus, item.name)
    assert.deepEqual(response.body, item.expectedBody, item.name)
    assert.equal(JSON.stringify(response.body).includes(RAW_MARKER), false, item.name)
  }
})
