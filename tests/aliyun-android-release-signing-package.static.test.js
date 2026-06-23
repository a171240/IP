const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Android release signing package command is wired into scripts and predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const packageScript = read("scripts", "generate-android-release-signing-package.mjs")
  const releaseArtifacts = read("scripts", "prepare-aliyun-release-artifacts.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:android-signing:package"], "node ./scripts/generate-android-release-signing-package.mjs")
  assert.equal(pkg.scripts["aliyun:android-signing:package:test"], "node --test tests/aliyun-android-release-signing-package.static.test.js")
  assert.match(predeploy, /aliyun:android-signing:package:test/)
  assert.match(predeploy, /aliyun:android-signing:package/)
  assert.match(packageScript, /P10_ANDROID_RELEASE_SIGNING/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:android-signing:package:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:android-signing:package"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:android-signing:package"))
  assert.match(releaseArtifacts, /androidReleaseSigningPackage/)
  assert.match(releaseArtifacts, /android-release-signing-package\.json/)
})

test("Android release signing package reports current blocked state without secret values", () => {
  const output = execFileSync(process.execPath, ["scripts/generate-android-release-signing-package.mjs"], {
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
  assert.equal(report.summary.packetId, "P10_ANDROID_RELEASE_SIGNING")
  assert.equal(report.summary.status, "blocked")
  assert.equal(report.summary.canStartNow, true)
  assert.equal(report.summary.readyForWechatAndroidSignature, false)
  assert.equal(report.summary.androidPackageName, "com.ipgongchang.meiyehuajing")
  assert.equal(report.summary.releaseSigningConfig, "release")
  assert.equal(report.summary.releaseSigningConfigReady, true)
  assert.equal(report.summary.releaseUsesDebugSigning, false)
  assert.equal(report.summary.releaseArtifactReady, false)
  assert.equal(report.summary.wechatSignatureRecorded, false)
  assert.equal(report.summary.androidConfigured, false)
  assert.ok(report.currentBlockers.includes("S07_ANDROID_RELEASE_SIGNING:blocked"))
  assert.ok(report.currentBlockers.includes("android_release_artifact_missing"))
  assert.ok(report.currentBlockers.includes("wechatOpenPlatform:androidSignature"))
  assert.ok(report.currentBlockers.includes("wechatOpenPlatform:androidConfigured"))
  assert.equal(actionPacket.packetId, "P10_ANDROID_RELEASE_SIGNING")
  assert.equal(actionPacket.canStartNow, true)
  assert.match(actionPacket.minimumAuthorizationPhrase, /Android release keystore/)
  assert.ok(actionPacket.explicitlyExcluded.some((item) => item.includes("debug.keystore")))
  assert.ok(actionPacket.explicitlyExcluded.some((item) => item.includes("不创建微信开放平台移动应用")))
  assert.ok(actionPacket.writeTargets.some((item) => item.includes("MEIYE_RELEASE_STORE_PASSWORD")))
  assert.ok(actionPacket.completionEvidence.includes("wechatOpenPlatform.androidConfigured=true"))
  assert.ok(report.signingInputs.variableNames.includes("MEIYE_RELEASE_STORE_FILE"))
  assert.ok(report.signingInputs.variableNames.includes("MEIYE_RELEASE_STORE_PASSWORD"))
  assert.ok(report.signingInputs.variableNames.includes("MEIYE_RELEASE_KEY_ALIAS"))
  assert.ok(report.signingInputs.variableNames.includes("MEIYE_RELEASE_KEY_PASSWORD"))
  assert.equal(report.signingInputs.importTarget, "本机/CI Android signing secret store，不导入阿里云 SAE env。")
  assert.deepEqual(report.releaseArtifacts, [])
  assert.equal(report.wechatOpenPlatformWriteback.androidSignatureStatus, "missing_release_wechat_signature")
  assert.ok(report.safetyBoundary.some((item) => item.includes("不执行 assembleRelease")))
  assert.ok(report.safetyBoundary.some((item) => item.includes("不读取 keystore")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("Android release signing package markdown renders action packet without values", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-android-release-signing-package.mjs",
    "--markdown",
    "/tmp/meiye-android-release-signing-package-test.md",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const markdown = fs.readFileSync("/tmp/meiye-android-release-signing-package-test.md", "utf8")

  assert.match(markdown, /## 动作确认包/)
  assert.match(markdown, /packetId: P10_ANDROID_RELEASE_SIGNING/)
  assert.match(markdown, /readyForWechatAndroidSignature: false/)
  assert.match(markdown, /MEIYE_RELEASE_STORE_PASSWORD/)
  assert.match(markdown, /本机\/CI Android signing secret store/)
  assert.match(markdown, /不使用 debug\.keystore/)
  assert.match(markdown, /不执行 assembleRelease/)
  assert.match(markdown, /android_release_artifact_missing/)
  assert.match(markdown, /微信开放平台 -> 移动应用 -> Android 应用签名/)
  assert.doesNotMatch(output + markdown, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output + markdown, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output + markdown, /:\/\/[^\s:@]+:[^\s@]+@/)
})
