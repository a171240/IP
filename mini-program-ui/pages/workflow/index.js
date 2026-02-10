const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")
const { normalizePlan } = require("../../utils/credits")

const PLAN_ORDER = ["free", "basic", "pro", "vip"]

const STEP_DEPS = {
  P1: [],
  P2: ["P1"],
  P3: ["P1", "P2"],
  P4: ["P1", "P2", "P3"],
  P5: ["P4"],
  P6: ["P1", "P4", "P5"],
  P7: ["P1", "P3", "P6"],
  P8: ["P7"],
  P9: ["P8"],
  P10: ["P9"],
}

const STEP_META = [
  {
    phase: 1,
    phaseName: "研究定位",
    phaseSubtitle: "首次必做，后续可更新",
    steps: [
      { id: "P1", title: "行业目标分析", description: "第一性原理定位行业与目标受众", output: "《行业目标分析报告》", requiredPlan: "free" },
      { id: "P2", title: "行业认知深度", description: "道法术器势框架，确定内容切入点", output: "《行业认知深度分析报告》", requiredPlan: "free" },
      { id: "P3", title: "情绪价值分析", description: "输出情绪价值点全景图", output: "《情绪价值点全景图》", requiredPlan: "basic" },
    ],
  },
  {
    phase: 2,
    phaseName: "人设构建",
    phaseSubtitle: "首次必做，后续可调整",
    steps: [
      { id: "P4", title: "IP概念生成", description: "定位/视觉锤/语言钉", output: "《IP概念》", requiredPlan: "basic" },
      { id: "P5", title: "IP类型定位", description: "1主2副模型 + 变现路径", output: "《IP类型定位报告》", requiredPlan: "basic" },
      { id: "P6", title: "4X4内容规划", description: "60期规划 + 10种呈现形式", output: "《4X4内容运营规划》", requiredPlan: "pro" },
    ],
  },
  {
    phase: 3,
    phaseName: "内容生产",
    phaseSubtitle: "循环复用，核心变现",
    steps: [
      { id: "P7", title: "选题库生成", description: "TOP20 + 7天日历 + 风险标注", output: "《选题库》", requiredPlan: "pro" },
      { id: "P8", title: "脚本创作中心", description: "多智能体选择，一条脚本可直接发布", output: "《脚本初稿》", requiredPlan: "pro" },
      { id: "P9", title: "口语化优化", description: "去AI味 + 保连贯", output: "《口语化优化终稿》", requiredPlan: "pro" },
      { id: "P10", title: "迭代管理", description: "版本日志 + 迭代建议", output: "《迭代管理报告》", requiredPlan: "pro" },
    ],
  },
]

function isPlanEnough(currentPlan, requiredPlan) {
  const cur = PLAN_ORDER.indexOf(normalizePlan(currentPlan))
  const req = PLAN_ORDER.indexOf(normalizePlan(requiredPlan))
  return cur >= req
}

function routeForStep(stepId) {
  const map = {
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
  return map[String(stepId || "").trim()] || ""
}

Page({
  data: {
    loading: false,
    loadingProfile: false,

    plan: "",
    planLabel: "",
    creditsLabel: "",

    phases: [],
    latestReportIdByStep: {},
    missingDepsByStep: {},
  },

  onShow() {
    track("workflow_list_view")
    this.refreshAll()
  },

  async onPullDownRefresh() {
    await this.refreshAll()
    wx.stopPullDownRefresh()
  },

  async refreshAll() {
    await this.loadProfile()
    await this.loadReports()
  },

  async loadProfile() {
    if (this.data.loadingProfile) return
    this.setData({ loadingProfile: true })

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
      const creditsLabel = unlimited ? "积分 无限" : `积分 ${balance}`

      this.setData({
        plan,
        planLabel: profile.plan_label || plan,
        creditsLabel,
      })
    } catch (_) {
      // ignore
    } finally {
      this.setData({ loadingProfile: false })
    }
  },

  async loadReports() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const stepIds = []
      for (const phase of STEP_META) {
        for (const s of phase.steps) stepIds.push(s.id)
      }

      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/reports?limit=50&step_id=${encodeURIComponent(stepIds.join(","))}`,
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载失败")
      }

      const byStep = {}
      for (const r of res.reports || []) {
        const sid = String(r?.step_id || "").trim()
        if (!sid) continue
        if (!byStep[sid]) byStep[sid] = r
      }

      const latestReportIdByStep = {}
      for (const sid of Object.keys(byStep)) {
        if (byStep[sid]?.id) latestReportIdByStep[sid] = byStep[sid].id
      }

      const missingDepsByStep = {}
      for (const sid of Object.keys(STEP_DEPS)) {
        const deps = STEP_DEPS[sid] || []
        const missing = deps.filter((d) => !latestReportIdByStep[d])
        missingDepsByStep[sid] = missing
      }

      const currentPlan = this.data.plan || "free"
      const phases = STEP_META.map((phase) => {
        const steps = (phase.steps || []).map((s) => {
          const reportId = latestReportIdByStep[s.id] || ""
          const missing = missingDepsByStep[s.id] || []
          const locked = !isPlanEnough(currentPlan, s.requiredPlan)
          const completed = Boolean(reportId)

          let statusLabel = "可开始"
          let statusClass = "tag-accent"
          if (locked) {
            statusLabel = `需${s.requiredPlan.toUpperCase()}`
            statusClass = ""
          } else if (completed) {
            statusLabel = "已完成"
            statusClass = "tag-success"
          } else if (missing.length) {
            statusLabel = "缺少前置"
            statusClass = ""
          }

          return {
            ...s,
            requiredPlanLabel: String(s.requiredPlan || "").toUpperCase(),
            reportId,
            locked,
            completed,
            missingDeps: missing,
            missingDepsLabel: missing.join("、"),
            statusLabel,
            statusClass,
          }
        })

        return { ...phase, steps }
      })

      this.setData({
        phases,
        latestReportIdByStep,
        missingDepsByStep,
      })
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleOpenStep(e) {
    const stepId = e.currentTarget.dataset.id
    if (!stepId) return

    const url = routeForStep(stepId)
    if (!url) return

    const phases = this.data.phases || []
    let step = null
    for (const p of phases) {
      const steps = p?.steps || []
      for (const s of steps) {
        if (s?.id === stepId) {
          step = s
          break
        }
      }
      if (step) break
    }

    if (step?.locked) {
      wx.showModal({
        title: "需要升级",
        content: `当前步骤需要 ${String(step.requiredPlan || "").toUpperCase()} 套餐，或用积分解锁。`,
        confirmText: "去购买",
        cancelText: "取消",
        success(res) {
          if (res.confirm) wx.navigateTo({ url: "/pages/pay/index" })
        },
      })
      return
    }

    const missing = (step?.missingDeps || []).slice(0, 20)
    if (missing.length) {
      wx.showModal({
        title: "前置步骤缺失",
        content: `缺少：${missing.join("、")}。\n继续也能生成，但质量会下降。是否继续？`,
        confirmText: "继续",
        cancelText: "取消",
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url })
        },
      })
      return
    }

    wx.navigateTo({ url })
  },

  handleOpenReport(e) {
    const reportId = e.currentTarget.dataset.report
    if (!reportId) return
    wx.navigateTo({ url: `/pages/report-viewer/index?reportId=${encodeURIComponent(reportId)}` })
  },

  handleGoPay() {
    wx.navigateTo({ url: "/pages/pay/index" })
  },
})
