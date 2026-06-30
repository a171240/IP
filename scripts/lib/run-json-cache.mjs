import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"

const CACHE_ENV = "MEIYE_ALIYUN_RUN_JSON_CACHE_DIR"
const cacheDir = process.env[CACHE_ENV] || (() => {
  const dir = join(tmpdir(), `meiye-aliyun-run-json-${process.pid}`)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
})()

function cacheKey(cwd, scriptArgs) {
  return createHash("sha256")
    .update(JSON.stringify({
      node: process.execPath,
      cwd: resolve(cwd),
      scriptArgs,
    }))
    .digest("hex")
}

export function runJsonWithCache(label, scriptArgs, options = {}) {
  const cwd = options.cwd || process.cwd()
  const key = cacheKey(cwd, scriptArgs)
  const cachePath = join(cacheDir, `${key}.stdout.json`)
  const cached = existsSync(cachePath) ? readFileSync(cachePath, "utf8") : ""

  let stdout = cached
  let stderr = ""
  let status = 0

  if (!stdout) {
    const result = spawnSync(process.execPath, scriptArgs, {
      cwd,
      encoding: "utf8",
      maxBuffer: options.maxBuffer || 1024 * 1024 * 40,
      timeout: options.timeoutMs || 0,
      env: {
        ...process.env,
        [CACHE_ENV]: cacheDir,
      },
    })
    stdout = result.stdout || ""
    stderr = result.stderr || ""
    status = result.status || 0
    if (result.error) {
      const code = result.error.code || "spawn_error"
      const message = result.error.message || String(result.error)
      if (options.allowFailure) {
        return {
          ok: false,
          error: `${code}:${message}`,
          timedOut: code === "ETIMEDOUT",
          stdoutLines: lineCount(stdout),
          stderrLines: lineCount(stderr),
        }
      }
      throw new Error(`${label}_failed:${code}\n${message}\n${stderr || stdout}`)
    }
    if (status === 0 && stdout.trim()) {
      writeFileSync(cachePath, stdout, { mode: 0o600 })
    }
  }

  if (status !== 0 && !options.allowFailure) {
    throw new Error(`${label}_failed:${status}\n${stderr || stdout}`)
  }

  const trimmed = stdout.trim()
  if (!trimmed) {
    if (options.allowFailure) return { ok: false, error: stderr || `exit ${status}` }
    throw new Error(`${label}_empty_stdout`)
  }

  try {
    return JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`invalid_json_from_${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function lineCount(value) {
  const text = String(value || "").trim()
  return text ? text.split(/\r?\n/).filter(Boolean).length : 0
}
