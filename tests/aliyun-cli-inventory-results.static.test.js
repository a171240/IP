const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function run(args) {
  const output = execFileSync(process.execPath, ["scripts/check-aliyun-cli-inventory-results.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

function writeConsoleOnlyLocalFixture() {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-inventory-results-console-only-"))
  const localFile = path.join(tmpdir, "inventory.local.json")
  const template = readJson("deploy", "aliyun-production-cn.cloud-inventory-results.example.json")
  const statusById = new Map([
    ["I01_SAE_RUNTIME", "not_found"],
    ["I02_ACR_IMAGE", "blocked"],
    ["I03_DNS_API_DOMAIN", "not_found"],
    ["I04_DNS_ASSET_DOMAIN", "not_found"],
    ["I05_OSS_AUDIO_BUCKET", "observed"],
    ["I06_SLS_ALERTS", "observed"],
    ["I07_CERT_HTTPS", "blocked"],
    ["I08_RDS_POSTGRES", "not_found"],
    ["I09_TAIR_REDIS", "not_found"],
  ])
  const local = {
    ...template,
    updatedAt: "2026-06-24T01:30:00+08:00",
    operator: "codex-test-console-only",
    notes: "synthetic non-secret console-only fixture",
    operations: template.operations.map((operation) => ({
      ...operation,
      status: statusById.get(operation.id) || "blocked",
      evidence: `${operation.id}_console_only_non_secret_evidence`,
      commandResults: operation.commandResults.map((result) => ({
        ...result,
        executed: false,
        exitStatus: null,
        cloudApiCalled: false,
        mutationPerformed: false,
        observedAt: "2026-06-24T01:30:00+08:00",
        outputSummary: `${operation.id} console-only non-secret observation`,
        evidence: `${operation.id}_console_only_command_evidence`,
      })),
    })),
  }
  fs.writeFileSync(localFile, JSON.stringify(local, null, 2))
  return localFile
}

test("Aliyun CLI inventory results command is wired into scripts, predeploy, and deploy spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:cloud:inventory-results"], "node ./scripts/check-aliyun-cli-inventory-results.mjs --allow-incomplete")
  assert.equal(pkg.scripts["aliyun:cloud:inventory-results:strict"], "node ./scripts/check-aliyun-cli-inventory-results.mjs")
  assert.equal(pkg.scripts["aliyun:cloud:inventory-results:test"], "node --test tests/aliyun-cli-inventory-results.static.test.js")
  assert.match(predeploy, /aliyun:cloud:inventory-results:test/)
  assert.match(predeploy, /aliyun:cloud:inventory-results/)
  assert.equal(deploySpec.cloudInventoryResults.exampleFile, "deploy/aliyun-production-cn.cloud-inventory-results.example.json")
  assert.equal(deploySpec.cloudInventoryResults.localFile, "deploy/aliyun-production-cn.cloud-inventory-results.local.json")
  assert.equal(deploySpec.cloudInventoryResults.checkCommand, "corepack pnpm aliyun:cloud:inventory-results")
  assert.equal(deploySpec.cloudInventoryResults.strictCheckCommand, "corepack pnpm aliyun:cloud:inventory-results:strict")
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud:inventory-results:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud:inventory-results"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloud:inventory-results"))
  assert.match(releaseArtifacts, /cloudInventoryResultsFile/)
  assert.match(releaseArtifacts, /--cloud-inventory-results/)
  assert.match(releaseArtifacts, /check-aliyun-cli-inventory-results\.mjs/)
})

test("Aliyun CLI inventory results reports incomplete local evidence without calling cloud APIs", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-inventory-results-missing-"))
  const missingLocal = path.join(tmpdir, "missing.local.json")
  const { output, report } = run(["--local", missingLocal, "--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.allowIncomplete, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudMutationPerformed, false)
  assert.equal(report.template.ready, true)
  assert.equal(report.template.checkedOperations, 9)
  assert.equal(report.summary.readyTemplateOperations, 9)
  assert.equal(report.summary.localOperations, 0)
  assert.equal(report.summary.readyLocalOperations, 0)
  assert.equal(report.local.exists, false)
  assert.ok(report.local.blockers.includes("file_missing"))
  assert.match(report.nextActions.join("\n"), /cloud-inventory-results\.local\.json/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun production status surfaces CLI inventory result blockers", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-status-inventory-results-missing-"))
  const missingLocal = path.join(tmpdir, "missing.local.json")
  const output = execFileSync(
    process.execPath,
    [
      "scripts/summarize-aliyun-production-cn-status.mjs",
      "--cloud-inventory-results",
      missingLocal,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 30,
    },
  )
  const report = JSON.parse(output)

  assert.equal(report.summary.cloudInventoryResults.localExists, false)
  assert.equal(report.summary.cloudInventoryResults.localReady, false)
  assert.equal(report.summary.cloudInventoryResults.localOperations, 0)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.operations, 0)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.safeConsoleOnly, false)
  assert.ok(report.summary.cloudInventoryResults.localBlockers.includes("file_missing"))
  assert.equal(report.localReadiness.cloudInventoryResults.localFile, missingLocal)
  assert.equal(report.localReadiness.cloudInventoryResults.readOnlyOnly, true)
  assert.equal(report.localReadiness.cloudInventoryResults.cloudMutationPerformed, false)
  assert.ok(report.humanSummary.some((line) => /阿里云 CLI 只读盘点结果/.test(line)))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun production status surfaces safe console-only inventory observations", () => {
  const localFile = writeConsoleOnlyLocalFixture()
  const output = execFileSync(
    process.execPath,
    [
      "scripts/summarize-aliyun-production-cn-status.mjs",
      "--cloud-inventory-results",
      localFile,
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 30,
    },
  )
  const report = JSON.parse(output)
  const summary = report.summary.cloudInventoryResults.observationSummary
  const local = report.localReadiness.cloudInventoryResults.observationSummary

  assert.equal(report.summary.cloudInventoryResults.localReady, false)
  assert.equal(summary.safeConsoleOnly, true)
  assert.equal(summary.operations, 9)
  assert.equal(summary.consoleObservationOperations, 9)
  assert.equal(summary.strictReadyOperations, 0)
  assert.equal(summary.executedCommandResults, 0)
  assert.equal(summary.cloudApiCalledCommandResults, 0)
  assert.equal(summary.mutationPerformedCommandResults, 0)
  assert.deepEqual(local, summary)
  assert.ok(report.summary.cloudInventoryResults.localBlockers.includes("console_only_observation_not_strict_inventory"))
  assert.ok(report.summary.cloudInventoryResults.localBlockers.includes("readonly_inventory_commands_executed=0/9"))
  assert.ok(!report.summary.cloudInventoryResults.localBlockers.some((item) => item.includes("commandResults[0]:executed=true")))
  assert.ok(report.humanSummary.some((line) => /阿里云控制台观察证据/.test(line)))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun CLI inventory results separates console observations from strict CLI readiness", () => {
  const localFile = writeConsoleOnlyLocalFixture()
  const { output, report } = run(["--local", localFile, "--allow-incomplete"])
  const summary = report.local.observationSummary
  const oss = report.local.operationStatus.I05_OSS_AUDIO_BUCKET
  const sls = report.local.operationStatus.I06_SLS_ALERTS
  const sae = report.local.operationStatus.I01_SAE_RUNTIME

  assert.equal(report.ok, false)
  assert.equal(report.local.ready, false)
  assert.equal(report.local.checkedOperations, 9)
  assert.equal(summary.operations, 9)
  assert.equal(summary.strictReadyOperations, 0)
  assert.equal(summary.evidenceReadyOperations, 9)
  assert.equal(summary.consoleObservationOperations, 9)
  assert.equal(summary.safeConsoleOnly, true)
  assert.equal(summary.commandResults, 9)
  assert.equal(summary.executedCommandResults, 0)
  assert.equal(summary.cloudApiCalledCommandResults, 0)
  assert.equal(summary.mutationPerformedCommandResults, 0)
  assert.ok(report.local.blockers.includes("readonly_inventory_strict_ready=0/9"))
  assert.ok(report.local.blockers.includes("readonly_inventory_commands_executed=0/9"))
  assert.ok(report.local.blockers.includes("readonly_inventory_cloud_api_called=0/9"))
  assert.ok(report.local.blockers.includes("console_only_observation_not_strict_inventory"))
  assert.ok(report.local.technicalBlockers.some((item) =>
    item.includes("commandResults[0]:expected:executed=true actual:false")
  ))
  assert.deepEqual(summary.statusCounts, {
    not_found: 5,
    blocked: 2,
    observed: 2,
  })
  assert.deepEqual(summary.observedOperationIds, ["I05_OSS_AUDIO_BUCKET", "I06_SLS_ALERTS"])
  assert.ok(summary.notFoundOperationIds.includes("I01_SAE_RUNTIME"))
  assert.ok(summary.notFoundOperationIds.includes("I08_RDS_POSTGRES"))
  assert.ok(summary.notFoundOperationIds.includes("I09_TAIR_REDIS"))
  assert.ok(summary.blockedOperationIds.includes("I02_ACR_IMAGE"))
  assert.equal(oss.status, "observed")
  assert.equal(oss.evidenceReady, true)
  assert.equal(oss.commandExecution.executed, 0)
  assert.equal(oss.commandExecution.cloudApiCalled, 0)
  assert.equal(sls.status, "observed")
  assert.equal(sae.status, "not_found")
  assert.match(output, /safeConsoleOnly/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun CLI inventory results technical blockers show expected and actual values", () => {
  const { output, report } = run(["--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.local.ready, false)
  assert.ok(report.local.technicalBlockers.some((item) =>
    item === "I01_SAE_RUNTIME:commandResults[0]:expected:exitStatus=0 actual:3"
  ))
  assert.ok(report.local.technicalBlockers.some((item) =>
    item === "I05_OSS_AUDIO_BUCKET:commandResults[0]:expected:exitStatus=0 actual:1"
  ))
  assert.ok(!report.local.technicalBlockers.some((item) => /commandResults\[0\]:exitStatus=0$/.test(item)))
  assert.match(output, /expected:exitStatus=0 actual:3/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun CLI inventory results strict mode accepts complete non-secret local summaries", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-inventory-results-ready-"))
  const localFile = path.join(tmpdir, "inventory.local.json")
  const template = readJson("deploy", "aliyun-production-cn.cloud-inventory-results.example.json")
  const ready = {
    ...template,
    updatedAt: "2026-06-22T21:10:00+08:00",
    operator: "codex-test-non-secret",
    notes: "synthetic non-secret strict-mode fixture",
    operations: template.operations.map((operation) => ({
      ...operation,
      status: "observed",
      evidence: `${operation.id}_non_secret_evidence_handle`,
      commandResults: operation.commandResults.map((result) => ({
        ...result,
        executed: true,
        exitStatus: 0,
        cloudApiCalled: true,
        mutationPerformed: false,
        observedAt: "2026-06-22T21:10:00+08:00",
        outputSummary: `${operation.id} observed expected non-secret resource status`,
        evidence: `${operation.id}_command_evidence_handle`,
      })),
    })),
  }
  fs.writeFileSync(localFile, JSON.stringify(ready, null, 2))

  const { output, report } = run(["--local", localFile])
  assert.equal(report.ok, true)
  assert.equal(report.local.ready, true)
  assert.equal(report.local.checkedOperations, 9)
  assert.equal(report.summary.readyTemplateOperations, 9)
  assert.equal(report.summary.readyLocalOperations, 9)
  assert.equal(report.summary.totalBlockers, 0)
  assert.equal(report.cloudMutationPerformed, false)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
