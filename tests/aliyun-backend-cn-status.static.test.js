/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i
const fixtureBaseArgs = Object.freeze([
  "--env-file",
  "tests/fixtures/aliyun-user-action-brief/env.production-cn.fixture",
  "--cloud-confirmations",
  "tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json",
  "--cloud-inventory-results",
  "tests/fixtures/aliyun-user-action-brief/cloud-inventory-results.fixture.json",
  "--rds-migration",
  "tests/fixtures/aliyun-user-action-brief/rds-migration.fixture.json",
  "--image-publish",
  "tests/fixtures/aliyun-user-action-brief/image-publish.fixture.json",
])
const missingPostdeploySmokeFile = path.join(root, "tests", "fixtures", "aliyun-user-action-brief", "postdeploy-smoke.missing.json")
const deploymentIdentity = Object.freeze({
  imageDigest: `sha256:${"a".repeat(64)}`,
  saeAppId: "sae-app-20260711",
  saeDeploymentId: "sae-change-order-20260711",
  saeVersionId: "sae-version-20260711",
  deploymentCompletedAt: "2026-07-11T11:00:00.000Z",
})
const productionHealthCheckGroups = Object.freeze([
  "aliyunRds",
  "legalLinks",
  "aliyunOssRuntime",
  "bailianAsr",
  "serviceRecordSummary",
  "volcSpeech",
])
const fixtureArgs = Object.freeze([
  ...fixtureBaseArgs,
  "--postdeploy-smoke",
  missingPostdeploySmokeFile,
])

function fixtureArgsWithPostdeploySmoke(filePath) {
  return [...fixtureBaseArgs, "--postdeploy-smoke", filePath]
}

function commandEnv() {
  return {
    ...process.env,
    MEIYE_ALIYUN_RUN_JSON_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-cn-status-cache-")),
  }
}

function assertIncludesAll(actual, expected) {
  for (const value of expected) {
    assert.ok(actual.includes(value), `${value} missing from ${JSON.stringify(actual)}`)
  }
}

function assertInExactlyOnePacketGroup(packetId, left, right) {
  const inLeft = left.includes(packetId)
  const inRight = right.includes(packetId)
  assert.notEqual(inLeft, inRight, `${packetId} should be in exactly one packet group`)
}

function runBackendStatus(args = [], env = commandEnv()) {
  const result = spawnSync(process.execPath, [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    ...args,
  ], {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  assert.equal(result.status, 0, "backend status command should exit successfully")
  return {
    output: result.stdout,
    stderr: result.stderr,
    report: JSON.parse(result.stdout),
  }
}

function assertNoSecretLikeValues(text) {
  assert.doesNotMatch(text, secretLike)
  assert.doesNotMatch(text, /:\/\/[^\s:@]+:[^\s@]+@/)
}

function summarizeProbeScopes(probes) {
  const scopes = new Map()
  for (const probe of probes) scopes.set(probe.scope, (scopes.get(probe.scope) || 0) + 1)
  return Object.fromEntries([...scopes.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function reportHasAllProbes(report, probes) {
  return report.steps.appApiSmoke.result.checkedProbes === probes.length &&
    report.steps.appApiSmoke.result.probes.length === probes.length
}

function readyProductionHealthChecks() {
  return Object.fromEntries(productionHealthCheckGroups.map((group) => [group, true]))
}

function buildReadyHealthSummary(identity) {
  return {
    status: 200,
    service: "meiye-huajing-app-api",
    env: "production-cn",
    region: "cn-hangzhou",
    mode: "aliyun-production-cn",
    checks: readyProductionHealthChecks(),
    missing: [],
    ok: true,
    observedDeploymentIdentity: structuredClone(identity),
  }
}

function buildStandardPostdeploySmokeReport(probes, probeSetId, options = {}) {
  const baseUrl = "https://api-cn.ipgongchang.xin"
  const observedIdentity = structuredClone(options.deploymentIdentity || deploymentIdentity)
  const healthResult = {
    baseUrl,
    allowedMissing: [],
    provenanceErrorCode: null,
    healthz: buildReadyHealthSummary(observedIdentity),
    health: buildReadyHealthSummary(observedIdentity),
    strictHealth: buildReadyHealthSummary(observedIdentity),
  }
  const probeResults = probes.map((probe) => ({
    scope: probe.scope,
    method: probe.method,
    path: probe.path,
    status: probe.expected[0].status,
    code: probe.expected[0].code || "",
  }))
  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    baseUrl,
    deploymentIdentity: structuredClone(observedIdentity),
    provenanceErrorCode: null,
    allowedMissing: [],
    ok: true,
    steps: {
      remoteHealth: {
        ok: true,
        status: 0,
        errorCode: null,
        result: healthResult,
      },
      appApiSmoke: {
        ok: true,
        status: 0,
        errorCode: null,
        result: {
          baseUrl,
          probeSetId,
          runtimePlan: {
            localMode: false,
            aliyunRdsReady: "not_checked_for_remote_base_url",
            localRdsUnavailableExpected: probes.filter(
              (probe) => probe.runtimeExpectation === "local_rds_unavailable",
            ).length,
          },
          checkedProbes: probes.length,
          scopes: summarizeProbeScopes(probes),
          probes: probeResults,
        },
      },
    },
    outputFiles: {
      remoteHealth: "/tmp/postdeploy/remote-health-smoke.json",
      appApiSmoke: "/tmp/postdeploy/app-api-smoke.json",
      reportJson: "/tmp/postdeploy/postdeploy-smoke.json",
      reportMarkdown: "/tmp/postdeploy/postdeploy-smoke.md",
    },
  }
}

function buildPostdeployProducerInput(probes, probeSetId) {
  const standardReport = buildStandardPostdeploySmokeReport(probes, probeSetId)
  return {
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: standardReport.baseUrl,
    allowedMissing: [],
    steps: structuredClone(standardReport.steps),
    outputFiles: structuredClone(standardReport.outputFiles),
  }
}

function healthyRemoteBody(identity, overrides = {}) {
  const body = {
    ok: true,
    service: "meiye-huajing-app-api",
    env: "production-cn",
    region: "cn-hangzhou",
    mode: "aliyun-production-cn",
    missing: [],
    checks: readyProductionHealthChecks(),
    deferred: {
      supabase: "not_required_for_aliyun_production_cn",
      appWechatLogin: "deferred",
    },
    ...(identity === undefined ? {} : { deploymentIdentity: identity }),
  }
  return { ...body, ...overrides }
}

function runRemoteSmokeWithBodies(bodies, statuses = [200, 200, 200], extraArgs = []) {
  const scriptPath = path.join(root, "scripts", "smoke-aliyun-remote.mjs")
  const remoteArgv = [
    process.execPath,
    scriptPath,
    "--base-url",
    "https://api-cn.ipgongchang.xin",
    ...extraArgs,
  ]
  const source = [
    `const bodies = ${JSON.stringify(bodies)}`,
    `const statuses = ${JSON.stringify(statuses)}`,
    "let requestIndex = 0",
    "globalThis.fetch = async () => { const index = requestIndex++; return { status: statuses[index], text: async () => JSON.stringify(bodies[index]) } }",
    `process.argv = ${JSON.stringify(remoteArgv)}`,
    `await import(${JSON.stringify(pathToFileURL(scriptPath).href)})`,
  ].join("\n")
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    ...result,
    report: result.stdout.trim() ? JSON.parse(result.stdout) : null,
  }
}

function runPostdeployProducerWithMockChildren(allowMissing) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-postdeploy-producer-cli-"))
  const preloadPath = path.join(temporaryDirectory, "mock-smoke-children.mjs")
  const outDir = path.join(temporaryDirectory, "output")
  const producerPath = path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs")
  const appSmokeModuleUrl = pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href
  const preloadSource = [
    'import { createRequire, syncBuiltinESMExports } from "node:module"',
    `import { APP_API_SMOKE_PROBE_SET_ID, PROBES } from ${JSON.stringify(appSmokeModuleUrl)}`,
    "const require = createRequire(import.meta.url)",
    'const childProcess = require("node:child_process")',
    `const deploymentIdentity = ${JSON.stringify(deploymentIdentity)}`,
    `const healthGroups = ${JSON.stringify(productionHealthCheckGroups)}`,
    "const readOption = (args, name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : \"\" }",
    "const summarizeScopes = () => { const counts = new Map(); for (const probe of PROBES) counts.set(probe.scope, (counts.get(probe.scope) || 0) + 1); return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))) }",
    "const probeResults = PROBES.map((probe) => ({ scope: probe.scope, method: probe.method, path: probe.path, status: probe.expected[0].status, code: probe.expected[0].code || \"\", ...(probe.runtimeExpectation ? { runtimeExpectation: probe.runtimeExpectation } : {}) }))",
    "childProcess.spawnSync = (_executable, invocation) => {",
    "  const [script, ...args] = invocation",
    "  const baseUrl = readOption(args, \"--base-url\")",
    "  if (script === \"scripts/smoke-aliyun-remote.mjs\") {",
    "    const rawAllowed = readOption(args, \"--allow-missing\").split(\",\").map((item) => item.trim()).filter(Boolean)",
    "    const allowedSet = new Set(rawAllowed)",
    "    const allowedMissing = healthGroups.filter((group) => allowedSet.has(group))",
    "    if (rawAllowed.length === allowedSet.size && rawAllowed.join(\",\") !== allowedMissing.join(\",\")) return { status: 64, stdout: \"\", stderr: \"\" }",
    "    const checks = Object.fromEntries(healthGroups.map((group) => [group, !allowedSet.has(group)]))",
    "    const health = (strict) => ({ status: strict && allowedMissing.length > 0 ? 503 : 200, service: \"meiye-huajing-app-api\", env: \"production-cn\", region: \"cn-hangzhou\", mode: \"aliyun-production-cn\", checks, ok: allowedMissing.length === 0, missing: allowedMissing, observedDeploymentIdentity: deploymentIdentity })",
    "    return { status: 0, stdout: JSON.stringify({ baseUrl, allowedMissing, provenanceErrorCode: null, healthz: health(false), health: health(false), strictHealth: health(true) }), stderr: \"\" }",
    "  }",
    "  if (script === \"scripts/smoke-app-api-production-cn.mjs\") {",
    "    const localRdsUnavailableExpected = PROBES.filter((probe) => probe.runtimeExpectation === \"local_rds_unavailable\").length",
    "    return { status: 0, stdout: JSON.stringify({ baseUrl, probeSetId: APP_API_SMOKE_PROBE_SET_ID, runtimePlan: { localMode: false, aliyunRdsReady: \"not_checked_for_remote_base_url\", localRdsUnavailableExpected }, checkedProbes: PROBES.length, scopes: summarizeScopes(), probes: probeResults }), stderr: \"\" }",
    "  }",
    "  return { status: 1, stdout: \"\", stderr: \"\" }",
    "}",
    "syncBuiltinESMExports()",
  ].join("\n")
  fs.writeFileSync(preloadPath, preloadSource)
  try {
    const allowedMissingArgs = (Array.isArray(allowMissing) ? allowMissing : [allowMissing])
      .flatMap((value) => ["--allow-missing", value])
    const result = spawnSync(process.execPath, [
      producerPath,
      "--base-url",
      "https://api-cn.ipgongchang.xin",
      "--out-dir",
      outDir,
      ...allowedMissingArgs,
    ], {
      cwd: root,
      env: {
        ...process.env,
        NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    })
    const reportPath = path.join(outDir, "postdeploy-smoke.json")
    return {
      ...result,
      report: fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : null,
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

test("Aliyun backend-cn status command is wired into package scripts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const script = read("scripts", "summarize-aliyun-backend-cn-status.mjs")
  const standardProducer = read("scripts", "run-aliyun-postdeploy-smoke.mjs")
  const help = execFileSync(process.execPath, ["scripts/summarize-aliyun-backend-cn-status.mjs", "--help"], {
    cwd: root,
    encoding: "utf8",
  })

  assert.equal(pkg.scripts["aliyun:backend-cn:status"], "node ./scripts/summarize-aliyun-backend-cn-status.mjs")
  assert.equal(readJson("deploy", "app-api-production-cn.bridge-map.json").updatedAt, "2026-07-11")
  assert.equal(pkg.scripts["aliyun:backend-cn:status:test"], "node --test tests/aliyun-backend-cn-status.static.test.js")
  assert.match(predeploy, /aliyun:backend-cn:status:test/)
  assert.match(predeploy, /aliyun:backend-cn:status/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:backend-cn:status/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:status"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.match(releaseArtifacts, /backend-cn-status\.json/)
  assert.match(releaseArtifacts, /backendCnStatus/)
  assert.match(script, /backend_aliyun_only/)
  assert.match(script, /deferred_after_backend_online/)
  assert.match(script, /POSTDEPLOY_SMOKE_NOT_RUN/)
  assert.match(script, /summarize-aliyun-sensitive-blockers\.mjs/)
  assert.match(script, /fail_closed_no_cloud_mutation/)
  assert.match(help, /--postdeploy-smoke deploy\/aliyun-production-cn\.postdeploy-smoke\.local\.json/)
  assert.match(help, /standard postdeploy-smoke\.json/)
  assert.doesNotMatch(script, /isPostdeploySmokeEvidenceReady/)
  assert.match(script, /const invocationCache = new Map\(\)/)
  assert.match(script, /delete childEnv\.MEIYE_ALIYUN_RUN_JSON_CACHE_DIR/)
  assert.doesNotMatch(script, /run-json-cache\.mjs/)
  assert.match(standardProducer, /generatedAt:\s*new Date\(\)\.toISOString\(\)/)
  assert.match(standardProducer, /baseUrl:\s*args\.baseUrl/)
  assert.match(standardProducer, /allowedMissing:/)
  assert.match(standardProducer, /steps:\s*\{\s*remoteHealth,\s*appApiSmoke,?\s*\}/s)
  assert.match(standardProducer, /result:\s*JSON\.parse\(output\.stdout\)/)
  assert.doesNotMatch(read("scripts", "smoke-app-api-production-cn.mjs"), /!item\.code/)
  assertNoSecretLikeValues(script)
})

test("standard postdeploy producer derives deployment identity only from remote observations", async () => {
  const producerPath = path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs")
  const source = fs.readFileSync(producerPath, "utf8")
  assert.match(source, /export function buildPostdeploySmokeReport/)
  assert.match(source, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/)
  assert.match(source, /writeJson\(outputFiles\.remoteHealth, report\.steps\.remoteHealth\)/)
  assert.match(source, /writeJson\(outputFiles\.appApiSmoke, report\.steps\.appApiSmoke\)/)
  for (const option of [
    "--image-digest",
    "--sae-app-id",
    "--sae-deployment-id",
    "--sae-version-id",
    "--deployment-completed-at",
  ]) {
    assert.equal(source.includes(option), false, `${option} must not be accepted by the canonical producer`)
  }

  const help = execFileSync(process.execPath, [producerPath, "--help"], { cwd: root, encoding: "utf8" })
  assert.match(help, /--base-url/)
  assert.doesNotMatch(help, /--image-digest|--sae-app-id|--sae-deployment-id|--sae-version-id|--deployment-completed-at/)

  const producer = await import(pathToFileURL(producerPath).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  const syntheticStandardReport = buildStandardPostdeploySmokeReport(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  const steps = {
    remoteHealth: {
      ok: true,
      status: 0,
      errorCode: null,
      result: syntheticStandardReport.steps.remoteHealth.result,
    },
    appApiSmoke: {
      ok: true,
      status: 0,
      errorCode: null,
      result: syntheticStandardReport.steps.appApiSmoke.result,
    },
  }
  const report = producer.buildPostdeploySmokeReport({
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: "https://api-cn.ipgongchang.xin",
    allowedMissing: [],
    steps,
    outputFiles: {
      remoteHealth: "/tmp/postdeploy/remote-health-smoke.json",
      appApiSmoke: "/tmp/postdeploy/app-api-smoke.json",
      reportJson: "/tmp/postdeploy/postdeploy-smoke.json",
      reportMarkdown: "/tmp/postdeploy/postdeploy-smoke.md",
    },
  })
  assert.deepEqual(report.deploymentIdentity, deploymentIdentity)
  assert.equal(report.provenanceErrorCode, null)
  assert.deepEqual(report.allowedMissing, [])
  assert.equal(report.ok, true)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    assert.deepEqual(report.steps.remoteHealth.result[healthKey], buildReadyHealthSummary(deploymentIdentity))
  }

  for (const childProvenanceCode of [
    "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE",
    "REMOTE_DEPLOYMENT_IDENTITY_MIXED",
    "REMOTE_DEPLOYMENT_IDENTITY_INVALID",
  ]) {
    const contradictorySteps = structuredClone(steps)
    contradictorySteps.remoteHealth.result.provenanceErrorCode = childProvenanceCode
    const contradictoryReport = producer.buildPostdeploySmokeReport({
      generatedAt: "2026-07-11T12:00:00.000Z",
      baseUrl: "https://api-cn.ipgongchang.xin",
      allowedMissing: [],
      steps: contradictorySteps,
      outputFiles: report.outputFiles,
    })
    assert.deepEqual(contradictoryReport.deploymentIdentity, deploymentIdentity, childProvenanceCode)
    assert.equal(contradictoryReport.provenanceErrorCode, "REMOTE_DEPLOYMENT_IDENTITY_INVALID", childProvenanceCode)
    assert.equal(contradictoryReport.ok, false, childProvenanceCode)
    const evidenceText = [
      JSON.stringify(contradictoryReport),
      producer.renderPostdeploySmokeMarkdown(contradictoryReport),
      JSON.stringify(producer.buildPostdeployConsoleSummary(contradictoryReport, "/tmp/postdeploy")),
    ].join("\n")
    assertNoSecretLikeValues(evidenceText)
  }

  const invalidHealthSteps = structuredClone(steps)
  invalidHealthSteps.remoteHealth.result.health.checks = {}
  const invalidHealthReport = producer.buildPostdeploySmokeReport({
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: "https://api-cn.ipgongchang.xin",
    allowedMissing: [],
    steps: invalidHealthSteps,
    outputFiles: report.outputFiles,
  })
  assert.equal(invalidHealthReport.ok, false)
  assert.equal(invalidHealthReport.steps.remoteHealth.ok, false)
  assert.equal(invalidHealthReport.steps.remoteHealth.errorCode, "REMOTE_HEALTH_RESULT_INVALID")
  assert.equal(invalidHealthReport.steps.remoteHealth.result, null)

  const unavailableSteps = structuredClone(steps)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    unavailableSteps.remoteHealth.result[healthKey].observedDeploymentIdentity = null
  }
  unavailableSteps.remoteHealth.result.provenanceErrorCode = "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE"
  const unavailable = producer.buildPostdeploySmokeReport({
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: "https://api-cn.ipgongchang.xin",
    allowedMissing: [],
    steps: unavailableSteps,
    outputFiles: report.outputFiles,
  })
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.deploymentIdentity, null)
  assert.equal(unavailable.provenanceErrorCode, "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE")
  assert.doesNotMatch(JSON.stringify(unavailable), /deployment_identity_missing:/)
})

test("standard postdeploy producer rejects a divergent runtime unavailable count", async () => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  const canonicalCount = PROBES.filter(
    (probe) => probe.runtimeExpectation === "local_rds_unavailable",
  ).length
  const validInput = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  const validReport = producer.buildPostdeploySmokeReport(validInput)
  assert.equal(validReport.ok, true)
  assert.equal(
    validReport.steps.appApiSmoke.result.runtimePlan.localRdsUnavailableExpected,
    canonicalCount,
  )

  const divergentInput = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  divergentInput.steps.appApiSmoke.result.runtimePlan.localRdsUnavailableExpected = canonicalCount === 1 ? 2 : 1
  const divergentReport = producer.buildPostdeploySmokeReport(divergentInput)
  assert.equal(divergentReport.ok, false)
  assert.equal(divergentReport.steps.appApiSmoke.ok, false)
  assert.equal(divergentReport.steps.appApiSmoke.errorCode, "APP_API_SMOKE_RESULT_INVALID")
  assert.equal(divergentReport.steps.appApiSmoke.result, null)
  const evidence = [
    JSON.stringify(divergentReport),
    producer.renderPostdeploySmokeMarkdown(divergentReport),
    JSON.stringify(producer.buildPostdeployConsoleSummary(divergentReport, "/tmp/postdeploy")),
  ].join("\n")
  assert.equal(evidence.includes("localRdsUnavailableExpected"), false)
})

test("standard postdeploy producer canonicalizes one coherent allowed-missing set", async () => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  const input = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  input.allowedMissing = ["volcSpeech", "legalLinks"]
  input.steps.remoteHealth.result.allowedMissing = ["volcSpeech", "legalLinks"]
  const canonicalAllowedMissing = ["legalLinks", "volcSpeech"]
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    const health = input.steps.remoteHealth.result[healthKey]
    health.checks.legalLinks = false
    health.checks.volcSpeech = false
    health.missing = canonicalAllowedMissing
    health.ok = false
    health.status = healthKey === "strictHealth" ? 503 : 200
  }

  const report = producer.buildPostdeploySmokeReport(input)
  assert.equal(report.ok, true)
  assert.deepEqual(report.allowedMissing, canonicalAllowedMissing)
  assert.deepEqual(report.steps.remoteHealth.result.allowedMissing, canonicalAllowedMissing)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    assert.deepEqual(report.steps.remoteHealth.result[healthKey].missing, canonicalAllowedMissing)
  }
})

test("standard postdeploy producer rejects every three-way base URL mismatch without echoing it", async (t) => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  const mismatches = [
    {
      label: "top-level base URL",
      mutate: (input, sentinel) => { input.baseUrl = sentinel },
      expectedErrors: ["REMOTE_HEALTH_RESULT_INVALID", "APP_API_SMOKE_RESULT_INVALID"],
    },
    {
      label: "remote-health base URL",
      mutate: (input, sentinel) => { input.steps.remoteHealth.result.baseUrl = sentinel },
      expectedErrors: ["REMOTE_HEALTH_RESULT_INVALID"],
    },
    {
      label: "APP API base URL",
      mutate: (input, sentinel) => { input.steps.appApiSmoke.result.baseUrl = sentinel },
      expectedErrors: ["APP_API_SMOKE_RESULT_INVALID"],
    },
  ]
  for (const mismatch of mismatches) {
    await t.test(mismatch.label, () => {
      const sentinel = `https://untrusted.invalid/${mismatch.label.replaceAll(" ", "-")}-SENTINEL`
      const input = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
      mismatch.mutate(input, sentinel)
      const report = producer.buildPostdeploySmokeReport(input)
      const errorCodes = [report.steps.remoteHealth.errorCode, report.steps.appApiSmoke.errorCode]
      assert.equal(report.ok, false)
      assertIncludesAll(errorCodes, mismatch.expectedErrors)
      const evidence = [
        JSON.stringify(report),
        producer.renderPostdeploySmokeMarkdown(report),
        JSON.stringify(producer.buildPostdeployConsoleSummary(report, "/tmp/postdeploy")),
      ].join("\n")
      assert.equal(evidence.includes(sentinel), false)
    })
  }
})

test("standard postdeploy producer rejects malformed or divergent allowed-missing inputs", async (t) => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  const sentinel = ["UNKNOWN", "_<b>group</b>_", "\u001b[35m", "_SENTINEL_75319"].join("")
  const invalidInputs = [
    ["top-level missing", (input) => { delete input.allowedMissing }],
    ["top-level wrong container", (input) => { input.allowedMissing = "legalLinks" }],
    ["top-level non-string item", (input) => { input.allowedMissing = [7] }],
    ["top-level duplicate", (input) => { input.allowedMissing = ["legalLinks", "legalLinks"] }],
    ["top-level unknown group", (input) => { input.allowedMissing = [sentinel] }],
    ["remote missing", (input) => { delete input.steps.remoteHealth.result.allowedMissing }],
    ["remote wrong container", (input) => { input.steps.remoteHealth.result.allowedMissing = "legalLinks" }],
    ["remote non-string item", (input) => { input.steps.remoteHealth.result.allowedMissing = [7] }],
    ["remote duplicate", (input) => { input.steps.remoteHealth.result.allowedMissing = ["legalLinks", "legalLinks"] }],
    ["remote unknown group", (input) => { input.steps.remoteHealth.result.allowedMissing = [sentinel] }],
    ["canonical set mismatch", (input) => { input.allowedMissing = ["legalLinks"] }],
  ]
  for (const [label, mutate] of invalidInputs) {
    await t.test(label, () => {
      const input = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
      mutate(input)
      const report = producer.buildPostdeploySmokeReport(input)
      assert.equal(report.ok, false)
      assert.equal(report.steps.remoteHealth.ok, false)
      assert.equal(report.steps.remoteHealth.errorCode, "REMOTE_HEALTH_RESULT_INVALID")
      const evidence = [
        JSON.stringify(report),
        producer.renderPostdeploySmokeMarkdown(report),
        JSON.stringify(producer.buildPostdeployConsoleSummary(report, "/tmp/postdeploy")),
      ].join("\n")
      assert.equal(evidence.includes(sentinel), false)
    })
  }
})

test("standard postdeploy producer rejects every health missing group outside the canonical allowance", async (t) => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    await t.test(healthKey, () => {
      const input = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
      input.allowedMissing = ["legalLinks"]
      input.steps.remoteHealth.result.allowedMissing = ["legalLinks"]
      const health = input.steps.remoteHealth.result[healthKey]
      health.checks.aliyunRds = false
      health.missing = ["aliyunRds"]
      health.ok = false
      health.status = healthKey === "strictHealth" ? 503 : 200
      const report = producer.buildPostdeploySmokeReport(input)
      assert.equal(report.ok, false)
      assert.equal(report.steps.remoteHealth.errorCode, "REMOTE_HEALTH_RESULT_INVALID")
    })
  }
})

test("postdeploy producer CLI rejects duplicate allowed-missing before child execution", () => {
  const result = runPostdeployProducerWithMockChildren("legalLinks,legalLinks")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /POSTDEPLOY_SMOKE_FAILED/)
  assert.equal(`${result.stdout}\n${result.stderr}`.includes("legalLinks,legalLinks"), false)
})

test("postdeploy producer CLI rejects a repeated allowed-missing option", () => {
  const result = runPostdeployProducerWithMockChildren(["legalLinks", "legalLinks"])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /POSTDEPLOY_SMOKE_FAILED/)
})

test("postdeploy producer CLI canonicalizes an unordered allowed-missing list once", () => {
  const result = runPostdeployProducerWithMockChildren("volcSpeech,legalLinks")
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.report.allowedMissing, ["legalLinks", "volcSpeech"])
  assert.deepEqual(result.report.steps.remoteHealth.result.allowedMissing, ["legalLinks", "volcSpeech"])
})

test("standard postdeploy producer rejects empty or whitespace-only output files", async (t) => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const { APP_API_SMOKE_PROBE_SET_ID, PROBES } = await import(pathToFileURL(
    path.join(root, "scripts", "smoke-app-api-production-cn.mjs"),
  ).href)
  const validInput = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  const validReport = producer.buildPostdeploySmokeReport(validInput)
  assert.equal(validReport.ok, true)
  assert.deepEqual(validReport.outputFiles, validInput.outputFiles)
  for (const outputPath of Object.values(validReport.outputFiles)) assert.equal(path.isAbsolute(outputPath), true)

  for (const field of Object.keys(validInput.outputFiles)) {
    for (const [label, invalidPath] of [["empty", ""], ["whitespace", " \t\n "]]) {
      await t.test(`${field} ${label}`, () => {
        const input = buildPostdeployProducerInput(PROBES, APP_API_SMOKE_PROBE_SET_ID)
        input.outputFiles[field] = invalidPath
        assert.throws(
          () => producer.buildPostdeploySmokeReport(input),
          (error) => error instanceof Error && error.message === "invalid_output_files",
        )
      })
    }
  }
})

test("shared deployment identity validation rejects placeholders and invalid clocks", async () => {
  const identityModule = await import(pathToFileURL(
    path.join(root, "scripts", "lib", "aliyun-deployment-identity.mjs"),
  ).href)
  const now = Date.parse("2026-07-11T12:00:00.000Z")
  const identityFields = ["saeAppId", "saeDeploymentId", "saeVersionId"]
  const placeholderMarkers = [
    "TODO", "todo", "ToDo",
    "PENDING", "pending", "PeNdInG",
    "TBD", "tbd", "TbD",
  ]
  const placeholderSeparators = ["", ".", "_", ":", "-"]
  for (const field of identityFields) {
    for (const marker of placeholderMarkers) {
      for (const separator of placeholderSeparators) {
        const placeholder = separator ? `${marker}${separator}value` : marker
        const validation = identityModule.canonicalizeDeploymentIdentity({
          ...deploymentIdentity,
          [field]: placeholder,
        }, { now })
        assert.equal(validation.ok, false, `${field}:${placeholder}`)
        assert.equal(validation.errorCode, "deployment_identity_invalid", `${field}:${placeholder}`)
      }
    }
  }
  const nonPrefixIds = ["realTODO", "real.TODO", "real_pending", "real:TBD", "real-pending"]
  for (const field of identityFields) {
    for (const validId of nonPrefixIds) {
      const validation = identityModule.canonicalizeDeploymentIdentity({
        ...deploymentIdentity,
        [field]: validId,
      }, { now })
      assert.equal(validation.ok, true, `${field}:${validId}`)
      assert.equal(validation.identity[field], validId, `${field}:${validId}`)
    }
  }
  for (const invalidNow of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, new Date(Number.NaN)]) {
    assert.deepEqual(
      identityModule.canonicalizeDeploymentIdentity(deploymentIdentity, { now: invalidNow }),
      { ok: false, errorCode: "validation_clock_invalid", identity: null },
    )
  }
})

test("remote health smoke emits only closed deployment provenance and fixed errors", () => {
  const missing = runRemoteSmokeWithBodies([
    healthyRemoteBody(),
    healthyRemoteBody(),
    healthyRemoteBody(),
  ])
  assert.equal(missing.status, 0)
  assert.equal(missing.report.provenanceErrorCode, "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE")
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    assert.equal(missing.report[healthKey].observedDeploymentIdentity, null)
    assert.deepEqual(missing.report[healthKey].checks, readyProductionHealthChecks())
    assert.equal(missing.report[healthKey].service, "meiye-huajing-app-api")
    assert.equal(missing.report[healthKey].env, "production-cn")
    assert.equal(missing.report[healthKey].region, "cn-hangzhou")
    assert.equal(missing.report[healthKey].mode, "aliyun-production-cn")
  }

  const mixed = runRemoteSmokeWithBodies([
    healthyRemoteBody(deploymentIdentity),
    healthyRemoteBody({ ...deploymentIdentity, saeVersionId: "sae-version-other" }),
    healthyRemoteBody(deploymentIdentity),
  ])
  assert.equal(mixed.status, 0)
  assert.equal(mixed.report.provenanceErrorCode, "REMOTE_DEPLOYMENT_IDENTITY_MIXED")
  assert.equal(JSON.stringify(mixed.report).includes("sae-version-other"), false)

  const invalidSentinel = ["PERSON", "_NAME_<b>markdown</b>_", "\u001b[31m", "_UNKNOWN_CREDENTIAL_987654"].join("")
  const malformed = runRemoteSmokeWithBodies([
    healthyRemoteBody({ ...deploymentIdentity, saeAppId: invalidSentinel }),
    healthyRemoteBody(deploymentIdentity),
    healthyRemoteBody(deploymentIdentity),
  ])
  assert.equal(malformed.status, 0)
  assert.equal(malformed.report.provenanceErrorCode, "REMOTE_DEPLOYMENT_IDENTITY_INVALID")
  assert.equal(`${malformed.stdout}\n${malformed.stderr}`.includes(invalidSentinel), false)

  const unknownGroupSentinel = ["UNKNOWN", "_PERSON_<i>field</i>_", "\u001b[32m", "_VALUE_24680"].join("")
  const unknownShape = runRemoteSmokeWithBodies([
    { ...healthyRemoteBody(), checks: { [unknownGroupSentinel]: true } },
    healthyRemoteBody(),
    healthyRemoteBody(),
  ])
  assert.equal(unknownShape.status, 1)
  assert.match(unknownShape.stderr, /REMOTE_HEALTH_SCHEMA_INVALID/)
  assert.equal(`${unknownShape.stdout}\n${unknownShape.stderr}`.includes(unknownGroupSentinel), false)
})

test("remote health smoke rejects incomplete or inconsistent production-cn health contracts", () => {
  for (const healthIndex of [0, 1, 2]) {
    const bodies = [healthyRemoteBody(), healthyRemoteBody(), healthyRemoteBody()]
    bodies[healthIndex].checks = {}
    const result = runRemoteSmokeWithBodies(bodies)
    assert.equal(result.status, 1, `health index ${healthIndex} must validate its own checks`)
    assert.match(result.stderr, /REMOTE_HEALTH_SCHEMA_INVALID/)
  }

  const invalidShapes = [
    ["partial checks", { checks: { aliyunRds: true } }],
    ["wrong service", { service: "other-service" }],
    ["wrong env", { env: "production" }],
    ["wrong region", { region: "cn-shanghai" }],
    ["wrong mode", { mode: "legacy" }],
    ["missing does not match false checks", {
      checks: { ...readyProductionHealthChecks(), aliyunRds: false },
      missing: [],
      ok: true,
    }],
    ["missing lists a true check", { missing: ["aliyunRds"], ok: false }],
    ["ok disagrees with empty missing", { ok: false }],
  ]
  for (const [label, overrides] of invalidShapes) {
    const result = runRemoteSmokeWithBodies([
      healthyRemoteBody(undefined, overrides),
      healthyRemoteBody(),
      healthyRemoteBody(),
    ])
    assert.equal(result.status, 1, label)
    assert.match(result.stderr, /REMOTE_HEALTH_SCHEMA_INVALID/, label)
  }

  for (const [label, statuses] of [
    ["healthz non-strict status", [503, 200, 200]],
    ["health non-strict status", [200, 503, 200]],
    ["strict ready status", [200, 200, 503]],
  ]) {
    const result = runRemoteSmokeWithBodies([
      healthyRemoteBody(),
      healthyRemoteBody(),
      healthyRemoteBody(),
    ], statuses)
    assert.equal(result.status, 1, label)
    assert.match(result.stderr, /REMOTE_HEALTH_STATUS_INVALID/, label)
  }
})

test("remote health smoke accepts canonical false-check order only when explicitly allowed", () => {
  const checks = {
    ...readyProductionHealthChecks(),
    legalLinks: false,
    aliyunOssRuntime: false,
  }
  const missing = ["legalLinks", "aliyunOssRuntime"]
  const body = healthyRemoteBody(undefined, { checks, missing, ok: false })
  const result = runRemoteSmokeWithBodies(
    [body, body, body],
    [200, 200, 503],
    ["--allow-missing", missing.join(",")],
  )
  assert.equal(result.status, 0, result.stderr)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    assert.deepEqual(result.report[healthKey].missing, missing)
    assert.deepEqual(result.report[healthKey].checks, checks)
  }
})

test("producer child failures, Markdown, and console summaries never carry child output", async () => {
  const producer = await import(pathToFileURL(
    path.join(root, "scripts", "run-aliyun-postdeploy-smoke.mjs"),
  ).href)
  const sentinel = ["LiMing", "_<script>alert(1)</script>_", "\u001b[31m", "_opaque_credential_13579"].join("")
  const childStep = producer.buildSmokeChildStep("app_api_smoke", {
    status: 7,
    stdout: sentinel,
    stderr: sentinel,
  })
  assert.deepEqual(childStep, {
    ok: false,
    status: 7,
    errorCode: "APP_API_SMOKE_CHILD_FAILED",
    result: null,
  })
  const report = {
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: "https://api-cn.ipgongchang.xin",
    deploymentIdentity: null,
    provenanceErrorCode: "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE",
    allowedMissing: [],
    ok: false,
    steps: {
      remoteHealth: { ok: false, status: 7, errorCode: "REMOTE_HEALTH_CHILD_FAILED", result: null },
      appApiSmoke: childStep,
    },
    outputFiles: {
      remoteHealth: "/tmp/postdeploy/remote-health-smoke.json",
      appApiSmoke: "/tmp/postdeploy/app-api-smoke.json",
      reportJson: "/tmp/postdeploy/postdeploy-smoke.json",
      reportMarkdown: "/tmp/postdeploy/postdeploy-smoke.md",
    },
  }
  const rendered = producer.renderPostdeploySmokeMarkdown(report)
  const summary = producer.buildPostdeployConsoleSummary(report, "/tmp/postdeploy")
  const evidenceText = `${JSON.stringify(childStep)}\n${rendered}\n${JSON.stringify(summary)}`
  assert.equal(evidenceText.includes(sentinel), false)
  assert.match(rendered, /APP_API_SMOKE_CHILD_FAILED/)

  const validRemoteResult = buildStandardPostdeploySmokeReport([], "unused").steps.remoteHealth.result
  const forgedErrorReport = producer.buildPostdeploySmokeReport({
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: "https://api-cn.ipgongchang.xin",
    allowedMissing: [],
    steps: {
      remoteHealth: { ok: true, status: 0, errorCode: null, result: validRemoteResult },
      appApiSmoke: { ok: false, status: 7, errorCode: `APP_API_${sentinel}`, result: null },
    },
    outputFiles: report.outputFiles,
  })
  assert.equal(forgedErrorReport.steps.appApiSmoke.errorCode, "APP_API_SMOKE_CHILD_FAILED")
  assert.equal(JSON.stringify(forgedErrorReport).includes(sentinel), false)

  const malformedRemoteResult = structuredClone(validRemoteResult)
  malformedRemoteResult[sentinel] = sentinel
  const malformedRemoteReport = producer.buildPostdeploySmokeReport({
    generatedAt: "2026-07-11T12:00:00.000Z",
    baseUrl: "https://api-cn.ipgongchang.xin",
    allowedMissing: [],
    steps: {
      remoteHealth: { ok: true, status: 0, errorCode: null, result: malformedRemoteResult },
      appApiSmoke: { ok: false, status: 7, errorCode: "APP_API_SMOKE_CHILD_FAILED", result: null },
    },
    outputFiles: report.outputFiles,
  })
  assert.equal(malformedRemoteReport.provenanceErrorCode, "REMOTE_DEPLOYMENT_IDENTITY_INVALID")
  assert.equal(JSON.stringify(malformedRemoteReport).includes(sentinel), false)
})

test("APP API probe canonicalizer validates schema and hashes the complete body contract", async () => {
  const {
    APP_API_SMOKE_PROBE_SET_ID,
    PROBES,
    buildAppApiSmokeProbeSetId,
  } = await import(pathToFileURL(path.join(root, "scripts", "smoke-app-api-production-cn.mjs")).href)
  const deviceFilesProbeIndex = PROBES.findIndex((probe) => (
    probe.path === "/api/app/service-records/device-files/check"
  ))
  const withDeviceFilesBody = (body) => PROBES.map((probe, index) => (
    index === deviceFilesProbeIndex ? { ...probe, body } : probe
  ))
  const bodyContract = {
    files: ["first", null, 3, true],
    metadata: {
      count: 1,
      label: "fixture-label",
      ready: false,
    },
  }

  assert.equal(buildAppApiSmokeProbeSetId(PROBES), APP_API_SMOKE_PROBE_SET_ID)
  for (const [probeIndex, probe] of PROBES.entries()) {
    for (const [expectedIndex, expected] of probe.expected.entries()) {
      assert.equal(
        Object.hasOwn(expected, "code") && typeof expected.code === "string" && expected.code.length > 0,
        true,
        `probe ${probeIndex} expected ${expectedIndex} should require one explicit public code`,
      )
    }
  }
  const topLevelBodyIds = [null, "body-text", true, 7].map((body) => (
    buildAppApiSmokeProbeSetId(withDeviceFilesBody(body))
  ))
  assert.equal(new Set(topLevelBodyIds).size, topLevelBodyIds.length)
  for (const id of topLevelBodyIds) assert.notEqual(id, APP_API_SMOKE_PROBE_SET_ID)
  assert.notEqual(buildAppApiSmokeProbeSetId(withDeviceFilesBody(bodyContract)), APP_API_SMOKE_PROBE_SET_ID)
  assert.notEqual(
    buildAppApiSmokeProbeSetId(withDeviceFilesBody(bodyContract)),
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ ...bodyContract, files: ["first", null, 3, false] })),
  )
  assert.notEqual(
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ ...bodyContract, metadata: { ...bodyContract.metadata, count: 1 } })),
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ ...bodyContract, metadata: { ...bodyContract.metadata, count: 2 } })),
  )
  assert.notEqual(
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ files: ["first", "second"] })),
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ files: ["second", "first"] })),
  )
  assert.equal(
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ files: [], metadata: { count: 1, ready: false } })),
    buildAppApiSmokeProbeSetId(withDeviceFilesBody({ metadata: { ready: false, count: 1 }, files: [] })),
  )
  assert.equal(buildAppApiSmokeProbeSetId(withDeviceFilesBody(bodyContract)).includes("fixture-label"), false)

  const invalidProbeSets = [
    "not-an-array",
    1,
    [],
    [{}],
    [{ ...PROBES[0], scope: "" }],
    [{ ...PROBES[0], method: "get" }],
    [{ ...PROBES[0], method: "GeT" }],
    [{ ...PROBES[0], method: "FETCH" }],
    [{ ...PROBES[0], path: "api/app/auth/wechat" }],
    [{ ...PROBES[0], expected: [] }],
    [{ ...PROBES[0], expected: [{ status: 99 }] }],
    [{ ...PROBES[0], expected: [{ status: 600 }] }],
    [{ ...PROBES[0], expected: [{ status: 401.5 }] }],
    [{ ...PROBES[0], expected: [{ status: 401 }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: "" }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: " " }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: "\n\t" }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: " auth_required" }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: "auth_required " }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: "AUTH_REQUIRED" }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: "auth-required" }] }],
    [{ ...PROBES[0], expected: [{ status: 401, code: 7 }] }],
    [{ ...PROBES[0], body: undefined }],
    [{ ...PROBES[0], body: Number.POSITIVE_INFINITY }],
    [PROBES[0], structuredClone(PROBES[0])],
  ]
  for (const invalidProbeSet of invalidProbeSets) {
    assert.throws(
      () => buildAppApiSmokeProbeSetId(invalidProbeSet),
      /invalid_probe_contract/,
    )
  }

  const learningRouteFiles = [
    "app/api/app/learning/progress/route.ts",
    "app/api/app/learning/progress/events/route.ts",
    "app/api/app/learning/progress/sync/route.ts",
  ]
  for (const file of learningRouteFiles) {
    const source = read(...file.split("/"))
    const authGuardIndex = source.indexOf("if (!auth) return appAuthRequiredResponse()")
    const accountContextIndex = source.indexOf("getAliyunRdsAppAccountContext(auth.user)")
    assert.ok(authGuardIndex >= 0, `${file} should keep the standard APP auth guard`)
    assert.ok(accountContextIndex > authGuardIndex, `${file} should authenticate before RDS account access`)
    const requestBodyIndex = source.indexOf("request.json()")
    if (requestBodyIndex >= 0) {
      assert.ok(requestBodyIndex > authGuardIndex, `${file} should authenticate before reading a mutation body`)
    }
  }
  for (const pathName of [
    "/api/app/learning/progress",
    "/api/app/learning/progress/events",
    "/api/app/learning/progress/sync",
  ]) {
    const probe = PROBES.find((item) => item.path === pathName)
    assert.deepEqual(probe.expected, [{ status: 401, code: "auth_required" }])
  }
})

test("postdeploy readiness requires one complete standard producer report", async (t) => {
  const {
    APP_API_SMOKE_PROBE_SET_ID,
    deriveExpectedDeploymentIdentity,
    validatePostdeploySmokeReport,
  } = await import(pathToFileURL(path.join(root, "scripts", "summarize-aliyun-backend-cn-status.mjs")).href)
  const { PROBES, buildAppApiSmokeProbeSetId } = await import(
    pathToFileURL(path.join(root, "scripts", "smoke-app-api-production-cn.mjs")).href
  )
  const now = Date.parse("2026-07-11T12:00:00.000Z")
  const standardReport = buildStandardPostdeploySmokeReport(PROBES, APP_API_SMOKE_PROBE_SET_ID, {
    generatedAt: new Date(now).toISOString(),
  })
  assert.equal(typeof deriveExpectedDeploymentIdentity, "function")
  const readyImagePlan = {
    writebackPlan: { groups: [{ id: "imagePushAndDigest", ready: true }] },
    local: {
      ready: true,
      image: {
        sourceFreshness: {
          checked: true,
          status: "current",
          blockers: [],
        },
      },
      acr: { remoteDigest: deploymentIdentity.imageDigest },
    },
  }
  const readyCloudConfirmations = {
    local: {
      itemStatus: {
        runtime: {
          ready: true,
          blockers: [],
          deploymentIdentity: structuredClone(deploymentIdentity),
        },
      },
    },
  }
  const readyDeploymentGate = deriveExpectedDeploymentIdentity(readyImagePlan, readyCloudConfirmations, { now })
  const validate = (report, options = {}) => validatePostdeploySmokeReport(report, {
    now,
    deploymentGate: readyDeploymentGate,
    ...options,
  })
  const expectBlocked = (label, mutate) => {
    const report = structuredClone(standardReport)
    mutate(report)
    const validation = validate(report)
    assert.equal(validation.ready, false, label)
    assert.ok(validation.blockers.length > 0, `${label} should report blockers`)
    return validation
  }

  assert.match(APP_API_SMOKE_PROBE_SET_ID, /^app_api_smoke_probe_set_v1:35:[a-f0-9]{64}$/)
  assert.deepEqual(validate(standardReport), {
    ready: true,
    blockers: [],
    expectedBaseUrl: "https://api-cn.ipgongchang.xin",
    expectedProbeSetId: APP_API_SMOKE_PROBE_SET_ID,
    expectedProbeCount: PROBES.length,
    baseUrlMatchesExpected: true,
    probeSetIdMatchesExpected: true,
    probeCountMatchesExpected: true,
    deploymentIdentityMatchesExpected: true,
  })
  assert.deepEqual(readyDeploymentGate, {
    ready: true,
    blockers: [],
    identity: deploymentIdentity,
  })

  const selfAssertedOnly = structuredClone(standardReport)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    selfAssertedOnly.steps.remoteHealth.result[healthKey].observedDeploymentIdentity = null
  }
  selfAssertedOnly.steps.remoteHealth.result.provenanceErrorCode = "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE"
  selfAssertedOnly.provenanceErrorCode = "REMOTE_DEPLOYMENT_IDENTITY_UNAVAILABLE"
  assert.equal(validate(selfAssertedOnly).ready, false)
  assert.ok(validate(selfAssertedOnly).blockers.includes("remote_deployment_identity_missing"))

  const oneMissingObservation = structuredClone(standardReport)
  oneMissingObservation.steps.remoteHealth.result.health.observedDeploymentIdentity = null
  assert.ok(validate(oneMissingObservation).blockers.includes("remote_deployment_identity_missing"))

  const mixedRemoteIdentity = structuredClone(standardReport)
  mixedRemoteIdentity.steps.remoteHealth.result.strictHealth.observedDeploymentIdentity.saeVersionId = "sae-version-other"
  const mixedValidation = validate(mixedRemoteIdentity)
  assert.equal(mixedValidation.ready, false)
  assert.ok(mixedValidation.blockers.includes("remote_deployment_identity_mixed"))
  assert.equal(mixedValidation.blockers.join("\n").includes("sae-version-other"), false)

  const remoteExpectedMismatch = structuredClone(standardReport)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    remoteExpectedMismatch.steps.remoteHealth.result[healthKey].observedDeploymentIdentity.saeVersionId = "sae-version-other"
  }
  remoteExpectedMismatch.deploymentIdentity.saeVersionId = "sae-version-other"
  const mismatchValidation = validate(remoteExpectedMismatch)
  assert.equal(mismatchValidation.ready, false)
  assert.ok(mismatchValidation.blockers.includes("deployment_identity_mismatch"))
  assert.equal(mismatchValidation.blockers.join("\n").includes("sae-version-other"), false)

  const b02Unready = structuredClone(readyImagePlan)
  b02Unready.writebackPlan.groups[0].ready = false
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(b02Unready, readyCloudConfirmations).blockers,
    ["deployment_identity_b02_unready"],
  )
  const b02MissingLocalEvidence = structuredClone(readyImagePlan)
  b02MissingLocalEvidence.local.ready = false
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(b02MissingLocalEvidence, readyCloudConfirmations, { now }).blockers,
    ["deployment_identity_b02_unready"],
  )
  const b02DirtyRuntimeSource = structuredClone(readyImagePlan)
  b02DirtyRuntimeSource.local.image.sourceFreshness.status = "stale_runtime_source"
  b02DirtyRuntimeSource.local.image.sourceFreshness.blockers = ["image.sourceCommitMatchesHead"]
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(b02DirtyRuntimeSource, readyCloudConfirmations, { now }).blockers,
    ["deployment_identity_b02_unready"],
  )
  const b03Unready = structuredClone(readyCloudConfirmations)
  b03Unready.local.itemStatus.runtime.ready = false
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(readyImagePlan, b03Unready).blockers,
    ["deployment_identity_b03_unready"],
  )
  const digestMismatch = structuredClone(readyCloudConfirmations)
  digestMismatch.local.itemStatus.runtime.deploymentIdentity.imageDigest = `sha256:${"b".repeat(64)}`
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(readyImagePlan, digestMismatch).blockers,
    ["deployment_identity_digest_mismatch"],
  )
  const malformedRuntimeIdentity = structuredClone(readyCloudConfirmations)
  malformedRuntimeIdentity.local.itemStatus.runtime.deploymentIdentity.saeVersionId = "pending-version"
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(readyImagePlan, malformedRuntimeIdentity).blockers,
    ["deployment_identity_b03_invalid"],
  )
  const futureRuntimeIdentity = structuredClone(readyCloudConfirmations)
  futureRuntimeIdentity.local.itemStatus.runtime.deploymentIdentity.deploymentCompletedAt = "2099-01-01T00:00:00.000Z"
  assert.deepEqual(
    deriveExpectedDeploymentIdentity(readyImagePlan, futureRuntimeIdentity, { now }).blockers,
    ["deployment_identity_completed_in_future"],
  )
  for (const invalidNow of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, new Date(Number.NaN)]) {
    assert.deepEqual(
      deriveExpectedDeploymentIdentity(readyImagePlan, readyCloudConfirmations, { now: invalidNow }).blockers,
      ["validation_clock_invalid"],
    )
  }

  expectBlocked("old deployment digest", (report) => {
    report.deploymentIdentity.imageDigest = `sha256:${"c".repeat(64)}`
  })
  expectBlocked("old runtime identity", (report) => {
    report.deploymentIdentity.saeDeploymentId = "sae-change-order-old"
  })
  expectBlocked("smoke before deployment", (report) => {
    report.generatedAt = "2026-07-11T10:59:59.999Z"
  })
  assert.deepEqual(
    validatePostdeploySmokeReport(standardReport, {
      now,
      deploymentGate: deriveExpectedDeploymentIdentity(b02Unready, readyCloudConfirmations),
    }).blockers,
    ["deployment_identity_b02_unready"],
  )
  assert.deepEqual(
    validatePostdeploySmokeReport(standardReport, {
      now,
      deploymentGate: deriveExpectedDeploymentIdentity(readyImagePlan, b03Unready),
    }).blockers,
    ["deployment_identity_b03_unready"],
  )
  const noOutputFiles = structuredClone(standardReport)
  delete noOutputFiles.outputFiles
  assert.equal(validate(noOutputFiles).ready, false)
  assert.ok(validate(noOutputFiles).blockers.includes("report.outputFiles"))
  for (const field of Object.keys(standardReport.outputFiles)) {
    for (const [label, invalidPath] of [["empty", ""], ["whitespace", " \t\n "]]) {
      await t.test(`rejects ${field} ${label}`, () => {
        const report = structuredClone(standardReport)
        report.outputFiles[field] = invalidPath
        const validation = validate(report)
        assert.equal(validation.ready, false)
        assert.ok(validation.blockers.includes("report.outputFiles"))
        assert.deepEqual(validation.blockers, ["report.outputFiles"])
      })
    }
  }
  assert.equal(validatePostdeploySmokeReport("postdeploy_smoke failed=false no_errors appApiSmoke=true", { now }).ready, false)
  for (const invalidNow of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, new Date(Number.NaN)]) {
    assert.deepEqual(
      validatePostdeploySmokeReport(standardReport, {
        now: invalidNow,
        deploymentGate: readyDeploymentGate,
      }).blockers,
      ["validation_clock_invalid"],
    )
  }
  expectBlocked("report false", (report) => { report.ok = false })
  expectBlocked("invalid generatedAt", (report) => { report.generatedAt = "not-an-iso-timestamp" })
  expectBlocked("future generatedAt", (report) => { report.generatedAt = new Date(now + 5 * 60_000 + 1).toISOString() })
  expectBlocked("stale generatedAt", (report) => { report.generatedAt = new Date(now - 24 * 60 * 60_000 - 1).toISOString() })
  expectBlocked("year 2000 generatedAt", (report) => { report.generatedAt = "2000-01-01T00:00:00.000Z" })
  const futureDeployment = expectBlocked("future remote deployment completion", (report) => {
    for (const healthKey of ["healthz", "health", "strictHealth"]) {
      report.steps.remoteHealth.result[healthKey].observedDeploymentIdentity.deploymentCompletedAt = "2099-01-01T00:00:00.000Z"
    }
    report.deploymentIdentity.deploymentCompletedAt = "2099-01-01T00:00:00.000Z"
  })
  assert.ok(futureDeployment.blockers.includes("deployment_identity_completed_in_future"))
  expectBlocked("remote-health step false", (report) => { report.steps.remoteHealth.ok = false })
  expectBlocked("APP API step false", (report) => { report.steps.appApiSmoke.ok = false })
  expectBlocked("unknown top-level field", (report) => { report.forged = true })
  expectBlocked("unknown remote step field", (report) => { report.steps.remoteHealth.forged = true })
  expectBlocked("unknown remote result field", (report) => { report.steps.remoteHealth.result.forged = true })
  expectBlocked("unknown health summary field", (report) => { report.steps.remoteHealth.result.healthz.forged = true })
  expectBlocked("unknown APP step field", (report) => { report.steps.appApiSmoke.forged = true })
  expectBlocked("unknown APP result field", (report) => { report.steps.appApiSmoke.result.forged = true })
  expectBlocked("unknown output file field", (report) => { report.outputFiles.forged = "/tmp/forged" })
  expectBlocked("allowed missing", (report) => { report.allowedMissing = ["legalLinks"] })
  expectBlocked("remote allowed missing", (report) => { report.steps.remoteHealth.result.allowedMissing = ["legalLinks"] })
  expectBlocked("HTTP base URL", (report) => { report.baseUrl = "http://api-cn.ipgongchang.xin" })
  expectBlocked("wrong host", (report) => { report.baseUrl = "https://api-cn.example.com" })
  expectBlocked("remote result base URL", (report) => { report.steps.remoteHealth.result.baseUrl = "https://api-cn.example.com" })
  expectBlocked("APP API result base URL", (report) => { report.steps.appApiSmoke.result.baseUrl = "https://api-cn.example.com" })
  expectBlocked("missing runtime plan", (report) => { delete report.steps.appApiSmoke.result.runtimePlan })
  expectBlocked("local runtime plan", (report) => { report.steps.appApiSmoke.result.runtimePlan.localMode = true })
  expectBlocked("runtime RDS state", (report) => { report.steps.appApiSmoke.result.runtimePlan.aliyunRdsReady = true })
  expectBlocked("runtime unavailable count", (report) => { report.steps.appApiSmoke.result.runtimePlan.localRdsUnavailableExpected = 1 })
  expectBlocked("runtime plan extra field", (report) => { report.steps.appApiSmoke.result.runtimePlan.forged = true })
  expectBlocked("missing scopes", (report) => { delete report.steps.appApiSmoke.result.scopes })
  expectBlocked("scope count", (report) => { report.steps.appApiSmoke.result.scopes.auth += 1 })
  expectBlocked("scope extra field", (report) => { report.steps.appApiSmoke.result.scopes.forged = 1 })
  expectBlocked("old probe set", (report) => { report.steps.appApiSmoke.result.probeSetId = "app_api_smoke_probe_set_v1:31:old" })
  expectBlocked("tampered probe set", (report) => { report.steps.appApiSmoke.result.probeSetId = `${APP_API_SMOKE_PROBE_SET_ID}_tampered` })
  expectBlocked("body contract changed", (report) => {
    const changedProbes = PROBES.map((probe) => (
      probe.path === "/api/app/service-records/device-files/check"
        ? { ...probe, body: { files: [{ name: "fixture-file-a" }] } }
        : probe
    ))
    report.steps.appApiSmoke.result.probeSetId = buildAppApiSmokeProbeSetId(changedProbes)
  })
  expectBlocked("probe count", (report) => { report.steps.appApiSmoke.result.checkedProbes -= 1 })
  expectBlocked("missing probe", (report) => { report.steps.appApiSmoke.result.probes.pop() })
  expectBlocked("duplicate probe", (report) => {
    report.steps.appApiSmoke.result.probes[1] = structuredClone(report.steps.appApiSmoke.result.probes[0])
  })
  const lowercaseMethod = expectBlocked("lowercase probe method", (report) => {
    report.steps.appApiSmoke.result.probes[0].method = report.steps.appApiSmoke.result.probes[0].method.toLowerCase()
  })
  assert.doesNotMatch(lowercaseMethod.blockers.join("\n"), /\/api\//)
  expectBlocked("probe status", (report) => { report.steps.appApiSmoke.result.probes[0].status = 599 })
  expectBlocked("probe code", (report) => { report.steps.appApiSmoke.result.probes[0].code = "wrong_code" })
  expectBlocked("probe result shape", (report) => { delete report.steps.appApiSmoke.result.probes[3].code })
  expectBlocked("probe result unknown field", (report) => { report.steps.appApiSmoke.result.probes[3].forged = true })
  for (let probeIndex = 0; probeIndex < PROBES.length; probeIndex += 1) {
    expectBlocked(`probe ${probeIndex} wrong public code`, (report) => {
      report.steps.appApiSmoke.result.probes[probeIndex].code = `wrong_public_code_${probeIndex}`
    })
  }
  const learningProbeIndex = standardReport.steps.appApiSmoke.result.probes.findIndex((probe) => (
    probe.path === "/api/app/learning/progress"
  ))
  expectBlocked("learning auth code", (report) => {
    report.steps.appApiSmoke.result.probes[learningProbeIndex].code = "wrong_learning_code"
  })
  const untrustedProbePath = ["UNTRUSTED", "_PROBE_PATH_", "MUST_NOT_ECHO"].join("")
  const untrustedPathValidation = expectBlocked("untrusted probe path", (report) => {
    report.steps.appApiSmoke.result.probes[0].path = `/${untrustedProbePath}`
  })
  assert.equal(untrustedPathValidation.blockers.join("\n").includes(untrustedProbePath), false)
  assert.doesNotMatch(untrustedPathValidation.blockers.join("\n"), /\/api\//)
  for (const healthKey of ["healthz", "health", "strictHealth"]) {
    expectBlocked(`${healthKey} status`, (report) => { report.steps.remoteHealth.result[healthKey].status = 503 })
    expectBlocked(`${healthKey} false`, (report) => { report.steps.remoteHealth.result[healthKey].ok = false })
    expectBlocked(`${healthKey} missing`, (report) => { report.steps.remoteHealth.result[healthKey].missing = ["aliyunRds"] })
    expectBlocked(`${healthKey} empty checks`, (report) => { report.steps.remoteHealth.result[healthKey].checks = {} })
  }
  for (const [label, mutate] of [
    ["partial checks", (health) => { health.checks = { aliyunRds: true } }],
    ["wrong service", (health) => { health.service = "other-service" }],
    ["wrong env", (health) => { health.env = "production" }],
    ["wrong region", (health) => { health.region = "cn-shanghai" }],
    ["wrong mode", (health) => { health.mode = "legacy" }],
    ["checks missing mismatch", (health) => {
      health.checks.aliyunRds = false
      health.missing = []
      health.ok = true
    }],
    ["missing true check", (health) => {
      health.missing = ["aliyunRds"]
      health.ok = false
    }],
    ["ok missing mismatch", (health) => { health.ok = false }],
  ]) {
    const validation = expectBlocked(label, (report) => mutate(report.steps.remoteHealth.result.healthz))
    assert.equal(validation.deploymentIdentityMatchesExpected, true, `${label} keeps legal identity evidence`)
    assert.equal(reportHasAllProbes(standardReport, PROBES), true)
  }

  const tokenSentinel = ["sk", "review", "x".repeat(24)].join("-")
  const credentialUrlSentinel = ["postgres", "://", "reviewer", ":", "password", "@", "example.invalid/db"].join("")
  const sensitiveReport = structuredClone(standardReport)
  sensitiveReport.untrusted = { tokenSentinel, credentialUrlSentinel }
  assert.deepEqual(validate(sensitiveReport).blockers, ["report_sensitive_value"])
  const sensitiveKeyReport = structuredClone(standardReport)
  sensitiveKeyReport[tokenSentinel] = "redacted"
  assert.deepEqual(validate(sensitiveKeyReport).blockers, ["report_sensitive_value"])
})

test("backend status reads the structured postdeploy report without network access", async () => {
  const { APP_API_SMOKE_PROBE_SET_ID } = await import(
    pathToFileURL(path.join(root, "scripts", "summarize-aliyun-backend-cn-status.mjs")).href
  )
  const { PROBES } = await import(pathToFileURL(path.join(root, "scripts", "smoke-app-api-production-cn.mjs")).href)
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-postdeploy-status-fixture-"))
  const reportPath = path.join(tmpdir, "postdeploy-smoke.json")
  const ignoredFieldSentinel = ["IGNORED", "_REPORT_FIELD_", "MUST_NOT_ECHO"].join("")
  const standardReport = buildStandardPostdeploySmokeReport(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  standardReport.message = ignoredFieldSentinel
  standardReport.outputFiles.reportJson = `/tmp/${ignoredFieldSentinel}.json`
  fs.writeFileSync(reportPath, JSON.stringify(standardReport))

  const { output, stderr, report } = runBackendStatus(fixtureArgsWithPostdeploySmoke(reportPath))
  const postdeployTarget = report.backendTargets.find((target) => target.id === "B08_POSTDEPLOY_SMOKE")
  assert.equal(report.postdeploySmoke.exists, true)
  assert.equal(report.postdeploySmoke.ready, false)
  assert.deepEqual(report.postdeploySmoke.blockers, [
    "deployment_identity_b02_unready",
    "deployment_identity_b03_unready",
    "report.schema",
  ])
  assert.deepEqual(Object.keys(report.postdeploySmoke).sort(), [
    "baseUrlMatchesExpected",
    "blockers",
    "deploymentIdentityMatchesExpected",
    "exists",
    "expectedBaseUrl",
    "expectedProbeCount",
    "expectedProbeSetId",
    "probeCountMatchesExpected",
    "probeSetIdMatchesExpected",
    "ready",
  ])
  assert.equal("postdeploySmokeFile" in report.files, false)
  assert.equal(postdeployTarget.ready, false)
  assert.deepEqual(postdeployTarget.blockers, ["POSTDEPLOY_SMOKE_NOT_RUN"])
  assert.equal(report.summary.backendRequiredBlocking.includes("POSTDEPLOY_SMOKE_NOT_RUN"), true)
  assert.equal(output.includes(reportPath), false)
  assert.equal(output.includes(ignoredFieldSentinel), false)
  assert.equal(stderr.includes(reportPath), false)
  assert.equal(stderr.includes(ignoredFieldSentinel), false)

  const malformedInputSentinel = ["SENSITIVE", "_INPUT_SENTINEL_", "MUST_NOT_BE_ECHOED"].join("")
  fs.writeFileSync(reportPath, `{"credential":"${malformedInputSentinel}"`)
  const malformedResult = runBackendStatus(fixtureArgsWithPostdeploySmoke(reportPath))
  assert.equal(malformedResult.report.postdeploySmoke.exists, true)
  assert.equal(malformedResult.report.postdeploySmoke.ready, false)
  assert.deepEqual(malformedResult.report.postdeploySmoke.blockers, [
    "deployment_identity_b02_unready",
    "deployment_identity_b03_unready",
    "invalid_json",
  ])
  assert.equal(malformedResult.output.includes(malformedInputSentinel), false)
  assert.equal(malformedResult.stderr.includes(malformedInputSentinel), false)
  assertNoSecretLikeValues(malformedResult.output)

  const tokenSentinel = ["sk", "review", "z".repeat(24)].join("-")
  const credentialUrlSentinel = ["postgres", "://", "reviewer", ":", "password", "@", "example.invalid/db"].join("")
  const pathSentinel = ["UNTRUSTED", "_JSON_PATH_", "MUST_NOT_ECHO"].join("")
  const messageSentinel = ["UNTRUSTED", "_JSON_MESSAGE_", "MUST_NOT_ECHO"].join("")
  const sensitiveReport = buildStandardPostdeploySmokeReport(PROBES, APP_API_SMOKE_PROBE_SET_ID)
  sensitiveReport.baseUrl = credentialUrlSentinel
  sensitiveReport.message = messageSentinel
  sensitiveReport.outputFiles.reportJson = `/tmp/${pathSentinel}.json`
  sensitiveReport.steps.appApiSmoke.result.probeSetId = tokenSentinel
  sensitiveReport.steps.appApiSmoke.result.probes[0].path = `/${pathSentinel}`
  fs.writeFileSync(reportPath, JSON.stringify(sensitiveReport))
  const sensitiveResult = runBackendStatus(fixtureArgsWithPostdeploySmoke(reportPath))
  const sensitiveOutput = `${sensitiveResult.output}\n${sensitiveResult.stderr}`
  assert.equal(sensitiveResult.report.postdeploySmoke.ready, false)
  assert.deepEqual(sensitiveResult.report.postdeploySmoke.blockers, ["report_sensitive_value"])
  for (const sentinel of [tokenSentinel, credentialUrlSentinel, pathSentinel, messageSentinel]) {
    assert.equal(sensitiveOutput.includes(sentinel), false)
  }
  assertNoSecretLikeValues(sensitiveOutput)
})

test("backend status does not reuse an external child cache across invocations", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-status-cache-isolation-"))
  const sharedCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-status-shared-cache-"))
  const cloudConfirmationsPath = path.join(tmpdir, "cloud-confirmations.json")
  const cloudConfirmations = readJson("tests", "fixtures", "aliyun-user-action-brief", "cloud-confirmations.fixture.json")
  cloudConfirmations.items.runtime.evidence = ""
  fs.writeFileSync(cloudConfirmationsPath, JSON.stringify(cloudConfirmations))
  const args = [...fixtureArgs]
  args[args.indexOf("--cloud-confirmations") + 1] = cloudConfirmationsPath
  const sharedCacheEnv = {
    ...process.env,
    MEIYE_ALIYUN_RUN_JSON_CACHE_DIR: sharedCacheRoot,
  }

  const first = runBackendStatus(args, sharedCacheEnv)
  assert.ok(first.report.cloudConfirmations.backendBlockers.includes("runtime:empty:evidence"))

  cloudConfirmations.items.runtime.evidence = "fixture_runtime_fresh_for_second_invocation"
  fs.writeFileSync(cloudConfirmationsPath, JSON.stringify(cloudConfirmations))
  const second = runBackendStatus(args, sharedCacheEnv)
  assert.equal(second.report.cloudConfirmations.backendBlockers.includes("runtime:empty:evidence"), false)
  assert.ok(second.report.cloudConfirmations.backendBlockers.includes("runtime:confirmed"))

  const pureImportCachePath = path.join(tmpdir, "pure-import-must-not-create-cache")
  const pureImport = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `await import(${JSON.stringify(pathToFileURL(path.join(root, "scripts", "summarize-aliyun-backend-cn-status.mjs")).href)})`,
  ], {
    cwd: root,
    env: {
      ...process.env,
      MEIYE_ALIYUN_RUN_JSON_CACHE_DIR: pureImportCachePath,
    },
    encoding: "utf8",
  })
  assert.equal(pureImport.status, 0)
  assert.equal(pureImport.stdout, "")
  assert.equal(pureImport.stderr, "")
  assert.equal(fs.existsSync(pureImportCachePath), false)
})

test("Aliyun backend-cn status reflects current backend-only production state", () => {
  const { output, report } = runBackendStatus(fixtureArgs)
  const targetById = new Map(report.backendTargets.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.canDeployBackendNow, false)
  assert.deepEqual(report.summary.backendRequiredBlocking, [
    "ACR_IMAGE_REGISTRY_NOT_READY",
    "API_DOMAIN_HTTPS_ICP_NOT_READY",
    "ASSET_DOMAIN_HTTPS_ICP_NOT_READY",
    "DATABASE_URL_CN",
    "ENV_IMPORT_NOT_READY",
    "OSS_RAM_STS_NOT_READY",
    "POSTDEPLOY_SMOKE_NOT_RUN",
    "RDS_MIGRATION_EVIDENCE_NOT_READY",
    "SAE_RUNTIME_NOT_READY",
    "SLS_ALERTS_NOT_READY",
  ])
  assert.equal(report.summary.backendTargetReady, "0/8")
  assert.equal(report.summary.backendEvidenceScope.cloudConfirmationsBackendReady, "0/6")
  assert.match(report.summary.backendEvidenceScope.cloudResourceEvidenceReady, /^[01]\/7$/)
  assert.equal(report.summary.evidenceWritebackReady, "1/4")
  assert.equal(
    report.summary.evidenceWritebackTotalGaps,
    Object.values(report.summary.evidenceWritebackGapSummary).reduce((total, count) => total + count, 0),
  )
  assert.deepEqual(report.summary.evidenceWritebackGapSummary, {
    rdsMigrationGaps: 16,
    cloudInventoryResultGaps: 0,
    cloudConfirmationGaps: 16,
    imagePublishGaps: 8,
  })
  assertIncludesAll(report.summary.evidenceWritebackCanStartNowPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assertIncludesAll(report.summary.evidenceWritebackBlockedByDependencyPacketIds, [
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
  ])
  assertInExactlyOnePacketGroup(
    "P04_ACR_IMAGE_AND_PULL",
    report.summary.evidenceWritebackCanStartNowPacketIds,
    report.summary.evidenceWritebackBlockedByDependencyPacketIds,
  )
  assertIncludesAll(report.summary.sensitiveActionBlockedIds, [
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assertIncludesAll(report.summary.actionTimeConfirmationRequiredIds, [
    "S05_OSS_RAM_SECRET_OR_STS",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "S08_ALIYUN_RDS_DATABASE_URL",
  ])
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.readySecretEnvVariableCount, 20)
  assert.equal(report.summary.credentialPasswordInterventionRequired, true)
  assertIncludesAll(report.summary.credentialPasswordInterventionActionIds, [
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])

  assert.equal(report.rdsMigration.localExists, true)
  assert.equal(report.rdsMigration.localReady, false)
  assert.equal(report.rdsMigration.rdsMigrationPhaseReady, "0/5")
  assert.deepEqual(report.rdsMigration.rdsMigrationNextPhaseIds, [
    "source_inventory_preflight",
    "compatibility_review",
    "rds_instance_and_secret",
  ])
  assert.ok(report.rdsMigration.blockers.includes("rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(report.rdsMigration.blockers.includes("migration.rollbackValidationPassed"))
  assert.equal(report.rdsMigration.postgresDataAccessAdapterDetected, true)

  assert.equal(report.cloudConfirmations.backendReady, "0/6")
  assert.deepEqual(report.cloudConfirmations.backendMissingItems, [])
  assert.ok(report.cloudConfirmations.backendBlockers.includes("runtime:confirmed"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("oss:ramLeastPrivilege"))
  assert.ok(report.cloudConfirmations.backendBlockers.includes("envImport:confirmed"))
  assert.match(report.cloudResources.evidenceReady, /^[01]\/7$/)
  assertIncludesAll(report.cloudResources.blockedIds, [
    "R01_SAE_RUNTIME",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ])
  assert.ok(
    report.cloudResources.blockedIds.includes("R02_ACR_IMAGE_REGISTRY") ||
      report.cloudResources.observedPartial.includes("R02_ACR_IMAGE_REGISTRY"),
  )

  assert.equal(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").ready, false)
  assert.ok(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("DATABASE_URL_CN"))
  assert.ok(targetById.get("B01_RDS_POSTGRES_DATA_LAYER").blockers.includes("RDS_MIGRATION_EVIDENCE_NOT_READY"))
  assert.equal(targetById.get("B02_ACR_IMAGE_REGISTRY").ready, false)
  assert.equal(targetById.get("B03_SAE_RUNTIME").ready, false)
  assert.ok(targetById.get("B04_DOMAINS_HTTPS_ICP").blockers.includes("API_DOMAIN_HTTPS_ICP_NOT_READY"))
  assert.equal(targetById.get("B05_OSS_RAM_STS").ready, false)
  assert.ok(targetById.get("B05_OSS_RAM_STS").blockers.includes("OSS_RAM_STS_NOT_READY"))
  assert.equal(targetById.get("B06_ENV_IMPORT").ready, false)
  assert.ok(targetById.get("B06_ENV_IMPORT").blockers.includes("ENV_IMPORT_NOT_READY"))
  assert.equal(targetById.get("B07_SLS_ALERTS").ready, false)
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").blockers.includes("POSTDEPLOY_SMOKE_NOT_RUN"))
  assert.equal(report.postdeploySmoke.exists, false)
  assert.equal(report.postdeploySmoke.ready, false)
  assert.deepEqual(report.postdeploySmoke.blockers, [
    "deployment_identity_b02_unready",
    "deployment_identity_b03_unready",
    "file_missing",
  ])
  assert.equal(report.postdeploySmoke.baseUrlMatchesExpected, false)
  assert.equal(report.postdeploySmoke.probeSetIdMatchesExpected, false)
  assert.equal(report.postdeploySmoke.probeCountMatchesExpected, false)
  assert.equal(report.postdeploySmoke.deploymentIdentityMatchesExpected, false)
  assert.equal("postdeploySmokeFile" in report.files, false)
  assert.ok(report.strictVerificationOrder.some((command) => (
    command.includes("--postdeploy-smoke") && command.includes("deploy/aliyun-production-cn.postdeploy-smoke.local.json")
  )))
  assert.equal(JSON.stringify(report).includes(missingPostdeploySmokeFile), false)
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").currentEvidence.some((item) => (
    /^expectedAppApiSmokeProbeSetId=app_api_smoke_probe_set_v1:35:[a-f0-9]{64}$/.test(item)
  )))
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").currentEvidence.includes("baseUrlMatchesExpected=false"))
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").currentEvidence.includes("probeSetIdMatchesExpected=false"))
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").currentEvidence.includes("probeCountMatchesExpected=false"))
  assert.ok(targetById.get("B08_POSTDEPLOY_SMOKE").currentEvidence.includes("deploymentIdentityMatchesExpected=false"))
  assert.doesNotMatch(targetById.get("B08_POSTDEPLOY_SMOKE").currentEvidence.join("\n"), /31[_-]?probes/)

  assert.deepEqual(report.credentialIntervention.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.credentialPasswordIntervention.required, true)
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assertIncludesAll(report.actionAuthorization.nextActionTimeConfirmationPacketIds, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assertIncludesAll(report.actionAuthorization.canStartNowPackets, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assertIncludesAll(report.actionAuthorization.blockedByPacketDependencies, [
    "P06_ENV_IMPORT",
    "P07_DOMAIN_DNS_HTTPS",
    "P08_SAE_RUNTIME_SLS",
  ])
  assert.ok(report.summary.wechatDeferredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.equal(report.deferredScope.wechatOpenMobileApp.excludedFromBackendRequiredBlocking, true)
  assertNoSecretLikeValues(output)
})

test("Aliyun backend-cn status markdown states current backend-only blockers", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-cn-status-"))
  const markdownPath = path.join(tmpdir, "backend-cn-status.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-backend-cn-status.mjs",
    ...fixtureArgs,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    env: commandEnv(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /canDeployBackendNow: false/)
  assert.match(markdown, /backendRequiredBlocking: ACR_IMAGE_REGISTRY_NOT_READY/)
  assert.match(markdown, /backendReady: 0\/6/)
  assert.match(markdown, /cloudConfirmationsBackendReady: 0\/6/)
  assert.match(markdown, /cloudResourceEvidenceReady: [01]\/7/)
  assert.match(markdown, /totalGaps: 40/)
  assert.match(markdown, /rdsMigrationGaps: 16/)
  assert.match(markdown, /cloudConfirmationGaps: 16/)
  assert.match(markdown, /canStartNowPacketIds: .*P11_ALIYUN_RDS_DATA_MIGRATION.*P05_OSS_RAM_STS/)
  assert.match(markdown, /blockedByDependencyPacketIds: .*P06_ENV_IMPORT.*P07_DOMAIN_DNS_HTTPS.*P08_SAE_RUNTIME_SLS/)
  assert.match(markdown, /rdsMigration: ready=false; gaps=16; packets=P11_ALIYUN_RDS_DATA_MIGRATION/)
  assert.match(markdown, /## Structured Postdeploy Smoke/)
  assert.match(markdown, /ready: false/)
  assert.match(markdown, /blockers: deployment_identity_b02_unready, deployment_identity_b03_unready, file_missing/)
  assert.match(markdown, /expectedProbeSetId: app_api_smoke_probe_set_v1:35:[a-f0-9]{64}/)
  assert.match(markdown, /B01_RDS_POSTGRES_DATA_LAYER/)
  assert.match(markdown, /blockers: DATABASE_URL_CN, RDS_MIGRATION_EVIDENCE_NOT_READY/)
  assert.match(markdown, /B05_OSS_RAM_STS/)
  assert.match(markdown, /B06_ENV_IMPORT/)
  assert.match(markdown, /Credential Intervention/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /required: true/)
  assert.match(markdown, /wechatOpenMobileApp: deferred_after_backend_online/)
  assert.match(markdown, /nextActionTimeConfirmationPacketIds: .*P11_ALIYUN_RDS_DATA_MIGRATION.*P05_OSS_RAM_STS/)
  assert.match(markdown, /POSTDEPLOY_SMOKE_NOT_RUN/)
  assert.match(markdown, /corepack pnpm aliyun:rds:migration:evidence:strict/)
  assert.match(markdown, /corepack pnpm aliyun:domain:strict/)
  assertNoSecretLikeValues(output + markdown)
})
