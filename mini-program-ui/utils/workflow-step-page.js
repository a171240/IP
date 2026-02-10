const { IP_FACTORY_BASE_URL } = require("./config")
const { request, requestTextWithMeta } = require("./request")
const { parseChatSse } = require("./sse")
const { track } = require("./track")
const { estimateWorkflowCreditsCost, parseCreditsFromHeaders, normalizePlan } = require("./credits")

function formatDateLabel() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function shortTitle(value, maxLen = 28) {
  const s = String(value || "").trim().replace(/\s+/g, " ")
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

function uniqStepIds(stepIds) {
  const out = []
  const seen = new Set()
  for (const sid of stepIds || []) {
    const v = String(sid || "").trim()
    if (!v) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

function buildContextFromReports(reports, stepIds) {
  const byStep = new Map()
  for (const r of reports || []) {
    const sid = String(r?.step_id || "").trim()
    if (!sid) continue
    if (!byStep.has(sid)) byStep.set(sid, r)
  }

  const out = []
  for (const sid of stepIds) {
    const r = byStep.get(sid)
    if (!r?.id) continue
    out.push({
      step_id: sid,
      report_id: r.id,
      title: r.title || "",
      created_at: r.created_at || "",
    })
  }

  return { byStep, contextReports: out }
}

function buildPrompt(opts) {
  const {
    stepId,
    outputTitle,
    inputText,
    missingRequired,
  } = opts

  const sid = String(stepId || "").trim()
  const title = String(outputTitle || "").trim() || sid
  const input = String(inputText || "").trim()

  const lines = [
    `请执行 ${sid} 并输出完整的「${title}」。`,
    input ? "" : "我没有额外补充输入，请优先基于已选前置报告（如有）完成输出。",
    input ? `输入信息：\n${input}` : null,
    missingRequired && missingRequired.length ? `注意：当前缺少前置：${missingRequired.join("、")}。` : null,
    "",
    "输出要求：",
    "- 用 Markdown 结构化小标题（# / ##）",
    "- 给出可执行的结论与建议",
    "- 如果信息不足，先列出 3-5 个关键追问（不要一次问太多）",
  ].filter(Boolean)

  return lines.join("\n")
}

function createWorkflowStepPage(config) {
  const stepId = String(config?.stepId || "").trim()
  const pageTitle = String(config?.pageTitle || stepId).trim()
  const pageSubtitle = String(config?.pageSubtitle || "").trim()
  const outputTitle = String(config?.outputTitle || "").trim()
  const inputPlaceholder = String(config?.inputPlaceholder || "").trim()
  const requiredDeps = uniqStepIds(config?.requiredDeps || [])
  const optionalDeps = uniqStepIds(config?.optionalDeps || [])
  const nextStepId = config?.nextStepId ? String(config.nextStepId).trim() : ""
  const importFromStepId = config?.importFromStepId ? String(config.importFromStepId).trim() : ""

  return {
    data: {
      stepId,
      pageTitle,
      pageSubtitle,
      outputTitle,
      inputPlaceholder,

      loadingContext: false,
      contextReports: [],
      missingRequired: [],
      missingOptional: [],
      missingRequiredLabel: "",
      missingOptionalLabel: "",

      inputText: "",
      isGenerating: false,
      resultContent: "",
      savedReportId: "",

      nextStepId,
      importFromStepId,

      plan: "",
      creditsBalance: 0,
      creditsUnlimited: false,
      creditsHint: "",
      lastCreditsHint: "",
    },

    onLoad(query) {
      const preset = query?.prefill ? String(query.prefill) : ""
      if (preset) {
        this.setData({ inputText: preset })
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

        const estimated = estimateWorkflowCreditsCost(stepId, plan, true)
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
        const deps = uniqStepIds([...requiredDeps, ...optionalDeps])
        if (!deps.length) {
          this.setData({
            contextReports: [],
            missingRequired: [],
            missingOptional: [],
            missingRequiredLabel: "",
            missingOptionalLabel: "",
          })
          return
        }

        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: `/api/mp/reports?limit=50&step_id=${encodeURIComponent(deps.join(","))}`,
        })

        if (!res?.ok) {
          throw new Error(res?.error || "加载前置资料失败")
        }

        const { byStep, contextReports } = buildContextFromReports(res.reports || [], deps)
        const missingRequired = requiredDeps.filter((sid) => !byStep.has(sid))
        const missingOptional = optionalDeps.filter((sid) => !byStep.has(sid))

        this.setData({
          contextReports,
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

    onInput(e) {
      this.setData({ inputText: e.detail.value })
    },

    async handleImportFromPrev() {
      const fromStep = String(this.data.importFromStepId || "").trim()
      if (!fromStep) return

      const reports = this.data.contextReports || []
      const ref = reports.find((r) => String(r?.step_id || "").trim() === fromStep)
      if (!ref?.report_id) {
        wx.showToast({ title: `未找到${fromStep}报告`, icon: "none" })
        return
      }

      wx.showLoading({ title: "导入中" })
      try {
        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: `/api/mp/reports/${encodeURIComponent(ref.report_id)}`,
        })
        if (res?.ok && res?.report?.content) {
          this.setData({ inputText: String(res.report.content || "") })
        }
      } catch (error) {
        wx.showToast({ title: error.message || "导入失败", icon: "none" })
      } finally {
        wx.hideLoading()
      }
    },

    async handleGenerate() {
      if (this.data.isGenerating) return

      const inputText = String(this.data.inputText || "").trim()

      // P1 必须提供输入；其他步骤允许空输入（会基于前置报告或继续追问）。
      if (stepId === "P1" && inputText.length < 6) {
        wx.showToast({ title: "请先补充行业/产品/受众信息", icon: "none" })
        return
      }

      const doGenerate = async () => {
        this.setData({ isGenerating: true, resultContent: "", savedReportId: "", lastCreditsHint: "" })
        track("workflow_step_submit", { stepId })

        try {
          const contextReports = this.data.contextReports || []
          const context = contextReports.length
            ? { reports: contextReports.map((r) => ({ report_id: r.report_id })) }
            : undefined

          const prompt = buildPrompt({
            stepId,
            outputTitle,
            inputText,
            missingRequired: this.data.missingRequired || [],
          })

          const res = await requestTextWithMeta({
            baseUrl: IP_FACTORY_BASE_URL,
            url: "/api/chat",
            method: "POST",
            data: {
              messages: [{ role: "user", content: prompt }],
              stepId,
              ...(context ? { context } : {}),
              allowCreditsOverride: true,
            },
          })

          const parsed = parseChatSse(res?.data)
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
          track("workflow_step_success", { stepId })
        } catch (error) {
          if (handleBillingError(error)) return
          track("workflow_step_fail", { stepId, message: error.message || "failed" })
          wx.showToast({ title: error.message || "生成失败", icon: "none" })
        } finally {
          this.setData({ isGenerating: false })
        }
      }

      const missing = this.data.missingRequired || []
      if (missing.length) {
        wx.showModal({
          title: "前置资料不完整",
          content: `缺少：${missing.join("、")}。\n继续生成也能出结果，但质量会下降。是否继续？`,
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
        const title = outputTitle
          ? `《${outputTitle}》${formatDateLabel()}`
          : `《${stepId}》${formatDateLabel()}`
        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: "/api/mp/reports",
          method: "POST",
          data: {
            step_id: stepId,
            title,
            content,
            metadata: {
              source: "mp",
              inputs: {
                note: shortTitle(this.data.inputText, 80),
              },
              missing_required: this.data.missingRequired || [],
            },
          },
        })

        if (!res?.ok || !res?.report?.id) {
          throw new Error(res?.error || "保存失败")
        }

        this.setData({ savedReportId: res.report.id })
        track("workflow_step_saved", { stepId, reportId: res.report.id })
        wx.showToast({ title: "已保存到素材库", icon: "success" })
      } catch (error) {
        wx.showToast({ title: error.message || "保存失败", icon: "none" })
      }
    },

    handleOpenSaved() {
      const reportId = String(this.data.savedReportId || "").trim()
      if (!reportId) return
      wx.navigateTo({ url: `/pages/report-viewer/index?reportId=${encodeURIComponent(reportId)}` })
    },

    handleGoLibrary() {
      wx.navigateTo({ url: "/pages/library/index" })
    },

    handleGoNext() {
      const next = String(this.data.nextStepId || "").trim()
      if (!next) return

      const routeMap = {
        P1: "/pages/workflow-p1/index",
        P2: "/pages/workflow-p2/index",
        P3: "/pages/workflow-p3/index",
        P4: "/pages/workflow-p4/index",
        P5: "/pages/workflow-p5/index",
        P6: "/pages/workflow-p6/index",
        P7: "/pages/workflow-p7/index",
        P8: "/pages/workflow-p8/index",
        P9: "/pages/workflow-p9/index",
        P10: "/pages/workflow-p10/index",
      }

      const url = routeMap[next]
      if (!url) return
      wx.navigateTo({ url })
    },
  }
}

module.exports = {
  createWorkflowStepPage,
}

