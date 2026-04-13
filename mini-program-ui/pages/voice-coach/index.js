const { track } = require("../../utils/track")

Page({
  onShow() {
    track("voice_coach_tab_view")
  },

  handleStart() {
    track("voice_coach_start_setup")
    wx.navigateTo({ url: "/pages/voice-coach/setup/index" })
  },

  handleProfiles() {
    track("voice_coach_customer_profiles_open")
    wx.navigateTo({ url: "/pages/voice-coach/customer-profiles/index" })
  },

  handleSceneCards() {
    track("voice_coach_scene_cards_open")
    wx.navigateTo({ url: "/pages/voice-coach/scene-cards/index" })
  },
})

