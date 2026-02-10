const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

function placeLabel(p) {
  const city = String(p?.city || "").trim()
  const district = String(p?.district || "").trim()
  const v = [city, district].filter(Boolean).join(" ")
  return v
}

function metaLabel(p) {
  const shopType = String(p?.shop_type || "").trim()
  const offer = String(p?.main_offer_name || "").trim()
  const minutes = Number(p?.main_offer_duration_min || 0)
  const bits = []
  if (shopType) bits.push(shopType)
  if (offer) bits.push(offer)
  if (minutes) bits.push(`约${minutes}分钟`)
  return bits.join(" · ")
}

Page({
  data: {
    loading: false,
    profiles: [],
  },

  onShow() {
    this.loadProfiles()
  },

  async onPullDownRefresh() {
    await this.loadProfiles()
    wx.stopPullDownRefresh()
  },

  async loadProfiles() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/store-profiles?limit=50",
      })

      if (!res?.ok) throw new Error(res?.error || "加载失败")

      const profiles = (res.profiles || []).map((p) => ({
        ...p,
        placeLabel: placeLabel(p),
        metaLabel: metaLabel(p),
      }))

      this.setData({ profiles })
    } catch (e) {
      wx.showToast({ title: e.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleCreate() {
    wx.navigateTo({ url: "/pages/store-profile-editor/index" })
  },

  handleUse(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const p = (this.data.profiles || []).find((x) => x.id === id) || null
    const label = p ? `${p.name}${p.placeLabel ? " · " + p.placeLabel : ""}` : "已选择门店档案"
    wx.setStorageSync("xhs_store_profile_id", String(id))
    wx.setStorageSync("xhs_store_profile_label", label)
    wx.showToast({ title: "已选用", icon: "success" })
    wx.switchTab({ url: "/pages/xiaohongshu/index" })
  },

  handleEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/store-profile-editor/index?id=${encodeURIComponent(id)}` })
  },

  handleDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    wx.showModal({
      title: "删除档案",
      content: "确定删除该门店档案？（不可恢复）",
      confirmText: "删除",
      cancelText: "取消",
      success: async (res) => {
        if (!res.confirm) return
        try {
          const r = await request({
            baseUrl: IP_FACTORY_BASE_URL,
            url: `/api/mp/store-profiles/${encodeURIComponent(id)}`,
            method: "DELETE",
          })
          if (!r?.ok) throw new Error(r?.error || "删除失败")
          wx.showToast({ title: "已删除", icon: "success" })
          this.loadProfiles()
        } catch (err) {
          wx.showToast({ title: err.message || "删除失败", icon: "none" })
        }
      },
    })
  },
})
