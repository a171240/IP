#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { randomUUID } from "node:crypto"

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, ".env.local")
const FLASH_ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
const FLASH_RESOURCE_ID = "volc.bigasr.auc_turbo"
const FLASH_PERMISSION_HINT = "需要在控制台开通 volc.bigasr.auc_turbo 权限"
const occurredAt = new Date().toISOString()

function parseEnvLine(line) {
  const t = String(line || "").trim()
  if (!t || t.startsWith("#")) return null
  const i = t.indexOf("=")
  if (i <= 0) return null
  const key = t.slice(0, i).trim()
  let value = t.slice(i + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  value = value.replace(/\\n/g, "\n")
  return { key, value }
}

async function loadLocalEnv() {
  const content = await fs.readFile(ENV_PATH, "utf8")
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    if (!process.env[parsed.key]) {
      process.env[parsed.key] = parsed.value
    }
  }
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim()
  if (!value) throw new Error(`missing_env:${name}`)
  return value
}

function appidLast4(value) {
  const raw = String(value || "").trim()
  if (!raw) return null
  return raw.length <= 4 ? raw : raw.slice(-4)
}

function resolveEnvironment() {
  return (
    String(process.env.VOICE_COACH_ENV || "").trim() ||
    String(process.env.APP_ENV || "").trim() ||
    String(process.env.VERCEL_ENV || "").trim() ||
    String(process.env.NODE_ENV || "").trim() ||
    "unknown"
  )
}

function getHeaderValue(headers, key) {
  return headers.get(key) || headers.get(String(key).toLowerCase()) || ""
}

function buildAsrSelfcheckAudioBase64() {
  const sampleRate = 16_000
  const sampleCount = sampleRate
  const channels = 1
  const bytesPerSample = 2
  const dataSize = sampleCount * channels * bytesPerSample
  const wav = Buffer.alloc(44 + dataSize)

  wav.write("RIFF", 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write("WAVE", 8)
  wav.write("fmt ", 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * channels * bytesPerSample, 28)
  wav.writeUInt16LE(channels * bytesPerSample, 32)
  wav.writeUInt16LE(16, 34)
  wav.write("data", 36)
  wav.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.15
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }

  return wav.toString("base64")
}

async function runAsrSelfcheck() {
  await loadLocalEnv().catch(() => {})

  const appid = requireEnv("VOLC_SPEECH_APP_ID")
  const accessToken = requireEnv("VOLC_SPEECH_ACCESS_TOKEN")
  const flashRequestId = randomUUID()
  const audioB64 = buildAsrSelfcheckAudioBase64()
  const payload = {
    user: { uid: "asr_selfcheck" },
    audio: {
      format: "wav",
      data: audioB64,
    },
    request: {
      model_name: "bigmodel",
      enable_punc: true,
      show_utterances: true,
      result_type: "single",
      enable_ddc: true,
      enable_speaker_info: false,
      enable_channel_split: false,
      vad_segment_duration: 8000,
    },
  }

  let response
  try {
    response = await fetch(FLASH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": FLASH_RESOURCE_ID,
        "X-Api-Request-Id": flashRequestId,
        "X-Api-Sequence": "-1",
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    return {
      status: "FAIL",
      error_code: "asr_flash_network",
      flash_request_id: flashRequestId,
      flash_logid: null,
      appid_last4: appidLast4(appid),
      resource_id: FLASH_RESOURCE_ID,
      occurred_at: occurredAt,
      environment: resolveEnvironment(),
      http_status: null,
      api_status: null,
      api_code: null,
      message: err?.message || String(err),
      operation_hint: null,
    }
  }

  const flashLogid = getHeaderValue(response.headers, "X-Tt-Logid") || null
  const apiStatus = getHeaderValue(response.headers, "X-Api-Status-Code") || null
  const headerMessage = getHeaderValue(response.headers, "X-Api-Message") || null

  const json = await response.json().catch(() => null)
  const apiCode =
    typeof json?.code === "number" || typeof json?.code === "string" ? String(json?.code) : null
  const apiMessage = typeof json?.message === "string" ? json.message : headerMessage
  const permissionDenied =
    response.status === 403 &&
    (apiStatus === "45000030" || apiCode === "45000030" || String(apiMessage || "").includes("45000030"))

  let errorCode = null
  if (permissionDenied) {
    errorCode = "asr_flash_permission_denied"
  } else if (!response.ok) {
    errorCode = response.status >= 500 ? "asr_flash_http_5xx" : `asr_flash_http_${response.status}`
  } else if (apiStatus && apiStatus !== "20000000" && apiStatus !== "20000003") {
    errorCode = /^5/.test(apiStatus) ? "asr_flash_status_5xx" : `asr_flash_status_${apiStatus}`
  }

  const pass = !permissionDenied && (response.ok || Boolean(flashLogid) || Boolean(apiStatus))
  return {
    status: pass ? "PASS" : "FAIL",
    error_code: errorCode,
    flash_request_id: flashRequestId,
    flash_logid: flashLogid,
    appid_last4: appidLast4(appid),
    resource_id: FLASH_RESOURCE_ID,
    occurred_at: occurredAt,
    environment: resolveEnvironment(),
    http_status: response.status,
    api_status: apiStatus,
    api_code: apiCode,
    message: apiMessage,
    operation_hint: permissionDenied ? FLASH_PERMISSION_HINT : null,
  }
}

async function main() {
  try {
    const result = await runAsrSelfcheck()
    process.stdout.write(
      `[ASR-SELFCHECK] ${result.status} flash_request_id=${result.flash_request_id || "-"} flash_logid=${result.flash_logid || "-"} error_code=${result.error_code || "none"}\n`,
    )
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.stdout.write(
      `[ASR-HEALTH] ${JSON.stringify({
        check: "asr_flash_selfcheck",
        status: result.status,
        flash_request_id: result.flash_request_id || null,
        flash_logid: result.flash_logid || null,
        resource_id: result.resource_id || FLASH_RESOURCE_ID,
        occurred_at: result.occurred_at || occurredAt,
        environment: result.environment || resolveEnvironment(),
      })}\n`,
    )
    if (result.operation_hint) {
      process.stdout.write(`操作提示：${result.operation_hint}\n`)
    }
    if (result.status === "FAIL") {
      process.exitCode = 1
    }
  } catch (err) {
    const fallback = {
      status: "FAIL",
      error_code: err?.message || "asr_flash_selfcheck_failed",
      flash_request_id: null,
      flash_logid: null,
      appid_last4: appidLast4(process.env.VOLC_SPEECH_APP_ID || ""),
      resource_id: FLASH_RESOURCE_ID,
      occurred_at: occurredAt,
      environment: resolveEnvironment(),
      http_status: null,
      api_status: null,
      api_code: null,
      message: err?.message || String(err),
      operation_hint: null,
    }
    process.stdout.write(
      `[ASR-SELFCHECK] FAIL flash_request_id=- flash_logid=- error_code=${fallback.error_code || "unknown"}\n`,
    )
    process.stdout.write(`${JSON.stringify(fallback)}\n`)
    process.stdout.write(
      `[ASR-HEALTH] ${JSON.stringify({
        check: "asr_flash_selfcheck",
        status: "FAIL",
        flash_request_id: null,
        flash_logid: null,
        resource_id: FLASH_RESOURCE_ID,
        occurred_at: occurredAt,
        environment: resolveEnvironment(),
      })}\n`,
    )
    process.exitCode = 1
  }
}

main()
