const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
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
  assert.deepEqual(report.readyAuthorizationPackets.map((item) => item.packetId), [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
  ])
  assert.ok(report.readyAuthorizationPackets.some((item) =>
    item.packetId === "P01_WECHAT_OPEN_MOBILE_APP" &&
    item.minimumUserPhrase.includes("不读取或输出 AppSecret")
  ))
  assert.ok(report.readyAuthorizationPackets.some((item) =>
    item.packetId === "P03_ACR_PURCHASE" &&
    item.nonSecretEvidenceOnly === true &&
    item.completionEvidence.includes("acr.registryHost actual aliyuncs.com host")
  ))
  assert.deepEqual(report.readyActionPackets.map((item) => item.taskId), [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])

  const identifiers = byId.get("PH01_EXTERNAL_APP_IDENTIFIERS")
  assert.equal(identifiers.canStartNow, true)
  assert.deepEqual(identifiers.authorizationPackets.map((item) => item.packetId), [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.ok(identifiers.explicitlyExcluded.some((item) => item.includes("不使用小程序 AppID")))
  assert.ok(identifiers.explicitlyExcluded.some((item) => item.includes("debug.keystore")))

  const baseCloud = byId.get("PH02_BASE_CLOUD_RESOURCES")
  const baseAcr = baseCloud.consoleTasks.find((item) => item.id === "C02_ACR_IMAGE_AND_PULL")
  assert.equal(baseCloud.canStartNow, true)
  assert.deepEqual(baseCloud.consoleTasks.map((item) => item.id), [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.equal(baseAcr.currentActionScope, "purchase_and_repository_only")
  assert.ok(baseCloud.currentActionScopes.some((item) => (
    item.taskId === "C02_ACR_IMAGE_AND_PULL" && item.scope === "purchase_and_repository_only"
  )))
  assert.ok(baseAcr.acceptanceEvidence.includes("acr.purchaseCandidate.confirmed=true"))
  assert.ok(baseAcr.acceptanceEvidence.includes("acr.registryHost actual aliyuncs.com host"))
  assert.ok(!baseAcr.acceptanceEvidence.includes("digestVerified=true"))
  assert.ok(baseAcr.deferredActions.some((item) => item.includes("P04_ACR_IMAGE_AND_PULL")))
  assert.ok(baseAcr.deferredActions.some((item) => item.includes("不执行 docker login/push")))
  assert.ok(baseAcr.deferredActions.some((item) => item.includes("imagePushed=true")))
  assert.ok(baseCloud.currentActionAcceptanceEvidence.includes("acr.registryHost actual aliyuncs.com host"))
  assert.ok(baseCloud.deferredActions.some((item) => item.includes("runtime.imagePullConfigured=true")))
  assert.ok(baseCloud.completionEvidence.some((item) => item.includes("ACR")))
  assert.ok(baseCloud.completionEvidence.some((item) => item.includes("OSS")))

  const image = byId.get("PH03_IMAGE_PUSH_AND_PULL")
  const imagePacket = image.authorizationPackets.find((item) => item.packetId === "P04_ACR_IMAGE_AND_PULL")
  assert.equal(image.canStartNow, false)
  assert.ok(image.blockingDependencies.includes("P03_ACR_PURCHASE"))
  assert.ok(imagePacket.completionEvidence.includes("acr.imagePushed=true"))
  assert.ok(imagePacket.completionEvidence.includes("runtime.imagePullConfigured=true"))
  assert.ok(imagePacket.verifyCommands.includes("corepack pnpm aliyun:image:plan:strict"))
  assert.ok(image.deferredActions.some((item) => item.includes("P04_ACR_IMAGE_AND_PULL")))
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

test("Aliyun provisioning plan markdown preserves ACR current scope and deferred image actions", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-provisioning-plan-"))
  const markdownPath = path.join(tmpdir, "provisioning-plan.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-provisioning-plan.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /Ready authorization packets: P01_WECHAT_OPEN_MOBILE_APP, P10_ANDROID_RELEASE_SIGNING, P02_APPLE_TEAM_ID, P03_ACR_PURCHASE, P05_OSS_RAM_STS/)
  assert.match(markdown, /Ready console action packets: C02_ACR_IMAGE_AND_PULL, C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /## Ready Authorization Packets/)
  assert.match(markdown, /### P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /### P03_ACR_PURCHASE/)
  assert.match(markdown, /Current action scopes: C02_ACR_IMAGE_AND_PULL=purchase_and_repository_only/)
  assert.match(markdown, /Current action acceptance evidence:/)
  assert.match(markdown, /acr\.registryHost actual aliyuncs\.com host/)
  assert.match(markdown, /Deferred actions:/)
  assert.match(markdown, /P04_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /不执行 docker login\/push/)
  assert.match(markdown, /imagePushed=true/)
  const baseCloudSection = markdown
    .split("### PH02_BASE_CLOUD_RESOURCES")[1]
    .split("### PH03_IMAGE_PUSH_AND_PULL")[0]
  const acceptanceBlock = baseCloudSection
    .split("- Current action acceptance evidence:")[1]
    .split("- Deferred actions:")[0]
  assert.doesNotMatch(acceptanceBlock, /digestVerified=true/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
