const { track } = require("../../utils/track")
const { request } = require("../../utils/request")
const { VOICE_COACH_HTTP_BASE_URL } = require("../../utils/config")
const {
  buildCustomerMeta,
  buildPendingVoiceCoachSetup,
  getSelectedCustomerProfile,
  getSelectedSceneCard,
  savePendingVoiceCoachSetup,
} = require("./setup-storage")

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function isSameDate(left, right) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function formatHistoryTime(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ""
  const now = new Date()
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (isSameDate(date, now)) return `今天 ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDate(date, yesterday)) return `昨天 ${time}`

  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

function normalizeHistoryItem(raw) {
  const score = typeof raw.score === "number" ? raw.score : null
  const canViewReport = Boolean(raw.can_view_report)
  return {
    id: String(raw.id || ""),
    title: String(raw.title || "话术训练").trim(),
    subtitle: String(raw.subtitle || "").trim(),
    statusLabel: String(raw.status_label || (canViewReport ? "已完成" : "训练中")).trim(),
    startedAtText: formatHistoryTime(raw.started_at),
    scoreLabel: raw.score_label || (score === null ? "" : `${score}分`),
    focusTitle: String(raw.focus_title || "").trim(),
    focusCopy: String(raw.focus_copy || "").trim(),
    canViewReport,
    actionText: canViewReport ? "看报告" : "继续练",
    isFollowup: Boolean(raw.is_followup),
  }
}

Page({
  data: {
    customerProfile: null,
    customerMeta: "",
    heroStatusLabel: "未选择顾客",
    heroSubtitle: "没有当前顾客时，先生成一位模拟顾客；有顾客后会直接进入语音训练。",
    startButtonText: "开始练习",
    customerCardCopy: "首次到店 / 预算敏感 / 老客复购",
    customerCardAction: "去准备",
    recentText: "当前：先准备顾客，再进入训练",
    trainingHistory: [],
    historyLoading: false,
    historyError: "",
  },

  onShow() {
    this.refreshCustomerState()
    this.refreshTrainingHistory()
    track("voice_coach_tab_view")
  },

  refreshCustomerState() {
    const customerProfile = getSelectedCustomerProfile()
    const customerMeta = customerProfile ? buildCustomerMeta(customerProfile) : ""

    this.setData({
      customerProfile,
      customerMeta,
      heroStatusLabel: customerProfile ? "顾客已就绪" : "未选择顾客",
      heroSubtitle: customerProfile
        ? `当前顾客：${customerProfile.name}。点击后直接进入语音训练。`
        : "没有当前顾客时，先生成一位模拟顾客；有顾客后会直接进入语音训练。",
      startButtonText: customerProfile ? "直接开练" : "准备顾客并开练",
      customerCardCopy: customerProfile
        ? [customerProfile.name, customerMeta].filter(Boolean).join(" · ")
        : "首次到店 / 预算敏感 / 老客复购",
      customerCardAction: customerProfile ? "当前顾客" : "去准备",
      recentText: customerProfile
        ? `当前：围绕 ${customerProfile.name} 直接训练`
        : "当前：先准备顾客，再进入训练",
    })
  },

  handleStart() {
    const customerProfile = getSelectedCustomerProfile()
    const sceneCard = getSelectedSceneCard()

    if (!customerProfile) {
      track("voice_coach_start_customer_required")
      wx.navigateTo({ url: "/pages/voice-coach/setup/index" })
      return
    }

    const setup = buildPendingVoiceCoachSetup({
      customerProfile,
      sceneCard,
      liveNotes: "",
    })
    savePendingVoiceCoachSetup(setup)

    track("voice_coach_start_direct", {
      hasCustomerProfile: Boolean(setup.customer_profile_id),
      hasSceneCard: Boolean(setup.scene_card_id),
    })
    wx.navigateTo({ url: "/pages/voice-coach/chat" })
  },

  handleProfiles() {
    track("voice_coach_customer_profiles_open")
    wx.navigateTo({ url: "/pages/voice-coach/customer-profiles/index" })
  },

  handleSceneCards() {
    track("voice_coach_project_start_open")
    wx.navigateTo({ url: "/pages/voice-coach/scene-cards/index" })
  },

  async refreshTrainingHistory() {
    const requestId = Date.now()
    this._historyRequestId = requestId
    this.setData({ historyLoading: true, historyError: "" })

    try {
      const res = await request({
        baseUrl: VOICE_COACH_HTTP_BASE_URL,
        url: "/api/voice-coach/sessions?limit=6",
        method: "GET",
      })
      if (this._historyRequestId !== requestId) return
      const trainingHistory = (res.sessions || []).map(normalizeHistoryItem).filter((item) => item.id)
      this.setData({
        trainingHistory,
        historyLoading: false,
        historyError: "",
      })
    } catch (err) {
      if (this._historyRequestId !== requestId) return
      this.setData({
        historyLoading: false,
        historyError: err && err.message ? err.message : "训练记录加载失败",
      })
    }
  },

  openTrainingRecord(e) {
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!id) return
    const item = (this.data.trainingHistory || []).find((record) => record.id === id)
    if (!item) return

    track("voice_coach_history_open", {
      sessionId: id,
      canViewReport: item.canViewReport,
    })

    if (item.canViewReport) {
      wx.navigateTo({ url: `/pages/voice-coach/report?sessionId=${id}` })
      return
    }

    wx.navigateTo({ url: `/pages/voice-coach/chat?sessionId=${id}` })
  },
})

