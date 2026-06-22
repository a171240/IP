const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("WeChat Open mobile app package command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:wechat-open:package"], "node ./scripts/generate-wechat-open-mobile-app-package.mjs")
  assert.equal(pkg.scripts["aliyun:wechat-open:package:test"], "node --test tests/aliyun-wechat-open-mobile-app-package.static.test.js")
  assert.match(predeploy, /aliyun:wechat-open:package:test/)
  assert.match(predeploy, /aliyun:wechat-open:package/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:wechat-open:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:wechat-open:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:wechat-open:package"))
})

test("WeChat Open mobile app package reports current not-created state without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-wechat-open-mobile-app-package.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const app = report.mobileAppCreationPackage

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.accountVerified, true)
  assert.equal(report.summary.mobileAppCreated, false)
  assert.equal(report.summary.reviewStatus, "not_started")
  assert.equal(report.summary.mobileAppCredentialsAvailable, false)
  assert.equal(app.appType, "移动应用，不是小程序")
  assert.equal(app.appName, "美业话镜")
  assert.equal(app.android.packageName, "com.ipgongchang.meiyehuajing")
  assert.equal(app.android.releaseUsesDebugSigning, false)
  assert.equal(app.android.wechatSignatureRecorded, false)
  assert.equal(app.ios.bundleId, "com.ipgongchang.meiyehuajing")
  assert.equal(app.ios.universalLink, "https://api-cn.ipgongchang.xin/app/wechat/")
  assert.equal(app.ios.appleTeamIdMissing, true)
  assert.ok(app.backendWriteTargetsAfterApproval.includes("WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env"))
  assert.ok(app.backendWriteTargetsAfterApproval.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.match(report.forbidden.join("\n"), /不能用小程序 AppID\/Secret 替代/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
