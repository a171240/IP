import { afterEach, describe, expect, it, vi } from "vitest"

import { buildAsyncAnalysisPrompt, buildFastReplyPrompt, buildMergedPrompt, streamChat } from "../pipeline/streaming-llm.js"

const baseScenario = {
  id: "objection_safety",
  name: "异议处理·护理项目咨询",
  goal: "在不夸大承诺、不触碰医疗结论、不制造压迫感的前提下，围绕顾客异议完成一次真实沟通。",
  customerPersona: "谨慎、会先说感受再提问题，听到空泛承诺会追问或后撤。",
  businessContext: "你是一家美容机构的美容师，正在介绍护理项目与体验方案。",
  safetyConstraints: ["禁止虚假承诺。", "避免医疗诊断/治疗结论。"],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function makeSseResponse(chunks: string[], init?: { status?: number }): Response {
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
    status: init?.status ?? 200,
    headers: { "content-type": "text/event-stream" },
  })
}

describe("buildMergedPrompt", () => {
  it("includes scenario, history, safety constraints and delimiter contract", () => {
    const prompt = buildMergedPrompt({
      scenario: baseScenario,
      history: [
        { role: "customer", text: "我还是担心安全", emotion: "worried" },
        { role: "beautician", text: "我们会先评估。"},
      ],
      beauticianText: "您最在意的是哪一点？",
    })

    expect(prompt).toHaveLength(2)
    const [system, user] = prompt

    expect(system?.role).toBe("system")
    expect(system?.content).toContain("异议处理·护理项目咨询")
    expect(system?.content).toContain("---ANALYSIS---")
    expect(system?.content).toContain("禁止虚假承诺。")
    expect(user?.content).toContain("顾客（情绪：worried）：我还是担心安全")
    expect(user?.content).toContain("美容师本轮说：您最在意的是哪一点？")
  })
})

describe("buildFastReplyPrompt", () => {
  it("keeps the prompt focused on reply text plus compact meta", () => {
    const prompt = buildFastReplyPrompt({
      scenario: baseScenario,
      history: [{ role: "customer", text: "我还是担心安全", emotion: "worried" }],
      beauticianText: "您最在意的是哪一点？",
      sessionContextText: "顾客显示名：徐老师（仅用于后台识别和报告展示，不进入顾客对美容师的称呼）\n当前训练项目：胶原抗衰护理\n核心顾虑：安全性",
    })

    expect(prompt).toHaveLength(2)
    const [system, user] = prompt
    expect(system?.content).toContain("---META---")
    expect(system?.content).not.toContain("---ANALYSIS---")
    expect(system?.content).not.toContain('"suggestions"')
    expect(system?.content).toContain("只生成下一句顾客回复")
    expect(system?.content).toContain("极简示例")
    expect(system?.content).toContain("当前唯一训练项目：胶原抗衰护理")
    expect(system?.content).toContain("active_service=胶原抗衰护理")
    expect(system?.content).toContain("next_customer_move=")
    expect(system?.content).toContain("不得切换到这些无关服务或身体部位")
    expect(system?.content).toContain("顾客姓名是模拟顾客本人")
    expect(user?.content).toContain("顾客（情绪：worried）：我还是担心安全")
    expect(user?.content).toContain("按规则续写顾客下一句。")
  })

  it("uses training-context-only text as the active service and rotates repeated safety", () => {
    const prompt = buildFastReplyPrompt({
      scenario: baseScenario,
      history: [
        { role: "customer", text: "我还是担心安全", emotion: "worried" },
        { role: "beautician", text: "我们会先评估。" },
        { role: "customer", text: "那会不会有风险？", emotion: "worried" },
      ],
      beauticianText: "很安全，您放心。",
      sessionContextText: [
        "训练任务：抗衰紧致护理；把补水、胶原、紧致讲成一条线；通用知识库",
        "顾客开场原话：我这个年龄需要抗衰吗？和普通补水有什么区别？做几次有效？",
      ].join("\n"),
    })

    const [system] = prompt
    expect(system?.content).toContain("active_service=胶原抗衰护理")
    expect(system?.content).toContain("current_axis=证据验证")
    expect(system?.content).not.toContain("current_axis=安全性")
  })

  it("asks for next-step arrangement after repeated vague sensitive-skin safety loops", () => {
    const prompt = buildFastReplyPrompt({
      scenario: baseScenario,
      history: [
        { role: "customer", text: "我有点敏感，做完会不会更红？", emotion: "worried" },
        { role: "beautician", text: "放心，我们很专业。" },
        { role: "customer", text: "那哪些情况不适合做，要先避开？", emotion: "worried" },
        { role: "beautician", text: "一般都没问题的。" },
        { role: "customer", text: "有没有检测报告或者数据能证明？", emotion: "skeptical" },
      ],
      beauticianText: "做，适合做，非常适合做，成分都标清楚的。",
      sessionContextText: "当前训练项目：胶原抗衰护理\n核心顾虑：敏感肌、安全性、适用边界",
    })

    const [system, user] = prompt
    expect(system?.content).toContain("current_axis=推进决策")
    expect(system?.content).toContain("下一步怎么安排")
    expect(system?.content).toContain("不要再重复问同一个安全问题")
    expect(user?.content).toContain("本轮顾客策略：美容师连续回答偏空泛")
  })
})

describe("buildAsyncAnalysisPrompt", () => {
  it("builds a pure analysis prompt with reply context", () => {
    const prompt = buildAsyncAnalysisPrompt({
      scenario: baseScenario,
      history: [{ role: "beautician", text: "我们会先评估。" }],
      beauticianText: "您最在意的是哪一点？",
      customerText: "我主要担心恢复期和安全性。",
      customerEmotion: "worried",
      tag: "安全",
    })

    expect(prompt).toHaveLength(2)
    const [system, user] = prompt
    expect(system?.content).toContain('"suggestions"')
    expect(system?.content).not.toContain("---META---")
    expect(system?.content).toContain("只输出严格 JSON")
    expect(system?.content).toContain("必须正好 3 条")
    expect(user?.content).toContain("顾客本轮回复：我主要担心恢复期和安全性。")
    expect(user?.content).toContain("顾客情绪：worried")
    expect(user?.content).toContain("话题标签：安全")
  })
})

describe("streamChat", () => {
  it("parses split SSE chunks and emits tokens in order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeSseResponse([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"啊"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)

    const tokens: string[] = []
    const done = vi.fn()
    const error = vi.fn()

    await streamChat([{ role: "user", content: "hello" }], {
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      onToken: (token) => tokens.push(token),
      onDone: done,
      onError: error,
    })

    expect(tokens).toEqual(["你", "好", "啊"])
    expect(done).toHaveBeenCalledWith("你好啊")
    expect(error).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("supports aborting an in-flight stream", async () => {
    const encoder = new TextEncoder()
    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(inner) {
        inner.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\n'))
        // Keep the stream open so the abort path is exercised.
      },
    })

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    )

    const tokens: string[] = []
    const done = vi.fn()
    const error = vi.fn()

    const promise = streamChat([{ role: "user", content: "hello" }], {
      apiKey: "test-key",
      abortSignal: controller.signal,
      onToken: (token) => {
        tokens.push(token)
        controller.abort()
      },
      onDone: done,
      onError: error,
    })

    await expect(promise).rejects.toThrow(/abort|aborted/i)
    expect(tokens).toEqual(["你"])
    expect(done).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it("falls back to the next Ark model when the primary model is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "The model is unavailable for this account",
            },
          }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        makeSseResponse([
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      )

    vi.stubGlobal("fetch", fetchMock)

    const done = vi.fn()
    const error = vi.fn()

    await streamChat([{ role: "user", content: "hello" }], {
      apiKey: "test-key",
      model: "doubao-seed-1-6-flash-250828",
      fallbackModels: ["doubao-seed-1-6-250615"],
      onToken: () => undefined,
      onDone: done,
      onError: error,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(done).toHaveBeenCalledWith("ok")
    expect(error).not.toHaveBeenCalled()
  })
})
