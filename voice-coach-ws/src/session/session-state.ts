import type { VoiceCoachScenario } from "../shared/scenarios.js"

export type SessionPhase = "idle" | "recording" | "processing" | "playing" | "ended"

export type VoiceCoachTurnLite = {
  role: "customer" | "beautician"
  text: string
  emotion?: string
}

export type SessionState = {
  sessionId: string
  userId: string
  scenario: VoiceCoachScenario
  sessionContextText?: string
  turnHistory: VoiceCoachTurnLite[]
  currentPhase: SessionPhase
  currentTurnIndex: number
  abortControllers: AbortController[]
  asrInstance: unknown | null
  ttsInstances: unknown[]
  createdAt: number
  lastActivityAt: number
}

/**
 * Create a new default session state.
 */
export function createSessionState(params: {
  sessionId: string
  userId: string
  scenario: VoiceCoachScenario
  sessionContextText?: string
}): SessionState {
  const now = Date.now()
  return {
    sessionId: params.sessionId,
    userId: params.userId,
    scenario: params.scenario,
    sessionContextText: params.sessionContextText || "",
    turnHistory: [],
    currentPhase: "idle",
    currentTurnIndex: 0,
    abortControllers: [],
    asrInstance: null,
    ttsInstances: [],
    createdAt: now,
    lastActivityAt: now,
  }
}
