const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")
const { openXhsCompose } = require("../../utils/nav")

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

Page({
  data: {
    loading: false,
    reportId: "",
    report: null,
    createdAtLabel: "",
  },

  onLoad(query) {
    const reportId = query?.reportId ? String(query.reportId).trim() : ""
    if (!reportId) {
      wx.showToast({ title: "缺少 reportId", icon: "none" })
      return
    }
    this.setData({ reportId })
    this.loadReport(reportId)
  },

  async loadReport(reportId) {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/reports/${encodeURIComponent(reportId)}`,
      })

      if (!res?.ok || !res?.report) {
        throw new Error(res?.error || "加载失败")
      }

      const report = res.report
      this.setData({
        report,
        createdAtLabel: formatTime(report.created_at),
      })
      track("report_view", { reportId, stepId: report.step_id })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleCopy() {
    const content = this.data.report?.content || ""
    if (!String(content).trim()) return

    wx.setClipboardData({
      data: String(content),
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    })
  },

  handleGoXhs() {
    openXhsCompose()
  },
})
