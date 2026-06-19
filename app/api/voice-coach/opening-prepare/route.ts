import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateCustomerTurn } from "@/lib/voice-coach/llm.server"
import {
  findOpeningPreparationByIdempotency,
  getGeneratedOpeningAudioPath,
  hashVoiceCoachOpeningValue,
  isOpeningPreparationUnavailableError,
  signPreparedOpening,
  upsertOpeningPreparation,
} from "@/lib/voice-coach/opening-preparation.server"
import {
  buildVoiceCoachFirstTurnTarget,
  buildVoiceCoachFollowupOpening,
  buildVoiceCoachSessionSnapshot,
  normalizeVoiceCoachFollowupContext,
  voiceCoachSessionCreateSchema,
  type VoiceCoachFollowupContext,
} from "@/lib/voice-coach/session-context"
import { getScenario, type VoiceCoachEmotion, type VoiceCoachOpening } from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { normalizeScenarioTag } from "@/lib/voice-coach/tag-utils"
import { resolveVoiceCoachTrainingContextForSession } from "@/lib/voice-coach/training-context.server"
import { resolveMpAccountContextForUser } from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const openingPrepareSchema = voiceCoachSessionCreateSchema.extend({
  idempotency_key: z.string().trim().min(8).max(160),
  source_type: z.string().trim().max(60).optional().nullable(),
})

type RequestSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>

type SourceTurnRow = {
  id: string
  role: string
  text: string | null
  turn_index: number | null
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function cleanText(value: unknown, max = 300): string {
  const text = String(value || "").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max) : text
}

function fallbackFirstCustomerTurn(): VoiceCoachOpening {
  const scenario = getScenario("objection_safety")
  return scenario.firstTurnPool?.[0] || {
    text: "我先说最担心的点吧，这种护理会不会有安全隐患或者恢复期问题？",
    emotion: "worried",
    tag: "安全顾虑",
  }
}

function quickHash(input: string): number {
  const text = String(input || "")
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 131 + text.charCodeAt(i)) >>> 0
  }
  return hash
}

function pickPresetFirstTurn(scenarioId: string | undefined | null, stableSeed?: string): VoiceCoachOpening {
  const scenario = getScenario(scenarioId)
  const pool = Array.isArray(scenario.firstTurnPool) ? scenario.firstTurnPool : []
  if (!pool.length) return fallbackFirstCustomerTurn()
  return pool[quickHash(`${scenario.id}:${stableSeed || ""}`) % pool.length] || fallbackFirstCustomerTurn()
}

function shouldUseLlmForPreparedOpening(sessionContextText: string): boolean {
  if (sessionContextText) return true
  const raw = String(process.env.VOICE_COACH_FIRST_TURN_MODE || "preset")
    .trim()
    .toLowerCase()
  return raw === "llm"
}

function mapEmotionToTts(_emotion?: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  return "neutral"
}

async function trySignVoiceCoachAudio(path: string): Promise<string | null> {
  if (!path) return null
  try {
    return await signVoiceCoachAudio(path)
  } catch {
    return null
  }
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toStringList(value: unknown, max = 6): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，、；;]+/) : []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of source) {
    const text = cleanText(item, 120)
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (result.length >= max) break
  }
  return result
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

function buildPrepareFollowupContext(sourceSessionId: string, report: any, turns: SourceTurnRow[]) {
  const nextRoundFocus = report?.next_round_focus || {}
  const summaryBlocks = toStringList(nextRoundFocus.summary_blocks || report?.summary_blocks, 3)
  const missedPoints = toStringList(nextRoundFocus.missed_points || report?.training_context?.missed_points, 4)
  const riskPoints = toStringList(nextRoundFocus.risk_points || report?.training_context?.risk_points, 3)
  const practicePoints = toStringList(
    [
      ...(Array.isArray(nextRoundFocus.practice_points) ? nextRoundFocus.practice_points : []),
      ...missedPoints,
      ...riskPoints,
      cleanText(summaryBlocks.find((item) => /^下一轮[：:]/.test(item))?.replace(/^下一轮[：:]\s*/, ""), 100),
    ],
    5,
  )
  const focusDimensionName = cleanText(nextRoundFocus.focus_dimension_name, 40) || "说服力"
  const instruction =
    cleanText(nextRoundFocus.instruction, 220) ||
    cleanText(summaryBlocks.find((item) => /^下一轮[：:]/.test(item)), 220) ||
    `第二轮优先训练${focusDimensionName}，让顾客继续追问具体证据和下一步。`
  const referenceTurns = turns
    .slice()
    .sort((left, right) => Number(left.turn_index || 0) - Number(right.turn_index || 0))
    .map(normalizeSourceReferenceTurn)
    .filter((item): item is VoiceCoachFollowupContext["reference_turns"][number] => Boolean(item))
    .slice(-6)

  return normalizeVoiceCoachFollowupContext({
    source_session_id: sourceSessionId,
    source_report_generated_at: cleanText(report?.meta?.generated_at, 40),
    focus_dimension_id: cleanText(nextRoundFocus.focus_dimension_id, 40),
    focus_dimension_name: focusDimensionName,
    focus_score: numberOrNull(nextRoundFocus.focus_score),
    title: cleanText(nextRoundFocus.title, 80) || `下一轮先练：${missedPoints[0] || focusDimensionName}`,
    instruction,
    practice_points: practicePoints.length ? practicePoints : [instruction],
    missed_points: missedPoints,
    risk_points: riskPoints,
    summary_blocks: summaryBlocks,
    reference_turns: referenceTurns,
    customer_objection: cleanText(report?.tabs?.persuasion?.customer_objection, 120),
    your_response: cleanText(report?.tabs?.persuasion?.your_response, 120),
    suggested_response: cleanText(nextRoundFocus.suggested_response || report?.tabs?.persuasion?.improved_response, 180),
  })
}

async function loadPrepareFollowupContext(args: {
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

  if (sourceSessionError || !sourceSession) return { ok: false, response: jsonError(400, "source_session_not_found") }
  if (!sourceSession.report_json || typeof sourceSession.report_json !== "object") {
    return { ok: false, response: jsonError(400, "source_report_not_found") }
  }

  const { data: turns, error: turnsError } = await args.supabase
    .from("voice_coach_turns")
    .select("id, role, text, turn_index")
    .eq("session_id", sourceSessionId)
    .order("turn_index", { ascending: true })

  if (turnsError) return { ok: false, response: jsonError(500, "source_turns_query_failed", { message: turnsError.message }) }

  return {
    ok: true,
    context: buildPrepareFollowupContext(sourceSessionId, sourceSession.report_json, (turns || []) as SourceTurnRow[]),
  }
}

function buildBlockedResponse(errorCode: string, message?: string) {
  return NextResponse.json({
    preparation_id: "",
    status: "blocked",
    ready: false,
    already_ready: false,
    error_code: errorCode,
    message: message || "",
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = openingPrepareSchema.safeParse(body || {})
    if (!parsed.success) return jsonError(400, "invalid_payload", { details: parsed.error.issues })

    const scenarioId = cleanText(parsed.data.scenario_id, 60) || "objection_safety"
    const scenario = getScenario(scenarioId)
    const idempotencyKey = cleanText(parsed.data.idempotency_key, 160)

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const openingPreparationAdmin = createAdminSupabaseClient()

    try {
      const existing = await findOpeningPreparationByIdempotency({
        supabase: openingPreparationAdmin,
        userId: user.id,
        idempotencyKey,
      })
      if (existing) {
        const prepared = await signPreparedOpening(existing)
        if (prepared) {
          return NextResponse.json({
            preparation_id: existing.id,
            status: existing.status,
            ready: Boolean(prepared.audio_url),
            already_ready: true,
            opening_line: {
              text: prepared.text,
              emotion: prepared.emotion,
              tag: prepared.tag,
            },
            audio_url: prepared.audio_url,
            audio_seconds: prepared.audio_seconds,
            expires_at: existing.expires_at || null,
            audio_source: prepared.audio_source,
          })
        }
      }
    } catch (error: any) {
      if (isOpeningPreparationUnavailableError(error)) {
        return buildBlockedResponse("opening_preparation_table_unavailable", error?.message)
      }
      throw error
    }

    const accountContext = await resolveMpAccountContextForUser({
      userId: user.id,
      userEmail: user.email ?? null,
      userMetadata: (user.user_metadata || {}) as Record<string, unknown>,
    }).catch(() => null)

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

    const followupContextResult = await loadPrepareFollowupContext({
      supabase,
      userId: user.id,
      sourceSessionId: parsed.data.followup_context?.source_session_id || null,
    })
    if (!followupContextResult.ok) return followupContextResult.response

    const trainingContext = await resolveVoiceCoachTrainingContextForSession({
      supabase,
      accountContext,
      parsedData: parsed.data,
    })
    const liveNotes = cleanText(parsed.data.live_notes, 500)
    const sessionSnapshot =
      customerProfileResult.data || sceneCardResult.data || liveNotes || followupContextResult.context || trainingContext
        ? buildVoiceCoachSessionSnapshot({
            customerProfile: customerProfileResult.data || null,
            sceneCard: sceneCardResult.data || null,
            liveNotes,
            followupContext: followupContextResult.context,
            trainingContext,
          })
        : null
    const sessionContextText = sessionSnapshot ? sessionSnapshot.prompt_context_text || "" : ""
    let first = pickPresetFirstTurn(scenario.id, idempotencyKey)

    if (shouldUseLlmForPreparedOpening(sessionContextText)) {
      try {
        first = await llmGenerateCustomerTurn({
          scenario,
          history: [],
          target: sessionContextText
            ? buildVoiceCoachFirstTurnTarget(sessionSnapshot, idempotencyKey)
            : "提出对安全性的担忧并追问是否安全",
          sessionContextText: sessionContextText || undefined,
          variationSeed: idempotencyKey,
        })
      } catch {
        const followupOpening = buildVoiceCoachFollowupOpening(sessionSnapshot)
        first = followupOpening
          ? {
              text: followupOpening,
              emotion: "skeptical",
              tag: normalizeScenarioTag(
                followupContextResult.context?.focus_dimension_name || followupContextResult.context?.title || "复练重点",
                scenario,
              ),
            }
          : pickPresetFirstTurn(scenario.id, idempotencyKey)
      }
    }

    const openingLine = {
      text: cleanText(first.text, 500),
      emotion: cleanText(first.emotion, 40) || "neutral",
      tag: normalizeScenarioTag(first.tag, scenario),
    }
    const openingContext = {
      scenario_id: scenario.id,
      customer_profile_id: customerProfileResult.data?.id || null,
      scene_card_id: sceneCardResult.data?.id || null,
      session_snapshot: sessionSnapshot,
      session_context_text: sessionContextText,
      resolved_at: new Date().toISOString(),
    }
    const generatedAudioPath = getGeneratedOpeningAudioPath(scenario.id, openingLine.text)
    let audioPath: string | null = null
    let audioUrl: string | null = generatedAudioPath ? await trySignVoiceCoachAudio(generatedAudioPath) : null
    let audioSeconds: number | null = null
    let status: "audio_ready" | "fallback_ready" | "blocked" = audioUrl ? "audio_ready" : "fallback_ready"
    let errorCode = ""
    let errorMessage = ""

    if (audioUrl) {
      audioPath = generatedAudioPath
    } else if (openingLine.text && generatedAudioPath) {
      try {
        const tts = await doubaoTts({
          text: openingLine.text,
          emotion: mapEmotionToTts(openingLine.emotion as VoiceCoachEmotion),
          uid: user.id,
        })
        audioSeconds = tts.durationSeconds ?? null
        if (tts.audio) {
          audioPath = generatedAudioPath
          await uploadVoiceCoachAudio({
            path: audioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          audioUrl = await signVoiceCoachAudio(audioPath)
          status = "audio_ready"
        } else {
          status = "fallback_ready"
          errorCode = "tts_empty_audio"
        }
      } catch (error: any) {
        status = "fallback_ready"
        errorCode = "tts_prepare_failed"
        errorMessage = cleanText(error?.message || String(error), 240)
      }
    } else {
      status = "blocked"
      errorCode = "opening_text_empty"
    }

    const payload = {
      user_id: user.id,
      account_id: accountContext?.membershipId || accountContext?.storeId || accountContext?.companyId || null,
      idempotency_key: idempotencyKey,
      scenario_id: scenario.id,
      source_type: cleanText(parsed.data.source_type, 60) || "voice_coach",
      knowledge_space_id: cleanText(parsed.data.training_knowledge_space_id || trainingContext?.knowledge_space_id, 160) || null,
      training_pack_id: cleanText(parsed.data.training_pack_id || trainingContext?.pack_id, 160) || null,
      training_task_id: cleanText(parsed.data.training_task_id || trainingContext?.task_id, 160) || null,
      source_snapshot_hash: hashVoiceCoachOpeningValue({
        customer_profile_id: customerProfileResult.data?.id || null,
        scene_card_id: sceneCardResult.data?.id || null,
        live_notes: liveNotes,
        followup_source_session_id: parsed.data.followup_context?.source_session_id || null,
      }),
      context_hash: hashVoiceCoachOpeningValue(openingContext),
      text_hash: hashVoiceCoachOpeningValue(openingLine.text),
      audio_hash: audioPath ? hashVoiceCoachOpeningValue(audioPath) : null,
      opening_context_json: openingContext,
      opening_line_json: openingLine,
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      voice_profile_id: cleanText(process.env.VOICE_COACH_TTS_PROFILE || "fast", 80),
      voice_config_hash: hashVoiceCoachOpeningValue({
        profile: process.env.VOICE_COACH_TTS_PROFILE || "fast",
        provider: process.env.VOICE_COACH_TTS_PROVIDER || "doubao",
      }),
      policy_status: "passed",
      policy_issues_json: [],
      status,
      attempt_count: 1,
      session_id: null,
      locked_at: null,
      consumed_at: null,
      error_code: errorCode || null,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }

    let row
    try {
      row = await upsertOpeningPreparation({ supabase: openingPreparationAdmin, payload })
    } catch (error: any) {
      if (isOpeningPreparationUnavailableError(error)) {
        return buildBlockedResponse("opening_preparation_table_unavailable", error?.message)
      }
      throw error
    }

    return NextResponse.json({
      preparation_id: row.id,
      status: row.status,
      ready: Boolean(audioUrl),
      already_ready: false,
      opening_line: {
        text: openingLine.text,
        emotion: openingLine.emotion,
        tag: openingLine.tag,
      },
      audio_url: audioUrl,
      audio_seconds: audioSeconds,
      expires_at: row.expires_at || payload.expires_at,
      audio_source: audioUrl ? "prepared" : "prepared_fallback",
      error_code: errorCode || null,
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_opening_prepare_error", { message: err?.message || String(err) })
  }
}
