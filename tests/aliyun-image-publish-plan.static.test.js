/* eslint-disable @typescript-eslint/no-require-imports */

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

function nulTerminatePaths(value) {
  const paths = String(value || "").split(/\r?\n/).filter(Boolean)
  return paths.length > 0 ? Buffer.from(`${paths.join("\0")}\0`, "utf8") : Buffer.alloc(0)
}

function runImagePlanWithFakeGit({
  sourceCommit = "a".repeat(40),
  head = "a".repeat(40),
  tracked = "",
  trackedNoRenames = tracked,
  untracked = "",
  committed = "",
  committedNoRenames = committed,
  failCommand = "",
} = {}) {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-image-source-git-fixture-"))
  const binDir = path.join(tmpdir, "bin")
  const localPath = path.join(tmpdir, "image-publish.local.json")
  fs.mkdirSync(binDir)
  const trackedZPath = path.join(tmpdir, "tracked.z")
  const committedZPath = path.join(tmpdir, "committed.z")
  const untrackedZPath = path.join(tmpdir, "untracked.z")
  fs.writeFileSync(trackedZPath, nulTerminatePaths(trackedNoRenames))
  fs.writeFileSync(committedZPath, nulTerminatePaths(committedNoRenames))
  fs.writeFileSync(untrackedZPath, nulTerminatePaths(untracked))
  const fakeGitPath = path.join(binDir, "git")
  fs.writeFileSync(fakeGitPath, `#!/bin/sh
case "$*" in
  "rev-parse HEAD") printf '%s\\n' "$FAKE_HEAD" ;;
  "rev-parse --verify "*) printf '%s\\n' "$FAKE_SOURCE_COMMIT" ;;
  "diff --name-only --no-renames -z HEAD --")
    if [ "$FAKE_FAIL_COMMAND" = "dirty" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    command cat "$FAKE_TRACKED_Z_FILE"
    ;;
  "diff --name-only --no-renames HEAD --")
    if [ "$FAKE_FAIL_COMMAND" = "dirty" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    printf '%s' "$FAKE_TRACKED_NO_RENAMES"
    ;;
  "diff --name-only HEAD --")
    if [ "$FAKE_FAIL_COMMAND" = "dirty" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    printf '%s' "$FAKE_TRACKED"
    ;;
  "ls-files --others --exclude-standard")
    if [ "$FAKE_FAIL_COMMAND" = "untracked" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    printf '%s' "$FAKE_UNTRACKED"
    ;;
  "ls-files --others --exclude-standard -z")
    if [ "$FAKE_FAIL_COMMAND" = "untracked" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    command cat "$FAKE_UNTRACKED_Z_FILE"
    ;;
  "diff --name-only --no-renames -z "*".."*" --")
    if [ "$FAKE_FAIL_COMMAND" = "committed" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    command cat "$FAKE_COMMITTED_Z_FILE"
    ;;
  "diff --name-only --no-renames "*".."*" --")
    if [ "$FAKE_FAIL_COMMAND" = "committed" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    printf '%s' "$FAKE_COMMITTED_NO_RENAMES"
    ;;
  "diff --name-only "*".."*" --")
    if [ "$FAKE_FAIL_COMMAND" = "committed" ]; then printf '%s\\n' "$FAKE_GIT_ERROR_SENTINEL" >&2; exit 9; fi
    printf '%s' "$FAKE_COMMITTED"
    ;;
  *) printf '%s\\n' "unexpected fake git invocation" >&2; exit 10 ;;
esac
`)
  fs.chmodSync(fakeGitPath, 0o700)
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
  fixture.image.remoteDigestCoversCurrentSource = true
  fixture.acr.cloudBuildRunner = {
    ready: true,
    status: "completed",
    lastSuccessfulBuild: {
      sourceCommit,
      sourceTarSha256: `sha256:${"1".repeat(64)}`,
      remoteDigest: `sha256:${"2".repeat(64)}`,
    },
  }
  fs.writeFileSync(localPath, JSON.stringify(fixture, null, 2))
  const result = spawnSync(process.execPath, [
    "scripts/check-aliyun-image-publish-plan.mjs",
    "--template",
    fixturePath,
    "--local",
    localPath,
    "--skip-docker-probe",
    "--allow-incomplete",
  ], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      FAKE_HEAD: head,
      FAKE_SOURCE_COMMIT: sourceCommit,
      FAKE_TRACKED: tracked,
      FAKE_TRACKED_NO_RENAMES: trackedNoRenames,
      FAKE_UNTRACKED: untracked,
      FAKE_COMMITTED: committed,
      FAKE_COMMITTED_NO_RENAMES: committedNoRenames,
      FAKE_TRACKED_Z_FILE: trackedZPath,
      FAKE_COMMITTED_Z_FILE: committedZPath,
      FAKE_UNTRACKED_Z_FILE: untrackedZPath,
      FAKE_FAIL_COMMAND: failCommand,
      FAKE_GIT_ERROR_SENTINEL: "PRIVATE_PERSON_<script>git</script>_opaque_credential_24680",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  try {
    assert.equal(result.status, 0, result.stderr)
    return {
      output: `${result.stdout}\n${result.stderr}`,
      report: JSON.parse(result.stdout),
    }
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true })
  }
}

function writeRepoFile(repo, relativePath, content) {
  const filePath = path.join(repo, ...relativePath.split("/"))
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim()
}

function runImagePlanInRealGit(mode, runtimePathOverride = "") {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-image-unicode-git-"))
  const scriptPath = path.join(repo, "scripts", "check-aliyun-image-publish-plan.mjs")
  const localPath = path.join(repo, "image-publish.local.json")
  const trackedUnicodePath = runtimePathOverride || "app/专业/route.ts"
  const untrackedUnicodePath = runtimePathOverride || "public/课程/new.png"
  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
    fs.copyFileSync(path.join(root, "scripts", "check-aliyun-image-publish-plan.mjs"), scriptPath)
    git(repo, ["init", "--quiet"])
    git(repo, ["config", "user.name", "Codex Test"])
    git(repo, ["config", "user.email", "codex-test@example.invalid"])
    git(repo, ["config", "core.quotepath", "true"])
    writeRepoFile(repo, ".gitignore", "image-publish.local.json\n")
    writeRepoFile(repo, "README.md", "unicode inventory fixture\n")
    if (mode === "staged" || mode === "unstaged") {
      writeRepoFile(repo, trackedUnicodePath, "export const version = 1\n")
    }
    git(repo, ["add", "-A"])
    git(repo, ["commit", "--quiet", "-m", "baseline"])
    const sourceCommit = git(repo, ["rev-parse", "HEAD"])

    if (mode === "committed") {
      writeRepoFile(repo, trackedUnicodePath, "export const version = 2\n")
      git(repo, ["add", trackedUnicodePath])
      git(repo, ["commit", "--quiet", "-m", "unicode runtime"])
    } else if (mode === "staged") {
      writeRepoFile(repo, trackedUnicodePath, "export const version = 2\n")
      git(repo, ["add", trackedUnicodePath])
    } else if (mode === "unstaged") {
      writeRepoFile(repo, trackedUnicodePath, "export const version = 2\n")
    } else if (mode === "untracked") {
      writeRepoFile(repo, untrackedUnicodePath, "png-fixture")
    } else {
      throw new Error(`unsupported real-git mode: ${mode}`)
    }

    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"))
    fixture.image.remoteDigestCoversCurrentSource = true
    fixture.acr.cloudBuildRunner = {
      ready: true,
      status: "completed",
      lastSuccessfulBuild: {
        sourceCommit,
        sourceTarSha256: `sha256:${"1".repeat(64)}`,
        remoteDigest: `sha256:${"2".repeat(64)}`,
      },
    }
    fs.writeFileSync(localPath, JSON.stringify(fixture, null, 2))
    const result = spawnSync(process.execPath, [
      scriptPath,
      "--template",
      fixturePath,
      "--local",
      localPath,
      "--skip-docker-probe",
      "--allow-incomplete",
    ], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    })
    assert.equal(result.status, 0, result.stderr)
    return {
      report: JSON.parse(result.stdout),
      runtimePath: mode === "untracked" ? untrackedUnicodePath : trackedUnicodePath,
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true })
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

test("Aliyun image source freshness inventories staged, unstaged, and untracked runtime inputs before the HEAD fast path", () => {
  const runtimeScenarios = [
    ["staged", { tracked: "app/api/runtime/route.ts\n" }],
    ["unstaged", { tracked: "lib/runtime.server.ts\n" }],
    ["untracked", { untracked: "components/runtime-card.tsx\n" }],
  ]
  for (const [label, inventory] of runtimeScenarios) {
    const { report } = runImagePlanWithFakeGit(inventory)
    assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"), label)
    assert.ok(report.local.image.sourceFreshness.runtimeChangedFileCount > 0, label)
  }

  const playbookScenarios = [
    ["staged playbook", { tracked: "playbooks/default.json\n" }],
    ["unstaged playbook", { tracked: "playbooks/default.json\n" }],
    ["untracked playbook", { untracked: "playbooks/default.json\n" }],
    ["committed playbook", { sourceCommit: "b".repeat(40), committed: "playbooks/default.json\n" }],
  ]
  for (const [label, inventory] of playbookScenarios) {
    const { report } = runImagePlanWithFakeGit(inventory)
    assert.equal(report.local.image.sourceFreshness.status, "stale_runtime_source", label)
    assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"), label)
    assert.ok(report.local.image.sourceFreshness.runtimeChangedFiles.includes("playbooks/default.json"), label)
  }

  const buildInputs = [
    "contexts/runtime-context.tsx",
    "hooks/use-runtime.ts",
    "styles/runtime.css",
    "types/runtime.ts",
    "proxy.ts",
    "instrumentation.ts",
    "next.config.mjs",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "tsconfig.json",
    "package.json",
    "pnpm-lock.yaml",
    "Dockerfile",
    ".dockerignore",
    "scripts/strict-build.mjs",
    "scripts/check-backend-release-package.mjs",
    "scripts/required-professional-learning-rendered-assets.json",
    "playbooks/default.json",
  ]
  const buildResult = runImagePlanWithFakeGit({ tracked: `${buildInputs.join("\n")}\n` }).report
  assert.ok(buildResult.local.blockers.includes("image.sourceCommitMatchesHead"))
  assert.equal(buildResult.local.image.sourceFreshness.runtimeChangedFileCount, buildInputs.length)

  const evidenceOnly = runImagePlanWithFakeGit({
    tracked: [
      "docs/review.md",
      "tests/review.static.test.js",
      "deploy/aliyun-production-cn.review.json",
      "scripts/run-aliyun-postdeploy-smoke.mjs",
    ].join("\n") + "\n",
  }).report
  assert.equal(evidenceOnly.local.blockers.includes("image.sourceCommitMatchesHead"), false)
  assert.ok(evidenceOnly.local.image.sourceFreshness.warnings.includes("image.sourceDirtyHasNoRuntimeFiles"))
})

test("Aliyun image source freshness blocks committed runtime deltas and redacts git failures", () => {
  const committed = runImagePlanWithFakeGit({
    sourceCommit: "b".repeat(40),
    committed: "lib/committed-runtime.server.ts\n",
  }).report
  assert.ok(committed.local.blockers.includes("image.sourceCommitMatchesHead"))
  assert.ok(committed.local.image.sourceFreshness.runtimeChangedFiles.includes("lib/committed-runtime.server.ts"))

  const gitFailure = runImagePlanWithFakeGit({ failCommand: "dirty" })
  assert.ok(gitFailure.report.local.blockers.includes("image.sourceCommitMatchesHead"))
  assert.equal(gitFailure.report.local.image.sourceFreshness.status, "git_inventory_unavailable")
  assert.equal(gitFailure.output.includes("PRIVATE_PERSON_<script>git</script>_opaque_credential_24680"), false)
  assert.equal(Object.hasOwn(gitFailure.report.local.image.sourceFreshness, "error"), false)
})

test("Aliyun image source freshness keeps runtime endpoints for tracked and committed cross-directory renames", () => {
  const scenarios = [
    ["tracked runtime to docs", {
      tracked: "docs/runtime-route.md\n",
      trackedNoRenames: "app/api/runtime/route.ts\ndocs/runtime-route.md\n",
    }, "app/api/runtime/route.ts"],
    ["tracked docs to runtime", {
      tracked: "app/api/runtime/route.ts\n",
      trackedNoRenames: "docs/runtime-route.md\napp/api/runtime/route.ts\n",
    }, "app/api/runtime/route.ts"],
    ["committed runtime to docs", {
      sourceCommit: "b".repeat(40),
      committed: "docs/runtime-repository.md\n",
      committedNoRenames: "lib/runtime-repository.server.ts\ndocs/runtime-repository.md\n",
    }, "lib/runtime-repository.server.ts"],
    ["committed docs to runtime", {
      sourceCommit: "b".repeat(40),
      committed: "lib/runtime-repository.server.ts\n",
      committedNoRenames: "docs/runtime-repository.md\nlib/runtime-repository.server.ts\n",
    }, "lib/runtime-repository.server.ts"],
    ["tracked docs to runtime copy", {
      tracked: "app/api/copied-runtime/route.ts\n",
      trackedNoRenames: "app/api/copied-runtime/route.ts\n",
    }, "app/api/copied-runtime/route.ts"],
  ]

  for (const [label, inventory, runtimePath] of scenarios) {
    const { report } = runImagePlanWithFakeGit(inventory)
    assert.equal(report.local.image.sourceFreshness.status, "stale_runtime_source", label)
    assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"), label)
    assert.ok(report.local.image.sourceFreshness.runtimeChangedFiles.includes(runtimePath), label)
  }
})

test("Aliyun image source freshness reads Unicode paths from real Git without C-style quoting", () => {
  for (const mode of ["committed", "staged", "unstaged", "untracked"]) {
    const { report, runtimePath } = runImagePlanInRealGit(mode)
    assert.equal(report.local.image.sourceFreshness.status, "stale_runtime_source", mode)
    assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"), mode)
    assert.ok(report.local.image.sourceFreshness.runtimeChangedFiles.includes(runtimePath), mode)
  }
})

test("Aliyun image source freshness treats the runtime prompt tree as an image input", async (t) => {
  const promptPath = "提示词/P5-IP类型定位大师v2.0.md"
  for (const mode of ["committed", "staged", "unstaged", "untracked"]) {
    await t.test(mode, () => {
      const { report, runtimePath } = runImagePlanInRealGit(mode, promptPath)
      assert.equal(report.local.image.sourceFreshness.status, "stale_runtime_source")
      assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"))
      assert.ok(report.local.image.sourceFreshness.runtimeChangedFiles.includes(runtimePath))
    })
  }
})

test("Aliyun image source freshness classifies Windows separators as runtime paths", () => {
  const windowsRuntimePath = "app\\专业\\route.ts"
  const { report } = runImagePlanWithFakeGit({
    tracked: `${windowsRuntimePath}\n`,
    trackedNoRenames: `${windowsRuntimePath}\n`,
  })
  assert.equal(report.local.image.sourceFreshness.status, "stale_runtime_source")
  assert.ok(report.local.blockers.includes("image.sourceCommitMatchesHead"))
  assert.ok(report.local.image.sourceFreshness.runtimeChangedFiles.includes(windowsRuntimePath))
})
