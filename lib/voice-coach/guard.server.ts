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
  const enabled = (process.env.VOICE_COACH_ENABLED || "").toLowerCase()
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

  const maxTurns = Math.max(1, Number(process.env.VOICE_COACH_MAX_TURNS || 10) || 10)
  return { ok: true, maxTurns }
}

