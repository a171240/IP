const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

const TEST_SCENE_CARD_NAME = "示例项目·胶原抗衰启动"
const TEST_SCENE_CARD_MARKER = "[voice-coach-test-project-card]"

function buildStarterSceneCardDraft() {
  return {
    name: "胶原抗衰护理启动",
    scene_kind: "offer_promo",
    service_name: "胶原抗衰护理",
    customer_stage: "初抗老、熬夜暗沉、在意皮肤紧致度的顾客",
    scene_goal: "胶原抗衰护理主打紧致、细腻和光泽感，重点围绕项目原理、适合人群、操作体验和预期管理展开。",
    focus_stages: ["胶原流失与皮肤状态", "项目原理转口语", "操作流程和体验感", "适合人群与禁忌"],
    likely_questions: [
      "我现在需要做抗衰吗？",
      "这个项目和普通补水有什么区别？",
      "做完多久能看到状态变化？",
    ],
    target_objections: [
      "价格有点高",
      "我怕没效果",
      "我想先回去考虑一下",
    ],
    communication_method_tags: [
      "先问皮肤困扰再推荐",
      "用顾客能听懂的话解释原理",
      "先讲适合与不适合再讲效果",
    ],
    must_cover_points: [
      "讲清项目解决的问题",
      "讲清操作流程和体验感",
      "讲清需要按周期管理预期",
    ],
    do_not_say: [
      "绝对一次见效",
      "今天不做就会老得更快",
      "所有人都适合",
    ],
    notes: "项目启动示例，适合新员工练习把新品项讲清楚，并自然处理价格和效果顾虑。",
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
    throw new Error((listRes && listRes.error) || "加载项目失败")
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
    throw new Error((createRes && createRes.error) || "生成示例项目失败")
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
