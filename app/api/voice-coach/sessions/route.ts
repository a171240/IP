import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateCustomerTurn } from "@/lib/voice-coach/llm.server"
import {
  createInitialPolicyState,
  isVoiceCoachCategoryId,
  listCrisisGoalTemplates,
  pickOpeningSeed,
  recommendCategoryFromReport,
  type VoiceCoachCategoryId,
} from "@/lib/voice-coach/script-packs"
import {
  getScenario,
  getScenarioByCategory,
  type VoiceCoachEmotion,
} from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { uploadVoiceCoachAudio, signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

type CreateSessionBody = {
  scenario_id?: unknown
  category_id?: unknown
  goal_template_id?: unknown
  goal_custom?: unknown
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function mapEmotionToTts(emotion: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  switch (emotion) {
    case "pleased":
      return "happy"
    case "worried":
      return "sad"
    case "impatient":
      return "angry"
    case "neutral":
    case "skeptical":
    default:
      return "neutral"
  }
}

function fallbackFirstCustomerTurn(categoryId: VoiceCoachCategoryId) {
  if (categoryId === "presale") {
    return {
      text: "我第一次来，想先了解下你们会怎么帮我判断适合项目？",
      emotion: "neutral" as VoiceCoachEmotion,
      tag: "需求预算",
    }
  }

  if (categoryId === "postsale") {
    return {
      text: "这次做完感觉还可以，后续我该怎么维护效果会更稳？",
      emotion: "neutral" as VoiceCoachEmotion,
      tag: "维护计划",
    }
  }

  if (categoryId === "crisis") {
    return {
      text: "我现在不太满意，先别推项目，先说你们怎么处理这个问题。",
      emotion: "impatient" as VoiceCoachEmotion,
      tag: "情绪急救",
    }
  }

  return {
    text: "医生说美容院不能按胸，这安全吗？",
    emotion: "worried" as VoiceCoachEmotion,
    tag: "胸部安全",
  }
}

function shouldUseLlmForFirstTurn(): boolean {
  const raw = String(process.env.VOICE_COACH_FIRST_TURN_MODE || "preset")
    .trim()
    .toLowerCase()
  return raw === "llm"
}

function shouldGenerateFirstTurnTtsSynchronously(): boolean {
  const raw = String(process.env.VOICE_COACH_FIRST_TTS_MODE || "async")
    .trim()
    .toLowerCase()
  return raw === "sync"
}

function getSeedOpeningAudioSeconds(fallback = 3): number | null {
  const n = Number(process.env.VOICE_COACH_SEED_OPENING_SECONDS || fallback)
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

function parseCategoryFromBody(body: CreateSessionBody, fallback: VoiceCoachCategoryId): VoiceCoachCategoryId {
  const categoryRaw = typeof body?.category_id === "string" ? body.category_id.trim() : ""
  if (isVoiceCoachCategoryId(categoryRaw)) return categoryRaw

  const scenarioRaw = typeof body?.scenario_id === "string" ? body.scenario_id.trim() : ""
  if (scenarioRaw) {
    return getScenario(scenarioRaw).categoryId
  }

  return fallback
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as CreateSessionBody | null

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: latestSession } = await supabase
      .from("voice_coach_sessions")
      .select("id, total_score, dimension_scores, report_json, ended_at")
      .eq("user_id", user.id)
      .eq("status", "ended")
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const recommendation = recommendCategoryFromReport(latestSession || null)
    const categoryId = parseCategoryFromBody(body || {}, recommendation.category_id)

    const goalTemplateIdRaw = typeof body?.goal_template_id === "string" ? body.goal_template_id.trim() : ""
    const goalCustomRaw = typeof body?.goal_custom === "string" ? body.goal_custom.trim() : ""

    const crisisTemplates = listCrisisGoalTemplates()
    const validGoalTemplateId =
      categoryId === "crisis" && goalTemplateIdRaw && crisisTemplates.some((tpl) => tpl.goal_template_id === goalTemplateIdRaw)
        ? goalTemplateIdRaw
        : null

    const goalCustom = categoryId === "crisis" && goalCustomRaw ? goalCustomRaw.slice(0, 120) : null

    if (categoryId === "crisis" && !validGoalTemplateId) {
      return jsonError(400, "missing_goal_template_id", { message: "危机场景必须先选择目标模板" })
    }

    const scenario = getScenarioByCategory(categoryId)

    const opening = pickOpeningSeed({
      categoryId,
      recommendationDimension: recommendation.based_on_report.weakest_dimensions?.[0] || null,
      userId: user.id,
    })

    let first = fallbackFirstCustomerTurn(categoryId)
    if (opening?.text) {
      first = {
        text: opening.text,
        emotion: opening.emotion,
        tag: opening.tag,
      }
    } else if (shouldUseLlmForFirstTurn()) {
      try {
        first = await llmGenerateCustomerTurn({
          scenario,
          history: [],
          target: "使用专业温和语气发起一轮高质量顾客追问",
        })
      } catch {
        first = fallbackFirstCustomerTurn(categoryId)
      }
    }

    const initialPolicyState = createInitialPolicyState({
      categoryId,
      goalTemplateId: validGoalTemplateId,
      goalCustom,
      openingIntentId: opening?.intent_id || null,
      openingAngleId: opening?.angle_id || null,
    })
    if (opening?.line_id) {
      initialPolicyState.used_line_ids = [opening.line_id]
    }

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .insert({
        user_id: user.id,
        scenario_id: scenario.id,
        category_id: categoryId,
        goal_template_id: validGoalTemplateId,
        goal_custom: goalCustom,
        policy_state_json: initialPolicyState,
        status: "active",
      })
      .select("id, scenario_id, category_id, goal_template_id, goal_custom, status, started_at")
      .single()

    if (sessionError || !session) {
      return jsonError(500, "create_session_failed", { message: sessionError?.message })
    }

    const turnId = randomUUID()
    let audioPath: string | null = opening?.audio_seed_path || null
    let audioUrl: string | null = audioPath ? await trySignSeedAudio(audioPath) : null
    let audioSeconds: number | null = Number(opening?.audio_seconds || 0) || getSeedOpeningAudioSeconds(3)
    let ttsFailed = false
    let firstTurnSource: "seed_fixed" | "seed_tts" | "llm" = opening?.audio_seed_path ? "seed_fixed" : "llm"

    if (!audioUrl && shouldGenerateFirstTurnTtsSynchronously()) {
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
          firstTurnSource = opening ? "seed_tts" : "llm"
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
      if (firstTurnSource === "seed_fixed") firstTurnSource = "seed_tts"
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
      line_id: opening?.line_id || null,
      intent_id: opening?.intent_id || null,
      angle_id: opening?.angle_id || null,
      reply_source: opening ? "fixed" : "model",
      features_json: {
        tag: first.tag,
        category_id: categoryId,
        first_turn_source: firstTurnSource,
      },
    })

    if (turnError) {
      return jsonError(500, "create_turn_failed", { message: turnError.message })
    }

    return NextResponse.json({
      session_id: session.id,
      scenario: {
        id: scenario.id,
        name: scenario.name,
        goal: scenario.goal,
        category_id: scenario.categoryId,
        category_name: scenario.categoryMeta.name,
        seedTopics: scenario.seedTopics,
      },
      recommendation,
      first_customer_turn: {
        turn_id: turnId,
        line_id: opening?.line_id || null,
        intent_id: opening?.intent_id || null,
        angle_id: opening?.angle_id || null,
        source: firstTurnSource,
        text: first.text,
        emotion: first.emotion,
        audio_url: audioUrl,
        audio_seconds: audioSeconds,
        tts_failed: ttsFailed,
        tts_pending: !audioUrl,
        first_turn_source: firstTurnSource,
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
