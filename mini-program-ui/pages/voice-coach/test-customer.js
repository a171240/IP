const { IP_FACTORY_BASE_URL } = require("../../utils/config")
const { request } = require("../../utils/request")

const TEST_CUSTOMER_PROFILE_NAME = "测试顾客·林岚"
const TEST_CUSTOMER_PROFILE_MARKER = "[voice-coach-test-profile]"

function buildTestCustomerProfilePayload() {
  return {
    name: TEST_CUSTOMER_PROFILE_NAME,
    age_label: "32岁 / 品牌策划",
    occupation: "品牌策划",
    personality_tags: ["理性", "爱比较", "决策不快"],
    communication_style: "先听逻辑和依据，不喜欢被强推，希望过程透明。",
    core_concerns: ["怕花冤枉钱", "怕效果不稳定", "担心恢复期影响上班"],
    trust_triggers: ["真实案例", "专业解释清楚", "先说风险再说收益"],
    past_experience:
      "之前做过基础护理，被推销过套餐，所以现在到店会先观察，再决定要不要继续做。",
    notes:
      "系统测试顾客。适合测试到店护理、价格异议、效果质疑、需要时间考虑这几类对话。" +
      TEST_CUSTOMER_PROFILE_MARKER,
  }
}

function isTestCustomerProfile(profile) {
  if (!profile || typeof profile !== "object") return false

  const name = String(profile.name || "").trim()
  const notes = String(profile.notes || "").trim()

  return name === TEST_CUSTOMER_PROFILE_NAME || notes.indexOf(TEST_CUSTOMER_PROFILE_MARKER) >= 0
}

function findExistingTestCustomerProfile(profiles) {
  if (!Array.isArray(profiles)) return null
  return profiles.find((item) => isTestCustomerProfile(item)) || null
}

async function ensureTestCustomerProfile(existingProfiles) {
  const localMatch = findExistingTestCustomerProfile(existingProfiles)
  if (localMatch) {
    return {
      profile: localMatch,
      created: false,
    }
  }

  const listRes = await request({
    baseUrl: IP_FACTORY_BASE_URL,
    url: "/api/mp/voice-coach/customer-profiles?limit=50",
  })

  if (!listRes || !listRes.ok) {
    throw new Error((listRes && listRes.error) || "加载顾客档案失败")
  }

  const remoteMatch = findExistingTestCustomerProfile(listRes.profiles || [])
  if (remoteMatch) {
    return {
      profile: remoteMatch,
      created: false,
    }
  }

  const createRes = await request({
    baseUrl: IP_FACTORY_BASE_URL,
    url: "/api/mp/voice-coach/customer-profiles",
    method: "POST",
    data: buildTestCustomerProfilePayload(),
  })

  if (!createRes || !createRes.ok || !createRes.profile) {
    throw new Error((createRes && createRes.error) || "生成测试顾客失败")
  }

  return {
    profile: createRes.profile,
    created: true,
  }
}

module.exports = {
  TEST_CUSTOMER_PROFILE_NAME,
  buildTestCustomerProfilePayload,
  ensureTestCustomerProfile,
  findExistingTestCustomerProfile,
  isTestCustomerProfile,
}
