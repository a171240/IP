const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function runInventoryPlan() {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-cli-inventory-plan.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

test("Aliyun CLI inventory plan is wired into scripts, predeploy, and deploy spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:cloud:inventory-plan"], "node ./scripts/generate-aliyun-cli-inventory-plan.mjs")
  assert.equal(pkg.scripts["aliyun:cloud:inventory-plan:test"], "node --test tests/aliyun-cli-inventory-plan.static.test.js")
  assert.match(predeploy, /aliyun:cloud:inventory-plan:test/)
  assert.match(predeploy, /aliyun:cloud:inventory-plan/)
  assert.equal(deploySpec.cloudInventoryPlan.checkCommand, "corepack pnpm aliyun:cloud:inventory-plan")
  assert.equal(deploySpec.cloudInventoryPlan.requiresConfiguredCli, true)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud:inventory-plan:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud:inventory-plan"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloud:inventory-plan"))
})

test("Aliyun CLI inventory plan is read-only and does not call cloud APIs", () => {
  const { output, report } = runInventoryPlan()
  const commandTemplates = report.operations.flatMap((item) => item.commandPlan.map((command) => command.command))
  const forbidden = report.forbiddenOperations.join("\n")

  assert.equal(report.ok, true)
  assert.equal(report.environment, "production-cn")
  assert.equal(report.region, "cn-hangzhou")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.cloudMutationPerformed, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.match(report.status, /^(ready_to_run_readonly|blocked_until_cli_configured)$/)
  assert.equal(report.summary.totalOperations, 9)
  assert.ok(report.summary.commandTemplates >= 23)
  assert.ok(report.operations.every((item) => item.readOnly === true))
  assert.ok(report.operations.every((item) => item.status === report.status))
  assert.deepEqual(findOperation(report, "I03_DNS_API_DOMAIN").writeTargets, [
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
  ])
  assert.deepEqual(findOperation(report, "I04_DNS_ASSET_DOMAIN").writeTargets, [
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
  ])
  assert.deepEqual(findOperation(report, "I05_OSS_AUDIO_BUCKET").writeTargets, [
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss",
  ])
  assert.deepEqual(findOperation(report, "I07_CERT_HTTPS").writeTargets, [
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps",
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps",
  ])
  assert.equal(report.operations.flatMap((item) => item.writeTargets).some((item) => /items\.(apiDomain|assetDomain|ossAudio)\b/.test(item)), false)
  assert.ok(commandTemplates.some((item) => item.includes("aliyun sae ListApplications")))
  assert.ok(commandTemplates.some((item) => item.includes("aliyun cr ListRepoTag")))
  assert.ok(commandTemplates.some((item) => item.includes("aliyun alidns DescribeSubDomainRecords --SubDomain api-cn.ipgongchang.xin")))
  assert.ok(commandTemplates.some((item) => item.includes("aliyun sls ListAlerts")))
  assert.ok(commandTemplates.some((item) => item.includes("aliyun cas ListUserCertificateOrder")))
  assert.ok(commandTemplates.some((item) => item.includes("aliyun rds DescribeDBInstances --RegionId cn-hangzhou --Engine PostgreSQL")))
  assert.ok(commandTemplates.some((item) => item.includes("aliyun r-kvstore DescribeInstances --RegionId cn-hangzhou")))
  assert.ok(commandTemplates.every((item) => !item.includes("GetAuthorizationToken")))
  assert.match(forbidden, /GetAuthorizationToken/)
  assert.match(forbidden, /GetUserCertificateDetail/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

function findOperation(report, id) {
  const operation = report.operations.find((item) => item.id === id)
  assert.ok(operation, `missing operation ${id}`)
  return operation
}
