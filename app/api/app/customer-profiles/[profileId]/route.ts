import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import {
  deleteAliyunRdsCustomerProfile,
  getAliyunRdsCustomerProfile,
  updateAliyunRdsCustomerProfile,
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

async function requireUser(request: NextRequest) {
  const auth = await resolveAliyunRdsAppAuthUser(request)
  return auth?.user || null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = String(profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  try {
    const user = await requireUser(request)
    if (!user) return appAuthRequiredResponse()

    const profile = await getAliyunRdsCustomerProfile(user.id, id)
    if (!profile) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return rdsErrorResponse(error, "query_failed")
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = String(profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  try {
    const user = await requireUser(request)
    if (!user) return appAuthRequiredResponse()

    const body = await request.json().catch(() => null)
    const parsed = voiceCoachCustomerProfilePayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
    }

    const profile = await updateAliyunRdsCustomerProfile(user.id, id, parsed.data)
    if (!profile) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return rdsErrorResponse(error, "update_failed")
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = String(profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  try {
    const user = await requireUser(request)
    if (!user) return appAuthRequiredResponse()

    await deleteAliyunRdsCustomerProfile(user.id, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return rdsErrorResponse(error, "delete_failed")
  }
}
