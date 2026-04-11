const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")

const submitRouteSource = fs.readFileSync(
  "d:\\IP网站\\app\\api\\voice-coach\\sessions\\[sessionId]\\beautician-turn\\submit\\route.ts",
  "utf8",
)
const sessionRouteSource = fs.readFileSync("d:\\IP网站\\app\\api\\voice-coach\\sessions\\route.ts", "utf8")

test("submit route returns turn_index on beautician_turn payloads", () => {
  const matches = submitRouteSource.match(/beautician_turn:\s*\{[\s\S]*?turn_index:/g) || []
  assert.ok(matches.length >= 2)
})

test("session route disables fixed seed audio when firstTurnPool exists", () => {
  assert.match(
    sessionRouteSource,
    /if \(getPresetFirstTurnPool\(scenarioId\)\.length\) return ""/,
  )
})
