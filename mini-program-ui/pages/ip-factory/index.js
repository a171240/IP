const { track } = require("../../utils/track")

Page({
  onShow() {
    track("ip_factory_view")
  },

  handleGoP7() {
    track("ip_factory_go_p7")
    wx.navigateTo({ url: "/pages/workflow-p7/index" })
  },

  handleGoP8() {
    track("ip_factory_go_p8")
    wx.navigateTo({ url: "/pages/workflow-p8/index" })
  },

  handleGoLibrary() {
    track("ip_factory_go_library")
    wx.navigateTo({ url: "/pages/library/index" })
  },

  handleGoXhs() {
    track("ip_factory_go_xhs")
    wx.navigateTo({ url: "/pages/xiaohongshu/index" })
  },
})

