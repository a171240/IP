const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))
const envFixturePath = createEnvFixture()

test("Aliyun env handoff command is wired into scripts and deployment spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploymentSpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")

  assert.equal(pkg.scripts["aliyun:env:handoff"], "node ./scripts/summarize-aliyun-env-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:env:handoff:backend"], "node ./scripts/summarize-aliyun-env-handoff.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:env:handoff:test"], "node --test tests/aliyun-env-handoff.static.test.js")
  assert.match(predeploy, /aliyun:env:handoff:test/)
  assert.match(predeploy, /aliyun:env:handoff/)
  assert.match(predeploy, /aliyun:env:handoff:backend/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:handoff:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:handoff"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:handoff:backend"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:env:handoff"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:env:handoff:backend"))
  assert.match(deploymentSpecChecker, /corepack pnpm aliyun:env:handoff/)
  assert.match(deploymentSpecChecker, /corepack pnpm aliyun:env:handoff:backend/)
  assert.match(releaseArtifacts, /credentialAcquisitionQueueScope/)
  assert.match(releaseArtifacts, /credentialAcquisitionQueueMissingNames/)
  assert.match(releaseArtifacts, /credentialAcquisitionQueueActionIds/)
})

test("Aliyun env handoff groups current variables without printing values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--env-file",
    envFixturePath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const blockedNames = report.groups.blockedRequired.map((item) => item.name)
  const appLaunchNames = report.groups.appLaunchBlocking.map((item) => item.name)
  const readySecretNames = report.groups.readySecretEnv.map((item) => item.name)
  const readyPlainNames = report.groups.readyPlainEnv.map((item) => item.name)
  const deferredNames = report.groups.deferred.map((item) => item.name)
  const wechatAppId = report.groups.appLaunchBlocking.find((item) => item.name === "WECHAT_OPEN_APP_ID")
  const wechatSecret = report.groups.appLaunchBlocking.find((item) => item.name === "WECHAT_OPEN_APP_SECRET")
  const appleTeamId = report.groups.appLaunchBlocking.find((item) => item.name === "APPLE_TEAM_ID")

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.deepEqual(blockedNames, ["DATABASE_URL_CN"])
  assert.ok(report.summary.fullAppRequiredBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.summary.fullAppRequiredBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(appLaunchNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(appLaunchNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(appLaunchNames.includes("APPLE_TEAM_ID"))
  assert.ok(readyPlainNames.includes("APP_API_BASE_URL"))
  assert.ok(readySecretNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(!deferredNames.includes("DATABASE_URL_CN"))
  assert.ok(deferredNames.includes("REDIS_URL_CN"))
  assert.equal(wechatAppId.importTarget, "阿里云 SAE plain env")
  assert.equal(wechatSecret.importTarget, "阿里云 KMS/Secrets Manager/SAE secret env")
  assert.match(wechatAppId.forbidden, /不能用小程序 AppID 替代/)
  assert.match(wechatSecret.forbidden, /不能用小程序 Secret 替代/)
  assert.match(appleTeamId.forbidden, /不要猜测 Team ID/)
  assert.ok(report.acquisitionOrder.some((item) => item.name === "readySecretEnv"))
  assert.equal(report.credentialAcquisitionQueue.queueScope, "full_app_env_handoff")
  assert.ok(report.credentialAcquisitionQueue.missingCredentialNames.includes("DATABASE_URL_CN"))
  assert.equal(report.credentialAcquisitionQueue.readySecretEnvVariableCount, readySecretNames.length)
  assert.ok(report.credentialAcquisitionQueue.items.some((item) =>
    item.actionId === "S08_ALIYUN_RDS_DATABASE_URL" &&
    item.blockedCredentialNames.includes("DATABASE_URL_CN") &&
    /RDS PostgreSQL/.test(item.obtainFrom) &&
    /secret env/.test(item.importTarget)
  ))
  assert.ok(report.credentialAcquisitionQueue.items.some((item) =>
    item.actionId === "S06_READY_SENSITIVE_ENV_IMPORT" &&
    item.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY")
  ))
  assert.ok(report.credentialAcquisitionQueue.items.some((item) =>
    item.actionId === "P01_WECHAT_OPEN_MOBILE_APP_OR_APP_LAUNCH_DEFERRED" &&
    item.variableNames.includes("WECHAT_OPEN_APP_ID") &&
    item.variableNames.includes("APPLE_TEAM_ID")
  ))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun env handoff backend-only mode excludes deferred app launch variables", () => {
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--env-file",
    envFixturePath,
    "--backend-only",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const report = JSON.parse(output)
  const groupNames = Object.fromEntries(Object.entries(report.groups).map(([key, items]) => [
    key,
    items.map((item) => item.name),
  ]))

  assert.equal(report.ok, true)
  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.sourceCommand, "corepack pnpm aliyun:env:handoff:backend")
  assert.equal(report.containsValues, false)
  assert.deepEqual(report.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.fullAppRequiredBlocking, ["DATABASE_URL_CN"])
  assert.deepEqual(report.summary.appLaunchBlocking, [])
  assert.equal(report.summary.requiredTotal, 23)
  assert.equal(report.summary.requiredReady, 22)
  assert.deepEqual(groupNames.blockedRequired, ["DATABASE_URL_CN"])
  assert.deepEqual(groupNames.appLaunchBlocking, [])
  assert.ok(!groupNames.readyPlainEnv.includes("WECHAT_OPEN_APP_REVIEW_STATUS"))
  assert.ok(!groupNames.readyPlainEnv.includes("PRIVACY_POLICY_URL"))
  assert.ok(!groupNames.readyPlainEnv.includes("TERMS_URL"))
  assert.ok(report.backendOnlyExclusions.envNames.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.backendOnlyExclusions.envNames.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.backendOnlyExclusions.envNames.includes("APPLE_TEAM_ID"))
  assert.ok(report.backendOnlyExclusions.envNames.includes("PRIVACY_POLICY_URL"))
  assert.deepEqual(report.acquisitionOrder.map((item) => item.name), [
    "DATABASE_URL_CN",
    "readySecretEnv",
    "readyPlainEnv",
  ])
  assert.equal(report.credentialAcquisitionQueue.queueScope, "backend_aliyun_only")
  assert.deepEqual(report.credentialAcquisitionQueue.missingCredentialNames, ["DATABASE_URL_CN"])
  assert.equal(report.credentialAcquisitionQueue.onlyMissingBackendCredentialValue, "DATABASE_URL_CN")
  assert.equal(report.credentialAcquisitionQueue.readySecretEnvVariableCount, groupNames.readySecretEnv.length)
  assert.deepEqual(report.credentialAcquisitionQueue.items.map((item) => item.actionId), [
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  const rdsQueueItem = report.credentialAcquisitionQueue.items.find((item) => item.actionId === "S08_ALIYUN_RDS_DATABASE_URL")
  assert.ok(rdsQueueItem)
  assert.equal(rdsQueueItem.userQuestion, "DATABASE_URL_CN 从哪里获得并导入到哪里")
  assert.deepEqual(rdsQueueItem.blockedCredentialNames, ["DATABASE_URL_CN"])
  assert.match(rdsQueueItem.obtainFrom, /RDS PostgreSQL/)
  assert.match(rdsQueueItem.importTarget, /secret env/)
  assert.ok(rdsQueueItem.verifyCommands.includes("corepack pnpm aliyun:rds:migration:package"))
  const readyImportQueueItem = report.credentialAcquisitionQueue.items.find((item) => item.actionId === "S06_READY_SENSITIVE_ENV_IMPORT")
  assert.ok(readyImportQueueItem.readySecretEnvVariableNames.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert.ok(groupNames.deferred.includes("ALIYUN_OSS_ACCESS_KEY_ID"))
  assert.ok(groupNames.deferred.includes("ALIYUN_OSS_ACCESS_KEY_SECRET"))
  assert.ok(!readyImportQueueItem.relatedActionIds.includes("S05_OSS_RAM_SECRET_OR_STS"))
  assert.ok(report.credentialAcquisitionQueue.requiresActionTimeConfirmationIds.includes("S08_ALIYUN_RDS_DATABASE_URL"))
  assert.ok(report.credentialAcquisitionQueue.valueHandlingRules.some((item) => /DATABASE_URL_CN/.test(item)))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:sensitive:blockers:backend"))
  assert.ok(report.verificationCommands.includes("corepack pnpm aliyun:operator:tasks:backend"))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun env handoff markdown keeps operator instructions value-free", () => {
  const outDir = fs.mkdtempSync("/tmp/meiye-env-handoff-test-")
  const jsonPath = path.join(outDir, "env-handoff.json")
  const markdownPath = path.join(outDir, "env-handoff.md")
  execFileSync(process.execPath, [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--env-file",
    envFixturePath,
    "--out",
    jsonPath,
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const json = readJsonFromPath(jsonPath)
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.equal(json.containsValues, false)
  assert.match(markdown, /环境变量获取与导入手册/)
  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /requiredBlocking: DATABASE_URL_CN/)
  assert.match(markdown, /fullAppRequiredBlocking: DATABASE_URL_CN, WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /appLaunchBlocking: WECHAT_OPEN_APP_ID, WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /WECHAT_OPEN_APP_ID/)
  assert.match(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.match(markdown, /DATABASE_URL_CN/)
  assert.match(markdown, /密钥\/密码获取与导入队列/)
  assert.match(markdown, /queueScope: full_app_env_handoff/)
  assert.match(markdown, /S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(markdown, /S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /P01_WECHAT_OPEN_MOBILE_APP_OR_APP_LAUNCH_DEFERRED/)
  assert.match(markdown, /APPLE_TEAM_ID/)
  assert.match(markdown, /可导入 KMS\/Secrets Manager\/SAE secret env/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Aliyun env handoff backend-only markdown omits deferred app launch variables", () => {
  const outDir = fs.mkdtempSync("/tmp/meiye-env-handoff-backend-test-")
  const markdownPath = path.join(outDir, "env-handoff-backend.md")
  execFileSync(process.execPath, [
    "scripts/summarize-aliyun-env-handoff.mjs",
    "--env-file",
    envFixturePath,
    "--backend-only",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /requiredBlocking: DATABASE_URL_CN/)
  assert.match(markdown, /fullAppRequiredBlocking: DATABASE_URL_CN/)
  assert.match(markdown, /appLaunchBlocking: none/)
  assert.match(markdown, /密钥\/密码获取与导入队列/)
  assert.match(markdown, /queueScope: backend_aliyun_only/)
  assert.match(markdown, /missingCredentialNames: DATABASE_URL_CN/)
  assert.match(markdown, /onlyMissingBackendCredentialValue: DATABASE_URL_CN/)
  assert.match(markdown, /S08_ALIYUN_RDS_DATABASE_URL/)
  assert.match(markdown, /S06_READY_SENSITIVE_ENV_IMPORT/)
  assert.match(markdown, /corepack pnpm aliyun:sensitive:blockers:backend/)
  assert.match(markdown, /corepack pnpm aliyun:operator:tasks:backend/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(markdown, /APPLE_TEAM_ID/)
  assert.doesNotMatch(markdown, /PRIVACY_POLICY_URL/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

function readJsonFromPath(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function createEnvFixture() {
  const outDir = fs.mkdtempSync("/tmp/meiye-env-runtime-fixture-")
  const filePath = path.join(outDir, ".env.production-cn.local")
  fs.writeFileSync(filePath, [
    "APP_ENV=production-cn",
    "APP_REGION=cn-hangzhou",
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
