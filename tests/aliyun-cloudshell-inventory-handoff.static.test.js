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
  const source = read("scripts", "generate-aliyun-cloudshell-inventory-handoff.mjs")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const readonlyInventoryDoc = read("docs", "aliyun-cloudshell-readonly-inventory-2026-06-24.md")

  assert.equal(pkg.scripts["aliyun:cloudshell:handoff"], "node ./scripts/generate-aliyun-cloudshell-inventory-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:cloudshell:handoff:test"], "node --test tests/aliyun-cloudshell-inventory-handoff.static.test.js")
  assert.match(source, /--cloud-access-observation/)
  assert.match(source, /requiresActionTimeRestartConfirmation/)
  assert.match(source, /disconnected_restart_instance_confirmation_required/)
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
  assert.match(readonlyInventoryDoc, /历史口径说明/)
  assert.match(readonlyInventoryDoc, /APP 国内正式版全部迁到阿里云/)
  assert.match(readonlyInventoryDoc, /DATABASE_URL_CN/)
  assert.doesNotMatch(readonlyInventoryDoc, /数据层暂时沿用现有 Supabase/)
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
  assert.equal(typeof report.cloudShellGate.requiresActionTimeOpenConfirmation, "boolean")
  assert.equal(typeof report.cloudShellGate.requiresActionTimeRestartConfirmation, "boolean")
  assert.equal(typeof report.cloudShellGate.requiresActionTimeConfirmation, "boolean")
  assert.ok(Array.isArray(report.cloudShellGate.confirmationKinds))
  assert.equal(typeof report.cloudShellGate.currentStatus, "string")
  assert.ok(Array.isArray(report.cloudShellGate.blockers))
  assert.equal(typeof report.cloudShellGate.evidence, "string")
  assert.equal(typeof report.cloudShellGate.billingWarning, "string")
  assert.equal(typeof report.cloudShellGate.restartWarning, "string")
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
  assert.ok(report.writebackTargets.includes("deploy/aliyun-production-cn.cloud-inventory-results.local.json"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:access"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.match(markdown, /CloudShell\/CLI 只读盘点交接包/)
  assert.match(markdown, /strictInventoryAlreadyReady: true/)
  assert.match(markdown, /strictInventoryReadyLocalOperations: 9\/9/)
  assert.match(markdown, /strictInventoryMutationPerformedCommandResults: 0/)
  assert.match(markdown, /currentBrowserCanUseCurrentConsole:/)
  assert.match(markdown, /cloudShellRequiresActionTimeConfirmation:/)
  assert.match(markdown, /cloudShellRequiresActionTimeOpenConfirmation:/)
  assert.match(markdown, /cloudShellRequiresActionTimeRestartConfirmation:/)
  assert.match(markdown, /cloudShellConfirmationKinds:/)
  assert.match(markdown, /cloudShellCurrentStatus:/)
  assert.match(markdown, /已有 strict inventory 证据/)
  assert.match(markdown, /I01_SAE_RUNTIME/)
  assert.match(markdown, /items\.apiDomainHttps/)
  assert.match(markdown, /items\.assetDomainHttps/)
  assert.match(markdown, /items\.oss/)
  assert.match(markdown, /Strict 验证顺序/)
  assert.equal(report.operations.flatMap((item) => item.writeTargets).some((item) => /items\.(apiDomain|assetDomain|ossAudio)\b/.test(item)), false)
  assert.doesNotMatch(markdown, /items\.(apiDomain|assetDomain|ossAudio)\b/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})

test("Aliyun CloudShell handoff preserves activation and NAS fee warning", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-handoff-nas-"))
  const observationPath = path.join(tmpdir, "cloud-access.local.json")
  writeCloudAccessObservationFixture(observationPath, {
    resourcesObserved: [
      "Cloud Shell tab page currently requires 开通 and states it will create a performance NAS instance that may generate small NAS usage fees; did not click 开通.",
    ],
    cloudShell: {
      blockers: ["cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning"],
      evidence: "chrome_cloudshell_tab_page_requires_open_service_and_warns_performance_nas_may_generate_small_usage_fees_no_open_no_inventory",
    },
  })
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-inventory-handoff.mjs",
    "--cloud-access-observation",
    observationPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const cloudShellPath = report.operatorPaths.find((item) => item.id === "aliyun_cloudshell")

  assert.ok(cloudShellPath, "missing aliyun_cloudshell operator path")
  assert.equal(report.cloudShellGate.requiresActionTimeConfirmation, true)
  assert.equal(report.cloudShellGate.requiresActionTimeOpenConfirmation, true)
  assert.equal(report.cloudShellGate.requiresActionTimeRestartConfirmation, false)
  assert.equal(report.cloudShellGate.currentStatus, "not_opened_nas_fee_confirmation_required")
  assert.deepEqual(report.cloudShellGate.confirmationKinds, ["open_service_nas_fee"])
  assert.ok(report.cloudShellGate.blockers.includes("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning"))
  assert.match(report.cloudShellGate.billingWarning, /performance NAS/)
  assert.match(report.cloudShellGate.billingWarning, /usage fees/)
  assert.equal(report.cloudShellGate.restartWarning, "")
  assert.equal(cloudShellPath.requiresActionTimeConfirmation, true)
  assert.equal(cloudShellPath.requiresActionTimeOpenConfirmation, true)
  assert.equal(cloudShellPath.requiresActionTimeRestartConfirmation, false)
  assert.match(cloudShellPath.billingWarning, /performance NAS/)
  assert.ok(cloudShellPath.allowedActions.some((item) => item.includes("性能型 NAS")))
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun CloudShell handoff preserves disconnected restart confirmation", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloudshell-handoff-restart-"))
  const observationPath = path.join(tmpdir, "cloud-access.local.json")
  writeCloudAccessObservationFixture(observationPath, {
    resourcesObserved: [
      "CloudShell tab shows Disconnected; clicking reconnect opens 重启实例 confirmation saying current sessions will be terminated and a new session will be created; did not click 确认.",
    ],
    cloudShell: {
      requiresActionTimeRestartConfirmation: true,
      blockers: ["cloudshell_disconnected_restart_instance_confirmation_required"],
      evidence: "cloudshell_disconnected_restart_instance_confirmation_visible_no_confirm_no_inventory",
    },
  })
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-cloudshell-inventory-handoff.mjs",
    "--cloud-access-observation",
    observationPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const cloudShellPath = report.operatorPaths.find((item) => item.id === "aliyun_cloudshell")

  assert.ok(cloudShellPath, "missing aliyun_cloudshell operator path")
  assert.equal(report.cloudShellGate.requiresActionTimeConfirmation, true)
  assert.equal(report.cloudShellGate.requiresActionTimeOpenConfirmation, false)
  assert.equal(report.cloudShellGate.requiresActionTimeRestartConfirmation, true)
  assert.equal(report.cloudShellGate.currentStatus, "disconnected_restart_instance_confirmation_required")
  assert.deepEqual(report.cloudShellGate.confirmationKinds, ["restart_instance"])
  assert.ok(report.cloudShellGate.blockers.includes("cloudshell_disconnected_restart_instance_confirmation_required"))
  assert.match(report.cloudShellGate.restartWarning, /terminate current sessions/)
  assert.equal(report.cloudShellGate.billingWarning, "")
  assert.equal(cloudShellPath.requiresActionTimeConfirmation, true)
  assert.equal(cloudShellPath.requiresActionTimeOpenConfirmation, false)
  assert.equal(cloudShellPath.requiresActionTimeRestartConfirmation, true)
  assert.match(cloudShellPath.restartWarning, /terminate current sessions/)
  assert.ok(cloudShellPath.allowedActions.some((item) => item.includes("重启实例")))
  assert.doesNotMatch(output, secretLike)
})

function findOperation(report, id) {
  const operation = report.operations.find((item) => item.id === id)
  assert.ok(operation, `missing operation ${id}`)
  return operation
}

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

function writeCloudAccessObservationFixture(filePath, options = {}) {
  const cloudShell = options.cloudShell || {}
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        environment: "production-cn",
        updatedAt: "2026-06-26T01:20:00+08:00",
        operator: "codex-test-non-secret",
        notes: "synthetic non-secret CloudShell observation fixture",
        browserConsole: {
          chromeLoggedIn: true,
          observedAt: "2026-06-26T01:20:00+08:00",
          evidence: "chrome_cloudshell_non_secret_fixture",
          resourcesObserved: options.resourcesObserved || [],
        },
        cloudShell: {
          connected: false,
          regionLabel: "",
          cliAvailable: false,
          cliVersion: "",
          cliConfigFileExists: false,
          canRunReadOnlyInventory: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          lastReadOnlyCommand: "",
          requiresActionTimeOpenConfirmation: cloudShell.requiresActionTimeOpenConfirmation === true,
          requiresActionTimeRestartConfirmation: cloudShell.requiresActionTimeRestartConfirmation === true,
          blockers: cloudShell.blockers || [],
          evidence: cloudShell.evidence || "",
        },
        workbenchTerminal: {
          observed: false,
          connected: false,
          cliInventoryAttempted: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          evidence: "",
          blockers: ["workbench_terminal_not_cloudshell_inventory"],
        },
      },
      null,
      2,
    ),
  )
}
