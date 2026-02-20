const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { track } = require("../../utils/track")

function calcDistributionProgress(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  if (!list.length) return 0
  const finished = list.filter((task) => task.status === "done" || task.status === "failed").length
  return Math.max(0, Math.min(100, Math.round((finished / list.length) * 100)))
}

function pickDistributionPreviewUrl(tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  const doneTask = list.find((task) => task.publish_url)
  if (doneTask?.publish_url) return doneTask.publish_url

  for (const task of list) {
    const payload = task?.action_payload || {}
    if (typeof payload.preview_url === "string" && payload.preview_url.trim()) {
      return payload.preview_url.trim()
    }
  }
  return ""
}

function resolvePreviewUrl(tasks, videoJob) {
  const dist = pickDistributionPreviewUrl(tasks)
  if (dist) return dist

  const v = String(videoJob?.video_url || "").trim()
  if (v) return v
  return ""
}

function isRunningStatus(status) {
  return status === "queued" || status === "running" || status === "submitted"
}

function normalizeVideoProgress(rawValue) {
  const raw = Number(rawValue || 0)
  const percent = raw <= 1 ? raw * 100 : raw
  return Math.max(0, Math.min(100, Math.round(percent)))
}

Page({
  data: {
    jobId: "",
    videoJobId: "",
    loading: false,
    job: null,
    videoJob: null,
    tasks: [],
    progressPercent: 0,
    previewUrl: "",
    lastError: "",
    retryingPlatform: "",
  },

  onLoad(query) {
    const jobId = String(query?.jobId || query?.job_id || "").trim()
    const videoJobId = String(query?.videoJobId || query?.video_job_id || "").trim()
    this.setData({ jobId, videoJobId })
  },

  onShow() {
    track("video_jobs_open")
    if (this.data.jobId || this.data.videoJobId) {
      this.refreshJobs()
    }
  },

  onUnload() {
    this.clearDistributePollTimer()
    this.clearVideoPollTimer()
  },

  async onPullDownRefresh() {
    await this.refreshJobs({ silent: true })
    wx.stopPullDownRefresh()
  },

  clearDistributePollTimer() {
    if (this._distPollTimer) {
      clearTimeout(this._distPollTimer)
      this._distPollTimer = null
    }
  },

  clearVideoPollTimer() {
    if (this._videoPollTimer) {
      clearTimeout(this._videoPollTimer)
      this._videoPollTimer = null
    }
  },

  scheduleDistributePoll() {
    this.clearDistributePollTimer()
    this._distPollTimer = setTimeout(() => {
      this.refreshJobs({ silent: true })
    }, 4000)
  },

  scheduleVideoPoll() {
    this.clearVideoPollTimer()
    this._videoPollTimer = setTimeout(() => {
      this.refreshJobs({ silent: true })
    }, 4000)
  },

  async refreshJobs(opts = {}) {
    const silent = Boolean(opts.silent)
    const hasDist = Boolean(String(this.data.jobId || "").trim())
    const hasVideo = Boolean(String(this.data.videoJobId || "").trim())

    if (!hasDist && !hasVideo) {
      if (!silent) wx.showToast({ title: "缺少任务ID", icon: "none" })
      return
    }

    if (!silent) this.setData({ loading: true, lastError: "" })

    let nextJob = this.data.job
    let nextTasks = Array.isArray(this.data.tasks) ? this.data.tasks : []
    let nextVideoJob = this.data.videoJob
    let nextPreviewUrl = this.data.previewUrl

    if (hasDist) {
      try {
        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: `/api/mp/distribute/jobs/${encodeURIComponent(this.data.jobId)}`,
        })
        if (!res?.ok || !res?.job) throw new Error(res?.message || "分发任务查询失败")

        nextJob = res.job
        nextTasks = Array.isArray(res.tasks) ? res.tasks : []
        if (isRunningStatus(res.job.status)) {
          this.scheduleDistributePoll()
        } else {
          this.clearDistributePollTimer()
        }
      } catch (error) {
        const message = error?.message || "分发任务查询失败"
        this.setData({ lastError: message })
        this.clearDistributePollTimer()
        if (!silent) wx.showToast({ title: message, icon: "none" })
      }
    } else {
      this.clearDistributePollTimer()
    }

    if (hasVideo) {
      try {
        const res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: `/api/mp/video/jobs/${encodeURIComponent(this.data.videoJobId)}`,
        })
        if (!res?.ok || !res?.job) throw new Error(res?.message || "视频任务查询失败")

        nextVideoJob = {
          id: this.data.videoJobId,
          status: res.job.status,
          progress: normalizeVideoProgress(res.job.progress),
          video_url: res.job.video_url || "",
          error: res.job.error || "",
        }

        if (isRunningStatus(res.job.status)) {
          this.scheduleVideoPoll()
        } else {
          this.clearVideoPollTimer()
        }
      } catch (error) {
        const message = error?.message || "视频任务查询失败"
        this.setData({ lastError: message })
        this.clearVideoPollTimer()
        if (!silent) wx.showToast({ title: message, icon: "none" })
      }
    } else {
      this.clearVideoPollTimer()
    }

    nextPreviewUrl = resolvePreviewUrl(nextTasks, nextVideoJob)

    this.setData({
      job: nextJob,
      tasks: nextTasks,
      videoJob: nextVideoJob,
      progressPercent: calcDistributionProgress(nextTasks),
      previewUrl: nextPreviewUrl,
    })

    if (!silent) this.setData({ loading: false })
  },

  async handleRetryTask(e) {
    const platform = String(e.currentTarget.dataset.platform || "").trim()
    const contentId = this.data.job?.content_id
    if (!platform || !contentId) return

    track("distribute_retry_click", {
      platform,
      from_job_id: this.data.jobId,
    })

    this.setData({ retryingPlatform: platform })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/distribute",
        method: "POST",
        data: {
          content_id: contentId,
          platforms: [platform],
          mode: "immediate",
        },
      })

      if (!res?.ok || !res?.job_id) throw new Error(res?.message || "重试失败")

      this.setData({ jobId: res.job_id })
      wx.showToast({ title: "重试已提交", icon: "success" })
      await this.refreshJobs({ silent: true })
    } catch (error) {
      wx.showToast({ title: error?.message || error?.data?.message || "重试失败", icon: "none" })
    } finally {
      this.setData({ retryingPlatform: "" })
    }
  },

  handleCopyPreviewUrl() {
    const url = String(this.data.previewUrl || "").trim()
    if (!url) {
      wx.showToast({ title: "暂无预览地址", icon: "none" })
      return
    }

    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "预览链接已复制", icon: "success" }),
    })
  },

  handleBackToDistribute() {
    const contentId = String(this.data.job?.content_id || "").trim()
    const videoJobId = String(this.data.videoJobId || "").trim()
    const query = []
    if (contentId) query.push(`contentId=${encodeURIComponent(contentId)}`)
    if (videoJobId) query.push(`videoJobId=${encodeURIComponent(videoJobId)}`)
    wx.navigateTo({ url: `/pages/content-studio/index${query.length ? `?${query.join("&")}` : ""}` })
  },
})
