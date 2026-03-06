import crypto from "crypto"
import fs from "fs"

import { WebSocket } from "ws"

import { getVoiceCoachRealtimeConfig } from "@/lib/voice-coach/realtime-contract"
import { loadLocalEnv } from "@/scripts/load-local-env"

type FetchJsonResult = {
  status: number
  ok: boolean
  json: any
  elapsedMs: number
  headers: Record<string, string>
}

type ServerEvent =
  | { type: string; payload?: Record<string, unknown> | null; ts?: string | null }
  | { type: string; raw: string }

const DEVICE_ID = `realtime_smoke_${Date.now()}`
const CLIENT_BUILD = `realtime-smoke-${Date.now()}`
const OUTPUT_PATH = `/tmp/voicecoach_realtime_smoke_${Date.now()}.json`

function pick(env: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = String(env[key] || "").trim()
    if (value) return value
  }
  return ""
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomEmail() {
  return `voicecoach.realtime.${Date.now()}.${crypto.randomBytes(4).toString("hex")}@ipgongchang.xin`
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<FetchJsonResult> {
  const startedAt = Date.now()
  const res = await fetch(url, init)
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return {
    status: res.status,
    ok: res.ok,
    json,
    elapsedMs: Date.now() - startedAt,
    headers: Object.fromEntries(res.headers.entries()),
  }
}

function normalizeVoiceType(value: string) {
  const raw = String(value || "").trim()
  if (!raw) return "zh_female_vv_uranus_bigtts"
  const lower = raw.toLowerCase()
  if (lower === "bv700_streaming" || lower === "bv700") return "zh_female_vv_uranus_bigtts"
  if (/^bv\d+(_streaming)?$/i.test(raw)) return "zh_female_vv_uranus_bigtts"
  return raw
}

async function createBenchUser(args: {
  supabaseUrl: string
  serviceRoleKey: string
  anonKey: string
}) {
  const email = randomEmail()
  const password = `VcRealtime!${crypto.randomBytes(6).toString("hex")}`

  const createRes = await fetchJson(`${args.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: args.serviceRoleKey,
      Authorization: `Bearer ${args.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname: "VC Realtime Smoke" },
    }),
  })

  if (!createRes.ok) {
    throw new Error(`create_bench_user_failed:${createRes.status}`)
  }

  const loginRes = await fetchJson(`${args.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: args.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  if (!loginRes.ok || !loginRes.json?.access_token) {
    throw new Error(`login_bench_user_failed:${loginRes.status}`)
  }

  return {
    email,
    userId: createRes.json?.id || createRes.json?.user?.id || null,
    accessToken: String(loginRes.json.access_token),
    createElapsedMs: createRes.elapsedMs,
    loginElapsedMs: loginRes.elapsedMs,
  }
}

async function synthBeauticianAudio(text: string, uid: string | null) {
  const appid = pick(process.env, ["VOLC_SPEECH_APP_ID"])
  const accessToken = pick(process.env, ["VOLC_SPEECH_ACCESS_TOKEN"])
  const voiceType = normalizeVoiceType(pick(process.env, ["VOLC_TTS_VOICE_TYPE"]))
  const cluster = pick(process.env, ["VOLC_TTS_CLUSTER"]) || "volcano_tts"
  const language = pick(process.env, ["VOLC_TTS_LANGUAGE"]) || "cn"
  if (!appid || !accessToken) {
    throw new Error("missing_volc_tts_env_for_smoke")
  }

  const reqid = crypto.randomUUID()
  const startedAt = Date.now()
  const res = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer;${accessToken}`,
    },
    body: JSON.stringify({
      app: { appid, token: "voice_coach_realtime_smoke", cluster },
      user: { uid: uid || "voice_coach_realtime_smoke" },
      audio: {
        voice_type: voiceType,
        encoding: "mp3",
        speed_ratio: 1,
        volume_ratio: 1,
        pitch_ratio: 1,
        language,
      },
      request: {
        reqid,
        text,
        text_type: "plain",
        operation: "query",
      },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`smoke_tts_http_${res.status}`)
  }
  if (!json?.data) {
    throw new Error("smoke_tts_missing_audio")
  }
  return {
    audioBuffer: Buffer.from(String(json.data), "base64"),
    durationSeconds: typeof json?.addition?.duration === "number" ? json.addition.duration / 1000 : 2.4,
    elapsedMs: Date.now() - startedAt,
    requestId: reqid,
    voiceType,
  }
}

async function createSession(accessToken: string, apiBase: string) {
  return fetchJson(`${apiBase}/api/voice-coach/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-device-id": DEVICE_ID,
      "X-Client-Build": CLIENT_BUILD,
    },
    body: JSON.stringify({ scenario_id: "objection_safety" }),
  })
}

async function getSession(accessToken: string, sessionId: string, apiBase: string) {
  return fetchJson(`${apiBase}/api/voice-coach/sessions/${sessionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-device-id": DEVICE_ID,
      "X-Client-Build": CLIENT_BUILD,
    },
  })
}

function splitAudioIntoChunks(audioBuffer: Buffer, durationSeconds: number, chunkMs: number) {
  const totalChunks = Math.max(1, Math.ceil((durationSeconds * 1000) / chunkMs))
  const chunkSize = Math.max(1, Math.ceil(audioBuffer.length / totalChunks))
  const chunks: Array<{ seq: number; buffer: Buffer; chunkMs: number }> = []
  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkSize
    const end = Math.min(audioBuffer.length, start + chunkSize)
    if (start >= audioBuffer.length) break
    const isFinal = index === totalChunks - 1
    const remainingMs = Math.max(1, Math.round(durationSeconds * 1000 - index * chunkMs))
    chunks.push({
      seq: index + 1,
      buffer: audioBuffer.subarray(start, end),
      chunkMs: isFinal ? Math.min(chunkMs, remainingMs) : chunkMs,
    })
  }
  return chunks
}

async function runRealtimeTurn(args: {
  accessToken: string
  realtimeUrl: string
  sessionId: string
  replyToTurnId: string
  audioBuffer: Buffer
  durationSeconds: number
  defaultChunkMs: number
}) {
  const startedAt = Date.now()
  const messages: ServerEvent[] = []
  const chunks = splitAudioIntoChunks(args.audioBuffer, args.durationSeconds, args.defaultChunkMs)

  return await new Promise<{
    messages: ServerEvent[]
    elapsedMs: number
    closedCode: number | null
    closedReason: string | null
  }>((resolve, reject) => {
    let closedCode: number | null = null
    let closedReason: string | null = null
    let didSendAudio = false
    let settled = false
    let timeoutHandle: NodeJS.Timeout | null = null
    const ws = new WebSocket(args.realtimeUrl, {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
    })

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve({
        messages,
        elapsedMs: Date.now() - startedAt,
        closedCode,
        closedReason,
      })
    }

    timeoutHandle = setTimeout(() => {
      if (settled) return
      settled = true
      ws.close()
      reject(new Error("realtime_smoke_timeout"))
    }, 90000)

    ws.on("message", async (data, isBinary) => {
      if (isBinary) return
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data)
      let parsed: ServerEvent = { type: "unknown", raw: text }
      try {
        parsed = JSON.parse(text) as ServerEvent
      } catch {}
      messages.push(parsed)
      if (parsed.type === "session.ready" && chunks.length > 0 && !didSendAudio) {
        didSendAudio = true
        const chunkDelayMs = Math.max(40, Math.min(160, Math.round(args.defaultChunkMs / 2)))
        for (const chunk of chunks) {
          ws.send(
            JSON.stringify({
              type: "audio.chunk",
              payload: {
                seq: chunk.seq,
                audio_format: "mp3",
                chunk_ms: chunk.chunkMs,
                sample_rate: 16000,
                channels: 1,
                byte_length: chunk.buffer.byteLength,
                transport: "binary",
              },
            }),
          )
          ws.send(chunk.buffer, { binary: true })
          await sleep(chunkDelayMs)
        }
        ws.send(
          JSON.stringify({
            type: "audio.end",
            payload: {
              seq: chunks[chunks.length - 1].seq,
              total_chunks: chunks.length,
            },
          }),
        )
      }
      if (parsed.type === "turn.done" || parsed.type === "error") {
        ws.close()
      }
    })

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.start",
          payload: {
            session_id: args.sessionId,
            reply_to_turn_id: args.replyToTurnId,
            client_attempt_id: `realtime-smoke-${Date.now()}`,
            audio_format: "mp3",
            sample_rate: 16000,
            channels: 1,
            chunk_ms: args.defaultChunkMs,
          },
        }),
      )
    })

    ws.on("close", (code, reason) => {
      closedCode = code
      closedReason = reason.toString("utf8")
      finish()
    })

    ws.on("error", (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
  })
}

async function main() {
  loadLocalEnv()
  const apiBase = String(process.env.VOICECOACH_REALTIME_SMOKE_BASE || process.env.VOICECOACH_BENCH_BASE || "http://127.0.0.1:3000").trim()
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    apiBase,
    outputPath: OUTPUT_PATH,
  }

  const supabaseUrl = pick(process.env, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL",
    "IPgongchang_SUPABASE_URL",
    "NEXT_PUBLIC_IPgongchang_SUPABASE_URL",
  ])
  const anonKey = pick(process.env, [
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "IPgongchang_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY",
  ])
  const serviceRoleKey = pick(process.env, ["SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SERVICE_ROLE_KEY"])
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("missing_supabase_env_for_smoke")
  }

  const user = await createBenchUser({ supabaseUrl, anonKey, serviceRoleKey })
  report.user = {
    userId: user.userId,
    email: user.email,
    createElapsedMs: user.createElapsedMs,
    loginElapsedMs: user.loginElapsedMs,
  }

  const sessionRes = await createSession(user.accessToken, apiBase)
  report.createSession = {
    status: sessionRes.status,
    elapsedMs: sessionRes.elapsedMs,
    ok: sessionRes.ok,
    realtime: sessionRes.json?.realtime || null,
    response: sessionRes.json || null,
  }
  if (!sessionRes.ok || !sessionRes.json?.session_id) {
    throw new Error(`create_session_failed:${sessionRes.status}`)
  }

  const sessionId = String(sessionRes.json.session_id)
  const replyToTurnId = String(sessionRes.json.first_customer_turn?.turn_id || "")
  const realtimeUrl =
    String(sessionRes.json?.realtime?.url || "").trim() ||
    `ws://127.0.0.1:${getVoiceCoachRealtimeConfig().realtimePort}${getVoiceCoachRealtimeConfig().realtimePath}`
  const defaultChunkMs = Number(sessionRes.json?.realtime?.default_chunk_ms || getVoiceCoachRealtimeConfig().defaultChunkMs) || 200
  if (!replyToTurnId) {
    throw new Error("missing_reply_turn_id")
  }

  const tts = await synthBeauticianAudio(
    "我理解您的顾虑，关于安全我们会先做评估，再根据体质调整手法。",
    user.userId,
  )
  report.inputAudio = {
    elapsedMs: tts.elapsedMs,
    durationSeconds: tts.durationSeconds,
    bytes: tts.audioBuffer.byteLength,
    voiceType: tts.voiceType,
  }

  const realtimeResult = await runRealtimeTurn({
    accessToken: user.accessToken,
    realtimeUrl,
    sessionId,
    replyToTurnId,
    audioBuffer: tts.audioBuffer,
    durationSeconds: tts.durationSeconds || 2.4,
    defaultChunkMs,
  })
  report.realtime = {
    url: realtimeUrl,
    elapsedMs: realtimeResult.elapsedMs,
    closedCode: realtimeResult.closedCode,
    closedReason: realtimeResult.closedReason,
    messages: realtimeResult.messages,
  }

  const sessionAfter = await getSession(user.accessToken, sessionId, apiBase)
  report.sessionAfter = {
    status: sessionAfter.status,
    ok: sessionAfter.ok,
    turns: Array.isArray(sessionAfter.json?.turns)
      ? sessionAfter.json.turns.map((turn: any) => ({
          id: turn.id,
          role: turn.role,
          status: turn.status,
          hasAudio: Boolean(turn.audio_url),
          text: typeof turn.text === "string" ? turn.text : null,
        }))
      : [],
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2))
  console.log(OUTPUT_PATH)
}

void main().catch((error) => {
  const payload = {
    startedAt: new Date().toISOString(),
    apiBase: String(process.env.VOICECOACH_REALTIME_SMOKE_BASE || process.env.VOICECOACH_BENCH_BASE || "http://127.0.0.1:3000").trim(),
    error: String(error?.message || error || "voicecoach_realtime_smoke_failed"),
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2))
  console.error(payload.error)
  console.log(OUTPUT_PATH)
  process.exit(1)
})
