const { API_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

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
  const dimension = (report.dimension || []).map((d) => ({
    ...d,
    stars_text: starsText(d.stars),
  }))

  const orgExamples = (report.tabs?.organization?.audio_examples || []).map((ex) => ({
    ...ex,
    audio_seconds_text: formatSeconds(ex.audio_seconds),
  }))

  return {
    ...report,
    dimension,
    tabs: {
      ...report.tabs,
      organization: {
        ...report.tabs.organization,
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
    report: null,
    turns: [],
    playingId: "",
  },

  onLoad(options) {
    const sessionId = options && options.sessionId ? String(options.sessionId) : ""
    if (!sessionId) {
      wx.showToast({ title: "缺少 sessionId", icon: "none" })
      return
    }
    this.audioCtx = wx.createInnerAudioContext()
    this.audioCtx.onEnded(() => this.setData({ playingId: "" }))
    this.setData({ sessionId })
    this.loadAll(sessionId)
  },

  onUnload() {
    try {
      if (this.audioCtx) this.audioCtx.destroy()
    } catch {}
  },

  async loadAll(sessionId) {
    wx.showLoading({ title: "加载中" })
    try {
      const [endRes, sessionRes] = await Promise.all([
        request({
          baseUrl: API_BASE_URL,
          url: `/api/voice-coach/sessions/${sessionId}/end`,
          method: "POST",
          data: { mode: "view_report" },
        }),
        request({
          baseUrl: API_BASE_URL,
          url: `/api/voice-coach/sessions/${sessionId}`,
          method: "GET",
        }),
      ])

      const report = normalizeReport(endRes.report)
      const turns = (sessionRes.turns || []).map(normalizeTurn)

      this.setData({ report, turns })

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
    this.setData({ activeSegment: seg })
  },

  setTab(e) {
    const tab = e && e.currentTarget ? String(e.currentTarget.dataset.tab || "") : ""
    if (!tab) return
    this.setData({ activeTab: tab })
    wx.nextTick(() => this.drawChartsForTab(tab))
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
    const w = 280
    const h = 280
    const cx = w / 2
    const cy = h / 2
    const radius = 92
    const n = dims.length

    ctx.clearRect(0, 0, w, h)
    ctx.setStrokeStyle("rgba(0,0,0,0.08)")
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

    // axes + labels
    ctx.setFontSize(10)
    ctx.setFillStyle("rgba(0,0,0,0.55)")
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
      const x = cx + radius * Math.cos(a)
      const y = cy + radius * Math.sin(a)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.stroke()

      const label = String(dims[i].name || "")
      const lx = cx + (radius + 14) * Math.cos(a)
      const ly = cy + (radius + 14) * Math.sin(a)
      ctx.fillText(label, lx - 18, ly + 4)
    }

    // data polygon
    ctx.setStrokeStyle("rgba(32,168,94,0.9)")
    ctx.setLineWidth(2)
    ctx.setFillStyle("rgba(32,168,94,0.22)")
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const score = Number(dims[i].score || 0)
      const v = Math.max(0, Math.min(1, score / 100))
      const a = (-Math.PI / 2) + (i * 2 * Math.PI) / n
      const x = cx + radius * v * Math.cos(a)
      const y = cy + radius * v * Math.sin(a)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.draw()
  },

  drawChartsForTab(tab) {
    const report = this.data.report
    if (!report || !report.tabs) return

    if (tab === "fluency") {
      const charts = report.tabs.fluency && report.tabs.fluency.charts ? report.tabs.fluency.charts : []
      this.drawLineChart("fluencyChart1", charts[0])
      this.drawLineChart("fluencyChart2", charts[1])
      return
    }
    if (tab === "expression") {
      const charts = report.tabs.expression && report.tabs.expression.charts ? report.tabs.expression.charts : []
      this.drawLineChart("expressionChart1", charts[0])
      return
    }
    if (tab === "pronunciation") {
      const charts = report.tabs.pronunciation && report.tabs.pronunciation.charts ? report.tabs.pronunciation.charts : []
      this.drawLineChart("pronunciationChart1", charts[0])
      return
    }
  },

  drawLineChart(canvasId, chart) {
    if (!chart || !Array.isArray(chart.points) || chart.points.length < 2) return
    const ctx = wx.createCanvasContext(canvasId, this)
    const w = 330
    const h = 160

    const padL = 34
    const padR = 10
    const padT = 14
    const padB = 28
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

    ctx.clearRect(0, 0, w, h)
    ctx.setFillStyle("#ffffff")
    ctx.fillRect(0, 0, w, h)

    // target range background
    if (tr && tr.length === 2) {
      const y1 = yToPx(tr[0])
      const y2 = yToPx(tr[1])
      ctx.setFillStyle("rgba(32,168,94,0.10)")
      ctx.fillRect(padL, Math.min(y1, y2), cw, Math.abs(y2 - y1))
    }

    // axes
    ctx.setStrokeStyle("rgba(0,0,0,0.08)")
    ctx.setLineWidth(1)
    ctx.beginPath()
    ctx.moveTo(padL, padT)
    ctx.lineTo(padL, padT + ch)
    ctx.lineTo(padL + cw, padT + ch)
    ctx.stroke()

    // line
    ctx.setStrokeStyle("rgba(32,168,94,0.95)")
    ctx.setLineWidth(2)
    ctx.beginPath()
    points.forEach((p, idx) => {
      const x = xToPx(Number(p.x || 0))
      const y = yToPx(Number(p.y || 0))
      if (idx === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // labels
    ctx.setFillStyle("rgba(0,0,0,0.45)")
    ctx.setFontSize(10)
    ctx.fillText(String(chart.label || ""), padL, 12)

    ctx.draw()
  },
})

