/* eslint-disable @typescript-eslint/no-require-imports */

const test = require("node:test")
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

function runContractCheck() {
  return runJsonScript("scripts/check-app-client-api-contract.mjs")
}

function runJsonScript(script) {
  const output = execFileSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    output,
    report: JSON.parse(output),
  }
}

test("APP client API contract audits implemented package-2 and content workflow facades", () => {
  const { output, report } = runContractCheck()
  const deferredRoutes = report.deferredRoutes.map((item) => `${item.method} ${item.route}`)

  assert.equal(report.ok, true)
  assert.equal(report.auditedClientApiCalls, 70)
  assert.equal(report.uniqueAuditedClientRoutes, 64)
  assert.equal(report.deferredClientApiCalls, 0)
  assert.equal(report.matchedBackendRoutes, 54)
  assert.equal(report.scopes.assets, 1)
  assert.equal(report.scopes["content-drafts"], 1)
  assert.equal(report.scopes["content-poster"], 3)
  assert.equal(report.scopes["content-xhs"], 4)
  assert.equal(report.scopes["content-private-copy"], 2)
  assert.equal(report.scopes["knowledge-spaces"], 4)
  assert.equal(report.scopes["learning-progress"], 3)
  assert.equal(report.scopes["voice-coach"], 8)
  assert.deepEqual(report.failures.missingBackendRoutes, [])
  assert.deepEqual(report.failures.methodMismatches, [])
  assert.deepEqual(report.failures.unclassifiedRoutes, [])
  assert.deepEqual(deferredRoutes, [])
  assert.equal(deferredRoutes.includes("POST /api/app/assets/sign-read"), false)
  assert.equal(deferredRoutes.includes("GET /api/app/content-drafts"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/content-drafts"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/posters/generate"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/xhs/generate-v4"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/private-copy/generate"), false)
  assert.equal(deferredRoutes.includes("GET /api/app/knowledge-spaces"), false)
  assert.equal(deferredRoutes.includes("GET /api/app/knowledge-spaces/[spaceId]"), false)
  assert.equal(deferredRoutes.includes("GET /api/app/knowledge-spaces/[spaceId]/groups/[groupId]"), false)
  assert.equal(
    deferredRoutes.includes("GET /api/app/knowledge-spaces/[spaceId]/groups/[groupId]/cards/[cardId]"),
    false,
  )
  assert.equal(deferredRoutes.includes("GET /api/app/learning/progress"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/learning/progress/events"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/learning/progress/sync"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/voice-coach/sessions"), false)
  assert.equal(deferredRoutes.includes("POST /api/app/voice-coach/sessions/[sessionId]/beautician-turn/submit"), false)
  assert.doesNotMatch(output, /sk-[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(output, /LTAI[A-Za-z0-9]{12,}/)
  assert.doesNotMatch(output, /:\/\/[^\s:@]+:[^\s@]+@/)
})

test("APP route and coverage gates include implemented package-2 facades", () => {
  const routes = runJsonScript("scripts/check-app-api-production-cn-routes.mjs").report
  const coverage = runJsonScript("scripts/check-app-api-smoke-coverage.mjs").report
  const contract = read("scripts", "check-app-client-api-contract.mjs")

  assert.equal(routes.checkedRoutes, 60)
  assert.equal(routes.requiredRoutes, 34)
  assert.equal(routes.implementedFacadeRoutes, 26)
  assert.equal(routes.scopes.account, 3)
  assert.equal(routes.scopes.assets, 1)
  assert.equal(routes.scopes["content-drafts"], 1)
  assert.equal(routes.scopes["content-poster"], 3)
  assert.equal(routes.scopes["content-xhs"], 4)
  assert.equal(routes.scopes["content-private-copy"], 2)
  assert.equal(routes.scopes["knowledge-spaces"], 4)
  assert.equal(routes.scopes["learning-progress"], 3)
  assert.equal(routes.scopes["voice-coach"], 8)
  assert.deepEqual(routes.failures, [])

  assert.equal(coverage.ok, true)
  assert.equal(coverage.checkedRoutes, 60)
  assert.equal(coverage.requiredRoutes, 34)
  assert.equal(coverage.businessRoutes, 58)
  assert.equal(coverage.smokeProbes, 32)
  assert.equal(coverage.coverageOnlyProbes, 29)
  assert.equal(coverage.coverageProbes, 61)
  assert.equal(coverage.coveredBusinessRoutes, 58)
  assert.equal(coverage.scopes.account, 3)
  assert.equal(coverage.scopes.assets, 1)
  assert.equal(coverage.scopes["content-drafts"], 1)
  assert.equal(coverage.scopes["content-poster"], 3)
  assert.equal(coverage.scopes["content-xhs"], 4)
  assert.equal(coverage.scopes["content-private-copy"], 2)
  assert.equal(coverage.scopes["knowledge-spaces"], 4)
  assert.equal(coverage.scopes["learning-progress"], 3)
  assert.equal(coverage.scopes["voice-coach"], 8)
  assert.deepEqual(coverage.missingRoutes, [])
  assert.deepEqual(coverage.unmatchedProbes, [])

  assert.match(contract, /"\/api\/app\/assets\/sign-read"/)
  assert.match(contract, /"\/api\/app\/learning\/progress"/)
  assert.match(contract, /CONTENT_WORKFLOW_ROUTE_PLANS/)
  assert.match(contract, /contentWorkflowRoutePlan/)
  assert.match(contract, /"\/api\/app\/posters\/"/)
  assert.match(contract, /"\/api\/app\/xhs\/"/)
  assert.match(contract, /"\/api\/app\/private-copy\/"/)
  assert.match(contract, /"\/api\/app\/voice-coach\/"/)
  assert.match(contract, /findVoiceCoachRoutePlans/)
  assert.match(contract, /source: "voiceCoachRoutePlan"/)
  assert.match(contract, /const DEFERRED_PREFIXES = \[\]/)
  assert.doesNotMatch(contract, /prefix:\s*"\/api\/app\/content-drafts"/)
  assert.doesNotMatch(contract, /prefix:\s*"\/api\/app\/knowledge-spaces"/)
  assert.doesNotMatch(contract, /prefix:\s*"\/api\/app\/learning\/progress"/)
})
