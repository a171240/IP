import { z } from "zod"
import { VoiceCoachReportSchema } from "./shared/report.js"
import type { VoiceCoachScenario } from "./shared/scenarios.js"

export const VoiceCoachEmotionSchema = z.enum(["neutral", "worried", "skeptical", "impatient", "pleased"])

export const VoiceCoachScenarioSchema: z.ZodType<VoiceCoachScenario> = z.object({
  id: z.literal("objection_safety"),
  name: z.string(),
  goal: z.string(),
  customerPersona: z.string(),
  businessContext: z.string(),
  safetyConstraints: z.array(z.string()),
  seedTopics: z.array(z.string()),
})

export const ClientAudioStartSchema = z.object({
  type: z.literal("audio.start"),
  turn_index: z.number().int().nonnegative(),
  reply_to_turn_id: z.string().optional(),
})

export const ClientAudioEndSchema = z.object({
  type: z.literal("audio.end"),
  client_audio_seconds: z.number().nonnegative(),
})

export const ClientAudioCancelSchema = z.object({
  type: z.literal("audio.cancel"),
})

export const ClientBargeInSchema = z.object({
  type: z.literal("barge_in"),
})

export const ClientHintRequestSchema = z.object({
  type: z.literal("hint.request"),
})

export const ClientSessionEndSchema = z.object({
  type: z.literal("session.end"),
})

export const ClientMsgSchema = z.discriminatedUnion("type", [
  ClientAudioStartSchema,
  ClientAudioEndSchema,
  ClientAudioCancelSchema,
  ClientBargeInSchema,
  ClientHintRequestSchema,
  ClientSessionEndSchema,
])

export type ClientMsg = z.infer<typeof ClientMsgSchema>

export const ServerSessionReadySchema = z.object({
  type: z.literal("session.ready"),
  session_id: z.string(),
  scenario: VoiceCoachScenarioSchema,
})

export const ServerAsrPartialSchema = z.object({
  type: z.literal("asr.partial"),
  text: z.string(),
})

export const ServerAsrFinalSchema = z.object({
  type: z.literal("asr.final"),
  text: z.string(),
  confidence: z.number(),
})

export const ServerLlmTextDeltaSchema = z.object({
  type: z.literal("llm.text_delta"),
  delta: z.string(),
  role: z.literal("customer"),
})

export const ServerLlmSentenceReadySchema = z.object({
  type: z.literal("llm.sentence_ready"),
  sentence: z.string(),
  index: z.number().int().nonnegative(),
})

export const ServerAnalysisSchema = z.object({
  suggestions: z.array(z.string()),
  polished: z.string(),
  highlights: z.array(
    z.object({
      text: z.string(),
      severity: z.enum(["info", "warn", "bad", "warning", "danger"]),
    }),
  ),
  risk_notes: z.array(z.string()),
  per_turn_scores: z.record(z.string(), z.number()).optional(),
})

export const ServerLlmAnalysisSchema = z.object({
  type: z.literal("llm.analysis"),
  beautician_turn_id: z.string().optional(),
  analysis: ServerAnalysisSchema,
})

export const ServerLlmDoneSchema = z.object({
  type: z.literal("llm.done"),
  customer_text: z.string(),
  customer_emotion: VoiceCoachEmotionSchema,
})

export const ServerTtsSentenceStartSchema = z.object({
  type: z.literal("tts.sentence_start"),
  index: z.number().int().nonnegative(),
})

export const ServerTtsSentenceEndSchema = z.object({
  type: z.literal("tts.sentence_end"),
  index: z.number().int().nonnegative(),
})

export const ServerTtsDoneSchema = z.object({
  type: z.literal("tts.done"),
})

export const ServerTurnSavedSchema = z.object({
  type: z.literal("turn.saved"),
  beautician_turn_id: z.string(),
  customer_turn_id: z.string(),
})

export const ServerHintResultSchema = z.object({
  type: z.literal("hint.result"),
  hint_text: z.string(),
  hint_points: z.array(z.string()),
})

export const ServerReportReadySchema = z.object({
  type: z.literal("report.ready"),
  report: VoiceCoachReportSchema,
})

export const ServerErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
})

export const ServerMsgSchema = z.discriminatedUnion("type", [
  ServerSessionReadySchema,
  ServerAsrPartialSchema,
  ServerAsrFinalSchema,
  ServerLlmTextDeltaSchema,
  ServerLlmSentenceReadySchema,
  ServerLlmAnalysisSchema,
  ServerLlmDoneSchema,
  ServerTtsSentenceStartSchema,
  ServerTtsSentenceEndSchema,
  ServerTtsDoneSchema,
  ServerTurnSavedSchema,
  ServerHintResultSchema,
  ServerReportReadySchema,
  ServerErrorSchema,
])

export type ServerMsg = z.infer<typeof ServerMsgSchema>

/**
 * Parse and validate an inbound client message.
 */
export function parseClientMsg(input: unknown): ClientMsg {
  return ClientMsgSchema.parse(input)
}

/**
 * Parse and validate an outbound server message.
 */
export function parseServerMsg(input: unknown): ServerMsg {
  return ServerMsgSchema.parse(input)
}

/**
 * Encode a TTS binary frame with a 4-byte sentence index prefix.
 */
export function encodeTtsBinaryFrame(sentenceIndex: number, audio: Buffer | Uint8Array): Buffer {
  const payload = audio instanceof Buffer ? audio : Buffer.from(audio)
  const frame = Buffer.allocUnsafe(4 + payload.length)
  frame.writeUInt32BE(sentenceIndex >>> 0, 0)
  payload.copy(frame, 4)
  return frame
}

/**
 * Decode a TTS binary frame into sentence index and audio payload.
 */
export function decodeTtsBinaryFrame(input: Buffer | Uint8Array): { sentenceIndex: number; audio: Buffer } {
  const frame = input instanceof Buffer ? input : Buffer.from(input)
  if (frame.length < 4) {
    throw new Error("tts_binary_frame_too_short")
  }
  return {
    sentenceIndex: frame.readUInt32BE(0),
    audio: frame.subarray(4),
  }
}
