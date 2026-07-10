/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const ts = require("typescript")

const root = process.cwd()
const authorizationPath = path.join(root, "lib", "aliyun-rds", "app-authorization.server.ts")
const contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "app-account-access-v1.json"), "utf8"))

let cachedAuthorization = null

function authorizationModule() {
  assert.equal(fs.existsSync(authorizationPath), true, "app authorization module must exist")
  if (cachedAuthorization) return cachedAuthorization

  const source = fs.readFileSync(authorizationPath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: authorizationPath,
  }).outputText
  const compiledModule = new Module(authorizationPath, module)
  compiledModule.filename = authorizationPath
  compiledModule.paths = Module._nodeModulePaths(path.dirname(authorizationPath))
  compiledModule.require = (moduleId) => (moduleId === "server-only" ? {} : require(moduleId))
  compiledModule._compile(compiled, authorizationPath)
  cachedAuthorization = compiledModule.exports
  return cachedAuthorization
}

function account(overrides = {}) {
  return {
    accountStatus: "bound",
    userId: "user-1",
    membershipId: "membership-1",
    role: "employee",
    companyId: "company-1",
    storeId: "store-1",
    isCompanyManager: false,
    isStoreManager: false,
    isPlatformAdmin: false,
    ...overrides,
  }
}

const positivePoints = { aiPointsBalance: 12, aiPointsUnlimited: false }
const unlimitedPoints = { aiPointsBalance: 0, aiPointsUnlimited: true }
const zeroPoints = { aiPointsBalance: 0, aiPointsUnlimited: false }

function assertFeatures(decisions, keys, expected) {
  for (const key of keys) assert.deepEqual(decisions[key], expected, key)
}

test("authorization module exports the ordinary Task 2 responsibilities", () => {
  const authorization = authorizationModule()
  for (const exportName of [
    "buildAppFeatureDecisions",
    "getAppFeatureDecision",
    "requireAppFeatureAccess",
    "canAccessAppTenantScope",
    "appAuthorizationErrorResponse",
    "normalizeAppAccountRole",
  ]) {
    assert.equal(typeof authorization[exportName], "function", exportName)
  }
})

test("raw roles normalize exactly and untrusted aliases remain denied", () => {
  const authorization = authorizationModule()
  for (const [rawRole, normalizedRole] of Object.entries(contract.role_policy.normalized_role_map)) {
    assert.equal(authorization.normalizeAppAccountRole(rawRole, false), normalizedRole, rawRole)
  }

  for (const rawRole of ["service_operator", "store_manager", "platform_admin", "unknown_role", null]) {
    assert.equal(authorization.normalizeAppAccountRole(rawRole, false), "guest", String(rawRole))
    const decisions = authorization.buildAppFeatureDecisions(
      account({ accountStatus: "role_denied", role: rawRole, membershipId: null, companyId: null, storeId: null }),
      positivePoints,
    )
    assertFeatures(
      decisions,
      contract.feature_policy.all_keys.filter((feature) => !contract.feature_policy.recovery_keys.includes(feature)),
      { enabled: false, reason: "role_denied", source: "account" },
    )
  }

  assert.equal(authorization.normalizeAppAccountRole("platform_admin", true), "platform_admin")
})

test("employee with active scope and positive points receives base and AI features only", () => {
  const authorization = authorizationModule()
  const decisions = authorization.buildAppFeatureDecisions(account(), positivePoints)

  assertFeatures(decisions, contract.feature_policy.recovery_keys, {
    enabled: true,
    reason: "ok",
    source: "account",
  })
  assertFeatures(decisions, contract.feature_policy.tenant_base_keys, {
    enabled: true,
    reason: "ok",
    source: "membership",
  })
  assertFeatures(decisions, contract.feature_policy.ai_point_keys, {
    enabled: true,
    reason: "ok",
    source: "ai_points",
  })
  assertFeatures(
    decisions,
    [
      ...contract.feature_policy.manager_keys,
      ...contract.feature_policy.company_keys,
      ...contract.feature_policy.platform_keys,
    ],
    { enabled: false, reason: "role_denied", source: "membership" },
  )
})

test("store and company managers receive only their authorized manager layers", () => {
  const authorization = authorizationModule()
  const storeManager = authorization.buildAppFeatureDecisions(
    account({ role: "store_admin", isStoreManager: true }),
    unlimitedPoints,
  )
  assertFeatures(storeManager, contract.feature_policy.tenant_base_keys, {
    enabled: true,
    reason: "ok",
    source: "membership",
  })
  assertFeatures(storeManager, contract.feature_policy.ai_point_keys, {
    enabled: true,
    reason: "ok",
    source: "ai_points",
  })
  assertFeatures(storeManager, contract.feature_policy.manager_keys, {
    enabled: true,
    reason: "ok",
    source: "membership",
  })
  assertFeatures(
    storeManager,
    [...contract.feature_policy.company_keys, ...contract.feature_policy.platform_keys],
    { enabled: false, reason: "role_denied", source: "membership" },
  )

  const companyManager = authorization.buildAppFeatureDecisions(
    account({
      role: "company_owner",
      storeId: null,
      isCompanyManager: true,
    }),
    positivePoints,
  )
  assertFeatures(
    companyManager,
    [...contract.feature_policy.manager_keys, ...contract.feature_policy.company_keys],
    { enabled: true, reason: "ok", source: "membership" },
  )
  assertFeatures(companyManager, contract.feature_policy.platform_keys, {
    enabled: false,
    reason: "role_denied",
    source: "membership",
  })
})

test("account-state denials take precedence over role and AI-point decisions", () => {
  const authorization = authorizationModule()
  const businessFeatures = contract.feature_policy.all_keys.filter(
    (feature) => !contract.feature_policy.recovery_keys.includes(feature),
  )

  for (const accountStatus of ["suspended", "inactive", "role_denied", "not_bound"]) {
    const decisions = authorization.buildAppFeatureDecisions(account({ accountStatus }), positivePoints)
    assertFeatures(decisions, contract.feature_policy.recovery_keys, {
      enabled: true,
      reason: "ok",
      source: "account",
    })
    assertFeatures(decisions, businessFeatures, {
      enabled: false,
      reason: accountStatus,
      source: "account",
    })
  }
})

test("malformed account statuses fail closed as role_denied account decisions", () => {
  const authorization = authorizationModule()
  const businessFeatures = contract.feature_policy.all_keys.filter(
    (feature) => !contract.feature_policy.recovery_keys.includes(feature),
  )

  for (const accountStatus of [null, undefined, "", "BOUND", "unknown_status", 0, {}, []]) {
    const decisions = authorization.buildAppFeatureDecisions(account({ accountStatus }), positivePoints)
    assertFeatures(decisions, contract.feature_policy.recovery_keys, {
      enabled: true,
      reason: "ok",
      source: "account",
    })
    assertFeatures(decisions, businessFeatures, {
      enabled: false,
      reason: "role_denied",
      source: "account",
    })
    assert.equal(
      authorization.canAccessAppTenantScope(
        account({ accountStatus, role: "platform_admin", isPlatformAdmin: true }),
        { companyId: "company-1" },
      ),
      false,
    )
  }
})

test("role denial precedes missing scope inside an otherwise bound account", () => {
  const authorization = authorizationModule()
  const boundWithoutScope = account({ membershipId: null, companyId: null, storeId: null })
  const decisions = authorization.buildAppFeatureDecisions(boundWithoutScope, positivePoints)

  assert.deepEqual(decisions.store_admin, {
    enabled: false,
    reason: "role_denied",
    source: "membership",
  })
  assert.deepEqual(decisions.home, {
    enabled: false,
    reason: "not_bound",
    source: "account",
  })
})

test("customer and unknown roles cannot receive tenant business features", () => {
  const authorization = authorizationModule()
  const businessFeatures = contract.feature_policy.all_keys.filter(
    (feature) => !contract.feature_policy.recovery_keys.includes(feature),
  )

  for (const role of ["customer", null]) {
    const decisions = authorization.buildAppFeatureDecisions(
      account({ accountStatus: "role_denied", role, membershipId: null, companyId: null, storeId: null }),
      positivePoints,
    )
    assertFeatures(decisions, businessFeatures, {
      enabled: false,
      reason: "role_denied",
      source: "account",
    })
  }
})

test("zero points deny only AI-point features and never infer access from plan names", () => {
  const authorization = authorizationModule()
  const decisions = authorization.buildAppFeatureDecisions(account(), {
    ...zeroPoints,
    plan: "vip",
  })

  assertFeatures(decisions, contract.feature_policy.tenant_base_keys, {
    enabled: true,
    reason: "ok",
    source: "membership",
  })
  assertFeatures(decisions, contract.feature_policy.ai_point_keys, {
    enabled: false,
    reason: "entitlement_denied",
    source: "ai_points",
  })
})

test("trusted platform context can use every feature without tenant membership", () => {
  const authorization = authorizationModule()
  const decisions = authorization.buildAppFeatureDecisions(
    account({
      membershipId: null,
      role: "platform_admin",
      companyId: null,
      storeId: null,
      isPlatformAdmin: true,
      isCompanyManager: true,
    }),
    positivePoints,
  )

  assert.equal(authorization.normalizeAppAccountRole("platform_admin", true), "platform_admin")
  for (const feature of contract.feature_policy.all_keys) {
    assert.equal(decisions[feature].enabled, true, feature)
    assert.equal(decisions[feature].reason, "ok", feature)
  }
})

test("platform trust requires an exact true boolean for features and tenant scope", () => {
  const authorization = authorizationModule()

  for (const invalidPlatformFlag of ["false", 1, {}, []]) {
    const untrustedPlatformAccount = account({
      role: "platform_admin",
      isPlatformAdmin: invalidPlatformFlag,
    })
    assert.equal(authorization.normalizeAppAccountRole("platform_admin", invalidPlatformFlag), "guest")
    assert.deepEqual(
      authorization.buildAppFeatureDecisions(untrustedPlatformAccount, positivePoints).platform_admin,
      { enabled: false, reason: "role_denied", source: "account" },
    )
    assert.equal(
      authorization.canAccessAppTenantScope(untrustedPlatformAccount, {
        companyId: "other-company",
        storeId: "other-store",
      }),
      false,
    )
  }

  const trustedPlatformAccount = account({
    membershipId: null,
    role: "platform_admin",
    companyId: null,
    storeId: null,
    isPlatformAdmin: true,
  })
  assert.equal(
    authorization.canAccessAppTenantScope(trustedPlatformAccount, { companyId: "any-company" }),
    true,
  )
  assert.equal(authorization.canAccessAppTenantScope(trustedPlatformAccount, {}), false)
})

test("generated and looked-up feature decisions are complete and missing keys fail closed", () => {
  const authorization = authorizationModule()
  const decisions = authorization.buildAppFeatureDecisions(account(), positivePoints)

  assert.deepEqual(Object.keys(decisions), contract.feature_policy.all_keys)
  assert.equal(new Set(Object.keys(decisions)).size, contract.feature_policy.all_keys.length)
  for (const feature of contract.feature_policy.all_keys) {
    assert.deepEqual(Object.keys(decisions[feature]), contract.profile_envelope.feature_decision_keys)
    assert.deepEqual(authorization.getAppFeatureDecision(decisions, feature), decisions[feature])
  }

  const missingDecision = { ...decisions }
  delete missingDecision.home
  assert.deepEqual(authorization.getAppFeatureDecision(missingDecision, "home"), {
    enabled: false,
    reason: "entitlement_denied",
    source: "account",
  })
  assert.deepEqual(authorization.getAppFeatureDecision(decisions, "not_a_feature"), {
    enabled: false,
    reason: "entitlement_denied",
    source: "account",
  })
})

test("feature decision lookup validates exact shape before authorization", () => {
  const authorization = authorizationModule()
  const fallbackDecision = {
    enabled: false,
    reason: "entitlement_denied",
    source: "account",
  }
  const invalidDecisions = [
    undefined,
    null,
    "enabled",
    1,
    [],
    {},
    { enabled: true },
    { enabled: true, reason: "ok" },
    { enabled: true, reason: "ok", source: "membership", extra: true },
    { enabled: true, reason: "role_denied", source: "membership" },
    { enabled: false, reason: "ok", source: "membership" },
    { enabled: true, reason: "ok", source: "unknown_source" },
    { enabled: false, reason: "unknown_reason", source: "account" },
    { enabled: "true", reason: "ok", source: "membership" },
  ]

  assert.deepEqual(authorization.getAppFeatureDecision({}, "home"), fallbackDecision)
  for (const invalidDecision of invalidDecisions) {
    const decisions = { home: invalidDecision }
    assert.deepEqual(authorization.getAppFeatureDecision(decisions, "home"), fallbackDecision)
    assert.deepEqual(authorization.requireAppFeatureAccess(account(), decisions, "home"), {
      ok: false,
      status: 403,
      body: { ok: false, code: "entitlement_denied", feature: "home" },
    })
  }

  for (const source of ["account", "membership", "ai_points", "platform"]) {
    assert.deepEqual(
      authorization.requireAppFeatureAccess(
        account(),
        { home: { enabled: true, reason: "ok", source } },
        "home",
      ),
      { ok: true, account: account() },
    )
  }
  assert.deepEqual(
    authorization.requireAppFeatureAccess(
      account(),
      { home: { enabled: false, reason: "suspended", source: "account" } },
      "home",
    ),
    {
      ok: false,
      status: 403,
      body: { ok: false, code: "suspended", feature: "home" },
    },
  )
  assert.deepEqual(authorization.appAuthorizationErrorResponse("arbitrary_reason", "home"), {
    ok: false,
    status: 403,
    body: { ok: false, code: "entitlement_denied", feature: "home" },
  })

  const arrayDecisionContainer = []
  arrayDecisionContainer.home = { enabled: true, reason: "ok", source: "platform" }
  assert.deepEqual(authorization.getAppFeatureDecision(arrayDecisionContainer, "home"), fallbackDecision)
  assert.deepEqual(authorization.requireAppFeatureAccess(account(), arrayDecisionContainer, "home"), {
    ok: false,
    status: 403,
    body: { ok: false, code: "entitlement_denied", feature: "home" },
  })
})

test("tenant scope authorization is role-aware and fails closed", () => {
  const authorization = authorizationModule()
  const companyAdmin = account({
    role: "company_owner",
    storeId: null,
    isCompanyManager: true,
  })
  const companyAdminDecisions = authorization.buildAppFeatureDecisions(companyAdmin, positivePoints)

  assert.equal(authorization.canAccessAppTenantScope(companyAdmin, { companyId: "company-1" }), true)
  assert.equal(authorization.canAccessAppTenantScope(companyAdmin, {}), false)
  assert.equal(authorization.canAccessAppTenantScope(companyAdmin, { companyId: "other-company" }), false)
  assert.equal(authorization.canAccessAppTenantScope(companyAdmin, { storeId: "store-1" }), false)
  assert.equal(
    authorization.canAccessAppTenantScope(companyAdmin, {
      companyId: "company-1",
      storeId: "store-1",
    }),
    false,
  )
  assert.equal(
    authorization.canAccessAppTenantScope(companyAdmin, {
      companyId: "other-company",
      storeId: "store-1",
    }),
    false,
  )
  assert.deepEqual(
    authorization.requireAppFeatureAccess(companyAdmin, companyAdminDecisions, "company_admin", {
      companyId: "company-1",
    }),
    { ok: true, account: companyAdmin },
  )
  assert.deepEqual(
    authorization.requireAppFeatureAccess(companyAdmin, companyAdminDecisions, "store_admin", {
      companyId: "company-1",
      storeId: "store-1",
    }),
    {
      ok: false,
      status: 403,
      body: { ok: false, code: "tenant_scope_denied", feature: "store_admin" },
    },
  )

  for (const storeRoleAccount of [account(), account({ role: "store_admin", isStoreManager: true })]) {
    assert.equal(authorization.canAccessAppTenantScope(storeRoleAccount, { storeId: "store-1" }), true)
    assert.equal(
      authorization.canAccessAppTenantScope(storeRoleAccount, {
        companyId: "company-1",
        storeId: "store-1",
      }),
      true,
    )
    assert.equal(authorization.canAccessAppTenantScope(storeRoleAccount, { companyId: "company-1" }), false)
    assert.equal(authorization.canAccessAppTenantScope(storeRoleAccount, { storeId: "other-store" }), false)
    assert.equal(
      authorization.canAccessAppTenantScope(storeRoleAccount, {
        companyId: "other-company",
        storeId: "store-1",
      }),
      false,
    )
  }

  for (const deniedRole of ["customer", "service_operator", null]) {
    assert.equal(
      authorization.canAccessAppTenantScope(account({ role: deniedRole }), {
        companyId: "company-1",
        storeId: "store-1",
      }),
      false,
    )
  }

  for (const malformedScope of [
    null,
    undefined,
    [],
    "scope",
    1,
    {},
    { companyId: "" },
    { companyId: null },
    { companyId: 1 },
    { storeId: "" },
    { storeId: null },
    { storeId: {} },
    { companyId: "company-1", storeId: "" },
  ]) {
    assert.equal(authorization.canAccessAppTenantScope(account(), malformedScope), false)
  }
})

test("scope checks and authorization errors fail closed without leaking identifiers", () => {
  const authorization = authorizationModule()
  const employee = account()
  const decisions = authorization.buildAppFeatureDecisions(employee, positivePoints)

  assert.equal(
    authorization.canAccessAppTenantScope(employee, { companyId: "company-1", storeId: "store-1" }),
    true,
  )
  assert.equal(
    authorization.canAccessAppTenantScope(employee, { companyId: "other-company", storeId: "store-1" }),
    false,
  )
  assert.equal(
    authorization.canAccessAppTenantScope(employee, { companyId: "company-1", storeId: "other-store" }),
    false,
  )
  assert.deepEqual(
    authorization.requireAppFeatureAccess(employee, decisions, "service_record", {
      companyId: "company-1",
      storeId: "store-1",
    }),
    { ok: true, account: employee },
  )
  assert.deepEqual(
    authorization.requireAppFeatureAccess(employee, decisions, "service_record", {
      companyId: "company-1",
      storeId: "other-store",
    }),
    {
      ok: false,
      status: 403,
      body: { ok: false, code: "tenant_scope_denied", feature: "service_record" },
    },
  )
  assert.deepEqual(authorization.requireAppFeatureAccess(employee, decisions, "store_admin"), {
    ok: false,
    status: 403,
    body: { ok: false, code: "role_denied", feature: "store_admin" },
  })

  const safeError = authorization.appAuthorizationErrorResponse("role_denied", "store_admin")
  assert.deepEqual(Object.keys(safeError.body), ["ok", "code", "feature"])
  assert.equal(JSON.stringify(safeError).includes("company-1"), false)
  assert.deepEqual(authorization.appAuthorizationErrorResponse("entitlement_denied", "unsafe/value"), {
    ok: false,
    status: 403,
    body: { ok: false, code: "entitlement_denied" },
  })
})
