function toArrayBuffer(chunk) {
  if (chunk instanceof ArrayBuffer) return chunk
  if (ArrayBuffer.isView(chunk)) {
    return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
  }
  return new Uint8Array(0).buffer
}

function concatChunks(chunks) {
  let total = 0
  for (const chunk of chunks) total += chunk.byteLength || 0
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    const view = new Uint8Array(toArrayBuffer(chunk))
    merged.set(view, offset)
    offset += view.byteLength
  }
  return merged.buffer
}

function makeTempFilePath(prefix, index) {
  const safePrefix = String(prefix || "voice-coach").replace(/[^a-zA-Z0-9._-]/g, "_")
  const userDir = (wx.env && wx.env.USER_DATA_PATH) || ""
  return `${userDir}/${safePrefix}-${Date.now()}-${index}.mp3`
}

class AudioStreamPlayer {
  constructor(options = {}) {
    this.options = options
    this.audioCtx = null
    this.fs = wx.getFileSystemManager()
    this.sentences = new Map()
    this.order = []
    this.shouldPlay = false
    this.playing = false
    this.stopped = false
    this.currentIndex = null
    this.currentFilePath = ""
    this.combinedFilePath = ""
    this.combinedWritePending = false
    this.ensureAudioContext()
  }

  ensureAudioContext() {
    if (this.audioCtx) return this.audioCtx
    try {
      this.audioCtx = wx.createInnerAudioContext({ useWebAudioImplement: true })
    } catch (_err) {
      this.audioCtx = wx.createInnerAudioContext()
    }
    try {
      this.audioCtx.obeyMuteSwitch = false
    } catch (_err) {}
    this.audioCtx.onEnded(() => {
      const index = this.currentIndex
      if (index !== null) {
        try {
          this.options.onSentenceEnd && this.options.onSentenceEnd(index)
        } catch (_err) {}
      }
      this.playing = false
      this.currentIndex = null
      this.currentFilePath = ""
      this.drainQueue()
    })
    this.audioCtx.onError((error) => {
      const err = error instanceof Error ? error : new Error(String(error && error.errMsg ? error.errMsg : "audio_playback_error"))
      this.playing = false
      this.currentIndex = null
      this.currentFilePath = ""
      if (this.options.onError) {
        this.options.onError(err)
      }
    })
    return this.audioCtx
  }

  ensureSentence(index) {
    if (!this.sentences.has(index)) {
      this.sentences.set(index, {
        chunks: [],
        sealed: false,
        filePath: "",
        played: false,
      })
      this.order.push(index)
      this.order.sort((a, b) => a - b)
    }
    return this.sentences.get(index)
  }

  feedChunk(sentenceIndex, chunk) {
    if (this.stopped) return
    const sentence = this.ensureSentence(sentenceIndex)
    const audioChunk = toArrayBuffer(chunk)
    if (!audioChunk.byteLength) return
    sentence.chunks.push(audioChunk)
    if (sentence.filePath && !sentence.played) {
      sentence.filePath = ""
    }
    if (sentence.sealed && !sentence.played) {
      sentence.sealed = false
    }
    this.drainQueue()
  }

  markSentenceStart(sentenceIndex) {
    if (this.stopped) return
    this.ensureSentence(sentenceIndex)
    this.shouldPlay = true
    this.drainQueue()
  }

  markSentenceEnd(sentenceIndex) {
    if (this.stopped) return
    const sentence = this.ensureSentence(sentenceIndex)
    sentence.sealed = true
    this.shouldPlay = true
    this.prepareSentenceFile(sentenceIndex, sentence)
    this.drainQueue()
  }

  play() {
    if (this.stopped) return
    this.shouldPlay = true
    this.drainQueue()
  }

  stop() {
    this.stopped = true
    this.shouldPlay = false
    this.playing = false
    this.currentIndex = null
    this.currentFilePath = ""
    this.combinedFilePath = ""
    this.combinedWritePending = false
    try {
      this.ensureAudioContext().stop()
    } catch (_err) {}
    this.sentences.clear()
    this.order = []
  }

  finish() {
    if (this.stopped) return
    if (!this.order.length) {
      if (this.options.onDone) {
        this.options.onDone()
      }
      return
    }
    for (const sentence of this.sentences.values()) {
      sentence.sealed = true
    }
    this.shouldPlay = true
    this.combinedWritePending = true
    this.drainQueue()
  }

  get isPlaying() {
    return this.playing
  }

  get hasBufferedAudio() {
    return this.order.length > 0
  }

  writeSentenceFile(index, sentence) {
    if (sentence.filePath) return sentence.filePath
    const merged = concatChunks(sentence.chunks)
    const filePath = makeTempFilePath("voice-coach-sentence", index)
    this.fs.writeFileSync(filePath, merged, "binary")
    sentence.filePath = filePath
    return filePath
  }

  prepareSentenceFile(index, sentence = this.sentences.get(index)) {
    if (!sentence || !sentence.sealed || sentence.played || !sentence.chunks.length) {
      return sentence ? sentence.filePath : ""
    }
    try {
      return this.writeSentenceFile(index, sentence)
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error("audio_prepare_failed"))
      }
      return ""
    }
  }

  writeCombinedAudio() {
    if (this.combinedFilePath) return this.combinedFilePath
    const ordered = []
    for (const index of this.order) {
      const sentence = this.sentences.get(index)
      if (!sentence) continue
      ordered.push(...sentence.chunks)
    }
    if (!ordered.length) return ""
    const filePath = makeTempFilePath("voice-coach-turn", 0)
    this.fs.writeFileSync(filePath, concatChunks(ordered), "binary")
    this.combinedFilePath = filePath
    if (this.options.onCombinedReady) {
      this.options.onCombinedReady(filePath)
    }
    return filePath
  }

  flushCombinedAudio() {
    if (!this.combinedWritePending || this.combinedFilePath || !this.order.length) {
      return this.combinedFilePath
    }
    try {
      const filePath = this.writeCombinedAudio()
      if (filePath) {
        this.combinedWritePending = false
      }
      return filePath
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error("audio_combine_failed"))
      }
      return ""
    }
  }

  drainQueue() {
    if (!this.shouldPlay || this.playing || this.stopped) return

    const nextIndex = this.order.find((index) => {
      const sentence = this.sentences.get(index)
      return Boolean(sentence && !sentence.played)
    })

    if (nextIndex === undefined) {
      const allPlayed = this.order.length > 0 && this.order.every((index) => {
        const sentence = this.sentences.get(index)
        return Boolean(sentence && sentence.played)
      })
      if (allPlayed) {
        this.flushCombinedAudio()
      }
      if (this.options.onDone && allPlayed) {
        this.options.onDone()
      }
      return
    }

    const sentence = this.sentences.get(nextIndex)
    if (!sentence) return
    if (!sentence.sealed || !sentence.chunks.length) return
    const filePath = this.prepareSentenceFile(nextIndex, sentence)
    if (!filePath) return
    sentence.played = true
    this.playing = true
    this.currentIndex = nextIndex
    this.currentFilePath = filePath

    try {
      if (this.options.onSentenceStart) {
        this.options.onSentenceStart(nextIndex)
      }
    } catch (_err) {}

    try {
      const audio = this.ensureAudioContext()
      audio.stop()
      audio.src = filePath
      audio.play()
    } catch (error) {
      this.playing = false
      this.currentIndex = null
      this.currentFilePath = ""
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error("audio_playback_failed"))
      }
    }
  }
}

module.exports = {
  AudioStreamPlayer,
}
