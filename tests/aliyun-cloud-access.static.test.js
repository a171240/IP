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
