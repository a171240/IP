import { writeFile } from "fs/promises"
import { hostname } from "os"

import {
  listVoiceCoachQueuedJobs,
  processVoiceCoachJobById,
  recordVoiceCoachWorkerHeartbeat,
  recoverStaleVoiceCoachProcessingJobs,
  type VoiceCoachQueuedJobRecord,
  type VoiceCoachJobStage,
} from "./jobs.server"

const ACTIVE_STAGES: Array<VoiceCoachJobStage> = ["main_pending", "tts_pending"]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseNumberEnv(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] || fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(min, Math.min(max, Math.round(raw)))
}

function parseBoolEnv(name: string, fallback = false) {
  const raw = process.env[name]
  if (raw == null) return fallback
  const value = String(raw).trim().toLowerCase()
  if (!value) return fallback
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function randomInRange(min: number, max: number) {
  if (max <= min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

const maxJobsPerRound = Math.max(24, parseNumberEnv("VOICE_COACH_WORKER_MAX_JOBS", 32, 1, 40))
const maxWallMsPerRound = Math.max(3000, parseNumberEnv("VOICE_COACH_WORKER_MAX_WALL_MS", 8000, 800, 30000))
const perJobTimeoutMs = Math.max(10000, parseNumberEnv("VOICE_COACH_WORKER_JOB_TIMEOUT_MS", 30000, 2000, 120000))
const workerConcurrency = Math.max(
  16,
  parseNumberEnv(
    "VOICE_COACH_WORKER_CONCURRENCY",
    Math.max(1, Math.min(maxJobsPerRound, 32)),
    1,
    40,
  ),
)
const claimBurst = Math.max(
  1,
  parseNumberEnv(
    "VOICE_COACH_WORKER_CLAIM_BURST",
    Math.max(1, Math.min(workerConcurrency, 16)),
    1,
    40,
  ),
)
const legacyIdleSleepMs = parseNumberEnv("VOICE_COACH_WORKER_IDLE_SLEEP_MS", 30, 5, 5000)
const idleSleepMinMs = Math.max(5, parseNumberEnv("VOICE_COACH_WORKER_IDLE_SLEEP_MIN_MS", 10, 5, 5000))
const idleSleepMaxMs = Math.max(
  idleSleepMinMs,
  parseNumberEnv("VOICE_COACH_WORKER_IDLE_SLEEP_MAX_MS", 30, idleSleepMinMs, 5000),
  legacyIdleSleepMs,
)
const errorSleepMs = parseNumberEnv("VOICE_COACH_WORKER_ERROR_SLEEP_MS", 1200, 100, 10000)
const heartbeatIntervalMs = parseNumberEnv("VOICE_COACH_WORKER_HEARTBEAT_INTERVAL_MS", 2000, 500, 30000)
const heartbeatFile = String(process.env.VOICE_COACH_WORKER_HEARTBEAT_FILE || "/tmp/voicecoach_worker_heartbeat.json")
  .trim()
  .slice(0, 500)
const staleRecoverIntervalMs = parseNumberEnv("VOICE_COACH_WORKER_RECOVER_INTERVAL_MS", 3000, 1000, 30000)
const staleRecoverMaxJobs = parseNumberEnv("VOICE_COACH_WORKER_RECOVER_MAX_JOBS", 20, 1, 200)
const maxQueueAgeMs = Math.max(0, parseNumberEnv("VOICE_COACH_WORKER_MAX_QUEUE_AGE_MS", 0, 0, 600000))
const runOnce = parseBoolEnv("VOICE_COACH_WORKER_RUN_ONCE", false)
const workerId = String(process.env.VOICE_COACH_WORKER_ID || `${hostname()}#${process.pid}`).slice(0, 120)
const chainMainToTtsInWorker = parseBoolEnv("VOICE_COACH_WORKER_CHAIN_MAIN_TO_TTS", true)

let shuttingDown = false
let lastRecoverAt = 0
let lastHeartbeatAt = 0
let heartbeatFailCount = 0
let disableDbHeartbeat = false

process.on("SIGINT", () => {
  shuttingDown = true
})
process.on("SIGTERM", () => {
  shuttingDown = true
})

type RoundResult = {
  processed: number
  recovered: number
}

type ProcessJobArgs = Parameters<typeof processVoiceCoachJobById>[0]
type WorkerQueuedHint = NonNullable<ProcessJobArgs["queuedHint"]>
type WorkerQueuedJob = {
  id: string
  sessionId: string
  userId: string
  stage: VoiceCoachJobStage
  turnId?: string
  attemptCount?: number
  payload?: WorkerQueuedHint["payload"]
  resultState?: WorkerQueuedHint["resultState"]
  createdAt?: string
  updatedAt?: string
}

async function touchHeartbeat(
  status: "started" | "alive" | "stopped",
  opts?: {
    force?: boolean
    processed?: number
    recovered?: number
  },
) {
  const now = Date.now()
  const force = Boolean(opts?.force)
  if (!force && status === "alive" && now - lastHeartbeatAt < heartbeatIntervalMs) {
    return
  }
  const payload = {
    worker_id: workerId,
    host: hostname(),
    pid: process.pid,
    status,
    heartbeat_at: new Date(now).toISOString(),
    heartbeat_age_ms: 0,
    processed: Number(opts?.processed || 0),
    recovered: Number(opts?.recovered || 0),
    max_jobs: maxJobsPerRound,
    wall_ms: maxWallMsPerRound,
  }
  if (heartbeatFile) {
    void writeFile(heartbeatFile, JSON.stringify(payload, null, 2), "utf8").catch(() => {})
  }
  if (disableDbHeartbeat) {
    lastHeartbeatAt = now
    return
  }
  try {
    await recordVoiceCoachWorkerHeartbeat({
      workerId,
      host: payload.host,
      pid: process.pid,
      status,
      meta: {
        processed: payload.processed,
        recovered: payload.recovered,
        max_jobs: payload.max_jobs,
        wall_ms: payload.wall_ms,
      },
    })
    lastHeartbeatAt = now
    heartbeatFailCount = 0
  } catch (error) {
    heartbeatFailCount += 1
    // Throttle retry cadence even when heartbeat table is missing or unavailable.
    lastHeartbeatAt = now
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("voice_coach_worker_heartbeats")) {
      disableDbHeartbeat = true
    }
    if (heartbeatFailCount <= 3 || heartbeatFailCount % 20 === 0) {
      console.error(`[voicecoach-worker] heartbeat_failed message=${message}`)
    }
  }
}

async function maybeRecoverStaleJobs(nowMs: number): Promise<number> {
  if (nowMs - lastRecoverAt < staleRecoverIntervalMs) return 0
  lastRecoverAt = nowMs
  return recoverStaleVoiceCoachProcessingJobs({
    maxJobs: staleRecoverMaxJobs,
    allowedStages: ACTIVE_STAGES,
  })
}

async function processOneJob(job: WorkerQueuedJob): Promise<{ processed: boolean; timedOut: boolean }> {
  const raced = await Promise.race([
    processVoiceCoachJobById({
      sessionId: job.sessionId,
      userId: job.userId,
      jobId: job.id,
      executor: "worker",
      lockOwner: workerId,
      chainMainToTts: chainMainToTtsInWorker,
      queuedHint: job.turnId
        ? {
            turnId: job.turnId,
            stage: job.stage,
            attemptCount: Number(job.attemptCount || 0),
            payload: job.payload || undefined,
            resultState: job.resultState || undefined,
            createdAt: job.createdAt || null,
            updatedAt: job.updatedAt || null,
          }
        : undefined,
    })
      .then((result) => ({ timedOut: false, processed: Boolean(result?.processed) }))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[voicecoach-worker] process_failed job=${job.id} message=${message}`)
        return { timedOut: false, processed: false }
      }),
    sleep(perJobTimeoutMs).then(() => ({ timedOut: true, processed: false })),
  ])

  if (raced.timedOut) {
    // Attempt has already been counted at claim time.
    console.warn(`[voicecoach-worker] process_timeout job=${job.id} timeout_ms=${perJobTimeoutMs}`)
  }

  return raced
}

async function runRound(): Promise<RoundResult> {
  const roundStartedAt = Date.now()
  let recovered = 0
  let processed = 0
  const inFlight: Array<Promise<{ processed: boolean; timedOut: boolean }>> = []
  const loadClaimBatch = async (maxJobs: number): Promise<Array<WorkerQueuedJob>> => {
    const queued = await listVoiceCoachQueuedJobs({
      maxJobs: Math.max(1, Math.min(maxJobs, workerConcurrency)),
      allowedStages: ACTIVE_STAGES,
      newestFirst: true,
      maxQueueAgeMs,
      includeClaimHint: true,
    })
    if (queued.length <= 0) return []

    const queuedMain: Array<VoiceCoachQueuedJobRecord> = []
    const queuedTts: Array<VoiceCoachQueuedJobRecord> = []
    for (let i = 0; i < queued.length; i++) {
      const item = queued[i]
      if (item.stage === "main_pending") {
        queuedMain.push(item)
      } else if (item.stage === "tts_pending") {
        queuedTts.push(item)
      }
    }

    return queuedMain
      .concat(queuedTts)
      .slice(0, maxJobs)
      .map((item) => ({
        id: item.id,
        sessionId: item.sessionId,
        userId: item.userId,
        stage: item.stage,
        turnId: item.turnId,
        attemptCount: item.attemptCount,
        payload: item.payload,
        resultState: item.resultState,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }))
  }

  while (!shuttingDown && processed < maxJobsPerRound) {
    const roundElapsedMs = Date.now() - roundStartedAt
    if (roundElapsedMs >= maxWallMsPerRound) break

    const remainingBudget = maxJobsPerRound - (processed + inFlight.length)
    const slots = Math.max(0, Math.min(claimBurst, workerConcurrency - inFlight.length, remainingBudget))
    const claimBatch = slots > 0 ? await loadClaimBatch(slots) : []

    let claimedAny = false
    for (let i = 0; i < claimBatch.length; i++) {
      const claimedJob = claimBatch[i]
      if (!claimedJob) break
      claimedAny = true
      inFlight.push(processOneJob(claimedJob))
    }

    if (inFlight.length <= 0) {
      if (processed === 0) {
        const recoveredNow = await maybeRecoverStaleJobs(Date.now())
        if (recoveredNow > 0) {
          recovered += recoveredNow
          continue
        }
      }
      break
    }

    const settled = await Promise.race(
      inFlight.map((pending, index) =>
        pending.then((result) => ({
          index,
          result,
        })),
      ),
    )
    inFlight.splice(settled.index, 1)

    if (settled.result.processed) {
      processed += 1
      continue
    }

    if (!settled.result.timedOut && !claimedAny) {
      await sleep(20)
    }
  }

  if (inFlight.length > 0) {
    // Drain completed in-flight jobs without blocking for stragglers.
    const settled = await Promise.allSettled(inFlight)
    for (const item of settled) {
      if (item.status === "fulfilled" && item.value.processed) {
        processed += 1
      }
    }
  }

  return { processed, recovered }
}

async function main() {
  console.log(
    `[voicecoach-worker] started id=${workerId} max_jobs=${maxJobsPerRound} concurrency=${workerConcurrency} claim_burst=${claimBurst} wall_ms=${maxWallMsPerRound} timeout_ms=${perJobTimeoutMs} idle_ms=${idleSleepMinMs}-${idleSleepMaxMs} max_queue_age_ms=${maxQueueAgeMs} chain_main_to_tts=${chainMainToTtsInWorker ? "true" : "false"}`,
  )
  await touchHeartbeat("started", { force: true, processed: 0, recovered: 0 })

  do {
    if (shuttingDown) break

    try {
      await touchHeartbeat("alive")
      const round = await runRound()
      await touchHeartbeat("alive", {
        force: round.processed > 0 || round.recovered > 0,
        processed: round.processed,
        recovered: round.recovered,
      })
      if (round.recovered > 0) {
        console.info(`[voicecoach-worker] recovered_stale=${round.recovered}`)
      }
      if (round.processed > 0 || round.recovered > 0) {
        continue
      }
      await sleep(randomInRange(idleSleepMinMs, idleSleepMaxMs))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[voicecoach-worker] round_failed message=${message}`)
      await sleep(errorSleepMs)
    }
  } while (!runOnce && !shuttingDown)

  await touchHeartbeat("stopped", { force: true, processed: 0, recovered: 0 })
  console.log(`[voicecoach-worker] stopped id=${workerId}`)
}

void main()
