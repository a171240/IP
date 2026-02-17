import "server-only"

import { randomUUID } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { llmAnalyzeBeauticianTurn, llmGenerateCustomerTurn, type TurnAnalysis } from "@/lib/voice-coach/llm.server"
import { calcFillerRatio, calcWpm } from "@/lib/voice-coach/metrics"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import {
  doubaoAsrAuc,
  doubaoAsrFlash,
  doubaoTts,
  type DoubaoAsrResult,
  type DoubaoTtsEmotion,
} from "@/lib/voice-coach/speech/doubao.server"
import {
  downloadVoiceCoachAudio,
  signVoiceCoachAudio,
  uploadVoiceCoachAudio,
} from "@/lib/voice-coach/storage.server"

export type VoiceCoachEventType =
  | "turn.accepted"
  | "beautician.asr_ready"
  | "customer.text_ready"
  | "customer.audio_ready"
  | "beautician.analysis_ready"
  | "turn.error"

type VoiceCoachJobPayload = {
  reply_to_turn_id: string
  audio_format: "mp3" | "wav" | "ogg" | "raw" | "flac"
  client_audio_seconds?: number | null
}

type EmitEventArgs = {
  sessionId: string
  userId: string
  type: VoiceCoachEventType
  turnId?: string | null
  jobId?: string | null
  data?: Record<string, unknown> | null
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function maxTurns(): number {
  return Math.max(1, Number(process.env.VOICE_COACH_MAX_TURNS || 10) || 10)
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

function shouldUseFlashAsr(): boolean {
  return Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function isAsrSilenceError(err: unknown): boolean {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : ""
  return msg.includes("asr_auc_silence") || msg.includes("asr_silence")
}

export async function emitVoiceCoachEvent(args: EmitEventArgs): Promise<number> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from("voice_coach_events")
    .insert({
      session_id: args.sessionId,
      user_id: args.userId,
      turn_id: args.turnId || null,
      job_id: args.jobId || null,
      type: args.type,
      data_json: args.data || {},
    })
    .select("id")
    .single()
  if (error || !data) throw new Error(error?.message || "voice_coach_event_insert_failed")
  return Number(data.id)
}

async function markJobError(args: {
  jobId: string
  sessionId: string
  userId: string
  turnId: string
  code: string
  message: string
}) {
  const admin = createAdminSupabaseClient()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "error",
      stage: "error",
      last_error: args.message,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobId)

  await admin
    .from("voice_coach_turns")
    .update({ status: "error" })
    .eq("id", args.turnId)
    .eq("session_id", args.sessionId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: args.turnId,
    jobId: args.jobId,
    type: "turn.error",
    data: {
      code: args.code,
      message: args.message,
      ts: new Date().toISOString(),
    },
  })
}

async function getSignedAudio(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    return await signVoiceCoachAudio(path)
  } catch {
    return null
  }
}

async function buildHistory(sessionId: string, turnIndex: number) {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from("voice_coach_turns")
    .select("role, text, emotion")
    .eq("session_id", sessionId)
    .lte("turn_index", turnIndex)
    .order("turn_index", { ascending: false })
    .limit(8)

  return (data || [])
    .slice()
    .reverse()
    .map((row: any) => ({
      role: row.role as "customer" | "beautician",
      text: String(row.text || ""),
      emotion: row.emotion ? (String(row.emotion) as VoiceCoachEmotion) : undefined,
    }))
}

type ProcessJobResult = { processed: boolean; done: boolean; jobId?: string; turnId?: string }

export async function processVoiceCoachJobById(args: {
  sessionId: string
  userId: string
  jobId: string
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const startedAt = Date.now()

  const { data: job, error: jobError } = await admin
    .from("voice_coach_jobs")
    .select("id, session_id, user_id, turn_id, status, attempt_count, payload_json")
    .eq("id", args.jobId)
    .eq("session_id", args.sessionId)
    .eq("user_id", args.userId)
    .single()

  if (jobError || !job) return { processed: false, done: false }
  if (job.status !== "queued") return { processed: false, done: job.status === "done" }

  const nextAttempt = (job.attempt_count || 0) + 1
  const { data: claimed, error: claimError } = await admin
    .from("voice_coach_jobs")
    .update({
      status: "processing",
      stage: "processing",
      attempt_count: nextAttempt,
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id, turn_id, payload_json")
    .single()

  if (claimError || !claimed) return { processed: false, done: false }

  const payload = (claimed.payload_json || {}) as VoiceCoachJobPayload
  const turnId = String(claimed.turn_id)
  const jobId = String(claimed.id)

  try {
    const { data: session, error: sessionError } = await admin
      .from("voice_coach_sessions")
      .select("id, scenario_id, status")
      .eq("id", args.sessionId)
      .single()
    if (sessionError || !session || session.status !== "active") {
      await markJobError({
        jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        code: "session_not_active",
        message: "会话已结束或不存在",
      })
      return { processed: true, done: true, jobId, turnId }
    }

    const { data: beauticianTurn, error: turnError } = await admin
      .from("voice_coach_turns")
      .select("id, session_id, turn_index, role, text, audio_path, audio_seconds, status")
      .eq("id", turnId)
      .eq("session_id", args.sessionId)
      .single()
    if (turnError || !beauticianTurn || beauticianTurn.role !== "beautician") {
      await markJobError({
        jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        code: "turn_not_found",
        message: "未找到待处理的美容师回合",
      })
      return { processed: true, done: true, jobId, turnId }
    }

    await admin.from("voice_coach_turns").update({ status: "processing" }).eq("id", turnId)

    const { data: replyTurn } = await admin
      .from("voice_coach_turns")
      .select("id, text, emotion, turn_index")
      .eq("id", payload.reply_to_turn_id)
      .eq("session_id", args.sessionId)
      .single()

    if (!replyTurn) {
      await markJobError({
        jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        code: "reply_turn_not_found",
        message: "顾客回合不存在，无法继续识别",
      })
      return { processed: true, done: true, jobId, turnId }
    }

    const audioPath = beauticianTurn.audio_path ? String(beauticianTurn.audio_path) : null
    if (!audioPath) {
      await markJobError({
        jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        code: "audio_missing",
        message: "录音文件缺失，请重录",
      })
      return { processed: true, done: true, jobId, turnId }
    }

    const audioBuf = await downloadVoiceCoachAudio(audioPath)
    const format = (payload.audio_format || "mp3") as "mp3" | "wav" | "ogg" | "raw" | "flac"

    if (format === "flac" && !shouldUseFlashAsr()) {
      await markJobError({
        jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        code: "unsupported_audio_format",
        message: "当前仅支持 mp3/wav/ogg 录音，请调整录音格式后重试。",
      })
      return { processed: true, done: true, jobId, turnId }
    }

    let asr: DoubaoAsrResult | null = null
    if (shouldUseFlashAsr() && format !== "raw") {
      try {
        asr = await doubaoAsrFlash({
          audio: audioBuf,
          format: format as "mp3" | "wav" | "ogg" | "flac",
          uid: args.userId,
        })
      } catch {
        asr = null
      }
    }

    if (!asr || !asr.text) {
      const signed = await signVoiceCoachAudio(audioPath)
      try {
        asr = await doubaoAsrAuc({
          audioUrl: signed,
          format: format as "mp3" | "wav" | "ogg" | "raw",
          uid: args.userId,
        })
      } catch (err) {
        if (isAsrSilenceError(err)) {
          await markJobError({
            jobId,
            sessionId: args.sessionId,
            userId: args.userId,
            turnId,
            code: "asr_silence",
            message: "没有识别到有效语音，请重录并靠近麦克风。",
          })
          return { processed: true, done: true, jobId, turnId }
        }
        throw err
      }
    }

    if (!asr || !asr.text) {
      await markJobError({
        jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        code: "asr_empty",
        message: "识别内容为空，请重录",
      })
      return { processed: true, done: true, jobId, turnId }
    }

    const asrDoneAt = Date.now()
    const audioSeconds = asr.durationSeconds || asNumber(payload.client_audio_seconds) || beauticianTurn.audio_seconds || null
    const wpm = calcWpm(asr.text, audioSeconds)
    const fillerRatio = calcFillerRatio(asr.text)
    const beauticianAudioUrl = await getSignedAudio(audioPath)

    const beauticianTurnNo = Math.floor((Number(beauticianTurn.turn_index) + 1) / 2)
    const reachedMax = beauticianTurnNo >= maxTurns()

    await admin
      .from("voice_coach_turns")
      .update({
        text: asr.text,
        asr_confidence: asr.confidence,
        audio_seconds: audioSeconds,
        features_json: { wpm, filler_ratio: fillerRatio },
        status: "asr_ready",
      })
      .eq("id", turnId)

    await emitVoiceCoachEvent({
      sessionId: args.sessionId,
      userId: args.userId,
      turnId,
      jobId,
      type: "beautician.asr_ready",
      data: {
        turn_id: turnId,
        text: asr.text,
        confidence: asr.confidence,
        audio_seconds: audioSeconds,
        audio_url: beauticianAudioUrl,
        reached_max_turns: reachedMax,
        stage_elapsed_ms: asrDoneAt - startedAt,
        ts: new Date().toISOString(),
      },
    })

    const scenario = getScenario(String(session.scenario_id || "objection_safety"))
    const history = await buildHistory(args.sessionId, Number(beauticianTurn.turn_index))

    let nextCustomerTurnId: string | null = null
    let nextCustomerText = ""
    let nextCustomerEmotion: VoiceCoachEmotion = "neutral"
    let nextCustomerTag = ""

    if (!reachedMax) {
      const nextCustomer = await llmGenerateCustomerTurn({
        scenario,
        history,
        target: "继续追问并要求更具体证据，推动美容师给出可验证信息",
      })

      nextCustomerTurnId = randomUUID()
      nextCustomerText = nextCustomer.text
      nextCustomerEmotion = nextCustomer.emotion
      nextCustomerTag = nextCustomer.tag

      const customerTurnIndex = Number(beauticianTurn.turn_index) + 1
      const { error: customerInsertError } = await admin.from("voice_coach_turns").insert({
        id: nextCustomerTurnId,
        session_id: args.sessionId,
        turn_index: customerTurnIndex,
        role: "customer",
        text: nextCustomerText,
        emotion: nextCustomerEmotion,
        status: "text_ready",
        features_json: { tag: nextCustomerTag },
      })
      if (customerInsertError) {
        throw new Error(customerInsertError.message || "customer_turn_insert_failed")
      }

      await emitVoiceCoachEvent({
        sessionId: args.sessionId,
        userId: args.userId,
        turnId: nextCustomerTurnId,
        jobId,
        type: "customer.text_ready",
        data: {
          turn_id: nextCustomerTurnId,
          text: nextCustomerText,
          emotion: nextCustomerEmotion,
          stage_elapsed_ms: Date.now() - startedAt,
          ts: new Date().toISOString(),
        },
      })
    }

    const analysisPromise = llmAnalyzeBeauticianTurn({
      scenario,
      history,
      customerTurn: {
        text: String(replyTurn.text || ""),
        emotion: replyTurn.emotion ? (String(replyTurn.emotion) as VoiceCoachEmotion) : undefined,
      },
      beauticianText: asr.text,
    })

    const ttsPromise = (async () => {
      if (!nextCustomerTurnId) return { ok: true as const, skipped: true as const }
      try {
        const tts = await doubaoTts({
          text: nextCustomerText,
          emotion: mapEmotionToTts(nextCustomerEmotion),
          uid: args.userId,
        })

        let audioUrl: string | null = null
        const audioSecondsForCustomer: number | null = tts.durationSeconds ?? null
        let audioPathForCustomer: string | null = null

        if (tts.audio) {
          audioPathForCustomer = `${args.userId}/${args.sessionId}/${nextCustomerTurnId}.mp3`
          await uploadVoiceCoachAudio({
            path: audioPathForCustomer,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          audioUrl = await signVoiceCoachAudio(audioPathForCustomer)
        }

        await admin
          .from("voice_coach_turns")
          .update({
            audio_path: audioPathForCustomer,
            audio_seconds: audioSecondsForCustomer,
            status: audioPathForCustomer ? "audio_ready" : "text_ready",
          })
          .eq("id", nextCustomerTurnId)

        await emitVoiceCoachEvent({
          sessionId: args.sessionId,
          userId: args.userId,
          turnId: nextCustomerTurnId,
          jobId,
          type: "customer.audio_ready",
          data: {
            turn_id: nextCustomerTurnId,
            audio_url: audioUrl,
            audio_seconds: audioSecondsForCustomer,
            tts_failed: !audioUrl,
            text: nextCustomerText,
            stage_elapsed_ms: Date.now() - startedAt,
            ts: new Date().toISOString(),
          },
        })

        return { ok: true as const, skipped: false as const }
      } catch {
        await emitVoiceCoachEvent({
          sessionId: args.sessionId,
          userId: args.userId,
          turnId: nextCustomerTurnId,
          jobId,
          type: "customer.audio_ready",
          data: {
            turn_id: nextCustomerTurnId,
            audio_url: null,
            audio_seconds: null,
            tts_failed: true,
            text: nextCustomerText,
            stage_elapsed_ms: Date.now() - startedAt,
            ts: new Date().toISOString(),
          },
        })
        return { ok: false as const, skipped: false as const }
      }
    })()

    const [analysisResult] = await Promise.allSettled([analysisPromise, ttsPromise])

    if (analysisResult.status === "fulfilled") {
      const analysis = analysisResult.value as TurnAnalysis
      await admin
        .from("voice_coach_turns")
        .update({
          analysis_json: analysis,
          status: "analysis_ready",
        })
        .eq("id", turnId)

      await emitVoiceCoachEvent({
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        jobId,
        type: "beautician.analysis_ready",
        data: {
          turn_id: turnId,
          analysis,
          stage_elapsed_ms: Date.now() - startedAt,
          ts: new Date().toISOString(),
        },
      })
    } else {
      await emitVoiceCoachEvent({
        sessionId: args.sessionId,
        userId: args.userId,
        turnId,
        jobId,
        type: "turn.error",
        data: {
          code: "analysis_failed",
          message: "建议生成稍慢，已跳过本次建议。",
          ts: new Date().toISOString(),
        },
      })
    }

    await admin
      .from("voice_coach_jobs")
      .update({
        status: "done",
        stage: "done",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result_json: {
          finished_ms: Date.now() - startedAt,
          reached_max_turns: reachedMax,
        },
      })
      .eq("id", jobId)

    return { processed: true, done: true, jobId, turnId }
  } catch (err: any) {
    await markJobError({
      jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId,
      code: "voice_coach_error",
      message: err?.message || String(err),
    })
    return { processed: true, done: true, jobId, turnId }
  }
}

export async function pumpVoiceCoachQueuedJobs(args: {
  sessionId: string
  userId: string
  maxJobs?: number
}): Promise<number> {
  const admin = createAdminSupabaseClient()
  const maxJobs = Math.max(1, Math.min(5, Number(args.maxJobs || 1) || 1))

  let processed = 0
  for (let i = 0; i < maxJobs; i++) {
    const { data: queued } = await admin
      .from("voice_coach_jobs")
      .select("id")
      .eq("session_id", args.sessionId)
      .eq("user_id", args.userId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)

    const jobId = queued?.[0]?.id ? String(queued[0].id) : ""
    if (!jobId) break

    const result = await processVoiceCoachJobById({
      sessionId: args.sessionId,
      userId: args.userId,
      jobId,
    })
    if (!result.processed) {
      // Avoid hot loop when another request claimed it.
      await sleep(80)
      continue
    }
    processed += 1
  }

  return processed
}
