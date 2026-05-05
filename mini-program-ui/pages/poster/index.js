const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")
const { buildAbsoluteApiUrl } = require("../../utils/http-base")
const { getAccessToken } = require("../../utils/auth")
const { getDeviceId } = require("../../utils/device")

const SIZE_OPTIONS = ["4:5", "3:4", "9:16", "16:9", "1:1"]
const RESOLUTION_OPTIONS = ["1k", "2k"]
const DEFAULT_RESOLUTION = "1k"
const DEFAULT_SESSION_ID = `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const PRIMARY_TEMPLATE_IDS = ["P01", "P02", "P03", "P04", "P05", "P10"]
const MORE_TEMPLATE_IDS = ["P06", "P07", "P08", "P09", "P11", "P12"]
const ATTACHMENT_KINDS = ["store", "product", "people", "logo"]
const TEMPLATE_TITLES = {
  P01: "新客首单",
  P02: "节日活动",
  P03: "爆款项目",
  P04: "品牌形象",
  P05: "会员招募",
  P06: "开业宣传",
  P07: "本地探店",
  P08: "避坑封面",
  P09: "知识卡",
  P10: "价目菜单",
  P11: "门店电子屏",
  P12: "朋友圈转发",
}
const TEMPLATE_SHORT_LABELS = {
  P01: "新客",
  P02: "活动",
  P03: "项目",
  P04: "品牌",
  P05: "复购",
  P06: "开业",
  P07: "探店",
  P08: "避坑",
  P09: "知识",
  P10: "菜单",
  P11: "大屏",
  P12: "朋友圈",
}
const ASSET_CARDS = [
  { kind: "logo", label: "Logo", hint: "品牌识别", localPath: "", uploaded: false },
  { kind: "store", label: "门店", hint: "真实空间", localPath: "", uploaded: false },
  { kind: "product", label: "项目", hint: "服务/产品", localPath: "", uploaded: false },
  { kind: "people", label: "人物", hint: "案例/顾客", localPath: "", uploaded: false },
]
const RECORDER_OPTIONS = {
  duration: 30000,
  format: "mp3",
  sampleRate: 16000,
  numberOfChannels: 1,
  encodeBitRate: 64000,
  audioSource: "voice_recognition",
  frameSize: 16,
}

function toAbsoluteUrl(url) {
  const v = String(url || "").trim()
  if (!v) return ""
  return buildAbsoluteApiUrl(v, IP_FACTORY_BASE_URL)
}

function isBillingError(err) {
  const code = err?.data?.code || err?.code
  const status = Number(err?.statusCode || err?.status || 0)
  if (status === 402) return true
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
      if (res.confirm) wx.navigateTo({ url: "/pages/pay/index" })
    },
  })
  return true
}

function canvasForSize(size) {
  if (size === "3:4") return { width: 900, height: 1200, size }
  if (size === "9:16") return { width: 900, height: 1600, size }
  if (size === "16:9") return { width: 1600, height: 900, size }
  if (size === "1:1") return { width: 1000, height: 1000, size }
  return { width: 900, height: 1125, size: "4:5" }
}

function buildPreviewBoxStyle(canvas) {
  const ratio = canvas.height / canvas.width
  return `padding-top:${Math.round(ratio * 10000) / 100}%;`
}

function normalizeTemplate(template) {
  const requiredFields = Array.isArray(template.requiredFields) ? template.requiredFields : []
  return {
    ...template,
    title: template.title || TEMPLATE_TITLES[template.id] || "门店海报",
    shortLabel: TEMPLATE_SHORT_LABELS[template.id] || template.title || "海报",
    styleTags: Array.isArray(template.styleTags) ? template.styleTags : [],
    textRules: Array.isArray(template.textRules) ? template.textRules : [],
    requiredFields,
  }
}

function orderTemplates(templates, ids) {
  return ids.map((id) => templates.find((item) => item.id === id)).filter(Boolean)
}

function buildTemplateBuckets(templates) {
  const primaryTemplates = orderTemplates(templates, PRIMARY_TEMPLATE_IDS)
  const known = new Set([...PRIMARY_TEMPLATE_IDS, ...MORE_TEMPLATE_IDS])
  const moreTemplates = [...orderTemplates(templates, MORE_TEMPLATE_IDS), ...templates.filter((item) => !known.has(item.id))]
  return { primaryTemplates, moreTemplates }
}

function normalizeFields(template) {
  const fields = {}
  const specs = (template.requiredFields || []).map((item) => ({ ...item, value: item.defaultValue || "" }))
  specs.forEach((item) => {
    fields[item.key] = item.defaultValue || ""
  })
  return { fields, specs }
}

function normalizeFieldsWithValues(template, values) {
  const incoming = values && typeof values === "object" ? values : {}
  const fields = { ...incoming }
  const specs = (template.requiredFields || []).map((item) => {
    const raw = String(incoming[item.key] || item.defaultValue || "").trim()
    const max = Number(item.maxLength || 0)
    const value = max > 0 ? raw.slice(0, max) : raw
    fields[item.key] = value
    return { ...item, value }
  })
  return { fields, specs }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error(`download_failed:${res.statusCode}`))
      },
      fail: reject,
    })
  })
}

function chooseOneImage() {
  return new Promise((resolve, reject) => {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success(res) {
          const file = res.tempFiles && res.tempFiles[0]
          if (file && file.tempFilePath) resolve(file.tempFilePath)
          else reject(new Error("未选择图片"))
        },
        fail: reject,
      })
      return
    }

    wx.chooseImage({
      count: 1,
      sourceType: ["album", "camera"],
      success(res) {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (path) resolve(path)
        else reject(new Error("未选择图片"))
      },
      fail: reject,
    })
  })
}

function chooseOneMessageFile() {
  return new Promise((resolve, reject) => {
    if (!wx.chooseMessageFile) {
      reject(new Error("当前微信版本不支持选择文件"))
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: "all",
      success(res) {
        const file = res.tempFiles && res.tempFiles[0]
        const path = file && (file.path || file.tempFilePath)
        const name = file && file.name ? file.name : ""
        if (!path) {
          reject(new Error("未选择文件"))
          return
        }
        if (!isLikelyImageFile(path, name)) {
          reject(new Error("海报参考素材先支持图片文件"))
          return
        }
        resolve(path)
      },
      fail: reject,
    })
  })
}

function isLikelyImageFile(path, name) {
  const value = `${name || ""} ${path || ""}`.toLowerCase()
  return /\.(png|jpe?g|webp)(\?|#|$)/.test(value)
}

function uploadPosterAsset({ kind, filePath, sessionId }) {
  const token = getAccessToken()
  const deviceId = getDeviceId()

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: buildAbsoluteApiUrl("/api/mp/posters/assets", IP_FACTORY_BASE_URL),
      filePath,
      name: "file",
      formData: {
        kind,
        sessionId,
      },
      header: {
        Authorization: token ? `Bearer ${token}` : "",
        "x-device-id": deviceId || "",
      },
      success(res) {
        let payload = null
        try {
          payload = JSON.parse(res.data || "{}")
        } catch (_) {
          payload = null
        }

        if (res.statusCode < 200 || res.statusCode >= 300 || !payload?.ok) {
          reject(new Error(payload?.message || payload?.error || `上传失败 ${res.statusCode}`))
          return
        }

        resolve(payload)
      },
      fail: reject,
    })
  })
}

function uploadPosterVoice({ filePath, durationSec }) {
  const token = getAccessToken()
  const deviceId = getDeviceId()

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: buildAbsoluteApiUrl("/api/mp/posters/transcribe", IP_FACTORY_BASE_URL),
      filePath,
      name: "audio",
      formData: {
        format: "mp3",
        client_audio_seconds: String(durationSec || ""),
      },
      header: {
        Authorization: token ? `Bearer ${token}` : "",
        "x-device-id": deviceId || "",
      },
      success(res) {
        let payload = null
        try {
          payload = JSON.parse(res.data || "{}")
        } catch (_) {
          payload = null
        }

        if (res.statusCode < 200 || res.statusCode >= 300 || !payload?.ok) {
          reject(new Error(payload?.message || payload?.error || `语音识别失败 ${res.statusCode}`))
          return
        }

        resolve(payload)
      },
      fail: reject,
    })
  })
}

function stripAssetRef(ref) {
  return {
    kind: ref.kind,
    bucket: ref.bucket,
    path: ref.path,
    contentType: ref.contentType,
  }
}

function formatDateLabel(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "刚刚"
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, "0")
  const minute = String(date.getMinutes()).padStart(2, "0")
  return `${month}/${day} ${hour}:${minute}`
}

function titleForTemplateId(templateId, templates) {
  const id = String(templateId || "").trim().toUpperCase()
  const template = (templates || []).find((item) => item.id === id)
  return template?.title || TEMPLATE_TITLES[id] || "门店海报"
}

function decoratePosterHistory(posters, templates) {
  return (posters || []).map((item) => ({
    ...item,
    templateTitle: titleForTemplateId(item.templateId, templates),
  }))
}

function normalizeResolution(value, fallback = DEFAULT_RESOLUTION) {
  const resolution = String(value || "").trim()
  return RESOLUTION_OPTIONS.includes(resolution) ? resolution : fallback
}

function getResolutionIndex(value) {
  return Math.max(0, RESOLUTION_OPTIONS.indexOf(normalizeResolution(value)))
}

function isImageTaskTimeout(error) {
  const message = String(error?.message || error?.data?.error || error?.errMsg || "")
  return message.includes("image_task_timeout") || message.includes("超时") || /timeout/i.test(message)
}

function buildChatMessage(role, text, extra = {}) {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
    type: "text",
    ...extra,
  }
}

Page({
  data: {
    templates: [],
    primaryTemplates: [],
    moreTemplates: [],
    templatesLoading: false,
    showMoreTemplates: false,
    showAdvancedSettings: false,
    showDetailFields: false,
    showAssetPanel: false,
    selectedTemplateId: "",
    selectedTemplate: null,
    selectedTemplateFields: [],
    fields: {},
    sizeOptions: SIZE_OPTIONS,
    resolutionOptions: RESOLUTION_OPTIONS,
    sizeIndex: 0,
    resolutionIndex: getResolutionIndex(DEFAULT_RESOLUTION),
    size: "4:5",
    resolution: DEFAULT_RESOLUTION,
    isGenerating: false,
    isSaving: false,
    posterId: "",
    posterImageUrl: "",
    actualPrompt: "",
    negativePrompt: "",
    warnings: [],
    previewBoxStyle: buildPreviewBoxStyle(canvasForSize("4:5")),
    lastError: "",
    isPosterHome: false,

    chatMessages: [
      {
        id: "msg_welcome",
        role: "assistant",
        type: "text",
        text: "先说这张海报用来做什么，比如活动促销、节日祝福、门店通知或项目介绍；再补充时间、门店名和想要的感觉。缺 Logo 或门头图时，我再提醒你上传。",
      },
    ],
    quickPrompts: [
      "五一新客补水 99 元，想要高级感",
      "祝顾客五一快乐，温暖一点",
      "门店通知海报，突出营业时间",
    ],
    chatScrollIntoView: "",
    draftText: "",
    recording: false,
    recordCanceling: false,
    transcribing: false,
    conversationLoading: false,
    workingText: "",
    workingRole: "assistant",

    intakeMessage: "",
    intakeSessionId: DEFAULT_SESSION_ID,
    intakeLoading: false,
    intakeAssistantMessage: "",
    intakeMissingFields: [],
    intakeReady: false,
    intakeRecommendation: null,
    storeProfileId: "",
    storeProfileLabel: "",

    assetCards: ASSET_CARDS,
    assetRefs: [],
    uploadingAssetKind: "",

    historyLoading: false,
    posterHistory: [],
  },

  onLoad() {
    this._recordPressActive = false
    this.recordTouchStartY = 0
    this.setupRecorder()
    this.loadTemplates()
    this.readStoreProfileSelection()
  },

  onShow() {
    this.readStoreProfileSelection()
    this.loadHistory()
  },

  setupRecorder() {
    if (!wx.getRecorderManager) return
    this.recorder = wx.getRecorderManager()
    this._recordingStartedAt = 0
    this.recorder.onStart(() => {
      if (!this._recordPressActive) return
      this._recordingStartedAt = Date.now()
      this.setData({
        recording: true,
        recordCanceling: false,
        workingText: "正在听你说...",
        workingRole: "user",
      })
    })
    this.recorder.onStop((res) => this.handleRecordStop(res))
    this.recorder.onError(() => {
      this._recordPressActive = false
      this.recordTouchStartY = 0
      this.setData({
        recording: false,
        recordCanceling: false,
        transcribing: false,
        workingText: "",
        workingRole: "assistant",
      })
      wx.showToast({ title: "录音失败，请再试一次", icon: "none" })
    })
  },

  appendChatMessage(message) {
    const next = buildChatMessage(message.role, message.text || "", message)
    const chatMessages = this.data.chatMessages.concat(next)
    this.setData({
      chatMessages,
      chatScrollIntoView: next.id,
    })
  },

  setWorkingText(text, role = "assistant") {
    this.setData({
      workingText: text || "",
      workingRole: text ? role : "assistant",
    })
  },

  handlePosterBack() {
    const pages = typeof getCurrentPages === "function" ? getCurrentPages() : []
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    wx.switchTab({
      url: "/pages/voice-coach/index",
      fail: () => wx.reLaunch({ url: "/pages/voice-coach/index" }),
    })
  },

  handleStartPoster() {
    const lastMessage = this.data.chatMessages[this.data.chatMessages.length - 1]
    this.setData({
      isPosterHome: false,
      chatScrollIntoView: lastMessage?.id || "",
    })
  },

  handleStartWithAttach() {
    this.handleStartPoster()
    setTimeout(() => this.handleAttachTap(), 80)
  },

  onDraftInput(e) {
    this.setData({ draftText: e.detail.value })
  },

  async handleQuickPromptTap(e) {
    const text = String(e?.currentTarget?.dataset?.text || "").trim()
    if (!text || this.data.conversationLoading || this.data.isGenerating) return
    await this.handleConversationText(text)
  },

  async handleSendText() {
    const text = String(this.data.draftText || "").trim()
    if (!text) return
    await this.handleConversationText(text)
  },

  requestRecordPermission() {
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (setting) => {
          if (setting.authSetting["scope.record"]) {
            resolve()
            return
          }
          wx.authorize({
            scope: "scope.record",
            success: resolve,
            fail: () => {
              wx.showModal({
                title: "需要麦克风权限",
                content: "打开麦克风后，可以直接说出海报需求。",
                confirmText: "去开启",
                cancelText: "取消",
                success: (res) => {
                  if (!res.confirm) {
                    reject(new Error("未开启麦克风权限"))
                    return
                  }
                  wx.openSetting({
                    success: (openRes) => {
                      if (openRes.authSetting["scope.record"]) resolve()
                      else reject(new Error("未开启麦克风权限"))
                    },
                    fail: reject,
                  })
                },
              })
            },
          })
        },
        fail: reject,
      })
    })
  },

  async onRecordStart(e) {
    if (this.data.conversationLoading || this.data.transcribing || this.data.isGenerating) return
    if (!this.recorder) {
      wx.showToast({ title: "当前微信版本不支持录音", icon: "none" })
      return
    }
    this._recordPressActive = true
    this.recordTouchStartY = Number(
      (e && e.touches && e.touches[0] && e.touches[0].clientY) ||
        (e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) ||
        0,
    )
    try {
      await this.requestRecordPermission()
      if (!this._recordPressActive) return
      this._recordingStartedAt = Date.now()
      this.setData({
        recording: true,
        recordCanceling: false,
        workingText: "正在听你说...",
        workingRole: "user",
      })
      this.recorder.start(RECORDER_OPTIONS)
    } catch (error) {
      this._recordPressActive = false
      this.recordTouchStartY = 0
      this.setData({
        recording: false,
        recordCanceling: false,
        workingText: "",
        workingRole: "assistant",
      })
      wx.showToast({ title: error.message || "无法录音", icon: "none" })
    }
  },

  onRecordMove(e) {
    if (!this._recordPressActive || !this.data.recording) return
    const touch = e.touches && e.touches[0]
    const y = touch ? Number(touch.clientY || 0) : 0
    if (y && !this.recordTouchStartY) this.recordTouchStartY = y
    const shouldCancel = y && this.recordTouchStartY ? this.recordTouchStartY - y > 70 : false
    if (shouldCancel !== this.data.recordCanceling) {
      this.setData({
        recordCanceling: shouldCancel,
        workingText: shouldCancel ? "松手取消" : "正在听你说...",
        workingRole: "user",
      })
    }
  },

  onRecordEnd() {
    this._recordPressActive = false
    if (!this.data.recording || !this.recorder) return
    if (this.data.recordCanceling) {
      this.onRecordCancel()
      return
    }
    this.setData({
      recording: false,
      recordCanceling: false,
      workingText: "正在识别语音...",
      workingRole: "user",
    })
    try {
      this.recorder.stop()
    } catch (_error) {
      this.setData({ workingText: "", workingRole: "assistant" })
      wx.showToast({ title: "录音停止失败", icon: "none" })
    }
  },

  onRecordCancel() {
    this._recordPressActive = false
    if (!this.data.recording || !this.recorder) return
    this.setData({ recording: false, recordCanceling: true, workingText: "", workingRole: "assistant" })
    try {
      this.recorder.stop()
    } catch (_error) {}
  },

  async handleRecordStop(res) {
    this._recordPressActive = false
    this.recordTouchStartY = 0
    const elapsedMs = Date.now() - (this._recordingStartedAt || Date.now())
    const durationSec = res?.duration ? Math.round(res.duration / 1000) : Math.ceil(elapsedMs / 1000)
    this._recordingStartedAt = 0
    const canceled = this.data.recordCanceling
    this.setData({
      recording: false,
      recordCanceling: false,
      workingText: canceled ? "" : "正在识别语音...",
      workingRole: canceled ? "assistant" : "user",
    })

    if (canceled) return
    if (!res?.tempFilePath || elapsedMs < 800 || durationSec < 1) {
      wx.showToast({ title: "说话时间太短", icon: "none" })
      this.setWorkingText("")
      return
    }

    this.setData({ transcribing: true, lastError: "" })
    try {
      const result = await uploadPosterVoice({
        filePath: res.tempFilePath,
        durationSec,
      })
      const text = String(result.text || "").trim()
      if (!text) throw new Error("没有听清楚，请再说一遍。")
      await this.handleConversationText(text, { fromVoice: true })
    } catch (error) {
      const message = error.message || "语音识别失败"
      this.appendChatMessage({
        role: "assistant",
        text: `${message} 可以再按住说一遍，或者直接打字。`,
      })
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ transcribing: false, workingText: "", workingRole: "assistant" })
    }
  },

  async handleConversationText(rawText, options = {}) {
    const text = String(rawText || "").trim()
    if (!text || this.data.conversationLoading || this.data.isGenerating) return

    this.appendChatMessage({
      role: "user",
      text,
      fromVoice: !!options.fromVoice,
    })
    this.setData({
      draftText: "",
      intakeMessage: text,
      conversationLoading: true,
      intakeLoading: true,
      workingText: "正在判断海报需求...",
      workingRole: "assistant",
      lastError: "",
    })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/posters/intake",
        method: "POST",
        data: {
          sessionId: this.data.intakeSessionId,
          message: text,
          store_profile_id: this.data.storeProfileId || undefined,
          answers: this.buildCurrentAnswers(),
          asset_refs: this.data.assetRefs.map(stripAssetRef),
        },
      })

      if (!res?.ok) throw new Error(res?.error || "整理失败")

      const recommendation = res.recommendation || {}
      const nextRecommendation = Object.keys(recommendation).length ? recommendation : null
      const templateId = String(recommendation.templateId || "").trim()
      if (templateId && !this.data.templates.length) {
        await this.loadTemplates()
      }
      const template = this.data.templates.find((item) => item.id === templateId) || this.data.selectedTemplate
      if (template) {
        this.applyTemplate(template, {
          fields: res.fields || {},
          size: recommendation.size || this.data.size,
          resolution: this.data.resolution || DEFAULT_RESOLUTION,
        })
      }

      this.setData({
        intakeSessionId: res.sessionId || this.data.intakeSessionId,
        intakeAssistantMessage: res.assistantMessage || "",
        intakeMissingFields: Array.isArray(res.missingFields) ? res.missingFields : [],
        intakeReady: !!res.readyToConfirm,
        intakeRecommendation: nextRecommendation,
      })

      if (res.readyToConfirm) {
        this.appendChatMessage({
          role: "assistant",
          text: res.assistantMessage || "信息够了，先核对目标、素材和规格，确认后我再生成。",
        })
      } else {
        this.appendChatMessage({
          role: "assistant",
          text: res.assistantMessage || "还差一点信息，你继续说就行。",
        })
      }
    } catch (error) {
      if (handleBillingError(error)) return
      const message = error.message || "整理失败"
      this.setData({ lastError: message })
      this.appendChatMessage({
        role: "assistant",
        text: `${message}。你可以换个说法再试一次。`,
      })
    } finally {
      this.setData({
        conversationLoading: false,
        intakeLoading: false,
        workingText: "",
        workingRole: "assistant",
      })
    }
  },

  async loadTemplates() {
    this.setData({ templatesLoading: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/posters/templates",
        method: "GET",
      })
      const templates = (Array.isArray(res?.templates) ? res.templates : []).map(normalizeTemplate)
      const { primaryTemplates, moreTemplates } = buildTemplateBuckets(templates)
      const first = templates.find((item) => item.id === this.data.selectedTemplateId) || primaryTemplates[0] || templates[0] || null
      this.setData({
        templates,
        primaryTemplates,
        moreTemplates,
        posterHistory: decoratePosterHistory(this.data.posterHistory, templates),
      })
      if (first && !this.data.selectedTemplateId) this.applyTemplate(first)
    } catch (error) {
      this.setData({ lastError: error.message || "模板加载失败" })
    } finally {
      this.setData({ templatesLoading: false })
    }
  },

  readStoreProfileSelection() {
    const id = String(wx.getStorageSync("xhs_store_profile_id") || "").trim()
    const label = String(wx.getStorageSync("xhs_store_profile_label") || "").trim()
    this.setData({
      storeProfileId: id,
      storeProfileLabel: label || "未选择门店档案",
    })
  },

  applyTemplate(template, options = {}) {
    const normalized = normalizeTemplate(template)
    const { fields, specs } = options.fields
      ? normalizeFieldsWithValues(normalized, options.fields)
      : normalizeFields(normalized)
    const size = options.size || normalized.defaultSize || "4:5"
    const resolution = normalizeResolution(options.resolution || DEFAULT_RESOLUTION)
    const sizeIndex = Math.max(0, SIZE_OPTIONS.indexOf(size))
    const resolutionIndex = getResolutionIndex(resolution)
    const canvas = canvasForSize(size)
    this.setData({
      selectedTemplateId: normalized.id,
      selectedTemplate: normalized,
      selectedTemplateFields: specs,
      fields,
      size,
      resolution,
      sizeIndex,
      resolutionIndex,
      posterImageUrl: options.keepResult ? this.data.posterImageUrl : "",
      posterId: options.keepResult ? this.data.posterId : "",
      actualPrompt: options.keepResult ? this.data.actualPrompt : "",
      negativePrompt: options.keepResult ? this.data.negativePrompt : "",
      warnings: options.keepResult ? this.data.warnings : [],
      previewBoxStyle: buildPreviewBoxStyle(canvas),
      showMoreTemplates: MORE_TEMPLATE_IDS.includes(normalized.id) || this.data.showMoreTemplates,
      lastError: "",
    })
  },

  onSelectTemplate(e) {
    const id = e.currentTarget.dataset.id
    const template = this.data.templates.find((item) => item.id === id)
    if (template) this.applyTemplate(template)
  },

  toggleMoreTemplates() {
    this.setData({ showMoreTemplates: !this.data.showMoreTemplates })
  },

  toggleAdvancedSettings() {
    this.setData({ showAdvancedSettings: !this.data.showAdvancedSettings })
  },

  toggleDetailFields() {
    this.setData({ showDetailFields: !this.data.showDetailFields })
  },

  toggleAssetPanel() {
    this.setData({ showAssetPanel: !this.data.showAssetPanel })
  },

  handleOpenStoreProfiles() {
    wx.navigateTo({ url: "/pages/store-profiles/index?returnPage=poster" })
  },

  handleAttachTap() {
    if (this.data.conversationLoading || this.data.isGenerating || this.data.uploadingAssetKind) return
    if (this.data.isPosterHome) this.setData({ isPosterHome: false })
    const itemList = wx.chooseMessageFile ? ["拍照 / 相册", "聊天文件"] : ["拍照 / 相册"]
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const index = Number(res.tapIndex || 0)
        void this.handleAttachChoice(index)
      },
      fail: (error) => {
        const message = String(error?.errMsg || error?.message || "")
        if (!/cancel/i.test(message)) wx.showToast({ title: "未选择素材", icon: "none" })
      },
    })
  },

  async handleAttachChoice(index) {
    try {
      const filePath = index === 1 ? await chooseOneMessageFile() : await chooseOneImage()
      await this.uploadAttachedAsset(filePath)
    } catch (error) {
      const message = error.message || "上传失败"
      if (/cancel/i.test(message)) return
      this.setData({ lastError: message })
      wx.showToast({ title: message, icon: "none" })
    }
  },

  pickAttachmentKind() {
    const usedKinds = new Set((this.data.assetRefs || []).map((item) => item.kind))
    return ATTACHMENT_KINDS.find((kind) => !usedKinds.has(kind)) || ATTACHMENT_KINDS[0]
  },

  async uploadAttachedAsset(filePath) {
    const kind = this.pickAttachmentKind()
    this.setData({ uploadingAssetKind: kind, lastError: "" })
    try {
      const res = await uploadPosterAsset({
        kind,
        filePath,
        sessionId: this.data.intakeSessionId,
      })
      const assetRef = res.assetRef
      if (!assetRef) throw new Error("上传结果无效")

      const assetRefs = this.data.assetRefs.filter((item) => item.kind !== kind).concat({
        ...assetRef,
        localPath: filePath,
      })
      const assetCards = this.data.assetCards.map((item) =>
        item.kind === kind ? { ...item, localPath: filePath, uploaded: true } : item
      )

      this.setData({
        intakeSessionId: res.sessionId || this.data.intakeSessionId,
        assetRefs,
        assetCards,
      })
      this.appendChatMessage({
        role: "user",
        text: "已上传一张参考图",
      })
      this.appendChatMessage({
        role: "assistant",
        text: "收到，我会把这张图作为海报参考。你可以继续说活动、项目、价格或风格要求。",
      })
      wx.showToast({ title: "素材已上传", icon: "success" })
    } finally {
      this.setData({ uploadingAssetKind: "" })
    }
  },

  handleClearAssets() {
    this.setData({
      assetRefs: [],
      assetCards: this.data.assetCards.map((item) => ({ ...item, localPath: "", uploaded: false })),
    })
    wx.showToast({ title: "已清空参考图", icon: "none" })
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const value = e.detail.value
    this.setData({
      fields: {
        ...this.data.fields,
        [key]: value,
      },
      selectedTemplateFields: this.data.selectedTemplateFields.map((item) =>
        item.key === key ? { ...item, value } : item
      ),
    })
  },

  onSizeChange(e) {
    const sizeIndex = Number(e.detail.value || 0)
    const size = SIZE_OPTIONS[sizeIndex] || "4:5"
    const canvas = canvasForSize(size)
    this.setData({
      sizeIndex,
      size,
      previewBoxStyle: buildPreviewBoxStyle(canvas),
    })
  },

  onResolutionChange(e) {
    const resolutionIndex = Number(e.detail.value || 0)
    this.setData({
      resolutionIndex,
      resolution: RESOLUTION_OPTIONS[resolutionIndex] || DEFAULT_RESOLUTION,
    })
  },

  onIntakeMessageInput(e) {
    this.setData({ intakeMessage: e.detail.value })
  },

  buildCurrentAnswers() {
    const fields = this.data.fields || {}
    return {
      ...fields,
      templateId: this.data.intakeRecommendation ? this.data.selectedTemplateId || "" : "",
    }
  },

  async handleAnalyzeBrief() {
    if (this.data.intakeLoading) return

    const message = String(this.data.intakeMessage || "").trim()
    const hasFields = Object.values(this.data.fields || {}).some((value) => String(value || "").trim())
    if (!message && !hasFields) {
      wx.showToast({ title: "先写一句门店或活动需求", icon: "none" })
      return
    }

    this.setData({ intakeLoading: true, lastError: "" })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/posters/intake",
        method: "POST",
        data: {
          sessionId: this.data.intakeSessionId,
          message,
          store_profile_id: this.data.storeProfileId || undefined,
          answers: this.buildCurrentAnswers(),
          asset_refs: this.data.assetRefs.map(stripAssetRef),
        },
      })

      if (!res?.ok) throw new Error(res?.error || "整理失败")

      const recommendation = res.recommendation || {}
      const nextRecommendation = Object.keys(recommendation).length ? recommendation : null
      const templateId = String(recommendation.templateId || "").trim()
      const template = this.data.templates.find((item) => item.id === templateId) || this.data.selectedTemplate
      if (template) {
        this.applyTemplate(template, {
          fields: res.fields || {},
          size: recommendation.size || this.data.size,
          resolution: this.data.resolution || DEFAULT_RESOLUTION,
        })
      }

      this.setData({
        intakeSessionId: res.sessionId || this.data.intakeSessionId,
        intakeAssistantMessage: res.assistantMessage || "",
        intakeMissingFields: Array.isArray(res.missingFields) ? res.missingFields : [],
        intakeReady: !!res.readyToConfirm,
        intakeRecommendation: nextRecommendation,
        showDetailFields: !res.readyToConfirm || this.data.showDetailFields,
      })
      wx.showToast({ title: res.readyToConfirm ? "已整理，可生成" : "已整理，请补信息", icon: "none" })
      return !!res.readyToConfirm
    } catch (error) {
      if (handleBillingError(error)) return
      const message = error.message || "整理失败"
      this.setData({ lastError: message })
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ intakeLoading: false })
    }
    return false
  },

  async handleChooseAsset(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind || this.data.uploadingAssetKind) return

    this.setData({ uploadingAssetKind: kind, lastError: "" })
    try {
      const filePath = await chooseOneImage()
      const res = await uploadPosterAsset({
        kind,
        filePath,
        sessionId: this.data.intakeSessionId,
      })
      const assetRef = res.assetRef
      if (!assetRef) throw new Error("上传结果无效")

      const assetRefs = this.data.assetRefs.filter((item) => item.kind !== kind).concat({
        ...assetRef,
        localPath: filePath,
      })
      const assetCards = this.data.assetCards.map((item) =>
        item.kind === kind ? { ...item, localPath: filePath, uploaded: true } : item
      )

      this.setData({
        intakeSessionId: res.sessionId || this.data.intakeSessionId,
        assetRefs,
        assetCards,
      })
      wx.showToast({ title: "素材已上传", icon: "success" })
    } catch (error) {
      const message = error.message || "上传失败"
      if (/cancel/i.test(message)) return
      this.setData({ lastError: message })
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({ uploadingAssetKind: "" })
    }
  },

  handleRemoveAsset(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind) return
    this.setData({
      assetRefs: this.data.assetRefs.filter((item) => item.kind !== kind),
      assetCards: this.data.assetCards.map((item) =>
        item.kind === kind ? { ...item, localPath: "", uploaded: false } : item
      ),
    })
  },

  async loadHistory() {
    if (this.data.historyLoading) return
    this.setData({ historyLoading: true })
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/posters/history?limit=6",
        method: "GET",
      })
      if (!res?.ok) throw new Error(res?.error || "加载历史失败")
      const posterHistory = (Array.isArray(res.posters) ? res.posters : []).map((item) => ({
        ...item,
        imageUrl: toAbsoluteUrl(item.imageUrl),
        createdAtLabel: formatDateLabel(item.createdAt),
      }))
      this.setData({ posterHistory: decoratePosterHistory(posterHistory, this.data.templates) })
    } catch (_) {
      this.setData({ posterHistory: [] })
    } finally {
      this.setData({ historyLoading: false })
    }
  },

  handleUseHistory(e) {
    const posterId = e.currentTarget.dataset.id
    const item = this.data.posterHistory.find((historyItem) => historyItem.posterId === posterId)
    if (!item) return
    const template = this.data.templates.find((tpl) => tpl.id === item.templateId)
    if (template) {
      this.applyTemplate(template, {
        size: item.size || this.data.size,
        resolution: item.resolution || this.data.resolution,
        keepResult: true,
      })
    }
    const canvas = canvasForSize(item.size || this.data.size)
    this.setData({
      posterId: item.posterId,
      posterImageUrl: item.imageUrl,
      size: item.size || this.data.size,
      resolution: item.resolution || this.data.resolution,
      previewBoxStyle: buildPreviewBoxStyle(canvas),
    })
  },

  async handleGenerate(e) {
    const strictText = e?.currentTarget?.dataset?.strict === "1"
    const fromChat = !!e?.fromChat
    const { selectedTemplateId, selectedTemplateFields, fields, size, resolution } = this.data
    if (!this.data.intakeReady && !this.data.posterImageUrl) {
      const text = "先把海报目标、活动信息和参考素材补齐，再确认生成。"
      if (fromChat) this.appendChatMessage({ role: "assistant", text })
      else wx.showToast({ title: "先补齐信息", icon: "none" })
      return
    }
    if (!selectedTemplateId) {
      if (fromChat) {
        this.appendChatMessage({ role: "assistant", text: "我还没判断出这张海报的用途，你再说一下是获客、成交、活动还是品牌展示。" })
      } else {
        wx.showToast({ title: "请选择海报目标", icon: "none" })
      }
      return
    }

    const missing = (selectedTemplateFields || [])
      .filter((item) => item.required !== false && !String(fields[item.key] || "").trim())
      .map((item) => item.label)
    if (missing.length) {
      this.setData({ showDetailFields: true })
      if (fromChat) {
        this.appendChatMessage({
          role: "assistant",
          text: `还差 ${missing.join("、")}。你直接告诉我这些信息就行。`,
        })
      } else {
        wx.showToast({ title: `还差：${missing[0]}`, icon: "none" })
      }
      return
    }

    this.setData({
      isGenerating: true,
      lastError: "",
      workingText: fromChat ? "正在生成海报..." : this.data.workingText,
      workingRole: fromChat ? "assistant" : this.data.workingRole,
    })
    try {
      const payload = {
        mode: "template",
        templateId: selectedTemplateId,
        fields: {
          ...fields,
          ...(strictText ? { _textStrictness: "strict" } : {}),
        },
        prompt: "",
        sessionId: this.data.intakeSessionId,
        assetRefs: this.data.assetRefs.map(stripAssetRef),
        size,
        resolution,
      }

      let fallbackResolutionUsed = false
      let res
      try {
        res = await request({
          baseUrl: IP_FACTORY_BASE_URL,
          url: "/api/mp/posters/generate",
          method: "POST",
          data: payload,
        })
      } catch (error) {
        if (resolution !== DEFAULT_RESOLUTION && isImageTaskTimeout(error)) {
          fallbackResolutionUsed = true
          this.setData({
            resolution: DEFAULT_RESOLUTION,
            resolutionIndex: getResolutionIndex(DEFAULT_RESOLUTION),
            workingText: fromChat ? "高清生成超时，正在改用标准清晰度..." : this.data.workingText,
            workingRole: fromChat ? "assistant" : this.data.workingRole,
          })
          res = await request({
            baseUrl: IP_FACTORY_BASE_URL,
            url: "/api/mp/posters/generate",
            method: "POST",
            data: {
              ...payload,
              resolution: DEFAULT_RESOLUTION,
            },
          })
        } else {
          throw error
        }
      }

      if (!res?.ok) throw new Error(res?.error || "海报生成失败")

      const posterImageUrl = toAbsoluteUrl(res.imageUrl)
      this.setData({
        intakeReady: true,
        posterId: res.posterId || "",
        posterImageUrl,
        actualPrompt: res.prompt || "",
        negativePrompt: res.negativePrompt || "",
        warnings: [
          ...(fallbackResolutionUsed ? ["高清生成超时，已自动改用标准清晰度。"] : []),
          ...(Array.isArray(res.warnings) ? res.warnings : ["请核对海报里的中文、价格和日期。"]),
        ],
        previewBoxStyle: buildPreviewBoxStyle(res.overlay?.canvas || canvasForSize(size)),
      })
      if (fromChat) {
        this.appendChatMessage({
          role: "assistant",
          type: "poster",
          text: "海报生成好了，先核对中文、价格、日期和地址。",
          imageUrl: posterImageUrl,
        })
      }
      this.loadHistory()
      wx.showToast({ title: "海报已生成", icon: "success" })
    } catch (error) {
      if (handleBillingError(error)) return
      const message = error.message || "海报生成失败"
      this.setData({ lastError: message })
      if (fromChat) {
        this.appendChatMessage({
          role: "assistant",
          text: `${message}。你可以补一句更明确的项目、优惠或时间，我再生成。`,
        })
      }
      wx.showToast({ title: message, icon: "none" })
    } finally {
      this.setData({
        isGenerating: false,
        workingText: fromChat ? "" : this.data.workingText,
        workingRole: fromChat ? "assistant" : this.data.workingRole,
      })
    }
  },

  async handleMainAction() {
    if (this.data.isGenerating || this.data.intakeLoading) return
    const message = String(this.data.intakeMessage || "").trim()
    if (!this.data.intakeReady) {
      if (!message) {
        wx.showToast({ title: "先写一句海报需求", icon: "none" })
        return
      }
      await this.handleAnalyzeBrief()
      return
    }
    await this.handleGenerate()
  },

  handleCopyPrompt() {
    const { actualPrompt, negativePrompt } = this.data
    const text = [actualPrompt, negativePrompt ? `\n负面提示词：${negativePrompt}` : ""].join("").trim()
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制", icon: "success" }),
    })
  },

  async handleSavePoster() {
    const { posterImageUrl } = this.data
    if (!posterImageUrl) return
    this.setData({ isSaving: true })
    try {
      const tempPath = await downloadFile(posterImageUrl)
      wx.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: () => wx.showToast({ title: "已保存", icon: "success" }),
        fail: () => wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" }),
        complete: () => this.setData({ isSaving: false }),
      })
    } catch (error) {
      this.setData({ isSaving: false })
      wx.showToast({ title: error.message || "保存失败", icon: "none" })
    }
  },
})
