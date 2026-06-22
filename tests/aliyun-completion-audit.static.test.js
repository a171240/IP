const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun completion audit command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:completion:audit"], "node ./scripts/summarize-aliyun-completion-audit.mjs")
  assert.equal(pkg.scripts["aliyun:completion:audit:test"], "node --test tests/aliyun-completion-audit.static.test.js")
  assert.match(predeploy, /aliyun:completion:audit:test/)
  assert.match(predeploy, /aliyun:completion:audit/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:completion:audit:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:completion:audit"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:completion:audit"))
  assert.match(releaseArtifacts, /completion-audit\.json/)
  assert.match(releaseArtifacts, /completion-audit\.md/)
  assert.match(releaseArtifacts, /completionAudit/)
})

test("Aliyun completion audit reports the current goal as blocked without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/summarize-aliyun-completion-audit.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const report = JSON.parse(output)
  const byId = new Map(report.requirements.map((item) => [item.id, item]))

  assert.equal(report.ok, true)
  assert.equal(report.complete, false)
  assert.equal(report.verdict, "blocked")
  assert.equal(report.canDeployNow, false)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.cloudApiCalled, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.requirements, 10)
  assert.ok(report.summary.blocked >= 6)
  assert.ok(report.summary.proved >= 2)

  assert.equal(byId.get("G01_LOCAL_APP_BACKEND_READY").status, "proved")
  assert.equal(byId.get("G02_ALIYUN_CLOUD_RESOURCES_READY").status, "blocked")
  assert.equal(byId.get("G03_CLOUD_INVENTORY_PROVED").status, "blocked")
  assert.equal(byId.get("G04_IMAGE_PUBLISH_READY").status, "blocked")
  assert.equal(byId.get("G05_DOMAIN_HTTPS_ICP_READY").status, "blocked")
  assert.equal(byId.get("G06_WECHAT_APP_LOGIN_READY").status, "blocked")
  assert.equal(byId.get("G08_ENV_IMPORT_READY").status, "blocked")
  assert.equal(byId.get("G09_SENSITIVE_BLOCKERS_EXPLICIT").status, "proved")
  assert.equal(byId.get("G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE").status, "blocked")

  assert.ok(byId.get("G06_WECHAT_APP_LOGIN_READY").blockers.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(byId.get("G06_WECHAT_APP_LOGIN_READY").blockers.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(byId.get("G08_ENV_IMPORT_READY").blockers.includes("WECHAT_OPEN_APP_ID"))
  assert.ok(byId.get("G08_ENV_IMPORT_READY").blockers.includes("WECHAT_OPEN_APP_SECRET"))
  assert.ok(byId.get("G10_PRODUCTION_DEPLOY_AND_POSTDEPLOY_SMOKE").blockers.includes("canDeployNow=false"))

  assert.ok(report.nextActions.canStartNowConsoleTasks.includes("C02_ACR_IMAGE_AND_PULL"))
  assert.ok(report.nextActions.canStartNowConsoleTasks.includes("C05_OSS_AUDIO_RAM_STS"))
  assert.ok(report.nextActions.canStartNowAuthorizationPackets.includes("P01_WECHAT_OPEN_MOBILE_APP"))
  assert.ok(report.nextActions.canStartNowAuthorizationPackets.includes("P03_ACR_PURCHASE"))
  assert.ok(report.nextActions.sensitiveBlockedIds.includes("S01_WECHAT_OPEN_APP_LOGIN"))
  assert.ok(report.nextActions.sensitiveBlockedIds.includes("S06_READY_SENSITIVE_ENV_IMPORT"))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不购买 ACR")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不读取、复制、输出或导入")))

  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
