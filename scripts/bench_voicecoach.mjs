import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ENV_PATH = '/Users/zhuan/IP项目/ip-content-factory/.env.local'
const API_BASE = String(process.env.VOICECOACH_BENCH_BASE || 'http://127.0.0.1:3000').trim()
const BENCH_TS = Date.now()
const DEVICE_ID = `bench_${BENCH_TS}`
const CLIENT_BUILD = `bench-${BENCH_TS}`
const BENCH_LABEL = String(process.env.BENCH_LABEL || 'default').trim() || 'default'
const BENCH_ROUNDS = Math.max(1, Math.min(3, Number(process.env.BENCH_ROUNDS || 3) || 3))
const EVENTS_TIMEOUT_MS = Math.max(40000, Number(process.env.BENCH_EVENTS_TIMEOUT_MS || 120000) || 120000)

function loadEnv(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    let key = t.slice(0, eq).trim(); if (key.startsWith("export ")) key = key.slice(7).trim()
    let val = t.slice(eq + 1)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

function pick(env, keys) {
  for (const k of keys) {
    if (env[k] && String(env[k]).trim()) return String(env[k]).trim()
  }
  return ''
}

function nowMs() {
  return Date.now()
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function randomEmail() {
  const s = crypto.randomBytes(4).toString('hex')
  return `voicecoach.bench.${Date.now()}.${s}@ipgongchang.xin`
}

async function fetchJson(url, init = {}) {
  const started = nowMs()
  const res = await fetch(url, init)
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, ok: res.ok, json, elapsedMs: nowMs() - started, headers: Object.fromEntries(res.headers.entries()) }
}

function readServerBuild(headers) {
  if (!headers || typeof headers !== 'object') return ''
  return String(headers['x-server-build'] || '').trim()
}

function assertServerBuild(phase, responseRecord) {
  const serverBuild = readServerBuild(responseRecord?.headers)
  if (!serverBuild) {
    return ''
  }
  return serverBuild
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

async function createBenchUser({ supabaseUrl, serviceRoleKey, anonKey }) {
  const email = randomEmail()
  const password = `VcBench!${crypto.randomBytes(6).toString('hex')}`

  const createRes = await fetchJson(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname: 'VC Bench' },
    }),
  })

  if (!createRes.ok) {
    throw new Error(`createBenchUser failed: ${createRes.status} ${JSON.stringify(createRes.json)}`)
  }

  const loginRes = await fetchJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!loginRes.ok || !loginRes.json?.access_token) {
    throw new Error(`loginBenchUser failed: ${loginRes.status} ${JSON.stringify(loginRes.json)}`)
  }

  return {
    email,
    password,
    userId: createRes.json?.id || createRes.json?.user?.id || null,
    accessToken: loginRes.json.access_token,
    createElapsedMs: createRes.elapsedMs,
    loginElapsedMs: loginRes.elapsedMs,
  }
}

function normalizeVoiceType(v) {
  const raw = String(v || '').trim()
  if (!raw) return 'zh_female_vv_uranus_bigtts'
  const lower = raw.toLowerCase()
  if (lower === 'bv700_streaming' || lower === 'bv700') return 'zh_female_vv_uranus_bigtts'
  if (/^bv\d+(_streaming)?$/i.test(raw)) return 'zh_female_vv_uranus_bigtts'
  return raw
}

async function synthBeauticianAudio({ env, text, uid }) {
  const appid = pick(env, ['VOLC_SPEECH_APP_ID'])
  const accessToken = pick(env, ['VOLC_SPEECH_ACCESS_TOKEN'])
  const voiceType = normalizeVoiceType(pick(env, ['VOLC_TTS_VOICE_TYPE']))
  const cluster = pick(env, ['VOLC_TTS_CLUSTER']) || 'volcano_tts'
  const language = pick(env, ['VOLC_TTS_LANGUAGE']) || 'cn'

  const reqid = crypto.randomUUID()
  const body = {
    app: { appid, token: 'voice_coach_bench', cluster },
    user: { uid: uid || 'voice_coach_bench' },
    audio: {
      voice_type: voiceType,
      encoding: 'mp3',
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
      language,
    },
    request: {
      reqid,
      text,
      text_type: 'plain',
      operation: 'query',
    },
  }

  const started = nowMs()
  const res = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer;${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  const elapsedMs = nowMs() - started

  if (!res.ok) {
    throw new Error(`tts http ${res.status} ${JSON.stringify(json)}`)
  }
  const code = json?.code
  if (typeof code === 'number' && code !== 0 && code !== 3000) {
    throw new Error(`tts code ${code} ${json?.message || ''}`)
  }
  if (!json?.data) {
    throw new Error(`tts missing data ${JSON.stringify(json)}`)
  }

  const audioBuffer = Buffer.from(json.data, 'base64')
  const durationSeconds = typeof json?.addition?.duration === 'number' ? json.addition.duration / 1000 : null
  return { audioBuffer, durationSeconds, elapsedMs, requestId: reqid, voiceType }
}

async function createSession({ accessToken, categoryId = 'sale' }) {
  return fetchJson(`${API_BASE}/api/voice-coach/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-device-id': DEVICE_ID,
      'X-Client-Build': CLIENT_BUILD,
    },
    body: JSON.stringify({ category_id: categoryId }),
  })
}

async function submitTurn({ accessToken, sessionId, replyToTurnId, audioBuffer, clientAudioSeconds, clientAttemptId }) {
  const form = new FormData()
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
  form.append('audio', blob, `bench_${Date.now()}.mp3`)
  form.append('reply_to_turn_id', replyToTurnId)
  form.append('client_audio_seconds', String(clientAudioSeconds || ''))
  form.append('client_attempt_id', clientAttemptId)

  const started = nowMs()
  const res = await fetch(`${API_BASE}/api/voice-coach/sessions/${sessionId}/beautician-turn/submit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-device-id': DEVICE_ID,
      'X-Client-Build': CLIENT_BUILD,
    },
    body: form,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, ok: res.ok, json, elapsedMs: nowMs() - started, headers: Object.fromEntries(res.headers.entries()) }
}

async function pollEventsUntil({ accessToken, sessionId, cursor, stopWhen, onPollResponse }) {
  let currentCursor = Number(cursor || 0) || 0
  const polls = []
  const events = []
  const started = nowMs()
  const hardTimeoutMs = EVENTS_TIMEOUT_MS

  while (nowMs() - started < hardTimeoutMs) {
    const t0 = nowMs()
    const res = await fetchJson(`${API_BASE}/api/voice-coach/sessions/${sessionId}/events?cursor=${currentCursor}&timeout_ms=1200`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-device-id': DEVICE_ID,
        'X-Client-Build': CLIENT_BUILD,
      },
    })
    if (typeof onPollResponse === 'function') {
      onPollResponse(res)
    }
    polls.push({
      atMs: nowMs() - started,
      elapsedMs: res.elapsedMs,
      status: res.status,
      eventsCount: Array.isArray(res.json?.events) ? res.json.events.length : 0,
      cursorBefore: currentCursor,
      cursorAfter: Number(res.json?.next_cursor || currentCursor) || currentCursor,
    })

    if (!res.ok) {
      return { ok: false, reason: `events_http_${res.status}`, polls, events, elapsedMs: nowMs() - started }
    }

    const batch = Array.isArray(res.json?.events) ? res.json.events : []
    if (batch.length > 0) {
      events.push(...batch)
      currentCursor = Number(res.json.next_cursor || currentCursor) || currentCursor
      if (stopWhen(batch, events)) {
        return { ok: true, polls, events, nextCursor: currentCursor, elapsedMs: nowMs() - started }
      }
      continue
    }

    currentCursor = Number(res.json?.next_cursor || currentCursor) || currentCursor
    if (nowMs() - t0 < 200) await sleep(120)
  }

  return { ok: false, reason: 'events_timeout', polls, events, nextCursor: currentCursor, elapsedMs: nowMs() - started }
}

function findLastCustomerTurnId(turns) {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'customer') return turns[i].id || turns[i].turn_id
  }
  return ''
}

async function run() {
  const env = loadEnv(ENV_PATH)
  const supabaseUrl = pick(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'IPgongchang_SUPABASE_URL', 'NEXT_PUBLIC_IPgongchang_SUPABASE_URL'])
  const anonKey = pick(env, ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'IPgongchang_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY'])
  const serviceRoleKey = pick(env, ['SUPABASE_SERVICE_ROLE_KEY', 'IPgongchang_SUPABASE_SERVICE_ROLE_KEY'])

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('missing supabase env')
  }

  const models = {
    llmProvider: pick(env, ['VOICE_COACH_LLM_PROVIDER']) || 'apimart',
    textModel: pick(env, ['DOUBAO_TEXT_MODEL', 'APIMART_MODEL']),
    fastModel: pick(env, ['DOUBAO_TEXT_FAST_MODEL', 'APIMART_QUICK_MODEL']),
    analysisModel: pick(env, ['DOUBAO_TEXT_ANALYSIS_MODEL', 'APIMART_VOICE_COACH_ANALYSIS_MODEL']),
    ttsVoiceType: normalizeVoiceType(pick(env, ['VOLC_TTS_VOICE_TYPE'])),
    asrFlashResourceId: pick(env, ['VOLC_ASR_FLASH_RESOURCE_ID']),
    asrAucResourceId: pick(env, ['VOLC_ASR_RESOURCE_ID']),
  }

  const report = {
    startedAt: new Date().toISOString(),
    benchLabel: BENCH_LABEL,
    clientBuild: CLIENT_BUILD,
    runAnalysis: String(process.env.BENCH_RUN_ANALYSIS || 'false').trim().toLowerCase() === 'true',
    client_build: CLIENT_BUILD,
    models,
    rounds: [],
    warnings: [],
    serverBuilds: [],
  }
  const serverBuildSet = new Set()
  const recordServerBuild = (phase, responseRecord) => {
    const build = assertServerBuild(phase, responseRecord)
    if (build) {
      serverBuildSet.add(build)
    } else {
      report.warnings.push({ phase, warning: 'missing_x-server-build' })
    }
    return build
  }

  const user = await createBenchUser({ supabaseUrl, serviceRoleKey, anonKey })
  report.user = { id: user.userId, email: user.email, createElapsedMs: user.createElapsedMs, loginElapsedMs: user.loginElapsedMs }

  const createRes = await createSession({ accessToken: user.accessToken, categoryId: 'sale' })
  recordServerBuild('create_session', createRes)
  report.createSession = {
    status: createRes.status,
    elapsedMs: createRes.elapsedMs,
    firstTurnSource: createRes.json?.first_customer_turn?.first_turn_source || createRes.json?.first_customer_turn?.source || null,
    firstTurnHasAudio: Boolean(createRes.json?.first_customer_turn?.audio_url),
    firstTurnAudioSeconds: createRes.json?.first_customer_turn?.audio_seconds || null,
    sessionId: createRes.json?.session_id || null,
    responseError: createRes.ok ? null : createRes.json,
  }

  if (!createRes.ok || !createRes.json?.session_id) {
    const out = `/tmp/voicecoach_e2e_${Date.now()}.json`
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
    console.log(out)
    return
  }

  const sessionId = createRes.json.session_id
  let cursor = 0
  let turns = [
    {
      id: createRes.json.first_customer_turn?.turn_id,
      role: 'customer',
      text: createRes.json.first_customer_turn?.text || '',
    },
  ]

  const beauticianLines = [
    '我理解您的顾虑，关于安全我们会先做评估，再根据体质调整手法。',
    '价格方面我可以给您拆解价值：资质流程、产品等级和后续跟踪服务。',
    '如果您愿意，我先给您看和您情况接近的真实案例，再决定下一步。',
  ].slice(0, BENCH_ROUNDS)

  for (let i = 0; i < beauticianLines.length; i++) {
    const roundNo = i + 1
    const replyToTurnId = findLastCustomerTurnId(turns)
    const clientAttemptId = `bench_${Date.now()}_${roundNo}`

    const tts = await synthBeauticianAudio({ env, text: beauticianLines[i], uid: user.userId || undefined })

    const submit = await submitTurn({
      accessToken: user.accessToken,
      sessionId,
      replyToTurnId,
      audioBuffer: tts.audioBuffer,
      clientAudioSeconds: tts.durationSeconds || 4,
      clientAttemptId,
    })
    recordServerBuild(`submit_round_${roundNo}`, submit)

    const round = {
      roundNo,
      inputText: beauticianLines[i],
      ttsInputElapsedMs: tts.elapsedMs,
      ttsVoiceType: tts.voiceType,
      submitStatus: submit.status,
      submitElapsedMs: submit.elapsedMs,
      submitJobId: submit.json?.job_id || null,
      submitAcceptedTurnId: submit.json?.beautician_turn?.turn_id || submit.json?.turn_id || null,
      serverAdvanced: Boolean(submit.json?.server_advanced),
      serverAdvancedStage: submit.json?.server_advanced_stage || null,
      events: [],
      polls: [],
      errors: [],
      analysis: null,
    }

    if (!submit.ok || !submit.json) {
      round.errors.push({ phase: 'submit', payload: submit.json })
      report.rounds.push(round)
      continue
    }

    cursor = Number(submit.json.next_cursor || cursor) || cursor

    const stopWhen = (batch, all) => {
      for (const ev of batch) {
        if (ev?.type === 'turn.error') return true
        if (ev?.type === 'customer.audio_ready') return true
      }
      return false
    }

    const polled = await pollEventsUntil({
      accessToken: user.accessToken,
      sessionId,
      cursor,
      stopWhen,
      onPollResponse: (res) => recordServerBuild(`events_round_${roundNo}`, res),
    })
    round.polls = polled.polls
    round.events = polled.events.map((ev) => ({
      id: ev.id,
      type: ev.type,
      turn_id: ev.turn_id,
      stage_elapsed_ms: ev.stage_elapsed_ms ?? ev.data?.stage_elapsed_ms ?? null,
      asr_provider: ev.data?.asr_provider || null,
      asr_provider_attempted: Array.isArray(ev.data?.asr_provider_attempted) ? ev.data.asr_provider_attempted : null,
      asr_provider_final: ev.data?.asr_provider_final || null,
      asr_outcome: ev.data?.asr_outcome || null,
      asr_fallback_used: typeof ev.data?.asr_fallback_used === 'boolean' ? ev.data.asr_fallback_used : null,
      asr_ms: toFiniteNumber(ev.data?.asr_ms),
      asr_ready_ms: toFiniteNumber(ev.data?.asr_ready_ms),
      asr_queue_wait_ms: toFiniteNumber(ev.data?.asr_queue_wait_ms),
      script_select_ms: toFiniteNumber(ev.data?.script_select_ms),
      llm_ms: toFiniteNumber(ev.data?.llm_ms),
      text_ready_ms: toFiniteNumber(ev.data?.text_ready_ms),
      tts_ms: toFiniteNumber(ev.data?.tts_ms),
      queue_wait_before_main_ms: toFiniteNumber(ev.data?.queue_wait_before_main_ms),
      queue_wait_before_tts_ms: toFiniteNumber(ev.data?.queue_wait_before_tts_ms),
      queue_wait_before_tts_valid: typeof ev.data?.queue_wait_before_tts_valid === 'boolean'
        ? ev.data.queue_wait_before_tts_valid
        : null,
      queue_wait_before_tts_source: ev.data?.queue_wait_before_tts_source || null,
      tts_source: ev.data?.tts_source || null,
      tts_cache_hit: typeof ev.data?.tts_cache_hit === 'boolean' ? ev.data.tts_cache_hit : null,
      tts_failed: typeof ev.data?.tts_failed === 'boolean' ? ev.data.tts_failed : null,
      trace_id: ev.data?.trace_id || null,
      executor: ev.data?.executor || null,
      client_build: ev.data?.client_build || null,
      server_build: ev.data?.server_build || null,
      flash_logid: Object.prototype.hasOwnProperty.call(ev.data || {}, 'flash_logid') ? ev.data?.flash_logid : null,
      code: ev.data?.code || null,
      message: ev.data?.message || null,
    }))

    if (!polled.ok) {
      round.errors.push({ phase: 'events', reason: polled.reason })
    }

    cursor = Number(polled.nextCursor || cursor) || cursor

    for (const ev of polled.events) {
      if (ev?.type === 'beautician.asr_ready') {
        turns.push({ id: ev.turn_id || ev?.data?.turn_id, role: 'beautician', text: ev?.data?.text || '' })
      }
      if (ev?.type === 'customer.audio_ready' || ev?.type === 'customer.text_ready') {
        turns.push({ id: ev.turn_id || ev?.data?.turn_id, role: 'customer', text: ev?.data?.text || '' })
      }
    }

    const beauticianTurnId = round.submitAcceptedTurnId
    if (beauticianTurnId && report.runAnalysis) {
      const analysisRes = await fetchJson(`${API_BASE}/api/voice-coach/sessions/${sessionId}/turns/${beauticianTurnId}/analysis`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          'Content-Type': 'application/json',
          'x-device-id': DEVICE_ID,
          'X-Client-Build': CLIENT_BUILD,
        },
        body: JSON.stringify({}),
      })
      recordServerBuild(`analysis_round_${roundNo}`, analysisRes)
      round.analysis = {
        status: analysisRes.status,
        elapsedMs: analysisRes.elapsedMs,
        source: analysisRes.json?.analysis?.source || null,
        cached: Boolean(analysisRes.json?.cached),
        hasSuggestions: Array.isArray(analysisRes.json?.analysis?.suggestions),
      }
    }

    report.rounds.push(round)
  }

  report.serverBuilds = Array.from(serverBuildSet)
  report.server_build = report.serverBuilds[0] || null
  report.finishedAt = new Date().toISOString()

  const out = `/tmp/voicecoach_e2e_${Date.now()}.json`
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`[voicecoach-bench] client_build=${CLIENT_BUILD} server_build=${report.server_build || 'unknown'}`)
  console.log(out)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
