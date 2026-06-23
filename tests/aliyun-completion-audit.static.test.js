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
        observedAt: "2026-06-23T02:30:00+08:00",
        outputSummary: "Console-only non-secret observation; CLI/OpenAPI inventory not executed.",
        evidence: `completion_audit_console_only_${id.toLowerCase()}_handle`,
      },
    ],
    writesTo: [
      "deploy/aliyun-production-cn.cloud-confirmations.local.json",
    ],
    evidence: `${id} non-secret console evidence`,
  }
}

function writeConsoleOnlyInventoryFixture(filePath) {
  fs.writeFileSync(filePath, JSON.stringify({
    schemaVersion: 1,
    environment: "production-cn",
    updatedAt: "2026-06-23T02:30:00+08:00",
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
}

test("Aliyun completion audit command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:completion:audit"], "node ./scripts/summarize-aliyun-completion-audit.mjs")
  assert.equal(pkg.scripts["aliyun:completion:audit:test"], "node --test tests/aliyun-completion-audit.static.test.js")
  assert.match(predeploy, /aliyun:completion:audit:test/)
  assert.match(predeploy, /aliyun:completion:audit/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:completion:audit:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:completion:audit"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:completion:audit"))
  assert.match(releaseArtifacts, /completion-audit\.json/)
  assert.match(releaseArtifacts, /completion-audit\.md/)
  assert.match(releaseArtifacts, /completionAudit/)
  assert.match(releaseArtifacts, /cloudInventoryConsoleOnly/)
  assert.match(releaseArtifacts, /observationSummary/)
  assert.match(releaseArtifacts, /nextActionTimeConfirmations/)
})

test("Aliyun completion audit reports the current goal as blocked without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-completion-audit.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.requirements.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.complete, false)
  assert.equal(report.verdict, "blocked")
  assert.equal(report.canDeployNow, false)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.requirements, 10)
  assert.ok(report.summary.blocked >= 6)
  assert.ok(report.summary.proved >= 1)
  assert.ok(report.summary.partial >= 1)

  assert.equal(byId.get("G01_LOCAL_APP_BACKEND_READY").status, "partial")
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").evidence.includes("localCodeReady=false"))
  assert.ok(byId.get("G01_LOCAL_APP_BACKEND_READY").blockers.includes("localCodeReady=false"))
  assert.equal(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").status, "blocked")
  assert.equal(byId.get("G03_CLOUD_INVENTORY_PROVED").status, "blocked")
  assert.equal(byId.get("G04_IMAGE_PUBLISH_READY").status, "blocked")
  assert.equal(byId.get("G05_DOMAIN_HTTPS_ICP_READY").status, "blocked")
  assert.equal(byId.get("G06_WECHAT_APP_LOGIN_READY").status, "blocked")
  assert.equal(byId.get("G08_ENV_IMPORT_READY").status, "blocked")
  assert.equal(byId.get("G09_SENSITIVE_BLOCKERS_EXPLICIT").status, "proved")
  assert.equal(byId.get("G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE").status, "blocked")

  assert.ok(byId.get("G06_WECHAT_APP_LOGIN_READY").blockers.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(byId.get("G06_WECHAT_APP_LOGIN_READY").blockers.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(byId.get("G08_ENV_IMPORT_READY").blockers.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(byId.get("G08_ENV_IMPORT_READY").blockers.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(byId.get("G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE").blockers.includes("canDeployNow=false"))

  assert.ok(report.nextActions.canStartNowConsoleTasks.includes("C02_ACR_IMAGE_AND_PULL"))
  assert.ok(report.nextActions.canStartNowConsoleTasks.includes("C05_OSS_AUDIO_RAM_STS"))
  assert.ok(report.nextActions.canStartNowAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.nextActions.canStartNowAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.deepEqual(
    report.summary.nextActionTimeConfirmations.map((item) => item.packetId),
    [
      "P01_WECHAT_OPEN_MOBILE_APP",
      "P02_APPLE_TEAM_ID",
      "P03_ACR_PURCHASE",
      "P05_OSS_RAM_STS",
    ],
  )
  assert.match(
    report.summary.nextActionTimeConfirmations.find((item) => item.packetId === "P01_WECHAT_OPEN_MOBILE_APP").minimumUserPhrase,
    /微信开放平台创建\/补全美业话镜移动应用资料/,
  )
  assert.ok(
    report.summary.nextActionTimeConfirmations
      .find((item) => item.packetId === "P03_ACR_PURCHASE")
      .explicitlyExcluded.some((item) => item.includes("未明确确认金额前不点击付款")),
  )
  assert.ok(
    report.nextActions.nextActionTimeConfirmations
      .find((item) => item.packetId === "P05_OSS_RAM_STS")
      .completionEvidence.includes("oss.ramLeastPrivilege=true"),
  )
  assert.ok(report.nextActions.sensitiveBlockedIds.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(report.nextActions.sensitiveBlockedIds.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不购买 ACR")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不读取、复制、输出或导入")))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun completion audit carries console-only inventory evidence into G03 and markdown", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-completion-audit-console-observation-"))
  const inventoryResults = path.join(tmpdir, "cloud-inventory-results.local.json")
  const markdown = path.join(tmpdir, "completion-audit.md")
  writeConsoleOnlyInventoryFixture(inventoryResults)

  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-completion-audit.mjs",
    "--cloud-inventory-results",
    inventoryResults,
    "--markdown",
    markdown,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.requirements.map((item) => [item.id, item]))
  const cloudInventory = byId.get("G03_CLOUD_INVENTORY_PROVED")
  const evidence = cloudInventory.evidence.join("; ")
  const markdownOutput = fs.readFileSync(markdown, "utf8")

  assert.equal(cloudInventory.status, "blocked")
  assert.match(evidence, /safeConsoleOnly=true/)
  assert.match(evidence, /consoleObservationOperations=7\/7/)
  assert.match(evidence, /executedCommandResults=0\/7/)
  assert.match(evidence, /cloudApiCalledCommandResults=0/)
  assert.match(evidence, /mutationPerformedCommandResults=0/)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.safeConsoleOnly, true)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.consoleObservationOperations, 7)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.executedCommandResults, 0)
  assert.equal(report.summary.cloudInventoryResults.observationSummary.cloudApiCalledCommandResults, 0)
  assert.match(markdownOutput, /Cloud inventory console-only: safe true, console observations 7\/7, executed commands 0\/7, cloud API calls 0/)
  assert.match(markdownOutput, /safeConsoleOnly=true/)
  assert.doesNotMatch(output + markdownOutput, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdownOutput, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdownOutput, /:\/\/[^\s:@]+:[^\s@]+@/)
})
