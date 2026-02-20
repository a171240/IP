import { NextRequest, NextResponse } from "next/server"

import { ingestFailure, ingestFailureFromUnknown } from "@/lib/content-ingest/response"
import { ingestDouyinProfileToSources } from "@/lib/content-ingest/service"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { ingestProfileSchema } from "@/lib/types/content-pipeline"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = ingestProfileSchema.safeParse(body)

  if (!parsed.success) {
    return ingestFailure("invalid_link", "请求参数不合法，请提供有效抖音主页链接", 400)
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return ingestFailure("extract_failed", "请先登录", 401)
  }

  try {
    const result = await ingestDouyinProfileToSources({
      supabase,
      user,
      profile_url: parsed.data.profile_url,
      limit: parsed.data.limit,
    })

    return NextResponse.json({
      ok: true,
      batch_id: result.batch_id,
      items: result.items,
      analysis: result.analysis,
    })
  } catch (error) {
    return ingestFailureFromUnknown(error)
  }
}
