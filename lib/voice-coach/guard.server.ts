import "server-only"

export type VoiceCoachAccessResult =
  | { ok: true; maxTurns: number }
  | { ok: false; status: number; error: string }

function parseCsv(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function checkVoiceCoachAccess(userId: string): VoiceCoachAccessResult {
  const enabled = String(process.env.VOICE_COACH_ENABLED ?? "")
    .trim()
    .toLowerCase()
  if (enabled !== "true") {
    return { ok: false, status: 404, error: "voice_coach_disabled" }
  }

  const allowListRaw = (process.env.VOICE_COACH_ALLOW_USER_IDS || "").trim()
  if (allowListRaw) {
    const allowList = new Set(parseCsv(allowListRaw))
    if (!allowList.has(userId)) {
      return { ok: false, status: 403, error: "voice_coach_not_allowed" }
    }
  }

  const rawMaxTurns = Number(process.env.VOICE_COACH_HARD_MAX_TURNS || process.env.VOICE_COACH_MAX_TURNS || 0)
  const maxTurns = Number.isFinite(rawMaxTurns) && rawMaxTurns > 0 ? Math.max(1, Math.round(rawMaxTurns)) : 0
  return { ok: true, maxTurns }
}
