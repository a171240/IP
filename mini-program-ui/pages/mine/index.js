const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getProfile, getUser, isLoggedIn, logout } = require("../../utils/auth")

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function avatarInitial(name) {
  const text = String(name || "").trim()
  if (!text) return "我"
  return text.slice(0, 1).toUpperCase()
}

function resolveAccountDisplay(user, profile) {
  const metadata = user && user.user_metadata ? user.user_metadata : {}
  const displayName = firstText(
    metadata.nickname,
    metadata.nickName,
    metadata.name,
    profile?.nickname,
    profile?.nickName,
    user?.email,
    "WeChat User",
  )
  const avatarUrl = firstText(
    metadata.avatar_url,
    metadata.avatarUrl,
    metadata.picture,
    profile?.avatar_url,
    profile?.avatarUrl,
    user?.avatar_url,
    user?.avatarUrl,
  )
  return { displayName, avatarUrl, avatarInitial: avatarInitial(displayName) }
}

Page({
  data: {
    isLoggedIn: false,
    user: null,
    displayName: "",
    avatarUrl: "",
    avatarInitial: "我",

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
    const profile = getProfile()
    const account = resolveAccountDisplay(user, profile)

    this.setData({
      isLoggedIn: isLoggedIn(),
      user: user || null,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      avatarInitial: account.avatarInitial,
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
      const account = resolveAccountDisplay(res.user || this.data.user, p)
      this.setData({
        planId: p.plan || "",
        planLabel: p.plan_label || p.plan || "",
        creditsBalance: Number(p.credits_balance || 0),
        creditsUnlimited: Boolean(p.credits_unlimited),
        displayName: account.displayName || this.data.displayName,
        avatarUrl: account.avatarUrl || this.data.avatarUrl,
        avatarInitial: account.avatarInitial || this.data.avatarInitial,
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
    this.setData({ isLoggedIn: false, user: null, displayName: "", avatarUrl: "", avatarInitial: "我" })
    wx.showToast({ title: "已退出", icon: "none" })
  },
})
