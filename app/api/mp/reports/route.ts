import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { extractTopicsFromText, normalizeTopicKey } from "@/lib/workflow/topic-extract"

export const runtime = "nodejs"

const createReportSchema = z.object({
  step_id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(200_000),
  summary: z.string().trim().max(600).optional(),
  metadata: z.record(z.unknown()).optional(),
  project_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
})

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

async function markWorkflowCompleted(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
  userId: string
  projectId: string | null
  stepId: string
}) {
  const { supabase, userId, projectId, stepId } = opts
  const now = new Date().toISOString()

  // This table's unique constraint includes project_id (NULLs aren't unique), so we emulate the
  // client-side logic: query first, then update/insert.
  const query = supabase
    .from("workflow_progress")
    .select("id,status")
    .eq("user_id", userId)
    .eq("step_id", stepId)
    .is("project_id", projectId)

  const { data: existing, error: existingError } = await query.maybeSingle()
  if (existingError) return

  if (existing?.id) {
    if (existing.status === "completed") return
    await supabase
      .from("workflow_progress")
      .update({ status: "completed", completed_at: now })
      .eq("id", existing.id)
    return
  }

  await supabase.from("workflow_progress").insert({
    user_id: userId,
    project_id: projectId,
    step_id: stepId,
    status: "completed",
    completed_at: now,
  })
}

async function markP7TopicUsed(opts: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>
  userId: string
  p7ReportId: string
  topic: string
  sourceReportId?: string
}) {
  const { supabase, userId, p7ReportId, topic, sourceReportId } = opts
  const id = String(p7ReportId || "").trim()
  const normalized = normalizeTopicKey(topic)
  if (!id || !normalized) return

  const { data } = await supabase
    .from("reports")
    .select("id, step_id, metadata")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()

  if (!data || data.step_id !== "P7") return

  const meta = isRecord(data.metadata) ? { ...data.metadata } : {}
  const usedRaw = isRecord(meta.p7_topics_used) ? { ...(meta.p7_topics_used as JsonObject) } : {}

  const now = new Date().toISOString()
  const existing = usedRaw[normalized]
  const existingObj = isRecord(existing) ? existing : {}
  const prevCount = Number(existingObj.count || 0)

  usedRaw[normalized] = {
    ...existingObj,
    count: prevCount + 1,
    first_used_at: typeof existingObj.first_used_at === "string" ? existingObj.first_used_at : now,
    last_used_at: now,
    ...(sourceReportId ? { last_report_id: sourceReportId } : {}),
  }

  meta.p7_topics_used = usedRaw
  meta.p7_topics_used_updated_at = now

  await supabase.from("reports").update({ metadata: meta }).eq("id", id).eq("user_id", userId)
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

  const stepIdRaw = url.searchParams.get("step_id") || url.searchParams.get("stepId")
  const stepIds = typeof stepIdRaw === "string"
    ? stepIdRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
    : []

  let query = supabase
    .from("reports")
    .select("id, step_id, title, summary, metadata, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (stepIds.length) {
    query = query.in("step_id", stepIds)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reports: data || [] })
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
  const parsed = createReportSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const payload = parsed.data
  const now = new Date().toISOString()

  const metadata: JsonObject = isRecord(payload.metadata) ? { ...payload.metadata } : {}

  // Auto-extract topics for P7 so clients can render per-topic status without fetching full content.
  if (payload.step_id === "P7" && !Array.isArray(metadata.p7_topics)) {
    const topics = extractTopicsFromText(payload.content, 220)
    if (topics.length) {
      metadata.p7_topics = topics
      metadata.p7_topics_parsed_at = now
      metadata.p7_topics_parser = "v1"
    }
  }

  const { data: created, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      project_id: payload.project_id || null,
      conversation_id: payload.conversation_id || null,
      step_id: payload.step_id,
      title: payload.title,
      content: payload.content,
      summary: payload.summary || null,
      metadata,
    })
    .select("id, created_at")
    .single()

  if (error || !created) {
    return NextResponse.json({ ok: false, error: error?.message || "insert_failed" }, { status: 500 })
  }

  // Best-effort: mark workflow step completed for default (null) project.
  try {
    await markWorkflowCompleted({
      supabase,
      userId: user.id,
      projectId: payload.project_id || null,
      stepId: payload.step_id,
    })
  } catch {
    // ignore
  }

  // Best-effort: When saving a P8 script referencing a P7 report + topic, mark that topic as "used".
  try {
    if (payload.step_id === "P8") {
      const p7ReportId = typeof metadata.p7ReportId === "string" ? metadata.p7ReportId.trim() : ""
      const topic = typeof metadata.topic === "string" ? metadata.topic.trim() : ""
      if (p7ReportId && topic) {
        await markP7TopicUsed({
          supabase,
          userId: user.id,
          p7ReportId,
          topic,
          sourceReportId: created.id,
        })
      }
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, report: created })
}
