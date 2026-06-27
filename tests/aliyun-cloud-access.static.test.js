const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

function writeFakeAliyun(binaryPath, lines) {
  fs.writeFileSync(binaryPath, [
    "#!/bin/sh",
    ...lines,
    "",
  ].join("\n"), { mode: 0o700 })
}

function writeFakeExecutable(binaryPath, lines) {
  fs.writeFileSync(binaryPath, [
    "#!/bin/sh",
    ...lines,
    "",
  ].join("\n"), { mode: 0o700 })
}

test("Aliyun cloud access supports non-secret Cloud Shell observations", () => {
  const source = read("scripts", "check-aliyun-cloud-access.mjs")
  const template = readJson("deploy", "aliyun-production-cn.cloud-access.example.json")

  assert.match(source, /DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE/)
  assert.match(source, /--cloud-access-observation/)
  assert.match(source, /localBrowserProbe/)
  assert.match(source, /current_aliyun_console_browser_tab_not_observed/)
  assert.match(source, /sanitizeUrlHostPath/)
  assert.match(source, /cloudShellObservation/)
  assert.match(source, /workbenchTerminal/)
  assert.match(source, /workbench_terminal_api_called_without_inventory_context/)
  assert.match(source, /cloudshell_disconnected_restart_instance_confirmation_required/)
  assert.match(source, /requiresActionTimeRestartConfirmation/)
  assert.match(source, /configProbe/)
  assert.match(source, /cloudshell_cli_config_missing_or_unread/)
  assert.equal(template.schemaVersion, 1)
  assert.equal(template.environment, "production-cn")
  assert.equal(template.cloudShell.cloudApiCalled, false)
  assert.equal(template.cloudShell.cloudMutationPerformed, false)
  assert.equal(template.cloudShell.requiresActionTimeOpenConfirmation, false)
  assert.equal(template.cloudShell.requiresActionTimeRestartConfirmation, false)
  assert.equal(template.workbenchTerminal.cloudApiCalled, false)
  assert.equal(template.workbenchTerminal.cloudMutationPerformed, false)
  assert.ok(template.workbenchTerminal.blockers.includes("workbench_terminal_not_cloudshell_inventory"))
})

test("Aliyun operator handoff exposes Cloud Shell inventory readiness", () => {
  const source = read("scripts", "generate-aliyun-operator-handoff.mjs")

  assert.match(source, /browserConsoleChromeLoggedIn/)
  assert.match(source, /cloudShellConnected/)
  assert.match(source, /cloudShellCanRunReadOnlyInventory/)
  assert.match(source, /workbenchTerminalConnected/)
  assert.match(source, /workbenchTerminalReadiness/)
  assert.match(source, /cliConfigProbeFailureCategory/)
})

test("Aliyun cloud access does not mark invalid Cloud Shell observations ready", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-access-"))
  const observationFile = path.join(tmpdir, "cloud-access.local.json")
  fs.writeFileSync(
    observationFile,
    JSON.stringify(
      {
        schemaVersion: 999,
        environment: "production-cn",
        browserConsole: {},
        cloudShell: {
          connected: true,
          cliAvailable: true,
          cliConfigFileExists: true,
          canRunReadOnlyInventory: true,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
        },
        workbenchTerminal: {
          observed: true,
          connected: true,
          cliInventoryAttempted: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          blockers: ["workbench_terminal_not_cloudshell_inventory"],
        },
      },
      null,
      2,
    ),
  )

  const output = execFileSync(
    process.execPath,
    ["scripts/check-aliyun-cloud-access.mjs", "--cloud-access-observation", observationFile],
    { cwd: root, encoding: "utf8" },
  )
  const report = JSON.parse(output)
  assert.equal(report.cloudShellObservation.ready, false)
  assert.equal(report.cloudShellObservation.workbenchTerminal.connected, true)
  assert.equal(report.cloudShellObservation.workbenchTerminal.readiness, "connected_not_inventory_ready")
  assert.equal(report.terminalAccess.workbenchTerminal.connected, true)
  assert.match(report.cloudShellObservation.blockers.join(","), /schemaVersion=1/)
})

test("Aliyun cloud access classifies disconnected CloudShell restart confirmation", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-access-restart-"))
  const observationFile = path.join(tmpdir, "cloud-access.local.json")
  fs.writeFileSync(
    observationFile,
    JSON.stringify(
      {
        schemaVersion: 1,
        environment: "production-cn",
        browserConsole: {
          chromeLoggedIn: true,
          observedAt: "2026-06-26T01:20:00+08:00",
          evidence: "chrome_cloudshell_restart_dialog_visible_no_click_no_cloud_api_no_secret",
          resourcesObserved: [
            "CloudShell tab shows Disconnected; clicking reconnect opens 重启实例 confirmation saying current sessions will be terminated and a new session will be created; did not click 确认.",
          ],
        },
        cloudShell: {
          connected: false,
          cliAvailable: false,
          cliConfigFileExists: false,
          canRunReadOnlyInventory: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          requiresActionTimeRestartConfirmation: true,
          blockers: ["cloudshell_disconnected_restart_instance_confirmation_required"],
          evidence: "cloudshell_disconnected_restart_instance_confirmation_visible_no_confirm_no_inventory",
        },
        workbenchTerminal: {
          observed: false,
          connected: false,
          cliInventoryAttempted: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          blockers: ["workbench_terminal_not_cloudshell_inventory"],
        },
      },
      null,
      2,
    ),
  )

  const output = execFileSync(
    process.execPath,
    ["scripts/check-aliyun-cloud-access.mjs", "--cloud-access-observation", observationFile],
    { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 30 },
  )
  const report = JSON.parse(output)
  const cloudShellStatus = report.observedResourceStatuses.find((item) => item.id === "cloudShellInventory")

  assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeRestartConfirmation, true)
  assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeOpenConfirmation, false)
  assert.deepEqual(report.cloudShellObservation.cloudShell.confirmationKinds, ["restart_instance"])
  assert.ok(report.cloudShellObservation.cloudShell.blockers.includes("cloudshell_disconnected_restart_instance_confirmation_required"))
  assert.match(report.cloudShellObservation.cloudShell.restartWarning, /terminate current sessions/)
  assert.equal(cloudShellStatus.status, "cloudshell_disconnected_restart_confirmation_required")
  assert.equal(cloudShellStatus.readiness, "blocked")
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
})

test("Aliyun cloud access classifies connecting CloudShell without open or restart confirmation", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-access-connecting-"))
  const observationFile = path.join(tmpdir, "cloud-access.local.json")
  fs.writeFileSync(
    observationFile,
    JSON.stringify(
      {
        schemaVersion: 1,
        environment: "production-cn",
        browserConsole: {
          chromeLoggedIn: true,
          observedAt: "2026-06-26T09:10:00+08:00",
          evidence: "chrome_cloudshell_connecting_terminal_input_visible_no_command_no_secret",
          resourcesObserved: [
            "CloudShell tab shows 正在连接 Cloud Shell.; Terminal input visible; no command prompt observed; no allowlisted inventory command executed.",
          ],
        },
        cloudShell: {
          connected: false,
          connecting: true,
          terminalInputVisible: true,
          cliAvailable: false,
          cliConfigFileExists: false,
          canRunReadOnlyInventory: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          blockers: ["cloudshell_connecting_terminal_input_visible_inventory_not_executed"],
          evidence: "cloudshell_connecting_terminal_input_visible_no_inventory_no_confirm_no_mutation",
        },
        workbenchTerminal: {
          observed: false,
          connected: false,
          cliInventoryAttempted: false,
          cloudApiCalled: false,
          cloudMutationPerformed: false,
          blockers: ["workbench_terminal_not_cloudshell_inventory"],
        },
      },
      null,
      2,
    ),
  )

  const output = execFileSync(
    process.execPath,
    ["scripts/check-aliyun-cloud-access.mjs", "--cloud-access-observation", observationFile],
    { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 * 30 },
  )
  const report = JSON.parse(output)
  const cloudShellStatus = report.observedResourceStatuses.find((item) => item.id === "cloudShellInventory")

  assert.equal(report.cloudShellObservation.cloudShell.connecting, true)
  assert.equal(report.cloudShellObservation.cloudShell.terminalInputVisible, true)
  assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeOpenConfirmation, false)
  assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeRestartConfirmation, false)
  assert.deepEqual(report.cloudShellObservation.cloudShell.confirmationKinds, [])
  assert.ok(report.cloudShellObservation.cloudShell.blockers.includes("cloudshell_connecting_terminal_input_visible_inventory_not_executed"))
  assert.equal(cloudShellStatus.status, "cloudshell_connecting_inventory_not_executed")
  assert.equal(cloudShellStatus.readiness, "blocked")
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
})

test("Aliyun cloud access report preserves current non-secret console evidence", () => {
  const output = execFileSync(process.execPath, ["scripts/check-aliyun-cloud-access.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const checklistIds = report.consoleEvidenceChecklist.map((item) => item.id)
  const statusById = new Map(report.observedResourceStatuses.map((item) => [item.id, item]))
  const resourcesObserved = report.cloudShellObservation.browserConsole.resourcesObserved.join("\n")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudMutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.cli.configProbe.cloudApiCalled, false)
  assert.equal(report.cli.configProbe.mutationPerformed, false)
  assert.equal(report.localBrowserProbe.checked, true)
  assert.equal(report.localBrowserProbe.cloudApiCalled, false)
  assert.equal(report.localBrowserProbe.cloudMutationPerformed, false)
  assert.equal(typeof report.localBrowserProbe.canUseCurrentConsole, "boolean")
  assert.equal(typeof report.localBrowserProbe.aliyunConsoleTabCount, "number")
  assert.ok(Array.isArray(report.localBrowserProbe.aliyunConsoleTabs))
  assert.ok(report.localBrowserProbe.note.includes("does not read cookies"))
  assert.ok([
    "aliyun_cli_profile_not_configured",
    "aliyun_cli_config_incomplete",
    "aliyun_cli_config_probe_failed",
  ].includes(report.cli.configProbe.failureCategory))
  assert.equal(report.cloudShellObservation.exists, true)
  assert.equal(report.cloudShellObservation.browserConsole.chromeLoggedIn, true)
  assert.equal(typeof report.cloudShellObservation.workbenchTerminal.connected, "boolean")
  assert.equal(report.terminalAccess.inventoryReady, false)
  assert.equal(report.terminalAccess.workbenchTerminal.cloudMutationPerformed, false)
  assert.equal(report.terminalAccess.workbenchTerminal.cloudApiCalled, false)
  assert.match(resourcesObserved, /ACR cn-hangzhou enterprise instance meiye-huajing-app-api visible|ACR .*image push.*runtime image pull remain pending/)
  assert.match(resourcesObserved, /SAE console accessible; target app not proven created|SAE cn-hangzhou (app list|overview) visible; .*target app meiye-huajing-app-api-production-cn not present/)
  assert.match(resourcesObserved, /OSS bucket meiye-huajing-service-records-production-cn overview visible in oss-cn-hangzhou/)
  assert.match(resourcesObserved, /DNS ipgongchang\.xin visible; no explicit api-cn\/assets-cn records shown|DNS ipgongchang\.xin authoritative records visible; .*built-in host record search for api-cn and assets-cn returns 没有数据/)
  assert.match(resourcesObserved, /SLS logsearch URL visible for project meiye-huajing-app-prod-cn and logstore app-api/)
  assert.equal(report.observedResourceStatusSummary.total, 7)
  assert.equal(report.observedResourceStatusSummary.ready, 0)
  assert.equal(report.observedResourceStatusSummary.partial, 3)
  assert.equal(report.observedResourceStatusSummary.blocked, 4)
  assert.equal(report.observedResourceStatusSummary.observed, 7)
  assert.equal(statusById.get("saeRuntime").status, "not_created_or_not_confirmed")
  assert.equal(statusById.get("saeRuntime").readiness, "blocked")
  assert.equal(statusById.get("acrPurchase").status, "acr_repository_confirmed_image_push_pending")
  assert.equal(statusById.get("acrPurchase").readiness, "partial")
  assert.match(statusById.get("acrPurchase").nextAction, /进入 P04/)
  assert.equal(statusById.get("domainDns").status, "domain_visible_records_missing")
  assert.equal(statusById.get("ossAudio").status, "bucket_visible_unconfirmed")
  assert.equal(statusById.get("ossAudio").readiness, "partial")
  assert.equal(statusById.get("slsAlerts").status, "project_logstore_visible_alerts_pending")
  assert.ok([
    "cloudshell_disconnected_restart_confirmation_required",
    "cloudshell_not_opened_nas_fee_confirmation_required",
    "cloudshell_connecting_inventory_not_executed",
    "cloudshell_disconnected_or_config_missing",
  ].includes(statusById.get("cloudShellInventory").status))
  assert.match(statusById.get("domainDns").writeTarget, /apiDomainHttps/)
  assert.deepEqual(checklistIds, [
    "saeRuntime",
    "acrImage",
    "apiDomain",
    "assetDomain",
    "ossAudio",
    "envImport",
    "slsAlerts",
  ])
  assert.ok(report.blockers.includes("aliyun_cli_config_missing_or_unread"))
  const cloudShellBlockers = report.cloudShellObservation.cloudShell.blockers
  const hasNasOpenConfirmation = cloudShellBlockers.includes("cloudshell_not_opened_action_time_confirmation_required_for_nas_fee_warning")
  const hasRestartConfirmation = cloudShellBlockers.includes("cloudshell_disconnected_restart_instance_confirmation_required")
  const hasConnecting = cloudShellBlockers.includes("cloudshell_connecting_terminal_input_visible_inventory_not_executed")
  assert.ok(hasNasOpenConfirmation || hasRestartConfirmation || hasConnecting)
  if (hasNasOpenConfirmation) {
    assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeOpenConfirmation, true)
    assert.match(report.cloudShellObservation.cloudShell.evidence, /performance_nas_may_generate_small_usage_fees|NAS|开通/)
  }
  if (hasRestartConfirmation) {
    assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeRestartConfirmation, true)
    assert.match(report.cloudShellObservation.cloudShell.evidence, /restart_instance|Disconnected|重启实例|disconnected_reconnect_confirmation_visible/)
  }
  if (hasConnecting) {
    assert.equal(report.cloudShellObservation.cloudShell.connecting, true)
    assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeOpenConfirmation, false)
    assert.equal(report.cloudShellObservation.cloudShell.requiresActionTimeRestartConfirmation, false)
    assert.match(report.cloudShellObservation.cloudShell.evidence, /connecting|正在连接|terminal_input_visible/)
  }
  assert.ok(report.blockers.includes(report.cli.configProbe.failureCategory))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun cloud access current browser probe records only sanitized Aliyun host paths", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-access-browser-probe-"))
  writeFakeExecutable(path.join(tmpdir, "pgrep"), ["exit 0"])
  writeFakeExecutable(path.join(tmpdir, "osascript"), [
    "printf '%s\\n' '{\"title\":\"阿里云 SAE token tab\",\"url\":\"https://sae.console.aliyun.com/cn-hangzhou/applications?token=SHOULD_NOT_APPEAR#secret\"}'",
    "printf '%s\\n' '{\"title\":\"Other\",\"url\":\"about:blank\"}'",
  ])
  const output = execFileSync(process.execPath, ["scripts/check-aliyun-cloud-access.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${tmpdir}:${process.env.PATH}`,
      HOME: tmpdir,
    },
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)

  assert.equal(report.localBrowserProbe.checked, true)
  assert.equal(report.localBrowserProbe.running, true)
  assert.equal(report.localBrowserProbe.canUseCurrentConsole, true)
  assert.equal(report.localBrowserProbe.aliyunConsoleTabCount, 1)
  assert.equal(report.localBrowserProbe.aliyunConsoleTabs[0].hostPath, "sae.console.aliyun.com/cn-hangzhou/applications")
  assert.doesNotMatch(output, /SHOULD_NOT_APPEAR/)
  assert.doesNotMatch(output, /token=/)
  assert.doesNotMatch(output, /#secret/)
})

test("Aliyun cloud access classifies local CLI profile probe without storing raw output", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-cloud-access-fake-cli-"))
  const fakeAliyun = path.join(tmpdir, "aliyun")
  writeFakeAliyun(fakeAliyun, [
    "if [ \"$1\" = 'version' ]; then echo '3.3.23'; exit 0; fi",
    "if [ \"$1\" = 'configure' ] && [ \"$2\" = 'list' ]; then",
    "  echo 'ERROR: load configure failed: stat /tmp/.aliyun/config.json: no such file or directory' >&2",
    "  echo 'Configuration failed, use `aliyun configure` to configure it' >&2",
    "  exit 3",
    "fi",
    "exit 0",
  ])
  const output = execFileSync(process.execPath, ["scripts/check-aliyun-cloud-access.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${tmpdir}:${process.env.PATH}`,
      HOME: tmpdir,
    },
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)

  assert.equal(report.cli.available, true)
  assert.equal(report.cli.configProbe.executed, true)
  assert.equal(report.cli.configProbe.ready, false)
  assert.equal(report.cli.configProbe.cloudApiCalled, false)
  assert.equal(report.cli.configProbe.failureCategory, "aliyun_cli_profile_not_configured")
  assert.ok(report.blockers.includes("aliyun_cli_profile_not_configured"))
  assert.ok(report.nextActions.some((item) => /default profile/.test(item)))
  assert.doesNotMatch(output, /load configure failed/)
  assert.doesNotMatch(output, /Configuration failed/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
})
