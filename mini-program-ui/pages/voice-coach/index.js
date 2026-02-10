const { track } = require("../../utils/track")

Page({
  onShow() {
    track("voice_coach_tab_view")
  },

  handleStart() {
    track("voice_coach_start")
    wx.navigateTo({ url: "/pages/voice-coach/chat" })
  },
})

