const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|token\s*[:=]\s*\S{8,})/i

test("Aliyun CloudShell handoff is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:cloudshell:handoff"], "node ./scripts/generate-aliyun-cloudshell-inventory-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:cloudshell:handoff:test"], "node --test tests/aliyun-cloudshell-inventory-handoff.static.test.js")
  assert.match(predeploy, /aliyun:cloudshell:handoff:test/)
  assert.match(predeploy, /aliyun:cloudshell:handoff/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloudshell:handoff:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloudshell:handoff"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloudshell:handoff"))
  assert.ok(
    deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloud:inventory-run") <
      deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloudshell:handoff"),
  )
  assert.ok(
    deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloudshell:handoff") <
      deploySpec.predeployChecks.indexOf("corepack pnpm aliyun:cloud:inventory-results"),
  )
  assert.match(releaseArtifacts, /cloudshell-inventory-handoff\.json/)
  assert.match(releaseArtifacts, /cloudshell-inventory-handoff\.md/)
  assert.match(releaseArtifacts, /cloudshellInventoryHandoff/)
})

test("Aliyun CloudShell handoff produces value-free local JSON and Markdown", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-handoff-"))
  const jsonPath = path.join(tmpdir, "handoff.json")
  const markdownPath = path.join(tmpdir, "handoff.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-inventory-handoff.mjs",
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const written = readJsonFromPath(jsonPath)
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const operationIds = report.operations.map((item) => item.id)
  const operatorPathIds = report.operatorPaths.map((item) => item.id)

  assert.equal(report.ok, true)
  assert.deepEqual(written, report)
  assert.equal(report.executionMode, "handoff_only")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(typeof report.cliReadiness.canReadCloudNow, "boolean")
  assert.equal(typeof report.cliReadiness.configProbe.ready, "boolean")
  assert.equal(report.inventoryPlan.totalOperations, 7)
  assert.equal(report.inventoryPlan.commandTemplates, 20)
  assert.ok(operatorPathIds.includes("local_cli"))
  assert.ok(operatorPathIds.includes("aliyun_cloudshell"))
  assert.ok(operatorPathIds.includes("ecs_workbench_terminal"))
  assert.ok(operationIds.includes("I01_SAE_RUNTIME"))
  assert.ok(operationIds.includes("I02_ACR_IMAGE"))
  assert.ok(operationIds.includes("I05_OSS_AUDIO_BUCKET"))
  assert.ok(report.writebackTargets.includes("deploy/aliyun-production-cn.cloud-inventory-results.local.json"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.match(markdown, /CloudShell\/CLI 只读盘点交接包/)
  assert.match(markdown, /I01_SAE_RUNTIME/)
  assert.match(markdown, /Strict 验证顺序/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})

function readJsonFromPath(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}
