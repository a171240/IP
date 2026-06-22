const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun console runbook command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:console:runbook"], "node ./scripts/generate-aliyun-console-runbook.mjs")
  assert.equal(pkg.scripts["aliyun:console:runbook:test"], "node --test tests/aliyun-console-runbook.static.test.js")
  assert.match(predeploy, /aliyun:console:runbook:test/)
  assert.match(predeploy, /aliyun:console:runbook/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:console:runbook:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:console:runbook"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:console:runbook"))
})

test("Aliyun console runbook renders current console fields without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-console-runbook.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const ids = report.consoleTasks.map((item) => item.id)
  const sae = report.consoleTasks.find((item) => item.id === "C01_SAE_RUNTIME")
  const acr = report.consoleTasks.find((item) => item.id === "C02_ACR_IMAGE_AND_PULL")
  const env = report.consoleTasks.find((item) => item.id === "C06_ENV_IMPORT")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.deepEqual(ids, [
    "C01_SAE_RUNTIME",
    "C02_ACR_IMAGE_AND_PULL",
    "C03_API_DOMAIN_HTTPS_ICP",
    "C04_ASSET_DOMAIN_HTTPS_ICP",
    "C05_OSS_AUDIO_RAM_STS",
    "C06_ENV_IMPORT",
    "C07_SLS_ALERTS",
  ])
  assert.equal(report.target.region, "cn-hangzhou")
  assert.equal(report.target.appName, "meiye-huajing-app-api-production-cn")
  assert.ok(report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.requiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(sae.targetFields.some((item) => item.name === "containerPort" && item.value === 3000))
  assert.ok(sae.currentBlockers.includes("runtime:confirmed"))
  assert.equal(acr.requiresActionTimeConfirmation, true)
  assert.ok(acr.targetFields.some((item) => item.name === "quotedAmount" && item.value === "CNY 117.00"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true"))
  assert.ok(env.targetFields.some((item) => item.name === "secretNotInImage" && item.value === true))
  assert.ok(env.currentBlockers.includes("envImport:secretNotInImage"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
