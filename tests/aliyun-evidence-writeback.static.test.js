const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(text, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

function findGap(group, jsonPath) {
  return group.gaps.find((item) => item.jsonPath === jsonPath)
}

test("Aliyun evidence writeback command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:evidence:writeback"], "node ./scripts/generate-aliyun-evidence-writeback-checklist.mjs")
  assert.equal(pkg.scripts["aliyun:evidence:writeback:test"], "node --test tests/aliyun-evidence-writeback.static.test.js")
  assert.match(predeploy, /aliyun:evidence:writeback:test/)
  assert.match(predeploy, /aliyun:evidence:writeback", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:evidence:writeback:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:evidence:writeback -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:evidence:writeback"))
  assert.match(releaseArtifacts, /evidence-writeback\.json/)
  assert.match(releaseArtifacts, /evidence-writeback\.md/)
  assert.match(releaseArtifacts, /evidenceWriteback/)
})

test("Aliyun evidence writeback checklist exposes local JSON write targets without secret values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--skip-vercel-env-coverage",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const cloudConfirmationPaths = report.writebackGroups.cloudConfirmations.gaps.map((item) => item.jsonPath)
  const imagePublishPaths = report.writebackGroups.imagePublish.gaps.map((item) => item.jsonPath)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.executionMode, "writeback_checklist_only")
  assert.equal(report.summary.files, 3)
  assert.ok(report.summary.totalGaps >= 1)
  assert.equal(report.summary.cloudConfirmationGaps, report.writebackGroups.cloudConfirmations.gaps.length)
  assert.equal(report.summary.imagePublishGaps, report.writebackGroups.imagePublish.gaps.length)
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS_ICP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.match(report.writebackGroups.cloudInventoryResults.file, /cloud-inventory-results\.local\.json/)
  assert.match(report.writebackGroups.cloudConfirmations.file, /cloud-confirmations\.local\.json/)
  assert.match(report.writebackGroups.imagePublish.file, /image-publish\.local\.json/)
  assert.equal(report.writebackGroups.cloudConfirmations.exists, true)
  assert.equal(report.writebackGroups.imagePublish.exists, true)
  assert.ok(cloudConfirmationPaths.includes("items.wechatOpenPlatform.mobileAppCreated"))
  assert.ok(cloudConfirmationPaths.includes("items.wechatOpenPlatform.mobileAppSecretReady"))
  assert.ok(imagePublishPaths.includes("acr.registryHost"))
  assert.ok(imagePublishPaths.includes("runtime.confirmed"))
  assert.ok(report.writebackGroups.cloudInventoryResults.requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.mobileAppSecretReady").requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.androidSignature").requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.wechatOpenPlatform.iosConfigured").requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.apiDomainHttps.httpsEnabled").requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS_ICP"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.oss.ramLeastPrivilege").requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(findGap(report.writebackGroups.cloudConfirmations, "items.envImport.secretNotInImage").requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "acr.registryHost").requiredAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "acr.remoteDigest").requiredAuthorizationPackets.includes("P04_ACR_IMAGE_AND_PULL"))
  assert.ok(findGap(report.writebackGroups.imagePublish, "runtime.confirmed").requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:confirmations:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:image:plan:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不会调用阿里云 API")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("禁止写入 AppSecret")))
  assertNoSecretLikeValues(output)
})

test("Aliyun evidence writeback markdown renders the same writeback boundaries", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-evidence-writeback-"))
  const markdown = path.join(tmpdir, "evidence-writeback.md")
  const json = path.join(tmpdir, "evidence-writeback.json")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--skip-vercel-env-coverage",
    "--out",
    json,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const markdownOutput = fs.readFileSync(markdown, "utf8")
  const report = JSON.parse(fs.readFileSync(json, "utf8"))

  assert.equal(report.ok, true)
  assert.match(markdownOutput, /阿里云证据回填清单/)
  assert.match(markdownOutput, /cloudInventoryResults/)
  assert.match(markdownOutput, /cloudConfirmations/)
  assert.match(markdownOutput, /imagePublish/)
  assert.match(markdownOutput, /cloud-confirmations\.local\.json/)
  assert.match(markdownOutput, /image-publish\.local\.json/)
  assert.match(markdownOutput, /requiredAuthorizationPackets/)
  assert.match(markdownOutput, /P11_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(markdownOutput, /P10_ANDROID_RELEASE_SIGNING/)
  assert.match(markdownOutput, /P07_DOMAIN_DNS_HTTPS_ICP/)
  assert.match(markdownOutput, /Strict 验证顺序/)
  assert.match(markdownOutput, /corepack pnpm aliyun:predeploy/)
  assertNoSecretLikeValues(output + markdownOutput)
})
