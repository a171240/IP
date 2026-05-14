import "server-only"

import {
  createSignedAudioUrlForBailian,
  isBailianAsrConfigured,
  queryBailianAsrTask,
  submitBailianAsrTask,
} from "@/lib/service-records/bailian-asr.server"
import { cleanText, isRecord, numberValue } from "@/lib/service-records/server"

type ProcessOptions = {
  pollLimit?: number
}

function taskIdOf(segment: any) {
  const asrJson = isRecord(segment?.asr_json) ? segment.asr_json : {}
  return cleanText(asrJson.task_id, 160)
}

function toDbAsrStatus(taskStatus: string) {
  if (taskStatus === "SUCCEEDED") return "done"
  if (taskStatus === "FAILED" || taskStatus === "CANCELED") return "failed"
  return "running"
}

function statusCounts(segments: any[]) {
  const counts = {
    total: segments.length,
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
    skipped: 0,
  }
  for (const segment of segments) {
    const status = cleanText(segment.asr_status, 40) || "pending"
    if (status in counts) counts[status as keyof typeof counts] += 1
  }
  return counts
}

function snapshotName(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback
  return cleanText(value.name || value.service_name || value.title, 80) || fallback
}

function formatDuration(seconds: unknown) {
  const total = Math.max(0, Math.round(numberValue(seconds, 0)))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function markerLabel(marker: any) {
  return cleanText(marker.label, 80) || cleanText(marker.marker_type, 80) || "服务标记"
}

function compactList(values: unknown[], fallback: string[] = []) {
  const items = values.map((value) => cleanText(value, 120)).filter(Boolean)
  return items.length ? items.slice(0, 8) : fallback
}

function transcriptTextOf(segments: any[]) {
  return segments
    .map((segment) => cleanText(segment.transcript_text, 100000))
    .filter(Boolean)
    .join("\n")
}

function markerLabelsByType(markers: any[], type: string) {
  return markers
    .filter((marker) => cleanText(marker.marker_type, 80) === type)
    .map(markerLabel)
    .filter(Boolean)
}

function buildEmployeeFeedback(session: any, segments: any[], markers: any[], counts: ReturnType<typeof statusCounts>) {
  const transcript = transcriptTextOf(segments)
  const customerName = snapshotName(session.customer_snapshot_json, "本位顾客")
  const hasTranscript = Boolean(transcript)
  const hasOpenAsr = counts.pending > 0 || counts.running > 0
  const concerns = compactList(markerLabelsByType(markers, "customer_objection"))
  const dealSignals = compactList(markerLabelsByType(markers, "deal_signal"))

  return {
    summary: hasTranscript
      ? `本轮服务已整理 ${counts.done || 0} 段转写内容，可先围绕${customerName}的关注点做复盘。`
      : hasOpenAsr
        ? "本轮录音已保存，部分内容仍在识别中，稍后会继续补齐反馈。"
        : "本轮录音已保存，当前没有可用转写文本，建议先根据现场情况补充服务备注。",
    customer_concerns: concerns.length ? concerns : ["等待系统从转写内容中继续识别顾客顾虑。"],
    staff_highlights: dealSignals.length ? dealSignals : ["已完成本轮服务沟通记录，后续可结合转写复盘表达亮点。"],
    next_follow_up: hasTranscript
      ? "下次沟通前，先查看顾客本轮关注点，再准备一个低压力的跟进问题。"
      : "转写补齐后，再确认顾客关注点和下次跟进动作。",
    coaching_tip: "先接住顾客顾虑，再补项目依据，最后给出一个轻量下一步。",
  }
}

function buildManagerReview(markers: any[], counts: ReturnType<typeof statusCounts>) {
  return {
    conversation_summary: counts.done
      ? "本轮已有转写内容，可用于店长复盘员工表达和成交推进。"
      : "等待转写完成后再做完整复盘。",
    deal_signals: compactList(markerLabelsByType(markers, "deal_signal")),
    professional_questions: compactList(markerLabelsByType(markers, "professional_question")),
    manager_intervention: compactList(markerLabelsByType(markers, "manager_joined")),
    staff_improvement: ["复盘是否先回应顾客担心，再解释项目价值。"],
    training_topics: ["顾客顾虑承接", "项目专业解释", "自然推进下一步"],
  }
}

function buildOperations(session: any, counts: ReturnType<typeof statusCounts>) {
  const warnings = []
  if (counts.pending || counts.running) warnings.push("仍有录音片段在识别中，反馈会继续补齐。")
  if (counts.failed) warnings.push("存在识别失败片段，需要后续重试或人工补充。")

  return {
    customer_profile_suggestions: session.customer_profile_id
      ? ["可结合本轮顾客关注点，生成档案更新建议。"]
      : ["本轮服务尚未绑定顾客，建议店长后补顾客档案。"],
    knowledge_base_candidates: ["从本轮专业问题中沉淀门店项目知识和话术边界。"],
    xhs_material_candidates: ["可在匿名化后提炼顾客高频顾虑，作为后续内容素材候选。"],
    quality_warnings: warnings,
  }
}

function buildTranscriptSection(segments: any[]) {
  const blocks = segments
    .map((segment) => {
      const text = cleanText(segment.transcript_text, 100000)
      if (!text) return ""
      const index = Number(segment.segment_index || 0) || "-"
      return `### 片段 ${index}\n\n${text}`
    })
    .filter(Boolean)

  if (!blocks.length) {
    return "当前还没有可用转写文本。若录音片段仍在识别中，稍后刷新即可补齐。"
  }
  return blocks.join("\n\n")
}

function buildMarkerSection(markers: any[]) {
  if (!markers.length) return "- 暂无手动标记"
  return markers
    .map((marker) => `- ${formatDuration(marker.offset_seconds)} ${markerLabel(marker)}${cleanText(marker.note, 200) ? `：${cleanText(marker.note, 200)}` : ""}`)
    .join("\n")
}

function buildSuggestionSection(counts: ReturnType<typeof statusCounts>) {
  if (counts.running || counts.pending) {
    return [
      "- 当前整理稿会先展示已完成识别的内容。",
      "- 稍后刷新服务记录，可继续补齐剩余片段。",
      "- 顾客档案反补和专业知识库匹配将在下一阶段接入。",
    ].join("\n")
  }

  return [
    "- 复盘顾客顾虑、成交信号和专业问题，并补充到顾客档案。",
    "- 下一阶段会结合门店知识库自动生成更细的专业解释和跟进建议。",
  ].join("\n")
}

export function buildServiceRecordNoteMarkdown(session: any, segments: any[], markers: any[], employeeFeedback?: any) {
  const counts = statusCounts(segments)
  const customerName = snapshotName(session.customer_snapshot_json, "未命名顾客")
  const projectName = snapshotName(session.scene_snapshot_json, "未命名项目")
  const feedback = employeeFeedback || buildEmployeeFeedback(session, segments, markers, counts)

  return [
    "# 服务记录整理稿",
    "",
    "## 基本信息",
    `- 顾客：${customerName}`,
    `- 项目：${projectName}`,
    `- 服务目标：${cleanText(session.objective, 200) || "到店服务沟通记录"}`,
    `- 录音时长：${formatDuration(session.audio_seconds)}`,
    `- 片段数量：${counts.total}`,
    "",
    "## 员工反馈",
    `- 服务小结：${feedback.summary}`,
    `- 顾客关注：${compactList(feedback.customer_concerns, ["待继续识别"]).join("；")}`,
    `- 员工亮点：${compactList(feedback.staff_highlights, ["待店长复盘"]).join("；")}`,
    `- 下次跟进：${cleanText(feedback.next_follow_up, 300)}`,
    `- 话术建议：${cleanText(feedback.coaching_tip, 300)}`,
    "",
    "## 关键标记",
    buildMarkerSection(markers),
    "",
    "## 转写记录",
    buildTranscriptSection(segments),
    "",
    "## 后续处理建议",
    buildSuggestionSection(counts),
  ].join("\n")
}

async function submitPendingSegmentAsr(admin: any, segment: any) {
  if (!isBailianAsrConfigured()) return segment
  if (taskIdOf(segment)) return segment

  const storagePath = cleanText(segment.storage_path, 2000)
  if (!storagePath) {
    const { data } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "skipped",
        asr_json: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          skipped_reason: "missing_storage_path",
          skipped_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .maybeSingle()
    return data || segment
  }

  try {
    const audioUrl = await createSignedAudioUrlForBailian(storagePath)
    const asr = await submitBailianAsrTask({ audioUrl })
    const { data } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "running",
        asr_json: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: asr.provider,
          model: asr.model,
          task_id: asr.taskId,
          task_status: asr.taskStatus,
          request_id: asr.requestId,
          submitted_at: asr.submittedAt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .maybeSingle()
    return data || segment
  } catch (error: any) {
    const { data } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "failed",
        asr_json: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          error: cleanText(error?.message || "bailian_submit_failed", 300),
          failed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .maybeSingle()
    return data || segment
  }
}

export async function pollServiceRecordAsrSegments(admin: any, sessionId: string, opts: ProcessOptions = {}) {
  const pollLimit = Math.max(1, Math.min(100, Number(opts.pollLimit || 50)))
  const { data: candidates, error } = await admin
    .from("service_record_segments")
    .select("*")
    .eq("session_id", sessionId)
    .in("asr_status", ["pending", "running"])
    .order("segment_index", { ascending: true })
    .limit(pollLimit)

  if (error) throw new Error(error.message || "segments_query_failed")

  const updated = []
  for (const rawSegment of candidates || []) {
    let segment = rawSegment
    if (cleanText(segment.asr_status, 40) === "pending") {
      segment = await submitPendingSegmentAsr(admin, segment)
    }

    const taskId = taskIdOf(segment)
    if (!taskId || !isBailianAsrConfigured()) continue

    try {
      const result = await queryBailianAsrTask(taskId)
      const { data } = await admin
        .from("service_record_segments")
        .update({
          asr_status: toDbAsrStatus(result.taskStatus),
          transcript_text: result.text || segment.transcript_text || null,
          asr_json: {
            ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
            provider: "bailian",
            task_id: result.taskId,
            task_status: result.taskStatus,
            request_id: result.requestId,
            last_polled_at: new Date().toISOString(),
            raw: result.raw,
            transcription: result.transcription,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment.id)
        .select("*")
        .maybeSingle()
      if (data) updated.push(data)
    } catch (error: any) {
      const { data } = await admin
        .from("service_record_segments")
        .update({
          asr_status: "failed",
          asr_json: {
            ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
            provider: "bailian",
            error: cleanText(error?.message || "bailian_query_failed", 300),
            failed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment.id)
        .select("*")
        .maybeSingle()
      if (data) updated.push(data)
    }
  }

  return updated
}

async function loadSessionParts(admin: any, sessionId: string) {
  const [segmentsResult, markersResult] = await Promise.all([
    admin
      .from("service_record_segments")
      .select("*")
      .eq("session_id", sessionId)
      .order("segment_index", { ascending: true }),
    admin
      .from("service_record_markers")
      .select("*")
      .eq("session_id", sessionId)
      .order("offset_seconds", { ascending: true }),
  ])

  if (segmentsResult.error) throw new Error(segmentsResult.error.message || "segments_query_failed")
  if (markersResult.error) throw new Error(markersResult.error.message || "markers_query_failed")
  return {
    segments: segmentsResult.data || [],
    markers: markersResult.data || [],
  }
}

export async function processServiceRecordSession(admin: any, session: any, opts: ProcessOptions = {}) {
  await pollServiceRecordAsrSegments(admin, session.id, opts)

  const { segments, markers } = await loadSessionParts(admin, session.id)
  const counts = statusCounts(segments)
  const hasOpenAsr = counts.pending > 0 || counts.running > 0
  const nextStatus = hasOpenAsr ? "processing" : "completed"
  const now = new Date().toISOString()
  const employeeFeedback = buildEmployeeFeedback(session, segments, markers, counts)
  const managerReview = buildManagerReview(markers, counts)
  const operations = buildOperations(session, counts)
  const noteMarkdown = buildServiceRecordNoteMarkdown(session, segments, markers, employeeFeedback)
  const resultJson = {
    source: "service_record_processing_v1",
    generated_at: now,
    status: nextStatus,
    asr: counts,
    marker_count: markers.length,
    has_note: Boolean(noteMarkdown),
    employee_feedback: employeeFeedback,
    manager_review: managerReview,
    operations,
  }

  const { data, error } = await admin
    .from("service_record_sessions")
    .update({
      status: nextStatus,
      processing_started_at: session.processing_started_at || now,
      completed_at: nextStatus === "completed" ? now : session.completed_at || null,
      note_markdown: noteMarkdown,
      result_json: resultJson,
      updated_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single()

  if (error || !data) throw new Error(error?.message || "session_process_failed")
  return {
    session: data,
    segments,
    markers,
    result: resultJson,
  }
}
