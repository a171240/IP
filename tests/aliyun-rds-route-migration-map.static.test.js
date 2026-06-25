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
  assert.equal(report.summary.routesStillUsingSupabaseDataAccess, 23)
  assert.equal(report.summary.routesUsingAliyunRdsDataAccess, 2)
  assert.equal(report.summary.observedTableCount, 14)
  assert.equal(report.summary.requiredTableCount, 15)
  assert.equal(report.summary.observedRpcCount, 0)
  assert.equal(report.summary.requiredFunctionCount, 2)
  assert.equal(report.summary.implementationWorkPackageCount, 5)
  assert.equal(report.summary.proposedRepositoryFileCount, 11)
  assert.deepEqual(report.summary.schemaMapMissingObservedTables, [])
  assert.deepEqual(report.summary.schemaMapMissingObservedRpcs, [])
  assert.deepEqual(report.summary.requiredTablesWithoutRouteObservation, ["credit_transactions"])
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(report.summary.rdsPlanRequiredBlocking.includes("first_version_supabase_data_access_still_present"))

  assert.ok(report.observedTables.includes("profiles"))
  assert.ok(report.observedTables.includes("entitlements"))
  assert.ok(report.observedTables.includes("mp_ai_point_ledger"))
  assert.ok(report.observedTables.includes("store_profiles"))
  assert.ok(report.observedTables.includes("voice_coach_sessions"))
  assert.ok(report.observedTables.includes("voice_coach_turns"))
  assert.ok(report.observedTables.includes("service_record_sessions"))
  assert.deepEqual(report.observedRpcs, [])
  assert.deepEqual(report.rdsAdapterFiles, [
    "app/api/app/profile/route.ts",
    "lib/aliyun-rds/postgres.server.ts",
    "lib/aliyun-rds/repositories/account-profile.server.ts",
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
  assert.ok(byRoute.get("/api/app/service-records/sessions").tableNames.includes("service_record_sessions"))
  assert.ok(byRoute.get("/api/app/service-records/sessions").dataAccessFiles.some((item) => item.file === "lib/service-records/server.ts"))
  assert.ok(byRoute.get("/api/app/store-admin/overview").tableNames.includes("voice_coach_sessions"))
  assert.ok(byRoute.get("/api/app/store-admin/members").tableNames.includes("voice_coach_turns"))
  assert.ok(byRoute.get("/api/app/store-profiles").tableNames.includes("store_profiles"))

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
  assert.ok(
    workPackages
      .get("RDS_WP03_SERVICE_RECORDS_CORE")
      .currentSupabaseDataAccessFiles.includes("lib/service-records/server.ts"),
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
  assert.equal(
    report.implementationWorkPackages.filter((item) => item.status === "blocked_until_repository_uses_database_url_cn").length,
    4,
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
  assert.match(markdown, /routesStillUsingSupabaseDataAccess: 23/)
  assert.match(markdown, /routesUsingAliyunRdsDataAccess: 2/)
  assert.match(markdown, /implementationWorkPackageCount: 5/)
  assert.match(markdown, /requiredTablesWithoutRouteObservation: credit_transactions/)
  assert.match(markdown, /RDS_WP01_ACCOUNT_PROFILE_ENTITLEMENTS/)
  assert.match(markdown, /rds_repository_in_source_pending_runtime_evidence/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/account-profile\.server\.ts/)
  assert.match(markdown, /RDS_WP03_SERVICE_RECORDS_CORE/)
  assert.match(markdown, /\/api\/app\/service-records\/sessions/)
  assert.match(markdown, /lib\/service-records\/server\.ts/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/service-records\.server\.ts/)
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
