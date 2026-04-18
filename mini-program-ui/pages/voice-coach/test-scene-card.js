const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

const TEST_SCENE_CARD_NAME = "测试场景卡·首次到店顾虑"
const TEST_SCENE_CARD_MARKER = "[voice-coach-test-scene-card]"

function buildStarterSceneCardDraft() {
  return {
    name: "首次到店·安全与价格顾虑",
    scene_kind: "customer_visit",
    service_name: "补水修护护理",
    customer_stage: "首次到店",
    scene_goal: "练习首次到店时的破冰、需求确认，以及安全感和价格顾虑的回应。",
    focus_stages: ["启动破冰", "需求深挖", "现场异议"],
    likely_questions: [
      "这个护理项目主要做什么？",
      "做一次大概要多久？",
      "做完会不会刺激皮肤？",
    ],
    target_objections: [
      "价格有点高",
      "我怕没有效果",
      "我想再考虑一下",
    ],
    communication_method_tags: [
      "先接情绪再解释",
      "先问顾虑来源再回应",
    ],
    must_cover_points: [
      "先确认顾虑点",
      "说明体验流程和感受",
      "避免夸大承诺",
    ],
    do_not_say: [
      "今天不做就更严重",
      "绝对一次见效",
    ],
    notes: "常用起步模板，适合新美容师先练首次到店顾客对话。",
  }
}

function buildTestSceneCardPayload() {
  const starter = buildStarterSceneCardDraft()
  return {
    ...starter,
    name: TEST_SCENE_CARD_NAME,
    notes: `${starter.notes} ${TEST_SCENE_CARD_MARKER}`,
  }
}

function isTestSceneCard(card) {
  if (!card || typeof card !== "object") return false
  const name = String(card.name || "").trim()
  const notes = String(card.notes || "").trim()
  return name === TEST_SCENE_CARD_NAME || notes.indexOf(TEST_SCENE_CARD_MARKER) >= 0
}

function findExistingTestSceneCard(cards) {
  if (!Array.isArray(cards)) return null
  return cards.find((item) => isTestSceneCard(item)) || null
}

async function ensureTestSceneCard(existingCards) {
  const localMatch = findExistingTestSceneCard(existingCards)
  if (localMatch) {
    return { card: localMatch, created: false }
  }

  const listRes = await request({
    baseUrl: IP_FACTORY_BASE_URL,
    url: "/api/mp/voice-coach/scene-cards?limit=50",
  })

  if (!listRes || !listRes.ok) {
    throw new Error((listRes && listRes.error) || "加载场景卡失败")
  }

  const remoteMatch = findExistingTestSceneCard(listRes.cards || [])
  if (remoteMatch) {
    return { card: remoteMatch, created: false }
  }

  const createRes = await request({
    baseUrl: IP_FACTORY_BASE_URL,
    url: "/api/mp/voice-coach/scene-cards",
    method: "POST",
    data: buildTestSceneCardPayload(),
  })

  if (!createRes || !createRes.ok || !createRes.card) {
    throw new Error((createRes && createRes.error) || "生成测试场景卡失败")
  }

  return {
    card: createRes.card,
    created: true,
  }
}

module.exports = {
  TEST_SCENE_CARD_NAME,
  buildStarterSceneCardDraft,
  buildTestSceneCardPayload,
  ensureTestSceneCard,
  findExistingTestSceneCard,
  isTestSceneCard,
}
