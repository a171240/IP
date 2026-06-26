const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|DATABASE_URL_CN\s*=\s*\S{8,})/i

test("Aliyun backend apply package command is wired into scripts and deploy spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const script = read("scripts", "generate-aliyun-backend-apply-package.mjs")
  const applyPackageDoc = read("docs", "app-production-cn-backend-aliyun-apply-package.md")

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
  assert.match(releaseArtifacts, /missingCredentialValues: \$\{backendApplyPackage\.credentialPasswordIntervention/)
  assert.match(releaseArtifacts, /credentialPasswordIntervention: backendApplyPackage\.credentialPasswordIntervention/)
  assert.match(releaseArtifacts, /backendApplyPackage\.actionTimeAuthorizationRequest/)
  assert.match(releaseArtifacts, /actionTimeAuthorizationRequest\.recommendedUserReply/)
  assert.match(releaseArtifacts, /backendResourceEvidenceMatrixRows/)
  assert.match(releaseArtifacts, /backendApplyPackage\.backendResourceEvidenceMatrix/)
  assert.match(script, /B00_ALIYUN_BACKEND_APPLY_PACKAGE/)
  assert.match(script, /BAP00_READONLY_INVENTORY_IDENTITY/)
  assert.match(script, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE/)
  assert.match(script, /BAP09_POSTDEPLOY_SMOKE/)
  assert.match(script, /buildBackendResourceEvidenceMatrix/)
  assert.match(script, /renderBackendResourceEvidenceMatrix/)
  assert.match(script, /FIRST_BACKEND_ACTION_RECOMMENDED_REPLY/)
  assert.match(script, /buildActionTimeAuthorizationRequest/)
  assert.match(script, /buildCredentialAcquisitionQueue/)
  assert.match(script, /renderOperatorQuickStart/)
  assert.match(applyPackageDoc, /BAP00_READONLY_INVENTORY_IDENTITY/)
  assert.match(applyPackageDoc, /## Operator Quick Start/)
  assert.match(applyPackageDoc, /## Backend Credential Acquisition Queue/)
  assert.match(applyPackageDoc, /## Backend Resource Evidence Matrix/)
  assert.match(applyPackageDoc, /credentialOrPasswordRows: 6/)
  assert.match(applyPackageDoc, /当前结论：不能部署；这不是微信移动应用阻塞/)
  assert.match(applyPackageDoc, /rdsLocalExists=true/)
  assert.match(applyPackageDoc, /rdsEvidence:rdsPostgres\.confirmed/)
  assert.doesNotMatch(applyPackageDoc, /rdsEvidence:file_missing/)
  assert.doesNotMatch(script, secretLike)
})

test("Aliyun backend apply package separates immediate backend work from deferred app launch", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-aliyun-backend-apply-package.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  })
  const report = JSON.parse(output)
  const steps = new Map(report.applySteps.map((item) => [item.id, item]))

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

  assert.deepEqual(report.summary.immediateBackendSteps, [
    "BAP00_READONLY_INVENTORY_IDENTITY",
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
    "BAP02_OSS_RAM_STS_CLOSE",
    "BAP03_ACR_PURCHASE_AND_REPOSITORY",
  ])
  assert.deepEqual(report.summary.blockedBackendSteps, [
    "BAP04_ACR_IMAGE_PUSH_AND_PULL",
    "BAP05_BACKEND_ENV_IMPORT",
    "BAP06_SAE_RUNTIME_CREATE",
    "BAP07_DOMAINS_HTTPS_ICP",
    "BAP08_SLS_ALERTS",
    "BAP09_POSTDEPLOY_SMOKE",
  ])
  assert.equal(report.summary.wechatExcludedFromBackend, true)
  assert.equal(report.summary.blockedCredentialCount, 1)
  assert.deepEqual(report.summary.missingCredentialValues, ["DATABASE_URL_CN"])
  assert.equal(report.summary.readySecretsPendingCloudImport, 17)
  assert.equal(report.summary.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.deepEqual(report.summary.paidPurchaseConfirmationActionIds, ["S03_ACR_PAID_PURCHASE"])
  assert.deepEqual(report.summary.controlledSecretChannelActionIds, [
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.equal(report.summary.backendResourceEvidenceMatrixRows, 10)
  assert.equal(report.summary.backendResourceEvidenceMatrixImmediateRows, 4)
  assert.equal(report.summary.backendResourceEvidenceMatrixBlockedRows, 6)
  assert.equal(report.summary.backendResourceEvidenceMatrixCredentialOrPasswordRows, 6)
  assert.equal(report.backendResourceEvidenceMatrix.length, 10)
  const matrixByStepId = new Map(report.backendResourceEvidenceMatrix.map((item) => [item.stepId, item]))
  assert.equal(matrixByStepId.get("BAP00_READONLY_INVENTORY_IDENTITY").phase, "first_batch_after_action_time_confirmation")
  assert.equal(matrixByStepId.get("BAP00_READONLY_INVENTORY_IDENTITY").requiresCredentialOrPasswordHandling, true)
  assert.ok(matrixByStepId.get("BAP00_READONLY_INVENTORY_IDENTITY").credentialOrPasswordItems.some((item) => /AccessKeySecret/.test(item)))
  assert.ok(matrixByStepId.get("BAP00_READONLY_INVENTORY_IDENTITY").localEvidenceTargets.some((item) => item.includes("cloud-inventory-results.local.json")))
  assert.equal(matrixByStepId.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").phase, "first_batch_after_action_time_confirmation")
  assert.ok(matrixByStepId.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").credentialOrPasswordItems.some((item) => /DATABASE_URL_CN secret value/.test(item)))
  assert.ok(matrixByStepId.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").cloudSecretOrRuntimeTargets.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.ok(matrixByStepId.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userInterventionClass.includes("secret_or_password"))
  assert.ok(matrixByStepId.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userInterventionClass.includes("billing_or_purchase"))
  assert.equal(matrixByStepId.get("BAP05_BACKEND_ENV_IMPORT").phase, "blocked_until_dependencies_close")
  assert.ok(matrixByStepId.get("BAP05_BACKEND_ENV_IMPORT").credentialOrPasswordItems.includes("DATABASE_URL_CN"))
  assert.equal(matrixByStepId.get("BAP07_DOMAINS_HTTPS_ICP").requiresCredentialOrPasswordHandling, false)
  assert.ok(matrixByStepId.get("BAP07_DOMAINS_HTTPS_ICP").userInterventionClass.includes("dns_https_icp"))
  assert.equal(matrixByStepId.get("BAP09_POSTDEPLOY_SMOKE").requiresCredentialOrPasswordHandling, false)
  assert.ok(matrixByStepId.get("BAP09_POSTDEPLOY_SMOKE").userInterventionClass.includes("production_deploy"))
  assert.deepEqual(report.userIntervention.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.credentialPasswordIntervention.required, true)
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.names, ["DATABASE_URL_CN"])
  assert.deepEqual(report.credentialPasswordIntervention.missingCredentialValues.actionIds, ["S08_ALIYUN_RDS_DATABASE_URL"])
  assert.equal(report.credentialPasswordIntervention.readySecretsPendingCloudImport.count, 17)
  assert.ok(report.credentialPasswordIntervention.readySecretsPendingCloudImport.names.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.deepEqual(report.credentialPasswordIntervention.paidPurchaseConfirmationActionIds, ["S03_ACR_PAID_PURCHASE"])
  assert.ok(report.credentialPasswordIntervention.controlledSecretChannelActionIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.credentialPasswordIntervention.userMustProvideOrConfirm.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.equal(report.credentialAcquisitionQueue.queueScope, "backend_aliyun_only")
  assert.equal(report.credentialAcquisitionQueue.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.deepEqual(report.credentialAcquisitionQueue.items.map((item) => item.actionId), [
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  const rdsQueueItem = report.credentialAcquisitionQueue.items.find((item) => item.actionId === "S08_ALIYUN_RDS_DATABASE_URL")
  assert.ok(rdsQueueItem)
  assert.equal(rdsQueueItem.userQuestion, "DATABASE_URL_CN 从哪里获得并导入到哪里")
  assert.ok(rdsQueueItem.obtainFrom.includes("阿里云控制台 -> RDS PostgreSQL"))
  assert.ok(rdsQueueItem.destinationSummary.some((item) => item.includes("DATABASE_URL_CN -> 阿里云 KMS/Secrets Manager/SAE secret env only")))
  assert.ok(rdsQueueItem.verifyCommands.includes("corepack pnpm aliyun:rds:migration:evidence:strict"))
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.userIntervention.blockedCredentialNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.userIntervention.blockedCredentialNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.equal(report.actionTimeAuthorizationRequest.required, true)
  assert.equal(report.actionTimeAuthorizationRequest.currentScope, "backend_aliyun_only")
  assert.deepEqual(report.actionTimeAuthorizationRequest.packetIds, [
    "P00_ALIYUN_READONLY_INVENTORY_IDENTITY",
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
    "P03_ACR_PURCHASE",
  ])
  assert.deepEqual(report.actionTimeAuthorizationRequest.stepIds, [
    "BAP00_READONLY_INVENTORY_IDENTITY",
    "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE",
    "BAP02_OSS_RAM_STS_CLOSE",
    "BAP03_ACR_PURCHASE_AND_REPOSITORY",
  ])
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /阿里云后端第一批动作/)
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /RDS PostgreSQL/)
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /CNY117/)
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /不做微信\/Android\/iOS/)
  assert.match(report.actionTimeAuthorizationRequest.recommendedUserReply, /不部署上线、不改 DNS/)
  assert.ok(report.actionTimeAuthorizationRequest.allowedActions.some((item) => /RDS PostgreSQL/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.allowedActions.some((item) => /OSS/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.allowedActions.some((item) => /ACR Enterprise/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.explicitlyExcluded.some((item) => /不创建微信开放平台移动应用/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.explicitlyExcluded.some((item) => /git push/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.explicitlyExcluded.some((item) => /不执行 docker login\/push/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.valueHandling.some((item) => /非密钥 evidence handle/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.writeTargets.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.ok(report.actionTimeAuthorizationRequest.verifyCommands.includes("corepack pnpm aliyun:rds:migration:package"))

  assert.equal(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentBlockers.includes("cloudInventory:readonly_inventory_strict_ready=0/9"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentBlockers.includes("aliyun_cli_profile_not_configured"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").requiredAuthorizationPackets.includes("P00_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.ok(!steps.get("BAP00_READONLY_INVENTORY_IDENTITY").requiredAuthorizationPackets.includes("P11_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").writeTargets.some((item) => item.includes("cloud-inventory-results.local.json")))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").currentEvidence.includes("cloudShellCurrentStatus=connecting_terminal_input_visible_inventory_not_executed"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").userMustHandle.some((item) => item.includes("当前 CloudShell 已打开但仍在连接")))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").userMustHandle.some((item) => item.includes("如后续出现开通、重启实例或费用提示")))
  assert.match(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.minimumUserPhrase, /CloudShell/)
  assert.match(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.minimumUserPhrase, /等待当前阿里云 CloudShell 连接完成/)
  assert.match(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.minimumUserPhrase, /只读盘点/)
  assert.equal(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.cloudShellCurrentStatus, "connecting_terminal_input_visible_inventory_not_executed")
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.allowedActions.some((item) => item.includes("正在连接 Cloud Shell")))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.explicitlyExcluded.some((item) => item.includes("当前 connecting 状态不授权")))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").actionTimeConfirmation.explicitlyExcluded.some((item) => item.includes("导入环境变量")))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").verifyCommands.includes("corepack pnpm aliyun:cloudshell:handoff"))
  assert.ok(steps.get("BAP00_READONLY_INVENTORY_IDENTITY").verifyCommands.some((item) => item.includes("MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1")))
  assert.equal(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("DATABASE_URL_CN"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("rdsEvidence:migration.schemaCompatibilityReviewed"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("rdsEvidence:migration.supabaseSpecificSqlResolved"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("rdsEvidence:migration.rdsExtensionSupportConfirmed"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userMustHandle.includes("database account password"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userMustHandle.includes("Supabase SQL compatibility review before applying schema to Aliyun RDS"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userMustHandle.includes("Supabase-specific auth/storage/RLS/service_role SQL rewrite or explicit resolution"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userMustHandle.includes("Aliyun RDS PostgreSQL extension support confirmation"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").nonSecretEvidenceToRecord.includes("schemaCompatibilityReviewed=true"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").nonSecretEvidenceToRecord.includes("supabaseSpecificSqlResolved=true"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").nonSecretEvidenceToRecord.includes("rdsExtensionSupportConfirmed=true"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentEvidence.includes("rdsMigrationPackageHandoff=docs/app-production-cn-rds-migration-package.md"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").writeTargets.includes("docs/app-production-cn-rds-migration-package.md -> non-secret schema/validation/rollback package digest handoff"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").verifyCommands.includes("corepack pnpm aliyun:rds:migration:package"))
  assert.equal(steps.get("BAP02_OSS_RAM_STS_CLOSE").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").currentEvidence.includes("ossResource.observedReadiness=partial"))
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").currentEvidence.some((item) => item.includes("bucket_exists")))
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").currentBlockers.includes("OSS_RAM_STS_NOT_READY"))
  assert.equal(steps.get("BAP03_ACR_PURCHASE_AND_REPOSITORY").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP03_ACR_PURCHASE_AND_REPOSITORY").currentEvidence.includes("quotedAmount=CNY 117.00"))
  assert.deepEqual(steps.get("BAP04_ACR_IMAGE_PUSH_AND_PULL").blockedUntil, ["BAP03_ACR_PURCHASE_AND_REPOSITORY"])
  assert.ok(steps.get("BAP05_BACKEND_ENV_IMPORT").backendEnvExcludesForNow.includes("WECHAT_OPEN_APP_ID"))
  assert.deepEqual(steps.get("BAP06_SAE_RUNTIME_CREATE").blockedUntil, [
    "BAP04_ACR_IMAGE_PUSH_AND_PULL",
    "BAP05_BACKEND_ENV_IMPORT",
  ])
  assert.ok(steps.get("BAP07_DOMAINS_HTTPS_ICP").currentBlockers.includes("API_DOMAIN_HTTPS_ICP_NOT_READY"))
  assert.ok(steps.get("BAP08_SLS_ALERTS").currentEvidence.includes("alerts=0"))
  assert.ok(steps.get("BAP08_SLS_ALERTS").currentEvidence.includes("slsResource.observedReadiness=partial"))
  assert.ok(steps.get("BAP08_SLS_ALERTS").currentEvidence.some((item) => item.includes("meiye-huajing-app-prod-cn")))
  assert.ok(steps.get("BAP08_SLS_ALERTS").currentBlockers.includes("SLS_ALERTS_NOT_READY"))
  assert.ok(steps.get("BAP09_POSTDEPLOY_SMOKE").requiredAuthorizationPackets.includes("P09_PRODUCTION_DEPLOY"))

  assert.ok(report.userIntervention.paymentOrBillingConfirmations.some((item) => /ACR Enterprise/.test(item)))
  assert.ok(report.userIntervention.paymentOrBillingConfirmations.some((item) => /RDS PostgreSQL/.test(item)))
  assert.ok(report.userIntervention.requiredIds.includes("USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY"))
  assert.ok(report.userIntervention.secretOrPasswordHandling.some((item) => /read-only inventory/.test(item)))
  assert.ok(report.userIntervention.secretOrPasswordHandling.includes("DATABASE_URL_CN"))
  assert.ok(report.userIntervention.secretOrPasswordHandling.includes("database account password"))
  assert.ok(report.evidenceWritebackTargets.includes("deploy/aliyun-production-cn.cloud-inventory-results.local.json"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:env:handoff:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:user:actions:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:action:authorization:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:cloudshell:handoff"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:cloud:inventory-results:strict"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:rds:migration:package"))
  assert.ok(report.userIntervention.backendNowExcludes.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:evidence:writeback:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:operator:tasks:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:operator:handoff:backend"))
  assert.ok(!report.verificationOrder.includes("corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage"))
  assert.ok(report.safetyBoundary.some((item) => /does not create/.test(item)))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend apply package reports field-level RDS blockers after local scaffold exists", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-apply-package-rds-"))
  const localPath = path.join(tmpdir, "rds-migration.local.json")
  execFileSync(process.execPath, [
    "scripts/check-aliyun-rds-migration-evidence.mjs",
    "--allow-incomplete",
    "--init-local",
    "--local",
    localPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  })

  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-backend-apply-package.mjs",
    "--rds-migration",
    localPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  })
  const report = JSON.parse(output)
  const rdsStep = report.applySteps.find((item) => item.id === "BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE")

  assert.equal(report.summary.rdsMigrationEvidenceReady, false)
  assert.ok(rdsStep.currentEvidence.includes("rdsLocalExists=true"))
  assert.ok(rdsStep.currentEvidence.includes("rdsLocalReady=false"))
  assert.ok(!rdsStep.currentBlockers.includes("rdsEvidence:file_missing"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:rdsPostgres.confirmed"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:rdsPostgres.databaseUrlCnSecretImported"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:migration.schemaCompatibilityReviewed"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:migration.supabaseSpecificSqlResolved"))
  assert.ok(rdsStep.currentBlockers.includes("rdsEvidence:migration.rdsExtensionSupportConfirmed"))
  assert.ok(!rdsStep.currentBlockers.includes("rdsEvidence:migration.dataAccessAdapterReady"))
  assert.ok(rdsStep.currentEvidence.includes("appApiRoutesTouchingSupabaseCompatibility=29/31"))
  assert.ok(rdsStep.currentEvidence.includes("appApiRoutesWithSupabaseDataAccess=4/31"))
  assert.ok(rdsStep.currentEvidence.includes("firstVersionRdsRoutesTouchingSupabaseCompatibility=23/25"))
  assert.ok(rdsStep.currentEvidence.includes("firstVersionRdsRoutesWithSupabaseDataAccess=0/25"))

  assert.doesNotMatch(output, secretLike)
})

test("Aliyun backend apply package markdown is value-free and actionable", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-apply-package-"))
  const markdownPath = path.join(tmpdir, "backend-apply-package.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-backend-apply-package.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /## Operator Quick Start/)
  assert.match(markdown, /当前结论：不能部署；这不是微信移动应用阻塞，而是阿里云后端资源和证据还没有闭环。/)
  assert.match(markdown, /resource evidence: 0\/7/)
  assert.match(markdown, /deploy gate: canDeployBackendNow=false/)
  assert.match(markdown, /missing backend credential\/password: DATABASE_URL_CN/)
  assert.match(markdown, /deferred app launch items: WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /拿到动作时授权后，本批只做这四件事/)
  assert.match(markdown, /P00: 恢复 Aliyun CLI\/CloudShell 只读盘点/)
  assert.match(markdown, /P11: 创建或确认 cn-hangzhou RDS PostgreSQL/)
  assert.match(markdown, /Supabase SQL 兼容审查/)
  assert.match(markdown, /Supabase-specific SQL 处理/)
  assert.match(markdown, /RDS extension 支持/)
  assert.match(markdown, /DATABASE_URL_CN 只进入 KMS\/Secrets Manager\/SAE secret env/)
  assert.match(markdown, /P05: 确认 OSS bucket\/CORS\/service-records 前缀/)
  assert.match(markdown, /P03: 购买或确认 ACR Enterprise Economic cn-hangzhou 1个月 CNY117/)
  assert.match(markdown, /本批明确不做：微信开放平台移动应用、Android release signing、Apple Team ID\/AASA/)
  assert.match(markdown, /docker login\/push/)
  assert.match(markdown, /DNS\/HTTPS\/ICP 变更/)
  assert.match(markdown, /必须停手等用户确认的点/)
  assert.match(markdown, /CloudShell 如出现性能型 NAS 费用提示/)
  assert.match(markdown, /RDS 如涉及规格购买、实例费用、数据库账号密码或迁移执行/)
  assert.match(markdown, /ACR 付款页必须再次确认规格、地域、1个月和 CNY117 金额/)
  assert.match(markdown, /AccessKeySecret、STS token、registry password、DATABASE_URL_CN/)
  assert.match(markdown, /授权口径：授权本轮只做阿里云后端第一批动作/)
  assert.match(markdown, /BAP00_READONLY_INVENTORY_IDENTITY/)
  assert.match(markdown, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE/)
  assert.match(markdown, /BAP02_OSS_RAM_STS_CLOSE/)
  assert.match(markdown, /ossResource\.observedReadiness=partial/)
  assert.match(markdown, /BAP03_ACR_PURCHASE_AND_REPOSITORY/)
  assert.match(markdown, /BAP09_POSTDEPLOY_SMOKE/)
  assert.match(markdown, /slsResource\.observedReadiness=partial/)
  assert.match(markdown, /database account password/)
  assert.match(markdown, /Supabase SQL compatibility review before applying schema to Aliyun RDS/)
  assert.match(markdown, /schemaCompatibilityReviewed=true/)
  assert.match(markdown, /supabaseSpecificSqlResolved=true/)
  assert.match(markdown, /rdsExtensionSupportConfirmed=true/)
  assert.match(markdown, /USER_CONFIRM_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(markdown, /## Action-Time Authorization Request/)
  assert.match(markdown, /recommendedUserReply: 授权本轮只做阿里云后端第一批动作/)
  assert.match(markdown, /packetIds: P00_ALIYUN_READONLY_INVENTORY_IDENTITY, P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS, P03_ACR_PURCHASE/)
  assert.match(markdown, /不做微信\/Android\/iOS、不部署上线、不改 DNS/)
  assert.match(markdown, /不执行 docker login\/push/)
  assert.match(markdown, /actionTimeConfirmation\.minimumUserPhrase: .*CloudShell/)
  assert.match(markdown, /actionTimeConfirmation\.minimumUserPhrase: .*等待当前阿里云 CloudShell 连接完成/)
  assert.match(markdown, /cloudShellCurrentStatus=connecting_terminal_input_visible_inventory_not_executed/)
  assert.match(markdown, /actionTimeConfirmation\.allowedActions: .*正在连接 Cloud Shell/)
  assert.match(markdown, /actionTimeConfirmation\.explicitlyExcluded: .*当前 connecting 状态不授权/)
  assert.match(markdown, /cloudInventory:readonly_inventory_strict_ready=0\/9/)
  assert.match(markdown, /MEIYE_ALLOW_ALIYUN_READONLY_INVENTORY=1/)
  assert.match(markdown, /corepack pnpm aliyun:env:handoff:backend/)
  assert.match(markdown, /corepack pnpm aliyun:user:actions:backend/)
  assert.match(markdown, /corepack pnpm aliyun:action:authorization:backend/)
  assert.match(markdown, /corepack pnpm aliyun:evidence:writeback:backend/)
  assert.match(markdown, /corepack pnpm aliyun:operator:tasks:backend/)
  assert.match(markdown, /corepack pnpm aliyun:operator:handoff:backend/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /## Credential \/ Password Intervention/)
  assert.match(markdown, /missingCredentialValues: DATABASE_URL_CN/)
  assert.match(markdown, /missingCredentialValueActionIds: S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(markdown, /readySecretsPendingCloudImport: 17/)
  assert.match(markdown, /paidPurchaseConfirmationActionIds: S03_ACR_PAID_PURCHASE/)
  assert.match(markdown, /controlledSecretChannelActionIds: S04_ACR_REGISTRY_AUTH, S05_OSS_RAM_SECRET_OR_STS, S08_ALIYUN_RDS_DATABASE_URL, S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /## Backend Credential Acquisition Queue/)
  assert.match(markdown, /queueScope: backend_aliyun_only/)
  assert.match(markdown, /onlyMissingBackendCredentialValue: DATABASE_URL_CN/)
  assert.match(markdown, /DATABASE_URL_CN 从哪里获得并导入到哪里/)
  assert.match(markdown, /DATABASE_URL_CN -> 阿里云 KMS\/Secrets Manager\/SAE secret env only/)
  assert.match(markdown, /## Backend Resource Evidence Matrix/)
  assert.match(markdown, /rows: 10/)
  assert.match(markdown, /immediateRows: 4/)
  assert.match(markdown, /blockedRows: 6/)
  assert.match(markdown, /credentialOrPasswordRows: 6/)
  assert.match(markdown, /BAP00_READONLY_INVENTORY_IDENTITY[\s\S]*first_batch_after_action_time_confirmation[\s\S]*P00_ALIYUN_READONLY_INVENTORY_IDENTITY/)
  assert.match(markdown, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE[\s\S]*DATABASE_URL_CN secret value/)
  assert.match(markdown, /BAP05_BACKEND_ENV_IMPORT[\s\S]*blocked_until_dependencies_close[\s\S]*DATABASE_URL_CN/)
  assert.match(markdown, /BAP07_DOMAINS_HTTPS_ICP[\s\S]*deploy\/aliyun-production-cn\.cloud-confirmations\.local\.json -> items\.apiDomainHttps/)
  assert.match(markdown, /Every apply step still needs action-time confirmation/)
  assert.doesNotMatch(output + markdown, secretLike)
})
