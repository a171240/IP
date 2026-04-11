const test = require("node:test")
const assert = require("node:assert/strict")

function createWxStub() {
  const writes = []
  const audioEvents = {
    ended: null,
    error: null,
  }
  const audioCtx = {
    _src: "",
    stopCount: 0,
    playCount: 0,
    obeyMuteSwitch: true,
    onEnded(handler) {
      audioEvents.ended = handler
    },
    onError(handler) {
      audioEvents.error = handler
    },
    stop() {
      this.stopCount += 1
    },
    play() {
      this.playCount += 1
    },
    set src(value) {
      this._src = value
    },
    get src() {
      return this._src
    },
  }

  return {
    writes,
    audioEvents,
    audioCtx,
    wx: {
      env: {
        USER_DATA_PATH: "/tmp",
      },
      getFileSystemManager() {
        return {
          writeFileSync(filePath, buffer, encoding) {
            writes.push({
              filePath,
              size: buffer.byteLength,
              encoding,
            })
          },
        }
      },
      createInnerAudioContext() {
        return audioCtx
      },
    },
  }
}

function loadPlayerWithStub(stub) {
  global.wx = stub.wx
  delete require.cache[require.resolve("./audio-stream-player")]
  return require("./audio-stream-player").AudioStreamPlayer
}

test("prepares the next sealed sentence before the current one finishes", () => {
  const stub = createWxStub()
  const AudioStreamPlayer = loadPlayerWithStub(stub)
  const player = new AudioStreamPlayer()
  const chunkA = Uint8Array.from([1, 2, 3]).buffer
  const chunkB = Uint8Array.from([4, 5, 6]).buffer

  player.markSentenceStart(0)
  player.feedChunk(0, chunkA)
  player.markSentenceEnd(0)

  assert.equal(stub.writes.length, 1)
  assert.equal(stub.audioCtx.playCount, 1)

  player.markSentenceStart(1)
  player.feedChunk(1, chunkB)
  player.markSentenceEnd(1)

  assert.equal(stub.writes.length, 2)
  const secondSentencePath = player.sentences.get(1).filePath
  assert.ok(secondSentencePath)

  stub.audioEvents.ended()

  assert.equal(stub.audioCtx.playCount, 2)
  assert.equal(stub.audioCtx.src, secondSentencePath)
})

test("drops a prepared sentence file if more chunks arrive after seal", () => {
  const stub = createWxStub()
  const AudioStreamPlayer = loadPlayerWithStub(stub)
  const player = new AudioStreamPlayer()

  player.markSentenceStart(0)
  player.feedChunk(0, Uint8Array.from([1]).buffer)
  player.markSentenceEnd(0)

  player.markSentenceStart(1)
  player.feedChunk(1, Uint8Array.from([2]).buffer)
  player.markSentenceEnd(1)

  assert.ok(player.sentences.get(1).filePath)

  player.feedChunk(1, Uint8Array.from([3]).buffer)

  assert.equal(player.sentences.get(1).sealed, false)
  assert.equal(player.sentences.get(1).filePath, "")
})

test("defers combined file writing until playback queue is drained", () => {
  const stub = createWxStub()
  const combinedReady = []
  const AudioStreamPlayer = loadPlayerWithStub(stub)
  const player = new AudioStreamPlayer({
    onCombinedReady(filePath) {
      combinedReady.push(filePath)
    },
  })

  player.markSentenceStart(0)
  player.feedChunk(0, Uint8Array.from([1, 2]).buffer)
  player.markSentenceEnd(0)

  player.markSentenceStart(1)
  player.feedChunk(1, Uint8Array.from([3, 4]).buffer)
  player.markSentenceEnd(1)

  assert.equal(stub.writes.length, 2)

  player.finish()

  assert.equal(stub.writes.length, 2)
  assert.equal(combinedReady.length, 0)

  stub.audioEvents.ended()
  stub.audioEvents.ended()

  assert.equal(stub.writes.length, 3)
  assert.equal(combinedReady.length, 1)
})
