import { performance } from "node:perf_hooks"
import process from "node:process"
import WebSocket from "ws"

import {
  buildThresholdSummary,
  formatMs,
  getNumberArg,
  getStringArg,
  parseArgs,
  readBinaryFile,
  readEnv,
  readRequiredEnv,
  resolveOutputPath,
  roundMs,
  shortId,
  sleep,
  summarizeMetrics,
  timestampSlug,
  toHttpUrl,
  toStatusEmoji,
  toWsUrl,
  writeJsonFile,
} from "./lib/tooling-utils.mjs"

const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
const DEFAULT_THRESHOLDS = {
  asrMs: 1500,
  llmFirstTokenMs: 1500,
  ttsFirstChunkMs: 2000,
}
const METRIC_KEYS = [
  "asrMs",
  "llmFirstTokenMs",
  "firstSentenceMs",
  "ttsFirstChunkMs",
  "ttsDoneMs",
  "analysisMs",
  "analysisAfterTtsMs",
]

async function createSession({ appBaseUrl, token, scenarioId }) {
  const response = await fetch(`${appBaseUrl.replace(/\/+$/, "")}/api/voice-coach/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scenario_id: scenarioId }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `create_session_failed_${response.status}`)
  }

  return payload
}

async function synthesizeProbeAudio({ text }) {
  const response = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-app-id": readRequiredEnv("VOLC_SPEECH_APP_ID"),
      "x-api-access-key": readRequiredEnv("VOLC_SPEECH_ACCESS_TOKEN"),
      "x-api-resource-id": readEnv("VOLC_TTS_RESOURCE_ID", "seed-tts-2.0"),
    },
    body: JSON.stringify({
      user: { uid: "voice_coach_latency_probe" },
      req_params: {
        text,
        speaker: readEnv("VOLC_TTS_VOICE_TYPE", "zh_female_vv_uranus_bigtts"),
        audio_params: { format: "mp3", sample_rate: 16000 },
        additions: JSON.stringify({ silence_duration: 125 }),
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(body.trim() || `probe_tts_http_${response.status}`)
  }
  if (!response.body) {
    throw new Error("probe_tts_missing_body")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf8")
  let textBuffer = ""
  const chunks = []

  const processLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    const payload = JSON.parse(trimmed)
    const code = typeof payload.code === "number" ? payload.code : 0
    if (code !== 0 && code !== 20000000) {
      throw new Error(payload.message || `probe_tts_code_${code}`)
    }
    if (typeof payload.data === "string" && payload.data.trim()) {
      chunks.push(Buffer.from(payload.data, "base64"))
    }
    return code === 20000000
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    textBuffer += decoder.decode(value, { stream: true })
    const lines = textBuffer.split(/\r?\n/)
    textBuffer = lines.pop() || ""
    for (const line of lines) {
      if (processLine(line)) {
        await reader.cancel().catch(() => undefined)
        return Buffer.concat(chunks)
      }
    }
  }

  if (textBuffer.trim()) {
    processLine(textBuffer)
  }

  if (!chunks.length) {
    throw new Error("probe_tts_empty_audio")
  }

  return Buffer.concat(chunks)
}

async function loadAudioSourceLegacy(args) {
  const audioPath = getStringArg(args, "audio", "")
  if (audioPath) {
    const { absolutePath, buffer } = await readBinaryFile(audioPath)
    return {
      kind: "file",
      label: absolutePath,
      buffer,
    }
  }

  const promptText = getStringArg(
    args,
    "prompt-text",
    "医生说美容院不能按胸，这样操作到底安不安全？",
  )
  const normalizedPromptText = promptText.includes("鍖荤敓")
    ? "医生说美容院不能按胸，这样操作到底安不安全？我最担心的是会不会伤到组织，麻烦先跟我说清楚。"
    : promptText
  const defaultPromptText =
    "\u533b\u751f\u8bf4\u7f8e\u5bb9\u9662\u4e0d\u80fd\u6309\u80f8\uff0c\u8fd9\u6837\u64cd\u4f5c\u5230\u5e95\u5b89\u4e0d\u5b89\u5168\uff1f\u6211\u6700\u62c5\u5fc3\u7684\u662f\u4f1a\u4e0d\u4f1a\u4f24\u5230\u7ec4\u7ec7\uff0c\u9ebb\u70e6\u5148\u8ddf\u6211\u8bf4\u6e05\u695a\u3002"
  const hasExplicitPromptText = typeof args["prompt-text"] === "string" && args["prompt-text"].trim()
  const effectivePromptText = hasExplicitPromptText ? promptText : defaultPromptText
  const buffer = await synthesizeProbeAudio({ text: effectivePromptText })
  return {
    kind: "generated",
    label: `generated:${effectivePromptText.slice(0, 32)}`,
    buffer,
    promptText: effectivePromptText,
    suggestedClientAudioSeconds: 3.8,
  }
}

async function loadAudioSource(args) {
  const audioPath = getStringArg(args, "audio", "")
  if (audioPath) {
    const { absolutePath, buffer } = await readBinaryFile(audioPath)
    return {
      kind: "file",
      label: absolutePath,
      buffer,
    }
  }

  const promptText = getStringArg(args, "prompt-text", "")
  const defaultPromptText =
    "\u533b\u751f\u8bf4\u7f8e\u5bb9\u9662\u4e0d\u80fd\u6309\u80f8\uff0c\u8fd9\u6837\u64cd\u4f5c\u5230\u5e95\u5b89\u4e0d\u5b89\u5168\uff1f\u6211\u6700\u62c5\u5fc3\u7684\u662f\u4f1a\u4e0d\u4f1a\u4f24\u5230\u7ec4\u7ec7\uff0c\u9ebb\u70e6\u5148\u8ddf\u6211\u8bf4\u6e05\u695a\u3002"
  const effectivePromptText = promptText || defaultPromptText
  const buffer = await synthesizeProbeAudio({ text: effectivePromptText })
  return {
    kind: "generated",
    label: `generated:${effectivePromptText.slice(0, 32)}`,
    buffer,
    promptText: effectivePromptText,
    suggestedClientAudioSeconds: 3.8,
  }
}

async function streamAudio(ws, audioBuffer, { chunkBytes, streamMs }) {
  if (!audioBuffer.length) {
    throw new Error("audio_buffer_empty")
  }

  const totalChunks = Math.max(1, Math.ceil(audioBuffer.length / chunkBytes))
  const intervalMs = totalChunks > 1 ? Math.max(0, streamMs / totalChunks) : 0

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkBytes
    const end = Math.min(audioBuffer.length, start + chunkBytes)
    ws.send(audioBuffer.subarray(start, end), { binary: true })
    if (intervalMs > 0 && index < totalChunks - 1) {
      await sleep(intervalMs)
    }
  }
}

function collectMetrics(events) {
  const audioEndAt = events.audioEndAt
  if (!audioEndAt) {
    return {
      asrMs: null,
      llmFirstTokenMs: null,
      firstSentenceMs: null,
      ttsFirstChunkMs: null,
      ttsDoneMs: null,
      analysisMs: null,
      analysisAfterTtsMs: null,
    }
  }

  return {
    asrMs: events.asrFinalAt ? roundMs(events.asrFinalAt - audioEndAt) : null,
    llmFirstTokenMs: events.llmFirstTokenAt ? roundMs(events.llmFirstTokenAt - audioEndAt) : null,
    firstSentenceMs: events.firstSentenceAt ? roundMs(events.firstSentenceAt - audioEndAt) : null,
    ttsFirstChunkMs: events.ttsFirstChunkAt ? roundMs(events.ttsFirstChunkAt - audioEndAt) : null,
    ttsDoneMs: events.ttsDoneAt ? roundMs(events.ttsDoneAt - audioEndAt) : null,
    analysisMs: events.analysisAt ? roundMs(events.analysisAt - audioEndAt) : null,
    analysisAfterTtsMs:
      events.analysisAt && events.ttsDoneAt ? roundMs(events.analysisAt - events.ttsDoneAt) : null,
  }
}

async function runSingleIteration({
  iteration,
  wsBaseUrl,
  appBaseUrl,
  token,
  scenarioId,
  turnIndex,
  replyToTurnId,
  audioSource,
  clientAudioSeconds,
  streamMs,
  chunkBytes,
  waitAnalysisMs,
  overallTimeoutMs,
  directSessionId,
}) {
  const session = directSessionId
    ? {
        session_id: directSessionId,
        first_customer_turn: replyToTurnId ? { turn_id: replyToTurnId } : null,
      }
    : await createSession({ appBaseUrl, token, scenarioId })

  const sessionId = String(session.session_id || "")
  if (!sessionId) {
    throw new Error("session_id_missing")
  }

  const nextReplyToTurnId =
    replyToTurnId || String(session.first_customer_turn?.turn_id || "").trim() || undefined

  const startedAt = performance.now()
  const events = {
    sessionReadyAt: null,
    audioStartAt: null,
    audioEndAt: null,
    asrFinalAt: null,
    llmFirstTokenAt: null,
    firstSentenceAt: null,
    ttsFirstChunkAt: null,
    ttsDoneAt: null,
    analysisAt: null,
    turnSavedAt: null,
  }

  const messageCounts = {}
  let binaryChunkCount = 0
  const errors = []
  let savedTurnIds = null

  const wsUrl = new URL(toWsUrl(wsBaseUrl))
  wsUrl.searchParams.set("session_id", sessionId)

  const ws = new WebSocket(wsUrl, {
    headers: {
      authorization: `Bearer ${token}`,
    },
    perMessageDeflate: false,
  })

  return new Promise((resolve, reject) => {
    let settled = false
    let analysisTimer = null
    let overallTimer = null

    const finish = (error) => {
      if (settled) return
      settled = true
      if (analysisTimer) clearTimeout(analysisTimer)
      if (overallTimer) clearTimeout(overallTimer)
      try {
        ws.close(1000, "latency_done")
      } catch {
        // Ignore late close failures.
      }
      if (error) {
        reject(error)
        return
      }

      resolve({
        iteration,
        sessionId,
        replyToTurnId: nextReplyToTurnId || null,
        audioSource: audioSource.label,
        metrics: collectMetrics(events),
        timestampsMsFromConnect: Object.fromEntries(
          Object.entries(events).map(([key, value]) => [key, value == null ? null : roundMs(value - startedAt)]),
        ),
        errors,
        messageCounts,
        binaryChunkCount,
        savedTurnIds,
      })
    }

    const scheduleFinishAfterTts = () => {
      if (analysisTimer || !events.ttsDoneAt) return
      analysisTimer = setTimeout(() => finish(null), waitAnalysisMs)
    }

    overallTimer = setTimeout(() => {
      finish(new Error(`e2e_timeout:${overallTimeoutMs}`))
    }, overallTimeoutMs)

    ws.on("message", async (data, isBinary) => {
      const now = performance.now()

      if (isBinary) {
        binaryChunkCount += 1
        events.ttsFirstChunkAt ??= now
        return
      }

      let parsed
      try {
        parsed = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data))
      } catch (error) {
        finish(error instanceof Error ? error : new Error("invalid_json_message"))
        return
      }

      const type = String(parsed.type || "")
      messageCounts[type] = (messageCounts[type] || 0) + 1

      switch (type) {
        case "session.ready":
          events.sessionReadyAt = now
          ws.send(
            JSON.stringify({
              type: "audio.start",
              turn_index: turnIndex,
              ...(nextReplyToTurnId ? { reply_to_turn_id: nextReplyToTurnId } : {}),
            }),
          )
          events.audioStartAt = performance.now()
          try {
            await streamAudio(ws, audioSource.buffer, { chunkBytes, streamMs })
            events.audioEndAt = performance.now()
            ws.send(
              JSON.stringify({
                type: "audio.end",
                client_audio_seconds: clientAudioSeconds,
              }),
            )
          } catch (error) {
            finish(error instanceof Error ? error : new Error("audio_stream_failed"))
          }
          break
        case "asr.final":
          events.asrFinalAt ??= now
          break
        case "llm.text_delta":
          events.llmFirstTokenAt ??= now
          break
        case "llm.sentence_ready":
          events.firstSentenceAt ??= now
          break
        case "tts.done":
          events.ttsDoneAt ??= now
          if (events.analysisAt) {
            finish(null)
            return
          }
          scheduleFinishAfterTts()
          break
        case "llm.analysis":
          events.analysisAt ??= now
          if (events.ttsDoneAt) {
            finish(null)
            return
          }
          break
        case "turn.saved":
          events.turnSavedAt ??= now
          savedTurnIds = {
            beauticianTurnId: parsed.beautician_turn_id || null,
            customerTurnId: parsed.customer_turn_id || null,
          }
          break
        case "error": {
          const message = parsed.message || parsed.code || "voice_coach_error"
          errors.push({
            code: parsed.code || "error",
            message,
            recoverable: Boolean(parsed.recoverable),
          })
          finish(new Error(`${parsed.code || "voice_coach_error"}:${message}`))
          return
        }
        default:
          break
      }
    })

    ws.once("error", (error) => {
      finish(error)
    })

    ws.once("close", (code, reason) => {
      if (!settled && code !== 1000) {
        finish(new Error(`ws_closed:${code}:${String(reason || "")}`))
      }
    })
  })
}

function printRunSummary(run) {
  const status = run.errors.length ? "FAIL" : "PASS"
  console.log(
    `${status} run=${run.iteration} session=${shortId(run.sessionId)} asr=${formatMs(run.metrics.asrMs)} llm=${formatMs(run.metrics.llmFirstTokenMs)} tts=${formatMs(run.metrics.ttsFirstChunkMs)} done=${formatMs(run.metrics.ttsDoneMs)} analysis=${formatMs(run.metrics.analysisMs)}`,
  )
  if (run.errors.length) {
    for (const error of run.errors) {
      console.log(`  ${error.code}: ${error.message}`)
    }
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const directSessionId = getStringArg(args, "session-id", "")
  const runs = directSessionId ? 1 : Math.max(1, getNumberArg(args, "runs", 3))
  const token = getStringArg(args, "token", readEnv("VOICE_COACH_AUTH_TOKEN", ""))
  if (!token) {
    throw new Error("missing_token: pass --token or set VOICE_COACH_AUTH_TOKEN")
  }

  const wsBaseUrl = toWsUrl(
    getStringArg(args, "ws-url", readEnv("VOICE_COACH_WS_URL", "ws://127.0.0.1:8080/ws/voice-coach")),
  )
  const appBaseUrl = toHttpUrl(
    getStringArg(args, "app-base-url", readEnv("VOICE_COACH_APP_BASE_URL", "http://127.0.0.1:3000")),
  )
  const scenarioId = getStringArg(args, "scenario-id", "objection_safety")
  const turnIndex = Math.max(0, getNumberArg(args, "turn-index", 1))
  const replyToTurnId = getStringArg(args, "reply-to-turn-id", "")
  const waitAnalysisMs = Math.max(0, getNumberArg(args, "wait-analysis-ms", 15000))
  const overallTimeoutMs = Math.max(5000, getNumberArg(args, "timeout-ms", 45000))
  const chunkBytes = Math.max(512, getNumberArg(args, "chunk-bytes", 1024))
  const outputPath = resolveOutputPath(getStringArg(args, "output", ""), `voice-coach-latency-${timestampSlug()}.json`)

  const audioSource = await loadAudioSource(args)
  const defaultClientAudioSeconds = audioSource.suggestedClientAudioSeconds || 2.2
  const explicitClientAudioSeconds = getStringArg(args, "client-audio-seconds", "")
  const explicitStreamMs = getStringArg(args, "stream-ms", "")
  const clientAudioSeconds = Math.max(
    0.1,
    explicitClientAudioSeconds
      ? getNumberArg(args, "client-audio-seconds", defaultClientAudioSeconds)
      : defaultClientAudioSeconds,
  )
  const streamMs = Math.max(
    0,
    explicitStreamMs
      ? getNumberArg(args, "stream-ms", Math.round(clientAudioSeconds * 1000))
      : Math.round(clientAudioSeconds * 1000),
  )
  const runResults = []

  for (let iteration = 1; iteration <= runs; iteration += 1) {
    const result = await runSingleIteration({
      iteration,
      wsBaseUrl,
      appBaseUrl,
      token,
      scenarioId,
      turnIndex,
      replyToTurnId,
      audioSource,
      clientAudioSeconds,
      streamMs,
      chunkBytes,
      waitAnalysisMs,
      overallTimeoutMs,
      directSessionId,
    })
    runResults.push(result)
    printRunSummary(result)
  }

  const summary = summarizeMetrics(runResults, METRIC_KEYS)
  const thresholdSummary = buildThresholdSummary(summary, DEFAULT_THRESHOLDS)
  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      runs,
      directSessionId: directSessionId || null,
      wsBaseUrl,
      appBaseUrl: directSessionId ? null : appBaseUrl,
      scenarioId,
      turnIndex,
      waitAnalysisMs,
      overallTimeoutMs,
      chunkBytes,
      clientAudioSeconds,
      streamMs,
      audioSource: {
        kind: audioSource.kind,
        label: audioSource.label,
        bytes: audioSource.buffer.length,
        promptText: audioSource.promptText || null,
      },
    },
    runs: runResults,
    summary,
    thresholds: thresholdSummary,
  }

  await writeJsonFile(outputPath, payload)

  console.log("")
  console.log("Thresholds:")
  for (const [key, details] of Object.entries(thresholdSummary)) {
    console.log(`${toStatusEmoji(details.ok)} ${key} p90=${formatMs(details.p90)} limit=${formatMs(details.limitMs)}`)
  }
  console.log(`JSON report: ${outputPath}`)
}

await run()
