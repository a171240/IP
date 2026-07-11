/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const runJsonCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-apply-package-cache-"))
const fixtureRoot = path.join(root, "tests", "fixtures", "aliyun-user-action-brief")
const fixtureArgs = Object.freeze([
  "--env-file",
  path.join(fixtureRoot, "env.production-cn.fixture"),
  "--cloud-confirmations",
  path.join(fixtureRoot, "cloud-confirmations.fixture.json"),
  "--cloud-inventory-results",
  path.join(fixtureRoot, "cloud-inventory-results.fixture.json"),
  "--rds-migration",
  path.join(fixtureRoot, "rds-migration.fixture.json"),
  "--image-publish",
  path.join(fixtureRoot, "image-publish.fixture.json"),
])
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

function execNode(args, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
    ...options,
    env: {
      ...process.env,
      MEIYE_ALIYUN_RUN_JSON_CACHE_DIR: runJsonCacheDir,
      ...(options.env || {}),
    },
  })
}

function applyPackageArgs(extraArgs = []) {
  return [
    "scripts/generate-aliyun-backend-apply-package.mjs",
    ...fixtureArgs,
    ...extraArgs,
  ]
}

test("Aliyun backend apply package command is wired without generated-doc coupling", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const script = read("scripts", "generate-aliyun-backend-apply-package.mjs")

  assert.equal(pkg.scripts["aliyun:backend-cn:apply-package"], "node ./scripts/generate-aliyun-backend-apply-package.mjs")
  assert.equal(pkg.scripts["aliyun:backend-cn:apply-package:test"], "node --test tests/aliyun-backend-apply-package.static.test.js")
  assert.match(predeploy, /aliyun:backend-cn:apply-package:test/)
  assert.match(predeploy, /aliyun:backend-cn:apply-package/)
  assert.match(deploySpecChecker, /corepack pnpm aliyun:backend-cn:apply-package/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:apply-package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:backend-cn:apply-package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:backend-cn:apply-package"))
  assert.match(releaseArtifacts, /backend-apply-package\.json/)
  assert.match(releaseArtifacts, /backendApplyPackage/)
  assert.match(releaseArtifacts, /credentialPasswordIntervention: backendApplyPackage\.credentialPasswordIntervention/)
  assert.match(releaseArtifacts, /backendApplyPackage\.actionTimeAuthorizationRequest/)
  assert.match(releaseArtifacts, /backendResourceEvidenceMatrixRows/)
  assert.match(script, /B00_ALIYUN_BACKEND_APPLY_PACKAGE/)
  assert.match(script, /BAP00_READONLY_INVENTORY_IDENTITY/)
  assert.match(script, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE/)
  assert.match(script, /BAP09_POSTDEPLOY_SMOKE/)
  assert.match(script, /--image-publish/)
  assert.doesNotMatch(script, /generate-aliyun-cloud-actions-package\.mjs/)
  assert.doesNotMatch(script, secretLike)
})

test("Aliyun backend apply package uses tracked fixtures for current blocked state", () => {
  const output = execNode(applyPackageArgs())
  const report = JSON.parse(output)
  const steps = new Map(report.applySteps.map((item) => [item.id, item]))
  const matrixByStepId = new Map(report.backendResourceEvidenceMatrix.map((item) => [item.stepId, item]))

  assert.equal(report.ok, true)
  assert.equal(report.packageId, "B00_ALIYUN_BACKEND_APPLY_PACKAGE")
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalledByThisCommand, false)
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.canApplyBackendNowWithoutUserIntervention, false)
  assert.equal(report.canDeployBackendNow, false)
  assert.equal(report.secretLeakCheck.ok, true)

  assert.equal(report.summary.backendTargetReady, "0/8")
  assert.match(report.summary.resourceEvidenceReady, /^[01]\/7$/)
  assert.equal(report.summary.rdsMigrationEvidenceReady, false)
  assert.deepEqual(report.summary.immediateBackendSteps.slice(0, 2), [
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
    "BAP02_OSS_RAM_STS_CLOSE",
  ])
  assert.ok([2, 3].includes(report.summary.immediateBackendSteps.length))
  for (const stepId of [
    "BAP05_BACKEND_ENV_IMPORT",
    "BAP06_SAE_RUNTIME_CREATE",
    "BAP07_DOMAINS_HTTPS_ICP",
    "BAP08_SLS_ALERTS",
    "BAP09_POSTDEPLOY_SMOKE",
  ]) {
    assert.ok(report.summary.blockedBackendSteps.includes(stepId))
  }
  assert.equal(report.summary.wechatExcludedFromBackend, true)
  assert.equal(report.summary.cloudInventoryStrictReady, true)
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.deepEqual(report.summary.missingCredentialValues, ["DATABASE_URL_CN"])
  assert.equal(report.summary.readySecretsPendingCloudImport, 20)
  assert.equal(report.summary.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.deepEqual(report.summary.paidPurchaseConfirmationActionIds, [])
  for (const actionId of [
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ]) {
    assert.ok(report.summary.controlledSecretChannelActionIds.includes(actionId))
  }
  assert.equal(report.summary.backendResourceEvidenceMatrixRows, 10)
  assert.ok([2, 3].includes(report.summary.backendResourceEvidenceMatrixImmediateRows))
  assert.ok([5, 6].includes(report.summary.backendResourceEvidenceMatrixBlockedRows))
  assert.equal(report.summary.backendResourceEvidenceMatrixCredentialOrPasswordRows, 6)

  assert.equal(matrixByStepId.get("BAP00_READONLY_INVENTORY_IDENTITY").completed, true)
  assert.equal(matrixByStepId.get("BAP00_READONLY_INVENTORY_IDENTITY").phase, "completed_evidence_recorded")
  assert.equal(matrixByStepId.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").phase, "first_batch_after_action_time_confirmation")
  assert.equal(matrixByStepId.get("BAP02_OSS_RAM_STS_CLOSE").phase, "first_batch_after_action_time_confirmation")
  assert.ok([
    "first_batch_after_action_time_confirmation",
    "blocked_until_dependencies_close",
  ].includes(matrixByStepId.get("BAP04_ACR_IMAGE_PUSH_AND_PULL").phase))
  assert.equal(matrixByStepId.get("BAP05_BACKEND_ENV_IMPORT").phase, "blocked_until_dependencies_close")

  assert.equal(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").completed, true)
  assert.deepEqual(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").requiredAuthorizationPackets, [])
  assert.deepEqual(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentBlockers, [])
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentEvidence.includes("cloudInventoryStrictReady=true"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentEvidence.includes("readyLocalOperations=9/9"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentEvidence.includes("cliConfigProbeFailureCategory=none"))

  assert.equal(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("DATABASE_URL_CN"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("RDS_MIGRATION_EVIDENCE_NOT_READY"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("rdsEvidence:migration.supabaseSpecificSqlResolved"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentEvidence.includes("appApiRoutesTouchingSupabaseCompatibility=57/59"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentEvidence.includes("firstVersionRdsRoutesTouchingSupabaseCompatibility=26/28"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentEvidence.includes("rdsCompatibilityLocalReviewClosed=false"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userMustHandle.includes("Supabase SQL compatibility review before applying schema to Aliyun RDS"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").verifyCommands.includes("MEIYE_ALLOW_ALIYUN_RDS_RUNTIME_SMOKE=1 corepack pnpm aliyun:rds:runtime-smoke:strict"))

  assert.equal(steps.get("BAP02_OSS_RAM_STS_CLOSE").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").currentBlockers.includes("OSS_RAM_STS_NOT_READY"))
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").currentEvidence.includes("ossResource.observedReadiness=partial"))
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").writeTargets.some((item) => /SAE RRSA\/OIDC/.test(item)))
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").verifyCommands.includes("corepack pnpm aliyun:oss:runtime-access:strict"))

  assert.equal(steps.get("BAP03_ACR_PURCHASE_AND_REPOSITORY").completed, true)
  assert.ok(steps.get("BAP03_ACR_PURCHASE_AND_REPOSITORY").currentEvidence.includes("acr.purchaseCandidate.confirmed=true"))
  const acrImageStep = steps.get("BAP04_ACR_IMAGE_PUSH_AND_PULL")
  assert.ok([true, false].includes(acrImageStep.canStartAfterActionTimeConfirmation))
  assert.ok(acrImageStep.blockedUntil.every((stepId) => stepId === "BAP03_ACR_PURCHASE_AND_REPOSITORY"))
  assert.ok(acrImageStep.currentBlockers.includes("ACR_IMAGE_REGISTRY_NOT_READY"))
  assert.ok(acrImageStep.currentBlockers.includes("SAE_RUNTIME_NOT_READY"))
  assert.ok(acrImageStep.currentEvidence.includes("image.localDigestReady=false"))
  assert.ok(steps.get("BAP07_DOMAINS_HTTPS_ICP").currentBlockers.includes("API_DOMAIN_HTTPS_ICP_NOT_READY"))
  assert.ok(steps.get("BAP08_SLS_ALERTS").currentBlockers.includes("SLS_ALERTS_NOT_READY"))
  assert.ok(steps.get("BAP09_POSTDEPLOY_SMOKE").currentBlockers.includes("POSTDEPLOY_SMOKE_NOT_RUN"))

  assert.ok(!report.userIntervention.requiredIds.includes("USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.ok(report.userIntervention.requiredIds.includes("USER_CONFIRM_RDS_PURCHASE_AND_DATABASE_PASSWORD"))
  assert.ok(report.userIntervention.secretOrPasswordHandling.includes("DATABASE_URL_CN"))
  assert.ok(report.userIntervention.completedPurchaseConfirmations.some((item) => /ACR Enterprise/.test(item)))
  assert.ok(report.userIntervention.actionTimeCloudConsolePackets.includes("P11_ALIYUN_RDS_DATA_MIGRATION"))
  assert.ok(report.userIntervention.actionTimeCloudConsolePackets.includes("P05_OSS_RAM_STS"))
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assert.equal(report.credentialPasswordIntervention.readySecretsPendingCloudImport.count, 20)
  assert.equal(report.credentialAcquisitionQueue.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.ok([3, 4].includes(report.credentialAcquisitionQueue.items.length))
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:evidence:writeback:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:operator:tasks:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:operator:handoff:backend"))
  assert.ok(report.safetyBoundary.some((item) => /does not create/.test(item)))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend apply package reports field-level RDS blockers after local scaffold exists", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-apply-package-rds-"))
  const localPath = path.join(tmpdir, "rds-migration.local.json")
  execNode([
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--init-local",
    "--local",
    localPath,
  ])

  const output = execNode(applyPackageArgs(["--rds-migration", localPath]))
  const report = JSON.parse(output)
  const rdsStep = report.applySteps.find((item) => item.id === "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE")

  assert.equal(report.summary.rdsMigrationEvidenceReady, false)
  assert.ok(rdsStep.currentEvidence.includes("rdsLocalExists=true"))
  assert.ok(rdsStep.currentEvidence.includes("rdsLocalReady=false"))
  assert.ok(!rdsStep.currentBlockers.includes("rdsEvidence:file_missing"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:todo:rdsPostgres.instanceId"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:rdsPostgres.confirmed"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:migration.schemaCompatibilityReviewed"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:migration.supabaseSpecificSqlResolved"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:migration.rdsExtensionSupportConfirmed"))
  assert.ok(!rdsStep.currentBlockers.includes("rdsEvidence:migration.dataAccessAdapterReady"))
  assert.ok(rdsStep.currentEvidence.includes("appApiRoutesTouchingSupabaseCompatibility=57/59"))
  assert.ok(rdsStep.currentEvidence.includes("appApiRoutesWithSupabaseDataAccess=2/59"))
  assert.ok(rdsStep.currentEvidence.includes("firstVersionRdsRoutesTouchingSupabaseCompatibility=26/28"))
  assert.ok(rdsStep.currentEvidence.includes("firstVersionRdsRoutesWithSupabaseDataAccess=0/28"))
  assert.ok(rdsStep.currentEvidence.includes("schemaApplyCandidate.status=blocked_supabase_specific_sql_present"))
  assert.ok(rdsStep.currentEvidence.includes("schemaApplyCandidate.findingCount=182"))
  assert.ok(rdsStep.currentEvidence.includes("rdsApplyCandidate.readyToApplySchema=true"))
  assert.ok(rdsStep.currentEvidence.includes("rdsApplyCandidate.findingCount=0"))
  assert.ok(rdsStep.currentEvidence.includes("rdsApplyCandidate.removedStatementCount=113"))
  assert.ok(rdsStep.currentEvidence.includes("rdsApplyCandidate.rewrittenStatementCount=9"))
  assert.ok(rdsStep.currentEvidence.includes("rdsApplyCandidate.reviewPlanResolvedFindingCount=23"))
  assert.ok(rdsStep.currentEvidence.includes("rdsCompatibilityLocalReviewClosed=false"))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend apply package markdown is value-free and current-state actionable", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-apply-package-"))
  const markdownPath = path.join(tmpdir, "backend-apply-package.md")
  const output = execNode(applyPackageArgs(["--markdown", markdownPath]))
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /## Operator Quick Start/)
  assert.match(markdown, /当前结论：不能部署；这不是微信移动应用阻塞，而是阿里云后端资源和证据还没有闭环。/)
  assert.match(markdown, /resource evidence: [01]\/7/)
  assert.match(markdown, /deploy gate: canDeployBackendNow=false/)
  assert.match(markdown, /missing backend credential\/password: DATABASE_URL_CN/)
  assert.match(markdown, /deferred app launch items: WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /P00 只读盘点已完成。拿到动作时授权后，本批继续做这三件事/)
  assert.doesNotMatch(markdown, /P00: 恢复 Aliyun CLI\/CloudShell 只读盘点/)
  assert.match(markdown, /P11: 创建或确认 cn-hangzhou RDS PostgreSQL/)
  assert.match(markdown, /P05: 确认 OSS bucket\/CORS\/service-records 前缀/)
  assert.match(markdown, /P04.*推送或导入后端镜像/)
  assert.match(markdown, /本批明确不做：微信开放平台移动应用、Android release signing、Apple Team ID\/AASA/)
  assert.match(markdown, /再次购买 ACR/)
  assert.match(markdown, /production deploy/)
  assert.match(markdown, /必须停手等用户确认的点/)
  assert.match(markdown, /如后续要刷新 CloudShell\/P00 盘点/)
  assert.match(markdown, /RDS 如涉及规格购买、实例费用、数据库账号密码或迁移执行/)
  assert.match(markdown, /AccessKeySecret、STS token、registry password、DATABASE_URL_CN/)
  assert.match(markdown, /授权口径：授权本轮只做阿里云后端第一批剩余动作/)
  assert.match(markdown, /Immediate Backend Steps After Confirmation[\s\S]*BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE, BAP02_OSS_RAM_STS_CLOSE/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /## Credential \/ Password Intervention/)
  assert.match(markdown, /missingCredentialValues: DATABASE_URL_CN/)
  assert.match(markdown, /missingCredentialValueActionIds: S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(markdown, /readySecretsPendingCloudImport: 20/)
  assert.match(markdown, /controlledSecretChannelActionIds: (S04_ACR_REGISTRY_AUTH, )?S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /## Backend Credential Acquisition Queue/)
  assert.match(markdown, /onlyMissingBackendCredentialValue: DATABASE_URL_CN/)
  assert.match(markdown, /DATABASE_URL_CN 从哪里获得并导入到哪里/)
  assert.match(markdown, /DATABASE_URL_CN -> 阿里云 KMS\/Secrets Manager\/SAE secret env only/)
  assert.match(markdown, /## Backend Resource Evidence Matrix/)
  assert.match(markdown, /rows: 10/)
  assert.match(markdown, /immediateRows: [23]/)
  assert.match(markdown, /blockedRows: [56]/)
  assert.match(markdown, /credentialOrPasswordRows: 6/)
  assert.match(markdown, /BAP00_READONLY_INVENTORY_IDENTITY[\s\S]*completed_evidence_recorded/)
  assert.match(markdown, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE[\s\S]*DATABASE_URL_CN secret value/)
  assert.match(markdown, /BAP02_OSS_RAM_STS_CLOSE[\s\S]*first_batch_after_action_time_confirmation/)
  assert.match(markdown, /BAP04_ACR_IMAGE_PUSH_AND_PULL[\s\S]*(first_batch_after_action_time_confirmation|blocked_until_dependencies_close)/)
  assert.match(markdown, /BAP05_BACKEND_ENV_IMPORT[\s\S]*blocked_until_dependencies_close[\s\S]*DATABASE_URL_CN/)
  assert.match(markdown, /appApiRoutesTouchingSupabaseCompatibility=57\/59/)
  assert.match(markdown, /rdsCompatibilityLocalReviewClosed=false/)
  assert.match(markdown, /ossResource\.observedReadiness=partial/)
  assert.match(markdown, /image\.localDigestReady=false/)
  assert.match(markdown, /Every apply step still needs action-time confirmation/)
  assert.doesNotMatch(output + markdown, secretLike)
})
