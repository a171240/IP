import { NextRequest, NextResponse } from "next/server"

import { ingestFailure, ingestFailureFromUnknown } from "@/lib/content-ingest/response"
import { ingestSingleLinkToSource } from "@/lib/content-ingest/service"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { ingestSingleLinkSchema } from "@/lib/types/content-pipeline"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = ingestSingleLinkSchema.safeParse(body)

  if (!parsed.success) {
    return ingestFailure("invalid_link", "请求参数不合法，请提供有效链接", 400)
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return ingestFailure("extract_failed", "请先登录", 401)
  }

  try {
    const result = await ingestSingleLinkToSource({
      supabase,
      user,
      url: parsed.data.url,
    })

    return NextResponse.json({
      ok: true,
      source_id: result.source_id,
      platform: result.platform,
      extracted: result.extracted,
    })
  } catch (error) {
    return ingestFailureFromUnknown(error)
  }
}
