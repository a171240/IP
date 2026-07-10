/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const repositoryPath = path.join(root, "lib", "aliyun-rds", "repositories", "account-profile.server.ts")
const contractPath = path.join(root, "contracts", "app-account-access-v1.json")

const exactMembershipKeys = [
  "company_id",
  "company_name",
  "id",
  "is_active",
  "joined_at",
  "role",
  "role_label",
  "scope",
  "status",
  "store_id",
  "store_name",
  "user_id",
].sort()

function profileRow(overrides = {}) {
  return {
    id: "user-1",
    email: "user-1@example.invalid",
    nickname: "测试用户",
    avatar_url: null,
    plan: "free",
    credits_balance: 0,
    credits_unlimited: false,
    trial_granted_at: null,
    account_role: null,
    company_id: null,
    company_name: null,
    store_id: null,
    store_name: null,
    service_plan_label: null,
    ...overrides,
  }
}

function membershipRow(overrides = {}) {
  const companyId = Object.prototype.hasOwnProperty.call(overrides, "company_id")
    ? overrides.company_id
    : "company-1"
  const storeId = Object.prototype.hasOwnProperty.call(overrides, "store_id") ? overrides.store_id : "store-1"
  return {
    id: "membership-1",
    user_id: "user-1",
    company_id: companyId,
    company_name: companyId ? "春舍公司" : null,
    company_status: companyId ? "active" : null,
    store_id: storeId,
    store_name: storeId ? "春舍一店" : null,
    store_status: storeId ? "active" : null,
    store_company_id: storeId ? companyId : null,
    role: "employee",
    status: "active",
    display_name: null,
    accepted_at: "2026-07-01T09:00:00.000Z",
    last_seen_at: null,
    created_at: "2026-07-01T08:00:00.000Z",
    ...overrides,
  }
}

function compileRepository(queryAliyunRds) {
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
    if (moduleId === "@/lib/aliyun-rds/postgres.server") return { queryAliyunRds }
    if (moduleId === "@/lib/pricing/rules") {
      return {
        normalizePlan(value) {
          return ["free", "basic", "pro", "vip"].includes(value) ? value : "free"
        },
      }
    }
    return require(moduleId)
  }
  compiledModule._compile(compiled, repositoryPath)
  return compiledModule.exports
}

function repositoryHarness({ profile = profileRow(), memberships = [], entitlement = null, billingOwners = [] } = {}) {
  const sqlLog = []
  const queryAliyunRds = async (sql) => {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim()
    sqlLog.push(normalizedSql)

    if (normalizedSql.includes("join public.profiles profile")) return { rows: billingOwners }
    if (normalizedSql.includes("from public.mp_account_memberships membership")) return { rows: memberships }
    if (normalizedSql.includes("from public.entitlements")) return { rows: entitlement ? [entitlement] : [] }
    if (normalizedSql.includes("from public.profiles where id")) return { rows: profile ? [profile] : [] }

    throw new Error(`unexpected SQL in account test: ${normalizedSql}`)
  }

  return { repository: compileRepository(queryAliyunRds), sqlLog }
}

function assertNoMutationSql(sqlLog) {
  assert.ok(sqlLog.length > 0)
  for (const sql of sqlLog) {
    assert.match(sql, /^select\b/i)
    assert.doesNotMatch(sql, /\b(insert|update|delete|merge|truncate)\b/i)
  }
}

test("frozen APP G1 contract declares the exact role and recovery boundaries", () => {
  assert.equal(fs.existsSync(contractPath), true)
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"))

  assert.equal(contract.schema_version, 1)
  assert.equal(contract.api_contract_id, "APP_G1_ACCOUNT_ACCESS_V1")
  assert.deepEqual(contract.role_policy.normalized_role_map, {
    company_owner: "company_admin",
    company_admin: "company_admin",
    merchant_owner: "company_admin",
    merchant_admin: "company_admin",
    store_owner: "store_manager",
    store_admin: "store_manager",
    staff: "employee",
    employee: "employee",
    customer: "customer",
  })
  assert.deepEqual(contract.role_policy.untrusted_membership_aliases, [
    "store_manager",
    "platform_admin",
    "service_operator",
  ])
  assert.deepEqual(contract.feature_policy.recovery_keys, ["auth", "account"])
  assert.equal(contract.feature_policy.missing_feature_decision, "entitlement_denied")
})

test("all frozen raw tenant roles remain selectable and project exact snake-case memberships", async () => {
  const cases = [
    { role: "company_owner", scope: "company", store_id: null },
    { role: "company_admin", scope: "company", store_id: null },
    { role: "merchant_owner", scope: "company", store_id: null },
    { role: "merchant_admin", scope: "company", store_id: null },
    { role: "store_owner", scope: "store", store_id: "store-1" },
    { role: "store_admin", scope: "store", store_id: "store-1" },
    { role: "staff", scope: "store", store_id: "store-1" },
    { role: "employee", scope: "store", store_id: "store-1" },
  ]

  for (const accountCase of cases) {
    const { repository } = repositoryHarness({
      memberships: [membershipRow({ role: accountCase.role, store_id: accountCase.store_id })],
    })
    const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })
    const snapshot = repository.accountContextPayload(context)

    assert.equal(context.accountStatus, "bound", accountCase.role)
    assert.equal(context.role, accountCase.role, accountCase.role)
    assert.equal(snapshot.account_status, "bound", accountCase.role)
    assert.equal(snapshot.memberships[0].role, accountCase.role, accountCase.role)
    assert.equal(snapshot.memberships[0].scope, accountCase.scope, accountCase.role)
    assert.deepEqual(Object.keys(snapshot.memberships[0]).sort(), exactMembershipKeys, accountCase.role)
  }
})

test("store-scoped roles require an active store in their membership company", async () => {
  for (const role of ["store_owner", "store_admin", "staff", "employee"]) {
    const { repository } = repositoryHarness({
      memberships: [membershipRow({ role, store_id: null })],
    })
    const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })

    assert.equal(context.accountStatus, "inactive", role)
    assert.equal(context.role, null, role)
    assert.equal(context.membershipId, null, role)
    assert.equal(context.companyId, null, role)
    assert.equal(context.storeId, null, role)
    assert.deepEqual(repository.accountContextPayload(context).memberships, [], role)
  }
})

test("company-scoped roles never inherit store scope from a stray store pointer", async () => {
  for (const role of ["company_owner", "company_admin", "merchant_owner", "merchant_admin"]) {
    const { repository } = repositoryHarness({
      memberships: [membershipRow({ role, store_id: "store-1" })],
    })
    const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })
    const membership = repository.accountContextPayload(context).memberships[0]

    assert.equal(context.accountStatus, "bound", role)
    assert.equal(context.storeId, null, role)
    assert.equal(membership.scope, "company", role)
    assert.equal(membership.store_id, null, role)
    assert.equal(membership.store_name, null, role)
  }
})

test("company-scoped roles reject inactive or cross-company store pointers", async () => {
  const invalidStorePointers = [
    { store_status: "inactive" },
    { store_company_id: "different-company" },
  ]

  for (const role of ["company_owner", "company_admin", "merchant_owner", "merchant_admin"]) {
    for (const invalidStore of invalidStorePointers) {
      const { repository } = repositoryHarness({
        memberships: [membershipRow({ role, ...invalidStore })],
      })
      const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })

      assert.equal(context.accountStatus, "inactive", `${role}:${JSON.stringify(invalidStore)}`)
      assert.equal(context.role, null, role)
      assert.equal(context.membershipId, null, role)
      assert.equal(context.companyId, null, role)
      assert.equal(context.storeId, null, role)
      assert.deepEqual(repository.accountContextPayload(context).memberships, [], role)
    }
  }
})

test("unknown and App-only membership aliases fail closed without tenant scope", async () => {
  for (const role of ["unknown_role", "store_manager", "platform_admin", "service_operator", null]) {
    const { repository } = repositoryHarness({ memberships: [membershipRow({ role })] })
    const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })

    assert.equal(context.accountStatus, "role_denied", String(role))
    assert.equal(context.role, null, String(role))
    assert.equal(context.companyId, null, String(role))
    assert.equal(context.storeId, null, String(role))
    assert.equal(context.membershipId, null, String(role))
    assert.deepEqual(repository.accountContextPayload(context).memberships, [], String(role))
    assert.equal(context.isPlatformAdmin, false, String(role))
  }
})

test("an active customer remains visible only as a non-tenant identity", async () => {
  const { repository } = repositoryHarness({
    memberships: [membershipRow({ role: "customer", company_id: null, store_id: null })],
  })
  const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })
  const snapshot = repository.accountContextPayload(context)

  assert.equal(context.accountStatus, "role_denied")
  assert.equal(context.role, "customer")
  assert.equal(context.membershipId, null)
  assert.equal(context.companyId, null)
  assert.equal(context.storeId, null)
  assert.equal(snapshot.memberships.length, 1)
  assert.equal(snapshot.memberships[0].scope, "customer")
  assert.equal(snapshot.memberships[0].role, "customer")
})

test("legacy profile tenant fields never grant scope without a valid membership", async () => {
  const { repository } = repositoryHarness({
    profile: profileRow({
      account_role: "company_owner",
      company_id: "stale-company",
      company_name: "旧公司",
      store_id: "stale-store",
      store_name: "旧门店",
    }),
  })
  const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })

  assert.equal(context.accountStatus, "not_bound")
  assert.equal(context.role, null)
  assert.equal(context.membershipId, null)
  assert.equal(context.companyId, null)
  assert.equal(context.companyName, null)
  assert.equal(context.storeId, null)
  assert.equal(context.storeName, null)
})

test("suspended and inactive membership states take precedence without exposing scope", async () => {
  const suspendedHarness = repositoryHarness({
    memberships: [
      membershipRow({ id: "pending", status: "pending" }),
      membershipRow({ id: "suspended", status: "suspended" }),
    ],
  })
  const suspended = await suspendedHarness.repository.getAliyunRdsAppAccountContext({ id: "user-1" })
  assert.equal(suspended.accountStatus, "suspended")
  assert.equal(suspended.companyId, null)
  assert.deepEqual(suspended.memberships, [])

  for (const status of ["pending", "revoked"]) {
    const { repository } = repositoryHarness({ memberships: [membershipRow({ status })] })
    const inactive = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })
    assert.equal(inactive.accountStatus, "inactive", status)
    assert.equal(inactive.companyId, null, status)
    assert.deepEqual(inactive.memberships, [], status)
  }
})

test("inactive or mismatched company and store parents invalidate active memberships", async () => {
  const invalidParents = [
    membershipRow({ company_status: "inactive" }),
    membershipRow({ store_status: "inactive" }),
    membershipRow({ store_company_id: "different-company" }),
  ]

  for (const row of invalidParents) {
    const { repository } = repositoryHarness({ memberships: [row] })
    const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })
    assert.equal(context.accountStatus, "inactive")
    assert.equal(context.membershipId, null)
    assert.equal(context.companyId, null)
    assert.equal(context.storeId, null)
  }
})

test("profile pointers select only inside the valid candidate set", async () => {
  const { repository } = repositoryHarness({
    profile: profileRow({ company_id: "company-1", store_id: "stale-store" }),
    memberships: [
      membershipRow({
        id: "higher-priority",
        role: "company_owner",
        store_id: null,
        created_at: "2026-07-03T08:00:00.000Z",
      }),
      membershipRow({
        id: "profile-selected",
        role: "employee",
        store_id: "store-selected",
        store_name: "选中门店",
        store_company_id: "company-1",
        created_at: "2026-07-01T08:00:00.000Z",
      }),
      membershipRow({
        id: "invalid-pointer",
        role: "store_owner",
        store_id: "stale-store",
        store_company_id: "company-1",
        store_status: "inactive",
      }),
    ],
  })
  const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })

  assert.equal(context.membershipId, "higher-priority")
  assert.equal(context.storeId, null)
  assert.equal(context.role, "company_owner")
})

test("candidate selection uses role priority, newest creation time, then lexical id", async () => {
  const priorityHarness = repositoryHarness({
    memberships: [
      membershipRow({ id: "employee-new", role: "employee", created_at: "2026-07-05T00:00:00.000Z" }),
      membershipRow({ id: "admin-old", role: "store_admin", created_at: "2026-07-01T00:00:00.000Z" }),
    ],
  })
  const priority = await priorityHarness.repository.getAliyunRdsAppAccountContext({ id: "user-1" })
  assert.equal(priority.membershipId, "admin-old")

  const tieHarness = repositoryHarness({
    memberships: [
      membershipRow({ id: "z-membership", created_at: "2026-07-02T00:00:00.000Z" }),
      membershipRow({ id: "b-membership", created_at: "2026-07-03T00:00:00.000Z" }),
      membershipRow({ id: "a-membership", created_at: "2026-07-03T00:00:00.000Z" }),
    ],
  })
  const tie = await tieHarness.repository.getAliyunRdsAppAccountContext({ id: "user-1" })
  assert.equal(tie.membershipId, "a-membership")
})

test("candidate timestamps from pg Date values sort chronologically and serialize joined_at", async () => {
  const newerCreatedAt = new Date("2026-01-05T08:00:00.000Z")
  const newerJoinedAt = new Date("2026-01-03T08:00:00.000Z")
  const { repository } = repositoryHarness({
    memberships: [
      membershipRow({
        id: "older-sunday",
        accepted_at: new Date("2026-01-02T08:00:00.000Z"),
        created_at: new Date("2026-01-04T08:00:00.000Z"),
      }),
      membershipRow({
        id: "newer-monday",
        accepted_at: newerJoinedAt,
        created_at: newerCreatedAt,
      }),
    ],
  })
  const context = await repository.getAliyunRdsAppAccountContext({ id: "user-1" })
  const selected = repository.accountContextPayload(context).memberships.find(
    (membership) => membership.id === context.membershipId,
  )

  assert.equal(context.membershipId, "newer-monday")
  assert.equal(selected.joined_at, newerJoinedAt.toISOString())
  assert.equal(typeof selected.joined_at, "string")
})

test("only a server allowlist can produce platform authority", async (t) => {
  const envKeys = [
    "MP_PLATFORM_ADMIN_EMAILS",
    "ADMIN_EMAILS",
    "PLATFORM_ADMIN_EMAILS",
    "MP_PLATFORM_ADMIN_USER_IDS",
    "ADMIN_USER_IDS",
    "PLATFORM_ADMIN_USER_IDS",
  ]
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
  process.env.MP_PLATFORM_ADMIN_USER_IDS = "allowlisted-user"
  t.after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  const { repository } = repositoryHarness({ profile: profileRow({ account_role: "service_operator" }) })
  const untrusted = await repository.getAliyunRdsAppAccountContext({ id: "ordinary-user" })
  assert.equal(untrusted.accountStatus, "role_denied")
  assert.equal(untrusted.isPlatformAdmin, false)
  assert.equal(untrusted.role, null)
  assert.equal(untrusted.companyId, null)
  assert.equal(untrusted.storeId, null)

  const trusted = await repository.getAliyunRdsAppAccountContext({ id: "allowlisted-user" })
  assert.equal(trusted.accountStatus, "bound")
  assert.equal(trusted.role, "platform_admin")
  assert.equal(trusted.isPlatformAdmin, true)
  assert.equal(trusted.membershipId, null)
  assert.equal(trusted.companyId, null)
  assert.equal(trusted.storeId, null)
})

test("missing profile produces a complete in-memory empty display shell without a write", async () => {
  const { repository, sqlLog } = repositoryHarness({ profile: null })
  const response = await repository.getAliyunRdsAppProfileResponse({
    id: "user-without-profile",
    email: "private@example.invalid",
    user_metadata: { account_role: "company_owner", company_id: "stale-company" },
  })

  assert.equal(response.account.account_status, "not_bound")
  assert.deepEqual(response.profile, {
    plan: "free",
    plan_label: "体验服务",
    service_plan_label: "体验服务",
    credits_balance: 0,
    credits_unlimited: false,
    ai_points_balance: 0,
    ai_points_unlimited: false,
    billing_owner_label: null,
    billing_scope: null,
    trial_granted_at: null,
    account_role: null,
    account_role_label: "当前账号",
    company_id: null,
    company_name: null,
    store_id: null,
    store_name: null,
    nickname: null,
    avatar_url: null,
  })
  assert.equal(JSON.stringify(response).includes("private@example.invalid"), false)
  assertNoMutationSql(sqlLog)
})

test("both exported account reads issue SELECT statements only", async () => {
  const profileHarness = repositoryHarness({
    profile: profileRow({ plan: "vip", credits_unlimited: false }),
    memberships: [membershipRow()],
    entitlement: { plan: "vip", pro_expires_at: null },
  })
  const profileResponse = await profileHarness.repository.getAliyunRdsAppProfileResponse({ id: "user-1" })
  assert.equal(profileResponse.profile.ai_points_unlimited, false)
  assertNoMutationSql(profileHarness.sqlLog)

  const contextHarness = repositoryHarness({ memberships: [membershipRow({ role: "store_admin" })] })
  await contextHarness.repository.getAliyunRdsAppAccountContext({ id: "user-1" })
  assertNoMutationSql(contextHarness.sqlLog)
})
