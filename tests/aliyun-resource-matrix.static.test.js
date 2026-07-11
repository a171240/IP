/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const fixtureArgs = Object.freeze([
  "--env-file",
  "tests/fixtures/aliyun-user-action-brief/env.production-cn.fixture",
  "--cloud-confirmations",
  "tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json",
  "--rds-migration",
  "tests/fixtures/aliyun-user-action-brief/rds-migration.fixture.json",
  "--image-publish",
  "tests/fixtures/aliyun-user-action-brief/image-publish.fixture.json",
])

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

test("Aliyun resource matrix reports the reproducible blocked fixture state without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-resource-matrix.mjs", ...fixtureArgs], {
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
  assert.equal(report.summary.ready, 0)
  assert.equal(report.summary.blocked, 7)
  assert.equal(report.summary.resourceEvidenceReady, "0/7")
  assert.deepEqual(report.summary.blockedResourceEvidenceIds, ids)
  assert.deepEqual(report.resourceEvidenceBrief.blockedIds, report.summary.blockedResourceEvidenceIds)
  assert.equal(report.resourceEvidenceBrief.ready, 0)
  assert.equal(report.resourceEvidenceBrief.blocked, 7)
  assert.deepEqual(ids, [
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
  ])

  assert.equal(report.summary.ossAccessPlanReady, false)
  assert.equal(report.summary.runtimeSlsPlanReady, false)
  assert.equal(report.summary.envImportPlanReady, false)
  assert.equal(report.summary.envImportReadySecretEnvVariableCount, 17)
  assert.deepEqual(report.summary.envImportBlockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.backendRequiredBlocking, ["DATABASE_URL_CN"])
  assert.ok(report.summary.backendOnlyExclusions.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.backendOnlyExclusions.includes("WECHAT_OPEN_APP_SECRET"))

  for (const id of ids) assert.equal(byId.get(id).ready, false, id)

  assert.deepEqual(briefById.get("R03_API_DOMAIN_HTTPS").requiredAuthorizationPackets, ["P07_DOMAIN_DNS_HTTPS"])
  assert.deepEqual(briefById.get("R04_ASSET_DOMAIN_HTTPS").requiredAuthorizationPackets, ["P07_DOMAIN_DNS_HTTPS"])
  assert.ok(briefById.get("R03_API_DOMAIN_HTTPS").currentEvidence.includes("fixture_api_domain_pending"))
  assert.ok(briefById.get("R04_ASSET_DOMAIN_HTTPS").currentEvidence.includes("fixture_asset_domain_pending"))
  assert.ok(briefById.get("R04_ASSET_DOMAIN_HTTPS").writeTargets.some((item) => item.includes("items.assetDomainHttps")))

  assert.ok(byId.get("R02_ACR_IMAGE_REGISTRY").currentEvidence.includes("runtime.remoteImageConfigured=false"))
  assert.ok(byId.get("R02_ACR_IMAGE_REGISTRY").currentEvidence.includes("runtime.imagePullConfigured=false"))
  assert.ok(byId.get("R05_OSS_AUDIO_STORAGE").currentEvidence.includes("oss.accessPlan.selectedReady=false"))
  assert.ok(byId.get("R06_ENV_IMPORT").currentEvidence.includes("envImportPlan.ready=false"))
  assert.ok(byId.get("R07_SLS_ALERTS").currentEvidence.includes("runtimeSlsPlan.ready=false"))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun resource matrix markdown renders the blocked fixture evidence brief without values", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "meiye-aliyun-resource-matrix-"))
  const markdownPath = path.join(tmpdir, "evidence-brief.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-resource-matrix.mjs",
    ...fixtureArgs,
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
  assert.match(markdown, /blockedResourceEvidenceIds: R01_SAE_RUNTIME, R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /R02_ACR_IMAGE_REGISTRY/)
  assert.match(markdown, /P04_ACR_IMAGE_AND_PULL/)
  assert.match(markdown, /C05_OSS_AUDIO_RAM_STS/)
  assert.match(markdown, /fixture_api_domain_pending/)
  assert.match(markdown, /fixture_asset_domain_pending/)
  assert.doesNotMatch(markdown, /app_api_31_probes/)
  assert.match(markdown, /deploy\/aliyun-production-cn\.cloud-confirmations\.local\.json/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("tracked resource matrix preserves a dated observation without satisfying current readiness", async () => {
  const doc = read("docs", "app-production-cn-resource-evidence-matrix.md")
  const targetDoc = read("docs", "app-production-cn-backend-aliyun-target.md")
  const manifest = read("docs", "release-manifest-2026-06-21-app-aliyun-production-cn-bridge.md")
  const {
    APP_API_SMOKE_PROBE_SET_ID,
    validatePostdeploySmokeReport,
  } = await import(pathToFileURL(path.join(root, "scripts", "summarize-aliyun-backend-cn-status.mjs")).href)
  const datedPostdeployObservation = "node_postdeploy_smoke_2026-06-29T23:12_CST_https_api-cn_passed_remote_health_3_paths_strict_200_app_api_31_probes_tmp_report"

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
    datedPostdeployObservation,
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

  assert.match(doc, /Generated: 2026-06-29T15:43:12\.413Z/)
  assert.match(doc, /Historical snapshot only/)
  assert.equal(validatePostdeploySmokeReport(datedPostdeployObservation).ready, false)
  assert.equal(doc.includes(APP_API_SMOKE_PROBE_SET_ID), false)
  assert.match(targetDoc, /Historical snapshot only/)
  assert.match(targetDoc, /Date: 2026-06-24/)
  assert.match(targetDoc, /firstVersionRdsRouteCount=25/)
  assert.match(targetDoc, /structured `postdeploy-smoke\.json`/)
  assert.match(manifest, /app-production-cn-resource-evidence-matrix\.md/)
  assert.doesNotMatch(doc, /missing `WECHAT_OPEN_APP_ID`/)
  assert.doesNotMatch(doc, /missing `WECHAT_OPEN_APP_SECRET`/)
  assert.doesNotMatch(doc, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(doc, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(doc, /:\/\/[^\s:@]+:[^\s@]+@/)
  assert.doesNotMatch(doc, /AccessKeySecret\s*[:=]\s*["'][^"']+["']/)
})
