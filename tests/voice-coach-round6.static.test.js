const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const chatSource = read("mini-program-ui", "pages", "voice-coach", "chat.js")
const jobsSource = read("lib", "voice-coach", "jobs.server.ts")
const submitRouteSource = read(
  "app",
  "api",
  "voice-coach",
  "sessions",
  "[sessionId]",
  "beautician-turn",
  "submit",
  "route.ts",
)

test("http fallback success clears state after force polling completes", () => {
  assert.match(chatSource, /clearHttpFallbackTurn\("success"/)
  assert.match(chatSource, /customerTurnId:\s*finalCustomerTurnId/)
})

test("customer events derive and persist turn_index", () => {
  assert.match(chatSource, /resolveCustomerTurnIndex\(data\.turn_index,\s*this\.getTurnIndexValue\(parentTurnId\)\)/)
  const turnIndexMentions = chatSource.match(/turn_index:\s*customerTurnIndex/g) || []
  assert.ok(turnIndexMentions.length >= 2)
})

test("hint requests are guarded by a single-flight flag", () => {
  assert.match(chatSource, /if \(this\._hintInFlight\)/)
  assert.match(chatSource, /this\._hintInFlight\s*=\s*true/)
  assert.match(chatSource, /this\._hintInFlight\s*=\s*false/)
  assert.match(chatSource, /hint\.open:skip/)
})

test("autoplay only allows the latest customer turn", () => {
  assert.match(chatSource, /shouldAutoPlayLatestCustomerTurn\(/)
  assert.match(chatSource, /latestCustomerTurnId/)
})

test("backend customer events include turn_index", () => {
  assert.match(jobsSource, /type:\s*"customer\.text_ready"[\s\S]*turn_index:\s*customerTurnIndex/)
  assert.match(jobsSource, /type:\s*"customer\.audio_ready"[\s\S]*turn_index:/)
})

test("submit route emits turn.accepted with turn_index", () => {
  assert.match(submitRouteSource, /type:\s*"turn\.accepted"[\s\S]*turn_index:\s*nextTurnIndex/)
})
