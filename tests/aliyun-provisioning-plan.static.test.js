const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun provisioning plan command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:provisioning:plan"], "node ./scripts/generate-aliyun-provisioning-plan.mjs")
  assert.equal(pkg.scripts["aliyun:provisioning:plan:test"], "node --test tests/aliyun-provisioning-plan.static.test.js")
  assert.match(predeploy, /aliyun:provisioning:plan:test/)
  assert.match(predeploy, /aliyun:provisioning:plan/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:provisioning:plan:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:provisioning:plan"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:provisioning:plan"))
  assert.match(releaseArtifacts, /provisioning-plan\.json/)
  assert.match(releaseArtifacts, /provisioning-plan\.md/)
  assert.match(releaseArtifacts, /provisioningPlan/)
})

test("Aliyun provisioning plan renders phase order without executing cloud actions", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-provisioning-plan.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.phases.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.executionMode, "plan_only")
  assert.equal(report.canCodexExecuteNow, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.phases, 7)
  assert.deepEqual(report.summary.readyToStartPhases, [
    "PH01_EXTERNAL_APP_IDENTIFIERS",
    "PH02_BASE_CLOUD_RESOURCES",
  ])
  assert.ok(report.summary.blockedPhases.includes("PH03_IMAGE_PUSH_AND_PULL"))
  assert.ok(report.summary.blockedPhases.includes("PH07_PRODUCTION_DEPLOY"))
  assert.ok(report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))

  const identifiers = byId.get("PH01_EXTERNAL_APP_IDENTIFIERS")
  assert.equal(identifiers.canStartNow, true)
  assert.deepEqual(identifiers.authorizationPackets.map((item) => item.packetId), [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P02_APPLE_TEAM_ID",
  ])
  assert.ok(identifiers.explicitlyExcluded.some((item) => item.includes("不使用小程序 AppID")))

  const baseCloud = byId.get("PH02_BASE_CLOUD_RESOURCES")
  assert.equal(baseCloud.canStartNow, true)
  assert.deepEqual(baseCloud.consoleTasks.map((item) => item.id), [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(baseCloud.completionEvidence.some((item) => item.includes("ACR")))
  assert.ok(baseCloud.completionEvidence.some((item) => item.includes("OSS")))

  const image = byId.get("PH03_IMAGE_PUSH_AND_PULL")
  assert.equal(image.canStartNow, false)
  assert.ok(image.blockingDependencies.includes("P03_ACR_PURCHASE"))
  assert.ok(image.explicitlyExcluded.some((item) => item.includes("registry username/password")))

  const env = byId.get("PH04_ENV_IMPORT")
  assert.equal(env.canStartNow, false)
  assert.ok(env.blockingDependencies.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(env.blockingDependencies.includes("P05_OSS_RAM_STS"))

  const deploy = byId.get("PH07_PRODUCTION_DEPLOY")
  assert.equal(deploy.canStartNow, false)
  assert.ok(deploy.blockingDependencies.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(deploy.explicitlyExcluded.some((item) => item.includes("不 git push")))

  assert.ok(report.safetyBoundary.some((item) => item.includes("不执行任何阿里云")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不读取或输出")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
