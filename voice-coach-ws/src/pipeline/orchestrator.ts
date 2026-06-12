import { randomUUID } from "node:crypto"
import { jsonrepair } from "jsonrepair"
import { z } from "zod"

import { config, getLlmProviderConfig } from "../config.js"
import { emitEvent } from "../db/events.js"
import { uploadVoiceCoachAudio } from "../db/storage.js"
import { insertBeauticianTurn, insertCustomerTurn, updateTurnAnalysis, updateTurnAudio } from "../db/turns.js"
import {
  type ServerMsg,
  VoiceCoachEmotionSchema as VoiceCoachEmotionZodSchema,
  ServerAnalysisSchema,
  encodeTtsBinaryFrame,
} from "../protocol.js"
import { calcWpm, calcFillerRatio, computePerTurnScores } from "../shared/metrics.js"
import {
  buildDialoguePolicy,
  buildTopicLock,
  normalizeCustomerReplyByPolicy,
  validateCustomerReplyTopic,
  type TopicGuardResult,
} from "../shared/topic-guard.js"
import type { SessionState } from "../session/session-state.js"
import { buildAsyncAnalysisPrompt, buildFastReplyPrompt, REPLY_META_DELIMITER, streamChat } from "./streaming-llm.js"
import { StreamingAsr, type StreamingAsrOptions, type StreamingAsrResult } from "./streaming-asr.js"
import { SentenceSplitter } from "./sentence-splitter.js"
import { BargeInController } from "./barge-in.js"
import { StreamingTts, type StreamingTtsOptions } from "./streaming-tts.js"

type VoiceCoachEmotion = z.infer<typeof VoiceCoachEmotionZodSchema>
type ParsedAnalysis = z.infer<typeof ServerAnalysisSchema>

type TurnMetrics = {
  audioEndAt: number | null
  asrFinalAt: number | null
  llmFirstTokenAt: number | null
  firstSentenceAt: number | null
  ttsFirstChunkAt: number | null
  ttsDoneAt: number | null
  replyTriggerSource: "partial" | "final" | null
}

type ParsedReplyMeta = {
  emotion: VoiceCoachEmotion
  tag: string
}

type PersistedTurnIds = {
  beauticianTurnId: string
  customerTurnId: string
}

type TurnOrchestratorDeps = {
  createAsr: (options: StreamingAsrOptions) => StreamingAsr
  createTts: (options: StreamingTtsOptions) => StreamingTts
  streamChat: typeof streamChat
  uploadAudio: typeof uploadVoiceCoachAudio
  logger: Pick<Console, "info" | "warn" | "error">
}

const ReplyMetaSchema = z.object({
  emotion: VoiceCoachEmotionZodSchema.optional().default("neutral"),
  tag: z.string().optional().default(""),
})

const MAX_HISTORY_TURNS = 6
const MAX_PERSISTED_AUDIO_BYTES = 8 * 1024 * 1024
const SPLITTER_OPTIONS = {
  minSentenceLength: 4,
  maxBufferLength: 60,
} as const

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.message === "barge_in" ||
      error.message === "audio.cancel" ||
      error.message === "llm_aborted" ||
      error.message === "streaming_asr_aborted" ||
      error.message === "tts_aborted")
  )
}

function createEmptyMetrics(): TurnMetrics {
  return {
    audioEndAt: null,
    asrFinalAt: null,
    llmFirstTokenAt: null,
    firstSentenceAt: null,
    ttsFirstChunkAt: null,
    ttsDoneAt: null,
    replyTriggerSource: null,
  }
}

function normalizeSeverity(input: unknown): "info" | "warning" | "danger" {
  const raw = String(input || "").trim().toLowerCase()
  switch (raw) {
    case "bad":
      return "danger"
    case "warn":
      return "warning"
    case "info":
    case "warning":
    case "danger":
      return raw
    default:
      return "info"
  }
}

function normalizeHistoryEmotion(input: unknown): VoiceCoachEmotion | undefined {
  const parsed = VoiceCoachEmotionZodSchema.safeParse(input)
  return parsed.success ? parsed.data : undefined
}

function mapEmotionToTtsEmotion(input: VoiceCoachEmotion): StreamingTtsOptions["emotion"] {
  switch (input) {
    case "pleased":
      return "happy"
    case "worried":
      return "sad"
    case "impatient":
      return "angry"
    case "neutral":
    case "skeptical":
    default:
      return "neutral"
  }
}

function createFallbackReplyMeta(): ParsedReplyMeta {
  return {
    emotion: "neutral",
    tag: "",
  }
}

function createFallbackAnalysis(beauticianText: string): ParsedAnalysis {
  return {
    suggestions: [
      "先回应顾客最直接的顾虑，再给结论。",
      "补充一条可验证的信息或流程细节。",
      "最后抛一个明确问题，把对话推进下去。",
    ],
    polished:
      beauticianText ||
      "我理解你的顾虑，这个问题很正常。我们可以先把你最担心的点讲清楚，再结合实际情况给你更稳妥的建议。",
    highlights: [],
    risk_notes: ["本轮分析解析失败，已使用兜底建议。"],
  }
}

function normalizeAnalysis(input: ParsedAnalysis, beauticianText: string): ParsedAnalysis {
  const fallback = createFallbackAnalysis(beauticianText)
  const suggestions = [...input.suggestions]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 3)

  while (suggestions.length < 3) {
    suggestions.push(fallback.suggestions[suggestions.length]!)
  }

  return {
    suggestions,
    polished: String(input.polished || "").trim() || beauticianText || fallback.polished,
    highlights: (input.highlights || []).map((item) => ({
      text: String(item.text || "").trim(),
      severity: normalizeSeverity(item.severity),
    })),
    risk_notes: (input.risk_notes || []).map((item) => String(item || "").trim()).filter(Boolean),
  }
}

function parseReplyMeta(raw: string): ParsedReplyMeta {
  const trimmed = String(raw || "").trim()
  if (!trimmed) return createFallbackReplyMeta()

  try {
    const repaired = jsonrepair(trimmed)
    const parsed = JSON.parse(repaired) as unknown
    const meta = ReplyMetaSchema.parse(parsed)
    return {
      emotion: meta.emotion,
      tag: String(meta.tag || "").trim(),
    }
  } catch {
    return createFallbackReplyMeta()
  }
}

function parseAsyncAnalysis(raw: string, beauticianText: string): ParsedAnalysis {
  const trimmed = String(raw || "").trim()
  if (!trimmed) return createFallbackAnalysis(beauticianText)

  try {
    const repaired = jsonrepair(trimmed)
    const parsed = JSON.parse(repaired) as unknown
    const analysis = ServerAnalysisSchema.parse(parsed)
    return normalizeAnalysis(analysis, beauticianText)
  } catch {
    return createFallbackAnalysis(beauticianText)
  }
}

function trimWhitespaceForDelta(text: string): string {
  return text.replace(/\r/g, "")
}

function trailingDelimiterPrefixLength(buffer: string, delimiter: string): number {
  const max = Math.min(buffer.length, Math.max(delimiter.length - 1, 0))
  for (let len = max; len > 0; len -= 1) {
    if (buffer.endsWith(delimiter.slice(0, len))) {
      return len
    }
  }
  return 0
}

export class TurnOrchestrator {
  private readonly deps: TurnOrchestratorDeps
  private readonly bargeInController = new BargeInController()

  private activeAsr: StreamingAsr | null = null
  private activeAbortControllers = new Set<AbortController>()
  private activeTtsInstances = new Set<StreamingTts>()
  private disposed = false
  private runToken = 0
  private activeRunToken = 0

  private activeTurnIndex = 0
  private activeReplyToTurnId: string | undefined
  private activeBeauticianText = ""
  private activeCustomerText = ""
  private activeCustomerEmotion: VoiceCoachEmotion = "neutral"
  private activeTag = ""
  private activeAnalysis: ParsedAnalysis = createFallbackAnalysis("")
  private activeMetrics: TurnMetrics = createEmptyMetrics()
  private activeBeauticianAudioChunks: Buffer[] = []
  private activeBeauticianAudioBytes = 0
  private activeCustomerAudioChunksBySentence = new Map<number, Buffer[]>()
  private latestPartialAt = 0

  constructor(
    private readonly session: SessionState,
    private readonly sendJson: (msg: ServerMsg) => void,
    private readonly sendBinary: (data: Buffer) => void,
    deps: Partial<TurnOrchestratorDeps> = {},
  ) {
    this.deps = {
      createAsr: deps.createAsr ?? ((options) => new StreamingAsr(options)),
      createTts: deps.createTts ?? ((options) => new StreamingTts(options)),
      streamChat: deps.streamChat ?? streamChat,
      uploadAudio: deps.uploadAudio ?? uploadVoiceCoachAudio,
      logger: deps.logger ?? console,
    }
  }

  async startRecording(turnIndex: number, replyToTurnId?: string): Promise<void> {
    if (this.disposed) return

    if (this.session.currentPhase === "processing" || this.session.currentPhase === "playing") {
      await this.bargeIn()
    }
    if (this.session.currentPhase === "recording") {
      await this.cancelRecording()
    }

    const runToken = ++this.runToken
    this.activeRunToken = runToken
    const normalizedTurnIndex = Number.isFinite(turnIndex) ? Math.max(0, Math.trunc(turnIndex)) : this.session.currentTurnIndex
    this.activeTurnIndex = Math.max(this.session.currentTurnIndex, normalizedTurnIndex)
    this.activeReplyToTurnId = replyToTurnId
    this.activeBeauticianText = ""
    this.activeCustomerText = ""
    this.activeCustomerEmotion = "neutral"
    this.activeTag = ""
    this.activeAnalysis = createFallbackAnalysis("")
    this.activeMetrics = createEmptyMetrics()
    this.resetAudioPersistenceBuffers()
    this.latestPartialAt = 0

    const asr = this.deps.createAsr({
      appId: config.volc.appId,
      accessToken: config.volc.accessToken,
      resourceId: config.volc.asrResourceId,
      format: "mp3",
      onPartial: (text) => {
        if (!this.isRunActive(runToken)) return
        this.activeBeauticianText = String(text || "").trim()
        this.latestPartialAt = Date.now()
        this.safeSendJson({ type: "asr.partial", text: this.activeBeauticianText })
      },
      onFinal: (result) => {
        if (!this.isRunActive(runToken)) return
        this.activeBeauticianText = String(result.text || "").trim()
      },
      onError: (error) => {
        if (!this.isRunActive(runToken) || isAbortLike(error)) return
        this.safeSendError("asr_failed", error.message || "ASR 失败", true)
      },
    })

    this.activeAsr = asr
    this.session.asrInstance = asr
    this.session.currentPhase = "recording"
    this.session.lastActivityAt = Date.now()
    this.syncTrackedResources()

    try {
      await asr.connect()
    } catch (error) {
      if (!this.isRunActive(runToken) || isAbortLike(error)) return
      this.clearAsr()
      this.session.currentPhase = "idle"
      this.safeSendError("asr_connect_failed", error instanceof Error ? error.message : "ASR 连接失败", true)
    }
  }

  handleAudioChunk(chunk: Buffer): void {
    if (!this.activeAsr || this.session.currentPhase !== "recording") return
    try {
      this.captureBeauticianAudioChunk(chunk)
      this.activeAsr.sendAudio(chunk)
      this.session.lastActivityAt = Date.now()
    } catch (error) {
      if (!isAbortLike(error)) {
        this.safeSendError("audio_chunk_failed", error instanceof Error ? error.message : "音频发送失败", true)
      }
    }
  }

  async finishRecording(clientAudioSeconds: number): Promise<void> {
    const runToken = this.activeRunToken
    const asr = this.activeAsr
    if (!asr || !this.isRunActive(runToken)) {
      this.safeSendError("recording_not_started", "录音尚未开始", true)
      return
    }

    this.session.currentPhase = "processing"
    this.session.lastActivityAt = Date.now()
    this.activeMetrics.audioEndAt = Date.now()
    const normalizedClientAudioSeconds = Math.max(0, Number(clientAudioSeconds || 0) || 0)
    const stablePartialText = this.getStablePartialText()
    const finalizedAsrResultPromise = this.finalizeAsrResult(
      runToken,
      asr,
      stablePartialText,
      normalizedClientAudioSeconds,
    )

    try {
      if (stablePartialText) {
        this.activeBeauticianText = stablePartialText
        this.activeMetrics.replyTriggerSource = "partial"
        await this.runLlmAndTtsPipeline(runToken, {
          promptBeauticianText: stablePartialText,
          finalizedAsrResultPromise,
          clientAudioSeconds: normalizedClientAudioSeconds,
        })
        return
      }

      const asrResult = await finalizedAsrResultPromise
      if (!this.isRunActive(runToken)) return

      this.activeBeauticianText = String(asrResult.text || "").trim()
      this.activeMetrics.replyTriggerSource = "final"

      if (!this.activeBeauticianText) {
        this.session.currentPhase = "idle"
        this.safeSendError("asr_empty_result", "未识别到有效语音", true)
        return
      }

      await this.runLlmAndTtsPipeline(runToken, {
        promptBeauticianText: this.activeBeauticianText,
        finalizedAsrResultPromise: Promise.resolve(asrResult),
        clientAudioSeconds: normalizedClientAudioSeconds,
      })
    } catch (error) {
      if (isAbortLike(error)) return
      this.clearAsr()
      this.session.currentPhase = "idle"
      this.safeSendError("finish_recording_failed", error instanceof Error ? error.message : "录音处理失败", true)
    }
  }

  async bargeIn(): Promise<void> {
    const previousRunToken = this.activeRunToken
    this.runToken += 1
    this.activeRunToken = this.runToken
    this.bargeInController.execute()
    this.clearAsr()
    this.clearTrackedAbortControllers()
    this.clearTtsInstances()
    this.resetAudioPersistenceBuffers()
    this.session.currentPhase = "idle"
    this.session.lastActivityAt = Date.now()
    this.deps.logger.info("[voice-coach-ws] barge_in", {
      sessionId: this.session.sessionId,
      interruptedRunToken: previousRunToken,
    })
  }

  async cancelRecording(): Promise<void> {
    this.runToken += 1
    this.activeRunToken = this.runToken
    this.activeAsr?.abort()
    this.clearAsr()
    this.abortTrackedControllers("audio.cancel")
    this.clearTtsInstances()
    this.resetAudioPersistenceBuffers()
    this.session.currentPhase = "idle"
    this.session.lastActivityAt = Date.now()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    void this.cancelRecording()
  }

  private async runLlmAndTtsPipeline(
    runToken: number,
    params: {
      promptBeauticianText: string
      finalizedAsrResultPromise: Promise<StreamingAsrResult>
      clientAudioSeconds: number
    },
  ): Promise<void> {
    const replyAbortController = new AbortController()
    this.trackAbortController(replyAbortController)
    const replyProvider = getLlmProviderConfig("reply")

    const history = this.session.turnHistory.slice(-MAX_HISTORY_TURNS).map((turn) => ({
      role: turn.role,
      text: turn.text,
      emotion: normalizeHistoryEmotion(turn.emotion),
    }))

    const splitter = new SentenceSplitter(SPLITTER_OPTIONS)
    const sentenceTasks: Promise<void>[] = []
    const topicLock = buildTopicLock(this.session.sessionContextText)
    const dialoguePolicy = buildDialoguePolicy({
      sessionContextText: this.session.sessionContextText,
      history,
      beauticianText: params.promptBeauticianText,
    })
    let topicGuardRejected = false
    let topicGuardRejection: TopicGuardResult | null = null
    const prompt = buildFastReplyPrompt({
      scenario: this.session.scenario,
      history,
      beauticianText: params.promptBeauticianText,
      sessionContextText: this.session.sessionContextText,
      variationSeed: `${this.session.sessionId}:${history.length}`,
    })

    let sentenceIndex = 0
    let visibleBuffer = ""
    let metaBuffer = ""
    let metaMode = false
    let sawAnyToken = false
    let customerText = ""

    const emitVisibleDelta = (chunk: string) => {
      const delta = trimWhitespaceForDelta(chunk)
      if (!delta) return
      customerText += delta
      this.activeCustomerText = customerText
      this.safeSendJson({ type: "llm.text_delta", delta, role: "customer" })

      const sentences = splitter.feed(delta)
      for (const sentence of sentences) {
        const trimmed = normalizeCustomerReplyByPolicy(sentence.trim(), dialoguePolicy)
        if (!trimmed) continue
        const topicCheck = validateCustomerReplyTopic(trimmed, topicLock)
        if (!topicCheck.ok) {
          topicGuardRejected = true
          topicGuardRejection = topicCheck
          this.deps.logger.warn("[voice-coach-ws] topic_guard:sentence_rejected", {
            sessionId: this.session.sessionId,
            serviceName: topicLock?.serviceName || "",
            offendingTerms: topicCheck.offendingTerms,
            sentence: trimmed,
          })
          continue
        }
        this.activeMetrics.firstSentenceAt ??= Date.now()
        this.session.currentPhase = "playing"
        this.safeSendJson({ type: "llm.sentence_ready", sentence: trimmed, index: sentenceIndex })
        sentenceTasks.push(this.runSentenceTts(runToken, sentenceIndex, trimmed))
        sentenceIndex += 1
      }
    }

    const flushVisibleBuffer = () => {
      if (!visibleBuffer) return
      emitVisibleDelta(visibleBuffer)
      visibleBuffer = ""
    }

    const acceptToken = (token: string) => {
      if (!this.isRunActive(runToken)) return
      const normalizedToken = String(token || "")
      if (!normalizedToken) return

      if (!sawAnyToken) {
        sawAnyToken = true
        this.activeMetrics.llmFirstTokenAt = Date.now()
      }

      if (metaMode) {
        metaBuffer += normalizedToken
        return
      }

      visibleBuffer += normalizedToken
      const delimiterIndex = visibleBuffer.indexOf(REPLY_META_DELIMITER)
      if (delimiterIndex >= 0) {
        const textPart = visibleBuffer.slice(0, delimiterIndex)
        if (textPart) emitVisibleDelta(textPart)
        metaMode = true
        metaBuffer += visibleBuffer.slice(delimiterIndex + REPLY_META_DELIMITER.length)
        visibleBuffer = ""
        return
      }

      const keepTailLength = trailingDelimiterPrefixLength(visibleBuffer, REPLY_META_DELIMITER)
      if (visibleBuffer.length > keepTailLength) {
        const textPart = visibleBuffer.slice(0, visibleBuffer.length - keepTailLength)
        visibleBuffer = visibleBuffer.slice(visibleBuffer.length - keepTailLength)
        emitVisibleDelta(textPart)
      }
    }

    try {
      await this.deps.streamChat(prompt, {
        apiKey: replyProvider.apiKey,
        baseUrl: replyProvider.baseUrl,
        model: replyProvider.model,
        fallbackModels: replyProvider.fallbackModels,
        timeoutMs: config.ark.replyTimeoutMs,
        abortSignal: replyAbortController.signal,
        onToken: acceptToken,
        onDone: () => undefined,
        onError: () => undefined,
      })
    } catch (error) {
      if (isAbortLike(error) || !this.isRunActive(runToken)) return
      this.safeSendError("llm_stream_failed", error instanceof Error ? error.message : "LLM 流式生成失败", true)
      this.session.currentPhase = "idle"
      return
    } finally {
      this.untrackAbortController(replyAbortController)
    }

    if (!this.isRunActive(runToken)) return

    flushVisibleBuffer()
    const trailingSentence = splitter.flush()
    if (trailingSentence && trailingSentence.trim()) {
      const trimmed = normalizeCustomerReplyByPolicy(trailingSentence.trim(), dialoguePolicy)
      const topicCheck = validateCustomerReplyTopic(trimmed, topicLock)
      if (!topicCheck.ok) {
        topicGuardRejected = true
        topicGuardRejection = topicCheck
        this.deps.logger.warn("[voice-coach-ws] topic_guard:sentence_rejected", {
          sessionId: this.session.sessionId,
          serviceName: topicLock?.serviceName || "",
          offendingTerms: topicCheck.offendingTerms,
          sentence: trimmed,
        })
      } else {
        this.activeMetrics.firstSentenceAt ??= Date.now()
        this.session.currentPhase = "playing"
        this.safeSendJson({ type: "llm.sentence_ready", sentence: trimmed, index: sentenceIndex })
        sentenceTasks.push(this.runSentenceTts(runToken, sentenceIndex, trimmed))
        sentenceIndex += 1
      }
    }

    const replyMeta = parseReplyMeta(metaBuffer)
    let finalCustomerText = normalizeCustomerReplyByPolicy(customerText.trim(), dialoguePolicy)
    const finalTopicCheck = validateCustomerReplyTopic(finalCustomerText, topicLock)
    if (topicLock && (!finalTopicCheck.ok || topicGuardRejected)) {
      const rejection = !finalTopicCheck.ok ? finalTopicCheck : topicGuardRejection
      this.deps.logger.warn("[voice-coach-ws] topic_guard:fallback", {
        sessionId: this.session.sessionId,
        serviceName: topicLock.serviceName,
        offendingTerms: rejection?.offendingTerms || [],
        reason: rejection?.reason || "",
      })
      finalCustomerText = dialoguePolicy?.fallbackCustomerText || topicLock.fallbackCustomerText
      customerText = finalCustomerText
      this.activeMetrics.firstSentenceAt ??= Date.now()
      this.session.currentPhase = "playing"
      this.safeSendJson({ type: "llm.sentence_ready", sentence: finalCustomerText, index: sentenceIndex })
      sentenceTasks.push(this.runSentenceTts(runToken, sentenceIndex, finalCustomerText))
      sentenceIndex += 1
    }
    this.activeCustomerText = finalCustomerText
    this.activeCustomerEmotion = replyMeta.emotion
    this.activeTag = replyMeta.tag

    this.safeSendJson({
      type: "llm.done",
      customer_text: this.activeCustomerText,
      customer_emotion: replyMeta.emotion,
    })

    const finalizedAsrResult = await params.finalizedAsrResultPromise
    if (!this.isRunActive(runToken)) return

    const finalizedBeauticianText = String(finalizedAsrResult.text || "").trim() || params.promptBeauticianText
    this.activeBeauticianText = finalizedBeauticianText

    this.session.turnHistory.push({
      role: "beautician",
      text: finalizedBeauticianText,
    })
    this.session.turnHistory.push({
      role: "customer",
      text: this.activeCustomerText,
      emotion: replyMeta.emotion,
    })

    const persistedTurns = await this.persistCompletedTurn({
      beauticianText: finalizedBeauticianText,
      beauticianConfidence: finalizedAsrResult.confidence,
      clientAudioSeconds: params.clientAudioSeconds,
      customerText: this.activeCustomerText,
      customerEmotion: replyMeta.emotion,
      tag: replyMeta.tag,
    })

    void this.runAsyncAnalysis({
      beauticianTurnId: persistedTurns?.beauticianTurnId,
      history,
      beauticianText: finalizedBeauticianText,
      customerText: this.activeCustomerText,
      customerEmotion: replyMeta.emotion,
      tag: replyMeta.tag,
      clientAudioSeconds: params.clientAudioSeconds,
      asrConfidence: finalizedAsrResult.confidence,
    })

    await Promise.allSettled(sentenceTasks)
    if (!this.isRunActive(runToken)) return

    if (persistedTurns?.customerTurnId) {
      await this.persistCustomerAudio(persistedTurns.customerTurnId).catch((error) => {
        this.deps.logger.warn("[voice-coach-ws] customer_audio_persist_failed", {
          sessionId: this.session.sessionId,
          customerTurnId: persistedTurns.customerTurnId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    this.activeMetrics.ttsDoneAt = Date.now()
    this.safeSendJson({ type: "tts.done" })
    this.logLatencyMetrics()

    if (this.isRunActive(runToken)) {
      this.session.currentTurnIndex = this.activeTurnIndex + 2
      this.session.currentPhase = "idle"
      this.session.lastActivityAt = Date.now()
      this.resetAudioPersistenceBuffers()
    }
  }

  private async runAsyncAnalysis(params: {
    beauticianTurnId?: string
    history: Array<{ role: "customer" | "beautician"; text: string; emotion?: VoiceCoachEmotion }>
    beauticianText: string
    customerText: string
    customerEmotion: VoiceCoachEmotion
    tag: string
    clientAudioSeconds: number
    asrConfidence: number
  }): Promise<void> {
    const analysisAbortController = new AbortController()
    this.trackAbortController(analysisAbortController)
    const analysisProvider = getLlmProviderConfig("analysis")

    try {
      let raw = ""
      const prompt = buildAsyncAnalysisPrompt({
        scenario: this.session.scenario,
        history: params.history,
        beauticianText: params.beauticianText,
        customerText: params.customerText,
        customerEmotion: params.customerEmotion,
        tag: params.tag,
        sessionContextText: this.session.sessionContextText,
      })

      await this.deps.streamChat(prompt, {
        apiKey: analysisProvider.apiKey,
        baseUrl: analysisProvider.baseUrl,
        model: analysisProvider.model,
        fallbackModels: analysisProvider.fallbackModels,
        timeoutMs: config.ark.analysisTimeoutMs,
        abortSignal: analysisAbortController.signal,
        onToken: (token) => {
          raw += token
        },
        onDone: () => undefined,
        onError: () => undefined,
      })

      if (this.disposed || analysisAbortController.signal.aborted) return

      const analysis = parseAsyncAnalysis(raw, params.beauticianText)

      // Compute per-turn scores from acoustic metrics + LLM-scored dimensions
      const wpm = calcWpm(params.beauticianText, params.clientAudioSeconds)
      const fillerRatio = calcFillerRatio(params.beauticianText)
      const rawJson = (() => {
        try { return JSON.parse(jsonrepair(raw.trim())) as Record<string, unknown> } catch { return {} }
      })()
      analysis.per_turn_scores = computePerTurnScores({
        wpm,
        fillerRatio,
        asrConfidence: params.asrConfidence,
        llmPersuasion: typeof rawJson.persuasion_score === "number" ? rawJson.persuasion_score : undefined,
        llmOrganization: typeof rawJson.organization_score === "number" ? rawJson.organization_score : undefined,
      })

      this.activeAnalysis = analysis

      if (params.beauticianTurnId) {
        try {
          await updateTurnAnalysis({
            turnId: params.beauticianTurnId,
            analysisJson: analysis,
            status: "analysis_ready",
          })
        } catch (error) {
          this.deps.logger.warn("[voice-coach-ws] analysis_persist_failed", {
            sessionId: this.session.sessionId,
            beauticianTurnId: params.beauticianTurnId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      this.safeSendJson({
        type: "llm.analysis",
        ...(params.beauticianTurnId ? { beautician_turn_id: params.beauticianTurnId } : {}),
        analysis,
      })
    } catch (error) {
      if (isAbortLike(error) || analysisAbortController.signal.aborted || this.disposed) return
      const fallbackAnalysis = createFallbackAnalysis(params.beauticianText)

      // Attach per-turn scores even for fallback analysis
      const wpm = calcWpm(params.beauticianText, params.clientAudioSeconds)
      const fillerRatio = calcFillerRatio(params.beauticianText)
      fallbackAnalysis.per_turn_scores = computePerTurnScores({
        wpm,
        fillerRatio,
        asrConfidence: params.asrConfidence,
        llmPersuasion: undefined,
        llmOrganization: undefined,
      })

      this.deps.logger.warn("[voice-coach-ws] async_analysis_failed", {
        sessionId: this.session.sessionId,
        turnIndex: this.activeTurnIndex,
        error: error instanceof Error ? error.message : String(error),
      })
      this.activeAnalysis = fallbackAnalysis

      if (params.beauticianTurnId) {
        try {
          await updateTurnAnalysis({
            turnId: params.beauticianTurnId,
            analysisJson: fallbackAnalysis,
            status: "analysis_ready",
          })
        } catch (persistError) {
          this.deps.logger.warn("[voice-coach-ws] analysis_fallback_persist_failed", {
            sessionId: this.session.sessionId,
            beauticianTurnId: params.beauticianTurnId,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          })
        }
      }

      this.safeSendJson({
        type: "llm.analysis",
        ...(params.beauticianTurnId ? { beautician_turn_id: params.beauticianTurnId } : {}),
        analysis: fallbackAnalysis,
      })
    } finally {
      this.untrackAbortController(analysisAbortController)
    }
  }

  private async runSentenceTts(runToken: number, sentenceIndex: number, sentence: string): Promise<void> {
    const sentenceAudioChunks: Buffer[] = []
    const tts = this.deps.createTts({
      appId: config.volc.appId,
      accessToken: config.volc.accessToken,
      cluster: config.volc.ttsCluster,
      resourceId: config.volc.ttsResourceId,
      voiceType: config.volc.ttsVoiceType,
      language: config.volc.ttsLanguage,
      emotion: mapEmotionToTtsEmotion(this.activeCustomerEmotion),
      onAudioChunk: (chunk) => {
        if (!this.isRunActive(runToken)) return
        sentenceAudioChunks.push(Buffer.from(chunk))
        if (!started) {
          started = true
          this.activeMetrics.ttsFirstChunkAt ??= Date.now()
          this.safeSendJson({ type: "tts.sentence_start", index: sentenceIndex })
        }
        this.safeSendBinary(encodeTtsBinaryFrame(sentenceIndex, chunk))
      },
      onDone: () => undefined,
      onError: (error) => {
        if (!this.isRunActive(runToken) || isAbortLike(error)) return
        this.safeSendError(
          "tts_sentence_failed",
          `第 ${sentenceIndex + 1} 句语音合成失败: ${error.message || "unknown_error"}`,
          true,
        )
      },
    })

    let started = false
    this.activeTtsInstances.add(tts)
    this.session.ttsInstances = Array.from(this.activeTtsInstances)
    this.syncTrackedResources()

    try {
      await tts.synthesize(sentence)
      if (!this.isRunActive(runToken)) return
      if (sentenceAudioChunks.length) {
        this.activeCustomerAudioChunksBySentence.set(sentenceIndex, sentenceAudioChunks)
      }
      if (!started) {
        this.safeSendJson({ type: "tts.sentence_start", index: sentenceIndex })
      }
      this.safeSendJson({ type: "tts.sentence_end", index: sentenceIndex })
    } catch (error) {
      if (!isAbortLike(error) && this.isRunActive(runToken)) {
        this.safeSendError(
          "tts_sentence_failed",
          `第 ${sentenceIndex + 1} 句语音合成失败: ${error instanceof Error ? error.message : "unknown_error"}`,
          true,
        )
      }
    } finally {
      this.activeTtsInstances.delete(tts)
      this.session.ttsInstances = Array.from(this.activeTtsInstances)
      this.syncTrackedResources()
    }
  }

  private async persistCompletedTurn(params: {
    beauticianText: string
    beauticianConfidence: number
    clientAudioSeconds: number
    customerText: string
    customerEmotion: VoiceCoachEmotion
    tag: string
  }): Promise<PersistedTurnIds | null> {
    const beauticianTurnId = randomUUID()
    const customerTurnId = randomUUID()
    const beauticianAudioPath = await this.persistBeauticianAudio(beauticianTurnId).catch((error) => {
      this.deps.logger.warn("[voice-coach-ws] beautician_audio_persist_failed", {
        sessionId: this.session.sessionId,
        beauticianTurnId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    })

    try {
      await insertBeauticianTurn({
        id: beauticianTurnId,
        session_id: this.session.sessionId,
        turn_index: this.activeTurnIndex,
        text: params.beauticianText,
        audio_path: beauticianAudioPath,
        audio_seconds: params.clientAudioSeconds || null,
        asr_confidence: params.beauticianConfidence,
        analysis_json: null,
        status: beauticianAudioPath ? "audio_ready" : "text_ready",
      })

      await insertCustomerTurn({
        id: customerTurnId,
        session_id: this.session.sessionId,
        turn_index: this.activeTurnIndex + 1,
        text: params.customerText,
        emotion: params.customerEmotion,
        audio_path: null,
        features_json: params.tag ? { tag: params.tag } : {},
        status: "text_ready",
      })

      await emitEvent({
        session_id: this.session.sessionId,
        user_id: this.session.userId,
        turn_id: customerTurnId,
        type: "turn.saved",
        data_json: {
          beautician_turn_id: beauticianTurnId,
          customer_turn_id: customerTurnId,
          reply_to_turn_id: this.activeReplyToTurnId || null,
        },
      })

      this.safeSendJson({
        type: "turn.saved",
        beautician_turn_id: beauticianTurnId,
        customer_turn_id: customerTurnId,
      })

      return {
        beauticianTurnId,
        customerTurnId,
      }
    } catch (error) {
      this.safeSendError("turn_persist_failed", error instanceof Error ? error.message : "会话落库失败", true)
      return null
    }
  }

  private resetAudioPersistenceBuffers(): void {
    this.activeBeauticianAudioChunks = []
    this.activeBeauticianAudioBytes = 0
    this.activeCustomerAudioChunksBySentence.clear()
  }

  private captureBeauticianAudioChunk(chunk: Buffer): void {
    if (!chunk.length) return
    if (this.activeBeauticianAudioBytes + chunk.length > MAX_PERSISTED_AUDIO_BYTES) {
      if (this.activeBeauticianAudioBytes <= MAX_PERSISTED_AUDIO_BYTES) {
        this.deps.logger.warn("[voice-coach-ws] beautician_audio_persist_limit", {
          sessionId: this.session.sessionId,
          turnIndex: this.activeTurnIndex,
          bytes: this.activeBeauticianAudioBytes + chunk.length,
          maxBytes: MAX_PERSISTED_AUDIO_BYTES,
        })
      }
      this.activeBeauticianAudioBytes = MAX_PERSISTED_AUDIO_BYTES + 1
      return
    }
    this.activeBeauticianAudioChunks.push(Buffer.from(chunk))
    this.activeBeauticianAudioBytes += chunk.length
  }

  private async persistBeauticianAudio(turnId: string): Promise<string | null> {
    if (!this.activeBeauticianAudioChunks.length) return null
    if (this.activeBeauticianAudioBytes > MAX_PERSISTED_AUDIO_BYTES) return null
    const audio = Buffer.concat(this.activeBeauticianAudioChunks)
    if (!audio.length) return null

    const audioPath = `${this.session.userId}/${this.session.sessionId}/${turnId}.mp3`
    await this.deps.uploadAudio({
      path: audioPath,
      data: audio,
      contentType: "audio/mpeg",
    })
    return audioPath
  }

  private async persistCustomerAudio(turnId: string): Promise<string | null> {
    const orderedChunks: Buffer[] = []
    const sentenceIndexes = Array.from(this.activeCustomerAudioChunksBySentence.keys()).sort((a, b) => a - b)
    for (const index of sentenceIndexes) {
      orderedChunks.push(...(this.activeCustomerAudioChunksBySentence.get(index) || []))
    }
    if (!orderedChunks.length) return null

    const audio = Buffer.concat(orderedChunks)
    if (!audio.length || audio.length > MAX_PERSISTED_AUDIO_BYTES) return null

    const audioPath = `${this.session.userId}/${this.session.sessionId}/${turnId}.mp3`
    await this.deps.uploadAudio({
      path: audioPath,
      data: audio,
      contentType: "audio/mpeg",
    })
    await updateTurnAudio({
      turnId,
      audioPath,
      status: "audio_ready",
    })
    return audioPath
  }

  private trackAbortController(controller: AbortController): void {
    this.activeAbortControllers.add(controller)
    this.session.abortControllers = Array.from(this.activeAbortControllers)
    this.syncTrackedResources()
  }

  private untrackAbortController(controller: AbortController): void {
    this.activeAbortControllers.delete(controller)
    this.session.abortControllers = Array.from(this.activeAbortControllers)
    this.syncTrackedResources()
  }

  private abortTrackedControllers(reason: string): void {
    for (const controller of this.activeAbortControllers) {
      try {
        controller.abort(reason)
      } catch {
        // Ignore abort errors during cleanup.
      }
    }
    this.clearTrackedAbortControllers()
  }

  private clearTrackedAbortControllers(): void {
    this.activeAbortControllers.clear()
    this.session.abortControllers = []
    this.syncTrackedResources()
  }

  private clearAsr(): void {
    this.activeAsr = null
    this.session.asrInstance = null
    this.syncTrackedResources()
  }

  private clearTtsInstances(): void {
    for (const instance of this.activeTtsInstances) {
      try {
        instance.abort()
      } catch {
        // Ignore late abort errors during cleanup.
      }
    }
    this.activeTtsInstances.clear()
    this.session.ttsInstances = []
    this.syncTrackedResources()
  }

  private syncTrackedResources(): void {
    this.bargeInController.register({
      abortControllers: Array.from(this.activeAbortControllers),
      asrInstance: this.activeAsr,
      ttsInstances: Array.from(this.activeTtsInstances),
    })
  }

  private logLatencyMetrics(): void {
    const metrics = this.activeMetrics
    const audioEndAt = metrics.audioEndAt
    if (!audioEndAt) return

    this.deps.logger.info("[voice-coach-ws] latency", {
      sessionId: this.session.sessionId,
      turnIndex: this.activeTurnIndex,
      asrMs: metrics.asrFinalAt ? metrics.asrFinalAt - audioEndAt : null,
      llmFirstTokenMs: metrics.llmFirstTokenAt ? metrics.llmFirstTokenAt - audioEndAt : null,
      firstSentenceMs: metrics.firstSentenceAt ? metrics.firstSentenceAt - audioEndAt : null,
      ttsFirstChunkMs: metrics.ttsFirstChunkAt ? metrics.ttsFirstChunkAt - audioEndAt : null,
      ttsDoneMs: metrics.ttsDoneAt ? metrics.ttsDoneAt - audioEndAt : null,
      replyTriggerSource: metrics.replyTriggerSource,
    })
  }

  private getStablePartialText(): string {
    if (!config.voiceCoach.earlyReplyEnabled) return ""

    const partialText = String(this.activeBeauticianText || "").trim()
    if (!partialText || partialText.length < config.voiceCoach.earlyReplyMinChars) {
      return ""
    }

    if (!this.latestPartialAt) return ""
    if (Date.now() - this.latestPartialAt < config.voiceCoach.earlyReplyStableMs) {
      return ""
    }

    return partialText
  }

  private async finalizeAsrResult(
    runToken: number,
    asr: StreamingAsr,
    fallbackText: string,
    clientAudioSeconds: number,
  ): Promise<StreamingAsrResult> {
    try {
      const asrResult = await asr.finish()
      if (!this.isRunActive(runToken)) {
        throw new Error("streaming_asr_aborted")
      }

      this.clearAsr()

      const finalText = String(asrResult.text || "").trim() || fallbackText
      const finalizedResult: StreamingAsrResult = {
        ...asrResult,
        text: finalText,
        durationSeconds: asrResult.durationSeconds || clientAudioSeconds,
      }

      this.activeBeauticianText = finalText
      this.activeMetrics.asrFinalAt ??= Date.now()
      this.safeSendJson({
        type: "asr.final",
        text: finalizedResult.text,
        confidence: finalizedResult.confidence,
      })

      return finalizedResult
    } catch (error) {
      this.clearAsr()

      if (!isAbortLike(error) && fallbackText) {
        const fallbackResult: StreamingAsrResult = {
          text: fallbackText,
          confidence: 0,
          durationSeconds: clientAudioSeconds,
        }

        this.deps.logger.warn("[voice-coach-ws] asr_finalize_fallback", {
          sessionId: this.session.sessionId,
          turnIndex: this.activeTurnIndex,
          error: error instanceof Error ? error.message : String(error),
        })
        this.activeBeauticianText = fallbackText
        this.activeMetrics.asrFinalAt ??= Date.now()
        this.safeSendJson({
          type: "asr.final",
          text: fallbackText,
          confidence: 0,
        })
        return fallbackResult
      }

      throw error
    }
  }

  private isRunActive(runToken: number): boolean {
    return !this.disposed && runToken === this.activeRunToken
  }

  private safeSendJson(msg: ServerMsg): void {
    try {
      this.sendJson(msg)
    } catch {
      // Ignore sends while the socket is closing.
    }
  }

  private safeSendBinary(data: Buffer): void {
    try {
      this.sendBinary(data)
    } catch {
      // Ignore sends while the socket is closing.
    }
  }

  private safeSendError(code: string, message: string, recoverable: boolean): void {
    this.safeSendJson({
      type: "error",
      code,
      message,
      recoverable,
    })
  }
}
