const { API_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")

const TURN_PENDING_STATUSES = {
  accepted: true,
  processing: true,
}

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
  const showTextDefault = hasAudio ? false : true
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
    showSuggestions: false,
    showText: showTextDefault,
    textOpenedOnce: false,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  },

  onLoad(options) {
    this.recorder = wx.getRecorderManager()
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCache = new Map()
    this.audioCtx.onEnded(() => {
      this.setData({ playingTurnId: "" })
    })

    this.hasShownAudioError = false
    this.hasShownTtsFallbackToast = false
    this.stopEvents = false
    this.pollingEvents = false
    this.lastAutoPlayedCustomerTurnId = ""
    this.pendingLocalTurnId = ""

    this.audioCtx.onError(() => {
      if (this.hasShownAudioError) return
      this.hasShownAudioError = true
      wx.showToast({ title: "音频播放失败，请检查 downloadFile 合法域名", icon: "none" })
    })

    this.recorder.onStop((res) => {
      if (this.recordIntent === "cancel") {
        this.recordIntent = ""
        this.setData({ loading: false, recording: false })
        return
      }
      this.recordIntent = ""
      const durationSec = res && res.duration ? Math.round(res.duration / 1000) : 0
      if (!res || !res.tempFilePath) {
        wx.showToast({ title: "录音失败", icon: "none" })
        this.setData({ recording: false, loading: false })
        return
      }
      if (!durationSec || durationSec < 1) {
        wx.showToast({ title: "录音太短，请至少说1秒", icon: "none" })
        this.setData({ recording: false, loading: false })
        return
      }
      this.uploadBeauticianTurn(res.tempFilePath, durationSec)
    })

    const sessionId = options && options.sessionId ? String(options.sessionId) : ""
    if (sessionId) {
      this.loadSession(sessionId)
      return
    }
    this.createSession()
  },

  onUnload() {
    this.stopEvents = true
    try {
      if (this.audioCtx) this.audioCtx.destroy()
    } catch {}
  },

  async createSession() {
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

      if (!first.audio_url || res.first_customer_turn.tts_failed) {
        this.notifyTtsFallback()
      }
      this.autoPlayTurn(first)
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
    this.pollEventsLoop()
  },

  async pollEventsLoop() {
    while (!this.stopEvents && this.data.sessionId) {
      const sessionId = this.data.sessionId
      const cursor = Number(this.data.eventCursor || 0) || 0
      try {
        const res = await request({
          baseUrl: API_BASE_URL,
          url: `/api/voice-coach/sessions/${sessionId}/events?cursor=${cursor}&timeout_ms=12000`,
          method: "GET",
        })
        if (this.stopEvents) break

        if (res && Array.isArray(res.events) && res.events.length) {
          this.applyServerEvents(res.events)
        }

        const nextCursor = Number(res && res.next_cursor ? res.next_cursor : cursor) || cursor
        if (nextCursor !== cursor) {
          this.setData({ eventCursor: nextCursor })
        }
      } catch (_err) {
        if (this.stopEvents) break
        await sleep(800)
      }
    }

    this.pollingEvents = false
  },

  findTurnIndex(turnId) {
    const turns = this.data.turns || []
    return turns.findIndex((t) => t.id === turnId)
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

  applyServerEvents(events) {
    let latestCursor = Number(this.data.eventCursor || 0) || 0

    for (let i = 0; i < events.length; i++) {
      const ev = events[i] || {}
      const eventId = Number(ev.id || 0) || 0
      if (eventId && eventId <= latestCursor) continue

      const type = String(ev.type || "")
      const data = ev && typeof ev.data === "object" && ev.data ? ev.data : {}
      const turnId = String(data.turn_id || ev.turn_id || "")

      if (type === "turn.accepted" && turnId) {
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
        const updated = this.patchTurn(turnId, {
          status: "text_ready",
          pending: false,
          text: String(data.text || ""),
          emotion: String(data.emotion || ""),
          showText: true,
        })
        if (!updated) {
          this.appendTurn(
            normalizeTurn({
              turn_id: turnId,
              role: "customer",
              status: "text_ready",
              text: data.text || "",
              emotion: data.emotion || "",
            }),
          )
        }
        this.setData({ waitingCustomer: false })
      } else if (type === "customer.audio_ready" && turnId) {
        if (!data.audio_url || data.tts_failed) {
          this.notifyTtsFallback()
          this.patchTurn(turnId, { status: "text_ready", pending: false, showText: true })
        } else {
          const seconds = Number(data.audio_seconds || 0) || 0
          const updated = this.patchTurn(turnId, {
            status: "audio_ready",
            pending: false,
            audio_url: data.audio_url,
            audio_seconds: seconds || null,
            audio_seconds_text: formatSeconds(seconds),
            voice_width_rpx: voiceWidthRpx(seconds || 3),
            showText: false,
          })
          if (!updated) {
            this.appendTurn(
              normalizeTurn({
                turn_id: turnId,
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
        }
      } else if (type === "beautician.analysis_ready" && turnId) {
        this.patchTurn(turnId, {
          status: "analysis_ready",
          pending: false,
          analysis: data.analysis || null,
        })
      } else if (type === "turn.error") {
        if (turnId) {
          this.patchTurn(turnId, { pending: false, status: "error" })
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

  onRecordStart() {
    if (this.data.loading) return
    if (this.data.waitingCustomer) return
    if (!this.data.sessionId) return

    const start = () => {
      this.recordIntent = "send"
      this.setData({ recording: true })
      try {
        if (this.audioCtx) this.audioCtx.stop()
        this.setData({ playingTurnId: "" })
      } catch {}

      try {
        this.recorder.start({
          duration: 30000,
          format: "mp3",
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
        })
      } catch (_err) {
        this.setData({ recording: false })
        wx.showToast({ title: "无法开始录音", icon: "none" })
      }
    }

    wx.getSetting({
      success: (setting) => {
        if (setting && setting.authSetting && setting.authSetting["scope.record"]) {
          start()
          return
        }
        wx.authorize({
          scope: "scope.record",
          success: start,
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
      fail: start,
    })
  },

  onRecordEnd() {
    if (!this.data.recording) return
    this.recordIntent = "send"
    this.setData({ recording: false, loading: true })
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
    this.setData({ recording: false, loading: false })
    try {
      this.recorder.stop()
    } catch {}
  },

  uploadBeauticianTurn(filePath, durationSec) {
    const sessionId = this.data.sessionId
    const replyToTurnId = this.getLastCustomerTurnId()
    if (!replyToTurnId) {
      this.setData({ loading: false })
      wx.showToast({ title: "缺少顾客对话", icon: "none" })
      return
    }

    const localTurn = makeLocalBeauticianTurn(filePath, durationSec)
    this.pendingLocalTurnId = localTurn.id
    this.appendTurn(localTurn)

    const token = getAccessToken()
    const deviceId = getDeviceId()

    wx.uploadFile({
      url: `${API_BASE_URL}/api/voice-coach/sessions/${sessionId}/beautician-turn/submit`,
      filePath,
      name: "audio",
      formData: {
        reply_to_turn_id: replyToTurnId,
        client_audio_seconds: String(durationSec || ""),
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
        }

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
        const turns = (this.data.turns || []).filter((t) => t.id !== this.pendingLocalTurnId)
        this.pendingLocalTurnId = ""
        this.setData({ turns })
      },
    })
  },

  toggleText(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    const turns = (this.data.turns || []).map((t) => {
      if (t.id !== id) return t
      const willShow = !t.showText
      return { ...t, showText: willShow, textOpenedOnce: t.textOpenedOnce || willShow }
    })
    this.setData({ turns })
  },

  toggleSuggest(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id) : ""
    if (!id) return
    const turns = (this.data.turns || []).map((t) => {
      if (t.id !== id) return t
      return { ...t, showSuggestions: !t.showSuggestions }
    })
    this.setData({ turns })
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
      })
      .catch((err) => {
        this.setData({ loading: false })
        wx.showToast({ title: err.message || "获取灵感失败", icon: "none" })
      })
  },

  closeHint() {
    this.setData({ hintVisible: false })
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
    wx.showToast({ title: "顾客语音生成失败，先看文字继续练习", icon: "none" })
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
