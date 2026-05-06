import { NextRequest, NextResponse } from "next/server"

import { resolveBillingContext } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

function imageUrlForPoster(posterId: string) {
  return `/api/mp/posters/images/${posterId}`
}

export async function GET(request: NextRequest) {
  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const url = new URL(request.url)
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 10) || 10))

  const { data, error } = await billing.ctx.supabase
    .from("poster_generations")
    .select("id, created_at, mode, template_id, size, resolution, content_type")
    .eq("user_id", billing.ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    const msg = error.message || ""
    if (msg.includes("poster_generations") || msg.includes("does not exist")) {
      return NextResponse.json({ ok: true, posters: [], warning: "poster_history_not_initialized" })
    }
    return NextResponse.json({ ok: false, error: msg || "query_failed" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    posters: (data || []).map((item) => ({
      posterId: item.id,
      createdAt: item.created_at,
      mode: item.mode,
      templateId: item.template_id,
      size: item.size,
      resolution: item.resolution,
      contentType: item.content_type,
      imageUrl: imageUrlForPoster(item.id),
    })),
  })
}
