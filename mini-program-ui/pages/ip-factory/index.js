const { track } = require("../../utils/track")
const { openXhsCompose } = require("../../utils/nav")

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

  handleGoWorkflow() {
    track("ip_factory_go_workflow")
    wx.navigateTo({ url: "/pages/workflow/index" })
  },

  handleGoLibrary() {
    track("ip_factory_go_library")
    wx.navigateTo({ url: "/pages/library/index" })
  },

  handleGoXhs() {
    track("ip_factory_go_xhs")
    openXhsCompose()
  },
})

