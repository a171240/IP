const { IP_FACTORY_BASE_URL } = require("../../../utils/config")
const { request } = require("../../../utils/request")
const {
  buildCustomerMeta,
  getSelectedCustomerProfile,
  normalizeCustomerProfile,
  saveSelectedCustomerProfile,
  toTextList,
} = require("../setup-storage")
const { ensureTestCustomerProfile } = require("../test-customer")

function safeText(value) {
  return String(value || "").trim()
}

function mapProfile(item) {
  const profile = normalizeCustomerProfile(item)
  return {
    ...profile,
    metaLabel: buildCustomerMeta(profile),
    concernLabel: toTextList(profile.core_concerns, 3).join(" / "),
    trustLabel: toTextList(profile.trust_triggers, 3).join(" / "),
  }
}

Page({
  data: {
    loading: false,
    creatingTestProfile: false,
    pickMode: false,
    selectedId: "",
    profiles: [],
  },

  onLoad(query) {
    this.setData({
      pickMode: String((query && query.pick) || "") === "1",
    })
  },

  onShow() {
    this.loadProfiles()
  },

  async loadProfiles() {
    if (this.data.loading) return

    this.setData({ loading: true })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/voice-coach/customer-profiles?limit=50",
      })

      if (!res || !res.ok) throw new Error((res && res.error) || "加载失败")

      const selected = getSelectedCustomerProfile()
      const profiles = (res.profiles || []).map((item) => mapProfile(item))

      this.setData({
        selectedId: selected && selected.id ? selected.id : "",
        profiles,
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  activateProfile(profile, successTitle) {
    if (!profile || !profile.id) return

    saveSelectedCustomerProfile(profile)
    this.setData({ selectedId: profile.id })
    wx.showToast({ title: successTitle || "已设为当前顾客", icon: "success" })

    if (!this.data.pickMode) return

    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }

    wx.switchTab({ url: "/pages/voice-coach/index" })
  },

  handleCreate() {
    wx.navigateTo({ url: "/pages/voice-coach/customer-profile-editor/index" })
  },

  handleUse(e) {
    const id = safeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return

    const profile = (this.data.profiles || []).find((item) => item.id === id)
    if (!profile) return

    this.activateProfile(profile, "已设为当前顾客")
  },

  async handleUseTestProfile() {
    if (this.data.creatingTestProfile) return

    this.setData({ creatingTestProfile: true })
    try {
      const result = await ensureTestCustomerProfile(this.data.profiles)
      const profile = mapProfile(result.profile)
      const profiles = [profile].concat((this.data.profiles || []).filter((item) => item.id !== profile.id))

      this.setData({ profiles })
      this.activateProfile(profile, result.created ? "测试顾客已生成" : "已切换到测试顾客")
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "生成测试顾客失败", icon: "none" })
    } finally {
      this.setData({ creatingTestProfile: false })
    }
  },

  handleEdit(e) {
    const id = safeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: "/pages/voice-coach/customer-profile-editor/index?id=" + encodeURIComponent(id) })
  },

  handleDelete(e) {
    const id = safeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return

    wx.showModal({
      title: "删除顾客档案",
      content: "删除后不可恢复，确定删除这份顾客档案吗？",
      confirmText: "删除",
      cancelText: "取消",
      success: async (res) => {
        if (!res.confirm) return

        try {
          const result = await request({
            baseUrl: IP_FACTORY_BASE_URL,
            url: "/api/mp/voice-coach/customer-profiles/" + encodeURIComponent(id),
            method: "DELETE",
          })
          if (!result || !result.ok) throw new Error((result && result.error) || "删除失败")

          if (this.data.selectedId === id) {
            saveSelectedCustomerProfile(null)
            this.setData({ selectedId: "" })
          }

          wx.showToast({ title: "已删除", icon: "success" })
          this.loadProfiles()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || "删除失败", icon: "none" })
        }
      },
    })
  },
})
