const { IP_FACTORY_BASE_URL } = require("../../../utils/config")
const { request } = require("../../../utils/request")
const {
  buildSceneMeta,
  getSelectedSceneCard,
  normalizeSceneCard,
  saveSelectedSceneCard,
  toTextList,
} = require("../setup-storage")
const { ensureTestSceneCard } = require("../test-scene-card")

function safeText(value) {
  return String(value || "").trim()
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
      const cards = (res.cards || []).map((item) => {
        const card = normalizeSceneCard(item)
        return {
          ...card,
          metaLabel: buildSceneMeta(card),
          focusLabel: toTextList(card.focus_stages, 3).join(" / "),
          objectionLabel: toTextList(card.target_objections, 3).join(" / "),
        }
      })

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
      const card = normalizeSceneCard(result.card)
      const mapped = {
        ...card,
        metaLabel: buildSceneMeta(card),
        focusLabel: toTextList(card.focus_stages, 3).join(" / "),
        objectionLabel: toTextList(card.target_objections, 3).join(" / "),
      }
      const cards = [mapped].concat((this.data.cards || []).filter((item) => item.id !== mapped.id))
      this.setData({ cards })
      this.handleUse({ currentTarget: { dataset: { id: mapped.id } } })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "生成测试场景卡失败", icon: "none" })
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
    wx.showToast({ title: "已设为当前场景", icon: "success" })

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

  handleDelete(e) {
    const id = safeText(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id)
    if (!id) return

    wx.showModal({
      title: "删除场景卡",
      content: "删除后不可恢复，确定删除这张场景卡吗？",
      confirmText: "删除",
      cancelText: "取消",
      success: async (res) => {
        if (!res.confirm) return

        try {
          const result = await request({
            baseUrl: IP_FACTORY_BASE_URL,
            url: "/api/mp/voice-coach/scene-cards/" + encodeURIComponent(id),
            method: "DELETE",
          })
          if (!result || !result.ok) throw new Error((result && result.error) || "删除失败")

          if (this.data.selectedId === id) {
            saveSelectedSceneCard(null)
            this.setData({ selectedId: "" })
          }

          wx.showToast({ title: "已删除", icon: "success" })
          this.loadCards()
        } catch (err) {
          wx.showToast({ title: (err && err.message) || "删除失败", icon: "none" })
        }
      },
    })
  },
})
