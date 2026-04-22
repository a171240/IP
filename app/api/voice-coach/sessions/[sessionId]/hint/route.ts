import { NextRequest, NextResponse } from "next/server"

import { checkVoiceCoachAccess } from "@/lib/voice-coach/guard.server"
import { llmGenerateHint, type HintResult } from "@/lib/voice-coach/llm.server"
import { getVoiceCoachSceneKindPolicy } from "@/lib/voice-coach/scene-kind-policy"
import { getVoiceCoachSessionInsights } from "@/lib/voice-coach/session-context-insights"
import { getVoiceCoachSessionPromptContext } from "@/lib/voice-coach/session-context"
import { getScenario, type VoiceCoachEmotion } from "@/lib/voice-coach/scenarios"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

function buildFallbackHint(args: {
  customerText: string
  history: Array<{ role: "customer" | "beautician"; text: string }>
  sessionSnapshot?: unknown
}): HintResult {
  const text = String(args.customerText || "").trim()
  const latestBeautician = args.history
    .slice()
    .reverse()
    .find((item) => item.role === "beautician" && item.text)
  const sessionInsights = getVoiceCoachSessionInsights({ snapshot: args.sessionSnapshot })
  const sceneKindPolicy = getVoiceCoachSceneKindPolicy(
    sessionInsights.sceneKind,
    sessionInsights.serviceName,
  )

  const primaryConcern =
    sessionInsights.coreConcerns[0] ||
    sessionInsights.targetObjections[0] ||
    sessionInsights.likelyQuestions[0] ||
    ""
  const mustCover = sessionInsights.mustCoverPoints[0] || ""
  const doNotSay = sessionInsights.doNotSay[0] || ""
  const communicationMethod = sessionInsights.communicationMethodTags[0] || ""
  const serviceLabel = sessionInsights.serviceName || "这次项目"

  const points = [
    primaryConcern
      ? `先接住顾客对“${primaryConcern}”的顾虑，用一句话复述她真正担心的点。`
      : "先接住顾客现在最在意的点，用一句话复述她的顾虑。",
    mustCover
      ? `这一轮最好补上“${mustCover}”，别只讲泛泛优点。`
      : "再给可验证的信息，不讲空概念，优先讲流程、案例、资质或体验安排。",
    "最后只推进一个低压力下一步，让顾客愿意继续聊下去。",
  ]

  let hintText = primaryConcern
    ? `这位顾客当前更在意“${primaryConcern}”。先接住她的顾虑，再结合${serviceLabel}给一条可验证的信息，最后只推进一个低压力的下一步。`
    : "先别急着解释项目本身，先顺着顾客刚才的顾虑接一句，让她觉得你真的听懂了；接着给一条可验证的信息，最后再轻轻推进一个下一步。"

  if (communicationMethod) {
    hintText = `${hintText} 方式上优先用“${communicationMethod}”的方法，先接情绪，再给证据和下一步。`
    points[2] = `方式上优先用“${communicationMethod}”，先接情绪，再给证据和下一步。`
  }

  hintText = `${hintText} ${sceneKindPolicy.hintFocus}`

  if (/案例|真实|情况接近|和我情况/.test(text)) {
    hintText =
      "顾客现在要的不是概念，而是能代入的真实案例。先承认她想看真实参考很正常，再讲一个和她情况接近的案例，重点说顾虑、过程和体验感受，最后问她想先看哪一类案例。"
    points[1] = "直接给贴近她情况的真实案例，少讲抽象原理。"
  } else if (/安全|风险|隐患|敏感|红肿|发炎|副作用/.test(text)) {
    hintText =
      "这句要先稳住她对安全和反应的担心。先共情她谨慎是正常的，再说明你们的评估、流程和风险提示怎么做，避免绝对保证，最后给她一个更安心的了解方式。"
    points[1] = mustCover
      ? `重点把“${mustCover}”讲具体，尤其是评估、流程和个体差异。`
      : "重点讲评估、流程、消毒和个体差异，不做绝对承诺。"
  } else if (/价格|贵|值不值|预算|划算/.test(text)) {
    hintText =
      "顾客在意的不是一句“值不值”，而是花这笔钱能换来什么确定性。先确认她对预算谨慎很正常，再拆开讲服务差异和体验价值，最后再给一个不压迫的选择。"
    points[1] = "把价值拆开讲清楚，不要一上来推套餐。"
  } else if (/试做|体验|先做一次|低门槛/.test(text)) {
    hintText =
      "顾客已经给了你一个很好的推进口子，就是想低门槛试一试。先肯定她这种谨慎决策方式，再顺着她给一个更轻的下一步，让她容易答应。"
    points[2] = "只给一个低压力下一步，比如先看案例或先体验一次。"
  }

  if (latestBeautician && latestBeautician.text && latestBeautician.text.length > 6) {
    points[0] = primaryConcern
      ? `先接住顾客对“${primaryConcern}”的顾虑，不要沿着上一句继续硬推。`
      : "先接住顾客顾虑，不要沿着上一句继续硬推。"
  }

  if (doNotSay) {
    points[2] = `避免直接说“${doNotSay}”，改成更克制、更可验证的表达。`
  }

  return {
    hint_text: hintText,
    hint_points: points.slice(0, 3),
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params
    const body = (await request.json().catch(() => null)) as { customer_turn_id?: unknown } | null
    const customerTurnId =
      typeof body?.customer_turn_id === "string" && body.customer_turn_id.trim()
        ? body.customer_turn_id.trim()
        : ""
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
      .select("id, scenario_id, status, scenario_snapshot_json")
      .eq("id", sessionId)
      .single()
    if (sessionError || !session) return jsonError(404, "session_not_found")

    const { data: customerTurn, error: turnError } = await supabase
      .from("voice_coach_turns")
      .select("id, role, text, emotion")
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

    const scenario = getScenario(session.scenario_id)
    const sessionContextText = getVoiceCoachSessionPromptContext(session.scenario_snapshot_json)

    let hint: HintResult
    try {
      hint = await llmGenerateHint({
        scenario,
        history,
        customerTurn: {
          text: String(customerTurn.text || ""),
          emotion: (customerTurn.emotion ? String(customerTurn.emotion) : undefined) as
            | VoiceCoachEmotion
            | undefined,
        },
        sessionContextText: sessionContextText || undefined,
      })
    } catch (error) {
      console.warn("[voice-coach] hint.fallback", {
        sessionId,
        customerTurnId,
        message: error instanceof Error ? error.message : String(error),
      })
      hint = buildFallbackHint({
        customerText: String(customerTurn.text || ""),
        history: history.map((item) => ({
          role: item.role,
          text: item.text,
        })),
        sessionSnapshot: session.scenario_snapshot_json,
      })
    }

    return NextResponse.json(hint)
  } catch (err: any) {
    return jsonError(500, "voice_coach_error", { message: err?.message || String(err) })
  }
}
