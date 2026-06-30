import { describe, expect, it } from "vitest"
import {
  ClientMsgSchema,
  decodeTtsBinaryFrame,
  encodeTtsBinaryFrame,
  ServerMsgSchema,
} from "../protocol.js"
import { getScenario } from "../shared/scenarios.js"

describe("protocol", () => {
  it("validates client messages", () => {
    const msg = ClientMsgSchema.parse({ type: "audio.start", turn_index: 1, reply_to_turn_id: "turn-1" })
    expect(msg.type).toBe("audio.start")
    expect(() => ClientMsgSchema.parse({ type: "audio.start" })).toThrow()
  })

  it("validates server messages", () => {
    const msg = ServerMsgSchema.parse({
      type: "session.ready",
      session_id: "session-1",
      scenario: getScenario("objection_safety"),
      capabilities: {
        protocol_version: 2,
        streaming_tts: true,
        audio_persistence: true,
      },
    })
    expect(msg.type).toBe("session.ready")
    if (msg.type !== "session.ready") {
      throw new Error("expected session.ready")
    }
    expect(msg.capabilities?.audio_persistence).toBe(true)
    expect(msg.capabilities?.streaming_tts).toBe(true)
    expect(msg.capabilities?.protocol_version).toBe(2)
    expect(() => ServerMsgSchema.parse({ type: "error", code: "x", message: "y" })).toThrow()
  })

  it("accepts llm.analysis payloads with normalized severities and per-turn scores", () => {
    const msg = ServerMsgSchema.parse({
      type: "llm.analysis",
      beautician_turn_id: "turn-9",
      analysis: {
        suggestions: ["先共情", "补证据", "给下一步"],
        polished: "我理解你的顾虑，我们可以先把流程和风险说清楚。",
        highlights: [{ text: "风险", severity: "warning" }],
        risk_notes: ["避免绝对化承诺"],
        per_turn_scores: {
          persuasion: 78,
          fluency: 82,
          expression: 67,
          pronunciation: 88,
          organization: 74,
        },
      },
    })

    expect(msg.type).toBe("llm.analysis")
    if (msg.type !== "llm.analysis") {
      throw new Error("expected llm.analysis")
    }
    expect(msg.analysis.highlights[0]?.severity).toBe("warning")
    expect(msg.analysis.per_turn_scores?.pronunciation).toBe(88)
  })

  it("encodes and decodes tts binary frames", () => {
    const frame = encodeTtsBinaryFrame(7, Buffer.from([1, 2, 3]))
    const decoded = decodeTtsBinaryFrame(frame)
    expect(decoded.sentenceIndex).toBe(7)
    expect(Array.from(decoded.audio.values())).toEqual([1, 2, 3])
  })
})
