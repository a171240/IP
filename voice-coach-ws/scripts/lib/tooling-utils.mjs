import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(MODULE_DIR, "..", "..")
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..")

for (const candidate of [
  path.join(PACKAGE_ROOT, ".env"),
  path.join(PACKAGE_ROOT, ".env.local"),
  path.join(REPO_ROOT, ".env"),
  path.join(REPO_ROOT, ".env.local"),
]) {
  dotenv.config({ path: candidate })
}

export { PACKAGE_ROOT, REPO_ROOT }

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index]
    if (!part) continue

    if (!part.startsWith("--")) {
      args._.push(part)
      continue
    }

    const trimmed = part.slice(2)
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex >= 0) {
      const key = trimmed.slice(0, eqIndex)
      const value = trimmed.slice(eqIndex + 1)
      args[key] = value
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      args[trimmed] = true
      continue
    }

    args[trimmed] = next
    index += 1
  }

  return args
}

export function getStringArg(args, key, fallback = "") {
  const value = args[key]
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

export function getNumberArg(args, key, fallback) {
  const raw = getStringArg(args, key, "")
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getBooleanArg(args, key, fallback = false) {
  const value = args[key]
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return fallback

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "y":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "n":
    case "off":
      return false
    default:
      return fallback
  }
}

export function optionalString(value) {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed
}

export function readEnv(name, fallback = "") {
  return optionalString(process.env[name]) || fallback
}

export function readRequiredEnv(name) {
  const value = readEnv(name)
  if (!value) {
    throw new Error(`missing_env:${name}`)
  }
  return value
}

export function resolveOutputPath(inputPath, fallbackName) {
  if (inputPath) {
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
  }
  return path.join(PACKAGE_ROOT, ".tmp", fallbackName)
}

export async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

export async function writeJsonFile(filePath, value) {
  await ensureParentDir(filePath)
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export async function writeTextFile(filePath, value) {
  await ensureParentDir(filePath)
  await fs.writeFile(filePath, value, "utf8")
}

export function percentile(values, percentileValue) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b)
  if (!numeric.length) return null
  if (numeric.length === 1) return numeric[0]

  const rank = (percentileValue / 100) * (numeric.length - 1)
  const lowIndex = Math.floor(rank)
  const highIndex = Math.ceil(rank)
  if (lowIndex === highIndex) return numeric[lowIndex]

  const low = numeric[lowIndex]
  const high = numeric[highIndex]
  return low + (high - low) * (rank - lowIndex)
}

export function roundMs(value) {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value)
}

export function summarizeMetric(runs, key) {
  const values = runs
    .map((run) => run.metrics?.[key])
    .filter((value) => typeof value === "number" && Number.isFinite(value))

  if (!values.length) {
    return {
      count: 0,
      min: null,
      p50: null,
      p90: null,
      max: null,
      avg: null,
    }
  }

  const sum = values.reduce((total, value) => total + value, 0)
  return {
    count: values.length,
    min: roundMs(Math.min(...values)),
    p50: roundMs(percentile(values, 50)),
    p90: roundMs(percentile(values, 90)),
    p99: roundMs(percentile(values, 99)),
    max: roundMs(Math.max(...values)),
    avg: roundMs(sum / values.length),
  }
}

export function summarizeMetrics(runs, keys) {
  const summary = {}
  for (const key of keys) {
    summary[key] = summarizeMetric(runs, key)
  }
  return summary
}

export function toStatusEmoji(ok) {
  return ok ? "PASS" : "FAIL"
}

export function formatMs(value) {
  return value == null || !Number.isFinite(value) ? "-" : `${Math.round(value)} ms`
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-")
}

export function shortId(value, length = 8) {
  const raw = optionalString(value)
  if (!raw) return "-"
  return raw.slice(0, length)
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms))
  })
}

export function buildThresholdSummary(summary, thresholds) {
  const output = {}
  for (const [key, limit] of Object.entries(thresholds)) {
    const p90 = summary[key]?.p90 ?? null
    output[key] = {
      limitMs: limit,
      p90,
      ok: typeof p90 === "number" ? p90 <= limit : false,
    }
  }
  return output
}

export async function readBinaryFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
  const buffer = await fs.readFile(absolutePath)
  return {
    absolutePath,
    buffer,
  }
}

export function toHttpUrl(inputUrl) {
  const raw = optionalString(inputUrl)
  if (!raw) return ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  if (raw.startsWith("ws://")) return `http://${raw.slice(5)}`
  if (raw.startsWith("wss://")) return `https://${raw.slice(6)}`
  return raw
}

export function toWsUrl(inputUrl) {
  const raw = optionalString(inputUrl)
  if (!raw) return ""
  if (raw.startsWith("ws://") || raw.startsWith("wss://")) return raw
  if (raw.startsWith("http://")) return `ws://${raw.slice(7)}`
  if (raw.startsWith("https://")) return `wss://${raw.slice(8)}`
  return raw
}
