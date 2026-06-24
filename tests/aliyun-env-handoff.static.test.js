const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun env handoff command is wired into scripts and deployment spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploymentSpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")

  assert.equal(pkg.scripts["aliyun:env:handoff"], "node ./scripts/summarize-aliyun-env-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:env:handoff:test"], "node --test tests/aliyun-env-handoff.static.test.js")
  assert.match(predeploy, /aliyun:env:handoff:test/)
  assert.match(predeploy, /aliyun:env:handoff/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:handoff:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:env:handoff"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:env:handoff"))
  assert.match(deploymentSpecChecker, /corepack pnpm aliyun:env:handoff/)
})

test("Aliyun env handoff groups current variables without printing values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-env-handoff.mjs"], {
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
  assert.match(markdown, /APPLE_TEAM_ID/)
  assert.match(markdown, /可导入 KMS\/Secrets Manager\/SAE secret env/)
  assert.doesNotMatch(markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})

function readJsonFromPath(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}
