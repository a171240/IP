const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun cloud actions package command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const packageScript = read("scripts", "generate-aliyun-cloud-actions-package.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:cloud-actions:package"], "node ./scripts/generate-aliyun-cloud-actions-package.mjs")
  assert.equal(pkg.scripts["aliyun:cloud-actions:package:test"], "node --test tests/aliyun-cloud-actions-package.static.test.js")
  assert.match(predeploy, /aliyun:cloud-actions:package:test/)
  assert.match(predeploy, /aliyun:cloud-actions:package/)
  assert.match(packageScript, /C00_ALIYUN_CLOUD_ACTIONS/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud-actions:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud-actions:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloud-actions:package"))
  assert.match(releaseArtifacts, /cloudActionsPackage/)
  assert.match(releaseArtifacts, /cloud-actions-package\.json/)
})

test("Aliyun cloud actions package summarizes current cloud console action order without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-cloud-actions-package.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.packageId, "C00_ALIYUN_CLOUD_ACTIONS")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.canDeployNow, false)
  assert.deepEqual(report.summary.canStartNowConsoleTasks, ["C02_ACR_IMAGE_AND_PULL", "C05_OSS_AUDIO_RAM_STS"])
  assert.ok(report.summary.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedByDependencies.includes("C06_ENV_IMPORT"))
  assert.deepEqual(report.summary.cloudConsolePackets, ["P03_ACR_PURCHASE", "P05_OSS_RAM_STS"])
  assert.ok(report.summary.externalAppPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.equal(report.cloudAccess.canReadCloudNow, false)
  assert.equal(report.cloudAccess.cliConfigProbeFailureCategory, "aliyun_cli_profile_not_configured")
  assert.ok(report.currentBlockers.includes("requiredEnv:WECHAT_OPEN_APP_ID"))
  assert.ok(report.currentBlockers.includes("requiredEnv:WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.immediateConsoleTasks.some((item) => item.id === "C02_ACR_IMAGE_AND_PULL" && item.consolePath.includes("ACR")))
  assert.ok(report.immediateConsoleTasks.some((item) => item.id === "C05_OSS_AUDIO_RAM_STS" && item.consolePath.includes("OSS")))
  assert.ok(report.blockedConsoleTasks.some((item) => item.id === "C03_API_DOMAIN_HTTPS_ICP" && item.blockingDependencies.includes("C01_SAE_RUNTIME")))
  assert.ok(report.cloudConsoleAuthorizationPackets.some((item) => item.packetId === "P03_ACR_PURCHASE" && item.minimumAuthorizationPhrase.includes("CNY 117.00")))
  assert.ok(report.cloudConsoleAuthorizationPackets.some((item) => item.packetId === "P05_OSS_RAM_STS" && item.minimumAuthorizationPhrase.includes("OSS")))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.nextSafeLocalCommands.includes("corepack pnpm aliyun:cloud-actions:package"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不购买 ACR")))
  assert.ok(report.prohibitedWithoutActionTimeConfirmation.some((item) => item.includes("部署 production-cn")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun cloud actions package markdown renders compact action order without values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloud-actions-package.mjs",
    "--markdown",
    "/tmp/meiye-aliyun-cloud-actions-package-test.md",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const markdown = fs.readFileSync("/tmp/meiye-aliyun-cloud-actions-package-test.md", "utf8")

  assert.match(markdown, /# 阿里云控制台动作包/)
  assert.match(markdown, /packageId: C00_ALIYUN_CLOUD_ACTIONS/)
  assert.match(markdown, /C02_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /P03_ACR_PURCHASE/)
  assert.match(markdown, /P05_OSS_RAM_STS/)
  assert.match(markdown, /C03_API_DOMAIN_HTTPS_ICP: dependsOn=C01_SAE_RUNTIME/)
  assert.match(markdown, /不购买 ACR/)
  assert.match(markdown, /不推送镜像/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
