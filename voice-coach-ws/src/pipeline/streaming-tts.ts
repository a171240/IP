export type StreamingTtsEmotion = "neutral" | "happy" | "sad" | "angry"

export interface StreamingTtsOptions {
  appId: string
  accessToken: string
  cluster?: string
  resourceId?: string
  voiceType?: string
  language?: string
  emotion?: StreamingTtsEmotion
  onAudioChunk: (chunk: Buffer) => void
  onDone: () => void
  onError: (error: Error) => void
}

type TtsStreamMessage = {
  code?: number
  message?: string
  data?: string | null
}

const DEFAULT_RESOURCE_ID = "seed-tts-2.0"
const LEGACY_RESOURCE_ID = "volc.service_type.10029"
const DEFAULT_VOICE_TYPE = "zh_female_vv_uranus_bigtts"
const DEFAULT_LANGUAGE = "cn"
const DEFAULT_USER_ID = "voice_coach"
const DEFAULT_SAMPLE_RATE = 24000
const DEFAULT_SILENCE_DURATION = 125
const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"

const EMOTION_MAP: Record<string, StreamingTtsEmotion> = {
  neutral: "neutral",
  happy: "happy",
  sad: "sad",
  angry: "angry",
  worried: "sad",
  skeptical: "neutral",
  impatient: "angry",
  pleased: "happy",
}

function createAbortError(message = "tts_aborted"): Error {
  const error = new Error(message)
  error.name = "AbortError"
  return error
}

function normalizeEmotion(input: unknown): StreamingTtsEmotion {
  if (typeof input !== "string") return "neutral"
  const normalized = input.trim().toLowerCase()
  return EMOTION_MAP[normalized] ?? "neutral"
}

function normalizeText(input: string): string {
  return String(input ?? "").trim()
}

function defaultResourceIdForVoice(voiceType: string): string {
  return voiceType.toLowerCase().includes("bigtts") ? DEFAULT_RESOURCE_ID : LEGACY_RESOURCE_ID
}

function parseStreamLine(input: string): TtsStreamMessage {
  return JSON.parse(input) as TtsStreamMessage
}

function buildRequestBody({
  text,
  voiceType,
}: {
  text: string
  voiceType: string
}): Record<string, unknown> {
  return {
    user: {
      uid: DEFAULT_USER_ID,
    },
    req_params: {
      text,
      speaker: voiceType,
      audio_params: {
        format: "mp3",
        sample_rate: DEFAULT_SAMPLE_RATE,
      },
      additions: JSON.stringify({
        silence_duration: DEFAULT_SILENCE_DURATION,
      }),
    },
  }
}

function parseHttpErrorBody(status: number, body: string): Error {
  const trimmed = body.trim()
  if (!trimmed) return new Error(`tts_http_${status}`)

  try {
    const parsed = JSON.parse(trimmed) as {
      header?: { code?: number; message?: string }
      code?: number
      message?: string
    }
    const message =
      parsed.header?.message ||
      parsed.message ||
      (typeof parsed.header?.code === "number" ? `tts_code_${parsed.header.code}` : undefined) ||
      (typeof parsed.code === "number" ? `tts_code_${parsed.code}` : undefined)
    return new Error(message || `tts_http_${status}`)
  } catch {
    return new Error(trimmed)
  }
}

/**
 * Streaming TTS client backed by Volcengine V3 unidirectional HTTP streaming.
 */
export class StreamingTts {
  private readonly appId: string
  private readonly accessToken: string
  private readonly resourceId: string
  private readonly voiceType: string
  private readonly language: string
  private readonly emotion: StreamingTtsEmotion
  private readonly onAudioChunk: (chunk: Buffer) => void
  private readonly onDone: () => void
  private readonly onError: (error: Error) => void

  private activeController: AbortController | null = null
  private activeResolve: (() => void) | null = null
  private activeReject: ((error: Error) => void) | null = null
  private connected = false
  private aborted = false
  private disposed = false

  constructor(options: StreamingTtsOptions) {
    this.appId = options.appId.trim()
    this.accessToken = options.accessToken.trim()
    this.voiceType = (options.voiceType || DEFAULT_VOICE_TYPE).trim() || DEFAULT_VOICE_TYPE
    this.resourceId = (options.resourceId || defaultResourceIdForVoice(this.voiceType)).trim() || DEFAULT_RESOURCE_ID
    this.language = (options.language || DEFAULT_LANGUAGE).trim() || DEFAULT_LANGUAGE
    this.emotion = normalizeEmotion(options.emotion)
    this.onAudioChunk = options.onAudioChunk
    this.onDone = options.onDone
    this.onError = options.onError
  }

  /**
   * Validates configuration and marks the client ready.
   */
  async connect(): Promise<void> {
    if (this.isConnected) return
    if (!this.appId) throw new Error("tts_app_id_missing")
    if (!this.accessToken) throw new Error("tts_access_token_missing")
    this.connected = true
    this.aborted = false
    this.disposed = false
  }

  /**
   * Sends one synthesis request and resolves when the server signals completion.
   */
  async synthesize(text: string): Promise<void> {
    const normalizedText = normalizeText(text)
    if (!normalizedText) throw new Error("tts_invalid_text")
    if (Buffer.byteLength(normalizedText, "utf8") > 1024) throw new Error("tts_text_too_long")

    await this.connect()
    if (this.activeController) throw new Error("tts_busy")

    const controller = new AbortController()
    this.activeController = controller
    let receivedAudio = false
    let completed = false

    return new Promise<void>(async (resolve, reject) => {
      this.activeResolve = resolve
      this.activeReject = reject

      try {
        const response = await fetch(TTS_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-app-id": this.appId,
            "x-api-access-key": this.accessToken,
            "x-api-resource-id": this.resourceId,
          },
          body: JSON.stringify(
            buildRequestBody({
              text: normalizedText,
              voiceType: this.voiceType,
            }),
          ),
          signal: controller.signal,
        })

        if (!response.ok) {
          const body = await response.text().catch(() => "")
          throw parseHttpErrorBody(response.status, body)
        }
        if (!response.body) {
          throw new Error("tts_missing_stream_body")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf8")
        let textBuffer = ""

        const processLine = (line: string) => {
          const trimmed = line.trim()
          if (!trimmed) return

          const parsed = parseStreamLine(trimmed)
          const code = typeof parsed.code === "number" ? parsed.code : 0
          if (code !== 0 && code !== 20000000) {
            throw new Error(parsed.message || `tts_code_${code}`)
          }

          if (typeof parsed.data === "string" && parsed.data.trim()) {
            const chunk = Buffer.from(parsed.data, "base64")
            if (chunk.length > 0) {
              receivedAudio = true
              this.onAudioChunk(chunk)
            }
          }

          if (code === 20000000) {
            completed = true
            this.finishWithSuccess()
          }
        }

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          textBuffer += decoder.decode(value, { stream: true })
          const lines = textBuffer.split(/\r?\n/)
          textBuffer = lines.pop() || ""
          for (const line of lines) {
            processLine(line)
          }
        }

        textBuffer += decoder.decode()
        if (textBuffer.trim()) {
          processLine(textBuffer)
          textBuffer = ""
        }

        if (!completed) {
          if (!receivedAudio) {
            throw new Error("tts_stream_closed_without_audio")
          }
          this.finishWithSuccess()
        }
      } catch (error) {
        const normalized = this.toError(error, "tts_request_failed")
        if (normalized.name === "AbortError") {
          this.rejectActive(normalized)
          this.resetState()
          return
        }
        this.failRequest(normalized)
      }
    })
  }

  /**
   * Aborts the current request without surfacing an error callback.
   */
  abort(): void {
    if (this.aborted) return
    this.aborted = true
    const controller = this.activeController
    this.activeController = null
    controller?.abort(createAbortError())
    this.rejectActive(createAbortError())
    this.resetState()
  }

  /**
   * Returns whether the client is ready to send requests.
   */
  get isConnected(): boolean {
    return this.connected && !this.aborted && !this.disposed
  }

  private finishWithSuccess(): void {
    if (!this.activeResolve) return
    this.onDone()
    this.activeResolve()
    this.resetState()
  }

  private failRequest(error: Error): void {
    this.onError(error)
    this.rejectActive(error)
    this.resetState()
  }

  private rejectActive(error: Error): void {
    this.activeReject?.(error)
    this.activeResolve = null
    this.activeReject = null
  }

  private resetState(): void {
    this.connected = false
    this.activeController = null
    this.activeResolve = null
    this.activeReject = null
  }

  private toError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) return error
    if (typeof error === "string" && error.trim()) return new Error(error)
    return new Error(fallbackMessage)
  }
}
