const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8")
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

test("Aliyun release defaults treat WeChat Open Platform mobile app as not created", () => {
  const cloudConfirmations = readJson("deploy/aliyun-production-cn.cloud-confirmations.example.json")
  assert.equal(cloudConfirmations.items.wechatOpenPlatform.reviewStatus, "not_started")

  const bridgeMap = readJson("deploy/app-api-production-cn.bridge-map.json")
  assert.equal(bridgeMap.rules.wechatAppLogin.currentExternalStatus, "not_started")
})

test("Aliyun docs describe the current WeChat state as account verified but mobile app not created", () => {
  const deployDoc = readText("docs/DEPLOY_ALIYUN_PRODUCTION_CN.md")
  assert.match(deployDoc, /reviewStatus=not_started[^。]*创建“美业话镜”移动应用/)

  const releaseManifest = readText("docs/release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")
  assert.match(releaseManifest, /WECHAT_OPEN_APP_REVIEW_STATUS=not_started（当前；发布前必须 approved）/)
  assert.match(releaseManifest, /微信开放平台账号认证已通过，但移动应用尚未创建/)
  assert.doesNotMatch(releaseManifest, /用户已确认微信开放平台移动应用正在审核中/)
})

test("Aliyun readiness next action distinguishes not_started from reviewing", () => {
  const readinessSource = readText("scripts/check-aliyun-production-cn-readiness.mjs")
  assert.match(
    readinessSource,
    /reviewStatus === "not_started"[\s\S]*创建“美业话镜”移动应用并提交审核/,
  )
  assert.match(
    readinessSource,
    /reviewStatus === "reviewing"[\s\S]*等待微信开放平台移动应用审核通过/,
  )

  const operatorTasksSource = readText("scripts/generate-aliyun-operator-tasks.mjs")
  assert.match(
    operatorTasksSource,
    /function wechatSensitiveRequiredUserAction[\s\S]*reviewStatus === "not_started"[\s\S]*创建“美业话镜”移动应用并提交审核/,
  )
})
