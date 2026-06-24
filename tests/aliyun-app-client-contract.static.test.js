const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

function runContractCheck() {
  const output = execFileSync(process.execPath, ["scripts/check-app-client-api-contract.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

test("APP client API contract defers package-2 content and media APIs outside first backend scope", () => {
  const { output, report } = runContractCheck()
  const deferredRoutes = report.deferredRoutes.map((item) => `${item.method} ${item.route}`)

  assert.equal(report.ok, true)
  assert.equal(report.auditedClientApiCalls, 40)
  assert.equal(report.uniqueAuditedClientRoutes, 34)
  assert.equal(report.deferredClientApiCalls, 7)
  assert.deepEqual(report.failures.unclassifiedRoutes, [])
  assert.ok(deferredRoutes.includes("POST /api/app/assets/sign-read"))
  assert.ok(deferredRoutes.includes("GET /api/app/content-drafts"))
  assert.ok(deferredRoutes.includes("POST /api/app/content-drafts"))
  assert.ok(report.deferredRoutes.some((item) =>
    item.route === "/api/app/assets/sign-read" &&
    item.reason.includes("signed media asset read")))
  assert.ok(report.deferredRoutes.some((item) =>
    item.route === "/api/app/content-drafts" &&
    item.reason.includes("content drafts")))
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("APP production-cn deploy guide documents deferred package-2 APP client APIs", () => {
  const doc = read("docs", "DEPLOY_ALIYUN_PRODUCTION_CN.md")

  assert.match(doc, /Package 2 的 `knowledge-spaces`、`assets\/sign-read`、`content-drafts` 调用只报告为 deferred/)
})
