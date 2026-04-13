import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import { gunzipSync, gzipSync } from "node:zlib"

let MockWebSocket: any

vi.mock("ws", () => {
  MockWebSocket = class MockWebSocket {
    static instances: MockWebSocket[] = []

    url: string
    options: any
    readyState = 0
    sent: Buffer[] = []
    private listeners = new Map<string, Set<(...args: any[]) => void>>()

    constructor(url: string, options: any) {
      this.url = url
      this.options = options
      MockWebSocket.instances.push(this)
    }

    on(event: string, listener: (...args: any[]) => void): void {
      const bucket = this.listeners.get(event) || new Set()
      bucket.add(listener)
      this.listeners.set(event, bucket)
    }

    once(event: string, listener: (...args: any[]) => void): void {
      const wrapped = (...args: any[]) => {
        this.off(event, wrapped)
        listener(...args)
      }
      this.on(event, wrapped)
    }

    off(event: string, listener: (...args: any[]) => void): void {
      this.listeners.get(event)?.delete(listener)
    }

    send(data: Buffer, callback?: (error?: Error) => void): void {
      this.sent.push(Buffer.from(data))
      callback?.()
    }

    close(_code?: number, _reason?: string): void {
      this.readyState = 3
      this.emit("close")
    }

    emit(event: string, ...args: any[]): void {
      for (const listener of this.listeners.get(event) || []) {
        listener(...args)
      }
    }
  }

  return {
    __esModule: true,
    default: MockWebSocket,
    WebSocket: MockWebSocket,
  }
})

const buildFrame = (messageType: number, flags: number, serialization: number, compression: number, payload: Buffer) => {
  const header = Buffer.alloc(4)
  header[0] = 0x11
  header[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f)
  header[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f)
  header[3] = 0x00
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length, 0)
  return Buffer.concat([header, size, payload])
}

const buildJsonResponse = (payload: unknown, sequence: number) => {
  const json = Buffer.from(JSON.stringify(payload), "utf8")
  const gz = gzipSync(json)
  return buildFrame(0x09, sequence < 0 ? 0x02 : 0x00, 0x01, 0x01, gz)
}

const buildRealtimeJsonResponse = (payload: unknown, sequence: number, options?: { final?: boolean; flags?: number }) => {
  const header = Buffer.alloc(4)
  header[0] = 0x11
  const flags = typeof options?.flags === "number" ? options.flags : options?.final ? 0x03 : 0x01
  header[1] = ((0x09 & 0x0f) << 4) | flags
  header[2] = ((0x01 & 0x0f) << 4) | 0x00
  header[3] = 0x00
  const seq = Buffer.alloc(4)
  seq.writeInt32BE(sequence, 0)
  const json = Buffer.from(JSON.stringify(payload), "utf8")
  const size = Buffer.alloc(4)
  size.writeUInt32BE(json.length, 0)
  return Buffer.concat([header, seq, size, json])
}

const parseInitialRequest = (buffer: Buffer) => {
  const payloadSize = buffer.readUInt32BE(4)
  const payload = gunzipSync(buffer.subarray(8, 8 + payloadSize))
  return JSON.parse(payload.toString("utf8"))
}

describe("StreamingAsr", () => {
  beforeEach(() => {
    if (MockWebSocket) {
      MockWebSocket.instances = []
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("sends the full request, streams partials, and resolves final results", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const partials: string[] = []
    const finals: any[] = []
    const errors: Error[] = []

    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      resourceId: "resource-id",
      timeoutMs: 500,
      onPartial: (text) => partials.push(text),
      onFinal: (result) => finals.push(result),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    expect(ws.url).toBe("wss://openspeech.bytedance.com/api/v3/sauc/bigmodel")
    expect(ws.options.headers).toMatchObject({
      "X-Api-App-Key": "app-id",
      "X-Api-Access-Key": "access-token",
      "X-Api-Resource-Id": "resource-id",
    })

    ws.emit("open")
    await connectPromise

    expect(ws.sent).toHaveLength(1)
    const initialRequest = parseInitialRequest(ws.sent[0])
    expect(initialRequest.app).toMatchObject({
      appid: "app-id",
      token: "access-token",
      cluster: "resource-id",
    })
    expect(initialRequest.audio).toMatchObject({
      format: "raw",
      codec: "raw",
      rate: 16000,
      bits: 16,
      channel: 1,
    })

    client.sendAudio(Buffer.from("hello"))
    expect(ws.sent).toHaveLength(2)
    expect(ws.sent[1].readUInt32BE(4)).toBeGreaterThan(0)

    ws.emit(
      "message",
      buildJsonResponse(
        {
          reqid: "req-1",
          code: 1000,
          message: "Success",
          sequence: 1,
          result: [
            {
              text: "你好，",
              confidence: 88,
              utterances: [{ definite: false, text: "你好，", start_time: 0, end_time: 500 }],
            },
          ],
          addition: { duration: "500" },
        },
        1,
      ),
    )

    expect(partials).toEqual(["你好，"])

    const finalPromise = client.finish()
    expect(ws.sent).toHaveLength(3)

    ws.emit(
      "message",
      buildJsonResponse(
        {
          reqid: "req-1",
          code: 1000,
          message: "Success",
          sequence: -2,
          result: [
            {
              text: "你好，世界。",
              confidence: 95,
              utterances: [{ definite: true, text: "你好，世界。", start_time: 0, end_time: 900 }],
            },
          ],
          addition: { duration: "900" },
        },
        -2,
      ),
    )

    await expect(finalPromise).resolves.toEqual({
      text: "你好，世界。",
      confidence: 95,
      durationSeconds: 0.9,
    })
    expect(finals).toEqual([
      {
        text: "你好，世界。",
        confidence: 95,
        durationSeconds: 0.9,
      },
    ])
    expect(errors).toEqual([])
    expect(client.isConnected).toBe(false)
  })

  it("aborts the socket and rejects pending finish work", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const errors: Error[] = []
    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      timeoutMs: 500,
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    ws.emit("open")
    await connectPromise

    const finishPromise = client.finish()
    client.abort()

    await expect(finishPromise).rejects.toThrow("streaming_asr_aborted")
    expect(errors).toEqual([])
    expect(ws.readyState).toBe(3)
  })

  it("parses the realtime protocol sequence-prefixed payloads from Volcengine", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const partials: string[] = []
    const finals: any[] = []
    const errors: Error[] = []

    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      timeoutMs: 500,
      onPartial: (text) => partials.push(text),
      onFinal: (result) => finals.push(result),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    ws.emit("open")
    await connectPromise

    ws.emit(
      "message",
      buildRealtimeJsonResponse(
        {
          audio_info: { duration: 1600 },
          result: {
            text: "医生说美容院不能",
            utterances: [{ definite: false, text: "医生说美容院不能", start_time: 422, end_time: 1442 }],
          },
        },
        10,
      ),
    )

    expect(partials).toEqual(["医生说美容院不能"])

    const finalPromise = client.finish()
    ws.emit(
      "message",
      buildRealtimeJsonResponse(
        {
          audio_info: { duration: 3200 },
          result: {
            text: "医生说美容院不能按胸，这安全吗？",
            utterances: [{ definite: true, text: "医生说美容院不能按胸，这安全吗？", start_time: 422, end_time: 2882 }],
          },
        },
        18,
        { final: true },
      ),
    )

    await expect(finalPromise).resolves.toEqual({
      text: "医生说美容院不能按胸，这安全吗？",
      confidence: 0,
      durationSeconds: 3.2,
    })
    expect(finals).toEqual([
      {
        text: "医生说美容院不能按胸，这安全吗？",
        confidence: 0,
        durationSeconds: 3.2,
      },
    ])
    expect(errors).toEqual([])
  })

  it("accepts realtime final frames that use the 0x02 flag", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const finals: any[] = []
    const errors: Error[] = []

    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      timeoutMs: 500,
      onPartial: vi.fn(),
      onFinal: (result) => finals.push(result),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    ws.emit("open")
    await connectPromise

    const finalPromise = client.finish()
    ws.emit(
      "message",
      buildRealtimeJsonResponse(
        {
          audio_info: { duration: 2800 },
          result: {
            text: "这个流程我还想再确认一下。",
            utterances: [{ definite: true, text: "这个流程我还想再确认一下。", start_time: 0, end_time: 2800 }],
          },
        },
        -7,
        { flags: 0x02 },
      ),
    )

    await expect(finalPromise).resolves.toEqual({
      text: "这个流程我还想再确认一下。",
      confidence: 0,
      durationSeconds: 2.8,
    })
    expect(finals).toEqual([
      {
        text: "这个流程我还想再确认一下。",
        confidence: 0,
        durationSeconds: 2.8,
      },
    ])
    expect(errors).toEqual([])
  })

  it("does not finalize the whole stream when a partial utterance is marked definite", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const partials: string[] = []
    const finals: any[] = []
    const errors: Error[] = []

    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      timeoutMs: 500,
      onPartial: (text) => partials.push(text),
      onFinal: (result) => finals.push(result),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    ws.emit("open")
    await connectPromise

    ws.emit(
      "message",
      buildRealtimeJsonResponse(
        {
          audio_info: { duration: 4200 },
          result: {
            text: "这段话前半句已经稳定了",
            utterances: [{ definite: true, text: "这段话前半句已经稳定了", start_time: 0, end_time: 4200 }],
          },
        },
        12,
      ),
    )

    expect(partials).toEqual(["这段话前半句已经稳定了"])
    expect(finals).toEqual([])
    expect(client.isConnected).toBe(true)

    const finalPromise = client.finish()
    ws.emit(
      "message",
      buildRealtimeJsonResponse(
        {
          audio_info: { duration: 6800 },
          result: {
            text: "这段话前半句已经稳定了，后半句也应该继续识别。",
            utterances: [{ definite: true, text: "这段话前半句已经稳定了，后半句也应该继续识别。", start_time: 0, end_time: 6800 }],
          },
        },
        18,
        { final: true },
      ),
    )

    await expect(finalPromise).resolves.toEqual({
      text: "这段话前半句已经稳定了，后半句也应该继续识别。",
      confidence: 0,
      durationSeconds: 6.8,
    })
    expect(finals).toEqual([
      {
        text: "这段话前半句已经稳定了，后半句也应该继续识别。",
        confidence: 0,
        durationSeconds: 6.8,
      },
    ])
    expect(errors).toEqual([])
  })

  it("sends mp3 sessions with an mp3 codec", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      format: "mp3",
      timeoutMs: 500,
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    ws.emit("open")
    await connectPromise

    const initialRequest = parseInitialRequest(ws.sent[0])
    expect(initialRequest.audio).toMatchObject({
      format: "mp3",
      codec: "mp3",
    })
  })

  it("times out if the websocket never opens", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const errors: Error[] = []
    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      timeoutMs: 25,
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    await expect(connectPromise).rejects.toThrow("streaming_asr_connect_timeout")
    expect(errors.map((error) => error.message)).toContain("streaming_asr_connect_timeout")
  })

  it("surfaces upgrade failure details from the server response body", async () => {
    const { StreamingAsr } = await import("../pipeline/streaming-asr.js")

    const errors: Error[] = []
    const client = new StreamingAsr({
      appId: "app-id",
      accessToken: "access-token",
      timeoutMs: 500,
      onPartial: vi.fn(),
      onFinal: vi.fn(),
      onError: (error) => errors.push(error),
    })

    const connectPromise = client.connect()
    const ws = MockWebSocket.instances[0]
    const response = new EventEmitter() as EventEmitter & { statusCode?: number }
    response.statusCode = 400

    ws.emit("unexpected-response", {}, response)
    response.emit("data", Buffer.from(JSON.stringify({ error: "resourceId volc.seedasr.sauc.duration is not allowed" })))
    response.emit("end")

    await expect(connectPromise).rejects.toThrow("resourceId volc.seedasr.sauc.duration is not allowed")
    expect(errors.map((error) => error.message)).toContain(
      "streaming_asr_upgrade_failed_400:resourceId volc.seedasr.sauc.duration is not allowed",
    )
  })
})
