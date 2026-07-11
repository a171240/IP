const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const envFixturePath = createEnvFixture()

const REQUIRED_MISSING = [
  "APP_ENV",
  "APP_REGION",
  "APP_VOICE_COACH_TEXT_REPOSITORY_MODE",
  "APP_API_BASE_URL",
  "APP_ASSET_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PRIVACY_POLICY_URL",
  "TERMS_URL",
  "DATABASE_URL_CN",
  "WECHAT_OPEN_APP_ID",
  "WECHAT_OPEN_APP_SECRET",
]

test("Aliyun env source map command is wired into scripts and deployment gates", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploymentSpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:env:source-map"], "node ./scripts/summarize-aliyun-env-source-map.mjs")
  assert.equal(pkg.scripts["aliyun:env:source-map:test"], "node --test tests/aliyun-env-source-map.static.test.js")
  assert.match(predeploy, /aliyun:env:source-map:test/)
  assert.match(predeploy, /aliyun:env:source-map", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:source-map:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:source-map -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:env:source-map"))
  assert.match(deploymentSpecChecker, /corepack pnpm aliyun:env:source-map/)
  assert.match(releaseArtifacts, /env-source-map\.json/)
  assert.match(releaseArtifacts, /envSourceMap/)
})

test("Aliyun env source map classifies Vercel migration names without printing values", () => {
  const outDir = fs.mkdtempSync("/tmp/meiye-env-source-map-test-")
  const coveragePath = path.join(outDir, "vercel-coverage.json")
  const jsonPath = path.join(outDir, "env-source-map.json")
  const markdownPath = path.join(outDir, "env-source-map.md")
  fs.writeFileSync(coveragePath, JSON.stringify(fakeVercelCoverage(), null, 2))

  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-env-source-map.mjs",
    "--env-file",
    envFixturePath,
    "--vercel-env-coverage-report",
    coveragePath,
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const markdown = fs.readFileSync(markdownPath, "utf8")
  const migrateNames = report.groups.migrateFromVercelProduction.map((item) => item.name)
  const appAliyunNames = report.groups.appAliyunOwnedNotInVercel.map((item) => item.name)
  const readyLocalMissingNames = report.groups.readyLocalButMissingFromVercel.map((item) => item.name)
  const blockedNames = report.groups.blockedExternalRequired.map((item) => item.name)
  const miniCompatNames = report.groups.miniProgramCompatOnly.map((item) => item.name)

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.vercelCoverage.ok, true)
  assert.equal(report.summary.vercelRequiredCovered, "15/26")
  assert.deepEqual(report.summary.requiredMissingInVercelProduction, REQUIRED_MISSING)
  assert.ok(migrateNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(migrateNames.includes("DEEPSEEK_API_KEY"))
  assert.ok(appAliyunNames.includes("APP_API_BASE_URL"))
  assert.ok(appAliyunNames.includes("APP_ASSET_BASE_URL"))
  assert.ok(readyLocalMissingNames.includes("APP_VOICE_COACH_TEXT_REPOSITORY_MODE"))
  assert.ok(blockedNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(blockedNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(blockedNames.includes("DATABASE_URL_CN"))
  assert.ok(blockedNames.includes("APPLE_TEAM_ID"))
  assert.ok(miniCompatNames.includes("WECHAT_MINI_APPID"))
  assert.ok(miniCompatNames.includes("WECHAT_MINI_SECRET"))
  assert.match(report.groups.miniProgramCompatOnly.find((item) => item.name === "WECHAT_MINI_SECRET").forbidden, /不能用于原生 APP 微信登录/)
  assert.match(markdown, /环境变量来源映射/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun env source map skip mode remains value-free and deterministic", () => {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-env-source-map.mjs",
    "--env-file",
    envFixturePath,
    "--skip-vercel-env-coverage",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)

  assert.equal(report.ok, true)
  assert.equal(report.vercelCoverage.skipped, true)
  assert.equal(report.summary.vercelCoverageStatus, "not_checked")
  assert.equal(report.groups.unknownVercelCoverage.length, report.summary.total)
  assert.equal(report.secretLeakCheck.ok, true)
})

function fakeVercelCoverage() {
  return {
    generatedAt: "2026-06-23T00:00:00.000Z",
    source: "test fixture",
    containsValues: false,
    project: "ip",
    scope: "team_test",
    environment: "production",
    totals: {
      vercelEntries: 130,
      uniqueNames: 130,
      productionNames: 130,
      requiredTotal: 28,
      requiredPresentInVercelProduction: 17,
      optionalTotal: 37,
      optionalPresentInVercelProduction: 29,
      extraProductionKeys: 0,
    },
    requiredMissingInVercelProduction: REQUIRED_MISSING,
    optionalMissingInVercelProduction: [
      "REDIS_URL_CN",
      "ALIYUN_OSS_SECURITY_TOKEN",
      "VOICE_COACH_ALLOW_USER_IDS",
      "CRON_SECRET",
      "ADMIN_EMAILS",
      "APPLE_TEAM_ID",
      "APIMART_IMAGE_API_KEY",
      "APIMART_IMAGE_BASE_URL",
      "APIMART_IMAGE_MODEL",
    ],
    bridgeKeysPresentInVercelProduction: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "WECHAT_LOGIN_SECRET",
      "WECHAT_MINI_APPID",
      "WECHAT_MINI_SECRET",
      "ALIYUN_OSS_ACCESS_KEY_ID",
      "ALIYUN_OSS_ACCESS_KEY_SECRET",
      "ALIYUN_OSS_BUCKET",
      "ALIYUN_OSS_REGION",
      "SERVICE_RECORD_OSS_PREFIX",
      "DASHSCOPE_API_KEY",
      "DEEPSEEK_API_KEY",
      "VOLC_SPEECH_APP_ID",
      "VOLC_SPEECH_ACCESS_TOKEN",
    ],
    appSpecificKeysMissingInVercelProduction: REQUIRED_MISSING,
    extraProductionKeys: [],
  }
}

function createEnvFixture() {
  const outDir = fs.mkdtempSync("/tmp/meiye-env-source-map-fixture-")
  const filePath = path.join(outDir, ".env.production-cn.local")
  fs.writeFileSync(filePath, [
    "APP_ENV=production-cn",
    "APP_REGION=cn-hangzhou",
    "APP_VOICE_COACH_TEXT_REPOSITORY_MODE=rds_voice_coach_text_session_contract",
    "APP_API_BASE_URL=https://api.example.test",
    "APP_ASSET_BASE_URL=https://assets.example.test",
    "NEXT_PUBLIC_SITE_URL=https://site.example.test",
    "PRIVACY_POLICY_URL=https://site.example.test/privacy",
    "TERMS_URL=https://site.example.test/terms",
    "NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.test",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=test",
    "SUPABASE_SERVICE_ROLE_KEY=test",
    "WECHAT_LOGIN_SECRET=test",
    "ALIYUN_OSS_BUCKET=meiye-service-records-test",
    "ALIYUN_OSS_REGION=oss-cn-hangzhou",
    "SERVICE_RECORD_OSS_PREFIX=service-records/",
    "DASHSCOPE_API_KEY=test",
    "BAILIAN_ASR_MODEL=paraformer-realtime-v2",
    "SERVICE_RECORD_ASR_PROVIDER=bailian",
    "DEEPSEEK_API_KEY=test",
    "DEEPSEEK_BASE_URL=https://deepseek.example.test",
    "DEEPSEEK_MODEL=deepseek-chat",
    "VOLC_SPEECH_APP_ID=app1",
    "VOLC_SPEECH_ACCESS_TOKEN=test",
    "",
  ].join("\n"))
  return filePath
}
