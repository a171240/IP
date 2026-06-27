const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun console runbook command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:console:runbook"], "node ./scripts/generate-aliyun-console-runbook.mjs")
  assert.equal(pkg.scripts["aliyun:console:runbook:test"], "node --test tests/aliyun-console-runbook.static.test.js")
  assert.match(predeploy, /aliyun:console:runbook:test/)
  assert.match(predeploy, /aliyun:console:runbook/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:console:runbook:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:console:runbook"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:console:runbook"))
  assert.match(releaseArtifacts, /canStartNowConsoleTasks/)
  assert.match(releaseArtifacts, /readyActionPackets/)
  assert.match(releaseArtifacts, /blockedByTaskDependencies/)
  assert.match(releaseArtifacts, /consoleClosureBrief/)
  assert.match(releaseArtifacts, /blockedCredentialCount/)
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /partiallyObservedResourceEvidenceIds/)
})

test("Aliyun console runbook renders current console fields without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-console-runbook.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const ids = report.consoleTasks.map((item) => item.id)
  const sae = report.consoleTasks.find((item) => item.id === "C01_SAE_RUNTIME")
  const acr = report.consoleTasks.find((item) => item.id === "C02_ACR_IMAGE_AND_PULL")
  const apiDomain = report.consoleTasks.find((item) => item.id === "C03_API_DOMAIN_HTTPS_ICP")
  const assetDomain = report.consoleTasks.find((item) => item.id === "C04_ASSET_DOMAIN_HTTPS_ICP")
  const oss = report.consoleTasks.find((item) => item.id === "C05_OSS_AUDIO_RAM_STS")
  const env = report.consoleTasks.find((item) => item.id === "C06_ENV_IMPORT")
  const readyPacketIds = report.readyActionPackets.map((item) => item.taskId)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.deepEqual(ids, [
    "C01_SAE_RUNTIME",
    "C02_ACR_IMAGE_AND_PULL",
    "C03_API_DOMAIN_HTTPS_ICP",
    "C04_ASSET_DOMAIN_HTTPS_ICP",
    "C05_OSS_AUDIO_RAM_STS",
    "C06_ENV_IMPORT",
    "C07_SLS_ALERTS",
  ])
  assert.equal(report.target.region, "cn-hangzhou")
  assert.equal(report.target.appName, "meiye-huajing-app-api-production-cn")
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("APPLE_TEAM_ID"))
  assert.equal(report.summary.currentScope, "backend_aliyun_only")
  assert.equal(report.summary.canProceedWithoutWechat, true)
  assert.deepEqual(report.summary.canStartNowConsoleTasks, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.equal(report.summary.readyActionPackets, 2)
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.equal(report.summary.readySecretEnvVariableCount, 17)
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.summary.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.equal(report.consoleClosureBrief.currentScope, "backend_aliyun_only")
  assert.equal(report.consoleClosureBrief.canProceedWithoutWechat, true)
  assert.equal(report.consoleClosureBrief.blockedCredentialCount, 1)
  assert.deepEqual(report.consoleClosureBrief.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.ok(report.consoleClosureBrief.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.consoleClosureBrief.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.equal(report.consoleClosureBrief.readySecretEnvVariableCount, 17)
  assert.equal(report.consoleClosureBrief.resourceEvidenceReady, "0/7")
  assert.ok(report.consoleClosureBrief.blockedResourceEvidenceIds.includes("R02_ACR_IMAGE_REGISTRY"))
  assert.ok(report.consoleClosureBrief.blockedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.ok(report.consoleClosureBrief.partiallyObservedResourceEvidenceIds.includes("R05_OSS_AUDIO_STORAGE"))
  assert.ok(report.consoleClosureBrief.partiallyObservedResourceEvidenceIds.includes("R07_SLS_ALERTS"))
  assert.deepEqual(report.consoleClosureBrief.canStartNowConsoleTasks, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.deepEqual(report.consoleClosureBrief.readyActionPacketIds, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(report.consoleClosureBrief.nextActionTimeConfirmations.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.consoleClosureBrief.blockedResourceEvidence.some((item) => item.id === "R02_ACR_IMAGE_REGISTRY"))
  const ossEvidence = report.consoleClosureBrief.blockedResourceEvidence.find((item) => item.id === "R05_OSS_AUDIO_STORAGE")
  const slsEvidence = report.consoleClosureBrief.blockedResourceEvidence.find((item) => item.id === "R07_SLS_ALERTS")
  assert.equal(ossEvidence.observedReadiness, "partial")
  assert.ok(ossEvidence.currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.equal(slsEvidence.observedReadiness, "partial")
  assert.ok(slsEvidence.currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.deepEqual(readyPacketIds, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(report.summary.blockedByTaskDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedByTaskDependencies.includes("C06_ENV_IMPORT"))
  assert.equal(sae.sequencePhase, "runtime")
  assert.deepEqual(sae.dependsOn, ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS", "C06_ENV_IMPORT"])
  assert.deepEqual(sae.blockingDependencies, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
    "C06_ENV_IMPORT",
  ])
  assert.equal(sae.canStartNow, false)
  assert.ok(sae.targetFields.some((item) => item.name === "containerPort" && item.value === 3000))
  assert.ok(sae.currentBlockers.includes("runtime:confirmed"))
  assert.equal(acr.requiresActionTimeConfirmation, true)
  assert.equal(acr.sequencePhase, "image_runtime")
  assert.deepEqual(acr.dependsOn, [])
  assert.deepEqual(acr.blockingDependencies, [])
  assert.equal(acr.canStartNow, true)
  assert.equal(acr.currentActionScope, "image_push_or_import_and_digest_verification")
  assert.ok(acr.deferredActions.some((item) => item.includes("不购买 ACR")))
  assert.ok(acr.deferredActions.some((item) => item.includes("不部署 production-cn")))
  assert.ok(acr.targetFields.some((item) => item.name === "remoteDigest" && item.value === "sha256:<64 hex>"))
  assert.ok(acr.targetFields.some((item) => item.name === "localDigest" && String(item.value).length > 0))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=false"))
  assert.ok(acr.completionEvidence.includes("corepack pnpm aliyun:image:plan:strict pass"))
  assert.match(report.readyActionPackets[0].minimumAuthorizationPhrase, /后端镜像推送或导入已创建的 ACR/)
  assert.match(report.readyActionPackets[0].minimumAuthorizationPhrase, /不输出 registry 密码/)
  assert.equal(report.readyActionPackets[0].currentActionScope, "image_push_or_import_and_digest_verification")
  assert.ok(report.readyActionPackets[0].acceptanceEvidence.includes("acr.imagePushed=true"))
  assert.ok(report.readyActionPackets[0].acceptanceEvidence.includes("runtime.imagePullConfigured=true"))
  assert.ok(!report.readyActionPackets[0].acceptanceEvidence.includes("acr.purchaseCandidate.confirmed=true"))
  assert.ok(report.readyActionPackets[0].deferredActions.some((item) => item.includes("不购买 ACR")))
  assert.equal(oss.canStartNow, true)
  assert.ok(report.readyActionPackets[1].minimumAuthorizationPhrase.includes("最小权限 RAM/STS"))
  assert.ok(report.readyActionPackets[1].acceptanceEvidence.includes("ramLeastPrivilege=true"))
  assert.deepEqual(apiDomain.dependsOn, ["C01_SAE_RUNTIME"])
  assert.deepEqual(apiDomain.blockingDependencies, ["C01_SAE_RUNTIME"])
  assert.equal(apiDomain.canStartNow, false)
  assert.ok(apiDomain.targetFields.some((item) => item.name === "notAccepted" && /106\.14\.241\.129/.test(String(item.value))))
  assert.deepEqual(assetDomain.dependsOn, ["C05_OSS_AUDIO_RAM_STS"])
  assert.deepEqual(assetDomain.blockingDependencies, ["C05_OSS_AUDIO_RAM_STS"])
  assert.equal(assetDomain.canStartNow, false)
  assert.ok(assetDomain.targetFields.some((item) => item.name === "notAccepted" && /106\.14\.241\.129/.test(String(item.value))))
  assert.deepEqual(env.dependsOn, ["C05_OSS_AUDIO_RAM_STS"])
  assert.deepEqual(env.blockingDependencies, ["C05_OSS_AUDIO_RAM_STS"])
  assert.equal(env.canStartNow, false)
  assert.ok(env.targetFields.some((item) => item.name === "secretNotInImage" && item.value === true))
  assert.ok(env.currentBlockers.includes("envImport:secretNotInImage"))
  assert.doesNotMatch(report.currentAnswer, /必须先补齐微信开放平台移动 App 凭证/)
  assert.doesNotMatch(JSON.stringify(report.summary.requiredBlocking), /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET|APPLE_TEAM_ID/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun console runbook markdown includes action packets and completion evidence", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-console-runbook-"))
  const markdownPath = path.join(tmpdir, "console-runbook.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-console-runbook.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /## 当前可进入动作确认的包/)
  assert.match(markdown, /## 目标闭环证据简表/)
  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /blockedCredentialCount: 1/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /readySecretEnvVariableCount: 17/)
  assert.match(markdown, /resourceEvidenceReady: 0\/7/)
  assert.match(markdown, /blockedResourceEvidenceIds: .*R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /partiallyObservedResourceEvidenceIds: R02_ACR_IMAGE_REGISTRY, R05_OSS_AUDIO_STORAGE, R07_SLS_ALERTS/)
  assert.match(markdown, /minimumAuthorizationPhrase: 授权把后端镜像推送或导入已创建的 ACR/)
  assert.match(markdown, /currentActionScope: image_push_or_import_and_digest_verification/)
  assert.match(markdown, /不购买 ACR/)
  assert.match(markdown, /- acceptanceEvidence:/)
  assert.match(markdown, /acr\.imagePushed=true/)
  assert.match(markdown, /- deferredActions:/)
  assert.match(markdown, /不部署 production-cn/)
  assert.match(markdown, /ramLeastPrivilege=true/)
  assert.match(markdown, /- completionEvidence:/)
  assert.doesNotMatch(markdown, /必须先补齐微信开放平台移动 App 凭证/)
  assert.doesNotMatch(markdown, /requiredBlocking: .*WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
