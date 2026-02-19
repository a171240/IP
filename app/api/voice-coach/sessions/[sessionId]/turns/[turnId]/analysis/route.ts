import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { emitVoiceCoachEvent } from "@/lib/voice-coach/jobs.server"
import { llmAnalyzeBeauticianTurn, type TurnAnalysis } from "@/lib/voice-coach/llm.server"
import { getAnalysisTemplate, normalizeVoiceCoachCategoryId } from "@/lib/voice-coach/script-packs"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function buildHistory(rows: Array<{ role: string | null; text: string | null; emotion: string | null }>) {
  return rows
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role === "customer" ? ("customer" as const) : ("beautician" as const),
      text: String(row.text || ""),
      emotion: row.emotion ? (String(row.emotion) as VoiceCoachEmotion) : undefined,
    }))
}

function calcStageElapsedMs(createdAt: string | null): number | null {
  if (!createdAt) return null
  const ts = Date.parse(createdAt)
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Date.now() - ts)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; turnId: string }> },
) {
  try {
    const body = (await request.json().catch(() => null)) as { force_refine?: unknown } | null
    const forceRefine = Boolean(body && body.force_refine === true)

    const { sessionId, turnId } = await context.params
    if (!sessionId || !turnId) return jsonError(400, "missing_params")

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError(401, "请先登录")

    const access = checkVoiceCoachAccess(user.id)
    if (!access.ok) return jsonError(access.status, access.error)

    const { data: session, error: sessionError } = await supabase
      .from("voice_coach_sessions")
      .select("id, status, scenario_id, category_id")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    const { data: turn, error: turnError } = await supabase
      .from("voice_coach_turns")
      .select("id, role, text, turn_index, intent_id, analysis_json, created_at")
      .eq("id", turnId)
      .eq("session_id", sessionId)
      .single()
    if (turnError || !turn) return jsonError(404, "turn_not_found")
    if (String(turn.role || "") !== "beautician") return jsonError(400, "turn_not_beautician")

    const cachedAnalysis = (turn.analysis_json || null) as (TurnAnalysis & { source?: string }) | null
    if (cachedAnalysis && (!forceRefine || cachedAnalysis.source === "model")) {
      return NextResponse.json({
        turn_id: turnId,
        analysis: cachedAnalysis,
        cached: true,
      })
    }

    const beauticianText = String(turn.text || "").trim()
    if (!beauticianText) return jsonError(400, "turn_text_empty")

    const replyTurnIndex = Number(turn.turn_index || 0) - 1
    if (replyTurnIndex < 0) return jsonError(400, "reply_turn_not_found")

    const [{ data: replyTurn, error: replyError }, { data: historyRows, error: historyError }] = await Promise.all([
      supabase
        .from("voice_coach_turns")
        .select("id, text, emotion")
        .eq("session_id", sessionId)
        .eq("turn_index", replyTurnIndex)
        .eq("role", "customer")
        .single(),
      supabase
        .from("voice_coach_turns")
        .select("role, text, emotion")
        .eq("session_id", sessionId)
        .lte("turn_index", Number(turn.turn_index || 0))
        .order("turn_index", { ascending: false })
        .limit(6),
    ])

    if (replyError || !replyTurn) return jsonError(400, "reply_turn_not_found")
    if (historyError) return jsonError(500, "history_query_failed", { message: historyError.message })

    const scenario = getScenario(String(session.scenario_id || "objection_safety"))
    const categoryId = normalizeVoiceCoachCategoryId(String(session.category_id || scenario.categoryId))
    const intentId = String(turn.intent_id || "").trim()
    const history = buildHistory(historyRows || [])

    const template = getAnalysisTemplate(categoryId, intentId)
    if (!forceRefine && template) {
      const fixedAnalysis = {
        suggestions: template.suggestions.slice(0, 3),
        polished: template.polished,
        highlights: [],
        risk_notes: [],
        source: "fixed",
      }

      const { error: updateError } = await supabase
        .from("voice_coach_turns")
        .update({
          analysis_json: fixedAnalysis,
          status: "analysis_ready",
        })
        .eq("id", turnId)
        .eq("session_id", sessionId)
      if (updateError) return jsonError(500, "analysis_update_failed", { message: updateError.message })

      return NextResponse.json({
        turn_id: turnId,
        analysis: fixedAnalysis,
        cached: false,
      })
    }

    const analysis = await llmAnalyzeBeauticianTurn({
      scenario,
      history,
      customerTurn: {
        text: String(replyTurn.text || ""),
        emotion: replyTurn.emotion ? (String(replyTurn.emotion) as VoiceCoachEmotion) : undefined,
      },
      beauticianText,
    })

    const finalAnalysis = {
      ...analysis,
      source: "model",
    }

    const { error: updateError } = await supabase
      .from("voice_coach_turns")
      .update({
        analysis_json: finalAnalysis,
        status: "analysis_ready",
      })
      .eq("id", turnId)
      .eq("session_id", sessionId)
    if (updateError) return jsonError(500, "analysis_update_failed", { message: updateError.message })

    await emitVoiceCoachEvent({
      sessionId,
      userId: user.id,
      turnId,
      type: "beautician.analysis_ready",
      data: {
        turn_id: turnId,
        analysis: finalAnalysis,
        stage_elapsed_ms: calcStageElapsedMs(turn.created_at ? String(turn.created_at) : null),
        ts: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      turn_id: turnId,
      analysis: finalAnalysis,
      cached: false,
    })
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
