const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun cloud access supports non-secret Cloud Shell observations", () => {
  const source = read("scripts", "check-aliyun-cloud-access.mjs")
  const template = readJson("deploy", "aliyun-production-cn.cloud-access.example.json")

  assert.match(source, /DEFAULT_CLOUD_ACCESS_OBSERVATION_FILE/)
  assert.match(source, /--cloud-access-observation/)
  assert.match(source, /cloudShellObservation/)
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
  const resourcesObserved = report.cloudShellObservation.browserConsole.resourcesObserved.join("\n")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudMutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.cloudShellObservation.exists, true)
  assert.equal(report.cloudShellObservation.browserConsole.chromeLoggedIn, true)
  assert.match(resourcesObserved, /ACR Enterprise Economic cn-hangzhou 1 month purchase page visible, CNY 117\.00, instance name meiye-huajing, not purchased/)
  assert.match(resourcesObserved, /SAE console accessible; target app not proven created/)
  assert.match(resourcesObserved, /OSS bucket meiye-huajing-service-records-production-cn overview visible in oss-cn-hangzhou/)
  assert.match(resourcesObserved, /DNS ipgongchang\.xin visible; no explicit api-cn\/assets-cn records shown/)
  assert.match(resourcesObserved, /SLS logsearch URL visible for project meiye-huajing-app-prod-cn and logstore app-api/)
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
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
