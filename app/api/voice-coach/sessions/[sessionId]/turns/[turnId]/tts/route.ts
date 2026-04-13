import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { emitVoiceCoachEvent } from "@/lib/voice-coach/jobs.server"
import { type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import { doubaoTts, type DoubaoTtsEmotion } from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"
const OPENING_WARM_WAIT_MS = 5200
const OPENING_WARM_POLL_MS = 200

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function getGeneratedOpeningAudioPath(scenarioId: string, text: string): string {
  const normalizedScenarioId = String(scenarioId || "voice-coach").trim() || "voice-coach"
  const normalizedText = String(text || "").trim()
  if (!normalizedText) return ""
  const key = createHash("sha1").update(`${normalizedScenarioId}:${normalizedText}`).digest("hex").slice(0, 16)
  return `seed/opening/generated/${normalizedScenarioId}_${key}.mp3`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function trySignVoiceCoachAudio(path: string): Promise<string | null> {
  if (!path) return null
  try {
    return await signVoiceCoachAudio(path)
  } catch {
    return null
  }
}

async function resolveSharedOpeningAudioSeconds(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  path: string,
): Promise<number | null> {
  if (!path) return null
  const { data } = await supabase
    .from("voice_coach_turns")
    .select("audio_seconds")
    .eq("audio_path", path)
    .not("audio_seconds", "is", null)
    .limit(1)
  const seconds = Number(data && data[0] && data[0].audio_seconds)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function resolveOpeningAudioSecondsFromText(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  text: string,
): Promise<number | null> {
  if (!text) return null
  const { data } = await supabase
    .from("voice_coach_turns")
    .select("audio_seconds")
    .eq("role", "customer")
    .eq("turn_index", 0)
    .eq("text", text)
    .not("audio_seconds", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const seconds = Number(data && data[0] && data[0].audio_seconds)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

async function resolveHistoricalOpeningAudio(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  turnId: string,
  text: string,
): Promise<{ audioPath: string; audioUrl: string; audioSeconds: number | null } | null> {
  if (!text) return null

  const { data } = await supabase
    .from("voice_coach_turns")
    .select("id, audio_path, audio_seconds")
    .eq("role", "customer")
    .eq("turn_index", 0)
    .eq("text", text)
    .not("audio_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(8)

  for (const row of data || []) {
    const candidateId = String(row && row.id ? row.id : "").trim()
    const candidatePath = String(row && row.audio_path ? row.audio_path : "").trim()
    if (!candidatePath || candidateId === turnId) continue

    const signed = await trySignVoiceCoachAudio(candidatePath)
    if (!signed) continue

    const seconds = Number(row && row.audio_seconds)
    return {
      audioPath: candidatePath,
      audioUrl: signed,
      audioSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
    }
  }

  return null
}

async function waitForOpeningAudio(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>,
  sessionId: string,
  turnId: string,
  sharedAudioPath: string,
): Promise<{ audioPath: string; audioUrl: string; audioSeconds: number | null } | null> {
  const deadline = Date.now() + OPENING_WARM_WAIT_MS
  while (Date.now() < deadline) {
    const { data: refreshedTurn } = await supabase
      .from("voice_coach_turns")
      .select("audio_path, audio_seconds")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .maybeSingle()

    const turnAudioPath = String((refreshedTurn && refreshedTurn.audio_path) || "").trim()
    if (turnAudioPath) {
      const signed = await trySignVoiceCoachAudio(turnAudioPath)
      if (signed) {
        const seconds = Number(refreshedTurn && refreshedTurn.audio_seconds)
        return {
          audioPath: turnAudioPath,
          audioUrl: signed,
          audioSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
        }
      }
    }

    if (sharedAudioPath) {
      const signedShared = await trySignVoiceCoachAudio(sharedAudioPath)
      if (signedShared) {
        const refreshedSeconds = Number(refreshedTurn && refreshedTurn.audio_seconds)
        const sharedSeconds = await resolveSharedOpeningAudioSeconds(supabase, sharedAudioPath)
        const seconds =
          Number.isFinite(refreshedSeconds) && refreshedSeconds > 0 ? refreshedSeconds : sharedSeconds
        return {
          audioPath: sharedAudioPath,
          audioUrl: signedShared,
          audioSeconds: Number.isFinite(seconds) && Number(seconds) > 0 ? Number(seconds) : null,
        }
      }
    }

    await sleep(OPENING_WARM_POLL_MS)
  }

  return null
}

function mapEmotionToTts(_emotion: VoiceCoachEmotion): DoubaoTtsEmotion | undefined {
  return "neutral"
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; turnId: string }> },
) {
  try {
    const { sessionId, turnId } = await context.params
    if (!sessionId || !turnId) return jsonError(400, "missing_params")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, status, scenario_id")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    const { data: turn, error: turnError } = await supabase
      .from("voice_coach_turns")
      .select("id, role, text, emotion, status, audio_path, audio_seconds, turn_index")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .single()

    if (turnError || !turn) return jsonError(404, "turn_not_found")
    if (String(turn.role) !== "customer") return jsonError(400, "turn_not_customer")

    const existingTurnAudioPath = String(turn.audio_path || "").trim()
    if (existingTurnAudioPath) {
      const signed = await signVoiceCoachAudio(existingTurnAudioPath)
      return NextResponse.json({
        turn_id: turnId,
        turn_index: turn.turn_index ?? null,
        audio_url: signed,
        audio_seconds: turn.audio_seconds || null,
        cached: true,
      })
    }

    const text = String(turn.text || "").trim()
    if (!text) return jsonError(400, "turn_text_empty")

    const sharedOpeningAudioPath =
      Number(turn.turn_index) === 0 && String(session.scenario_id || "").trim()
        ? getGeneratedOpeningAudioPath(String(session.scenario_id || ""), text)
        : ""

    let audioUrl: string | null = null
    let audioSeconds: number | null = null
    let audioPath: string | null = null

    if (sharedOpeningAudioPath) {
      const cachedSharedUrl = await trySignVoiceCoachAudio(sharedOpeningAudioPath)
      if (cachedSharedUrl) {
        audioPath = sharedOpeningAudioPath
        audioUrl = cachedSharedUrl
        audioSeconds =
          (await resolveSharedOpeningAudioSeconds(supabase, sharedOpeningAudioPath)) ||
          (await resolveOpeningAudioSecondsFromText(supabase, text))
      } else {
        const warmed = await waitForOpeningAudio(supabase, sessionId, turnId, sharedOpeningAudioPath)
        if (warmed) {
          audioPath = warmed.audioPath
          audioUrl = warmed.audioUrl
          audioSeconds = warmed.audioSeconds
        }
      }

      if (!audioUrl) {
        const historical = await resolveHistoricalOpeningAudio(supabase, turnId, text)
        if (historical) {
          audioPath = historical.audioPath
          audioUrl = historical.audioUrl
          audioSeconds = historical.audioSeconds
        }
      }
    }

    try {
      if (!audioUrl) {
        const tts = await doubaoTts({
          text,
          emotion: mapEmotionToTts((turn.emotion ? String(turn.emotion) : "neutral") as VoiceCoachEmotion),
          uid: user.id,
        })

        audioSeconds = tts.durationSeconds ?? null

        if (tts.audio) {
          audioPath = sharedOpeningAudioPath || `${user.id}/${sessionId}/${turnId}.mp3`
          await uploadVoiceCoachAudio({
            path: audioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })

          audioUrl = await signVoiceCoachAudio(audioPath)
        }
      }

      if (audioUrl && audioPath) {
        await supabase
          .from("voice_coach_turns")
          .update({
            audio_path: audioPath,
            audio_seconds: audioSeconds,
            status: "audio_ready",
          })
          .eq("id", turnId)
      } else {
        await supabase.from("voice_coach_turns").update({ status: "text_ready" }).eq("id", turnId)
      }

      await emitVoiceCoachEvent({
        sessionId,
        userId: user.id,
        turnId,
        type: "customer.audio_ready",
        data: {
          turn_id: turnId,
          turn_index: turn.turn_index ?? null,
          audio_url: audioUrl,
          audio_seconds: audioSeconds,
          tts_failed: !audioUrl,
          text,
          ts: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        turn_id: turnId,
        turn_index: turn.turn_index ?? null,
        audio_url: audioUrl,
        audio_seconds: audioSeconds,
        tts_failed: !audioUrl,
      })
    } catch {
      await supabase.from("voice_coach_turns").update({ status: "text_ready" }).eq("id", turnId)

      await emitVoiceCoachEvent({
        sessionId,
        userId: user.id,
        turnId,
        type: "customer.audio_ready",
        data: {
          turn_id: turnId,
          turn_index: turn.turn_index ?? null,
          audio_url: null,
          audio_seconds: null,
          tts_failed: true,
          text,
          ts: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        turn_id: turnId,
        turn_index: turn.turn_index ?? null,
        audio_url: null,
        audio_seconds: null,
        tts_failed: true,
      })
    }
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
