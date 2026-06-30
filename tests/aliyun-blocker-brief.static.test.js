const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const secretLike = /(sk-[A-Za-z0-9_-]{20,}|LTAI[A-Za-z0-9]{12,}|:\/\/[^\s:@]+:[^\s@]+@|AccessKeySecret\s*[:=]\s*\S{8,}|token\s*[:=]\s*\S{8,})/i
const fixtureArgs = Object.freeze([
  "--env-file",
  "tests/fixtures/aliyun-user-action-brief/env.production-cn.fixture",
  "--cloud-confirmations",
  "tests/fixtures/aliyun-user-action-brief/cloud-confirmations.fixture.json",
  "--cloud-inventory-results",
  "tests/fixtures/aliyun-user-action-brief/cloud-inventory-results.fixture.json",
  "--rds-migration",
  "tests/fixtures/aliyun-user-action-brief/rds-migration.fixture.json",
  "--image-publish",
  "tests/fixtures/aliyun-user-action-brief/image-publish.fixture.json",
])

test("Aliyun blocker brief command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const blockerBrief = read("scripts", "summarize-aliyun-blocker-brief.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:blockers:brief"], "node ./scripts/summarize-aliyun-blocker-brief.mjs")
  assert.equal(pkg.scripts["aliyun:blockers:brief:backend"], "node ./scripts/summarize-aliyun-blocker-brief.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:blockers:brief:test"], "node --test tests/aliyun-blocker-brief.static.test.js")
  assert.match(predeploy, /aliyun:blockers:brief:test/)
  assert.match(predeploy, /aliyun:blockers:brief/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:blockers:brief:test"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:blockers:brief"))
  assert.match(releaseArtifacts, /blocker-brief\.json/)
  assert.match(releaseArtifacts, /currentBrowserCanUseCurrentConsole/)
  assert.match(blockerBrief, /renderBackendOnlyMarkdown/)
  assert.match(blockerBrief, /filterEnvSourceBlockedExternalScope/)
})

test("Aliyun blocker brief backend-only markdown reflects current backend closure state", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-backend-blocker-brief-"))
  const markdownPath = path.join(tmpdir, "backend-blocker-brief.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-blocker-brief.mjs",
    "--backend-only",
    ...fixtureArgs,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(report.ok, true)
  assert.equal(report.backendOnly, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.summary.canProceedWithoutWechat, true)
  assert.equal(report.summary.backendTargetReady, "0/8")
  assert.equal(report.summary.cloudConfirmationsReady, "0/6")
  assert.match(report.summary.operatorTasksReady, /^[01]\/8$/)
  assert.match(report.summary.cloudResourceEvidenceReady, /^[01]\/7$/)
  assert.ok(report.summary.requiredBlocking.includes("RDS_MIGRATION_EVIDENCE_NOT_READY"))
  assert.ok(report.summary.requiredBlocking.includes("DATABASE_URL_CN"))
  assert.deepEqual(report.summary.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.envSourceCurrentBackendBlockedExternalRequired, ["DATABASE_URL_CN"])
  assert.deepEqual(report.envSourceMap.blockedExternalScope.currentBackend, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.canStartNowAuthorizationPackets, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assert.deepEqual(report.nextActionSequencing.canStartNowAuthorizationPackets, [
    "P11_ALIYUN_RDS_DATA_MIGRATION",
    "P05_OSS_RAM_STS",
  ])
  assert.equal(report.bridgeDataLayer.status, "blocked_until_aliyun_rds_postgresql_migration_ready")
  assert.equal(report.bridgeDataLayer.databaseUrlCnStatus, "empty")
  assert.equal(report.bridgeDataLayer.rdsMigrationIncludedInThisRelease, false)

  assert.match(markdown, /阿里云后端-only 当前执行简报/)
  assert.match(markdown, /backendTargetReady: 0\/8/)
  assert.match(markdown, /cloudConfirmationsReady: 0\/6/)
  assert.match(markdown, /blockedCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /RDS_MIGRATION_EVIDENCE_NOT_READY/)
  assert.match(markdown, /canStartNowAuthorizationPackets: P11_ALIYUN_RDS_DATA_MIGRATION, P05_OSS_RAM_STS/)
  assert.match(markdown, /databaseUrlCnStatus: empty/)
  assert.match(markdown, /currentBackendBlockedExternalRequired: DATABASE_URL_CN/)
  assert.doesNotMatch(markdown, /### P07_DOMAIN_DNS_HTTPS/)
  assert.match(markdown, /R03_API_DOMAIN_HTTPS/)
  assert.match(markdown, /R04_ASSET_DOMAIN_HTTPS/)
  assert.match(markdown, /Strict 验证顺序/)
  assert.doesNotMatch(markdown, /微信开放平台移动应用链路/)
  assert.doesNotMatch(markdown, /APP 微信登录凭证边界/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(markdown, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.doesNotMatch(markdown, /P10_ANDROID_RELEASE_SIGNING/)
  assert.doesNotMatch(markdown, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.doesNotMatch(markdown, secretLike)
})
