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
  const byId = new Map(report.resources.map((item) => [item.id, item]))
  const briefById = new Map(report.resourceEvidenceBrief.rows.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.summary.total, 7)
  assert.equal(report.summary.ready, 7)
  assert.equal(report.summary.blocked, 0)
  assert.equal(report.summary.resourceEvidenceReady, "7/7")
  assert.deepEqual(report.summary.blockedResourceEvidenceIds, [])
  assert.deepEqual(report.resourceEvidenceBrief.blockedIds, report.summary.blockedResourceEvidenceIds)
  assert.equal(report.resourceEvidenceBrief.ready, 7)
  assert.equal(report.resourceEvidenceBrief.blocked, 0)
  assert.deepEqual(ids, [
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ])

  assert.equal(report.summary.ossAccessPlanReady, true)
  assert.equal(report.summary.runtimeSlsPlanReady, true)
  assert.equal(report.summary.envImportPlanReady, true)
  assert.equal(report.summary.envImportReadySecretEnvVariableCount, 18)
  assert.deepEqual(report.summary.envImportBlockedCredentialNames, [])
  assert.deepEqual(report.summary.backendRequiredBlocking, [])
  assert.ok(report.summary.backendOnlyExclusions.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.backendOnlyExclusions.includes("WECHAT_OPEN_APP_SECRET"))

  assert.equal(byId.get("R01_SAE_RUNTIME").ready, true)
  assert.equal(byId.get("R02_ACR_IMAGE_REGISTRY").ready, true)
  assert.equal(byId.get("R03_API_DOMAIN_HTTPS").ready, true)
  assert.equal(byId.get("R04_ASSET_DOMAIN_HTTPS").ready, true)
  assert.equal(byId.get("R05_OSS_AUDIO_STORAGE").ready, true)
  assert.equal(byId.get("R06_ENV_IMPORT").ready, true)
  assert.equal(byId.get("R07_SLS_ALERTS").ready, true)

  assert.deepEqual(briefById.get("R03_API_DOMAIN_HTTPS").requiredAuthorizationPackets, ["P07_DOMAIN_DNS_HTTPS"])
  assert.deepEqual(briefById.get("R04_ASSET_DOMAIN_HTTPS").requiredAuthorizationPackets, ["P07_DOMAIN_DNS_HTTPS"])
  assert.ok(briefById.get("R03_API_DOMAIN_HTTPS").currentEvidence.some((item) => item.includes("api-cn_recordId_2071280930303523840")))
  assert.ok(briefById.get("R03_API_DOMAIN_HTTPS").currentEvidence.some((item) => item.includes("aliyun_beian_query_2026-06-29T23:05_CST")))
  assert.ok(briefById.get("R03_API_DOMAIN_HTTPS").currentEvidence.some((item) => item.includes("node_postdeploy_smoke_2026-06-29T23:12_CST_https_api-cn_passed")))
  assert.ok(briefById.get("R04_ASSET_DOMAIN_HTTPS").currentEvidence.some((item) => item.includes("assets-cn_A_47_111_169_95")))
  assert.ok(briefById.get("R04_ASSET_DOMAIN_HTTPS").currentEvidence.some((item) => item.includes("aliyun_beian_query_2026-06-29T23:05_CST")))
  assert.ok(briefById.get("R04_ASSET_DOMAIN_HTTPS").currentEvidence.some((item) => item.includes("sae_clb_shared_static_asset_fallback_no_cdn")))
  assert.ok(briefById.get("R04_ASSET_DOMAIN_HTTPS").writeTargets.some((item) => item.includes("items.assetDomainHttps")))

  assert.ok(byId.get("R02_ACR_IMAGE_REGISTRY").currentEvidence.includes("runtime.remoteImageConfigured=true"))
  assert.ok(byId.get("R02_ACR_IMAGE_REGISTRY").currentEvidence.includes("runtime.imagePullConfigured=true"))
  assert.ok(byId.get("R05_OSS_AUDIO_STORAGE").currentEvidence.includes("oss.accessPlan.selectedReady=true"))
  assert.ok(byId.get("R06_ENV_IMPORT").currentEvidence.includes("envImportPlan.ready=true"))
  assert.ok(byId.get("R07_SLS_ALERTS").currentEvidence.includes("runtimeSlsPlan.ready=true"))

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
  assert.match(markdown, /resourceEvidenceReady: 7\/7/)
  assert.match(markdown, /blockedResourceEvidenceIds: none/)
  assert.match(markdown, /R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /P04_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /api-cn_recordId_2071280930303523840/)
  assert.match(markdown, /assets-cn_A_47_111_169_95/)
  assert.match(markdown, /aliyun_beian_query_2026-06-29T23:05_CST/)
  assert.match(markdown, /node_postdeploy_smoke_2026-06-29T23:12_CST_https_api-cn_passed/)
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
    "ready: 7 / 7",
    "blocked: 0",
    "containsValues: false",
    "secretLeakCheck: true",
    "mutationPerformed: false",
    "cloudAccessCanReadNow: true",
    "resourceEvidenceReady: 7/7",
    "blockedResourceEvidenceIds: none",
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
    "not_created_or_not_confirmed",
    "acr_image_pushed_runtime_pull_pending",
    "acr.execution.canStartP04AfterActionTimeConfirmation=false",
    "acr.execution.p04StrictReady=true",
    "acr.execution.forbiddenTransferPathIds=public_registry",
    "domain_visible_records_missing",
    "bucket_visible_unconfirmed",
    "oss.execution.canStartP05AfterActionTimeConfirmation=false",
    "oss.execution.preferredModeAvoidsLongLivedSecret=true",
    "cloudshell_disconnected_restart_confirmation_required",
    "envImportPlan.ready=true",
    "envImportPlan.readySecretEnvVariableCount=18",
    "cli_alidns_DescribeSubDomainRecords_2026-06-29T22:39_CST_api-cn_recordId_2071280930303523840_A_47_111_169_95_ENABLE_TTL600",
    "cli_alidns_DescribeSubDomainRecords_2026-06-29T22:39_CST_assets-cn_A_47_111_169_95_recordId_2071597824701158400_ENABLE_TTL600",
    "aliyun_beian_query_2026-06-29T23:05_CST_domain_ipgongchang_xin_status_filed_icp_su_2025228831_1_entity_wujiang_meizhiyue",
    "node_postdeploy_smoke_2026-06-29T23:12_CST_https_api-cn_passed_remote_health_3_paths_strict_200_app_api_31_probes_tmp_report",
    "sae_clb_shared_static_asset_fallback_no_cdn",
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
