const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const fixtureDir = path.join(root, "tests", "fixtures", "aliyun-user-action-brief")
const cloudConfirmationsFixture = path.join(fixtureDir, "cloud-confirmations.fixture.json")
const imagePublishFixture = path.join(fixtureDir, "image-publish.fixture.json")
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|docker login .* -p\s+\S{8,}|AccessKeySecret\s*[:=]\s*\S{8,}|registry[_ -]?password\s*[:=]\s*\S{8,})/i

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

function runHandoff(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-sae-runtime-sls-handoff.mjs",
    "--cloud-confirmations",
    cloudConfirmationsFixture,
    "--image-publish",
    imagePublishFixture,
    ...args,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

test("Aliyun SAE runtime/SLS handoff command exposes fixture-safe inputs", () => {
  const script = read("scripts", "generate-aliyun-sae-runtime-sls-handoff.mjs")
  const help = execFileSync(process.execPath, [
    "scripts/generate-aliyun-sae-runtime-sls-handoff.mjs",
    "--help",
  ], {
    cwd: root,
    encoding: "utf8",
  })

  assert.match(script, /--cloud-confirmations/)
  assert.match(script, /--image-publish/)
  assert.match(script, /check-aliyun-cloud-confirmations\.mjs/)
  assert.match(script, /check-aliyun-image-publish-plan\.mjs/)
  assert.match(help, /--cloud-confirmations path/)
  assert.match(help, /--image-publish path/)
  assert.doesNotMatch(help, secretLike)
})

test("Aliyun SAE runtime/SLS handoff reports P08 dependencies without cloud writes or secret values", () => {
  const { output, report } = runHandoff()

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.authorizationPacket, "P08_SAE_RUNTIME_SLS")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.deploymentPerformedByThisCommand, false)
  assert.equal(report.browserInteraction.foregroundBrowserInteraction, false)
  assert.equal(report.browserInteraction.pageSwitchAllowedByThisCommand, false)
  assert.equal(report.target.provider, "SAE")
  assert.equal(report.target.region, "cn-hangzhou")
  assert.equal(report.target.appName, "meiye-huajing-app-api-production-cn")
  assert.equal(report.target.runtime, "custom-container")
  assert.equal(report.target.containerPort, 3000)
  assert.equal(report.target.healthPath, "/api/healthz")
  assert.equal(report.target.slsProject, "meiye-huajing-app-prod-cn")
  assert.equal(report.target.slsLogstore, "app-api")
  assert.equal(report.currentStatus.runtimePlanReady, true)
  assert.equal(report.currentStatus.runtimeSlsPlanReady, false)
  assert.equal(report.currentStatus.runtimeConfirmed, false)
  assert.equal(report.currentStatus.slsAlertsConfirmed, false)
  assert.equal(report.currentStatus.imagePublishReady, false)
  assert.equal(report.currentStatus.acrImageDigestReady, false)
  assert.equal(report.currentStatus.runtimeImagePullConfigured, false)
  assert.equal(report.currentStatus.dependencyGatesReady, false)
  assert.equal(report.currentStatus.canConfigureRuntimeNow, false)
  assert.deepEqual(report.currentStatus.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.currentStatus.readySecretEnvVariableCount, 17)
  assert.equal(report.currentStatus.selectedRuntimeMode, "pending_create_sae_custom_container_runtime")
  assert.equal(report.currentStatus.selectedSlsMode, "pending_bind_sae_logs_and_alerts")

  const dependencyIds = report.dependencyGates.map((gate) => gate.id)
  assert.deepEqual(dependencyIds, [
    "RDS_POSTGRES_MIGRATION",
    "ACR_IMAGE_DIGEST_AND_PULL",
    "OSS_RUNTIME_ACCESS",
    "BACKEND_ENV_IMPORT",
  ])
  assert.equal(report.dependencyGates.find((gate) => gate.id === "RDS_POSTGRES_MIGRATION").authorizationPacket, "P11_ALIYUN_RDS_DATA_MIGRATION")
  assert.equal(report.dependencyGates.find((gate) => gate.id === "ACR_IMAGE_DIGEST_AND_PULL").authorizationPacket, "P04_ACR_IMAGE_AND_PULL")
  assert.equal(report.dependencyGates.find((gate) => gate.id === "OSS_RUNTIME_ACCESS").authorizationPacket, "P05_OSS_RAM_STS")
  assert.equal(report.dependencyGates.find((gate) => gate.id === "BACKEND_ENV_IMPORT").authorizationPacket, "P06_ENV_IMPORT")
  const dependencyGateById = new Map(report.dependencyGates.map((gate) => [gate.id, gate]))
  assert.equal(dependencyGateById.get("RDS_POSTGRES_MIGRATION").ready, false)
  assert.deepEqual(dependencyGateById.get("RDS_POSTGRES_MIGRATION").blockers, [
    "DATABASE_URL_CN",
    "RDS_MIGRATION_EVIDENCE_NOT_READY",
  ])
  assert.equal(dependencyGateById.get("ACR_IMAGE_DIGEST_AND_PULL").ready, false)
  assert.ok(dependencyGateById.get("ACR_IMAGE_DIGEST_AND_PULL").blockers.includes("runtime.imagePullConfigured=true"))
  assert.equal(dependencyGateById.get("OSS_RUNTIME_ACCESS").ready, false)
  assert.deepEqual(dependencyGateById.get("OSS_RUNTIME_ACCESS").blockers, [
    "oss.confirmed",
    "oss.corsConfigured",
    "oss.ramLeastPrivilege",
  ])
  assert.equal(dependencyGateById.get("BACKEND_ENV_IMPORT").ready, false)
  assert.deepEqual(dependencyGateById.get("BACKEND_ENV_IMPORT").blockers, [
    "envImport.confirmed",
    "envImport.secretNotInImage",
  ])

  assert.equal(report.runtimeOperation.candidate.id, "sae_custom_container_runtime")
  assert.equal(report.slsOperation.candidate.id, "sls_health_5xx_alerts")
  assert.ok(report.writebackTargets.runtimeFields.includes("items.runtime.provider=SAE"))
  assert.ok(report.writebackTargets.runtimeFields.includes("items.runtime.containerPort=3000"))
  assert.ok(report.writebackTargets.runtimeFields.includes("items.runtime.confirmed=true"))
  assert.ok(report.writebackTargets.slsAlertFields.includes("items.slsAlerts.healthAlertConfigured=true"))
  assert.ok(report.writebackTargets.slsAlertFields.includes("items.slsAlerts.serverErrorAlertConfigured=true"))
  assert.ok(report.writebackTargets.imageRuntimeFields.includes("runtime.imagePullConfigured=true"))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:cloud:confirmations:backend:strict"))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:oss:runtime-access:strict"))
  assert.ok(report.upstream.cloudConfirmations.recommendedRuntimeSlsModes.includes("sae_custom_container_runtime"))
  assert.ok(report.upstream.cloudConfirmations.recommendedRuntimeSlsModes.includes("sls_health_5xx_alerts"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("does not call Aliyun APIs")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("does not switch browser pages")))
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun SAE runtime/SLS handoff can write optional non-secret JSON and Markdown", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-sae-runtime-sls-handoff-"))
  const jsonPath = path.join(tmpDir, "handoff.json")
  const markdownPath = path.join(tmpDir, "handoff.md")
  const { output, report } = runHandoff(["--out", jsonPath, "--markdown", markdownPath])
  const writtenJson = readJsonFromPath(jsonPath)
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(writtenJson.packageId, report.packageId)
  assert.match(markdown, /# P08 SAE Runtime and SLS Handoff/)
  assert.match(markdown, /P08_SAE_RUNTIME_SLS/)
  assert.match(markdown, /RDS_POSTGRES_MIGRATION/)
  assert.match(markdown, /ACR_IMAGE_DIGEST_AND_PULL/)
  assert.match(markdown, /OSS_RUNTIME_ACCESS/)
  assert.match(markdown, /BACKEND_ENV_IMPORT/)
  assert.match(markdown, /items\.runtime\.confirmed=true/)
  assert.match(markdown, /items\.slsAlerts\.serverErrorAlertConfigured=true/)
  assert.match(markdown, /corepack pnpm aliyun:backend-cn:status/)
  assert.doesNotMatch(output + JSON.stringify(writtenJson) + markdown, secretLike)
})

function readJsonFromPath(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}
