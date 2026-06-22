const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

const EXPECTED_APP_NAME = "美业话镜"
const EXPECTED_ANDROID_PACKAGE_NAME = "com.ipgongchang.meiyehuajing"
const EXPECTED_IOS_BUNDLE_ID = "com.ipgongchang.meiyehuajing"
const EXPECTED_ASSOCIATED_DOMAIN = "applinks:api-cn.ipgongchang.xin"
const EXPECTED_IOS_UNIVERSAL_LINK = "https://api-cn.ipgongchang.xin/app/wechat/"

test("Aliyun app native release command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:app-native:test"], "node --test tests/aliyun-app-native-release.static.test.js")
  assert.equal(pkg.scripts["aliyun:app-native:check"], "node ./scripts/check-app-native-release-config.mjs --allow-blocking")
  assert.match(predeploy, /aliyun:app-native:test/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:app-native:test"))
})

test("Aliyun app native release report matches WeChat Open Platform mobile app identifiers", () => {
  const output = execFileSync(process.execPath, ["scripts/check-app-native-release-config.mjs", "--allow-blocking"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.expected.appName, EXPECTED_APP_NAME)
  assert.equal(report.expected.androidPackageName, EXPECTED_ANDROID_PACKAGE_NAME)
  assert.equal(report.expected.iosBundleId, EXPECTED_IOS_BUNDLE_ID)
  assert.equal(report.android.ready, true)
  assert.equal(report.android.namespace, EXPECTED_ANDROID_PACKAGE_NAME)
  assert.equal(report.android.applicationId, EXPECTED_ANDROID_PACKAGE_NAME)
  assert.equal(report.android.releaseSigningConfig, "release")
  assert.equal(report.android.releaseUsesDebugSigning, false)
  assert.equal(report.android.releaseSigningConfigReady, true)
  assert.equal(report.ios.ready, true)
  assert.equal(report.ios.displayName, EXPECTED_APP_NAME)
  assert.ok(report.ios.bundleIds.every((item) => item === EXPECTED_IOS_BUNDLE_ID))
  assert.ok(report.ios.associatedDomains.includes(EXPECTED_ASSOCIATED_DOMAIN))
  assert.equal(report.ios.expectedAssociatedDomainPresent, true)
  assert.equal(report.ios.associatedDomainsConfigured, true)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun WeChat Open Platform local evidence keeps app creation blocked but records non-secret native fields", () => {
  const localConfirmations = readJson("deploy", "aliyun-production-cn.cloud-confirmations.local.json")
  const wechat = localConfirmations.items.wechatOpenPlatform

  assert.equal(wechat.accountVerified, true)
  assert.equal(wechat.mobileAppCreated, false)
  assert.equal(wechat.mobileAppSubmitted, false)
  assert.equal(wechat.reviewStatus, "not_started")
  assert.equal(wechat.mobileAppName, EXPECTED_APP_NAME)
  assert.equal(wechat.androidPackageName, EXPECTED_ANDROID_PACKAGE_NAME)
  assert.equal(wechat.androidConfigured, false)
  assert.equal(wechat.iosBundleId, EXPECTED_IOS_BUNDLE_ID)
  assert.equal(wechat.iosUniversalLink, EXPECTED_IOS_UNIVERSAL_LINK)
  assert.equal(wechat.iosConfigured, false)
  assert.equal(wechat.mobileAppIdReady, false)
  assert.equal(wechat.mobileAppSecretReady, false)
})
