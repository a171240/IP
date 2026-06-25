import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import {
  deleteAliyunRdsStoreProfile,
  getAliyunRdsStoreProfile,
  updateAliyunRdsStoreProfile,
} from "@/lib/aliyun-rds/repositories/store-profiles.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  city: z.string().trim().max(40).optional().nullable(),
  district: z.string().trim().max(40).optional().nullable(),
  landmark: z.string().trim().max(80).optional().nullable(),
  shop_type: z.string().trim().max(40).optional().nullable(),
  main_offer_name: z.string().trim().max(80).optional().nullable(),
  main_offer_duration_min: z.number().int().min(10).max(240).optional().nullable(),
  included_steps: z.any().optional().nullable(),
  promises: z.any().optional().nullable(),
})

function rdsErrorResponse(error: unknown, fallbackCode: string) {
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
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = (profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  const user = await requireUser(request)
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  try {
    const profile = await getAliyunRdsStoreProfile(user.id, id)
    if (!profile) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return rdsErrorResponse(error, "query_failed")
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = (profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  const user = await requireUser(request)
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  try {
    const profile = await updateAliyunRdsStoreProfile(user.id, id, parsed.data)
    if (!profile) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return rdsErrorResponse(error, "update_failed")
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params
  const id = (profileId || "").trim()
  if (!id) return NextResponse.json({ ok: false, error: "missing_profile_id" }, { status: 400 })

  const user = await requireUser(request)
  if (!user) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })

  try {
    await deleteAliyunRdsStoreProfile(user.id, id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return rdsErrorResponse(error, "delete_failed")
  }
}
