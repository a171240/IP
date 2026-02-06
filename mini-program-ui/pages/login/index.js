const { loginWithProfile } = require("../../utils/auth")
const { track } = require("../../utils/track")

Page({
  data: {
    loading: false,
  },

  handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    loginWithProfile()
      .then(() => {
        track("mp_login_with_profile_success")
        wx.showToast({ title: "登录成功", icon: "success" })
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: "/pages/mine/index" })
        }
      })
      .catch(() => {
        track("mp_login_with_profile_fail")
        wx.showToast({ title: "登录失败", icon: "none" })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },
})
