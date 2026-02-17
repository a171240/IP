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

type VoiceCoachJobStage = "main_pending" | "tts_pending" | "analysis_pending" | "done" | "error"

type VoiceCoachJobResultState = {
  pipeline_started_at_ms?: number
  reached_max_turns?: boolean
  reply_turn_id?: string
  beautician_turn_index?: number
  beautician_text?: string
  beautician_audio_url?: string | null
  beautician_audio_seconds?: number | null
  beautician_asr_confidence?: number | null
  next_customer_turn_id?: string
  next_customer_text?: string
  next_customer_emotion?: VoiceCoachEmotion
  next_customer_tag?: string
  customer_text_elapsed_ms?: number
  customer_audio_elapsed_ms?: number
}

type EmitEventArgs = {
  sessionId: string
  userId: string
  type: VoiceCoachEventType
  turnId?: string | null
  jobId?: string | null
  data?: Record<string, unknown> | null
}

type ProcessJobResult = { processed: boolean; done: boolean; jobId?: string; turnId?: string }

type SessionRow = {
  id: string
  scenario_id: string
  status: string
}

type BeauticianTurnRow = {
  id: string
  session_id: string
  turn_index: number
  role: string
  text: string | null
  audio_path: string | null
  audio_seconds: number | null
  status: string | null
  analysis_json: TurnAnalysis | null
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

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeJobStage(raw: unknown): VoiceCoachJobStage {
  const stage = String(raw || "").trim()
  if (stage === "tts_pending") return "tts_pending"
  if (stage === "analysis_pending") return "analysis_pending"
  if (stage === "done") return "done"
  if (stage === "error") return "error"
  // Compatibility for legacy values: accepted / processing / empty -> main stage.
  return "main_pending"
}

function fallbackCustomerTurn(tag = "产品信任"): {
  text: string
  emotion: VoiceCoachEmotion
  tag: string
} {
  return {
    text: "这个我能理解，不过我还是想看更具体一点的案例和依据。",
    emotion: "skeptical",
    tag,
  }
}

function mergeResult(
  prev: VoiceCoachJobResultState | null | undefined,
  patch: Partial<VoiceCoachJobResultState>,
): VoiceCoachJobResultState {
  return {
    ...(prev || {}),
    ...(patch || {}),
  }
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
      finished_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", args.jobId)

  await admin.from("voice_coach_turns").update({ status: "error" }).eq("id", args.turnId).eq("session_id", args.sessionId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: args.turnId,
    jobId: args.jobId,
    type: "turn.error",
    data: {
      code: args.code,
      message: args.message,
      ts: nowIso(),
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
    .limit(6)

  return (data || [])
    .slice()
    .reverse()
    .map((row: any) => ({
      role: row.role as "customer" | "beautician",
      text: String(row.text || ""),
      emotion: row.emotion ? (String(row.emotion) as VoiceCoachEmotion) : undefined,
    }))
}

async function queueNextStage(args: {
  jobId: string
  stage: Exclude<VoiceCoachJobStage, "done" | "error">
  result: VoiceCoachJobResultState
}) {
  const admin = createAdminSupabaseClient()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "queued",
      stage: args.stage,
      updated_at: nowIso(),
      result_json: args.result,
    })
    .eq("id", args.jobId)
}

async function finishJob(args: {
  jobId: string
  result: VoiceCoachJobResultState
}) {
  const admin = createAdminSupabaseClient()
  await admin
    .from("voice_coach_jobs")
    .update({
      status: "done",
      stage: "done",
      finished_at: nowIso(),
      updated_at: nowIso(),
      result_json: args.result,
    })
    .eq("id", args.jobId)
}

async function loadSessionAndTurn(args: {
  sessionId: string
  turnId: string
}): Promise<{ session: SessionRow; turn: BeauticianTurnRow } | null> {
  const admin = createAdminSupabaseClient()
  const [{ data: session, error: sessionError }, { data: turn, error: turnError }] = await Promise.all([
    admin.from("voice_coach_sessions").select("id, scenario_id, status").eq("id", args.sessionId).single(),
    admin
      .from("voice_coach_turns")
      .select("id, session_id, turn_index, role, text, audio_path, audio_seconds, status, analysis_json")
      .eq("id", args.turnId)
      .eq("session_id", args.sessionId)
      .single(),
  ])

  if (sessionError || !session || turnError || !turn) return null
  return {
    session: {
      id: String(session.id),
      scenario_id: String(session.scenario_id || "objection_safety"),
      status: String(session.status || ""),
    },
    turn: {
      id: String(turn.id),
      session_id: String(turn.session_id),
      turn_index: Number(turn.turn_index || 0),
      role: String(turn.role || ""),
      text: turn.text ? String(turn.text) : "",
      audio_path: turn.audio_path ? String(turn.audio_path) : null,
      audio_seconds: asNumber(turn.audio_seconds),
      status: turn.status ? String(turn.status) : null,
      analysis_json: (turn.analysis_json || null) as TurnAnalysis | null,
    },
  }
}

async function processMainStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  payload: VoiceCoachJobPayload
  resultState: VoiceCoachJobResultState
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())

  const loaded = await loadSessionAndTurn({ sessionId: args.sessionId, turnId: args.turnId })
  if (!loaded || loaded.session.status !== "active") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "session_not_active",
      message: "会话已结束或不存在",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  if (loaded.turn.role !== "beautician") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "turn_not_found",
      message: "未找到待处理的美容师回合",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  await admin.from("voice_coach_turns").update({ status: "processing" }).eq("id", args.turnId)

  const { data: replyTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion, turn_index")
    .eq("id", args.payload.reply_to_turn_id)
    .eq("session_id", args.sessionId)
    .single()

  if (!replyTurn) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "reply_turn_not_found",
      message: "顾客回合不存在，无法继续识别",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioPath = loaded.turn.audio_path ? String(loaded.turn.audio_path) : null
  if (!audioPath) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "audio_missing",
      message: "录音文件缺失，请重录",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioBuf = await downloadVoiceCoachAudio(audioPath)
  const format = (args.payload.audio_format || "mp3") as "mp3" | "wav" | "ogg" | "raw" | "flac"

  if (format === "flac" && !shouldUseFlashAsr()) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "unsupported_audio_format",
      message: "当前仅支持 mp3/wav/ogg 录音，请调整录音格式后重试。",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
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
          jobId: args.jobId,
          sessionId: args.sessionId,
          userId: args.userId,
          turnId: args.turnId,
          code: "asr_silence",
          message: "没有识别到有效语音，请重录并靠近麦克风。",
        })
        return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
      }
      throw err
    }
  }

  if (!asr || !asr.text) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "asr_empty",
      message: "识别内容为空，请重录",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const audioSeconds = asr.durationSeconds || asNumber(args.payload.client_audio_seconds) || loaded.turn.audio_seconds || null
  const wpm = calcWpm(asr.text, audioSeconds)
  const fillerRatio = calcFillerRatio(asr.text)
  const beauticianAudioUrl = await getSignedAudio(audioPath)

  const beauticianTurnNo = Math.floor((Number(loaded.turn.turn_index) + 1) / 2)
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
    .eq("id", args.turnId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: args.turnId,
    jobId: args.jobId,
    type: "beautician.asr_ready",
    data: {
      turn_id: args.turnId,
      text: asr.text,
      confidence: asr.confidence,
      audio_seconds: audioSeconds,
      audio_url: beauticianAudioUrl,
      reached_max_turns: reachedMax,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  const stageResultBase = mergeResult(args.resultState, {
    pipeline_started_at_ms: pipelineStartedAt,
    reached_max_turns: reachedMax,
    reply_turn_id: String(replyTurn.id),
    beautician_turn_index: Number(loaded.turn.turn_index),
    beautician_text: asr.text,
    beautician_audio_url: beauticianAudioUrl,
    beautician_audio_seconds: audioSeconds,
    beautician_asr_confidence: asr.confidence,
  })

  if (reachedMax) {
    await queueNextStage({
      jobId: args.jobId,
      stage: "analysis_pending",
      result: stageResultBase,
    })
    return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
  }

  const scenario = getScenario(String(loaded.session.scenario_id || "objection_safety"))
  const history = await buildHistory(args.sessionId, Number(loaded.turn.turn_index))

  let nextCustomer = fallbackCustomerTurn(scenario.seedTopics[0] || "产品信任")
  try {
    nextCustomer = await llmGenerateCustomerTurn({
      scenario,
      history,
      target: "继续追问并要求更具体证据，推动美容师给出可验证信息",
    })
  } catch {
    nextCustomer = fallbackCustomerTurn(scenario.seedTopics[0] || "产品信任")
  }

  const customerTurnIndex = Number(loaded.turn.turn_index) + 1
  const { data: existingCustomerAtIndex } = await admin
    .from("voice_coach_turns")
    .select("id, role")
    .eq("session_id", args.sessionId)
    .eq("turn_index", customerTurnIndex)
    .maybeSingle()

  let nextCustomerTurnId = args.resultState.next_customer_turn_id || randomUUID()
  if (existingCustomerAtIndex?.id) {
    if (String(existingCustomerAtIndex.role || "") !== "customer") {
      await markJobError({
        jobId: args.jobId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnId: args.turnId,
        code: "customer_turn_conflict",
        message: "对话状态冲突，请重试",
      })
      return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
    }

    nextCustomerTurnId = String(existingCustomerAtIndex.id)
    await admin
      .from("voice_coach_turns")
      .update({
        text: nextCustomer.text,
        emotion: nextCustomer.emotion,
        status: "text_ready",
        features_json: { tag: nextCustomer.tag },
      })
      .eq("id", nextCustomerTurnId)
  } else {
    const { error: customerInsertError } = await admin.from("voice_coach_turns").insert({
      id: nextCustomerTurnId,
      session_id: args.sessionId,
      turn_index: customerTurnIndex,
      role: "customer",
      text: nextCustomer.text,
      emotion: nextCustomer.emotion,
      status: "text_ready",
      features_json: { tag: nextCustomer.tag },
    })

    if (customerInsertError) {
      throw new Error(customerInsertError.message || "customer_turn_insert_failed")
    }
  }

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    type: "customer.text_ready",
    data: {
      turn_id: nextCustomerTurnId,
      beautician_turn_id: args.turnId,
      text: nextCustomer.text,
      emotion: nextCustomer.emotion,
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  await queueNextStage({
    jobId: args.jobId,
    stage: "tts_pending",
    result: mergeResult(stageResultBase, {
      next_customer_turn_id: nextCustomerTurnId,
      next_customer_text: nextCustomer.text,
      next_customer_emotion: nextCustomer.emotion,
      next_customer_tag: nextCustomer.tag,
      customer_text_elapsed_ms: Date.now() - pipelineStartedAt,
    }),
  })

  return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
}

async function processTtsStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  resultState: VoiceCoachJobResultState
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())

  const nextCustomerTurnId = String(args.resultState.next_customer_turn_id || "")
  if (!nextCustomerTurnId) {
    await queueNextStage({
      jobId: args.jobId,
      stage: "analysis_pending",
      result: mergeResult(args.resultState, { pipeline_started_at_ms: pipelineStartedAt }),
    })
    return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
  }

  const { data: customerTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion, audio_path, audio_seconds")
    .eq("id", nextCustomerTurnId)
    .eq("session_id", args.sessionId)
    .single()

  if (!customerTurn) {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "customer_turn_missing",
      message: "顾客回合不存在，无法生成语音",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  let audioUrl: string | null = null
  let audioSeconds: number | null = asNumber(customerTurn.audio_seconds)
  let audioPath: string | null = customerTurn.audio_path ? String(customerTurn.audio_path) : null
  let ttsFailed = false

  if (audioPath) {
    audioUrl = await getSignedAudio(audioPath)
  } else {
    const text = String(args.resultState.next_customer_text || customerTurn.text || "").trim()
    const emotion = (args.resultState.next_customer_emotion || customerTurn.emotion || "neutral") as VoiceCoachEmotion

    if (!text) {
      ttsFailed = true
    } else {
      try {
        const tts = await doubaoTts({
          text,
          emotion: mapEmotionToTts(emotion),
          uid: args.userId,
        })

        audioSeconds = tts.durationSeconds ?? null
        if (tts.audio) {
          audioPath = `${args.userId}/${args.sessionId}/${nextCustomerTurnId}.mp3`
          await uploadVoiceCoachAudio({
            path: audioPath,
            data: tts.audio,
            contentType: "audio/mpeg",
          })
          audioUrl = await signVoiceCoachAudio(audioPath)
        } else {
          ttsFailed = true
        }
      } catch {
        ttsFailed = true
      }
    }
  }

  await admin
    .from("voice_coach_turns")
    .update({
      audio_path: audioPath,
      audio_seconds: audioSeconds,
      status: audioPath ? "audio_ready" : "text_ready",
    })
    .eq("id", nextCustomerTurnId)

  await emitVoiceCoachEvent({
    sessionId: args.sessionId,
    userId: args.userId,
    turnId: nextCustomerTurnId,
    jobId: args.jobId,
    type: "customer.audio_ready",
    data: {
      turn_id: nextCustomerTurnId,
      beautician_turn_id: args.turnId,
      audio_url: audioUrl,
      audio_seconds: audioSeconds,
      tts_failed: ttsFailed || !audioUrl,
      text: args.resultState.next_customer_text || String(customerTurn.text || ""),
      stage_elapsed_ms: Date.now() - pipelineStartedAt,
      ts: nowIso(),
    },
  })

  await queueNextStage({
    jobId: args.jobId,
    stage: "analysis_pending",
    result: mergeResult(args.resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
      customer_audio_elapsed_ms: Date.now() - pipelineStartedAt,
    }),
  })

  return { processed: true, done: false, jobId: args.jobId, turnId: args.turnId }
}

async function processAnalysisStage(args: {
  sessionId: string
  userId: string
  jobId: string
  turnId: string
  payload: VoiceCoachJobPayload
  resultState: VoiceCoachJobResultState
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()
  const pipelineStartedAt = Number(args.resultState.pipeline_started_at_ms || Date.now())

  const loaded = await loadSessionAndTurn({ sessionId: args.sessionId, turnId: args.turnId })
  if (!loaded || loaded.turn.role !== "beautician") {
    await markJobError({
      jobId: args.jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      code: "turn_not_found",
      message: "未找到待分析的美容师回合",
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  if (loaded.turn.analysis_json) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const replyTurnId = String(args.payload.reply_to_turn_id || args.resultState.reply_turn_id || "")
  if (!replyTurnId) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const { data: replyTurn } = await admin
    .from("voice_coach_turns")
    .select("id, text, emotion")
    .eq("id", replyTurnId)
    .eq("session_id", args.sessionId)
    .single()

  if (!replyTurn) {
    await finishJob({
      jobId: args.jobId,
      result: mergeResult(args.resultState, {
        pipeline_started_at_ms: pipelineStartedAt,
      }),
    })
    return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
  }

  const scenario = getScenario(String(loaded.session.scenario_id || "objection_safety"))
  const history = await buildHistory(args.sessionId, Number(loaded.turn.turn_index))

  try {
    const analysis = await llmAnalyzeBeauticianTurn({
      scenario,
      history,
      customerTurn: {
        text: String(replyTurn.text || ""),
        emotion: replyTurn.emotion ? (String(replyTurn.emotion) as VoiceCoachEmotion) : undefined,
      },
      beauticianText: String(loaded.turn.text || args.resultState.beautician_text || ""),
    })

    await admin
      .from("voice_coach_turns")
      .update({
        analysis_json: analysis,
        status: "analysis_ready",
      })
      .eq("id", args.turnId)

    await emitVoiceCoachEvent({
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      jobId: args.jobId,
      type: "beautician.analysis_ready",
      data: {
        turn_id: args.turnId,
        analysis,
        stage_elapsed_ms: Date.now() - pipelineStartedAt,
        ts: nowIso(),
      },
    })
  } catch {
    await emitVoiceCoachEvent({
      sessionId: args.sessionId,
      userId: args.userId,
      turnId: args.turnId,
      jobId: args.jobId,
      type: "turn.error",
      data: {
        code: "analysis_failed",
        message: "建议生成稍慢，已跳过本次建议。",
        ts: nowIso(),
      },
    })
  }

  await finishJob({
    jobId: args.jobId,
    result: mergeResult(args.resultState, {
      pipeline_started_at_ms: pipelineStartedAt,
    }),
  })

  return { processed: true, done: true, jobId: args.jobId, turnId: args.turnId }
}

export async function processVoiceCoachJobById(args: {
  sessionId: string
  userId: string
  jobId: string
}): Promise<ProcessJobResult> {
  const admin = createAdminSupabaseClient()

  const { data: job, error: jobError } = await admin
    .from("voice_coach_jobs")
    .select("id, session_id, user_id, turn_id, status, stage, attempt_count, payload_json, result_json")
    .eq("id", args.jobId)
    .eq("session_id", args.sessionId)
    .eq("user_id", args.userId)
    .single()

  if (jobError || !job) return { processed: false, done: false }
  if (job.status !== "queued") return { processed: false, done: job.status === "done" }

  const stage = normalizeJobStage(job.stage)
  const nextAttempt = (job.attempt_count || 0) + 1

  const { data: claimed, error: claimError } = await admin
    .from("voice_coach_jobs")
    .update({
      status: "processing",
      stage,
      attempt_count: nextAttempt,
      updated_at: nowIso(),
      last_error: null,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id, turn_id, stage, payload_json, result_json")
    .single()

  if (claimError || !claimed) return { processed: false, done: false }

  const payload = (claimed.payload_json || {}) as VoiceCoachJobPayload
  const resultState = (claimed.result_json || {}) as VoiceCoachJobResultState
  const turnId = String(claimed.turn_id)
  const jobId = String(claimed.id)

  try {
    if (stage === "main_pending") {
      return await processMainStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        payload,
        resultState,
      })
    }

    if (stage === "tts_pending") {
      return await processTtsStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        resultState,
      })
    }

    if (stage === "analysis_pending") {
      return await processAnalysisStage({
        sessionId: args.sessionId,
        userId: args.userId,
        jobId,
        turnId,
        payload,
        resultState,
      })
    }

    if (stage === "done") {
      await finishJob({ jobId, result: resultState })
      return { processed: true, done: true, jobId, turnId }
    }

    await markJobError({
      jobId,
      sessionId: args.sessionId,
      userId: args.userId,
      turnId,
      code: "invalid_job_stage",
      message: `未知任务阶段: ${String(job.stage || "")}`,
    })
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
