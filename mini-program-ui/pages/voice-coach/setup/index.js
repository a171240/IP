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
  saveSetupDraft,
} = require("../setup-storage")
const { ensureTestCustomerProfile } = require("../test-customer")

Page({
  data: {
    starting: false,
    preparingTestCustomer: false,
    customerProfile: null,
    customerMeta: "",
    sceneCard: null,
    sceneMeta: "",
    liveNotes: "",
    summaryLines: [],
  },

  onShow() {
    this.reloadSelections()
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
    wx.navigateTo({ url: "/pages/voice-coach/customer-profiles/index?pick=1" })
  },

  handleCreateCustomerProfile() {
    wx.navigateTo({ url: "/pages/voice-coach/customer-profile-editor/index?pick=1" })
  },

  async handleUseTestCustomer() {
    if (this.data.preparingTestCustomer) return

    this.setData({ preparingTestCustomer: true })
    try {
      const result = await ensureTestCustomerProfile(this.data.customerProfile ? [this.data.customerProfile] : [])
      saveSelectedCustomerProfile(result.profile)
      this.reloadSelections()
      wx.showToast({ title: result.created ? "测试顾客已生成" : "已切换到测试顾客", icon: "success" })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "生成测试顾客失败", icon: "none" })
    } finally {
      this.setData({ preparingTestCustomer: false })
    }
  },

  handleClearCustomerProfile() {
    clearSelectedCustomerProfile()
    this.reloadSelections()
  },

  handlePickSceneCard() {
    wx.navigateTo({ url: "/pages/voice-coach/scene-cards/index?pick=1" })
  },

  handleCreateSceneCard() {
    wx.navigateTo({ url: "/pages/voice-coach/scene-card-editor/index?pick=1" })
  },

  handleClearSceneCard() {
    clearSelectedSceneCard()
    this.reloadSelections()
  },

  handleStart() {
    if (this.data.starting) return

    const customerProfile = this.data.customerProfile
    const sceneCard = this.data.sceneCard
    const liveNotes = String(this.data.liveNotes || "").trim()

    if (!customerProfile && !sceneCard && !liveNotes) {
      wx.showToast({ title: "至少先选顾客档案、场景卡或补充说明", icon: "none" })
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

    wx.navigateTo({
      url: "/pages/voice-coach/chat",
      complete: () => {
        this.setData({ starting: false })
      },
    })
  },
})
