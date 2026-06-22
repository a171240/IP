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
    "受控标识符",
    "Apple Team ID 是 Apple Developer 受控标识符，不是密钥",
    "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE",
    "U09_DEPLOY_AUTHORIZATION",
    "aliyun:console:runbook",
    "aliyun:action:authorization",
    "7 项阿里云控制台任务",
    "所有 9 项都不能在没有动作时确认的情况下自动执行",
    "aliyun:wechat-open:package",
    "微信开放平台移动应用创建材料包",
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

test("APP production-cn release manifest keeps Vercel coverage aligned with required env count", () => {
  const manifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  assert.match(manifest, /required APP production-cn variables covered by Vercel production: 17 \/ 26/)
  assert.match(manifest, /缺失的 9 个必填项/)
  assert.match(manifest, /`api-cn`\/`assets-cn` 域名变量/)
  assert.match(manifest, /required missing in Vercel production:[\s\S]*APP_ASSET_BASE_URL/)
  assert.doesNotMatch(manifest, /required APP production-cn variables covered by Vercel production: 17 \/ 25/)
  assert.doesNotMatch(manifest, /缺失的 8 个必填项/)
})

test("APP production-cn release manifest separates historical snapshots from current gate counts", () => {
  const manifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  assert.match(manifest, /03:56 CST artifacts 历史快照/)
  assert.match(manifest, /当前权威脚本口径为 `imagePublishPlan\.totalBlockers=12`/)
  assert.match(manifest, /`cloudConfirmations\.totalBlockers=27`/)
  assert.match(manifest, /`localPredeployChecks=46`/)
  assert.match(manifest, /`predeployChecks=28`/)
  assert.match(manifest, /18:46 口径保留为历史证据/)
  assert.match(manifest, /18:55 的 `44\/27` 也只代表对应时点的历史快照/)
  assert.match(manifest, /早前 35\/24、40\/25、16、25 也只代表对应时点的历史快照/)
})
