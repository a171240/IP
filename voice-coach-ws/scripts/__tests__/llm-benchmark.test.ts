import { describe, expect, it, vi } from "vitest"

import {
  defaultBenchmarkMessages,
  discoverDefaultTargets,
  runSingleBenchmark,
  summarizeResults,
  type BenchmarkTarget,
} from "../lib/llm-benchmark.js"

function makeSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  })
}

function nextNow(sequence: number[]): () => number {
  let index = 0
  return () => {
    const value = sequence[index]
    index += 1
    if (typeof value !== "number") {
      throw new Error("Unexpected now() call")
    }
    return value
  }
}

const target: BenchmarkTarget = {
  name: "deepseek",
  label: "DeepSeek V3",
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
  source: "env",
}

describe("discoverDefaultTargets", () => {
  it("includes DeepSeek V3 by default when DEEPSEEK_API_KEY is present", () => {
    const targets = discoverDefaultTargets({
      NODE_ENV: "test",
      DEEPSEEK_API_KEY: "secret",
    })

    expect(targets).toEqual([
      expect.objectContaining({
        name: "deepseek",
        label: "DeepSeek V3",
        baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      }),
    ])
  })
})

describe("runSingleBenchmark", () => {
  it("measures TTFT and total latency from streamed SSE chunks", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      makeSseResponse([
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    )

    const result = await runSingleBenchmark(
      target,
      {
        iterations: 1,
        timeoutMs: 5_000,
        temperature: 0,
        messages: defaultBenchmarkMessages,
      },
      1,
      {
        fetchImpl,
        now: nextNow([0, 120, 420]),
      },
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
    expect(result.ttftMs).toBe(120)
    expect(result.totalLatencyMs).toBe(420)
    expect(result.outputChars).toBe(5)
    expect(result.error).toBeUndefined()
  })

  it("captures HTTP failures without throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    )

    const result = await runSingleBenchmark(
      target,
      {
        iterations: 1,
        timeoutMs: 5_000,
        temperature: 0,
        messages: defaultBenchmarkMessages,
      },
      1,
      {
        fetchImpl,
        now: nextNow([0, 85]),
      },
    )

    expect(result.success).toBe(false)
    expect(result.ttftMs).toBeNull()
    expect(result.totalLatencyMs).toBe(85)
    expect(result.error).toContain("429:rate limited")
  })
})

describe("summarizeResults", () => {
  it("aggregates success and failure counts per target/model", () => {
    const summaries = summarizeResults([
      {
        targetName: "deepseek",
        targetLabel: "DeepSeek V3",
      model: "deepseek-chat",
        iteration: 1,
        success: true,
        ttftMs: 100,
        totalLatencyMs: 400,
        outputChars: 20,
        startedAt: "2026-03-21T00:00:00.000Z",
      },
      {
        targetName: "deepseek",
        targetLabel: "DeepSeek V3",
      model: "deepseek-chat",
        iteration: 2,
        success: false,
        ttftMs: null,
        totalLatencyMs: 150,
        outputChars: 0,
        startedAt: "2026-03-21T00:00:01.000Z",
        error: "429:rate limited",
      },
    ])

    expect(summaries).toEqual([
      expect.objectContaining({
        targetName: "deepseek",
        successCount: 1,
        failureCount: 1,
        avgTtftMs: 100,
        avgTotalLatencyMs: 400,
        firstError: "429:rate limited",
      }),
    ])
  })
})
