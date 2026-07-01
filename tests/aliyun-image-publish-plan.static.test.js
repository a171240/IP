const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const fixturePath = path.join(root, "tests", "fixtures", "aliyun-user-action-brief", "image-publish.fixture.json")
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|docker login .* -p\s+\S{8,}|AccessKeySecret\s*[:=]\s*\S{8,}|registry[_ -]?password\s*[:=]\s*\S{8,})/i

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

function runImagePlan(args = []) {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--template",
    fixturePath,
    "--local",
    fixturePath,
    "--skip-docker-probe",
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

test("Aliyun image publish plan test path is fixture-first and skips Docker probes", () => {
  const checker = read("scripts", "check-aliyun-image-publish-plan.mjs")

  assert.match(checker, /--template/)
  assert.match(checker, /--local/)
  assert.match(checker, /--skip-docker-probe/)
  assert.match(checker, /function skippedDockerContext/)
  assert.match(checker, /function skippedLocalDockerImage/)
  assert.match(checker, /vpc_registry_from_aliyun_network/)
  assert.match(checker, /acr_repo_sync_existing_source_tag/)
  assert.match(checker, /SOURCE_FRESHNESS_BLOCKER/)
  assert.match(checker, /cloudBuildRunner\?\.lastSuccessfulBuild\?\.sourceCommit/)
  assert.match(checker, /runGit\(\["diff", "--name-only"/)
  assert.match(checker, /image\.sourceCommitMatchesHead/)
})

test("Aliyun image publish plan reports fixture blockers without secret values", () => {
  const { output, report } = runImagePlan(["--allow-incomplete"])

  assert.equal(report.ok, false)
  assert.equal(report.ready, false)
  assert.equal(report.allowIncomplete, true)
  assert.equal(report.skipDockerProbe, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.summary.templateReady, true)
  assert.equal(report.summary.localExists, true)
  assert.equal(report.summary.localReady, false)
  assert.equal(report.template.ready, true)
  assert.equal(report.local.image.localTag, "meiye-huajing-app-api:production-cn")
  assert.equal(report.local.image.localDigestReady, true)
  assert.equal(report.local.acr.registryHost, "meiye-huajing-app-api-registry.cn-hangzhou.cr.aliyuncs.com")
  assert.equal(report.local.acr.publicNetworkEntranceEnabled, false)
  assert.equal(report.local.acr.imagePushed, false)
  assert.equal(report.local.acr.digestVerified, false)
  assert.equal(report.local.runtime.target, "SAE")
  assert.equal(report.local.runtime.appName, "meiye-huajing-app-api-production-cn")
  assert.equal(report.local.runtime.remoteImageConfigured, false)
  assert.equal(report.local.runtime.imagePullConfigured, false)
  assert.equal(report.dockerContext.status, "skipped_by_explicit_flag")
  assert.equal(report.localDockerImage.status, "skipped_by_explicit_flag")

  assert.ok(report.local.blockers.includes("acr.remoteDigest=sha256"))
  assert.ok(report.local.blockers.includes("acr.imagePushed"))
  assert.ok(report.local.blockers.includes("acr.digestVerified"))
  assert.ok(report.local.blockers.includes("acr.pushNetworkPath"))
  assert.ok(report.local.blockers.includes("runtime.confirmed"))
  assert.ok(report.local.blockers.includes("runtime.remoteImageConfigured"))
  assert.ok(report.local.blockers.includes("runtime.imagePullConfigured"))
  assert.deepEqual(report.summary.writebackBlockingGroups, [
    "imagePushAndDigest",
    "saeRuntimeImagePull",
  ])
  assert.deepEqual(report.summary.requiredAuthorizationPackets, [
    "P04_ACR_IMAGE_AND_PULL",
    "P08_SAE_RUNTIME_SLS",
  ])

  assert.equal(report.executionReadiness.purchaseAndRepositoryReady, true)
  assert.equal(report.executionReadiness.p04StrictReady, false)
  assert.equal(report.executionReadiness.canStartP04AfterActionTimeConfirmation, true)
  assert.equal(report.executionReadiness.dockerDaemonReady, false)
  assert.equal(report.executionReadiness.nextOperatorDecision, "choose_vpc_runner_or_existing_acr_source_tag")
  assert.deepEqual(report.executionReadiness.forbiddenTransferPathIds, ["public_registry"])
  assert.deepEqual(report.pushNetworkPlan.recommendedPathIds, [])
  assert.equal(report.pushNetworkPlan.selectedReady, false)
  assert.ok(report.pushNetworkPlan.selectedBlockers.includes("acr.pushNetworkPath"))

  const pushCandidateById = new Map(report.pushNetworkPlan.candidates.map((item) => [item.id, item]))
  assert.equal(pushCandidateById.get("public_registry").canUseNow, false)
  assert.ok(pushCandidateById.get("public_registry").blockers.includes("acr.publicNetworkEntranceEnabled=false"))
  assert.equal(pushCandidateById.get("vpc_registry_from_aliyun_network").canUseNow, false)
  assert.ok(pushCandidateById.get("vpc_registry_from_aliyun_network").blockers.includes("acr.vpcEndpoint"))
  assert.ok(pushCandidateById.get("vpc_registry_from_aliyun_network").blockers.includes("acr.cloudBuildRunner"))
  assert.equal(pushCandidateById.get("acr_repo_sync_existing_source_tag").canUseNow, false)
  assert.deepEqual(pushCandidateById.get("acr_repo_sync_existing_source_tag").blockers, [
    "acr.repoSyncSource",
  ])
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun image publish plan strict mode fails closed on fixture blockers", () => {
  const result = spawnSync(process.execPath, [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--template",
    fixturePath,
    "--local",
    fixturePath,
    "--skip-docker-probe",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(result.stdout)

  assert.equal(result.status, 1)
  assert.equal(report.ok, false)
  assert.equal(report.ready, false)
  assert.equal(report.allowIncomplete, false)
  assert.equal(report.skipDockerProbe, true)
  assert.equal(report.executionReadiness.p04StrictReady, false)
  assert.ok(report.writebackPlan.blockingGroups.includes("imagePushAndDigest"))
  assert.ok(report.writebackPlan.blockingGroups.includes("saeRuntimeImagePull"))
  assert.doesNotMatch(result.stdout + result.stderr, secretLike)
})

test("Aliyun image publish plan fails closed when current-source claim lacks source commit proof", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-image-source-freshness-"))
  const localPath = path.join(tmpdir, "image-publish.local.json")
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  fixture.image.remoteDigestCoversCurrentSource = true
  fixture.acr.cloudBuildRunner = {
    ready: true,
    status: "completed",
    lastSuccessfulBuild: {
      sourceCommit: "",
      sourceTarSha256: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      remoteDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    },
  }
  fs.writeFileSync(localPath, JSON.stringify(fixture, null, 2))

  try {
    const output = execFileSync(process.execPath, [
      "scripts/check-aliyun-image-publish-plan.mjs",
      "--template",
      fixturePath,
      "--local",
      localPath,
      "--skip-docker-probe",
      "--allow-incomplete",
    ], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    })
    const report = JSON.parse(output)

    assert.equal(report.local.image.sourceFreshness.status, "missing_source_commit")
    assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"))
    assert.ok(report.writebackPlan.blockingGroups.includes("imagePushAndDigest"))
    assert.doesNotMatch(output, secretLike)
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  }
})
