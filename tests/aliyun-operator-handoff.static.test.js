const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function buildConsoleObservationOperation(id, status) {
  return {
    id,
    title: `${id} console observation`,
    product: "aliyun",
    readOnly: true,
    status,
    commandResults: [
      {
        command: `aliyun readonly ${id}`,
        executed: false,
        exitStatus: null,
        cloudApiCalled: false,
        mutationPerformed: false,
        observedAt: "2026-06-23T02:00:00+08:00",
        outputSummary: "Console-only non-secret observation; CLI/OpenAPI inventory not executed.",
        evidence: `console_only_${id.toLowerCase()}_non_secret_handle`,
      },
    ],
    writesTo: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
    ],
    evidence: `${id} non-secret console evidence`,
  }
}

test("Aliyun operator handoff command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:operator:handoff"], "node ./scripts/generate-aliyun-operator-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:operator:handoff:test"], "node --test tests/aliyun-operator-handoff.static.test.js")
  assert.match(predeploy, /aliyun:operator:handoff:test/)
  assert.match(predeploy, /aliyun:operator:handoff", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:handoff:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:handoff -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:operator:handoff"))
  assert.match(releaseArtifacts, /canStartNowConsoleTasks/)
  assert.match(releaseArtifacts, /blockedByConsoleTaskDependencies/)
})

test("Aliyun operator handoff maps ACR and SAE evidence gaps to the correct consoles", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-handoff-inventory-missing-"))
  const missingInventoryResults = path.join(tmpdir, "missing.cloud-inventory-results.local.json")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--skip-vercel-env-coverage",
    "--cloud-inventory-results",
    missingInventoryResults,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const gaps = report.localEvidenceGaps.imagePublish.gaps
  const inventoryResults = report.localEvidenceGaps.cloudInventoryResults
  const byPath = new Map(gaps.map((item) => [item.jsonPath, item]))
  const registryHost = byPath.get("acr.registryHost")
  const remoteDigest = byPath.get("acr.remoteDigest")
  const runtimeConfirmed = byPath.get("runtime.confirmed")
  const remoteImageConfigured = byPath.get("runtime.remoteImageConfigured")
  const imagePullConfigured = byPath.get("runtime.imagePullConfigured")

  assert.equal(report.containsValues, false)
  assert.deepEqual(report.aliyunConsoleTaskOrder.canStartNow, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
  ])
  assert.ok(report.aliyunConsoleTaskOrder.blockedByDependencies.includes("C01_SAE_RUNTIME"))
  assert.ok(report.aliyunConsoleTaskOrder.blockedByDependencies.includes("C06_ENV_IMPORT"))
  assert.ok(report.aliyunConsoleActionNow.some((item) => item.includes("当前可先处理 C02_ACR_IMAGE_AND_PULL")))
  assert.ok(report.aliyunConsoleActionNow.some((item) => item.includes("当前可先处理 C05_OSS_AUDIO_RAM_STS")))
  assert.ok(report.aliyunConsoleActionNow.some((item) => item.includes("先暂缓 C01_SAE_RUNTIME")))
  const consoleTasksById = new Map(report.aliyunConsoleTaskOrder.tasks.map((item) => [item.id, item]))
  assert.equal(consoleTasksById.get("C02_ACR_IMAGE_AND_PULL").canStartNow, true)
  assert.equal(consoleTasksById.get("C05_OSS_AUDIO_RAM_STS").canStartNow, true)
  assert.deepEqual(consoleTasksById.get("C01_SAE_RUNTIME").blockingDependencies, [
    "C02_ACR_IMAGE_AND_PULL",
    "C05_OSS_AUDIO_RAM_STS",
    "C06_ENV_IMPORT",
  ])
  assert.equal(inventoryResults.exists, false)
  assert.equal(inventoryResults.ready, false)
  assert.equal(inventoryResults.checkedOperations, 0)
  assert.equal(inventoryResults.totalBlockers, 1)
  assert.equal(inventoryResults.gaps[0].jsonPath, "$")
  assert.equal(inventoryResults.gaps[0].blocker, "file_missing")
  assert.match(inventoryResults.gaps[0].source, /CLI/)
  assert.match(inventoryResults.gaps[0].writeTo, /cloud-inventory-results\.local\.json/)
  assert.match(inventoryResults.gaps[0].expected, /复制/)
  assert.match(report.safetyBoundary.join("\n"), /cloud-inventory-results\.local\.json/)
  assert.equal(report.localEvidenceGaps.imagePublish.totalBlockers, 12)
  assert.match(registryHost.source, /容器镜像服务 ACR/)
  assert.match(registryHost.writeTo, /-> acr$/)
  assert.match(remoteDigest.source, /容器镜像服务 ACR/)
  assert.match(runtimeConfirmed.source, /SAE/)
  assert.doesNotMatch(runtimeConfirmed.source, /命名空间\/仓库/)
  assert.match(runtimeConfirmed.writeTo, /-> runtime$/)
  assert.match(remoteImageConfigured.source, /SAE/)
  assert.match(imagePullConfigured.source, /SAE/)
  assert.match(remoteImageConfigured.expected, /SAE 已指向 ACR remote image/)
  assert.match(imagePullConfigured.expected, /SAE 镜像拉取权限/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun operator handoff exposes console-only inventory observation summary", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-handoff-console-observation-"))
  const inventoryResults = path.join(tmpdir, "cloud-inventory-results.local.json")
  const markdown = path.join(tmpdir, "operator-handoff.md")
  fs.writeFileSync(inventoryResults, JSON.stringify({
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: "2026-06-23T02:00:00+08:00",
    operator: "test",
    sourcePlanCommand: "corepack pnpm aliyun:cloud:inventory-plan",
    notes: "Test fixture with console-only observations and no cloud API calls.",
    operations: [
      buildConsoleObservationOperation("I01_SAE_RUNTIME", "not_found"),
      buildConsoleObservationOperation("I02_ACR_IMAGE", "blocked"),
      buildConsoleObservationOperation("I03_DNS_API_DOMAIN", "not_found"),
      buildConsoleObservationOperation("I04_DNS_ASSET_DOMAIN", "not_found"),
      buildConsoleObservationOperation("I05_OSS_AUDIO_BUCKET", "observed"),
      buildConsoleObservationOperation("I06_SLS_ALERTS", "observed"),
      buildConsoleObservationOperation("I07_CERT_HTTPS", "blocked"),
    ],
  }, null, 2))

  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--skip-vercel-env-coverage",
    "--cloud-inventory-results",
    inventoryResults,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const summary = report.localEvidenceGaps.cloudInventoryResults.observationSummary
  const inventoryGaps = report.localEvidenceGaps.cloudInventoryResults.gaps
  const markdownOutput = fs.readFileSync(markdown, "utf8")

  assert.equal(report.localEvidenceGaps.cloudInventoryResults.exists, true)
  assert.equal(report.localEvidenceGaps.cloudInventoryResults.ready, false)
  assert.equal(summary.safeConsoleOnly, true)
  assert.equal(summary.operations, 7)
  assert.equal(summary.consoleObservationOperations, 7)
  assert.equal(summary.commandResults, 7)
  assert.equal(summary.executedCommandResults, 0)
  assert.equal(summary.cloudApiCalledCommandResults, 0)
  assert.equal(summary.mutationPerformedCommandResults, 0)
  assert.deepEqual(summary.observedOperationIds, [
    "I05_OSS_AUDIO_BUCKET",
    "I06_SLS_ALERTS",
  ])
  assert.deepEqual(summary.notFoundOperationIds, [
    "I01_SAE_RUNTIME",
    "I03_DNS_API_DOMAIN",
    "I04_DNS_ASSET_DOMAIN",
  ])
  assert.deepEqual(summary.blockedOperationIds, [
    "I02_ACR_IMAGE",
    "I07_CERT_HTTPS",
  ])
  assert.ok(inventoryGaps.some((item) => item.blocker === "console_only_observation_not_strict_inventory"))
  assert.ok(inventoryGaps.every((item) => item.jsonPath === "operations[*].commandResults[*]" || item.jsonPath === "$"))
  assert.ok(inventoryGaps.some((item) => /控制台人工观察/.test(item.expected)))
  assert.match(markdownOutput, /safeConsoleOnly: true/)
  assert.match(markdownOutput, /consoleObservationOperations: 7\/7/)
  assert.match(markdownOutput, /executedCommandResults: 0\/7/)
  assert.match(markdownOutput, /cloudApiCalledCommandResults: 0/)
  assert.match(markdownOutput, /mutationPerformedCommandResults: 0/)
  assert.doesNotMatch(output + markdownOutput, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdownOutput, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdownOutput, /:\/\/[^\s:@]+:[^\s@]+@/)
})
