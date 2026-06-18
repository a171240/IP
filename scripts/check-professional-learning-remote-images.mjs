import { readFileSync } from "node:fs"

const DEFAULT_BASE_URL = "https://www.ipnrgc.com"
const DEFAULT_CONCURRENCY = 4
const DEFAULT_TIMEOUT_MS = 30000
const MAX_FAILURES_TO_PRINT = 50

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    concurrency: DEFAULT_CONCURRENCY,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--base-url") {
      options.baseUrl = argv[index + 1]
      index += 1
    } else if (arg === "--concurrency") {
      options.concurrency = Number(argv[index + 1])
      index += 1
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(argv[index + 1])
      index += 1
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }

  if (!options.baseUrl) throw new Error("--base-url is required")
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer")
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new Error("--timeout-ms must be an integer >= 1000")
  }

  return options
}

function loadManifest() {
  const manifest = JSON.parse(readFileSync("scripts/required-professional-learning-rendered-assets.json", "utf8"))
  const assets = Array.isArray(manifest.assets) ? manifest.assets : []
  if (!assets.length) throw new Error("required professional-learning asset manifest is empty")
  return { manifest, assets }
}

async function checkUrl(url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Range: "bytes=0-0",
      },
      signal: controller.signal,
    })
    const contentType = response.headers.get("content-type") || ""
    if (response.body) await response.body.cancel()

    if (![200, 206].includes(response.status)) {
      return { ok: false, status: response.status, contentType, reason: `status ${response.status}` }
    }
    if (!contentType.toLowerCase().startsWith("image/")) {
      return { ok: false, status: response.status, contentType, reason: `content-type ${contentType || "missing"}` }
    }
    return { ok: true, status: response.status, contentType }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: null, contentType: "", reason: message }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { manifest, assets } = loadManifest()
  const failures = []
  let ok = 0
  let cursor = 0

  async function worker() {
    while (cursor < assets.length) {
      const index = cursor
      cursor += 1
      const asset = assets[index]
      const urlPath = asset && asset.url_path
      if (typeof urlPath !== "string" || !urlPath.startsWith("/")) {
        failures.push({
          index,
          url: urlPath,
          reason: "invalid url_path",
        })
        continue
      }

      const url = new URL(urlPath, options.baseUrl).toString()
      const result = await checkUrl(url, options.timeoutMs)
      if (result.ok) {
        ok += 1
      } else {
        failures.push({
          index,
          url,
          status: result.status,
          contentType: result.contentType,
          reason: result.reason,
          where: asset.where,
        })
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()))

  const summary = {
    baseUrl: options.baseUrl,
    schemaVersion: manifest.schema_version,
    renderedUniqueUrls: assets.length,
    ok,
    failureCount: failures.length,
    failures: failures.slice(0, MAX_FAILURES_TO_PRINT),
    truncatedFailures: Math.max(0, failures.length - MAX_FAILURES_TO_PRINT),
  }

  console.log(JSON.stringify(summary, null, 2))
  if (failures.length) process.exit(1)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
