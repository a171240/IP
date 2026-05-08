const { loginWithCode } = require("../../utils/auth")
const { track } = require("../../utils/track")

Page({
  data: {
    loading: false,
    avatarUrl: "",
    nickname: "",
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    if (avatarUrl) {
      this.setData({ avatarUrl })
    }
  },

  onNicknameChange(e) {
    this.setData({ nickname: e.detail.value || "" })
  },

  handleLogin() {
    if (this.data.loading) return
    this.setData({ loading: true })

    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          this.setData({ loading: false })
          wx.showToast({ title: "获取登录凭证失败", icon: "none" })
          return
        }

        const profile = {
          nickName: this.data.nickname || "",
          avatarUrl: this.data.avatarUrl || "",
        }

        loginWithCode(loginRes.code, profile)
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
      fail: () => {
        track("mp_login_with_profile_fail")
        wx.showToast({ title: "登录失败", icon: "none" })
        this.setData({ loading: false })
      },
    })
  },
})
