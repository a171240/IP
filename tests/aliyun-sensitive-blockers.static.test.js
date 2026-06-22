const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun sensitive blockers command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:sensitive:blockers"], "node ./scripts/summarize-aliyun-sensitive-blockers.mjs")
  assert.equal(pkg.scripts["aliyun:sensitive:blockers:test"], "node --test tests/aliyun-sensitive-blockers.static.test.js")
  assert.match(predeploy, /aliyun:sensitive:blockers:test/)
  assert.match(predeploy, /aliyun:sensitive:blockers/)
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:sensitive:blockers"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:sensitive:blockers"))
})

test("Aliyun sensitive blockers output has current blocked action ids but no secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-sensitive-blockers.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const ids = report.items.map((item) => item.id)
  const wechatItem = report.items.find((item) => item.id === "S01_WECHAT_OPEN_APP_LOGIN")
  const acrPurchaseItem = report.items.find((item) => item.id === "S03_ACR_PAID_PURCHASE")
  const envImportItem = report.items.find((item) => item.id === "S06_READY_SENSITIVE_ENV_IMPORT")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.ok(report.summary.blocked >= 1)
  assert.ok(ids.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.match(wechatItem.requiredUserAction, /创建“美业话镜”移动应用并提交审核/)
  assert.match(wechatItem.unblockCondition, /reviewStatus=approved/)
  assert.match(wechatItem.obtainFrom, /微信开放平台/)
  assert.ok(wechatItem.writeTargets.includes("WECHAT_OPEN_APP_ID -> 阿里云 SAE plain env"))
  assert.ok(wechatItem.writeTargets.includes("WECHAT_OPEN_APP_SECRET -> 阿里云 KMS/Secrets Manager/SAE secret env"))
  assert.ok(wechatItem.verifyCommands.includes("corepack pnpm aliyun:health:smoke"))
  assert.equal(wechatItem.requiresActionTimeConfirmation, false)
  assert.match(wechatItem.completionEvidence.join("\n"), /mobileAppCreated=true/)
  assert.ok(ids.includes("S03_ACR_PAID_PURCHASE"))
  assert.ok(ids.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.equal(acrPurchaseItem.requiresActionTimeConfirmation, true)
  assert.ok(acrPurchaseItem.writeTargets.some((target) => target.includes("image-publish.local.json")))
  assert.match(acrPurchaseItem.completionEvidence.join("\n"), /acr\.purchaseCandidate\.confirmed=true/)
  assert.equal(envImportItem.requiresActionTimeConfirmation, true)
  assert.ok(envImportItem.writeTargets.some((target) => target.includes("items.envImport")))
  assert.ok(envImportItem.verifyCommands.includes("corepack pnpm aliyun:env:checklist"))
  assert.deepEqual(
    report.summary.actionTimeConfirmationRequired,
    ["S03_ACR_PAID_PURCHASE", "S06_READY_SENSITIVE_ENV_IMPORT"],
  )
  assert.ok(report.summary.variableNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
