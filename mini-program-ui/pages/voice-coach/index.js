const { track } = require("../../utils/track")
const {
  buildCustomerMeta,
  buildPendingVoiceCoachSetup,
  getSelectedCustomerProfile,
  getSelectedSceneCard,
  savePendingVoiceCoachSetup,
} = require("./setup-storage")

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
  },

  onShow() {
    this.refreshCustomerState()
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
})

