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
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:wechat-open:package"], "node ./scripts/generate-wechat-open-mobile-app-package.mjs")
  assert.equal(pkg.scripts["aliyun:wechat-open:package:test"], "node --test tests/aliyun-wechat-open-mobile-app-package.static.test.js")
  assert.match(predeploy, /aliyun:wechat-open:package:test/)
  assert.match(predeploy, /aliyun:wechat-open:package/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:wechat-open:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:wechat-open:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:wechat-open:package"))
  assert.match(releaseArtifacts, /actionPacket/)
  assert.match(releaseArtifacts, /submissionBlockers/)
  assert.match(releaseArtifacts, /credentialBoundary/)
  assert.match(releaseArtifacts, /miniProgramCredentialsReusableForAppLogin/)
})

test("WeChat Open mobile app package reports current not-created state without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-wechat-open-mobile-app-package.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const app = report.mobileAppCreationPackage
  const actionPacket = report.actionPacket

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.accountVerified, true)
  assert.equal(report.summary.mobileAppCreated, false)
  assert.equal(report.summary.reviewStatus, "not_started")
  assert.equal(report.summary.mobileAppCredentialsAvailable, false)
  assert.equal(report.summary.miniProgramCredentialsReusableForAppLogin, false)
  assert.match(report.summary.appLoginCredentialSource, /微信开放平台 -> 管理中心 -> 移动应用/)
  assert.equal(report.credentialBoundary.miniProgramCredentialsReusableForAppLogin, false)
  assert.deepEqual(report.credentialBoundary.appLoginVariableNames, [
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "WECHAT_OPEN_APP_REVIEW_STATUS",
  ])
  assert.deepEqual(report.credentialBoundary.miniProgramCompatVariableNames, [
    "WECHAT_MINI_APPID",
    "WECHAT_MINI_SECRET",
    "WECHAT_LOGIN_SECRET",
  ])
  assert.ok(report.credentialBoundary.whyNotReusable.some((item) => item.includes("小程序 WECHAT_MINI_*")))
  assert.ok(report.credentialBoundary.appLoginImportTargets.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.ok(report.summary.submissionBlockers.includes("android_release_wechat_signature_missing"))
  assert.ok(report.summary.submissionBlockers.includes("wechat_android_package_signature_not_recorded"))
  assert.ok(report.summary.submissionBlockers.includes("wechat_ios_bundle_universal_link_not_recorded"))
  assert.ok(report.summary.submissionBlockers.includes("apple_team_id_missing_for_aasa"))
  assert.equal(app.appType, "移动应用，不是小程序")
  assert.equal(app.appName, "美业话镜")
  assert.equal(app.android.packageName, "com.ipgongchang.meiyehuajing")
  assert.equal(app.android.releaseUsesDebugSigning, false)
  assert.equal(app.android.wechatSignatureRecorded, false)
  assert.equal(app.androidSignaturePackage.ready, false)
  assert.equal(app.androidSignaturePackage.status, "missing_release_wechat_signature")
  assert.equal(app.androidSignaturePackage.packageName, "com.ipgongchang.meiyehuajing")
  assert.equal(app.androidSignaturePackage.releaseSigningConfig, "release")
  assert.equal(app.androidSignaturePackage.releaseUsesDebugSigning, false)
  assert.equal(app.androidSignaturePackage.releaseSigningConfigReady, true)
  assert.equal(app.androidSignaturePackage.releaseArtifactReady, false)
  assert.deepEqual(app.androidSignaturePackage.releaseArtifacts, [])
  assert.ok(app.androidSignaturePackage.obtainSteps.some((item) => item.includes("release APK")))
  assert.ok(app.androidSignaturePackage.writeTargets.includes("微信开放平台 -> 移动应用 -> Android 应用签名"))
  assert.ok(app.androidSignaturePackage.forbidden.some((item) => item.includes("debug.keystore")))
  assert.equal(app.ios.bundleId, "com.ipgongchang.meiyehuajing")
  assert.equal(app.ios.universalLink, "https://api-cn.ipgongchang.xin/app/wechat/")
  assert.equal(app.ios.appleTeamIdMissing, true)
  assert.equal(actionPacket.packetId, "P01_WECHAT_OPEN_MOBILE_APP")
  assert.equal(actionPacket.canStartNow, true)
  assert.equal(actionPacket.readyToSubmitForReview, false)
  assert.match(actionPacket.minimumAuthorizationPhrase, /创建“美业话镜”移动应用草稿/)
  assert.ok(actionPacket.createDraftFields.some((item) => item.name === "androidPackageName" && item.value === "com.ipgongchang.meiyehuajing"))
  assert.ok(actionPacket.createDraftFields.some((item) => item.name === "androidReleaseSignature" && item.value === "missing_release_wechat_signature"))
  assert.ok(actionPacket.acceptanceEvidence.includes("mobileAppCreated=true"))
  assert.ok(actionPacket.acceptanceEvidence.includes("审核通过后 mobileAppSecretReady=true"))
  assert.ok(actionPacket.forbidden.some((item) => item.includes("小程序 AppID/Secret")))
  assert.ok(app.backendWriteTargetsAfterApproval.includes("WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env"))
  assert.ok(app.backendWriteTargetsAfterApproval.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.match(report.forbidden.join("\n"), /不能用小程序 AppID\/Secret 替代/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("WeChat Open mobile app package markdown renders action packet without values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-wechat-open-mobile-app-package.mjs",
    "--markdown",
    "/tmp/meiye-wechat-open-package-test.md",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const markdown = fs.readFileSync("/tmp/meiye-wechat-open-package-test.md", "utf8")

  assert.match(markdown, /## 动作确认包/)
  assert.match(markdown, /## 凭证边界/)
  assert.match(markdown, /appLoginVariableNames: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET, WECHAT_OPEN_APP_REVIEW_STATUS/)
  assert.match(markdown, /miniProgramCompatVariableNames: WECHAT_MINI_APPID, WECHAT_MINI_SECRET, WECHAT_LOGIN_SECRET/)
  assert.match(markdown, /miniProgramCredentialsReusableForAppLogin: false/)
  assert.match(markdown, /阿里云 SAE 后端在 APP 微信登录回调中使用移动应用 AppID\/AppSecret/)
  assert.match(markdown, /packetId: P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /minimumAuthorizationPhrase: 授权在微信开放平台创建“美业话镜”移动应用草稿/)
  assert.match(markdown, /submissionBlockers: android_release_wechat_signature_missing/)
  assert.match(markdown, /## Android Release 签名材料/)
  assert.match(markdown, /releaseArtifactReady: false/)
  assert.match(markdown, /releaseArtifacts: none/)
  assert.match(markdown, /微信开放平台 -> 移动应用 -> Android 应用签名/)
  assert.match(markdown, /不能使用 debug\.keystore/)
  assert.match(markdown, /mobileAppCreated=true/)
  assert.match(markdown, /审核通过后 mobileAppSecretReady=true/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
