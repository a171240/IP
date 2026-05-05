const { track } = require("../../../utils/track")
const {
  buildCustomerMeta,
  buildPendingVoiceCoachSetup,
  clearSelectedCustomerProfile,
  getSelectedCustomerProfile,
  getSelectedSceneCard,
  savePendingVoiceCoachSetup,
  saveSelectedCustomerProfile,
} = require("../setup-storage")
const { ensureTestCustomerProfile } = require("../test-customer")

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
    customerProfile: null,
    customerMeta: "",
    debugPanelEnabled: false,
    debugPanelVisible: false,
    debugLogs: [],
    startingText: "",
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

    this.setData({
      customerProfile,
      customerMeta: customerProfile ? buildCustomerMeta(customerProfile) : "",
    })

    setupLog("reloadSelections", {
      customerProfileId: customerProfile ? customerProfile.id : "",
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

  async ensureSimulatedCustomer() {
    if (this.data.preparingTestCustomer) return null

    setupLog("ensureSimulatedCustomer:start", {
      currentCustomerId: this.data.customerProfile ? this.data.customerProfile.id : "",
    })

    this.setData({ preparingTestCustomer: true })
    try {
      const result = await ensureTestCustomerProfile(this.data.customerProfile ? [this.data.customerProfile] : [])
      saveSelectedCustomerProfile(result.profile)
      this.setData({
        customerProfile: result.profile,
        customerMeta: result.profile ? buildCustomerMeta(result.profile) : "",
      })
      setupLog("ensureSimulatedCustomer:ok", {
        created: Boolean(result.created),
        customerProfileId: result.profile ? result.profile.id : "",
      })
      return result.profile
    } catch (err) {
      setupWarn("ensureSimulatedCustomer:fail", {
        message: err && err.message ? err.message : "unknown_error",
      })
      wx.showToast({ title: (err && err.message) || "生成模拟顾客失败", icon: "none" })
      return null
    } finally {
      this.setData({ preparingTestCustomer: false })
    }
  },

  async handleUseTestCustomer() {
    const profile = await this.ensureSimulatedCustomer()
    if (!profile) return
    wx.showToast({ title: "已切换到模拟顾客", icon: "success" })
  },

  async handleGenerateAndStart() {
    if (this.data.starting) return

    const profile = await this.ensureSimulatedCustomer()
    if (!profile) return

    this.startTraining(profile, "simulated_customer")
  },

  handleClearCustomerProfile() {
    setupLog("handleClearCustomerProfile", {
      customerProfileId: this.data.customerProfile ? this.data.customerProfile.id : "",
    })
    clearSelectedCustomerProfile()
    this.reloadSelections()
  },

  handleStart() {
    this.startTraining(this.data.customerProfile, "customer_ready")
  },

  startTraining(customerProfile, source) {
    if (this.data.starting) return

    if (!customerProfile) {
      wx.showToast({ title: "请先生成或选择顾客", icon: "none" })
      return
    }

    this.setData({
      starting: true,
      startingText: "正在进入训练...",
    })

    const sceneCard = getSelectedSceneCard()
    const setup = buildPendingVoiceCoachSetup({
      customerProfile,
      sceneCard,
      liveNotes: "",
    })
    savePendingVoiceCoachSetup(setup)

    track("voice_coach_setup_submit", {
      source: source || "",
      hasCustomerProfile: Boolean(setup.customer_profile_id),
      hasSceneCard: Boolean(setup.scene_card_id),
      hasLiveNotes: false,
    })
    setupLog("startTraining:navigate", {
      source: source || "",
      customerProfileId: setup.customer_profile_id || "",
      sceneCardId: setup.scene_card_id || "",
    })

    wx.navigateTo({
      url: "/pages/voice-coach/chat",
      complete: () => {
        this.setData({
          starting: false,
          startingText: "",
        })
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
