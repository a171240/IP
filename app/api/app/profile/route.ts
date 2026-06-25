import { NextRequest, NextResponse } from "next/server"

import { AliyunRdsConfigurationError } from "@/lib/aliyun-rds/postgres.server"
import { getAliyunRdsAppProfileResponse } from "@/lib/aliyun-rds/repositories/account-profile.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录", code: "auth_required" }, { status: 401 })
  }

  try {
    const account = await getAliyunRdsAppProfileResponse({
      id: user.id,
      email: user.email ?? null,
      user_metadata: user.user_metadata || {},
    })

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email ?? null,
        user_metadata: user.user_metadata || {},
      },
      profile: account.profile,
      entitlements: account.entitlements,
      account: account.account,
    })
  } catch (error) {
    if (error instanceof AliyunRdsConfigurationError) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_URL_CN is required", code: "rds_not_configured" },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "profile_query_failed",
        code: "profile_query_failed",
      },
      { status: 500 },
    )
  }
}
