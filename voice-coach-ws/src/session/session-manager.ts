import type { VoiceCoachScenario } from "../shared/scenarios.js"
import { createSessionState, type SessionState } from "./session-state.js"

export type SessionManagerOptions = {
  maxIdleMs?: number
  sweepIntervalMs?: number
}

/**
 * Track active voice coach sessions in memory.
 */
export class SessionManager {
  private sessions = new Map<string, SessionState>()
  private readonly maxIdleMs: number
  private sweepTimer: ReturnType<typeof setInterval> | null = null

  constructor(opts: SessionManagerOptions = {}) {
    this.maxIdleMs = Math.max(60_000, opts.maxIdleMs ?? 30 * 60_000)
    const sweepIntervalMs = Math.max(10_000, opts.sweepIntervalMs ?? 60_000)
    this.sweepTimer = setInterval(() => {
      this.sweepExpired()
    }, sweepIntervalMs)
    this.sweepTimer.unref?.()
  }

  /**
   * Create and register a session state.
   */
  create(sessionId: string, userId: string, scenario: VoiceCoachScenario, sessionContextText = ""): SessionState {
    const state = createSessionState({ sessionId, userId, scenario, sessionContextText })
    this.sessions.set(sessionId, state)
    return state
  }

  /**
   * Fetch a session by id.
   */
  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Update last activity for a session.
   */
  touch(sessionId: string): SessionState | undefined {
    const session = this.sessions.get(sessionId)
    if (session) session.lastActivityAt = Date.now()
    return session
  }

  /**
   * Destroy a session.
   */
  destroy(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /**
   * Remove sessions that have been idle too long.
   */
  sweepExpired(now = Date.now()): void {
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivityAt > this.maxIdleMs) {
        this.sessions.delete(sessionId)
      }
    }
  }

  /**
   * Stop background cleanup.
   */
  close(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
  }
}
