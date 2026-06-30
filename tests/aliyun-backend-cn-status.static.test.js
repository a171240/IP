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
const fixtureArgs = Object.freeze([
  "--env-file",
  "tests/fixtures/aliyun-user-action-brief/env.production-cn.fixture",
  "--cloud-confirmations",
  "tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json",
  "--cloud-inventory-results",
  "tests/fixtures/aliyun-user-action-brief/cloud-inventory-results.fixture.json",
  "--rds-migration",
  "tests/fixtures/aliyun-user-action-brief/rds-migration.fixture.json",
  "--image-publish",
  "tests/fixtures/aliyun-user-action-brief/image-publish.fixture.json",
])

function commandEnv() {
  return {
    ...process.env,
    MEIYE_ALIYUN_RUN_JSON_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-cn-status-cache-")),
  }
}

function assertIncludesAll(actual, expected) {
  for (const value of expected) {
    assert.ok(actual.includes(value), `${value} missing from ${JSON.stringify(actual)}`)
  }
}

function assertInExactlyOnePacketGroup(packetId, left, right) {
  const inLeft = left.includes(packetId)
  const inRight = right.includes(packetId)
  assert.notEqual(inLeft, inRight, `${packetId} should be in exactly one packet group`)
}

function runBackendStatus(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    ...args,
  ], {
    cwd: root,
    env: commandEnv(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  return { output, report: JSON.parse(output) }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, secretLike)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

test("Aliyun backend-cn status command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const script = read("scripts", "summarize-aliyun-backend-cn-status.mjs")

  assert.equal(pkg.scripts["aliyun:backend-cn:status"], "node ./scripts/summarize-aliyun-backend-cn-status.mjs")
  assert.equal(pkg.scripts["aliyun:backend-cn:status:test"], "node --test tests/aliyun-backend-cn-status.static.test.js")
  assert.match(predeploy, /aliyun:backend-cn:status:test/)
  assert.match(predeploy, /aliyun:backend-cn:status/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:backend-cn:status/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.match(releaseArtifacts, /backend-cn-status\.json/)
  assert.match(releaseArtifacts, /backendCnStatus/)
  assert.match(script, /backend_aliyun_only/)
  assert.match(script, /deferred_after_backend_online/)
  assert.match(script, /POSTDEPLOY_SMOKE_NOT_RUN/)
  assert.match(script, /summarize-aliyun-sensitive-blockers\.mjs/)
  assert.match(script, /fail_closed_no_cloud_mutation/)
  assertNoSecretLikeValues(script)
})

test("Aliyun backend-cn status reflects current backend-only production state", () => {
  const { output, report } = runBackendStatus(fixtureArgs)
  const targetById = new Map(report.backendTargets.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.canDeployBackendNow, false)
  assert.deepEqual(report.summary.backendRequiredBlocking, [
    "ACR_IMAGE_REGISTRY_NOT_READY",
    "API_DOMAIN_HTTPS_ICP_NOT_READY",
    "ASSET_DOMAIN_HTTPS_ICP_NOT_READY",
    "DATABASE_URL_CN",
    "ENV_IMPORT_NOT_READY",
    "OSS_RAM_STS_NOT_READY",
    "POSTDEPLOY_SMOKE_NOT_RUN",
    "RDS_MIGRATION_EVIDENCE_NOT_READY",
    "SAE_RUNTIME_NOT_READY",
    "SLS_ALERTS_NOT_READY",
  ])
  assert.equal(report.summary.backendTargetReady, "0/8")
  assert.equal(report.summary.backendEvidenceScope.cloudConfirmationsBackendReady, "0/6")
  assert.match(report.summary.backendEvidenceScope.cloudResourceEvidenceReady, /^[01]\/7$/)
  assert.equal(report.summary.evidenceWritebackReady, "1/4")
  assert.equal(report.summary.evidenceWritebackTotalGaps, 40)
  assert.deepEqual(report.summary.evidenceWritebackGapSummary, {
    rdsMigrationGaps: 16,
    cloudInventoryResultGaps: 0,
    cloudConfirmationGaps: 16,
    imagePublishGaps: 8,
  })
  assertIncludesAll(report.summary.evidenceWritebackCanStartNowPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assertIncludesAll(report.summary.evidenceWritebackBlockedByDependencyPacketIds, [
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
  ])
  assertInExactlyOnePacketGroup(
    "P04_ACR_IMAGE_AND_PULL",
    report.summary.evidenceWritebackCanStartNowPacketIds,
    report.summary.evidenceWritebackBlockedByDependencyPacketIds,
  )
  assertIncludesAll(report.summary.sensitiveActionBlockedIds, [
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assertIncludesAll(report.summary.actionTimeConfirmationRequiredIds, [
    "S05_OSS_RAM_SECRET_OR_STS",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "S08_ALIYUN_RDS_DATABASE_URL",
  ])
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.readySecretEnvVariableCount, 20)
  assert.equal(report.summary.credentialPasswordInterventionRequired, true)
  assertIncludesAll(report.summary.credentialPasswordInterventionActionIds, [
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])

  assert.equal(report.rdsMigration.localExists, true)
  assert.equal(report.rdsMigration.localReady, false)
  assert.equal(report.rdsMigration.rdsMigrationPhaseReady, "0/5")
  assert.deepEqual(report.rdsMigration.rdsMigrationNextPhaseIds, [
    "source_inventory_preflight",
    "compatibility_review",
    "rds_instance_and_secret",
  ])
  assert.ok(report.rdsMigration.blockers.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(report.rdsMigration.blockers.includes("migration.rollbackValidationPassed"))
  assert.equal(report.rdsMigration.postgresDataAccessAdapterDetected, true)

  assert.equal(report.cloudConfirmations.backendReady, "0/6")
  assert.deepEqual(report.cloudConfirmations.backendMissingItems, [])
  assert.ok(report.cloudConfirmations.backendBlockers.includes("runtime:confirmed"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("oss:ramLeastPrivilege"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("envImport:confirmed"))
  assert.match(report.cloudResources.evidenceReady, /^[01]\/7$/)
  assertIncludesAll(report.cloudResources.blockedIds, [
    "R01_SAE_RUNTIME",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ])
  assert.ok(
    report.cloudResources.blockedIds.includes("R02_ACR_IMAGE_REGISTRY") ||
      report.cloudResources.observedPartial.includes("R02_ACR_IMAGE_REGISTRY"),
  )

  assert.equal(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").ready, false)
  assert.ok(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("DATABASE_URL_CN"))
  assert.ok(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("RDS_MIGRATION_EVIDENCE_NOT_READY"))
  assert.equal(targetById.get("B02_ACR_IMAGE_REGISTRY").ready, false)
  assert.equal(targetById.get("B03_SAE_RUNTIME").ready, false)
  assert.ok(targetById.get("B04_DOMAINS_HTTPS_ICP").blockers.includes("API_DOMAIN_HTTPS_ICP_NOT_READY"))
  assert.equal(targetById.get("B05_OSS_RAM_STS").ready, false)
  assert.ok(targetById.get("B05_OSS_RAM_STS").blockers.includes("OSS_RAM_STS_NOT_READY"))
  assert.equal(targetById.get("B06_ENV_IMPORT").ready, false)
  assert.ok(targetById.get("B06_ENV_IMPORT").blockers.includes("ENV_IMPORT_NOT_READY"))
  assert.equal(targetById.get("B07_SLS_ALERTS").ready, false)
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").blockers.includes("POSTDEPLOY_SMOKE_NOT_RUN"))

  assert.deepEqual(report.credentialIntervention.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.credentialPasswordIntervention.required, true)
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assertIncludesAll(report.actionAuthorization.nextActionTimeConfirmationPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assertIncludesAll(report.actionAuthorization.canStartNowPackets, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assertIncludesAll(report.actionAuthorization.blockedByPacketDependencies, [
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
  ])
  assert.ok(report.summary.wechatDeferredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.equal(report.deferredScope.wechatOpenMobileApp.excludedFromBackendRequiredBlocking, true)
  assertNoSecretLikeValues(output)
})

test("Aliyun backend-cn status markdown states current backend-only blockers", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-cn-status-"))
  const markdownPath = path.join(tmpdir, "backend-cn-status.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    ...fixtureArgs,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    env: commandEnv(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /canDeployBackendNow: false/)
  assert.match(markdown, /backendRequiredBlocking: ACR_IMAGE_REGISTRY_NOT_READY/)
  assert.match(markdown, /backendReady: 0\/6/)
  assert.match(markdown, /cloudConfirmationsBackendReady: 0\/6/)
  assert.match(markdown, /cloudResourceEvidenceReady: [01]\/7/)
  assert.match(markdown, /totalGaps: 40/)
  assert.match(markdown, /rdsMigrationGaps: 16/)
  assert.match(markdown, /cloudConfirmationGaps: 16/)
  assert.match(markdown, /canStartNowPacketIds: .*P11_ALIYUN_RDS_DATA_MIGRATION.*P05_OSS_RAM_STS/)
  assert.match(markdown, /blockedByDependencyPacketIds: .*P06_ENV_IMPORT.*P07_DOMAIN_DNS_HTTPS.*P08_SAE_RUNTIME_SLS/)
  assert.match(markdown, /rdsMigration: ready=false; gaps=16; packets=P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /B01_RDS_POSTGRES_DATA_LAYER/)
  assert.match(markdown, /blockers: DATABASE_URL_CN, RDS_MIGRATION_EVIDENCE_NOT_READY/)
  assert.match(markdown, /B05_OSS_RAM_STS/)
  assert.match(markdown, /B06_ENV_IMPORT/)
  assert.match(markdown, /Credential Intervention/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /required: true/)
  assert.match(markdown, /wechatOpenMobileApp: deferred_after_backend_online/)
  assert.match(markdown, /nextActionTimeConfirmationPacketIds: .*P11_ALIYUN_RDS_DATA_MIGRATION.*P05_OSS_RAM_STS/)
  assert.match(markdown, /POSTDEPLOY_SMOKE_NOT_RUN/)
  assert.match(markdown, /corepack pnpm aliyun:rds:migration:evidence:strict/)
  assert.match(markdown, /corepack pnpm aliyun:domain:strict/)
  assertNoSecretLikeValues(output + markdown)
})
