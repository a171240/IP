import { randomUUID } from "node:crypto"
import type { IncomingMessage } from "node:http"
import { gunzipSync, gzipSync } from "node:zlib"
import WebSocket from "ws"

export type StreamingAsrResult = {
  text: string
  confidence: number
  durationSeconds: number
}

export interface StreamingAsrOptions {
  appId: string
  accessToken: string
  resourceId?: string
  sampleRate?: number
  format?: "pcm" | "mp3"
  timeoutMs?: number
  onPartial: (text: string) => void
  onFinal: (result: { text: string; confidence: number; durationSeconds: number }) => void
  onError: (error: Error) => void
}

type SocketLike = {
  on(event: "open" | "close" | "error" | "message" | "unexpected-response", listener: (...args: any[]) => void): void
  once(event: "open" | "close" | "error" | "message" | "unexpected-response", listener: (...args: any[]) => void): void
  send(data: Buffer, callback?: (error?: Error) => void): void
  close(code?: number, reason?: string): void
  removeAllListeners(): void
  readyState: number
}

type AsrUtterance = {
  definite?: boolean
  text?: string
  start_time?: number
  end_time?: number
}

type AsrResultItem = {
  text?: string
  confidence?: number
  utterances?: AsrUtterance[]
}

type AsrResponse = {
  reqid?: string
  code?: number
  message?: string
  sequence?: number
  isFinal?: boolean
  result?: AsrResultItem | AsrResultItem[]
  addition?: {
    duration?: string | number
    logid?: string
  }
  audio_info?: {
    duration?: string | number
  }
}

const ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"
const DEFAULT_TIMEOUT_MS = 12_000

function toNumber(input: unknown, fallback = 0): number {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function encodeHeader({
  messageType,
  flags,
  serialization,
  compression,
}: {
  messageType: number
  flags: number
  serialization: number
  compression: number
}): Buffer {
  const header = Buffer.allocUnsafe(4)
  header[0] = 0x11
  header[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f)
  header[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f)
  header[3] = 0x00
  return header
}

function encodeFrame(header: Buffer, payload: Buffer): Buffer {
  const size = Buffer.allocUnsafe(4)
  size.writeUInt32BE(payload.length, 0)
  return Buffer.concat([header, size, payload])
}

function encodeJsonPayload(payload: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))
}

function encodeAudioPayload(payload: Buffer): Buffer {
  return gzipSync(payload)
}

function decodePayload(buffer: Buffer, compression: number): Buffer {
  if (compression === 0x01) {
    return gunzipSync(buffer)
  }
  return buffer
}

function readFrame(buffer: Buffer): {
  version: number
  headerSize: number
  messageType: number
  flags: number
  serialization: number
  compression: number
  sequence?: number
  payload: Buffer
} {
  if (buffer.length < 8) {
    throw new Error("streaming_asr_invalid_frame")
  }

  const version = buffer.readUInt8(0) >> 4
  const headerSize = buffer.readUInt8(0) & 0x0f
  const messageType = buffer.readUInt8(1) >> 4
  const flags = buffer.readUInt8(1) & 0x0f
  const serialization = buffer.readUInt8(2) >> 4
  const compression = buffer.readUInt8(2) & 0x0f
  const headerBytes = headerSize * 4
  const hasSequencePrefix =
    messageType === 0x09 &&
    (flags === 0x01 || flags === 0x03 || (flags === 0x02 && compression === 0x00))

  if (buffer.length < headerBytes + (hasSequencePrefix ? 8 : 4)) {
    throw new Error("streaming_asr_invalid_frame")
  }

  const sequence = hasSequencePrefix ? buffer.readInt32BE(4) : undefined
  const payloadSize = hasSequencePrefix ? buffer.readUInt32BE(8) : buffer.readUInt32BE(4)
  const payloadStart = headerBytes + (hasSequencePrefix ? 8 : 4)

  if (buffer.length < payloadStart + payloadSize) {
    throw new Error("streaming_asr_truncated_frame")
  }

  return {
    version,
    headerSize,
    messageType,
    flags,
    serialization,
    compression,
    sequence,
    payload: buffer.subarray(payloadStart, payloadStart + payloadSize),
  }
}

function parseResponse(buffer: Buffer): AsrResponse {
  const frame = readFrame(buffer)
  if (frame.messageType === 0x0f) {
    const errCode = frame.payload.readUInt32BE(0)
    const errSize = frame.payload.readUInt32BE(4)
    const message = frame.payload.subarray(8, 8 + errSize).toString("utf8")
    throw new Error(`streaming_asr_server_error_${errCode}${message ? `:${message}` : ""}`)
  }

  if (frame.messageType !== 0x09) {
    throw new Error(`streaming_asr_unexpected_message_type_${frame.messageType}`)
  }

  const decoded = decodePayload(frame.payload, frame.compression)
  const parsed = JSON.parse(decoded.toString("utf8")) as AsrResponse
  parsed.sequence = typeof frame.sequence === "number" ? frame.sequence : parsed.sequence
  parsed.isFinal = frame.flags === 0x02 || frame.flags === 0x03 || (parsed.sequence ?? 0) < 0
  return parsed
}

function toResultItems(response: AsrResponse): AsrResultItem[] {
  if (Array.isArray(response.result)) return response.result
  if (response.result && typeof response.result === "object") return [response.result]
  return []
}

function extractText(response: AsrResponse): string {
  const parts: string[] = []
  for (const item of toResultItems(response)) {
    if (typeof item?.text === "string" && item.text.trim()) {
      parts.push(item.text.trim())
      continue
    }
    for (const utterance of item?.utterances || []) {
      if (typeof utterance?.text === "string" && utterance.text.trim()) {
        parts.push(utterance.text.trim())
      }
    }
  }
  return parts.join("")
}

function extractConfidence(response: AsrResponse): number {
  for (const item of toResultItems(response)) {
    if (typeof item?.confidence === "number" && Number.isFinite(item.confidence)) {
      return item.confidence
    }
  }
  return 0
}

function extractDurationSeconds(response: AsrResponse): number {
  const fromAudioInfo = toNumber(response.audio_info?.duration, 0)
  if (fromAudioInfo > 0) return fromAudioInfo / 1000

  const fromAddition = toNumber(response.addition?.duration, 0)
  if (fromAddition > 0) return fromAddition / 1000

  let lastEndTime = 0
  for (const item of toResultItems(response)) {
    for (const utterance of item?.utterances || []) {
      lastEndTime = Math.max(lastEndTime, toNumber(utterance?.end_time, 0))
    }
  }
  return lastEndTime > 0 ? lastEndTime / 1000 : 0
}

function formatUnexpectedUpgradeError(statusCode: number | undefined, body: string): Error {
  const prefix = typeof statusCode === "number" ? `streaming_asr_upgrade_failed_${statusCode}` : "streaming_asr_upgrade_failed"
  const trimmed = body.trim()
  if (!trimmed) {
    return new Error(prefix)
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown }
    const detail =
      typeof parsed.error === "string" && parsed.error.trim()
        ? parsed.error.trim()
        : typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : trimmed
    return new Error(`${prefix}:${detail}`)
  } catch {
    return new Error(`${prefix}:${trimmed}`)
  }
}

function collectUnexpectedResponseBody(response: IncomingMessage, onDone: (body: string) => void): void {
  const chunks: Buffer[] = []

  response.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  response.on("end", () => {
    onDone(Buffer.concat(chunks).toString("utf8"))
  })
  response.on("error", () => {
    onDone("")
  })
}

/**
 * Streaming ASR client for Doubao/Volcengine websocket recognition.
 */
export class StreamingAsr {
  private readonly appId: string
  private readonly accessToken: string
  private readonly resourceId: string
  private readonly sampleRate: number
  private readonly format: "pcm" | "mp3"
  private readonly timeoutMs: number
  private readonly onPartial: (text: string) => void
  private readonly onFinal: (result: StreamingAsrResult) => void
  private readonly onError: (error: Error) => void
  private readonly requestId: string

  private socket: SocketLike | null = null
  private state: "idle" | "connecting" | "open" | "closed" = "idle"
  private connectPromise: Promise<void> | null = null
  private connectResolve: (() => void) | null = null
  private connectReject: ((error: Error) => void) | null = null
  private finishPromise: Promise<StreamingAsrResult> | null = null
  private finishResolve: ((result: StreamingAsrResult) => void) | null = null
  private finishReject: ((error: Error) => void) | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private operationTimer: ReturnType<typeof setTimeout> | null = null
  private initialRequestSent = false
  private finishRequested = false
  private finalPacketSent = false
  private finalResult: StreamingAsrResult | null = null
  private aborted = false
  private lastPartialText = ""
  private audioSequence = 0
  private pendingAudio: Buffer[] = []

  constructor(options: StreamingAsrOptions) {
    this.appId = options.appId.trim()
    this.accessToken = options.accessToken.trim()
    this.resourceId = (options.resourceId || "volc.bigasr.sauc.duration").trim()
    this.sampleRate = Math.max(8000, Math.round(options.sampleRate || 16000))
    this.format = options.format || "pcm"
    this.timeoutMs = Math.max(1000, Math.round(options.timeoutMs || DEFAULT_TIMEOUT_MS))
    this.onPartial = options.onPartial
    this.onFinal = options.onFinal
    this.onError = options.onError
    this.requestId = randomUUID()
  }

  /**
   * Opens the websocket connection and sends the full client request.
   */
  async connect(): Promise<void> {
    if (this.state !== "idle") {
      if (this.connectPromise) return this.connectPromise
      throw new Error("streaming_asr_already_started")
    }

    if (!this.appId) throw new Error("streaming_asr_app_id_missing")
    if (!this.accessToken) throw new Error("streaming_asr_access_token_missing")

    this.state = "connecting"
    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject
    })

    this.connectTimer = setTimeout(() => {
      this.handleError(new Error("streaming_asr_connect_timeout"))
    }, this.timeoutMs)

    const socket = new WebSocket(ASR_URL, {
      headers: {
        "X-Api-App-Key": this.appId,
        "X-Api-Access-Key": this.accessToken,
        "X-Api-Resource-Id": this.resourceId,
      },
      perMessageDeflate: false,
      handshakeTimeout: this.timeoutMs,
    }) as unknown as SocketLike

    this.socket = socket

    socket.on("open", () => {
      if (this.aborted || this.state === "closed") return
      this.state = "open"
      this.clearConnectTimer()
      this.sendInitialRequest()
      this.flushPendingAudio()
      this.resolveConnect()
      if (this.finishRequested && !this.finalPacketSent) {
        this.sendFinalPacket()
      }
    })

    socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
      if (this.aborted || this.state === "closed") return
      const payload = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data.map((item) => (Buffer.isBuffer(item) ? item : Buffer.from(item))))
          : Buffer.from(data)

      try {
        const response = parseResponse(payload)
        this.handleResponse(response)
      } catch (error) {
        this.handleError(error instanceof Error ? error : new Error("streaming_asr_parse_error"))
      }
    })

    socket.on("error", (error: Error) => {
      this.handleError(error instanceof Error ? error : new Error("streaming_asr_socket_error"))
    })

    socket.on("unexpected-response", (_request, response: IncomingMessage) => {
      collectUnexpectedResponseBody(response, (body) => {
        this.handleError(formatUnexpectedUpgradeError(response.statusCode, body))
      })
    })

    socket.on("close", () => {
      if (this.state === "closed") return
      if (this.finalResult) {
        this.state = "closed"
        this.cleanupTimers()
        return
      }
      this.handleError(new Error(this.aborted ? "streaming_asr_aborted" : "streaming_asr_closed"))
    })

    return this.connectPromise
  }

  /**
   * Sends one audio chunk to the websocket stream.
   */
  sendAudio(chunk: Buffer): void {
    if (!Buffer.isBuffer(chunk)) {
      throw new Error("streaming_asr_chunk_must_be_buffer")
    }
    if (this.state === "idle") {
      throw new Error("streaming_asr_not_connected")
    }
    if (this.state === "closed") {
      throw new Error("streaming_asr_closed")
    }
    if (this.finishRequested) {
      throw new Error("streaming_asr_already_finishing")
    }

    const copy = Buffer.from(chunk)
    if (this.state === "connecting" || !this.initialRequestSent) {
      this.pendingAudio.push(copy)
      return
    }

    this.sendAudioFrame(copy, false)
  }

  /**
   * Signals the end of the current utterance and resolves with the final ASR result.
   */
  async finish(): Promise<StreamingAsrResult> {
    if (this.state === "idle") {
      throw new Error("streaming_asr_not_connected")
    }
    if (this.finalResult) {
      return this.finalResult
    }
    if (!this.finishPromise) {
      this.finishPromise = new Promise<StreamingAsrResult>((resolve, reject) => {
        this.finishResolve = resolve
        this.finishReject = reject
      })
    }

    this.finishRequested = true
    this.operationTimer ??= setTimeout(() => {
      this.handleError(new Error("streaming_asr_final_timeout"))
    }, this.timeoutMs)

    if (this.state === "open" && this.initialRequestSent) {
      this.sendFinalPacket()
    }

    return this.finishPromise
  }

  /**
   * Aborts the websocket session and rejects any pending work.
   */
  abort(): void {
    if (this.state === "closed") return
    this.aborted = true
    this.state = "closed"
    this.pendingAudio = []
    this.finalResult = null
    this.cleanupTimers()

    if (this.connectReject) {
      this.connectReject(new Error("streaming_asr_aborted"))
      this.connectReject = null
      this.connectResolve = null
    }
    if (this.finishReject) {
      this.finishReject(new Error("streaming_asr_aborted"))
      this.finishReject = null
      this.finishResolve = null
    }

    try {
      this.socket?.close(1000, "abort")
    } catch {
      // Ignore close failures during abort.
    }
  }

  /**
   * Returns whether the underlying websocket is open.
   */
  get isConnected(): boolean {
    return this.state === "open"
  }

  private sendInitialRequest(): void {
    if (this.initialRequestSent || !this.socket) return

    const payload = encodeJsonPayload({
      app: {
        appid: this.appId,
        token: this.accessToken,
        cluster: this.resourceId,
      },
      user: {
        uid: "voice_coach",
      },
      audio: {
        format: this.format === "pcm" ? "raw" : this.format,
        codec: this.format === "pcm" ? "raw" : this.format,
        rate: this.sampleRate,
        bits: 16,
        channel: 1,
        language: "zh-CN",
      },
      request: {
        reqid: this.requestId,
        sequence: 1,
        nbest: 1,
        show_utterances: true,
        result_type: "single",
        vad_signal: true,
        workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
      },
    })

    const frame = encodeFrame(encodeHeader({ messageType: 0x01, flags: 0x00, serialization: 0x01, compression: 0x01 }), payload)
    this.socket.send(frame, (error?: Error) => {
      if (error) this.handleError(error)
    })
    this.initialRequestSent = true
  }

  private flushPendingAudio(): void {
    if (!this.socket || !this.initialRequestSent) return
    const pending = this.pendingAudio
    this.pendingAudio = []
    for (const chunk of pending) {
      this.sendAudioFrame(chunk, false)
    }
  }

  private sendAudioFrame(chunk: Buffer, final: boolean): void {
    if (!this.socket) {
      this.pendingAudio.push(Buffer.from(chunk))
      return
    }
    const header = encodeHeader({
      messageType: 0x02,
      flags: final ? 0x02 : 0x00,
      serialization: 0x00,
      compression: 0x01,
    })
    const payload = encodeAudioPayload(chunk)
    const frame = encodeFrame(header, payload)
    this.socket.send(frame, (error?: Error) => {
      if (error) this.handleError(error)
    })
  }

  private sendFinalPacket(): void {
    if (!this.socket || this.state === "closed") return
    if (this.finalResult) return
    if (this.finalPacketSent) return
    if (this.pendingAudio.length) {
      this.flushPendingAudio()
    }
    this.finalPacketSent = true
    const header = encodeHeader({ messageType: 0x02, flags: 0x02, serialization: 0x00, compression: 0x01 })
    const frame = encodeFrame(header, encodeAudioPayload(Buffer.alloc(0)))
    this.socket.send(frame, (error?: Error) => {
      if (error) this.handleError(error)
    })
  }

  private handleResponse(response: AsrResponse): void {
    if (typeof response.code === "number" && response.code !== 1000 && response.code !== 0) {
      const code = response.code
      throw new Error(`streaming_asr_result_code_${code}`)
    }

    const text = extractText(response)
    const confidence = extractConfidence(response)
    const durationSeconds = extractDurationSeconds(response)
    // Volcengine may mark a sentence as definite before the whole stream is finalized.
    // Only transport-level final frames should close the ASR session; otherwise
    // long utterances get cut off mid-recording and later chunks fail with
    // `streaming_asr_closed`.
    const isFinal = Boolean(response.isFinal)

    if (!isFinal && text && text !== this.lastPartialText) {
      this.lastPartialText = text
      this.onPartial(text)
    }

    if (isFinal && !this.finalResult) {
      const result = { text, confidence, durationSeconds }
      this.finalResult = result
      this.cleanupTimers()
      this.state = "closed"
      this.onFinal(result)
      this.resolveFinish(result)
      try {
        this.socket?.close(1000, "done")
      } catch {
        // Ignore close failures after successful finalization.
      }
    }
  }

  private handleError(error: Error): void {
    if (this.state === "closed" && !this.connectReject && !this.finishReject) {
      return
    }

    this.state = "closed"
    this.cleanupTimers()
    this.pendingAudio = []

    if (this.connectReject) {
      this.connectReject(error)
      this.connectReject = null
      this.connectResolve = null
    }
    if (this.finishReject) {
      this.finishReject(error)
      this.finishReject = null
      this.finishResolve = null
    }

    if (!this.aborted) {
      this.onError(error)
    }

    try {
      this.socket?.close(1000, "error")
    } catch {
      // Ignore close failures during error handling.
    }
  }

  private resolveConnect(): void {
    if (this.connectResolve) {
      this.connectResolve()
      this.connectResolve = null
      this.connectReject = null
    }
  }

  private resolveFinish(result: StreamingAsrResult): void {
    if (this.finishResolve) {
      this.finishResolve(result)
      this.finishResolve = null
      this.finishReject = null
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  private cleanupTimers(): void {
    this.clearConnectTimer()
    if (this.operationTimer) {
      clearTimeout(this.operationTimer)
      this.operationTimer = null
    }
  }
}
