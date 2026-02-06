const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request, requestText } = require("../../utils/request")

function toAbsoluteUrl(url) {
  const v = String(url || "").trim()
  if (!v) return ""
  if (v.startsWith("http://") || v.startsWith("https://")) return v
  if (v.startsWith("/")) return `${IP_FACTORY_BASE_URL}${v}`
  return v
}
function parseSsePayload(rawText) {
  if (!rawText || typeof rawText !== "string") return null

  const lines = rawText.split("\n")
  let lastEvent = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) continue

    const payload = trimmed.replace(/^data:\s*/, "")
    if (!payload || payload === "[DONE]") continue

    try {
      lastEvent = JSON.parse(payload)
    } catch (_) {
      // Ignore partial JSON chunks.
    }
  }

  return lastEvent
}

function isBillingError(err) {
  const code = err?.data?.code || err?.code
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
      if (res.confirm) {
        wx.navigateTo({ url: "/pages/pay/index" })
      }
    },
  })

  return true
}

Page({
  data: {
    draftId: "",
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

  onLoad(query) {
    const draftId = (query && (query.draftId || query.draft_id)) ? String(query.draftId || query.draft_id).trim() : ""
    if (draftId) {
      this.loadDraft(draftId)
    }
  },

  async loadDraft(draftId) {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/xhs/drafts/${encodeURIComponent(draftId)}`,
      })

      if (!res?.ok || !res?.draft) {
        throw new Error(res?.error || "加载草稿失败")
      }

      const d = res.draft || {}
      const tags = Array.isArray(d.tags) ? d.tags : []

      const riskLevel = d.danger_risk_level
      const dangerCount = Number(d.danger_count || 0)

      let dangerStatusText = "未检测"
      let dangerStatusClass = ""

      if (riskLevel === "high" || riskLevel === "critical") {
        dangerStatusText = `高风险 ${dangerCount} 处`
        dangerStatusClass = ""
      } else if (riskLevel === "medium") {
        dangerStatusText = `需优化 ${dangerCount} 处`
        dangerStatusClass = "tag-accent"
      } else if (riskLevel) {
        dangerStatusText = "风控通过"
        dangerStatusClass = "tag-success"
      }

      const coverImageUrl = d.cover_url ? toAbsoluteUrl(d.cover_url) : ""

      let publishResult = null
      if (d.publish_url || d.qr_url || d.status === "published") {
        publishResult = {
          publishUrl: d.publish_url || "",
          qrImageUrl: d.qr_url ? toAbsoluteUrl(d.qr_url) : "",
        }
      }

      this.setData({
        draftId: d.id || draftId,
        contentType: d.content_type || this.data.contentType,
        topic: d.topic || "",
        keywords: d.keywords || "",
        shopName: d.shop_name || "",
        resultTitle: d.result_title || "",
        resultContent: d.result_content || "",
        coverTitle: d.cover_title || "",
        resultTags: tags,
        dangerStatusText,
        dangerStatusClass,
        coverImageUrl,
        publishResult,
      })

      // For drafts created from other sources (e.g. P8 script conversion), auto run danger-check once.
      if (d.result_content && !riskLevel) {
        this.setData({ dangerStatusText: "检测中...", dangerStatusClass: "" })
        await this.handleDangerCheck(d.result_content)
      }
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    }
  },

  handleOpenDrafts() {
    wx.navigateTo({ url: "/pages/xhs-drafts/index" })
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
      draftId: "",
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
      const draft = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/xhs/drafts",
        method: "POST",
        data: {
          contentType,
          topic: topic.trim(),
          keywords: keywords.trim(),
          shopName: shopName.trim(),
          source: "mp",
        },
      })

      if (!draft?.ok || !draft?.draft?.id) {
        throw new Error(draft?.error || "创建草稿失败")
      }

      const draftId = draft.draft.id
      this.setData({ draftId })

      const payload = {
        topic: topic.trim(),
        keywords: keywords.trim(),
        shopName: shopName.trim(),
        contentType,
        draft_id: draftId,
      }

      const raw = await requestText({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/xhs/rewrite-premium",
        method: "POST",
        data: payload,
      })

      const parsed = typeof raw === "string" ? parseSsePayload(raw) : raw
      if (parsed?.step === "error") {
        throw new Error(parsed.error || "生成失败")
      }

      const result = parsed?.data || parsed
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
      if (handleBillingError(error)) return

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
      const { draftId } = this.data
      const result = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/xhs/content/danger-check",
        method: "POST",
        data: { content, ...(draftId ? { draft_id: draftId } : {}) },
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
    } catch (_) {
      this.setData({
        dangerStatusText: "检测失败",
        dangerStatusClass: "",
      })
    }
  },

  async handleGenerateCover() {
    const { resultContent, contentType, coverTitle, resultTitle, resultTags, draftId } = this.data

    if (!resultContent) {
      wx.showToast({ title: "请先生成文案", icon: "none" })
      return
    }

    this.setData({ isCoverLoading: true })

    try {
      const response = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/xhs/generate-cover-image",
        method: "POST",
        data: {
          content: resultContent,
          contentType,
          ...(draftId ? { draft_id: draftId } : {}),
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

      this.setData({ coverImageUrl: toAbsoluteUrl(imageUrl) })
      wx.showToast({ title: "封面已生成", icon: "success" })
    } catch (error) {
      if (handleBillingError(error)) return
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
    const { resultTitle, resultContent, coverImageUrl, resultTags, draftId } = this.data

    if (!resultContent || !coverImageUrl) {
      wx.showToast({ title: "请先生成文案与封面", icon: "none" })
      return
    }

    this.setData({ isPublishing: true })

    try {
      const response = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/xhs/publish-note",
        method: "POST",
        data: {
          title: resultTitle,
          content: resultContent,
          coverImageUrl,
          tags: resultTags || [],
          ...(draftId ? { draft_id: draftId } : {}),
        },
      })

      if (!response?.success) {
        throw new Error(response?.error || "发布失败")
      }

      const data = response.data ? { ...response.data } : null
      if (data && data.qrImageUrl) data.qrImageUrl = toAbsoluteUrl(data.qrImageUrl)
      this.setData({ publishResult: data })
      wx.showToast({ title: "发布成功", icon: "success" })
    } catch (error) {
      if (handleBillingError(error)) return
      wx.showToast({ title: error.message || "发布失败", icon: "none" })
    } finally {
      this.setData({ isPublishing: false })
    }
  },
})

