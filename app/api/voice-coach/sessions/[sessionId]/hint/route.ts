import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateHint } from "@/lib/voice-coach/llm.server"
import { getHintTemplate, normalizeVoiceCoachCategoryId } from "@/lib/voice-coach/script-packs"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const body = (await request.json().catch(() => null)) as { customer_turn_id?: unknown } | null
    const customerTurnId =
      typeof body?.customer_turn_id === "string" && body.customer_turn_id.trim() ? body.customer_turn_id.trim() : ""
    if (!customerTurnId) return jsonError(400, "missing_customer_turn_id")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, scenario_id, category_id, status")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    const { data: customerTurn, error: turnError } = await supabase
      .from("voice_coach_turns")
      .select("id, role, text, emotion, intent_id")
      .eq("id", customerTurnId)
      .eq("session_id", sessionId)
      .single()
    if (turnError || !customerTurn) return jsonError(404, "turn_not_found")
    if (customerTurn.role !== "customer") return jsonError(400, "turn_not_customer")

    const { data: historyRows } = await supabase
      .from("voice_coach_turns")
      .select("role, text, emotion")
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: false })
      .limit(6)
    const history = (historyRows || [])
      .slice()
      .reverse()
      .map((t: any) => ({
        role: t.role as "customer" | "beautician",
        text: String(t.text || ""),
        emotion: (t.emotion ? String(t.emotion) : undefined) as VoiceCoachEmotion | undefined,
      }))

    const categoryId = normalizeVoiceCoachCategoryId(String(session.category_id || ""))
    const intentId = String(customerTurn.intent_id || "").trim()
    const hintTemplate = getHintTemplate(categoryId, intentId)
    if (hintTemplate) {
      return NextResponse.json({
        hint_text: hintTemplate.hint_text,
        hint_points: hintTemplate.hint_points || [],
      })
    }

    const scenario = getScenario(session.scenario_id)
    const hint = await llmGenerateHint({
      scenario,
      history,
      customerTurn: {
        text: String(customerTurn.text || ""),
        emotion: (customerTurn.emotion ? String(customerTurn.emotion) : undefined) as VoiceCoachEmotion | undefined,
      },
    })

    return NextResponse.json(hint)
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
