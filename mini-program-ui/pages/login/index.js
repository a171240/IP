const { loginWithProfile } = require("../../utils/auth")

Page({
  data: {
    loading: false,
  },

  handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    loginWithProfile()
      .then(() => {
        wx.showToast({ title: "登录成功", icon: "success" })
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({ url: "/pages/mine/index" })
        }
      })
      .catch(() => {
        wx.showToast({ title: "登录失败", icon: "none" })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },
})

