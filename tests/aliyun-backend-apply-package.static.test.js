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
  assert.match(script, /B00_ALIYUN_BACKEND_APPLY_PACKAGE/)
  assert.match(script, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE/)
  assert.match(script, /BAP09_POSTDEPLOY_SMOKE/)
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
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.deferredAppLaunchBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(!report.summary.backendRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))

  assert.equal(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").currentBlockers.includes("DATABASE_URL_CN"))
  assert.ok(steps.get("BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE").userMustHandle.includes("database account password"))
  assert.equal(steps.get("BAP02_OSS_RAM_STS_CLOSE").canStartAfterActionTimeConfirmation, true)
  assert.ok(steps.get("BAP02_OSS_RAM_STS_CLOSE").requiredAuthorizationPackets.includes("P05_OSS_RAM_STS"))
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
  assert.ok(steps.get("BAP09_POSTDEPLOY_SMOKE").requiredAuthorizationPackets.includes("P09_PRODUCTION_DEPLOY"))

  assert.ok(report.userIntervention.paymentOrBillingConfirmations.some((item) => /ACR Enterprise/.test(item)))
  assert.ok(report.userIntervention.paymentOrBillingConfirmations.some((item) => /RDS PostgreSQL/.test(item)))
  assert.ok(report.userIntervention.secretOrPasswordHandling.includes("DATABASE_URL_CN"))
  assert.ok(report.userIntervention.secretOrPasswordHandling.includes("database account password"))
  assert.ok(report.userIntervention.backendNowExcludes.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:evidence:writeback:backend"))
  assert.ok(report.verificationOrder.includes("corepack pnpm aliyun:operator:handoff:backend"))
  assert.ok(!report.verificationOrder.includes("corepack pnpm aliyun:evidence:writeback -- --skip-vercel-env-coverage"))
  assert.ok(report.safetyBoundary.some((item) => /does not create/.test(item)))

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
  assert.match(markdown, /BAP01_RDS_POSTGRES_CREATE_AND_MIGRATE/)
  assert.match(markdown, /BAP02_OSS_RAM_STS_CLOSE/)
  assert.match(markdown, /BAP03_ACR_PURCHASE_AND_REPOSITORY/)
  assert.match(markdown, /BAP09_POSTDEPLOY_SMOKE/)
  assert.match(markdown, /database account password/)
  assert.match(markdown, /corepack pnpm aliyun:evidence:writeback:backend/)
  assert.match(markdown, /corepack pnpm aliyun:operator:handoff:backend/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /Every apply step still needs action-time confirmation/)
  assert.doesNotMatch(output + markdown, secretLike)
})
