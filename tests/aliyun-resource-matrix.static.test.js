const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun resource matrix command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:resources:matrix"], "node ./scripts/summarize-aliyun-resource-matrix.mjs")
  assert.equal(pkg.scripts["aliyun:resources:matrix:test"], "node --test tests/aliyun-resource-matrix.static.test.js")
  assert.match(predeploy, /aliyun:resources:matrix:test/)
  assert.match(predeploy, /aliyun:resources:matrix/)
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:resources:matrix"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:resources:matrix:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:resources:matrix"))
  assert.match(releaseArtifacts, /resourceEvidenceReady/)
  assert.match(releaseArtifacts, /blockedResourceEvidenceIds/)
  assert.match(releaseArtifacts, /resourceEvidenceBrief/)
})

test("Aliyun resource matrix names required cloud resources without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-resource-matrix.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const report = JSON.parse(output)
  const ids = report.resources.map((item) => item.id)
  const runtime = report.resources.find((item) => item.id === "R01_SAE_RUNTIME")
  const acr = report.resources.find((item) => item.id === "R02_ACR_IMAGE_REGISTRY")
  const apiDomain = report.resources.find((item) => item.id === "R03_API_DOMAIN_HTTPS")
  const assetDomain = report.resources.find((item) => item.id === "R04_ASSET_DOMAIN_HTTPS")
  const oss = report.resources.find((item) => item.id === "R05_OSS_AUDIO_STORAGE")
  const env = report.resources.find((item) => item.id === "R06_ENV_IMPORT")
  const sls = report.resources.find((item) => item.id === "R07_SLS_ALERTS")

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.summary.total, 7)
  assert.deepEqual(report.summary.backendRequiredBlocking, ["DATABASE_URL_CN"])
  assert.ok(report.summary.backendOnlyExclusions.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.backendOnlyExclusions.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.summary.blocked >= 1)
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R01_SAE_RUNTIME"))
  assert.ok(report.summary.blockedResourceEvidenceIds.includes("R06_ENV_IMPORT"))
  assert.equal(report.resourceEvidenceBrief.total, 7)
  assert.equal(report.resourceEvidenceBrief.ready, 0)
  assert.equal(report.resourceEvidenceBrief.blocked, 7)
  assert.ok(report.resourceEvidenceBrief.blockedIds.includes("R02_ACR_IMAGE_REGISTRY"))
  assert.ok(report.resourceEvidenceBrief.valueHandlingRules.some((item) => /受控密钥环境/.test(item)))
  assert.equal(report.summary.observedResourceStatuses.total, 7)
  assert.equal(report.summary.observedResourceStatuses.ready, 0)
  assert.equal(report.summary.observedResourceStatuses.partial, 3)
  assert.equal(report.summary.observedResourceStatuses.blocked, 4)
  assert.ok(report.summary.observedResourceStatuses.blockedIds.includes("saeRuntime"))
  assert.ok(report.summary.observedResourceStatuses.blockedIds.includes("cloudShellInventory"))
  assert.equal(report.summary.ossAccessPlanReady, false)
  assert.deepEqual(report.summary.recommendedOssAccessModes, ["sae_runtime_role", "sts_assume_role"])
  assert.equal(report.summary.runtimeSlsPlanReady, false)
  assert.deepEqual(report.summary.recommendedRuntimeSlsModes, ["sae_custom_container_runtime", "sls_health_5xx_alerts"])
  assert.equal(report.summary.envImportPlanReady, false)
  assert.deepEqual(report.summary.envImportBlockedCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.summary.envImportReadySecretEnvVariableCount, 17)
  assert.deepEqual(ids, [
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ])
  assert.equal(runtime.observedResourceStatus.status, "not_created_or_not_confirmed")
  assert.equal(runtime.observedResourceStatus.readiness, "blocked")
  const runtimeBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R01_SAE_RUNTIME")
  const acrBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R02_ACR_IMAGE_REGISTRY")
  const apiDomainBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R03_API_DOMAIN_HTTPS")
  const assetDomainBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R04_ASSET_DOMAIN_HTTPS")
  const ossBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R05_OSS_AUDIO_STORAGE")
  const envBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R06_ENV_IMPORT")
  const slsBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R07_SLS_ALERTS")
  const blockedBriefsById = new Map(report.resourceEvidenceBrief.blockedResourceEvidence.map((item) => [item.id, item]))
  assert.deepEqual(runtimeBrief.requiredAuthorizationPackets, ["P08_SAE_RUNTIME_SLS"])
  assert.deepEqual(runtimeBrief.consoleTaskIds, ["C01_SAE_RUNTIME"])
  assert.ok(runtimeBrief.missingEvidence.some((item) => item.includes("runtime:")))
  assert.ok(runtimeBrief.writeTargets.some((item) => item.includes("items.runtime")))
  assert.equal(report.summary.runtimePlanDataLayerTarget, "Aliyun RDS PostgreSQL")
  assert.deepEqual(report.summary.runtimePlanPredeployDependencyIds, [
    "RDS_POSTGRES_MIGRATION",
    "ACR_IMAGE_DIGEST_AND_PULL",
    "OSS_RUNTIME_ACCESS",
    "BACKEND_ENV_IMPORT",
  ])
  assert.ok(runtime.currentEvidence.includes("runtimePlan.dataLayerTarget=Aliyun RDS PostgreSQL"))
  assert.ok(runtime.currentEvidence.includes("runtimePlan.dataLayerConnectionEnvName=DATABASE_URL_CN"))
  assert.ok(runtime.currentEvidence.includes(
    "runtimePlan.predeployDependencyIds=RDS_POSTGRES_MIGRATION,ACR_IMAGE_DIGEST_AND_PULL,OSS_RUNTIME_ACCESS,BACKEND_ENV_IMPORT",
  ))
  assert.ok(runtime.currentEvidence.includes("runtimeSlsPlan.ready=false"))
  assert.ok(runtime.currentEvidence.includes("runtimeSlsPlan.runtime.selectedMode=pending_create_sae_custom_container_runtime"))
  assert.ok(runtime.currentEvidence.includes("runtimeSlsPlan.runtime.targetAppName=meiye-huajing-app-api-production-cn"))
  assert.ok(runtime.currentEvidence.includes("runtimeSlsPlan.runtime.recommendedModeIds=sae_custom_container_runtime"))
  assert.ok(runtime.currentEvidence.includes("runtimeSlsPlan.runtime.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime"))
  assert.ok(runtime.currentEvidence.includes("runtimeSlsPlan.runtime.candidateIds=sae_custom_container_runtime"))
  assert.match(runtimeBrief.nextEvidenceAction, /ACR image digest/)
  assert.deepEqual(acrBrief.requiredAuthorizationPackets, ["P04_ACR_IMAGE_AND_PULL"])
  assert.deepEqual(acrBrief.consoleTaskIds, ["C02_ACR_IMAGE_AND_PULL"])
  assert.ok(acrBrief.currentEvidence.includes("acr.purchaseCandidate.quotedAmount=CNY 117.00"))
  assert.match(acrBrief.nextEvidenceAction, /image push\/digest/)
  assert.equal(ossBrief.observedReadiness, "partial")
  assert.ok(ossBrief.currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.selectedMode=pending_choose_sae_runtime_role_or_sts"))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.selectedReady=false"))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.recommendedModeIds=sae_runtime_role,sts_assume_role"))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.policyFile=deploy/aliyun-production-cn.oss-ram-policy.json"))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.policyName=MeiyeHuajingServiceRecordsOssPolicy"))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.oss"))
  assert.ok(ossBrief.currentEvidence.includes("oss.accessPlan.allowedActions=oss:GetObject,oss:PutObject,oss:PostObject"))
  assert.ok(ossBrief.currentEvidence.includes(
    "oss.accessPlan.resourceScope=acs:oss:*:*:meiye-huajing-service-records-production-cn/service-records/production-cn/*",
  ))
  assert.ok(ossBrief.currentEvidence.includes("oss.runtimePrefixContract.requiredEnvName=SERVICE_RECORD_OSS_PREFIX"))
  assert.ok(ossBrief.currentEvidence.includes("oss.runtimePrefixContract.expectedValue=service-records/production-cn"))
  assert.ok(ossBrief.currentEvidence.includes("oss.runtimePrefixContract.policyScopeCoversExpectedPrefix=true"))
  assert.ok(ossBrief.currentEvidence.includes("oss.runtimePrefixContract.currentConfirmationPrefixReady=true"))
  assert.ok(ossBrief.currentEvidence.includes("oss.execution.canStartP05AfterActionTimeConfirmation=true"))
  assert.ok(ossBrief.currentEvidence.includes("oss.execution.resourceReadyForP05=true"))
  assert.ok(ossBrief.currentEvidence.includes("oss.execution.accessGrantReady=false"))
  assert.ok(ossBrief.currentEvidence.includes("oss.execution.preferredModeId=sae_runtime_role"))
  assert.ok(ossBrief.currentEvidence.includes("oss.execution.preferredModeAvoidsLongLivedSecret=true"))
  assert.ok(ossBrief.currentEvidence.includes("oss.execution.fallbackSecretModeIds=sts_assume_role,least_privilege_ram_user_secret_env"))
  assert.ok(ossBrief.currentEvidence.includes(
    "oss.execution.fallbackSecretEnvNames=ALIYUN_OSS_ACCESS_KEY_ID,ALIYUN_OSS_ACCESS_KEY_SECRET,ALIYUN_OSS_SECURITY_TOKEN",
  ))
  assert.ok(ossBrief.currentEvidence.includes(
    "oss.execution.nextOperatorDecision=choose_sae_runtime_role_or_sts_then_bind_least_privilege_policy",
  ))
  assert.ok(blockedBriefsById.get("R05_OSS_AUDIO_STORAGE").currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.deepEqual(envBrief.requiredAuthorizationPackets, ["P06_ENV_IMPORT"])
  assert.ok(envBrief.missingEvidence.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!envBrief.missingEvidence.some((item) => /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/.test(item)))
  assert.ok(envBrief.missingEvidence.some((item) => item.includes("envImport:")))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.ready=false"))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.selectedMode=pending_secret_env_import_after_resource_dependencies"))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.importTarget=SAE"))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.secretEnvStore=KMS/SecretsManager/SAE secret env"))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.blockedCredentialNames=DATABASE_URL_CN"))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.readySecretEnvVariableCount=17"))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.readySecretEnvVariableGroupCount=9"))
  assert.ok(envBrief.currentEvidence.includes(
    "envImportPlan.blockedSecretBatchIds=BLOCKED_SECRET_BATCH_01_OSS_RAM_STS,BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
  ))
  assert.ok(envBrief.currentEvidence.some((item) => item.includes("READY_SECRET_BATCH_09_MINI_PROGRAM_COMPAT")))
  assert.ok(envBrief.currentEvidence.includes("envImportPlan.importBatchCount=11"))
  assert.ok(envBrief.currentEvidence.includes(
    "envImportPlan.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
  ))
  assert.ok(envBrief.currentEvidence.includes(
    "envImportPlan.candidateIds=blocked_rds_database_url_secret,blocked_oss_ram_sts_secret_env,ready_backend_secret_env_batches",
  ))
  assert.match(envBrief.nextEvidenceAction, /secret-env batches/)
  assert.match(envBrief.nextEvidenceAction, /RDS, OSS\/RAM\/STS, ACR image, and SAE runtime/)
  assert.equal(slsBrief.observedReadiness, "partial")
  assert.ok(slsBrief.currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.ready=false"))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.slsAlerts.selectedMode=pending_bind_sae_logs_and_alerts"))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.slsAlerts.targetProject=meiye-huajing-app-prod-cn"))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.slsAlerts.targetLogstore=app-api"))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.slsAlerts.recommendedModeIds=sls_health_5xx_alerts"))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.slsAlerts.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.slsAlerts"))
  assert.ok(sls.currentEvidence.includes("runtimeSlsPlan.slsAlerts.candidateIds=sls_health_5xx_alerts"))
  assert.match(slsBrief.nextEvidenceAction, /health and 5xx alerts/)
  assert.ok(blockedBriefsById.get("R07_SLS_ALERTS").currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.equal(acr.requiresActionTimeConfirmation, true)
  assert.equal(acr.mutationAllowedByThisCommand, false)
  assert.match(acr.consolePath, /容器镜像服务 ACR/)
  assert.equal(acr.observedResourceStatus.status, "acr_repository_confirmed_image_push_pending")
  assert.equal(acr.observedResourceStatus.readiness, "partial")
  assert.ok(!acr.currentEvidence.some((item) => item.includes("TODO_")))
  assert.ok(acr.currentEvidence.includes("dockerContext.status=ready"))
  assert.ok(acr.currentEvidence.includes("dockerContext.ok=true"))
  assert.ok(acr.currentEvidence.includes("dockerContext.checkedFiles=7"))
  assert.ok(acr.currentEvidence.includes("dockerContext.sensitiveEnvExcluded=true"))
  assert.ok(acr.currentEvidence.includes("localDockerImage.status=docker_daemon_unavailable_or_timeout"))
  assert.ok(acr.currentEvidence.includes("localDockerImage.dockerClientInstalled=true"))
  assert.ok(acr.currentEvidence.includes("localDockerImage.dockerServerAvailable=false"))
  assert.ok(acr.currentEvidence.some((item) => item.includes("localDockerImage.nextEvidenceAction=Start Docker Desktop/daemon")))
  assert.ok(acr.currentEvidence.includes("image.localDigestReady=true"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.edition=ACR Enterprise Economic"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.region=cn-hangzhou"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.quotedAmount=CNY 117.00"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=false"))
  assert.ok(acr.currentEvidence.includes("acr.publicNetworkEntranceEnabled=false"))
  assert.ok(acr.currentEvidence.includes("acr.pushNetworkPlan.selectedPath=pending_choose_vpc_registry_or_enable_public_network_entrance"))
  assert.ok(acr.currentEvidence.includes("acr.pushNetworkPlan.selectedReady=false"))
  assert.ok(acr.currentEvidence.includes("acr.pushNetworkPlan.recommendedPathIds=vpc_registry_from_aliyun_network,acr_import_task"))
  assert.ok(acr.currentEvidence.includes("acr.execution.canStartP04AfterActionTimeConfirmation=true"))
  assert.ok(acr.currentEvidence.includes("acr.execution.p04StrictReady=false"))
  assert.ok(acr.currentEvidence.includes("acr.execution.selectedTransferPathReady=false"))
  assert.ok(acr.currentEvidence.includes("acr.execution.localPublicPushReady=false"))
  assert.ok(acr.currentEvidence.includes("acr.execution.dockerDaemonReady=false"))
  assert.ok(acr.currentEvidence.includes("acr.execution.recommendedTransferPathIds=vpc_registry_from_aliyun_network,acr_import_task"))
  assert.ok(acr.currentEvidence.includes("acr.execution.forbiddenTransferPathIds=public_registry"))
  assert.ok(acr.currentEvidence.includes("acr.execution.nextOperatorDecision=choose_vpc_registry_from_aliyun_network_or_acr_import_task"))
  assert.ok(acr.currentEvidence.includes("runtime.target=SAE"))
  assert.ok(acr.currentEvidence.includes("runtime.appName=meiye-huajing-app-api-production-cn"))
  assert.equal(apiDomain.observedResourceStatus.status, "domain_visible_records_missing")
  assert.equal(assetDomain.observedResourceStatus.status, "domain_visible_records_missing")
  assert.ok(apiDomain.currentEvidence.includes("domainHttpsPlan.ready=false"))
  assert.ok(apiDomain.currentEvidence.includes("domainHttpsPlan.apiDomainHttps.selectedMode=pending_sae_runtime_public_endpoint"))
  assert.ok(apiDomain.currentEvidence.includes("domainHttpsPlan.apiDomainHttps.targetHost=api-cn.ipgongchang.xin"))
  assert.ok(apiDomain.currentEvidence.includes("domainHttpsPlan.apiDomainHttps.recommendedModeIds=api_sae_custom_domain"))
  assert.ok(apiDomain.currentEvidence.includes("domainHttpsPlan.apiDomainHttps.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.apiDomainHttps"))
  assert.ok(apiDomain.currentEvidence.includes("domainHttpsPlan.apiDomainHttps.candidateIds=api_sae_custom_domain"))
  assert.ok(assetDomain.currentEvidence.includes("domainHttpsPlan.ready=false"))
  assert.ok(assetDomain.currentEvidence.includes("domainHttpsPlan.assetDomainHttps.selectedMode=pending_choose_cdn_or_oss_custom_domain"))
  assert.ok(assetDomain.currentEvidence.includes("domainHttpsPlan.assetDomainHttps.targetHost=assets-cn.ipgongchang.xin"))
  assert.ok(assetDomain.currentEvidence.includes("domainHttpsPlan.assetDomainHttps.recommendedModeIds=asset_cdn_custom_domain"))
  assert.ok(assetDomain.currentEvidence.includes("domainHttpsPlan.assetDomainHttps.writebackTemplate=deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.assetDomainHttps"))
  assert.ok(assetDomain.currentEvidence.includes("domainHttpsPlan.assetDomainHttps.candidateIds=asset_cdn_custom_domain,asset_oss_custom_domain"))
  assert.match(apiDomainBrief.nextEvidenceAction, /SAE runtime public endpoint/)
  assert.match(assetDomainBrief.nextEvidenceAction, /OSS\/CDN asset origin/)
  assert.equal(oss.observedResourceStatus.status, "bucket_visible_unconfirmed")
  assert.equal(oss.observedResourceStatus.readiness, "partial")
  assert.match(env.consolePath, /KMS|Secrets Manager|SAE/)
  assert.equal(env.observedResourceStatus.status, "cloudshell_disconnected_restart_confirmation_required")
  assert.equal(sls.observedResourceStatus.status, "project_logstore_visible_alerts_pending")
  assert.equal(sls.observedResourceStatus.readiness, "partial")
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun resource matrix markdown renders the resource evidence brief without values", () => {
  const markdownPath = "/tmp/meiye-aliyun-resource-matrix-evidence-brief.md"
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 30,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /## 资源证据简表/)
  assert.match(markdown, /resourceEvidenceReady: 0\/7/)
  assert.match(markdown, /blockedResourceEvidenceIds: R01_SAE_RUNTIME/)
  assert.match(markdown, /R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /P04_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /deploy\/aliyun-production-cn\.cloud-confirmations\.local\.json/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("tracked APP production-cn resource matrix doc pins the current blocked Aliyun resource evidence state", () => {
  const doc = read("docs", "app-production-cn-resource-evidence-matrix.md")
  const manifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")

  for (const expected of [
    "美业话镜 APP production-cn 阿里云资源矩阵",
    "currentScope: backend_aliyun_only",
    "fullAppLaunchScope: deferred_after_backend_online",
    "ready: 0 / 7",
    "blocked: 7",
    "containsValues: false",
    "secretLeakCheck: true",
    "mutationPerformed: false",
    "cloudAccessCanReadNow: false",
    "resourceEvidenceReady: 0/7",
    "blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY, R03_API_DOMAIN_HTTPS, R04_ASSET_DOMAIN_HTTPS, R05_OSS_AUDIO_STORAGE, R06_ENV_IMPORT, R07_SLS_ALERTS",
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
    "not_created_or_not_confirmed",
    "acr_repository_confirmed_image_push_pending",
    "acr.execution.canStartP04AfterActionTimeConfirmation=true",
    "acr.execution.p04StrictReady=false",
    "acr.execution.forbiddenTransferPathIds=public_registry",
    "domain_visible_records_missing",
    "bucket_visible_unconfirmed",
    "oss.execution.canStartP05AfterActionTimeConfirmation=true",
    "oss.execution.preferredModeAvoidsLongLivedSecret=true",
    "cloudshell_disconnected_restart_confirmation_required",
    "envImportPlan.ready=false",
    "envImportPlan.readySecretEnvVariableCount=17",
    "BLOCKED_SECRET_BATCH_01_OSS_RAM_STS",
    "BLOCKED_SECRET_BATCH_02_RDS_DATABASE_SECRET_AND_MIGRATION",
    "missing_required_env:DATABASE_URL_CN",
    "project_logstore_visible_alerts_pending",
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
    "deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime",
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
    "corepack pnpm aliyun:domain:strict",
    "corepack pnpm aliyun:app-api:smoke",
    "本命令不创建阿里云资源、不付款、不修改 DNS、不导入环境变量、不推送镜像、不部署。",
  ]) {
    assert.match(doc, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }

  assert.match(manifest, /app-production-cn-resource-evidence-matrix\.md/)
  assert.doesNotMatch(doc, /missing `WECHAT_OPEN_APP_ID`/)
  assert.doesNotMatch(doc, /missing `WECHAT_OPEN_APP_SECRET`/)
  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})
