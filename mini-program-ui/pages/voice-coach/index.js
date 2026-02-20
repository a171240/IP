const { API_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")

function normalizeCategory(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    subtitle: String(raw.subtitle || ""),
    objective: String(raw.objective || ""),
  }
}

function buildChatUrl(data) {
  const params = []
  const categoryId = String(data.selectedCategoryId || "sale")
  params.push(`categoryId=${encodeURIComponent(categoryId)}`)

  if (categoryId === "crisis") {
    const goalTemplateId = String(data.selectedGoalTemplateId || "")
    const goalCustom = String(data.goalCustom || "").trim()
    if (goalTemplateId) params.push(`goalTemplateId=${encodeURIComponent(goalTemplateId)}`)
    if (goalCustom) params.push(`goalCustom=${encodeURIComponent(goalCustom)}`)
  }

  return `/pages/voice-coach/chat?${params.join("&")}`
}

Page({
  data: {
    loadingCatalog: false,
    categories: [],
    selectedCategoryId: "sale",
    recommendation: null,
    crisisGoalTemplates: [],
    selectedGoalTemplateId: "",
    goalCustom: "",
  },

  onLoad() {
    this.loadCatalog()
  },

  onShow() {
    track("voice_coach_tab_view")
  },

  async loadCatalog() {
    this.setData({ loadingCatalog: true })
    try {
      const res = await request({
        baseUrl: API_BASE_URL,
        url: "/api/voice-coach/catalog",
        method: "GET",
      })

      const categories = Array.isArray(res.categories)
        ? res.categories.map(normalizeCategory).filter(Boolean)
        : []

      const recommendation = res.recommendation || null
      const recommendedCategoryId =
        recommendation && typeof recommendation.category_id === "string" ? recommendation.category_id : ""

      const selectedCategoryId =
        categories.find((item) => item.id === recommendedCategoryId)?.id ||
        categories.find((item) => item.id === "sale")?.id ||
        (categories[0] ? categories[0].id : "sale")

      const crisisGoalTemplates = Array.isArray(res.crisis_goal_templates) ? res.crisis_goal_templates : []
      const selectedGoalTemplateId =
        crisisGoalTemplates && crisisGoalTemplates[0] ? String(crisisGoalTemplates[0].goal_template_id || "") : ""

      this.setData({
        categories,
        recommendation,
        selectedCategoryId,
        crisisGoalTemplates,
        selectedGoalTemplateId,
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载类目失败", icon: "none" })
    } finally {
      this.setData({ loadingCatalog: false })
    }
  },

  onSelectCategory(e) {
    const categoryId = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!categoryId) return
    this.setData({ selectedCategoryId: categoryId })
  },

  onSelectGoalTemplate(e) {
    const goalTemplateId = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!goalTemplateId) return
    this.setData({ selectedGoalTemplateId: goalTemplateId })
  },

  onGoalCustomInput(e) {
    const value = e && e.detail ? String(e.detail.value || "") : ""
    this.setData({ goalCustom: value.slice(0, 80) })
  },

  handleStart() {
    const categoryId = this.data.selectedCategoryId || "sale"
    if (categoryId === "crisis" && !this.data.selectedGoalTemplateId) {
      wx.showToast({ title: "请先选择危机目标", icon: "none" })
      return
    }

    track("voice_coach_start", {
      categoryId,
      recommendationCategoryId: this.data.recommendation ? this.data.recommendation.category_id : "",
      usedRecommendation: Boolean(this.data.recommendation && this.data.recommendation.category_id === categoryId),
    })

    wx.navigateTo({ url: buildChatUrl(this.data) })
  },
})
