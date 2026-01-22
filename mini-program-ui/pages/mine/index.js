const { getProfile, getUser, isLoggedIn, logout } = require("../../utils/auth")

Page({
  data: {
    isLoggedIn: false,
    user: null,
    displayName: "",
    avatarUrl: "",
  },

  onShow() {
    this.refreshUser()
  },

  refreshUser() {
    const user = getUser()
    const metadata = user && user.user_metadata ? user.user_metadata : {}
    const profile = getProfile()
    const displayName =
      metadata.nickname ||
      metadata.nickName ||
      profile?.nickname ||
      profile?.nickName ||
      user?.email ||
      "WeChat User"
    const avatarUrl = metadata.avatar_url || metadata.avatarUrl || profile?.avatarUrl || ""
    this.setData({
      isLoggedIn: isLoggedIn(),
      user: user || null,
      displayName,
      avatarUrl,
    })
  },

  handleLoginTap() {
    wx.navigateTo({ url: "/pages/login/index" })
  },

  handleLogout() {
    logout()
    this.setData({ isLoggedIn: false, user: null })
    wx.showToast({ title: "已退出", icon: "none" })
  },
})

