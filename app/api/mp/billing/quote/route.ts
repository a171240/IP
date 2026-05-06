import { NextRequest, NextResponse } from "next/server"

import {
  MP_AI_ACTIONS,
  buildMpAiProfilePayload,
  getMpAiAction,
  quoteMpAiAction,
  resolveMpAiBillingContext,
} from "@/lib/mp/ai-points.server"

export const runtime = "nodejs"

function getBodyActionCode(body: unknown) {
  if (!body || typeof body !== "object") return ""
  const value = (body as Record<string, unknown>).action_code ?? (body as Record<string, unknown>).actionCode
  return typeof value === "string" ? value.trim() : ""
}

export async function GET(request: NextRequest) {
  return handleQuote(request)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  return handleQuote(request, getBodyActionCode(body))
}

async function handleQuote(request: NextRequest, bodyActionCode = "") {
  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const actionCode = bodyActionCode || request.nextUrl.searchParams.get("action_code") || ""
  if (!actionCode) {
    return NextResponse.json({
      ok: true,
      profile: buildMpAiProfilePayload(billing.ctx, {
        nickname: billing.profileRow.nickname ?? null,
        avatar_url: billing.profileRow.avatar_url ?? null,
      }),
      actions: Object.entries(MP_AI_ACTIONS).map(([code, rule]) => ({
        action_code: code,
        action_title: rule.title,
        page_path: rule.page,
        cost_points: rule.cost,
        cost_label: quoteMpAiAction({ ctx: billing.ctx, actionCode: code }).cost_label,
      })),
    })
  }

  if (!getMpAiAction(actionCode)) {
    return NextResponse.json({ ok: false, error: "unknown_action_code", action_code: actionCode }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    quote: quoteMpAiAction({ ctx: billing.ctx, actionCode }),
  })
}
