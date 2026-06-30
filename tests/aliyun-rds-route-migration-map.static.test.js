const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

test("Aliyun RDS route migration map command is wired into package scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:rds:route-map"], "node ./scripts/generate-aliyun-rds-route-migration-map.mjs")
  assert.equal(pkg.scripts["aliyun:rds:route-map:test"], "node --test tests/aliyun-rds-route-migration-map.static.test.js")
  assert.match(predeploy, /aliyun:rds:route-map:test/)
  assert.match(predeploy, /aliyun:rds:route-map/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:rds:route-map/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:route-map:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:route-map"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:rds:route-map"))
  assert.match(releaseArtifacts, /rdsRouteMigrationMap/)
  assert.match(releaseArtifacts, /rds-route-migration-map\.json/)
  assert.match(releaseArtifacts, /rds-route-migration-map\.md/)
})

test("Aliyun RDS route migration map covers first-version APP route data access without values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-rds-route-migration-map.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byRoute = new Map(report.routes.map((item) => [item.route, item]))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.formalTarget, "Aliyun RDS PostgreSQL")
  assert.equal(report.currentSource, "Supabase migration source / legacy compatibility only")
  assert.equal(report.secretLeakCheck.ok, true)

  assert.equal(report.summary.firstVersionRouteCount, 25)
  assert.equal(report.summary.routesStillUsingSupabaseDataAccess, 0)
  assert.equal(report.summary.routesUsingAliyunRdsDataAccess, 25)
  assert.equal(report.summary.sharedDataAccessFileCount, 0)
  assert.equal(report.summary.sharedRdsDataAccessFileCount, 36)
  assert.equal(report.summary.observedTableCount, 14)
  assert.equal(report.summary.requiredTableCount, 15)
  assert.equal(report.summary.observedRpcCount, 0)
  assert.equal(report.summary.requiredFunctionCount, 0)
  assert.equal(report.summary.implementationWorkPackageCount, 5)
  assert.equal(report.summary.proposedRepositoryFileCount, 11)
  assert.deepEqual(report.summary.schemaMapMissingObservedTables, [])
  assert.deepEqual(report.summary.schemaMapMissingObservedRpcs, [])
  assert.deepEqual(report.summary.requiredTablesWithoutRouteObservation, ["credit_transactions"])
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(!report.summary.rdsPlanRequiredBlocking.includes("first_version_supabase_data_access_still_present"))

  assert.ok(report.observedTables.includes("profiles"))
  assert.ok(report.observedTables.includes("entitlements"))
  assert.ok(report.observedTables.includes("mp_ai_point_ledger"))
  assert.ok(report.observedTables.includes("store_profiles"))
  assert.ok(report.observedTables.includes("voice_coach_sessions"))
  assert.ok(report.observedTables.includes("voice_coach_turns"))
  assert.ok(report.observedTables.includes("service_record_sessions"))
  assert.deepEqual(report.observedRpcs, [])
  assert.deepEqual(report.rdsAdapterFiles, [
    "app/api/app/assets/sign-read/route.ts",
    "app/api/app/auth/logout/route.ts",
    "app/api/app/content-drafts/route.ts",
    "app/api/app/customer-profiles/[profileId]/route.ts",
    "app/api/app/customer-profiles/route.ts",
    "app/api/app/health/route.ts",
    "app/api/app/profile/route.ts",
    "app/api/app/service-records/device-files/check/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/asr/poll/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/audio/[segmentId]/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/end/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/markers/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/oss-upload/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/process/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/resume/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/segments/oss/route.ts",
    "app/api/app/service-records/sessions/[sessionId]/segments/route.ts",
    "app/api/app/service-records/sessions/route.ts",
    "app/api/app/store-admin/analytics/route.ts",
    "app/api/app/store-admin/invites/[token]/accept/route.ts",
    "app/api/app/store-admin/invites/[token]/preview/route.ts",
    "app/api/app/store-admin/invites/[token]/qrcode/route.ts",
    "app/api/app/store-admin/invites/route.ts",
    "app/api/app/store-admin/members/route.ts",
    "app/api/app/store-admin/overview/route.ts",
    "app/api/app/store-admin/service-records/route.ts",
    "app/api/app/store-profiles/[profileId]/route.ts",
    "app/api/app/store-profiles/route.ts",
    "lib/aliyun-rds/app-auth.server.ts",
    "lib/aliyun-rds/postgres.server.ts",
    "lib/aliyun-rds/repositories/account-profile.server.ts",
    "lib/aliyun-rds/repositories/customer-profiles.server.ts",
    "lib/aliyun-rds/repositories/service-record-processing.server.ts",
    "lib/aliyun-rds/repositories/service-records.server.ts",
    "lib/aliyun-rds/repositories/store-admin.server.ts",
    "lib/aliyun-rds/repositories/store-invites.server.ts",
    "lib/aliyun-rds/repositories/store-profiles.server.ts",
    "lib/aliyun-rds/service-record-asr.server.ts",
    "lib/aliyun-rds/service-record-oss.server.ts",
  ])

  assert.equal(byRoute.get("/api/app/profile").stillUsesSupabaseDataAccess, false)
  assert.equal(byRoute.get("/api/app/profile").usesAliyunRdsDataAccess, true)
  assert.deepEqual(byRoute.get("/api/app/profile").tableNames, [])
  assert.ok(byRoute.get("/api/app/profile").rdsTableNames.includes("entitlements"))
  assert.ok(byRoute.get("/api/app/profile").rdsTableNames.includes("mp_account_memberships"))
  assert.ok(byRoute.get("/api/app/profile").rdsDataAccessFiles.some((item) =>
    item.file === "lib/aliyun-rds/repositories/account-profile.server.ts"
  ))
  assert.equal(byRoute.get("/api/app/entitlements").stillUsesSupabaseDataAccess, false)
  assert.equal(byRoute.get("/api/app/entitlements").usesAliyunRdsDataAccess, true)
  for (const routePath of [
    "/api/app/service-records/sessions",
    "/api/app/service-records/sessions/[sessionId]",
    "/api/app/service-records/device-files/check",
    "/api/app/service-records/sessions/[sessionId]/segments",
    "/api/app/service-records/sessions/[sessionId]/oss-upload",
    "/api/app/service-records/sessions/[sessionId]/segments/oss",
    "/api/app/service-records/sessions/[sessionId]/markers",
    "/api/app/service-records/sessions/[sessionId]/resume",
    "/api/app/service-records/sessions/[sessionId]/end",
    "/api/app/service-records/sessions/[sessionId]/process",
    "/api/app/service-records/sessions/[sessionId]/asr/poll",
    "/api/app/service-records/sessions/[sessionId]/audio/[segmentId]",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.stillUsesSupabaseDataAccess, false, routePath)
    assert.equal(route.usesAliyunRdsDataAccess, true, routePath)
    assert.deepEqual(route.tableNames, [], routePath)
    assert.ok(route.rdsTableNames.includes("service_record_sessions"), routePath)
    assert.ok(route.rdsDataAccessFiles.some((item) =>
      item.file === "lib/aliyun-rds/repositories/service-records.server.ts"
    ), routePath)
  }
  for (const routePath of [
    "/api/app/store-admin/overview",
    "/api/app/store-admin/members",
    "/api/app/store-admin/analytics",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.stillUsesSupabaseDataAccess, false, routePath)
    assert.equal(route.usesAliyunRdsDataAccess, true, routePath)
    assert.deepEqual(route.tableNames, [], routePath)
    assert.ok(route.rdsTableNames.includes("voice_coach_sessions"), routePath)
    assert.ok(route.rdsTableNames.includes("voice_coach_turns"), routePath)
    assert.ok(route.rdsDataAccessFiles.some((item) =>
      item.file === "lib/aliyun-rds/repositories/store-admin.server.ts"
    ), routePath)
  }
  for (const routePath of [
    "/api/app/store-admin/invites",
    "/api/app/store-admin/invites/[token]/preview",
    "/api/app/store-admin/invites/[token]/accept",
    "/api/app/store-admin/invites/[token]/qrcode",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.stillUsesSupabaseDataAccess, false, routePath)
    assert.equal(route.usesAliyunRdsDataAccess, true, routePath)
    assert.deepEqual(route.tableNames, [], routePath)
    assert.ok(route.rdsTableNames.includes("mp_account_invites"), routePath)
    assert.ok(route.rdsDataAccessFiles.some((item) =>
      item.file === "lib/aliyun-rds/repositories/store-invites.server.ts"
    ), routePath)
  }
  for (const routePath of [
    "/api/app/store-profiles",
    "/api/app/store-profiles/[profileId]",
    "/api/app/customer-profiles",
    "/api/app/customer-profiles/[profileId]",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.stillUsesSupabaseDataAccess, false, routePath)
    assert.equal(route.usesAliyunRdsDataAccess, true, routePath)
    assert.deepEqual(route.tableNames, [], routePath)
  }
  assert.ok(byRoute.get("/api/app/store-profiles").rdsTableNames.includes("store_profiles"))
  assert.ok(byRoute.get("/api/app/store-profiles/[profileId]").rdsTableNames.includes("store_profiles"))
  assert.ok(byRoute.get("/api/app/customer-profiles").rdsTableNames.includes("voice_coach_customer_profiles"))
  assert.ok(byRoute.get("/api/app/customer-profiles/[profileId]").rdsTableNames.includes("voice_coach_customer_profiles"))
  assert.ok(byRoute.get("/api/app/store-profiles").rdsDataAccessFiles.some((item) =>
    item.file === "lib/aliyun-rds/repositories/store-profiles.server.ts"
  ))
  assert.ok(byRoute.get("/api/app/customer-profiles").rdsDataAccessFiles.some((item) =>
    item.file === "lib/aliyun-rds/repositories/customer-profiles.server.ts"
  ))

  const workPackages = new Map(report.implementationWorkPackages.map((item) => [item.id, item]))
  assert.deepEqual(Array.from(workPackages.keys()), [
    "RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS",
    "RDS_WP02_CONTEXT_PROFILES",
    "RDS_WP03_SERVICE_RECORDS_CORE",
    "RDS_WP04_STORE_ADMIN_READ_MODELS",
    "RDS_WP05_STORE_INVITES",
  ])
  assert.equal(workPackages.get("RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS").routeCount, 2)
  assert.ok(
    workPackages
      .get("RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/account-profile.server.ts"),
  )
  assert.equal(
    workPackages.get("RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS").routesStillUsingSupabaseDataAccess,
    0,
  )
  assert.equal(
    workPackages.get("RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS").status,
    "rds_repository_in_source_pending_runtime_evidence",
  )
  assert.equal(workPackages.get("RDS_WP02_CONTEXT_PROFILES").routeCount, 4)
  assert.equal(
    workPackages.get("RDS_WP02_CONTEXT_PROFILES").routesStillUsingSupabaseDataAccess,
    0,
  )
  assert.equal(
    workPackages.get("RDS_WP02_CONTEXT_PROFILES").status,
    "rds_repository_in_source_pending_runtime_evidence",
  )
  assert.deepEqual(workPackages.get("RDS_WP02_CONTEXT_PROFILES").currentSupabaseDataAccessFiles, [])
  assert.ok(
    workPackages
      .get("RDS_WP02_CONTEXT_PROFILES")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/store-profiles.server.ts"),
  )
  assert.ok(
    workPackages
      .get("RDS_WP02_CONTEXT_PROFILES")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/customer-profiles.server.ts"),
  )
  assert.deepEqual(workPackages.get("RDS_WP03_SERVICE_RECORDS_CORE").currentSupabaseDataAccessFiles, [])
  assert.equal(
    workPackages.get("RDS_WP03_SERVICE_RECORDS_CORE").routesStillUsingSupabaseDataAccess,
    0,
  )
  assert.equal(
    workPackages.get("RDS_WP03_SERVICE_RECORDS_CORE").status,
    "rds_repository_in_source_pending_runtime_evidence",
  )
  assert.ok(
    workPackages
      .get("RDS_WP03_SERVICE_RECORDS_CORE")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/service-records.server.ts"),
  )
  assert.ok(
    workPackages
      .get("RDS_WP03_SERVICE_RECORDS_CORE")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/service-record-processing.server.ts"),
  )
  assert.ok(
    workPackages
      .get("RDS_WP03_SERVICE_RECORDS_CORE")
      .proposedRepositoryFiles.includes("lib/aliyun-rds/repositories/service-records.server.ts"),
  )
  assert.ok(
    workPackages
      .get("RDS_WP05_STORE_INVITES")
      .blockedBy.includes("production_cn_public_base_url_ready"),
  )
  assert.equal(workPackages.get("RDS_WP04_STORE_ADMIN_READ_MODELS").routesStillUsingSupabaseDataAccess, 0)
  assert.equal(workPackages.get("RDS_WP04_STORE_ADMIN_READ_MODELS").status, "rds_repository_in_source_pending_runtime_evidence")
  assert.deepEqual(workPackages.get("RDS_WP04_STORE_ADMIN_READ_MODELS").currentSupabaseDataAccessFiles, [])
  assert.ok(
    workPackages
      .get("RDS_WP04_STORE_ADMIN_READ_MODELS")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/store-admin.server.ts"),
  )
  assert.equal(workPackages.get("RDS_WP05_STORE_INVITES").routesStillUsingSupabaseDataAccess, 0)
  assert.equal(workPackages.get("RDS_WP05_STORE_INVITES").status, "rds_repository_in_source_pending_runtime_evidence")
  assert.deepEqual(workPackages.get("RDS_WP05_STORE_INVITES").currentSupabaseDataAccessFiles, [])
  assert.ok(
    workPackages
      .get("RDS_WP05_STORE_INVITES")
      .rdsDataAccessFiles.includes("lib/aliyun-rds/repositories/store-invites.server.ts"),
  )
  assert.equal(
    report.implementationWorkPackages.filter((item) => item.status === "blocked_until_repository_uses_database_url_cn").length,
    0,
  )

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun RDS route migration map markdown is actionable and value-free", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-route-map-"))
  const jsonPath = path.join(tmpdir, "rds-route-map.json")
  const markdownPath = path.join(tmpdir, "rds-route-map.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-rds-route-migration-map.mjs",
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(report.summary.firstVersionRouteCount, 25)
  assert.match(markdown, /Aliyun RDS Route Migration Map/)
  assert.match(markdown, /routesStillUsingSupabaseDataAccess: 0/)
  assert.match(markdown, /routesUsingAliyunRdsDataAccess: 25/)
  assert.match(markdown, /implementationWorkPackageCount: 5/)
  assert.match(markdown, /requiredTablesWithoutRouteObservation: credit_transactions/)
  assert.match(markdown, /RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS/)
  assert.match(markdown, /rds_repository_in_source_pending_runtime_evidence/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/account-profile\.server\.ts/)
  assert.match(markdown, /RDS_WP02_CONTEXT_PROFILES/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/store-profiles\.server\.ts/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/customer-profiles\.server\.ts/)
  assert.match(markdown, /RDS_WP03_SERVICE_RECORDS_CORE/)
  assert.match(markdown, /\/api\/app\/service-records\/sessions/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/service-records\.server\.ts/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/service-record-processing\.server\.ts/)
  assert.match(markdown, /RDS_WP04_STORE_ADMIN_READ_MODELS/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/store-admin\.server\.ts/)
  assert.match(markdown, /RDS_WP05_STORE_INVITES/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/store-invites\.server\.ts/)
  assert.match(markdown, /Create or confirm Aliyun RDS PostgreSQL/)
  assert.doesNotMatch(output + markdown, secretLike)
})

test("Aliyun APP account profile routes use RDS repository instead of mini-program profile re-export", () => {
  const appProfileRoute = read("app", "api", "app", "profile", "route.ts")
  const appEntitlementsRoute = read("app", "api", "app", "entitlements", "route.ts")
  const repository = read("lib", "aliyun-rds", "repositories", "account-profile.server.ts")

  assert.doesNotMatch(appProfileRoute, /@\/app\/api\/mp\/profile\/route/)
  assert.match(appProfileRoute, /getAliyunRdsAppProfileResponse/)
  assert.match(appEntitlementsRoute, /@\/app\/api\/app\/profile\/route/)
  assert.match(repository, /queryAliyunRds/)
  assert.match(repository, /public\.profiles/)
  assert.match(repository, /public\.entitlements/)
  assert.match(repository, /public\.mp_account_memberships/)
  assert.doesNotMatch(repository, /@\/lib\/supabase|@supabase\/supabase-js/)
})

test("Aliyun APP context profile routes use RDS repositories instead of mini-program re-exports", () => {
  const storeProfilesRoute = read("app", "api", "app", "store-profiles", "route.ts")
  const storeProfileDetailRoute = read("app", "api", "app", "store-profiles", "[profileId]", "route.ts")
  const customerProfilesRoute = read("app", "api", "app", "customer-profiles", "route.ts")
  const customerProfileDetailRoute = read("app", "api", "app", "customer-profiles", "[profileId]", "route.ts")
  const storeRepository = read("lib", "aliyun-rds", "repositories", "store-profiles.server.ts")
  const customerRepository = read("lib", "aliyun-rds", "repositories", "customer-profiles.server.ts")

  for (const route of [
    storeProfilesRoute,
    storeProfileDetailRoute,
    customerProfilesRoute,
    customerProfileDetailRoute,
  ]) {
    assert.doesNotMatch(route, /@\/app\/api\/mp\//)
    assert.match(route, /AliyunRdsConfigurationError/)
    assert.match(route, /resolveAliyunRdsAppAuthUser/)
    assert.doesNotMatch(route, /createServerSupabaseClientForRequest|@\/lib\/supabase|@supabase\/supabase-js/)
  }

  assert.match(storeProfilesRoute, /listAliyunRdsStoreProfiles/)
  assert.match(storeProfilesRoute, /createAliyunRdsStoreProfile/)
  assert.match(storeProfileDetailRoute, /getAliyunRdsStoreProfile/)
  assert.match(storeProfileDetailRoute, /updateAliyunRdsStoreProfile/)
  assert.match(storeProfileDetailRoute, /deleteAliyunRdsStoreProfile/)
  assert.match(customerProfilesRoute, /listAliyunRdsCustomerProfiles/)
  assert.match(customerProfilesRoute, /createAliyunRdsCustomerProfile/)
  assert.match(customerProfileDetailRoute, /getAliyunRdsCustomerProfile/)
  assert.match(customerProfileDetailRoute, /updateAliyunRdsCustomerProfile/)
  assert.match(customerProfileDetailRoute, /deleteAliyunRdsCustomerProfile/)
  assert.match(storeRepository, /public\.store_profiles/)
  assert.match(storeRepository, /public\.profiles/)
  assert.match(customerRepository, /public\.voice_coach_customer_profiles/)
  assert.doesNotMatch(storeRepository + customerRepository, /@\/lib\/supabase|@supabase\/supabase-js/)
})

test("Aliyun APP service record routes use RDS, OSS, and ASR helpers for WP03", () => {
  const routeFiles = [
    read("app", "api", "app", "service-records", "device-files", "check", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "segments", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "oss-upload", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "segments", "oss", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "markers", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "resume", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "end", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "process", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "asr", "poll", "route.ts"),
    read("app", "api", "app", "service-records", "sessions", "[sessionId]", "audio", "[segmentId]", "route.ts"),
  ]
  const repository = read("lib", "aliyun-rds", "repositories", "service-records.server.ts")
  const processingRepository = read("lib", "aliyun-rds", "repositories", "service-record-processing.server.ts")
  const ossHelper = read("lib", "aliyun-rds", "service-record-oss.server.ts")
  const asrHelper = read("lib", "aliyun-rds", "service-record-asr.server.ts")

  for (const route of routeFiles) {
    assert.doesNotMatch(route, /@\/app\/api\/mp\//)
    assert.match(route, /@\/lib\/aliyun-rds/)
  }

  assert.match(repository, /public\.service_record_sessions/)
  assert.match(repository, /public\.service_record_segments/)
  assert.match(repository, /public\.service_record_markers/)
  assert.match(repository, /getAliyunRdsAppAccountContext/)
  assert.match(processingRepository, /processAliyunRdsServiceRecordSession/)
  assert.match(ossHelper, /ALIYUN_OSS_BUCKET|SERVICE_RECORD_OSS_BUCKET/)
  assert.match(asrHelper, /DASHSCOPE_API_KEY|BAILIAN_API_KEY/)
  assert.doesNotMatch(repository + processingRepository + ossHelper + asrHelper, /@\/lib\/supabase\/admin|@supabase\/supabase-js/)
})

test("Aliyun APP store admin and invite routes use RDS repositories for WP04 and WP05", () => {
  const routeFiles = [
    read("app", "api", "app", "store-admin", "overview", "route.ts"),
    read("app", "api", "app", "store-admin", "members", "route.ts"),
    read("app", "api", "app", "store-admin", "analytics", "route.ts"),
    read("app", "api", "app", "store-admin", "invites", "route.ts"),
    read("app", "api", "app", "store-admin", "invites", "[token]", "preview", "route.ts"),
    read("app", "api", "app", "store-admin", "invites", "[token]", "accept", "route.ts"),
    read("app", "api", "app", "store-admin", "invites", "[token]", "qrcode", "route.ts"),
  ]
  const postgresAdapter = read("lib", "aliyun-rds", "postgres.server.ts")
  const storeAdminRepository = read("lib", "aliyun-rds", "repositories", "store-admin.server.ts")
  const inviteRepository = read("lib", "aliyun-rds", "repositories", "store-invites.server.ts")

  for (const route of routeFiles) {
    assert.doesNotMatch(route, /@\/app\/api\/mp\//)
    assert.match(route, /@\/lib\/aliyun-rds/)
  }

  assert.match(routeFiles[0], /getAliyunRdsStoreAdminOverview/)
  assert.match(routeFiles[1], /getAliyunRdsStoreAdminMembers/)
  assert.match(routeFiles[2], /getAliyunRdsStoreAdminAnalytics/)
  assert.match(routeFiles[3], /createAliyunRdsStoreInvite/)
  assert.match(routeFiles[4], /getAliyunRdsStoreInvitePreview/)
  assert.match(routeFiles[5], /acceptAliyunRdsStoreInvite/)
  assert.match(routeFiles[6], /assertAliyunRdsStoreInviteUsable/)
  for (const inviteRoute of routeFiles.slice(3)) {
    assert.match(inviteRoute, /isAliyunRdsRuntimeUnavailableError/)
    assert.match(inviteRoute, /rds_unavailable/)
  }
  assert.match(postgresAdapter, /isAliyunRdsRuntimeUnavailableError/)
  assert.match(postgresAdapter, /Connection terminated unexpectedly/)
  assert.match(storeAdminRepository, /queryAliyunRds/)
  assert.match(storeAdminRepository, /isAliyunRdsRuntimeUnavailableError/)
  assert.match(storeAdminRepository, /rds_unavailable/)
  assert.match(storeAdminRepository, /public\.voice_coach_sessions/)
  assert.match(storeAdminRepository, /public\.voice_coach_turns/)
  assert.match(inviteRepository, /queryAliyunRds|withAliyunRdsTransaction/)
  assert.match(inviteRepository, /public\.mp_account_invites/)
  assert.match(inviteRepository, /public\.mp_account_memberships/)
  assert.doesNotMatch(storeAdminRepository + inviteRepository, /@\/lib\/supabase\/admin|createAdminSupabaseClient|@supabase\/supabase-js|supabase\.from\(/)
})
