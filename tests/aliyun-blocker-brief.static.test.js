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

test("Aliyun blocker brief command is wired into scripts, predeploy, deploy spec, and artifacts", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:blockers:brief"], "node ./scripts/summarize-aliyun-blocker-brief.mjs")
  assert.equal(pkg.scripts["aliyun:blockers:brief:test"], "node --test tests/aliyun-blocker-brief.static.test.js")
  assert.match(predeploy, /aliyun:blockers:brief:test/)
  assert.match(predeploy, /aliyun:blockers:brief/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:blockers:brief:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:blockers:brief"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:blockers:brief"))
  assert.match(releaseArtifacts, /blocker-brief\.json/)
  assert.match(releaseArtifacts, /blockerBrief/)
})

test("Aliyun blocker brief is concise, value-free, and names current hard blockers", () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "aliyun-blocker-brief-"))
  const jsonPath = path.join(tmpdir, "blocker-brief.json")
  const markdownPath = path.join(tmpdir, "blocker-brief.md")
  const output = execFileSync(process.execPath, [
    "scripts/summarize-aliyun-blocker-brief.mjs",
    "--out",
    jsonPath,
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
  assert.equal(report.containsValues, false)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.canDeployNow, false)
  assert.equal(report.summary.requiredEnv, "24/26")
  assert.deepEqual(report.summary.requiredBlocking, ["WECHAT_OPEN_APP_ID", "WECHAT_OPEN_APP_SECRET"])
  assert.deepEqual(report.summary.sensitiveBlockedIds, [
    "S01_WECHAT_OPEN_APP_LOGIN",
    "S02_APPLE_TEAM_ID",
    "S03_ACR_PAID_PURCHASE",
    "S04_ACR_REGISTRY_AUTH",
    "S05_OSS_RAM_SECRET_OR_STS",
    "S06_READY_SENSITIVE_ENV_IMPORT",
    "S07_ANDROID_RELEASE_SIGNING",
  ])
  assert.deepEqual(report.summary.immediateAuthorizationPackets, [
    "P01_WECHAT_OPEN_MOBILE_APP",
    "P02_APPLE_TEAM_ID",
    "P03_ACR_PURCHASE",
    "P05_OSS_RAM_STS",
  ])
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "WECHAT_OPEN_APP_ID" && /微信开放平台/.test(item.consolePath)))
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "WECHAT_OPEN_APP_SECRET" && /secret env/.test(item.importTarget)))
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "APPLE_TEAM_ID" && /Apple Developer/.test(item.consolePath)))
  assert.ok(report.requiredEnvBlockers.some((item) => item.name === "MEIYE_RELEASE_KEY_PASSWORD" && /Android signing secret store/.test(item.importTarget)))
  assert.ok(report.sensitiveBlockers.some((item) =>
    item.id === "S07_ANDROID_RELEASE_SIGNING" &&
    item.type === "android_keystore_password_or_signature" &&
    item.variableNames.includes("MEIYE_RELEASE_STORE_PASSWORD")
  ))
  assert.equal(report.cloudAccess.canReadCloudNow, false)
  assert.equal(report.cloudAccess.cliConfigProbeFailureCategory, "aliyun_cli_profile_not_configured")
  assert.equal(typeof report.cloudAccess.workbenchTerminalConnected, "boolean")
  assert.equal(typeof report.cloudAccess.workbenchTerminalReadiness, "string")
  assert.equal(report.cloudAccess.workbenchTerminalCliInventoryAttempted, false)
  assert.equal(report.cloudInventory.safeConsoleOnly, true)
  assert.equal(report.cloudInventory.strictReadyOperations, 0)
  assert.ok(report.strictVerificationOrder.includes("corepack pnpm aliyun:predeploy"))
  assert.match(markdown, /当前阻塞简报/)
  assert.match(markdown, /P01_WECHAT_OPEN_MOBILE_APP/)
  assert.match(markdown, /S07_ANDROID_RELEASE_SIGNING/)
  assert.match(markdown, /MEIYE_RELEASE_KEY_PASSWORD/)
  assert.match(markdown, /workbenchTerminalReadiness/)
  assert.match(markdown, /WECHAT_OPEN_APP_SECRET/)
  assert.doesNotMatch(output, secretLike)
  assert.doesNotMatch(markdown, secretLike)
})
