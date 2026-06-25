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
  assert.equal(report.summary.routesStillUsingSupabaseDataAccess, 25)
  assert.equal(report.summary.observedTableCount, 15)
  assert.equal(report.summary.requiredTableCount, 15)
  assert.equal(report.summary.observedRpcCount, 2)
  assert.equal(report.summary.requiredFunctionCount, 2)
  assert.deepEqual(report.summary.schemaMapMissingObservedTables, [])
  assert.deepEqual(report.summary.schemaMapMissingObservedRpcs, [])
  assert.deepEqual(report.summary.requiredTablesWithoutRouteObservation, [])
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(report.summary.rdsPlanRequiredBlocking.includes("first_version_supabase_data_access_still_present"))

  assert.ok(report.observedTables.includes("profiles"))
  assert.ok(report.observedTables.includes("entitlements"))
  assert.ok(report.observedTables.includes("mp_ai_point_ledger"))
  assert.ok(report.observedTables.includes("store_profiles"))
  assert.ok(report.observedTables.includes("voice_coach_sessions"))
  assert.ok(report.observedTables.includes("voice_coach_turns"))
  assert.ok(report.observedTables.includes("service_record_sessions"))
  assert.ok(report.observedRpcs.includes("consume_credits"))
  assert.ok(report.observedRpcs.includes("grant_trial_credits"))
  assert.deepEqual(report.rdsAdapterFiles, ["lib/aliyun-rds/postgres.server.ts"])

  assert.equal(byRoute.get("/api/app/profile").stillUsesSupabaseDataAccess, true)
  assert.ok(byRoute.get("/api/app/profile").tableNames.includes("entitlements"))
  assert.ok(byRoute.get("/api/app/profile").tableNames.includes("mp_account_memberships"))
  assert.ok(byRoute.get("/api/app/profile").rpcNames.includes("grant_trial_credits"))
  assert.ok(byRoute.get("/api/app/profile").dataAccessFiles.some((item) => item.file === "lib/mp/account-context.server.ts"))
  assert.ok(byRoute.get("/api/app/service-records/sessions").tableNames.includes("service_record_sessions"))
  assert.ok(byRoute.get("/api/app/service-records/sessions").dataAccessFiles.some((item) => item.file === "lib/service-records/server.ts"))
  assert.ok(byRoute.get("/api/app/store-admin/overview").tableNames.includes("voice_coach_sessions"))
  assert.ok(byRoute.get("/api/app/store-admin/members").tableNames.includes("voice_coach_turns"))
  assert.ok(byRoute.get("/api/app/store-profiles").tableNames.includes("store_profiles"))

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
  assert.match(markdown, /routesStillUsingSupabaseDataAccess: 25/)
  assert.match(markdown, /schemaMapMissingObservedTables: none/)
  assert.match(markdown, /\/api\/app\/service-records\/sessions/)
  assert.match(markdown, /lib\/service-records\/server\.ts/)
  assert.match(markdown, /Create or confirm Aliyun RDS PostgreSQL/)
  assert.doesNotMatch(output + markdown, secretLike)
})
