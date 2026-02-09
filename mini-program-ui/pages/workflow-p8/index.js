const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request, requestTextWithMeta } = require("../../utils/request")
const { parseChatSse } = require("../../utils/sse")
const { track } = require("../../utils/track")
const { estimateWorkflowCreditsCost, parseCreditsFromHeaders, normalizePlan } = require("../../utils/credits")
const { openXhsCompose } = require("../../utils/nav")

const AGENTS = [
  { id: "deep-resonance", label: "深度共鸣" },
  { id: "golden-sentence", label: "金句型" },
  { id: "weird-question", label: "奇葩问题" },
  { id: "life-story", label: "人生故事" },
  { id: "promo-hook", label: "促销钩子" },
  { id: "product-display", label: "产品展示" },
]

function formatDateLabel() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function shortTitle(value, maxLen = 30) {
  const s = String(value || "").trim()
  if (!s) return ""
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
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

function extractTopics(content, max = 20) {
  const text = String(content || "")
  if (!text.trim()) return []

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const out = []
  const seen = new Set()

  const push = (t) => {
    const v = String(t || "").trim()
    if (!v) return
    if (v.length < 4) return
    if (v.length > 80) return
    if (seen.has(v)) return
    seen.add(v)
    out.push(v)
  }

  for (const line of lines) {
    const m = line.match(/^(\d+)[\.\、]\s*(.+)$/) || line.match(/^[-*]\s+(.+)$/)
    if (m) {
      const raw = m[2] || m[1]
      const cleaned = String(raw || "").replace(/\s+/g, " ").trim()
      // Skip headings and generic labels
      if (/^top\s*\d+/i.test(cleaned)) continue
      if (cleaned.startsWith("Day") || cleaned.startsWith("DAY")) continue
      push(cleaned)
    }
    if (out.length >= max) break
  }

  return out.slice(0, max)
}

function buildPrompt(data) {
  const lines = [
    "请生成一条可直接发布的短视频脚本。",
    data.topic ? `选题：${data.topic}` : null,
    data.platform ? `平台：${data.platform}` : null,
    data.industry ? `行业：${data.industry}` : null,
    data.offerDesc ? `卖什么：${data.offerDesc}` : null,
    data.targetAudience ? `卖给谁：${data.targetAudience}` : null,
    data.tone ? `口吻：${data.tone}` : null,
    data.extra ? `补充：${data.extra}` : null,
    "",
    "输出结构（必须包含）：",
    "1) 0-3秒钩子（强冲突/强利益/强好奇）",
    "2) 正文分点（3-6点，口语化短句）",
    "3) 结尾CTA（引导私信/到店/领取）",
    "4) 置顶评论（补充利益点+行动指令）",
    "",
    "要求：避免违规词，禁止出现手机号/微信号，表达自然像真人。",
  ].filter(Boolean)

  return lines.join("\n")
}

Page({
  data: {
    loadingContext: false,
    contextReports: [],
    missingRequired: [],
    missingRequiredLabel: "",

    agents: AGENTS,
    agentId: "deep-resonance",

    platform: "小红书",
    industry: "",
    offerDesc: "",
    targetAudience: "",
    tone: "专业但口语化",
    topic: "",
    extra: "",

    p7ReportId: "",
    topicCandidates: [],

    isGenerating: false,
    resultContent: "",
    savedReportId: "",

    plan: "",
    creditsBalance: 0,
    creditsUnlimited: false,
    creditsHint: "",
    lastCreditsHint: "",
  },

  onLoad(query) {
    const p7ReportId = query?.p7ReportId ? String(query.p7ReportId).trim() : ""
    if (p7ReportId) {
      this.setData({ p7ReportId })
    }

    const presetTopic = query?.topic ? String(query.topic).trim() : ""
    if (presetTopic) {
      this.setData({ topic: presetTopic })
    }

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

      const estimated = estimateWorkflowCreditsCost("P8", plan, true)
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
        url: "/api/mp/workflow/context?stepId=P8",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载前置资料失败")
      }

      const missingRequired = res.missing_required || []

      const reports = res.reports || []
      let p7ReportId = this.data.p7ReportId
      if (!p7ReportId) {
        const p7 = reports.find((r) => r.step_id === "P7")
        p7ReportId = p7?.report_id || ""
      }

      this.setData({
        contextReports: reports,
        missingRequired,
        missingRequiredLabel: missingRequired.length ? `缺少：${missingRequired.join("、")}` : "",
        p7ReportId,
      })

      if (p7ReportId) {
        await this.loadTopicsFromP7(p7ReportId)
      }
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loadingContext: false })
    }
  },

  async loadTopicsFromP7(reportId) {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/reports/${encodeURIComponent(reportId)}`,
      })

      if (!res?.ok || !res?.report?.content) return
      const candidates = extractTopics(res.report.content, 20)
      this.setData({ topicCandidates: candidates })
    } catch (_) {
      // ignore
    }
  },

  onSelectAgent(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ agentId: id })
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

  onTopicInput(e) {
    this.setData({ topic: e.detail.value })
  },

  onExtraInput(e) {
    this.setData({ extra: e.detail.value })
  },

  handlePickTopic(e) {
    const topic = e.currentTarget.dataset.topic
    if (!topic) return
    this.setData({ topic })
  },

  handleGoP7() {
    wx.navigateTo({ url: "/pages/workflow-p7/index" })
  },

  async handleGenerate() {
    if (this.data.isGenerating) return

    const topic = String(this.data.topic || "").trim()
    if (!topic) {
      wx.showToast({ title: "请先填写或选择选题", icon: "none" })
      return
    }

    const missing = this.data.missingRequired || []
    if (missing.length) {
      wx.showModal({
        title: "缺少选题库(P7)",
        content: "建议先生成 P7《选题库》，否则脚本质量会下降。是否先去生成？",
        confirmText: "去P7",
        cancelText: "仍要继续",
        success: async (res) => {
          if (res.confirm) {
            this.handleGoP7()
          } else {
            await this.doGenerateScript(topic)
          }
        },
      })
      return
    }

    await this.doGenerateScript(topic)
  },

  async doGenerateScript(topic) {
    this.setData({ isGenerating: true, resultContent: "", savedReportId: "", lastCreditsHint: "" })
    track("workflow_p8_submit", { agentId: this.data.agentId })

    try {
      const contextReports = this.data.contextReports || []
      const context = contextReports.length
        ? { reports: contextReports.map((r) => ({ report_id: r.report_id })) }
        : undefined

      const prompt = buildPrompt({
        topic,
        platform: this.data.platform,
        industry: String(this.data.industry || "").trim(),
        offerDesc: String(this.data.offerDesc || "").trim(),
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
          stepId: "P8",
          agentId: this.data.agentId,
          ...(context ? { context } : {}),
          allowCreditsOverride: true,
        },
      })

      const raw = res?.data
      const parsed = parseChatSse(raw)
      if (!parsed?.content || !String(parsed.content).trim()) {
        throw new Error("未获取到脚本结果")
      }

      const credits = parseCreditsFromHeaders(res?.headers || {})
      if (credits.cost != null) {
        const remainingLabel = credits.unlimited || credits.remaining === "unlimited" ? "无限" : credits.remaining
        this.setData({
          lastCreditsHint: `本次消耗 ${credits.cost} 积分 | 剩余：${remainingLabel}`,
        })
      }

      this.setData({ resultContent: parsed.content })
      track("workflow_p8_success", { agentId: this.data.agentId })
    } catch (error) {
      if (handleBillingError(error)) return
      track("workflow_p8_fail", { message: error.message || "failed", agentId: this.data.agentId })
      wx.showToast({ title: error.message || "生成失败", icon: "none" })
    } finally {
      this.setData({ isGenerating: false })
    }
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
      const title = `《脚本初稿》${formatDateLabel()} ${shortTitle(this.data.topic)}`
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/reports",
        method: "POST",
        data: {
          step_id: "P8",
          title,
          content,
          metadata: {
            source: "mp",
            agentId: this.data.agentId,
            topic: String(this.data.topic || "").trim(),
            p7ReportId: this.data.p7ReportId || null,
            inputs: {
              platform: this.data.platform,
              industry: String(this.data.industry || "").trim(),
              offerDesc: String(this.data.offerDesc || "").trim(),
              targetAudience: String(this.data.targetAudience || "").trim(),
              tone: String(this.data.tone || "").trim(),
            },
          },
        },
      })

      if (!res?.ok || !res?.report?.id) {
        throw new Error(res?.error || "保存失败")
      }

      this.setData({ savedReportId: res.report.id })
      track("workflow_p8_saved", { reportId: res.report.id })
      wx.showToast({ title: "已保存到素材库", icon: "success" })
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" })
    }
  },

  async ensureSavedReportId() {
    const existing = String(this.data.savedReportId || "").trim()
    if (existing) return existing

    const content = String(this.data.resultContent || "")
    if (!content.trim()) return ""

    const title = `《脚本初稿》${formatDateLabel()} ${shortTitle(this.data.topic)}`
    const res = await request({
      baseUrl: IP_FACTORY_BASE_URL,
      url: "/api/mp/reports",
      method: "POST",
      data: {
        step_id: "P8",
        title,
        content,
        metadata: {
          source: "mp",
          agentId: this.data.agentId,
          topic: String(this.data.topic || "").trim(),
          p7ReportId: this.data.p7ReportId || null,
          inputs: {
            platform: this.data.platform,
            industry: String(this.data.industry || "").trim(),
            offerDesc: String(this.data.offerDesc || "").trim(),
            targetAudience: String(this.data.targetAudience || "").trim(),
            tone: String(this.data.tone || "").trim(),
          },
        },
      },
    })

    if (res?.ok && res?.report?.id) {
      this.setData({ savedReportId: res.report.id })
      track("workflow_p8_saved", { reportId: res.report.id, via: "convert" })
      return res.report.id
    }

    return ""
  },

  async handleConvertToXhsDraft() {
    const content = String(this.data.resultContent || "")
    const topic = String(this.data.topic || "").trim()
    if (!content.trim()) return

    const doConvert = async () => {
      wx.showLoading({ title: "创建草稿中" })

      try {
        const reportId = await this.ensureSavedReportId()

        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: "/api/mp/xhs/drafts",
          method: "POST",
          data: {
            source: "mp_p8",
            contentType: "treatment",
            ...(topic ? { topic, resultTitle: topic } : {}),
            resultContent: content,
            ...(reportId ? { sourceReportId: reportId } : {}),
          },
        })

        if (!res?.ok || !res?.draft?.id) {
          throw new Error(res?.error || "创建草稿失败")
        }

        const draftId = res.draft.id
        track("workflow_p8_convert_to_xhs_success", { draftId, reportId: reportId || null })

        wx.hideLoading()
        openXhsCompose(draftId)
      } catch (error) {
        wx.hideLoading()
        track("workflow_p8_convert_to_xhs_fail", { message: error.message || "failed" })
        wx.showToast({ title: error.message || "创建草稿失败", icon: "none" })
      }
    }

    if (!String(this.data.savedReportId || "").trim()) {
      wx.showModal({
        title: "一键转草稿",
        content: "将先把脚本保存到素材库，方便后续追踪与复用。是否继续？",
        confirmText: "继续",
        cancelText: "取消",
        success: (res) => {
          if (res.confirm) doConvert()
        },
      })
      return
    }

    await doConvert()
  },

  handleGoLibrary() {
    wx.navigateTo({ url: "/pages/library/index" })
  },

  async handleGoP9() {
    const content = String(this.data.resultContent || "")
    if (!content.trim()) return

    wx.showLoading({ title: "准备中" })
    try {
      // Ensure the latest script is saved so P9 can load it as context.
      const reportId = await this.ensureSavedReportId()
      if (!reportId) {
        wx.hideLoading()
        wx.showToast({ title: "请先保存脚本到素材库", icon: "none" })
        return
      }

      track("workflow_p8_go_p9", { reportId })
      wx.hideLoading()
      wx.navigateTo({ url: "/pages/workflow-p9/index" })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || "跳转失败", icon: "none" })
    }
  },

  handleGoXhs() {
    openXhsCompose()
  },
})
