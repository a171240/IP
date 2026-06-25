const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function runCloudConfirmations(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-cloud-confirmations.mjs",
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(text, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

test("Aliyun cloud confirmations backend-only command is wired and release artifacts pass the scope flag", () => {
  const pkg = readJson("package.json")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:cloud:confirmations"], "node ./scripts/check-aliyun-cloud-confirmations.mjs --allow-incomplete")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:backend"], "node ./scripts/check-aliyun-cloud-confirmations.mjs --backend-only --allow-incomplete")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:backend:strict"], "node ./scripts/check-aliyun-cloud-confirmations.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:strict"], "node ./scripts/check-aliyun-cloud-confirmations.mjs")
  assert.equal(pkg.scripts["aliyun:cloud:confirmations:test"], "node --test tests/aliyun-cloud-confirmations.static.test.js")
  assert.match(releaseArtifacts, /const backendOnlyArg = args\.backendOnly \? \["--backend-only"\] : \[\]/)
  assert.match(releaseArtifacts, /scripts\/check-aliyun-cloud-confirmations\.mjs"[\s\S]*\.\.\.backendOnlyArg[\s\S]*"--allow-incomplete"/)
})

test("Aliyun cloud confirmations full APP scope keeps WeChat mobile app blockers", () => {
  const { output, report } = runCloudConfirmations(["--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.currentScope, "full_app_launch")
  assert.equal(report.backendOnly, false)
  assert.equal(report.summary.totalBlockers, 27)
  assert.ok(report.summary.writebackBlockingGroups.includes("wechatOpenPlatform"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.local.blockers.some((item) => item.startsWith("wechatOpenPlatform:")))
  assert.equal(report.local.checkedItems, 7)
  assert.ok(Object.prototype.hasOwnProperty.call(report.local.itemStatus, "wechatOpenPlatform"))
  assertNoSecretLikeValues(output)
})

test("Aliyun cloud confirmations backend-only mode excludes deferred APP launch blockers", () => {
  const { output, report } = runCloudConfirmations(["--backend-only", "--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.backendOnly, true)
  assert.deepEqual(report.deferredAppLaunchConfirmationKeys, ["wechatOpenPlatform"])
  assert.deepEqual(report.deferredAppLaunchAuthorizationPackets, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P10_ANDROID_RELEASE_SIGNING",
    "P02_APPLE_TEAM_ID",
  ])
  assert.equal(report.summary.totalBlockers, 18)
  assert.deepEqual(report.summary.writebackBlockingGroups, [
    "runtime",
    "apiDomainHttps",
    "assetDomainHttps",
    "oss",
    "envImport",
    "slsAlerts",
  ])
  assert.ok(!report.summary.writebackBlockingGroups.includes("wechatOpenPlatform"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P10_ANDROID_RELEASE_SIGNING"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P02_APPLE_TEAM_ID"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P07_DOMAIN_DNS_HTTPS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P06_ENV_IMPORT"))
  assert.ok(!report.local.blockers.some((item) => item.startsWith("wechatOpenPlatform:")))
  assert.equal(report.local.checkedItems, 6)
  assert.ok(!Object.prototype.hasOwnProperty.call(report.local.itemStatus, "wechatOpenPlatform"))
  assert.equal(report.writebackPlan.totalBlockers, 18)
  assert.ok(!report.writebackPlan.blockingGroups.includes("wechatOpenPlatform"))
  assert.ok(report.writebackPlan.groups.every((group) => group.id !== "wechatOpenPlatform"))
  assert.ok(report.writebackPlan.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:confirmations:backend:strict"))
  assert.ok(report.writebackPlan.groups.every((group) =>
    group.verifyCommands.includes("corepack pnpm aliyun:cloud:confirmations:backend")))
  assert.ok(report.nextActions.some((item) => item.includes("backend-only 口径下微信开放平台移动应用")))
  assertNoSecretLikeValues(output)
})
