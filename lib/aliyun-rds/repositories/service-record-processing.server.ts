import "server-only"

import {
  cleanText,
  getAliyunRdsServiceRecordSegment,
  isRecord,
  listAliyunRdsServiceRecordAsrCandidates,
  listAliyunRdsServiceRecordMarkers,
  listAliyunRdsServiceRecordSegments,
  numberValue,
  updateAliyunRdsServiceRecordSegmentAsr,
  updateAliyunRdsServiceRecordSessionProcessing,
  type ServiceRecordMarkerRow,
  type ServiceRecordSegmentRow,
  type ServiceRecordSessionRow,
} from "@/lib/aliyun-rds/repositories/service-records.server"
import {
  createAliyunRdsSignedAudioUrlForBailian,
  isAliyunRdsBailianAsrConfigured,
  queryAliyunRdsBailianAsrTask,
  submitAliyunRdsBailianAsrTask,
} from "@/lib/aliyun-rds/service-record-asr.server"
import { createAliyunRdsServiceRecordOssSignedGetUrl } from "@/lib/aliyun-rds/service-record-oss.server"

type ProcessOptions = {
  pollLimit?: number
  allowFallbackCompletion?: boolean
}

function taskIdOf(segment: ServiceRecordSegmentRow) {
  const asrJson = isRecord(segment?.asr_json) ? segment.asr_json : {}
  return cleanText(asrJson.task_id, 160)
}

function toDbAsrStatus(taskStatus: string) {
  if (taskStatus === "SUCCEEDED") return "done"
  if (taskStatus === "FAILED" || taskStatus === "CANCELED") return "failed"
  return "running"
}

function statusCounts(segments: ServiceRecordSegmentRow[]) {
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
    if (status === "running") counts.running += 1
    else if (status === "done") counts.done += 1
    else if (status === "failed") counts.failed += 1
    else if (status === "skipped") counts.skipped += 1
    else counts.pending += 1
  }
  return counts
}

function formatDuration(value: unknown) {
  const total = Math.max(0, Math.round(numberValue(value, 0)))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function snapshotName(snapshot: unknown, fallback: string) {
  const value = isRecord(snapshot) ? snapshot : {}
  return cleanText(value.name, 80) || cleanText(value.service_name, 80) || fallback
}

function markerLabel(marker: ServiceRecordMarkerRow) {
  return cleanText(marker.label, 120) || cleanText(marker.marker_type, 80) || "服务标记"
}

function transcriptTextOf(segments: ServiceRecordSegmentRow[]) {
  return segments
    .map((segment) => cleanText(segment.transcript_text, 100000))
    .filter(Boolean)
    .join("\n")
    .trim()
}

function compactList(values: unknown[], fallback: string[]) {
  const list = Array.isArray(values)
    ? values.map((item) => cleanText(item, 120)).filter(Boolean)
    : []
  return list.length ? list.slice(0, 8) : fallback
}

function audioEvidenceFromSegments(sessionId: string, segments: ServiceRecordSegmentRow[]) {
  const audioSegments = segments
    .filter((segment) => cleanText(segment.storage_path, 2000))
    .map((segment) => ({
      id: cleanText(segment.id, 160),
      segment_index: Number(segment.segment_index || 0) || null,
      client_segment_id: cleanText(segment.client_segment_id, 160),
      content_type: cleanText(segment.content_type, 120) || "audio/ogg",
      audio_bytes: Math.max(0, Math.round(numberValue(segment.audio_bytes, 0))),
      duration_seconds: Math.max(0, Math.round(numberValue(segment.client_audio_seconds, 0))),
    }))

  const firstSegment = audioSegments[0] || null
  return {
    saved: audioSegments.length > 0,
    status_label: audioSegments.length ? "原音已保存" : "原音待确认",
    playback_available: audioSegments.length > 0,
    signed_url_required: true,
    segment_count: audioSegments.length,
    first_segment_id: firstSegment?.id || "",
    playback_api_url: firstSegment
      ? `/api/app/service-records/sessions/${encodeURIComponent(sessionId)}/audio/${encodeURIComponent(firstSegment.id)}`
      : "",
    segments: audioSegments.slice(0, 12).map((segment) => ({
      ...segment,
      playback_api_url: `/api/app/service-records/sessions/${encodeURIComponent(sessionId)}/audio/${encodeURIComponent(segment.id)}`,
    })),
  }
}

function buildFallbackEmployeeFeedback(session: ServiceRecordSessionRow, segments: ServiceRecordSegmentRow[], markers: ServiceRecordMarkerRow[], counts: ReturnType<typeof statusCounts>) {
  const transcript = transcriptTextOf(segments)
  const markerLabels = markers.map(markerLabel)
  return {
    summary: transcript
      ? "本轮服务录音已完成转写，系统已生成基础复盘，建议结合原音继续复核。"
      : counts.total
        ? "本轮服务原音已保存，文字识别仍在补齐或存在失败片段。"
        : "本轮服务记录尚未保存有效录音片段。",
    customer_concerns: compactList(markerLabels.filter((item) => /顾虑|问题|关注/.test(item)), ["待从转写中继续识别顾客关注点。"]),
    staff_highlights: transcript ? ["已完成服务沟通记录留存。"] : ["已建立本轮服务记录。"],
    next_follow_up: snapshotName(session.customer_snapshot_json, "顾客") === "未命名顾客"
      ? "补充顾客信息后由店长继续复盘。"
      : "结合本轮服务记录安排下一次跟进。",
    coaching_tip: "复盘时优先确认顾客真实顾虑、项目适配和下一步邀约话术。",
  }
}

function buildManagerReview(markers: ServiceRecordMarkerRow[], counts: ReturnType<typeof statusCounts>) {
  const markerLabels = markers.map(markerLabel)
  return {
    conversation_summary: counts.done
      ? "已有转写片段，可进入店长复盘。"
      : "原音已进入识别链路，店长复盘需等待更多转写或回听原音。",
    deal_signals: compactList(markerLabels.filter((item) => /成交|信号|意向/.test(item)), []),
    professional_questions: compactList(markerLabels.filter((item) => /专业|问题|护理/.test(item)), []),
    manager_intervention: compactList(markerLabels.filter((item) => /店长|介入|投诉|风险/.test(item)), []),
    staff_improvement: counts.failed ? ["检查失败片段并补听原音。"] : ["结合转写补充员工下一句话术。"],
    training_topics: ["顾客顾虑追问", "项目价值表达", "服务后跟进"],
  }
}

function buildOperations(session: ServiceRecordSessionRow, counts: ReturnType<typeof statusCounts>) {
  return {
    customer_profile_suggestions: session.customer_profile_id ? ["根据本轮服务补充顾客关注点和跟进提醒。"] : ["店长确认顾客后再生成档案更新建议。"],
    knowledge_base_candidates: counts.done ? ["从高频专业问答中沉淀门店知识库素材。"] : [],
    xhs_material_candidates: [],
    quality_warnings: [
      ...(counts.pending || counts.running ? ["仍有录音片段在识别中，纪要会继续补齐。"] : []),
      ...(counts.failed ? ["存在识别失败片段，请结合原音复核。"] : []),
      ...(counts.total === 0 ? ["没有有效录音片段，不能作为服务闭环验收。"] : []),
    ],
  }
}

function buildServiceMinutesV2(session: ServiceRecordSessionRow, segments: ServiceRecordSegmentRow[], markers: ServiceRecordMarkerRow[], counts: ReturnType<typeof statusCounts>) {
  const audioEvidence = audioEvidenceFromSegments(session.id, segments)
  const transcript = transcriptTextOf(segments)
  const quality = transcript && counts.done > 0
    ? (counts.failed || counts.pending || counts.running ? "partial" : "good")
    : "poor"
  return {
    version: "service_minutes_v2",
    title: "本轮服务智能纪要",
    recording: {
      theme: cleanText(session.objective, 200) || "到店服务沟通记录",
      started_at: session.started_at || "",
      ended_at: session.ended_at || "",
      duration_seconds: Math.max(0, Math.round(numberValue(session.audio_seconds, 0))),
      segment_count: counts.total,
      asr_quality: quality,
      quality_warnings: buildOperations(session, counts).quality_warnings,
      can_generate_business_minutes: quality !== "poor",
      business_minutes_mode: quality === "good" ? "formal" : quality === "partial" ? "basic" : "transcript_only",
      quality_reason: quality === "poor" ? "转写不足或原音片段不足。" : "",
      audio_saved: audioEvidence.saved,
      playback_available: audioEvidence.playback_available,
      audio_evidence: audioEvidence,
    },
    executive_summary: {
      one_line: transcript ? "本轮服务已有可复盘内容。" : "本轮服务仍待补齐转写。",
      service_outcome: "待店长结合门店业务确认。",
      customer_state: snapshotName(session.customer_snapshot_json, "顾客状态待确认"),
      staff_state: "已完成现场记录。",
    },
    todos: [
      {
        owner: "manager",
        priority: counts.failed ? "high" : "normal",
        title: counts.failed ? "复核识别失败片段" : "完成本轮服务复盘",
        detail: counts.failed ? "有片段识别失败，需回听原音并补充判断。" : "结合转写和标记确认跟进动作。",
        due_hint: "今日内",
        evidence: "",
      },
    ],
    customer_concerns: [],
    sales_opportunities: [],
    risk_warnings: [],
    staff_review: {
      highlights: transcript ? ["服务沟通已留痕。"] : [],
      misses: [],
      missed_sales_signals: [],
      coaching_tips: ["下次服务中优先确认顾客目标和顾虑。"],
      next_script: "我先确认一下您这次最想改善的地方，再判断今天护理重点。",
    },
    manager_brief: {
      priority: counts.failed ? "high" : "normal",
      one_line: transcript ? "可进入复盘。" : "等待转写补齐。",
      opportunity_one_line: "",
      risk_one_line: counts.failed ? "存在失败片段。" : "",
      conversion_opportunity: "",
      main_risk: counts.failed ? "原音识别不完整。" : "",
      recommended_owner: "manager",
      intervention_needed: counts.failed,
      next_action: counts.failed ? "回听原音并补齐重点。" : "确认跟进动作。",
      training_topics: ["顾客顾虑追问"],
    },
    customer_profile_update_suggestions: {
      new_concerns: [],
      new_preferences: [],
      project_interests: [],
      commitments: [],
      follow_up_suggestions: [],
      risk_notes: [],
    },
    smart_chapters: markers.slice(0, 8).map((marker) => ({
      start_seconds: Math.max(0, Math.round(numberValue(marker.offset_seconds, 0))),
      time_label: formatDuration(marker.offset_seconds),
      title: markerLabel(marker),
      summary: cleanText(marker.note, 200),
      signals: [cleanText(marker.marker_type, 80)].filter(Boolean),
    })),
    audio_evidence: audioEvidence,
  }
}

function buildNoteMarkdown(session: ServiceRecordSessionRow, segments: ServiceRecordSegmentRow[], markers: ServiceRecordMarkerRow[], employeeFeedback: Record<string, unknown>) {
  const counts = statusCounts(segments)
  return [
    "# 服务记录整理稿",
    "",
    "## 基本信息",
    `- 顾客：${snapshotName(session.customer_snapshot_json, "未命名顾客")}`,
    `- 项目：${snapshotName(session.scene_snapshot_json, "未命名项目")}`,
    `- 服务目标：${cleanText(session.objective, 200) || "到店服务沟通记录"}`,
    `- 录音时长：${formatDuration(session.audio_seconds)}`,
    `- 片段数量：${counts.total}`,
    "",
    "## 员工反馈",
    `- 服务小结：${cleanText(employeeFeedback.summary, 500)}`,
    `- 顾客关注：${compactList(Array.isArray(employeeFeedback.customer_concerns) ? employeeFeedback.customer_concerns : [], ["待继续识别"]).join("；")}`,
    `- 员工亮点：${compactList(Array.isArray(employeeFeedback.staff_highlights) ? employeeFeedback.staff_highlights : [], ["待店长复盘"]).join("；")}`,
    `- 下次跟进：${cleanText(employeeFeedback.next_follow_up, 300)}`,
    `- 话术建议：${cleanText(employeeFeedback.coaching_tip, 300)}`,
    "",
    "## 关键标记",
    markers.length
      ? markers.map((marker) => `- ${formatDuration(marker.offset_seconds)} ${markerLabel(marker)} ${cleanText(marker.note, 200)}`).join("\n")
      : "暂无人工标记。",
    "",
    "## 转写记录",
    segments
      .filter((segment) => cleanText(segment.transcript_text, 100000))
      .map((segment) => `- 片段 ${segment.segment_index || "-"}：${cleanText(segment.transcript_text, 2000)}`)
      .join("\n") || "暂无可用转写。",
  ].join("\n")
}

async function submitPendingSegmentAsr(segment: ServiceRecordSegmentRow) {
  if (!isAliyunRdsBailianAsrConfigured()) {
    const nextSegment = await updateAliyunRdsServiceRecordSegmentAsr({
      segmentId: segment.id,
      asrStatus: "failed",
      asrJson: {
        ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
        provider: "bailian",
        error: "bailian_api_key_missing",
        failed_at: new Date().toISOString(),
      },
    })
    return nextSegment || segment
  }
  if (taskIdOf(segment)) return segment

  try {
    const audioUrl = await createAliyunRdsSignedAudioUrlForBailian(segment)
    const asr = await submitAliyunRdsBailianAsrTask(audioUrl)
    const nextSegment = await updateAliyunRdsServiceRecordSegmentAsr({
      segmentId: segment.id,
      asrStatus: "running",
      asrJson: {
        ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
        provider: asr.provider,
        model: asr.model,
        task_id: asr.taskId,
        task_status: asr.taskStatus,
        request_id: asr.requestId,
        submitted_at: asr.submittedAt,
      },
    })
    return nextSegment || segment
  } catch (error: any) {
    const nextSegment = await updateAliyunRdsServiceRecordSegmentAsr({
      segmentId: segment.id,
      asrStatus: "failed",
      asrJson: {
        ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
        provider: "bailian",
        error: cleanText(error?.message || "bailian_submit_failed", 300),
        failed_at: new Date().toISOString(),
      },
    })
    return nextSegment || segment
  }
}

export async function pollAliyunRdsServiceRecordAsrSegments(sessionId: string, opts: ProcessOptions = {}) {
  const candidates = await listAliyunRdsServiceRecordAsrCandidates(sessionId, opts.pollLimit || 20)
  const updated: ServiceRecordSegmentRow[] = []

  for (const rawSegment of candidates) {
    let segment = rawSegment
    if (cleanText(segment.asr_status, 40) === "pending") {
      segment = await submitPendingSegmentAsr(segment)
      updated.push(segment)
    }

    const taskId = taskIdOf(segment)
    if (!taskId || !isAliyunRdsBailianAsrConfigured()) continue

    try {
      const result = await queryAliyunRdsBailianAsrTask(taskId)
      const next = await updateAliyunRdsServiceRecordSegmentAsr({
        segmentId: segment.id,
        asrStatus: toDbAsrStatus(result.taskStatus),
        transcriptText: result.text || segment.transcript_text || null,
        asrJson: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          task_id: result.taskId,
          task_status: result.taskStatus,
          request_id: result.requestId,
          last_polled_at: new Date().toISOString(),
          raw: result.raw,
          transcription: result.transcription,
        },
      })
      if (next) updated.push(next)
    } catch (error: any) {
      const next = await updateAliyunRdsServiceRecordSegmentAsr({
        segmentId: segment.id,
        asrStatus: "failed",
        asrJson: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          error: cleanText(error?.message || "bailian_query_failed", 300),
          failed_at: new Date().toISOString(),
        },
      })
      if (next) updated.push(next)
    }
  }

  return updated
}

export async function processAliyunRdsServiceRecordSession(session: ServiceRecordSessionRow, opts: ProcessOptions = {}) {
  await pollAliyunRdsServiceRecordAsrSegments(session.id, opts)

  const [segments, markers] = await Promise.all([
    listAliyunRdsServiceRecordSegments(session.id),
    listAliyunRdsServiceRecordMarkers(session.id),
  ])
  const counts = statusCounts(segments)
  const hasOpenAsr = counts.pending > 0 || counts.running > 0
  const nextStatus = hasOpenAsr && !opts.allowFallbackCompletion ? "processing" : "completed"
  const now = new Date().toISOString()
  const employeeFeedback = buildFallbackEmployeeFeedback(session, segments, markers, counts)
  const managerReview = buildManagerReview(markers, counts)
  const operations = buildOperations(session, counts)
  const serviceMinutesV2 = buildServiceMinutesV2(session, segments, markers, counts)
  const noteMarkdown = buildNoteMarkdown(session, segments, markers, employeeFeedback)
  const resultJson = {
    source: "aliyun_rds_service_record_processing_v1",
    generated_at: now,
    status: nextStatus,
    asr: counts,
    llm: {
      provider: "local",
      model: "",
      used: false,
      source: "aliyun_rds_service_record_processing_v1",
      transcript_chars: transcriptTextOf(segments).length,
      reason: hasOpenAsr ? "asr_still_open" : "deepseek_deferred_for_rds_migration",
    },
    marker_count: markers.length,
    has_note: Boolean(noteMarkdown),
    service_minutes_v2: serviceMinutesV2,
    audio_evidence: serviceMinutesV2.audio_evidence,
    employee_feedback: employeeFeedback,
    manager_review: managerReview,
    operations,
  }
  const nextSession = await updateAliyunRdsServiceRecordSessionProcessing({
    session,
    status: nextStatus,
    noteMarkdown,
    resultJson,
  })

  return {
    session: nextSession,
    segments,
    markers,
    result: resultJson,
  }
}

export async function createAliyunRdsServiceRecordSegmentAudioUrl(sessionId: string, segmentId: string) {
  const segment = await getAliyunRdsServiceRecordSegment(sessionId, segmentId)
  if (!segment?.storage_path) return null
  return {
    segment,
    playbackUrl: await createAliyunRdsServiceRecordOssSignedGetUrl(segment.storage_path),
  }
}
