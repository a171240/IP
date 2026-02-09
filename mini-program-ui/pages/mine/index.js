const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getProfile, getUser, isLoggedIn, logout } = require("../../utils/auth")

Page({
  data: {
    isLoggedIn: false,
    user: null,
    displayName: "",
    avatarUrl: "",

    profileLoading: false,
    planId: "",
    planLabel: "",
    creditsBalance: 0,
    creditsUnlimited: false,
  },

  onShow() {
    this.refreshUser()

    if (isLoggedIn()) {
      this.loadBillingSnapshot()
    } else {
      this.setData({
        planId: "",
        planLabel: "",
        creditsBalance: 0,
        creditsUnlimited: false,
      })
    }
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

  async loadBillingSnapshot() {
    if (this.data.profileLoading) return

    this.setData({ profileLoading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/profile",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载失败")
      }

      const p = res.profile || {}
      this.setData({
        planId: p.plan || "",
        planLabel: p.plan_label || p.plan || "",
        creditsBalance: Number(p.credits_balance || 0),
        creditsUnlimited: Boolean(p.credits_unlimited),
      })
    } catch (_) {
      // Ignore; keep UI usable even if the network request fails.
    } finally {
      this.setData({ profileLoading: false })
    }
  },

  handleUpgrade() {
    wx.navigateTo({ url: "/pages/pay/index" })
  },

  handleOrders() {
    wx.navigateTo({ url: "/pages/order/index" })
  },

  handleStoreProfiles() {
    wx.navigateTo({ url: "/pages/store-profiles/index" })
  },

  handleAdvanced() {
    wx.navigateTo({ url: "/pages/workflow/index" })
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
