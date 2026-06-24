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
  assert.match(releaseArtifacts, /provisioningClosureBrief/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /partiallyObservedResourceEvidenceIds/)
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
  assert.equal(report.summary.blockedCredentialCount, 8)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.equal(report.provisioningClosureBrief.canDeployNow, false)
  assert.equal(report.provisioningClosureBrief.canCodexExecuteNow, false)
  assert.equal(report.provisioningClosureBrief.blockedCredentialCount, 8)
  assert.ok(report.provisioningClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.provisioningClosureBrief.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.provisioningClosureBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.provisioningClosureBrief.resourceEvidenceReady, "0/7")
  assert.ok(report.provisioningClosureBrief.blockedResourceEvidenceIds.includes("R02_ACR_IMAGE_REGISTRY"))
  assert.ok(report.provisioningClosureBrief.blockedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.provisioningClosureBrief.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.provisioningClosureBrief.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.provisioningClosureBrief.blockedResourceEvidence.some((item) =>
    item.id === "R05_OSS_AUDIO_STORAGE" &&
    item.observedReadiness === "partial" &&
    item.currentEvidence.some((evidence) => /bucket_exists/.test(evidence))
  ))
  assert.deepEqual(report.provisioningClosureBrief.readyToStartPhases, [
    "PH01_EXTERNAL_APP_IDENTIFIERS",
    "PH02_BASE_CLOUD_RESOURCES",
  ])
  assert.ok(report.provisioningClosureBrief.blockedPhases.includes("PH07_PRODUCTION_DEPLOY"))
  assert.ok(report.provisioningClosureBrief.canStartNowAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.deepEqual(report.provisioningClosureBrief.canStartNowConsoleTasks, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(report.provisioningClosureBrief.nextActionTimeConfirmations.includes("P03_ACR_PURCHASE"))
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

  assert.match(markdown, /## 目标闭环证据简表/)
  assert.match(markdown, /Blocked credential count: 8/)
  assert.match(markdown, /Ready secret env variable count: 17/)
  assert.match(markdown, /Resource evidence ready: 0\/7/)
  assert.match(markdown, /Blocked resource evidence ids: .*R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /Partially observed resource evidence ids: R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdown, /Can Codex execute now: false/)
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

test("APP production-cn provisioning sequence handoff matches the current plan", () => {
  const handoff = read("docs", "app-production-cn-provisioning-sequence.md")
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-provisioning-plan.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)

  assert.match(handoff, /Production-cn cannot be deployed now\./)
  assert.match(handoff, /executionMode=plan_only/)
  assert.match(handoff, /canCodexExecuteNow=false/)
  assert.match(handoff, /canDeployNow=false/)
  assert.match(handoff, /provider=Aliyun SAE/)
  assert.match(handoff, /region=cn-hangzhou/)
  assert.match(handoff, /appName=meiye-huajing-app-api-production-cn/)
  assert.match(handoff, /containerPort=3000/)
  assert.match(handoff, /healthPath=\/api\/healthz/)
  assert.match(handoff, /strictHealthPath=\/api\/app\/health\?strict=1/)
  assert.match(handoff, /apiHost=api-cn\.ipgongchang\.xin/)
  assert.match(handoff, /assetHost=assets-cn\.ipgongchang\.xin/)
  assert.match(handoff, /ECS is a fallback only/)
  assert.match(handoff, /Supabase as the data layer/)

  for (const phase of report.phases) {
    assert.match(handoff, new RegExp(phase.id))
    assert.match(handoff, new RegExp(phase.status))
    for (const dependency of phase.blockingDependencies || []) {
      assert.match(handoff, new RegExp(dependency))
    }
  }
  for (const phaseId of report.summary.readyToStartPhases) {
    assert.match(handoff, new RegExp(phaseId))
  }
  for (const phaseId of report.summary.blockedPhases) {
    assert.match(handoff, new RegExp(phaseId))
  }
  for (const packetId of report.summary.canStartNowPackets) {
    assert.match(handoff, new RegExp(packetId))
  }
  for (const taskId of report.summary.canStartNowConsoleTasks) {
    assert.match(handoff, new RegExp(taskId))
  }
  for (const id of report.summary.blockedResourceEvidenceIds) {
    assert.match(handoff, new RegExp(id))
  }

  assert.match(handoff, /currentActionScope=purchase_and_repository_only/)
  assert.match(handoff, /acr\.registryHost actual aliyuncs\.com host/)
  assert.match(handoff, /P04_ACR_IMAGE_AND_PULL/)
  assert.match(handoff, /imagePushed=true/)
  assert.match(handoff, /runtime\.imagePullConfigured=true/)
  assert.doesNotMatch(handoff, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(handoff, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(handoff, /:\/\/[^\s:@]+:[^\s@]+@/)
})
