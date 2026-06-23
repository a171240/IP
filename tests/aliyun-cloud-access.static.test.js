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

test("Aliyun cloud access supports non-secret Cloud Shell observations", () => {
  const source = read("scripts", "check-aliyun-cloud-access.mjs")
  const template = readJson("deploy", "aliyun-production-cn.cloud-access.example.json")

  assert.match(source, /DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE/)
  assert.match(source, /--cloud-access-observation/)
  assert.match(source, /cloudShellObservation/)
  assert.match(source, /configProbe/)
  assert.match(source, /cloudshell_cli_config_missing_or_unread/)
  assert.equal(template.schemaVersion, 1)
  assert.equal(template.environment, "production-cn")
  assert.equal(template.cloudShell.cloudApiCalled, false)
  assert.equal(template.cloudShell.cloudMutationPerformed, false)
})

test("Aliyun operator handoff exposes Cloud Shell inventory readiness", () => {
  const source = read("scripts", "generate-aliyun-operator-handoff.mjs")

  assert.match(source, /browserConsoleChromeLoggedIn/)
  assert.match(source, /cloudShellConnected/)
  assert.match(source, /cloudShellCanRunReadOnlyInventory/)
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
  assert.match(report.cloudShellObservation.blockers.join(","), /schemaVersion=1/)
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
  assert.ok([
    "aliyun_cli_profile_not_configured",
    "aliyun_cli_config_incomplete",
    "aliyun_cli_config_probe_failed",
  ].includes(report.cli.configProbe.failureCategory))
  assert.equal(report.cloudShellObservation.exists, true)
  assert.equal(report.cloudShellObservation.browserConsole.chromeLoggedIn, true)
  assert.match(resourcesObserved, /ACR Enterprise Economic cn-hangzhou 1 month purchase page visible, CNY 117\.00, instance name meiye-huajing, not purchased/)
  assert.match(resourcesObserved, /SAE console accessible; target app not proven created/)
  assert.match(resourcesObserved, /OSS bucket meiye-huajing-service-records-production-cn overview visible in oss-cn-hangzhou/)
  assert.match(resourcesObserved, /DNS ipgongchang\.xin visible; no explicit api-cn\/assets-cn records shown/)
  assert.match(resourcesObserved, /SLS logsearch URL visible for project meiye-huajing-app-prod-cn and logstore app-api/)
  assert.equal(report.observedResourceStatusSummary.total, 7)
  assert.equal(report.observedResourceStatusSummary.ready, 0)
  assert.equal(report.observedResourceStatusSummary.partial, 2)
  assert.equal(report.observedResourceStatusSummary.blocked, 5)
  assert.equal(report.observedResourceStatusSummary.observed, 7)
  assert.equal(statusById.get("saeRuntime").status, "not_created_or_not_confirmed")
  assert.equal(statusById.get("saeRuntime").readiness, "blocked")
  assert.equal(statusById.get("acrPurchase").status, "purchase_candidate_visible_not_purchased")
  assert.equal(statusById.get("domainDns").status, "domain_visible_records_missing")
  assert.equal(statusById.get("ossAudio").status, "bucket_visible_unconfirmed")
  assert.equal(statusById.get("ossAudio").readiness, "partial")
  assert.equal(statusById.get("slsAlerts").status, "project_logstore_visible_alerts_pending")
  assert.equal(statusById.get("cloudShellInventory").status, "cloudshell_disconnected_or_config_missing")
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
  assert.ok(report.blockers.includes("cloudshell_cli_config_missing_or_unread"))
  assert.ok(report.blockers.includes(report.cli.configProbe.failureCategory))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
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
