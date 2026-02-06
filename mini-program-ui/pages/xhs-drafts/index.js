const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")

function toAbsoluteUrl(url) {
  const v = String(url || "").trim()
  if (!v) return ""
  if (v.startsWith("http://") || v.startsWith("https://")) return v
  if (v.startsWith("/")) return `${IP_FACTORY_BASE_URL}${v}`
  return v
}

function formatTime(value) {
  const iso = String(value || "").trim()
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function riskLabel(draft) {
  const level = draft?.danger_risk_level
  const count = Number(draft?.danger_count || 0)
  if (!level) return "未检测"
  if (level === "high" || level === "critical") return `高风险 ${count} 处`
  if (level === "medium") return `需优化 ${count} 处`
  return "风控通过"
}

function statusLabel(status) {
  if (status === "published") return "已发布"
  return "草稿"
}

Page({
  data: {
    loading: false,
    drafts: [],
  },

  onShow() {
    track("xhs_drafts_view")
    this.loadDrafts()
  },

  async onPullDownRefresh() {
    await this.loadDrafts()
    wx.stopPullDownRefresh()
  },

  async loadDrafts() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/xhs/drafts?limit=50",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载失败")
      }

      const drafts = (res.drafts || []).map((d) => {
        const title = d.result_title || d.topic || "未命名"
        return {
          ...d,
          title,
          statusLabel: statusLabel(d.status),
          riskLabel: riskLabel(d),
          createdAtLabel: formatTime(d.created_at),
          coverAbs: d.cover_url ? toAbsoluteUrl(d.cover_url) : "",
          qrAbs: d.qr_url ? toAbsoluteUrl(d.qr_url) : "",
        }
      })

      this.setData({ drafts })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleOpenDraft(e) {
    const draftId = e.currentTarget.dataset.id
    if (!draftId) return
    const draft = (this.data.drafts || []).find((d) => d.id === draftId) || null
    track("xhs_draft_open", { draftId, status: draft ? draft.status : null })
    wx.navigateTo({ url: `/pages/xiaohongshu/index?draftId=${encodeURIComponent(draftId)}` })
  },

  handleGoWorkshop() {
    wx.navigateTo({ url: "/pages/xiaohongshu/index" })
  },

  async handleCopyContent(e) {
    const draftId = e.currentTarget.dataset.id
    if (!draftId) return

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/xhs/drafts/${encodeURIComponent(draftId)}`,
      })

      if (!res?.ok || !res?.draft) {
        throw new Error(res?.error || "获取草稿失败")
      }

      const content = res.draft.result_content || ""
      if (!content) {
        wx.showToast({ title: "无文案内容", icon: "none" })
        return
      }

      wx.setClipboardData({
        data: content,
        success: () => {
          track("xhs_draft_copy_content", { draftId })
          wx.showToast({ title: "已复制", icon: "success" })
        },
      })
    } catch (error) {
      wx.showToast({ title: error.message || "复制失败", icon: "none" })
    }
  },

  handleCopyUrl(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return

    wx.setClipboardData({
      data: String(url),
      success: () => {
        track("xhs_draft_copy_url")
        wx.showToast({ title: "已复制", icon: "success" })
      },
    })
  },
})

