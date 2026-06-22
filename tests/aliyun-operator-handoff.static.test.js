const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")
const readJson = (...parts) => JSON.parse(read(...parts))

test("Aliyun operator handoff command is wired into scripts and local predeploy", () => {
  const pkg = readJson("package.json")
  const predeploy = read("scripts", "aliyun-predeploy-commands.mjs")
  const deploySpec = readJson("deploy", "aliyun-production-cn.example.json")

  assert.equal(pkg.scripts["aliyun:operator:handoff"], "node ./scripts/generate-aliyun-operator-handoff.mjs")
  assert.equal(pkg.scripts["aliyun:operator:handoff:test"], "node --test tests/aliyun-operator-handoff.static.test.js")
  assert.match(predeploy, /aliyun:operator:handoff:test/)
  assert.match(predeploy, /aliyun:operator:handoff", "--", "--skip-vercel-env-coverage/)
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:handoff:test"))
  assert.ok(deploySpec.localPredeployChecks.includes("corepack pnpm run aliyun:operator:handoff -- --skip-vercel-env-coverage"))
  assert.ok(deploySpec.predeployChecks.includes("corepack pnpm aliyun:operator:handoff"))
})

test("Aliyun operator handoff maps ACR and SAE evidence gaps to the correct consoles", () => {
  const output = execFileSync(process.execPath, [
    "scripts/generate-aliyun-operator-handoff.mjs",
    "--skip-vercel-env-coverage",
  ], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 40,
  })
  const report = JSON.parse(output)
  const gaps = report.localEvidenceGaps.imagePublish.gaps
  const byPath = new Map(gaps.map((item) => [item.jsonPath, item]))
  const registryHost = byPath.get("acr.registryHost")
  const remoteDigest = byPath.get("acr.remoteDigest")
  const runtimeConfirmed = byPath.get("runtime.confirmed")
  const remoteImageConfigured = byPath.get("runtime.remoteImageConfigured")
  const imagePullConfigured = byPath.get("runtime.imagePullConfigured")

  assert.equal(report.containsValues, false)
  assert.equal(report.localEvidenceGaps.imagePublish.totalBlockers, 12)
  assert.match(registryHost.source, /容器镜像服务 ACR/)
  assert.match(registryHost.writeTo, /-> acr$/)
  assert.match(remoteDigest.source, /容器镜像服务 ACR/)
  assert.match(runtimeConfirmed.source, /SAE/)
  assert.doesNotMatch(runtimeConfirmed.source, /命名空间\/仓库/)
  assert.match(runtimeConfirmed.writeTo, /-> runtime$/)
  assert.match(remoteImageConfigured.source, /SAE/)
  assert.match(imagePullConfigured.source, /SAE/)
  assert.match(remoteImageConfigured.expected, /SAE 已指向 ACR remote image/)
  assert.match(imagePullConfigured.expected, /SAE 镜像拉取权限/)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})
