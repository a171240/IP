const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Apple Team ID / AASA package command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const packageScript = read("scripts", "generate-apple-team-aasa-package.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:apple-team:package"], "node ./scripts/generate-apple-team-aasa-package.mjs")
  assert.equal(pkg.scripts["aliyun:apple-team:package:test"], "node --test tests/aliyun-apple-team-aasa-package.static.test.js")
  assert.match(predeploy, /aliyun:apple-team:package:test/)
  assert.match(predeploy, /aliyun:apple-team:package/)
  assert.match(packageScript, /P02_APPLE_TEAM_ID/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:apple-team:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:apple-team:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:apple-team:package"))
  assert.match(releaseArtifacts, /appleTeamAasaPackage/)
  assert.match(releaseArtifacts, /apple-team-aasa-package\.json/)
})

test("Apple Team ID / AASA package reports current missing Team ID without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-apple-team-aasa-package.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const actionPacket = report.actionPacket

  assert.equal(report.ok, true)
  assert.equal(report.containsValues, false)
  assert.equal(report.readOnlyOnly, true)
  assert.equal(report.mutationPerformed, false)
  assert.equal(report.secretLeakCheck.ok, true)
  assert.equal(report.summary.teamIdStatus, "missing")
  assert.equal(report.summary.aasaOk, false)
  assert.equal(report.summary.routeFilesReady, true)
  assert.equal(report.summary.iosNativeReady, true)
  assert.equal(report.summary.expectedIosBundleId, "com.ipgongchang.meiyehuajing")
  assert.equal(report.summary.associatedDomain, "applinks:api-cn.ipgongchang.xin")
  assert.equal(report.summary.universalLink, "https://api-cn.ipgongchang.xin/app/wechat/")
  assert.equal(report.summary.aasaUrl, "https://api-cn.ipgongchang.xin/.well-known/apple-app-site-association")
  assert.ok(report.summary.blockers.includes("apple_team_id_missing"))
  assert.equal(actionPacket.packetId, "P02_APPLE_TEAM_ID")
  assert.equal(actionPacket.canStartNow, true)
  assert.equal(actionPacket.readyForAasa, false)
  assert.ok(actionPacket.targetFields.some((item) => item.name === "APPLE_TEAM_ID" && item.value === "missing"))
  assert.ok(actionPacket.targetFields.some((item) => item.name === "iosBundleId" && item.value === "com.ipgongchang.meiyehuajing"))
  assert.ok(actionPacket.targetFields.some((item) => item.name === "associatedDomain" && item.value === "applinks:api-cn.ipgongchang.xin"))
  assert.ok(actionPacket.acceptanceEvidence.includes("corepack pnpm aliyun:aasa:check 不再报告 apple_team_id_missing"))
  assert.ok(actionPacket.writeTargets.includes("APPLE_TEAM_ID -> 阿里云 SAE plain env"))
  assert.ok(actionPacket.forbidden.some((item) => item.includes("不能猜测 Apple Team ID")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Apple Team ID / AASA package markdown renders action packet without values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-apple-team-aasa-package.mjs",
    "--markdown",
    "/tmp/meiye-apple-team-aasa-package-test.md",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const markdown = fs.readFileSync("/tmp/meiye-apple-team-aasa-package-test.md", "utf8")

  assert.match(markdown, /## 动作确认包/)
  assert.match(markdown, /packetId: P02_APPLE_TEAM_ID/)
  assert.match(markdown, /apple_team_id_missing/)
  assert.match(markdown, /corepack pnpm aliyun:aasa:check 不再报告 apple_team_id_missing/)
  assert.match(markdown, /APPLE_TEAM_ID -> 阿里云 SAE plain env/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
