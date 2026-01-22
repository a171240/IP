const { XHS_BASE_URL } = require("../../utils/config")
const { request, requestText } = require("../../utils/request")

function parseSsePayload(rawText) {
  if (!rawText || typeof rawText !== "string") return null

  const lines = rawText.split("\n")
  let lastEvent = null

  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) return

    const payload = trimmed.replace(/^data:\s*/, "")
    if (!payload || payload === "[DONE]") return

    try {
      const parsed = JSON.parse(payload)
      lastEvent = parsed
    } catch (error) {
      // Ignore partial JSON chunks
    }
  })

  return lastEvent
}

Page({
  data: {
    contentTypes: [
      { id: "treatment", label: "攻略" },
      { id: "education", label: "科普" },
      { id: "promotion", label: "避雷" },
      { id: "comparison", label: "对比" },
    ],
    contentType: "treatment",
    topic: "",
    keywords: "",
    shopName: "",
    isGenerating: false,
    isCoverLoading: false,
    isPublishing: false,
    resultTitle: "",
    resultContent: "",
    coverTitle: "",
    resultTags: [],
    dangerStatusText: "未检测",
    dangerStatusClass: "",
    coverImageUrl: "",
    publishResult: null,
  },

  onSelectType(e) {
    this.setData({ contentType: e.currentTarget.dataset.type })
  },

  onTopicInput(e) {
    this.setData({ topic: e.detail.value })
  },

  onKeywordsInput(e) {
    this.setData({ keywords: e.detail.value })
  },

  onShopInput(e) {
    this.setData({ shopName: e.detail.value })
  },

  async handleGenerate() {
    const { topic, keywords, shopName, contentType } = this.data
    if (!topic.trim()) {
      wx.showToast({ title: "请先填写主题", icon: "none" })
      return
    }

    this.setData({
      isGenerating: true,
      resultTitle: "",
      resultContent: "",
      coverTitle: "",
      resultTags: [],
      dangerStatusText: "检测中...",
      dangerStatusClass: "",
      coverImageUrl: "",
      publishResult: null,
    })

    try {
      const payload = {
        topic: topic.trim(),
        keywords: keywords.trim(),
        shopName: shopName.trim(),
        contentType,
      }

      const raw = await requestText({
        baseUrl: XHS_BASE_URL,
        url: "/api/rewrite-premium",
        method: "POST",
        data: payload,
      })

      let result = null
      if (typeof raw === "string") {
        const parsed = parseSsePayload(raw)
        if (parsed?.step === "error") {
          throw new Error(parsed.error || "生成失败")
        }
        result = parsed?.data || parsed
      } else {
        result = raw?.data || raw
      }
      if (!result?.content) {
        throw new Error("未获取到文案结果")
      }

      this.setData({
        resultTitle: result.title || "未命名标题",
        resultContent: result.content || "",
        coverTitle: result.coverTitle || "",
        resultTags: Array.isArray(result.tags) ? result.tags : [],
      })

      await this.handleDangerCheck(result.content)
      wx.showToast({ title: "文案已生成", icon: "success" })
    } catch (error) {
      this.setData({
        dangerStatusText: "未检测",
        dangerStatusClass: "",
      })
      wx.showToast({ title: error.message || "生成失败", icon: "none" })
    } finally {
      this.setData({ isGenerating: false })
    }
  },

  async handleDangerCheck(content) {
    if (!content) return

    try {
      const result = await request({
        baseUrl: XHS_BASE_URL,
        url: "/api/content/danger-check",
        method: "POST",
        data: { content },
      })

      if (result?.success === false) {
        throw new Error(result.error || "雷区检测失败")
      }

      const danger = result?.data
      if (!danger) return

      let statusText = "风控通过"
      let statusClass = "tag-success"

      if (danger.riskLevel === "high" || danger.riskLevel === "critical") {
        statusText = `高风险 ${danger.dangerCount || 0} 处`
        statusClass = ""
      } else if (danger.riskLevel === "medium") {
        statusText = `需优化 ${danger.dangerCount || 0} 处`
        statusClass = "tag-accent"
      }

      this.setData({
        dangerStatusText: statusText,
        dangerStatusClass: statusClass,
      })
    } catch (error) {
      this.setData({
        dangerStatusText: "检测失败",
        dangerStatusClass: "",
      })
    }
  },

  async handleGenerateCover() {
    const { resultContent, contentType, coverTitle, resultTitle, resultTags } = this.data
    if (!resultContent) {
      wx.showToast({ title: "请先生成文案", icon: "none" })
      return
    }

    this.setData({ isCoverLoading: true })

    try {
      const response = await request({
        baseUrl: XHS_BASE_URL,
        url: "/api/generate-cover-image",
        method: "POST",
        data: {
          content: resultContent,
          contentType,
          preExtracted: {
            title: coverTitle || resultTitle,
            keywords: resultTags,
          },
        },
      })

      if (response?.success === false) {
        throw new Error(response.error || "封面生成失败")
      }

      const imageUrl = response?.imageUrl || response?.imageBase64
      if (!imageUrl) {
        throw new Error("封面生成失败")
      }

      this.setData({ coverImageUrl: imageUrl })
      wx.showToast({ title: "封面已生成", icon: "success" })
    } catch (error) {
      wx.showToast({ title: error.message || "封面生成失败", icon: "none" })
    } finally {
      this.setData({ isCoverLoading: false })
    }
  },

  handleCopy() {
    const { resultContent } = this.data
    if (!resultContent) return

    wx.setClipboardData({
      data: resultContent,
      success: () => {
        wx.showToast({ title: "已复制", icon: "success" })
      },
    })
  },

  async handlePublish() {
    const { resultTitle, resultContent, coverImageUrl, resultTags } = this.data
    if (!resultContent || !coverImageUrl) {
      wx.showToast({ title: "请先生成文案与封面", icon: "none" })
      return
    }

    this.setData({ isPublishing: true })

    try {
      const response = await request({
        baseUrl: XHS_BASE_URL,
        url: "/api/publish-note",
        method: "POST",
        data: {
          title: resultTitle,
          content: resultContent,
          coverImageUrl,
          tags: resultTags || [],
        },
      })

      if (!response?.success) {
        throw new Error(response?.error || "发布失败")
      }

      this.setData({ publishResult: response.data || null })
      wx.showToast({ title: "发布成功", icon: "success" })
    } catch (error) {
      wx.showToast({ title: error.message || "发布失败", icon: "none" })
    } finally {
      this.setData({ isPublishing: false })
    }
  },
})
