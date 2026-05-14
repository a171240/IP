#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

const baseUrl = process.env.MP_BASE_URL || "http://localhost:3000"
const keepRows = process.argv.includes("--keep-rows") || process.env.SERVICE_RECORD_KEEP_ROWS === "1"
const audioPath = process.env.SERVICE_RECORD_SMOKE_AUDIO_PATH || ""
const audioDir = process.env.SERVICE_RECORD_SMOKE_AUDIO_DIR || ""
const pollAsr = process.argv.includes("--poll-asr") || process.env.SERVICE_RECORD_SMOKE_POLL_ASR === "1"
const processRecord = process.argv.includes("--process") || process.env.SERVICE_RECORD_SMOKE_PROCESS === "1"
const pollAttempts = Math.max(1, Math.min(180, Number(process.env.SERVICE_RECORD_SMOKE_ASR_POLL_ATTEMPTS || 8)))
const pollIntervalMs = Math.max(1000, Math.min(30000, Number(process.env.SERVICE_RECORD_SMOKE_ASR_POLL_INTERVAL_MS || 5000)))
const segmentSeconds = Math.max(1, Math.min(600, Number(process.env.SERVICE_RECORD_SMOKE_SEGMENT_SECONDS || 30)))

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  const text = fs.readFileSync(filePath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    value = value.replace(/^['"]|['"]$/g, "")
    env[key] = value
  }
  return env
}

function resolveEnv() {
  const merged = { ...loadEnvFile(path.join(process.cwd(), ".env.local")), ...process.env }
  return {
    supabaseUrl:
      merged.NEXT_PUBLIC_SUPABASE_URL ||
      merged.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
      merged.IPgongchang_SUPABASE_URL ||
      "",
    supabaseAnonKey:
      merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      merged.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
      merged.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
      merged.IPgongchang_SUPABASE_ANON_KEY ||
      merged.IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
      "",
    supabaseServiceKey:
      merged.SUPABASE_SERVICE_ROLE_KEY ||
      merged.IPgongchang_SUPABASE_SERVICE_ROLE_KEY ||
      merged.IPgongchang_SUPABASE_SECRET_KEY ||
      "",
  }
}

function assert(value, message) {
  if (!value) throw new Error(message)
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text().catch(() => "")
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text || null
  }

  if (!res.ok) {
    const error = new Error(
      (json && typeof json === "object" && (json.error || json.message || json.code)) ||
        (typeof json === "string" ? json.slice(0, 200) : "") ||
        `HTTP ${res.status}`,
    )
    error.status = res.status
    error.body = json
    throw error
  }
  return json
}

function safeError(error) {
  return {
    status: error && typeof error.status === "number" ? error.status : null,
    message: error?.message || String(error || "unknown_error"),
    code: error?.body && typeof error.body === "object" ? error.body.code || error.body.error || null : null,
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function audioMetaFromPath(filePath) {
  const resolved = path.resolve(filePath)
  const data = fs.readFileSync(resolved)
  const ext = path.extname(resolved).toLowerCase().replace(/^\./, "")
  const supported = {
    mp3: { type: "audio/mpeg", format: "mp3" },
    wav: { type: "audio/wav", format: "wav" },
    ogg: { type: "audio/ogg", format: "ogg" },
    flac: { type: "audio/flac", format: "flac" },
  }
  const detected = supported[ext] || supported.mp3

  return {
    data,
    type: detected.type,
    name: path.basename(resolved),
    format: detected.format,
    seconds: Number(process.env.SERVICE_RECORD_SMOKE_AUDIO_SECONDS || segmentSeconds),
    source: resolved,
  }
}

function resolveAudioFixtures() {
  if (audioDir) {
    const resolvedDir = path.resolve(audioDir)
    const files = fs
      .readdirSync(resolvedDir)
      .filter((name) => /\.(mp3|wav|ogg|flac)$/i.test(name))
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
      .map((name) => path.join(resolvedDir, name))
    assert(files.length, "missing_audio_segment_files")
    return files.map((filePath, index) => ({
      ...audioMetaFromPath(filePath),
      seconds: Number(process.env.SERVICE_RECORD_SMOKE_AUDIO_SECONDS || segmentSeconds),
      segmentIndex: index + 1,
    }))
  }

  if (!audioPath) {
    return [{
      data: Buffer.from("service-record-smoke-audio"),
      type: "audio/mpeg",
      name: "smoke.mp3",
      format: "mp3",
      seconds: 1,
      source: "synthetic_bytes",
      segmentIndex: 1,
    }]
  }

  return [{ ...audioMetaFromPath(audioPath), segmentIndex: 1 }]
}

async function pollAsrSegments({ sessionId, token, report }) {
  for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
    const pollRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}/asr/poll`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const detailRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
    const updatedSegments = Array.isArray(pollRes?.segments) ? pollRes.segments : []
    const segments = Array.isArray(detailRes?.segments) ? detailRes.segments : []
    const statusCounts = segments.reduce((acc, segment) => {
      const status = segment.asr_status || "unknown"
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {})
    const transcript = segments.map((segment) => segment.transcript_text || "").filter(Boolean).join("\n")
    report.steps.push({
      step: "asr_poll",
      ok: true,
      attempt,
      updated_count: updatedSegments.length,
      status_counts: statusCounts,
      transcript_preview: transcript.slice(0, 120),
    })

    const openCount = Number(statusCounts.pending || 0) + Number(statusCounts.running || 0)
    if (segments.length && openCount === 0) return
    await sleep(pollIntervalMs)
  }
}

async function ensureTestUser(admin, userClient) {
  const email = `codex+service-record-${Date.now()}@ipgongchang.test`
  const password = `TestPass-${Date.now()}`
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: "service-record-smoke" },
  })
  if (createError) throw createError
  const userId = created?.user?.id
  assert(userId, "missing_created_user_id")

  await admin.from("profiles").upsert({
    id: userId,
    email,
    nickname: "服务记录测试账号",
    plan: "pro",
    credits_balance: 999,
    credits_unlimited: true,
  })

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  const token = signInData?.session?.access_token
  assert(token, "missing_access_token")
  return { userId, email, token }
}

async function ensureVoiceCoachFixtures(admin, userId) {
  const now = new Date().toISOString()
  const { data: customer, error: customerError } = await admin
    .from("voice_coach_customer_profiles")
    .insert({
      user_id: userId,
      name: "服务记录测试顾客",
      age_label: "35岁左右",
      occupation: "门店测试",
      communication_style: "需要专业解释",
      core_concerns: ["效果持续时间", "过程是否舒适"],
      updated_at: now,
    })
    .select("id")
    .single()
  if (customerError) throw customerError

  const { data: scene, error: sceneError } = await admin
    .from("voice_coach_scene_cards")
    .insert({
      user_id: userId,
      name: "面部营养排毒测试项目",
      scene_kind: "customer_visit",
      service_name: "面部营养排毒",
      scene_goal: "记录一轮真实服务沟通",
      likely_questions: ["做一次有没有效果"],
      must_cover_points: ["面部经络", "护理周期"],
      updated_at: now,
    })
    .select("id")
    .single()
  if (sceneError) throw sceneError

  return { customerId: customer.id, sceneId: scene.id }
}

async function cleanup(admin, ids) {
  if (keepRows) return
  await Promise.allSettled([
    ids.sessionId ? admin.from("service_record_sessions").delete().eq("id", ids.sessionId) : Promise.resolve(),
    ids.customerId ? admin.from("voice_coach_customer_profiles").delete().eq("id", ids.customerId) : Promise.resolve(),
    ids.sceneId ? admin.from("voice_coach_scene_cards").delete().eq("id", ids.sceneId) : Promise.resolve(),
    ids.userId ? admin.auth.admin.deleteUser(ids.userId) : Promise.resolve(),
  ])
}

async function main() {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = resolveEnv()
  assert(supabaseUrl && supabaseAnonKey && supabaseServiceKey, "missing_supabase_env")

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const ids = {}
  const report = {
    ok: false,
    base_url: baseUrl,
    token_source: "supabase_password_session",
    steps: [],
  }

  try {
    const auth = await ensureTestUser(admin, userClient)
    ids.userId = auth.userId
    report.steps.push({ step: "auth_token", ok: true, user_id: auth.userId })

    const fixtures = await ensureVoiceCoachFixtures(admin, auth.userId)
    ids.customerId = fixtures.customerId
    ids.sceneId = fixtures.sceneId
    report.steps.push({ step: "fixtures", ok: true, customer_id: fixtures.customerId, scene_card_id: fixtures.sceneId })

    const headers = {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    }

    const sessionRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_session_id: `smoke_${Date.now()}`,
        customer_profile_id: fixtures.customerId,
        scene_card_id: fixtures.sceneId,
        participants: ["beautician", "customer"],
        objective: "服务记录冒烟测试",
        consent_confirmed: true,
        consent_note: "自动化测试确认",
      }),
    })
    const sessionId = sessionRes?.session?.id
    ids.sessionId = sessionId
    assert(sessionId, "missing_session_id")
    report.steps.push({ step: "create_session", ok: true, session_id: sessionId, status: sessionRes.session.status })

    const audioFixtures = resolveAudioFixtures()
    const uploadSummary = {
      step: audioFixtures.length === 1 ? "upload_segment" : "upload_segments",
      ok: true,
      segment_count: audioFixtures.length,
      total_audio_bytes: 0,
      total_audio_seconds: 0,
      status_counts: {},
      first_audio_source: audioFixtures[0]?.source || "",
      last_audio_source: audioFixtures[audioFixtures.length - 1]?.source || "",
    }

    const baseStartedAt = Date.now() - audioFixtures.reduce((sum, item) => sum + Math.round((item.seconds || 1) * 1000), 0)
    let elapsedMs = 0
    for (const audioFixture of audioFixtures) {
      const form = new FormData()
      const seconds = Number(audioFixture.seconds || 1)
      const segmentIndex = Number(audioFixture.segmentIndex || 1)
      const startedAt = new Date(baseStartedAt + elapsedMs).toISOString()
      elapsedMs += Math.round(seconds * 1000)
      const endedAt = new Date(baseStartedAt + elapsedMs).toISOString()

      form.append("audio", new Blob([audioFixture.data], { type: audioFixture.type }), audioFixture.name)
      form.append("client_segment_id", `seg_${String(segmentIndex).padStart(4, "0")}_${Date.now()}`)
      form.append("segment_index", String(segmentIndex))
      form.append("client_audio_seconds", String(seconds))
      form.append("started_at", startedAt)
      form.append("ended_at", endedAt)
      form.append("format", audioFixture.format)

      const segmentRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
        body: form,
      })

      const asrStatus = segmentRes?.segment?.asr_status || "unknown"
      uploadSummary.total_audio_bytes += audioFixture.data.length
      uploadSummary.total_audio_seconds += seconds
      uploadSummary.status_counts[asrStatus] = (uploadSummary.status_counts[asrStatus] || 0) + 1
    }
    report.steps.push(uploadSummary)

    if (pollAsr) await pollAsrSegments({ sessionId, token: auth.token, report })

    const markerRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}/markers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        marker_type: "customer_objection",
        label: "顾客顾虑",
        offset_seconds: 1,
      }),
    })
    report.steps.push({ step: "add_marker", ok: true, marker_id: markerRes?.marker?.id })

    const endRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        mode: "end_pending",
        client_confirmed: true,
        ended_reason: "service_completed",
      }),
    })
    report.steps.push({
      step: "end_pending",
      ok: true,
      status: endRes?.session?.status,
      has_resume_deadline: Boolean(endRes?.session?.resume_deadline_at),
    })

    if (processRecord) {
      const processRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}/process`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          client_confirmed: true,
          trigger: "smoke",
        }),
      })
      report.steps.push({
        step: "process",
        ok: true,
        status: processRes?.session?.status,
        has_note: Boolean(processRes?.session?.note_markdown),
        has_employee_feedback: Boolean(processRes?.session?.result?.employee_feedback),
        note_preview: String(processRes?.session?.note_markdown || "").slice(0, 160),
      })
    } else {
      const resumeRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}/resume`, {
        method: "POST",
        headers,
      })
      report.steps.push({ step: "resume", ok: true, status: resumeRes?.session?.status })
    }

    const detailRes = await jsonFetch(`${baseUrl}/api/mp/service-records/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers,
    })
    report.steps.push({
      step: "detail",
      ok: true,
      segment_count: (detailRes?.segments || []).length,
      marker_count: (detailRes?.markers || []).length,
      has_employee_feedback: Boolean(detailRes?.session?.result?.employee_feedback),
    })

    report.ok = true
  } catch (error) {
    report.error = safeError(error)
  } finally {
    await cleanup(admin, ids)
  }

  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }, null, 2))
  process.exit(1)
})
