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

test("Aliyun backend env import batches command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const script = read("scripts", "generate-aliyun-backend-env-import-batches.mjs")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:backend-env-import:batches"], "node ./scripts/generate-aliyun-backend-env-import-batches.mjs")
  assert.equal(pkg.scripts["aliyun:backend-env-import:batches:test"], "node --test tests/aliyun-backend-env-import-batches.static.test.js")
  assert.match(script, /summarize-aliyun-sensitive-blockers\.mjs/)
  assert.match(script, /--backend-only/)
  assert.match(predeploy, /aliyun:backend-env-import:batches:test/)
  assert.match(predeploy, /aliyun:backend-env-import:batches/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-env-import:batches:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-env-import:batches"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:backend-env-import:batches"))
  assert.match(deploySpecChecker, /corepack pnpm aliyun:backend-env-import:batches/)
  assert.match(releaseArtifacts, /backend-env-import-batches\.json/)
  assert.match(releaseArtifacts, /backendEnvImportBatches/)
  assert.match(releaseArtifacts, /readySecretEnvVariableGroupCount/)
})

test("Aliyun backend env import batches report is value-free and backend-only", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-backend-env-import-batches.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.blockedCredentialCount, 1)
  assert.deepEqual(report.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.readySecretEnvVariableCount, 17)
  assert.equal(report.readySecretEnvVariableGroupCount, 9)
  assert.equal(report.summary.importBatchCount, 11)
  assert.equal(report.summary.blockedSecretImportBatchCount, 2)
  assert.equal(report.summary.readySecretImportBatchCount, 9)
  assert.equal(report.importBatches.length, 11)
  assert.equal(report.blockedSecretImportBatches.length, 2)
  assert.equal(report.readySecretImportBatches.length, 9)
  assert.ok(report.summary.importBatchIds.includes("BLOCKED_SECRET_BATCH_01_OSS_RAM_STS"))
  assert.ok(report.summary.importBatchIds.includes("BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION"))
  assert.ok(report.summary.importBatchIds.includes("READY_SECRET_BATCH_09_MINI_PROGRAM_COMPAT"))
  assert.deepEqual(report.sourceCommands, [
    "corepack pnpm aliyun:backend-cn:status",
    "corepack pnpm aliyun:sensitive:blockers:backend",
  ])
  assert.equal(report.statusConsistency.deploymentGate, "corepack pnpm aliyun:backend-cn:status")
  assert.equal(report.statusConsistency.credentialGate, "corepack pnpm aliyun:sensitive:blockers:backend")
  assert.ok(report.statusConsistency.sharedCredentialFields.includes("blockedCredentialNames"))
  assert.match(report.statusConsistency.backendOnlyCredentialConclusion, /blockedCredentialNames=DATABASE_URL_CN/)
  assert.match(report.statusConsistency.productionDatabaseDecision, /Aliyun RDS PostgreSQL/)
  assert.match(report.statusConsistency.appLaunchDecision, /not current backend-only blockers/)
  assert.ok(report.actionTimeConfirmationRequiredIds.includes("S03_ACR_PAID_PURCHASE"))
  assert.ok(report.actionTimeConfirmationRequiredIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.deferredAppLaunchSensitiveActionIds.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(report.deferredAppLaunchSensitiveActionIds.includes("S07_ANDROID_RELEASE_SIGNING"))
  assert.deepEqual(report.summary.notYetImportableVariableNames, ["DATABASE_URL_CN"])
  const rdsBatch = report.blockedSecretImportBatches.find((batch) => batch.category === "rds_database_secret_and_migration")
  assert.ok(rdsBatch)
  assert.equal(rdsBatch.canImportNow, false)
  assert.deepEqual(rdsBatch.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(rdsBatch.dependencyEvidence.includes("migration.schemaCompatibilityReviewed=true"))
  assert.ok(rdsBatch.verifyCommands.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))
  const ossBatch = report.blockedSecretImportBatches.find((batch) => batch.category === "oss_ram_sts")
  assert.ok(ossBatch)
  assert.equal(ossBatch.canImportNow, false)
  assert.ok(ossBatch.optionalVariableNames.includes("ALIYUN_OSS_SECURITY_TOKEN"))
  assert.ok(ossBatch.readySecretEnvVariableNames.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"))
  assert.ok(ossBatch.dependencyEvidence.includes("oss.ramLeastPrivilege=true"))
  const miniProgramBatch = report.readySecretImportBatches.find((batch) => batch.category === "mini_program_compat")
  assert.ok(miniProgramBatch)
  assert.equal(miniProgramBatch.canImportNow, false)
  assert.deepEqual(miniProgramBatch.readySecretEnvVariableNames, ["WECHAT_MINI_APPID", "WECHAT_MINI_SECRET"])
  assert.equal(miniProgramBatch.phase, "ready_by_name_blocked_until_authorized_aliyun_secret_env_import")
  assert.ok(report.readySecretEnvVariableGroups.some((group) =>
    group.category === "legacy_database_migration_source" &&
    group.variableNames.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    group.importTarget.includes("formal database target is Aliyun RDS PostgreSQL")
  ))
  assert.ok(report.readySecretEnvVariableGroups.some((group) =>
    group.category === "mini_program_compat" &&
    group.variableNames.includes("WECHAT_MINI_SECRET")
  ))
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend env import batches markdown matches committed handoff shape", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-env-import-batches-"))
  const jsonPath = path.join(tmpdir, "backend-env-import-batches.json")
  const markdownPath = path.join(tmpdir, "backend-env-import-batches.md")
  execFileSync(process.execPath, [
    "scripts/generate-aliyun-backend-env-import-batches.mjs",
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const committed = read("docs", "app-production-cn-backend-secret-env-import-batches.md")

  assert.equal(report.summary.readySecretEnvVariableGroupCount, 9)
  assert.match(markdown, /backend-only secret env import batches/)
  assert.match(markdown, /blockedCredentialCount=1/)
  assert.match(markdown, /readySecretEnvVariableGroupCount=9/)
  assert.match(markdown, /## Machine-Readable Import Batches/)
  assert.match(markdown, /BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION/)
  assert.match(markdown, /READY_SECRET_BATCH_09_MINI_PROGRAM_COMPAT/)
  assert.match(markdown, /Can import now/)
  assert.match(markdown, /## Status Source Consistency/)
  assert.match(markdown, /Deployment gate: `corepack pnpm aliyun:backend-cn:status`/)
  assert.match(markdown, /Credential gate: `corepack pnpm aliyun:sensitive:blockers:backend`/)
  assert.match(markdown, /Supabase variables are migration source \/ legacy compatibility inputs only/)
  assert.match(markdown, /ALIYUN_OSS_SECURITY_TOKEN/)
  assert.match(markdown, /DATABASE_URL_CN/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /S01_WECHAT_OPEN_APP_LOGIN/)
  assert.match(markdown, /They do not unblock native APP WeChat login/)
  assert.match(committed, /backend-only secret env import batches/)
  assert.match(committed, /blockedCredentialCount=1/)
  assert.match(committed, /readySecretEnvVariableGroupCount=9/)
  assert.match(committed, /## Status Source Consistency/)
  assert.doesNotMatch(markdown + committed, secretLike)
})
