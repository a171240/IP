import { randomUUID } from "node:crypto"
import { performance } from "node:perf_hooks"
import { gunzipSync, gzipSync } from "node:zlib"
import WebSocket from "ws"

import {
  formatMs,
  getNumberArg,
  getStringArg,
  parseArgs,
  readEnv,
  readRequiredEnv,
  resolveOutputPath,
  timestampSlug,
  toHttpUrl,
  toStatusEmoji,
  writeJsonFile,
} from "./lib/tooling-utils.mjs"

const ARK_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
const ARK_DEFAULT_MODEL = "doubao-seed-1-6-flash-250828"
const ARK_PROMPT = "请只回复“ok”。"
const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
const TTS_TEXT = "连接预热。"
const ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel"

function joinUrl(baseUrl, pathname) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`
}

function encodeHeader({ messageType, flags, serialization, compression }) {
  const header = Buffer.allocUnsafe(4)
  header[0] = 0x11
  header[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f)
  header[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f)
  header[3] = 0x00
  return header
}

function encodeFrame(header, payload) {
  const size = Buffer.allocUnsafe(4)
  size.writeUInt32BE(payload.length, 0)
  return Buffer.concat([header, size, payload])
}

function encodeJsonPayload(payload) {
  return gzipSync(Buffer.from(JSON.stringify(payload), "utf8"))
}

function decodePayload(buffer, compression) {
  if (compression === 0x01) {
    return gunzipSync(buffer)
  }
  return buffer
}

function readFrame(buffer) {
  const headerSize = buffer.readUInt8(0) & 0x0f
  const messageType = buffer.readUInt8(1) >> 4
  const flags = buffer.readUInt8(1) & 0x0f
  const compression = buffer.readUInt8(2) & 0x0f
  const hasSequencePrefix = messageType === 0x09 && (flags === 0x01 || flags === 0x03)
  const payloadSize = hasSequencePrefix ? buffer.readUInt32BE(8) : buffer.readUInt32BE(4)
  const payloadStart = hasSequencePrefix ? headerSize * 4 + 8 : headerSize * 4 + 4
  return {
    messageType,
    compression,
    payload: buffer.subarray(payloadStart, payloadStart + payloadSize),
  }
}

function parseAsrResponse(buffer) {
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
  return JSON.parse(decoded.toString("utf8"))
}

async function warmArk(options) {
  const startAt = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`ark_timeout:${options.timeoutMs}`)), options.timeoutMs)

  try {
    const response = await fetch(joinUrl(options.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        stream: true,
        messages: [
          { role: "system", content: "你是连接预热探针。" },
          { role: "user", content: ARK_PROMPT },
        ],
      }),
      signal: controller.signal,
    })

    const headersMs = performance.now() - startAt
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(body.trim() || `ark_http_${response.status}`)
    }
    if (!response.body) {
      throw new Error("ark_missing_body")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder("utf8")
    let buffer = ""
    let firstTokenMs = null
    let fullText = ""

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      while (true) {
        const boundary = buffer.search(/\r?\n\r?\n/)
        if (boundary < 0) break
        const match = buffer.match(/\r?\n\r?\n/)
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + (match?.[0]?.length || 2))

        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
        if (!dataLines.length) continue

        const joined = dataLines.join("\n")
        if (joined === "[DONE]") {
          return {
            ok: true,
            headersMs: Math.round(headersMs),
            firstTokenMs: firstTokenMs == null ? null : Math.round(firstTokenMs),
            totalMs: Math.round(performance.now() - startAt),
            sample: fullText.trim().slice(0, 80),
          }
        }

        let token = ""
        try {
          const parsed = JSON.parse(joined)
          const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null
          token =
            choice?.delta?.content ||
            choice?.delta?.text ||
            choice?.text ||
            parsed.content ||
            parsed.text ||
            ""
        } catch {
          token = joined
        }

        if (token) {
          firstTokenMs ??= performance.now() - startAt
          fullText += token
          await reader.cancel().catch(() => undefined)
          return {
            ok: true,
            headersMs: Math.round(headersMs),
            firstTokenMs: Math.round(firstTokenMs),
            totalMs: Math.round(performance.now() - startAt),
            sample: fullText.trim().slice(0, 80),
          }
        }
      }
    }

    return {
      ok: true,
      headersMs: Math.round(headersMs),
      firstTokenMs: firstTokenMs == null ? null : Math.round(firstTokenMs),
      totalMs: Math.round(performance.now() - startAt),
      sample: fullText.trim().slice(0, 80),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function warmTts(options) {
  const startAt = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`tts_timeout:${options.timeoutMs}`)), options.timeoutMs)

  try {
    const response = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-app-id": options.appId,
        "x-api-access-key": options.accessToken,
        "x-api-resource-id": options.resourceId,
      },
      body: JSON.stringify({
        user: { uid: "voice_coach_probe" },
        req_params: {
          text: options.text,
          speaker: options.voiceType,
          audio_params: { format: "mp3", sample_rate: 24000 },
          additions: JSON.stringify({ silence_duration: 125 }),
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(body.trim() || `tts_http_${response.status}`)
    }
    if (!response.body) {
      throw new Error("tts_missing_body")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder("utf8")
    let textBuffer = ""
    let firstChunkMs = null
    let chunkCount = 0

    const processLine = (line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      const payload = JSON.parse(trimmed)
      const code = typeof payload.code === "number" ? payload.code : 0
      if (code !== 0 && code !== 20000000) {
        throw new Error(payload.message || `tts_code_${code}`)
      }
      if (typeof payload.data === "string" && payload.data.trim()) {
        chunkCount += 1
        firstChunkMs ??= performance.now() - startAt
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
          return {
            ok: true,
            firstChunkMs: firstChunkMs == null ? null : Math.round(firstChunkMs),
            totalMs: Math.round(performance.now() - startAt),
            chunkCount,
          }
        }
      }
    }

    if (textBuffer.trim()) {
      processLine(textBuffer)
    }

    return {
      ok: true,
      firstChunkMs: firstChunkMs == null ? null : Math.round(firstChunkMs),
      totalMs: Math.round(performance.now() - startAt),
      chunkCount,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function warmAsrHandshake(options) {
  const startAt = performance.now()

  return new Promise((resolve, reject) => {
    let settled = false
    let openAt = null
    let probeTimer = null
    const socket = new WebSocket(ASR_URL, {
      headers: {
        "X-Api-App-Key": options.appId,
        "X-Api-Access-Key": options.accessToken,
        "X-Api-Resource-Id": options.resourceId,
      },
      perMessageDeflate: false,
      handshakeTimeout: options.timeoutMs,
    })

    const finish = (error, payload) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (probeTimer) clearTimeout(probeTimer)
      try {
        socket.close(1000, "probe_done")
      } catch {
        // Ignore late close failures.
      }
      if (error) {
        reject(error)
        return
      }
      resolve(payload)
    }

    const timeout = setTimeout(() => {
      finish(new Error(`streaming_asr_timeout:${options.timeoutMs}`))
    }, options.timeoutMs)

    socket.once("open", () => {
      openAt = performance.now()
      const payload = encodeJsonPayload({
        app: {
          appid: options.appId,
          token: options.accessToken,
          cluster: options.resourceId,
        },
        user: {
          uid: "voice_coach_probe",
        },
        audio: {
          format: "mp3",
          codec: "opus",
          rate: 16000,
          bits: 16,
          channel: 1,
          language: "zh-CN",
        },
        request: {
          reqid: randomUUID(),
          sequence: 1,
          nbest: 1,
          show_utterances: true,
          result_type: "single",
          vad_signal: true,
          workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
        },
      })

      socket.send(
        encodeFrame(
          encodeHeader({ messageType: 0x01, flags: 0x00, serialization: 0x01, compression: 0x01 }),
          payload,
        ),
      )

      probeTimer = setTimeout(() => {
        finish(null, {
          ok: true,
          connectMs: Math.round((openAt ?? performance.now()) - startAt),
          ackMs: null,
        })
      }, 250)
    })

    socket.on("message", (data) => {
      try {
        parseAsrResponse(Buffer.isBuffer(data) ? data : Buffer.from(data))
        finish(null, {
          ok: true,
          connectMs: Math.round((openAt ?? performance.now()) - startAt),
          ackMs: Math.round(performance.now() - startAt),
        })
      } catch (error) {
        finish(error)
      }
    })

    socket.once("error", (error) => {
      finish(error)
    })

    socket.once("unexpected-response", (_request, response) => {
      const chunks = []
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      response.on("end", () => {
        finish(
          new Error(
            `streaming_asr_upgrade_failed_${response.statusCode || "unknown"}:${Buffer.concat(chunks).toString("utf8").trim()}`,
          ),
        )
      })
    })
  })
}

async function warmHealthEndpoint(url, timeoutMs) {
  const startAt = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`health_timeout:${timeoutMs}`)), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    const text = await response.text().catch(() => "")
    if (!response.ok) {
      throw new Error(text.trim() || `health_http_${response.status}`)
    }
    return {
      ok: true,
      totalMs: Math.round(performance.now() - startAt),
      sample: text.trim().slice(0, 120),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const timeoutMs = getNumberArg(args, "timeout-ms", 12000)
  const outputPath = resolveOutputPath(getStringArg(args, "output", ""), `voice-coach-warm-${timestampSlug()}.json`)
  const healthUrl = toHttpUrl(getStringArg(args, "health-url", readEnv("VOICE_COACH_WS_HEALTH_URL", "http://127.0.0.1:8080/healthz")))

  const checks = [
    {
      name: "ark",
      label: "Ark chat completion",
      run: () =>
        warmArk({
          apiKey: readRequiredEnv("ARK_API_KEY"),
          baseUrl: readEnv("ARK_BASE_URL", ARK_DEFAULT_BASE_URL),
          model: readEnv("ARK_VOICE_COACH_FAST_MODEL", readEnv("ARK_MODEL", ARK_DEFAULT_MODEL)),
          timeoutMs,
        }),
    },
    {
      name: "tts",
      label: "Volc TTS",
      run: () =>
        warmTts({
          appId: readRequiredEnv("VOLC_SPEECH_APP_ID"),
          accessToken: readRequiredEnv("VOLC_SPEECH_ACCESS_TOKEN"),
          resourceId: readEnv("VOLC_TTS_RESOURCE_ID", "seed-tts-2.0"),
          voiceType: readEnv("VOLC_TTS_VOICE_TYPE", "zh_female_vv_uranus_bigtts"),
          timeoutMs,
          text: getStringArg(args, "tts-text", TTS_TEXT),
        }),
    },
    {
      name: "asr",
      label: "Volc streaming ASR",
      run: () =>
        warmAsrHandshake({
          appId: readRequiredEnv("VOLC_SPEECH_APP_ID"),
          accessToken: readRequiredEnv("VOLC_SPEECH_ACCESS_TOKEN"),
          resourceId: readEnv("VOLC_STREAMING_ASR_RESOURCE_ID", readEnv("VOLC_ASR_RESOURCE_ID", "volc.bigasr.sauc.duration")),
          timeoutMs,
        }),
    },
  ]

  if (healthUrl) {
    checks.push({
      name: "health",
      label: "voice-coach-ws /healthz",
      run: () => warmHealthEndpoint(healthUrl, timeoutMs),
    })
  }

  const results = []
  for (const check of checks) {
    try {
      const result = await check.run()
      results.push({
        name: check.name,
        label: check.label,
        ok: true,
        ...result,
      })
    } catch (error) {
      results.push({
        name: check.name,
        label: check.label,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    timeoutMs,
    results,
  }

  await writeJsonFile(outputPath, payload)

  for (const item of results) {
    const metrics = [
      item.connectMs != null ? `connect=${formatMs(item.connectMs)}` : null,
      item.ackMs != null ? `ack=${formatMs(item.ackMs)}` : null,
      item.headersMs != null ? `headers=${formatMs(item.headersMs)}` : null,
      item.firstTokenMs != null ? `firstToken=${formatMs(item.firstTokenMs)}` : null,
      item.firstChunkMs != null ? `firstChunk=${formatMs(item.firstChunkMs)}` : null,
      item.totalMs != null ? `total=${formatMs(item.totalMs)}` : null,
    ]
      .filter(Boolean)
      .join(" ")

    console.log(`${toStatusEmoji(item.ok)} ${item.label}${metrics ? ` ${metrics}` : ""}`)
    if (!item.ok && item.error) {
      console.log(`  ${item.error}`)
    }
  }

  console.log(`JSON report: ${outputPath}`)

  if (results.some((item) => !item.ok)) {
    process.exitCode = 1
  }
}

await run()
