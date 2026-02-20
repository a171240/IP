import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmAnalyzeBeauticianAndGenerateNext } from "@/lib/voice-coach/llm.server"
import { calcFillerRatio, calcWpm } from "@/lib/voice-coach/metrics"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import {
  doubaoAsrAuc,
  doubaoAsrFlash,
  doubaoTts,
  type DoubaoAsrResult,
  type DoubaoTtsEmotion,
} from "@/lib/voice-coach/speech/doubao.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
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

function detectFormat(file: File): { format: "mp3" | "wav" | "ogg"; ext: string; contentType: string } | null {
  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()

  if (type.includes("mpeg") || name.endsWith(".mp3")) return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  if (type.includes("wav") || name.endsWith(".wav")) return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (type.includes("ogg") || name.endsWith(".ogg")) return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }

  // WeChat recorder may produce AAC; Doubao AUC ASR doesn't guarantee AAC support. Force mp3 for MVP.
  if (type.includes("aac") || name.endsWith(".aac") || name.endsWith(".m4a")) return null
  // If the client doesn't send a useful file name/type, assume mp3 (our mini program records in mp3).
  return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
}

function isAsrSilenceError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  return msg.includes("asr_auc_silence") || msg.includes("asr_silence")
}

function shouldUseFlashAsr(): boolean {
  // Flash ASR requires an explicitly granted resource id.
  return Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    if (!sessionId) return jsonError(400, "missing_session_id")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, scenario_id, status, user_id")
      .eq("id", sessionId)
      .single()

    if (sessionError || !session) return jsonError(404, "session_not_found")
    if (session.status !== "active") return jsonError(400, "session_not_active")

    // Basic rate limit: at most 10 beautician turns per minute per session.
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: recentCount } = await supabase
      .from("voice_coach_turns")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("role", "beautician")
      .gte("created_at", oneMinAgo)
    if ((recentCount || 0) >= 10) return jsonError(429, "rate_limited")

    const form = await request.formData()
    const audioFile = form.get("audio")
    const replyToTurnId = String(form.get("reply_to_turn_id") || "").trim()
    const clientAudioSecondsRaw = form.get("client_audio_seconds")

    if (!(audioFile instanceof File)) return jsonError(400, "missing_audio")
    if (!replyToTurnId) return jsonError(400, "missing_reply_to_turn_id")

    const detected = detectFormat(audioFile)
    if (!detected) {
      return jsonError(400, "unsupported_audio_format", { hint: "请使用 mp3/wav/ogg/flac（推荐 mp3）" })
    }

    const clientAudioSeconds =
      typeof clientAudioSecondsRaw === "string" && clientAudioSecondsRaw.trim() ? Number(clientAudioSecondsRaw) : null

    const audioBuf = Buffer.from(await audioFile.arrayBuffer())
    if (!audioBuf.length) return jsonError(400, "empty_audio")

    const { data: replyTurn, error: replyError } = await supabase
      .from("voice_coach_turns")
      .select("id, role, text, emotion, turn_index")
      .eq("id", replyToTurnId)
      .eq("session_id", sessionId)
      .single()

    if (replyError || !replyTurn) return jsonError(400, "invalid_reply_to_turn_id")
    if (replyTurn.role !== "customer") return jsonError(400, "reply_to_not_customer")

    // Determine next turn_index.
    const { data: lastTurnRows, error: lastTurnError } = await supabase
      .from("voice_coach_turns")
      .select("turn_index")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(1)

    if (lastTurnError) return jsonError(500, "turn_index_query_failed", { message: lastTurnError.message })
    const nextTurnIndex = (lastTurnRows?.[0]?.turn_index ?? -1) + 1
    const beauticianTurnNo = Math.floor((nextTurnIndex + 1) / 2)
    const reachedMax = access.maxTurns > 0 && beauticianTurnNo >= access.maxTurns

    // Read recent history in parallel with ASR/TTS pipeline.
    const historyQueryPromise = supabase
      .from("voice_coach_turns")
      .select("role, text, emotion")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(6)

    const beauticianTurnId = randomUUID()
    const beauticianAudioPath = `${user.id}/${sessionId}/${beauticianTurnId}.${detected.ext}`
    const beauticianAudioUrlPromise = (async () => {
      await uploadVoiceCoachAudio({
        path: beauticianAudioPath,
        data: audioBuf,
        contentType: detected.contentType,
      })
      return signVoiceCoachAudio(beauticianAudioPath)
    })()

    let asr: DoubaoAsrResult | null = null
    if (shouldUseFlashAsr()) {
      try {
        // Fast path: avoid AUC polling when flash can return directly.
        const flashAsr = await doubaoAsrFlash({
          audio: audioBuf,
          format: detected.format,
          uid: user.id,
        })
        if (flashAsr.text) asr = flashAsr
      } catch {
        // Ignore flash failures and fallback to AUC below.
      }
    }

    if (!asr) {
      const beauticianAudioUrl = await beauticianAudioUrlPromise
      try {
        asr = await doubaoAsrAuc({
          audioUrl: beauticianAudioUrl,
          format: detected.format,
          uid: user.id,
        })
      } catch (err) {
        if (isAsrSilenceError(err)) {
          return jsonError(400, "asr_silence", {
            message: "没有识别到有效语音，请重录并靠近麦克风。",
          })
        }
        throw err
      }
    }

    if (!asr || !asr.text) {
      return jsonError(400, "asr_silence", {
        message: "没有识别到有效语音，请重录并靠近麦克风。",
        request_id: asr?.requestId,
      })
    }

    const beauticianAudioUrl = await beauticianAudioUrlPromise

    const audioSeconds = asr.durationSeconds || (clientAudioSeconds && clientAudioSeconds > 0 ? clientAudioSeconds : null)
    const wpm = calcWpm(asr.text, audioSeconds)
    const fillerRatio = calcFillerRatio(asr.text)

    const scenario = getScenario(session.scenario_id)
    const { data: historyRows, error: historyRowsError } = await historyQueryPromise
    if (historyRowsError) return jsonError(500, "history_query_failed", { message: historyRowsError.message })

    const history = (historyRows || [])
      .slice()
      .reverse()
      .map((t: any) => ({
        role: t.role as "customer" | "beautician",
        text: String(t.text || ""),
        emotion: (t.emotion ? String(t.emotion) : undefined) as VoiceCoachEmotion | undefined,
      }))

    const analyzed = await llmAnalyzeBeauticianAndGenerateNext({
      scenario,
      history,
      customerTurn: {
        text: String(replyTurn.text || ""),
        emotion: (replyTurn.emotion ? String(replyTurn.emotion) : undefined) as VoiceCoachEmotion | undefined,
      },
      beauticianText: asr.text,
    })

    const insertBeauticianPromise = supabase.from("voice_coach_turns").insert({
      id: beauticianTurnId,
      session_id: sessionId,
      turn_index: nextTurnIndex,
      role: "beautician",
      text: asr.text,
      audio_path: beauticianAudioPath,
      audio_seconds: audioSeconds,
      asr_confidence: asr.confidence,
      analysis_json: analyzed.analysis,
      features_json: {
        wpm,
        filler_ratio: fillerRatio,
      },
    })

    // Generate next customer turn (unless reached max turns).
    const nextCustomer = analyzed.next_customer
    const nextCustomerTurnId = randomUUID()

    let nextCustomerAudioPath: string | null = null
    let nextCustomerAudioUrl: string | null = null
    let nextCustomerAudioSeconds: number | null = null
    let nextCustomerTtsFailed = false

    if (!reachedMax) {
      try {
        const tts = await doubaoTts({
          text: nextCustomer.text,
          emotion: mapEmotionToTts(nextCustomer.emotion),
          uid: user.id,
        })
        nextCustomerAudioSeconds = tts.durationSeconds ?? null
        if (tts.audio) {
          nextCustomerAudioPath = `${user.id}/${sessionId}/${nextCustomerTurnId}.mp3`
          await uploadVoiceCoachAudio({
            path: nextCustomerAudioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          nextCustomerAudioUrl = await signVoiceCoachAudio(nextCustomerAudioPath)
        }
      } catch {
        nextCustomerAudioPath = null
        nextCustomerAudioUrl = null
        nextCustomerAudioSeconds = null
        nextCustomerTtsFailed = true
      }
    }

    const { error: insertBeauticianError } = await insertBeauticianPromise
    if (insertBeauticianError) {
      return jsonError(500, "insert_beautician_failed", { message: insertBeauticianError.message })
    }

    if (!reachedMax) {
      const { error: insertCustomerError } = await supabase.from("voice_coach_turns").insert({
        id: nextCustomerTurnId,
        session_id: sessionId,
        turn_index: nextTurnIndex + 1,
        role: "customer",
        text: nextCustomer.text,
        emotion: nextCustomer.emotion,
        audio_path: nextCustomerAudioPath,
        audio_seconds: nextCustomerAudioSeconds,
        features_json: { tag: nextCustomer.tag },
      })

      if (insertCustomerError) {
        return jsonError(500, "insert_customer_failed", { message: insertCustomerError.message })
      }
    }

    return NextResponse.json({
      beautician_turn: {
        turn_id: beauticianTurnId,
        text: asr.text,
        audio_url: beauticianAudioUrl,
        audio_seconds: audioSeconds,
      },
      analysis: analyzed.analysis,
      next_customer_turn: reachedMax
        ? null
        : {
            turn_id: nextCustomerTurnId,
            text: nextCustomer.text,
            emotion: nextCustomer.emotion,
            audio_url: nextCustomerAudioUrl,
            audio_seconds: nextCustomerAudioSeconds,
            tts_failed: nextCustomerTtsFailed,
          },
      reached_max_turns: reachedMax,
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
