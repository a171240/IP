const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun CLI inventory runner is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:cloud:inventory-run"], "node ./scripts/run-aliyun-cli-inventory.mjs")
  assert.equal(pkg.scripts["aliyun:cloud:inventory-run:test"], "node --test tests/aliyun-cli-inventory-runner.static.test.js")
  assert.match(predeploy, /aliyun:cloud:inventory-run:test/)
  assert.match(predeploy, /aliyun:cloud:inventory-run/)
  assert.equal(deploySpec.cloudInventoryRunner.checkCommand, "corepack pnpm aliyun:cloud:inventory-run")
  assert.equal(deploySpec.cloudInventoryRunner.script, "scripts/run-aliyun-cli-inventory.mjs")
  assert.equal(deploySpec.cloudInventoryRunner.writesLocalFileOnlyWhenExplicit, true)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud:inventory-run:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:cloud:inventory-run"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:cloud:inventory-run"))
  assert.match(releaseArtifacts, /cloud-inventory-runner\.json/)
  assert.match(releaseArtifacts, /cloudInventoryRunner/)
  assert.match(releaseArtifacts, /failureCategories/)
  assert.match(releaseArtifacts, /diagnosticsNextActions/)
})

test("Aliyun CLI inventory runner dry-run does not call cloud APIs or write raw output", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-inventory-runner-dry-"))
  const localFile = path.join(tmpdir, "inventory.local.json")
  const output = execFileSync(process.execPath, [
    "scripts/run-aliyun-cli-inventory.mjs",
    "--write-local",
    localFile,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const local = JSON.parse(fs.readFileSync(localFile, "utf8"))

  assert.equal(report.ok, true)
  assert.equal(report.executionMode, "dry_run")
  assert.equal(report.executeReadonlyRequested, false)
  assert.equal(report.executeReadonlyAllowed, false)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.cloudMutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.operations, 7)
  assert.equal(report.summary.commands, 7)
  assert.equal(report.summary.executedCommands, 0)
  assert.equal(report.summary.dryRunCommands, 7)
  assert.deepEqual(report.summary.failureCategories, {})
  assert.deepEqual(report.executionDiagnostics.failedCommands, [])
  assert.equal(local.operations.length, 7)
  assert.ok(local.operations.every((operation) => operation.status === "skipped"))
  assert.ok(local.operations.every((operation) => operation.commandResults[0].executed === false))
  assert.ok(report.allowedCommandCatalog.some((item) => item.command.includes("aliyun sae ListApplications")))
  assert.ok(report.allowedCommandCatalog.some((item) => item.command.includes("aliyun oss stat")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("Default mode is dry_run")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun CLI inventory runner classifies missing CLI profile without storing raw stderr", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-inventory-runner-profile-missing-"))
  const fakeAliyun = path.join(tmpdir, "aliyun")
  fs.writeFileSync(fakeAliyun, [
    "#!/bin/sh",
    "echo 'ERROR: profile default is not configure yet, run `aliyun configure --profile default` first' >&2",
    "echo 'Configuration failed, use `aliyun configure` to configure it' >&2",
    "exit 3",
    "",
  ].join("\n"), { mode: 0o700 })

  const output = execFileSync(process.execPath, [
    "scripts/run-aliyun-cli-inventory.mjs",
    "--execute-readonly",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${tmpdir}:${process.env.PATH}`,
      MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY: "1",
    },
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.executionMode, "execute_readonly")
  assert.equal(report.executeReadonlyAllowed, true)
  assert.equal(report.summary.executedCommands, 7)
  assert.equal(report.summary.failedCommands, 7)
  assert.deepEqual(report.summary.failureCategories, {
    aliyun_cli_profile_not_configured: 7,
  })
  assert.equal(report.executionDiagnostics.failedCommands.length, 7)
  assert.ok(report.executionDiagnostics.failedCommands.every((item) =>
    item.failureCategory === "aliyun_cli_profile_not_configured" &&
    /Do not paste AccessKeySecret/.test(item.failureHint)
  ))
  assert.ok(report.executionDiagnostics.nextActions.some((item) =>
    item.includes("Configure Aliyun CLI default profile securely")
  ))
  assert.match(report.localResults.operations[0].commandResults[0].outputSummary, /failureCategory=aliyun_cli_profile_not_configured/)
  assert.doesNotMatch(output, /profile default is not configure yet/)
  assert.doesNotMatch(output, /Configuration failed/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun CLI inventory runner classifies incomplete CLI config without storing raw stderr", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-inventory-runner-config-incomplete-"))
  const fakeAliyun = path.join(tmpdir, "aliyun")
  fs.writeFileSync(fakeAliyun, [
    "#!/bin/sh",
    "echo \"ERROR: config failed: region can't be empty\" >&2",
    "exit 1",
    "",
  ].join("\n"), { mode: 0o700 })

  const output = execFileSync(process.execPath, [
    "scripts/run-aliyun-cli-inventory.mjs",
    "--execute-readonly",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${tmpdir}:${process.env.PATH}`,
      MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY: "1",
    },
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)

  assert.deepEqual(report.summary.failureCategories, {
    aliyun_cli_config_incomplete: 7,
  })
  assert.ok(report.executionDiagnostics.failedCommands.every((item) =>
    item.failureCategory === "aliyun_cli_config_incomplete" &&
    /including region/.test(item.failureHint)
  ))
  assert.ok(report.executionDiagnostics.nextActions.some((item) =>
    item.includes("Complete Aliyun CLI default profile configuration")
  ))
  assert.match(report.localResults.operations[0].commandResults[0].outputSummary, /failureCategory=aliyun_cli_config_incomplete/)
  assert.doesNotMatch(output, /config failed: region can't be empty/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
})

test("Aliyun CLI inventory runner refuses execution without explicit env gate", () => {
  const result = spawnSync(process.execPath, [
    "scripts/run-aliyun-cli-inventory.mjs",
    "--execute-readonly",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY: "",
    },
    maxBuffer: 1024 * 1024 * 10,
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr || result.stdout, /MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1/)
  assert.doesNotMatch(result.stderr || result.stdout, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(result.stderr || result.stdout, /LTAI[A-Za-z0-9]{12,}/)
})
