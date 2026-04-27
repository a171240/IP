const { VOICE_COACH_HTTP_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { buildPendingVoiceCoachSetup, savePendingVoiceCoachSetup } = require("./setup-storage")

const CHART_COLORS = {
  grid: "rgba(189, 201, 180, 0.18)",
  label: "#cbd5c7",
  axis: "rgba(189, 201, 180, 0.22)",
  line: "rgba(156, 190, 130, 0.96)",
  area: "rgba(156, 190, 130, 0.22)",
  canvasBg: "#101512",
  targetBg: "rgba(156, 190, 130, 0.14)",
}

const LINE_CHART_COLORS = {
  speech_rate_curve: "#9caf88",
  filler_ratio_curve: "#d1b47f",
  clarity_curve: "#86c9a0",
}

function lineColorForChart(chart) {
  if (!chart || !chart.id) return CHART_COLORS.line
  return LINE_CHART_COLORS[chart.id] || CHART_COLORS.line
}

function areaColorForChart(chart) {
  var hex = lineColorForChart(chart)
  // Convert hex to rgba with low opacity for area fill
  if (hex.charAt(0) === "#" && hex.length === 7) {
    var r = parseInt(hex.slice(1, 3), 16)
    var g = parseInt(hex.slice(3, 5), 16)
    var b = parseInt(hex.slice(5, 7), 16)
    return "rgba(" + r + "," + g + "," + b + ",0.12)"
  }
  return CHART_COLORS.area
}

function targetBgForChart(chart) {
  var hex = lineColorForChart(chart)
  if (hex.charAt(0) === "#" && hex.length === 7) {
    var r = parseInt(hex.slice(1, 3), 16)
    var g = parseInt(hex.slice(3, 5), 16)
    var b = parseInt(hex.slice(5, 7), 16)
    return "rgba(" + r + "," + g + "," + b + ",0.10)"
  }
  return CHART_COLORS.targetBg
}

function formatChartValue(chart, value) {
  if (chart && chart.unit === "%") return Math.round(value) + "%"
  if (Math.abs(value) >= 10) return String(Math.round(value))
  return String(Math.round(value * 10) / 10)
}

function drawSmoothLine(ctx, pts) {
  if (pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0].px, pts[0].py)
  for (var i = 1; i < pts.length; i++) {
    var prev = pts[i - 1]
    var curr = pts[i]
    var cpx = (prev.px + curr.px) / 2
    var cpy = (prev.py + curr.py) / 2
    ctx.quadraticCurveTo(prev.px, prev.py, cpx, cpy)
  }
  var last = pts[pts.length - 1]
  ctx.lineTo(last.px, last.py)
  ctx.stroke()
}

const TAB_TITLE_MAP = {
  persuasion: "说服力",
  fluency: "流利度",
  expression: "语言表达",
  organization: "语言组织",
}

const TAB_ORDER = ["persuasion", "fluency", "expression", "organization"]
const TAB_ITEMS = TAB_ORDER.map((id) => ({ id, label: TAB_TITLE_MAP[id] }))

function formatDimensionScore(score) {
  const value = Number(score || 0)
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

function getTabIndex(tab) {
  const idx = TAB_ORDER.indexOf(tab)
  return idx >= 0 ? idx : 0
}

function getWindowWidth() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {})
  const width = Number(info && info.windowWidth)
  return Number.isFinite(width) && width > 0 ? width : 375
}

function getPixelRatio() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {})
  const pixelRatio = Number(info && info.pixelRatio)
  return Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 2
}

function formatSeconds(seconds) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return ""
  return `${Math.round(n)}''`
}

function normalizeSessionContext(raw) {
  const data = raw && typeof raw === "object" ? raw : {}
  const summaryLines = Array.isArray(data.summary_lines)
    ? data.summary_lines.map((item) => String(item || "").trim()).filter(Boolean)
    : []

  return {
    customerProfileId: String(data.customer_profile_id || "").trim(),
    sceneCardId: String(data.scene_card_id || "").trim(),
    liveNotes: String(data.live_notes || "").trim(),
    customerName: String(data.customer_name || "").trim(),
    customerSummary: String(data.customer_summary || "").trim(),
    sceneName: String(data.scene_name || "").trim(),
    sceneKindLabel: String(data.scene_kind_label || "").trim(),
    serviceName: String(data.service_name || "").trim(),
    summaryLines,
  }
}

function starsText(stars) {
  const n = Math.max(1, Math.min(5, Number(stars || 0) || 0))
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n)
}

function scoreBandText(score) {
  const n = Number(score || 0)
  if (n >= 85) return "进入稳定成交区间"
  if (n >= 70) return "表达框架已经成型"
  return "关键表达仍需继续打磨"
}

function buildHeroHighlights(report, dimension) {
  const sorted = (Array.isArray(dimension) ? dimension.slice() : []).sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]

  const highlights = [
    { label: "当前结论", value: scoreBandText(report && report.total_score) },
  ]

  if (strongest) {
    highlights.push({
      label: "最强维度",
      value: `${strongest.name} · ${formatDimensionScore(strongest.score)}分`,
    })
  }

  if (weakest) {
    highlights.push({
      label: "优先提升",
      value: `${weakest.name} · ${formatDimensionScore(weakest.score)}分`,
    })
  }

  return highlights.slice(0, 3)
}

function buildFallbackSummaryBlocks(dimension) {
  const sorted = (Array.isArray(dimension) ? dimension.slice() : []).sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
  const strongest = sorted[0]
  const weakest = sorted[sorted.length - 1]
  const strongestName = strongest && strongest.name ? strongest.name : "语言表达"
  const weakestName = weakest && weakest.name ? weakest.name : "语言组织"

  return [
    `优势：${strongestName}相对更稳，当前表达主干已经比较清楚。`,
    `改进：${weakestName}还可以再收束一点，优先把重点句说短、把关键信息放前面。`,
    "下一轮：先接住顾客顾虑，再补一条证据和一个低压力下一步。",
  ]
}

function buildNextAction(report, dimension, summaryBlocks) {
  const focus = report && report.next_round_focus ? report.next_round_focus : null
  if (focus) {
    return {
      title: String(focus.title || "下一轮先练").trim(),
      copy: String(focus.instruction || (focus.practice_points && focus.practice_points[0]) || "").trim(),
      metric: typeof focus.focus_score === "number" ? `${formatDimensionScore(focus.focus_score)}分` : "",
    }
  }

  const sorted = (Array.isArray(dimension) ? dimension.slice() : []).sort((a, b) => Number(a.score || 0) - Number(b.score || 0))
  const weakest = sorted[0]
  const focusName = weakest && weakest.name ? weakest.name : "关键表达"
  const focusScore = weakest ? formatDimensionScore(weakest.score) : ""
  const nextLine = (Array.isArray(summaryBlocks) ? summaryBlocks : [])
    .map((item) => String(item || "").trim())
    .find((text) => /^下一轮[：:]/.test(text))
  const copy = nextLine
    ? nextLine.replace(/^下一轮[：:]\s*/, "")
    : "先用一句共情接住顾客顾虑，再补一条证据和一个低压力下一步。"

  return {
    title: `下一轮先练：${focusName}`,
    copy,
    metric: focusScore ? `${focusScore}分` : "",
  }
}

function scorePercent(score) {
  const value = Number(score || 0)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function normalizeSummaryBlocks(report, dimension) {
  const raw = Array.isArray(report && report.summary_blocks) ? report.summary_blocks : []
  const filtered = raw.filter((item) => {
    const text = String(item || "").trim()
    if (!text) return false
    return !/发音准确度|语音清晰度|可识别度/.test(text)
  })

  if (filtered.length >= 3) return filtered.slice(0, 3)

  const fallback = buildFallbackSummaryBlocks(dimension)
  const next = filtered.slice()
  while (next.length < 3) {
    next.push(fallback[next.length])
  }
  return next.slice(0, 3)
}

function normalizeTurn(raw) {
  const role = raw.role === "beautician" ? "beautician" : "customer"
  return {
    id: raw.id,
    role,
    text: raw.text || "",
    emotion: raw.emotion || "",
    audio_url: raw.audio_url || null,
    audio_seconds: raw.audio_seconds || null,
    audio_seconds_text: formatSeconds(raw.audio_seconds),
  }
}

function normalizeReport(report) {
  if (!report) return null
  const tabs = report.tabs || {}
  const dimension = (report.dimension || [])
    .filter((d) => String(d && d.id || "") !== "pronunciation")
    .map((d) => ({
      ...d,
      display_score: formatDimensionScore(d.score),
      stars_text: starsText(d.stars),
    }))

  function attachCanvasIds(charts, prefix) {
    return (Array.isArray(charts) ? charts : []).map((chart, index) => ({
      ...chart,
      canvas_id: `${prefix}Chart${index + 1}`,
    }))
  }

  const orgExamples = (tabs.organization?.audio_examples || []).map((ex) => ({
    ...ex,
    audio_seconds_text: formatSeconds(ex.audio_seconds),
  }))

  const summaryBlocks = normalizeSummaryBlocks(report, dimension)

  return {
    ...report,
    total_score_pct: scorePercent(report.total_score),
    dimension,
    summary_blocks: summaryBlocks,
    hero_highlights: buildHeroHighlights(report, dimension),
    next_action: buildNextAction(report, dimension, summaryBlocks),
    tabs: {
      ...tabs,
      fluency: {
        ...(tabs.fluency || {}),
        charts: attachCanvasIds(tabs.fluency && tabs.fluency.charts, "fluency"),
      },
      expression: {
        ...(tabs.expression || {}),
        charts: attachCanvasIds(tabs.expression && tabs.expression.charts, "expression"),
      },
      organization: {
        ...(tabs.organization || {}),
        audio_examples: orgExamples,
      },
    },
  }
}

Page({
  data: {
    sessionId: "",
    sessionContext: normalizeSessionContext(null),
    activeSegment: "report",
    activeTab: "persuasion",
    activeTabIndex: 0,
    tabItems: TAB_ITEMS,
    currentTabTitle: TAB_TITLE_MAP.persuasion,
    report: null,
    turns: [],
    playingId: "",
    animatedScore: 0,
    radarCanvasSize: 210,
    lineChartWidth: 320,
    lineChartHeight: 176,
  },

  onLoad(options) {
    const sessionId = options && options.sessionId ? String(options.sessionId) : ""
    if (!sessionId) {
      wx.showToast({ title: "缺少 sessionId", icon: "none" })
      return
    }
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCtx.onEnded(() => this.setData({ playingId: "" }))
    this.pixelRatio = getPixelRatio()
    this.setData({ sessionId })
    this.loadAll(sessionId)
  },

  onUnload() {
    try {
      if (this._scoreTimer) {
        clearInterval(this._scoreTimer)
        this._scoreTimer = null
      }
      if (this.audioCtx) this.audioCtx.destroy()
    } catch {}
  },

  measureSelector(selector) {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(this)
      query.select(selector).boundingClientRect((rect) => {
        resolve(rect || null)
      }).exec()
    })
  },

  async syncCanvasMetrics() {
    const windowWidth = getWindowWidth()
    const fallbackWidth = Math.max(268, Math.min(windowWidth - 68, 348))
    const radarRect = await this.measureSelector("#radarStage")
    const lineRect = await this.measureSelector(".linechart-stage")

    const nextData = {
      radarCanvasSize:
        radarRect && radarRect.width
          ? Math.round(Math.max(204, Math.min(radarRect.width, 228)))
          : Math.round(Math.max(204, Math.min(220, fallbackWidth))),
      lineChartWidth: lineRect && lineRect.width ? Math.round(lineRect.width) : Math.round(fallbackWidth),
      lineChartHeight: 188,
    }

    await new Promise((resolve) => {
      this.setData(nextData, resolve)
    })
  },

  getCanvas2D(id) {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(this)
      query.select(`#${id}`).fields({ node: true, size: true }, (res) => {
        if (!res || !res.node || !res.width || !res.height) {
          resolve(null)
          return
        }
        const canvas = res.node
        const ctx = canvas.getContext("2d")
        const dpr = this.pixelRatio || getPixelRatio()
        canvas.width = Math.max(1, Math.round(res.width * dpr))
        canvas.height = Math.max(1, Math.round(res.height * dpr))
        if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        else ctx.scale(dpr, dpr)
        resolve({
          canvas,
          ctx,
          width: res.width,
          height: res.height,
        })
      }).exec()
    })
  },

  async loadAll(sessionId) {
    wx.showLoading({ title: "加载中" })
    try {
      const [endRes, sessionRes] = await Promise.all([
        request({
          baseUrl: VOICE_COACH_HTTP_BASE_URL,
          url: `/api/voice-coach/sessions/${sessionId}/end`,
          method: "POST",
          data: { mode: "view_report" },
        }),
        request({
          baseUrl: VOICE_COACH_HTTP_BASE_URL,
          url: `/api/voice-coach/sessions/${sessionId}`,
          method: "GET",
        }),
      ])

      const report = normalizeReport(endRes.report)
      const turns = (sessionRes.turns || []).map(normalizeTurn)
      const sessionContext = normalizeSessionContext(sessionRes && sessionRes.session && sessionRes.session.context)

      await new Promise((resolve) => this.setData({ report, turns, sessionContext }, resolve))
      this.animateScore(report ? (report.total_score || 0) : 0)
      await new Promise((resolve) => wx.nextTick(resolve))
      await this.syncCanvasMetrics()
      await this.drawRadar()
      await this.drawChartsForTab(this.data.activeTab)
    } catch (err) {
      wx.showToast({ title: err.message || "加载失败", icon: "none" })
    } finally {
      wx.hideLoading()
    }
  },

  setSegment(e) {
    const seg = e && e.currentTarget ? String(e.currentTarget.dataset.seg || "") : ""
    if (!seg) return
    this.setData({ activeSegment: seg })
    if (seg === "report") {
      this.scrollReportToTop()
      wx.nextTick(async () => {
        await this.syncCanvasMetrics()
        await this.drawRadar()
        await this.drawChartsForTab(this.data.activeTab)
      })
    }
  },

  setTab(e) {
    const tab = e && e.currentTarget ? String(e.currentTarget.dataset.tab || "") : ""
    if (!tab) return
    if (tab === this.data.activeTab) {
      this.scrollReportToTop()
      return
    }
    this.setData({
      activeTab: tab,
      activeTabIndex: getTabIndex(tab),
      currentTabTitle: TAB_TITLE_MAP[tab] || "",
    })
    wx.nextTick(async () => {
      this.scrollToAnchor("#report-tab-anchor")
      await this.syncCanvasMetrics()
      await this.drawChartsForTab(tab)
    })
  },

  scrollReportToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 0,
    })
  },

  scrollToAnchor(selector) {
    wx.pageScrollTo({
      selector,
      duration: 0,
    })
  },

  animateScore(targetScore) {
    var current = 0
    var step = Math.max(1, Math.round(targetScore / 40))
    if (this._scoreTimer) clearInterval(this._scoreTimer)
    this.setData({ animatedScore: 0 })
    this._scoreTimer = setInterval(() => {
      current = Math.min(current + step, targetScore)
      this.setData({ animatedScore: current })
      if (current >= targetScore) {
        clearInterval(this._scoreTimer)
        this._scoreTimer = null
      }
    }, 25)
  },

  startAgain() {
    const sessionId = String(this.data.sessionId || "").trim()
    const context = this.data.sessionContext || {}
    if (!sessionId) {
      wx.showToast({ title: "缺少上一轮记录", icon: "none" })
      return
    }

    const setup = buildPendingVoiceCoachSetup({
      customerProfile: context.customerProfileId ? { id: context.customerProfileId } : null,
      sceneCard: context.sceneCardId ? { id: context.sceneCardId } : null,
      liveNotes: context.liveNotes || "",
      followupContext: {
        source_session_id: sessionId,
      },
    })
    savePendingVoiceCoachSetup(setup)

    wx.redirectTo({ url: "/pages/voice-coach/chat" })
  },

  onPlay(e) {
    const url = e && e.currentTarget ? String(e.currentTarget.dataset.url || "") : ""
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!url) return
    this.playUrl(url, id)
  },

  playExample(e) {
    const url = e && e.currentTarget ? String(e.currentTarget.dataset.url || "") : ""
    const id = e && e.currentTarget ? String(e.currentTarget.dataset.id || "") : ""
    if (!url) {
      wx.showToast({ title: "音频不可用", icon: "none" })
      return
    }
    this.playUrl(url, id)
  },

  playUrl(url, id) {
    try {
      if (this.data.playingId === id) {
        this.audioCtx.stop()
        this.setData({ playingId: "" })
        return
      }
      this.audioCtx.stop()
      this.audioCtx.src = url
      this.audioCtx.play()
      this.setData({ playingId: id })
    } catch (err) {
      wx.showToast({ title: "播放失败", icon: "none" })
    }
  },

  async drawRadar() {
    const report = this.data.report
    if (!report || !Array.isArray(report.dimension) || report.dimension.length < 3) return
    const dims = report.dimension

    const canvasRef = await this.getCanvas2D("radarCanvas")
    if (!canvasRef) return

    const { ctx, width: w, height: h } = canvasRef
    const sidePad = Math.max(24, Math.round(w * 0.09))
    const topPad = Math.max(28, Math.round(h * 0.12))
    const bottomPad = Math.max(24, Math.round(h * 0.1))
    const labelGap = Math.max(16, Math.round(w * 0.06))
    const cx = w / 2
    const cy = topPad + (h - topPad - bottomPad) / 2 + Math.round(h * 0.01)
    const radius = Math.max(
      66,
      Math.min(92, Math.round(Math.min((w - sidePad * 2) / 2, (h - topPad - bottomPad) / 2) - labelGap)),
    )
    const n = dims.length

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = CHART_COLORS.canvasBg
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = CHART_COLORS.grid
    ctx.lineWidth = 1

    // grid rings
    for (let r = 1; r <= 4; r++) {
      const rr = (radius * r) / 4
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
        const x = cx + rr * Math.cos(a)
        const y = cy + rr * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }

    // axes + labels with dynamic positioning
    ctx.font = `${w >= 220 ? 11 : 10}px sans-serif`
    ctx.fillStyle = CHART_COLORS.label
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
      const x = cx + radius * Math.cos(a)
      const y = cy + radius * Math.sin(a)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.stroke()

      const label = String(dims[i].name || "")
      const labelDist = radius + labelGap
      const lx = cx + labelDist * Math.cos(a)
      const ly = cy + labelDist * Math.sin(a)

      // Dynamic text alignment based on angle position
      ctx.textAlign = lx < cx - 2 ? "right" : lx > cx + 2 ? "left" : "center"
      ctx.textBaseline = ly < cy - 2 ? "bottom" : ly > cy + 2 ? "top" : "middle"
      ctx.fillText(label, lx, ly)
    }
    // Reset alignment for subsequent draws
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"

    // data polygon
    ctx.strokeStyle = CHART_COLORS.line
    ctx.lineWidth = 2
    ctx.fillStyle = CHART_COLORS.area
    ctx.beginPath()
    const dataPoints = []
    for (let i = 0; i < n; i++) {
      const score = Number(dims[i].score || 0)
      const v = Math.max(0, Math.min(1, score / 100))
      const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
      const x = cx + radius * v * Math.cos(a)
      const y = cy + radius * v * Math.sin(a)
      dataPoints.push({ x, y })
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Data point dots on each vertex
    ctx.fillStyle = CHART_COLORS.line
    for (let i = 0; i < dataPoints.length; i++) {
      ctx.beginPath()
      ctx.arc(dataPoints[i].x, dataPoints[i].y, 3, 0, 2 * Math.PI)
      ctx.fill()
    }
  },

  async drawChartsForTab(tab) {
    const report = this.data.report
    if (!report || !report.tabs) return

    if (tab === "fluency") {
      const charts = report.tabs.fluency && report.tabs.fluency.charts ? report.tabs.fluency.charts : []
      for (const chart of charts) await this.drawLineChart(chart.canvas_id, chart)
      return
    }
    if (tab === "expression") {
      const charts = report.tabs.expression && report.tabs.expression.charts ? report.tabs.expression.charts : []
      for (const chart of charts) await this.drawLineChart(chart.canvas_id, chart)
      return
    }
    if (tab === "pronunciation") {
      const charts = report.tabs.pronunciation && report.tabs.pronunciation.charts ? report.tabs.pronunciation.charts : []
      for (const chart of charts) await this.drawLineChart(chart.canvas_id, chart)
      return
    }
  },

  async drawLineChart(canvasId, chart) {
    if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return
    const canvasRef = await this.getCanvas2D(canvasId)
    if (!canvasRef) return

    const { ctx, width: w, height: h } = canvasRef

    const padL = 36
    const padR = 14
    const padT = 18
    const padB = 30
    const cw = w - padL - padR
    const ch = h - padT - padB

    const points = chart.points
    const xs = points.map((p) => Number(p.x || 0))
    const ys = points.map((p) => Number(p.y || 0))
    const xMin = Math.min.apply(null, xs)
    const xMax = Math.max.apply(null, xs)
    let yMin = Math.min.apply(null, ys)
    let yMax = Math.max.apply(null, ys)

    const tr = chart.target_range
    if (tr && tr.length === 2) {
      yMin = Math.min(yMin, tr[0])
      yMax = Math.max(yMax, tr[1])
    }
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    }

    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1

    function xToPx(x) {
      return padL + ((x - xMin) / xRange) * cw
    }
    function yToPx(y) {
      return padT + (1 - (y - yMin) / yRange) * ch
    }

    // Per-chart colors
    const lineColor = lineColorForChart(chart)
    const areaBg = areaColorForChart(chart)
    const targetBg = targetBgForChart(chart)

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = CHART_COLORS.canvasBg
    ctx.fillRect(0, 0, w, h)

    // target range background
    if (tr && tr.length === 2) {
      const y1 = yToPx(tr[0])
      const y2 = yToPx(tr[1])
      ctx.fillStyle = targetBg
      ctx.fillRect(padL, Math.min(y1, y2), cw, Math.abs(y2 - y1))
    }

    // axes
    ctx.strokeStyle = CHART_COLORS.axis
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, padT)
    ctx.lineTo(padL, padT + ch)
    ctx.lineTo(padL + cw, padT + ch)
    ctx.stroke()

    // Build pixel-coordinate array for smooth drawing and annotation
    const pixelPts = points.map((p) => ({
      px: xToPx(Number(p.x || 0)),
      py: yToPx(Number(p.y || 0)),
      val: Number(p.y || 0),
    }))

    // Area fill under the smooth curve
    ctx.fillStyle = areaBg
    ctx.beginPath()
    ctx.moveTo(pixelPts[0].px, padT + ch)
    ctx.lineTo(pixelPts[0].px, pixelPts[0].py)
    for (let i = 1; i < pixelPts.length; i++) {
      const prev = pixelPts[i - 1]
      const curr = pixelPts[i]
      const cpx = (prev.px + curr.px) / 2
      const cpy = (prev.py + curr.py) / 2
      ctx.quadraticCurveTo(prev.px, prev.py, cpx, cpy)
    }
    const areaLast = pixelPts[pixelPts.length - 1]
    ctx.lineTo(areaLast.px, areaLast.py)
    ctx.lineTo(areaLast.px, padT + ch)
    ctx.closePath()
    ctx.fill()

    // Smooth line
    ctx.strokeStyle = lineColor
    ctx.lineWidth = 2
    drawSmoothLine(ctx, pixelPts)

    // Find min/max points for annotation
    let minIdx = 0
    let maxIdx = 0
    for (let i = 1; i < pixelPts.length; i++) {
      if (pixelPts[i].val < pixelPts[minIdx].val) minIdx = i
      if (pixelPts[i].val > pixelPts[maxIdx].val) maxIdx = i
    }

    // Draw key point dots and value labels
    const keyIndices = minIdx === maxIdx ? [minIdx] : [minIdx, maxIdx]
    keyIndices.forEach((ki) => {
      const pt = pixelPts[ki]
      // dot
      ctx.beginPath()
      ctx.arc(pt.px, pt.py, 3, 0, 2 * Math.PI)
      ctx.fillStyle = lineColor
      ctx.fill()
      // value label
      ctx.font = "9px sans-serif"
      ctx.fillStyle = CHART_COLORS.label
      ctx.textAlign = "center"
      const valStr = formatChartValue(chart, pt.val)
      const labelY = ki === maxIdx ? pt.py - 8 : pt.py + 8
      ctx.textBaseline = ki === maxIdx ? "bottom" : "top"
      ctx.fillText(valStr, pt.px, labelY)
    })
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
  },
})
