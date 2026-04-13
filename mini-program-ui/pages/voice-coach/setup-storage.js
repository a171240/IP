const SELECTED_CUSTOMER_PROFILE_KEY = "voice_coach_selected_customer_profile"
const SELECTED_SCENE_CARD_KEY = "voice_coach_selected_scene_card"
const SETUP_DRAFT_KEY = "voice_coach_setup_draft"
const PENDING_SETUP_KEY = "voice_coach_pending_setup"

const SCENE_KIND_LABELS = {
  customer_visit: "到店顾客训练",
  offer_promo: "新品推广训练",
}

function readJson(key, fallbackValue) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return fallbackValue
    if (typeof raw === "string") return JSON.parse(raw)
    if (typeof raw === "object") return raw
  } catch (_err) {}
  return fallbackValue
}

function writeJson(key, value) {
  try {
    if (
      value === null ||
      typeof value === "undefined" ||
      value === "" ||
      (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)
    ) {
      wx.removeStorageSync(key)
      return
    }
    wx.setStorageSync(key, JSON.stringify(value))
  } catch (_err) {}
}

function cleanText(value, maxLen) {
  const text = String(value || "").trim()
  if (!text) return ""
  if (!maxLen || text.length <= maxLen) return text
  return text.slice(0, maxLen)
}

function toTextList(value, maxItems) {
  let list = []

  if (Array.isArray(value)) {
    list = value.map((item) => cleanText(item, 80)).filter(Boolean)
  } else {
    const text = cleanText(value, 800)
    if (text) {
      list = text
        .split(/[\n,，、；;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }

  const deduped = []
  const seen = {}
  const limit = Number(maxItems || 12) || 12
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i]
    if (!item || seen[item]) continue
    seen[item] = true
    deduped.push(item)
    if (deduped.length >= limit) break
  }
  return deduped
}

function getSceneKindLabel(sceneKind) {
  const key = cleanText(sceneKind, 32)
  return SCENE_KIND_LABELS[key] || "训练场景"
}

function normalizeCustomerProfile(profile) {
  if (!profile || typeof profile !== "object") return null

  return {
    id: cleanText(profile.id, 64),
    name: cleanText(profile.name, 40),
    age_label: cleanText(profile.age_label, 30),
    occupation: cleanText(profile.occupation, 40),
    personality_tags: toTextList(profile.personality_tags, 8),
    communication_style: cleanText(profile.communication_style, 120),
    core_concerns: toTextList(profile.core_concerns, 8),
    trust_triggers: toTextList(profile.trust_triggers, 8),
    past_experience: cleanText(profile.past_experience, 200),
    notes: cleanText(profile.notes, 300),
  }
}

function normalizeSceneCard(card) {
  if (!card || typeof card !== "object") return null

  const sceneKind = cleanText(card.scene_kind, 40) || "customer_visit"

  return {
    id: cleanText(card.id, 64),
    name: cleanText(card.name, 50),
    scene_kind: sceneKind,
    scene_kind_label: getSceneKindLabel(sceneKind),
    service_name: cleanText(card.service_name, 60),
    customer_stage: cleanText(card.customer_stage, 40),
    scene_goal: cleanText(card.scene_goal, 160),
    focus_stages: toTextList(card.focus_stages, 8),
    likely_questions: toTextList(card.likely_questions, 8),
    target_objections: toTextList(card.target_objections, 8),
    communication_method_tags: toTextList(card.communication_method_tags, 8),
    must_cover_points: toTextList(card.must_cover_points, 8),
    do_not_say: toTextList(card.do_not_say, 8),
    notes: cleanText(card.notes, 300),
  }
}

function buildCustomerMeta(profile) {
  if (!profile) return ""
  const bits = []
  if (profile.age_label) bits.push(profile.age_label)
  if (profile.occupation) bits.push(profile.occupation)
  if (profile.personality_tags && profile.personality_tags.length) {
    bits.push("性格 " + profile.personality_tags.join(" / "))
  }
  return bits.join(" · ")
}

function buildSceneMeta(card) {
  if (!card) return ""
  const bits = [card.scene_kind_label]
  if (card.service_name) bits.push("项目 " + card.service_name)
  if (card.customer_stage) bits.push("阶段 " + card.customer_stage)
  return bits.filter(Boolean).join(" · ")
}

function formatLine(label, value) {
  const text = cleanText(value, 280)
  if (!text) return ""
  return label + "：" + text
}

function formatListLine(label, values, maxItems) {
  const list = toTextList(values, maxItems || 4)
  if (!list.length) return ""
  return label + "：" + list.join("；")
}

function buildSetupBrief(input) {
  const customerProfile = normalizeCustomerProfile(input && input.customerProfile)
  const sceneCard = normalizeSceneCard(input && input.sceneCard)
  const liveNotes = cleanText(input && input.liveNotes, 500)

  const summaryLines = [
    customerProfile
      ? formatLine(
          "顾客设定",
          [customerProfile.name, buildCustomerMeta(customerProfile)].filter(Boolean).join(" · "),
        )
      : "",
    customerProfile ? formatListLine("核心顾虑", customerProfile.core_concerns, 4) : "",
    customerProfile ? formatListLine("信任触发点", customerProfile.trust_triggers, 3) : "",
    sceneCard
      ? formatLine(
          "场景卡",
          [sceneCard.name, buildSceneMeta(sceneCard)].filter(Boolean).join(" · "),
        )
      : "",
    sceneCard ? formatLine("训练目标", sceneCard.scene_goal) : "",
    sceneCard ? formatListLine("重点环节", sceneCard.focus_stages, 4) : "",
    sceneCard ? formatListLine("高频问题", sceneCard.likely_questions, 4) : "",
    sceneCard ? formatListLine("重点异议", sceneCard.target_objections, 4) : "",
    sceneCard ? formatListLine("必须覆盖", sceneCard.must_cover_points, 4) : "",
    sceneCard ? formatListLine("禁忌表达", sceneCard.do_not_say, 3) : "",
    liveNotes ? formatLine("本次补充", liveNotes) : "",
  ].filter(Boolean)

  return {
    customerProfile,
    sceneCard,
    liveNotes,
    summaryLines,
  }
}

function saveSelectedCustomerProfile(profile) {
  writeJson(SELECTED_CUSTOMER_PROFILE_KEY, normalizeCustomerProfile(profile))
}

function getSelectedCustomerProfile() {
  return normalizeCustomerProfile(readJson(SELECTED_CUSTOMER_PROFILE_KEY, null))
}

function clearSelectedCustomerProfile() {
  wx.removeStorageSync(SELECTED_CUSTOMER_PROFILE_KEY)
}

function saveSelectedSceneCard(card) {
  writeJson(SELECTED_SCENE_CARD_KEY, normalizeSceneCard(card))
}

function getSelectedSceneCard() {
  return normalizeSceneCard(readJson(SELECTED_SCENE_CARD_KEY, null))
}

function clearSelectedSceneCard() {
  wx.removeStorageSync(SELECTED_SCENE_CARD_KEY)
}

function saveSetupDraft(draft) {
  const normalized = {
    live_notes: cleanText(draft && draft.live_notes, 500),
  }
  writeJson(SETUP_DRAFT_KEY, normalized)
}

function getSetupDraft() {
  const draft = readJson(SETUP_DRAFT_KEY, null)
  if (!draft || typeof draft !== "object") return { live_notes: "" }
  return {
    live_notes: cleanText(draft.live_notes, 500),
  }
}

function buildPendingVoiceCoachSetup(input) {
  const brief = buildSetupBrief(input || {})
  return {
    scenario_id: "objection_safety",
    customer_profile_id: brief.customerProfile && brief.customerProfile.id ? brief.customerProfile.id : "",
    scene_card_id: brief.sceneCard && brief.sceneCard.id ? brief.sceneCard.id : "",
    live_notes: brief.liveNotes || "",
    preview: {
      customerProfile: brief.customerProfile,
      sceneCard: brief.sceneCard,
      summaryLines: brief.summaryLines,
    },
  }
}

function savePendingVoiceCoachSetup(setup) {
  writeJson(PENDING_SETUP_KEY, setup)
}

function consumePendingVoiceCoachSetup() {
  const setup = readJson(PENDING_SETUP_KEY, null)
  wx.removeStorageSync(PENDING_SETUP_KEY)
  return setup
}

module.exports = {
  SCENE_KIND_LABELS,
  buildCustomerMeta,
  buildPendingVoiceCoachSetup,
  buildSceneMeta,
  buildSetupBrief,
  clearSelectedCustomerProfile,
  clearSelectedSceneCard,
  consumePendingVoiceCoachSetup,
  getSceneKindLabel,
  getSelectedCustomerProfile,
  getSelectedSceneCard,
  getSetupDraft,
  normalizeCustomerProfile,
  normalizeSceneCard,
  savePendingVoiceCoachSetup,
  saveSelectedCustomerProfile,
  saveSelectedSceneCard,
  saveSetupDraft,
  toTextList,
}
