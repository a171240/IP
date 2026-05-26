import "server-only"

import type { MpAccountContext } from "@/lib/mp/account-context.server"
import type { MpKnowledgeSpaceOption } from "@/lib/mp/knowledge-space.server"
import {
  BAIBAITU_BRAND_CODE,
  BAIBAITU_PACK_ID,
  BAIBAITU_RUBRIC_VERSION,
  getBaibaituTrainingTasks,
} from "@/lib/voice-training/baibaitu.server"

type SupabaseAdmin = any

type AuthUserLike = {
  id: string
  email?: string | null
}

export type VoiceTrainingTask = {
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

type VoiceTrainingPackDefinition = {
  brandCode: string
  packId: string
  title: string
  subtitle: string
  version: string
  rubricVersion: string
  tasks: VoiceTrainingTask[]
}

const CHUNSHE_BRAND_CODE = "chunshe"
const CHUNSHE_PACK_ID = "chunshe_onboarding_v1"
const CHUNSHE_RUBRIC_VERSION = "chunshe_onboarding_v1_rubric_20260526"

const CHUNSHE_TASKS: VoiceTrainingTask[] = [
  {
    id: "chunshe_day1_brand_intro",
    dayIndex: 1,
    title: "日式美肌开场",
    focus: "把椿舍的服务感和边界讲清楚",
    visibleGoal: "练习用温和、不催促的方式介绍门店风格和本次护理流程。",
    customerName: "慢热新客",
    customerSetting: "第一次到店，想体验皮肤管理，但担心被过度推销。",
    customerConcern: "你们这里和普通美容院有什么区别？会不会一直让我办卡？",
    passGoals: ["先欢迎并确认顾客今天的目标", "说明会先看肤况再给建议", "表达不急着推项目和办卡"],
    forbiddenPhrases: ["必须办卡", "今天不买就亏了", "保证马上变好"],
    badgeTitle: "温柔开场星",
    hiddenCustomerTitle: "慢热体验官",
    goldLine: "我们会先看您今天的肤况和舒适度，再决定适合做哪一步，不急着让您马上定项目。",
    easterEggTitle: "解锁隐藏顾客：慢热体验官",
    easterEggCopy: "她会反复确认服务边界，适合练温和但专业的开场。",
  },
  {
    id: "chunshe_day2_hydration",
    dayIndex: 2,
    title: "补水修护说明",
    focus: "把干、红、紧绷接住再解释护理",
    visibleGoal: "面对屏障不稳定或换季干燥顾客，练习先共情再给护理路径。",
    customerName: "换季干敏客",
    customerSetting: "最近脸颊干、偶尔泛红，担心护理刺激皮肤。",
    customerConcern: "我皮肤有点敏感，做完会不会更红？补水是不是只管当天？",
    passGoals: ["先询问近期护肤和敏感情况", "解释舒缓、补水、修护之间的关系", "提醒按肤况观察，不承诺一次解决"],
    forbiddenPhrases: ["绝对不过敏", "一次修好", "所有敏感都适合"],
    badgeTitle: "舒缓说明星",
    hiddenCustomerTitle: "换季敏感追问官",
    goldLine: "您现在更适合先把皮肤状态稳下来，舒服和稳定比一次做很猛更重要。",
    easterEggTitle: "解锁隐藏顾客：换季敏感追问官",
    easterEggCopy: "她会连续追问刺激和持续时间，适合练预期管理。",
  },
  {
    id: "chunshe_day3_value_close",
    dayIndex: 3,
    title: "体验后邀约",
    focus: "低压力完成复购或下次护理建议",
    visibleGoal: "练习在不压迫顾客的前提下，给出下一次护理建议和居家配合。",
    customerName: "价格犹豫客",
    customerSetting: "体验感不错，但对长期护理和价格有点犹豫。",
    customerConcern: "感觉还可以，但我想再考虑一下，后面一定要连续做吗？",
    passGoals: ["先认可顾客想考虑的节奏", "用肤况和目标解释护理周期", "给出轻量下一步建议"],
    forbiddenPhrases: ["不办没效果", "别人都买了", "今天必须决定"],
    badgeTitle: "低压邀约星",
    hiddenCustomerTitle: "预算摇摆客",
    goldLine: "您可以先按今天的肤况反馈做判断，如果想继续，我们再安排一个更轻量的护理节奏。",
    easterEggTitle: "解锁隐藏顾客：预算摇摆客",
    easterEggCopy: "她会在价格和效果之间摇摆，适合练价值解释和低压力邀约。",
  },
]

function cleanText(value: unknown, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max) : text
}

function recordFromJson(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {}
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

function countObjectKeys(value: Record<string, unknown> | null | undefined) {
  return Object.keys(value || {}).length
}

function formatStars(stars: number) {
  const n = Math.max(0, Math.min(3, Math.round(Number(stars || 0))))
  return "★★★".slice(0, n) + "☆☆☆".slice(0, 3 - n)
}

function normalizeTask(task: any): VoiceTrainingTask {
  return {
    id: cleanText(task.id, 80),
    dayIndex: Number(task.dayIndex || task.day_index || 0) || 0,
    title: cleanText(task.title, 80),
    focus: cleanText(task.focus, 120),
    visibleGoal: cleanText(task.visibleGoal || task.visible_goal || task.visibleGoalText, 220),
    customerName: cleanText(task.customerName || task.customer_name, 60),
    customerSetting: cleanText(task.customerSetting || task.customer_setting, 240),
    customerConcern: cleanText(task.customerConcern || task.customer_concern, 180),
    passGoals: Array.isArray(task.passGoals) ? task.passGoals.map((item: unknown) => cleanText(item, 100)).filter(Boolean) : [],
    forbiddenPhrases: Array.isArray(task.forbiddenPhrases)
      ? task.forbiddenPhrases.map((item: unknown) => cleanText(item, 40)).filter(Boolean)
      : [],
    badgeTitle: cleanText(task.badgeTitle || task.badge_title, 80),
    hiddenCustomerTitle: cleanText(task.hiddenCustomerTitle || task.hidden_customer_title, 80),
    goldLine: cleanText(task.goldLine || task.gold_line, 220),
    easterEggTitle: cleanText(task.easterEggTitle || task.easter_egg_title, 80),
    easterEggCopy: cleanText(task.easterEggCopy || task.easter_egg_copy, 220),
  }
}

const PACKS: VoiceTrainingPackDefinition[] = [
  {
    brandCode: BAIBAITU_BRAND_CODE,
    packId: BAIBAITU_PACK_ID,
    title: "白白兔新人训练营",
    subtitle: "7 天把品牌、项目和表达边界练进嘴里",
    version: "v1",
    rubricVersion: BAIBAITU_RUBRIC_VERSION,
    tasks: getBaibaituTrainingTasks().map(normalizeTask),
  },
  {
    brandCode: CHUNSHE_BRAND_CODE,
    packId: CHUNSHE_PACK_ID,
    title: "椿舍演示训练营",
    subtitle: "用 3 关演示日式美肌服务沟通",
    version: "v1",
    rubricVersion: CHUNSHE_RUBRIC_VERSION,
    tasks: CHUNSHE_TASKS,
  },
]

export function getVoiceTrainingPackForSpace(space: MpKnowledgeSpaceOption | null) {
  if (!space || !space.defaultPackId) return null
  return PACKS.find((pack) => pack.brandCode === space.brandCode && pack.packId === space.defaultPackId) || null
}

export function getVoiceTrainingPack(brandCode: unknown, packId: unknown) {
  const brand = cleanText(brandCode, 40)
  const pack = cleanText(packId, 80)
  return PACKS.find((item) => item.brandCode === brand && item.packId === pack) || null
}

export function findVoiceTrainingTask(pack: VoiceTrainingPackDefinition | null, taskId: unknown) {
  const id = cleanText(taskId, 80)
  if (!pack || !id) return null
  return pack.tasks.find((task) => task.id === id) || null
}

export function buildVoiceTrainingTaskLiveNotes(pack: VoiceTrainingPackDefinition, task: VoiceTrainingTask) {
  const goals = task.passGoals
    .slice(0, 3)
    .map((item, index) => `${index + 1}. ${cleanText(item, 72)}`)
    .join("\n")
  const forbidden = task.forbiddenPhrases.slice(0, 3).map((item) => cleanText(item, 24)).filter(Boolean).join("、")
  return [
    `${pack.title}任务：${cleanText(task.title, 28)}`,
    `AI 顾客：${cleanText(task.customerSetting, 84)}`,
    "本关必须考察：",
    goals,
    forbidden ? `禁说词提醒：${forbidden}` : "",
  ].filter(Boolean).join("\n").slice(0, 500)
}

export function buildVoiceTrainingTaskPreview(args: {
  pack: VoiceTrainingPackDefinition
  task: VoiceTrainingTask
  knowledgeSpace?: MpKnowledgeSpaceOption | null
}) {
  return {
    knowledge_space_id: args.knowledgeSpace?.id || "",
    knowledge_space_code: args.knowledgeSpace?.code || "",
    knowledge_space_name: args.knowledgeSpace?.displayName || "",
    brand_code: args.pack.brandCode,
    pack_id: args.pack.packId,
    pack_title: args.pack.title,
    task_id: args.task.id,
    day_index: args.task.dayIndex,
    title: args.task.title,
    focus: args.task.focus,
    visible_goal: args.task.visibleGoal,
    customer_name: args.task.customerName,
    customer_setting: args.task.customerSetting,
    customer_concern: args.task.customerConcern,
    pass_goals: args.task.passGoals.slice(0, 3),
    forbidden_phrases: args.task.forbiddenPhrases.slice(0, 3),
    badge_title: args.task.badgeTitle,
    hidden_customer_title: args.task.hiddenCustomerTitle,
    gold_line: args.task.goldLine,
    easter_egg_title: args.task.easterEggTitle,
  }
}

export function buildVoiceTrainingTaskSetup(args: {
  pack: VoiceTrainingPackDefinition
  task: VoiceTrainingTask
  knowledgeSpace?: MpKnowledgeSpaceOption | null
}) {
  const preview = buildVoiceTrainingTaskPreview(args)
  return {
    scenario_id: "objection_safety",
    customer_profile_id: "",
    scene_card_id: "",
    live_notes: buildVoiceTrainingTaskLiveNotes(args.pack, args.task),
    training_task_id: args.task.id,
    training_pack_id: args.pack.packId,
    training_brand_code: args.pack.brandCode,
    training_knowledge_space_id: args.knowledgeSpace?.id || "",
    training_context: {
      knowledge_space_id: args.knowledgeSpace?.id || "",
      knowledge_space_code: args.knowledgeSpace?.code || "",
      knowledge_space_name: args.knowledgeSpace?.displayName || "",
      brand_code: args.pack.brandCode,
      pack_id: args.pack.packId,
      pack_title: args.pack.title,
      task_id: args.task.id,
    },
    training_task_preview: preview,
  }
}

export async function ensureVoiceTrainingSeed(admin: SupabaseAdmin, pack: VoiceTrainingPackDefinition) {
  const packRow = {
    brand_code: pack.brandCode,
    pack_id: pack.packId,
    title: pack.title,
    version: pack.version,
    status: "published",
    published_at: new Date().toISOString(),
    metadata_json: {
      subtitle: pack.subtitle,
    },
  }

  const { error: packError } = await admin
    .from("voice_training_packs")
    .upsert(packRow, { onConflict: "brand_code,pack_id" })
  if (packError && !isMissingColumnOrTable(packError)) throw packError
  if (packError) return false

  const rows = pack.tasks.map((task) => ({
    id: task.id,
    brand_code: pack.brandCode,
    pack_id: pack.packId,
    day_index: task.dayIndex,
    title: task.title,
    focus: task.focus,
    visible_goal_json: [task.visibleGoal],
    customer_persona_json: {
      name: task.customerName,
      setting: task.customerSetting,
      concern: task.customerConcern,
    },
    live_notes_template: buildVoiceTrainingTaskLiveNotes(pack, task),
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
      version: pack.rubricVersion,
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

async function loadProgress(args: {
  admin: SupabaseAdmin
  pack: VoiceTrainingPackDefinition
  user: AuthUserLike
  knowledgeSpace?: MpKnowledgeSpaceOption | null
}) {
  let query = args.admin
    .from("voice_training_progress")
    .select("*")
    .eq("brand_code", args.pack.brandCode)
    .eq("pack_id", args.pack.packId)
    .eq("staff_user_id", args.user.id)

  if (args.knowledgeSpace?.id) {
    query = query.eq("knowledge_space_id", args.knowledgeSpace.id)
  }

  const result = await query.maybeSingle()
  if (result.error && isMissingColumnOrTable(result.error) && args.knowledgeSpace?.id) {
    const fallback = await args.admin
      .from("voice_training_progress")
      .select("*")
      .eq("brand_code", args.pack.brandCode)
      .eq("pack_id", args.pack.packId)
      .eq("staff_user_id", args.user.id)
      .maybeSingle()
    if (fallback.error && !isMissingColumnOrTable(fallback.error)) throw fallback.error
    return fallback.data || null
  }
  if (result.error && !isMissingColumnOrTable(result.error)) throw result.error
  return result.data || null
}

export async function loadVoiceTrainingDashboard(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
  knowledgeSpace: MpKnowledgeSpaceOption
}) {
  const pack = getVoiceTrainingPackForSpace(args.knowledgeSpace)
  if (!pack) return null

  await ensureVoiceTrainingSeed(args.admin, pack)
  const progressRow = await loadProgress({
    admin: args.admin,
    pack,
    user: args.user,
    knowledgeSpace: args.knowledgeSpace,
  })

  const progressJson = recordFromJson(progressRow?.progress_json)
  const taskResults = recordFromJson(progressJson.task_results)
  const completedIds = recordFromJson(progressJson.completed_task_ids)
  const rewardJson = recordFromJson(progressJson.rewards)

  const firstIncomplete = pack.tasks.find((task) => !completedIds[task.id]) || pack.tasks[pack.tasks.length - 1]
  const currentTaskId = firstIncomplete?.id || ""
  const tasks = pack.tasks.map((task) => {
    const result = recordFromJson(taskResults[task.id])
    const completed = Boolean(completedIds[task.id])
    const locked = !completed && task.id !== currentTaskId
    const bestStars = Math.max(0, Math.min(3, Number(result.best_stars || 0) || 0))
    return {
      ...buildVoiceTrainingTaskPreview({ pack, task, knowledgeSpace: args.knowledgeSpace }),
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
      brand_code: pack.brandCode,
      pack_id: pack.packId,
      title: pack.title,
      subtitle: pack.subtitle,
      knowledge_space_id: args.knowledgeSpace.id,
      knowledge_space_code: args.knowledgeSpace.code,
      knowledge_space_name: args.knowledgeSpace.displayName,
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
      knowledge_space_id: args.knowledgeSpace.id,
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

export async function linkVoiceTrainingSessionTask(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
  sessionId: string
  taskId: string
  pack: VoiceTrainingPackDefinition
  knowledgeSpace?: MpKnowledgeSpaceOption | null
}) {
  const task = findVoiceTrainingTask(args.pack, args.taskId)
  if (!task) return null
  await ensureVoiceTrainingSeed(args.admin, args.pack)

  const row = {
    knowledge_space_id: args.knowledgeSpace?.id || null,
    brand_code: args.pack.brandCode,
    pack_id: args.pack.packId,
    task_id: task.id,
    session_id: args.sessionId,
    staff_user_id: args.user.id,
    company_id: args.ctx.companyId,
    store_id: args.ctx.storeId,
    membership_id: args.ctx.membershipId,
    status: "active",
    started_at: new Date().toISOString(),
  }

  let result = await args.admin
    .from("voice_training_session_links")
    .upsert(row, { onConflict: "session_id" })
    .select("*")
    .single()

  if (result.error && isMissingColumnOrTable(result.error)) {
    const { knowledge_space_id, ...fallbackRow } = row
    void knowledge_space_id
    result = await args.admin
      .from("voice_training_session_links")
      .upsert(fallbackRow, { onConflict: "session_id" })
      .select("*")
      .single()
  }

  if (result.error) throw result.error
  return result.data
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

export function buildVoiceTrainingResult(args: {
  task: VoiceTrainingTask
  pack: VoiceTrainingPackDefinition
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
    rubricVersion: args.pack.rubricVersion,
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

export async function saveVoiceTrainingResult(args: {
  admin: SupabaseAdmin
  ctx: MpAccountContext
  user: AuthUserLike
  sessionId: string
  pack: VoiceTrainingPackDefinition
  knowledgeSpace?: MpKnowledgeSpaceOption | null
  task: VoiceTrainingTask
  result: ReturnType<typeof buildVoiceTrainingResult>
}) {
  const now = new Date().toISOString()
  const existingProgress = await loadProgress({
    admin: args.admin,
    pack: args.pack,
    user: args.user,
    knowledgeSpace: args.knowledgeSpace,
  })

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
      const task = findVoiceTrainingTask(args.pack, taskId)
      return task ? { id: `badge_${taskId}`, type: "徽章", title: task.badgeTitle, taskTitle: task.title } : null
    }),
    ...Object.keys(rewards.hidden_customers || {}).map((taskId) => {
      const task = findVoiceTrainingTask(args.pack, taskId)
      return task ? { id: `hidden_${taskId}`, type: "隐藏顾客", title: task.hiddenCustomerTitle, taskTitle: task.title } : null
    }),
    ...Object.keys(rewards.gold_lines || {}).map((taskId) => {
      const task = findVoiceTrainingTask(args.pack, taskId)
      return task ? { id: `gold_${taskId}`, type: "金句", title: task.goldLine, taskTitle: task.title } : null
    }),
    ...Object.keys(rewards.easter_eggs || {}).map((taskId) => {
      const task = findVoiceTrainingTask(args.pack, taskId)
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
  const nextTask = args.pack.tasks.find((task) => !completedTaskIds[task.id]) || args.pack.tasks[args.pack.tasks.length - 1]
  const starsTotal = Object.values(taskResults).reduce(
    (sum: number, item: any) => sum + (Number(item?.best_stars || 0) || 0),
    0,
  )

  const progressPayload = {
    knowledge_space_id: args.knowledgeSpace?.id || null,
    brand_code: args.pack.brandCode,
    pack_id: args.pack.packId,
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
      rubric_version: args.pack.rubricVersion,
      completed_at: now,
    })
    .eq("session_id", args.sessionId)
    .eq("staff_user_id", args.user.id)

  let progressResult = await args.admin
    .from("voice_training_progress")
    .upsert(progressPayload, { onConflict: "knowledge_space_id,pack_id,staff_user_id" })

  if (progressResult.error && isMissingColumnOrTable(progressResult.error)) {
    const { knowledge_space_id, ...fallbackPayload } = progressPayload
    void knowledge_space_id
    progressResult = await args.admin
      .from("voice_training_progress")
      .upsert(fallbackPayload, { onConflict: "brand_code,pack_id,staff_user_id" })
  }
  if (progressResult.error) throw progressResult.error

  const rewardRows = [
    args.result.passed
      ? {
          knowledge_space_id: args.knowledgeSpace?.id || null,
          brand_code: args.pack.brandCode,
          pack_id: args.pack.packId,
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
          knowledge_space_id: args.knowledgeSpace?.id || null,
          brand_code: args.pack.brandCode,
          pack_id: args.pack.packId,
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
          knowledge_space_id: args.knowledgeSpace?.id || null,
          brand_code: args.pack.brandCode,
          pack_id: args.pack.packId,
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
          knowledge_space_id: args.knowledgeSpace?.id || null,
          brand_code: args.pack.brandCode,
          pack_id: args.pack.packId,
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
    let rewardResult = await args.admin
      .from("voice_training_rewards")
      .upsert(rewardRows, { onConflict: "knowledge_space_id,pack_id,staff_user_id,task_id,reward_type" })
    if (rewardResult.error && isMissingColumnOrTable(rewardResult.error)) {
      const fallbackRows = rewardRows.map((row) => {
        const { knowledge_space_id, ...fallbackRow } = row
        void knowledge_space_id
        return fallbackRow
      })
      rewardResult = await args.admin
        .from("voice_training_rewards")
        .upsert(fallbackRows, { onConflict: "brand_code,pack_id,staff_user_id,task_id,reward_type" })
    }
    if (rewardResult.error) throw rewardResult.error
  }

  return {
    progress: progressPayload,
    rewards: rewardList,
  }
}
