const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")

function toShanghaiDateTime(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  const shanghai = new Date(utcMs + 8 * 60 * 60 * 1000)
  const yyyy = shanghai.getUTCFullYear()
  const mm = String(shanghai.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(shanghai.getUTCDate()).padStart(2, "0")
  const hh = String(shanghai.getUTCHours()).padStart(2, "0")
  const min = String(shanghai.getUTCMinutes()).padStart(2, "0")
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
  }
}

function normalizeIngestSource(res) {
  const source = res?.source || (Array.isArray(res?.sources) ? res.sources[0] : null) || null
  return {
    id: source?.id || res?.source_id || "",
    title: source?.title || source?.meta?.title || "",
    text: source?.text_content || source?.text || "",
    author: source?.author || "",
  }
}

function normalizeRewrite(res) {
  const rewrite = res?.rewrite || res?.result || null
  return {
    id: rewrite?.id || res?.rewrite_id || "",
    title: rewrite?.result_title || rewrite?.title || "",
    body: rewrite?.result_body || rewrite?.body || "",
    script: rewrite?.result_script || rewrite?.script || "",
    tags: Array.isArray(rewrite?.result_tags)
      ? rewrite.result_tags.join(" ")
      : Array.isArray(rewrite?.tags)
        ? rewrite.tags.join(" ")
        : "",
  }
}

function normalizeVideoJob(res) {
  const job = res?.job || null
  return {
    id: job?.id || res?.job_id || "",
  }
}

function hasRequiredAvatarAssets(profile) {
  const driveVideo = String(profile?.boss_drive_video_path || "").trim()
  const portrait = String(profile?.boss_portrait_path || "").trim()
  return Boolean(driveVideo && portrait)
}

function buildScheduleAt(data) {
  if (data.distributionMode !== "scheduled") return undefined
  const d = String(data.scheduleDate || "").trim()
  const t = String(data.scheduleTime || "").trim()
  if (!d || !t) return ""
  return `${d}T${t}:00+08:00`
}

function selectedPlatforms(selection) {
  return ["xiaohongshu", "douyin", "video_account"].filter((platform) => Boolean(selection[platform]))
}

function billingErrorMessage(err) {
  const code = err?.data?.error_code || err?.data?.code || err?.code
  if (code === "insufficient_credits") return err?.message || "积分不足，请先购买套餐或积分。"
  if (code === "plan_required") return err?.message || "当前套餐不支持，请先升级。"
  return ""
}

Page({
  data: {
    sourceUrl: "",
    sourceId: "",
    sourceTitle: "",
    sourceText: "",
    sourceAuthor: "",

    rewriteId: "",
    contentId: "",
    rewriteTitle: "",
    rewriteBody: "",
    rewriteScript: "",
    rewriteTags: "",

    avatarProfileId: "",
    videoJobId: "",

    distributionMode: "immediate",
    scheduleDate: "",
    scheduleTime: "",
    platformSelection: {
      xiaohongshu: true,
      douyin: true,
      video_account: true,
    },
    distributeJobId: "",
    distributeTasks: [],

    ingestLoading: false,
    rewriteLoading: false,
    videoLoading: false,
    distributeLoading: false,

    lastError: "",
  },

  onLoad(query) {
    const seed = toShanghaiDateTime(new Date(Date.now() + 30 * 60 * 1000))
    this.setData({
      scheduleDate: seed.date,
      scheduleTime: seed.time,
      sourceId: String(query?.sourceId || query?.source_id || "").trim(),
      rewriteId: String(query?.rewriteId || query?.rewrite_id || "").trim(),
      contentId: String(query?.contentId || query?.content_id || "").trim(),
      videoJobId: String(query?.videoJobId || query?.video_job_id || "").trim(),
      avatarProfileId: String(wx.getStorageSync("xhs_store_profile_id") || "").trim(),
    })
  },

  onShow() {
    track("content_studio_open")
  },

  onSourceUrlInput(e) {
    this.setData({ sourceUrl: e.detail.value })
  },

  onAvatarProfileInput(e) {
    this.setData({ avatarProfileId: e.detail.value })
  },

  onScheduleDateChange(e) {
    this.setData({ scheduleDate: e.detail.value })
  },

  onScheduleTimeChange(e) {
    this.setData({ scheduleTime: e.detail.value })
  },

  onModeImmediate() {
    this.setData({ distributionMode: "immediate" })
  },

  onModeScheduled() {
    this.setData({ distributionMode: "scheduled" })
  },

  onTogglePlatform(e) {
    const platform = String(e.currentTarget.dataset.platform || "").trim()
    if (!platform) return
    const next = { ...this.data.platformSelection }
    next[platform] = !next[platform]
    this.setData({ platformSelection: next })
  },

  resolvedContentId() {
    return this.data.videoJobId || this.data.rewriteId || this.data.contentId || ""
  },

  async handleIngest() {
    const url = String(this.data.sourceUrl || "").trim()
    if (!url) {
      wx.showToast({ title: "请先粘贴链接", icon: "none" })
      return
    }

    this.setData({ ingestLoading: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/content/ingest",
        method: "POST",
        data: {
          mode: "single_link",
          url,
        },
      })
      if (!res?.ok) throw new Error(res?.error || "提取失败")

      const source = normalizeIngestSource(res)
      if (!source.id) throw new Error("提取成功但未返回 source_id")

      this.setData({
        sourceId: source.id,
        sourceTitle: source.title,
        sourceText: source.text,
        sourceAuthor: source.author,
      })
      wx.showToast({ title: "提取完成", icon: "success" })
    } catch (error) {
      const billingMsg = billingErrorMessage(error)
      const message = billingMsg || error?.message || "提取失败"
      this.setData({ lastError: message })
      if (billingMsg) {
        wx.navigateTo({ url: "/pages/pay/index" })
      }
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ ingestLoading: false })
    }
  },

  async handleRewrite() {
    if (!this.data.sourceId) {
      wx.showToast({ title: "请先完成提取", icon: "none" })
      return
    }

    this.setData({ rewriteLoading: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/content/rewrite",
        method: "POST",
        data: {
          source_id: this.data.sourceId,
          target: "douyin_video",
          tone: "professional",
          constraints: { avoid_risk_words: true },
        },
      })
      if (!res?.ok) throw new Error(res?.error || "改写失败")

      const rewrite = normalizeRewrite(res)
      if (!rewrite.id) throw new Error("改写成功但未返回 rewrite_id")

      this.setData({
        rewriteId: rewrite.id,
        contentId: rewrite.id,
        rewriteTitle: rewrite.title,
        rewriteBody: rewrite.body,
        rewriteScript: rewrite.script,
        rewriteTags: rewrite.tags,
      })
      wx.showToast({ title: "改写完成", icon: "success" })
    } catch (error) {
      const billingMsg = billingErrorMessage(error)
      const message = billingMsg || error?.message || "改写失败"
      this.setData({ lastError: message })
      if (billingMsg) {
        wx.navigateTo({ url: "/pages/pay/index" })
      }
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ rewriteLoading: false })
    }
  },

  async handleGenerateVideo() {
    if (!this.data.rewriteId) {
      wx.showToast({ title: "请先完成改写", icon: "none" })
      return
    }

    const avatarProfileId = String(this.data.avatarProfileId || "").trim()
    if (!avatarProfileId) {
      wx.showToast({ title: "请填写头像档案ID", icon: "none" })
      return
    }

    try {
      const profileRes = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: `/api/mp/store-profiles/${encodeURIComponent(avatarProfileId)}`,
      })

      const profile = profileRes?.profile || null
      if (!profileRes?.ok || !profile || !hasRequiredAvatarAssets(profile)) {
        const message = "先补老板驱动视频/头像素材"
        this.setData({ lastError: message })
        wx.showToast({ title: message, icon: "none" })
        return
      }
    } catch (_) {
      const message = "先补老板驱动视频/头像素材"
      this.setData({ lastError: message })
      wx.showToast({ title: message, icon: "none" })
      return
    }

    this.setData({ videoLoading: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/video/jobs",
        method: "POST",
        data: {
          rewrite_id: this.data.rewriteId,
          duration_profile: "15_25s",
          avatar_profile_id: avatarProfileId,
          product_assets: [],
        },
      })
      if (!res?.ok) throw new Error(res?.error || "视频任务创建失败")

      const job = normalizeVideoJob(res)
      if (!job.id) throw new Error("创建成功但未返回 video_job_id")

      this.setData({ videoJobId: job.id })
      wx.showToast({ title: "视频任务已创建", icon: "success" })
    } catch (error) {
      const billingMsg = billingErrorMessage(error)
      const message = billingMsg || error?.message || "视频任务创建失败"
      this.setData({ lastError: message })
      if (billingMsg) {
        wx.navigateTo({ url: "/pages/pay/index" })
      }
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ videoLoading: false })
    }
  },

  async handleDistribute() {
    const contentId = this.resolvedContentId()
    if (!contentId) {
      wx.showToast({ title: "请先完成改写或视频生成", icon: "none" })
      return
    }

    const platforms = selectedPlatforms(this.data.platformSelection)
    if (!platforms.length) {
      wx.showToast({ title: "请至少选择一个平台", icon: "none" })
      return
    }

    const scheduleAt = buildScheduleAt(this.data)
    if (this.data.distributionMode === "scheduled" && !scheduleAt) {
      wx.showToast({ title: "请选择定时发布时间", icon: "none" })
      return
    }

    this.setData({ distributeLoading: true, lastError: "" })
    try {
      const payload = {
        content_id: contentId,
        platforms,
        mode: this.data.distributionMode,
      }
      if (scheduleAt) payload.schedule_at = scheduleAt

      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/distribute",
        method: "POST",
        data: payload,
      })

      if (!res?.ok || !res?.job_id) {
        throw new Error(res?.error || "分发提交失败")
      }

      this.setData({
        distributeJobId: res.job_id,
        distributeTasks: Array.isArray(res.tasks) ? res.tasks : [],
      })
      wx.showToast({ title: "分发已提交", icon: "success" })
    } catch (error) {
      const message = error?.message || "分发失败"
      const code = error?.data?.error_code || error?.data?.code || error?.code
      this.setData({ lastError: message })
      if (code === "insufficient_credits" || code === "plan_required") {
        wx.navigateTo({ url: "/pages/pay/index" })
      }
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ distributeLoading: false })
    }
  },

  handleOpenVideoJobs() {
    const jobId = String(this.data.distributeJobId || "").trim()
    const videoJobId = String(this.data.videoJobId || "").trim()
    const contentId = String(this.resolvedContentId() || "").trim()

    if (!jobId && !videoJobId && !contentId) {
      wx.showToast({ title: "暂无可查看任务", icon: "none" })
      return
    }

    const query = []
    if (jobId) query.push(`jobId=${encodeURIComponent(jobId)}`)
    if (videoJobId) query.push(`videoJobId=${encodeURIComponent(videoJobId)}`)
    if (contentId) query.push(`contentId=${encodeURIComponent(contentId)}`)
    wx.navigateTo({ url: `/pages/video-jobs/index?${query.join("&")}` })
  },
})
