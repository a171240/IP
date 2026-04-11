const test = require("node:test")
const assert = require("node:assert/strict")

const {
  shouldUseRealtimeTransport,
  shouldSkipEnsureEventsPolling,
  shouldBlockRecordingForHttpFallback,
  canAutoPlayTurn,
  resolveCustomerTurnIndex,
  shouldAutoPlayLatestCustomerTurn,
} = require("./realtime-turn-policy")

test("short utterances fall back to http transport", () => {
  assert.equal(shouldUseRealtimeTransport(2, 3), false)
  assert.equal(shouldUseRealtimeTransport(3, 3), true)
})

test("ensureEventsPolling only skips in pure realtime mode", () => {
  assert.equal(
    shouldSkipEnsureEventsPolling({
      realtimeMode: true,
      realtimeConnecting: false,
      httpFallbackTurnActive: false,
    }),
    true,
  )
  assert.equal(
    shouldSkipEnsureEventsPolling({
      realtimeMode: true,
      realtimeConnecting: false,
      httpFallbackTurnActive: true,
    }),
    false,
  )
})

test("recording is blocked while an http fallback turn is pending", () => {
  assert.equal(shouldBlockRecordingForHttpFallback(true), true)
  assert.equal(shouldBlockRecordingForHttpFallback(false), false)
})

test("autoplay uses a cooldown window per turn", () => {
  assert.equal(canAutoPlayTurn(0, 1000, 1500), true)
  assert.equal(canAutoPlayTurn(1000, 2000, 1500), false)
  assert.equal(canAutoPlayTurn(1000, 2600, 1500), true)
})

test("customer turn index can be derived from the parent beautician turn", () => {
  assert.equal(resolveCustomerTurnIndex(4, 3), 4)
  assert.equal(resolveCustomerTurnIndex(null, 3), 4)
  assert.equal(resolveCustomerTurnIndex(undefined, null), null)
})

test("only the latest customer turn can autoplay", () => {
  assert.equal(
    shouldAutoPlayLatestCustomerTurn({
      turnId: "customer-2",
      role: "customer",
      latestCustomerTurnId: "customer-2",
      turnIndex: 2,
      latestBeauticianTurnIndex: 1,
      lastPlayedAt: 0,
      now: 1000,
      cooldownMs: 1500,
    }),
    true,
  )
  assert.equal(
    shouldAutoPlayLatestCustomerTurn({
      turnId: "customer-1",
      role: "customer",
      latestCustomerTurnId: "customer-2",
      turnIndex: 2,
      latestBeauticianTurnIndex: 1,
      lastPlayedAt: 0,
      now: 1000,
      cooldownMs: 1500,
    }),
    false,
  )
  assert.equal(
    shouldAutoPlayLatestCustomerTurn({
      turnId: "customer-2",
      role: "beautician",
      latestCustomerTurnId: "customer-2",
      turnIndex: 2,
      latestBeauticianTurnIndex: 1,
      lastPlayedAt: 0,
      now: 1000,
      cooldownMs: 1500,
    }),
    false,
  )
  assert.equal(
    shouldAutoPlayLatestCustomerTurn({
      turnId: "customer-2",
      role: "customer",
      latestCustomerTurnId: "customer-2",
      turnIndex: 2,
      latestBeauticianTurnIndex: 3,
      lastPlayedAt: 0,
      now: 1000,
      cooldownMs: 1500,
    }),
    false,
  )
})
