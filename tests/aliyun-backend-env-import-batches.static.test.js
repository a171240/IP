const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i
const fixtureEnvFile = path.join("tests", "fixtures", "aliyun-user-action-brief", "env.production-cn.fixture")
const fixtureCloudConfirmations = path.join("tests", "fixtures", "aliyun-user-action-brief", "cloud-confirmations.fixture.json")

function runBatches(extraArgs = []) {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-backend-env-import-batches.mjs",
    "--env-file",
    fixtureEnvFile,
    "--cloud-confirmations",
    fixtureCloudConfirmations,
    ...extraArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

test("Aliyun backend env import batches command accepts explicit non-secret fixtures", () => {
  const script = read("scripts", "generate-aliyun-backend-env-import-batches.mjs")

  assert.match(script, /summarize-aliyun-sensitive-blockers\.mjs/)
  assert.match(script, /--backend-only/)
  assert.match(script, /--env-file/)
  assert.match(script, /--cloud-confirmations/)
  assert.match(script, /envFile/)
  assert.match(script, /cloudConfirmationsFile/)
})

test("Aliyun backend env import batches report is value-free and backend-only", () => {
  const { output, report } = runBatches()

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.sourceFiles.envFile, path.join(root, fixtureEnvFile))
  assert.equal(report.sourceFiles.cloudConfirmationsFile, path.join(root, fixtureCloudConfirmations))
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.blockedCredentialCount, 1)
  assert.deepEqual(report.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.readySecretEnvVariableCount, 20)
  assert.equal(report.readySecretEnvVariableGroupCount, 10)
  assert.equal(report.summary.importBatchCount, 12)
  assert.equal(report.summary.blockedSecretImportBatchCount, 2)
  assert.equal(report.summary.readySecretImportBatchCount, 10)
  assert.equal(report.importBatches.length, 12)
  assert.equal(report.blockedSecretImportBatches.length, 2)
  assert.equal(report.readySecretImportBatches.length, 10)
  assert.ok(report.summary.importBatchIds.includes("BLOCKED_SECRET_BATCH_01_OSS_RAM_STS"))
  assert.ok(report.summary.importBatchIds.includes("BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION"))
  assert.ok(report.summary.importBatchIds.includes("READY_SECRET_BATCH_10_MINI_PROGRAM_COMPAT"))
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
  assert.deepEqual(report.actionTimeConfirmationRequiredIds, [
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.equal(report.actionTimeConfirmationRequiredIds.includes("S04_ACR_REGISTRY_AUTH"), false)
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
  assert.equal(ossBatch.preferredCredentialMode, "sae_runtime_role")
  assert.equal(ossBatch.preferredModeAvoidsLongLivedSecret, true)
  assert.ok(ossBatch.plainEnvVariableNames.includes("ALIBABA_CLOUD_ROLE_ARN"))
  assert.ok(ossBatch.plainEnvVariableNames.includes("ALIBABA_CLOUD_OIDC_PROVIDER_ARN"))
  assert.ok(ossBatch.plainEnvVariableNames.includes("ALIBABA_CLOUD_OIDC_TOKEN_FILE"))
  assert.ok(ossBatch.optionalVariableNames.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"))
  assert.ok(ossBatch.optionalVariableNames.includes("ALIYUN_OSS_SECURITY_TOKEN"))
  assert.ok(ossBatch.readySecretEnvVariableNames.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"))
  assert.ok(ossBatch.dependencyEvidence.includes("oss.ramLeastPrivilege=true"))
  assert.ok(ossBatch.dependencyEvidence.includes("ALIBABA_CLOUD_ROLE_ARN / ALIBABA_CLOUD_OIDC_PROVIDER_ARN / ALIBABA_CLOUD_OIDC_TOKEN_FILE runtime env set when accessMode=sae_runtime_role"))
  const miniProgramBatch = report.readySecretImportBatches.find((batch) => batch.category === "mini_program_compat")
  assert.ok(miniProgramBatch)
  assert.equal(miniProgramBatch.canImportNow, false)
  assert.deepEqual(miniProgramBatch.readySecretEnvVariableNames, ["WECHAT_MINI_APPID", "WECHAT_MINI_SECRET"])
  assert.equal(miniProgramBatch.phase, "ready_by_name_blocked_until_authorized_aliyun_secret_env_import")
  assert.ok(report.readySecretEnvVariableGroups.some((group) =>
    group.category === "aliyun_oss" &&
    group.variableNames.includes("ALIYUN_OSS_ACCESS_KEY_SECRET")
  ))
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

test("Aliyun backend env import batches markdown matches generated handoff shape", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-env-import-batches-"))
  const jsonPath = path.join(tmpdir, "backend-env-import-batches.json")
  const markdownPath = path.join(tmpdir, "backend-env-import-batches.md")
  runBatches(["--out", jsonPath, "--markdown", markdownPath])
  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(report.summary.readySecretEnvVariableGroupCount, 10)
  assert.match(markdown, /backend-only secret env import batches/)
  assert.match(markdown, /blockedCredentialCount=1/)
  assert.match(markdown, /readySecretEnvVariableGroupCount=10/)
  assert.match(markdown, /## Machine-Readable Import Batches/)
  assert.match(markdown, /BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION/)
  assert.match(markdown, /READY_SECRET_BATCH_10_MINI_PROGRAM_COMPAT/)
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
  assert.doesNotMatch(markdown, secretLike)
})
