const { track } = require("../../../utils/track")
const {
  buildCustomerMeta,
  buildPendingVoiceCoachSetup,
  buildSceneMeta,
  buildSetupBrief,
  clearSelectedCustomerProfile,
  clearSelectedSceneCard,
  getSelectedCustomerProfile,
  getSelectedSceneCard,
  getSetupDraft,
  savePendingVoiceCoachSetup,
  saveSelectedCustomerProfile,
  saveSelectedSceneCard,
  saveSetupDraft,
} = require("../setup-storage")
const { ensureTestCustomerProfile } = require("../test-customer")
const { ensureTestSceneCard } = require("../test-scene-card")

const SETUP_TAG = "[vc-setup]"
const SETUP_DEBUG_LOG_LIMIT = 80

let setupDebugBuffer = []
let setupDebugSink = null

function formatSetupDebugValue(value) {
  if (value === null || value === undefined || value === "") return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

function emitSetupDebug(level, stage, meta = {}) {
  const normalized = {}

  Object.keys(meta || {}).forEach((key) => {
    const value = formatSetupDebugValue(meta[key])
    if (value) normalized[key] = value
  })

  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level,
    stage,
    metaText: Object.keys(normalized)
      .map((key) => `${key}: ${normalized[key]}`)
      .join("\n"),
    timeText: new Date().toTimeString().slice(0, 8),
  }

  setupDebugBuffer = setupDebugBuffer.concat(entry).slice(-SETUP_DEBUG_LOG_LIMIT)

  if (typeof setupDebugSink === "function") {
    try {
      setupDebugSink(setupDebugBuffer.slice())
    } catch (_) {}
  }

  try {
    const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.log
    logger(SETUP_TAG, stage, normalized)
  } catch (_) {}

  return normalized
}

function setupLog(stage, meta = {}) {
  return emitSetupDebug("log", stage, meta)
}

function setupWarn(stage, meta = {}) {
  return emitSetupDebug("warn", stage, meta)
}

function shouldEnableSetupDebug() {
  try {
    const accountInfo = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null
    const envVersion = accountInfo && accountInfo.miniProgram ? accountInfo.miniProgram.envVersion : ""
    return envVersion !== "release"
  } catch (_) {
    return true
  }
}

Page({
  data: {
    starting: false,
    preparingTestCustomer: false,
    preparingTestSceneCard: false,
    customerProfile: null,
    customerMeta: "",
    sceneCard: null,
    sceneMeta: "",
    liveNotes: "",
    summaryLines: [],
    debugPanelEnabled: false,
    debugPanelVisible: false,
    debugLogs: [],
  },

  onLoad() {
    this._debugPanelEnabled = shouldEnableSetupDebug()
    this._debugLogSink = (entries) => {
      if (!this._debugPanelEnabled) return
      this.setData({ debugLogs: entries })
    }

    if (this._debugPanelEnabled) {
      setupDebugSink = this._debugLogSink
    }

    this.setData({
      debugPanelEnabled: this._debugPanelEnabled,
      debugPanelVisible: false,
      debugLogs: this._debugPanelEnabled ? setupDebugBuffer.slice() : [],
    })

    setupLog("page.load")
  },

  onShow() {
    setupLog("page.show")
    this.reloadSelections()
  },

  onUnload() {
    if (setupDebugSink === this._debugLogSink) {
      setupDebugSink = null
    }
  },

  reloadSelections() {
    const customerProfile = getSelectedCustomerProfile()
    const sceneCard = getSelectedSceneCard()
    const draft = getSetupDraft()
    const liveNotes = draft && draft.live_notes ? draft.live_notes : ""
    const brief = buildSetupBrief({
      customerProfile,
      sceneCard,
      liveNotes,
    })

    this.setData({
      customerProfile: brief.customerProfile,
      customerMeta: brief.customerProfile ? buildCustomerMeta(brief.customerProfile) : "",
      sceneCard: brief.sceneCard,
      sceneMeta: brief.sceneCard ? buildSceneMeta(brief.sceneCard) : "",
      liveNotes: brief.liveNotes,
      summaryLines: brief.summaryLines,
    })

    setupLog("reloadSelections", {
      customerProfileId: brief.customerProfile ? brief.customerProfile.id : "",
      sceneCardId: brief.sceneCard ? brief.sceneCard.id : "",
      hasLiveNotes: Boolean(brief.liveNotes),
      summaryCount: brief.summaryLines.length,
    })
  },

  onLiveNotes(e) {
    const liveNotes = String((e && e.detail && e.detail.value) || "")
    saveSetupDraft({ live_notes: liveNotes })
    const brief = buildSetupBrief({
      customerProfile: this.data.customerProfile,
      sceneCard: this.data.sceneCard,
      liveNotes,
    })
    this.setData({
      liveNotes,
      summaryLines: brief.summaryLines,
    })
  },

  handlePickCustomerProfile() {
    setupLog("handlePickCustomerProfile")
    wx.navigateTo({ url: "/pages/voice-coach/customer-profiles/index?pick=1" })
  },

  handleCreateCustomerProfile() {
    setupLog("handleCreateCustomerProfile")
    wx.navigateTo({ url: "/pages/voice-coach/customer-profile-editor/index?pick=1" })
  },

  async handleUseTestCustomer() {
    if (this.data.preparingTestCustomer) return

    setupLog("handleUseTestCustomer:start", {
      currentCustomerId: this.data.customerProfile ? this.data.customerProfile.id : "",
    })

    this.setData({ preparingTestCustomer: true })
    try {
      const result = await ensureTestCustomerProfile(this.data.customerProfile ? [this.data.customerProfile] : [])
      saveSelectedCustomerProfile(result.profile)
      this.reloadSelections()
      setupLog("handleUseTestCustomer:ok", {
        created: Boolean(result.created),
        customerProfileId: result.profile ? result.profile.id : "",
      })
      wx.showToast({
        title: result.created ? "测试顾客已生成" : "已切换到测试顾客",
        icon: "success",
      })
    } catch (err) {
      setupWarn("handleUseTestCustomer:fail", {
        message: err && err.message ? err.message : "unknown_error",
      })
      wx.showToast({ title: (err && err.message) || "生成测试顾客失败", icon: "none" })
    } finally {
      this.setData({ preparingTestCustomer: false })
    }
  },

  handleClearCustomerProfile() {
    setupLog("handleClearCustomerProfile", {
      customerProfileId: this.data.customerProfile ? this.data.customerProfile.id : "",
    })
    clearSelectedCustomerProfile()
    this.reloadSelections()
  },

  handlePickSceneCard() {
    setupLog("handlePickSceneCard")
    wx.navigateTo({ url: "/pages/voice-coach/scene-cards/index?pick=1" })
  },

  handleCreateSceneCard() {
    setupLog("handleCreateSceneCard")
    wx.navigateTo({ url: "/pages/voice-coach/scene-card-editor/index?template=starter" })
  },

  async handleUseTestSceneCard() {
    if (this.data.preparingTestSceneCard) return

    setupLog("handleUseTestSceneCard:start", {
      currentSceneCardId: this.data.sceneCard ? this.data.sceneCard.id : "",
    })

    this.setData({ preparingTestSceneCard: true })
    try {
      const result = await ensureTestSceneCard(this.data.sceneCard ? [this.data.sceneCard] : [])
      saveSelectedSceneCard(result.card)
      this.reloadSelections()
      setupLog("handleUseTestSceneCard:ok", {
        created: Boolean(result.created),
        sceneCardId: result.card ? result.card.id : "",
      })
      wx.showToast({
        title: result.created ? "测试场景卡已生成" : "已切换到测试场景卡",
        icon: "success",
      })
    } catch (err) {
      setupWarn("handleUseTestSceneCard:fail", {
        message: err && err.message ? err.message : "unknown_error",
      })
      wx.showToast({ title: (err && err.message) || "生成测试场景卡失败", icon: "none" })
    } finally {
      this.setData({ preparingTestSceneCard: false })
    }
  },

  handleClearSceneCard() {
    setupLog("handleClearSceneCard", {
      sceneCardId: this.data.sceneCard ? this.data.sceneCard.id : "",
    })
    clearSelectedSceneCard()
    this.reloadSelections()
  },

  handleStart() {
    if (this.data.starting) return

    const customerProfile = this.data.customerProfile
    const sceneCard = this.data.sceneCard
    const liveNotes = String(this.data.liveNotes || "").trim()

    if (!customerProfile && !sceneCard && !liveNotes) {
      setupWarn("handleStart:block-empty")
      wx.showToast({ title: "至少先选顾客、场景卡或补充备注", icon: "none" })
      return
    }

    const setup = buildPendingVoiceCoachSetup({
      customerProfile,
      sceneCard,
      liveNotes,
    })

    saveSetupDraft({ live_notes: liveNotes })
    savePendingVoiceCoachSetup(setup)

    this.setData({ starting: true })
    track("voice_coach_setup_submit", {
      hasCustomerProfile: Boolean(setup.customer_profile_id),
      hasSceneCard: Boolean(setup.scene_card_id),
      hasLiveNotes: Boolean(setup.live_notes),
    })
    setupLog("handleStart:navigate", {
      customerProfileId: setup.customer_profile_id || "",
      sceneCardId: setup.scene_card_id || "",
      hasLiveNotes: Boolean(setup.live_notes),
    })

    wx.navigateTo({
      url: "/pages/voice-coach/chat",
      complete: () => {
        this.setData({ starting: false })
      },
    })
  },

  toggleDebugPanel() {
    if (!this._debugPanelEnabled) return
    this.setData({ debugPanelVisible: !this.data.debugPanelVisible })
  },

  closeDebugPanel() {
    if (!this._debugPanelEnabled) return
    this.setData({ debugPanelVisible: false })
  },

  clearDebugPanel() {
    setupDebugBuffer = []
    this.setData({ debugLogs: [], debugPanelVisible: true })
  },
})
