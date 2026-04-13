const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = process.cwd()
const chatSource = fs.readFileSync(path.join(root, "mini-program-ui", "pages", "voice-coach", "chat.js"), "utf8")
const chatWxmlSource = fs.readFileSync(path.join(root, "mini-program-ui", "pages", "voice-coach", "chat.wxml"), "utf8")
const chatWxssSource = fs.readFileSync(path.join(root, "mini-program-ui", "pages", "voice-coach", "chat.wxss"), "utf8")

test("hint requests target the clicked customer turn and always release the single-flight lock", () => {
  assert.match(chatSource, /hintLoading:\s*false/)
  assert.match(chatSource, /hintLoadingTurnId:\s*""/)
  assert.match(chatSource, /openHint\(e\)/)
  assert.match(chatSource, /const explicitTurnId = e && e\.currentTarget \? String\(e\.currentTarget\.dataset\.id \|\| ""\) : ""/)
  assert.match(chatSource, /explicitTurn && String\(explicitTurn\.role \|\| ""\) === "customer"/)
  assert.match(chatSource, /this\.setData\(\{ loading: true, hintLoading: true, hintLoadingTurnId: customerTurnId \}\)/)
  assert.match(chatSource, /loading:\s*false,\s*\n\s*hintLoading:\s*false,\s*\n\s*hintLoadingTurnId:\s*"",\s*\n\s*hintVisible:\s*true/)
  assert.match(chatSource, /this\.setData\(\{ loading: false, hintLoading: false, hintLoadingTurnId: "" \}\)/)
  assert.match(chatSource, /\.finally\(\(\) => \{\s*this\._hintInFlight = false\s*this\._hintInFlightTurnId = ""\s*this\.setData\(\{ hintLoading: false, hintLoadingTurnId: "" \}\)/s)
  assert.match(chatSource, /rawMessage === "voice_coach_error"/)
})

test("suggest card expansion keeps the row top-aligned and stabilizes scroll position", () => {
  assert.match(chatWxssSource, /\.row\s*\{[\s\S]*align-items:\s*flex-start;/)
  assert.match(chatSource, /this\._suggestScrollTimer = setTimeout\(\(\) => \{\s*this\.setData\(\{ scrollIntoView: "" \}\)\s*this\._suggestScrollInnerTimer = setTimeout\(\(\) => \{\s*this\.setData\(\{ scrollIntoView: `turn-\$\{id\}` \}\)/s)
  assert.match(chatSource, /if \(this\._suggestScrollTimer\) clearTimeout\(this\._suggestScrollTimer\)/)
  assert.match(chatSource, /if \(this\._suggestScrollInnerTimer\) clearTimeout\(this\._suggestScrollInnerTimer\)/)
})

test("suggestions actively refresh from events or session snapshots and expose retry ui after timeout", () => {
  assert.match(chatSource, /this\._suggestRefreshPromises = new Map\(\)/)
  assert.match(chatSource, /async fetchSessionSnapshot\(\)/)
  assert.match(chatSource, /this\.mergeSessionTurnsSnapshot\(res\.turns\)/)
  assert.match(chatSource, /async refreshSuggestionsForTurn\(turnId,\s*options = \{\}\)/)
  assert.match(chatSource, /await this\.pollEventsOnce\(this\._realtimeMode \? 1800 : 2400\)/)
  assert.match(chatSource, /await this\.fetchSessionSnapshot\(\)/)
  assert.match(chatSource, /analysisError:\s*"timeout"/)
  assert.match(chatSource, /if \(willOpen\) \{\s*if \(!current \|\| !current\.analysis\) \{\s*void this\.refreshSuggestionsForTurn\(id\)/s)
  assert.match(chatWxmlSource, /item\.analysisLoading === false && item\.analysisError/)
  assert.ok(chatWxmlSource.includes('bindtap="refreshSuggest"'))
  assert.ok(chatWxssSource.includes(".suggest-loading-wrap"))
  assert.ok(chatWxssSource.includes(".suggest-refresh-btn"))
})

test("hint sheet keeps only the new point layout and removes the duplicate muted definition", () => {
  assert.match(chatWxssSource, /\.hint-body\s*\{\s*padding:\s*0;\s*\}/)
  assert.match(chatWxssSource, /\.hint-point\s*\{\s*display:\s*flex;\s*align-items:\s*flex-start;\s*margin-bottom:\s*8rpx;\s*\}/)
  assert.doesNotMatch(chatWxssSource, /\.hint-point\s*\{\s*font-size:\s*28rpx;\s*color:\s*var\(--vc-text-muted\);\s*line-height:\s*40rpx;\s*\}/)
})

test("chat operation area hides transcript chips and keeps left answer suggestions plus right improvement suggestions", () => {
  assert.doesNotMatch(chatWxmlSource, /bindtap="toggleText"/)
  assert.doesNotMatch(chatWxmlSource, /item\.textOpenedOnce/)
  assert.ok(chatWxmlSource.includes('class="action-chip action-chip-answer {{hintLoadingTurnId === item.id ? \'action-chip-loading\' : \'\'}}"'))
  assert.ok(chatWxmlSource.includes('bindtap="openHint"'))
  assert.ok(chatWxmlSource.includes('bindtap="toggleSuggest"'))
  assert.doesNotMatch(chatWxmlSource, /class="hint-btn-icon/)
  assert.ok(chatWxssSource.includes(".action-chip-answer"))
  assert.ok(chatWxssSource.includes(".action-chip-bulb"))
})

test("devtools recording keeps websocket events but forces audio submit onto the http fallback path", () => {
  assert.match(chatSource, /this\._recordUseRealtime = false/)
  assert.match(
    chatSource,
    /const realtimeTransportAvailable = Boolean\(\s*!this\._isDevtools && this\._realtimeMode && this\._wsClient && this\._wsClient\.isConnected\(\),/s,
  )
  assert.match(chatSource, /record\.start:devtools-http-fallback/)
  assert.match(
    chatSource,
    /if \(this\._recordUseRealtime && this\._realtimeMode && this\._wsClient && this\._wsClient\.isConnected\(\)\)/,
  )
  assert.match(chatSource, /ws\.zero-frame:http/)
  assert.match(chatSource, /keepBeauticianDraft:\s*true/)
})
