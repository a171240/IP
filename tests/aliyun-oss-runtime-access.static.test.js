const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const fixturePath = path.join("tests", "fixtures", "aliyun-user-action-brief", "cloud-confirmations.fixture.json")
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|ALIYUN_OSS_ACCESS_KEY_SECRET\s*=\s*\S{8,}|ALIYUN_OSS_SECURITY_TOKEN\s*=\s*\S{8,})/i

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8")
}

function readJson(...parts) {
  return JSON.parse(read(...parts))
}

test("Aliyun OSS runtime access checker declares P05 local-only safety boundaries", () => {
  const source = read("scripts", "check-aliyun-oss-runtime-access.mjs")

  assert.match(source, /P05_OSS_RAM_STS/)
  assert.match(source, /service-records\/production-cn/)
  assert.match(source, /preferredModeId: "sae_runtime_role"/)
  assert.match(source, /readOnlyOnly:\s*true/)
  assert.match(source, /mutationPerformed:\s*false/)
  assert.match(source, /cloudApiCalled:\s*false/)
  assert.match(source, /--cloud-confirmations/)
  assert.match(source, /ALIBABA_CLOUD_ROLE_ARN/)
  assert.match(source, /ALIBABA_CLOUD_OIDC_PROVIDER_ARN/)
  assert.match(source, /ALIBABA_CLOUD_OIDC_TOKEN_FILE/)
  assert.match(source, /AssumeRoleWithOIDC/)
  assert.match(source, /ALIYUN_OSS_RAM_ROLE_NAME/)
  assert.match(source, /runtime_role_metadata_endpoint_missing/)
  assert.match(source, /runtime_role_imdsv2_token_missing/)
  assert.match(source, /runtime_role_rrsa_oidc_assume_missing/)
})

test("Aliyun OSS runtime access fixture dry run keeps blocked cloud evidence explicit", () => {
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-oss-runtime-access.mjs",
    "--allow-incomplete",
    "--cloud-confirmations",
    fixturePath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, false)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.authorizationPacket, "P05_OSS_RAM_STS")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.policy.ready, true)
  assert.deepEqual(report.policy.allowedActions, ["oss:GetObject", "oss:PostObject", "oss:PutObject"])
  assert.deepEqual(report.policy.expectedActions, ["oss:GetObject", "oss:PutObject", "oss:PostObject"])
  assert.equal(report.policy.requiredActionsCovered, true)
  assert.equal(report.policy.prefixScoped, true)
  assert.deepEqual(report.policy.forbiddenActionsPresent, [])
  assert.equal(
    report.policy.expectedResourceScope,
    "acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*",
  )
  assert.equal(typeof report.codeContract.ready, "boolean")
  assert.equal(report.codeContract.prefixRequiresRuntimeEnv, true)
  assert.equal(report.codeContract.codeDefaultPrefix, "service-records")
  assert.equal(report.codeContract.expectedRuntimePrefix, "service-records/production-cn")
  assert.ok(report.codeContract.sourceFiles.includes("lib/aliyun-rds/service-record-oss.server.ts"))
  assert.ok(report.codeContract.requiredCommonRuntimeEnvNames.includes("SERVICE_RECORD_OSS_PREFIX"))
  assert.ok(report.codeContract.requiredRuntimeRoleEnvNames.includes("ALIBABA_CLOUD_ROLE_ARN"))
  assert.ok(report.codeContract.requiredRuntimeRoleEnvNames.includes("ALIBABA_CLOUD_OIDC_PROVIDER_ARN"))
  assert.ok(report.codeContract.requiredRuntimeRoleEnvNames.includes("ALIBABA_CLOUD_OIDC_TOKEN_FILE"))
  assert.ok(report.codeContract.optionalMetadataRuntimeRoleEnvNames.includes("ALIYUN_OSS_RAM_ROLE_NAME"))
  assert.ok(report.codeContract.fallbackSecretEnvNames.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"))
  assert.ok(report.codeContract.credentialModesSupported.includes("sae_rrsa_oidc"))
  assert.ok(report.codeContract.credentialModesSupported.includes("ecs_ram_role_metadata"))
  assert.ok(report.codeContract.operationEvidence.includes("createAliyunRdsServiceRecordOssPostPolicy -> oss:PostObject"))
  assert.ok(report.codeContract.operationEvidence.includes("uploadAliyunRdsServiceRecordOssObject -> oss:PutObject"))
  assert.ok(report.codeContract.operationEvidence.includes("createAliyunRdsServiceRecordOssSignedGetUrl -> oss:GetObject"))
  assert.equal(report.cloudConfirmations.ready, false)
  assert.equal(report.cloudConfirmations.file.endsWith(fixturePath), true)
  assert.ok(report.blockers.includes("cloud:oss.confirmed"))
  assert.ok(report.blockers.includes("cloud:oss.corsConfigured"))
  assert.ok(report.blockers.includes("cloud:oss.ramLeastPrivilege"))
  assert.equal(report.executionReadiness.resourceReadyForP05, false)
  assert.equal(report.executionReadiness.policyTemplateReady, true)
  assert.equal(report.executionReadiness.codeContractReady, report.codeContract.ready)
  assert.equal(report.executionReadiness.accessGrantReady, false)
  assert.equal(report.executionReadiness.preferredModeId, "sae_runtime_role")
  assert.equal(report.executionReadiness.preferredModeAvoidsLongLivedSecret, true)
  assert.ok(report.executionReadiness.postActionWritebackFields.includes("SAE RRSA/OIDC env ALIBABA_CLOUD_ROLE_ARN, ALIBABA_CLOUD_OIDC_PROVIDER_ARN, and ALIBABA_CLOUD_OIDC_TOKEN_FILE when accessMode=sae_runtime_role"))
  assert.ok(report.executionReadiness.verificationCommands.includes("corepack pnpm aliyun:oss:runtime-access:strict"))
  assert.equal(report.secretLeakCheck.ok, true)
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun OSS runtime access strict mode fails while fixture evidence is incomplete", () => {
  const result = spawnSync(process.execPath, [
    "scripts/check-aliyun-oss-runtime-access.mjs",
    "--cloud-confirmations",
    fixturePath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const report = JSON.parse(result.stdout)

  assert.equal(result.status, 1)
  assert.equal(report.ok, false)
  assert.equal(report.policy.ready, true)
  assert.equal(typeof report.codeContract.ready, "boolean")
  assert.ok(report.blockers.includes("cloud:oss.confirmed"))
  assert.ok(report.blockers.includes("cloud:oss.corsConfigured"))
  assert.ok(report.blockers.includes("cloud:oss.ramLeastPrivilege"))
  assert.equal(report.secretLeakCheck.ok, true)
  assert.doesNotMatch(result.stdout + result.stderr, secretLike)
})

test("Aliyun OSS runtime access can write optional non-secret JSON and Markdown", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-oss-runtime-access-"))
  const jsonPath = path.join(tmpDir, "runtime-access.json")
  const markdownPath = path.join(tmpDir, "runtime-access.md")
  const output = execFileSync(process.execPath, [
    "scripts/check-aliyun-oss-runtime-access.mjs",
    "--allow-incomplete",
    "--cloud-confirmations",
    fixturePath,
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  })
  const report = JSON.parse(output)
  const writtenJson = JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(writtenJson.authorizationPacket, report.authorizationPacket)
  assert.match(markdown, /# P05 OSS Runtime Access Handoff/)
  assert.match(markdown, /tests\/fixtures\/aliyun-user-action-brief\/cloud-confirmations\.fixture\.json/)
  assert.match(markdown, /sae_runtime_role/)
  assert.match(markdown, /ALIBABA_CLOUD_ROLE_ARN/)
  assert.match(markdown, /MeiyeHuajingServiceRecordsOssPolicy/)
  assert.match(markdown, /corepack pnpm aliyun:oss:runtime-access:strict/)
  assert.doesNotMatch(output + JSON.stringify(writtenJson) + markdown, secretLike)
})
