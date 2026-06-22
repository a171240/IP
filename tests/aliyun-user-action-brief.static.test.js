const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun user action brief command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:user:actions"], "node ./scripts/summarize-aliyun-user-action-brief.mjs")
  assert.equal(pkg.scripts["aliyun:user:actions:test"], "node --test tests/aliyun-user-action-brief.static.test.js")
  assert.match(predeploy, /aliyun:user:actions:test/)
  assert.match(predeploy, /aliyun:user:actions/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:user:actions:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:user:actions"))
})

test("Aliyun user action brief is value-free and includes the expected blockers", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-user-action-brief.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const ids = report.actions.map((item) => item.id)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.canDeployNow, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.ok(ids.includes("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(ids.includes("U03_ACR_PURCHASE_CONFIRMATION"))
  assert.ok(ids.includes("U06_ENV_IMPORT"))
  assert.ok(ids.includes("U09_DEPLOY_AUTHORIZATION"))
  assert.ok(report.summary.userMustAct.includes("U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE"))
  assert.ok(report.summary.actionTimeConfirmationRequired.includes("U03_ACR_PURCHASE_CONFIRMATION"))
  const wechatAction = report.actions.find((item) => item.id === "U01_WECHAT_OPEN_APP_CREATE_AND_APPROVE")
  const domainAction = report.actions.find((item) => item.id === "U07_DOMAIN_DNS_HTTPS_ICP")
  const deployAction = report.actions.find((item) => item.id === "U09_DEPLOY_AUTHORIZATION")
  assert.ok(wechatAction.variableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(wechatAction.currentEvidence.includes("wechatOpenPlatform.accountVerified=true"))
  assert.ok(wechatAction.currentEvidence.includes("wechatOpenPlatform.mobileAppCreated=false"))
  assert.ok(wechatAction.currentBlockers.includes("wechatOpenPlatform:mobileAppCreated"))
  assert.ok(domainAction.currentBlockers.includes("apiDomainHttps:dnsResolvedToAliyun"))
  assert.ok(deployAction.currentBlockers.includes("canDeployNow=false"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
