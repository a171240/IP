import "server-only"

import {
  cleanText,
  isRecord,
  type ServiceRecordSegmentRow,
} from "@/lib/aliyun-rds/repositories/service-records.server"
import {
  createAliyunRdsServiceRecordOssSignedGetUrl,
  isAliyunRdsServiceRecordOssBucket,
} from "@/lib/aliyun-rds/service-record-oss.server"

const BAILIAN_TRANSCRIPTION_URL = "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
const BAILIAN_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks"

type BailianJson = Record<string, any>

export type AliyunRdsBailianSubmitResult = {
  provider: "bailian"
  model: string
  taskId: string
  taskStatus: string
  requestId: string
  submittedAt: string
  raw: BailianJson
}

export type AliyunRdsBailianPollResult = {
  provider: "bailian"
  taskId: string
  taskStatus: string
  requestId: string
  text: string
  transcription: unknown
  raw: BailianJson
}

function envText(...names: string[]) {
  for (const name of names) {
    const value = cleanText(process.env[name], 500)
    if (value) return value
  }
  return ""
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function envBoolean(name: string, fallback: boolean) {
  const value = cleanText(process.env[name], 20).toLowerCase()
  if (!value) return fallback
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function parseCsv(value: string, fallback: string[]) {
  const items = value
    .split(",")
    .map((item) => cleanText(item, 20).toLowerCase())
    .filter(Boolean)
  return items.length ? items : fallback
}

function getBailianApiKey() {
  return envText("DASHSCOPE_API_KEY", "BAILIAN_API_KEY", "ALIBABA_CLOUD_BAILIAN_API_KEY")
}

export function isAliyunRdsBailianAsrConfigured() {
  return Boolean(getBailianApiKey())
}

export function getAliyunRdsBailianAsrModel() {
  return envText("BAILIAN_ASR_MODEL", "DASHSCOPE_ASR_MODEL") || "paraformer-v2"
}

function buildHeaders(asyncTask = false) {
  const apiKey = getBailianApiKey()
  if (!apiKey) throw new Error("bailian_api_key_missing")

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }
  if (asyncTask) headers["X-DashScope-Async"] = "enable"

  const workspace = envText("DASHSCOPE_WORKSPACE", "BAILIAN_WORKSPACE_ID")
  if (workspace) headers["X-DashScope-WorkSpace"] = workspace

  return headers
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const json = (await res.json().catch(() => null)) as BailianJson | null
    if (!res.ok) {
      const message = cleanText(json?.message || json?.code, 200) || `bailian_http_${res.status}`
      throw new Error(message)
    }
    if (!json || !isRecord(json)) throw new Error("bailian_invalid_response")
    if (json.code || json.message) throw new Error(cleanText(json.message || json.code, 200) || "bailian_error")
    return json
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("bailian_timeout")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function transcriptionParameters() {
  const model = getAliyunRdsBailianAsrModel()
  const params: Record<string, unknown> = {
    channel_id: [0],
    disfluency_removal_enabled: envBoolean("BAILIAN_ASR_DISFLUENCY_REMOVAL_ENABLED", false),
    timestamp_alignment_enabled: envBoolean("BAILIAN_ASR_TIMESTAMP_ALIGNMENT_ENABLED", false),
  }

  if (model === "paraformer-v2") {
    params.language_hints = parseCsv(envText("BAILIAN_ASR_LANGUAGE_HINTS"), ["zh", "yue", "en"])
  }

  if (envBoolean("BAILIAN_ASR_DIARIZATION_ENABLED", true)) {
    params.diarization_enabled = true
    params.speaker_count = envNumber("BAILIAN_ASR_SPEAKER_COUNT", 3, 2, 10)
  }

  return params
}

export async function createAliyunRdsSignedAudioUrlForBailian(segment: ServiceRecordSegmentRow) {
  const storagePath = cleanText(segment.storage_path, 2000)
  if (!storagePath) throw new Error("missing_storage_path")
  const metadata = isRecord(segment.metadata) ? segment.metadata : {}
  if (metadata.storage_provider !== "aliyun_oss" && !isAliyunRdsServiceRecordOssBucket(segment.storage_bucket)) {
    throw new Error("aliyun_oss_audio_required")
  }
  return createAliyunRdsServiceRecordOssSignedGetUrl(storagePath)
}

export async function submitAliyunRdsBailianAsrTask(audioUrl: string): Promise<AliyunRdsBailianSubmitResult> {
  const model = getAliyunRdsBailianAsrModel()
  const timeoutMs = envNumber("BAILIAN_ASR_SUBMIT_TIMEOUT_MS", 12000, 1000, 60000)
  const json = await fetchJson(
    BAILIAN_TRANSCRIPTION_URL,
    {
      method: "POST",
      headers: buildHeaders(true),
      body: JSON.stringify({
        model,
        input: {
          file_urls: [audioUrl],
        },
        parameters: transcriptionParameters(),
      }),
    },
    timeoutMs,
  )

  const output = isRecord(json.output) ? json.output : {}
  const taskId = cleanText(output.task_id, 160)
  if (!taskId) throw new Error("bailian_missing_task_id")

  return {
    provider: "bailian",
    model,
    taskId,
    taskStatus: cleanText(output.task_status, 60) || "PENDING",
    requestId: cleanText(json.request_id, 160),
    submittedAt: new Date().toISOString(),
    raw: json,
  }
}

async function fetchTranscription(url: string) {
  const timeoutMs = envNumber("BAILIAN_ASR_RESULT_FETCH_TIMEOUT_MS", 12000, 1000, 60000)
  return fetchJson(url, { method: "GET" }, timeoutMs)
}

function collectTranscriptText(transcription: unknown) {
  if (!isRecord(transcription)) return ""
  const transcripts = Array.isArray(transcription.transcripts) ? transcription.transcripts : []
  const texts: string[] = []
  for (const transcript of transcripts) {
    if (!isRecord(transcript)) continue
    const paragraph = cleanText(transcript.text, 100000)
    if (paragraph) {
      texts.push(paragraph)
      continue
    }
    const sentences = Array.isArray(transcript.sentences) ? transcript.sentences : []
    const sentenceText = sentences.map((sentence) => (isRecord(sentence) ? cleanText(sentence.text, 5000) : "")).filter(Boolean).join("")
    if (sentenceText) texts.push(sentenceText)
  }
  return texts.join("\n").trim()
}

export async function queryAliyunRdsBailianAsrTask(taskId: string): Promise<AliyunRdsBailianPollResult> {
  const normalizedTaskId = cleanText(taskId, 160)
  if (!normalizedTaskId) throw new Error("bailian_missing_task_id")

  const timeoutMs = envNumber("BAILIAN_ASR_QUERY_TIMEOUT_MS", 12000, 1000, 60000)
  const json = await fetchJson(`${BAILIAN_TASK_URL}/${encodeURIComponent(normalizedTaskId)}`, {
    method: "POST",
    headers: buildHeaders(false),
  }, timeoutMs)

  const output = isRecord(json.output) ? json.output : {}
  const taskStatus = cleanText(output.task_status, 60) || "UNKNOWN"
  let transcription: unknown = null
  let text = ""

  if (taskStatus === "SUCCEEDED") {
    const results = Array.isArray(output.results) ? output.results : []
    const transcriptions = []
    for (const result of results) {
      if (!isRecord(result)) continue
      if (cleanText(result.subtask_status, 40) !== "SUCCEEDED") continue
      const transcriptionUrl = cleanText(result.transcription_url, 2000)
      if (!transcriptionUrl) continue
      const item = await fetchTranscription(transcriptionUrl)
      transcriptions.push(item)
    }
    transcription = transcriptions.length === 1 ? transcriptions[0] : transcriptions
    text = transcriptions.map((item) => collectTranscriptText(item)).filter(Boolean).join("\n").trim()
  }

  return {
    provider: "bailian",
    taskId: normalizedTaskId,
    taskStatus,
    requestId: cleanText(json.request_id, 160),
    text,
    transcription,
    raw: json,
  }
}
