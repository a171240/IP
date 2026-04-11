const { VOICE_COACH_HTTP_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

const CHART_COLORS = {
  grid: "rgba(229, 211, 179, 0.16)",
  label: "#b9b3c2",
  axis: "rgba(229, 211, 179, 0.2)",
  line: "rgba(149,236,105,0.96)",
  area: "rgba(149,236,105,0.22)",
  canvasBg: "#15151D",
  targetBg: "rgba(149,236,105,0.14)",
}

const LINE_CHART_COLORS = {
  speech_rate_curve: "#4ea0ff",
  filler_ratio_curve: "#e5d3b3",
  clarity_curve: "#95ec69",
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
  pronunciation: "发音准确度",
  organization: "语言组织",
}

const TAB_ORDER = ["persuasion", "fluency", "expression", "pronunciation", "organization"]
const TAB_ITEMS = TAB_ORDER.map((id) => ({ id, label: TAB_TITLE_MAP[id] }))

function getTabIndex(tab) {
  const idx = TAB_ORDER.indexOf(tab)
  return idx >= 0 ? idx : 0
}

function getWindowWidth() {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : (wx.getSystemInfoSync ? wx.getSystemInfoSync() : {})
  const width = Number(info && info.windowWidth)
  return Number.isFinite(width) && width > 0 ? width : 375
}

function formatSeconds(seconds) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return ""
  return `${Math.round(n)}''`
}

function starsText(stars) {
  const n = Math.max(1, Math.min(5, Number(stars || 0) || 0))
  return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n)
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
  const dimension = (report.dimension || []).map((d) => ({
    ...d,
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

  return {
    ...report,
    dimension,
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
      pronunciation: {
        ...(tabs.pronunciation || {}),
        charts: attachCanvasIds(tabs.pronunciation && tabs.pronunciation.charts, "pronunciation"),
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
    activeSegment: "report",
    activeTab: "persuasion",
    activeTabIndex: 0,
    tabItems: TAB_ITEMS,
    currentTabTitle: TAB_TITLE_MAP.persuasion,
    reportScrollIntoView: "",
    reportScrollTop: 0,
    report: null,
    turns: [],
    playingId: "",
    animatedScore: 0,
    radarCanvasSize: 220,
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
    this.syncCanvasMetrics()
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

  syncCanvasMetrics() {
    const windowWidth = getWindowWidth()
    const contentWidth = Math.max(286, Math.min(windowWidth - 22, 360))
    const radarCanvasSize = Math.round(Math.max(188, Math.min(236, contentWidth - 84)))

    this.setData({
      radarCanvasSize,
      lineChartWidth: Math.round(contentWidth),
      lineChartHeight: 176,
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

      this.setData({ report, turns })
      this.animateScore(report ? (report.total_score || 0) : 0)

      wx.nextTick(() => {
        this.drawRadar()
        this.drawChartsForTab(this.data.activeTab)
      })
    } catch (err) {
      wx.showToast({ title: err.message || "加载失败", icon: "none" })
    } finally {
      wx.hideLoading()
    }
  },

  setSegment(e) {
    const seg = e && e.currentTarget ? String(e.currentTarget.dataset.seg || "") : ""
    if (!seg) return
    this.setData({
      activeSegment: seg,
      reportScrollIntoView: seg === "report" ? "report-tab-anchor" : "",
    })
    if (seg === "report") {
      this.scrollReportToTop()
      setTimeout(() => {
        this.setData({ reportScrollIntoView: "" })
      }, 80)
      wx.nextTick(() => {
        this.drawRadar()
        this.drawChartsForTab(this.data.activeTab)
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
      reportScrollIntoView: "report-tab-anchor",
    })
    this.scrollReportToTop()
    wx.nextTick(() => {
      this.drawChartsForTab(tab)
      setTimeout(() => this.setData({ reportScrollIntoView: "" }), 80)
    })
  },

  scrollReportToTop() {
    this.setData({ reportScrollTop: 1 })
    setTimeout(() => {
      this.setData({ reportScrollTop: 0 })
    }, 16)
  },

  animateScore(targetScore) {
    var self = this
    var current = 0
    var step = Math.max(1, Math.round(targetScore / 40))
    if (this._scoreTimer) clearInterval(this._scoreTimer)
    self.setData({ animatedScore: 0 })
    this._scoreTimer = setInterval(function() {
      current = Math.min(current + step, targetScore)
      self.setData({ animatedScore: current })
      if (current >= targetScore) {
        clearInterval(self._scoreTimer)
        self._scoreTimer = null
      }
    }, 25)
  },

  startAgain() {
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

  drawRadar() {
    const report = this.data.report
    if (!report || !Array.isArray(report.dimension) || report.dimension.length < 3) return
    const dims = report.dimension

    const ctx = wx.createCanvasContext("radarCanvas", this)
    const w = Number(this.data.radarCanvasSize || 220)
    const h = w
    const cx = w / 2
    const cy = h / 2
    const radius = Math.max(70, Math.min(96, Math.round(w * 0.34)))
    const n = dims.length

    ctx.clearRect(0, 0, w, h)
    ctx.setFillStyle(CHART_COLORS.canvasBg)
    ctx.fillRect(0, 0, w, h)
    ctx.setStrokeStyle(CHART_COLORS.grid)
    ctx.setLineWidth(1)

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
    ctx.setFontSize(w >= 220 ? 11 : 10)
    ctx.setFillStyle(CHART_COLORS.label)
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
      const x = cx + radius * Math.cos(a)
      const y = cy + radius * Math.sin(a)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.stroke()

      const label = String(dims[i].name || "")
      const labelDist = radius + Math.max(18, Math.round(w * 0.08))
      const lx = cx + labelDist * Math.cos(a)
      const ly = cy + labelDist * Math.sin(a)

      // Dynamic text alignment based on angle position
      ctx.setTextAlign(lx < cx - 2 ? "right" : lx > cx + 2 ? "left" : "center")
      ctx.setTextBaseline(ly < cy - 2 ? "bottom" : ly > cy + 2 ? "top" : "middle")
      ctx.fillText(label, lx, ly)
    }
    // Reset alignment for subsequent draws
    ctx.setTextAlign("left")
    ctx.setTextBaseline("alphabetic")

    // data polygon
    ctx.setStrokeStyle(CHART_COLORS.line)
    ctx.setLineWidth(2)
    ctx.setFillStyle(CHART_COLORS.area)
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
    ctx.setFillStyle(CHART_COLORS.line)
    for (let i = 0; i < dataPoints.length; i++) {
      ctx.beginPath()
      ctx.arc(dataPoints[i].x, dataPoints[i].y, 3, 0, 2 * Math.PI)
      ctx.fill()
    }

    ctx.draw()
  },

  drawChartsForTab(tab) {
    const report = this.data.report
    if (!report || !report.tabs) return

    if (tab === "fluency") {
      const charts = report.tabs.fluency && report.tabs.fluency.charts ? report.tabs.fluency.charts : []
      charts.forEach((chart) => this.drawLineChart(chart.canvas_id, chart))
      return
    }
    if (tab === "expression") {
      const charts = report.tabs.expression && report.tabs.expression.charts ? report.tabs.expression.charts : []
      charts.forEach((chart) => this.drawLineChart(chart.canvas_id, chart))
      return
    }
    if (tab === "pronunciation") {
      const charts = report.tabs.pronunciation && report.tabs.pronunciation.charts ? report.tabs.pronunciation.charts : []
      charts.forEach((chart) => this.drawLineChart(chart.canvas_id, chart))
      return
    }
  },

  drawLineChart(canvasId, chart) {
    if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return
    const ctx = wx.createCanvasContext(canvasId, this)
    const w = Number(this.data.lineChartWidth || 320)
    const h = Number(this.data.lineChartHeight || 176)

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
    ctx.setFillStyle(CHART_COLORS.canvasBg)
    ctx.fillRect(0, 0, w, h)

    // target range background
    if (tr && tr.length === 2) {
      const y1 = yToPx(tr[0])
      const y2 = yToPx(tr[1])
      ctx.setFillStyle(targetBg)
      ctx.fillRect(padL, Math.min(y1, y2), cw, Math.abs(y2 - y1))
    }

    // axes
    ctx.setStrokeStyle(CHART_COLORS.axis)
    ctx.setLineWidth(1)
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
    ctx.setFillStyle(areaBg)
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
    ctx.setStrokeStyle(lineColor)
    ctx.setLineWidth(2)
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
      ctx.setFillStyle(lineColor)
      ctx.fill()
      // value label
      ctx.setFontSize(9)
      ctx.setFillStyle(CHART_COLORS.label)
      ctx.setTextAlign("center")
      const valStr = formatChartValue(chart, pt.val)
      const labelY = ki === maxIdx ? pt.py - 8 : pt.py + 8
      ctx.setTextBaseline(ki === maxIdx ? "bottom" : "top")
      ctx.fillText(valStr, pt.px, labelY)
    })
    ctx.setTextAlign("left")
    ctx.setTextBaseline("alphabetic")

    ctx.draw()
  },
})
