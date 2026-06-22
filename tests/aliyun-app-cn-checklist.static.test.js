const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("APP production-cn checklist command is wired into local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:app-cn-checklist:test"], "node --test tests/aliyun-app-cn-checklist.static.test.js")
  assert.match(predeploy, /aliyun:app-cn-checklist:test/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:app-cn-checklist:test"))
})

test("APP production-cn checklist records current blockers without secret values", () => {
  const doc = read("docs", "app-production-cn-env-checklist.md")

  for (const expected of [
    "ready 0/9",
    "ready 0/7",
    "required `17/26`",
    "本机 required env 是 `24/26` ready",
    "后端必填阻塞只剩",
    "APP 发布阻塞但非后端必填",
    "WECHAT_OPEN_APP_ID",
    "WECHAT_OPEN_APP_SECRET",
    "移动 App 未创建",
    "meiye-huajing-app-api-production-cn",
    "runtime.confirmed=false",
    "CNY 117.00",
    "¥117.00",
    "secretNotInImage=true",
    "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
    "U09_DEPLOY_AUTHORIZATION",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  for (const resourceId of [
    "SAE 应用",
    "ACR 镜像仓库",
    "OSS Bucket",
    "SLS 日志",
    "api-cn.ipgongchang.xin",
    "assets-cn.ipgongchang.xin",
    "APPLE_TEAM_ID",
  ]) {
    assert.match(doc, new RegExp(resourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})
