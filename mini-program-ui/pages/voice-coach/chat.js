const { VOICE_COACH_HTTP_BASE_URL, VOICE_COACH_WS_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")
const { track } = require("../../utils/track")
const { VoiceCoachWsClient } = require("../../utils/ws-client")
const { AudioStreamPlayer } = require("../../utils/audio-stream-player")
const {
  appendOrMergeTurn,
  dedupeTurns,
  patchTurnById,
  renameTurnId,
  replaceTurnById,
} = require("./turn-list")
const {
  shouldUseRealtimeTransport,
  shouldSkipEnsureEventsPolling,
  shouldBlockRecordingForHttpFallback,
  canAutoPlayTurn,
  resolveCustomerTurnIndex,
  shouldAutoPlayLatestCustomerTurn,
} = require("./realtime-turn-policy")

const TURN_PENDING_STATUSES = {
  accepted: true,
  processing: true,
}

// Preview ASR currently uses short chunks with flash endpoint, which is not a compatible path.
// Keep it disabled by default until realtime streaming ASR is enabled.
const CLIENT_ASR_PREVIEW_ENABLED = false
const VC_TAG = "[vc]"

function formatSeconds(seconds) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return ""
  return `${Math.round(n)}''`
}

function previewText(text, maxLen = 48) {
  const value = String(text || "").replace(/\s+/g, " ").trim()
  if (!value) return ""
  if (value.length <= maxLen) return value
  return `${value.slice(0, maxLen)}...`
}

function voiceWidthRpx(seconds) {
  const s = Math.max(1, Math.min(60, Number(seconds || 0) || 1))
  const min = 180
  const max = 420
  const w = min + (max - min) * (Math.log1p(s) / Math.log1p(60))
  return Math.round(w)
}

var DIMENSION_WEIGHTS = {
  persuasion: { name: '说服力', w: 0.3 },
  fluency: { name: '流利度', w: 0.2 },
  expression: { name: '表达', w: 0.2 },
  pronunciation: { name: '发音', w: 0.15 },
  organization: { name: '组织', w: 0.15 },
}

function parsePerTurnScores(perTurnScores) {
  if (!perTurnScores || typeof perTurnScores !== 'object') return null
  var scores = []
  var totalS = 0
  var dims = ['persuasion', 'fluency', 'expression', 'pronunciation', 'organization']
  for (var i = 0; i < dims.length; i++) {
    var id = dims[i]
    var meta = DIMENSION_WEIGHTS[id]
    var rawScore = perTurnScores[id]
    var s = typeof rawScore === 'number' && isFinite(rawScore)
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : 65
    var level = s >= 80 ? 'good' : s >= 60 ? 'fair' : 'weak'
    scores.push({ id: id, name: meta.name, score: s, pct: s, level: level })
    totalS += s * meta.w
  }
  return { scores: scores, totalScore: Math.round(totalS), hasScores: true }
}

function isPendingByStatus(status) {
  const key = String(status || "").trim()
  return Boolean(TURN_PENDING_STATUSES[key])
}

function normalizeHighlightSeverity(input) {
  var raw = String(input || '').trim().toLowerCase()
  if (raw === 'warning') return 'warn'
  if (raw === 'danger') return 'bad'
  if (raw === 'warn' || raw === 'bad' || raw === 'info') return raw
  return 'info'
}

function buildHighlightedSegments(text, highlights) {
  if (!text || !Array.isArray(highlights) || !highlights.length) return []

  // 统一为 {start, end, label, severity} 格式
  var searchFrom = 0
  var normalized = highlights.map(function(h) {
    if (typeof h.start === 'number' && typeof h.end === 'number') {
      return {
        start: h.start,
        end: h.end,
        label: h.label || '',
        severity: normalizeHighlightSeverity(h.severity),
      }
    }
    // WS 格式: {text, severity} → 查找位置
    if (typeof h.text === 'string') {
      var idx = text.indexOf(h.text, searchFrom)
      if (idx < 0) idx = text.indexOf(h.text)
      if (idx < 0) return null
      searchFrom = idx + h.text.length
      return {
        start: idx,
        end: idx + h.text.length,
        label: h.label || '',
        severity: normalizeHighlightSeverity(h.severity),
      }
    }
    return null
  }).filter(Boolean).sort(function(a, b) { return a.start - b.start })

  if (!normalized.length) return []

  var segments = []
  var pos = 0
  for (var i = 0; i < normalized.length; i++) {
    var h = normalized[i]
    var start = Math.max(pos, Math.max(0, h.start))
    var end = Math.min(text.length, Math.max(start, h.end))
    if (end <= pos) continue
    if (start > pos) segments.push({ text: text.slice(pos, start), highlighted: false })
    segments.push({ text: text.slice(start, end), highlighted: true, severity: h.severity, label: h.label || '' })
    pos = end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlighted: false })
  return segments
}

function enrichAnalysisForTurn(turnText, analysisPayload) {
  if (!analysisPayload || typeof analysisPayload !== "object") return null
  var analysis = Object.assign({}, analysisPayload)
  if (analysis.highlights && analysis.highlights.length && turnText) {
    analysis.highlightedSegments = buildHighlightedSegments(turnText, analysis.highlights)
  }
  return analysis
}

function normalizeTurn(raw) {
  const role = raw.role === "beautician" ? "beautician" : "customer"
  const status = String(raw.status || "")
  const hasAudio = Boolean(raw.audio_url || raw.audioUrl || raw.audio_path)
  const audioSeconds = Number(raw.audio_seconds || raw.audioSeconds || 0) || 0
  const turnIndex = Number(raw.turn_index)
  const pending = typeof raw.pending === "boolean" ? raw.pending : isPendingByStatus(status)
  const text = String(raw.text || "")
  const ttsFailed = Boolean(raw.tts_failed || raw.ttsFailed)
  const showPendingCustomerVoice = role === "customer" && !hasAudio && text && !ttsFailed
  const precomputedWidth = Number(raw.voice_width_rpx || raw.voiceWidthRpx || 0) || 0
  const precomputedSecondsText = String(raw.audio_seconds_text || raw.audioSecondsText || "")
  const showPendingBeauticianVoice =
    role === "beautician" &&
    pending &&
    !hasAudio &&
    (audioSeconds > 0 || precomputedWidth > 0 || Boolean(precomputedSecondsText))
  const displaySeconds = hasAudio
    ? audioSeconds
    : showPendingCustomerVoice
      ? estimateRealtimeAudioSeconds(text)
      : showPendingBeauticianVoice
        ? Math.max(1, audioSeconds || 1)
        : 0
  const showTextDefault = role === "customer" ? false : !(hasAudio || showPendingBeauticianVoice)
  const audioSecondsText = precomputedSecondsText || (displaySeconds > 0 ? formatSeconds(displaySeconds) : "")
  const voiceWidth =
    precomputedWidth || ((hasAudio || showPendingCustomerVoice || showPendingBeauticianVoice) ? voiceWidthRpx(displaySeconds || 1) : 0)
  const analysis = enrichAnalysisForTurn(text, raw.analysis || raw.analysis_json || null)
  const scoreData = analysis && analysis.per_turn_scores ? parsePerTurnScores(analysis.per_turn_scores) : null

  return {
    id: raw.id || raw.turn_id,
    turn_index: Number.isFinite(turnIndex) ? turnIndex : null,
    role,
    status,
    text,
    emotion: raw.emotion || "",
    audio_url: raw.audio_url || null,
    audio_seconds: audioSeconds || null,
    audio_seconds_text: audioSecondsText,
    voice_width_rpx: voiceWidth,
    analysis,
    analysisLoading: false,
    analysisError: "",
    ttsFailed,
    showSuggestions: false,
    showText: showTextDefault,
    textOpenedOnce: false,
    pending,
    ...(scoreData || {}),
  }
}

function vcLog(stage, meta = {}) {
  try {
    console.info(VC_TAG, stage, normalizeLogMeta(meta))
  } catch (_err) {}
}

function vcWarn(stage, meta = {}) {
  try {
    console.warn(VC_TAG, stage, normalizeLogMeta(meta))
  } catch (_err) {}
}

function vcError(stage, meta = {}) {
  try {
    console.error(VC_TAG, stage, normalizeLogMeta(meta))
  } catch (_err) {}
}

function makeRealtimeTurnId(role) {
  return `rt_${role}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function estimateRealtimeAudioSeconds(text) {
  const raw = String(text || "").replace(/\s+/g, "")
  if (!raw) return 3
  return Math.max(2, Math.min(18, Math.round(raw.length / 4)))
}

function normalizeLogMetaValue(value) {
  if (typeof value === "undefined" || value === null) return ""
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (Array.isArray(value)) return value.map((item) => normalizeLogMetaValue(item))
  if (Object.prototype.toString.call(value) === "[object Object]") {
    const normalized = {}
    Object.keys(value).forEach((key) => {
      normalized[key] = normalizeLogMetaValue(value[key])
    })
    return normalized
  }
  return value
}

function normalizeLogMeta(meta) {
  if (!meta || typeof meta !== "object") return {}
  const normalized = {}
  Object.keys(meta).forEach((key) => {
    normalized[key] = normalizeLogMetaValue(meta[key])
  })
  return normalized
}

function buildPendingCustomerVoiceUi(text, seconds) {
  const fallbackSeconds = Number(seconds || 0) || estimateRealtimeAudioSeconds(text)
  return {
    audio_seconds_text: formatSeconds(fallbackSeconds),
    voice_width_rpx: voiceWidthRpx(fallbackSeconds),
  }
}

function buildRecordingBeauticianVoiceUi(seconds) {
  const fallbackSeconds = Math.max(1, Number(seconds || 0) || 1)
  return {
    status: "accepted",
    pending: true,
    audio_seconds: fallbackSeconds,
    audio_seconds_text: formatSeconds(fallbackSeconds),
    voice_width_rpx: voiceWidthRpx(fallbackSeconds),
    showText: false,
    ttsFailed: false,
  }
}

function buildPendingBeauticianVoiceUi(filePath, seconds) {
  const fallbackSeconds = Math.max(1, Number(seconds || 0) || 1)
  return {
    status: "accepted",
    pending: true,
    audio_url: filePath || null,
    audio_seconds: fallbackSeconds,
    audio_seconds_text: formatSeconds(fallbackSeconds),
    voice_width_rpx: voiceWidthRpx(fallbackSeconds),
    showText: false,
    ttsFailed: false,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeClientAttemptId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `mp_${Date.now()}_${rand}`
}

const MIN_REALTIME_AUDIO_SECONDS = 3
const UI_FX_SEND_SRC = "/assets/audio/voicecoach-send.wav"

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
    hintLoading: false,
    hintLoadingTurnId: "",
    hintText: "",
    hintPoints: [],
    scrollIntoView: "",
    playingTurnId: "",
    downloadingTurnId: "",
    recordingPreviewText: "",
    recordCanceling: false,
    realtimeEnabled: false,
    realtimeConnected: false,
    realtimeConnecting: false,
    initialPromptOverlayVisible: false,
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
    this.uiFxAudioCtx = null
    this._uiFxReady = false
    try {
      this.uiFxAudioCtx = wx.createInnerAudioContext()
    } catch (_err) {
      this.uiFxAudioCtx = null
    }
    if (this.uiFxAudioCtx) {
      try {
        this.uiFxAudioCtx.autoplay = false
        this.uiFxAudioCtx.loop = false
        this.uiFxAudioCtx.obeyMuteSwitch = true
        this.uiFxAudioCtx.src = UI_FX_SEND_SRC
        this._uiFxReady = true
      } catch (_err) {
        this._uiFxReady = false
      }
    }
    this._audioOptionConfiguredAt = 0
    this._activeAudioTurnId = ""
    this._initialCustomerTurnId = ""
    this._initialCustomerAudioUrl = ""
    this._initialCustomerPromptCompleted = false
    this._initialCustomerPromptArmed = false
    this._playbackGeneration = 0
    this._activeAudioGeneration = 0
    this._activeAudioOwner = ""
    this._activeAudioReason = ""
    this._manualPlayActive = false
    this._manualPlayTurnId = ""
    this._manualPlayStartedAt = 0
    this._ignoreManualPlayUntil = 0
    this._deferredAutoPlayTurn = null
    this._initialPromptFailSafeTimer = null
    this._isDevtools = false
    try {
      const systemInfo =
        wx && typeof wx.getSystemInfoSync === "function" ? wx.getSystemInfoSync() : null
      this._isDevtools = String((systemInfo && systemInfo.platform) || "").toLowerCase() === "devtools"
    } catch (_err) {
      this._isDevtools = false
    }
    this.configureAudioOutput("on_load")
    this.audioCtx.onPlay(() => {
      this._activeAudioStartedAt = Date.now()
      vcLog("audio.ctx.play", {
        turnId: this._activeAudioTurnId || this.data.playingTurnId || "",
        owner: this._activeAudioOwner || "",
        reason: this._activeAudioReason || "",
        generation: this._activeAudioGeneration || 0,
        manual: this._manualPlayActive,
        speakerOnRequested: true,
        volume:
          this.audioCtx && typeof this.audioCtx.volume === "number" ? this.audioCtx.volume : null,
        duration:
          this.audioCtx && typeof this.audioCtx.duration === "number" ? this.audioCtx.duration : null,
        paused: this.audioCtx ? Boolean(this.audioCtx.paused) : null,
        src:
          this.audioCtx && this.audioCtx.src
            ? String(this.audioCtx.src).slice(0, 96)
            : "",
      })
    })
    this.audioCtx.onEnded(() => {
      const endedTurnId = this._activeAudioTurnId || ""
      const endedOwner = this._activeAudioOwner || ""
      const endedInitialPrompt = Boolean(
        endedTurnId &&
          endedTurnId === this._initialCustomerTurnId &&
          this._initialCustomerPromptArmed,
      )
      if (this._activeAudioGeneration !== this._playbackGeneration) {
        vcWarn("audio.ended:stale-gen", {
          generation: this._activeAudioGeneration,
          currentGeneration: this._playbackGeneration,
        })
        return
      }
      if (endedInitialPrompt) {
        this._initialCustomerPromptCompleted = true
      }
      this.clearInitialPromptFailSafeTimer()
      vcLog("audio.ctx.ended", {
        turnId: endedTurnId,
        owner: endedOwner,
        initialPromptCompleted: this._initialCustomerPromptCompleted,
      })
      this._initialCustomerPromptArmed = false
      this._activeAudioTurnId = ""
      this._activeAudioOwner = ""
      this._activeAudioReason = ""
      this.setData({ playingTurnId: "" })
      if (endedOwner === "manual" && endedTurnId && endedTurnId === this._manualPlayTurnId) {
        this.clearManualPlayActive("ended")
      }
      this.flushDeferredAutoPlay(endedInitialPrompt ? "initial_prompt_ended" : "audio_ended")
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
    this.autoPlayCooldownByTurnId = new Map()
    this.pendingAudioDownloads = new Map()
    this._activeAudioStartedAt = 0
    this.turnLatency = new Map()
    this.sessionCreatedAt = 0
    this.previewDisabled = !CLIENT_ASR_PREVIEW_ENABLED
    this.previewInFlight = false
    this.lastPreviewAt = 0
    this.recordingChunkSeq = 0
    this.recordTouchStartY = 0
    this._wsClient = null
    this._audioPlayer = null
    this._realtimeMode = false
    this._realtimeTurnIndex = 0
    this._wsManualClose = false
    this._realtimeFrameCount = 0
    this._realtimeBinaryCount = 0
    this._currentBeauticianTurnId = ""
    this._currentCustomerTurnId = ""
    this._pendingHttpSubmit = null
    this._realtimePendingAudio = null
    this._realtimeCustomerText = ""
    this._realtimeCustomerEmotion = "neutral"
    this._realtimeCustomerAudioPath = ""
    this._realtimeCustomerAudioReady = false
    this._realtimeCustomerAudioSeconds = 0
    this._lastAsrPartialText = ""
    this._recordTransportActive = false
    this._recordPressActive = false
    this._lastBargeInAt = 0
    this._lastRecordFrameAt = 0
    this._recordingStartedAt = 0
    this._recordingDraftLastSecond = 0
    this._recordingDraftTimer = null
    this._pageHidden = false
    this._pageHiddenAt = 0
    this._httpFallbackTurnActive = false
    this._httpFallbackExpectedReplyToTurnId = ""
    this._httpFallbackStartedAt = 0
    this._httpFallbackBeauticianTurnId = ""
    this._httpFallbackCustomerTurnId = ""
    this._hintInFlight = false
    this._hintInFlightTurnId = ""
    this._forceEventsPollingPromise = null
    this._suggestRefreshPromises = new Map()

    if (this.uiFxAudioCtx && typeof this.uiFxAudioCtx.onError === "function") {
      this.uiFxAudioCtx.onError((err) => {
        vcWarn("uifx.send:error", {
          errMsg: err && err.errMsg ? err.errMsg : "",
          errCode: err && typeof err.errCode !== "undefined" ? err.errCode : "",
        })
      })
    }

    this.audioCtx.onError((err) => {
      this.clearInitialPromptFailSafeTimer()
      this._initialCustomerPromptArmed = false
      this._activeAudioOwner = ""
      this._activeAudioReason = ""
      this.clearManualPlayActive("audio_error")
      vcWarn("audio.ctx.error", {
        turnId: this._activeAudioTurnId || this.data.playingTurnId || "",
        errMsg: err && err.errMsg ? err.errMsg : "",
        errCode: err && typeof err.errCode !== "undefined" ? err.errCode : "",
      })
      if (this.hasShownAudioError) return
      this.hasShownAudioError = true
      wx.showToast({ title: "音频播放失败，请检查 downloadFile 合法域名", icon: "none" })
    })

    this.recorder.onStop((res) => {
      this._recordPressActive = false
      this.recordTouchStartY = 0
      if (this.recordIntent === "cancel") {
        this.recordIntent = ""
        this.discardRecordingBeauticianDraft("cancel")
        this.resetRecorderUiState()
        this.setData({ loading: false, waitingCustomer: false })
        return
      }
      this.recordIntent = ""
      const durationSec = res && res.duration ? Math.round(res.duration / 1000) : 0
      if (!res || !res.tempFilePath) {
        this.cancelRealtimeAudio("record_stop_empty")
        this.discardRecordingBeauticianDraft("empty")
        this.resetRecorderUiState()
        wx.showToast({ title: "录音失败", icon: "none" })
        this.setData({ loading: false, waitingCustomer: false })
        vcWarn("record.stop:empty", {})
        return
      }
      if (!durationSec || durationSec < 1) {
        this.cancelRealtimeAudio("too_short")
        this.discardRecordingBeauticianDraft("too_short")
        this.resetRecorderUiState()
        wx.showToast({ title: "录音太短，请至少说 1 秒", icon: "none" })
        this.setData({ loading: false, waitingCustomer: false })
        vcWarn("record.stop:too-short", { durationSec })
        return
      }
      this.setData({ recordCanceling: false, recordingPreviewText: "" })
      if (this._recordingDraftTimer) {
        clearInterval(this._recordingDraftTimer)
        this._recordingDraftTimer = null
      }
      this.refreshRecordingBeauticianDraft(durationSec)
      this._recordingStartedAt = 0
      this._recordingDraftLastSecond = durationSec
      this.ensureLocalBeauticianTurn(res.tempFilePath, durationSec, {
        turnIndex: this._realtimeMode ? this._realtimeTurnIndex : this.getNextTurnIndex(),
      })
      const stopAt = Date.now()
      const tryUpload = () => {
        const sinceLastFrame = this._lastRecordFrameAt ? Date.now() - this._lastRecordFrameAt : 9999
        const waitedMs = Date.now() - stopAt
        if (sinceLastFrame < 140 && waitedMs < 520) {
          setTimeout(tryUpload, 50)
          return
        }
        void this.uploadBeauticianTurn(res.tempFilePath, durationSec)
      }
      // Wait for trailing MP3 frame callbacks to settle before emitting audio.end.
      setTimeout(tryUpload, 120)
    })

    this.recorder.onError((error) => {
      this.recordIntent = ""
      this.cancelRealtimeAudio("recorder_error")
      this.discardRecordingBeauticianDraft("recorder_error")
      this.resetRecorderUiState()
      this.setData({ loading: false, waitingCustomer: false })
      vcWarn("record.error", {
        errMsg: error && error.errMsg ? error.errMsg : "",
      })
      wx.showToast({ title: "录音异常，请重试", icon: "none" })
    })

    if (typeof this.recorder.onFrameRecorded === "function") {
      this.recorder.onFrameRecorded((frame) => {
        this.onRecordFrame(frame)
      })
    }

    const sessionId = options && options.sessionId ? String(options.sessionId) : ""
    vcLog("page.load", {
      sessionIdFromOptions: sessionId || "",
      hasRecorder: Boolean(this.recorder),
      hasFrameHook: typeof this.recorder.onFrameRecorded === "function",
      isDevtools: this._isDevtools,
    })
    if (sessionId) {
      this.loadSession(sessionId)
      return
    }
    this.createSession()
  },

  onUnload() {
    vcLog("page.unload", {
      sessionId: this.data.sessionId || "",
      stopEvents: this.stopEvents,
      hasStreamTask: Boolean(this.streamTask),
      realtimeMode: this._realtimeMode,
    })
    this.stopEvents = true
    this._wsManualClose = true
    this.clearInitialPromptFailSafeTimer()
    if (this._suggestScrollTimer) clearTimeout(this._suggestScrollTimer)
    if (this._suggestScrollInnerTimer) clearTimeout(this._suggestScrollInnerTimer)
    try {
      if (this.streamTask && typeof this.streamTask.abort === "function") this.streamTask.abort()
    } catch (_err) {}
    this.cleanupRealtimeTransport()
    try {
      if (this.audioCtx) this.audioCtx.destroy()
    } catch {}
    try {
      if (this.uiFxAudioCtx) this.uiFxAudioCtx.destroy()
    } catch {}
  },

  onHide() {
    this._pageHidden = true
    this._pageHiddenAt = Date.now()
    vcLog("page.hide", {
      sessionId: this.data.sessionId || "",
      recording: this.data.recording,
      playingTurnId: this.data.playingTurnId || "",
    })
    if (this.data.recording || this._recordTransportActive) {
      this.recordIntent = "cancel"
      this.cancelRealtimeAudio("page_hide")
      try {
        this.recorder.stop()
      } catch (_err) {}
    }
    this.resetRecorderUiState()
    try {
      if (this.audioCtx) this.audioCtx.stop()
    } catch (_err) {}
    try {
      if (this.uiFxAudioCtx) this.uiFxAudioCtx.stop()
    } catch (_err) {}
    try {
      if (this._audioPlayer) this._audioPlayer.stop()
    } catch (_err) {}
    this.clearInitialPromptFailSafeTimer()
    this.setData({ playingTurnId: "" })
    this.clearManualPlayActive("page_hide")
  },

  onShow() {
    vcLog("page.show", {
      sessionId: this.data.sessionId || "",
      hiddenMs: this._pageHiddenAt ? Date.now() - this._pageHiddenAt : 0,
      realtimeMode: this._realtimeMode,
    })
    this._pageHidden = false
    this.resetRecorderUiState()
    this.configureAudioOutput("on_show")
    if (!this._realtimeMode && !this.stopEvents && this.data.sessionId) {
      this.ensureEventsPolling()
    }
  },

  async createSession() {
    const startedAt = Date.now()
    this.sessionCreatedAt = startedAt
    this.setData({ loading: true })
    vcLog("session.create:start", { scenarioId: "objection_safety" })
    try {
      const res = await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: "/api/voice-coach/sessions",
        method: "POST",
        data: { scenario_id: "objection_safety" },
      })

      const first = normalizeTurn({
        turn_id: res.first_customer_turn.turn_id,
        turn_index: res.first_customer_turn.turn_index,
        role: "customer",
        status: res.first_customer_turn.audio_url ? "audio_ready" : "text_ready",
        text: res.first_customer_turn.text,
        emotion: res.first_customer_turn.emotion,
        audio_url: res.first_customer_turn.audio_url,
        audio_seconds: res.first_customer_turn.audio_seconds,
      })

      this.setData({
        sessionId: res.session_id,
        turns: dedupeTurns([first]),
        eventCursor: 0,
        loading: false,
        waitingCustomer: false,
        scrollIntoView: `turn-${first.id}`,
        initialPromptOverlayVisible: false,
      })
      this._initialCustomerTurnId = first.id
      this._initialCustomerAudioUrl = first.audio_url || ""
      this._initialCustomerPromptCompleted = false
      this._initialCustomerPromptArmed = false

      track("voicecoach_enter", {
        sessionId: res.session_id,
        createSessionMs: Date.now() - startedAt,
      })
      vcLog("session.create:ok", {
        sessionId: res.session_id,
        firstTurnId: res.first_customer_turn && res.first_customer_turn.turn_id ? res.first_customer_turn.turn_id : "",
        firstText: res.first_customer_turn && res.first_customer_turn.text ? res.first_customer_turn.text : "",
        hasAudio: Boolean(res.first_customer_turn && res.first_customer_turn.audio_url),
        audioSource: res.first_customer_turn && res.first_customer_turn.audio_source ? res.first_customer_turn.audio_source : "",
        ttsPending: Boolean(res.first_customer_turn && res.first_customer_turn.tts_pending),
        createSessionMs: Date.now() - startedAt,
      })

      if (first.audio_url) {
        vcLog("initial.prompt:ready", {
          turnId: first.id,
          hasAudio: true,
        })
        this.playInitialCustomerPrompt(first.id, first.audio_url, {
          reason: "session_create_ready",
        })
      } else if (first.text) {
        this.requestTurnTts(first.id, {
          autoplay: false,
          initialPrompt: true,
        })
      } else if (res.first_customer_turn && res.first_customer_turn.tts_failed) {
        this.setData({ initialPromptOverlayVisible: false })
        this._initialCustomerPromptCompleted = true
        this.notifyTtsFallback()
      }
      const connected = await this.connectRealtime(res.session_id)
      if (!connected) {
        this.ensureEventsPolling()
      }
    } catch (err) {
      this.setData({ loading: false, waitingCustomer: false })
      vcError("session.create:error", {
        message: err && err.message ? err.message : "",
        statusCode: err && err.statusCode ? err.statusCode : 0,
      })
      wx.showToast({ title: err.message || "鍒涘缓浼氳瘽澶辫触", icon: "none" })
    }
  },

  async loadSession(sessionId) {
    this.setData({ loading: true })
    vcLog("session.load:start", { sessionId })
    try {
      const res = await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}`,
        method: "GET",
      })
      const turns = dedupeTurns((res.turns || []).map(normalizeTurn))
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
      vcLog("session.load:ok", {
        sessionId,
        turnCount: turns.length,
        waitingCustomer,
      })
      if (last && last.role === "customer" && last.text && !last.audio_url) {
        this.requestTurnTts(last.id, { autoplay: false })
      }
      const connected = await this.connectRealtime(sessionId)
      if (!connected) {
        this.ensureEventsPolling()
      }
    } catch (err) {
      this.setData({ loading: false })
      vcError("session.load:error", {
        sessionId,
        message: err && err.message ? err.message : "",
      })
      wx.showToast({ title: err.message || "鍔犺浇浼氳瘽澶辫触", icon: "none" })
    }
  },

  getBeauticianTurnCount() {
    return (this.data.turns || []).filter((turn) => turn && turn.role === "beautician").length
  },

  getNextTurnIndex() {
    const turns = Array.isArray(this.data.turns) ? this.data.turns : []
    let maxTurnIndex = -1

    turns.forEach((turn) => {
      const turnIndex = Number(turn && turn.turn_index)
      if (Number.isFinite(turnIndex) && turnIndex > maxTurnIndex) {
        maxTurnIndex = turnIndex
      }
    })

    if (maxTurnIndex >= 0) return maxTurnIndex + 1
    return turns.length
  },

  resetRealtimeDrafts() {
    this._currentBeauticianTurnId = ""
    this._currentCustomerTurnId = ""
    this._pendingHttpSubmit = null
    this._realtimePendingAudio = null
    this._realtimeCustomerText = ""
    this._realtimeCustomerEmotion = "neutral"
    this._realtimeCustomerAudioPath = ""
    this._realtimeCustomerAudioReady = false
    this._realtimeCustomerAudioSeconds = 0
    this._lastAsrPartialText = ""
    this._realtimeFrameCount = 0
    this._realtimeBinaryCount = 0
  },

  beginHttpFallbackTurn(replyToTurnId) {
    this._httpFallbackTurnActive = true
    this._httpFallbackExpectedReplyToTurnId = String(replyToTurnId || "")
    this._httpFallbackStartedAt = Date.now()
    this._httpFallbackBeauticianTurnId = ""
    this._httpFallbackCustomerTurnId = ""
  },

  clearHttpFallbackTurn(reason, meta = {}) {
    const wasActive = Boolean(
      this._httpFallbackTurnActive ||
        this._httpFallbackBeauticianTurnId ||
        this._httpFallbackCustomerTurnId ||
        this._httpFallbackExpectedReplyToTurnId,
    )
    this._httpFallbackTurnActive = false
    this._httpFallbackExpectedReplyToTurnId = ""
    this._httpFallbackStartedAt = 0
    this._httpFallbackBeauticianTurnId = ""
    this._httpFallbackCustomerTurnId = ""
    if (wasActive) {
      vcLog("ws.http-fallback:clear", {
        reason: reason || "",
        ...meta,
      })
    }
  },

  isHttpFallbackSatisfied() {
    if (!this._httpFallbackTurnActive) return true
    if (!this._httpFallbackCustomerTurnId) return false
    const idx = this.findTurnIndex(this._httpFallbackCustomerTurnId)
    if (idx < 0) return false
    const turn = this.data.turns[idx] || {}
    return Boolean((turn.text && String(turn.text).trim()) || turn.audio_url || turn.ttsFailed)
  },

  async forceEventsPollingOnce() {
    return this.pollEventsOnce(5000)
  },

  async forceEventsPollingLoop() {
    if (this._forceEventsPollingPromise) return this._forceEventsPollingPromise
    const sessionId = this.data.sessionId
    const startedAt = Date.now()
    this._forceEventsPollingPromise = (async () => {
      vcLog("events.force:start", {
        sessionId,
        replyToTurnId: this._httpFallbackExpectedReplyToTurnId || "",
      })

      while (!this.stopEvents && this.data.sessionId === sessionId && this._httpFallbackTurnActive) {
        const ok = await this.forceEventsPollingOnce()
        if (this.isHttpFallbackSatisfied()) break
        if (Date.now() - startedAt >= 25000) break
        if (!ok) {
          await sleep(120)
        }
      }

      if (this._httpFallbackTurnActive && !this.isHttpFallbackSatisfied()) {
        vcWarn("events.force:timeout", {
          sessionId,
          waitedMs: Date.now() - startedAt,
          beauticianTurnId: this._httpFallbackBeauticianTurnId || "",
          customerTurnId: this._httpFallbackCustomerTurnId || "",
        })
        this.clearHttpFallbackTurn("timeout")
        this.setData({
          loading: false,
          waitingCustomer: false,
        })
        wx.showToast({ title: "请稍后重试上一轮回复", icon: "none" })
        return
      }

      const finalBeauticianTurnId = this._httpFallbackBeauticianTurnId || ""
      const finalCustomerTurnId = this._httpFallbackCustomerTurnId || ""
      const finalCustomerTurn = finalCustomerTurnId ? this.getTurnById(finalCustomerTurnId) : null
      if (finalBeauticianTurnId || finalCustomerTurnId || this._httpFallbackExpectedReplyToTurnId) {
        this.clearHttpFallbackTurn("success", {
          beauticianTurnId: finalBeauticianTurnId,
          customerTurnId: finalCustomerTurnId,
        })
        if (finalCustomerTurn && finalCustomerTurn.text && !finalCustomerTurn.audio_url && !finalCustomerTurn.ttsFailed) {
          this.ensureEventsPolling(true)
        }
      }

      if (finalCustomerTurn && finalCustomerTurn.text) {
        this.setData({
          loading: false,
          waitingCustomer: false,
        })
      }

      vcLog("events.force:done", {
        sessionId,
        waitedMs: Date.now() - startedAt,
        customerTurnId: finalCustomerTurnId,
      })
    })().finally(() => {
      this._forceEventsPollingPromise = null
    })

    return this._forceEventsPollingPromise
  },

  cleanupRealtimeTransport() {
    try {
      if (this._wsClient) this._wsClient.disconnect()
    } catch (_err) {}
    try {
      if (this._audioPlayer) this._audioPlayer.stop()
    } catch (_err) {}
    this._wsClient = null
    this._audioPlayer = null
  },

  resetRecorderUiState(extra = {}) {
    this._recordTransportActive = false
    this._recordPressActive = false
    this._lastRecordFrameAt = 0
    if (this._recordingDraftTimer) {
      clearInterval(this._recordingDraftTimer)
      this._recordingDraftTimer = null
    }
    this._recordingStartedAt = 0
    this._recordingDraftLastSecond = 0
    this.recordTouchStartY = 0
    this.setData({
      recording: false,
      recordCanceling: false,
      recordingPreviewText: "",
      ...extra,
    })
  },

  configureAudioOutput(reason = "") {
    if (!wx || typeof wx.setInnerAudioOption !== "function") return
    const now = Date.now()
    if (reason !== "overlay_tap" && this._audioOptionConfiguredAt && now - this._audioOptionConfiguredAt < 1000) {
      return
    }
    this._audioOptionConfiguredAt = now
    try {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        speakerOn: true,
        mixWithOther: false,
        success: () => {
          vcLog("audio.option:ok", {
            reason: reason || "",
            speakerOn: true,
          })
        },
        fail: (err) => {
          vcWarn("audio.option:fail", {
            reason: reason || "",
            errMsg: err && err.errMsg ? err.errMsg : "",
          })
        },
      })
    } catch (err) {
      vcWarn("audio.option:error", {
        reason: reason || "",
        message: err && err.message ? err.message : "",
      })
    }
  },

  triggerRecordHaptic() {
    if (!wx || typeof wx.vibrateShort !== "function") return
    try {
      wx.vibrateShort({ type: "light" })
      vcLog("record.haptic:ok", {
        recording: Boolean(this.data.recording),
      })
    } catch (error) {
      vcWarn("record.haptic:error", {
        message: error && error.message ? error.message : "",
        errMsg: error && error.errMsg ? error.errMsg : "",
      })
    }
  },

  playSendEffect(reason = "") {
    if (!this.uiFxAudioCtx) return
    if (this._pageHidden) {
      vcWarn("uifx.send:skip", {
        reason: reason || "",
        skipReason: "page_hidden",
        src: UI_FX_SEND_SRC,
      })
      return
    }
    try {
      if (!this.uiFxAudioCtx.src) {
        this.uiFxAudioCtx.src = UI_FX_SEND_SRC
      }
      this.uiFxAudioCtx.stop()
    } catch (_err) {}
    try {
      if (typeof this.uiFxAudioCtx.seek === "function") {
        this.uiFxAudioCtx.seek(0)
      }
    } catch (_err) {}
    try {
      this.uiFxAudioCtx.play()
      vcLog("uifx.send:play", {
        reason: reason || "",
        src: UI_FX_SEND_SRC,
      })
    } catch (error) {
      vcWarn("uifx.send:error", {
        reason: reason || "",
        message: error && error.message ? error.message : "",
        errMsg: error && error.errMsg ? error.errMsg : "",
      })
    }
  },

  setManualPlayActive(turnId, reason = "") {
    this._manualPlayActive = true
    this._manualPlayTurnId = String(turnId || "")
    this._manualPlayStartedAt = Date.now()
    vcLog("audio.manual:lock", {
      turnId: this._manualPlayTurnId,
      reason: reason || "",
    })
  },

  clearManualPlayActive(reason = "") {
    if (!this._manualPlayActive && !this._manualPlayTurnId) return
    vcLog("audio.manual:clear", {
      turnId: this._manualPlayTurnId || "",
      reason: reason || "",
    })
    this._manualPlayActive = false
    this._manualPlayTurnId = ""
    this._manualPlayStartedAt = 0
  },

  clearInitialPromptFailSafeTimer() {
    if (!this._initialPromptFailSafeTimer) return
    clearTimeout(this._initialPromptFailSafeTimer)
    this._initialPromptFailSafeTimer = null
  },

  armInitialPromptFailSafe(turnId, reason = "") {
    this.clearInitialPromptFailSafeTimer()
    if (!this._isDevtools) return
    const turn = this.getTurnById(turnId)
    const seconds = Number((turn && turn.audio_seconds) || 0) || 0
    const delayMs = Math.max(6000, Math.min(15000, Math.round(seconds * 1000) + 2500 || 9000))
    this._initialPromptFailSafeTimer = setTimeout(() => {
      this._initialPromptFailSafeTimer = null
      if (this._initialCustomerPromptCompleted) return
      if (String(this._activeAudioTurnId || "") !== String(turnId || "")) return
      if (String(this._activeAudioOwner || "") !== "initial") return
      vcWarn("initial.prompt:timeout-release", {
        turnId: String(turnId || ""),
        delayMs,
        reason: reason || "",
        isDevtools: this._isDevtools,
      })
      this._initialCustomerPromptCompleted = true
      this._initialCustomerPromptArmed = false
      this._activeAudioTurnId = ""
      this._activeAudioOwner = ""
      this._activeAudioReason = ""
      try {
        if (this.audioCtx) this.audioCtx.stop()
      } catch (_err) {}
      this.setData({ playingTurnId: "" })
    }, delayMs)
  },

  isInitialPromptBlockingAutoPlay(turnId) {
    const id = String(turnId || "")
    return Boolean(
      id &&
        this._initialCustomerTurnId &&
        id !== String(this._initialCustomerTurnId) &&
        this._initialCustomerPromptArmed &&
        this._activeAudioTurnId === this._initialCustomerTurnId,
    )
  },

  queueDeferredAutoPlay(turn, reason = "") {
    if (!turn || !turn.id || !turn.audio_url) return
    this._deferredAutoPlayTurn = {
      id: String(turn.id),
      role: String(turn.role || ""),
      audio_url: String(turn.audio_url || ""),
    }
    vcWarn("audio.autoplay:defer", {
      turnId: String(turn.id),
      reason: reason || "",
    })
  },

  flushDeferredAutoPlay(reason = "") {
    const deferred = this._deferredAutoPlayTurn
    if (!deferred || !deferred.id || !deferred.audio_url) return
    if (this._pageHidden || this.data.recording || this._recordTransportActive) return
    if (this._manualPlayActive) return
    if (this.isInitialPromptBlockingAutoPlay(deferred.id)) return
    this._deferredAutoPlayTurn = null
    vcLog("audio.autoplay:resume", {
      turnId: deferred.id,
      reason: reason || "",
    })
    this.autoPlayTurn(deferred)
  },

  playInitialCustomerPrompt(turnId, audioUrl, extra = {}) {
    if (!turnId || !audioUrl) return
    this.configureAudioOutput(extra.reason || "initial_prompt")
    this.armInitialPromptFailSafe(turnId, extra.reason || "initial_prompt")
    vcLog("initial.prompt:play", {
      turnId,
      source: /^https?:\/\//.test(audioUrl) ? "remote" : "local",
      reason: extra.reason || "",
    })
    this.setData({ initialPromptOverlayVisible: false })
    this.playAudio(turnId, audioUrl, {
      autoplay: false,
      owner: "initial",
      reason: extra.reason || "initial_prompt",
      role: "customer",
      markInitialPromptComplete: true,
    })
  },

  onTapStartPractice() {
    const turnId = String(this._initialCustomerTurnId || "")
    const initialTurn = this.getTurnById(turnId)
    const audioUrl = String(
      this._initialCustomerAudioUrl ||
        (initialTurn && initialTurn.audio_url) ||
        "",
    )

    if (!turnId || !initialTurn) return
    if (initialTurn.ttsFailed) {
      this._initialCustomerPromptCompleted = true
      this.setData({ initialPromptOverlayVisible: false })
      wx.showToast({ title: "顾客语音不可用，可直接开始练习", icon: "none" })
      return
    }
    if (!audioUrl) {
      wx.showToast({ title: "顾客语音生成中", icon: "none" })
      return
    }
    this._initialCustomerAudioUrl = audioUrl
    this._initialCustomerPromptCompleted = false
    this._ignoreManualPlayUntil = Date.now() + 1200
    this.playInitialCustomerPrompt(turnId, audioUrl, {
      reason: "overlay_tap",
    })
  },

  cancelRealtimeAudio(reason) {
    this._recordTransportActive = false
    if (!this._realtimeMode || !this._wsClient || !this._wsClient.isConnected()) return
    try {
      this._wsClient.sendJson({ type: "audio.cancel" })
      vcLog("ws.audio.cancel", {
        reason: reason || "",
      })
    } catch (_err) {}
  },

  sendRealtimeAudioCancel(reason) {
    this.cancelRealtimeAudio(reason)
  },

  fallbackPendingAudioToHttp(reason) {
    const pending = this._realtimePendingAudio
    if (!pending || !pending.filePath) return false

    const durationSec = Number(pending.durationSec || 0) || 0
    const replyToTurnId = String(pending.replyToTurnId || this.getLastCustomerTurnId() || "")
    vcWarn("ws.retry:http", {
      reason: reason || "",
      audioSeconds: durationSec,
      frameCount: this._realtimeFrameCount,
    })

    this.cancelRealtimeAudio(reason || "realtime_retry_http")
    this.resetRealtimeAttemptState(reason || "realtime_retry_http")
    this.beginHttpFallbackTurn(replyToTurnId)
    void this.uploadBeauticianTurn(pending.filePath, durationSec, {
      forceHttp: true,
      replyToTurnIdOverride: replyToTurnId,
    })
    return true
  },

  buildRealtimeCustomerPatch(filePath, options = {}) {
    const text = this._realtimeCustomerText || ""
    const seconds = this._realtimeCustomerAudioSeconds || estimateRealtimeAudioSeconds(text)
    const patch = {
      turn_index: this._realtimeTurnIndex + 1,
      status: "audio_ready",
      pending: false,
      audio_url: filePath,
      audio_seconds: seconds,
      audio_seconds_text: formatSeconds(seconds),
      voice_width_rpx: voiceWidthRpx(seconds),
      showText: false,
      ttsFailed: false,
      text,
      emotion: this._realtimeCustomerEmotion || "neutral",
    }
    if (!options.includeTurnIndex) {
      delete patch.turn_index
    }
    return patch
  },

  buildRealtimeBeauticianPatch(filePath, durationSec) {
    const seconds = Number(durationSec || 0) || 0
    return {
      turn_index: this._realtimeTurnIndex,
      status: "asr_ready",
      pending: false,
      audio_url: filePath || null,
      audio_seconds: seconds || null,
      audio_seconds_text: formatSeconds(seconds),
      voice_width_rpx: filePath ? voiceWidthRpx(seconds || 1) : 0,
      showText: false,
      ttsFailed: false,
    }
  },

  ensureLocalBeauticianTurn(filePath, durationSec, options = {}) {
    const seconds = Math.max(1, Number(durationSec || 0) || 1)
    const pendingTurnIndex = Number.isFinite(Number(options.turnIndex))
      ? Number(options.turnIndex)
      : this.getNextTurnIndex()
    const currentTurnId = String(this._currentBeauticianTurnId || "")
    const currentTurn = currentTurnId
      ? (this.data.turns || []).find((turn) => String((turn && turn.id) || "") === currentTurnId)
      : null
    const patch = Object.assign(
      {
        turn_index: pendingTurnIndex,
        text: currentTurn && currentTurn.text ? currentTurn.text : "",
      },
      buildPendingBeauticianVoiceUi(filePath, seconds),
    )

    if (currentTurn && currentTurn.pending) {
      this.patchTurn(currentTurnId, patch)
      return currentTurnId
    }

    const localTurnId = makeRealtimeTurnId("beautician")
    this._currentBeauticianTurnId = localTurnId
    this.appendTurn(
      normalizeTurn(
        Object.assign(
          {
            turn_id: localTurnId,
            role: "beautician",
          },
          patch,
        ),
      ),
    )
    return localTurnId
  },

  startRecordingBeauticianDraft(turnIndex) {
    const pendingTurnIndex = Number.isFinite(Number(turnIndex)) ? Number(turnIndex) : this.getNextTurnIndex()
    const turnId = this.ensureLocalBeauticianTurn("", 1, {
      turnIndex: pendingTurnIndex,
    })
    this._recordingStartedAt = Date.now()
    this._recordingDraftLastSecond = 1
    if (this._recordingDraftTimer) {
      clearInterval(this._recordingDraftTimer)
    }
    this._recordingDraftTimer = setInterval(() => {
      this.refreshRecordingBeauticianDraft()
    }, 300)
    return turnId
  },

  refreshRecordingBeauticianDraft(forceSeconds) {
    const turnId = String(this._currentBeauticianTurnId || "")
    if (!turnId) return
    const turn = this.getTurnById(turnId)
    if (!turn || turn.role !== "beautician" || !turn.pending) return
    const elapsedMs = this._recordingStartedAt ? Date.now() - this._recordingStartedAt : 0
    const seconds = Math.max(1, Number(forceSeconds || 0) || Math.round(elapsedMs / 1000) || 1)
    if (!forceSeconds && seconds === this._recordingDraftLastSecond) return
    this._recordingDraftLastSecond = seconds
    this.patchTurn(
      turnId,
      Object.assign(
        {
          turn_index: Number.isFinite(Number(turn.turn_index)) ? Number(turn.turn_index) : this.getNextTurnIndex(),
          text: turn.text || "",
        },
        buildRecordingBeauticianVoiceUi(seconds),
      ),
    )
  },

  discardRecordingBeauticianDraft(reason) {
    const turnId = String(this._currentBeauticianTurnId || "")
    if (this._recordingDraftTimer) {
      clearInterval(this._recordingDraftTimer)
      this._recordingDraftTimer = null
    }
    this._recordingStartedAt = 0
    this._recordingDraftLastSecond = 0
    if (turnId && /^rt_/.test(turnId)) {
      this.removeTurn(turnId)
      this.turnLatency.delete(turnId)
      vcWarn("record.draft:discard", {
        turnId,
        reason: reason || "",
      })
    }
    this._currentBeauticianTurnId = ""
  },

  attachRealtimeCustomerAudio(filePath) {
    if (!filePath) return
    this._realtimeCustomerAudioPath = filePath
    this._realtimeCustomerAudioReady = true
    if (!this._currentCustomerTurnId) return
    this.patchTurn(this._currentCustomerTurnId, this.buildRealtimeCustomerPatch(filePath))
  },

  createRealtimeAudioPlayer() {
    return new AudioStreamPlayer({
      onSentenceStart: (sentenceIndex) => {
        const turnId = this._currentCustomerTurnId || ""
        if (!turnId) return
        this.setData({ playingTurnId: turnId })
        vcLog("tts.playback:sentence_start", {
          turnId,
          sentenceIndex: Number(sentenceIndex || 0) || 0,
        })
      },
      onSentenceEnd: (sentenceIndex) => {
        vcLog("tts.playback:sentence_end", {
          turnId: this._currentCustomerTurnId || "",
          sentenceIndex: Number(sentenceIndex || 0) || 0,
        })
      },
      onCombinedReady: (filePath) => {
        vcLog("tts.combined:ready", {
          turnId: this._currentCustomerTurnId || "",
          hasFile: Boolean(filePath),
        })
        this.attachRealtimeCustomerAudio(filePath)
      },
      onDone: () => {
        vcLog("tts.playback:done", {
          turnId: this._currentCustomerTurnId || "",
        })
        if (this.data.playingTurnId === (this._currentCustomerTurnId || "")) {
          this.setData({ playingTurnId: "" })
        }
        this.setData({ loading: false, waitingCustomer: false })
      },
      onError: (error) => {
        vcError("tts.playback:error", {
          message: error && error.message ? error.message : "audio_playback_error",
        })
        if (this.data.playingTurnId === (this._currentCustomerTurnId || "")) {
          this.setData({ playingTurnId: "" })
        }
      },
    })
  },

  async connectRealtime(sessionId) {
    if (!sessionId || this.stopEvents) return false
    this._wsManualClose = false
    this.cleanupRealtimeTransport()
    this.resetRealtimeDrafts()
    const token = getAccessToken()
    this._realtimeTurnIndex = this.getNextTurnIndex()
    this.setData({
      realtimeEnabled: true,
      realtimeConnected: false,
      realtimeConnecting: true,
    })
    vcLog("ws.connect:start", {
      sessionId,
      hasToken: Boolean(token),
      turnIndex: this._realtimeTurnIndex,
    })

    this._audioPlayer = this.createRealtimeAudioPlayer()
    const client = new VoiceCoachWsClient(VOICE_COACH_WS_BASE_URL, sessionId, token, { timeoutMs: 10000 })
    this._wsClient = client

    client.onOpen(() => {
      this._realtimeMode = true
      this.setData({
        realtimeEnabled: true,
        realtimeConnected: true,
        realtimeConnecting: false,
      })
      vcLog("ws.connect:open", { sessionId })
    })
    client.onReconnecting((meta) => {
      this.setData({
        realtimeEnabled: true,
        realtimeConnected: false,
        realtimeConnecting: true,
      })
      vcWarn("ws.connect:reconnecting", {
        sessionId,
        attempt: meta && meta.attempt ? meta.attempt : 0,
      })
    })
    client.onMessage((msg) => this.handleWsMessage(msg))
    client.onBinary((payload) => this.handleWsBinary(payload))
    client.onError((error) => {
      vcWarn("ws.error", {
        message: error && error.message ? error.message : "",
      })
    })
    client.onClose((evt) => {
      this.setData({
        realtimeConnected: false,
        realtimeConnecting: false,
      })
      vcWarn("ws.close", {
        code: evt && evt.code ? evt.code : 0,
        reason: evt && evt.reason ? evt.reason : "",
        manual: this._wsManualClose,
      })
      if (this._wsManualClose || this.stopEvents) return
      if (evt && evt.permanent === false) return
      this.fallbackToHttp("ws_close")
    })

    try {
      await client.connect()
      return true
    } catch (error) {
      vcWarn("ws.connect:failed", {
        message: error && error.message ? error.message : "",
      })
      this.fallbackToHttp("connect_failed")
      return false
    }
  },

  fallbackToHttp(reason) {
    vcWarn("ws.fallback:http", { reason: reason || "" })
    this.clearHttpFallbackTurn("fallback_to_http", { reason: reason || "" })
    this._realtimeMode = false
    this._wsManualClose = true
    this.cleanupRealtimeTransport()
    this.setData({
      realtimeEnabled: false,
      realtimeConnected: false,
      realtimeConnecting: false,
      recordingPreviewText: "",
    })
    if (!this.stopEvents) {
      this.ensureEventsPolling()
    }
  },

  ensureEventsPolling(force = false) {
    if (
      !force &&
      shouldSkipEnsureEventsPolling({
        realtimeMode: this._realtimeMode,
        realtimeConnecting: this.data.realtimeConnecting,
        httpFallbackTurnActive: this._httpFallbackTurnActive,
      })
    ) {
      vcLog("events.ensure:skip", {
        sessionId: this.data.sessionId || "",
        realtimeMode: this._realtimeMode,
        realtimeConnecting: this.data.realtimeConnecting,
        httpFallbackTurnActive: this._httpFallbackTurnActive,
      })
      return
    }
    if (this.pollingEvents || this.stopEvents) return
    if (!this.data.sessionId) return
    vcLog("events.ensure", {
      sessionId: this.data.sessionId || "",
      pollingEvents: this.pollingEvents,
      stopEvents: this.stopEvents,
    })
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

  async pollEventsOnce(timeoutMs = 1200) {
    const sessionId = this.data.sessionId
    const cursor = Number(this.data.eventCursor || 0) || 0
    if (!sessionId) return false

    try {
      const res = await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/events?cursor=${cursor}&timeout_ms=${timeoutMs}`,
        method: "GET",
      })
      if (this.stopEvents) return true

      if (res && Array.isArray(res.events) && res.events.length) {
        vcLog("events.poll:ok", {
          cursor,
          eventCount: res.events.length,
          nextCursor: Number(res && res.next_cursor ? res.next_cursor : cursor) || cursor,
        })
        this.applyServerEvents(res.events)
      }

      const nextCursor = Number(res && res.next_cursor ? res.next_cursor : cursor) || cursor
      if (nextCursor !== cursor) {
        this.setData({ eventCursor: nextCursor })
      }
      return true
    } catch (_err) {
      vcWarn("events.poll:error", {
        cursor,
        message: _err && _err.message ? _err.message : "",
      })
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
        vcLog("events.stream:complete", {
          usable: ok,
          firstEventReceived,
          firstChunkReceived,
        })
        resolve(ok)
      }

      vcLog("events.stream:start", {
        sessionId,
        cursor,
        hasToken: Boolean(token),
      })

      const markChunk = (text) => {
        if (!text) return
        const consumed = this.consumeStreamText(text)
        if (consumed.hasEvents) {
          firstEventReceived = true
        }
        if (consumed.useful && !firstChunkReceived) {
          firstChunkReceived = true
          this.streamNoChunkCount = 0
          vcLog("events.stream:first-chunk", { cursor })
        }
      }

      const task = wx.request({
        url: `${VOICE_COACH_HTTP_BASE_URL}/api/voice-coach/sessions/${sessionId}/events/stream?cursor=${cursor}&timeout_ms=22000`,
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
        vcWarn("events.stream:disable", {
          reason: "watchdog",
          waitingCustomer: this.data.waitingCustomer,
        })
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
        vcWarn("events.stream:disable", {
          reason: "no_event",
          waitingCustomer: this.data.waitingCustomer,
        })
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

  getTurnById(turnId) {
    const idx = this.findTurnIndex(turnId)
    if (idx < 0) return null
    return this.data.turns[idx] || null
  },

  getTurnIndexValue(turnId) {
    const turn = this.getTurnById(turnId)
    const turnIndex = Number(turn && turn.turn_index)
    return Number.isFinite(turnIndex) ? turnIndex : null
  },

  getLastTurnByRole(role) {
    const targetRole = String(role || "")
    const turns = Array.isArray(this.data.turns) ? this.data.turns : []
    let candidate = null
    let candidateIndex = -1

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]
      if (!turn || String(turn.role || "") !== targetRole) continue
      const turnIndex = Number(turn.turn_index)
      if (!candidate) {
        candidate = turn
        candidateIndex = i
        continue
      }
      const candidateTurnIndex = Number(candidate.turn_index)
      if (Number.isFinite(turnIndex) && !Number.isFinite(candidateTurnIndex)) {
        candidate = turn
        candidateIndex = i
        continue
      }
      if (Number.isFinite(turnIndex) && Number.isFinite(candidateTurnIndex) && turnIndex >= candidateTurnIndex) {
        candidate = turn
        candidateIndex = i
        continue
      }
      if (!Number.isFinite(turnIndex) && !Number.isFinite(candidateTurnIndex) && i > candidateIndex) {
        candidate = turn
        candidateIndex = i
      }
    }

    return candidate
  },

  isLatestCustomerTurn(turnId) {
    if (!turnId) return false
    const latestCustomerTurn = this.getLastTurnByRole("customer")
    return Boolean(latestCustomerTurn && latestCustomerTurn.id === turnId)
  },

  patchTurn(turnId, patch) {
    const result = patchTurnById(this.data.turns || [], turnId, patch)
    if (!result.updated) return false
    this.setData({ turns: result.turns })
    return true
  },

  findPendingBeauticianTurnId(turnIndex, excludeId = "") {
    const targetIndex = Number(turnIndex)
    const exclude = String(excludeId || "")
    const turns = Array.isArray(this.data.turns) ? this.data.turns : []

    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i]
      if (!turn || String(turn.role || "") !== "beautician" || !turn.pending) continue
      const turnId = String(turn.id || "")
      if (!turnId || turnId === exclude) continue
      if (Number.isFinite(targetIndex) && Number(turn.turn_index) !== targetIndex) continue
      return turnId
    }

    return ""
  },

  replaceTurn(turnId, turn) {
    const result = replaceTurnById(this.data.turns || [], turnId, turn)
    if (!result.updated) return false
    this.setData({
      turns: result.turns,
      scrollIntoView: `turn-${turn.id}`,
    })
    return true
  },

  appendTurn(turn) {
    const result = appendOrMergeTurn(this.data.turns || [], turn)
    this.setData({
      turns: result.turns,
      scrollIntoView: `turn-${turn.id}`,
    })
  },

  renameTurn(oldId, newId) {
    const result = renameTurnId(this.data.turns || [], oldId, newId)
    if (!result.updated) return false
    this.setData({
      turns: result.turns,
      scrollIntoView: `turn-${newId}`,
    })
    return true
  },

  removeTurn(turnId) {
    const id = String(turnId || "")
    if (!id) return false
    const nextTurns = dedupeTurns((this.data.turns || []).filter((turn) => String((turn && turn.id) || "") !== id))
    if (nextTurns.length === (this.data.turns || []).length) return false
    this.setData({ turns: nextTurns })
    return true
  },

  mergeSessionTurnsSnapshot(rawTurns) {
    const currentTurns = Array.isArray(this.data.turns) ? this.data.turns : []
    const currentById = Object.create(null)
    currentTurns.forEach((turn) => {
      if (!turn || !turn.id) return
      currentById[String(turn.id)] = turn
    })

    const nextTurns = dedupeTurns((rawTurns || []).map((rawTurn) => {
      const normalized = normalizeTurn(rawTurn)
      const current = currentById[String(normalized.id || "")] || null
      const nextTurn = current ? Object.assign({}, current, normalized) : normalized

      if (normalized.analysis) {
        nextTurn.analysis = enrichAnalysisForTurn(nextTurn.text || normalized.text || "", normalized.analysis)
        nextTurn.analysisLoading = false
        nextTurn.analysisError = ""
        if (nextTurn.analysis && nextTurn.analysis.per_turn_scores) {
          var scoreData = parsePerTurnScores(nextTurn.analysis.per_turn_scores)
          if (scoreData) Object.assign(nextTurn, scoreData)
        }
      } else if (current) {
        nextTurn.analysisLoading = Boolean(current.analysisLoading)
        nextTurn.analysisError = current.analysisError || ""
      }

      if (current) {
        nextTurn.showSuggestions = Boolean(current.showSuggestions)
        nextTurn.showText = Boolean(current.showText)
        nextTurn.textOpenedOnce = Boolean(current.textOpenedOnce)
      }

      return nextTurn
    }))

    this.setData({ turns: nextTurns })
    return nextTurns
  },

  async fetchSessionSnapshot() {
    const sessionId = String(this.data.sessionId || "")
    if (!sessionId) return null
    const res = await request({
      baseUrl: VOICE_COACH_HTTP_BASE_URL,
      url: `/api/voice-coach/sessions/${sessionId}`,
      method: "GET",
    })
    if (res && Array.isArray(res.turns)) {
      this.mergeSessionTurnsSnapshot(res.turns)
    }
    const nextCursor = Number(res && res.last_event_cursor ? res.last_event_cursor : this.data.eventCursor || 0) || 0
    if (nextCursor && nextCursor !== this.data.eventCursor) {
      this.setData({ eventCursor: nextCursor })
    }
    return res
  },

  async refreshSuggestionsForTurn(turnId, options = {}) {
    const id = String(turnId || "")
    if (!id) return false
    const turn = this.getTurnById(id)
    if (turn && turn.analysis) {
      this.patchTurn(id, { analysisLoading: false, analysisError: "" })
      return true
    }

    if (this._suggestRefreshPromises && this._suggestRefreshPromises.has(id)) {
      return this._suggestRefreshPromises.get(id)
    }

    const sessionId = String(this.data.sessionId || "")
    if (!sessionId) return false

    const waitMs = Number(options.waitMs || 9000) || 9000
    const startedAt = Date.now()
    const promise = (async () => {
      vcLog("suggest.refresh:start", {
        turnId: id,
        sessionId,
        realtimeMode: this._realtimeMode,
      })
      this.patchTurn(id, { analysisLoading: true, analysisError: "" })

      while (Date.now() - startedAt < waitMs) {
        const current = this.getTurnById(id)
        if (current && current.analysis) {
          this.patchTurn(id, { analysisLoading: false, analysisError: "" })
          vcLog("suggest.refresh:ready", {
            turnId: id,
            via: "local",
          })
          return true
        }

        try {
          await this.pollEventsOnce(this._realtimeMode ? 1800 : 2400)
        } catch (_err) {}

        const afterEvents = this.getTurnById(id)
        if (afterEvents && afterEvents.analysis) {
          this.patchTurn(id, { analysisLoading: false, analysisError: "" })
          vcLog("suggest.refresh:ready", {
            turnId: id,
            via: "events",
          })
          return true
        }

        try {
          await this.fetchSessionSnapshot()
        } catch (_err) {}

        const afterSnapshot = this.getTurnById(id)
        if (afterSnapshot && afterSnapshot.analysis) {
          this.patchTurn(id, { analysisLoading: false, analysisError: "" })
          vcLog("suggest.refresh:ready", {
            turnId: id,
            via: "snapshot",
          })
          return true
        }

        await sleep(450)
      }

      this.patchTurn(id, {
        analysisLoading: false,
        analysisError: "timeout",
      })
      vcWarn("suggest.refresh:timeout", {
        turnId: id,
        waitedMs: Date.now() - startedAt,
      })
      return false
    })().finally(() => {
      if (this._suggestRefreshPromises) {
        this._suggestRefreshPromises.delete(id)
      }
    })

    this._suggestRefreshPromises.set(id, promise)
    return promise
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
    vcLog("events.apply", {
      count: Array.isArray(events) ? events.length : 0,
      currentCursor: this.data.eventCursor || 0,
    })

    for (let i = 0; i < events.length; i++) {
      const ev = events[i] || {}
      const eventId = Number(ev.id || 0) || 0
      if (eventId && eventId <= latestCursor) continue

      const type = String(ev.type || "")
      const data = ev && typeof ev.data === "object" && ev.data ? ev.data : {}
      const turnId = String(data.turn_id || ev.turn_id || "")
      const stageElapsedMs = Number(ev.stage_elapsed_ms || data.stage_elapsed_ms || 0) || null

      if (type === "turn.accepted" && turnId) {
        vcLog("ev.turn.accepted", {
          turnId,
          stageElapsedMs,
          jobId: data.job_id || ev.job_id || "",
        })
        if (this._pendingHttpSubmit && this._pendingHttpSubmit.clientAttemptId) {
          this.moveTurnLatency(this._pendingHttpSubmit.clientAttemptId, turnId)
        }
        this.markTurnLatency(turnId, "accepted", {
          stageElapsedMs,
          jobId: data.job_id || ev.job_id || "",
        })
        const acceptedPatch = {
          status: "accepted",
          pending: true,
          audio_url: data.audio_url || null,
          audio_seconds: Number(data.audio_seconds || 0) || null,
          audio_seconds_text: formatSeconds(Number(data.audio_seconds || 0) || 0),
        }
        const acceptedTurnIndex = Number(data.turn_index)
        if (Number.isFinite(acceptedTurnIndex)) {
          acceptedPatch.turn_index = acceptedTurnIndex
        }
        let updated = this.patchTurn(turnId, acceptedPatch)
        if (!updated && Number.isFinite(acceptedTurnIndex)) {
          const draftTurnId = this.findPendingBeauticianTurnId(acceptedTurnIndex, turnId)
          if (draftTurnId) {
            this.moveTurnLatency(draftTurnId, turnId)
            const renamed = this.renameTurn(draftTurnId, turnId)
            if (renamed) {
              updated = this.patchTurn(turnId, acceptedPatch)
            }
          }
        }
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              role: "beautician",
              status: "accepted",
              turn_index: data.turn_index,
              audio_url: data.audio_url || null,
              audio_seconds: Number(data.audio_seconds || 0) || null,
              pending: true,
            }),
          )
        }
        this.setData({ waitingCustomer: !data.reached_max_turns })
      } else if (type === "beautician.asr_ready" && turnId) {
        vcLog("ev.beautician.asr_ready", {
          turnId,
          textLength: String(data.text || "").length,
          hasAudio: Boolean(data.audio_url),
        })
        if (this._pendingHttpSubmit && this._pendingHttpSubmit.clientAttemptId) {
          this.moveTurnLatency(this._pendingHttpSubmit.clientAttemptId, turnId)
        }
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
        const beauticianTurnIndex = Number(data.turn_index)
        if (Number.isFinite(beauticianTurnIndex)) {
          patch.turn_index = beauticianTurnIndex
        }

        let updated = this.patchTurn(turnId, patch)
        if (!updated && Number.isFinite(beauticianTurnIndex)) {
          const draftTurnId = this.findPendingBeauticianTurnId(beauticianTurnIndex, turnId)
          if (draftTurnId) {
            this.moveTurnLatency(draftTurnId, turnId)
            const renamed = this.renameTurn(draftTurnId, turnId)
            if (renamed) {
              updated = this.patchTurn(turnId, patch)
            }
          }
        }
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              role: "beautician",
              turn_index: data.turn_index,
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
        if (this._httpFallbackTurnActive && this._httpFallbackBeauticianTurnId === turnId) {
          vcLog("ws.http-fallback:beautician-ready", {
            turnId,
          })
        }
      } else if (type === "customer.text_ready" && turnId) {
        vcLog("ev.customer.text_ready", {
          turnId,
          parentTurnId: String(data.beautician_turn_id || ""),
          textLength: String(data.text || "").length,
        })
        const parentTurnId = String(data.beautician_turn_id || "")
        const customerTurnIndex = resolveCustomerTurnIndex(data.turn_index, this.getTurnIndexValue(parentTurnId))
        if (parentTurnId) {
          this.markTurnLatency(parentTurnId, "customer_text_ready", {
            customerTurnId: turnId,
            stageElapsedMs,
          })
        }
        const customerTextPatch = {
          status: "text_ready",
          pending: false,
          text: String(data.text || ""),
          emotion: String(data.emotion || ""),
          showText: false,
          ttsFailed: false,
          ...buildPendingCustomerVoiceUi(String(data.text || "")),
        }
        if (Number.isFinite(customerTurnIndex)) {
          customerTextPatch.turn_index = customerTurnIndex
        }
        const updated = this.patchTurn(turnId, customerTextPatch)
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              role: "customer",
              turn_index: customerTurnIndex,
              status: "text_ready",
              text: data.text || "",
              emotion: data.emotion || "",
            }),
          )
        }
        if (this._httpFallbackTurnActive && parentTurnId && parentTurnId === this._httpFallbackBeauticianTurnId) {
          this._httpFallbackCustomerTurnId = turnId
          this._httpFallbackTurnActive = false
          vcLog("ws.http-fallback:text-ready", {
            parentTurnId,
            customerTurnId: turnId,
          })
          this.ensureEventsPolling(true)
        }
        if (!this._httpFallbackTurnActive && this._httpFallbackCustomerTurnId === turnId) {
          this.setData({
            loading: false,
            waitingCustomer: false,
          })
        } else {
          this.setData({ waitingCustomer: true })
        }
      } else if (type === "customer.audio_ready" && turnId) {
        vcLog("ev.customer.audio_ready", {
          turnId,
          parentTurnId: String(data.beautician_turn_id || ""),
          hasAudio: Boolean(data.audio_url),
          ttsFailed: Boolean(data.tts_failed),
        })
        const parentTurnId = String(data.beautician_turn_id || "")
        const customerTurnIndex = resolveCustomerTurnIndex(data.turn_index, this.getTurnIndexValue(parentTurnId))
        if (parentTurnId) {
          this.markTurnLatency(parentTurnId, "customer_audio_ready", {
            customerTurnId: turnId,
            stageElapsedMs,
            ttsFailed: Boolean(data.tts_failed),
          })
        }
        if (!data.audio_url || data.tts_failed) {
          this.notifyTtsFallback()
          const customerTextOnlyPatch = {
            status: "text_ready",
            pending: false,
            showText: false,
            ttsFailed: true,
          }
          if (Number.isFinite(customerTurnIndex)) {
            customerTextOnlyPatch.turn_index = customerTurnIndex
          }
          this.patchTurn(turnId, customerTextOnlyPatch)
          if (
            this._httpFallbackTurnActive &&
            ((parentTurnId && parentTurnId === this._httpFallbackBeauticianTurnId) || turnId === this._httpFallbackCustomerTurnId)
          ) {
            this._httpFallbackCustomerTurnId = turnId
          }
          this.setData({ waitingCustomer: false })
        } else {
          const seconds = Number(data.audio_seconds || 0) || 0
          const customerAudioPatch = {
            status: "audio_ready",
            pending: false,
            audio_url: data.audio_url,
            audio_seconds: seconds || null,
            audio_seconds_text: formatSeconds(seconds),
            voice_width_rpx: voiceWidthRpx(seconds || 3),
            showText: false,
            ttsFailed: false,
          }
          if (Number.isFinite(customerTurnIndex)) {
            customerAudioPatch.turn_index = customerTurnIndex
          }
          const updated = this.patchTurn(turnId, customerAudioPatch)
          if (!updated) {
            this.appendTurn(
              normalizeTurn({
              turn_id: turnId,
              role: "customer",
              turn_index: customerTurnIndex,
              status: "audio_ready",
              text: data.text || "",
              audio_url: data.audio_url,
              audio_seconds: seconds || null,
              }),
            )
          }
          if (
            this._httpFallbackTurnActive &&
            ((parentTurnId && parentTurnId === this._httpFallbackBeauticianTurnId) || turnId === this._httpFallbackCustomerTurnId)
          ) {
            this._httpFallbackCustomerTurnId = turnId
          }
          this.autoPlayTurn({
            id: turnId,
            role: "customer",
            audio_url: data.audio_url,
          })
          this.setData({ waitingCustomer: false })
        }
      } else if (type === "beautician.analysis_ready" && turnId) {
        vcLog("ev.beautician.analysis_ready", {
          turnId,
          hasAnalysis: Boolean(data.analysis),
        })
        this.markTurnLatency(turnId, "analysis_ready", {
          stageElapsedMs,
        })
        var analysisPayload = data.analysis || null
        if (analysisPayload && analysisPayload.highlights && analysisPayload.highlights.length) {
          var turnForHl = this.getTurnById(turnId)
          if (turnForHl && turnForHl.text) {
            analysisPayload.highlightedSegments = buildHighlightedSegments(turnForHl.text, analysisPayload.highlights)
          }
        }
        var analysisPatch = {
          status: "analysis_ready",
          pending: false,
          analysis: enrichAnalysisForTurn((this.getTurnById(turnId) || {}).text || "", analysisPayload),
          analysisLoading: false,
          analysisError: "",
        }
        if (analysisPayload && analysisPayload.per_turn_scores) {
          var scoreData = parsePerTurnScores(analysisPayload.per_turn_scores)
          if (scoreData) {
            Object.assign(analysisPatch, scoreData)
          }
        }
        this.patchTurn(turnId, analysisPatch)
        this.turnLatency.delete(turnId)
      } else if (type === "turn.error") {
        const code = String(data.code || "")
        vcError("ev.turn.error", {
          turnId,
          code,
          message: data.message || "",
        })
        if (turnId) {
          this.patchTurn(turnId, { pending: false, status: "error" })
          this.turnLatency.delete(turnId)
        }
        if (
          this._httpFallbackTurnActive &&
          (turnId === this._httpFallbackBeauticianTurnId || turnId === this._httpFallbackCustomerTurnId)
        ) {
          if (code !== "analysis_failed") {
            this.clearHttpFallbackTurn("turn_error", {
              turnId,
              code,
            })
          }
        }
        this.setData({ waitingCustomer: false })
        if (code !== "analysis_failed") {
          wx.showToast({ title: String(data.message || "澶勭悊澶辫触锛岃閲嶈瘯"), icon: "none" })
        }
      }

      if (eventId > latestCursor) latestCursor = eventId
    }

    if (latestCursor !== this.data.eventCursor) {
      this.setData({ eventCursor: latestCursor })
    }
  },

  handleWsMessage(msg) {
    if (!msg || !msg.type) return
    if (msg.type !== "llm.text_delta") {
      vcLog("ws.message", { type: msg.type })
    }

    if (msg.type === "session.ready") return

    if (msg.type === "asr.partial") {
      const text = String(msg.text || "")
      this._lastAsrPartialText = text
      this.setData({ recordingPreviewText: text || "识别中..." })
      vcLog("ws.asr.partial", { textLength: text.length })
      return
    }

    if (msg.type === "asr.final") {
      vcLog("ws.asr.final", {
        textLength: String(msg.text || "").length,
        confidence: Number(msg.confidence || 0) || 0,
      })
      this.onRealtimeAsrFinal(msg.text, msg.confidence)
      return
    }

    if (msg.type === "llm.text_delta") {
      this.appendRealtimeCustomerDelta(msg.delta)
      return
    }

    if (msg.type === "llm.done") {
      vcLog("ws.llm.done", {
        textLength: String(msg.customer_text || "").length,
        emotion: String(msg.customer_emotion || ""),
      })
      this.finalizeRealtimeCustomerTurn(msg.customer_text, msg.customer_emotion)
      return
    }

    if (msg.type === "llm.analysis") {
      this.applyRealtimeAnalysis(msg)
      return
    }

    if (msg.type === "tts.sentence_start") {
      vcLog("ws.tts.sentence_start", { index: Number(msg.index || 0) || 0 })
      if (this._audioPlayer) {
        this._audioPlayer.markSentenceStart(msg.index)
        this._audioPlayer.play()
      }
      return
    }

    if (msg.type === "tts.sentence_end") {
      vcLog("ws.tts.sentence_end", { index: Number(msg.index || 0) || 0 })
      if (this._audioPlayer) {
        this._audioPlayer.markSentenceEnd(msg.index)
        this._audioPlayer.play()
      }
      return
    }

    if (msg.type === "tts.done") {
      vcLog("ws.tts.done", {
        customerTurnId: this._currentCustomerTurnId || "",
      })
      if (this._audioPlayer) {
        this._audioPlayer.finish()
      } else {
        this.setData({ loading: false, waitingCustomer: false })
      }
      return
    }

    if (msg.type === "turn.saved") {
      this.commitRealtimeTurns(msg)
      return
    }

    if (msg.type === "error") {
      const code = String(msg.code || "")
      vcError("ws.error:message", {
        code,
        message: String(msg.message || ""),
        recoverable: Boolean(msg.recoverable),
      })
      if (!msg.recoverable) {
        this.fallbackToHttp(String(code || "non_recoverable_error"))
        return
      }
      if (code === "asr_empty_result" && this.fallbackPendingAudioToHttp(code || "asr_empty_result")) {
        wx.showToast({ title: "实时识别不稳定，已切换稳定模式", icon: "none" })
        return
      }
      if (code !== "analysis_failed") {
        const keepDrafts = code === "turn_persist_failed"
        this.resetRealtimeAttemptState(code || "recoverable_error", {
          keepBeauticianDraft: keepDrafts,
          keepCustomerDraft: keepDrafts,
        })
        wx.showToast({ title: String(msg.message || "瀹炴椂澶勭悊澶辫触"), icon: "none" })
      }
    }
  },

  handleWsBinary(payload) {
    if (!payload || !this._audioPlayer) return
    const sentenceIndex = Number(payload.sentenceIndex || 0) || 0
    const audio = payload.audio
    if (!(audio instanceof ArrayBuffer) || !audio.byteLength) return
    this._realtimeBinaryCount += 1
    if (this._realtimeBinaryCount === 1 || this._realtimeBinaryCount % 10 === 0) {
      vcLog("ws.binary", {
        sentenceIndex,
        bytes: audio.byteLength,
        seq: this._realtimeBinaryCount,
      })
    }
    this._audioPlayer.feedChunk(sentenceIndex, audio)
  },

  onRealtimeAsrFinal(text, confidence) {
    const finalText = String(text || "").trim()
    const pendingAudioPath =
      this._realtimePendingAudio && this._realtimePendingAudio.filePath ? this._realtimePendingAudio.filePath : ""
    const pendingAudioSeconds =
      this._realtimePendingAudio && this._realtimePendingAudio.durationSec ? this._realtimePendingAudio.durationSec : 0
    this.setData({
      loading: false,
      waitingCustomer: Boolean(finalText),
      recordingPreviewText: finalText || this._lastAsrPartialText || "",
    })
    if (!finalText) return

    if (!this._currentBeauticianTurnId) {
      this._currentBeauticianTurnId = makeRealtimeTurnId("beautician")
      if (this._realtimePendingAudio && this._realtimePendingAudio.clientAttemptId) {
        this.moveTurnLatency(this._realtimePendingAudio.clientAttemptId, this._currentBeauticianTurnId)
      }
      this.appendTurn(
        normalizeTurn({
          id: this._currentBeauticianTurnId,
          turn_index: this._realtimeTurnIndex,
          role: "beautician",
          status: "asr_ready",
          text: finalText,
          audio_url: pendingAudioPath || null,
          audio_seconds: pendingAudioSeconds || null,
          pending: true,
        }),
      )
    } else {
      this.patchTurn(this._currentBeauticianTurnId, {
        turn_index: this._realtimeTurnIndex,
        status: "asr_ready",
        pending: true,
        text: finalText,
        audio_url: pendingAudioPath || null,
        audio_seconds: pendingAudioSeconds || null,
        audio_seconds_text: formatSeconds(pendingAudioSeconds),
        voice_width_rpx: pendingAudioPath ? voiceWidthRpx(pendingAudioSeconds || 1) : 0,
      })
    }

    vcLog("ws.asr.final:applied", {
      turnId: this._currentBeauticianTurnId,
      confidence: Number(confidence || 0) || 0,
    })
  },

  appendRealtimeCustomerDelta(delta) {
    const nextDelta = String(delta || "")
    if (!nextDelta) return
    this._realtimeCustomerText += nextDelta
    this.setData({
      loading: false,
      waitingCustomer: false,
    })
    if (!this._currentCustomerTurnId) {
      this._currentCustomerTurnId = makeRealtimeTurnId("customer")
      this.appendTurn(
        normalizeTurn({
          id: this._currentCustomerTurnId,
          turn_index: this._realtimeTurnIndex + 1,
          role: "customer",
          status: "text_ready",
          text: this._realtimeCustomerText,
          emotion: this._realtimeCustomerEmotion,
          pending: true,
        }),
      )
    } else {
      this.patchTurn(this._currentCustomerTurnId, {
        turn_index: this._realtimeTurnIndex + 1,
        status: "text_ready",
        pending: true,
        text: this._realtimeCustomerText,
        emotion: this._realtimeCustomerEmotion,
        showText: false,
        ...buildPendingCustomerVoiceUi(this._realtimeCustomerText),
      })
    }
  },

  finalizeRealtimeCustomerTurn(text, emotion) {
    this._realtimeCustomerText = String(text || this._realtimeCustomerText || "").trim()
    this._realtimeCustomerEmotion = String(emotion || this._realtimeCustomerEmotion || "neutral")
    this.setData({
      loading: false,
      waitingCustomer: false,
    })
    if (!this._currentCustomerTurnId) {
      this._currentCustomerTurnId = makeRealtimeTurnId("customer")
      this.appendTurn(
        normalizeTurn({
          id: this._currentCustomerTurnId,
          turn_index: this._realtimeTurnIndex + 1,
          role: "customer",
          status: this._realtimeCustomerAudioReady ? "audio_ready" : "text_ready",
          text: this._realtimeCustomerText,
          emotion: this._realtimeCustomerEmotion,
          pending: !this._realtimeCustomerAudioReady,
        }),
      )
    } else {
      this.patchTurn(this._currentCustomerTurnId, {
        turn_index: this._realtimeTurnIndex + 1,
        status: this._realtimeCustomerAudioReady ? "audio_ready" : "text_ready",
        pending: !this._realtimeCustomerAudioReady,
        text: this._realtimeCustomerText,
        emotion: this._realtimeCustomerEmotion,
        ...(!this._realtimeCustomerAudioReady ? buildPendingCustomerVoiceUi(this._realtimeCustomerText) : {}),
      })
    }

    if (this._realtimeCustomerAudioReady && this._realtimeCustomerAudioPath) {
      this.patchTurn(
        this._currentCustomerTurnId,
        this.buildRealtimeCustomerPatch(this._realtimeCustomerAudioPath, { includeTurnIndex: true }),
      )
    }
  },

  applyRealtimeAnalysis(msg) {
    const targetId = String((msg && msg.beautician_turn_id) || this._currentBeauticianTurnId || "")
    if (!targetId) return
    vcLog("ws.llm.analysis", {
      targetId,
      hasAnalysis: Boolean(msg && msg.analysis),
    })
    var analysisPayload = msg && msg.analysis ? msg.analysis : null
    var turnForHl = this.getTurnById(targetId)
    var realtimeAnalysisPatch = {
      status: "analysis_ready",
      pending: false,
      analysis: enrichAnalysisForTurn(turnForHl && turnForHl.text ? turnForHl.text : "", analysisPayload),
      analysisLoading: false,
      analysisError: "",
    }
    if (analysisPayload && analysisPayload.per_turn_scores) {
      var scoreData = parsePerTurnScores(analysisPayload.per_turn_scores)
      if (scoreData) {
        Object.assign(realtimeAnalysisPatch, scoreData)
      }
    }
    this.patchTurn(targetId, realtimeAnalysisPatch)
  },

  commitRealtimeTurns(msg) {
    const beauticianTurnId = String((msg && msg.beautician_turn_id) || "")
    const customerTurnId = String((msg && msg.customer_turn_id) || "")
    vcLog("ws.turn.saved", {
      beauticianTurnId,
      customerTurnId,
    })

    if (beauticianTurnId) {
      if (this._currentBeauticianTurnId && this._currentBeauticianTurnId !== beauticianTurnId) {
        this.moveTurnLatency(this._currentBeauticianTurnId, beauticianTurnId)
        const renamed = this.renameTurn(this._currentBeauticianTurnId, beauticianTurnId)
        if (!renamed) {
          this.appendTurn(
            normalizeTurn({
              turn_id: beauticianTurnId,
              turn_index: this._realtimeTurnIndex,
              role: "beautician",
              status: "asr_ready",
              text: this._lastAsrPartialText || "",
              audio_url:
                this._realtimePendingAudio && this._realtimePendingAudio.filePath ? this._realtimePendingAudio.filePath : null,
              audio_seconds:
                this._realtimePendingAudio && this._realtimePendingAudio.durationSec
                  ? this._realtimePendingAudio.durationSec
                  : null,
              pending: false,
            }),
          )
        }
      } else if (this.findTurnIndex(beauticianTurnId) < 0) {
        this.appendTurn(
          normalizeTurn({
            turn_id: beauticianTurnId,
            turn_index: this._realtimeTurnIndex,
            role: "beautician",
            status: "asr_ready",
            text: this._lastAsrPartialText || "",
            audio_url:
              this._realtimePendingAudio && this._realtimePendingAudio.filePath ? this._realtimePendingAudio.filePath : null,
            audio_seconds:
              this._realtimePendingAudio && this._realtimePendingAudio.durationSec
                ? this._realtimePendingAudio.durationSec
                : null,
            pending: false,
          }),
        )
      }
      this._currentBeauticianTurnId = beauticianTurnId
      this.patchTurn(
        beauticianTurnId,
        Object.assign(
          {
            turn_index: this._realtimeTurnIndex,
            pending: false,
          },
          this._realtimePendingAudio && this._realtimePendingAudio.filePath
            ? this.buildRealtimeBeauticianPatch(
                this._realtimePendingAudio.filePath,
                this._realtimePendingAudio.durationSec,
              )
            : {},
        ),
      )
    }

    if (customerTurnId) {
      if (this._currentCustomerTurnId && this._currentCustomerTurnId !== customerTurnId) {
        const renamed = this.renameTurn(this._currentCustomerTurnId, customerTurnId)
        if (!renamed) {
          this.appendTurn(
            normalizeTurn({
              turn_id: customerTurnId,
              turn_index: this._realtimeTurnIndex + 1,
              role: "customer",
              status: this._realtimeCustomerAudioReady ? "audio_ready" : "text_ready",
              text: this._realtimeCustomerText,
              emotion: this._realtimeCustomerEmotion,
              pending: !this._realtimeCustomerAudioReady,
            }),
          )
        }
      } else if (this.findTurnIndex(customerTurnId) < 0) {
        this.appendTurn(
          normalizeTurn({
            turn_id: customerTurnId,
            turn_index: this._realtimeTurnIndex + 1,
            role: "customer",
            status: this._realtimeCustomerAudioReady ? "audio_ready" : "text_ready",
            text: this._realtimeCustomerText,
            emotion: this._realtimeCustomerEmotion,
            pending: !this._realtimeCustomerAudioReady,
          }),
        )
      }
      this._currentCustomerTurnId = customerTurnId
      if (this._realtimeCustomerAudioReady && this._realtimeCustomerAudioPath) {
        this.patchTurn(
          customerTurnId,
          this.buildRealtimeCustomerPatch(this._realtimeCustomerAudioPath, { includeTurnIndex: true }),
        )
      }
    }

    this._realtimeTurnIndex = this.getNextTurnIndex()
  },

  resetRealtimeAttemptState(reason, options = {}) {
    const keepBeauticianDraft = Boolean(options.keepBeauticianDraft)
    const keepCustomerDraft = Boolean(options.keepCustomerDraft)
    const beauticianTurnId = this._currentBeauticianTurnId
    const customerTurnId = this._currentCustomerTurnId
    const preservedRealtimeState =
      keepBeauticianDraft || keepCustomerDraft
        ? {
            currentBeauticianTurnId: beauticianTurnId,
            currentCustomerTurnId: customerTurnId,
            realtimeCustomerText: this._realtimeCustomerText,
            realtimeCustomerEmotion: this._realtimeCustomerEmotion,
            realtimeCustomerAudioPath: this._realtimeCustomerAudioPath,
            realtimeCustomerAudioReady: this._realtimeCustomerAudioReady,
            realtimeCustomerAudioSeconds: this._realtimeCustomerAudioSeconds,
            lastAsrPartialText: this._lastAsrPartialText,
          }
        : null
    const pendingAttemptId =
      this._realtimePendingAudio && this._realtimePendingAudio.clientAttemptId ? this._realtimePendingAudio.clientAttemptId : ""

    if (pendingAttemptId) this.turnLatency.delete(pendingAttemptId)
    if (beauticianTurnId) this.turnLatency.delete(beauticianTurnId)
    if (customerTurnId) this.turnLatency.delete(customerTurnId)

    if (!keepBeauticianDraft && beauticianTurnId && /^rt_/.test(beauticianTurnId)) {
      this.removeTurn(beauticianTurnId)
    }
    if (!keepCustomerDraft && customerTurnId && /^rt_/.test(customerTurnId)) {
      this.removeTurn(customerTurnId)
    }

    this.resetRealtimeDrafts()
    if (preservedRealtimeState) {
      if (keepBeauticianDraft) {
        this._currentBeauticianTurnId = preservedRealtimeState.currentBeauticianTurnId
      }
      if (keepCustomerDraft) {
        this._currentCustomerTurnId = preservedRealtimeState.currentCustomerTurnId
        this._realtimeCustomerText = preservedRealtimeState.realtimeCustomerText
        this._realtimeCustomerEmotion = preservedRealtimeState.realtimeCustomerEmotion
        this._realtimeCustomerAudioPath = preservedRealtimeState.realtimeCustomerAudioPath
        this._realtimeCustomerAudioReady = preservedRealtimeState.realtimeCustomerAudioReady
        this._realtimeCustomerAudioSeconds = preservedRealtimeState.realtimeCustomerAudioSeconds
      }
      this._lastAsrPartialText = preservedRealtimeState.lastAsrPartialText
    }
    this._realtimeTurnIndex = this.getNextTurnIndex()
    this.setData({
      loading: false,
      waitingCustomer: false,
      recordingPreviewText: "",
    })
    vcWarn("ws.turn:reset", {
      reason: reason || "",
      keepBeauticianDraft,
      keepCustomerDraft,
    })
  },

  async requestTurnTts(turnId, opts = {}) {
    vcLog("tts.request:start", {
      turnId,
      autoplay: Boolean(opts && opts.autoplay),
    })
    const sessionId = this.data.sessionId
    if (!sessionId || !turnId) return
    const idx = this.findTurnIndex(turnId)
    if (idx >= 0 && this.data.turns[idx] && this.data.turns[idx].audio_url) return
    const latestCustomer = this.isLatestCustomerTurn(turnId)
    if (latestCustomer) this.setData({ waitingCustomer: true })
    this.patchTurn(turnId, {
      status: "text_ready",
      ttsFailed: false,
    })

    try {
      const res = await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/turns/${turnId}/tts`,
        method: "POST",
        data: {},
      })

      if (!res || res.error) {
        vcWarn("tts.request:error", {
          turnId,
          message: res && (res.error || res.message) ? res.error || res.message : "tts_request_failed",
        })
        this.patchTurn(turnId, {
          status: "text_ready",
          ttsFailed: true,
        })
        if (latestCustomer) this.setData({ waitingCustomer: false })
        if (opts && opts.initialPrompt && turnId === this._initialCustomerTurnId) {
          this.setData({ initialPromptOverlayVisible: false })
          this._initialCustomerPromptCompleted = true
        }
        return
      }
      if (!res.audio_url || res.tts_failed) {
        vcWarn("tts.request:ok", {
          turnId,
          hasAudio: false,
          ttsFailed: Boolean(res && res.tts_failed),
        })
        this.patchTurn(turnId, {
          status: "text_ready",
          ttsFailed: true,
        })
        if (latestCustomer) this.setData({ waitingCustomer: false })
        if (opts && opts.initialPrompt && turnId === this._initialCustomerTurnId) {
          this.setData({ initialPromptOverlayVisible: false })
          this._initialCustomerPromptCompleted = true
        }
        this.notifyTtsFallback()
        return
      }

      const seconds = Number(res.audio_seconds || 0) || 0
      vcLog("tts.request:ok", {
        turnId,
        hasAudio: Boolean(res.audio_url),
        ttsFailed: Boolean(res.tts_failed),
      })
      this.patchTurn(turnId, {
        status: "audio_ready",
        audio_url: res.audio_url,
        audio_seconds: seconds || null,
        audio_seconds_text: formatSeconds(seconds),
        voice_width_rpx: voiceWidthRpx(seconds || 3),
        showText: false,
      })

      const isInitialPrompt = Boolean(opts && opts.initialPrompt && turnId === this._initialCustomerTurnId)
      if (isInitialPrompt) {
        this._initialCustomerAudioUrl = res.audio_url || ""
        vcLog("initial.prompt:ready", {
          turnId,
          hasAudio: true,
        })
        this.playInitialCustomerPrompt(turnId, res.audio_url, {
          reason: "tts_ready",
        })
      } else if (opts && opts.autoplay) {
        this.autoPlayTurn({
          id: turnId,
          audio_url: res.audio_url,
        })
      }
      if (latestCustomer) this.setData({ waitingCustomer: false })
    } catch (_err) {
      vcWarn("tts.request:error", {
        turnId,
        message: _err && _err.message ? _err.message : "",
      })
      this.patchTurn(turnId, {
        status: "text_ready",
        ttsFailed: true,
      })
      if (latestCustomer) this.setData({ waitingCustomer: false })
      if (opts && opts.initialPrompt && turnId === this._initialCustomerTurnId) {
        this.setData({ initialPromptOverlayVisible: false })
        this._initialCustomerPromptCompleted = true
      }
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
    this._wsManualClose = true
    this.cleanupRealtimeTransport()
    this.setData({ loading: true, endModalVisible: false })
    vcLog("session.end:start", {
      mode: "view_report",
      sessionId,
    })
    track("voicecoach_end", {
      sessionId,
      mode: "view_report",
    })
    try {
      await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/end`,
        method: "POST",
        data: { mode: "view_report" },
      })
      wx.navigateTo({ url: `/pages/voice-coach/report?sessionId=${sessionId}` })
    } catch (err) {
      this.stopEvents = false
      this._wsManualClose = false
      this.ensureEventsPolling()
      this.setData({ loading: false })
      vcError("session.end:error", {
        mode: "view_report",
        message: err && err.message ? err.message : "",
      })
      wx.showToast({ title: err.message || "鐢熸垚鎶ュ憡澶辫触", icon: "none" })
    }
  },

  async endOnly() {
    const sessionId = this.data.sessionId
    if (!sessionId) return
    this.stopEvents = true
    this._wsManualClose = true
    this.cleanupRealtimeTransport()
    this.setData({ loading: true, endModalVisible: false })
    vcLog("session.end:start", {
      mode: "end_only",
      sessionId,
    })
    track("voicecoach_end", {
      sessionId,
      mode: "end_only",
    })
    try {
      await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
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
      this._wsManualClose = false
      this.ensureEventsPolling()
      this.setData({ loading: false })
      vcError("session.end:error", {
        mode: "end_only",
        message: err && err.message ? err.message : "",
      })
      wx.showToast({ title: err.message || "结束失败", icon: "none" })
    }
  },

  getLastCustomerTurnId() {
    const latestCustomerTurn = this.getLastTurnByRole("customer")
    return latestCustomerTurn && latestCustomerTurn.id ? String(latestCustomerTurn.id) : ""
  },

  getLastBeauticianTurnIndex() {
    const latestBeauticianTurn = this.getLastTurnByRole("beautician")
    const turnIndex = Number(latestBeauticianTurn && latestBeauticianTurn.turn_index)
    return Number.isFinite(turnIndex) ? turnIndex : null
  },

  onRecordFrame(frame) {
    if (!this._recordTransportActive || !this.data.sessionId) return
    if (!frame) return

    const frameBuffer = frame.frameBuffer
    if (!(frameBuffer instanceof ArrayBuffer)) return
    if (frameBuffer.byteLength < 1024 || frameBuffer.byteLength > 512 * 1024) return
    this._lastRecordFrameAt = Date.now()

    if (this._realtimeMode && this._wsClient && this._wsClient.isConnected()) {
      this._realtimeFrameCount += 1
      if (this._realtimeFrameCount === 1 || this._realtimeFrameCount % 10 === 0) {
        vcLog("record.frame", {
          seq: this._realtimeFrameCount,
          bytes: frameBuffer.byteLength,
        })
      }
      try {
        this._wsClient.sendBinary(frameBuffer)
      } catch (error) {
        vcWarn("record.frame:error", {
          message: error && error.message ? error.message : "ws_send_binary_failed",
        })
      }
      return
    }

    if (this.previewDisabled || this.previewInFlight) return
    const now = Date.now()
    if (now - this.lastPreviewAt < 1200) return
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
    vcLog("record.preview:send", {
      seq: this.recordingChunkSeq,
      bytes: frameBuffer.byteLength,
    })

    const sessionId = this.data.sessionId
    request({
      baseUrl: VOICE_COACH_HTTP_BASE_URL,
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
          vcWarn("record.preview:disable", { reason: "preview_unavailable" })
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
          vcWarn("record.preview:disable", { reason: "server_error" })
        }
      })
      .finally(() => {
        this.previewInFlight = false
      })
  },

  onRecordStart(e) {
    const canRealtimeBargeIn = Boolean(this._realtimeMode && this._wsClient && this._wsClient.isConnected())
    if (shouldBlockRecordingForHttpFallback(this._httpFallbackTurnActive)) {
      vcWarn("record.start:blocked-http-fallback", {
        sessionId: this.data.sessionId || "",
        replyToTurnId: this._httpFallbackExpectedReplyToTurnId || "",
      })
      wx.showToast({ title: "请等待上一轮回复", icon: "none" })
      return
    }
    if (this.data.recording) return
    const beauticianTurnCount = this.getBeauticianTurnCount()
    const initialCustomerTurn = this.getTurnById(this._initialCustomerTurnId || this.getLastCustomerTurnId())
    const initialPromptPlaying =
      Boolean(initialCustomerTurn && initialCustomerTurn.id) &&
      String(this.data.playingTurnId || "") === String(initialCustomerTurn && initialCustomerTurn.id)
    if (
      beauticianTurnCount === 0 &&
      initialCustomerTurn &&
      initialCustomerTurn.role === "customer" &&
      !initialCustomerTurn.ttsFailed &&
      (initialPromptPlaying || !this._initialCustomerPromptCompleted)
    ) {
      if (initialCustomerTurn.audio_url) {
        vcWarn("record.start:blocked-initial-prompt", {
          turnId: initialCustomerTurn.id,
          playing: initialPromptPlaying,
        })
        wx.showToast({ title: "请先听完顾客问题", icon: "none" })
        this._ignoreManualPlayUntil = Date.now() + 1200
        return
      }
      vcWarn("record.start:blocked-initial-prompt-pending", {
        turnId: initialCustomerTurn.id,
      })
      wx.showToast({ title: "顾客语音生成中", icon: "none" })
      return
    }
    if (!canRealtimeBargeIn && this.data.loading) return
    if (!canRealtimeBargeIn && this.data.waitingCustomer) return
    if (!this.data.sessionId) return
    this._recordPressActive = true
    this.recordTouchStartY = 0
    const startTouchY = Number(
      (e && e.touches && e.touches[0] && e.touches[0].clientY) ||
        (e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) ||
        0,
    )

    const start = (touchY = 0) => {
      if (!this._recordPressActive) return
      const now = Date.now()
      this.recordTouchStartY = Number(touchY || 0)
      this.recordIntent = "send"
      const replyToTurnId = this.getLastCustomerTurnId()
      const useRealtime = Boolean(this._realtimeMode && this._wsClient && this._wsClient.isConnected())
      this.resetRealtimeDrafts()
      if (useRealtime) {
        this._realtimeTurnIndex = this.getNextTurnIndex()
      }
      this._recordTransportActive = true
      this._lastRecordFrameAt = 0
      vcLog("record.start", {
        sessionId: this.data.sessionId || "",
        replyToTurnId,
        realtime: useRealtime,
        turnIndex: this._realtimeTurnIndex,
      })
      this.setData({ recording: true, recordCanceling: false, recordingPreviewText: "" })
      this.startRecordingBeauticianDraft(useRealtime ? this._realtimeTurnIndex : this.getNextTurnIndex())
      try {
        if (useRealtime && this._audioPlayer && (this._audioPlayer.isPlaying || this._audioPlayer.hasBufferedAudio || this.data.waitingCustomer)) {
          this._audioPlayer.stop()
          this._audioPlayer = this.createRealtimeAudioPlayer()
          if (!this._lastBargeInAt || now - this._lastBargeInAt > 500) {
            this._wsClient.sendJson({ type: "barge_in" })
            this._lastBargeInAt = now
            vcLog("ws.barge_in", { replyToTurnId })
          } else {
            vcWarn("ws.barge_in:throttled", {
              replyToTurnId,
              deltaMs: now - this._lastBargeInAt,
            })
          }
        }
        if (this.audioCtx) this.audioCtx.stop()
        this.setData({ playingTurnId: "" })
      } catch {}

      if (useRealtime) {
        try {
          this._wsClient.sendJson({
            type: "audio.start",
            turn_index: this._realtimeTurnIndex,
            reply_to_turn_id: replyToTurnId || undefined,
          })
          vcLog("ws.audio.start", {
            turnIndex: this._realtimeTurnIndex,
            replyToTurnId,
          })
        } catch (error) {
          vcWarn("ws.audio.start:error", {
            message: error && error.message ? error.message : "audio_start_failed",
          })
          this.fallbackToHttp("audio_start_failed")
        }
      }

      try {
        const preferredOptions = {
          duration: 30000,
          format: "mp3",
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 64000,
          audioSource: "voice_recognition",
          frameSize: useRealtime ? 1 : 16,
        }

        const fallbackOptions = {
          duration: 30000,
          format: "mp3",
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 64000,
          frameSize: useRealtime ? 1 : 16,
        }

        try {
          this.recorder.start(preferredOptions)
        } catch (_startErr) {
          this.recorder.start(fallbackOptions)
        }
        this.triggerRecordHaptic()
      } catch (_err) {
        this.cancelRealtimeAudio("recorder_start_failed")
        this.discardRecordingBeauticianDraft("recorder_start_failed")
        this.resetRecorderUiState()
        this.setData({ waitingCustomer: false })
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
      vcLog("record.cancel-toggle", { willCancel })
      this.setData({ recordCanceling: willCancel })
    }
  },

  onRecordEnd() {
    this._recordPressActive = false
    if (!this.data.recording) return
    if (this.data.recordCanceling) {
      this.onRecordCancel()
      return
    }
    this.recordIntent = "send"
    vcLog("record.end", {
      sessionId: this.data.sessionId || "",
      realtime: Boolean(this._realtimeMode),
    })
    this.setData({ recording: false, recordCanceling: false, loading: true, recordingPreviewText: "" })
    try {
      this.recorder.stop()
      this.playSendEffect("record_send")
    } catch (_err) {
      this.cancelRealtimeAudio("recorder_stop_failed")
      this.discardRecordingBeauticianDraft("recorder_stop_failed")
      this.resetRecorderUiState()
      this.setData({ loading: false })
      wx.showToast({ title: "录音停止失败", icon: "none" })
    }
  },

  onRecordCancel() {
    this._recordPressActive = false
    if (!this.data.recording) return
    this.recordIntent = "cancel"
    this.cancelRealtimeAudio("manual_cancel")
    this.discardRecordingBeauticianDraft("manual_cancel")
    vcLog("record.cancel", {
      sessionId: this.data.sessionId || "",
      realtime: Boolean(this._realtimeMode),
    })
    this.resetRecorderUiState()
    this.setData({ loading: false, waitingCustomer: false })
    try {
      this.recorder.stop()
    } catch {}
  },

  async uploadBeauticianTurn(filePath, durationSec, options = {}) {
    const sessionId = this.data.sessionId
    const replyToTurnId = String(options.replyToTurnIdOverride || this.getLastCustomerTurnId() || "")
    if (!replyToTurnId) {
      this.setData({ loading: false })
      wx.showToast({ title: "缺少顾客对话", icon: "none" })
      return
    }

    const clientAttemptId = makeClientAttemptId()
    const normalizedDurationSec = Number(durationSec || 0) || 0
    const realtimeAvailable = Boolean(this._realtimeMode && this._wsClient && this._wsClient.isConnected())
    let useRealtime = Boolean(options.forceHttp ? false : realtimeAvailable)
    if (useRealtime && !shouldUseRealtimeTransport(normalizedDurationSec, MIN_REALTIME_AUDIO_SECONDS)) {
      vcWarn("ws.short-utterance:http", {
        audioSeconds: normalizedDurationSec,
        minRealtimeSeconds: MIN_REALTIME_AUDIO_SECONDS,
      })
      this.cancelRealtimeAudio("short_utterance_http")
      this.resetRealtimeAttemptState("short_utterance_http")
      this.beginHttpFallbackTurn(replyToTurnId)
      useRealtime = false
    }
    vcLog("turn.submit:start", {
      mode: useRealtime ? "realtime" : "http",
      sessionId,
      replyToTurnId,
      audioSeconds: normalizedDurationSec,
      clientAttemptId,
    })
    if (useRealtime) {
      this._realtimePendingAudio = {
        filePath,
        durationSec: normalizedDurationSec,
        replyToTurnId,
        clientAttemptId,
      }
      this.startTurnLatency(clientAttemptId, {
        clientAttemptId,
        transport: "ws",
      })
      this.setData({
        loading: true,
        waitingCustomer: true,
        recordingPreviewText: "",
      })
      try {
        if (this._wsClient && typeof this._wsClient.drain === "function") {
          try {
            await this._wsClient.drain(600)
            vcLog("ws.audio.drain", {
              clientAttemptId,
              frameCount: this._realtimeFrameCount,
            })
          } catch (drainError) {
            vcWarn("ws.audio.drain:error", {
              clientAttemptId,
              frameCount: this._realtimeFrameCount,
              message: drainError && drainError.message ? drainError.message : "ws_drain_timeout",
            })
          }
        }
        this._wsClient.sendJson({
          type: "audio.end",
          client_audio_seconds: normalizedDurationSec,
        })
        this._recordTransportActive = false
        vcLog("ws.audio.end", {
          clientAttemptId,
          audioSeconds: normalizedDurationSec,
        })
        return
      } catch (error) {
        vcWarn("ws.audio.end:error", {
          clientAttemptId,
          message: error && error.message ? error.message : "audio_end_failed",
        })
        this.turnLatency.delete(clientAttemptId)
        this._realtimePendingAudio = null
        this.fallbackToHttp("audio_end_failed")
      }
    }

    this._recordTransportActive = false
    this._pendingHttpSubmit = {
      clientAttemptId,
      filePath,
      durationSec: normalizedDurationSec,
      replyToTurnId,
      localTurnId: this._currentBeauticianTurnId || "",
    }
    this.setData({
      loading: true,
      waitingCustomer: true,
      recordingPreviewText: "",
    })
    this.startTurnLatency(clientAttemptId, {
      clientAttemptId,
      transport: "http",
    })
    track("voicecoach_turn_submit", {
      sessionId,
      role: "beautician",
      clientAttemptId,
      audioSeconds: normalizedDurationSec,
    })

    const token = getAccessToken()
    const deviceId = getDeviceId()

    wx.uploadFile({
      url: `${VOICE_COACH_HTTP_BASE_URL}/api/voice-coach/sessions/${sessionId}/beautician-turn/submit`,
      filePath,
      name: "audio",
      formData: {
        reply_to_turn_id: replyToTurnId,
        client_audio_seconds: String(normalizedDurationSec || ""),
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
          this.turnLatency.delete(clientAttemptId)
          if (this._pendingHttpSubmit && this._pendingHttpSubmit.localTurnId) {
            this.removeTurn(this._pendingHttpSubmit.localTurnId)
          }
          this._pendingHttpSubmit = null
          this.clearHttpFallbackTurn("http_submit_error", {
            message: payload && (payload.message || payload.error) ? payload.message || payload.error : "submit_failed",
          })
          vcWarn("turn.submit:error", {
            mode: "http",
            clientAttemptId,
            message: payload && (payload.message || payload.error) ? payload.message || payload.error : "submit_failed",
          })
          wx.showToast({ title: payload?.message || payload?.error || "涓婁紶澶辫触", icon: "none" })
          return
        }

        const acceptedTurnIndex = Number(payload && payload.beautician_turn && payload.beautician_turn.turn_index)
        const accepted = normalizeTurn({
          turn_id: payload.beautician_turn.turn_id,
          turn_index: Number.isFinite(acceptedTurnIndex) ? acceptedTurnIndex : this.getNextTurnIndex(),
          role: "beautician",
          status: "accepted",
          text: payload.beautician_turn.text,
          audio_url: payload.beautician_turn.audio_url,
          audio_seconds: payload.beautician_turn.audio_seconds,
          pending: true,
        })
        const localTurnId = String((this._pendingHttpSubmit && this._pendingHttpSubmit.localTurnId) || "")
        let hasAcceptedTurn = this.findTurnIndex(accepted.id) >= 0
        let mergeSourceTurnId = localTurnId
        if (!mergeSourceTurnId && Number.isFinite(acceptedTurnIndex)) {
          mergeSourceTurnId = this.findPendingBeauticianTurnId(acceptedTurnIndex, accepted.id)
        }
        if (mergeSourceTurnId && mergeSourceTurnId !== accepted.id) {
          const renamed = this.renameTurn(mergeSourceTurnId, accepted.id)
          hasAcceptedTurn = hasAcceptedTurn || renamed
        }
        if (!hasAcceptedTurn) {
          this.appendTurn(accepted)
        } else {
          this.patchTurn(accepted.id, {
            turn_index: accepted.turn_index,
            status: "accepted",
            pending: true,
            text: accepted.text,
            audio_url: accepted.audio_url,
            audio_seconds: accepted.audio_seconds,
            audio_seconds_text: accepted.audio_seconds_text,
            voice_width_rpx: accepted.voice_width_rpx,
            showText: false,
          })
        }
        this.moveTurnLatency(clientAttemptId, accepted.id)
        this._pendingHttpSubmit = null
        this._currentBeauticianTurnId = accepted.id

        this.markTurnLatency(accepted.id, "submit_ack", {
          deduped: Boolean(payload.deduped),
          acceptedByServer: true,
        })
        vcLog("turn.submit:ok", {
          mode: "http",
          clientAttemptId,
          turnId: accepted.id,
          deduped: Boolean(payload.deduped),
        })

        const nextCursor = Number(payload.next_cursor || 0) || 0
        this.setData({
          loading: false,
          waitingCustomer: !payload.reached_max_turns,
          eventCursor: nextCursor > (this.data.eventCursor || 0) ? nextCursor : this.data.eventCursor,
        })
        if (this._httpFallbackTurnActive) {
          this._httpFallbackBeauticianTurnId = accepted.id
          void this.forceEventsPollingLoop()
        } else {
          this.ensureEventsPolling()
        }
      },
      fail: (error) => {
        this.turnLatency.delete(clientAttemptId)
        if (this._pendingHttpSubmit && this._pendingHttpSubmit.localTurnId) {
          this.removeTurn(this._pendingHttpSubmit.localTurnId)
        }
        this._pendingHttpSubmit = null
        this.clearHttpFallbackTurn("http_submit_fail", {
          message: error && error.errMsg ? error.errMsg : "",
        })
        vcWarn("turn.submit:fail", {
          mode: "http",
          clientAttemptId,
          message: error && error.errMsg ? error.errMsg : "",
        })
        this.setData({ loading: false, waitingCustomer: false })
        wx.showToast({ title: "涓婁紶澶辫触", icon: "none" })
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

  refreshSuggest(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    void this.refreshSuggestionsForTurn(id)
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
      if (!current || !current.analysis) {
        void this.refreshSuggestionsForTurn(id)
      }
      track("voicecoach_suggestion_open", {
        sessionId: this.data.sessionId || "",
        turnId: id,
      })
      if (this._suggestScrollTimer) clearTimeout(this._suggestScrollTimer)
      if (this._suggestScrollInnerTimer) clearTimeout(this._suggestScrollInnerTimer)
      this._suggestScrollTimer = setTimeout(() => {
        this.setData({ scrollIntoView: "" })
        this._suggestScrollInnerTimer = setTimeout(() => {
          this.setData({ scrollIntoView: `turn-${id}` })
        }, 30)
      }, 50)
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
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/rollback`,
        method: "POST",
        data: { from_turn_id: turnId },
      })
      const turns = dedupeTurns((res.turns || []).map(normalizeTurn))
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
      wx.showToast({ title: err.message || "鍥炴粴澶辫触", icon: "none" })
    }
  },

  openHint(e) {
    wx.vibrateShort({ type: 'light' })
    const sessionId = this.data.sessionId
    if (!sessionId) {
      wx.showToast({ title: "当前会话还没准备好", icon: "none" })
      return
    }
    const explicitTurnId = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    const explicitTurn = explicitTurnId ? this.getTurnById(explicitTurnId) : null
    const customerTurnId =
      explicitTurn && String(explicitTurn.role || "") === "customer"
        ? explicitTurnId
        : this.getLastCustomerTurnId()
    if (!customerTurnId) {
      wx.showToast({ title: "请先等顾客开口", icon: "none" })
      return
    }
    if (this._hintInFlight) {
      vcWarn("hint.open:skip", {
        sessionId,
        customerTurnId,
        reason: "in_flight",
      })
      wx.showToast({ title: "灵感生成中", icon: "none" })
      return
    }

    vcLog("hint.open:start", {
      sessionId,
      customerTurnId,
    })
    this._hintInFlight = true
    this._hintInFlightTurnId = customerTurnId
    this.setData({ loading: true, hintLoading: true, hintLoadingTurnId: customerTurnId })
    request({
      baseUrl: VOICE_COACH_HTTP_BASE_URL,
      url: `/api/voice-coach/sessions/${sessionId}/hint`,
      method: "POST",
      data: { customer_turn_id: customerTurnId },
    })
      .then((res) => {
        this.setData({
          loading: false,
          hintLoading: false,
          hintLoadingTurnId: "",
          hintVisible: true,
          hintText: res.hint_text || "",
          hintPoints: res.hint_points || [],
        })
        vcLog("hint.open:ok", {
          sessionId,
          customerTurnId,
          pointCount: Array.isArray(res && res.hint_points) ? res.hint_points.length : 0,
        })
        track("voicecoach_hint_open", {
          sessionId: sessionId || "",
          customerTurnId,
        })
      })
      .catch((err) => {
        this.setData({ loading: false, hintLoading: false, hintLoadingTurnId: "" })
        const rawMessage = err && err.message ? String(err.message) : ""
        const friendlyMessage =
          rawMessage === "voice_coach_error" ? "灵感服务暂时繁忙，请稍后重试" : (rawMessage || "获取灵感失败")
        vcWarn("hint.open:error", {
          sessionId,
          customerTurnId,
          message: rawMessage,
        })
        wx.showToast({ title: friendlyMessage, icon: "none" })
      })
      .finally(() => {
        this._hintInFlight = false
        this._hintInFlightTurnId = ""
        this.setData({ hintLoading: false, hintLoadingTurnId: "" })
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
    if (
      this._ignoreManualPlayUntil &&
      Date.now() < this._ignoreManualPlayUntil &&
      id &&
      id === String(this._initialCustomerTurnId || "")
    ) {
      vcWarn("audio.play:ignored", {
        turnId: id,
        reason: "initial_prompt_overlay_tapthrough",
      })
      return
    }
    if (
      id &&
      id === String(this._initialCustomerTurnId || "") &&
      !this._initialCustomerPromptCompleted &&
      String(this._activeAudioTurnId || "") === id &&
      String(this._activeAudioOwner || "") === "initial"
    ) {
      vcWarn("audio.play:ignored", {
        turnId: id,
        reason: "initial_prompt_active",
      })
      return
    }

    vcLog("audio.play:start", {
      turnId: id,
      source: /^https?:\/\//.test(url) ? "remote" : "local",
      autoplay: false,
    })
    if (this.data.playingTurnId === id) {
      try {
        this.audioCtx.stop()
      } catch {}
      this.setData({ playingTurnId: "" })
      this.clearManualPlayActive("toggle_stop")
      return
    }

    this.configureAudioOutput("manual_play")
    this.playAudio(id, url, {
      manual: true,
      owner: "manual",
      reason: "manual_play",
      markInitialPromptComplete: id === this._initialCustomerTurnId,
    })
  },

  shouldAutoPlayTurn(turnId, role, cooldownMs = 1500) {
    const id = String(turnId || "")
    if (!id) return false
    if (id === String(this._initialCustomerTurnId || "") && !this._initialCustomerPromptCompleted) {
      vcWarn("audio.autoplay:skip-initial", {
        turnId: id,
      })
      return false
    }
    const now = Date.now()
    const lastAt = Number(this.autoPlayCooldownByTurnId.get(id) || 0)
    const existingTurn = this.getTurnById(id)
    const resolvedRole = String(role || (existingTurn && existingTurn.role) || "")
    const latestCustomerTurnId = this.getLastCustomerTurnId()
    const currentTurnIndex = Number(existingTurn && existingTurn.turn_index)
    const latestBeauticianTurnIndex = this.getLastBeauticianTurnIndex()
    if (
      !shouldAutoPlayLatestCustomerTurn({
        turnId: id,
        role: resolvedRole,
        latestCustomerTurnId,
        turnIndex: Number.isFinite(currentTurnIndex) ? currentTurnIndex : null,
        latestBeauticianTurnIndex,
        lastPlayedAt: lastAt,
        now,
        cooldownMs,
      })
    ) {
      vcWarn("audio.autoplay:skip", {
        turnId: id,
        deltaMs: lastAt ? now - lastAt : 0,
        latestCustomerTurnId,
        role: resolvedRole || "",
      })
      return false
    }
    this.autoPlayCooldownByTurnId.set(id, now)
    return true
  },

  canContinueAutoPlay(turnId, role) {
    const id = String(turnId || "")
    if (!id) return false
    if (this._pageHidden || this.data.recording || this._recordTransportActive) return false
    if (this._manualPlayActive && this._manualPlayTurnId && this._manualPlayTurnId !== id) return false
    if (this.isInitialPromptBlockingAutoPlay(id)) return false
    if (this._activeAudioTurnId && this._activeAudioTurnId === id && this.data.playingTurnId === id) return false
    const existingTurn = this.getTurnById(id)
    const resolvedRole = String(role || (existingTurn && existingTurn.role) || "")
    const latestCustomerTurnId = this.getLastCustomerTurnId()
    const currentTurnIndex = Number(existingTurn && existingTurn.turn_index)
    const latestBeauticianTurnIndex = this.getLastBeauticianTurnIndex()
    return shouldAutoPlayLatestCustomerTurn({
      turnId: id,
      role: resolvedRole,
      latestCustomerTurnId,
      turnIndex: Number.isFinite(currentTurnIndex) ? currentTurnIndex : null,
      latestBeauticianTurnIndex,
      lastPlayedAt: 0,
      now: Date.now(),
      cooldownMs: 0,
    })
  },

  autoPlayTurn(turn) {
    if (!turn || !turn.audio_url || !turn.id) return
    const existingTurn = this.getTurnById(turn.id)
    const resolvedRole = String(turn.role || (existingTurn && existingTurn.role) || "")
    if (this._manualPlayActive && this._manualPlayTurnId && this._manualPlayTurnId !== String(turn.id)) {
      this.queueDeferredAutoPlay(
        {
          id: turn.id,
          role: resolvedRole,
          audio_url: turn.audio_url,
        },
        "manual_play_active",
      )
      return
    }
    if (this.isInitialPromptBlockingAutoPlay(turn.id)) {
      this.queueDeferredAutoPlay(
        {
          id: turn.id,
          role: resolvedRole,
          audio_url: turn.audio_url,
        },
        "initial_prompt_playing",
      )
      return
    }
    if (!this.shouldAutoPlayTurn(turn.id, resolvedRole)) return
    vcLog("audio.autoplay", {
      turnId: turn.id,
      role: resolvedRole || "",
      source: /^https?:\/\//.test(turn.audio_url) ? "remote" : "local",
    })
    this.playAudio(turn.id, turn.audio_url, {
      autoplay: true,
      owner: "autoplay",
      reason: "customer_autoplay",
    })
  },

  notifyTtsFallback() {
    if (this.hasShownTtsFallbackToast) return
    this.hasShownTtsFallbackToast = true
    wx.showToast({ title: "顾客语音生成失败，请重试语音", icon: "none" })
  },

  playAudio(turnId, url, opts = {}) {
    const autoplay = Boolean(opts.autoplay)
    const manual = Boolean(opts.manual)
    const owner = String((opts && opts.owner) || (manual ? "manual" : autoplay ? "autoplay" : ""))
    const reason = String((opts && opts.reason) || "")
    const existingTurn = this.getTurnById(turnId)
    const resolvedRole = String((opts && opts.role) || (existingTurn && existingTurn.role) || "")
    const shouldMarkInitialPromptComplete = Boolean(
      turnId &&
        this._initialCustomerTurnId &&
        String(turnId) === String(this._initialCustomerTurnId) &&
        opts &&
        opts.markInitialPromptComplete,
    )
    const generation = ++this._playbackGeneration

    const doPlay = (src) => {
      if (generation !== this._playbackGeneration) {
        vcWarn("audio.play:stale", {
          turnId,
          owner,
          reason,
          generation,
          currentGeneration: this._playbackGeneration,
        })
        return
      }
      if (
        String(this._activeAudioTurnId || "") === String(turnId || "") &&
        String(this._activeAudioOwner || "") === owner &&
        String(this.data.playingTurnId || "") === String(turnId || "")
      ) {
        vcWarn("audio.play:skip-active", {
          turnId,
          owner,
          reason,
          generation,
        })
        return
      }
      if (owner === "manual") {
        this.setManualPlayActive(turnId, reason || "play_audio")
      }
      if (autoplay && !this.canContinueAutoPlay(turnId, resolvedRole)) {
        vcWarn("audio.autoplay:cancel", {
          turnId,
          role: resolvedRole || "",
          reason:
            this.data.recording || this._recordTransportActive
              ? "recording"
              : this._pageHidden
                ? "page_hidden"
                : this._manualPlayActive
                  ? "manual_play_active"
                  : this.isInitialPromptBlockingAutoPlay(turnId)
                    ? "initial_prompt_playing"
                    : "stale_turn",
        })
        return
      }
      try {
        const interruptedTurnId = String(this._activeAudioTurnId || "")
        const interruptedOwner = String(this._activeAudioOwner || "")
        if (
          interruptedTurnId &&
          (interruptedTurnId !== String(turnId) || interruptedOwner !== owner)
        ) {
          vcWarn("audio.play:interrupt", {
            turnId: interruptedTurnId,
            interruptedBy: String(turnId || ""),
            previousOwner: interruptedOwner,
            nextOwner: owner,
            nextReason: reason,
          })
        }
        if (this._audioPlayer && (this._audioPlayer.isPlaying || this._audioPlayer.hasBufferedAudio)) {
          this._audioPlayer.stop()
          this._audioPlayer = this.createRealtimeAudioPlayer()
        }
        this.audioCtx.stop()
        this._activeAudioGeneration = generation
        this._activeAudioTurnId = turnId
        this._activeAudioOwner = owner
        this._activeAudioReason = reason
        this._initialCustomerPromptArmed = shouldMarkInitialPromptComplete
        this.audioCtx.src = src
        this.audioCtx.play()
        this.setData({ playingTurnId: turnId })
        vcLog("audio.play:source", {
          turnId,
          owner,
          reason,
          autoplay,
          local: !/^https?:\/\//.test(src),
        })
      } catch (_err) {
        if (!autoplay) wx.showToast({ title: "鎾斁澶辫触", icon: "none" })
      }
    }

    if (!/^https?:\/\//.test(url)) {
      doPlay(url)
      return
    }

    const cached = this.audioCache.get(turnId)
      if (cached) {
      doPlay(cached)
      return
    }

    if (this.pendingAudioDownloads && this.pendingAudioDownloads.get(turnId)) {
      vcWarn("audio.cache:skip-duplicate", {
        turnId,
        owner,
        reason,
        autoplay,
      })
      return
    }

    if (autoplay) {
      this.pendingAudioDownloads.set(turnId, true)
      wx.downloadFile({
        url,
        success: (res) => {
          if (generation !== this._playbackGeneration) {
            this.pendingAudioDownloads.delete(turnId)
            vcWarn("audio.cache:stale", {
              turnId,
              owner,
              reason,
              generation,
              currentGeneration: this._playbackGeneration,
            })
            return
          }
          if (!res || res.statusCode !== 200 || !res.tempFilePath) {
            vcWarn("audio.cache:fallback", {
              turnId,
              owner,
              reason,
              autoplay: true,
            })
            doPlay(url)
            return
          }
          this.audioCache.set(turnId, res.tempFilePath)
          vcLog("audio.cache:ok", {
            turnId,
            owner,
            reason,
            autoplay: true,
          })
          doPlay(res.tempFilePath)
        },
        fail: () => {
          if (generation !== this._playbackGeneration) {
            this.pendingAudioDownloads.delete(turnId)
            return
          }
          vcWarn("audio.cache:fallback", {
            turnId,
            owner,
            reason,
            autoplay: true,
          })
          doPlay(url)
        },
        complete: () => {
          this.pendingAudioDownloads.delete(turnId)
        },
      })
      return
    }

    this.pendingAudioDownloads.set(turnId, true)
    this.setData({ downloadingTurnId: turnId })
    wx.downloadFile({
      url,
      success: (res) => {
        if (generation !== this._playbackGeneration) {
          this.setData({ downloadingTurnId: "" })
          this.pendingAudioDownloads.delete(turnId)
          vcWarn("audio.cache:stale", {
            turnId,
            owner,
            reason,
            generation,
            currentGeneration: this._playbackGeneration,
          })
          return
        }
        this.setData({ downloadingTurnId: "" })
        if (!res || res.statusCode !== 200 || !res.tempFilePath) {
          vcWarn("audio.cache:fallback", {
            turnId,
            owner,
            reason,
            autoplay,
          })
          doPlay(url)
          return
        }
        this.audioCache.set(turnId, res.tempFilePath)
        vcLog("audio.cache:ok", {
          turnId,
          owner,
          reason,
          autoplay,
        })
        doPlay(res.tempFilePath)
      },
      fail: () => {
        if (generation !== this._playbackGeneration) {
          this.setData({ downloadingTurnId: "" })
          this.pendingAudioDownloads.delete(turnId)
          return
        }
        this.setData({ downloadingTurnId: "" })
        vcWarn("audio.cache:fallback", {
          turnId,
          owner,
          reason,
          autoplay,
        })
        doPlay(url)
      },
      complete: () => {
        this.pendingAudioDownloads.delete(turnId)
      },
    })
  },
})
