const {
  API_BASE_URL,
  VOICE_COACH_REALTIME_ENABLED,
  VOICE_COACH_REALTIME_URL,
  VOICE_COACH_REALTIME_DEFAULT_CHUNK_MS,
  VOICE_COACH_REALTIME_INTERRUPT_MIN_CHUNKS,
} = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")
const { track } = require("../../utils/track")

const TURN_PENDING_STATUSES = {
  accepted: true,
  processing: true,
}

// Preview ASR currently uses short chunks with flash endpoint, which is not a compatible path.
// Keep it disabled by default until realtime streaming ASR is enabled.
const CLIENT_ASR_PREVIEW_ENABLED = false
const CUSTOMER_PENDING_REPLY_LABEL = "对方正在回复..."
const CUSTOMER_PENDING_AUDIO_LABEL = "正在开口..."

function formatSeconds(seconds) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return ""
  return `${Math.round(n)}''`
}

function voiceWidthRpx(seconds) {
  const s = Math.max(1, Math.min(60, Number(seconds || 0) || 1))
  const min = 180
  const max = 420
  const w = min + (max - min) * (Math.log1p(s) / Math.log1p(60))
  return Math.round(w)
}

function isPendingByStatus(status) {
  const key = String(status || "").trim()
  return Boolean(TURN_PENDING_STATUSES[key])
}

function normalizeTurn(raw) {
  const role = raw.role === "beautician" ? "beautician" : "customer"
  const status = String(raw.status || "")
  const hasAudio = Boolean(raw.audio_url || raw.audioUrl || raw.audio_path)
  const showTextDefault =
    typeof raw.showText === "boolean" ? raw.showText : role === "customer" ? false : !hasAudio
  const audioSeconds = Number(raw.audio_seconds || raw.audioSeconds || 0) || 0
  const pending = typeof raw.pending === "boolean" ? raw.pending : isPendingByStatus(status)

  return {
    id: raw.id || raw.turn_id,
    role,
    status,
    text: raw.text || "",
    emotion: raw.emotion || "",
    audio_url: raw.audio_url || null,
    audio_seconds: audioSeconds || null,
    audio_seconds_text: formatSeconds(audioSeconds),
    voice_width_rpx: hasAudio ? voiceWidthRpx(audioSeconds) : 0,
    analysis: raw.analysis || raw.analysis_json || null,
    ttsFailed: Boolean(raw.tts_failed || raw.ttsFailed),
    showSuggestions: false,
    showText: showTextDefault,
    textOpenedOnce: typeof raw.textOpenedOnce === "boolean" ? raw.textOpenedOnce : showTextDefault,
    pendingLabel: raw.pendingLabel || "",
    placeholderForTurnId: raw.placeholderForTurnId || "",
    pending,
  }
}

function makeLocalBeauticianTurn(filePath, durationSec) {
  const id = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`
  return {
    id,
    role: "beautician",
    status: "accepted",
    text: "",
    emotion: "",
    audio_url: filePath,
    audio_seconds: durationSec || 0,
    audio_seconds_text: formatSeconds(durationSec),
    voice_width_rpx: voiceWidthRpx(durationSec || 0),
    analysis: null,
    showSuggestions: false,
    showText: false,
    textOpenedOnce: false,
    pending: true,
  }
}

function makePendingCustomerTurn(parentTurnId, label) {
  return {
    id: `pending_customer_${parentTurnId}`,
    role: "customer",
    status: "accepted",
    text: "",
    emotion: "",
    audio_url: null,
    audio_seconds: null,
    audio_seconds_text: "",
    voice_width_rpx: 0,
    analysis: null,
    ttsFailed: false,
    showSuggestions: false,
    showText: false,
    textOpenedOnce: false,
    pending: false,
    pendingLabel: label || CUSTOMER_PENDING_REPLY_LABEL,
    placeholderForTurnId: parentTurnId,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeClientAttemptId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `mp_${Date.now()}_${rand}`
}

function canUseChunkedRequest() {
  try {
    return typeof wx.canIUse === "function" && wx.canIUse("request.enableChunked")
  } catch (_err) {
    return false
  }
}

function arrayBufferToAsciiText(input) {
  if (typeof input === "string") return input
  if (!input) return ""

  try {
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(input)) {
      const view = input
      input = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    }
  } catch (_err) {}

  try {
    if (typeof TextDecoder === "function" && input instanceof ArrayBuffer) {
      return new TextDecoder("utf-8").decode(input)
    }
  } catch (_err) {}

  try {
    if (input instanceof ArrayBuffer) {
      const u8 = new Uint8Array(input)
      let out = ""
      for (let i = 0; i < u8.length; i += 4096) {
        const chunk = u8.subarray(i, Math.min(i + 4096, u8.length))
        out += String.fromCharCode.apply(null, chunk)
      }
      return out
    }
  } catch (_err) {}

  return ""
}

function copyArrayBuffer(input) {
  if (!(input instanceof ArrayBuffer)) return null
  const copy = new Uint8Array(input.byteLength)
  copy.set(new Uint8Array(input))
  return copy.buffer
}

function realtimeAudioChunkPath(turnId, seq) {
  const root = (wx.env && wx.env.USER_DATA_PATH) || ""
  return `${root}/voicecoach_rt_${turnId}_${seq}.mp3`
}

Page({
  data: {
    sessionId: "",
    turns: [],
    loading: false,
    waitingCustomer: false,
    eventCursor: 0,
    recording: false,
    endModalVisible: false,
    hintVisible: false,
    hintText: "",
    hintPoints: [],
    scrollIntoView: "",
    playingTurnId: "",
    downloadingTurnId: "",
    recordingPreviewText: "",
    recordCanceling: false,
  },

  onLoad(options) {
    this.recorder = wx.getRecorderManager()
    try {
      this.audioCtx = wx.createInnerAudioContext({ useWebAudioImplement: true })
    } catch (_err) {
      this.audioCtx = wx.createInnerAudioContext()
    }
    this.audioCache = new Map()
    try {
      this.audioCtx.obeyMuteSwitch = false
    } catch (_err) {}
    this.audioCtx.onEnded(() => {
      const hadRealtimeQueue = Boolean(this.realtimeAudioPlaying)
      this.realtimeAudioPlaying = false
      this.setData({ playingTurnId: "" })
      if (hadRealtimeQueue) {
        this.playNextRealtimeAudioChunk()
      }
    })
    this.audioCtx.onPlay(() => {
      const latencyTurnId = this.pendingPlaybackTurnId || this.resolveLatencyTurnIdForPlayback(this.data.playingTurnId)
      if (latencyTurnId) {
        this.markTurnLatency(latencyTurnId, "first_audio_play", {
          audioTurnId: this.data.playingTurnId || "",
        })
      }
      this.pendingPlaybackTurnId = ""
    })

    this.hasShownAudioError = false
    this.hasShownTtsFallbackToast = false
    this.stopEvents = false
    this.pollingEvents = false
    // Always try stream at least once on real devices; wx.canIUse can be conservative.
    this.streamEventsDisabled = false
    this.streamNoChunkCount = 0
    this.streamBuffer = ""
    this.lastAutoPlayedCustomerTurnId = ""
    this.pendingLocalTurnId = ""
    this.turnLatency = new Map()
    this.customerParentMap = new Map()
    this.sessionCreatedAt = 0
    this.pendingPlaybackTurnId = ""
    this.realtimeEnabled = Boolean(VOICE_COACH_REALTIME_ENABLED && VOICE_COACH_REALTIME_URL)
    this.realtimeSocket = null
    this.realtimeSocketOpen = false
    this.realtimeSession = null
    this.realtimeAudioQueue = []
    this.realtimeAudioPlaying = false
    this.realtimeTempFiles = new Set()
    this.previewDisabled = !CLIENT_ASR_PREVIEW_ENABLED
    this.previewInFlight = false
    this.lastPreviewAt = 0
    this.recordingChunkSeq = 0
    this.recordTouchStartY = 0
    this.currentClientAttemptId = ""

    this.audioCtx.onError(() => {
      if (this.hasShownAudioError) return
      this.hasShownAudioError = true
      wx.showToast({ title: "音频播放失败，请检查 downloadFile 合法域名", icon: "none" })
    })

    this.recorder.onStop((res) => {
      if (this.recordIntent === "cancel") {
        this.recordIntent = ""
        this.closeRealtimeSocket({ interrupt: false })
        this.setData({ loading: false, recording: false })
        return
      }
      this.recordIntent = ""
      const durationSec = res && res.duration ? Math.round(res.duration / 1000) : 0
      if (!res || !res.tempFilePath) {
        this.closeRealtimeSocket({ interrupt: false })
        wx.showToast({ title: "录音失败", icon: "none" })
        this.setData({ recording: false, loading: false })
        return
      }
      if (!durationSec || durationSec < 1) {
        this.closeRealtimeSocket({ interrupt: false })
        wx.showToast({ title: "录音太短，请至少说1秒", icon: "none" })
        this.setData({ recording: false, loading: false })
        return
      }
      if (this.shouldUseRealtimeForCurrentTurn()) {
        this.finalizeRealtimeTurn(res.tempFilePath, durationSec)
        return
      }
      this.uploadBeauticianTurn(res.tempFilePath, durationSec, {
        clientAttemptId: this.currentClientAttemptId || "",
      })
    })

    if (CLIENT_ASR_PREVIEW_ENABLED && typeof this.recorder.onFrameRecorded === "function") {
      this.recorder.onFrameRecorded((frame) => {
        this.onRecordFrame(frame)
      })
    }

    const sessionId = options && options.sessionId ? String(options.sessionId) : ""
    if (sessionId) {
      this.loadSession(sessionId)
      return
    }
    this.createSession()
  },

  onUnload() {
    this.stopEvents = true
    this.flushRealtimeAudioQueue()
    this.closeRealtimeSocket({ interrupt: false })
    try {
      if (this.streamTask && typeof this.streamTask.abort === "function") this.streamTask.abort()
    } catch (_err) {}
    try {
      if (this.audioCtx) this.audioCtx.destroy()
    } catch {}
  },

  async createSession() {
    const startedAt = Date.now()
    this.sessionCreatedAt = startedAt
    this.setData({ loading: true })
    try {
      const res = await request({
        baseUrl: API_BASE_URL,
        url: "/api/voice-coach/sessions",
        method: "POST",
        data: { scenario_id: "objection_safety" },
      })

      const first = normalizeTurn({
        turn_id: res.first_customer_turn.turn_id,
        role: "customer",
        status: "audio_ready",
        text: res.first_customer_turn.text,
        emotion: res.first_customer_turn.emotion,
        audio_url: res.first_customer_turn.audio_url,
        audio_seconds: res.first_customer_turn.audio_seconds,
      })

      this.setData({
        sessionId: res.session_id,
        turns: [first],
        eventCursor: 0,
        loading: false,
        waitingCustomer: false,
        scrollIntoView: `turn-${first.id}`,
      })

      track("voicecoach_enter", {
        sessionId: res.session_id,
        createSessionMs: Date.now() - startedAt,
      })

      if (first.audio_url) {
        this.autoPlayTurn(first)
      } else if (first.text) {
        this.requestTurnTts(first.id, { autoplay: true })
      } else if (res.first_customer_turn && res.first_customer_turn.tts_failed) {
        this.notifyTtsFallback()
      }
      this.ensureEventsPolling()
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "创建会话失败", icon: "none" })
    }
  },

  async loadSession(sessionId) {
    this.setData({ loading: true })
    try {
      const res = await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}`,
        method: "GET",
      })
      const turns = (res.turns || []).map(normalizeTurn)
      const last = turns[turns.length - 1]
      const waitingCustomer = turns.some((t) => t.role === "beautician" && t.pending)
      this.setData({
        sessionId,
        turns,
        eventCursor: Number(res.last_event_cursor || 0) || 0,
        loading: false,
        waitingCustomer,
        scrollIntoView: last ? `turn-${last.id}` : "",
      })
      track("voicecoach_enter", {
        sessionId,
        resumed: true,
        turnCount: turns.length,
      })
      if (last && last.role === "customer" && last.text && !last.audio_url) {
        this.requestTurnTts(last.id, { autoplay: false })
      }
      this.ensureEventsPolling()
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "加载会话失败", icon: "none" })
    }
  },

  ensureEventsPolling() {
    if (this.pollingEvents || this.stopEvents) return
    if (!this.data.sessionId) return
    this.pollingEvents = true
    this.streamBuffer = ""
    this.pollEventsLoop()
  },

  async pollEventsLoop() {
    while (!this.stopEvents && this.data.sessionId) {
      const usedStream = await this.pollEventsStreamOnce()
      if (!usedStream) {
        const ok = await this.pollEventsOnce()
        if (!ok) {
          if (this.stopEvents) break
          await sleep(400)
        }
      }
    }

    this.pollingEvents = false
  },

  async pollEventsOnce() {
    const sessionId = this.data.sessionId
    const cursor = Number(this.data.eventCursor || 0) || 0
    if (!sessionId) return false

    try {
      const res = await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/events?cursor=${cursor}&timeout_ms=1200`,
        method: "GET",
      })
      if (this.stopEvents) return true

      if (res && Array.isArray(res.events) && res.events.length) {
        this.applyServerEvents(res.events)
      }

      const nextCursor = Number(res && res.next_cursor ? res.next_cursor : cursor) || cursor
      if (nextCursor !== cursor) {
        this.setData({ eventCursor: nextCursor })
      }
      return true
    } catch (_err) {
      return false
    }
  },

  async pollEventsStreamOnce() {
    if (this.streamEventsDisabled) return false
    const sessionId = this.data.sessionId
    if (!sessionId) return false
    const cursor = Number(this.data.eventCursor || 0) || 0
    const token = getAccessToken()
    const deviceId = getDeviceId()

    return new Promise((resolve) => {
      let resolved = false
      let streamUsable = true
      let firstChunkReceived = false
      let firstEventReceived = false
      let watchdogTimer = null
      let noEventTimer = null

      const done = (ok) => {
        if (resolved) return
        resolved = true
        if (watchdogTimer) {
          clearTimeout(watchdogTimer)
          watchdogTimer = null
        }
        if (noEventTimer) {
          clearTimeout(noEventTimer)
          noEventTimer = null
        }
        resolve(ok)
      }

      const markChunk = (text) => {
        if (!text) return
        const consumed = this.consumeStreamText(text)
        if (consumed.hasEvents) {
          firstEventReceived = true
        }
        if (consumed.useful && !firstChunkReceived) {
          firstChunkReceived = true
          this.streamNoChunkCount = 0
        }
      }

      const task = wx.request({
        url: `${API_BASE_URL}/api/voice-coach/sessions/${sessionId}/events/stream?cursor=${cursor}&timeout_ms=22000`,
        method: "GET",
        timeout: 26000,
        enableChunked: true,
        responseType: "text",
        header: {
          Authorization: token ? `Bearer ${token}` : "",
          "x-device-id": deviceId || "",
        },
        success: (res) => {
          if (res.statusCode === 404 || res.statusCode === 405) {
            this.streamEventsDisabled = true
            streamUsable = false
          } else if (res.statusCode < 200 || res.statusCode >= 300) {
            streamUsable = false
          }

          const tail = arrayBufferToAsciiText(res.data)
          if (tail) markChunk(tail)
        },
        fail: () => {
          streamUsable = false
        },
        complete: () => {
          done(streamUsable)
        },
      })

      this.streamTask = task

      if (!task || typeof task.onChunkReceived !== "function") {
        try {
          if (task && typeof task.abort === "function") task.abort()
        } catch (_err) {}
        this.streamEventsDisabled = true
        done(false)
        return
      }

      watchdogTimer = setTimeout(() => {
        if (resolved || firstChunkReceived) return
        streamUsable = false
        this.streamNoChunkCount = Number(this.streamNoChunkCount || 0) + 1
        this.streamEventsDisabled = true
        try {
          if (task && typeof task.abort === "function") task.abort()
        } catch (_err) {}
        done(false)
      }, 900)

      noEventTimer = setTimeout(() => {
        if (resolved || firstEventReceived) return
        if (!this.data.waitingCustomer) return
        streamUsable = false
        this.streamNoChunkCount = Number(this.streamNoChunkCount || 0) + 1
        this.streamEventsDisabled = true
        try {
          if (task && typeof task.abort === "function") task.abort()
        } catch (_err) {}
        done(false)
      }, 1800)

      task.onChunkReceived((chunk) => {
        const text = arrayBufferToAsciiText(chunk && chunk.data)
        if (text) markChunk(text)
      })
    })
  },

  consumeStreamText(textChunk) {
    if (!textChunk) return { useful: false, hasEvents: false }
    this.streamBuffer = `${this.streamBuffer || ""}${textChunk}`
    let useful = false
    let hasEvents = false

    while (true) {
      const sep = this.streamBuffer.indexOf("\n\n")
      if (sep < 0) break
      const rawBlock = this.streamBuffer.slice(0, sep)
      this.streamBuffer = this.streamBuffer.slice(sep + 2)
      const consumed = this.consumeStreamBlock(rawBlock)
      useful = consumed.useful || useful
      hasEvents = consumed.hasEvents || hasEvents
    }
    return { useful, hasEvents }
  },

  consumeStreamBlock(rawBlock) {
    if (!rawBlock) return { useful: false, hasEvents: false }
    const lines = rawBlock.split("\n")
    let eventName = ""
    let dataEncoded = ""

    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i] || "")
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
      } else if (line.startsWith("data:")) {
        dataEncoded += line.slice(5).trim()
      }
    }

    if (!eventName || !dataEncoded) return { useful: false, hasEvents: false }

    let payload = null
    try {
      payload = JSON.parse(decodeURIComponent(dataEncoded))
    } catch (_err) {
      try {
        payload = JSON.parse(dataEncoded)
      } catch (_err2) {
        return { useful: false, hasEvents: false }
      }
    }

    if (eventName === "events" && payload && Array.isArray(payload.events)) {
      this.applyServerEvents(payload.events)
      const nextCursor = Number(payload.next_cursor || this.data.eventCursor || 0) || 0
      if (nextCursor && nextCursor !== this.data.eventCursor) {
        this.setData({ eventCursor: nextCursor })
      }
      return { useful: true, hasEvents: payload.events.length > 0 }
    }
    if (eventName === "ready") {
      return { useful: true, hasEvents: false }
    } else if (eventName === "error") {
      this.streamEventsDisabled = true
    }
    return { useful: false, hasEvents: false }
  },

  findTurnIndex(turnId) {
    const turns = this.data.turns || []
    return turns.findIndex((t) => t.id === turnId)
  },

  isLatestCustomerTurn(turnId) {
    if (!turnId) return false
    const turns = this.data.turns || []
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "customer") return turns[i].id === turnId
    }
    return false
  },

  findPendingCustomerPlaceholderIndex(parentTurnId) {
    if (!parentTurnId) return -1
    const turns = this.data.turns || []
    return turns.findIndex((turn) => turn.role === "customer" && turn.placeholderForTurnId === parentTurnId)
  },

  patchTurn(turnId, patch) {
    const idx = this.findTurnIndex(turnId)
    if (idx < 0) return false
    const payload = {}
    Object.keys(patch || {}).forEach((key) => {
      payload[`turns[${idx}].${key}`] = patch[key]
    })
    this.setData(payload)
    return true
  },

  replaceTurn(turnId, turn) {
    const idx = this.findTurnIndex(turnId)
    if (idx < 0) return false
    this.setData({
      [`turns[${idx}]`]: turn,
      scrollIntoView: `turn-${turn.id}`,
    })
    return true
  },

  appendTurn(turn) {
    const turns = (this.data.turns || []).slice()
    turns.push(turn)
    this.setData({
      turns,
      scrollIntoView: `turn-${turn.id}`,
    })
  },

  ensurePendingCustomerPlaceholder(parentTurnId, label) {
    if (!parentTurnId) return
    const turns = this.data.turns || []
    const placeholderIdx = this.findPendingCustomerPlaceholderIndex(parentTurnId)
    if (placeholderIdx >= 0) {
      if (label && turns[placeholderIdx].pendingLabel !== label) {
        this.setData({
          [`turns[${placeholderIdx}].pendingLabel`]: label,
        })
      }
      return
    }

    const existingCustomerIdx = turns.findIndex(
      (turn) => turn.role === "customer" && !turn.placeholderForTurnId && this.customerParentMap.get(turn.id) === parentTurnId,
    )
    if (existingCustomerIdx >= 0) return

    this.appendTurn(makePendingCustomerTurn(parentTurnId, label))
    this.trackUiFeedback("customer_placeholder_shown", { beauticianTurnId: parentTurnId })
  },

  replacePendingCustomerPlaceholder(parentTurnId, turn) {
    const idx = this.findPendingCustomerPlaceholderIndex(parentTurnId)
    if (idx < 0) return false
    this.setData({
      [`turns[${idx}]`]: turn,
      scrollIntoView: `turn-${turn.id}`,
    })
    return true
  },

  clearPendingCustomerPlaceholder(parentTurnId) {
    const idx = this.findPendingCustomerPlaceholderIndex(parentTurnId)
    if (idx < 0) return false
    const turns = (this.data.turns || []).slice()
    turns.splice(idx, 1)
    this.setData({ turns })
    return true
  },

  startTurnLatency(turnId, meta = {}) {
    if (!turnId) return
    const now = Date.now()
    this.turnLatency.set(turnId, {
      startedAt: now,
      ...meta,
    })
  },

  moveTurnLatency(fromTurnId, toTurnId) {
    if (!fromTurnId || !toTurnId || fromTurnId === toTurnId) return
    const entry = this.turnLatency.get(fromTurnId)
    if (!entry) return
    this.turnLatency.delete(fromTurnId)
    this.turnLatency.set(toTurnId, entry)
  },

  markTurnLatency(turnId, stage, extra = {}) {
    if (!turnId || !stage) return
    const entry = this.turnLatency.get(turnId)
    if (!entry) return
    if (entry[stage]) return

    const now = Date.now()
    const elapsedMs = Math.max(0, now - Number(entry.startedAt || now))
    entry[stage] = now
    this.turnLatency.set(turnId, entry)

    track("voicecoach_turn_latency", {
      sessionId: this.data.sessionId || "",
      turnId,
      stage,
      elapsedMs,
      ...(entry.clientAttemptId ? { clientAttemptId: entry.clientAttemptId } : {}),
      ...extra,
    })
  },

  trackUiFeedback(stage, extra = {}) {
    track("voicecoach_ui_feedback", {
      sessionId: this.data.sessionId || "",
      stage,
      ...extra,
    })
  },

  resolveLatencyTurnIdForPlayback(turnId) {
    if (!turnId) return ""
    return this.customerParentMap.get(turnId) || turnId
  },

  shouldUseRealtimeForCurrentTurn() {
    return Boolean(this.realtimeEnabled && this.realtimeSession && !this.realtimeSession.fallbackUsed)
  },

  closeRealtimeSocket(opts = {}) {
    const shouldInterrupt = Boolean(opts.interrupt)
    const session = this.realtimeSession
    const socket = this.realtimeSocket
    this.realtimeSocket = null
    this.realtimeSocketOpen = false
    if (session) session.closedByClient = true

    if (socket && shouldInterrupt) {
      try {
        socket.send({
          data: JSON.stringify({
            type: "interrupt",
            payload: {
              reason: "user_barge_in",
            },
          }),
        })
      } catch (_err) {}
    }

    if (socket) {
      try {
        socket.close({
          code: 1000,
          reason: "client_close",
        })
      } catch (_err) {}
    }
  },

  async sendRealtimeJson(message) {
    if (!this.realtimeSocket || !this.realtimeSocketOpen) return false
    return new Promise((resolve) => {
      try {
        this.realtimeSocket.send({
          data: JSON.stringify(message),
          success: () => resolve(true),
          fail: () => resolve(false),
        })
      } catch (_err) {
        resolve(false)
      }
    })
  },

  async sendRealtimeBinary(buffer) {
    if (!this.realtimeSocket || !this.realtimeSocketOpen) return false
    return new Promise((resolve) => {
      try {
        this.realtimeSocket.send({
          data: buffer,
          success: () => resolve(true),
          fail: () => resolve(false),
        })
      } catch (_err) {
        resolve(false)
      }
    })
  },

  async flushQueuedRealtimeFrames() {
    const session = this.realtimeSession
    if (!session || !this.realtimeSocketOpen) return
    const queued = session.queuedFrames || []
    while (queued.length && this.realtimeSocketOpen && !session.fallbackUsed) {
      const frame = queued.shift()
      if (!frame) continue
      // eslint-disable-next-line no-await-in-loop
      const ok = await this.sendRealtimeFrame(frame)
      if (!ok) break
    }
  },

  async sendRealtimeFrame(frameBuffer) {
    const session = this.realtimeSession
    if (!session || session.fallbackUsed) return false
    const copied = copyArrayBuffer(frameBuffer)
    if (!copied) return false

    if (!this.realtimeSocketOpen) {
      session.queuedFrames.push(copied)
      return true
    }

    session.chunkSeq += 1
    session.totalChunks = session.chunkSeq
    const metaOk = await this.sendRealtimeJson({
      type: "audio.chunk",
      payload: {
        seq: session.chunkSeq,
        audio_format: "mp3",
        chunk_ms: VOICE_COACH_REALTIME_DEFAULT_CHUNK_MS,
        sample_rate: 16000,
        channels: 1,
        byte_length: copied.byteLength,
        transport: "binary",
      },
    })
    if (!metaOk) {
      session.fallbackUsed = true
      return false
    }

    const audioOk = await this.sendRealtimeBinary(copied)
    if (!audioOk) {
      session.fallbackUsed = true
      return false
    }

    return true
  },

  startRealtimeSession(replyToTurnId, clientAttemptId) {
    if (!this.realtimeEnabled || !replyToTurnId || !VOICE_COACH_REALTIME_URL) return false

    this.closeRealtimeSocket({ interrupt: true })
    this.realtimeSession = {
      replyToTurnId,
      clientAttemptId,
      queuedFrames: [],
      chunkSeq: 0,
      totalChunks: 0,
      localTurnId: "",
      serverTurnId: "",
      customerTurnId: "",
      filePath: "",
      durationSec: 0,
      fallbackUsed: false,
      awaitingServer: false,
      completed: false,
      closedByClient: false,
    }

    const token = getAccessToken()
    const deviceId = getDeviceId()
    let settled = false

    try {
      const socket = wx.connectSocket({
        url: VOICE_COACH_REALTIME_URL,
        header: {
          Authorization: token ? `Bearer ${token}` : "",
          "x-device-id": deviceId || "",
        },
        timeout: 1500,
      })

      this.realtimeSocket = socket
      this.realtimeSocketOpen = false

      const failSocket = () => {
        const session = this.realtimeSession
        if (!session) return
        session.fallbackUsed = true
        this.realtimeSocketOpen = false
      }

      const openTimer = setTimeout(() => {
        if (settled) return
        settled = true
        failSocket()
        this.closeRealtimeSocket({ interrupt: false })
      }, 1500)

      socket.onOpen(async () => {
        if (settled) return
        settled = true
        clearTimeout(openTimer)
        this.realtimeSocketOpen = true
        const ok = await this.sendRealtimeJson({
          type: "session.start",
          payload: {
            session_id: this.data.sessionId,
            reply_to_turn_id: replyToTurnId,
            client_attempt_id: clientAttemptId,
            audio_format: "mp3",
            sample_rate: 16000,
            channels: 1,
            chunk_ms: VOICE_COACH_REALTIME_DEFAULT_CHUNK_MS,
          },
        })
        if (!ok) {
          failSocket()
          this.closeRealtimeSocket({ interrupt: false })
          return
        }
        this.flushQueuedRealtimeFrames()
      })

      socket.onError(() => {
        clearTimeout(openTimer)
        if (!settled) settled = true
        failSocket()
      })

      socket.onClose(() => {
        clearTimeout(openTimer)
        this.realtimeSocketOpen = false
        const session = this.realtimeSession
        if (!session || session.closedByClient || session.completed) return
        if (session.awaitingServer && session.filePath && !session.serverTurnId && !session.fallbackUsed) {
          session.fallbackUsed = true
          this.fallbackRealtimeToUpload(session.filePath, session.durationSec, "socket_closed")
        }
      })

      socket.onMessage((event) => {
        this.handleRealtimeSocketMessage(event)
      })

      return true
    } catch (_err) {
      if (this.realtimeSession) this.realtimeSession.fallbackUsed = true
      return false
    }
  },

  bindRealtimeBeauticianTurn(serverTurnId) {
    const session = this.realtimeSession
    if (!session || !serverTurnId) return serverTurnId
    if (session.localTurnId && session.localTurnId !== serverTurnId) {
      const localIdx = this.findTurnIndex(session.localTurnId)
      const localTurn = localIdx >= 0 ? this.data.turns[localIdx] : null
      const replacement = normalizeTurn({
        turn_id: serverTurnId,
        role: "beautician",
        status: localTurn && localTurn.status ? localTurn.status : "accepted",
        text: localTurn && localTurn.text ? localTurn.text : "",
        audio_url: localTurn && localTurn.audio_url ? localTurn.audio_url : null,
        audio_seconds: localTurn && localTurn.audio_seconds ? localTurn.audio_seconds : null,
        pending: true,
      })
      if (localTurn) {
        replacement.showText = Boolean(localTurn.showText)
        replacement.textOpenedOnce = Boolean(localTurn.textOpenedOnce)
      }
      this.replaceTurn(session.localTurnId, replacement)
      this.moveTurnLatency(session.localTurnId, serverTurnId)
      if (this.pendingLocalTurnId === session.localTurnId) {
        this.pendingLocalTurnId = serverTurnId
      }
      session.localTurnId = serverTurnId
    }
    session.serverTurnId = serverTurnId
    return serverTurnId
  },

  handleRealtimeSocketMessage(event) {
    const text = arrayBufferToAsciiText(event && event.data)
    if (!text) return

    let message = null
    try {
      message = JSON.parse(text)
    } catch (_err) {
      return
    }
    if (!message || !message.type) return

    const payload = message.payload || {}
    const session = this.realtimeSession

    if (message.type === "session.ready") {
      if (payload.turn_id) this.bindRealtimeBeauticianTurn(String(payload.turn_id || ""))
      return
    }

    if (message.type === "asr.partial") {
      if (this.data.recording && payload.text) {
        this.setData({ recordingPreviewText: String(payload.text || "").slice(0, 48) })
      }
      return
    }

    if (message.type === "asr.final") {
      const turnId = this.bindRealtimeBeauticianTurn(String(payload.turn_id || ""))
      if (!turnId) return
      this.markTurnLatency(turnId, "asr_ready", {
        stageElapsedMs: Number(payload.stage_elapsed_ms || 0) || null,
        asrInputSource: payload.asr_input_source || "",
      })
      const seconds = Number(payload.audio_seconds || 0) || 0
      const hasAudio = Boolean(payload.audio_url)
      this.patchTurn(turnId, {
        status: "asr_ready",
        pending: false,
        text: String(payload.text || ""),
        audio_url: payload.audio_url || null,
        audio_seconds: seconds || null,
        audio_seconds_text: formatSeconds(seconds),
        voice_width_rpx: hasAudio ? voiceWidthRpx(seconds || 3) : 0,
        showText: hasAudio ? false : true,
      })
      if (payload.reached_max_turns) {
        this.setData({ waitingCustomer: false, loading: false })
        this.openEndModal()
      } else {
        this.ensurePendingCustomerPlaceholder(turnId, CUSTOMER_PENDING_REPLY_LABEL)
      }
      return
    }

    if (message.type === "customer.text_ready") {
      const customerTurnId = String(payload.turn_id || "")
      const beauticianTurnId = String(payload.beautician_turn_id || "")
      if (!customerTurnId || !beauticianTurnId) return
      if (session) session.customerTurnId = customerTurnId
      this.customerParentMap.set(customerTurnId, beauticianTurnId)
      this.markTurnLatency(beauticianTurnId, "customer_text_ready", {
        customerTurnId,
        stageElapsedMs: Number(payload.stage_elapsed_ms || 0) || null,
        asrInputSource: payload.asr_input_source || "",
      })
      const customerTurn = normalizeTurn({
        turn_id: customerTurnId,
        role: "customer",
        status: "text_ready",
        text: payload.text || "",
        emotion: payload.emotion || "",
        showText: true,
        textOpenedOnce: true,
        pendingLabel: CUSTOMER_PENDING_AUDIO_LABEL,
      })
      const updated = this.patchTurn(customerTurnId, {
        status: "text_ready",
        pending: false,
        text: String(payload.text || ""),
        emotion: String(payload.emotion || ""),
        showText: true,
        textOpenedOnce: true,
        pendingLabel: CUSTOMER_PENDING_AUDIO_LABEL,
        ttsFailed: false,
      })
      if (updated && beauticianTurnId) {
        this.clearPendingCustomerPlaceholder(beauticianTurnId)
      }
      if (!updated && !this.replacePendingCustomerPlaceholder(beauticianTurnId, customerTurn)) {
        this.appendTurn(customerTurn)
      }
      this.trackUiFeedback("customer_text_ready_visible", {
        customerTurnId,
        beauticianTurnId,
        transport: "realtime",
      })
      this.setData({ waitingCustomer: false, loading: false })
      return
    }

    if (message.type === "customer.audio_chunk") {
      const customerTurnId = String(payload.turn_id || "")
      if (!customerTurnId || !payload.chunk_base64) return
      const beauticianTurnId = this.customerParentMap.get(customerTurnId) || ""
      if (beauticianTurnId) {
        this.markTurnLatency(beauticianTurnId, "first_audio_chunk", {
          customerTurnId,
          stageElapsedMs: Number(payload.first_audio_chunk_ms || 0) || null,
        })
      }
      this.lastAutoPlayedCustomerTurnId = customerTurnId
      const filePath = realtimeAudioChunkPath(customerTurnId, Number(payload.seq || 0) || Date.now())
      try {
        const fs = wx.getFileSystemManager()
        fs.writeFile({
          filePath,
          data: String(payload.chunk_base64 || ""),
          encoding: "base64",
          success: () => {
            this.realtimeTempFiles.add(filePath)
            this.realtimeAudioQueue.push({
              turnId: customerTurnId,
              filePath,
            })
            if (!this.realtimeAudioPlaying && !this.data.playingTurnId) {
              this.playNextRealtimeAudioChunk()
            }
          },
        })
      } catch (_err) {}
      return
    }

    if (message.type === "customer.audio_ready") {
      const customerTurnId = String(payload.turn_id || "")
      const beauticianTurnId = String(payload.beautician_turn_id || this.customerParentMap.get(customerTurnId) || "")
      if (!customerTurnId) return
      if (beauticianTurnId) this.customerParentMap.set(customerTurnId, beauticianTurnId)
      this.lastAutoPlayedCustomerTurnId = customerTurnId
      if (beauticianTurnId) {
        this.markTurnLatency(beauticianTurnId, "customer_audio_ready", {
          customerTurnId,
          stageElapsedMs: Number(payload.first_audio_chunk_ms || 0) || null,
          ttsFailed: Boolean(payload.tts_failed),
        })
      }
      if (!payload.audio_url || payload.tts_failed) {
        this.notifyTtsFallback()
        this.patchTurn(customerTurnId, {
          status: "text_ready",
          pending: false,
          showText: true,
          textOpenedOnce: true,
          pendingLabel: "",
          ttsFailed: true,
        })
      } else {
        const seconds = Number(payload.audio_seconds || 0) || 0
        this.patchTurn(customerTurnId, {
          status: "audio_ready",
          pending: false,
          audio_url: payload.audio_url,
          audio_seconds: seconds || null,
          audio_seconds_text: formatSeconds(seconds),
          voice_width_rpx: voiceWidthRpx(seconds || 3),
          pendingLabel: "",
          ttsFailed: false,
        })
      }
      this.setData({ waitingCustomer: false, loading: false })
      return
    }

    if (message.type === "turn.done") {
      if (session) session.completed = true
      this.closeRealtimeSocket({ interrupt: false })
      return
    }

    if (message.type === "error") {
      const reason = String(payload.message || "实时语音失败")
      if (session && session.awaitingServer && session.filePath && !session.serverTurnId && !session.fallbackUsed) {
        session.fallbackUsed = true
        this.fallbackRealtimeToUpload(session.filePath, session.durationSec, reason)
        return
      }
      wx.showToast({ title: reason, icon: "none" })
    }
  },

  finalizeRealtimeTurn(filePath, durationSec) {
    const session = this.realtimeSession
    if (!session || session.fallbackUsed) {
      this.uploadBeauticianTurn(filePath, durationSec, {
        clientAttemptId: this.currentClientAttemptId || "",
      })
      return
    }

    session.filePath = filePath
    session.durationSec = durationSec
    session.awaitingServer = true
    const localTurn = makeLocalBeauticianTurn(filePath, durationSec)
    session.localTurnId = localTurn.id
    this.pendingLocalTurnId = localTurn.id
    this.startTurnLatency(localTurn.id, { clientAttemptId: session.clientAttemptId || this.currentClientAttemptId || "" })
    this.appendTurn(localTurn)
    this.ensurePendingCustomerPlaceholder(localTurn.id, CUSTOMER_PENDING_REPLY_LABEL)
    track("voicecoach_turn_submit", {
      sessionId: this.data.sessionId,
      role: "beautician",
      clientAttemptId: session.clientAttemptId || this.currentClientAttemptId || "",
      audioSeconds: durationSec || 0,
      transport: "realtime",
    })

    const sendEnd = async () => {
      const ok = await this.sendRealtimeJson({
        type: "audio.end",
        payload: {
          seq: session.chunkSeq,
          total_chunks: session.totalChunks,
        },
      })
      if (!ok) {
        session.fallbackUsed = true
        this.fallbackRealtimeToUpload(filePath, durationSec, "audio_end_send_failed")
        return
      }
      this.setData({ loading: false, waitingCustomer: true, recordingPreviewText: "" })
    }

    if (!this.realtimeSocketOpen) {
      setTimeout(() => {
        if (this.realtimeSocketOpen && !session.fallbackUsed) {
          sendEnd()
          return
        }
        session.fallbackUsed = true
        this.fallbackRealtimeToUpload(filePath, durationSec, "socket_not_ready")
      }, 400)
      return
    }

    sendEnd()
  },

  fallbackRealtimeToUpload(filePath, durationSec, reason) {
    const session = this.realtimeSession
    const clientAttemptId = (session && session.clientAttemptId) || this.currentClientAttemptId || ""
    if (session && session.localTurnId) {
      this.clearPendingCustomerPlaceholder(session.localTurnId)
      const turns = (this.data.turns || []).filter((turn) => turn.id !== session.localTurnId)
      this.turnLatency.delete(session.localTurnId)
      this.pendingLocalTurnId = ""
      this.setData({ turns })
    }
    this.trackUiFeedback("realtime_fallback_upload", {
      reason: reason || "",
    })
    this.closeRealtimeSocket({ interrupt: false })
    this.uploadBeauticianTurn(filePath, durationSec, { clientAttemptId })
  },

  playNextRealtimeAudioChunk() {
    const next = this.realtimeAudioQueue.shift()
    if (!next) {
      this.realtimeAudioPlaying = false
      return
    }

    this.realtimeAudioPlaying = true
    try {
      this.pendingPlaybackTurnId = this.resolveLatencyTurnIdForPlayback(next.turnId)
      this.audioCtx.stop()
      this.audioCtx.src = next.filePath
      this.audioCtx.play()
      this.setData({ playingTurnId: next.turnId })
    } catch (_err) {
      this.realtimeAudioPlaying = false
      this.playNextRealtimeAudioChunk()
    }
  },

  flushRealtimeAudioQueue() {
    this.realtimeAudioQueue = []
    this.realtimeAudioPlaying = false
    const files = Array.from(this.realtimeTempFiles || [])
    this.realtimeTempFiles.clear()
    try {
      this.audioCtx.stop()
    } catch (_err) {}
    if (!files.length) return
    const fs = wx.getFileSystemManager()
    files.forEach((filePath) => {
      try {
        fs.unlink({ filePath })
      } catch (_err) {}
    })
  },

  applyServerEvents(events) {
    let latestCursor = Number(this.data.eventCursor || 0) || 0

    for (let i = 0; i < events.length; i++) {
      const ev = events[i] || {}
      const eventId = Number(ev.id || 0) || 0
      if (eventId && eventId <= latestCursor) continue

      const type = String(ev.type || "")
      const data = ev && typeof ev.data === "object" && ev.data ? ev.data : {}
      const turnId = String(data.turn_id || ev.turn_id || "")
      const stageElapsedMs = Number(ev.stage_elapsed_ms || data.stage_elapsed_ms || 0) || null

      if (type === "turn.accepted" && turnId) {
        this.markTurnLatency(turnId, "accepted", {
          stageElapsedMs,
          jobId: data.job_id || ev.job_id || "",
          inlineAudioEligible: typeof data.inline_audio_eligible === "boolean" ? data.inline_audio_eligible : undefined,
        })
        const updated = this.patchTurn(turnId, {
          status: "accepted",
          pending: true,
          audio_url: data.audio_url || null,
          audio_seconds: Number(data.audio_seconds || 0) || null,
          audio_seconds_text: formatSeconds(Number(data.audio_seconds || 0) || 0),
        })
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              role: "beautician",
              status: "accepted",
              audio_url: data.audio_url || null,
              audio_seconds: Number(data.audio_seconds || 0) || null,
              pending: true,
            }),
          )
        }
        this.ensurePendingCustomerPlaceholder(turnId, CUSTOMER_PENDING_REPLY_LABEL)
        this.setData({ waitingCustomer: !data.reached_max_turns })
      } else if (type === "beautician.asr_ready" && turnId) {
        this.markTurnLatency(turnId, "asr_ready", {
          stageElapsedMs,
        })
        const seconds = Number(data.audio_seconds || 0) || 0
        const hasAudio = Boolean(data.audio_url)
        const patch = {
          status: "asr_ready",
          pending: false,
          text: String(data.text || ""),
          audio_url: data.audio_url || null,
          audio_seconds: seconds || null,
          audio_seconds_text: formatSeconds(seconds),
          voice_width_rpx: hasAudio ? voiceWidthRpx(seconds || 3) : 0,
          showText: hasAudio ? false : true,
        }

        const updated = this.patchTurn(turnId, patch)
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              role: "beautician",
              status: "asr_ready",
              text: data.text || "",
              audio_url: data.audio_url || null,
              audio_seconds: seconds || null,
            }),
          )
        }

        if (data.reached_max_turns) {
          this.setData({ waitingCustomer: false })
          this.openEndModal()
        }
      } else if (type === "customer.text_ready" && turnId) {
        const parentTurnId = String(data.beautician_turn_id || "")
        if (parentTurnId) {
          this.customerParentMap.set(turnId, parentTurnId)
        }
        if (parentTurnId) {
          this.markTurnLatency(parentTurnId, "customer_text_ready", {
            customerTurnId: turnId,
            stageElapsedMs,
            submitFastpathHit: Boolean(data.submit_fastpath_hit),
            asrInputSource: data.asr_input_source || "",
          })
        }
        const customerTurn = normalizeTurn({
          turn_id: turnId,
          role: "customer",
          status: "text_ready",
          text: data.text || "",
          emotion: data.emotion || "",
          showText: true,
          textOpenedOnce: true,
          pendingLabel: CUSTOMER_PENDING_AUDIO_LABEL,
        })
        const updated = this.patchTurn(turnId, {
          status: "text_ready",
          pending: false,
          text: String(data.text || ""),
          emotion: String(data.emotion || ""),
          showText: true,
          textOpenedOnce: true,
          pendingLabel: CUSTOMER_PENDING_AUDIO_LABEL,
          ttsFailed: false,
        })
        if (updated && parentTurnId) {
          this.clearPendingCustomerPlaceholder(parentTurnId)
        }
        if (!updated && !this.replacePendingCustomerPlaceholder(parentTurnId, customerTurn)) {
          this.appendTurn(customerTurn)
        }
        this.trackUiFeedback("customer_text_ready_visible", {
          customerTurnId: turnId,
          beauticianTurnId: parentTurnId,
        })
        this.setData({ waitingCustomer: false })
      } else if (type === "customer.audio_ready" && turnId) {
        const parentTurnId = String(data.beautician_turn_id || "")
        if (parentTurnId) {
          this.customerParentMap.set(turnId, parentTurnId)
        }
        if (parentTurnId) {
          this.markTurnLatency(parentTurnId, "customer_audio_ready", {
            customerTurnId: turnId,
            stageElapsedMs,
            ttsFailed: Boolean(data.tts_failed),
          })
        }
        if (!data.audio_url || data.tts_failed) {
          this.notifyTtsFallback()
          const updated = this.patchTurn(turnId, {
            status: "text_ready",
            pending: false,
            showText: true,
            textOpenedOnce: true,
            pendingLabel: "",
            ttsFailed: true,
          })
          if (updated && parentTurnId) {
            this.clearPendingCustomerPlaceholder(parentTurnId)
          }
          if (!updated && parentTurnId) {
            this.replacePendingCustomerPlaceholder(
              parentTurnId,
              normalizeTurn({
                turn_id: turnId,
                role: "customer",
                status: "text_ready",
                text: data.text || "",
                showText: true,
                textOpenedOnce: true,
                tts_failed: true,
              }),
            )
          }
          this.setData({ waitingCustomer: false })
        } else {
          const seconds = Number(data.audio_seconds || 0) || 0
          const updated = this.patchTurn(turnId, {
            status: "audio_ready",
            pending: false,
            audio_url: data.audio_url,
            audio_seconds: seconds || null,
            audio_seconds_text: formatSeconds(seconds),
            voice_width_rpx: voiceWidthRpx(seconds || 3),
            pendingLabel: "",
            ttsFailed: false,
          })
          if (updated && parentTurnId) {
            this.clearPendingCustomerPlaceholder(parentTurnId)
          }
          if (!updated) {
            const customerAudioTurn = normalizeTurn({
              turn_id: turnId,
              role: "customer",
              status: "audio_ready",
              text: data.text || "",
              audio_url: data.audio_url,
              audio_seconds: seconds || null,
              showText: true,
              textOpenedOnce: true,
            })
            if (!this.replacePendingCustomerPlaceholder(parentTurnId, customerAudioTurn)) {
              this.appendTurn(customerAudioTurn)
            }
          }

          if (this.lastAutoPlayedCustomerTurnId !== turnId) {
            this.lastAutoPlayedCustomerTurnId = turnId
            this.autoPlayTurn({
              id: turnId,
              audio_url: data.audio_url,
            })
          }
          this.setData({ waitingCustomer: false })
        }
      } else if (type === "beautician.analysis_ready" && turnId) {
        this.markTurnLatency(turnId, "analysis_ready", {
          stageElapsedMs,
        })
        this.patchTurn(turnId, {
          status: "analysis_ready",
          pending: false,
          analysis: data.analysis || null,
        })
        this.turnLatency.delete(turnId)
      } else if (type === "turn.error") {
        if (turnId) {
          this.clearPendingCustomerPlaceholder(turnId)
        }
        if (turnId) {
          this.patchTurn(turnId, { pending: false, status: "error" })
          this.turnLatency.delete(turnId)
        }
        this.setData({ waitingCustomer: false })
        const code = String(data.code || "")
        if (code !== "analysis_failed") {
          wx.showToast({ title: String(data.message || "处理失败，请重试"), icon: "none" })
        }
      }

      if (eventId > latestCursor) latestCursor = eventId
    }

    if (latestCursor !== this.data.eventCursor) {
      this.setData({ eventCursor: latestCursor })
    }
  },

  async requestTurnTts(turnId, opts = {}) {
    const sessionId = this.data.sessionId
    if (!sessionId || !turnId) return
    const idx = this.findTurnIndex(turnId)
    if (idx >= 0 && this.data.turns[idx] && this.data.turns[idx].audio_url) return
    const currentTurn = idx >= 0 ? this.data.turns[idx] : null
    const keepTranscriptVisible = Boolean(currentTurn && currentTurn.role === "customer" && currentTurn.text)
    const latestCustomer = this.isLatestCustomerTurn(turnId)
    if (latestCustomer) this.setData({ waitingCustomer: true })
    this.patchTurn(turnId, {
      status: "text_ready",
      showText: keepTranscriptVisible,
      textOpenedOnce: keepTranscriptVisible,
      ttsFailed: false,
    })

    try {
      const res = await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/turns/${turnId}/tts`,
        method: "POST",
        data: {},
      })

      if (!res || res.error) {
        this.patchTurn(turnId, {
          status: "text_ready",
          showText: keepTranscriptVisible,
          textOpenedOnce: keepTranscriptVisible,
          ttsFailed: true,
        })
        if (latestCustomer) this.setData({ waitingCustomer: false })
        return
      }
      if (!res.audio_url || res.tts_failed) {
        this.patchTurn(turnId, {
          status: "text_ready",
          showText: keepTranscriptVisible,
          textOpenedOnce: keepTranscriptVisible,
          ttsFailed: true,
        })
        if (latestCustomer) this.setData({ waitingCustomer: false })
        this.notifyTtsFallback()
        return
      }

      const seconds = Number(res.audio_seconds || 0) || 0
      this.patchTurn(turnId, {
        status: "audio_ready",
        audio_url: res.audio_url,
        audio_seconds: seconds || null,
        audio_seconds_text: formatSeconds(seconds),
        voice_width_rpx: voiceWidthRpx(seconds || 3),
        showText: keepTranscriptVisible,
        textOpenedOnce: keepTranscriptVisible,
      })

      if (opts && opts.autoplay) {
        this.autoPlayTurn({
          id: turnId,
          audio_url: res.audio_url,
        })
      }
      if (latestCustomer) this.setData({ waitingCustomer: false })
    } catch (_err) {
      this.patchTurn(turnId, {
        status: "text_ready",
        showText: keepTranscriptVisible,
        textOpenedOnce: keepTranscriptVisible,
        ttsFailed: true,
      })
      if (latestCustomer) this.setData({ waitingCustomer: false })
      if (!(opts && opts.silent)) {
        this.notifyTtsFallback()
      }
    }
  },

  openEndModal() {
    this.setData({ endModalVisible: true })
  },

  closeEndModal() {
    this.setData({ endModalVisible: false })
  },

  async endAndViewReport() {
    const sessionId = this.data.sessionId
    if (!sessionId) return
    this.stopEvents = true
    this.setData({ loading: true, endModalVisible: false })
    track("voicecoach_end", {
      sessionId,
      mode: "view_report",
    })
    try {
      await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/end`,
        method: "POST",
        data: { mode: "view_report" },
      })
      wx.navigateTo({ url: `/pages/voice-coach/report?sessionId=${sessionId}` })
    } catch (err) {
      this.stopEvents = false
      this.ensureEventsPolling()
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "生成报告失败", icon: "none" })
    }
  },

  async endOnly() {
    const sessionId = this.data.sessionId
    if (!sessionId) return
    this.stopEvents = true
    this.setData({ loading: true, endModalVisible: false })
    track("voicecoach_end", {
      sessionId,
      mode: "end_only",
    })
    try {
      await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/end`,
        method: "POST",
        data: { mode: "end_only" },
      })
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({ url: "/pages/mine/index" })
        },
      })
    } catch (err) {
      this.stopEvents = false
      this.ensureEventsPolling()
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "结束失败", icon: "none" })
    }
  },

  getLastCustomerTurnId() {
    const turns = this.data.turns || []
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "customer") return turns[i].id
    }
    return ""
  },

  onRecordFrame(frame) {
    if (this.realtimeEnabled && this.realtimeSession && !this.realtimeSession.fallbackUsed) {
      const frameBuffer = frame && frame.frameBuffer
      if (frameBuffer instanceof ArrayBuffer) {
        this.sendRealtimeFrame(frameBuffer)
      }
    }

    if (!frame || this.previewDisabled || this.previewInFlight) return
    if (!this.data.recording || !this.data.sessionId) return

    const now = Date.now()
    if (now - this.lastPreviewAt < 1200) return

    const frameBuffer = frame.frameBuffer
    if (!(frameBuffer instanceof ArrayBuffer)) return
    if (frameBuffer.byteLength < 4096 || frameBuffer.byteLength > 512 * 1024) return

    if (typeof wx.arrayBufferToBase64 !== "function") return

    let audioB64 = ""
    try {
      audioB64 = wx.arrayBufferToBase64(frameBuffer)
    } catch (_err) {
      return
    }
    if (!audioB64) return

    this.previewInFlight = true
    this.lastPreviewAt = now
    this.recordingChunkSeq += 1

    const sessionId = this.data.sessionId
    request({
      baseUrl: API_BASE_URL,
      url: `/api/voice-coach/sessions/${sessionId}/asr-preview`,
      method: "POST",
      data: {
        audio_b64: audioB64,
        format: "mp3",
        seq: this.recordingChunkSeq,
      },
    })
      .then((res) => {
        if (res && (res.degraded || res.error === "preview_unavailable")) {
          this.previewDisabled = true
          return
        }
        const text = String(res && res.text ? res.text : "").trim()
        if (text) {
          this.setData({
            recordingPreviewText: text.slice(0, 48),
          })
        }
      })
      .catch((err) => {
        const status = Number(err && err.statusCode ? err.statusCode : 0)
        const code = String(err && err.message ? err.message : "")
        if (
          status === 404 ||
          status >= 500 ||
          code.includes("voice_coach_stream_preview_disabled") ||
          code.includes("asr_flash_resource_missing")
        ) {
          this.previewDisabled = true
        }
      })
      .finally(() => {
        this.previewInFlight = false
      })
  },

  onRecordStart(e) {
    if (this.data.recording) return
    if (this.data.loading) return
    if (!this.data.sessionId) return
    this.recordTouchStartY = 0
    const startTouchY = Number(
      (e && e.touches && e.touches[0] && e.touches[0].clientY) ||
        (e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) ||
        0,
    )

    const start = async (touchY = 0) => {
      if (this.data.waitingCustomer) {
        this.flushRealtimeAudioQueue()
        this.closeRealtimeSocket({ interrupt: true })
        this.setData({ waitingCustomer: false })
      }
      this.recordTouchStartY = Number(touchY || 0)
      this.recordIntent = "send"
      this.setData({ recording: true, recordCanceling: false, recordingPreviewText: "录音中..." })
      try {
        this.flushRealtimeAudioQueue()
        if (this.audioCtx) this.audioCtx.stop()
        this.setData({ playingTurnId: "" })
      } catch {}

      const replyToTurnId = this.getLastCustomerTurnId()
      this.currentClientAttemptId = makeClientAttemptId()
      if (this.realtimeEnabled && replyToTurnId) {
        this.startRealtimeSession(replyToTurnId, this.currentClientAttemptId)
      } else {
        this.closeRealtimeSocket({ interrupt: false })
      }

      try {
        const preferredOptions = {
          duration: 30000,
          format: "mp3",
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 64000,
          audioSource: "voice_recognition",
          frameSize: 16,
        }

        const fallbackOptions = {
          duration: 30000,
          format: "mp3",
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 64000,
          frameSize: 16,
        }

        try {
          this.recorder.start(preferredOptions)
        } catch (_startErr) {
          this.recorder.start(fallbackOptions)
        }
      } catch (_err) {
        this.setData({ recording: false })
        wx.showToast({ title: "无法开始录音", icon: "none" })
      }
    }

    wx.getSetting({
      success: (setting) => {
        if (setting && setting.authSetting && setting.authSetting["scope.record"]) {
          start(startTouchY)
          return
        }
        wx.authorize({
          scope: "scope.record",
          success: () => void start(startTouchY),
          fail: () => {
            wx.showModal({
              title: "需要录音权限",
              content: "请在设置中允许录音权限后再开始练习。",
              confirmText: "去设置",
              cancelText: "取消",
              success: (res) => {
                if (!res.confirm) return
                wx.openSetting({})
              },
            })
          },
        })
      },
      fail: () => void start(startTouchY),
    })
  },

  onRecordMove(e) {
    if (!this.data.recording) return
    const y = Number((e && e.touches && e.touches[0] && e.touches[0].clientY) || 0)
    if (!y || !this.recordTouchStartY) return
    const movedUp = this.recordTouchStartY - y
    const willCancel = movedUp > 70
    if (willCancel !== Boolean(this.data.recordCanceling)) {
      this.setData({ recordCanceling: willCancel })
    }
  },

  onRecordEnd() {
    if (!this.data.recording) return
    if (this.data.recordCanceling) {
      this.onRecordCancel()
      return
    }
    this.recordIntent = "send"
    this.setData({ recording: false, recordCanceling: false, loading: true, recordingPreviewText: "" })
    try {
      this.recorder.stop()
    } catch (_err) {
      this.setData({ loading: false })
      wx.showToast({ title: "录音停止失败", icon: "none" })
    }
  },

  onRecordCancel() {
    if (!this.data.recording) return
    this.recordIntent = "cancel"
    this.setData({ recording: false, recordCanceling: false, loading: false, recordingPreviewText: "" })
    this.closeRealtimeSocket({ interrupt: false })
    try {
      this.recorder.stop()
    } catch {}
  },

  uploadBeauticianTurn(filePath, durationSec, opts = {}) {
    const sessionId = this.data.sessionId
    const replyToTurnId = this.getLastCustomerTurnId()
    if (!replyToTurnId) {
      this.setData({ loading: false })
      wx.showToast({ title: "缺少顾客对话", icon: "none" })
      return
    }

    const localTurn = makeLocalBeauticianTurn(filePath, durationSec)
    this.pendingLocalTurnId = localTurn.id
    const clientAttemptId = String(opts.clientAttemptId || makeClientAttemptId())
    this.startTurnLatency(localTurn.id, { clientAttemptId })
    this.appendTurn(localTurn)
    track("voicecoach_turn_submit", {
      sessionId,
      role: "beautician",
      clientAttemptId,
      audioSeconds: durationSec || 0,
    })

    const token = getAccessToken()
    const deviceId = getDeviceId()

    wx.uploadFile({
      url: `${API_BASE_URL}/api/voice-coach/sessions/${sessionId}/beautician-turn/submit`,
      filePath,
      name: "audio",
      formData: {
        reply_to_turn_id: replyToTurnId,
        client_audio_seconds: String(durationSec || ""),
        client_attempt_id: clientAttemptId,
      },
      header: {
        Authorization: token ? `Bearer ${token}` : "",
        "x-device-id": deviceId || "",
      },
      success: (res) => {
        let payload = null
        try {
          payload = JSON.parse(res.data)
        } catch (_err) {
          payload = null
        }

        if (!payload || payload.error) {
          this.setData({ loading: false, waitingCustomer: false })
          wx.showToast({ title: payload?.message || payload?.error || "上传失败", icon: "none" })
          if (this.pendingLocalTurnId) this.turnLatency.delete(this.pendingLocalTurnId)
          const turns = (this.data.turns || []).filter((t) => t.id !== this.pendingLocalTurnId)
          this.pendingLocalTurnId = ""
          this.setData({ turns })
          return
        }

        const accepted = normalizeTurn({
          turn_id: payload.beautician_turn.turn_id,
          role: "beautician",
          status: "accepted",
          text: payload.beautician_turn.text,
          audio_url: payload.beautician_turn.audio_url,
          audio_seconds: payload.beautician_turn.audio_seconds,
          pending: true,
        })

        const pendingId = this.pendingLocalTurnId
        this.pendingLocalTurnId = ""
        if (!this.replaceTurn(pendingId, accepted)) {
          this.appendTurn(accepted)
          const stale = pendingId ? this.turnLatency.get(pendingId) : null
          if (stale) {
            this.turnLatency.delete(pendingId)
            this.turnLatency.set(accepted.id, stale)
          }
        } else {
          this.moveTurnLatency(pendingId, accepted.id)
        }

        this.markTurnLatency(accepted.id, "submit_ack", {
          deduped: Boolean(payload.deduped),
          acceptedByServer: true,
          inlineAudioEligible: typeof payload.inline_audio_eligible === "boolean" ? payload.inline_audio_eligible : undefined,
          submitFastpathHit: Boolean(payload.submit_fastpath_hit),
        })
        this.ensurePendingCustomerPlaceholder(accepted.id, CUSTOMER_PENDING_REPLY_LABEL)
        this.trackUiFeedback("submit_accepted", {
          beauticianTurnId: accepted.id,
          submitFastpathHit: Boolean(payload.submit_fastpath_hit),
        })

        const nextCursor = Number(payload.next_cursor || 0) || 0
        this.setData({
          loading: false,
          waitingCustomer: !payload.reached_max_turns,
          eventCursor: nextCursor > (this.data.eventCursor || 0) ? nextCursor : this.data.eventCursor,
        })
        this.ensureEventsPolling()
      },
      fail: () => {
        this.setData({ loading: false, waitingCustomer: false })
        wx.showToast({ title: "上传失败", icon: "none" })
        if (this.pendingLocalTurnId) this.turnLatency.delete(this.pendingLocalTurnId)
        const turns = (this.data.turns || []).filter((t) => t.id !== this.pendingLocalTurnId)
        this.pendingLocalTurnId = ""
        this.setData({ turns })
      },
    })
  },

  toggleText(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    const idx = this.findTurnIndex(id)
    if (idx < 0) return
    const turn = this.data.turns[idx] || {}
    const willShow = !turn.showText
    this.setData({
      [`turns[${idx}].showText`]: willShow,
      [`turns[${idx}].textOpenedOnce`]: Boolean(turn.textOpenedOnce || willShow),
    })
  },

  toggleSuggest(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    const idx = this.findTurnIndex(id)
    const current = idx >= 0 ? this.data.turns[idx] : null
    const willOpen = current ? !current.showSuggestions : false
    if (idx < 0) return
    this.setData({
      [`turns[${idx}].showSuggestions`]: willOpen,
    })
    if (willOpen) {
      track("voicecoach_suggestion_open", {
        sessionId: this.data.sessionId || "",
        turnId: id,
      })
    }
  },

  onRerecord(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return

    wx.showModal({
      title: "重录确认",
      content: "重录会从这一句开始重新对话，后续对话将被重置。",
      confirmText: "重录",
      cancelText: "取消",
      success: (res) => {
        if (!res.confirm) return
        track("voicecoach_rerecord", {
          sessionId: this.data.sessionId || "",
          turnId: id,
        })
        this.rollbackFrom(id)
      },
    })
  },

  async rollbackFrom(turnId) {
    const sessionId = this.data.sessionId
    if (!sessionId) return
    this.setData({ loading: true, waitingCustomer: false })
    try {
      const res = await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/rollback`,
        method: "POST",
        data: { from_turn_id: turnId },
      })
      const turns = (res.turns || []).map(normalizeTurn)
      const last = turns[turns.length - 1]
      this.setData({
        turns,
        eventCursor: Number(res.last_event_cursor || this.data.eventCursor || 0) || 0,
        loading: false,
        waitingCustomer: false,
        scrollIntoView: last ? `turn-${last.id}` : "",
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "回滚失败", icon: "none" })
    }
  },

  openHint() {
    const sessionId = this.data.sessionId
    if (!sessionId) return
    const customerTurnId = this.getLastCustomerTurnId()
    if (!customerTurnId) return

    this.setData({ loading: true })
    request({
      baseUrl: API_BASE_URL,
      url: `/api/voice-coach/sessions/${sessionId}/hint`,
      method: "POST",
      data: { customer_turn_id: customerTurnId },
    })
      .then((res) => {
        this.setData({
          loading: false,
          hintVisible: true,
          hintText: res.hint_text || "",
          hintPoints: res.hint_points || [],
        })
        track("voicecoach_hint_open", {
          sessionId: sessionId || "",
          customerTurnId,
        })
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || "获取灵感失败", icon: "none" })
      })
  },

  closeHint() {
    this.setData({ hintVisible: false })
  },

  onRetryTts(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!id) return
    this.requestTurnTts(id, { autoplay: true })
  },

  onPlay(e) {
    const url = e && e.currentTarget ? String(e.currentTarget.dataset.url || "") : ""
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!url) return

    if (this.data.playingTurnId === id) {
      try {
        this.audioCtx.stop()
      } catch {}
      this.setData({ playingTurnId: "" })
      return
    }

    this.playAudio(id, url)
  },

  autoPlayTurn(turn) {
    if (!turn || !turn.audio_url || !turn.id) return
    this.playAudio(turn.id, turn.audio_url, { autoplay: true })
  },

  notifyTtsFallback() {
    if (this.hasShownTtsFallbackToast) return
    this.hasShownTtsFallbackToast = true
    wx.showToast({ title: "顾客语音生成失败，请重试语音", icon: "none" })
  },

  playAudio(turnId, url, opts = {}) {
    const autoplay = Boolean(opts.autoplay)
    if (this.realtimeAudioQueue.length || this.realtimeAudioPlaying) {
      this.flushRealtimeAudioQueue()
    }

    const doPlay = (src) => {
      try {
        this.pendingPlaybackTurnId = this.resolveLatencyTurnIdForPlayback(turnId)
        this.audioCtx.stop()
        this.audioCtx.src = src
        this.audioCtx.play()
        this.setData({ playingTurnId: turnId })
      } catch (_err) {
        if (!autoplay) wx.showToast({ title: "播放失败", icon: "none" })
      }
    }

    if (!/^https?:\/\//.test(url)) {
      doPlay(url)
      return
    }

    if (autoplay) {
      doPlay(url)
      if (!this.audioCache.get(turnId)) {
        wx.downloadFile({
          url,
          success: (res) => {
            if (res && res.statusCode === 200 && res.tempFilePath) {
              this.audioCache.set(turnId, res.tempFilePath)
            }
          },
        })
      }
      return
    }

    const cached = this.audioCache.get(turnId)
    if (cached) {
      doPlay(cached)
      return
    }

    this.setData({ downloadingTurnId: turnId })
    wx.downloadFile({
      url,
      success: (res) => {
        this.setData({ downloadingTurnId: "" })
        if (!res || res.statusCode !== 200 || !res.tempFilePath) {
          doPlay(url)
          return
        }
        this.audioCache.set(turnId, res.tempFilePath)
        doPlay(res.tempFilePath)
      },
      fail: () => {
        this.setData({ downloadingTurnId: "" })
        doPlay(url)
      },
    })
  },
})
