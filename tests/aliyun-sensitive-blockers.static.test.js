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

function runSensitive(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  return { output, report: JSON.parse(output) }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, secretLike)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

test("Aliyun sensitive blockers command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:sensitive:blockers"], "node ./scripts/summarize-aliyun-sensitive-blockers.mjs")
  assert.equal(pkg.scripts["aliyun:sensitive:blockers:backend"], "node ./scripts/summarize-aliyun-sensitive-blockers.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:sensitive:blockers:test"], "node --test tests/aliyun-sensitive-blockers.static.test.js")
  assert.match(predeploy, /aliyun:sensitive:blockers:test/)
  assert.match(predeploy, /aliyun:sensitive:blockers/)
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:sensitive:blockers"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers"))
})

test("Aliyun sensitive blockers backend-only mode has no remaining credential blockers", () => {
  const { output, report } = runSensitive(["--backend-only"])

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.backendOnly, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.deepEqual(report.deferredAppLaunchSensitiveActionIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.deepEqual(report.items.map((item) => item.id), [])
  assert.deepEqual(report.summary.blockedIds, [])
  assert.deepEqual(report.summary.actionTimeConfirmationRequired, [])
  assert.deepEqual(report.summary.userIntervention.blockedVariableNames, [])
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 0)
  assert.deepEqual(report.credentialInterventionBrief.blockedCredentialNames, [])
  assert.equal(report.credentialInterventionBrief.readySecretEnvVariableCount, 0)
  assert.deepEqual(report.credentialInterventionBrief.actionTimeConfirmationRequiredIds, [])
  assert.equal(report.credentialPasswordIntervention.required, false)
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.names, [])
  assert.deepEqual(report.credentialPasswordIntervention.readySecretsPendingCloudImport.names, [])
  assert.deepEqual(report.credentialPasswordIntervention.controlledSecretChannelActionIds, [])
  assert.equal(report.credentialAcquisitionQueue.queueScope, "backend_aliyun_only")
  assert.deepEqual(report.credentialAcquisitionQueue.missingCredentialNames, [])
  assert.equal(report.credentialAcquisitionQueue.onlyMissingBackendCredentialValue, "")
  assert.deepEqual(report.credentialAcquisitionQueue.items, [])
  assert.deepEqual(report.backendOnlyCredentialExecutionOrder.credentialCanStartAfterActionTimeConfirmationIds, [])
  assert.deepEqual(report.backendOnlyCredentialExecutionOrder.credentialBlockedByDependencyIds, [])
  assert.match(report.currentAnswer, /没有未完成的密钥/)
  assertNoSecretLikeValues(output)
})

test("Aliyun sensitive blockers full APP scope only keeps deferred app launch credentials", () => {
  const { output, report } = runSensitive()
  const ids = report.items.map((item) => item.id)
  const groupById = new Map(report.credentialInterventionBrief.groups.map((item) => [item.actionId, item]))

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "full_app_launch")
  assert.deepEqual(ids, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.equal(report.summary.total, 3)
  assert.equal(report.summary.blocked, 3)
  assert.deepEqual(report.summary.actionTimeConfirmationRequired, ids)
  assert.equal(report.credentialInterventionBrief.blockedCredentialCount, 7)
  assert.deepEqual(report.credentialInterventionBrief.blockedCredentialNames, [
    "APPLE_TEAM_ID",
    "MEIYE_RELEASE_KEY_ALIAS",
    "MEIYE_RELEASE_KEY_PASSWORD",
    "MEIYE_RELEASE_STORE_FILE",
    "MEIYE_RELEASE_STORE_PASSWORD",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
  ])
  assert.equal(report.credentialInterventionBrief.readySecretEnvVariableCount, 0)
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.actionIds, ids)
  assert.deepEqual(report.summary.userIntervention.groups.external_review_then_app_credentials, ["S01_WECHAT_OPEN_APP_LOGIN"])
  assert.deepEqual(report.summary.userIntervention.groups.external_identifier_lookup, ["S02_APPLE_TEAM_ID"])
  assert.deepEqual(report.summary.userIntervention.groups.android_release_signing_secret, ["S07_ANDROID_RELEASE_SIGNING"])
  assert.equal(report.summary.userIntervention.groups.controlled_secret_channel, undefined)
  assert.match(groupById.get("S01_WECHAT_OPEN_APP_LOGIN").obtainFrom, /微信开放平台/)
  assert.ok(groupById.get("S01_WECHAT_OPEN_APP_LOGIN").writeTargets.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.match(groupById.get("S02_APPLE_TEAM_ID").obtainFrom, /Apple Developer/)
  assert.match(groupById.get("S07_ANDROID_RELEASE_SIGNING").valueHandling, /signing secret store/)
  assert.ok(!ids.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(!ids.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.ok(!ids.includes("S05_OSS_RAM_SECRET_OR_STS"))
  assertNoSecretLikeValues(output)
})

test("Aliyun sensitive blockers markdown renders the current value-free scopes", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-sensitive-blockers-"))
  const backendMarkdown = path.join(tmpdir, "backend.md")
  const fullMarkdown = path.join(tmpdir, "full.md")

  execFileSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--backend-only",
    "--markdown",
    backendMarkdown,
  ], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 60 })
  execFileSync(process.execPath, [
    "scripts/summarize-aliyun-sensitive-blockers.mjs",
    "--markdown",
    fullMarkdown,
  ], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 60 })

  const backend = fs.readFileSync(backendMarkdown, "utf8")
  const full = fs.readFileSync(fullMarkdown, "utf8")

  assert.match(backend, /currentScope: backend_aliyun_only/)
  assert.match(backend, /blockedCredentialCount: 0/)
  assert.match(backend, /blockedCredentialNames: none/)
  assert.match(backend, /readySecretEnvVariableCount: 0/)
  assert.match(backend, /deferredAppLaunchSensitiveActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING/)
  assert.match(full, /currentScope: full_app_launch/)
  assert.match(full, /blockedCredentialCount: 7/)
  assert.match(full, /blockedCredentialNames: APPLE_TEAM_ID/)
  assert.match(full, /WECHAT_OPEN_APP_SECRET -> 阿里云 KMS\/Secrets Manager\/SAE secret env/)
  assert.match(full, /android_release_signing/)
  assert.doesNotMatch(full, /S08_ALIYUN_RDS_DATABASE_URL/)
  assertNoSecretLikeValues(backend + full)
})

test("Tracked sensitive blocker docs match the current backend and full APP scopes", () => {
  const backendSensitiveDoc = read("docs", "app-production-cn-backend-sensitive-blockers.md")
  const backendImportBatches = read("docs", "app-production-cn-backend-secret-env-import-batches.md")
  const fullSensitiveDoc = read("docs", "app-production-cn-sensitive-blockers.md")

  assert.match(backendSensitiveDoc, /currentScope: backend_aliyun_only/)
  assert.match(backendSensitiveDoc, /blockedCredentialCount: 0/)
  assert.match(backendSensitiveDoc, /blockedCredentialNames: none/)
  assert.match(backendSensitiveDoc, /credentialCanStartAfterActionTimeConfirmationIds: none/)
  assert.match(backendSensitiveDoc, /deferredAppLaunchSensitiveActionIds: S01_WECHAT_OPEN_APP_LOGIN, S02_APPLE_TEAM_ID, S07_ANDROID_RELEASE_SIGNING/)
  assert.match(backendImportBatches, /blockedCredentialCount=0/)
  assert.match(backendImportBatches, /readySecretEnvVariableCount=0/)
  assert.match(backendImportBatches, /WECHAT_OPEN_APP_ID/)
  assert.match(backendImportBatches, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(fullSensitiveDoc, /currentScope: full_app_launch/)
  assert.match(fullSensitiveDoc, /blockedCredentialCount: 7/)
  assert.match(fullSensitiveDoc, /WECHAT_OPEN_APP_SECRET/)
  assert.match(fullSensitiveDoc, /APPLE_TEAM_ID/)
  assert.match(fullSensitiveDoc, /MEIYE_RELEASE_STORE_PASSWORD/)
  assert.doesNotMatch(fullSensitiveDoc, /S08_ALIYUN_RDS_DATABASE_URL/)
  assertNoSecretLikeValues(backendSensitiveDoc + backendImportBatches + fullSensitiveDoc)
})

test("Release artifact helper still carries sensitive blocker acquisition fields", () => {
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const doc = read("docs", "DEPLOY_ALIYUN_PRODUCTION_CN.md")

  assert.match(releaseArtifacts, /renderSensitiveBlockerSummaryLines\(sensitiveBlockers\.items \|\| \[\]\)/)
  assert.match(releaseArtifacts, /credentialInterventionBrief/)
  assert.match(releaseArtifacts, /blockedVariableNames/)
  assert.match(releaseArtifacts, /readySecretEnvVariableCount/)
  assert.match(releaseArtifacts, /formatUserInterventionGroups/)
  assert.match(doc, /aliyun:sensitive:blockers:backend/)
  assertNoSecretLikeValues(releaseArtifacts + doc)
})
