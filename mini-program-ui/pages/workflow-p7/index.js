const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request, requestTextWithMeta } = require("../../utils/request")
const { parseChatSse } = require("../../utils/sse")
const { track } = require("../../utils/track")
const { estimateWorkflowCreditsCost, parseCreditsFromHeaders, normalizePlan } = require("../../utils/credits")

function formatDateLabel() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
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

function buildPrompt(data) {
  const lines = [
    "请为我生成一份可直接执行的《选题库》（包含 TOP20 推荐 + 每周建议）。",
    data.platform ? `平台：${data.platform}` : null,
    data.industry ? `行业：${data.industry}` : null,
    data.offerDesc ? `卖什么：${data.offerDesc}` : null,
    data.targetAudience ? `卖给谁：${data.targetAudience}` : null,
    data.tone ? `口吻：${data.tone}` : null,
    data.extra ? `补充：${data.extra}` : null,
    "",
    "要求：",
    "- 先给 TOP20（按 流量潜力/品牌安全/转化价值/执行难度 打分并简要说明）",
    "- 再给 7 天日历（每天 标题/类型(引流/建信/转化)/一句话钩子/CTA）",
    "- 再给完整清单（热点/故事/行业观点），并标注风险等级（低/中/高）",
  ].filter(Boolean)

  return lines.join("\n")
}

Page({
  data: {
    loadingContext: false,
    contextReports: [],
    missingRequired: [],
    missingOptional: [],
    missingRequiredLabel: "",
    missingOptionalLabel: "",

    platform: "小红书",
    industry: "",
    offerDesc: "",
    targetAudience: "",
    tone: "专业但口语化",
    extra: "",

    isGenerating: false,
    resultContent: "",
    savedReportId: "",

    plan: "",
    creditsBalance: 0,
    creditsUnlimited: false,
    creditsHint: "",
    lastCreditsHint: "",
  },

  onLoad() {
    this.loadContext()
    this.loadProfile()
  },

  async onPullDownRefresh() {
    await Promise.all([this.loadContext(), this.loadProfile()])
    wx.stopPullDownRefresh()
  },

  async loadProfile() {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/profile",
      })

      if (!res?.ok) return

      const profile = res.profile || {}
      const plan = normalizePlan(profile.plan)
      const unlimited = Boolean(profile.credits_unlimited)
      const balance = Number(profile.credits_balance || 0)

      const estimated = estimateWorkflowCreditsCost("P7", plan, true)
      const hint = unlimited
        ? `预计消耗 ${estimated} 积分 | 当前：无限`
        : `预计消耗 ${estimated} 积分 | 当前剩余：${balance}`

      this.setData({
        plan,
        creditsUnlimited: unlimited,
        creditsBalance: balance,
        creditsHint: hint,
      })
    } catch (_) {
      // ignore
    }
  },

  async loadContext() {
    if (this.data.loadingContext) return
    this.setData({ loadingContext: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/workflow/context?stepId=P7",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载前置资料失败")
      }

      const missingRequired = res.missing_required || []
      const missingOptional = res.missing_optional || []

      this.setData({
        contextReports: res.reports || [],
        missingRequired,
        missingOptional,
        missingRequiredLabel: missingRequired.length ? `缺少：${missingRequired.join("、")}` : "",
        missingOptionalLabel: missingOptional.length ? `可选缺少：${missingOptional.join("、")}` : "",
      })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loadingContext: false })
    }
  },

  onIndustryInput(e) {
    this.setData({ industry: e.detail.value })
  },

  onOfferInput(e) {
    this.setData({ offerDesc: e.detail.value })
  },

  onAudienceInput(e) {
    this.setData({ targetAudience: e.detail.value })
  },

  onToneInput(e) {
    this.setData({ tone: e.detail.value })
  },

  onExtraInput(e) {
    this.setData({ extra: e.detail.value })
  },

  async handleGenerate() {
    if (this.data.isGenerating) return

    const industry = String(this.data.industry || "").trim()
    const offerDesc = String(this.data.offerDesc || "").trim()
    if (!industry || !offerDesc) {
      wx.showToast({ title: "请先填写行业与卖什么", icon: "none" })
      return
    }

    const doGenerate = async () => {
      this.setData({ isGenerating: true, resultContent: "", savedReportId: "", lastCreditsHint: "" })
      track("workflow_p7_submit")

      try {
        const contextReports = this.data.contextReports || []
        const context = contextReports.length
          ? { reports: contextReports.map((r) => ({ report_id: r.report_id })) }
          : undefined

        const prompt = buildPrompt({
          platform: this.data.platform,
          industry,
          offerDesc,
          targetAudience: String(this.data.targetAudience || "").trim(),
          tone: String(this.data.tone || "").trim(),
          extra: String(this.data.extra || "").trim(),
        })

        const res = await requestTextWithMeta({
          baseUrl: IP_FACTORY_BASE_URL,
          url: "/api/chat",
          method: "POST",
          data: {
            messages: [{ role: "user", content: prompt }],
            stepId: "P7",
            ...(context ? { context } : {}),
            allowCreditsOverride: true,
          },
        })

        const raw = res?.data
        const parsed = parseChatSse(raw)
        if (!parsed?.content || !String(parsed.content).trim()) {
          throw new Error("未获取到结果")
        }

        const credits = parseCreditsFromHeaders(res?.headers || {})
        if (credits.cost != null) {
          const remainingLabel = credits.unlimited || credits.remaining === "unlimited" ? "无限" : credits.remaining
          this.setData({
            lastCreditsHint: `本次消耗 ${credits.cost} 积分 | 剩余：${remainingLabel}`,
          })
        }

        this.setData({ resultContent: parsed.content })
        track("workflow_p7_success")
      } catch (error) {
        if (handleBillingError(error)) return
        track("workflow_p7_fail", { message: error.message || "failed" })
        wx.showToast({ title: error.message || "生成失败", icon: "none" })
      } finally {
        this.setData({ isGenerating: false })
      }
    }

    const missing = this.data.missingRequired || []
    if (missing.length) {
      wx.showModal({
        title: "前置资料不完整",
        content: `缺少：${missing.join("、")}。\n继续生成也能出结果，但质量会明显下降。是否继续？`,
        confirmText: "继续生成",
        cancelText: "先补齐",
        success: (res) => {
          if (res.confirm) doGenerate()
        },
      })
      return
    }

    await doGenerate()
  },

  handleCopy() {
    const content = String(this.data.resultContent || "")
    if (!content.trim()) return

    wx.setClipboardData({
      data: content,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    })
  },

  async handleSave() {
    const content = String(this.data.resultContent || "")
    if (!content.trim()) return

    try {
      const title = `《选题库》${formatDateLabel()}`
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/reports",
        method: "POST",
        data: {
          step_id: "P7",
          title,
          content,
          metadata: {
            source: "mp",
            inputs: {
              platform: this.data.platform,
              industry: String(this.data.industry || "").trim(),
              offerDesc: String(this.data.offerDesc || "").trim(),
              targetAudience: String(this.data.targetAudience || "").trim(),
              tone: String(this.data.tone || "").trim(),
            },
            missing_required: this.data.missingRequired || [],
          },
        },
      })

      if (!res?.ok || !res?.report?.id) {
        throw new Error(res?.error || "保存失败")
      }

      this.setData({ savedReportId: res.report.id })
      track("workflow_p7_saved", { reportId: res.report.id })
      wx.showToast({ title: "已保存到素材库", icon: "success" })
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" })
    }
  },

  handleGoLibrary() {
    wx.navigateTo({ url: "/pages/library/index" })
  },

  handleGoP8() {
    const p7ReportId = this.data.savedReportId || ""
    const qs = p7ReportId ? `?p7ReportId=${encodeURIComponent(p7ReportId)}` : ""
    wx.navigateTo({ url: `/pages/workflow-p8/index${qs}` })
  },
})
