const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")
const { track } = require("../../utils/track")
const { normalizePlan } = require("../../utils/credits")

function shortId(value) {
  const s = String(value || "")
  return s.length > 6 ? s.slice(-6) : s
}

function formatTime(value) {
  const iso = String(value || "").trim()
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function toAbsoluteUrl(url) {
  const v = String(url || "").trim()
  if (!v) return ""
  if (v.startsWith("http://") || v.startsWith("https://")) return v
  if (v.startsWith("/")) return `${IP_FACTORY_BASE_URL}${v}`
  return v
}

function packStatusText(status) {
  if (status === "done") return "已生成"
  if (status === "failed") return "失败"
  return "生成中"
}

function profileToLabels(profile) {
  const plan = normalizePlan(profile?.plan)
  const planLabel = profile?.plan_label ? String(profile.plan_label) : plan
  const unlimited = Boolean(profile?.credits_unlimited)
  const balance = Number(profile?.credits_balance || 0)
  const creditsLabel = unlimited ? "积分 无限" : `积分 ${balance}`
  const showUpgrade = plan === "free" || plan === "basic"
  return { plan, planLabel, creditsLabel, showUpgrade }
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
}

function normalizeTopicKey(topic) {
  return String(topic || "")
    .trim()
    .replace(/\s+/g, " ")
}

function hashString(input) {
  const s = String(input || "")
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

Page({
  data: {
    loading: false,
    loadingProfile: false,

    plan: "",
    planLabel: "",
    creditsLabel: "",
    showUpgrade: false,

    query: "",
    filter: "all", // all | topic | script | xhs | pack | report

    rawReports: [],
    rawXhsDrafts: [],
    rawDeliveryPacks: [],

    allAssets: [],
    visibleAssets: [],
  },

  onShow() {
    track("library_view")
    this.refreshAll()
  },

  async onPullDownRefresh() {
    await this.refreshAll()
    wx.stopPullDownRefresh()
  },

  async refreshAll() {
    await Promise.all([this.loadProfile(), this.loadLibrary()])
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
      const labels = profileToLabels(res.profile || {})

      this.setData({
        plan: labels.plan,
        planLabel: labels.planLabel,
        creditsLabel: labels.creditsLabel,
        showUpgrade: labels.showUpgrade,
      })
    } catch (_) {
      // ignore
    } finally {
      this.setData({ loadingProfile: false })
    }
  },

  async loadLibrary() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/library?limit=50",
      })

      if (!res?.ok) {
        throw new Error(res?.error || "加载失败")
      }

      const lib = res.library || {}
      this.setData({
        rawReports: lib.reports || [],
        rawXhsDrafts: lib.xhs_drafts || [],
        rawDeliveryPacks: lib.delivery_packs || [],
      })

      this.rebuildAssets()
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  rebuildAssets() {
    const reports = this.data.rawReports || []
    const drafts = this.data.rawXhsDrafts || []
    const packs = this.data.rawDeliveryPacks || []

    const draftById = new Map()
    for (const d of drafts) {
      if (d?.id) draftById.set(d.id, d)
    }

    const assets = []

    for (const r of reports) {
      const createdAtLabel = formatTime(r.created_at)

      if (r?.step_id === "P7") {
        assets.push({
          id: r.id,
          kind: "report",
          kindLabel: "报告(P7)",
          created_at: r.created_at,
          createdAtLabel,
          title: r.title || "《选题库》",
          subtitle: "打开查看全文；素材库的“选题”筛选默认展示最新一份 P7 的单条选题。",
          statusLabel: "P7",
          statusClass: "tag-accent",
          reportId: r.id,
        })
        continue
      }

      if (r?.step_id === "P8") {
        const meta = isObject(r.metadata) ? r.metadata : {}
        const topic = typeof meta.topic === "string" ? meta.topic : ""
        const linkedDraftId = typeof meta.xhs_draft_id === "string" ? meta.xhs_draft_id : ""
        const draft = linkedDraftId ? draftById.get(linkedDraftId) : null
        const isPublished = Boolean(draft && draft.status === "published")

        assets.push({
          id: r.id,
          kind: "script",
          kindLabel: "脚本(P8)",
          created_at: r.created_at,
          createdAtLabel,
          title: topic ? `脚本：${topic}` : (r.title || "《脚本初稿》"),
          subtitle: linkedDraftId ? `关联草稿：${shortId(linkedDraftId)}` : "下一步：转为小红书草稿，继续封面/发布",
          statusLabel: linkedDraftId ? (isPublished ? "已发布" : "已转草稿") : "未转草稿",
          statusClass: linkedDraftId ? (isPublished ? "tag-success" : "tag-accent") : "",
          reportId: r.id,
          linkedDraftId,
        })
        continue
      }

      // Other reports (P9/P10) - still keep in library feed
      assets.push({
        id: r.id,
        kind: "report",
        kindLabel: r.step_id ? `报告(${r.step_id})` : "报告",
        created_at: r.created_at,
        createdAtLabel,
        title: r.title || "报告",
        subtitle: "",
        statusLabel: r.step_id || "REPORT",
        statusClass: "tag-accent",
        reportId: r.id,
      })
    }

    // Expand latest P7 into "topic items"
    const p7Reports = reports.filter((r) => r?.step_id === "P7")
    if (p7Reports.length) {
      const sorted = [...p7Reports].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      const latest = sorted[0]
      const meta = isObject(latest?.metadata) ? latest.metadata : {}
      const topicsRaw = Array.isArray(meta.p7_topics) ? meta.p7_topics : []
      const topics = topicsRaw
        .filter((t) => typeof t === "string")
        .map((t) => String(t).trim())
        .filter(Boolean)
        .slice(0, 220)

      const usedMap = isObject(meta.p7_topics_used) ? meta.p7_topics_used : {}
      const usedKeys = new Set(Object.keys(usedMap).map((k) => normalizeTopicKey(k)))

      for (const t of topics) {
        const key = normalizeTopicKey(t)
        const used = usedKeys.has(key)
        assets.push({
          id: `topic:${latest.id}:${hashString(key)}`,
          kind: "topic",
          kindLabel: "选题",
          created_at: latest.created_at,
          createdAtLabel: formatTime(latest.created_at),
          title: t,
          subtitle: `来自：${latest.title || "P7 选题库"}`,
          statusLabel: used ? "已用" : "未用",
          statusClass: used ? "tag-success" : "",
          p7ReportId: latest.id,
          topic: t,
          used,
        })
      }
    }

    for (const d of drafts) {
      const title = d.result_title || d.topic || "小红书草稿"
      const coverAbs = d.cover_url ? toAbsoluteUrl(d.cover_url) : ""
      assets.push({
        id: d.id,
        kind: "xhs",
        kindLabel: "小红书",
        created_at: d.created_at,
        createdAtLabel: formatTime(d.created_at),
        title,
        subtitle: d.status === "published" ? "已发布，可复制链接" : "草稿未发布（可继续生成封面并发布）",
        statusLabel: d.status === "published" ? "已发布" : "草稿",
        statusClass: d.status === "published" ? "tag-success" : "",
        draftId: d.id,
        coverAbs,
        publishUrl: d.publish_url || "",
      })
    }

    for (const p of packs) {
      assets.push({
        id: p.id,
        kind: "pack",
        kindLabel: "交付包",
        created_at: p.created_at,
        createdAtLabel: formatTime(p.created_at),
        title: `交付包 ${shortId(p.id)}`,
        subtitle: p.error_message ? `说明：${p.error_message}` : "",
        statusLabel: packStatusText(p.status),
        statusClass: p.status === "done" ? "tag-success" : "",
        packId: p.id,
        packStatus: p.status,
      })
    }

    assets.sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime()
      const tb = new Date(b.created_at || 0).getTime()
      return tb - ta
    })

    this.setData({ allAssets: assets })
    this.applyFilters()
  },

  applyFilters() {
    const q = String(this.data.query || "").trim().toLowerCase()
    const filter = String(this.data.filter || "all")
    const all = this.data.allAssets || []

    const out = all.filter((a) => {
      if (filter !== "all" && a.kind !== filter) return false
      if (!q) return true
      const hay = `${a.title || ""} ${a.subtitle || ""} ${a.kindLabel || ""}`.toLowerCase()
      return hay.includes(q)
    })

    this.setData({ visibleAssets: out })
  },

  onQueryInput(e) {
    this.setData({ query: e.detail.value })
    this.applyFilters()
  },

  onSelectFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (!filter) return
    this.setData({ filter })
    this.applyFilters()
  },

  handleUpgrade() {
    track("library_upgrade_click")
    wx.navigateTo({ url: "/pages/pay/index" })
  },

  handleGoP7() {
    wx.navigateTo({ url: "/pages/workflow-p7/index" })
  },

  handleGoP8() {
    wx.navigateTo({ url: "/pages/workflow-p8/index" })
  },

  handleOpenReport(e) {
    const reportId = e.currentTarget.dataset.id
    if (!reportId) return
    track("library_open_report", { reportId })
    wx.navigateTo({ url: `/pages/report-viewer/index?reportId=${encodeURIComponent(reportId)}` })
  },

  handleGoP8FromP7(e) {
    const p7ReportId = e.currentTarget.dataset.id
    if (!p7ReportId) return
    track("library_go_p8_from_p7", { p7ReportId })
    wx.navigateTo({ url: `/pages/workflow-p8/index?p7ReportId=${encodeURIComponent(p7ReportId)}` })
  },

  handleGoP8WithTopic(e) {
    const p7ReportId = e.currentTarget.dataset.p7
    const topic = e.currentTarget.dataset.topic
    if (!p7ReportId || !topic) return
    track("library_go_p8_with_topic", { p7ReportId })
    wx.navigateTo({
      url: `/pages/workflow-p8/index?p7ReportId=${encodeURIComponent(p7ReportId)}&topic=${encodeURIComponent(topic)}`,
    })
  },

  async handleToggleTopicUsed(e) {
    const p7ReportId = e.currentTarget.dataset.p7
    const topic = e.currentTarget.dataset.topic
    const used = String(e.currentTarget.dataset.used) === "1"
    if (!p7ReportId || !topic) return

    try {
      await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/reports/${encodeURIComponent(p7ReportId)}`,
        method: "PATCH",
        data: {
          op: used ? "p7_topic_unused" : "p7_topic_used",
          topic,
        },
      })

      track("library_toggle_topic_used", { p7ReportId, used: !used })
      await this.loadLibrary()
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" })
    }
  },

  handleOpenDraft(e) {
    const draftId = e.currentTarget.dataset.id
    if (!draftId) return
    track("library_open_draft", { draftId })
    wx.navigateTo({ url: `/pages/xiaohongshu/index?draftId=${encodeURIComponent(draftId)}` })
  },

  handleCopyUrl(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.setClipboardData({
      data: String(url),
      success: () => {
        track("library_copy_url")
        wx.showToast({ title: "已复制", icon: "success" })
      },
    })
  },

  async handleConvertReportToDraft(e) {
    const reportId = e.currentTarget.dataset.id
    if (!reportId) return

    wx.showLoading({ title: "创建草稿中" })

    try {
      const reportRes = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/reports/${encodeURIComponent(reportId)}`,
      })

      if (!reportRes?.ok || !reportRes?.report?.content) {
        throw new Error(reportRes?.error || "获取脚本失败")
      }

      const report = reportRes.report
      const meta = isObject(report.metadata) ? report.metadata : {}
      const topic = typeof meta.topic === "string" ? meta.topic : ""
      const content = String(report.content || "")

      const draftRes = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/xhs/drafts",
        method: "POST",
        data: {
          source: "mp_p8",
          contentType: "treatment",
          ...(topic ? { topic, resultTitle: topic } : {}),
          resultContent: content,
          sourceReportId: reportId,
        },
      })

      if (!draftRes?.ok || !draftRes?.draft?.id) {
        throw new Error(draftRes?.error || "创建草稿失败")
      }

      const draftId = draftRes.draft.id
      track("library_convert_report_to_xhs", { reportId, draftId })
      wx.hideLoading()

      // Reload to update "已转草稿/已发布" tags, then jump into workshop.
      await this.loadLibrary()
      wx.navigateTo({ url: `/pages/xiaohongshu/index?draftId=${encodeURIComponent(draftId)}` })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || "创建草稿失败", icon: "none" })
    }
  },

  handleOpenPack(e) {
    const packId = e.currentTarget.dataset.id
    if (!packId) return

    const token = getAccessToken()
    if (!token) {
      wx.navigateTo({ url: "/pages/login/index" })
      return
    }

    wx.showLoading({ title: "下载中" })

    wx.downloadFile({
      url: `${IP_FACTORY_BASE_URL}/api/mp/delivery-pack/${packId}/download`,
      header: {
        Authorization: `Bearer ${token}`,
        "x-device-id": getDeviceId(),
      },
      success: (downloadRes) => {
        if (downloadRes.statusCode < 200 || downloadRes.statusCode >= 300) {
          wx.hideLoading()
          wx.showToast({ title: "下载失败", icon: "none" })
          return
        }

        wx.openDocument({
          filePath: downloadRes.tempFilePath,
          showMenu: true,
          success: () => {
            wx.hideLoading()
            track("library_open_pack", { packId })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: "打开失败", icon: "none" })
          },
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: "下载失败", icon: "none" })
      },
    })
  },
})
