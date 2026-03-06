import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { emitVoiceCoachEvent, processVoiceCoachJobById } from "@/lib/voice-coach/jobs.server"
import { signVoiceCoachAudio, uploadVoiceCoachAudio } from "@/lib/voice-coach/storage.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"
const INLINE_AUDIO_MAX_BYTES = 600 * 1024

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function detectFormat(
  file: File,
  opts: { flashEnabled: boolean },
): { format: "mp3" | "wav" | "ogg" | "raw" | "flac"; ext: string; contentType: string } | null {
  const name = (file.name || "").toLowerCase()
  const type = (file.type || "").toLowerCase()

  if (type.includes("mpeg") || name.endsWith(".mp3")) return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
  if (type.includes("wav") || name.endsWith(".wav")) return { format: "wav", ext: "wav", contentType: "audio/wav" }
  if (type.includes("ogg") || name.endsWith(".ogg")) return { format: "ogg", ext: "ogg", contentType: "audio/ogg" }
  if (type.includes("flac") || name.endsWith(".flac")) {
    return opts.flashEnabled ? { format: "flac", ext: "flac", contentType: "audio/flac" } : null
  }
  if (type.includes("aac") || name.endsWith(".aac") || name.endsWith(".m4a")) return null
  return { format: "mp3", ext: "mp3", contentType: "audio/mpeg" }
}

function formatDuration(seconds: number | null) {
  const n = Number(seconds || 0)
  if (!n || n <= 0) return null
  return Math.round(n)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseBool(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return fallback
  return !["0", "false", "off", "no"].includes(normalized)
}

function parseMs(value: string | undefined, fallback: number, max: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(max, Math.round(n)))
}

async function readJobProgress(supabase: any, jobId: string): Promise<{ status: string; stage: string } | null> {
  const { data } = await supabase.from("voice_coach_jobs").select("status, stage").eq("id", jobId).single()
  if (!data) return null
  return {
    status: String(data.status || ""),
    stage: String(data.stage || ""),
  }
}

async function advanceJobWithinBudget(opts: {
  supabase: any
  sessionId: string
  userId: string
  jobId: string
  maxWallMs: number
  jobTimeoutMs: number
}): Promise<{ advanced: boolean; status: string; stage: string; timedOut: boolean }> {
  const maxWallMs = Math.max(0, Number(opts.maxWallMs || 0))
  const jobTimeoutMs = Math.max(0, Math.min(Number(opts.jobTimeoutMs || 0), maxWallMs || Number.MAX_SAFE_INTEGER))
  const initialProgress = await readJobProgress(opts.supabase, opts.jobId)
  if (!maxWallMs || !jobTimeoutMs || !initialProgress || initialProgress.status !== "queued" || initialProgress.stage !== "main_pending") {
    return {
      advanced: false,
      status: initialProgress?.status || "queued",
      stage: initialProgress?.stage || "main_pending",
      timedOut: false,
    }
  }

  const deadline = Date.now() + maxWallMs
  const remaining = Math.max(0, Math.min(jobTimeoutMs, deadline - Date.now()))
  if (!remaining) {
    return {
      advanced: false,
      status: initialProgress.status,
      stage: initialProgress.stage,
      timedOut: false,
    }
  }

  const raced = await Promise.race([
    processVoiceCoachJobById({
      sessionId: opts.sessionId,
      userId: opts.userId,
      jobId: opts.jobId,
      executor: "submit_fastpath",
    })
      .then((result) => ({ timedOut: false, result }))
      .catch(() => ({ timedOut: false, result: null as any })),
    sleep(remaining).then(() => ({ timedOut: true, result: null as any })),
  ])

  const finalProgress = await readJobProgress(opts.supabase, opts.jobId)
  const advanced =
    Boolean(raced.result?.processed) &&
    Boolean(finalProgress) &&
    (finalProgress.stage === "tts_pending" || finalProgress.stage === "analysis_pending" || finalProgress.status === "done")
  return {
    advanced,
    status: finalProgress?.status || "queued",
    stage: finalProgress?.stage || "main_pending",
    timedOut: raced.timedOut,
  }
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

function getSubmitFastpathConfig() {
  return {
    enabled: parseBool(process.env.VOICE_COACH_SUBMIT_FASTPATH_ENABLED, false),
    maxWallMs: parseMs(process.env.VOICE_COACH_SUBMIT_FASTPATH_MAX_WALL_MS, 900, 5000),
    jobTimeoutMs: parseMs(process.env.VOICE_COACH_SUBMIT_FASTPATH_JOB_TIMEOUT_MS, 700, 5000),
  }
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
      .select("id, status")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")
    if (session.status !== "active") return jsonError(400, "session_not_active")

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
    const clientAttemptId = String(form.get("client_attempt_id") || "").trim()

    if (!(audioFile instanceof File)) return jsonError(400, "missing_audio")
    if (!replyToTurnId) return jsonError(400, "missing_reply_to_turn_id")

    const flashEnabled = Boolean((process.env.VOLC_ASR_FLASH_RESOURCE_ID || "").trim())
    const detected = detectFormat(audioFile, { flashEnabled })
    if (!detected) {
      return jsonError(400, "unsupported_audio_format", {
        hint: flashEnabled ? "请使用 mp3/wav/ogg/flac（推荐 mp3）" : "请使用 mp3/wav/ogg（推荐 mp3）",
      })
    }

    const { data: replyTurn, error: replyError } = await supabase
      .from("voice_coach_turns")
      .select("id, role")
      .eq("id", replyToTurnId)
      .eq("session_id", sessionId)
      .single()
    if (replyError || !replyTurn) return jsonError(400, "invalid_reply_to_turn_id")
    if (replyTurn.role !== "customer") return jsonError(400, "reply_to_not_customer")

    if (clientAttemptId) {
      const { data: existingJobs } = await supabase
        .from("voice_coach_jobs")
        .select("id, turn_id, payload_json, result_json")
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

        return NextResponse.json({
          turn_id: existingTurnId,
          job_id: String(existing.id),
          client_attempt_id: clientAttemptId || null,
          next_cursor: await latestEventCursor(supabase, sessionId),
          reached_max_turns: false,
          deduped: true,
          server_advanced: false,
          server_advanced_stage: null,
          inline_audio_eligible: Boolean(existing.payload_json?.inline_audio_eligible),
          submit_fastpath_hit: Boolean(existing.result_json?.submit_fastpath_hit),
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
        })
      }
    }

    const { data: lastTurnRows, error: lastTurnError } = await supabase
      .from("voice_coach_turns")
      .select("turn_index")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(1)
    if (lastTurnError) return jsonError(500, "turn_index_query_failed", { message: lastTurnError.message })

    const nextTurnIndex = (lastTurnRows?.[0]?.turn_index ?? -1) + 1
    const beauticianTurnNo = Math.floor((nextTurnIndex + 1) / 2)
    const reachedMax = beauticianTurnNo >= access.maxTurns

    const turnId = randomUUID()
    const audioPath = `${user.id}/${sessionId}/${turnId}.${detected.ext}`
    const audioBuf = Buffer.from(await audioFile.arrayBuffer())
    if (!audioBuf.length) return jsonError(400, "empty_audio")
    const inlineAudioEligible = audioBuf.length <= INLINE_AUDIO_MAX_BYTES

    await uploadVoiceCoachAudio({
      path: audioPath,
      data: audioBuf,
      contentType: detected.contentType,
    })
    const audioUrl = await signVoiceCoachAudio(audioPath)

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
    if (insertTurnError) return jsonError(500, "insert_beautician_failed", { message: insertTurnError.message })

    const jobId = randomUUID()
    const { error: jobInsertError } = await supabase.from("voice_coach_jobs").insert({
      id: jobId,
      session_id: sessionId,
      user_id: user.id,
      turn_id: turnId,
      status: "queued",
      stage: "main_pending",
      payload_json: {
        reply_to_turn_id: replyToTurnId,
        audio_format: detected.format,
        client_audio_seconds: clientAudioSeconds,
        inline_audio_eligible: inlineAudioEligible,
        ...(inlineAudioEligible ? { audio_inline_b64: audioBuf.toString("base64") } : {}),
        ...(clientAttemptId ? { client_attempt_id: clientAttemptId } : {}),
      },
    })
    if (jobInsertError) return jsonError(500, "insert_job_failed", { message: jobInsertError.message })

    const cursor = await emitVoiceCoachEvent({
      sessionId,
      userId: user.id,
      turnId,
      jobId,
      type: "turn.accepted",
      data: {
        turn_id: turnId,
        job_id: jobId,
        audio_url: audioUrl,
        audio_seconds: formatDuration(clientAudioSeconds),
        reached_max_turns: reachedMax,
        inline_audio_eligible: inlineAudioEligible,
        ts: new Date().toISOString(),
      },
    })

    const fastpath = getSubmitFastpathConfig()
    const advanced = fastpath.enabled
      ? await advanceJobWithinBudget({
          supabase,
          sessionId,
          userId: user.id,
          jobId,
          maxWallMs: fastpath.maxWallMs,
          jobTimeoutMs: fastpath.jobTimeoutMs,
        }).catch(() => ({
          advanced: false,
          status: "queued",
          stage: "main_pending",
          timedOut: false,
        }))
      : {
          advanced: false,
          status: "queued",
          stage: "main_pending",
          timedOut: false,
        }

    return NextResponse.json({
      turn_id: turnId,
      job_id: jobId,
      client_attempt_id: clientAttemptId || null,
      next_cursor: cursor,
      reached_max_turns: reachedMax,
      server_advanced: advanced.advanced,
      server_advanced_stage: advanced.stage,
      inline_audio_eligible: inlineAudioEligible,
      submit_fastpath_hit: advanced.advanced,
      submit_fastpath_timed_out: advanced.timedOut,
      beautician_turn: {
        turn_id: turnId,
        role: "beautician",
        text: "",
        audio_url: audioUrl,
        audio_seconds: formatDuration(clientAudioSeconds),
        pending: true,
      },
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
