import { ReadableStream } from "node:stream/web"
import { beforeEach, describe, expect, it, vi } from "vitest"

function createStreamingResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder()
  return {
    ok: status >= 200 && status < 300,
    status,
    body:
      status >= 200 && status < 300
        ? new ReadableStream<Uint8Array>({
            start(controller) {
              for (const line of lines) {
                controller.enqueue(encoder.encode(`${line}\n`))
              }
              controller.close()
            },
          })
        : null,
    text: async () => lines.join("\n"),
  } as Response
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("StreamingTts", () => {
  it("posts to the V3 endpoint and emits decoded MP3 chunks", async () => {
    const fetchMock = vi.fn(async () =>
      createStreamingResponse([
        JSON.stringify({ code: 0, message: "", data: null }),
        JSON.stringify({ code: 0, message: "", data: Buffer.from("chunk-1").toString("base64") }),
        JSON.stringify({ code: 0, message: "", data: Buffer.from("chunk-2").toString("base64") }),
        JSON.stringify({ code: 20000000, message: "OK", data: null }),
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { StreamingTts } = await import("../pipeline/streaming-tts.js")
    const audioChunks: Buffer[] = []
    const done = vi.fn()
    const errors = vi.fn()
    const client = new StreamingTts({
      appId: "appid",
      accessToken: "token",
      resourceId: "seed-tts-2.0",
      voiceType: "zh_female_xiaohe_uranus_bigtts",
      emotion: "happy",
      onAudioChunk: (chunk: Buffer) => audioChunks.push(chunk),
      onDone: done,
      onError: errors,
    })

    await client.connect()
    await client.synthesize("欢迎光临")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = (fetchMock.mock.calls[0] as any)?.[1] as RequestInit | undefined
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-api-app-id": "appid",
      "x-api-access-key": "token",
      "x-api-resource-id": "seed-tts-2.0",
    })
    const body = JSON.parse(String(init?.body)) as Record<string, any>
    expect(body.req_params).toMatchObject({
      text: "欢迎光临",
      speaker: "zh_female_xiaohe_uranus_bigtts",
    })
    expect(body.req_params.audio_params).toMatchObject({
      format: "mp3",
      sample_rate: 24000,
    })
    expect(typeof body.req_params.additions).toBe("string")
    expect(audioChunks.map((chunk) => chunk.toString("utf8"))).toEqual(["chunk-1", "chunk-2"])
    expect(done).toHaveBeenCalledTimes(1)
    expect(errors).not.toHaveBeenCalled()
  })

  it("derives the seed-tts-2.0 resource for bigtts voices", async () => {
    const fetchMock = vi.fn(async () =>
      createStreamingResponse([JSON.stringify({ code: 20000000, message: "OK", data: null })]),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { StreamingTts } = await import("../pipeline/streaming-tts.js")
    const client = new StreamingTts({
      appId: "appid",
      accessToken: "token",
      voiceType: "zh_female_xiaohe_uranus_bigtts",
      emotion: "pleased" as any,
      onAudioChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    })

    await client.synthesize("继续")
    const init = (fetchMock.mock.calls[0] as any)?.[1] as RequestInit | undefined
    expect(init?.headers).toMatchObject({
      "x-api-resource-id": "seed-tts-2.0",
    })
  })

  it("aborts the active request without calling onError", async () => {
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const error = new Error("tts_aborted")
        error.name = "AbortError"
        init?.signal?.addEventListener("abort", () => reject(error))
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { StreamingTts } = await import("../pipeline/streaming-tts.js")
    const done = vi.fn()
    const errors = vi.fn()
    const client = new StreamingTts({
      appId: "appid",
      accessToken: "token",
      onAudioChunk: vi.fn(),
      onDone: done,
      onError: errors,
    })

    const synthPromise = client.synthesize("中断测试")
    await Promise.resolve()
    client.abort()

    await expect(synthPromise).rejects.toMatchObject({ name: "AbortError" })
    expect(done).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it("rejects on upstream service error chunks", async () => {
    const fetchMock = vi.fn(async () =>
      createStreamingResponse([JSON.stringify({ code: 55000000, message: "resource mismatch", data: null })]),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { StreamingTts } = await import("../pipeline/streaming-tts.js")
    const errors = vi.fn()
    const client = new StreamingTts({
      appId: "appid",
      accessToken: "token",
      onAudioChunk: vi.fn(),
      onDone: vi.fn(),
      onError: errors,
    })

    await expect(client.synthesize("出错测试")).rejects.toThrow("resource mismatch")
    expect(errors).toHaveBeenCalledTimes(1)
  })
})
