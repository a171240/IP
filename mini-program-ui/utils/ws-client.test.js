const test = require("node:test")
const assert = require("node:assert/strict")

const { buildWsUrl, VoiceCoachWsClient } = require("./ws-client")

test("buildWsUrl converts https base urls to wss without relying on URL global", () => {
  const url = buildWsUrl("https://ip.ipgongchang.xin", "session-123", "token-abc")
  assert.equal(url, "wss://ip.ipgongchang.xin/ws/voice-coach?session_id=session-123&token=token-abc")
})

test("buildWsUrl strips paths and preserves ws-compatible protocols", () => {
  const url = buildWsUrl("http://example.com/api/v1", "session 123", "")
  assert.equal(url, "ws://example.com/ws/voice-coach?session_id=session%20123")
})

test("buildWsUrl throws on invalid base urls", () => {
  assert.throws(() => buildWsUrl("example.com", "session-123", ""), /ws_invalid_base_url/)
})

test("ws client drains queued sends in original order", async () => {
  const sent = []
  const client = new VoiceCoachWsClient("https://ip.ipgongchang.xin", "session-1", "token")
  client.socketTask = {
    _wsReadyState: 1,
    send({ data, success }) {
      sent.push(typeof data === "string" ? data : `bin:${data.byteLength}`)
      setTimeout(() => {
        if (typeof success === "function") success()
      }, 0)
    },
  }

  client.sendBinary(new Uint8Array([1, 2, 3, 4]).buffer)
  client.sendBinary(new Uint8Array([5, 6]).buffer)
  client.sendJson({ type: "audio.end" })

  await client.drain(200)

  assert.deepEqual(sent, ["bin:4", "bin:2", JSON.stringify({ type: "audio.end" })])
})

test("ws client drain resolves after in-flight send completes", async () => {
  const client = new VoiceCoachWsClient("https://ip.ipgongchang.xin", "session-2", "token")
  let release = null
  client.socketTask = {
    _wsReadyState: 1,
    send({ success }) {
      release = success
    },
  }

  client.sendBinary(new Uint8Array([1, 2, 3]).buffer)
  const drained = client.drain(200)
  assert.equal(typeof release, "function")
  release()
  await drained
})

test("ws client only schedules one reconnect when both error and close fire for the same socket", () => {
  let onError = null
  let onClose = null

  global.wx = {
    connectSocket() {
      return {
        close() {},
        onOpen() {},
        onMessage() {},
        onError(handler) {
          onError = handler
        },
        onClose(handler) {
          onClose = handler
        },
      }
    },
  }

  const client = new VoiceCoachWsClient("https://ip.ipgongchang.xin", "session-3", "token")
  client.openSocket()

  assert.equal(typeof onError, "function")
  assert.equal(typeof onClose, "function")
  assert.equal(client.reconnectAttempts, 0)

  onError({ errMsg: "socket error" })
  assert.equal(client.reconnectAttempts, 1)

  onClose({ code: 1006 })
  assert.equal(client.reconnectAttempts, 1)

  client.clearReconnectTimer()
  delete global.wx
})

test("ws client stops retrying when the socket url is not in the legal domain list", () => {
  let onError = null

  global.wx = {
    connectSocket() {
      return {
        close() {},
        onOpen() {},
        onMessage() {},
        onError(handler) {
          onError = handler
        },
        onClose() {},
      }
    },
  }

  const client = new VoiceCoachWsClient("https://ip.ipgongchang.xin", "session-4", "token")
  let closedEvent = null
  client.onClose((evt) => {
    closedEvent = evt
  })
  client.openSocket()

  assert.equal(typeof onError, "function")
  onError({ errMsg: "url not in domain list" })

  assert.equal(client.reconnectAttempts, 0)
  assert.equal(client.closed, true)
  assert.equal(Boolean(closedEvent && closedEvent.permanent), true)

  delete global.wx
})
