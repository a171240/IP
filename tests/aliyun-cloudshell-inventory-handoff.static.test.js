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
  assert.match(releaseArtifacts, /currentBrowserCanUseCurrentConsole/)
  assert.match(releaseArtifacts, /strictInventoryAlreadyReady/)
})

test("Aliyun CloudShell handoff produces value-free local JSON and Markdown", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-handoff-"))
  const inventoryPath = path.join(tmpdir, "inventory.local.json")
  const jsonPath = path.join(tmpdir, "handoff.json")
  const markdownPath = path.join(tmpdir, "handoff.md")
  writeStrictInventoryFixture(inventoryPath)
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-inventory-handoff.mjs",
    "--cloud-inventory-results",
    inventoryPath,
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
  assert.equal(report.currentBrowser.checked, true)
  assert.equal(typeof report.currentBrowser.canUseCurrentConsole, "boolean")
  assert.ok(Array.isArray(report.currentBrowser.aliyunConsoleHostPaths))
  assert.equal(report.currentBrowser.cloudApiCalled, false)
  assert.equal(report.currentBrowser.cloudMutationPerformed, false)
  assert.equal(typeof report.cliReadiness.canReadCloudNow, "boolean")
  assert.equal(typeof report.cliReadiness.configProbe.ready, "boolean")
  assert.equal(report.cliReadiness.strictInventoryAlreadyReady, true)
  assert.equal(report.existingInventoryEvidence.ready, true)
  assert.equal(report.existingInventoryEvidence.localOperations, 9)
  assert.equal(report.existingInventoryEvidence.readyLocalOperations, 9)
  assert.equal(report.existingInventoryEvidence.commandResults, 9)
  assert.equal(report.existingInventoryEvidence.executedCommandResults, 9)
  assert.equal(report.existingInventoryEvidence.cloudApiCalledCommandResults, 9)
  assert.equal(report.existingInventoryEvidence.mutationPerformedCommandResults, 0)
  assert.ok(report.existingInventoryEvidence.observedOperationIds.includes("I05_OSS_AUDIO_BUCKET"))
  assert.ok(report.existingInventoryEvidence.notFoundOperationIds.includes("I01_SAE_RUNTIME"))
  assert.deepEqual(report.existingInventoryEvidence.blockedOperationIds, [])
  assert.equal(report.inventoryPlan.totalOperations, 9)
  assert.equal(report.inventoryPlan.commandTemplates, 23)
  assert.ok(operatorPathIds.includes("local_cli"))
  assert.ok(operatorPathIds.includes("aliyun_cloudshell"))
  assert.ok(operatorPathIds.includes("ecs_workbench_terminal"))
  assert.ok(operationIds.includes("I01_SAE_RUNTIME"))
  assert.ok(operationIds.includes("I02_ACR_IMAGE"))
  assert.ok(operationIds.includes("I05_OSS_AUDIO_BUCKET"))
  assert.ok(operationIds.includes("I08_RDS_POSTGRES"))
  assert.ok(operationIds.includes("I09_TAIR_REDIS"))
  assert.ok(report.writebackTargets.includes("deploy/aliyun-production-cn.cloud-inventory-results.local.json"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.match(markdown, /CloudShell\/CLI 只读盘点交接包/)
  assert.match(markdown, /strictInventoryAlreadyReady: true/)
  assert.match(markdown, /strictInventoryReadyLocalOperations: 9\/9/)
  assert.match(markdown, /strictInventoryMutationPerformedCommandResults: 0/)
  assert.match(markdown, /currentBrowserCanUseCurrentConsole:/)
  assert.match(markdown, /已有 strict inventory 证据/)
  assert.match(markdown, /I01_SAE_RUNTIME/)
  assert.match(markdown, /Strict 验证顺序/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})

function readJsonFromPath(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeStrictInventoryFixture(filePath) {
  const template = readJson("deploy", "aliyun-production-cn.cloud-inventory-results.example.json")
  const observedIds = new Set(["I05_OSS_AUDIO_BUCKET", "I06_SLS_ALERTS"])
  const ready = {
    ...template,
    updatedAt: "2026-06-24T00:30:00+08:00",
    operator: "codex-test-non-secret",
    notes: "synthetic non-secret strict inventory fixture",
    operations: template.operations.map((operation) => ({
      ...operation,
      status: observedIds.has(operation.id) ? "observed" : "not_found",
      evidence: `${operation.id}_strict_inventory_evidence_handle`,
      commandResults: operation.commandResults.map((result) => ({
        ...result,
        executed: true,
        exitStatus: 0,
        cloudApiCalled: true,
        mutationPerformed: false,
        observedAt: "2026-06-24T00:30:00+08:00",
        outputSummary: `${operation.id} strict inventory completed with non-secret summary`,
        evidence: `${operation.id}_command_evidence_handle`,
      })),
    })),
  }
  fs.writeFileSync(filePath, JSON.stringify(ready, null, 2))
}
