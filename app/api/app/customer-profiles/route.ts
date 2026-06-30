import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import {
  createAliyunRdsCustomerProfile,
  listAliyunRdsCustomerProfiles,
} from "@/lib/aliyun-rds/repositories/customer-profiles.server"
import { voiceCoachCustomerProfilePayloadSchema } from "@/lib/voice-coach/session-context"

export const runtime = "nodejs"

function rdsErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AliyunRdsConfigurationError) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" },
      { status: 503 },
    )
  }
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : fallbackCode },
    { status: 500 },
  )
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const url = new URL(request.url)
    const limitRaw = url.searchParams.get("limit")
    const limit = Math.min(50, Math.max(1, Number(limitRaw || 20) || 20))

    const profiles = await listAliyunRdsCustomerProfiles(auth.user.id, limit)
    return NextResponse.json({ ok: true, profiles })
  } catch (error) {
    return rdsErrorResponse(error, "query_failed")
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const body = await request.json().catch(() => null)
    const parsed = voiceCoachCustomerProfilePayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
    }

    const profile = await createAliyunRdsCustomerProfile(auth.user.id, parsed.data)
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return rdsErrorResponse(error, "insert_failed")
  }
}
