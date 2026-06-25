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

test("Aliyun operator tasks backend command is wired into scripts and deploy spec", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")
  const deploySpecChecker = read("scripts", "check-aliyun-deployment-spec.mjs")

  assert.equal(pkg.scripts["aliyun:operator:tasks"], "node ./scripts/generate-aliyun-operator-tasks.mjs")
  assert.equal(pkg.scripts["aliyun:operator:tasks:backend"], "node ./scripts/generate-aliyun-operator-tasks.mjs --backend-only")
  assert.equal(pkg.scripts["aliyun:operator:tasks:test"], "node --test tests/aliyun-operator-tasks.static.test.js")
  assert.match(predeploy, /aliyun:operator:tasks:test/)
  assert.match(predeploy, /aliyun:operator:tasks:backend/)
  assert.equal(deploySpec.cloudConfirmations.operatorTasksCommand, "corepack pnpm aliyun:operator:tasks")
  assert.equal(deploySpec.cloudConfirmations.backendOperatorTasksCommand, "corepack pnpm aliyun:operator:tasks:backend")
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:tasks:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:tasks:backend"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:operator:tasks:backend"))
  assert.match(deploySpecChecker, /backendOperatorTasksCommand/)
})

test("Aliyun operator tasks backend-only mode excludes deferred app launch work", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--backend-only",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const report = JSON.parse(output)
  const taskIds = report.tasks.map((item) => item.id)
  const sensitiveActionIds = report.sensitiveActionItems.map((item) => item.id)
  const t06 = report.tasks.find((item) => item.id === "T06_ALIYUN_ENV_IMPORT")
  const t08 = report.tasks.find((item) => item.id === "T08_POSTDEPLOY_REMOTE_SMOKE")

  assert.equal(report.currentScope, "backend_aliyun_only")
  assert.equal(report.fullAppLaunchScope, "deferred_after_backend_online")
  assert.equal(report.canProceedWithoutWechat, true)
  assert.equal(report.containsValues, false)
  assert.deepEqual(taskIds, [
    "T03_ALIYUN_RUNTIME_CONTAINER",
    "T03B_ALIYUN_ACR_IMAGE_PUBLISH",
    "T04_ALIYUN_DOMAIN_DNS_HTTPS",
    "T05_ALIYUN_OSS_AUDIO_STORAGE",
    "T06_ALIYUN_ENV_IMPORT",
    "T07_ALIYUN_SLS_ALERTS",
    "T08_POSTDEPLOY_REMOTE_SMOKE",
  ])
  assert.deepEqual(sensitiveActionIds, [
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S08_ALIYUN_RDS_DATABASE_URL",
    "S06_READY_SENSITIVE_ENV_IMPORT",
  ])
  assert.deepEqual(report.summary, {
    total: 7,
    ready: 0,
    blocked: 2,
    waitingWechatReview: 0,
    pendingCloud: 4,
    waitingForDeploy: 1,
  })
  assert.deepEqual(report.env.summary.requiredBlocking, ["DATABASE_URL_CN"])
  assert.equal(report.env.summary.requiredTotal, 25)
  assert.equal(report.env.summary.requiredReady, 24)
  assert.ok(report.env.summary.appLaunchBlocking.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(report.env.summary.appLaunchBlocking.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(report.env.summary.appLaunchBlocking.includes("APPLE_TEAM_ID"))
  assert.deepEqual(report.backendOnlyExclusions.taskIds, [
    "T01_WECHAT_OPEN_PLATFORM_APP_LOGIN",
    "T02_APP_LEGAL_LINKS",
  ])
  assert.deepEqual(report.backendOnlyExclusions.sensitiveActionIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.ok(t06.blockerCodes.includes("missing_required_env:DATABASE_URL_CN"))
  assert.ok(!t06.blockerCodes.some((item) => /WECHAT_OPEN/.test(item)))
  assert.deepEqual(t08.blockerCodes, ["requires_runtime_domain_env_cloud_confirmations"])
  assert.equal(report.nextCommandOrder[0], "corepack pnpm aliyun:operator:tasks:backend")
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:env:handoff:backend"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:user:actions:backend"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:action:authorization:backend"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:backend-cn:status"))
  assert.ok(report.nextCommandOrder.includes("corepack pnpm aliyun:cloud:confirmations:backend:strict"))
  assert.doesNotMatch(output, secretLike)
})

test("Aliyun operator tasks backend-only markdown omits deferred app launch tasks", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-operator-tasks-backend-"))
  const markdownPath = path.join(tmpdir, "operator-tasks-backend.md")
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-tasks.mjs",
    "--backend-only",
    "--markdown",
    markdownPath,
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 60,
  })
  const markdown = fs.readFileSync(markdownPath, "utf8")

  assert.match(markdown, /currentScope: backend_aliyun_only/)
  assert.match(markdown, /canProceedWithoutWechat: true/)
  assert.match(markdown, /T03_ALIYUN_RUNTIME_CONTAINER/)
  assert.match(markdown, /T08_POSTDEPLOY_REMOTE_SMOKE/)
  assert.doesNotMatch(markdown, /T01_WECHAT_OPEN_PLATFORM_APP_LOGIN/)
  assert.doesNotMatch(markdown, /S01_WECHAT_OPEN_APP_LOGIN/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_ID/)
  assert.doesNotMatch(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(output + markdown, secretLike)
})
