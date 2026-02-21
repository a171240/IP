#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { spawn, execFile } from "node:child_process"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, "..")
const STABLE_PATH_ITEMS = ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
const REQUIRED_STAGE_KEYS = [
  "submit_ack_ms",
  "asr_ready_ms",
  "text_ready_ms",
  "audio_ready_ms",
  "queue_wait_before_main_ms",
  "queue_wait_before_tts_ms",
]

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "")
    if (!token.startsWith("--")) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !String(next).startsWith("--")) {
      out[key] = String(next)
      i += 1
      continue
    }
    out[key] = "true"
  }
  return out
}

function boolVal(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === "") return fallback
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase())
}

function intVal(raw, fallback) {
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withStablePath(env) {
  const src = env || {}
  const current = String(src.PATH || "")
    .split(":")
    .map((item) => item.trim())
    .filter(Boolean)
  const merged = [...STABLE_PATH_ITEMS, ...current]
  const uniq = []
  const seen = new Set()
  for (const item of merged) {
    if (seen.has(item)) continue
    seen.add(item)
    uniq.push(item)
  }
  return {
    ...src,
    PATH: uniq.join(":"),
  }
}

function runExecFile(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (!error) {
        resolve({ code: 0, stdout: String(stdout || ""), stderr: String(stderr || "") })
        return
      }
      resolve({
        code: Number.isInteger(error.code) ? Number(error.code) : 1,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error_message: String(error.message || ""),
      })
    })
  })
}

function appendLog(file, message) {
  fs.appendFileSync(file, `${message}\n`)
}

function parseBenchPath(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const candidate = lines
    .filter((line) => /^\/tmp\/voicecoach_e2e_\d+\.json$/.test(line))
    .slice(-1)[0]
  return candidate || ""
}

function validateBenchReport(file, { flashRequired }) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"))
  const rounds = Array.isArray(report?.rounds) ? report.rounds : []
  if (rounds.length !== 3) {
    return { ok: false, reason: `round_count=${rounds.length}` }
  }

  for (let i = 0; i < rounds.length; i += 1) {
    const round = rounds[i]
    const idx = i + 1
    if (Number(round?.submitStatus) !== 200) {
      return { ok: false, reason: `round_${idx}_submit_status=${round?.submitStatus}` }
    }
    if (Array.isArray(round?.errors) && round.errors.length > 0) {
      return { ok: false, reason: `round_${idx}_errors=${round.errors.length}` }
    }
    const events = Array.isArray(round?.events) ? round.events : []
    const types = new Set(events.map((ev) => ev?.type))
    for (const requiredType of ["beautician.asr_ready", "customer.text_ready", "customer.audio_ready"]) {
      if (!types.has(requiredType)) {
        return { ok: false, reason: `round_${idx}_missing_${requiredType}` }
      }
    }
    if (flashRequired) {
      const asrReady = events.filter((ev) => ev?.type === "beautician.asr_ready")
      if (!asrReady.length || !asrReady.every((ev) => ev?.asr_provider_final === "flash")) {
        return { ok: false, reason: `round_${idx}_flash_required_not_met` }
      }
    }
  }

  const clientBuild = String(report?.client_build || report?.clientBuild || "").trim()
  const serverBuild = String(report?.server_build || "").trim()
  if (!clientBuild) return { ok: false, reason: "client_build_missing" }
  if (!serverBuild) return { ok: false, reason: "server_build_missing" }

  return {
    ok: true,
    reason: "ok",
    client_build: clientBuild,
    server_build: serverBuild,
    bench_label: String(report?.benchLabel || report?.bench_label || ""),
  }
}

async function waitServerReady(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`, { redirect: "manual" })
      if ([200, 307, 308, 404].includes(res.status)) return true
    } catch {
      // ignore transient boot errors
    }
    await sleep(1000)
  }
  return false
}

function startDetachedNode(args, env, logPath) {
  const fd = fs.openSync(logPath, "a")
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
  })
  fs.closeSync(fd)
  child.unref()
  return child.pid
}

function processGroupAlive(pid) {
  if (!pid || pid <= 0) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

async function stopProcessGroup(pid) {
  if (!pid || pid <= 0) return
  try {
    process.kill(-pid, "SIGTERM")
  } catch {
    return
  }
  await sleep(800)
  if (processGroupAlive(pid)) {
    try {
      process.kill(-pid, "SIGKILL")
    } catch {
      // ignore
    }
  }
}

async function killPortListeners(port) {
  if (!fs.existsSync("/usr/sbin/lsof")) return
  const result = await runExecFile("/usr/sbin/lsof", ["-ti", `tcp:${port}`], { cwd: ROOT, env: process.env })
  const raw = String(result?.stdout || "").trim()
  if (!raw) return
  const pids = raw
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM")
    } catch {
      // ignore
    }
  }
}

async function killByPattern(pattern, env) {
  if (!fs.existsSync("/usr/bin/pkill")) return
  await runExecFile("/usr/bin/pkill", ["-f", pattern], { cwd: ROOT, env: env || process.env })
}

async function runGroup(group, ctx) {
  const { rootOut, logsDir, baseEnv, maxAttempts, baseUrl, benchRounds, benchTimeoutMs, waitServerMs, port, woPrefix } = ctx
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptTag = `${group.key}.attempt_${attempt}`
    const serverLog = path.join(logsDir, `server_${attemptTag}.log`)
    const workerLog = path.join(logsDir, `worker_${attemptTag}.log`)
    const benchLog = path.join(logsDir, `bench_${attemptTag}.log`)
    appendLog(ctx.runnerLog, `[${nowIso()}] ${group.key} attempt=${attempt} start`)

    await killByPattern(`with-asr-startup-gate.mjs .*--port ${port}`, baseEnv)
    await killByPattern(`next start --hostname 127.0.0.1 --port ${port}`, baseEnv)
    await killByPattern("scripts/bench_voicecoach.mjs", baseEnv)
    await killPortListeners(port)
    await sleep(600)

    let serverPid = 0
    let workerPid = 0

    try {
      const runEnv = {
        ...baseEnv,
        VOICE_COACH_REQUIRE_FLASH: group.require_flash ? "true" : "false",
        VOICE_COACH_ASR_ENABLE_FLASH: group.enable_flash ? "true" : "false",
        VOICE_COACH_ASR_STARTUP_GATE: group.startup_gate ? "true" : "false",
      }

      const nextBin = path.join(ROOT, "node_modules", ".bin", "next")
      serverPid = startDetachedNode(
        ["scripts/with-asr-startup-gate.mjs", nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
        runEnv,
        serverLog,
      )

      workerPid = startDetachedNode(
        ["--conditions=react-server", "--env-file-if-exists=.env.local", "--import", "tsx", "./lib/voice-coach/worker.ts"],
        baseEnv,
        workerLog,
      )

      const serverReady = await waitServerReady(baseUrl, waitServerMs)
      if (!serverReady) {
        appendLog(ctx.runnerLog, `[${nowIso()}] ${group.key} attempt=${attempt} server_not_ready`)
        continue
      }

      const benchLabel = `${woPrefix}-${group.key}`
      const benchRun = await runExecFile(
        process.execPath,
        ["scripts/bench_voicecoach.mjs"],
        {
          cwd: ROOT,
          env: {
            ...baseEnv,
            VOICECOACH_BENCH_BASE: baseUrl,
            BENCH_LABEL: benchLabel,
            BENCH_ROUNDS: String(benchRounds),
            BENCH_EVENTS_TIMEOUT_MS: String(benchTimeoutMs),
            BENCH_RUN_ANALYSIS: "false",
          },
          timeout: Math.max(benchTimeoutMs * 2, 300000),
          maxBuffer: 32 * 1024 * 1024,
        },
      )

      const benchOutput = [benchRun.stdout, benchRun.stderr, benchRun.error_message ? `[error_message] ${benchRun.error_message}` : ""]
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join("\n")
      fs.writeFileSync(benchLog, `${benchOutput}\n`)

      if (benchRun.code !== 0) {
        appendLog(
          ctx.runnerLog,
          `[${nowIso()}] ${group.key} attempt=${attempt} bench_exit=${benchRun.code} detail=${benchRun.error_message || "none"}`,
        )
        continue
      }

      const benchPath = parseBenchPath(benchOutput)
      if (!benchPath || !fs.existsSync(benchPath)) {
        appendLog(ctx.runnerLog, `[${nowIso()}] ${group.key} attempt=${attempt} bench_path_missing`)
        continue
      }

      const validation = validateBenchReport(benchPath, { flashRequired: group.flash_validation })
      if (!validation.ok) {
        appendLog(
          ctx.runnerLog,
          `[${nowIso()}] ${group.key} attempt=${attempt} bench_validation_fail reason=${validation.reason} bench=${benchPath}`,
        )
        continue
      }

      const destBench = path.join(rootOut, `bench_${group.key}.json`)
      fs.copyFileSync(benchPath, destBench)
      fs.copyFileSync(benchLog, path.join(logsDir, `bench_${group.key}.run.log`))
      appendLog(
        ctx.runnerLog,
        `[${nowIso()}] ${group.key} success bench=${benchPath} client_build=${validation.client_build} server_build=${validation.server_build}`,
      )

      return {
        ok: true,
        group: group.key,
        bench_path: destBench,
        source_bench_path: benchPath,
        client_build: validation.client_build,
        server_build: validation.server_build,
        attempts_used: attempt,
      }
    } finally {
      await stopProcessGroup(serverPid)
      await stopProcessGroup(workerPid)
      await killPortListeners(port)
      await sleep(600)
    }
  }

  return { ok: false, group: group.key, reason: "failed_after_retries" }
}

function evaluateObsGate(analysis) {
  const missingRequired = Number(analysis?.summary?.missing_required_count_total)
  const summaryMetrics = analysis?.summary?.stage_metrics || {}
  const missingStage = REQUIRED_STAGE_KEYS.filter((key) => {
    const metric = summaryMetrics[key]
    return !(metric && metric.p50 !== null && metric.p95 !== null)
  })
  const stageComplete = Boolean(analysis?.summary?.stage_metrics_complete) && missingStage.length === 0

  return {
    G0: {
      status: missingRequired === 0 ? "PASS" : "FAIL",
      evidence: `missing_required_count_total=${Number.isFinite(missingRequired) ? missingRequired : "NaN"}`,
    },
    G1: {
      status: stageComplete ? "PASS" : "FAIL",
      evidence: `required_stage_metrics_complete=${stageComplete}, missing=${missingStage.join("|") || "none"}`,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (boolVal(args.help, false)) {
    console.log(`Usage:
  node scripts/run_voicecoach_obs_oneclick.mjs [options]

Options:
  --wo <work_order>            default: WO-R7-OBS/window2
  --out-dir <absolute_path>    default: <repo>/docs/runbooks/<wo>
  --port <number>              default: 3390
  --attempts <number>          default: 6
  --bench-rounds <number>      default: 3
  --bench-timeout-ms <number>  default: 120000
  --wait-server-ms <number>    default: 120000
  --base-url <url>             default: http://127.0.0.1:<port>
`)
    return
  }

  const wo = String(args.wo || "WO-R7-OBS/window2").trim()
  const outDir = String(args["out-dir"] || "").trim() || path.join(ROOT, "docs", "runbooks", wo)
  const logsDir = path.join(outDir, "logs")
  const runnerLog = path.join(logsDir, "runner.log")
  const port = intVal(args.port, 3390)
  const baseUrl = String(args["base-url"] || `http://127.0.0.1:${port}`).trim()
  const maxAttempts = Math.max(1, intVal(args.attempts, 6))
  const benchRounds = Math.max(1, Math.min(3, intVal(args["bench-rounds"], 3)))
  const benchTimeoutMs = Math.max(40000, intVal(args["bench-timeout-ms"], 120000))
  const waitServerMs = Math.max(20000, intVal(args["wait-server-ms"], 120000))

  fs.mkdirSync(logsDir, { recursive: true })
  fs.writeFileSync(runnerLog, `[${nowIso()}] runner_start wo=${wo}\n`)
  const baseEnv = withStablePath(process.env)

  const headRes = await runExecFile("/usr/bin/git", ["-C", ROOT, "rev-parse", "HEAD"], { cwd: ROOT, env: baseEnv })
  const startHead = String(headRes.stdout || "").trim()
  if (headRes.code !== 0 || !startHead) {
    throw new Error(`failed_to_get_head: ${headRes.stderr || headRes.error_message || "unknown"}`)
  }

  const woPrefix = String(args["wo-prefix"] || wo.split("/")[0] || "WO-R7-OBS").trim()
  const groups = [
    { key: "A", require_flash: true, enable_flash: true, startup_gate: true, flash_validation: true },
    { key: "B", require_flash: true, enable_flash: true, startup_gate: true, flash_validation: true },
    { key: "C", require_flash: false, enable_flash: false, startup_gate: false, flash_validation: false },
  ]

  const ctx = {
    rootOut: outDir,
    logsDir,
    runnerLog,
    baseEnv,
    maxAttempts,
    baseUrl,
    benchRounds,
    benchTimeoutMs,
    waitServerMs,
    port,
    woPrefix,
  }

  const groupResults = {}
  for (const group of groups) {
    const result = await runGroup(group, ctx)
    groupResults[group.key] = result
    if (!result.ok) {
      const failure = {
        generated_at: nowIso(),
        wo,
        head: startHead,
        status: "FAIL",
        failed_group: group.key,
        reason: result.reason || "group_failed",
        outputs: {
          out_dir: outDir,
          logs_dir: logsDir,
        },
      }
      const failFile = path.join(outDir, "run_result.json")
      fs.writeFileSync(failFile, JSON.stringify(failure, null, 2))
      console.log(JSON.stringify(failure, null, 2))
      process.exit(2)
    }
  }

  const currentHeadRes = await runExecFile("/usr/bin/git", ["-C", ROOT, "rev-parse", "HEAD"], { cwd: ROOT, env: baseEnv })
  const endHead = String(currentHeadRes.stdout || "").trim()
  if (!endHead || endHead !== startHead) {
    const headFailure = {
      generated_at: nowIso(),
      wo,
      status: "BLOCKED",
      reason: `head_changed start=${startHead} current=${endHead || "unknown"}`,
      outputs: {
        out_dir: outDir,
        logs_dir: logsDir,
      },
    }
    fs.writeFileSync(path.join(outDir, "run_result.json"), JSON.stringify(headFailure, null, 2))
    console.log(JSON.stringify(headFailure, null, 2))
    process.exit(3)
  }

  const analysisJson = path.join(outDir, "analysis.json")
  const analysisMd = path.join(outDir, "analysis.md")
  const analyzeRun = await runExecFile(
    process.execPath,
    [
      "scripts/analyze_voicecoach_obs.mjs",
      "--wo",
      wo,
      "--a",
      path.join(outDir, "bench_A.json"),
      "--b",
      path.join(outDir, "bench_B.json"),
      "--c",
      path.join(outDir, "bench_C.json"),
      "--out",
      analysisJson,
      "--md",
      analysisMd,
    ],
    {
      cwd: ROOT,
      env: baseEnv,
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
    },
  )

  if (analyzeRun.code !== 0 || !fs.existsSync(analysisJson)) {
    const analyzeFailure = {
      generated_at: nowIso(),
      wo,
      head: startHead,
      status: "FAIL",
      reason: "analyze_failed",
      analyze_exit_code: analyzeRun.code,
      analyze_stderr: analyzeRun.stderr,
      outputs: {
        out_dir: outDir,
        logs_dir: logsDir,
      },
    }
    fs.writeFileSync(path.join(outDir, "run_result.json"), JSON.stringify(analyzeFailure, null, 2))
    console.log(JSON.stringify(analyzeFailure, null, 2))
    process.exit(4)
  }

  const analysis = JSON.parse(fs.readFileSync(analysisJson, "utf8"))
  const gates = evaluateObsGate(analysis)
  const allPass = Object.values(gates).every((item) => item.status === "PASS")

  const result = {
    generated_at: nowIso(),
    wo,
    status: allPass ? "PASS" : "FAIL",
    head: startHead,
    outputs: {
      out_dir: outDir,
      logs_dir: logsDir,
      bench_A: path.join(outDir, "bench_A.json"),
      bench_B: path.join(outDir, "bench_B.json"),
      bench_C: path.join(outDir, "bench_C.json"),
      analysis_json: analysisJson,
      analysis_md: analysisMd,
    },
    groups: groupResults,
    gates,
  }

  fs.writeFileSync(path.join(outDir, "run_result.json"), JSON.stringify(result, null, 2))
  fs.writeFileSync(
    path.join(outDir, "run_result.md"),
    [
      `# ${wo} One-Click Result`,
      "",
      `- generated_at: ${result.generated_at}`,
      `- status: ${result.status}`,
      `- head: ${result.head}`,
      `- G0: ${gates.G0.status} (${gates.G0.evidence})`,
      `- G1: ${gates.G1.status} (${gates.G1.evidence})`,
      "",
      "## Outputs",
      `- bench_A: \`${result.outputs.bench_A}\``,
      `- bench_B: \`${result.outputs.bench_B}\``,
      `- bench_C: \`${result.outputs.bench_C}\``,
      `- analysis.json: \`${result.outputs.analysis_json}\``,
      `- analysis.md: \`${result.outputs.analysis_md}\``,
      "",
    ].join("\n"),
  )

  console.log(JSON.stringify(result, null, 2))
  process.exit(allPass ? 0 : 5)
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err)
  process.exit(1)
})
