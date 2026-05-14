import { NextRequest, NextResponse } from "next/server"

import { processServiceRecordSession } from "@/lib/service-records/processing.server"
import { cleanText, integerValue } from "@/lib/service-records/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
const PROCESSING_COOLDOWN_MS = 2 * 60 * 1000

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

function timeOf(value: unknown) {
  const time = new Date(String(value || "")).getTime()
  return Number.isFinite(time) ? time : 0
}

function isCandidate(session: any, nowMs: number) {
  const status = cleanText(session?.status, 40)
  if (status === "ended_pending") {
    const deadline = timeOf(session.resume_deadline_at)
    return !deadline || deadline <= nowMs
  }
  if (status === "processing") {
    const updatedAt = timeOf(session.updated_at)
    return !updatedAt || nowMs - updatedAt >= PROCESSING_COOLDOWN_MS
  }
  return false
}

async function loadCandidates(admin: any, nowMs: number, limit: number) {
  const { data, error } = await admin
    .from("service_record_sessions")
    .select("*")
    .in("status", ["ended_pending", "processing"])
    .order("updated_at", { ascending: true })
    .limit(Math.min(MAX_LIMIT * 3, limit * 3))

  if (error) throw new Error(error.message || "service_record_cron_query_failed")

  return (data || []).filter((session: any) => isCandidate(session, nowMs)).slice(0, limit)
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", code: "unauthorized" }, { status: 401 })
  }

  const limit = Math.max(1, Math.min(MAX_LIMIT, integerValue(request.nextUrl.searchParams.get("limit"), DEFAULT_LIMIT)))
  const pollLimit = Math.max(1, Math.min(100, integerValue(request.nextUrl.searchParams.get("pollLimit"), 50)))
  const admin = createAdminSupabaseClient()
  const nowMs = Date.now()

  try {
    const candidates = await loadCandidates(admin, nowMs, limit)
    const results = []

    for (const session of candidates) {
      try {
        const beforeStatus = cleanText(session.status, 40)
        const result = await processServiceRecordSession(admin, session, { pollLimit })
        results.push({
          ok: true,
          session_id: session.id,
          before_status: beforeStatus,
          after_status: cleanText(result.session.status, 40),
          segment_count: result.segments.length,
          marker_count: result.markers.length,
        })
      } catch (error: any) {
        results.push({
          ok: false,
          session_id: session.id,
          error: cleanText(error?.message || "service_record_cron_process_failed", 300),
        })
      }
    }

    return NextResponse.json({
      ok: true,
      checked_at: new Date(nowMs).toISOString(),
      candidate_count: candidates.length,
      processed_count: results.filter((item) => item.ok).length,
      failed_count: results.filter((item) => !item.ok).length,
      results,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: cleanText(error?.message || "service_record_cron_failed", 300),
        code: "service_record_cron_failed",
      },
      { status: 500 },
    )
  }
}
