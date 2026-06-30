const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const fixtureRoot = path.join(root, "tests", "fixtures", "aliyun-user-action-brief")
const fixturePaths = {
  env: path.join(fixtureRoot, "env.production-cn.fixture"),
  cloudConfirmations: path.join(fixtureRoot, "cloud-confirmations.fixture.json"),
  cloudInventoryResults: path.join(fixtureRoot, "cloud-inventory-results.fixture.json"),
  imagePublish: path.join(fixtureRoot, "image-publish.fixture.json"),
  rdsMigration: path.join(fixtureRoot, "rds-migration.fixture.json"),
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(text, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

function checklistArgs(extra = []) {
  return [
    "scripts/generate-aliyun-evidence-writeback-checklist.mjs",
    "--backend-only",
    "--skip-vercel-env-coverage",
    "--env-file",
    fixturePaths.env,
    "--cloud-confirmations",
    fixturePaths.cloudConfirmations,
    "--cloud-inventory-results",
    fixturePaths.cloudInventoryResults,
    "--rds-migration",
    fixturePaths.rdsMigration,
    "--image-publish",
    fixturePaths.imagePublish,
    "--child-timeout-ms",
    "10000",
    ...extra,
  ]
}

function runChecklist(extra = []) {
  const output = execFileSync(process.execPath, checklistArgs(extra), {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  assertNoSecretLikeValues(output)
  return {
    output,
    report: JSON.parse(output),
  }
}

test("Aliyun evidence writeback accepts explicit fixture inputs for every local evidence child", () => {
  const script = fs.readFileSync(
    path.join(root, "scripts", "generate-aliyun-evidence-writeback-checklist.mjs"),
    "utf8",
  )

  assert.match(script, /DEFAULT_CHILD_TIMEOUT_MS = 120_000/)
  assert.match(script, /--child-timeout-ms/)
  assert.match(script, /timeout: args\.childTimeoutMs/)
  assert.match(script, /fail_closed_no_cloud_mutation/)
  assert.match(script, /--image-publish/)
  assert.match(script, /imagePublishFile/)
  assert.match(script, /scripts\/check-aliyun-image-publish-plan\.mjs/)
  assert.match(script, /--skip-docker-probe/)
})

test("Aliyun evidence writeback backend-only mode is fixture-first and value-free", () => {
  const { output, report } = runChecklist()
  const cloudConfirmationPaths = report.writebackGroups.cloudConfirmations.gaps.map((item) => item.jsonPath)

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.executionMode, "writeback_checklist_only")
  assert.equal(report.childCommands.timeoutMs, 10000)
  assert.equal(report.summary.files, 4)
  assert.equal(report.writebackGroups.cloudInventoryResults.ready, true)
  assert.equal(report.summary.cloudInventoryResultGaps, 0)
  assert.equal(report.summary.rdsMigrationGaps, report.writebackGroups.rdsMigration.gaps.length)
  assert.equal(report.summary.cloudConfirmationGaps, report.writebackGroups.cloudConfirmations.gaps.length)
  assert.equal(report.summary.imagePublishGaps, report.writebackGroups.imagePublish.gaps.length)
  assert.ok(report.summary.rdsMigrationGaps > 0)
  assert.ok(report.summary.cloudConfirmationGaps > 0)
  assert.ok(report.summary.imagePublishGaps > 0)
  assert.ok(!cloudConfirmationPaths.some((item) => item.includes("wechatOpenPlatform")))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(report.summary.requiredAuthorizationPackets.includes("P08_SAE_RUNTIME_SLS"))
  assert.ok(!report.summary.requiredAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.files.envFile.endsWith("env.production-cn.fixture"))
  assert.ok(report.files.cloudConfirmationsFile.endsWith("cloud-confirmations.fixture.json"))
  assert.ok(report.files.cloudInventoryResultsFile.endsWith("cloud-inventory-results.fixture.json"))
  assert.ok(report.files.rdsMigrationFile.endsWith("rds-migration.fixture.json"))
  assert.ok(report.files.imagePublishLocalFile.endsWith("image-publish.fixture.json"))
  assert.doesNotMatch(output, /\/private\/\.env\.production-cn\.local/)
})

test("Aliyun evidence writeback markdown renders the same fixture-backed summary", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-evidence-writeback-fixture-"))
  const markdown = path.join(tmpdir, "evidence-writeback.md")
  const json = path.join(tmpdir, "evidence-writeback.json")
  const { report } = runChecklist(["--out", json, "--markdown", markdown])
  const persisted = JSON.parse(fs.readFileSync(json, "utf8"))
  const markdownOutput = fs.readFileSync(markdown, "utf8")

  assert.deepEqual(persisted.summary, report.summary)
  assert.match(markdownOutput, /阿里云证据回填清单/)
  assert.match(markdownOutput, /currentScope: backend_aliyun_only/)
  assert.match(markdownOutput, new RegExp(`totalGaps: ${report.summary.totalGaps}`))
  assert.match(markdownOutput, new RegExp(`rdsMigrationGaps: ${report.summary.rdsMigrationGaps}`))
  assert.match(markdownOutput, new RegExp(`cloudInventoryResultGaps: ${report.summary.cloudInventoryResultGaps}`))
  assert.match(markdownOutput, new RegExp(`cloudConfirmationGaps: ${report.summary.cloudConfirmationGaps}`))
  assert.match(markdownOutput, new RegExp(`imagePublishGaps: ${report.summary.imagePublishGaps}`))
  assert.match(markdownOutput, /Strict 验证顺序/)
  assert.match(markdownOutput, /不会调用阿里云 API/)
  assert.match(markdownOutput, /不会 push 镜像/)
  assert.doesNotMatch(markdownOutput, /P01_WECHAT_OPEN_MOBILE_APP/)
  assertNoSecretLikeValues(markdownOutput)
})

test("Aliyun evidence writeback cloud inventory fixture is tracked and non-secret", () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePaths.cloudInventoryResults, "utf8"))

  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.environment, "production-cn")
  assert.equal(fixture.sourcePlanCommand, "corepack pnpm aliyun:cloud:inventory-plan")
  assert.equal(fixture.operations.length, 9)
  for (const operation of fixture.operations) {
    assert.equal(operation.readOnly, true)
    assert.equal(operation.status, "observed")
    assert.ok(operation.evidence.startsWith("fixture_"))
    assert.ok(operation.commandResults.length > 0)
    for (const result of operation.commandResults) {
      assert.equal(result.executed, true)
      assert.equal(result.exitStatus, 0)
      assert.equal(result.cloudApiCalled, true)
      assert.equal(result.mutationPerformed, false)
      assert.match(result.evidence, /^fixture_/)
    }
  }
  assertNoSecretLikeValues(JSON.stringify(fixture))
})
