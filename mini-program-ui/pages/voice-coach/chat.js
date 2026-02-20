const { API_BASE_URL, VOICE_COACH_MP_STREAM_ENABLED } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken, loginSilent } = require("../../utils/auth")
const { getClientBuild } = require("../../utils/build")
const { getDeviceId } = require("../../utils/device")
const { track } = require("../../utils/track")

const TURN_PENDING_STATUSES = {
  accepted: true,
  processing: true,
}

// Default to short-polling on Mini Program for stability.
const MP_STREAM_ENABLED = Boolean(VOICE_COACH_MP_STREAM_ENABLED)
const LOCAL_SILENCE_MIN_SECONDS = 1.2
const LOCAL_SILENCE_MIN_ENERGY_FRAMES = 2
const POLL_BACKOFF_BASE_MS = 250
const POLL_BACKOFF_MAX_MS = 2500
const BUILD_ID = getClientBuild()

// Preview ASR currently uses short chunks with flash endpoint, which is not a compatible path.
// Keep it disabled by default until realtime streaming ASR is enabled.
const CLIENT_ASR_PREVIEW_ENABLED = false

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
  const showTextDefault = role === "customer" ? !hasAudio && status === "text_ready" : !hasAudio
  const audioSeconds = Number(raw.audio_seconds || raw.audioSeconds || 0) || 0
  const pending = typeof raw.pending === "boolean" ? raw.pending : isPendingByStatus(status)

  return {
    id: raw.id || raw.turn_id,
    role,
    status,
    text: raw.text || "",
    emotion: raw.emotion || "",
    line_id: raw.line_id || null,
    intent_id: raw.intent_id || null,
    angle_id: raw.angle_id || null,
    reply_source: raw.reply_source || null,
    audio_url: raw.audio_url || null,
    audio_seconds: audioSeconds || null,
    audio_seconds_text: formatSeconds(audioSeconds),
    voice_width_rpx: hasAudio ? voiceWidthRpx(audioSeconds) : 0,
    analysis: raw.analysis || raw.analysis_json || null,
    ttsFailed: Boolean(raw.tts_failed || raw.ttsFailed),
    showSuggestions: false,
    showText: showTextDefault,
    textOpenedOnce: false,
    pending,
    analysisLoading: false,
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
    analysisLoading: false,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeClientAttemptId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `mp_${Date.now()}_${rand}`
}

function detectAudioFormatFromPath(filePath, fallbackFormat = "") {
  const fallback = String(fallbackFormat || "").trim().toLowerCase()
  const input = String(filePath || "").trim().toLowerCase()
  if (input.endsWith(".mp3")) return "mp3"
  if (input.endsWith(".wav")) return "wav"
  if (input.endsWith(".aac")) return "aac"
  return fallback || "unknown"
}

function calcPercentile(values, percentile) {
  const p = Math.max(0, Math.min(100, Number(percentile || 0) || 0))
  const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(Number(v))) : []
  if (!list.length) return 0
  const sorted = list.slice().sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return Number(sorted[index] || 0)
}

function canUseChunkedRequest() {
  try {
    return typeof wx.canIUse === "function" && wx.canIUse("request.enableChunked")
  } catch (_err) {
    return false
  }
}

function maybeDecodeJwtExp(token) {
  if (!token || typeof token !== "string") return 0
  const parts = token.split(".")
  if (parts.length < 2) return 0
  try {
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    while (payload.length % 4 !== 0) payload += "="
    if (typeof wx.base64ToArrayBuffer !== "function") return 0
    const arr = wx.base64ToArrayBuffer(payload)
    const u8 = new Uint8Array(arr)
    let text = ""
    for (let i = 0; i < u8.length; i++) {
      text += String.fromCharCode(u8[i])
    }
    const json = JSON.parse(text)
    return Number(json && json.exp ? json.exp : 0) || 0
  } catch (_err) {
    return 0
  }
}

function shouldWarmupLogin(token) {
  if (!token) return true
  const exp = maybeDecodeJwtExp(token)
  if (!exp) return false
  const nowSec = Math.floor(Date.now() / 1000)
  return exp - nowSec <= 120
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

Page({
  data: {
    sessionId: "",
    categoryId: "sale",
    goalTemplateId: "",
    goalCustom: "",
    recommendation: null,
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
      this.setData({ playingTurnId: "" })
    })

    this.hasShownAudioError = false
    this.hasShownTtsFallbackToast = false
    this.hasShownLoginExpiredToast = false
    this.stopEvents = false
    this.pollingEvents = false
    this.pollBackoffMs = 0
    this.streamEventsDisabled = !MP_STREAM_ENABLED
    this.streamNoChunkCount = 0
    this.streamBuffer = ""
    this.lastAutoPlayedCustomerTurnId = ""
    this.pendingLocalTurnId = ""
    this.turnLatency = new Map()
    this.sessionCreatedAt = 0
    this.previewDisabled = !CLIENT_ASR_PREVIEW_ENABLED
    this.previewInFlight = false
    this.lastPreviewAt = 0
    this.recordingChunkSeq = 0
    this.recordTouchStartY = 0
    this.recordEnergyFrames = 0
    this.recordFrameCount = 0
    this.recordStartedAt = 0
    this.lastRecordMeta = {
      format: "unknown",
      sampleRate: 16000,
      channels: 1,
    }
    this.uiFeedbackSamples = []

    console.log("[voice-coach] page load", { build_id: BUILD_ID })

    this.audioCtx.onError(() => {
      if (this.hasShownAudioError) return
      this.hasShownAudioError = true
      wx.showToast({ title: "音频播放失败，请检查 downloadFile 合法域名", icon: "none" })
    })

    this.recorder.onStop((res) => {
      if (this.recordIntent === "cancel") {
        this.recordIntent = ""
        this.recordStartedAt = 0
        this.setData({ loading: false, recording: false, recordingPreviewText: "" })
        return
      }
      this.recordIntent = ""
      const durationSec = res && res.duration ? Math.round(res.duration / 1000) : 0
      const fallbackRecordMs = Math.max(0, Date.now() - Number(this.recordStartedAt || Date.now()))
      const recordMs = Math.max(0, Number((res && res.duration) || fallbackRecordMs) || 0)
      const recordFormat = detectAudioFormatFromPath(
        res && res.tempFilePath,
        this.lastRecordMeta && this.lastRecordMeta.format,
      )
      const recordSampleRate = Number((this.lastRecordMeta && this.lastRecordMeta.sampleRate) || 16000) || 16000
      const recordChannels = Number((this.lastRecordMeta && this.lastRecordMeta.channels) || 1) || 1
      this.recordStartedAt = 0
      if (!res || !res.tempFilePath) {
        wx.showToast({ title: "录音失败", icon: "none" })
        this.setData({ recording: false, loading: false, recordingPreviewText: "" })
        return
      }
      if (!durationSec || durationSec < 1) {
        wx.showToast({ title: "录音太短，请至少说1秒", icon: "none" })
        this.setData({ recording: false, loading: false, recordingPreviewText: "" })
        return
      }
      const fileSize = Number(res && res.fileSize ? res.fileSize : 0) || 0
      const lowEnergy = Number(this.recordEnergyFrames || 0) < LOCAL_SILENCE_MIN_ENERGY_FRAMES
      if (durationSec < LOCAL_SILENCE_MIN_SECONDS && lowEnergy && fileSize < 4096) {
        wx.showToast({ title: "未检测到有效语音，请重录", icon: "none" })
        this.setData({ recording: false, loading: false, recordingPreviewText: "" })
        return
      }
      console.log("[voice-coach] recorder stop", {
        build_id: BUILD_ID,
        record_format: recordFormat,
        record_sample_rate: recordSampleRate,
        record_channels: recordChannels,
      })
      this.uploadBeauticianTurn(res.tempFilePath, durationSec, {
        recordMs,
        recordFormat,
        recordSampleRate,
        recordChannels,
      })
    })

    if (typeof this.recorder.onFrameRecorded === "function") {
      this.recorder.onFrameRecorded((frame) => {
        this.onRecordFrame(frame)
      })
    }

    const sessionId = options && options.sessionId ? String(options.sessionId) : ""
    const categoryId =
      options && (options.categoryId || options.category_id) ? String(options.categoryId || options.category_id) : ""
    const goalTemplateId =
      options && (options.goalTemplateId || options.goal_template_id)
        ? String(options.goalTemplateId || options.goal_template_id)
        : ""
    const goalCustom = options && options.goalCustom ? String(options.goalCustom) : ""

    if (categoryId || goalTemplateId || goalCustom) {
      this.setData({
        categoryId: categoryId || this.data.categoryId,
        goalTemplateId: goalTemplateId || "",
        goalCustom: goalCustom || "",
      })
    }

    if (sessionId) {
      this.loadSession(sessionId)
      return
    }
    this.createSession({
      categoryId: categoryId || this.data.categoryId,
      goalTemplateId,
      goalCustom,
    })
  },

  onUnload() {
    this.stopEvents = true
    try {
      if (this.streamTask && typeof this.streamTask.abort === "function") this.streamTask.abort()
    } catch (_err) {}
    try {
      if (this.audioCtx) this.audioCtx.destroy()
    } catch {}
  },

  withBuildHeader(header = {}) {
    const next = { ...(header || {}) }
    next["X-Client-Build"] = BUILD_ID
    next["x-client-build"] = BUILD_ID
    return next
  },

  requestWithBuild(opts = {}) {
    return request({
      ...opts,
      header: this.withBuildHeader((opts && opts.header) || {}),
    })
  },

  buildAuthHeaders(extra = {}) {
    const token = getAccessToken()
    const deviceId = getDeviceId()
    return this.withBuildHeader({
      Authorization: token ? `Bearer ${token}` : "",
      "x-device-id": deviceId || "",
      ...(extra || {}),
    })
  },

  async refreshAuthOnce(scene = "") {
    try {
      await loginSilent()
      console.warn("[voice-coach] 401 recovered", { scene, build_id: BUILD_ID })
      return true
    } catch (err) {
      console.warn("[voice-coach] 401 refresh failed", {
        scene,
        build_id: BUILD_ID,
        err_msg: err && err.errMsg ? err.errMsg : "",
      })
      return false
    }
  },

  handleLoginExpired(scene = "", opts = {}) {
    if (opts && opts.stopPolling) {
      this.stopEvents = true
    }
    if (this.hasShownLoginExpiredToast) return
    this.hasShownLoginExpiredToast = true
    console.warn("[voice-coach] login expired", { scene, build_id: BUILD_ID })
    wx.showToast({ title: "登录失效，请重新登录", icon: "none" })
  },

  getNextPollDelay(hasEvents, ok, source = "poll") {
    if (hasEvents) {
      if (this.pollBackoffMs) {
        console.log("[voice-coach] poll backoff reset", { source, build_id: BUILD_ID })
      }
      this.pollBackoffMs = 0
      return 0
    }

    const prev = Number(this.pollBackoffMs || 0) || 0
    const next = prev > 0 ? Math.min(POLL_BACKOFF_MAX_MS, prev * 2) : POLL_BACKOFF_BASE_MS
    this.pollBackoffMs = next
    console.log("[voice-coach] poll backoff", {
      source,
      reason: ok ? "no_events" : "request_failed",
      next_delay_ms: next,
      build_id: BUILD_ID,
    })
    return next
  },

  notifyRecordSubmitted() {
    try {
      wx.vibrateShort({ type: "light" })
    } catch (_err) {}
    console.log("[voice-coach] record submitted feedback", { build_id: BUILD_ID })
  },

  recordUiFeedbackMetric(uiFeedbackMs, extra = {}) {
    const ms = Math.max(0, Number(uiFeedbackMs || 0) || 0)
    const samples = Array.isArray(this.uiFeedbackSamples) ? this.uiFeedbackSamples.slice() : []
    samples.push(ms)
    while (samples.length > 80) samples.shift()
    this.uiFeedbackSamples = samples
    const p95 = calcPercentile(samples, 95)

    const payload = {
      build_id: BUILD_ID,
      ui_feedback_ms: ms,
      ui_feedback_p95_ms: p95,
      sample_size: samples.length,
      ...extra,
    }
    console.log("[voice-coach][metric] ui_feedback", payload)
    track("voicecoach_ui_feedback", {
      sessionId: this.data.sessionId || "",
      ...payload,
    })
  },

  async createSession(createOpts = {}) {
    const startedAt = Date.now()
    this.sessionCreatedAt = startedAt
    this.setData({ loading: true })
    try {
      const token = getAccessToken()
      if (!token) {
        await loginSilent()
      } else if (shouldWarmupLogin(token)) {
        try {
          await loginSilent()
        } catch (_err) {}
      }

      const categoryId = String(createOpts.categoryId || this.data.categoryId || "sale")
      const goalTemplateId = String(createOpts.goalTemplateId || this.data.goalTemplateId || "")
      const goalCustom = String(createOpts.goalCustom || this.data.goalCustom || "").trim()

      const reqData = {
        category_id: categoryId,
      }
      if (goalTemplateId) reqData.goal_template_id = goalTemplateId
      if (goalCustom) reqData.goal_custom = goalCustom

      const res = await this.requestWithBuild({
        baseUrl: API_BASE_URL,
        url: "/api/voice-coach/sessions",
        method: "POST",
        data: reqData,
      })

      const first = normalizeTurn({
        turn_id: res.first_customer_turn.turn_id,
        line_id: res.first_customer_turn.line_id || null,
        intent_id: res.first_customer_turn.intent_id || null,
        angle_id: res.first_customer_turn.angle_id || null,
        reply_source: "fixed",
        role: "customer",
        status: "audio_ready",
        text: res.first_customer_turn.text,
        emotion: res.first_customer_turn.emotion,
        audio_url: res.first_customer_turn.audio_url,
        audio_seconds: res.first_customer_turn.audio_seconds,
      })

      this.setData({
        sessionId: res.session_id,
        categoryId: (res.scenario && res.scenario.category_id) || categoryId || "sale",
        recommendation: res.recommendation || null,
        turns: [first],
        eventCursor: 0,
        loading: false,
        waitingCustomer: false,
        scrollIntoView: `turn-${first.id}`,
      })

      track("voicecoach_enter", {
        sessionId: res.session_id,
        categoryId: (res.scenario && res.scenario.category_id) || categoryId || "sale",
        createSessionMs: Date.now() - startedAt,
        firstTurnSource:
          (res && res.first_customer_turn && res.first_customer_turn.first_turn_source) || (first.audio_url ? "unknown" : "text_only"),
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
      const res = await this.requestWithBuild({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}`,
        method: "GET",
      })
      const turns = (res.turns || []).map(normalizeTurn)
      const last = turns[turns.length - 1]
      const waitingCustomer = turns.some((t) => t.role === "beautician" && t.pending)
      this.setData({
        sessionId,
        categoryId:
          (res && res.session && (res.session.category_id || (res.session.scenario && res.session.scenario.id))) || this.data.categoryId,
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
    this.pollBackoffMs = 0
    this.streamBuffer = ""
    this.pollEventsLoop()
  },

  async pollEventsLoop() {
    while (!this.stopEvents && this.data.sessionId) {
      const streamResult = await this.pollEventsStreamOnce()
      const pollResult = streamResult.usedStream ? streamResult : await this.pollEventsOnce()
      if (this.stopEvents || (pollResult && pollResult.unauthorized)) break

      const delayMs = this.getNextPollDelay(
        Boolean(pollResult && pollResult.hasEvents),
        Boolean(pollResult && pollResult.ok),
        streamResult.usedStream ? "stream" : "short_poll",
      )
      if (delayMs > 0) await sleep(delayMs)
    }

    this.pollingEvents = false
  },

  async pollEventsOnce() {
    const sessionId = this.data.sessionId
    const cursor = Number(this.data.eventCursor || 0) || 0
    if (!sessionId) {
      return { usedStream: false, ok: false, hasEvents: false, unauthorized: false }
    }
    const timeoutMs = Math.max(1200, Math.min(2600, 1200 + Number(this.pollBackoffMs || 0)))

    try {
      const res = await this.requestWithBuild({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/events?cursor=${cursor}&timeout_ms=${timeoutMs}`,
        method: "GET",
      })
      if (this.stopEvents) {
        return { usedStream: false, ok: true, hasEvents: false, unauthorized: false }
      }

      const events = res && Array.isArray(res.events) ? res.events : []
      const hasEvents = events.length > 0

      if (hasEvents) {
        this.applyServerEvents(events)
      }

      const nextCursor = Number(res && res.next_cursor ? res.next_cursor : cursor) || cursor
      if (nextCursor !== cursor) {
        this.setData({ eventCursor: nextCursor })
      }
      return { usedStream: false, ok: true, hasEvents, unauthorized: false }
    } catch (err) {
      if (err && Number(err.statusCode || 0) === 401) {
        this.handleLoginExpired("events_poll", { stopPolling: true })
        return { usedStream: false, ok: false, hasEvents: false, unauthorized: true }
      }
      return { usedStream: false, ok: false, hasEvents: false, unauthorized: false }
    }
  },

  async pollEventsStreamOnce(retried401 = false) {
    if (this.streamEventsDisabled) {
      return { usedStream: false, ok: false, hasEvents: false, unauthorized: false }
    }
    const sessionId = this.data.sessionId
    if (!sessionId) {
      return { usedStream: false, ok: false, hasEvents: false, unauthorized: false }
    }
    const cursor = Number(this.data.eventCursor || 0) || 0
    const result = await new Promise((resolve) => {
      let resolved = false
      let streamUsable = true
      let unauthorized = false
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
        resolve({
          usedStream: true,
          ok: Boolean(ok),
          hasEvents: Boolean(firstEventReceived),
          unauthorized: Boolean(unauthorized),
        })
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
        header: this.buildAuthHeaders(),
        success: (res) => {
          if (res.statusCode === 401) {
            unauthorized = true
            streamUsable = false
          } else if (res.statusCode === 404 || res.statusCode === 405) {
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

    if (!result.unauthorized) return result
    if (!retried401) {
      const refreshed = await this.refreshAuthOnce("events_stream")
      if (refreshed) {
        return this.pollEventsStreamOnce(true)
      }
    }
    this.handleLoginExpired("events_stream", { stopPolling: true })
    return {
      usedStream: true,
      ok: false,
      hasEvents: false,
      unauthorized: true,
    }
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
        this.setData({ waitingCustomer: !data.reached_max_turns })
      } else if (type === "beautician.asr_ready" && turnId) {
        this.markTurnLatency(turnId, "asr_ready", {
          stageElapsedMs,
          asrProvider: data.asr_provider || "",
          asrFallbackUsed: Boolean(data.asr_fallback_used),
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
        const textReadyAt = Date.now()
        const parentTurnId = String(data.beautician_turn_id || "")
        if (parentTurnId) {
          this.markTurnLatency(parentTurnId, "customer_text_ready", {
            customerTurnId: turnId,
            stageElapsedMs,
          })
        }
        const updated = this.patchTurn(turnId, {
          status: "text_ready",
          pending: false,
          text: String(data.text || ""),
          emotion: String(data.emotion || ""),
          line_id: data.line_id || null,
          intent_id: data.intent_id || null,
          angle_id: data.angle_id || null,
          reply_source: data.reply_source || null,
          audio_url: null,
          showText: true,
          ttsFailed: false,
        })
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              line_id: data.line_id || null,
              intent_id: data.intent_id || null,
              angle_id: data.angle_id || null,
              reply_source: data.reply_source || null,
              role: "customer",
              status: "text_ready",
              text: data.text || "",
              emotion: data.emotion || "",
            }),
          )
        }
        this.setData({ waitingCustomer: true }, () => {
          this.recordUiFeedbackMetric(Math.max(0, Date.now() - textReadyAt), {
            turn_id: turnId,
            stage: "customer_text_ready",
            has_audio: false,
          })
        })
      } else if (type === "customer.audio_ready" && turnId) {
        const parentTurnId = String(data.beautician_turn_id || "")
        if (parentTurnId) {
          this.markTurnLatency(parentTurnId, "customer_audio_ready", {
            customerTurnId: turnId,
            stageElapsedMs,
            ttsFailed: Boolean(data.tts_failed),
          })
        }
        if (!data.audio_url || data.tts_failed) {
          this.notifyTtsFallback()
          this.patchTurn(turnId, {
            status: "text_ready",
            pending: false,
            showText: true,
            ttsFailed: true,
          })
          this.setData({ waitingCustomer: false })
        } else {
          const existingIdx = this.findTurnIndex(turnId)
          const keepShowText =
            existingIdx >= 0 && this.data.turns && this.data.turns[existingIdx]
              ? Boolean(this.data.turns[existingIdx].showText)
              : false
          const seconds = Number(data.audio_seconds || 0) || 0
          const updated = this.patchTurn(turnId, {
            status: "audio_ready",
            pending: false,
            audio_url: data.audio_url,
            audio_seconds: seconds || null,
            audio_seconds_text: formatSeconds(seconds),
            voice_width_rpx: voiceWidthRpx(seconds || 3),
            line_id: data.line_id || null,
            intent_id: data.intent_id || null,
            angle_id: data.angle_id || null,
            reply_source: data.reply_source || null,
            showText: keepShowText,
            ttsFailed: false,
          })
          if (!updated) {
            this.appendTurn(
              normalizeTurn({
                turn_id: turnId,
                line_id: data.line_id || null,
                intent_id: data.intent_id || null,
                angle_id: data.angle_id || null,
                reply_source: data.reply_source || null,
                role: "customer",
                status: "audio_ready",
                text: data.text || "",
                audio_url: data.audio_url,
                audio_seconds: seconds || null,
              }),
            )
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
          analysisLoading: false,
        })
        this.turnLatency.delete(turnId)
      } else if (type === "turn.error") {
        if (turnId) {
          this.patchTurn(turnId, { pending: false, status: "error", analysisLoading: false })
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
    const latestCustomer = this.isLatestCustomerTurn(turnId)
    if (latestCustomer) this.setData({ waitingCustomer: true })
    this.patchTurn(turnId, {
      status: "text_ready",
      showText: true,
      ttsFailed: false,
    })

    try {
      const res = await this.requestWithBuild({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/turns/${turnId}/tts`,
        method: "POST",
        data: {},
      })

      if (!res || res.error) {
        this.patchTurn(turnId, {
          status: "text_ready",
          showText: true,
          ttsFailed: true,
        })
        if (latestCustomer) this.setData({ waitingCustomer: false })
        return
      }
      if (!res.audio_url || res.tts_failed) {
        this.patchTurn(turnId, {
          status: "text_ready",
          showText: true,
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
        showText: false,
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
        showText: true,
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
      await this.requestWithBuild({
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
      await this.requestWithBuild({
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
    if (!frame || !this.data.recording) return
    const frameBuffer = frame.frameBuffer
    if (!(frameBuffer instanceof ArrayBuffer)) return
    if (frameBuffer.byteLength < 256) return

    this.recordFrameCount = Number(this.recordFrameCount || 0) + 1

    let energyHit = false
    try {
      const bytes = new Uint8Array(frameBuffer)
      const step = Math.max(1, Math.floor(bytes.length / 64))
      let energy = 0
      let samples = 0
      for (let i = 0; i < bytes.length; i += step) {
        energy += Math.abs(bytes[i] - 128)
        samples += 1
      }
      const avg = samples > 0 ? energy / samples : 0
      if (avg > 9) energyHit = true
    } catch (_err) {}

    if (energyHit) {
      this.recordEnergyFrames = Number(this.recordEnergyFrames || 0) + 1
    }
  },

  onRecordStart(e) {
    if (this.data.recording) return
    if (this.data.loading) return
    if (this.data.waitingCustomer) return
    if (!this.data.sessionId) return
    this.recordTouchStartY = 0
    const startTouchY = Number(
      (e && e.touches && e.touches[0] && e.touches[0].clientY) ||
        (e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) ||
        0,
    )

    const start = (touchY = 0) => {
      this.recordTouchStartY = Number(touchY || 0)
      this.recordIntent = "send"
      this.recordEnergyFrames = 0
      this.recordFrameCount = 0
      this.recordStartedAt = Date.now()
      this.setData({ recording: true, recordCanceling: false, recordingPreviewText: "录音中..." })
      try {
        if (this.audioCtx) this.audioCtx.stop()
        this.setData({ playingTurnId: "" })
      } catch {}

      try {
        const baseOptions = {
          duration: 30000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 64000,
          frameSize: 16,
        }
        const candidates = [
          { ...baseOptions, format: "mp3", audioSource: "voice_recognition" },
          { ...baseOptions, format: "wav", audioSource: "voice_recognition" },
          { ...baseOptions, format: "aac", audioSource: "voice_recognition" },
          { ...baseOptions, format: "mp3" },
          { ...baseOptions, format: "wav" },
          { ...baseOptions, format: "aac" },
        ]

        let started = false
        let startError = null
        for (let i = 0; i < candidates.length; i++) {
          const opts = candidates[i]
          try {
            this.recorder.start(opts)
            started = true
            this.lastRecordMeta = {
              format: String(opts.format || "unknown"),
              sampleRate: Number(opts.sampleRate || 16000) || 16000,
              channels: Number(opts.numberOfChannels || 1) || 1,
            }
            console.log("[voice-coach] recorder start", {
              build_id: BUILD_ID,
              record_format: this.lastRecordMeta.format,
              record_sample_rate: this.lastRecordMeta.sampleRate,
              record_channels: this.lastRecordMeta.channels,
              attempt: i + 1,
            })
            break
          } catch (err) {
            startError = err
            console.warn("[voice-coach] recorder start fallback", {
              build_id: BUILD_ID,
              record_format: String(opts.format || "unknown"),
              attempt: i + 1,
            })
          }
        }
        if (!started) throw startError || new Error("recorder_start_failed")
      } catch (_err) {
        this.recordStartedAt = 0
        this.setData({ recording: false, recordingPreviewText: "" })
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
          success: () => start(startTouchY),
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
      fail: () => start(startTouchY),
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
    this.setData({
      recording: false,
      recordCanceling: false,
      loading: true,
      recordingPreviewText: "已发送，正在识别...",
    })
    this.notifyRecordSubmitted()
    try {
      this.recorder.stop()
    } catch (_err) {
      this.recordStartedAt = 0
      this.setData({ loading: false, recordingPreviewText: "" })
      wx.showToast({ title: "录音停止失败", icon: "none" })
    }
  },

  onRecordCancel() {
    if (!this.data.recording) return
    this.recordIntent = "cancel"
    this.recordStartedAt = 0
    this.setData({ recording: false, recordCanceling: false, loading: false, recordingPreviewText: "" })
    try {
      this.recorder.stop()
    } catch {}
  },

  uploadBeauticianTurn(filePath, durationSec, timingInput = {}) {
    const sessionId = this.data.sessionId
    const replyToTurnId = this.getLastCustomerTurnId()
    if (!replyToTurnId) {
      this.setData({ loading: false, recordingPreviewText: "" })
      wx.showToast({ title: "缺少顾客对话", icon: "none" })
      return
    }
    const recordMs = Math.max(0, Number((timingInput && timingInput.recordMs) || 0) || 0)
    const recordFormat = String(
      (timingInput && timingInput.recordFormat) || detectAudioFormatFromPath(filePath, "unknown"),
    ).toLowerCase()
    const recordSampleRate = Number((timingInput && timingInput.recordSampleRate) || 16000) || 16000
    const recordChannels = Number((timingInput && timingInput.recordChannels) || 1) || 1

    const localTurn = makeLocalBeauticianTurn(filePath, durationSec)
    this.pendingLocalTurnId = localTurn.id
    const clientAttemptId = makeClientAttemptId()
    const submitStartedAt = Date.now()
    const submitTiming = {
      build_id: BUILD_ID,
      session_id: sessionId || "",
      client_attempt_id: clientAttemptId,
      record_ms: recordMs,
      record_format: recordFormat,
      record_sample_rate: recordSampleRate,
      record_channels: recordChannels,
      upload_ms: 0,
      submit_ack_ms: 0,
    }
    this.startTurnLatency(localTurn.id, { clientAttemptId })
    this.appendTurn(localTurn)
    track("voicecoach_turn_submit", {
      sessionId,
      role: "beautician",
      clientAttemptId,
      build_id: BUILD_ID,
      record_ms: recordMs,
      record_format: recordFormat,
      record_sample_rate: recordSampleRate,
      record_channels: recordChannels,
      audioSeconds: durationSec || 0,
    })

    const clearPendingLocalTurn = () => {
      if (this.pendingLocalTurnId) this.turnLatency.delete(this.pendingLocalTurnId)
      const turns = (this.data.turns || []).filter((t) => t.id !== this.pendingLocalTurnId)
      this.pendingLocalTurnId = ""
      this.setData({ turns })
    }

    const failSubmit = (message = "上传失败") => {
      this.setData({ loading: false, waitingCustomer: false, recordingPreviewText: "" })
      wx.showToast({ title: message, icon: "none" })
      clearPendingLocalTurn()
    }

    const uploadOnce = async (retried401 = false) => {
      const uploadStartedAt = Date.now()
      wx.uploadFile({
        url: `${API_BASE_URL}/api/voice-coach/sessions/${sessionId}/beautician-turn/submit`,
        filePath,
        name: "audio",
        formData: {
          reply_to_turn_id: replyToTurnId,
          client_audio_seconds: String(durationSec || ""),
          client_attempt_id: clientAttemptId,
          audio_format: recordFormat || "unknown",
          sample_rate: String(recordSampleRate),
          channels: String(recordChannels),
        },
        header: this.buildAuthHeaders(),
        success: (res) => {
          ;(async () => {
            const uploadCost = Math.max(0, Date.now() - uploadStartedAt)
            submitTiming.upload_ms += uploadCost

            if (Number(res && res.statusCode) === 401) {
              if (!retried401) {
                const refreshed = await this.refreshAuthOnce("submit_upload")
                if (refreshed) {
                  uploadOnce(true)
                  return
                }
              }
              this.handleLoginExpired("submit_upload")
              failSubmit("登录失效，请重新登录")
              return
            }

            let payload = null
            try {
              payload = JSON.parse(res.data)
            } catch (_err) {
              payload = null
            }

            if (Number(res && res.statusCode) < 200 || Number(res && res.statusCode) >= 300) {
              failSubmit((payload && (payload.message || payload.error)) || "上传失败")
              return
            }

            if (!payload || payload.error || !payload.beautician_turn) {
              failSubmit((payload && (payload.message || payload.error)) || "上传失败")
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

            const totalSubmitMs = Math.max(0, Date.now() - submitStartedAt)
            submitTiming.submit_ack_ms = Math.max(0, totalSubmitMs - Number(submitTiming.upload_ms || 0))
            this.markTurnLatency(accepted.id, "submit_ack", {
              deduped: Boolean(payload.deduped),
              acceptedByServer: true,
              record_ms: submitTiming.record_ms,
              record_format: submitTiming.record_format,
              record_sample_rate: submitTiming.record_sample_rate,
              record_channels: submitTiming.record_channels,
              upload_ms: submitTiming.upload_ms,
              submit_ack_ms: submitTiming.submit_ack_ms,
              build_id: BUILD_ID,
            })

            track("voicecoach_submit_timing", {
              sessionId,
              clientAttemptId,
              build_id: BUILD_ID,
              record_ms: submitTiming.record_ms,
              record_format: submitTiming.record_format,
              record_sample_rate: submitTiming.record_sample_rate,
              record_channels: submitTiming.record_channels,
              upload_ms: submitTiming.upload_ms,
              submit_ack_ms: submitTiming.submit_ack_ms,
            })
            console.log("[voice-coach] submit timing", submitTiming)

            const nextCursor = Number(payload.next_cursor || 0) || 0
            this.setData({
              loading: false,
              waitingCustomer: !payload.reached_max_turns,
              recordingPreviewText: "",
              eventCursor: nextCursor > (this.data.eventCursor || 0) ? nextCursor : this.data.eventCursor,
            })
            this.ensureEventsPolling()
          })().catch(() => {
            failSubmit("上传失败")
          })
        },
        fail: () => {
          submitTiming.upload_ms += Math.max(0, Date.now() - uploadStartedAt)
          failSubmit("上传失败")
        },
      })
    }

    uploadOnce(false)
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

      if (!current.analysis && !current.pending) {
        this.setData({
          [`turns[${idx}].analysisLoading`]: true,
        })
        this.requestWithBuild({
          baseUrl: API_BASE_URL,
          url: `/api/voice-coach/sessions/${this.data.sessionId}/turns/${id}/analysis`,
          method: "POST",
          data: {},
        })
          .then((res) => {
            const turnIdx = this.findTurnIndex(id)
            if (turnIdx < 0) return
            this.setData({
              [`turns[${turnIdx}].analysis`]: (res && res.analysis) || null,
              [`turns[${turnIdx}].analysisLoading`]: false,
              [`turns[${turnIdx}].status`]: "analysis_ready",
            })
          })
          .catch((err) => {
            const turnIdx = this.findTurnIndex(id)
            if (turnIdx >= 0) {
              this.setData({
                [`turns[${turnIdx}].analysisLoading`]: false,
              })
            }
            wx.showToast({ title: (err && err.message) || "建议生成失败", icon: "none" })
          })
      }
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
      const res = await this.requestWithBuild({
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
    this.requestWithBuild({
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

    const doPlay = (src) => {
      try {
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
