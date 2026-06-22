const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun resource matrix command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:resources:matrix"], "node ./scripts/summarize-aliyun-resource-matrix.mjs")
  assert.equal(pkg.scripts["aliyun:resources:matrix:test"], "node --test tests/aliyun-resource-matrix.static.test.js")
  assert.match(predeploy, /aliyun:resources:matrix:test/)
  assert.match(predeploy, /aliyun:resources:matrix/)
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:resources:matrix"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:resources:matrix:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:resources:matrix"))
})

test("Aliyun resource matrix names required cloud resources without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-resource-matrix.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const ids = report.resources.map((item) => item.id)
  const acr = report.resources.find((item) => item.id === "R02_ACR_IMAGE_REGISTRY")
  const env = report.resources.find((item) => item.id === "R06_ENV_IMPORT")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.total, 7)
  assert.ok(report.summary.blocked >= 1)
  assert.deepEqual(ids, [
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ])
  assert.equal(acr.requiresActionTimeConfirmation, true)
  assert.equal(acr.mutationAllowedByThisCommand, false)
  assert.match(acr.consolePath, /容器镜像服务 ACR/)
  assert.match(env.consolePath, /KMS|Secrets Manager|SAE/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
