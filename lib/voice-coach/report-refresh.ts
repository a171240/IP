import type { VoiceCoachReport } from "./report"
import { generateVoiceCoachReport, type VoiceCoachTurnRow } from "./report.server"
import { getScenario } from "./scenarios"

type SessionSnapshot = {
  id: string
  scenario_id: string
  status?: string | null
  ended_at?: string | null
  customer_profile_id?: string | null
  scene_card_id?: string | null
  session_context_json?: unknown
  scenario_snapshot_json?: unknown
}

type SaveReportPayload = {
  report: VoiceCoachReport
  totalScore: number
  dimensionScores: Record<string, number>
  status?: string
  endedAt?: string | null
}

type RefreshReportOps = {
  fetchSession: () => Promise<SessionSnapshot | null>
  fetchTurns: () => Promise<VoiceCoachTurnRow[]>
  countPendingAnalysisJobs: () => Promise<number>
  pumpAnalysisJobs: (args: { maxJobs: number }) => Promise<number>
  saveReport: (payload: SaveReportPayload) => Promise<void>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

type RefreshVoiceCoachReportArgs = {
  markEnded?: boolean
  maxWaitMs?: number
  pollIntervalMs?: number
  maxJobsPerPump?: number
  ops: RefreshReportOps
}

export type RefreshVoiceCoachReportResult = {
  report: VoiceCoachReport
  pendingAnalysisJobs: number
}

function buildDimensionScoreMap(report: VoiceCoachReport) {
  return report.dimension.reduce<Record<string, number>>((acc, item) => {
    if (item?.id && typeof item.score === "number") acc[item.id] = item.score
    return acc
  }, {})
}

function nowIso(now: number) {
  return new Date(now).toISOString()
}

export async function refreshVoiceCoachReport({
  markEnded = false,
  maxWaitMs = 2500,
  pollIntervalMs = 150,
  maxJobsPerPump = 1,
  ops,
}: RefreshVoiceCoachReportArgs): Promise<RefreshVoiceCoachReportResult> {
  const now = ops.now || Date.now
  const sleep = ops.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const startedAt = now()
  let pendingAnalysisJobs = await ops.countPendingAnalysisJobs()

  while (pendingAnalysisJobs > 0 && now() - startedAt < maxWaitMs) {
    const processed = await ops.pumpAnalysisJobs({ maxJobs: maxJobsPerPump })
    if (processed <= 0) {
      await sleep(Math.max(25, pollIntervalMs))
    }
    pendingAnalysisJobs = await ops.countPendingAnalysisJobs()
  }

  const session = await ops.fetchSession()
  if (!session) {
    throw new Error("session_not_found")
  }

  const turns = await ops.fetchTurns()
  const scenario = getScenario(session.scenario_id)
  const report = generateVoiceCoachReport({
    scenario,
    turns,
    sessionSnapshot: session.scenario_snapshot_json,
    sessionContext: session.session_context_json,
  })
  const dimensionScores = buildDimensionScoreMap(report)

  await ops.saveReport({
    report,
    totalScore: report.total_score,
    dimensionScores,
    status: markEnded ? "ended" : undefined,
    endedAt: markEnded ? session.ended_at || nowIso(now()) : undefined,
  })

  return {
    report,
    pendingAnalysisJobs,
  }
}
