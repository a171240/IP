import { NextRequest, NextResponse } from "next/server"

import { expireAllPersonalTrialVoiceReservations } from "@/lib/aliyun-rds/repositories/app-access-control.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

function boundedLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, Math.round(parsed)))
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", code: "unauthorized" },
      { status: 401 },
    )
  }

  try {
    const result = await expireAllPersonalTrialVoiceReservations({
      limit: boundedLimit(request.nextUrl.searchParams.get("limit")),
    })
    return NextResponse.json({
      ok: true,
      expired_count: result.expiredCount,
      session_ids: result.sessionIds,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "personal_trial_reservation_expiry_failed",
        code: "personal_trial_reservation_expiry_failed",
      },
      { status: 500 },
    )
  }
}
