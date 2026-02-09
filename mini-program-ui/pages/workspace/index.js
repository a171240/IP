const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")
const { track } = require("../../utils/track")
const { openXhsCompose, openXhsDrafts } = require("../../utils/nav")

function formatMoneyFen(fen) {
  const n = Number(fen || 0)
  return `${(n / 100).toFixed(0)} 元`
}

function shortId(value) {
  const s = String(value || "")
  return s.length > 6 ? s.slice(-6) : s
}

function statusText(status) {
  if (status === "done") return "已生成"
  if (status === "failed") return "失败"
  return "生成中"
}

Page({
  data: {
    loading: false,

    planLabel: "",
    creditsLabel: "",
    progressPercent: 0,

    recentXhsDrafts: [],
    recentDeliveryPacks: [],
    recentOrders: [],
  },

  onShow() {
    this.loadWorkbench()
  },

  async onPullDownRefresh() {
    await this.loadWorkbench()
    wx.stopPullDownRefresh()
  },

  async loadWorkbench() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/workbench",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载失败")
      }

      const profile = res.profile || {}
      const progress = res.progress || {}
      const recent = res.recent || {}

      const creditsLabel = profile.credits_unlimited
        ? "积分 无限"
        : `积分 ${Number(profile.credits_balance || 0)}`

      const recentOrders = (recent.orders || []).map((o) => ({
        ...o,
        shortId: shortId(o.out_trade_no),
        amountLabel: formatMoneyFen(o.amount_total),
      }))

      this.setData({
        planLabel: profile.plan_label || profile.plan || "",
        creditsLabel,
        progressPercent: Number(progress.percent || 0),
        recentXhsDrafts: (recent.xhs_drafts || []).map((d) => ({
          ...d,
          coverUrl: d.cover_url ? `${IP_FACTORY_BASE_URL}${d.cover_url}` : "",
          qrUrl: d.qr_url ? `${IP_FACTORY_BASE_URL}${d.qr_url}` : "",
        })),
        recentDeliveryPacks: (recent.delivery_packs || []).map((p) => ({
          ...p,
          shortId: shortId(p.id),
          statusText: statusText(p.status),
        })),
        recentOrders,
      })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleGoXhs() {
    track("workspace_go_xhs")
    openXhsCompose()
  },

  handleGoIpFactory() {
    track("workspace_go_ip_factory")
    wx.navigateTo({ url: "/pages/ip-factory/index" })
  },

  handleGoWorkflow() {
    track("workspace_go_workflow")
    wx.navigateTo({ url: "/pages/workflow/index" })
  },

  handleGoLibrary() {
    track("workspace_go_library")
    wx.navigateTo({ url: "/pages/library/index" })
  },

  handleGoDrafts() {
    track("workspace_go_drafts")
    openXhsDrafts()
  },

  handleOpenDraft(e) {
    const draftId = e.currentTarget.dataset.id
    if (!draftId) {
      this.handleGoXhs()
      return
    }

    openXhsCompose(draftId)
  },

  handleGoDiagnosis() {
    wx.navigateTo({ url: "/pages/diagnosis/index" })
  },

  handleGoPay() {
    wx.navigateTo({ url: "/pages/pay/index" })
  },

  handleGoOrders() {
    wx.navigateTo({ url: "/pages/order/index" })
  },

  handleOpenPack(e) {
    const packId = e.currentTarget.dataset.id
    if (!packId) return

    const token = getAccessToken()
    if (!token) {
      wx.navigateTo({ url: "/pages/login/index" })
      return
    }

    wx.showLoading({ title: "下载中" })

    wx.downloadFile({
      url: `${IP_FACTORY_BASE_URL}/api/mp/delivery-pack/${packId}/download`,
      header: {
        Authorization: `Bearer ${token}`,
        "x-device-id": getDeviceId(),
      },
      success: (downloadRes) => {
        if (downloadRes.statusCode < 200 || downloadRes.statusCode >= 300) {
          wx.hideLoading()
          wx.showToast({ title: "下载失败", icon: "none" })
          return
        }

        wx.openDocument({
          filePath: downloadRes.tempFilePath,
          showMenu: true,
          success: () => {
            wx.hideLoading()
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: "打开失败", icon: "none" })
          },
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: "下载失败", icon: "none" })
      },
    })
  },
})
