import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateCustomerTurn } from "@/lib/voice-coach/llm.server"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { uploadVoiceCoachAudio, signVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { scenario_id?: unknown } | null
    const scenarioId = typeof body?.scenario_id === "string" && body.scenario_id.trim() ? body.scenario_id.trim() : null
    const scenario = getScenario(scenarioId)

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .insert({
        user_id: user.id,
        scenario_id: scenario.id,
        status: "active",
      })
      .select("id, scenario_id, status, started_at")
      .single()

    if (sessionError || !session) {
      return jsonError(500, "create_session_failed", { message: sessionError?.message })
    }

    const first = await llmGenerateCustomerTurn({
      scenario,
      history: [],
      target: "提出对安全性的担忧并追问是否安全",
    })

    const turnId = randomUUID()

    let audioPath: string | null = null
    let audioUrl: string | null = null
    let audioSeconds: number | null = null
    let ttsFailed = false

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
      }
    } catch (_err) {
      // TTS is optional; the UI can still show text-only customer turns.
      audioPath = null
      audioUrl = null
      audioSeconds = null
      ttsFailed = true
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
      features_json: { tag: first.tag },
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
        seedTopics: scenario.seedTopics,
      },
      first_customer_turn: {
        turn_id: turnId,
        text: first.text,
        emotion: first.emotion,
        audio_url: audioUrl,
        audio_seconds: audioSeconds,
        tts_failed: ttsFailed,
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
