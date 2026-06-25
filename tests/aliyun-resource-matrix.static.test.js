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
  assert.equal(report.summary.observedResourceStatuses.partial, 2)
  assert.equal(report.summary.observedResourceStatuses.blocked, 5)
  assert.ok(report.summary.observedResourceStatuses.blockedIds.includes("saeRuntime"))
  assert.ok(report.summary.observedResourceStatuses.blockedIds.includes("acrPurchase"))
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
  const ossBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R05_OSS_AUDIO_STORAGE")
  const envBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R06_ENV_IMPORT")
  const slsBrief = report.resourceEvidenceBrief.rows.find((item) => item.id === "R07_SLS_ALERTS")
  const blockedBriefsById = new Map(report.resourceEvidenceBrief.blockedResourceEvidence.map((item) => [item.id, item]))
  assert.deepEqual(runtimeBrief.requiredAuthorizationPackets, ["P08_SAE_RUNTIME_SLS"])
  assert.deepEqual(runtimeBrief.consoleTaskIds, ["C01_SAE_RUNTIME"])
  assert.ok(runtimeBrief.missingEvidence.some((item) => item.includes("runtime:")))
  assert.ok(runtimeBrief.writeTargets.some((item) => item.includes("items.runtime")))
  assert.deepEqual(acrBrief.requiredAuthorizationPackets, ["P03_ACR_PURCHASE", "P04_ACR_IMAGE_AND_PULL"])
  assert.deepEqual(acrBrief.consoleTaskIds, ["C02_ACR_IMAGE_AND_PULL"])
  assert.ok(acrBrief.currentEvidence.includes("acr.purchaseCandidate.quotedAmount=CNY 117.00"))
  assert.match(acrBrief.nextEvidenceAction, /ACR purchase/)
  assert.equal(ossBrief.observedReadiness, "partial")
  assert.ok(ossBrief.currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.ok(blockedBriefsById.get("R05_OSS_AUDIO_STORAGE").currentEvidence.some((item) => /bucket_exists/.test(item)))
  assert.deepEqual(envBrief.requiredAuthorizationPackets, ["P06_ENV_IMPORT"])
  assert.ok(envBrief.missingEvidence.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!envBrief.missingEvidence.some((item) => /WECHAT_OPEN_APP_ID|WECHAT_OPEN_APP_SECRET/.test(item)))
  assert.ok(envBrief.missingEvidence.some((item) => item.includes("envImport:")))
  assert.match(envBrief.nextEvidenceAction, /SAE\/KMS\/Secrets Manager/)
  assert.equal(slsBrief.observedReadiness, "partial")
  assert.ok(slsBrief.currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.ok(blockedBriefsById.get("R07_SLS_ALERTS").currentEvidence.some((item) => /project_meiye-huajing-app-prod-cn/.test(item)))
  assert.equal(acr.requiresActionTimeConfirmation, true)
  assert.equal(acr.mutationAllowedByThisCommand, false)
  assert.match(acr.consolePath, /容器镜像服务 ACR/)
  assert.equal(acr.observedResourceStatus.status, "purchase_candidate_visible_not_purchased")
  assert.ok(!acr.currentEvidence.some((item) => item.includes("TODO_")))
  assert.ok(acr.currentEvidence.includes("localDockerImage.status=ready"))
  assert.ok(acr.currentEvidence.includes("image.localDigestReady=true"))
  assert.ok(acr.currentEvidence.some((item) => item.startsWith("localDockerImage.repoDigest=meiye-huajing-app-api@sha256:")))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.edition=ACR Enterprise Economic"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.region=cn-hangzhou"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.quotedAmount=CNY 117.00"))
  assert.ok(acr.currentEvidence.includes("acr.purchaseCandidate.requiresActionTimePurchaseConfirmation=true"))
  assert.ok(acr.currentEvidence.includes("runtime.target=SAE"))
  assert.ok(acr.currentEvidence.includes("runtime.appName=meiye-huajing-app-api-production-cn"))
  assert.equal(apiDomain.observedResourceStatus.status, "domain_visible_records_missing")
  assert.equal(assetDomain.observedResourceStatus.status, "domain_visible_records_missing")
  assert.equal(oss.observedResourceStatus.status, "bucket_visible_unconfirmed")
  assert.equal(oss.observedResourceStatus.readiness, "partial")
  assert.match(env.consolePath, /KMS|Secrets Manager|SAE/)
  assert.ok([
    "cloudshell_disconnected_restart_confirmation_required",
    "cloudshell_not_opened_nas_fee_confirmation_required",
    "cloudshell_disconnected_or_config_missing",
  ].includes(env.observedResourceStatus.status))
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
  assert.match(markdown, /P03_ACR_PURCHASE, P04_ACR_IMAGE_AND_PULL/)
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
    "Production-cn cannot be deployed now.",
    "Current scope is `backend_aliyun_only`.",
    "resourceEvidenceReady=0/7",
    "cloudConfirmationsTotalBlockers=27",
    "imagePublishTotalBlockers=12",
    "cloudAccessCanReadNow=false",
    "observedPartial=2",
    "observedBlocked=5",
    "R01_SAE_RUNTIME",
    "R02_ACR_IMAGE_REGISTRY",
    "R03_API_DOMAIN_HTTPS",
    "R04_ASSET_DOMAIN_HTTPS",
    "R05_OSS_AUDIO_STORAGE",
    "R06_ENV_IMPORT",
    "R07_SLS_ALERTS",
    "not_created_or_not_confirmed",
    "purchase_candidate_visible_not_purchased",
    "domain_visible_records_missing",
    "bucket_visible_unconfirmed",
    "cloudshell_disconnected_or_config_missing",
    "missing `DATABASE_URL_CN`",
    "project_logstore_visible_alerts_pending",
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.runtime",
    "deploy/aliyun-production-cn.image-publish.local.json -> acr + runtime",
    "deploy/aliyun-production-cn.cloud-confirmations.local.json -> items.envImport",
    "corepack pnpm aliyun:resources:matrix",
    "corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage",
    "Do not purchase ACR or any paid resource.",
    "Do not deploy production-cn until resourceEvidenceReady=7/7 and strict gates pass.",
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
