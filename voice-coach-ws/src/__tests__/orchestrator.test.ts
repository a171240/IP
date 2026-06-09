import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../db/turns.js", () => ({
  insertBeauticianTurn: vi.fn(async (row) => row),
  insertCustomerTurn: vi.fn(async (row) => row),
  updateTurnAnalysis: vi.fn(async () => undefined),
}))

vi.mock("../db/events.js", () => ({
  emitEvent: vi.fn(async () => undefined),
}))

import { emitEvent } from "../db/events.js"
import { insertBeauticianTurn, insertCustomerTurn, updateTurnAnalysis } from "../db/turns.js"
import { TurnOrchestrator } from "../pipeline/orchestrator.js"
import { decodeTtsBinaryFrame, type ServerMsg } from "../protocol.js"
import { createSessionState } from "../session/session-state.js"
import { getScenario } from "../shared/scenarios.js"

class FakeAsr {
  async connect(): Promise<void> {
    return undefined
  }

  sendAudio(_chunk: Buffer): void {
    return
  }

  async finish() {
    return {
      text: "我还是担心这样做不安全",
      confidence: 0.91,
      durationSeconds: 1.6,
    }
  }

  abort(): void {
    return
  }
}

class FakeTts {
  constructor(
    private readonly options: {
      onAudioChunk: (chunk: Buffer) => void
      onDone: () => void
    },
    private readonly sink: string[],
  ) {}

  async synthesize(text: string): Promise<void> {
    this.sink.push(text)
    this.options.onAudioChunk(Buffer.from(`audio:${text}`, "utf8"))
    this.options.onDone()
  }

  abort(): void {
    return
  }
}

describe("TurnOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("streams each sentence into TTS only once and persists the turn pair", async () => {
    const state = createSessionState({
      sessionId: "session-1",
      userId: "user-1",
      scenario: getScenario("objection_safety"),
    })

    const messages: ServerMsg[] = []
    const frames: Array<{ sentenceIndex: number; audio: Buffer }> = []
    const synthesizedSentences: string[] = []
    const streamChat = vi
      .fn()
      .mockImplementationOnce(async (_prompt, options) => {
        for (const token of [
          "第一句已经说明了。",
          "第二句继续追问。",
          "---META---",
          '{"emotion":"neutral","tag":"安全"}',
        ]) {
          options.onToken(token)
        }
        options.onDone("")
      })
      .mockImplementationOnce(async (_prompt, options) => {
        for (const token of [
          '{"suggestions":["先共情","补证据","再推进"],',
          '"polished":"我理解你的顾虑，我们可以先把流程和风险说明白。",',
          '"highlights":[{"text":"不安全","severity":"warn"}],',
          '"risk_notes":["避免绝对化承诺"]}',
        ]) {
          options.onToken(token)
        }
        options.onDone("")
      })

    const orchestrator = new TurnOrchestrator(
      state,
      (msg) => {
        messages.push(msg)
      },
      (data) => {
        frames.push(decodeTtsBinaryFrame(data))
      },
      {
        createAsr: () => new FakeAsr() as never,
        createTts: (options) => new FakeTts(options as never, synthesizedSentences) as never,
        streamChat,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      },
    )

    await orchestrator.startRecording(1, "customer-0")
    orchestrator.handleAudioChunk(Buffer.from("mock-audio"))
    await orchestrator.finishRecording(2)
    await vi.waitFor(() => {
      expect(updateTurnAnalysis).toHaveBeenCalledTimes(1)
    })

    expect(synthesizedSentences).toEqual(["第一句已经说明了。", "第二句继续追问。"])
    expect(streamChat).toHaveBeenCalledTimes(2)
    expect(messages.filter((msg) => msg.type === "llm.sentence_ready")).toHaveLength(2)
    expect(messages.filter((msg) => msg.type === "tts.sentence_start")).toHaveLength(2)
    expect(messages.filter((msg) => msg.type === "tts.sentence_end")).toHaveLength(2)
    expect(messages.some((msg) => msg.type === "llm.done")).toBe(true)
    expect(
      messages.some(
        (msg) => msg.type === "llm.analysis" && msg.analysis.highlights[0]?.severity === "warning",
      ),
    ).toBe(true)
    expect(
      messages.some(
        (msg) =>
          msg.type === "llm.analysis" &&
          msg.analysis.per_turn_scores &&
          typeof msg.analysis.per_turn_scores.persuasion === "number" &&
          typeof msg.analysis.per_turn_scores.organization === "number",
      ),
    ).toBe(true)
    expect(messages.some((msg) => msg.type === "tts.done")).toBe(true)
    expect(messages.some((msg) => msg.type === "turn.saved")).toBe(true)
    expect(frames.map((frame) => frame.sentenceIndex)).toEqual([0, 1])
    expect(insertBeauticianTurn).toHaveBeenCalledTimes(1)
    expect(insertCustomerTurn).toHaveBeenCalledTimes(1)
    expect(updateTurnAnalysis).toHaveBeenCalledTimes(1)
    expect(emitEvent).toHaveBeenCalledTimes(1)
    expect(state.turnHistory).toHaveLength(2)
  })

  it("strips customer-name addressing before TTS and persistence", async () => {
    const state = createSessionState({
      sessionId: "session-name",
      userId: "user-1",
      scenario: getScenario("objection_safety"),
      sessionContextText: "顾客显示名：徐老师（仅用于后台识别和报告展示，不进入顾客对美容师的称呼）\n当前训练项目：胶原抗衰护理",
    })

    const synthesizedSentences: string[] = []
    const streamChat = vi
      .fn()
      .mockImplementationOnce(async (_prompt, options) => {
        for (const token of [
          "徐老师您好，我想问有没有检测报告？",
          "---META---",
          '{"emotion":"worried","tag":"证据"}',
        ]) {
          options.onToken(token)
        }
        options.onDone("")
      })
      .mockImplementationOnce(async (_prompt, options) => {
        for (const token of [
          '{"suggestions":["先共情","补证据","再推进"],',
          '"polished":"我理解你的顾虑，我们可以先把检测报告和成分依据说明白。",',
          '"highlights":[],',
          '"risk_notes":[]}',
        ]) {
          options.onToken(token)
        }
        options.onDone("")
      })

    const orchestrator = new TurnOrchestrator(
      state,
      () => undefined,
      () => undefined,
      {
        createAsr: () => new FakeAsr() as never,
        createTts: (options) => new FakeTts(options as never, synthesizedSentences) as never,
        streamChat,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      },
    )

    await orchestrator.startRecording(1, "customer-0")
    orchestrator.handleAudioChunk(Buffer.from("mock-audio"))
    await orchestrator.finishRecording(2)
    await vi.waitFor(() => {
      expect(insertCustomerTurn).toHaveBeenCalledTimes(1)
    })

    expect(synthesizedSentences).toEqual(["我想问有没有检测报告？"])
    expect(insertCustomerTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "我想问有没有检测报告？",
      }),
    )
    expect(state.turnHistory[state.turnHistory.length - 1]?.text).toBe("我想问有没有检测报告？")
  })

  it("clamps stale client turn indexes to the server session cursor", async () => {
    const state = createSessionState({
      sessionId: "session-2",
      userId: "user-2",
      scenario: getScenario("objection_safety"),
    })
    state.currentTurnIndex = 3

    const orchestrator = new TurnOrchestrator(
      state,
      () => undefined,
      () => undefined,
      {
        createAsr: () => new FakeAsr() as never,
        createTts: (options) => new FakeTts(options as never, []) as never,
        streamChat: vi.fn(),
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
      },
    )

    await orchestrator.startRecording(0, "customer-2")
    orchestrator.handleAudioChunk(Buffer.from("mock-audio"))
    await orchestrator.finishRecording(1)

    expect(insertBeauticianTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "session-2",
        turn_index: 3,
      }),
    )
    expect(insertCustomerTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "session-2",
        turn_index: 4,
      }),
    )
    expect(state.currentTurnIndex).toBe(5)
  })
})
