const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|token\s*[:=]\s*\S{8,})/i
const fixtureDir = path.join(root, "tests", "fixtures", "aliyun-user-action-brief")
const fixtureArgs = [
  "--env-file",
  path.join(fixtureDir, "env.production-cn.fixture"),
  "--cloud-confirmations",
  path.join(fixtureDir, "cloud-confirmations.fixture.json"),
  "--rds-migration",
  path.join(fixtureDir, "rds-migration.fixture.json"),
  "--image-publish",
  path.join(fixtureDir, "image-publish.fixture.json"),
]

test("Aliyun user action brief command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:user:actions"], "node ./scripts/summarize-aliyun-user-action-brief.mjs")
  assert.equal(pkg.scripts["aliyun:user:actions:backend"], "node ./scripts/summarize-aliyun-user-action-brief.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:user:actions:test"], "node --test tests/aliyun-user-action-brief.static.test.js")
  assert.match(predeploy, /aliyun:user:actions:test/)
  assert.match(predeploy, /aliyun:user:actions/)
  assert.match(predeploy, /aliyun:user:actions:backend/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:user:actions:test"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:user:actions:backend"))
  assert.match(releaseArtifacts, /summarize-aliyun-user-action-brief\.mjs/)
  assert.match(releaseArtifacts, /credentialAcquisitionSummary/)
  assert.match(releaseArtifacts, /actionTimeAuthorizationRequest/)
})

test("backend-only user action brief reflects fixture backend authorization gates", () => {
  const markdownPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "meiye-user-actions-")), "brief.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    "--backend-only",
    "--markdown",
    markdownPath,
    ...fixtureArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const actionsById = new Map(report.actions.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.backendOnly, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.total, 9)
  assert.equal(report.summary.ready, 3)
  assert.equal(report.summary.blocked, 6)
  assert.deepEqual(report.summary.blockedIds, [
    "U11_ALIYUN_RDS_DATA_MIGRATION",
    "U05_OSS_RAM_OR_STS",
    "U06_ENV_IMPORT",
    "U07_DOMAIN_DNS_HTTPS_ICP",
    "U08_SAE_RUNTIME_AND_SLS",
    "U09_DEPLOY_AUTHORIZATION",
  ])
  assert.deepEqual(report.summary.nextActionTimeConfirmations, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P07_DOMAIN_DNS_HTTPS",
  ])
  assert.deepEqual(report.actionTimeAuthorizationRequest.packetIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P07_DOMAIN_DNS_HTTPS",
  ])
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /nextActionTimeConfirmations/)
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.credentialAcquisitionSummary.blockedCredentialCount, 1)
  assert.equal(report.credentialAcquisitionSummary.credentialAcquisitionQueue.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")

  assert.equal(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").status, "blocked")
  assert.equal(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").requiresActionTimeConfirmation, true)
  assert.ok(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.ok(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").currentBlockers.includes("DATABASE_URL_CN_status:empty"))
  assert.equal(actionsById.get("U05_OSS_RAM_OR_STS").status, "blocked")
  assert.equal(actionsById.get("U06_ENV_IMPORT").status, "blocked")
  assert.ok(actionsById.get("U06_ENV_IMPORT").currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.equal(actionsById.get("U07_DOMAIN_DNS_HTTPS_ICP").status, "blocked")
  assert.ok(actionsById.get("U07_DOMAIN_DNS_HTTPS_ICP").currentBlockers.length > 0)
  assert.ok(actionsById.get("U09_DEPLOY_AUTHORIZATION").currentBlockers.includes("canDeployNow=false"))
  assert.ok(actionsById.get("U09_DEPLOY_AUTHORIZATION").currentBlockers.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!actionsById.get("U09_DEPLOY_AUTHORIZATION").currentBlockers.some((item) =>
    /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/.test(item)
  ))

  assert.match(markdown, /nextActionTimeConfirmations: P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P07_DOMAIN_DNS_HTTPS/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /DATABASE_URL_CN_status:empty/)
  assert.match(markdown, /rdsMigrationEvidenceReady=false/)
  assert.match(markdown, /DATABASE_URL_CN -> 阿里云 KMS\/Secrets Manager\/SAE secret env only/)
  assert.match(markdown, /### P07_DOMAIN_DNS_HTTPS/)
  assert.doesNotMatch(output + markdown, secretLike)
  assert.doesNotMatch(markdown, /MEIYE_RELEASE_STORE_PASSWORD|MEIYE_RELEASE_KEY_PASSWORD/)
})

test("full user action brief keeps deferred APP launch blockers separate from backend closure", () => {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-user-action-brief.mjs",
    ...fixtureArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const authorizationOutput = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-action-authorization.mjs",
    ...fixtureArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const authorization = JSON.parse(authorizationOutput)
  const actionsById = new Map(report.actions.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.backendOnly, false)
  assert.equal(report.containsValues, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.total, 12)
  assert.equal(report.summary.ready, 3)
  assert.equal(report.summary.blocked, 9)
  assert.deepEqual(report.summary.nextActionTimeConfirmations, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P07_DOMAIN_DNS_HTTPS",
  ])
  assert.deepEqual(report.nextActionTimeConfirmations.map((item) => item.packetId), [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P07_DOMAIN_DNS_HTTPS",
  ])
  assert.deepEqual(authorization.nextActionTimeConfirmations.map((item) => item.packetId), [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.equal(report.summary.blockedCredentialCount, 5)
  assert.deepEqual(report.summary.blockedCredentialNames, [
    "DATABASE_URL_CN",
    "MEIYE_RELEASE_KEY_ALIAS",
    "MEIYE_RELEASE_KEY_PASSWORD",
    "MEIYE_RELEASE_STORE_FILE",
    "MEIYE_RELEASE_STORE_PASSWORD",
  ])
  assert.equal(report.summary.readySecretEnvVariableCount, 21)
  assert.equal(report.credentialAcquisitionSummary.credentialAcquisitionQueue.queueScope, "full_app_launch")
  assert.ok(report.summary.deferredAppLaunchConfirmations.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.deferredAppLaunchConfirmations.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.deferredAppLaunchConfirmations.includes("P02_APPLE_TEAM_ID"))
  assert.equal(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").status, "blocked")
  assert.ok(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.equal(actionsById.get("U07_DOMAIN_DNS_HTTPS_ICP").status, "blocked")
  assert.equal(actionsById.get("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE").status, "blocked")
  assert.equal(actionsById.get("U10_ANDROID_RELEASE_SIGNING").status, "blocked")
  assert.equal(actionsById.get("U02_APPLE_TEAM_ID").status, "blocked")
  assert.doesNotMatch(output, secretLike)
})
