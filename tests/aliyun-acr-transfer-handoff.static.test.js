const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const fixtureImagePublish = path.join(
  "tests",
  "fixtures",
  "aliyun-user-action-brief",
  "image-publish.fixture.json",
)
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|docker login .* -p\s+\S{8,}|AccessKeySecret\s*[:=]\s*\S{8,}|registry[_ -]?password\s*[:=]\s*\S{8,})/i

function runHandoff(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-acr-image-transfer-handoff.mjs",
    "--local",
    fixtureImagePublish,
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

test("Aliyun ACR transfer handoff stays local and fixture-driven", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts", "generate-aliyun-acr-image-transfer-handoff.mjs"),
    "utf8",
  )

  assert.match(source, /--local/)
  assert.match(source, /check-aliyun-image-publish-plan\.mjs/)
  assert.match(source, /cloudApiCalledByThisCommand: false/)
  assert.match(source, /dockerPushPerformedByThisCommand: false/)
  assert.match(source, /P04_ACR_IMAGE_AND_PULL/)
  assert.doesNotMatch(source, /from "node:child_process"|spawnSync|execFileSync/)
  assert.doesNotMatch(source, /cloudApiCalledByThisCommand: true|dockerPushPerformedByThisCommand: true/)
})

test("Aliyun ACR transfer handoff reports blocked fixture state without secret values", () => {
  const { output, report } = runHandoff()

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.authorizationPacket, "P04_ACR_IMAGE_AND_PULL")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.dockerPushPerformedByThisCommand, false)
  assert.equal(report.canStartAfterActionTimeConfirmation, true)
  assert.equal(report.currentStatus.p04StrictReady, false)
  assert.equal(report.currentStatus.purchaseAndRepositoryReady, true)
  assert.equal(report.currentStatus.selectedTransferPathReady, false)
  assert.equal(report.currentStatus.imagePushAndDigestReady, false)
  assert.equal(report.currentStatus.saeRuntimeImagePullReady, false)
  assert.equal(report.currentStatus.publicNetworkEntranceEnabled, false)
  assert.ok(report.currentStatus.nextOperatorDecision)
  assert.equal(report.transferDecision.required, true)
  assert.ok(!report.transferDecision.recommendedTransferPathIds.includes("public_registry"))
  assert.deepEqual(report.transferDecision.forbiddenTransferPathIds, ["public_registry"])
  assert.deepEqual(report.transferDecision.mustNotUseNow, ["public_registry"])
  assert.equal(report.transferDecision.forbiddenTransferPaths.length, 1)
  assert.ok(report.operatorSteps.some((item) => item.includes("Confirm P04") || item.includes("No image transfer path")))
  assert.ok(!report.operatorSteps.some((item) => item.includes("already strict-ready")))
  assert.equal(report.writebackTargets.file, "deploy/aliyun-production-cn.image-publish.local.json")
  assert.ok(report.writebackTargets.fields.includes("runtime.confirmed=true"))
  assert.ok(report.writebackTargets.fields.includes("runtime.remoteImageConfigured=true"))
  assert.ok(report.writebackTargets.fields.includes("runtime.imagePullConfigured=true"))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:image:plan:strict"))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.deepEqual(report.upstreamImagePlan.requiredAuthorizationPackets, [
    "P04_ACR_IMAGE_AND_PULL",
    "P08_SAE_RUNTIME_SLS",
  ])
  assert.ok(report.upstreamImagePlan.localBlockers.includes("acr.imagePushed"))
  assert.ok(report.upstreamImagePlan.localBlockers.includes("runtime.imagePullConfigured"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("does not call Aliyun APIs")))
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun ACR transfer handoff can write optional non-secret JSON and Markdown", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-acr-handoff-"))
  const jsonPath = path.join(tmpDir, "handoff.json")
  const markdownPath = path.join(tmpDir, "handoff.md")
  const { output, report } = runHandoff(["--out", jsonPath, "--markdown", markdownPath])
  const writtenJson = readJsonFromPath(jsonPath)
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(writtenJson.packageId, report.packageId)
  assert.match(markdown, /# P04 ACR Image Transfer Handoff/)
  assert.match(markdown, /Next operator decision: [a-z0-9_]+/)
  assert.match(markdown, /Forbidden Now[\s\S]*public_registry/)
  assert.match(markdown, /corepack pnpm aliyun:image:plan:strict/)
  assert.doesNotMatch(output + JSON.stringify(writtenJson) + markdown, secretLike)
})

function readJsonFromPath(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}
