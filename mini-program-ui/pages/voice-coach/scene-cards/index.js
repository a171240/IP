const { IP_FACTORY_BASE_URL } = require("../../../utils/config")
const { request } = require("../../../utils/request")
const {
  getSelectedSceneCard,
  normalizeSceneCard,
  saveSelectedSceneCard,
  toTextList,
} = require("../setup-storage")
const { ensureTestSceneCard } = require("../test-scene-card")

function safeText(value) {
  return String(value || "").trim()
}

function stripInternalMarker(value) {
  return safeText(String(value || "").replace(/\s*\[voice-coach-test-[^\]]+\]\s*/g, " "))
}

function buildProjectMeta(card) {
  if (isLegacyTestSceneCard(card)) {
    return "品项 胶原抗衰护理 · 适合 初抗老 / 暗沉 / 紧致需求"
  }

  const bits = []
  if (card && card.service_name) bits.push("品项 " + card.service_name)
  if (card && card.customer_stage) bits.push("适合 " + card.customer_stage)
  return bits.join(" · ")
}

function isLegacyTestSceneCard(card) {
  const name = safeText(card && card.name)
  return name.indexOf("测试场景卡") >= 0
}

function buildProjectDisplayName(card) {
  const name = safeText(card && card.name)
  if (!name) return ""
  if (isLegacyTestSceneCard(card)) return "示例项目·胶原抗衰启动"
  return name.replace(/场景卡/g, "项目卡").replace(/场景/g, "项目")
}

function buildProjectDisplayOverrides(card) {
  if (!isLegacyTestSceneCard(card)) return {}
  return {
    displaySceneGoal: "胶原抗衰护理主打紧致、细腻和光泽感，重点练专业讲解、自然推荐和预期管理。",
    displayFocusLabel: "项目原理 / 推荐切入 / 体验流程",
    displayObjectionLabel: "价格有点高 / 怕没效果 / 想再考虑",
  }
}

function buildProjectPitch(card) {
  if (!card) return ""
  if (isLegacyTestSceneCard(card)) {
    return "胶原抗衰护理主打紧致、细腻和光泽感，重点练专业讲解、自然推荐和拒绝应对。"
  }

  const text = stripInternalMarker(card.notes || card.scene_goal)
  if (!text) return "已整理成项目训练包，可练专业讲解、推荐切入和拒绝应对。"
  return text.length > 72 ? text.slice(0, 72) + "..." : text
}

function mapProjectCard(item) {
  const card = normalizeSceneCard(item)
  return {
    ...card,
    ...buildProjectDisplayOverrides(card),
    displayName: buildProjectDisplayName(card),
    metaLabel: buildProjectMeta(card),
    focusLabel: toTextList(card.focus_stages, 3).join(" / "),
    objectionLabel: toTextList(card.target_objections, 3).join(" / "),
    simplePitch: buildProjectPitch(card),
    packTags: ["专业讲解", "推荐切入", "拒绝应对"],
  }
}

Page({
  data: {
    loading: false,
    creatingTestCard: false,
    pickMode: false,
    selectedId: "",
    cards: [],
  },

  onLoad(query) {
    this.setData({
      pickMode: String((query && query.pick) || "") === "1",
    })
  },

  onShow() {
    this.loadCards()
  },

  async loadCards() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/voice-coach/scene-cards?limit=50",
      })

      if (!res || !res.ok) throw new Error((res && res.error) || "加载失败")

      const selected = getSelectedSceneCard()
      const cards = (res.cards || []).map(mapProjectCard)

      this.setData({
        selectedId: selected && selected.id ? selected.id : "",
        cards,
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" })
    } finally {
      this.setData({ loading: false })
    }
  },

  handleCreate() {
    wx.navigateTo({ url: "/pages/voice-coach/scene-card-editor/index?template=starter" })
  },

  async handleUseTestCard() {
    if (this.data.creatingTestCard) return

    this.setData({ creatingTestCard: true })
    try {
      const result = await ensureTestSceneCard(this.data.cards)
      const mapped = mapProjectCard(result.card)
      const cards = [mapped].concat((this.data.cards || []).filter((item) => item.id !== mapped.id))
      this.setData({ cards })
      this.handleUse({ currentTarget: { dataset: { id: mapped.id } } })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "生成示例项目失败", icon: "none" })
    } finally {
      this.setData({ creatingTestCard: false })
    }
  },

  handleUse(e) {
    const id = safeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return

    const card = (this.data.cards || []).find((item) => item.id === id)
    if (!card) return

    saveSelectedSceneCard(card)
    this.setData({ selectedId: id })
    wx.showToast({ title: "已设为当前项目", icon: "success" })

    if (!this.data.pickMode) return

    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }

    wx.switchTab({ url: "/pages/voice-coach/index" })
  },

  handleEdit(e) {
    const id = safeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return
    wx.navigateTo({ url: "/pages/voice-coach/scene-card-editor/index?id=" + encodeURIComponent(id) })
  },

})
