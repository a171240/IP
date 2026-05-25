import "server-only"

import type { MpAccountContext } from "@/lib/mp/account-context.server"

export const BAIBAITU_BRAND_CODE = "baibaitu"
export const BAIBAITU_PACK_ID = "baibaitu_onboarding_v1"
export const BAIBAITU_RUBRIC_VERSION = "baibaitu_onboarding_v1_rubric_20260525"

type SupabaseAdmin = any

type AuthUserLike = {
  id: string
  email?: string | null
}

export type BaibaituTrainingTask = {
  id: string
  dayIndex: number
  title: string
  focus: string
  visibleGoal: string
  customerName: string
  customerSetting: string
  customerConcern: string
  passGoals: string[]
  forbiddenPhrases: string[]
  badgeTitle: string
  hiddenCustomerTitle: string
  goldLine: string
  easterEggTitle: string
  easterEggCopy: string
}

const BAIBAITU_TASKS: BaibaituTrainingTask[] = [
  {
    id: "day1_brand_intro",
    dayIndex: 1,
    title: "品牌文化入职",
    focus: "用 1 分钟讲清白白兔是谁",
    visibleGoal: "先讲品牌定位，再讲服务边界，让顾客感觉专业但没有压力。",
    customerName: "谨慎新客",
    customerSetting: "第一次到店，听过淡斑护理但担心被推销，想先确认门店是否专业。",
    customerConcern: "你们和普通美容院有什么不一样？会不会一上来就让我买套餐？",
    passGoals: ["讲清白白兔主做问题肌、淡斑美白和基础护肤", "说明先看肤况再给建议", "主动表达不做夸大承诺"],
    forbiddenPhrases: ["一次见效", "永久不反复", "保证祛斑"],
    badgeTitle: "品牌开口星",
    hiddenCustomerTitle: "谨慎体验官",
    goldLine: "我们会先看您现在的肤况，再判断适合做哪一类护理，不急着直接推项目。",
    easterEggTitle: "解锁隐藏顾客：谨慎体验官",
    easterEggCopy: "下一次复练会更像真实新客：她会反复确认安全感和服务边界。",
  },
  {
    id: "day2_clean_pores",
    dayIndex: 2,
    title: "基础清洁毛孔",
    focus: "把清洁不伤皮肤讲明白",
    visibleGoal: "围绕黑头、堵塞、吸收差，练习先疏通再护理的表达。",
    customerName: "毛孔焦虑新客",
    customerSetting: "长期化妆，鼻翼黑头明显，担心清洁会把皮肤弄薄。",
    customerConcern: "黑头能不能一次清干净？做完毛孔是不是马上变小？",
    passGoals: ["解释清洁、导出和后续吸收的关系", "提醒清洁要温和，不追求强刺激", "给出周期护理和居家清洁建议"],
    forbiddenPhrases: ["一次清完", "马上收缩毛孔", "越痛越有效"],
    badgeTitle: "温和清洁星",
    hiddenCustomerTitle: "黑头追问官",
    goldLine: "清洁的重点不是一次做得很猛，而是温和疏通，让后面的补水和修护更好吸收。",
    easterEggTitle: "解锁隐藏顾客：黑头追问官",
    easterEggCopy: "她会连续追问黑头、毛孔和疼痛感，适合练预期管理。",
  },
  {
    id: "day3_hydration_barrier",
    dayIndex: 3,
    title: "缺水屏障修护",
    focus: "先接住干、红、刺痛的担心",
    visibleGoal: "练习把缺水、泛红、刺痛和屏障之间的关系讲清楚。",
    customerName: "敏感担心客",
    customerSetting: "脸颊容易泛红，换季刺痛，觉得自己一直补水但还是干。",
    customerConcern: "为什么我一直补水还是干？做护理会不会越做越薄？",
    passGoals: ["先询问近期护肤和过敏情况", "讲清缺水和屏障弱会相互影响", "建议先舒缓修护，再做进阶项目"],
    forbiddenPhrases: ["一次修好", "绝对不过敏", "所有人都适合"],
    badgeTitle: "屏障安抚星",
    hiddenCustomerTitle: "防备型敏感肌",
    goldLine: "您现在更重要的是先把皮肤稳住，屏障舒服了，后面做提亮和淡化才更稳。",
    easterEggTitle: "解锁隐藏顾客：防备型敏感肌",
    easterEggCopy: "她会不断担心刺激和反应，适合练共情和专业解释。",
  },
  {
    id: "day4_acne_oil",
    dayIndex: 4,
    title: "痘痘闭口调理",
    focus: "讲清水油平衡和日常配合",
    visibleGoal: "面对痘痘、闭口、痘印顾客，练习不制造焦虑的专业表达。",
    customerName: "反复长痘客",
    customerSetting: "下巴和额头反复长痘，爱熬夜，想知道能不能快速不复发。",
    customerConcern: "痘痘能不能根治？痘印多久能淡？我能不能自己挤？",
    passGoals: ["解释油脂、清洁、作息和护理周期", "提醒不要挤压皮肤", "把淡印说成按周期观察的改善"],
    forbiddenPhrases: ["根治痘痘", "不再复发", "挤出来好得快"],
    badgeTitle: "痘肌稳话星",
    hiddenCustomerTitle: "急性子痘肌",
    goldLine: "痘痘护理不是只看今天少几颗，更要把油脂、清洁和修护节奏一起稳下来。",
    easterEggTitle: "解锁隐藏顾客：急性子痘肌",
    easterEggCopy: "她很想马上见变化，会逼你练耐心解释和周期管理。",
  },
  {
    id: "day5_bright_spots",
    dayIndex: 5,
    title: "暗黄淡斑亮肤",
    focus: "把抑黑、提亮、修护、防护串起来",
    visibleGoal: "练习面对斑点、暗黄和色沉时，先管理预期，再给护理路径。",
    customerName: "淡斑观望客",
    customerSetting: "脸颊有色沉和晒斑，想变亮，但担心反黑和花钱没变化。",
    customerConcern: "斑能去掉吗？会不会反黑？多久能白？",
    passGoals: ["解释淡化、提亮、修护和防护是连续链路", "说明不同斑点和肤况需要不同周期", "提醒护理后防晒和居家配合"],
    forbiddenPhrases: ["保证祛斑", "固定天数变白", "永不反黑"],
    badgeTitle: "亮肤预期星",
    hiddenCustomerTitle: "反黑担心客",
    goldLine: "淡斑亮肤要看斑的类型和皮肤状态，我们先做稳定和提亮，再按周期观察变化。",
    easterEggTitle: "解锁隐藏顾客：反黑担心客",
    easterEggCopy: "她会反复问多久变白，适合练边界感和护理节奏。",
  },
  {
    id: "day6_anti_aging",
    dayIndex: 6,
    title: "抗衰紧致护理",
    focus: "把补水、胶原、紧致讲成一条线",
    visibleGoal: "面对细纹、松弛、疲态顾客，练习温和推荐抗初老方案。",
    customerName: "初老犹豫客",
    customerSetting: "觉得脸容易垮，眼下和法令纹明显，但不确定自己需不需要抗衰。",
    customerConcern: "我这个年龄需要抗衰吗？和普通补水有什么区别？做几次有效？",
    passGoals: ["先确认顾客的年龄焦虑和护理预算", "解释补水、胶原维养和紧致维护的区别", "给出低压力的体验建议"],
    forbiddenPhrases: ["逆龄", "永久年轻", "做完纹路消失"],
    badgeTitle: "抗初老顾问星",
    hiddenCustomerTitle: "预算摇摆客",
    goldLine: "抗初老不是突然做很猛的项目，而是从补水、紧致和胶原维养开始做长期维护。",
    easterEggTitle: "解锁隐藏顾客：预算摇摆客",
    easterEggCopy: "她会在效果和价格之间犹豫，适合练价值解释。",
  },
  {
    id: "day7_eye_review",
    dayIndex: 7,
    title: "眼周护理总复盘",
    focus: "用眼周场景复盘完整接待",
    visibleGoal: "把问诊、共情、项目解释、禁说边界和下一步邀约串成完整对话。",
    customerName: "熬夜眼周客",
    customerSetting: "经常熬夜，眼下暗沉浮肿，有细纹，担心眼周护理会刺激。",
    customerConcern: "黑眼圈能不能去掉？眼纹是不是做了就没？眼周会不会敏感？",
    passGoals: ["先问作息、眼周敏感和护肤习惯", "讲清眼周疲劳、浮肿、干纹需要综合护理", "自然完成下一次护理或复练邀约"],
    forbiddenPhrases: ["黑眼圈消失", "眼纹做了就没", "眼周绝对不刺激"],
    badgeTitle: "训练营结业星",
    hiddenCustomerTitle: "连环追问官",
    goldLine: "眼周护理会先看暗沉、浮肿和干纹分别来自哪里，再用更温和的方式做维护。",
    easterEggTitle: "解锁隐藏顾客：连环追问官",
    easterEggCopy: "她会把品牌、项目和效果边界一起追问，是结业复盘关。",
  },
]

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max) : text
}

function parseEnvList(...keys: string[]) {
  const values = keys.flatMap((key) => String(process.env[key] || "").split(/[,\s]+/))
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
}

function objectFeatureEnabled(value: unknown, code: string) {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).includes(code)
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, any>
  const direct = record[code]
  if (direct && typeof direct === "object") return direct.enabled !== false
  if (direct === true || direct === "true" || direct === 1 || direct === "1") return true
  const features = record.features || record.feature_flags
  if (Array.isArray(features)) return features.includes(code)
  if (features && typeof features === "object") return objectFeatureEnabled(features, code)
  return false
}

function isMissingColumnOrTable(error: any) {
  const message = String(error?.message || "").toLowerCase()
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  )
}

export function getBaibaituTrainingTasks() {
  return BAIBAITU_TASKS.slice()
}

export function findBaibaituTrainingTask(taskId: unknown) {
  const id = cleanText(taskId, 80)
  if (!id) return null
  return BAIBAITU_TASKS.find((task) => task.id === id) || null
}

export function buildBaibaituTaskLiveNotes(task: BaibaituTrainingTask) {
  const goals = task.passGoals
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${cleanText(item, 72)}`)
    .join("\n")
  const forbidden = task.forbiddenPhrases.slice(0, 3).map((item) => cleanText(item, 24)).filter(Boolean).join("、")
  return [
    `白白兔训练任务：${cleanText(task.title, 28)}`,
    `AI 顾客：${cleanText(task.customerSetting, 84)}`,
    "本关必须考察：",
    goals,
    forbidden ? `禁说词提醒：${forbidden}` : "",
  ].filter(Boolean).join("\n").slice(0, 500)
}

export function buildBaibaituTaskPreview(task: BaibaituTrainingTask) {
  return {
    brand_code: BAIBAITU_BRAND_CODE,
    pack_id: BAIBAITU_PACK_ID,
    task_id: task.id,
    day_index: task.dayIndex,
    title: task.title,
    focus: task.focus,
    visible_goal: task.visibleGoal,
    customer_name: task.customerName,
    customer_setting: task.customerSetting,
    customer_concern: task.customerConcern,
    pass_goals: task.passGoals.slice(0, 3),
    forbidden_phrases: task.forbiddenPhrases.slice(0, 3),
    badge_title: task.badgeTitle,
    hidden_customer_title: task.hiddenCustomerTitle,
    gold_line: task.goldLine,
    easter_egg_title: task.easterEggTitle,
  }
}

export function buildBaibaituTaskSetup(task: BaibaituTrainingTask) {
  return {
    scenario_id: "objection_safety",
    customer_profile_id: "",
    scene_card_id: "",
    live_notes: buildBaibaituTaskLiveNotes(task),
    training_task_id: task.id,
    training_pack_id: BAIBAITU_PACK_ID,
    training_brand_code: BAIBAITU_BRAND_CODE,
    training_context: {
      brand_code: BAIBAITU_BRAND_CODE,
      pack_id: BAIBAITU_PACK_ID,
      task_id: task.id,
    },
    training_task_preview: buildBaibaituTaskPreview(task),
  }
}

export async function ensureBaibaituTrainingSeed(admin: SupabaseAdmin) {
  const pack = {
    brand_code: BAIBAITU_BRAND_CODE,
    pack_id: BAIBAITU_PACK_ID,
    title: "白白兔新人训练营",
    version: "v1",
    status: "published",
    published_at: new Date().toISOString(),
    metadata_json: {
      subtitle: "7 天把品牌、项目和表达边界练进嘴里",
    },
  }

  const { error: packError } = await admin
    .from("voice_training_packs")
    .upsert(pack, { onConflict: "brand_code,pack_id" })
  if (packError && !isMissingColumnOrTable(packError)) throw packError
  if (packError) return false

  const rows = BAIBAITU_TASKS.map((task) => ({
    id: task.id,
    brand_code: BAIBAITU_BRAND_CODE,
    pack_id: BAIBAITU_PACK_ID,
    day_index: task.dayIndex,
    title: task.title,
    focus: task.focus,
    visible_goal_json: [task.visibleGoal],
    customer_persona_json: {
      name: task.customerName,
      setting: task.customerSetting,
      concern: task.customerConcern,
    },
    live_notes_template: buildBaibaituTaskLiveNotes(task),
    must_cover_points_json: task.passGoals,
    forbidden_phrases_json: task.forbiddenPhrases,
    reward_json: {
      badge_title: task.badgeTitle,
      hidden_customer_title: task.hiddenCustomerTitle,
      gold_line: task.goldLine,
      easter_egg_title: task.easterEggTitle,
      easter_egg_copy: task.easterEggCopy,
    },
    rubric_json: {
      version: BAIBAITU_RUBRIC_VERSION,
      pass_score: 70,
      professional_score: 80,
      egg_score: 85,
    },
    status: "published",
  }))

  const { error: taskError } = await admin
    .from("voice_training_tasks")
    .upsert(rows, { onConflict: "id" })
  if (taskError && !isMissingColumnOrTable(taskError)) throw taskError
  return !taskError
}

export async function resolveBaibaituTrainingAccess(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
}) {
  const email = String(args.user.email || "").trim().toLowerCase()
  const userId = args.user.id.toLowerCase()
  const companyId = String(args.ctx.companyId || "").toLowerCase()
  const storeId = String(args.ctx.storeId || "").toLowerCase()
  const membershipId = String(args.ctx.membershipId || "").toLowerCase()

  if (parseEnvList("BAIBAITU_TRAINING_USER_IDS", "MP_BAIBAITU_TRAINING_USER_IDS").has(userId)) {
    return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "env_user" }
  }
  if (email && parseEnvList("BAIBAITU_TRAINING_EMAILS", "MP_BAIBAITU_TRAINING_EMAILS").has(email)) {
    return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "env_email" }
  }
  if (companyId && parseEnvList("BAIBAITU_TRAINING_COMPANY_IDS", "MP_BAIBAITU_TRAINING_COMPANY_IDS").has(companyId)) {
    return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "env_company" }
  }
  if (storeId && parseEnvList("BAIBAITU_TRAINING_STORE_IDS", "MP_BAIBAITU_TRAINING_STORE_IDS").has(storeId)) {
    return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "env_store" }
  }
  if (membershipId && parseEnvList("BAIBAITU_TRAINING_MEMBERSHIP_IDS", "MP_BAIBAITU_TRAINING_MEMBERSHIP_IDS").has(membershipId)) {
    return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "env_membership" }
  }

  const profile = await args.admin
    .from("profiles")
    .select("brand_code, feature_flags")
    .eq("id", args.user.id)
    .maybeSingle()
  if (!profile.error && profile.data) {
    if (String(profile.data.brand_code || "") === BAIBAITU_BRAND_CODE || objectFeatureEnabled(profile.data.feature_flags, "baibaitu_training")) {
      return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "profile" }
    }
  } else if (profile.error && !isMissingColumnOrTable(profile.error)) {
    throw profile.error
  }

  if (args.ctx.membershipId) {
    const membership = await args.admin
      .from("mp_account_memberships")
      .select("metadata")
      .eq("id", args.ctx.membershipId)
      .maybeSingle()
    if (!membership.error && objectFeatureEnabled(membership.data?.metadata, "baibaitu_training")) {
      return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "membership_metadata" }
    }
  }

  if (args.ctx.storeId) {
    const store = await args.admin
      .from("mp_stores")
      .select("brand_code, metadata")
      .eq("id", args.ctx.storeId)
      .maybeSingle()
    if (!store.error && store.data) {
      if (String(store.data.brand_code || "") === BAIBAITU_BRAND_CODE || objectFeatureEnabled(store.data.metadata, "baibaitu_training")) {
        return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "store" }
      }
    } else if (store.error && !isMissingColumnOrTable(store.error)) {
      throw store.error
    }
  }

  if (args.ctx.companyId) {
    const company = await args.admin
      .from("mp_companies")
      .select("brand_code, metadata")
      .eq("id", args.ctx.companyId)
      .maybeSingle()
    if (!company.error && company.data) {
      if (String(company.data.brand_code || "") === BAIBAITU_BRAND_CODE || objectFeatureEnabled(company.data.metadata, "baibaitu_training")) {
        return { enabled: true, brandCode: BAIBAITU_BRAND_CODE, source: "company" }
      }
    } else if (company.error && !isMissingColumnOrTable(company.error)) {
      throw company.error
    }
  }

  return { enabled: false, brandCode: "", source: "not_enabled" }
}

function countObjectKeys(value: Record<string, unknown> | null | undefined) {
  return Object.keys(value || {}).length
}

function recordFromJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
}

function formatStars(stars: number) {
  const n = Math.max(0, Math.min(3, Math.round(Number(stars || 0))))
  return "★★★".slice(0, n) + "☆☆☆".slice(0, 3 - n)
}

export async function loadBaibaituTrainingDashboard(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
}) {
  await ensureBaibaituTrainingSeed(args.admin)

  const { data: progressRow, error: progressError } = await args.admin
    .from("voice_training_progress")
    .select("*")
    .eq("brand_code", BAIBAITU_BRAND_CODE)
    .eq("pack_id", BAIBAITU_PACK_ID)
    .eq("staff_user_id", args.user.id)
    .maybeSingle()
  if (progressError && !isMissingColumnOrTable(progressError)) throw progressError

  const progressJson = recordFromJson(progressRow?.progress_json)
  const taskResults = recordFromJson(progressJson.task_results)
  const completedIds = recordFromJson(progressJson.completed_task_ids)
  const rewardJson = recordFromJson(progressJson.rewards)

  const firstIncomplete = BAIBAITU_TASKS.find((task) => !completedIds[task.id]) || BAIBAITU_TASKS[BAIBAITU_TASKS.length - 1]
  const currentTaskId = firstIncomplete?.id || ""
  const tasks = BAIBAITU_TASKS.map((task) => {
    const result = recordFromJson(taskResults[task.id])
    const completed = Boolean(completedIds[task.id])
    const locked = !completed && task.id !== currentTaskId
    const bestStars = Math.max(0, Math.min(3, Number(result.best_stars || 0) || 0))
    return {
      ...buildBaibaituTaskPreview(task),
      id: task.id,
      dayIndex: task.dayIndex,
      visibleGoal: task.visibleGoal,
      customerName: task.customerName,
      customerSetting: task.customerSetting,
      customerConcern: task.customerConcern,
      passGoals: task.passGoals,
      forbiddenPhrases: task.forbiddenPhrases,
      completed,
      locked,
      active: task.id === currentTaskId && !completed,
      bestStars,
      bestScore: Number(result.best_score || 0) || 0,
      bestSessionId: String(result.best_session_id || ""),
      statusLabel: completed ? "已通关" : task.id === currentTaskId ? "今日训练" : "未解锁",
      statusClass: completed ? "is-done" : task.id === currentTaskId ? "is-current" : "is-locked",
      starsText: bestStars ? formatStars(bestStars) : "☆☆☆",
      actionText: completed ? "复练这一关" : task.id === currentTaskId ? "开始今日训练" : "先完成前一关",
    }
  })

  const rewards = Array.isArray(progressJson.reward_list) ? progressJson.reward_list : []
  const completedCount = tasks.filter((task) => task.completed).length
  const currentTask = tasks.find((task) => task.id === currentTaskId) || tasks[0] || null

  return {
    pack: {
      brand_code: BAIBAITU_BRAND_CODE,
      pack_id: BAIBAITU_PACK_ID,
      title: "白白兔新人训练营",
      subtitle: "7 天把品牌、项目和表达边界练进嘴里",
    },
    progress: {
      completed_task_ids: completedIds,
      task_results: taskResults,
      rewards: rewardJson,
      completed_count: completedCount,
      total_count: tasks.length,
      reward_count: rewards.length || countObjectKeys(rewardJson as Record<string, unknown>),
      current_task_id: currentTaskId,
      stars_total: Number(progressRow?.stars_total || 0) || 0,
      updated_at: progressRow?.updated_at || "",
    },
    tasks,
    currentTask,
    completedCount,
    totalCount: tasks.length,
    rewardCount: rewards.length || Number(progressRow?.reward_count || 0) || 0,
    rewards,
    latestReward: rewards[rewards.length - 1] || null,
  }
}

export async function linkBaibaituVoiceSession(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
  sessionId: string
  taskId: string
}) {
  const task = findBaibaituTrainingTask(args.taskId)
  if (!task) return null
  await ensureBaibaituTrainingSeed(args.admin)

  const row = {
    brand_code: BAIBAITU_BRAND_CODE,
    pack_id: BAIBAITU_PACK_ID,
    task_id: task.id,
    session_id: args.sessionId,
    staff_user_id: args.user.id,
    company_id: args.ctx.companyId,
    store_id: args.ctx.storeId,
    membership_id: args.ctx.membershipId,
    status: "active",
    started_at: new Date().toISOString(),
  }

  const { data, error } = await args.admin
    .from("voice_training_session_links")
    .upsert(row, { onConflict: "session_id" })
    .select("*")
    .single()
  if (error) throw error
  return data
}

function collectBeauticianText(turns: any[]) {
  return (turns || [])
    .filter((turn) => String(turn?.role || "") === "beautician")
    .map((turn) => String(turn?.text || "").trim())
    .filter(Boolean)
    .join("\n")
}

function collectReportText(report: any) {
  const parts: string[] = []
  if (Array.isArray(report?.summary_blocks)) parts.push(report.summary_blocks.join("\n"))
  if (report?.next_round_focus) parts.push(report.next_round_focus.title || "", report.next_round_focus.instruction || "")
  return parts.join("\n")
}

export function buildBaibaituTrainingResult(args: {
  task: BaibaituTrainingTask
  sessionId: string
  report: any
  turns: any[]
}) {
  const score = Math.max(0, Math.min(100, Number(args.report?.total_score || 0) || 0))
  const text = `${collectBeauticianText(args.turns)}\n${collectReportText(args.report)}`
  const forbiddenHits = args.task.forbiddenPhrases.filter((phrase) => phrase && text.includes(phrase))
  const hasForbidden = forbiddenHits.length > 0
  const beauticianTurnCount = args.turns.filter((turn) => String(turn?.role || "") === "beautician" && String(turn?.text || "").trim()).length
  const completionStar = beauticianTurnCount > 0 && score >= 70
  const professionalStar = score >= 80
  const safeExpressionStar = !hasForbidden
  const stars = [completionStar, professionalStar, safeExpressionStar].filter(Boolean).length
  const passed = stars >= 2
  const eggUnlocked = score >= 85 && !hasForbidden

  return {
    taskId: args.task.id,
    taskTitle: args.task.title,
    dayIndex: args.task.dayIndex,
    sessionId: args.sessionId,
    score,
    stars,
    starsText: formatStars(stars),
    passed,
    hasForbidden,
    forbiddenHits,
    eggUnlocked,
    completionStar,
    professionalStar,
    safeExpressionStar,
    rubricVersion: BAIBAITU_RUBRIC_VERSION,
    badgeTitle: args.task.badgeTitle,
    hiddenCustomerTitle: args.task.hiddenCustomerTitle,
    goldLine: args.task.goldLine,
    easterEggTitle: args.task.easterEggTitle,
    easterEggCopy: args.task.easterEggCopy,
    goodLine: passed ? "你已经把本关主线讲出来了，继续保持先接住顾客再解释专业。" : "本关表达还需要再稳一点，下一轮先把顾客担心复述清楚。",
    nextLine: hasForbidden
      ? "下一轮先避开禁说词，用按肤况观察、按周期改善来表达。"
      : (stars >= 3 ? "可以复练更难的隐藏顾客，让追问更接近真实门店。" : "下一轮补强专业解释和低压力邀约。"),
  }
}

export async function saveBaibaituTrainingResult(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
  sessionId: string
  task: BaibaituTrainingTask
  result: ReturnType<typeof buildBaibaituTrainingResult>
}) {
  const now = new Date().toISOString()
  const { data: existingProgress } = await args.admin
    .from("voice_training_progress")
    .select("*")
    .eq("brand_code", BAIBAITU_BRAND_CODE)
    .eq("pack_id", BAIBAITU_PACK_ID)
    .eq("staff_user_id", args.user.id)
    .maybeSingle()

  const existingJson = recordFromJson(existingProgress?.progress_json)
  const completedTaskIds = recordFromJson(existingJson.completed_task_ids)
  const taskResults = recordFromJson(existingJson.task_results)
  const rewards = {
    badges: {},
    hidden_customers: {},
    gold_lines: {},
    easter_eggs: {},
    ...recordFromJson(existingJson.rewards),
  }

  const existingTaskResult = recordFromJson(taskResults[args.task.id])
  const bestStars = Math.max(Number(existingTaskResult.best_stars || 0) || 0, args.result.stars)
  const bestScore = Math.max(Number(existingTaskResult.best_score || 0) || 0, args.result.score)

  taskResults[args.task.id] = {
    ...existingTaskResult,
    best_stars: bestStars,
    best_score: bestScore,
    best_session_id: bestScore >= (Number(existingTaskResult.best_score || 0) || 0) ? args.sessionId : existingTaskResult.best_session_id || args.sessionId,
    last_session_id: args.sessionId,
    last_completed_at: now,
    last_has_forbidden: args.result.hasForbidden,
  }

  if (args.result.passed) {
    completedTaskIds[args.task.id] = true
    rewards.badges = { ...(rewards.badges || {}), [args.task.id]: true }
    rewards.gold_lines = { ...(rewards.gold_lines || {}), [args.task.id]: true }
  }
  if (args.result.eggUnlocked) {
    rewards.hidden_customers = { ...(rewards.hidden_customers || {}), [args.task.id]: true }
    rewards.easter_eggs = { ...(rewards.easter_eggs || {}), [args.task.id]: true }
  }

  const rewardList = [
    ...Object.keys(rewards.badges || {}).map((taskId) => {
      const task = findBaibaituTrainingTask(taskId)
      return task ? { id: `badge_${taskId}`, type: "徽章", title: task.badgeTitle, taskTitle: task.title } : null
    }),
    ...Object.keys(rewards.hidden_customers || {}).map((taskId) => {
      const task = findBaibaituTrainingTask(taskId)
      return task ? { id: `hidden_${taskId}`, type: "隐藏顾客", title: task.hiddenCustomerTitle, taskTitle: task.title } : null
    }),
    ...Object.keys(rewards.gold_lines || {}).map((taskId) => {
      const task = findBaibaituTrainingTask(taskId)
      return task ? { id: `gold_${taskId}`, type: "金句", title: task.goldLine, taskTitle: task.title } : null
    }),
    ...Object.keys(rewards.easter_eggs || {}).map((taskId) => {
      const task = findBaibaituTrainingTask(taskId)
      return task ? { id: `egg_${taskId}`, type: "彩蛋", title: task.easterEggTitle, taskTitle: task.title } : null
    }),
  ].filter(Boolean)

  const completedCount = countObjectKeys(completedTaskIds)
  const progressJson = {
    completed_task_ids: completedTaskIds,
    task_results: taskResults,
    rewards,
    reward_list: rewardList,
  }
  const nextTask = BAIBAITU_TASKS.find((task) => !completedTaskIds[task.id]) || BAIBAITU_TASKS[BAIBAITU_TASKS.length - 1]
  const starsTotal = Object.values(taskResults).reduce(
    (sum: number, item: any) => sum + (Number(item?.best_stars || 0) || 0),
    0,
  )

  const progressPayload = {
    brand_code: BAIBAITU_BRAND_CODE,
    pack_id: BAIBAITU_PACK_ID,
    staff_user_id: args.user.id,
    company_id: args.ctx.companyId,
    store_id: args.ctx.storeId,
    membership_id: args.ctx.membershipId,
    completed_task_count: completedCount,
    current_task_id: nextTask?.id || "",
    stars_total: starsTotal,
    reward_count: rewardList.length,
    progress_json: progressJson,
    last_completed_at: now,
    updated_at: now,
  }

  await args.admin
    .from("voice_training_session_links")
    .update({
      status: "completed",
      result_json: args.result,
      stars_total: args.result.stars,
      passed: args.result.passed,
      rubric_version: BAIBAITU_RUBRIC_VERSION,
      completed_at: now,
    })
    .eq("session_id", args.sessionId)
    .eq("staff_user_id", args.user.id)

  const { error: progressError } = await args.admin
    .from("voice_training_progress")
    .upsert(progressPayload, { onConflict: "brand_code,pack_id,staff_user_id" })
  if (progressError) throw progressError

  const rewardRows = [
    args.result.passed
      ? {
          brand_code: BAIBAITU_BRAND_CODE,
          pack_id: BAIBAITU_PACK_ID,
          task_id: args.task.id,
          session_id: args.sessionId,
          staff_user_id: args.user.id,
          company_id: args.ctx.companyId,
          store_id: args.ctx.storeId,
          membership_id: args.ctx.membershipId,
          reward_type: "badge",
          title: args.task.badgeTitle,
          metadata_json: args.result,
          unlocked_at: now,
        }
      : null,
    args.result.passed
      ? {
          brand_code: BAIBAITU_BRAND_CODE,
          pack_id: BAIBAITU_PACK_ID,
          task_id: args.task.id,
          session_id: args.sessionId,
          staff_user_id: args.user.id,
          company_id: args.ctx.companyId,
          store_id: args.ctx.storeId,
          membership_id: args.ctx.membershipId,
          reward_type: "gold_line",
          title: args.task.goldLine,
          metadata_json: args.result,
          unlocked_at: now,
        }
      : null,
    args.result.eggUnlocked
      ? {
          brand_code: BAIBAITU_BRAND_CODE,
          pack_id: BAIBAITU_PACK_ID,
          task_id: args.task.id,
          session_id: args.sessionId,
          staff_user_id: args.user.id,
          company_id: args.ctx.companyId,
          store_id: args.ctx.storeId,
          membership_id: args.ctx.membershipId,
          reward_type: "hidden_customer",
          title: args.task.hiddenCustomerTitle,
          metadata_json: args.result,
          unlocked_at: now,
        }
      : null,
    args.result.eggUnlocked
      ? {
          brand_code: BAIBAITU_BRAND_CODE,
          pack_id: BAIBAITU_PACK_ID,
          task_id: args.task.id,
          session_id: args.sessionId,
          staff_user_id: args.user.id,
          company_id: args.ctx.companyId,
          store_id: args.ctx.storeId,
          membership_id: args.ctx.membershipId,
          reward_type: "easter_egg",
          title: args.task.easterEggTitle,
          metadata_json: args.result,
          unlocked_at: now,
        }
      : null,
  ].filter(Boolean) as Array<Record<string, unknown>>

  if (rewardRows.length) {
    const { error: rewardError } = await args.admin
      .from("voice_training_rewards")
      .upsert(rewardRows, { onConflict: "brand_code,pack_id,staff_user_id,task_id,reward_type" })
    if (rewardError) throw rewardError
  }

  return {
    progress: progressPayload,
    rewards: rewardList,
  }
}
