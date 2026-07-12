/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun RDS migration plan command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const rdsDoc = read("docs", "app-production-cn-rds-migration-plan.md")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:rds:migration:plan"], "node ./scripts/summarize-aliyun-rds-migration-plan.mjs")
  assert.equal(pkg.scripts["aliyun:rds:migration:plan:test"], "node --test tests/aliyun-rds-migration-plan.static.test.js")
  assert.match(predeploy, /aliyun:rds:migration:plan:test/)
  assert.match(predeploy, /aliyun:rds:migration:plan/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:rds:migration:plan/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:plan:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:plan"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:rds:migration:plan"))
  assert.match(releaseArtifacts, /rds-migration-plan\.json/)
  assert.match(releaseArtifacts, /rds-migration-plan\.md/)
  assert.match(releaseArtifacts, /rdsMigrationPlan/)
  assert.match(rdsDoc, /APP API routes: 59/)
  assert.match(rdsDoc, /APP API routes using Supabase: 57/)
  assert.match(rdsDoc, /APP API routes using Supabase data access: 2/)
  assert.match(rdsDoc, /First-version RDS required APP API routes: 28/)
  assert.match(rdsDoc, /First-version RDS required routes using Supabase: 26/)
  assert.match(rdsDoc, /First-version RDS required routes using Supabase data access: 0/)
  assert.match(rdsDoc, /DATABASE_URL_CN/)
  assert.match(rdsDoc, /lib\/aliyun-rds\/postgres\.server\.ts/)
  assert.match(rdsDoc, /lib\/aliyun-rds\/repositories\/account-profile\.server\.ts/)
  assert.match(rdsDoc, /deploy\/aliyun-production-cn\.rds-first-version-schema-map\.json/)
  assert.match(rdsDoc, /DATABASE_URL_CN referenced in source: true/)
  assert.match(rdsDoc, /PostgreSQL data access adapter detected: true/)
  assert.doesNotMatch(rdsDoc, /DATABASE_URL_CN referenced in source: false/)
  assert.doesNotMatch(rdsDoc, /PostgreSQL data access adapter detected: false/)
  assert.match(rdsDoc, /first_version_routes_switched_pending_runtime_evidence/)
  assert.doesNotMatch(rdsDoc, /first_version_supabase_data_access_still_present/)
  assert.match(rdsDoc, /schema_migration_not_verified/)
  assert.match(rdsDoc, /RDS06_SWITCH_PRODUCTION_CN_AND_ROLLBACK/)
})

test("Aliyun RDS migration plan inventories APP API Supabase dependency without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-rds-migration-plan.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byRoute = new Map(report.appApiRoutes.map((item) => [item.routePath, item]))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.currentDataLayer, "Supabase migration source / legacy compatibility only")
  assert.equal(report.formalTarget, "Aliyun RDS PostgreSQL")
  assert.equal(report.migrationReady, false)
  assert.equal(report.secretLeakCheck.ok, true)

  assert.equal(report.summary.appApiRouteCount, 59)
  assert.equal(report.summary.appApiRoutesWithSupabase, 57)
  assert.equal(report.summary.appApiRoutesWithSupabaseDataAccess, 2)
  assert.equal(report.summary.appApiRoutesWithDirectSupabase, 2)
  assert.equal(report.summary.appApiRoutesWithDirectSupabaseDataAccess, 1)
  assert.equal(report.summary.firstVersionRdsRouteCount, 28)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabase, 26)
  assert.equal(report.summary.firstVersionRdsRoutesWithSupabaseDataAccess, 0)
  assert.equal(report.summary.deferredAppApiRouteCount, 31)
  assert.equal(report.summary.deferredAppApiRoutesWithSupabase, 31)
  assert.equal(report.summary.deferredAppApiRoutesWithSupabaseDataAccess, 2)
  assert.ok(report.summary.sharedSupabaseFileCount >= 20)
  assert.ok(report.summary.sharedSupabaseDataAccessFileCount >= 20)
  assert.ok(report.summary.supabaseUsageFileCount >= 30)
  assert.equal(report.summary.databaseUrlCnReferencedInSource, true)
  assert.equal(report.summary.postgresDataAccessAdapterDetected, true)
  assert.equal(report.summary.schemaMapReady, true)
  assert.equal(report.summary.schemaMapRequiredTableCount, 19)
  assert.ok(report.summary.requiredBlocking.includes("DATABASE_URL_CN"))
  assert.ok(!report.summary.requiredBlocking.includes("first_version_supabase_data_access_still_present"))
  assert.ok(!report.summary.requiredBlocking.includes("postgres_data_access_adapter_missing"))
  assert.ok(report.summary.requiredBlocking.includes("schema_migration_not_verified"))
  assert.ok(report.requiredBlocking.some((item) => (
    item.id === "ALIYUN_RDS_POSTGRES" &&
    item.status === "not_verified" &&
    /presence or absence is unverified/.test(item.note)
  )))
  for (const file of [
    "app/api/app/learning/progress/events/route.ts",
    "app/api/app/learning/progress/route.ts",
    "app/api/app/learning/progress/sync/route.ts",
    "app/api/app/profile/route.ts",
    "lib/aliyun-rds/postgres.server.ts",
  ]) {
    assert.ok(report.inventory.databaseUrlCnFiles.includes(file), file)
  }
  assert.ok(report.inventory.postgresAdapterFiles.length >= 60)
  for (const file of [
    "app/api/app/customer-profiles/[profileId]/route.ts",
    "app/api/app/customer-profiles/route.ts",
    "app/api/app/knowledge-spaces/route.ts",
    "app/api/app/learning/progress/route.ts",
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
    "app/api/app/voice-coach/sessions/route.ts",
    "lib/aliyun-rds/postgres.server.ts",
    "lib/aliyun-rds/repositories/account-profile.server.ts",
    "lib/aliyun-rds/repositories/app-content-workflows.server.ts",
    "lib/aliyun-rds/repositories/app-voice-coach-facade.server.ts",
    "lib/aliyun-rds/repositories/customer-profiles.server.ts",
    "lib/aliyun-rds/repositories/learning-progress.server.ts",
    "lib/aliyun-rds/repositories/service-record-processing.server.ts",
    "lib/aliyun-rds/repositories/service-records.server.ts",
    "lib/aliyun-rds/repositories/store-admin.server.ts",
    "lib/aliyun-rds/repositories/store-invites.server.ts",
    "lib/aliyun-rds/repositories/store-profiles.server.ts",
    "lib/aliyun-rds/service-record-asr.server.ts",
    "lib/aliyun-rds/service-record-oss.server.ts",
  ]) {
    assert.ok(report.inventory.postgresAdapterFiles.includes(file), file)
  }
  assert.equal(report.inventory.schemaMap.file, "deploy/aliyun-production-cn.rds-first-version-schema-map.json")
  assert.equal(report.inventory.bridgeMap.file, "deploy/app-api-production-cn.bridge-map.json")
  assert.equal(report.inventory.bridgeMap.ready, true)
  assert.ok(report.inventory.schemaMap.requiredTables.includes("profiles"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("entitlements"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("mp_ai_point_ledger"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("store_profiles"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("voice_coach_sessions"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("voice_coach_scene_cards"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("voice_coach_turns"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("service_record_sessions"))
  assert.ok(report.inventory.schemaMap.requiredTables.includes("app_learning_progress_events"))

  assert.ok(report.inventory.tables.includes("profiles"))
  assert.ok(report.inventory.tables.includes("mp_account_memberships"))
  assert.ok(report.inventory.tables.includes("service_record_sessions"))
  assert.ok(report.inventory.tables.includes("voice_coach_customer_profiles"))
  assert.ok(report.inventory.storageBuckets.includes("delivery-packs"))
  assert.ok(report.inventory.rpcs.includes("consume_credits"))
  assert.ok(report.inventory.rpcs.includes("grant_trial_credits"))

  assert.equal(byRoute.get("/api/app/auth/wechat").directUsesSupabase, true)
  assert.equal(byRoute.get("/api/app/auth/wechat").firstVersionRdsRequired, false)
  assert.equal(byRoute.get("/api/app/auth/wechat").appApiScopeClass, "deferred_wechat_mobile_login")
  assert.ok(byRoute.get("/api/app/auth/wechat").tables.includes("profiles"))
  assert.equal(byRoute.get("/api/app/auth/logout").directUsesSupabase, false)
  assert.equal(byRoute.get("/api/app/auth/logout").directSupabaseDataAccess, false)
  assert.equal(byRoute.get("/api/app/auth/logout").usesSupabaseDataAccess, false)
  assert.equal(byRoute.get("/api/app/auth/logout").appApiScopeClass, "auth")
  assert.equal(byRoute.get("/api/app/wechat/login").directUsesSupabase, false)
  assert.equal(byRoute.get("/api/app/wechat/login").firstVersionRdsRequired, false)
  assert.ok(byRoute.get("/api/app/wechat/login").supabaseDependencyFiles.includes("app/api/app/auth/wechat/route.ts"))
  assert.equal(byRoute.get("/api/app/health").usesSupabaseDataAccess, false)
  assert.equal(byRoute.get("/api/app/scene-cards").firstVersionRdsRequired, false)
  assert.equal(byRoute.get("/api/app/profile").firstVersionRdsRequired, true)
  assert.equal(byRoute.get("/api/app/profile").usesSupabaseDataAccess, false)
  assert.equal(byRoute.get("/api/app/profile").directSupabaseDataAccess, false)
  assert.ok(byRoute.get("/api/app/profile").envKeys.includes("DATABASE_URL_CN"))
  assert.deepEqual(byRoute.get("/api/app/profile").supabaseDataAccessDependencyFiles, [])
  assert.equal(byRoute.get("/api/app/entitlements").firstVersionRdsRequired, true)
  assert.equal(byRoute.get("/api/app/entitlements").usesSupabaseDataAccess, false)
  assert.deepEqual(byRoute.get("/api/app/entitlements").supabaseDataAccessDependencyFiles, [])
  for (const routePath of [
    "/api/app/learning/progress",
    "/api/app/learning/progress/events",
    "/api/app/learning/progress/sync",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.firstVersionRdsRequired, true, routePath)
    assert.equal(route.firstVersionCapability, "professional_learning_progress", routePath)
    assert.equal(route.appApiScopeClass, "learning-progress", routePath)
    assert.equal(route.usesSupabase, true, routePath)
    assert.equal(route.usesSupabaseDataAccess, false, routePath)
    assert.equal(route.directSupabaseDataAccess, false, routePath)
    assert.ok(route.envKeys.includes("DATABASE_URL_CN"), routePath)
    assert.deepEqual(route.supabaseDataAccessDependencyFiles, [], routePath)
  }
  for (const routePath of [
    "/api/app/store-profiles",
    "/api/app/store-profiles/[profileId]",
    "/api/app/customer-profiles",
    "/api/app/customer-profiles/[profileId]",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.firstVersionRdsRequired, true, routePath)
    assert.equal(route.usesSupabaseDataAccess, false, routePath)
    assert.equal(route.directSupabaseDataAccess, false, routePath)
    assert.ok(route.envKeys.includes("DATABASE_URL_CN"), routePath)
    assert.deepEqual(route.supabaseDataAccessDependencyFiles, [], routePath)
  }
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
    assert.equal(route.firstVersionRdsRequired, true, routePath)
    assert.equal(route.usesSupabaseDataAccess, false, routePath)
    assert.equal(route.directSupabaseDataAccess, false, routePath)
    assert.deepEqual(route.supabaseDataAccessDependencyFiles, [], routePath)
  }
  for (const routePath of [
    "/api/app/store-admin/overview",
    "/api/app/store-admin/members",
    "/api/app/store-admin/analytics",
    "/api/app/store-admin/invites",
    "/api/app/store-admin/invites/[token]/preview",
    "/api/app/store-admin/invites/[token]/accept",
    "/api/app/store-admin/invites/[token]/qrcode",
  ]) {
    const route = byRoute.get(routePath)
    assert.equal(route.firstVersionRdsRequired, true, routePath)
    assert.equal(route.usesSupabaseDataAccess, false, routePath)
    assert.equal(route.directSupabaseDataAccess, false, routePath)
    assert.deepEqual(route.supabaseDataAccessDependencyFiles, [], routePath)
  }
  assert.ok(!byRoute.get("/api/app/profile").supabaseDependencyFiles.includes("lib/mp/account-context.server.ts"))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("professional learning admission does not absorb unknown future subroutes", async () => {
  const { classifyFirstVersionRdsScope } = await import(
    pathToFileURL(path.join(root, "scripts", "summarize-aliyun-rds-migration-plan.mjs")).href
  )
  const admitted = classifyFirstVersionRdsScope("/api/app/learning/progress/sync", { scope: "learning-progress" })
  const future = classifyFirstVersionRdsScope("/api/app/learning/progress/future", { scope: "learning-progress" })

  assert.equal(admitted.firstVersionRdsRequired, true)
  assert.equal(admitted.capability, "professional_learning_progress")
  assert.equal(future.firstVersionRdsRequired, false)
  assert.equal(future.appApiScopeClass, "unclassified_learning-progress")
})

test("Aliyun RDS migration plan markdown explains blockers and phases without values", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-rds-migration-plan-"))
  const markdownPath = path.join(tmpdir, "rds-migration-plan.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-rds-migration-plan.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /Formal target: Aliyun RDS PostgreSQL/)
  assert.match(markdown, /APP API routes: 59/)
  assert.match(markdown, /APP API routes using Supabase: 57/)
  assert.match(markdown, /APP API routes using Supabase data access: 2/)
  assert.match(markdown, /First-version RDS required APP API routes: 28/)
  assert.match(markdown, /First-version RDS required routes using Supabase: 26/)
  assert.match(markdown, /First-version RDS required routes using Supabase data access: 0/)
  assert.match(markdown, /Deferred APP API routes: 31/)
  const deferredRoutesSection = markdown
    .split("## Deferred APP API Routes")[1]
    .split("## Full APP API Supabase Routes")[0]
  assert.doesNotMatch(deferredRoutesSection, /- \/api\/app\/learning\/progress(?:\/events|\/sync)?\n  - file:/)
  assert.match(markdown, /DATABASE_URL_CN/)
  assert.match(markdown, /PostgreSQL data access adapter detected: true/)
  assert.match(markdown, /RDS schema map ready: true/)
  assert.match(markdown, /lib\/aliyun-rds\/postgres\.server\.ts/)
  assert.match(markdown, /lib\/aliyun-rds\/repositories\/account-profile\.server\.ts/)
  assert.match(markdown, /SUPABASE_TO_RDS_DATA_ACCESS_MIGRATION/)
  assert.match(markdown, /First-version RDS Supabase Data Access Routes/)
  assert.match(markdown, /Deferred APP API Routes/)
  assert.match(markdown, /RDS03_BUILD_POSTGRES_DATA_ACCESS_ADAPTER/)
  assert.match(markdown, /RDS06_SWITCH_PRODUCTION_CN_AND_ROLLBACK/)
  assert.match(markdown, /This command does not read \.env files or output secret values/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
