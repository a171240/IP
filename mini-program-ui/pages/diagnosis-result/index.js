const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

const DIMENSION_LABELS = {
  positioning: "IP定位",
  content: "内容生产",
  efficiency: "效率系统",
  emotion: "情绪价值",
  conversion: "转化能力",
}

Page({
  data: {
    result: {},
    dimensionCards: [],
    actionPlan: [],
    scoreText: "--",
  },

  onLoad(query) {
    const id = query?.id || wx.getStorageSync("diagnosisId")
    if (!id) {
      wx.showToast({ title: "未找到诊断结果", icon: "none" })
      return
    }

    this.loadResult(id)
  },

  async loadResult(id) {
    try {
      const response = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/diagnosis/${id}`,
      })

      if (response?.success === false) {
        throw new Error(response.error || "获取结果失败")
      }

      const data = response?.data
      if (!data) {
        throw new Error(response?.error || "获取结果失败")
      }

      const summary = wx.getStorageSync("diagnosisSummary") || {}
      let scores = data.scores || {}
      if (typeof scores === "string") {
        try {
          scores = JSON.parse(scores)
        } catch (error) {
          scores = {}
        }
      }
      const order = ["positioning", "content", "efficiency", "emotion", "conversion"]
      const dimensionCards = order
        .filter((key) => scores[key])
        .map((key) => ({
          name: DIMENSION_LABELS[key] || key,
          percentage: scores[key]?.percentage || 0,
          status: scores[key]?.status || "—",
        }))

      let actionPlanRaw = data.actionPlan || []
      if (typeof actionPlanRaw === "string") {
        try {
          actionPlanRaw = JSON.parse(actionPlanRaw)
        } catch (error) {
          actionPlanRaw = []
        }
      }

      const actionPlan = Array.isArray(actionPlanRaw)
        ? actionPlanRaw.map((item) => {
            if (typeof item === "string") return item
            const week = item.week ? `第${item.week}周 · ` : ""
            const title = item.title || "行动建议"
            const tasks = Array.isArray(item.tasks) && item.tasks.length ? `：${item.tasks.join("、")}` : ""
            return `${week}${title}${tasks}`
          })
        : []

      const totalScore = Number(data.totalScore)

      this.setData({
        result: {
          totalScore: totalScore,
          level: data.level,
          levelLabel: summary.levelLabel || data.level,
        },
        dimensionCards,
        actionPlan,
        scoreText: Number.isFinite(totalScore) ? String(totalScore) : "--",
      })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    }
  },

  handleDownload() {
    wx.showToast({ title: "报告下载稍后开放", icon: "none" })
  },
})
