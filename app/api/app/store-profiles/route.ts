import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import {
  createAliyunRdsStoreProfile,
  listAliyunRdsStoreProfiles,
} from "@/lib/aliyun-rds/repositories/store-profiles.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  city: z.string().trim().max(40).optional(),
  district: z.string().trim().max(40).optional(),
  landmark: z.string().trim().max(80).optional(),
  shop_type: z.string().trim().max(40).optional(),
  main_offer_name: z.string().trim().max(80).optional(),
  main_offer_duration_min: z.number().int().min(10).max(240).optional(),
  included_steps: z.any().optional(),
  promises: z.any().optional(),
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

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitRaw = url.searchParams.get("limit")
  const limit = Math.min(50, Math.max(1, Number(limitRaw || 20) || 20))

  try {
    const profiles = await listAliyunRdsStoreProfiles(user.id, limit)
    return NextResponse.json({ ok: true, profiles })
  } catch (error) {
    return rdsErrorResponse(error, "query_failed")
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  try {
    const profile = await createAliyunRdsStoreProfile(
      {
        id: user.id,
        email: user.email ?? null,
        user_metadata: user.user_metadata || {},
      },
      parsed.data,
    )
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return rdsErrorResponse(error, "insert_failed")
  }
}
