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
      if (res.confirm) {
        wx.navigateTo({ url: "/pages/pay/index" })
      }
    },
  })

  return true
}

function isTimeoutError(err) {
  const msg = String(err?.errMsg || err?.message || "").toLowerCase()
  return msg.includes("timeout")
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
    conflictLevel: "standard",
    topic: "",
    keywords: "",
    shopName: "",
    storeProfileId: "",
    storeProfileLabel: "未设置（可选）",
    isGenerating: false,
    isCoverLoading: false,
    isPublishing: false,
    resultTitle: "",
    resultContent: "",
    coverTitle: "",
    coverPrompt: "",
    pinnedComment: "",
    resultTags: [],
    dangerStatusText: "未检测",
    dangerStatusClass: "",
    coverImageUrl: "",
    publishResult: null,
  },

  onUnload() {
    this._stopPublishPoll = true
  },

  onLoad(query) {
    const draftId = (query && (query.draftId || query.draft_id)) ? String(query.draftId || query.draft_id).trim() : ""
    if (draftId) this.loadDraft(draftId)
  },

  onShow() {
    // Allow opening draft from tab page via storage (switchTab can't pass query).
    const pending = String(wx.getStorageSync("xhs_pending_draft_id") || "").trim()
    if (pending) {
      wx.removeStorageSync("xhs_pending_draft_id")
      this.loadDraft(pending)
    }

    // Refresh store profile label if set.
    const spid = String(wx.getStorageSync("xhs_store_profile_id") || "").trim()
    const splabel = String(wx.getStorageSync("xhs_store_profile_label") || "").trim()
    if (spid) {
      this.setData({
        storeProfileId: spid,
        storeProfileLabel: splabel || "已选择门店档案",
      })
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
        conflictLevel: d.conflict_level || this.data.conflictLevel,
        topic: d.topic || "",
        keywords: d.keywords || "",
        shopName: d.shop_name || "",
        resultTitle: d.result_title || "",
        resultContent: d.result_content || "",
        coverTitle: d.cover_title || "",
        pinnedComment: d.pinned_comment || "",
        coverPrompt: d.cover_prompt || "",
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
    wx.switchTab({ url: "/pages/xhs-drafts/index" })
  },

  onSelectType(e) {
    this.setData({ contentType: e.currentTarget.dataset.type })
  },

  onSelectConflict(e) {
    const level = String(e.currentTarget.dataset.level || "").trim()
    if (!level) return
    this.setData({ conflictLevel: level })
  },

  onTopicInput(e) {
    this.setData({ topic: e.detail.value })
  },

  onKeywordsInput(e) {
    this.setData({ keywords: e.detail.value })
  },

  handleOpenStoreProfiles() {
    wx.navigateTo({ url: "/pages/store-profiles/index" })
  },

  async handleGenerate() {
    const { topic, keywords, contentType, conflictLevel, storeProfileId } = this.data

    if (!topic.trim()) {
      wx.showToast({ title: "请先填写主题", icon: "none" })
      return
    }

    this.setData({
      isGenerating: true,
      // keep draftId if editing an existing draft; otherwise server will create.
      resultTitle: "",
      resultContent: "",
      coverTitle: "",
      pinnedComment: "",
      coverPrompt: "",
      resultTags: [],
      dangerStatusText: "检测中...",
      dangerStatusClass: "",
      coverImageUrl: "",
      publishResult: null,
    })

    try {
      const payload = {
        draft_id: this.data.draftId ? this.data.draftId : undefined,
        contentType,
        topic: topic.trim(),
        keywords: keywords.trim(),
        conflictLevel,
        store_profile_id: storeProfileId ? storeProfileId : undefined,
      }

      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/xhs/generate-v4",
        method: "POST",
        data: payload,
      })

      if (!res?.ok || !res?.draft?.id || !res?.result) {
        throw new Error(res?.error || "生成失败")
      }

      const r = res.result

      this.setData({
        draftId: res.draft.id,
        resultTitle: r.title || "未命名标题",
        resultContent: r.body || "",
        coverTitle: (r.coverText && r.coverText.main) ? r.coverText.main : "",
        pinnedComment: r.pinnedComment || "",
        coverPrompt: r.coverPrompt || "",
        resultTags: Array.isArray(r.tags) ? r.tags : [],
      })

      const gr = res.guardrails || null
      if (gr && gr.riskLevel) {
        // Map to the same UI badges
        const level = gr.riskLevel
        const count = Number(gr.dangerCount || 0)
        if (level === "high" || level === "critical") {
          this.setData({ dangerStatusText: `高风险 ${count} 处`, dangerStatusClass: "" })
        } else if (level === "medium") {
          this.setData({ dangerStatusText: `需优化 ${count} 处`, dangerStatusClass: "tag-accent" })
        } else {
          this.setData({ dangerStatusText: "风控通过", dangerStatusClass: "tag-success" })
        }
      } else {
        // Fallback: run danger-check if server didn't provide.
        await this.handleDangerCheck(r.body)
      }

      wx.showToast({ title: "已生成", icon: "success" })
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

  handleCopyPinned() {
    const { pinnedComment } = this.data
    if (!pinnedComment) return
    wx.setClipboardData({
      data: pinnedComment,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    })
  },

  handleCopyCoverPrompt() {
    const { coverPrompt } = this.data
    if (!coverPrompt) return
    wx.setClipboardData({
      data: coverPrompt,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
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

      if (draftId && isTimeoutError(error)) {
        wx.showToast({ title: "发布耗时较长，正在后台处理…", icon: "none" })

        // Poll draft status so users can still get the QR code after client-side timeout (60s limit).
        this._stopPublishPoll = false
        const startedAt = Date.now()
        const timeoutMs = 2 * 60 * 1000
        const intervalMs = 4000

        while (!this._stopPublishPoll && Date.now() - startedAt < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs))
          try {
            const res = await request({
              baseUrl: IP_FACTORY_BASE_URL,
              url: `/api/mp/xhs/drafts/${encodeURIComponent(draftId)}`,
            })

            const d = res?.draft
            if (res?.ok && d && (d.publish_url || d.qr_url || d.status === "published")) {
              this.setData({
                publishResult: {
                  publishUrl: d.publish_url || "",
                  qrImageUrl: d.qr_url ? toAbsoluteUrl(d.qr_url) : "",
                },
              })
              wx.showToast({ title: "发布结果已更新", icon: "success" })
              return
            }
          } catch (_) {
            // ignore and keep polling
          }
        }

        wx.showModal({
          title: "仍在发布中",
          content: "发布可能需要更久时间。你可以稍后在草稿库查看发布二维码。",
          confirmText: "打开草稿库",
          cancelText: "知道了",
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({ url: "/pages/xhs-drafts/index" })
            }
          },
        })
        return
      }

      wx.showToast({ title: error.message || "发布失败", icon: "none" })
    } finally {
      this.setData({ isPublishing: false })
    }
  },
})

