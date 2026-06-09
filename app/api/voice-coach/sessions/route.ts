import { createHash, randomUUID } from "crypto"
import { after, NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateCustomerTurn } from "@/lib/voice-coach/llm.server"
import {
  buildVoiceCoachFollowupOpening,
  buildVoiceCoachFirstTurnTarget,
  buildVoiceCoachSessionSnapshot,
  getVoiceCoachSessionClientContext,
  getVoiceCoachSessionPromptContext,
  normalizeVoiceCoachFollowupContext,
  voiceCoachSessionCreateSchema,
  type VoiceCoachFollowupContext,
  type VoiceCoachSessionCreateInput,
} from "@/lib/voice-coach/session-context"
import { getScenario, type VoiceCoachEmotion, type VoiceCoachOpening } from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { normalizeScenarioTag } from "@/lib/voice-coach/tag-utils"
import {
  getTrainingTask,
  listKnowledgeSpaces,
  resolveActiveKnowledgeSpace,
  resolveTrainingPack,
} from "@/lib/voice-coach/training.server"
import { resolveMpAccountContextForUser } from "@/lib/mp/account-context.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

type RequestSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>

type SourceTurnRow = {
  id: string
  role: string
  text: string | null
  emotion?: string | null
  turn_index: number | null
}

function mapEmotionToTts(emotion?: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  void emotion
  return "neutral"
}

function fallbackFirstCustomerTurn(): VoiceCoachOpening {
  const scenario = getScenario("objection_safety")
  return scenario.firstTurnPool?.[0] || {
    text: "我先说最担心的点吧，这种护理会不会有安全隐患或者恢复期问题？",
    emotion: "worried",
    tag: "安全顾虑",
  }
}

function cleanText(value: unknown, max = 300): string {
  const text = String(value || "").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max) : text
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function mergeTrainingContext(base: unknown, extra: Record<string, unknown>): Record<string, unknown> | null {
  const merged = {
    ...normalizeObject(base),
    ...extra,
  }
  const compact = Object.entries(merged).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0
    return cleanText(value, 500) !== ""
  })
  return compact.length ? Object.fromEntries(compact) : null
}

function isMissingOrgSnapshotColumn(error: any) {
  const message = String(error?.message || "").toLowerCase()
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("company_id") ||
    message.includes("store_id") ||
    message.includes("membership_id") ||
    message.includes("schema cache")
  )
}

function toStringList(value: unknown, max = 6): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，、；;]+/) : []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of source) {
    const text = cleanText(item, 100)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= max) break
  }
  return result
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function pickReportFocusDimension(report: any) {
  const preferred = ["persuasion", "organization", "expression", "fluency"]
  const dims = Array.isArray(report?.dimension) ? report.dimension : []
  const candidates = dims
    .filter((item: any) => preferred.includes(String(item?.id || "")))
    .map((item: any) => ({
      id: cleanText(item?.id, 40),
      name: cleanText(item?.name, 40),
      score: numberOrNull(item?.score) ?? 0,
    }))
  candidates.sort((left: any, right: any) => left.score - right.score)
  return candidates[0] || { id: "persuasion", name: "说服力", score: 0 }
}

function normalizeSourceReferenceTurn(turn: SourceTurnRow): VoiceCoachFollowupContext["reference_turns"][number] | null {
  const role = turn.role === "beautician" ? "beautician" : turn.role === "customer" ? "customer" : null
  const text = cleanText(turn.text, 120)
  if (!role || !text) return null
  const turnIndex = Number(turn.turn_index)
  return {
    role,
    turn_id: cleanText(turn.id, 80),
    ...(Number.isFinite(turnIndex) ? { turn_index: turnIndex } : {}),
    text,
  }
}

function appendReferenceTurn(
  target: VoiceCoachFollowupContext["reference_turns"],
  turn: VoiceCoachFollowupContext["reference_turns"][number] | null,
) {
  if (!turn || !turn.text) return
  const key = `${turn.role}:${turn.text}`
  if (target.some((item) => `${item.role}:${item.text}` === key)) return
  target.push(turn)
}

function buildSourceReferenceTurns(report: any, turns: SourceTurnRow[]): VoiceCoachFollowupContext["reference_turns"] {
  const references: VoiceCoachFollowupContext["reference_turns"] = []
  const objection = cleanText(report?.tabs?.persuasion?.customer_objection, 120)
  const response = cleanText(report?.tabs?.persuasion?.your_response, 120)
  if (objection) appendReferenceTurn(references, { role: "customer", text: objection })
  if (response) appendReferenceTurn(references, { role: "beautician", text: response })

  const representativeId = cleanText(report?.meta?.representative_turn_id, 80)
  const representativeBeautician = representativeId
    ? turns.find((turn) => String(turn.id || "") === representativeId && turn.role === "beautician")
    : null
  if (representativeBeautician) {
    const customerBefore = turns
      .filter((turn) => turn.role === "customer" && Number(turn.turn_index || 0) < Number(representativeBeautician.turn_index || 0))
      .sort((left, right) => Number(right.turn_index || 0) - Number(left.turn_index || 0))[0]
    appendReferenceTurn(references, customerBefore ? normalizeSourceReferenceTurn(customerBefore) : null)
    appendReferenceTurn(references, normalizeSourceReferenceTurn(representativeBeautician))
  }

  const recentTurns = turns
    .slice()
    .sort((left, right) => Number(right.turn_index || 0) - Number(left.turn_index || 0))
    .filter((turn) => cleanText(turn.text, 120))
    .slice(0, 6)
    .reverse()
  for (const turn of recentTurns) {
    appendReferenceTurn(references, normalizeSourceReferenceTurn(turn))
    if (references.length >= 6) break
  }

  return references.slice(0, 6)
}

function buildFallbackFollowupContext(sourceSessionId: string, report: any, turns: SourceTurnRow[]): VoiceCoachFollowupContext {
  const nextRoundFocus = report?.next_round_focus || {}
  const focusDimension = nextRoundFocus.focus_dimension_id ? nextRoundFocus : pickReportFocusDimension(report)
  const trainingContext = report?.training_context || {}
  const summaryBlocks = toStringList(nextRoundFocus.summary_blocks || report?.summary_blocks, 3)
  const missedPoints = toStringList(nextRoundFocus.missed_points || trainingContext.missed_points, 4)
  const riskPoints = toStringList(nextRoundFocus.risk_points || trainingContext.risk_points, 3)
  const practicePoints = toStringList(
    [
      ...(Array.isArray(nextRoundFocus.practice_points) ? nextRoundFocus.practice_points : []),
      ...missedPoints,
      ...riskPoints,
      cleanText(summaryBlocks.find((item) => /^下一轮[：:]/.test(item))?.replace(/^下一轮[：:]\s*/, ""), 100),
    ],
    5,
  )
  const focusDimensionName =
    cleanText(nextRoundFocus.focus_dimension_name, 40) || cleanText(focusDimension.name, 40) || "说服力"
  const instruction =
    cleanText(nextRoundFocus.instruction, 220) ||
    cleanText(summaryBlocks.find((item) => /^下一轮[：:]/.test(item)), 220) ||
    `第二轮优先训练${focusDimensionName}，让顾客继续追问具体证据和下一步。`

  return normalizeVoiceCoachFollowupContext({
    source_session_id: sourceSessionId,
    source_report_generated_at: cleanText(report?.meta?.generated_at, 40),
    focus_dimension_id: cleanText(nextRoundFocus.focus_dimension_id || focusDimension.id, 40),
    focus_dimension_name: focusDimensionName,
    focus_score: numberOrNull(nextRoundFocus.focus_score) ?? numberOrNull(focusDimension.score),
    title: cleanText(nextRoundFocus.title, 80) || `下一轮先练：${missedPoints[0] || focusDimensionName}`,
    instruction,
    practice_points: practicePoints.length ? practicePoints : [instruction],
    missed_points: missedPoints,
    risk_points: riskPoints,
    summary_blocks: summaryBlocks,
    reference_turns: buildSourceReferenceTurns(report, turns),
    customer_objection: cleanText(report?.tabs?.persuasion?.customer_objection, 120),
    your_response: cleanText(report?.tabs?.persuasion?.your_response, 120),
    suggested_response: cleanText(nextRoundFocus.suggested_response || report?.tabs?.persuasion?.improved_response, 180),
  }) as VoiceCoachFollowupContext
}

async function loadFollowupContext(args: {
  supabase: RequestSupabaseClient
  userId: string
  sourceSessionId?: string | null
}): Promise<{ ok: true; context: VoiceCoachFollowupContext | null } | { ok: false; response: NextResponse }> {
  const sourceSessionId = cleanText(args.sourceSessionId, 80)
  if (!sourceSessionId) return { ok: true, context: null }

  const { data: sourceSession, error: sourceSessionError } = await args.supabase
    .from("voice_coach_sessions")
    .select("id, user_id, report_json")
    .eq("id", sourceSessionId)
    .eq("user_id", args.userId)
    .maybeSingle()

  if (sourceSessionError || !sourceSession) {
    return { ok: false, response: jsonError(400, "source_session_not_found") }
  }

  const report = sourceSession.report_json
  if (!report || typeof report !== "object") {
    return { ok: false, response: jsonError(400, "source_report_not_found") }
  }

  const { data: turns, error: turnsError } = await args.supabase
    .from("voice_coach_turns")
    .select("id, role, text, emotion, turn_index")
    .eq("session_id", sourceSessionId)
    .order("turn_index", { ascending: true })

  if (turnsError) {
    return { ok: false, response: jsonError(500, "source_turns_query_failed", { message: turnsError.message }) }
  }

  return {
    ok: true,
    context: buildFallbackFollowupContext(sourceSessionId, report, (turns || []) as SourceTurnRow[]),
  }
}

async function resolveTrainingContextForSession(args: {
  supabase: RequestSupabaseClient
  accountContext: Awaited<ReturnType<typeof resolveMpAccountContextForUser>> | null
  parsedData: VoiceCoachSessionCreateInput
}): Promise<Record<string, unknown> | null> {
  const payloadContext = normalizeObject(args.parsedData.training_context)
  const preview = normalizeObject(args.parsedData.training_task_preview)
  const requestedTaskId = cleanText(
    args.parsedData.training_task_id || payloadContext.task_id || payloadContext.training_task_id,
    160,
  )
  const requestedPackId = cleanText(
    args.parsedData.training_pack_id || payloadContext.pack_id || payloadContext.training_pack_id,
    160,
  )
  const requestedKnowledgeSpaceId = cleanText(
    args.parsedData.training_knowledge_space_id ||
      payloadContext.knowledge_space_id ||
      payloadContext.training_knowledge_space_id,
    160,
  )
  const requestedMode = cleanText(payloadContext.training_pack_mode || payloadContext.trainingPackMode, 80)

  let serverContext: Record<string, unknown> = {}
  if (requestedTaskId || requestedKnowledgeSpaceId || requestedMode) {
    try {
      const spaces = await listKnowledgeSpaces({
        supabase: args.supabase,
        ctx: args.accountContext,
        activeKnowledgeSpaceId: requestedKnowledgeSpaceId,
      })
      const space = resolveActiveKnowledgeSpace(spaces, requestedKnowledgeSpaceId, requestedMode)
      if (space) {
        const pack = await resolveTrainingPack({ supabase: args.supabase, space })
        const task = pack ? getTrainingTask(pack, requestedTaskId) : null
        serverContext = mergeTrainingContext(task?.training_context || null, {
          task_id: task?.task_id || requestedTaskId,
          pack_id: pack?.pack_id || requestedPackId,
          brand_code: pack?.brand_code || args.parsedData.training_brand_code || "",
          knowledge_space_id: space.id || requestedKnowledgeSpaceId,
          knowledge_space_name: space.display_name || "",
          pack_title: pack?.title || "",
          training_pack_mode: pack?.training_pack_mode || requestedMode,
          title: task?.title || preview.title || "",
          focus: task?.focus || preview.focus || "",
          customer_line: task?.customer_line || preview.customer_line || "",
        }) || {}
      }
    } catch {
      serverContext = {}
    }
  }

  return mergeTrainingContext(serverContext, {
    ...payloadContext,
    task_id: requestedTaskId || payloadContext.task_id || payloadContext.training_task_id || "",
    pack_id: requestedPackId || payloadContext.pack_id || payloadContext.training_pack_id || "",
    brand_code: args.parsedData.training_brand_code || payloadContext.brand_code || payloadContext.training_brand_code || "",
    knowledge_space_id: requestedKnowledgeSpaceId || payloadContext.knowledge_space_id || payloadContext.training_knowledge_space_id || "",
    title: payloadContext.title || payloadContext.task_title || preview.title || "",
    focus: payloadContext.focus || preview.focus || "",
    customer_line: payloadContext.customer_line || payloadContext.customerLine || preview.customer_line || "",
  })
}

function parseHistoryLimit(value: string | null) {
  const n = Number(value || 8)
  if (!Number.isFinite(n)) return 8
  return Math.max(1, Math.min(30, Math.round(n)))
}

function roundedScore(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function pickNextLine(report: any) {
  const lines = Array.isArray(report?.summary_blocks) ? report.summary_blocks : []
  const nextLine = lines
    .map((item: unknown) => cleanText(item, 160))
    .find((text: string) => /^下一轮[：:]/.test(text))
  return nextLine ? nextLine.replace(/^下一轮[：:]\s*/, "") : ""
}

function buildSessionHistoryItem(row: any) {
  const scenario = getScenario(row.scenario_id)
  const context = getVoiceCoachSessionClientContext({
    snapshot: row.scenario_snapshot_json,
    customerProfileId: row.customer_profile_id,
    sceneCardId: row.scene_card_id,
    sessionContext: row.session_context_json,
  })
  const report = row.report_json && typeof row.report_json === "object" ? row.report_json : null
  const score = roundedScore(row.total_score ?? report?.total_score)
  const focus = report?.next_round_focus || null
  const fallbackFocus = report ? pickReportFocusDimension(report) : null
  const focusTitle =
    cleanText(focus?.title, 80) ||
    (fallbackFocus?.name ? `下一轮先练：${fallbackFocus.name}` : "")
  const focusCopy =
    cleanText(focus?.instruction, 140) ||
    cleanText(pickNextLine(report), 140) ||
    cleanText(report?.summary_blocks?.[0], 140)
  const customerName = cleanText(context.customer_name, 40)
  const serviceName = cleanText(context.service_name, 60)
  const sceneName = cleanText(context.scene_name, 60)
  const title = sceneName || serviceName || scenario.name || "话术训练"
  const subtitle = [customerName, serviceName && serviceName !== title ? serviceName : ""].filter(Boolean).join(" · ")
  const status = cleanText(row.status, 20) || "active"
  const completed = status === "ended" || Boolean(report)

  return {
    id: row.id,
    status,
    status_label: completed ? "已完成" : "训练中",
    started_at: row.started_at || row.created_at || "",
    ended_at: row.ended_at || "",
    title,
    subtitle: subtitle || cleanText(context.customer_summary, 80) || scenario.goal || "",
    customer_name: customerName,
    scene_name: sceneName,
    service_name: serviceName,
    scene_kind_label: cleanText(context.scene_kind_label, 40),
    score,
    score_label: score === null ? "" : `${score}分`,
    focus_title: focusTitle,
    focus_copy: focusCopy,
    is_followup: Boolean(context.followup_context),
    can_view_report: completed,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const limit = parseHistoryLimit(new URL(request.url).searchParams.get("limit"))
    const { data, error } = await supabase
      .from("voice_coach_sessions")
      .select(
        "id, scenario_id, status, started_at, ended_at, created_at, total_score, report_json, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
      )
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(limit)

    if (error) {
      return jsonError(500, "sessions_query_failed", { message: error.message })
    }

    return NextResponse.json({
      sessions: (data || []).map(buildSessionHistoryItem),
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}

function getPresetFirstTurnPool(scenarioId: string | undefined | null): VoiceCoachOpening[] {
  const scenario = getScenario(scenarioId)
  return Array.isArray(scenario.firstTurnPool) ? scenario.firstTurnPool : []
}

function quickHash(input: string): number {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function pickPresetFirstTurn(
  scenarioId: string | undefined | null,
  ordinal?: number | null,
  stableSeed?: string,
): VoiceCoachOpening {
  const scenario = getScenario(scenarioId)
  const pool = getPresetFirstTurnPool(scenario.id)
  if (!pool.length) return fallbackFirstCustomerTurn()

  const normalizedOrdinal = Number(ordinal)
  const seedHash = quickHash(String(stableSeed || scenario.id || "voice-coach"))
  const baseIndex =
    Number.isFinite(normalizedOrdinal) && normalizedOrdinal >= 0 ? normalizedOrdinal : 0
  const index = (baseIndex + seedHash) % pool.length

  return pool[index] || fallbackFirstCustomerTurn()
}

function pickPresetFirstTurnAvoidRepeat(
  scenarioId: string | undefined | null,
  previousText?: string | null,
  ordinal?: number | null,
  stableSeed?: string,
): VoiceCoachOpening {
  const scenario = getScenario(scenarioId)
  const pool = getPresetFirstTurnPool(scenario.id)
  if (!pool.length) return fallbackFirstCustomerTurn()

  const normalizedPreviousText = String(previousText || "").trim()
  if (normalizedPreviousText) {
    const previousIndex = pool.findIndex((item) => String(item.text || "").trim() === normalizedPreviousText)
    if (previousIndex >= 0) {
      return pool[(previousIndex + 1) % pool.length] || fallbackFirstCustomerTurn()
    }
  }

  return pickPresetFirstTurn(scenario.id, ordinal, stableSeed)
}

function shouldUseLlmForFirstTurn(): boolean {
  const raw = String(process.env.VOICE_COACH_FIRST_TURN_MODE || "preset")
    .trim()
    .toLowerCase()
  return raw === "llm"
}

function shouldGenerateFirstTurnTtsSynchronously(scenarioId?: string | null): boolean {
  if (getPresetFirstTurnPool(scenarioId).length) return false

  const raw = String(process.env.VOICE_COACH_FIRST_TTS_MODE || "async")
    .trim()
    .toLowerCase()
  return raw === "sync"
}

function getSeedOpeningAudioPath(scenarioId: string): string {
  const fromEnv = (process.env.VOICE_COACH_SEED_OPENING_AUDIO_PATH || "").trim()
  if (fromEnv) return fromEnv
  if (getPresetFirstTurnPool(scenarioId).length) return ""
  if (scenarioId === "objection_safety") return "seed/opening/objection_safety_v1.mp3"
  return ""
}

function getSeedOpeningAudioSeconds(): number | null {
  const n = Number(process.env.VOICE_COACH_SEED_OPENING_SECONDS || 3)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

async function trySignSeedAudio(path: string): Promise<string | null> {
  if (!path) return null
  try {
    return await signVoiceCoachAudio(path)
  } catch {
    return null
  }
}

function getGeneratedOpeningAudioPath(scenarioId: string, text: string): string {
  const normalizedScenarioId = String(scenarioId || "voice-coach").trim() || "voice-coach"
  const normalizedText = String(text || "").trim()
  if (!normalizedText) return ""

  const key = createHash("sha1")
    .update(`${normalizedScenarioId}:${normalizedText}`)
    .digest("hex")
    .slice(0, 16)

  return `seed/opening/generated/${normalizedScenarioId}_${key}.mp3`
}

async function warmFirstTurnTts(params: {
  supabase: RequestSupabaseClient
  userId: string
  sessionId: string
  turnId: string
  sharedAudioPath: string
  text: string
  emotion: VoiceCoachEmotion
}) {
  const { supabase, userId, sessionId, turnId, sharedAudioPath, text, emotion } = params
  if (!text) return

  try {
    const { data: existingTurn } = await supabase
      .from("voice_coach_turns")
      .select("audio_path")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .maybeSingle()

    if (existingTurn?.audio_path) return

    const tts = await doubaoTts({
      text,
      emotion: mapEmotionToTts(emotion),
      uid: userId,
    })

    if (!tts.audio) return

    const audioPath = sharedAudioPath || `${userId}/${sessionId}/${turnId}.mp3`
    await uploadVoiceCoachAudio({
      path: audioPath,
      data: tts.audio,
      contentType: "audio/mpeg",
    })

    const { data: refreshedTurn } = await supabase
      .from("voice_coach_turns")
      .select("audio_path")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .maybeSingle()

    if (refreshedTurn?.audio_path) return

    await supabase
      .from("voice_coach_turns")
      .update({
        audio_path: audioPath,
        audio_seconds: tts.durationSeconds ?? null,
        status: "audio_ready",
      })
      .eq("id", turnId)
      .eq("session_id", sessionId)
  } catch {
    // Best-effort warmup only. The client /tts path remains the source of truth.
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = voiceCoachSessionCreateSchema.safeParse(body || {})
    if (!parsed.success) {
      return jsonError(400, "invalid_payload", { details: parsed.error.issues })
    }

    const scenarioId =
      typeof parsed.data.scenario_id === "string" && parsed.data.scenario_id.trim()
        ? parsed.data.scenario_id.trim()
        : null
    const scenario = getScenario(scenarioId)

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const accountContext = await resolveMpAccountContextForUser({
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
    }).catch(() => null)

    const liveNotes = String(parsed.data.live_notes || "").trim()
    const [customerProfileResult, sceneCardResult] = await Promise.all([
      parsed.data.customer_profile_id
        ? supabase
            .from("voice_coach_customer_profiles")
            .select("*")
            .eq("id", parsed.data.customer_profile_id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      parsed.data.scene_card_id
        ? supabase
            .from("voice_coach_scene_cards")
            .select("*")
            .eq("id", parsed.data.scene_card_id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (parsed.data.customer_profile_id && (customerProfileResult.error || !customerProfileResult.data)) {
      return jsonError(400, "customer_profile_not_found")
    }

    if (parsed.data.scene_card_id && (sceneCardResult.error || !sceneCardResult.data)) {
      return jsonError(400, "scene_card_not_found")
    }

    const followupContextResult = await loadFollowupContext({
      supabase,
      userId: user.id,
      sourceSessionId: parsed.data.followup_context?.source_session_id || null,
    })
    if (!followupContextResult.ok) return followupContextResult.response
    const followupContext = followupContextResult.context
    const trainingContext = await resolveTrainingContextForSession({
      supabase,
      accountContext,
      parsedData: parsed.data,
    })

    const sessionSnapshot =
      customerProfileResult.data || sceneCardResult.data || liveNotes || followupContext || trainingContext
        ? buildVoiceCoachSessionSnapshot({
            customerProfile: customerProfileResult.data || null,
            sceneCard: sceneCardResult.data || null,
            liveNotes,
            followupContext,
            trainingContext,
          })
        : null
    const sessionContext = sessionSnapshot
      ? {
          live_notes: sessionSnapshot.live_notes,
          followup_context: sessionSnapshot.followup_context,
          training_context: sessionSnapshot.training_context,
          training_task_id: sessionSnapshot.training_context?.task_id || null,
          training_pack_id: sessionSnapshot.training_context?.pack_id || null,
          training_knowledge_space_id: sessionSnapshot.training_context?.knowledge_space_id || null,
        }
      : null
    const sessionContextText = getVoiceCoachSessionPromptContext(sessionSnapshot)

    const sessionInsertPayload = {
      user_id: user.id,
      scenario_id: scenario.id,
      status: "active",
      customer_profile_id: customerProfileResult.data?.id || null,
      scene_card_id: sceneCardResult.data?.id || null,
      session_context_json: sessionContext,
      scenario_snapshot_json: sessionSnapshot,
      company_id: accountContext?.companyId || null,
      store_id: accountContext?.storeId || null,
      membership_id: accountContext?.membershipId || null,
    }

    let { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .insert(sessionInsertPayload)
      .select(
        "id, scenario_id, status, started_at, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
      )
      .single()

    if (sessionError && isMissingOrgSnapshotColumn(sessionError)) {
      const { company_id, store_id, membership_id, ...fallbackPayload } = sessionInsertPayload
      void company_id
      void store_id
      void membership_id
      const fallbackResult = await supabase
        .from("voice_coach_sessions")
        .insert(fallbackPayload)
        .select(
          "id, scenario_id, status, started_at, customer_profile_id, scene_card_id, session_context_json, scenario_snapshot_json",
        )
        .single()
      session = fallbackResult.data
      sessionError = fallbackResult.error
    }

    if (sessionError || !session) {
      return jsonError(500, "create_session_failed", { message: sessionError?.message })
    }

    const { count: scenarioSessionCount } = await supabase
      .from("voice_coach_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("scenario_id", scenario.id)

    const firstTurnOrdinal = Math.max(0, Number(scenarioSessionCount || 1) - 1)
    let previousOpeningText = ""

    const { data: previousSession } = await supabase
      .from("voice_coach_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("scenario_id", scenario.id)
      .neq("id", session.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (previousSession?.id) {
      const { data: previousOpeningTurn } = await supabase
        .from("voice_coach_turns")
        .select("text")
        .eq("session_id", previousSession.id)
        .eq("role", "customer")
        .eq("turn_index", 0)
        .maybeSingle()
      previousOpeningText = String(previousOpeningTurn?.text || "").trim()
    }

    let first = pickPresetFirstTurnAvoidRepeat(
      scenario.id,
      previousOpeningText,
      firstTurnOrdinal,
      session.id,
    )

    if (sessionContextText || shouldUseLlmForFirstTurn()) {
      try {
        first = await llmGenerateCustomerTurn({
          scenario,
          history: [],
          target: sessionContextText
            ? buildVoiceCoachFirstTurnTarget(sessionSnapshot, session.id)
            : "提出对安全性的担忧并追问是否安全",
          sessionContextText: sessionContextText || undefined,
          variationSeed: session.id,
        })
      } catch {
        const followupOpening = buildVoiceCoachFollowupOpening(sessionSnapshot)
        first = followupOpening
          ? {
              text: followupOpening,
              emotion: "skeptical",
              tag: normalizeScenarioTag(followupContext?.focus_dimension_name || followupContext?.title || "复练重点", scenario),
            }
          : pickPresetFirstTurnAvoidRepeat(
              scenario.id,
              previousOpeningText,
              firstTurnOrdinal,
              session.id,
            )
      }
    }

    const turnId = randomUUID()

    let audioPath: string | null = null
    let audioUrl: string | null = null
    let audioSeconds: number | null = getSeedOpeningAudioSeconds()
    let ttsFailed = false
    let audioSource: "seed" | "tts" | "none" = "none"

    const seedAudioPath = getSeedOpeningAudioPath(scenario.id)
    const generatedOpeningAudioPath = getGeneratedOpeningAudioPath(scenario.id, first.text)

    if (seedAudioPath) {
      const signed = await trySignSeedAudio(seedAudioPath)
      if (signed) {
        audioPath = seedAudioPath
        audioUrl = signed
        audioSource = "seed"
      }
    }

    if (!audioUrl && generatedOpeningAudioPath) {
      const signed = await trySignSeedAudio(generatedOpeningAudioPath)
      if (signed) {
        audioPath = generatedOpeningAudioPath
        audioUrl = signed
        audioSource = "tts"
      }
    }

    if (!audioUrl && shouldGenerateFirstTurnTtsSynchronously(scenario.id)) {
      try {
        const tts = await doubaoTts({
          text: first.text,
          emotion: mapEmotionToTts(first.emotion),
          uid: user.id,
        })
        audioSeconds = tts.durationSeconds ?? null
        if (tts.audio) {
          audioPath = `${user.id}/${session.id}/${turnId}.mp3`
          await uploadVoiceCoachAudio({
            path: audioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          audioUrl = await signVoiceCoachAudio(audioPath)
          audioSource = "tts"
        } else {
          ttsFailed = true
        }
      } catch {
        audioPath = null
        audioUrl = null
        audioSeconds = null
        ttsFailed = true
      }
    }

    if (!audioUrl) {
      audioSeconds = null
    }

    const { error: turnError } = await supabase.from("voice_coach_turns").insert({
      id: turnId,
      session_id: session.id,
      turn_index: 0,
      role: "customer",
      text: first.text,
      emotion: first.emotion,
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      status: audioUrl ? "audio_ready" : "text_ready",
      features_json: { tag: normalizeScenarioTag(first.tag, scenario) },
    })

    if (turnError) {
      return jsonError(500, "create_turn_failed", { message: turnError.message })
    }

    if (!audioUrl && first.text && !ttsFailed) {
      const warmPromise = warmFirstTurnTts({
        supabase,
        userId: user.id,
        sessionId: session.id,
        turnId,
        sharedAudioPath: generatedOpeningAudioPath,
        text: first.text,
        emotion: first.emotion,
      })
      after(async () => {
        await warmPromise
      })
    }

    return NextResponse.json({
      session_id: session.id,
      scenario: {
        id: scenario.id,
        name: scenario.name,
        goal: scenario.goal,
        seedTopics: scenario.seedTopics,
      },
      session_context: getVoiceCoachSessionClientContext({
        snapshot: session.scenario_snapshot_json,
        customerProfileId: session.customer_profile_id,
        sceneCardId: session.scene_card_id,
        sessionContext: session.session_context_json,
      }),
      first_customer_turn: {
        turn_id: turnId,
        turn_index: 0,
        text: first.text,
        emotion: first.emotion,
        audio_url: audioUrl,
        audio_seconds: audioSeconds,
        tts_failed: ttsFailed,
        tts_pending: !audioUrl,
        audio_source: audioSource,
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
