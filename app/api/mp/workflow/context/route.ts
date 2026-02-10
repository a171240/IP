import { NextRequest, NextResponse } from "next/server"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export const runtime = "nodejs"

const REQUIRED_DEPS: Record<string, string[]> = {
  // P7 质量依赖于前置研究与规划
  P7: ["P1", "P3", "P6", "IP传记"],
  // P8 最少依赖于 P7 的选题库（其他作为可选参考）
  P8: ["P7"],
}

const OPTIONAL_DEPS: Record<string, string[]> = {
  P7: ["P10"],
  P8: ["P1", "P3", "P6", "IP传记", "P10"],
}

function normalizeStepId(value: string | null): string {
  return typeof value === "string" ? value.trim() : ""
}

export async function GET(request: NextRequest) {
  const stepId = normalizeStepId(new URL(request.url).searchParams.get("stepId"))
  if (!stepId) {
    return NextResponse.json({ ok: false, error: "missing_stepId" }, { status: 400 })
  }

  if (!REQUIRED_DEPS[stepId]) {
    return NextResponse.json({ ok: false, error: "unsupported_stepId" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const required = REQUIRED_DEPS[stepId] || []
  const optional = OPTIONAL_DEPS[stepId] || []
  const deps = [...required, ...optional]

  const { data, error } = await supabase
    .from("reports")
    .select("id, step_id, title, created_at")
    .eq("user_id", user.id)
    .in("step_id", deps)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  const byStep = new Map<string, { id: string; step_id: string; title: string; created_at: string }>()
  for (const row of data || []) {
    const sid = String((row as { step_id?: unknown }).step_id || "").trim()
    if (!sid) continue
    if (!byStep.has(sid)) {
      byStep.set(sid, row as { id: string; step_id: string; title: string; created_at: string })
    }
  }

  const reports = deps
    .map((sid) => {
      const r = byStep.get(sid)
      if (!r) return null
      return {
        step_id: sid,
        report_id: r.id,
        title: r.title,
        created_at: r.created_at,
      }
    })
    .filter(Boolean)

  const missing_required = required.filter((sid) => !byStep.has(sid))
  const missing_optional = optional.filter((sid) => !byStep.has(sid))

  return NextResponse.json({
    ok: true,
    step_id: stepId,
    required,
    optional,
    reports,
    missing_required,
    missing_optional,
  })
}

