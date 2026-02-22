import { randomUUID } from "crypto"
import { NextRequest } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { emitVoiceCoachEvent } from "@/lib/voice-coach/jobs.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createVoiceCoachTrace, type VoiceCoachTrace, voiceCoachJson } from "@/lib/voice-coach/trace.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(trace: VoiceCoachTrace, status: number, error: string, extra?: Record<string, unknown>) {
  return voiceCoachJson(trace, { error, ...extra }, status)
}

type UploadedAudioFormat = "mp3" | "wav" | "ogg" | "aac" | "flac" | "unknown"
const INLINE_FLASH_AUDIO_MAX_BYTES = 600_000

function detectUploadedAudioFormat(file: File): UploadedAudioFormat {
  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()
  if (type.includes("mpeg") || name.endsWith(".mp3")) return "mp3"
  if (type.includes("wav") || name.endsWith(".wav")) return "wav"
  if (type.includes("ogg") || name.endsWith(".ogg")) return "ogg"
  if (type.includes("aac") || name.endsWith(".aac") || name.endsWith(".m4a")) return "aac"
  if (type.includes("flac") || name.endsWith(".flac")) return "flac"
  return "unknown"
}

function shouldUseFlashAsr(): boolean {
  const raw = String(process.env.VOICE_COACH_ASR_ENABLE_FLASH || "true")
    .trim()
    .toLowerCase()
  return !["0", "false", "off", "no"].includes(raw)
}

function detectFormat(
  file: File,
  uploadedAudioFormat: UploadedAudioFormat,
  opts: { flashEnabled: boolean },
): { format: "mp3" | "wav" | "ogg" | "raw" | "flac"; ext: string; contentType: string } | null {
  if (uploadedAudioFormat === "mp3") return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  if (uploadedAudioFormat === "wav") return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (uploadedAudioFormat === "ogg") return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (uploadedAudioFormat === "flac") {
    return opts.flashEnabled ? { format: "flac", ext: "flac", contentType: "audio/flac" } : null
  }
  if (uploadedAudioFormat === "aac") return null
  return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
}

function formatDuration(seconds: number | null) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return null
  return Math.round(n)
}

async function latestEventCursor(supabase: any, sessionId: string): Promise<number> {
  const { data } = await supabase
    .from("voice_coach_events")
    .select("id")
    .eq("session_id", sessionId)
    .order("id", { ascending: false })
    .limit(1)
  return data?.[0]?.id ? Number(data[0].id) : 0
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const trace = createVoiceCoachTrace(request)
  try {
    const startedAt = Date.now()
    const debugTimings: Record<string, number> = {}
    const mark = (name: string) => {
      debugTimings[name] = Date.now() - startedAt
    }

    const { sessionId } = await context.params
    if (!sessionId) return jsonError(trace, 400, "missing_session_id")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(trace, 401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(trace, access.status, access.error)
    mark("auth_ok")

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, status")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(trace, 404, "session_not_found")
    if (session.status !== "active") return jsonError(trace, 400, "session_not_active")
    mark("session_checked")

    const oneMinAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: recentCount } = await supabase
      .from("voice_coach_turns")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("role", "beautician")
      .gte("created_at", oneMinAgo)
    if ((recentCount || 0) >= 10) return jsonError(trace, 429, "rate_limited")
    mark("rate_limited_checked")

    const form = await request.formData()
    const audioFile = form.get("audio")
    const replyToTurnId = String(form.get("reply_to_turn_id") || "").trim()
    const clientAudioSecondsRaw = form.get("client_audio_seconds")
    const clientAttemptId = String(form.get("client_attempt_id") || "").trim()

    if (!(audioFile instanceof File)) return jsonError(trace, 400, "missing_audio")
    if (!replyToTurnId) return jsonError(trace, 400, "missing_reply_to_turn_id")

    const flashEnabled = shouldUseFlashAsr()
    const uploadedAudioFormat = detectUploadedAudioFormat(audioFile)
    const detected = detectFormat(audioFile, uploadedAudioFormat, { flashEnabled })
    if (!detected) {
      await emitVoiceCoachEvent({
        sessionId,
        userId: user.id,
        traceId: trace.traceId,
        clientBuild: trace.clientBuild,
        serverBuild: trace.serverBuild,
        executor: "manual",
        type: "turn.error",
        data: {
          code: "unsupported_audio_format",
          message: "上传音频格式不支持",
          uploaded_audio_format: uploadedAudioFormat,
          uploaded_audio_mime: String(audioFile.type || "").trim().toLowerCase() || null,
          uploaded_audio_name: String(audioFile.name || "").trim() || null,
          flash_enabled: flashEnabled,
          ts: new Date().toISOString(),
        },
      }).catch(() => {})
      return jsonError(trace, 400, "unsupported_audio_format", {
        hint: flashEnabled ? "请使用 mp3/wav/ogg/flac（推荐 mp3）" : "请使用 mp3/wav/ogg（推荐 mp3）",
        uploaded_audio_format: uploadedAudioFormat,
      })
    }

    const { data: replyTurn, error: replyError } = await supabase
      .from("voice_coach_turns")
      .select("id, role")
      .eq("id", replyToTurnId)
      .eq("session_id", sessionId)
      .single()
    if (replyError || !replyTurn) return jsonError(trace, 400, "invalid_reply_to_turn_id")
    if (replyTurn.role !== "customer") return jsonError(trace, 400, "reply_to_not_customer")

    if (clientAttemptId) {
      const { data: existingJobs } = await supabase
        .from("voice_coach_jobs")
        .select("id, turn_id, payload_json")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .contains("payload_json", { client_attempt_id: clientAttemptId })
        .order("created_at", { ascending: false })
        .limit(1)

      const existing = existingJobs?.[0]
      if (existing?.turn_id) {
        const existingTurnId = String(existing.turn_id)
        const { data: existingTurn } = await supabase
          .from("voice_coach_turns")
          .select("id, audio_path, audio_seconds")
          .eq("id", existingTurnId)
          .eq("session_id", sessionId)
          .single()

        let existingAudioUrl: string | null = null
        if (existingTurn?.audio_path) {
          try {
            existingAudioUrl = await signVoiceCoachAudio(String(existingTurn.audio_path))
          } catch {
            existingAudioUrl = null
          }
        }

        return voiceCoachJson(trace, {
          turn_id: existingTurnId,
          job_id: String(existing.id),
          client_attempt_id: clientAttemptId || null,
          next_cursor: await latestEventCursor(supabase, sessionId),
          reached_max_turns: false,
          deduped: true,
          server_advanced: false,
          server_advanced_stage: null,
          beautician_turn: {
            turn_id: existingTurnId,
            role: "beautician",
            text: "",
            audio_url: existingAudioUrl,
            audio_seconds: formatDuration(
              existingTurn?.audio_seconds ? Number(existingTurn.audio_seconds) : Number(clientAudioSecondsRaw || 0) || null,
            ),
            pending: true,
          },
          trace_id: trace.traceId,
          client_build: trace.clientBuild,
        })
      }
    }

    const { data: lastTurnRows, error: lastTurnError } = await supabase
      .from("voice_coach_turns")
      .select("turn_index")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(1)
    if (lastTurnError) return jsonError(trace, 500, "turn_index_query_failed", { message: lastTurnError.message })

    const nextTurnIndex = (lastTurnRows?.[0]?.turn_index ?? -1) + 1
    const beauticianTurnNo = Math.floor((nextTurnIndex + 1) / 2)
    const reachedMax = access.maxTurns > 0 && beauticianTurnNo >= access.maxTurns

    const turnId = randomUUID()
    const audioPath = `${user.id}/${sessionId}/${turnId}.${detected.ext}`
    const audioBuf = Buffer.from(await audioFile.arrayBuffer())
    if (!audioBuf.length) return jsonError(trace, 400, "empty_audio")

    await uploadVoiceCoachAudio({
      path: audioPath,
      data: audioBuf,
      contentType: detected.contentType,
    })
    const audioUrl = await signVoiceCoachAudio(audioPath)
    mark("audio_uploaded")

    const clientAudioSeconds =
      typeof clientAudioSecondsRaw === "string" && clientAudioSecondsRaw.trim() ? Number(clientAudioSecondsRaw) : null

    const { error: insertTurnError } = await supabase.from("voice_coach_turns").insert({
      id: turnId,
      session_id: sessionId,
      turn_index: nextTurnIndex,
      role: "beautician",
      text: "",
      audio_path: audioPath,
      audio_seconds: clientAudioSeconds,
      status: "accepted",
    })
    if (insertTurnError) return jsonError(trace, 500, "insert_beautician_failed", { message: insertTurnError.message })
    mark("beautician_turn_inserted")

    const submitAckMs = Date.now() - startedAt
    const uploadMs = Math.max(
      0,
      (debugTimings.audio_uploaded || submitAckMs) -
        (debugTimings.rate_limited_checked ||
          debugTimings.session_checked ||
          debugTimings.auth_ok ||
          0),
    )
    const pipelineStartedAtMs = Date.now()

    const jobId = randomUUID()
    const initialPayload = {
      reply_to_turn_id: replyToTurnId,
      audio_format: detected.format,
      client_audio_seconds: clientAudioSeconds,
      ...(audioBuf.length > 0 && audioBuf.length <= INLINE_FLASH_AUDIO_MAX_BYTES
        ? { audio_inline_b64: audioBuf.toString("base64") }
        : {}),
      ...(clientAttemptId ? { client_attempt_id: clientAttemptId } : {}),
    }
    const initialResultState = {
      pipeline_started_at_ms: pipelineStartedAtMs,
      stage_entered_at_ms: pipelineStartedAtMs,
      submit_ack_ms: submitAckMs,
      upload_ms: uploadMs,
      client_build: trace.clientBuild,
      server_build: trace.serverBuild,
      trace_id: trace.traceId,
      executor: "worker",
    }

    const { data: insertedJob, error: jobInsertError } = await supabase
      .from("voice_coach_jobs")
      .insert({
        id: jobId,
        session_id: sessionId,
        user_id: user.id,
        turn_id: turnId,
        status: "queued",
        stage: "main_pending",
        payload_json: initialPayload,
        result_json: initialResultState,
      })
      .select("id, turn_id, stage, attempt_count, payload_json, result_json, created_at, updated_at")
      .single()
    if (jobInsertError || !insertedJob) {
      return jsonError(trace, 500, "insert_job_failed", { message: jobInsertError?.message || "insert_job_failed" })
    }
    mark("job_inserted")

    const advanced = {
      advanced: false,
      status: "queued",
      stage: "main_pending",
    }

    const cursor = await emitVoiceCoachEvent({
      sessionId,
      userId: user.id,
      turnId,
      jobId,
      traceId: trace.traceId,
      clientBuild: trace.clientBuild,
      serverBuild: trace.serverBuild,
      executor: "manual",
      type: "turn.accepted",
      data: {
        turn_id: turnId,
        job_id: jobId,
        audio_url: audioUrl,
        audio_seconds: formatDuration(clientAudioSeconds),
        uploaded_audio_format: uploadedAudioFormat,
        uploaded_audio_mime: String(audioFile.type || "").trim().toLowerCase() || null,
        uploaded_audio_name: String(audioFile.name || "").trim() || null,
        reached_max_turns: reachedMax,
        submit_ack_ms: submitAckMs,
        upload_ms: uploadMs,
        trace_id: trace.traceId,
        client_build: trace.clientBuild,
        server_build: trace.serverBuild,
        executor: "manual",
        ts: new Date().toISOString(),
      },
    })
    mark("accepted_event_emitted")
    mark("advance_done")

    const debugTimingEnabled = String(process.env.VOICE_COACH_DEBUG_TIMING || "false")
      .trim()
      .toLowerCase() === "true"

    return voiceCoachJson(trace, {
      turn_id: turnId,
      job_id: jobId,
      client_attempt_id: clientAttemptId || null,
      next_cursor: cursor,
      reached_max_turns: reachedMax,
      server_advanced: advanced.advanced,
      server_advanced_stage: advanced.stage,
      beautician_turn: {
        turn_id: turnId,
        role: "beautician",
        text: "",
        audio_url: audioUrl,
        audio_seconds: formatDuration(clientAudioSeconds),
        pending: true,
      },
      trace_id: trace.traceId,
      client_build: trace.clientBuild,
      server_build: trace.serverBuild,
      ...(debugTimingEnabled
        ? {
            debug_timing_ms: {
              ...debugTimings,
              total: Date.now() - startedAt,
            },
          }
        : {}),
    })
  } catch (err: any) {
    return jsonError(trace, 500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
