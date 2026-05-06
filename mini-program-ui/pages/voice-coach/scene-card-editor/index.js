const { IP_FACTORY_BASE_URL } = require("../../../utils/config")
const { request } = require("../../../utils/request")
const { saveSelectedSceneCard, toTextList } = require("../setup-storage")
const { buildStarterSceneCardDraft } = require("../test-scene-card")

function safeText(value, maxLen) {
  const text = String(value || "").trim()
  if (!maxLen || text.length <= maxLen) return text
  return text.slice(0, maxLen)
}

function stripInternalMarker(value, maxLen) {
  return safeText(String(value || "").replace(/\s*\[voice-coach-test-[^\]]+\]\s*/g, " "), maxLen)
}

function listText(value, maxItems) {
  return toTextList(value, maxItems || 8).join("\n")
}

function oneLine(value, maxLen) {
  return safeText(String(value || "").replace(/\s+/g, " "), maxLen || 80)
}

function compactListText(value, fallback) {
  const list = toTextList(value, 3)
  const source = list.length ? list : fallback
  return source
    .slice(0, 3)
    .map((item) => oneLine(item, 8))
    .filter(Boolean)
    .join(" / ")
}

function splitMaterialLines(material, limit) {
  return toTextList(material, limit || 4)
}

function buildLocalProjectPack(input) {
  const name = safeText(input && input.name, 50)
  const material = safeText(input && input.material, 1600)
  const materialLines = splitMaterialLines(material, 4)
  const materialLead = oneLine(materialLines[0] || material, 56)

  return {
    simplePitch: materialLead
      ? `${name}可以围绕“${materialLead}”来讲清楚项目价值。`
      : `${name}需要先讲清楚解决什么问题、适合谁、体验流程和预期管理。`,
    knowledgePoints: materialLines.length
      ? materialLines.slice(0, 4)
      : ["项目解决的问题", "核心原理和流程", "适合人群", "体验感受和预期管理"],
    suitableCustomers: ["有对应需求的顾客", "对项目效果和安全感有疑问的顾客"],
    recommendationHooks: [
      "先问顾客当前最在意的问题",
      "把项目价值和顾客需求连接起来",
      "用流程和体验感降低陌生感",
    ],
    commonObjections: ["价格有点高", "怕没效果", "想再考虑一下"],
    guidingQuestions: [
      "您现在最想先改善哪一块？",
      "之前有没有体验过类似项目？",
      "您更担心效果、过程，还是恢复期？",
    ],
    doNotSay: ["不能承诺一次见效", "不能制造焦虑", "不能替顾客做决定"],
  }
}

function buildPackFromCard(card) {
  if (!card || typeof card !== "object") return null
  const name = safeText(card.name, 50)
  const material = safeText(card.scene_goal, 1600)
  return {
    simplePitch: stripInternalMarker(card.notes, 120) || buildLocalProjectPack({ name, material }).simplePitch,
    knowledgePoints: toTextList(card.focus_stages, 4),
    suitableCustomers: toTextList(card.customer_stage, 4),
    recommendationHooks: toTextList(card.communication_method_tags, 4),
    commonObjections: toTextList(card.target_objections, 4),
    guidingQuestions: toTextList(card.likely_questions, 4),
    doNotSay: toTextList(card.do_not_say, 4),
  }
}

function buildPackRows(pack) {
  if (!pack) return []
  return [
    {
      key: "knowledge",
      title: "专业讲解",
      text: compactListText(pack.knowledgePoints, ["原理", "流程", "体验感"]),
    },
    {
      key: "recommend",
      title: "推荐切入",
      text: compactListText(pack.recommendationHooks, ["先问需求", "再连项目"]),
    },
    {
      key: "objection",
      title: "拒绝应对",
      text: compactListText(pack.commonObjections, ["价格", "效果", "考虑一下"]),
    },
  ].filter((item) => item.text)
}

function packToPayload(input) {
  const name = safeText(input && input.name, 50)
  const material = safeText(input && input.material, 1600)
  const pack = input && input.pack ? input.pack : buildLocalProjectPack({ name, material })

  return {
    name,
    scene_kind: "offer_promo",
    service_name: name,
    customer_stage: listText(pack.suitableCustomers, 6),
    scene_goal: material,
    focus_stages: listText(pack.knowledgePoints, 8),
    likely_questions: listText(pack.guidingQuestions, 8),
    target_objections: listText(pack.commonObjections, 8),
    communication_method_tags: listText(pack.recommendationHooks, 8),
    must_cover_points: listText(pack.knowledgePoints, 8),
    do_not_say: listText(pack.doNotSay, 8),
    notes: safeText(pack.simplePitch, 300),
  }
}

Page({
  data: {
    id: "",
    saving: false,
    generating: false,
    packReady: false,

    name: "",
    projectMaterial: "",
    pack: null,
    packRows: [],
  },

  onLoad(query) {
    const id = safeText(query && query.id)
    const template = safeText(query && query.template)
    this.setData({ id })

    if (id) {
      this.loadCard(id)
      return
    }

    if (template === "starter") {
      this.applyStarterTemplate()
    }
  },

  applyStarterTemplate() {
    const draft = buildStarterSceneCardDraft()
    const pack = buildPackFromCard(draft) || buildLocalProjectPack({ name: draft.name, material: draft.scene_goal })
    this.setData({
      name: safeText(draft.name),
      projectMaterial: safeText(draft.scene_goal),
      pack,
      packRows: buildPackRows(pack),
      packReady: true,
    })
  },

  async loadCard(id) {
    try {
      const res = await request({
        baseUrl: IP_FACTORY_BASE_URL,
        url: "/api/mp/voice-coach/scene-cards/" + encodeURIComponent(id),
      })

      if (!res || !res.ok || !res.card) throw new Error((res && res.error) || "加载失败")

      const card = res.card
      const pack = buildPackFromCard(card)
      this.setData({
        name: safeText(card.name),
        projectMaterial: safeText(card.scene_goal),
        pack,
        packRows: buildPackRows(pack),
        packReady: Boolean(pack && buildPackRows(pack).length),
      })
    } catch (err) {
      wx.showToast({ title: (err && err.message) || "加载失败", icon: "none" })
    }
  },

  onName(e) {
    this.setData({ name: e.detail.value })
  },

  onProjectMaterial(e) {
    this.setData({
      projectMaterial: e.detail.value,
      packReady: false,
      pack: null,
      packRows: [],
    })
  },

  handleFillStarterTemplate() {
    this.applyStarterTemplate()
    wx.showToast({ title: "已填入示例项目", icon: "success" })
  },

  handleGeneratePack() {
    if (this.data.generating) return

    const name = safeText(this.data.name)
    const material = safeText(this.data.projectMaterial)
    if (!name) {
      wx.showToast({ title: "请先填写项目名称", icon: "none" })
      return
    }
    if (!material) {
      wx.showToast({ title: "请先粘贴项目资料", icon: "none" })
      return
    }

    this.setData({ generating: true })
    const pack = buildLocalProjectPack({ name, material })
    this.setData({
      generating: false,
      pack,
      packRows: buildPackRows(pack),
      packReady: true,
    })
    wx.showToast({ title: "已生成训练包", icon: "success" })
  },

  async handleSave() {
    if (this.data.saving) return

    const name = safeText(this.data.name)
    const material = safeText(this.data.projectMaterial)
    if (!name) {
      wx.showToast({ title: "请先填写项目名称", icon: "none" })
      return
    }
    if (!material) {
      wx.showToast({ title: "请先粘贴项目资料", icon: "none" })
      return
    }

    const pack = this.data.packReady && this.data.pack ? this.data.pack : buildLocalProjectPack({ name, material })
    const payload = packToPayload({ name, material, pack })

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
