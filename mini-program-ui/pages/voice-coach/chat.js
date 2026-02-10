const { API_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")

function formatSeconds(seconds) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return ""
  return `${Math.round(n)}''`
}

function normalizeTurn(raw) {
  const role = raw.role === "beautician" ? "beautician" : "customer"
  const hasAudio = Boolean(raw.audio_url || raw.audioUrl || raw.audio_path)
  const showTextDefault = hasAudio ? false : true
  return {
    id: raw.id || raw.turn_id,
    role,
    text: raw.text || "",
    emotion: raw.emotion || "",
    audio_url: raw.audio_url || null,
    audio_seconds: raw.audio_seconds || null,
    audio_seconds_text: formatSeconds(raw.audio_seconds),
    analysis: raw.analysis || raw.analysis_json || null,
    showSuggestions: false,
    showText: showTextDefault,
    pending: Boolean(raw.pending),
  }
}

function makeLocalBeauticianTurn(filePath, durationSec) {
  const id = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`
  return {
    id,
    role: "beautician",
    text: "",
    emotion: "",
    audio_url: filePath,
    audio_seconds: durationSec || 0,
    audio_seconds_text: formatSeconds(durationSec),
    analysis: null,
    showSuggestions: false,
    showText: false,
    pending: true,
  }
}

Page({
  data: {
    sessionId: "",
    turns: [],
    loading: false,
    recording: false,
    endModalVisible: false,
    hintVisible: false,
    hintText: "",
    hintPoints: [],
    scrollIntoView: "",
    playingTurnId: "",
  },

  onLoad(options) {
    this.recorder = wx.getRecorderManager()
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCtx.onEnded(() => {
      this.setData({ playingTurnId: "" })
    })
    this.hasShownAudioError = false
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
        text: res.first_customer_turn.text,
        emotion: res.first_customer_turn.emotion,
        audio_url: res.first_customer_turn.audio_url,
        audio_seconds: res.first_customer_turn.audio_seconds,
      })
      this.setData({
        sessionId: res.session_id,
        turns: [first],
        loading: false,
        scrollIntoView: `turn-${first.id}`,
      })
      this.autoPlayTurn(first)
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
      this.setData({
        sessionId,
        turns,
        loading: false,
        scrollIntoView: last ? `turn-${last.id}` : "",
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "加载会话失败", icon: "none" })
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
      this.setData({ loading: false })
      wx.showToast({ title: err.message || "生成报告失败", icon: "none" })
    }
  },

  async endOnly() {
    const sessionId = this.data.sessionId
    if (!sessionId) return
    this.setData({ loading: true, endModalVisible: false })
    try {
      await request({
        baseUrl: API_BASE_URL,
        url: `/api/voice-coach/sessions/${sessionId}/end`,
        method: "POST",
        data: { mode: "end_only" },
      })
      // Prefer going back to where user came from. If not possible, fall back to a tab page.
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({ url: "/pages/mine/index" })
        },
      })
    } catch (err) {
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
        })
      } catch (err) {
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
    } catch (err) {
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

    // Add a local "sent" bubble immediately (WeChat-like), then replace it with server result.
    const localTurn = makeLocalBeauticianTurn(filePath, durationSec)
    const turnsNow = (this.data.turns || []).slice()
    turnsNow.push(localTurn)
    this.pendingLocalTurnId = localTurn.id
    this.setData({
      turns: turnsNow,
      scrollIntoView: `turn-${localTurn.id}`,
    })

    const token = getAccessToken()
    const deviceId = getDeviceId()

    wx.uploadFile({
      url: `${API_BASE_URL}/api/voice-coach/sessions/${sessionId}/beautician-turn`,
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
        } catch (err) {
          payload = null
        }

        if (!payload || payload.error) {
          this.setData({ loading: false })
          wx.showToast({ title: payload?.error || "上传失败", icon: "none" })
          // Remove pending local bubble on failure.
          const turns = (this.data.turns || []).filter((t) => t.id !== this.pendingLocalTurnId)
          this.pendingLocalTurnId = ""
          this.setData({ turns })
          return
        }

        const turns = (this.data.turns || []).slice()
        const beautician = normalizeTurn({
          turn_id: payload.beautician_turn.turn_id,
          role: "beautician",
          text: payload.beautician_turn.text,
          audio_url: payload.beautician_turn.audio_url,
          audio_seconds: payload.beautician_turn.audio_seconds,
          analysis: payload.analysis,
        })
        // Replace pending local bubble if present.
        const pendingId = this.pendingLocalTurnId
        this.pendingLocalTurnId = ""
        const idx = pendingId ? turns.findIndex((t) => t.id === pendingId) : -1
        if (idx >= 0) turns.splice(idx, 1, beautician)
        else turns.push(beautician)

        if (payload.next_customer_turn) {
          const customer = normalizeTurn({
            turn_id: payload.next_customer_turn.turn_id,
            role: "customer",
            text: payload.next_customer_turn.text,
            emotion: payload.next_customer_turn.emotion,
            audio_url: payload.next_customer_turn.audio_url,
            audio_seconds: payload.next_customer_turn.audio_seconds,
          })
          turns.push(customer)
          // Auto-play the customer reply as soon as it arrives.
          this.autoPlayTurn(customer)
        }

        const last = turns[turns.length - 1]
        this.setData({
          turns,
          loading: false,
          scrollIntoView: last ? `turn-${last.id}` : "",
        })

        if (payload.reached_max_turns) {
          wx.showToast({ title: "已达到最大轮数，建议结束查看报告", icon: "none" })
          this.openEndModal()
        }
      },
      fail: () => {
        this.setData({ loading: false })
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
      return { ...t, showText: !t.showText }
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
    this.setData({ loading: true })
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
        loading: false,
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

    try {
      if (this.data.playingTurnId === id) {
        this.audioCtx.stop()
        this.setData({ playingTurnId: "" })
        return
      }
      this.audioCtx.stop()
      this.audioCtx.src = url
      this.audioCtx.play()
      this.setData({ playingTurnId: id })
    } catch (err) {
      wx.showToast({ title: "播放失败", icon: "none" })
    }
  },

  autoPlayTurn(turn) {
    if (!turn || !turn.audio_url || !turn.id) return
    try {
      this.audioCtx.stop()
      this.audioCtx.src = turn.audio_url
      this.audioCtx.play()
      this.setData({ playingTurnId: turn.id })
    } catch (_) {
      // Ignore autoplay failures (some devices block autoplay).
    }
  },
})
