const { IP_FACTORY_BASE_URL } = require("../../../utils/config")
const { request } = require("../../../utils/request")
const { saveSelectedSceneCard } = require("../setup-storage")

const SCENE_KIND_OPTIONS = [
  { value: "customer_visit", label: "到店顾客训练" },
  { value: "offer_promo", label: "新品推广训练" },
]

function safeText(value) {
  return String(value || "").trim()
}

function getSceneKindIndex(value) {
  const key = safeText(value) || "customer_visit"
  const idx = SCENE_KIND_OPTIONS.findIndex((item) => item.value === key)
  return idx >= 0 ? idx : 0
}

Page({
  data: {
    id: "",
    saving: false,
    sceneKindOptions: SCENE_KIND_OPTIONS,
    sceneKindIndex: 0,

    name: "",
    serviceName: "",
    customerStage: "",
    sceneGoal: "",
    focusStages: "",
    likelyQuestions: "",
    targetObjections: "",
    communicationMethodTags: "",
    mustCoverPoints: "",
    doNotSay: "",
    notes: "",
  },

  onLoad(query) {
    const id = safeText(query && query.id)
    const sceneKind = safeText(query && query.kind)
    this.setData({
      id,
      sceneKindIndex: getSceneKindIndex(sceneKind),
    })

    if (id) this.loadCard(id)
  },

  async loadCard(id) {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/voice-coach/scene-cards/" + encodeURIComponent(id),
      })

      if (!res || !res.ok || !res.card) throw new Error((res && res.error) || "加载失败")

      const card = res.card
      this.setData({
        sceneKindIndex: getSceneKindIndex(card.scene_kind),
        name: safeText(card.name),
        serviceName: safeText(card.service_name),
        customerStage: safeText(card.customer_stage),
        sceneGoal: safeText(card.scene_goal),
        focusStages: Array.isArray(card.focus_stages) ? card.focus_stages.join("\n") : safeText(card.focus_stages),
        likelyQuestions: Array.isArray(card.likely_questions)
          ? card.likely_questions.join("\n")
          : safeText(card.likely_questions),
        targetObjections: Array.isArray(card.target_objections)
          ? card.target_objections.join("\n")
          : safeText(card.target_objections),
        communicationMethodTags: Array.isArray(card.communication_method_tags)
          ? card.communication_method_tags.join("\n")
          : safeText(card.communication_method_tags),
        mustCoverPoints: Array.isArray(card.must_cover_points)
          ? card.must_cover_points.join("\n")
          : safeText(card.must_cover_points),
        doNotSay: Array.isArray(card.do_not_say) ? card.do_not_say.join("\n") : safeText(card.do_not_say),
        notes: safeText(card.notes),
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" })
    }
  },

  onSceneKindChange(e) {
    this.setData({ sceneKindIndex: Number(e.detail.value || 0) || 0 })
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },

  onServiceName(e) {
    this.setData({ serviceName: e.detail.value })
  },

  onCustomerStage(e) {
    this.setData({ customerStage: e.detail.value })
  },

  onSceneGoal(e) {
    this.setData({ sceneGoal: e.detail.value })
  },

  onFocusStages(e) {
    this.setData({ focusStages: e.detail.value })
  },

  onLikelyQuestions(e) {
    this.setData({ likelyQuestions: e.detail.value })
  },

  onTargetObjections(e) {
    this.setData({ targetObjections: e.detail.value })
  },

  onCommunicationMethodTags(e) {
    this.setData({ communicationMethodTags: e.detail.value })
  },

  onMustCoverPoints(e) {
    this.setData({ mustCoverPoints: e.detail.value })
  },

  onDoNotSay(e) {
    this.setData({ doNotSay: e.detail.value })
  },

  onNotes(e) {
    this.setData({ notes: e.detail.value })
  },

  async handleSave() {
    if (this.data.saving) return

    const name = safeText(this.data.name)
    if (!name) {
      wx.showToast({ title: "请先填写场景卡名称", icon: "none" })
      return
    }

    const sceneKindOption =
      SCENE_KIND_OPTIONS[Number(this.data.sceneKindIndex) || 0] || SCENE_KIND_OPTIONS[0]

    const payload = {
      name,
      scene_kind: sceneKindOption.value,
      service_name: safeText(this.data.serviceName),
      customer_stage: safeText(this.data.customerStage),
      scene_goal: safeText(this.data.sceneGoal),
      focus_stages: this.data.focusStages,
      likely_questions: this.data.likelyQuestions,
      target_objections: this.data.targetObjections,
      communication_method_tags: this.data.communicationMethodTags,
      must_cover_points: this.data.mustCoverPoints,
      do_not_say: this.data.doNotSay,
      notes: safeText(this.data.notes),
    }

    this.setData({ saving: true })
    try {
      const id = safeText(this.data.id)
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: id
          ? "/api/mp/voice-coach/scene-cards/" + encodeURIComponent(id)
          : "/api/mp/voice-coach/scene-cards",
        method: id ? "PUT" : "POST",
        data: payload,
      })

      if (!res || !res.ok || !res.card) throw new Error((res && res.error) || "保存失败")

      saveSelectedSceneCard(res.card)
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "保存失败", icon: "none" })
    } finally {
      this.setData({ saving: false })
    }
  },
})
