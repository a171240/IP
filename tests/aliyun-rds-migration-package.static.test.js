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

test("Aliyun RDS migration package command is wired into scripts, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:rds:migration:package"], "node ./scripts/generate-aliyun-rds-migration-package.mjs")
  assert.equal(pkg.scripts["aliyun:rds:migration:package:test"], "node --test tests/aliyun-rds-migration-package.static.test.js")
  assert.match(predeploy, /aliyun:rds:migration:package:test/)
  assert.match(predeploy, /aliyun:rds:migration:package/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:rds:migration:package/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:rds:migration:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:rds:migration:package"))
  assert.match(releaseArtifacts, /rdsMigrationPackage/)
  assert.match(releaseArtifacts, /rds-migration-package\.json/)
  assert.match(releaseArtifacts, /rds-schema\.sql/)
  assert.match(releaseArtifacts, /rds-validation\.sql/)
})

test("Aliyun RDS migration package generates non-secret SQL and validation artifacts", () => {
  const outDir = path.join(os.tmpdir(), `aliyun-rds-migration-package-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-rds-migration-package.mjs",
    "--out-dir",
    outDir,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const schemaSql = fs.readFileSync(path.join(outDir, "rds-schema.sql"), "utf8")
  const validationSql = fs.readFileSync(path.join(outDir, "rds-validation.sql"), "utf8")
  const rollback = fs.readFileSync(path.join(outDir, "rds-rollback-checklist.md"), "utf8")
  const markdown = fs.readFileSync(path.join(outDir, "rds-migration-package.md"), "utf8")
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "rds-migration-package.json"), "utf8"))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.summary.sourceFileCount, 6)
  assert.equal(report.summary.requiredTableCount, 9)
  assert.equal(report.summary.requiredFunctionCount, 1)
  assert.equal(report.summary.requiredStorageCount, 1)
  assert.equal(report.files.schemaSql, path.join(outDir, "rds-schema.sql"))
  assert.equal(report.summary.schemaSqlSha256, manifest.summary.schemaSqlSha256)
  assert.ok(report.sourceFiles.some((item) => item.path === "supabase/migrations/20260513085315_add_service_record_sessions.sql"))
  assert.match(schemaSql, /create table if not exists public\.service_record_sessions/)
  assert.match(schemaSql, /Source: supabase\/migrations\/20260513085315_add_service_record_sessions\.sql/)
  assert.match(validationSql, /to_regclass\('public\.service_record_sessions'\)/)
  assert.match(validationSql, /from public\.service_record_sessions/)
  assert.match(validationSql, /p\.proname = 'consume_credits'/)
  assert.match(rollback, /Supabase as migration source/)
  assert.match(markdown, /schemaSqlSha256/)
  assert.doesNotMatch(output + schemaSql + validationSql + rollback + markdown, secretLike)
})
