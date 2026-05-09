const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { buildAbsoluteApiUrl } = require("../../utils/http-base")

const SIZE_OPTIONS = ["4:5", "3:4", "9:16", "16:9", "1:1"]
const RESOLUTION_OPTIONS = ["1k"]
const GOAL_TABS = [
  { key: "all", label: "全部" },
  { key: "acquire", label: "获客" },
  { key: "deal", label: "成交" },
  { key: "trust", label: "信任" },
  { key: "retain", label: "复购" },
  { key: "local", label: "探店" },
  { key: "menu", label: "菜单" },
]

function toAbsoluteUrl(url) {
  const v = String(url || "").trim()
  if (!v) return ""
  return buildAbsoluteApiUrl(v, IP_FACTORY_BASE_URL)
}

function isBillingError(err) {
  const code = err?.data?.code || err?.code
  const status = Number(err?.statusCode || err?.status || 0)
  if (status === 402) return true
  return code === "insufficient_credits" || code === "plan_required"
}

function handleBillingError(err) {
  if (!isBillingError(err)) return false
  const message = err?.message || err?.data?.error || "需要升级套餐或购买积分才能继续使用。"
  wx.showModal({
    title: "需要升级/积分",
    content: message,
    confirmText: "去购买",
    cancelText: "取消",
    success(res) {
      if (res.confirm) wx.navigateTo({ url: "/pages/pay/index" })
    },
  })
  return true
}

function canvasForSize(size) {
  if (size === "3:4") return { width: 900, height: 1200, size }
  if (size === "9:16") return { width: 900, height: 1600, size }
  if (size === "16:9") return { width: 1600, height: 900, size }
  if (size === "1:1") return { width: 1000, height: 1000, size }
  return { width: 900, height: 1125, size: "4:5" }
}

function buildPreviewBoxStyle(canvas) {
  const ratio = canvas.height / canvas.width
  return `padding-top:${Math.round(ratio * 10000) / 100}%;`
}

function filterTemplates(templates, group) {
  if (!group || group === "all") return templates
  return templates.filter((item) => item.group === group)
}

function normalizeTemplate(template) {
  const requiredFields = Array.isArray(template.requiredFields) ? template.requiredFields : []
  return {
    ...template,
    styleTags: Array.isArray(template.styleTags) ? template.styleTags : [],
    textRules: Array.isArray(template.textRules) ? template.textRules : [],
    requiredFields,
  }
}

function normalizeFields(template) {
  const fields = {}
  const specs = (template.requiredFields || []).map((item) => ({ ...item, value: item.defaultValue || "" }))
  specs.forEach((item) => {
    fields[item.key] = item.defaultValue || ""
  })
  return { fields, specs }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error(`download_failed:${res.statusCode}`))
      },
      fail: reject,
    })
  })
}

Page({
  data: {
    goalTabs: GOAL_TABS,
    activeGoal: "all",
    templates: [],
    visibleTemplates: [],
    templatesLoading: false,
    selectedTemplateId: "",
    selectedTemplate: null,
    selectedTemplateFields: [],
    fields: {},
    sizeOptions: SIZE_OPTIONS,
    resolutionOptions: RESOLUTION_OPTIONS,
    sizeIndex: 0,
    resolutionIndex: 0,
    size: "4:5",
    resolution: "1k",
    isGenerating: false,
    isSaving: false,
    posterId: "",
    posterImageUrl: "",
    actualPrompt: "",
    negativePrompt: "",
    warnings: [],
    previewBoxStyle: buildPreviewBoxStyle(canvasForSize("4:5")),
    lastError: "",
  },

  onLoad() {
    this.loadTemplates()
  },

  async loadTemplates() {
    this.setData({ templatesLoading: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/posters/templates",
        method: "GET",
      })
      const templates = (Array.isArray(res?.templates) ? res.templates : []).map(normalizeTemplate)
      const visibleTemplates = filterTemplates(templates, this.data.activeGoal)
      const first = visibleTemplates[0] || templates[0] || null
      this.setData({ templates, visibleTemplates })
      if (first && !this.data.selectedTemplateId) this.applyTemplate(first)
    } catch (error) {
      this.setData({ lastError: error.message || "模板加载失败" })
    } finally {
      this.setData({ templatesLoading: false })
    }
  },

  applyTemplate(template) {
    const normalized = normalizeTemplate(template)
    const { fields, specs } = normalizeFields(normalized)
    const size = normalized.defaultSize || "4:5"
    const resolution = "1k"
    const sizeIndex = Math.max(0, SIZE_OPTIONS.indexOf(size))
    const resolutionIndex = Math.max(0, RESOLUTION_OPTIONS.indexOf(resolution))
    const canvas = canvasForSize(size)
    this.setData({
      selectedTemplateId: normalized.id,
      selectedTemplate: normalized,
      selectedTemplateFields: specs,
      fields,
      size,
      resolution,
      sizeIndex,
      resolutionIndex,
      posterImageUrl: "",
      posterId: "",
      actualPrompt: "",
      negativePrompt: "",
      warnings: [],
      previewBoxStyle: buildPreviewBoxStyle(canvas),
      lastError: "",
    })
  },

  onGoalTap(e) {
    const group = e.currentTarget.dataset.group || "all"
    const visibleTemplates = filterTemplates(this.data.templates, group)
    const currentVisible = visibleTemplates.some((item) => item.id === this.data.selectedTemplateId)
    this.setData({ activeGoal: group, visibleTemplates })
    if (!currentVisible && visibleTemplates[0]) this.applyTemplate(visibleTemplates[0])
  },

  onSelectTemplate(e) {
    const id = e.currentTarget.dataset.id
    const template = this.data.templates.find((item) => item.id === id)
    if (template) this.applyTemplate(template)
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const value = e.detail.value
    this.setData({
      fields: {
        ...this.data.fields,
        [key]: value,
      },
      selectedTemplateFields: this.data.selectedTemplateFields.map((item) =>
        item.key === key ? { ...item, value } : item
      ),
    })
  },

  onSizeChange(e) {
    const sizeIndex = Number(e.detail.value || 0)
    const size = SIZE_OPTIONS[sizeIndex] || "4:5"
    const canvas = canvasForSize(size)
    this.setData({
      sizeIndex,
      size,
      previewBoxStyle: buildPreviewBoxStyle(canvas),
    })
  },

  onResolutionChange(e) {
    const resolutionIndex = Number(e.detail.value || 0)
    this.setData({
      resolutionIndex,
      resolution: RESOLUTION_OPTIONS[resolutionIndex] || "1k",
    })
  },

  async handleGenerate(e) {
    const strictText = e?.currentTarget?.dataset?.strict === "1"
    const { selectedTemplateId, fields, size, resolution } = this.data
    if (!selectedTemplateId) {
      wx.showToast({ title: "请选择海报目标", icon: "none" })
      return
    }

    this.setData({ isGenerating: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/posters/generate",
        method: "POST",
        data: {
          mode: "template",
          templateId: selectedTemplateId,
          fields: {
            ...fields,
            ...(strictText ? { _textStrictness: "strict" } : {}),
          },
          prompt: "",
          size,
          resolution,
        },
      })

      if (!res?.ok) throw new Error(res?.error || "海报生成失败")

      this.setData({
        posterId: res.posterId || "",
        posterImageUrl: toAbsoluteUrl(res.imageUrl),
        actualPrompt: res.prompt || "",
        negativePrompt: res.negativePrompt || "",
        warnings: Array.isArray(res.warnings) ? res.warnings : ["请核对海报里的中文、价格和日期。"],
        previewBoxStyle: buildPreviewBoxStyle(res.overlay?.canvas || canvasForSize(size)),
      })
      wx.showToast({ title: "海报已生成", icon: "success" })
    } catch (error) {
      if (handleBillingError(error)) return
      const message = error.message || "海报生成失败"
      this.setData({ lastError: message })
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ isGenerating: false })
    }
  },

  handleCopyPrompt() {
    const { actualPrompt, negativePrompt } = this.data
    const text = [actualPrompt, negativePrompt ? `\n负面提示词：${negativePrompt}` : ""].join("").trim()
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    })
  },

  async handleSavePoster() {
    const { posterImageUrl } = this.data
    if (!posterImageUrl) return
    this.setData({ isSaving: true })
    try {
      const tempPath = await downloadFile(posterImageUrl)
      wx.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: () => wx.showToast({ title: "已保存", icon: "success" }),
        fail: () => wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" }),
        complete: () => this.setData({ isSaving: false }),
      })
    } catch (error) {
      this.setData({ isSaving: false })
      wx.showToast({ title: error.message || "保存失败", icon: "none" })
    }
  },
})
