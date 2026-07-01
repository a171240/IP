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

test("Aliyun action authorization command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:action:authorization"], "node ./scripts/summarize-aliyun-action-authorization.mjs")
  assert.equal(pkg.scripts["aliyun:action:authorization:backend"], "node ./scripts/summarize-aliyun-action-authorization.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:action:authorization:test"], "node --test tests/aliyun-action-authorization.static.test.js")
  assert.match(predeploy, /aliyun:action:authorization:test/)
  assert.match(predeploy, /aliyun:action:authorization/)
  assert.match(predeploy, /aliyun:action:authorization:backend/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:action:authorization:backend"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:action:authorization"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:action:authorization:backend"))
  assert.match(releaseArtifacts, /scripts\/summarize-aliyun-action-authorization\.mjs"[\s\S]*\.\.\.backendOnlyArg/)
  assert.match(releaseArtifacts, /authorizationClosureBrief/)
})

test("backend-only action authorization reflects fixture P11 and P05 gates", () => {
  const markdownPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "meiye-action-auth-")), "authorization.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--backend-only",
    "--markdown",
    markdownPath,
    ...fixtureArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const report = JSON.parse(output)
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const actionsById = new Map(report.actions.map((item) => [item.id, item]))
  const packetsById = new Map(report.authorizationPackets.map((item) => [item.packetId, item]))

  assert.equal(report.ok, true)
  assert.equal(report.backendOnly, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.actions, 9)
  assert.equal(report.summary.authorizationPackets, 9)
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.fullAppRequiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.deferredAppLaunchBlocking, [])
  assert.deepEqual(report.summary.currentExternalBlockers, [
    "U11_ALIYUN_RDS_DATA_MIGRATION",
    "U05_OSS_RAM_OR_STS",
    "U04_ACR_RUNTIME_AUTH",
    "U06_ENV_IMPORT",
    "U07_DOMAIN_DNS_HTTPS_ICP",
    "U08_SAE_RUNTIME_AND_SLS",
    "U09_DEPLOY_AUTHORIZATION",
  ])
  assert.deepEqual(report.summary.actionTimeConfirmationRequired, [
    "U11_ALIYUN_RDS_DATA_MIGRATION",
    "U05_OSS_RAM_OR_STS",
    "U04_ACR_RUNTIME_AUTH",
    "U06_ENV_IMPORT",
    "U07_DOMAIN_DNS_HTTPS_ICP",
    "U08_SAE_RUNTIME_AND_SLS",
    "U09_DEPLOY_AUTHORIZATION",
  ])
  assert.deepEqual(report.summary.deferredExternalBlockers, [])
  assert.deepEqual(report.summary.nextActionTimeConfirmations, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.deepEqual(report.summary.canStartNowPackets, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.deepEqual(report.authorizationClosureBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.authorizationClosureBrief.actionTimeConfirmationRequired, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P04_ACR_IMAGE_AND_PULL",
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
    "P09_PRODUCTION_DEPLOY",
  ])
  assert.match(report.currentAnswer, /后端仍有必填阻塞：DATABASE_URL_CN/)
  assert.match(report.authorizationClosureBrief.conclusion, /动作时确认入口/)

  assert.equal(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").status, "blocked")
  assert.ok(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.ok(actionsById.get("U11_ALIYUN_RDS_DATA_MIGRATION").currentBlockers.includes("DATABASE_URL_CN_status:empty"))
  assert.equal(actionsById.get("U05_OSS_RAM_OR_STS").status, "blocked")
  assert.equal(actionsById.get("U04_ACR_RUNTIME_AUTH").status, "blocked")
  assert.ok(actionsById.get("U04_ACR_RUNTIME_AUTH").currentBlockers.includes("S04_ACR_REGISTRY_AUTH:blocked"))
  assert.ok(actionsById.get("U04_ACR_RUNTIME_AUTH").currentBlockers.includes("R02_ACR_IMAGE_REGISTRY:imagePublishLocal:image.sourceCommitMatchesHead"))
  assert.equal(actionsById.get("U06_ENV_IMPORT").status, "blocked")
  assert.ok(actionsById.get("U06_ENV_IMPORT").currentBlockers.includes("requiredEnv:DATABASE_URL_CN"))
  assert.equal(actionsById.get("U07_DOMAIN_DNS_HTTPS_ICP").status, "blocked")
  assert.equal(actionsById.get("U09_DEPLOY_AUTHORIZATION").status, "blocked")
  assert.ok(actionsById.get("U09_DEPLOY_AUTHORIZATION").currentBlockers.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!actionsById.has("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(!packetsById.has("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.equal(packetsById.get("P07_DOMAIN_DNS_HTTPS").canStartNow, false)
  assert.deepEqual(packetsById.get("P07_DOMAIN_DNS_HTTPS").blockingDependencies, ["P08_SAE_RUNTIME_SLS"])
  assert.equal(packetsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").canStartNow, true)
  assert.deepEqual(packetsById.get("P11_ALIYUN_RDS_DATA_MIGRATION").blockingDependencies, [])
  assert.equal(packetsById.get("P05_OSS_RAM_STS").canStartNow, true)
  assert.equal(packetsById.get("P04_ACR_IMAGE_AND_PULL").canStartNow, true)
  assert.deepEqual(packetsById.get("P04_ACR_IMAGE_AND_PULL").blockingDependencies, [])
  assert.equal(packetsById.get("P09_PRODUCTION_DEPLOY").canStartNow, false)
  assert.deepEqual(packetsById.get("P09_PRODUCTION_DEPLOY").blockingDependencies, [
    "P04_ACR_IMAGE_AND_PULL",
    "P05_OSS_RAM_STS",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
  ])

  assert.match(markdown, /后端仍有必填阻塞：DATABASE_URL_CN/)
  assert.match(markdown, /nextActionTimeConfirmations: P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P04_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.doesNotMatch(output + markdown, /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(output + markdown, /MEIYE_RELEASE_STORE_PASSWORD|MEIYE_RELEASE_KEY_PASSWORD/)
  assert.doesNotMatch(output + markdown, secretLike)
})

test("full action authorization keeps deferred APP launch blockers separate from backend closure", () => {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-action-authorization.mjs",
    ...fixtureArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.backendOnly, false)
  assert.equal(report.summary.actions, 12)
  assert.equal(report.summary.authorizationPackets, 12)
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.fullAppRequiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.deferredAppLaunchBlocking, [])
  assert.deepEqual(report.summary.currentExternalBlockers, [
    "U11_ALIYUN_RDS_DATA_MIGRATION",
    "U05_OSS_RAM_OR_STS",
    "U04_ACR_RUNTIME_AUTH",
    "U06_ENV_IMPORT",
    "U07_DOMAIN_DNS_HTTPS_ICP",
    "U08_SAE_RUNTIME_AND_SLS",
    "U09_DEPLOY_AUTHORIZATION",
  ])
  assert.deepEqual(report.summary.deferredExternalBlockers, [
    "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
    "U10_ANDROID_RELEASE_SIGNING",
    "U02_APPLE_TEAM_ID",
  ])
  assert.deepEqual(report.summary.nextActionTimeConfirmations, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.deepEqual(report.summary.canStartNowPackets, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P04_ACR_IMAGE_AND_PULL",
  ])
  assert.deepEqual(report.authorizationClosureBrief.blockedCredentialNames, [
    "DATABASE_URL_CN",
    "MEIYE_RELEASE_KEY_ALIAS",
    "MEIYE_RELEASE_KEY_PASSWORD",
    "MEIYE_RELEASE_STORE_FILE",
    "MEIYE_RELEASE_STORE_PASSWORD",
  ])
  assert.match(report.currentAnswer, /后端仍有必填阻塞：DATABASE_URL_CN/)
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun action authorization packet handoff documents the current backend packet gate", () => {
  const handoff = read("docs", "app-production-cn-action-authorization-packets.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-action-authorization.mjs",
    "--backend-only",
    ...fixtureArgs,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const report = JSON.parse(output)

  assert.match(handoff, /现在不能部署；后端仍有必填阻塞：DATABASE_URL_CN/)
  assert.match(handoff, /currentScope: backend_aliyun_only/)
  assert.match(handoff, /fullAppLaunchScope: deferred_after_backend_online/)
  assert.match(handoff, /canDeployNow: false/)
  assert.match(handoff, /secretLeakCheck: true/)
  assert.match(handoff, /blockedCredentialCount: 0/)
  assert.match(handoff, /blockedCredentialNames: none/)
  assert.match(handoff, /nextActionTimeConfirmations: P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(handoff, /canStartNowPackets: P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(handoff, /blockedByPacketDependencies: P06_ENV_IMPORT, P09_PRODUCTION_DEPLOY/)
  assert.doesNotMatch(handoff, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.doesNotMatch(handoff, /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/)

  for (const packet of report.authorizationPackets) {
    assert.match(handoff, new RegExp(packet.packetId))
    assert.match(handoff, new RegExp(packet.actionId))
  }

  assert.doesNotMatch(handoff, secretLike)
})
