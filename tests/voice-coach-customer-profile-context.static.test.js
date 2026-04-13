const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8")

const sessionContextSource = read("lib", "voice-coach", "session-context.ts")
const llmSource = read("lib", "voice-coach", "llm.server.ts")
const sessionRouteSource = read("app", "api", "voice-coach", "sessions", "route.ts")

test("session prompt context includes full customer persona cues beyond core concerns", () => {
  assert.match(sessionContextSource, /customerProfile \? formatBulletLine\("沟通风格", \[customerProfile\.communication_style\]\) : ""/)
  assert.match(sessionContextSource, /customerProfile \? formatBulletLine\("建立信任的点", customerProfile\.trust_triggers\) : ""/)
  assert.match(sessionContextSource, /customerProfile \? formatBulletLine\("过往经历", \[customerProfile\.past_experience\]\) : ""/)
  assert.match(sessionContextSource, /customerProfile \? formatBulletLine\("顾客补充备注", \[customerProfile\.notes\]\) : ""/)
  assert.match(sessionContextSource, /const promptContextText = promptLines\.join\("\\n"\)/)
})

test("customer turn prompting prioritizes explicit persona context over generic scenario defaults", () => {
  assert.match(llmSource, /High-priority training context \(override generic defaults when they conflict\):/)
  assert.match(llmSource, /When training context includes explicit core concerns, trust triggers, past experience, or communication style, treat those as the primary persona source\./)
  assert.match(llmSource, /If explicit core concerns are provided, they outrank past-experience clues when choosing the first customer objection\./)
  assert.match(llmSource, /If the training context includes explicit concerns or trust gaps, prioritize one of those instead of inventing a generic concern\./)
  assert.match(sessionRouteSource, /function buildFirstTurnTarget/)
  assert.match(sessionRouteSource, /Open with one of the customer's explicit core concerns from the training context instead of a generic default objection\./)
  assert.match(sessionRouteSource, /Past experience can reinforce the concern, but should not replace an explicit core concern when one exists\./)
})
