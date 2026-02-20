#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, ".env.local")
const SELFCHECK_SCRIPT = path.join(ROOT, "scripts", "asr_selfcheck.mjs")

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

function isTrue(raw, fallback = false) {
  const v = String(raw ?? (fallback ? "true" : "false"))
    .trim()
    .toLowerCase()
  return ["1", "true", "yes", "on"].includes(v)
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    })
    child.on("error", (err) => {
      console.error("[ASR-GATE] 启动命令失败：", err?.message || err)
      resolve(1)
    })
    child.on("exit", (code) => {
      resolve(typeof code === "number" ? code : 1)
    })
  })
}

function logStartupHealth(status, extra = {}) {
  const payload = {
    check: "startup_asr_flash_gate",
    status,
    occurred_at: new Date().toISOString(),
    require_flash: isTrue(process.env.VOICE_COACH_REQUIRE_FLASH, false),
    gate_enabled: isTrue(process.env.VOICE_COACH_ASR_STARTUP_GATE, true),
    ...extra,
  }
  console.info(`[ASR-STARTUP-HEALTH] ${JSON.stringify(payload)}`)
}

async function main() {
  await loadLocalEnv().catch(() => {})

  const args = process.argv.slice(2)
  if (!args.length) {
    console.error("[ASR-GATE] 缺少启动命令，例如: next dev")
    process.exit(1)
  }

  const requireFlash = isTrue(process.env.VOICE_COACH_REQUIRE_FLASH, false)
  const gateEnabled = isTrue(process.env.VOICE_COACH_ASR_STARTUP_GATE, true)

  if (requireFlash && gateEnabled) {
    console.info("[ASR-GATE] require_flash=true，启动前执行 ASR selfcheck...")
    const checkCode = await run(process.execPath, [SELFCHECK_SCRIPT])
    if (checkCode !== 0) {
      logStartupHealth("FAIL", { selfcheck_exit_code: checkCode })
      console.error("[ASR-GATE] selfcheck 失败，已阻断启动。请先处理 Flash 权限。")
      process.exit(checkCode)
    }
    logStartupHealth("PASS", { selfcheck_exit_code: 0 })
    console.info("[ASR-GATE] selfcheck 通过，继续启动。")
  } else {
    logStartupHealth("N/A")
    console.info(
      `[ASR-GATE] 跳过 selfcheck（require_flash=${requireFlash ? "true" : "false"} gate_enabled=${gateEnabled ? "true" : "false"}）`,
    )
  }

  const [command, ...commandArgs] = args
  const code = await run(command, commandArgs)
  process.exit(code)
}

main().catch((err) => {
  console.error("[ASR-GATE] 未处理异常：", err?.message || err)
  process.exit(1)
})
