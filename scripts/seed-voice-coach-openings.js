const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

const { createClient } = require("@supabase/supabase-js")

const VOICE_COACH_AUDIO_BUCKET = "voice-coach-audio"
const DEFAULT_TTS_VOICE_TYPE = "zh_female_vv_uranus_bigtts"

const OPENINGS = [
  "我先说最担心的点吧，这种护理会不会有安全隐患？",
  "你们这个项目价格不低，我想先听清楚它到底值在哪里。",
  "你先别讲概念，我更想看看有没有和我情况接近的真实案例。",
  "我体质比较敏感，最怕做完以后红肿发胀，像我这种能做吗？",
  "我现在不是完全拒绝，就是想先低门槛试一次，再决定要不要继续。",
]

function readEnv(file) {
  if (!fs.existsSync(file)) return {}
  const env = {}
  const text = fs.readFileSync(file, "utf8")
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function openingPath(scenarioId, text) {
  const key = crypto.createHash("sha1").update(`${scenarioId}:${String(text).trim()}`).digest("hex").slice(0, 16)
  return `seed/opening/generated/${scenarioId}_${key}.mp3`
}

async function tts(env, text) {
  const appid = String(env.VOLC_SPEECH_APP_ID || "").trim()
  const accessToken = String(env.VOLC_SPEECH_ACCESS_TOKEN || "").trim()
  const cluster = String(env.VOLC_TTS_CLUSTER || "volcano_tts").trim()
  const language = String(env.VOLC_TTS_LANGUAGE || "cn").trim()
  const voiceType = String(env.VOLC_TTS_VOICE_TYPE || DEFAULT_TTS_VOICE_TYPE).trim() || DEFAULT_TTS_VOICE_TYPE
  if (!appid || !accessToken) throw new Error("volc_env_missing")

  const reqid = crypto.randomUUID()
  const res = await fetch("https://openspeech.bytedance.com/api/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer;${accessToken}`,
    },
    body: JSON.stringify({
      app: {
        appid,
        token: "voice_coach_seed",
        cluster,
      },
      user: {
        uid: "voice_coach_seed",
      },
      audio: {
        voice_type: voiceType,
        encoding: "mp3",
        speed_ratio: 1.0,
        volume_ratio: 1.0,
        pitch_ratio: 1.0,
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
  if (!res.ok) throw new Error((json && json.message) || `tts_http_${res.status}`)
  if (typeof json?.code === "number" && json.code !== 0 && json.code !== 3000) {
    throw new Error(json?.message || `tts_code_${json.code}`)
  }
  if (!json?.data || typeof json.data !== "string") throw new Error("tts_missing_audio")
  return {
    audio: Buffer.from(json.data, "base64"),
    durationSeconds:
      typeof json?.addition?.duration === "number" && Number.isFinite(json.addition.duration)
        ? json.addition.duration / 1000
        : null,
  }
}

async function uploadAudio(env, filePath, audio) {
  const baseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || env.IPgongchang_SUPABASE_URL || "").trim().replace(/\/$/, "")
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.IPgongchang_SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!baseUrl || !serviceKey) throw new Error("supabase_env_missing")

  const objectPath = filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")

  const res = await fetch(`${baseUrl}/storage/v1/object/${VOICE_COACH_AUDIO_BUCKET}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "x-upsert": "true",
      "Content-Type": "audio/mpeg",
    },
    body: audio,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || `storage_upload_http_${res.status}`)
  }
}

async function main() {
  const env = {
    ...readEnv(path.join(process.cwd(), "envpull.txt")),
    ...readEnv(path.join(process.cwd(), ".env.local")),
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  for (const text of OPENINGS) {
    const filePath = openingPath("objection_safety", text)
    const { data: signed, error: signError } = await supabase.storage
      .from(VOICE_COACH_AUDIO_BUCKET)
      .createSignedUrl(filePath, 60)

    if (!signError && signed?.signedUrl) {
      console.log(`skip ${filePath}`)
      continue
    }

    const result = await tts(env, text)
    await uploadAudio(env, filePath, result.audio)
    console.log(`seeded ${filePath} (${result.durationSeconds || "?"}s)`)
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err))
  process.exit(1)
})
