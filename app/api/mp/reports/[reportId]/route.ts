import { NextRequest, NextResponse } from "next/server"

import { z } from "zod"

import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { normalizeTopicKey } from "@/lib/workflow/topic-extract"

export const runtime = "nodejs"

type JsonObject = Record<string, unknown>

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

const patchSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("merge_metadata"),
    metadata_patch: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal("p7_topic_used"),
    topic: z.string().trim().min(1).max(120),
  }),
  z.object({
    op: z.literal("p7_topic_unused"),
    topic: z.string().trim().min(1).max(120),
  }),
])

export async function GET(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params
  const id = (reportId || "").trim()
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_report_id" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, step_id, title, content, summary, metadata, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, report: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params
  const id = (reportId || "").trim()
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_report_id" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, step_id, metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "query_failed" }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 })
  }

  const currentMeta = isRecord(data.metadata) ? { ...data.metadata } : {}
  const now = new Date().toISOString()

  if (parsed.data.op === "merge_metadata") {
    const patch = parsed.data.metadata_patch || {}
    const nextMeta = { ...currentMeta, ...patch, metadata_updated_at: now }
    const { error: updateError } = await supabase
      .from("reports")
      .update({ metadata: nextMeta })
      .eq("id", id)
      .eq("user_id", user.id)

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message || "update_failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, report: { id, step_id: data.step_id, metadata: nextMeta } })
  }

  // Topic ops only apply to P7.
  if (data.step_id !== "P7") {
    return NextResponse.json({ ok: false, error: "topic_ops_only_support_P7" }, { status: 400 })
  }

  const topicKey = normalizeTopicKey(parsed.data.topic)
  if (!topicKey) {
    return NextResponse.json({ ok: false, error: "invalid_topic" }, { status: 400 })
  }

  const usedRaw = isRecord(currentMeta.p7_topics_used) ? { ...(currentMeta.p7_topics_used as JsonObject) } : {}

  if (parsed.data.op === "p7_topic_used") {
    const existing = usedRaw[topicKey]
    const existingObj = isRecord(existing) ? existing : {}
    const prevCount = Number(existingObj.count || 0)

    usedRaw[topicKey] = {
      ...existingObj,
      count: prevCount + 1,
      first_used_at: typeof existingObj.first_used_at === "string" ? existingObj.first_used_at : now,
      last_used_at: now,
    }
  } else {
    // p7_topic_unused
    delete usedRaw[topicKey]
  }

  const nextMeta = {
    ...currentMeta,
    p7_topics_used: usedRaw,
    p7_topics_used_updated_at: now,
  }

  const { error: updateError } = await supabase.from("reports").update({ metadata: nextMeta }).eq("id", id).eq("user_id", user.id)
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message || "update_failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, report: { id, step_id: data.step_id, metadata: nextMeta } })
}
