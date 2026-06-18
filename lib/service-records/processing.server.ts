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
  allowFallbackCompletion?: boolean
}

type DeepSeekMessage = {
  role: "system" | "user"
  content: string
}

function envText(...names: string[]) {
  for (const name of names) {
    const value = cleanText(process.env[name], 1000)
    if (value && value !== "your-api-key-here") return value
  }
  return ""
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function timestampMs(value: unknown) {
  const text = cleanText(value, 80)
  if (!text) return 0
  const time = Date.parse(text)
  return Number.isFinite(time) ? time : 0
}

function getServiceRecordDeepSeekKey() {
  return envText("SERVICE_RECORD_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY")
}

function getServiceRecordDeepSeekBaseUrl() {
  return envText("SERVICE_RECORD_DEEPSEEK_BASE_URL", "DEEPSEEK_BASE_URL") || "https://api.deepseek.com"
}

function getServiceRecordDeepSeekModel() {
  return envText("SERVICE_RECORD_DEEPSEEK_MODEL", "DEEPSEEK_MODEL") || "deepseek-v4-pro"
}

function deepSeekChatCompletionsUrl() {
  const baseUrl = getServiceRecordDeepSeekBaseUrl().replace(/\/$/, "")
  return baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`
}

function compactTranscriptForPrompt(text: string) {
  const limit = envNumber("SERVICE_RECORD_DEEPSEEK_TRANSCRIPT_CHARS", 60000, 2000, 80000)
  if (text.length <= limit) return text
  const head = Math.floor(limit * 0.6)
  const tail = limit - head
  return `${text.slice(0, head)}\n\n[中间转写过长，已截断]\n\n${text.slice(-tail)}`
}

function extractJsonObject(content: string) {
  const trimmed = String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) throw new Error("deepseek_json_missing")
  return JSON.parse(trimmed.slice(start, end + 1))
}

function listFrom(value: unknown, fallback: string[] = [], max = 8) {
  const items = Array.isArray(value)
    ? value.map((item) => cleanText(item, 140)).filter(Boolean)
    : []
  return items.length ? items.slice(0, max) : fallback
}

function recordFrom(value: unknown) {
  return isRecord(value) ? value : {}
}

function oneOf(value: unknown, allowed: string[], fallback: string) {
  const text = cleanText(value, 40)
  return allowed.includes(text) ? text : fallback
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value
  const text = cleanText(value, 20).toLowerCase()
  if (!text) return fallback
  if (["1", "true", "yes", "on"].includes(text)) return true
  if (["0", "false", "no", "off"].includes(text)) return false
  return fallback
}

function listRecordFrom<T>(value: unknown, mapper: (item: any, index: number) => T | null, fallback: T[] = [], max = 8) {
  const items = Array.isArray(value)
    ? value.map((item, index) => mapper(recordFrom(item), index)).filter(Boolean) as T[]
    : []
  return items.length ? items.slice(0, max) : fallback
}

function qualityWarningsFrom(segments: any[], counts: ReturnType<typeof statusCounts>, transcript: string) {
  const warnings: string[] = []
  if (!transcript) warnings.push("当前没有可用转写文本，结论仅能作为现场备注辅助。")
  if (counts.pending || counts.running) warnings.push("仍有录音片段在识别中，智能纪要会继续补齐。")
  if (counts.failed) warnings.push("存在识别失败片段，部分顾客表达可能缺失。")
  if (transcript && transcript.length < 80 && counts.total > 0) warnings.push("转写文本较短，建议结合现场情况复核。")
  if (segments.length === 1 && numberValue(segments[0]?.client_audio_seconds, 0) > 1800) {
    warnings.push("长录音只有一个片段，章节时间为系统估算。")
  }
  return Array.from(new Set(warnings)).slice(0, 5)
}

function asrQualityOf(segments: any[], counts: ReturnType<typeof statusCounts>, transcript: string) {
  if (!transcript || counts.done === 0) return "poor"
  if (counts.failed || counts.pending || counts.running || transcript.length < 160) return "partial"
  return "good"
}

function audioEvidenceFromSegments(segments: any[]) {
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

  return {
    saved: audioSegments.length > 0,
    status_label: audioSegments.length ? "原音已保存" : "原音待确认",
    playback_available: false,
    signed_url_required: true,
    segment_count: audioSegments.length,
    first_segment_id: audioSegments[0]?.id || "",
    segments: audioSegments.slice(0, 12),
  }
}

function buildDeepSeekMessages(session: any, segments: any[], markers: any[], counts: ReturnType<typeof statusCounts>): DeepSeekMessage[] {
  const transcript = compactTranscriptForPrompt(transcriptTextOf(segments))
  const customerName = snapshotName(session.customer_snapshot_json, "本位顾客")
  const projectName = snapshotName(session.scene_snapshot_json, "未命名项目")
  const markerText = markers.length
    ? markers.map((marker) => `- ${formatDuration(marker.offset_seconds)} ${markerLabel(marker)}`).join("\n")
    : "无"
  const segmentText = segments
    .map((segment) => `- 片段 ${segment.segment_index || "-"}: ${cleanText(segment.asr_status, 40) || "pending"}`)
    .join("\n")

  const system = [
    "你是美业门店的到店服务复盘助手，专门把服务录音转写整理成店员可执行的复盘结果。",
    "只输出严格 json object，不要输出 Markdown，不要解释，不要包裹代码块。",
    "json 字段必须符合这个结构：",
    "{",
    '  "employee_feedback": {',
    '    "summary": "一句话说明本轮服务结论",',
    '    "customer_concerns": ["顾客真实顾虑"],',
    '    "staff_highlights": ["员工做得好的地方"],',
    '    "next_follow_up": "下次跟进动作",',
    '    "coaching_tip": "一句话话术建议"',
    "  },",
    '  "manager_review": {',
    '    "conversation_summary": "店长视角复盘",',
    '    "deal_signals": ["成交信号"],',
    '    "professional_questions": ["专业问题"],',
    '    "manager_intervention": ["店长介入点"],',
    '    "staff_improvement": ["员工改进建议"],',
    '    "training_topics": ["后续训练主题"]',
    "  },",
    '  "operations": {',
    '    "customer_profile_suggestions": ["顾客档案补充建议"],',
    '    "knowledge_base_candidates": ["可沉淀到门店知识库的内容"],',
    '    "xhs_material_candidates": ["可匿名化做内容素材的角度"],',
    '    "quality_warnings": ["录音或识别质量提醒"]',
    "  }",
    "}",
    "要求：内容必须基于转写和标记；不要编造医疗疗效、价格承诺或不存在的顾客信息；每个数组最多 5 条。",
  ].join("\n")

  const user = [
    `顾客：${customerName}`,
    `项目：${projectName}`,
    `服务目标：${cleanText(session.objective, 300) || "到店服务沟通记录"}`,
    `录音时长：${formatDuration(session.audio_seconds)}`,
    `ASR 片段状态：${JSON.stringify(counts)}`,
    "片段列表：",
    segmentText || "无",
    "人工标记：",
    markerText,
    "转写内容：",
    transcript || "当前没有可用转写，请只基于人工标记和服务上下文给出谨慎复盘。",
  ].join("\n\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

function normalizeDeepSeekResult(value: unknown, fallbackEmployee: any, fallbackManager: any, fallbackOperations: any) {
  const root = recordFrom(value)
  const employee = recordFrom(root.employee_feedback)
  const manager = recordFrom(root.manager_review)
  const operations = recordFrom(root.operations)

  return {
    employee_feedback: {
      summary: cleanText(employee.summary, 500) || fallbackEmployee.summary,
      customer_concerns: listFrom(employee.customer_concerns, fallbackEmployee.customer_concerns),
      staff_highlights: listFrom(employee.staff_highlights, fallbackEmployee.staff_highlights),
      next_follow_up: cleanText(employee.next_follow_up, 500) || fallbackEmployee.next_follow_up,
      coaching_tip: cleanText(employee.coaching_tip, 500) || fallbackEmployee.coaching_tip,
    },
    manager_review: {
      conversation_summary: cleanText(manager.conversation_summary, 600) || fallbackManager.conversation_summary,
      deal_signals: listFrom(manager.deal_signals, fallbackManager.deal_signals),
      professional_questions: listFrom(manager.professional_questions, fallbackManager.professional_questions),
      manager_intervention: listFrom(manager.manager_intervention, fallbackManager.manager_intervention),
      staff_improvement: listFrom(manager.staff_improvement, fallbackManager.staff_improvement),
      training_topics: listFrom(manager.training_topics, fallbackManager.training_topics),
    },
    operations: {
      customer_profile_suggestions: listFrom(
        operations.customer_profile_suggestions,
        fallbackOperations.customer_profile_suggestions,
      ),
      knowledge_base_candidates: listFrom(operations.knowledge_base_candidates, fallbackOperations.knowledge_base_candidates),
      xhs_material_candidates: listFrom(operations.xhs_material_candidates, fallbackOperations.xhs_material_candidates),
      quality_warnings: listFrom(operations.quality_warnings, fallbackOperations.quality_warnings),
    },
  }
}

async function generateDeepSeekServiceRecordResult(
  session: any,
  segments: any[],
  markers: any[],
  counts: ReturnType<typeof statusCounts>,
  fallbackEmployee: any,
  fallbackManager: any,
  fallbackOperations: any,
) {
  const apiKey = getServiceRecordDeepSeekKey()
  if (!apiKey) return null

  const model = getServiceRecordDeepSeekModel()
  const timeoutMs = envNumber("SERVICE_RECORD_DEEPSEEK_TIMEOUT_MS", 15000, 3000, 60000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(deepSeekChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: buildDeepSeekMessages(session, segments, markers, counts),
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: envNumber("SERVICE_RECORD_DEEPSEEK_MAX_TOKENS", 1800, 800, 6000),
        stream: false,
      }),
      signal: controller.signal,
    })

    const json = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      const message = cleanText(json?.error?.message || json?.error || json?.message, 300) || `deepseek_http_${res.status}`
      throw new Error(message)
    }

    const content = cleanText(json?.choices?.[0]?.message?.content, 50000)
    const parsed = extractJsonObject(content)
    return {
      ...normalizeDeepSeekResult(parsed, fallbackEmployee, fallbackManager, fallbackOperations),
      meta: {
        provider: "deepseek",
        model,
        used: true,
      },
    }
  } catch (error: any) {
    return {
      employee_feedback: fallbackEmployee,
      manager_review: fallbackManager,
      operations: fallbackOperations,
      meta: {
        provider: "deepseek",
        model,
        used: false,
        error: cleanText(error?.name === "AbortError" ? "deepseek_timeout" : error?.message || "deepseek_failed", 300),
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildServiceMinutesV2Messages(
  session: any,
  segments: any[],
  markers: any[],
  counts: ReturnType<typeof statusCounts>,
): DeepSeekMessage[] {
  const customerName = snapshotName(session.customer_snapshot_json, "本位顾客")
  const projectName = snapshotName(session.scene_snapshot_json, "未命名项目")
  const transcript = transcriptTextOf(segments)
  const chunks = transcriptChunksOf(session, segments, 12)
  const markerText = markers.length
    ? markers.map((marker) => `- ${formatDuration(marker.offset_seconds)} ${markerLabel(marker)}`).join("\n")
    : "无"
  const chunkText = chunks.length
    ? chunks
      .map((chunk, index) => [
        `### chunk_${index + 1} ${chunk.time_label}`,
        `标题线索：${chunk.title}`,
        compactTranscriptForPrompt(chunk.text),
      ].join("\n"))
      .join("\n\n")
    : "当前没有可用转写。"

  const system = [
    "你是美业门店的服务复盘助手，负责把到店服务录音整理为“美业门店智能纪要”。",
    "只输出严格 JSON object，不要 Markdown，不要解释，不要包裹代码块。",
    "你不是医疗诊断助手。不要编造顾客事实、价格、疗效、成交结果或护理效果；不要使用保证性表达。",
    "正式/基础纪要不能只是转写摘录或流水账，必须把可用转写整理成：顾客真实关注、员工下一句怎么说、店长今日动作、可复核原话证据。",
    "如果转写中有真实服务沟通，至少输出 1 条 customer_concerns 或 1 条 todos；如果没有明确销售机会或风险，可以留空，但要说明下次先补问什么。",
    "不要把“录音已保存/请复核转写”当成正式纪要结论；那只允许出现在 transcript_only 模式。",
    "如果转写像测试语音、随机内容、噪音、断裂文本、游戏/闲聊/朗读内容或信息不足，recording.asr_quality 必须为 partial 或 poor，recording.can_generate_business_minutes 必须为 false，recording.business_minutes_mode 必须为 transcript_only。",
    "证据摘录必须来自转写原文，单条不超过 60 个中文字符；没有证据就留空或省略。",
    "输出字段必须符合：",
    "{",
    '  "version": "service_minutes_v2",',
    '  "title": "本轮服务智能纪要",',
    '  "recording": { "theme": "", "started_at": "", "ended_at": "", "duration_seconds": 0, "segment_count": 0, "asr_quality": "good|partial|poor", "quality_warnings": [], "can_generate_business_minutes": true, "business_minutes_mode": "formal|basic|transcript_only", "quality_reason": "" },',
    '  "executive_summary": { "one_line": "", "service_outcome": "", "customer_state": "", "staff_state": "" },',
    '  "todos": [{ "owner": "manager|staff|ops", "priority": "high|normal|low", "title": "", "detail": "", "due_hint": "", "evidence": "" }],',
    '  "customer_concerns": [{ "concern": "", "evidence": "", "follow_up_angle": "" }],',
    '  "sales_opportunities": [{ "type": "project_conversion|renewal|upgrade|follow_up|manager_intervention", "signal": "", "evidence": "", "suggested_offer": "", "priority": "high|normal|low", "owner": "staff|manager", "due_hint": "", "confidence": "high|medium|low", "compliance_note": "" }],',
    '  "risk_warnings": [{ "type": "complaint|churn|professional|expectation|compliance|service_gap", "trigger": "", "evidence": "", "recommended_response": "", "manager_required": true }],',
    '  "staff_review": { "highlights": [], "misses": [], "missed_sales_signals": [], "coaching_tips": [], "next_script": "" },',
    '  "manager_brief": { "priority": "high|normal|low", "one_line": "", "opportunity_one_line": "", "risk_one_line": "", "conversion_opportunity": "", "main_risk": "", "recommended_owner": "manager|staff", "intervention_needed": false, "next_action": "", "training_topics": [] },',
    '  "customer_profile_update_suggestions": { "new_concerns": [], "new_preferences": [], "project_interests": [], "commitments": [], "follow_up_suggestions": [], "risk_notes": [] },',
    '  "smart_chapters": [{ "start_seconds": 0, "time_label": "00:00", "title": "", "summary": "", "signals": [] }],',
    '  "key_decisions": [{ "decision": "", "problem": "", "basis": "", "next_action": "" }],',
    '  "manager_review": { "summary": "", "deal_signals": [], "professional_questions": [], "intervention_points": [], "training_topics": [], "risk_warnings": [] },',
    '  "knowledge_assets": { "customer_profile_updates": [], "knowledge_base_candidates": [], "content_material_candidates": [] },',
    '  "voice_coach_payload": { "scenario": "", "customer_focus": [], "sales_opportunities": [], "staff_misses": [], "practice_goal": "", "opening_script": "" },',
    '  "evidence_timeline": [{ "time_label": "", "type": "concern|opportunity|risk|coaching", "quote": "", "related_card_id": "" }],',
    '  "quote_moments": [{ "quote": "", "why_it_matters": "", "time_label": "" }]',
    "}",
    "数组上限：todos 5；customer_concerns 6；sales_opportunities 5；risk_warnings 5；smart_chapters 10；key_decisions 5；quote_moments 5；evidence_timeline 12；其他数组最多 6。",
    "当 can_generate_business_minutes=false 或 business_minutes_mode=transcript_only 时：sales_opportunities 必须为空，customer_profile_update_suggestions 只保留 risk_notes 或 follow_up_suggestions，manager_brief.priority 用 low，结论只能提示先复核原音和转写。",
    "销售机会必须基于转写证据或顾客档案上下文，不能为了推项目而硬编；不确定时 confidence 用 low。",
    "risk_warnings 必须是店长能处理的风险，不要把普通质量提醒包装成投诉风险；没有顾客原话时 evidence 留空。",
    "顾客档案内容只能输出 customer_profile_update_suggestions，表示待确认建议，不能写成已更新事实。",
    "语言要求：使用门店员工和店长能直接执行的中文，不要出现后端字段名。",
  ].join("\n")

  const user = [
    `顾客：${customerName}`,
    `项目：${projectName}`,
    `服务目标：${cleanText(session.objective, 300) || "到店服务沟通记录"}`,
    `录音时长：${formatDuration(session.audio_seconds)}`,
    `ASR 片段状态：${JSON.stringify(counts)}`,
    `总转写字数：${transcript.length}`,
    "人工标记：",
    markerText,
    "分段转写或长录音切片：",
    chunkText,
  ].join("\n\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

async function generateDeepSeekServiceRecordV2Result(
  session: any,
  segments: any[],
  markers: any[],
  counts: ReturnType<typeof statusCounts>,
  fallbackServiceMinutesV2: any,
) {
  const apiKey = getServiceRecordDeepSeekKey()
  if (!apiKey) return null

  const model = getServiceRecordDeepSeekModel()
  const timeoutMs = envNumber("SERVICE_RECORD_DEEPSEEK_TIMEOUT_MS", 45000, 3000, 90000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const transcript = transcriptTextOf(segments)
  const chunkCount = transcriptChunksOf(session, segments, 12).length
  const isSegmented = chunkCount > 1 || numberValue(session.audio_seconds, 0) > 30 * 60

  try {
    const res = await fetch(deepSeekChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: buildServiceMinutesV2Messages(session, segments, markers, counts),
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: envNumber("SERVICE_RECORD_DEEPSEEK_MAX_TOKENS", 5000, 800, 8000),
        stream: false,
      }),
      signal: controller.signal,
    })

    const json = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      const message = cleanText(json?.error?.message || json?.error || json?.message, 300) || `deepseek_http_${res.status}`
      throw new Error(message)
    }

    const content = cleanText(json?.choices?.[0]?.message?.content, 100000)
    const parsed = extractJsonObject(content)
    const serviceMinutesV2 = normalizeServiceMinutesV2(parsed, fallbackServiceMinutesV2)
    return {
      service_minutes_v2: serviceMinutesV2,
      meta: {
        provider: "deepseek",
        model,
        used: true,
        source: isSegmented ? "service_record_deepseek_v2_segmented" : "service_record_deepseek_v2",
        chunk_count: chunkCount,
        transcript_chars: transcript.length,
      },
    }
  } catch (error: any) {
    const fallback = normalizeServiceMinutesV2({
      ...fallbackServiceMinutesV2,
      recording: {
        ...fallbackServiceMinutesV2.recording,
        quality_warnings: [
          ...fallbackServiceMinutesV2.recording.quality_warnings,
          "智能纪要模型调用失败，当前展示本地保守整理结果。",
        ],
      },
    }, fallbackServiceMinutesV2)
    return {
      service_minutes_v2: fallback,
      meta: {
        provider: "deepseek",
        model,
        used: false,
        source: "service_record_deepseek_v2_fallback",
        chunk_count: chunkCount,
        transcript_chars: transcript.length,
        error: cleanText(error?.name === "AbortError" ? "deepseek_timeout" : error?.message || "deepseek_failed", 300),
      },
    }
  } finally {
    clearTimeout(timer)
  }
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

function transcriptChunksOf(session: any, segments: any[], maxChunks = 10) {
  const totalSeconds = Math.max(0, numberValue(session.audio_seconds, 0))
  const transcriptSegments = segments
    .map((segment, index) => ({
      index: Number(segment.segment_index || index + 1),
      seconds: Math.max(0, numberValue(segment.client_audio_seconds, 0)),
      text: cleanText(segment.transcript_text, 100000),
    }))
    .filter((segment) => segment.text)

  if (!transcriptSegments.length) return []

  const chunks: Array<{ start_seconds: number; time_label: string; title: string; text: string }> = []
  let cursor = 0
  const onlyOneLongSegment = transcriptSegments.length === 1 && transcriptSegments[0].text.length > 1600

  for (const segment of transcriptSegments) {
    const segmentSeconds = segment.seconds || Math.round(totalSeconds / Math.max(1, transcriptSegments.length)) || 0
    if (onlyOneLongSegment) {
      const text = segment.text
      const chunkCount = Math.min(maxChunks, Math.max(2, Math.ceil(text.length / 1600)))
      const size = Math.ceil(text.length / chunkCount)
      for (let i = 0; i < chunkCount; i += 1) {
        const start = cursor + Math.round((segmentSeconds / chunkCount) * i)
        chunks.push({
          start_seconds: start,
          time_label: formatDuration(start),
          title: `录音片段 ${i + 1}`,
          text: text.slice(i * size, (i + 1) * size),
        })
      }
    } else {
      chunks.push({
        start_seconds: cursor,
        time_label: formatDuration(cursor),
        title: `片段 ${segment.index}`,
        text: segment.text,
      })
    }
    cursor += segmentSeconds
  }

  return chunks.slice(0, maxChunks)
}

function smartChaptersFromTranscript(session: any, segments: any[]) {
  const chunks = transcriptChunksOf(session, segments, 10)
  return chunks.map((chunk, index) => {
    const summary = cleanText(chunk.text.replace(/\s+/g, " "), 220)
    return {
      start_seconds: chunk.start_seconds,
      time_label: chunk.time_label,
      title: summary ? `${chunk.time_label} 服务沟通片段` : `服务沟通片段 ${index + 1}`,
      summary: summary || "本段录音已保存，等待转写补齐后可继续完善章节摘要。",
      signals: [],
    }
  })
}

function buildServiceMinutesV2Fallback(
  session: any,
  segments: any[],
  markers: any[],
  counts: ReturnType<typeof statusCounts>,
  employeeFeedback: any,
  managerReview: any,
  operations: any,
) {
  const transcript = transcriptTextOf(segments)
  const warnings = Array.from(new Set([
    ...qualityWarningsFrom(segments, counts, transcript),
    ...listFrom(operations.quality_warnings, [], 5),
  ])).slice(0, 5)
  const customerName = snapshotName(session.customer_snapshot_json, "本位顾客")
  const projectName = snapshotName(session.scene_snapshot_json, "未命名项目")
  const hasTranscript = Boolean(transcript)
  const todos = [
    {
      owner: "staff",
      priority: hasTranscript ? "normal" : "low",
      title: cleanText(employeeFeedback.next_follow_up, 120) || "下次沟通前先查看顾客关注点",
      detail: cleanText(employeeFeedback.coaching_tip, 240) || "先接住顾客顾虑，再补项目依据，最后给出轻量下一步。",
      due_hint: "下次服务前",
    },
  ]
  if (session.customer_profile_id) {
    todos.push({
      owner: "manager",
      priority: "normal",
      title: "复核顾客档案补充点",
      detail: listFrom(operations.customer_profile_suggestions, ["结合本轮顾客关注点补充档案。"], 1)[0],
      due_hint: "服务复盘后",
    })
  }
  const fallbackSalesSignals = Array.from(new Set([
    ...listFrom(managerReview.deal_signals, [], 6),
    ...listFrom(markers.filter((marker) => marker.marker_type === "deal_signal").map((marker) => marker.label), [], 6),
  ])).slice(0, 5)
  const audioEvidence = audioEvidenceFromSegments(segments)
  const customerProfileSuggestions = listFrom(operations.customer_profile_suggestions, [], 6)
  const managerTrainingTopics = listFrom(managerReview.training_topics, [], 5)
  const managerInterventions = listFrom(managerReview.manager_intervention, [], 5)
  const canGenerateBusinessMinutes = hasTranscript && counts.done > 0 && transcript.length >= 160
  const businessMinutesMode = canGenerateBusinessMinutes
    ? (session.customer_profile_id || session.scene_card_id ? "formal" : "basic")
    : "transcript_only"
  const qualityReason = canGenerateBusinessMinutes
    ? "录音转写已具备基础复盘条件。"
    : (warnings[0] || "转写信息不足，暂不适合生成正式经营纪要。")

  const fallback = {
    version: "service_minutes_v2",
    title: "本轮服务智能纪要",
    recording: {
      theme: cleanText(session.objective, 160) || `${customerName} · ${projectName}`,
      started_at: session.started_at || null,
      ended_at: session.ended_at || null,
      duration_seconds: Math.max(0, Math.round(numberValue(session.audio_seconds, 0))),
      segment_count: counts.total,
      asr_quality: asrQualityOf(segments, counts, transcript),
      quality_warnings: warnings,
      can_generate_business_minutes: canGenerateBusinessMinutes,
      business_minutes_mode: businessMinutesMode,
      quality_reason: qualityReason,
      audio_saved: audioEvidence.saved,
      playback_available: audioEvidence.playback_available,
      signed_url_required: audioEvidence.signed_url_required,
      audio_evidence: audioEvidence,
    },
    executive_summary: {
      one_line: cleanText(employeeFeedback.summary, 500) || "本轮服务反馈还在整理中。",
      service_outcome: cleanText(managerReview.conversation_summary, 500) || cleanText(employeeFeedback.summary, 500) || "本轮服务记录已保存。",
      customer_state: listFrom(employeeFeedback.customer_concerns, ["等待系统继续识别顾客关注点。"], 1)[0],
      staff_state: listFrom(employeeFeedback.staff_highlights, ["本轮沟通已记录，可结合转写复盘亮点。"], 1)[0],
    },
    todos,
    customer_concerns: listFrom(employeeFeedback.customer_concerns, ["等待系统继续识别顾客关注点。"], 6).map((concern) => ({
      concern,
      evidence: "",
      follow_up_angle: "下次沟通先确认这个关注点，再补充项目依据。",
    })),
    sales_opportunities: fallbackSalesSignals.map((signal) => ({
      type: "follow_up",
      signal,
      evidence: "",
      suggested_offer: "下次沟通先确认顾客真实顾虑，再给一个低压力下一步。",
      priority: "normal",
      owner: "staff",
      due_hint: "下次服务前",
      confidence: "low",
      compliance_note: "仅作为沟通提醒，不承诺护理效果。",
    })),
    risk_warnings: warnings.map((warning) => ({
      type: "service_gap",
      trigger: warning,
      evidence: "",
      recommended_response: "先复核原始转写和现场备注，再决定是否需要店长介入。",
      manager_required: true,
    })).slice(0, 5),
    staff_review: {
      highlights: listFrom(employeeFeedback.staff_highlights, ["本轮沟通已记录，可结合转写复盘亮点。"], 5),
      misses: listFrom(managerReview.staff_improvement, [], 5),
      missed_sales_signals: fallbackSalesSignals,
      coaching_tips: [cleanText(employeeFeedback.coaching_tip, 240)].filter(Boolean),
      next_script: cleanText(employeeFeedback.coaching_tip, 300) || "先接住顾客顾虑，再补项目依据，最后给出轻量下一步。",
    },
    manager_brief: {
      priority: fallbackSalesSignals.length || warnings.length ? "normal" : "low",
      one_line: cleanText(managerReview.conversation_summary, 300) || cleanText(employeeFeedback.summary, 300) || "本轮服务记录已保存，等待店长复盘。",
      opportunity_one_line: fallbackSalesSignals[0] || "",
      risk_one_line: warnings[0] || "",
      conversion_opportunity: fallbackSalesSignals[0] || "",
      main_risk: warnings[0] || "",
      recommended_owner: fallbackSalesSignals.length ? "staff" : "manager",
      intervention_needed: warnings.length > 0,
      next_action: cleanText(employeeFeedback.next_follow_up, 240) || managerInterventions[0] || "复核本轮服务记录并确认下次跟进动作。",
      training_topics: managerTrainingTopics,
    },
    customer_profile_update_suggestions: {
      new_concerns: listFrom(employeeFeedback.customer_concerns, [], 4),
      new_preferences: [],
      project_interests: fallbackSalesSignals,
      commitments: [],
      follow_up_suggestions: customerProfileSuggestions,
      risk_notes: warnings,
    },
    smart_chapters: smartChaptersFromTranscript(session, segments),
    key_decisions: cleanText(employeeFeedback.next_follow_up, 300)
      ? [{
        decision: cleanText(employeeFeedback.next_follow_up, 240),
        problem: listFrom(employeeFeedback.customer_concerns, ["顾客关注点待复核。"], 1)[0],
        basis: hasTranscript ? "基于本轮转写内容和服务标记整理。" : "基于当前服务记录状态整理，等待转写补齐。",
        next_action: cleanText(employeeFeedback.next_follow_up, 240),
      }]
      : [],
    manager_review: {
      summary: cleanText(managerReview.conversation_summary, 600) || "店长复盘还在整理中。",
      deal_signals: listFrom(managerReview.deal_signals, [], 6),
      professional_questions: listFrom(managerReview.professional_questions, [], 6),
      intervention_points: listFrom(managerReview.manager_intervention, [], 5),
      training_topics: listFrom(managerReview.training_topics, [], 5),
      risk_warnings: warnings,
    },
    knowledge_assets: {
      customer_profile_updates: listFrom(operations.customer_profile_suggestions, [], 6),
      knowledge_base_candidates: listFrom(operations.knowledge_base_candidates, [], 6),
      content_material_candidates: listFrom(operations.xhs_material_candidates, [], 6),
    },
    audio_evidence: audioEvidence,
    voice_coach_payload: {
      scenario: `${customerName} · ${projectName}`,
      customer_focus: listFrom(employeeFeedback.customer_concerns, [], 5),
      sales_opportunities: fallbackSalesSignals,
      staff_misses: listFrom(managerReview.staff_improvement, [], 5),
      practice_goal: cleanText(employeeFeedback.next_follow_up, 240) || "练习先接住顾客顾虑，再推进低压力下一步。",
      opening_script: cleanText(employeeFeedback.coaching_tip, 240) || "先接住顾客顾虑，再补项目依据。",
    },
    evidence_timeline: [],
    quote_moments: [],
  }

  return enforceBusinessQualityGate(fallback)
}

function markServiceMinutesV2PendingSmartReview(minutes: any, reason: string) {
  const recording = recordFrom(minutes.recording)
  const pendingReason = cleanText(reason, 240) || "智能整理仍在重试，当前不是最终服务纪要。"
  const warnings = Array.from(new Set([
    ...listFrom(recording.quality_warnings, [], 5),
    pendingReason,
  ])).slice(0, 5)
  return enforceBusinessQualityGate({
    ...minutes,
    recording: {
      ...recording,
      asr_quality: oneOf(recording.asr_quality, ["good", "partial", "poor"], "partial"),
      quality_warnings: warnings,
      can_generate_business_minutes: false,
      business_minutes_mode: "transcript_only",
      quality_reason: pendingReason,
    },
    executive_summary: {
      ...recordFrom(minutes.executive_summary),
      one_line: "智能整理仍在进行，请稍后刷新。",
      service_outcome: "原音和转写已保存，系统正在重试生成服务纪要。",
      customer_state: "等待智能整理完成后确认顾客关注。",
      staff_state: "等待智能整理完成后再进入员工复盘。",
    },
    todos: [{
      owner: "ops",
      priority: "normal",
      title: "等待智能整理完成",
      detail: pendingReason,
      due_hint: "稍后自动重试",
      evidence: "",
    }],
    sales_opportunities: [],
    risk_warnings: [],
    staff_review: {
      ...recordFrom(minutes.staff_review),
      misses: [],
      missed_sales_signals: [],
      coaching_tips: [],
      next_script: "",
    },
    manager_brief: {
      ...recordFrom(minutes.manager_brief),
      priority: "low",
      one_line: "智能整理仍在重试，当前先不要作为最终复盘。",
      opportunity_one_line: "",
      risk_one_line: pendingReason,
      recommended_owner: "manager",
      intervention_needed: false,
      next_action: "稍后刷新，等待智能整理完成。",
      training_topics: [],
    },
    customer_profile_update_suggestions: {
      new_concerns: [],
      new_preferences: [],
      project_interests: [],
      commitments: [],
      follow_up_suggestions: ["等待智能整理完成后，再决定是否补充顾客档案。"],
      risk_notes: warnings,
    },
    voice_coach_payload: {
      scenario: "",
      customer_focus: [],
      sales_opportunities: [],
      staff_misses: [],
      practice_goal: "等待智能整理完成后再进入训练。",
      opening_script: "",
    },
  })
}

function normalizeTodo(value: any, index: number) {
  const title = cleanText(value.title, 120)
  const detail = cleanText(value.detail, 240)
  if (!title && !detail) return null
  return {
    owner: oneOf(value.owner, ["manager", "staff", "ops"], index === 0 ? "staff" : "manager"),
    priority: oneOf(value.priority, ["high", "normal", "low"], "normal"),
    title: title || detail,
    detail,
    due_hint: cleanText(value.due_hint, 80),
    evidence: cleanText(value.evidence, 80),
  }
}

function normalizeConcern(value: any) {
  const concern = cleanText(value.concern, 160)
  if (!concern) return null
  return {
    concern,
    evidence: cleanText(value.evidence, 80),
    follow_up_angle: cleanText(value.follow_up_angle, 180),
  }
}

function normalizeSalesOpportunity(value: any) {
  const signal = cleanText(value.signal || value.evidence || value.suggested_offer || value.next_action, 180)
  if (!signal) return null
  return {
    type: oneOf(value.type, ["project_conversion", "renewal", "upgrade", "follow_up", "manager_intervention"], "follow_up"),
    signal,
    evidence: cleanText(value.evidence, 80),
    suggested_offer: cleanText(value.suggested_offer || value.next_action, 240),
    priority: oneOf(value.priority, ["high", "normal", "low"], "normal"),
    owner: oneOf(value.owner, ["staff", "manager"], "staff"),
    due_hint: cleanText(value.due_hint, 80),
    confidence: oneOf(value.confidence, ["high", "medium", "low"], "low"),
    compliance_note: cleanText(value.compliance_note, 160) || "仅作为沟通建议，不承诺护理效果。",
  }
}

function normalizeRiskWarning(value: any, index: number) {
  const trigger = cleanText(value.trigger || value.evidence || value.recommended_response, 180)
  if (!trigger) return null
  return {
    id: cleanText(value.id, 80) || `risk-${index + 1}`,
    type: oneOf(value.type, ["complaint", "churn", "professional", "expectation", "compliance", "service_gap"], "service_gap"),
    trigger,
    evidence: cleanText(value.evidence, 80),
    recommended_response: cleanText(value.recommended_response, 220) || "先复核原始对话后确定处理口径。",
    manager_required: booleanValue(value.manager_required, true),
  }
}

function normalizeManagerBrief(value: unknown, fallback: any) {
  const brief = recordFrom(value)
  const opportunity = cleanText(brief.opportunity_one_line, 240)
    || cleanText(brief.conversion_opportunity, 240)
    || fallback.opportunity_one_line
    || fallback.conversion_opportunity
    || ""
  const risk = cleanText(brief.risk_one_line, 240)
    || cleanText(brief.main_risk, 240)
    || fallback.risk_one_line
    || fallback.main_risk
    || ""
  return {
    priority: oneOf(brief.priority, ["high", "normal", "low"], fallback.priority || "normal"),
    one_line: cleanText(brief.one_line, 300) || fallback.one_line || "",
    opportunity_one_line: opportunity,
    risk_one_line: risk,
    conversion_opportunity: opportunity,
    main_risk: risk,
    recommended_owner: oneOf(brief.recommended_owner, ["manager", "staff"], fallback.recommended_owner || "manager"),
    intervention_needed: booleanValue(brief.intervention_needed, Boolean(fallback.intervention_needed)),
    next_action: cleanText(brief.next_action, 240) || fallback.next_action || "",
    training_topics: listFrom(brief.training_topics, fallback.training_topics || [], 5),
  }
}

function normalizeProfileUpdateSuggestions(value: unknown, fallback: any) {
  const suggestions = recordFrom(value)
  return {
    new_concerns: listFrom(suggestions.new_concerns, fallback.new_concerns || [], 6),
    new_preferences: listFrom(suggestions.new_preferences, fallback.new_preferences || [], 6),
    project_interests: listFrom(suggestions.project_interests, fallback.project_interests || [], 6),
    commitments: listFrom(suggestions.commitments, fallback.commitments || [], 6),
    follow_up_suggestions: listFrom(suggestions.follow_up_suggestions, fallback.follow_up_suggestions || [], 6),
    risk_notes: listFrom(suggestions.risk_notes, fallback.risk_notes || [], 6),
  }
}

function normalizeChapter(value: any, index: number) {
  const summary = cleanText(value.summary, 260)
  const title = cleanText(value.title, 120)
  if (!title && !summary) return null
  const startSeconds = Math.max(0, Math.round(numberValue(value.start_seconds, 0)))
  return {
    start_seconds: startSeconds,
    time_label: cleanText(value.time_label, 40) || formatDuration(startSeconds),
    title: title || `服务沟通片段 ${index + 1}`,
    summary: summary || "本段摘要待补充。",
    signals: listFrom(value.signals, [], 5),
  }
}

function normalizeDecision(value: any) {
  const decision = cleanText(value.decision, 180)
  if (!decision) return null
  return {
    decision,
    problem: cleanText(value.problem, 220),
    basis: cleanText(value.basis, 260),
    next_action: cleanText(value.next_action, 180),
  }
}

function normalizeQuote(value: any) {
  const quote = cleanText(value.quote, 80)
  if (!quote) return null
  return {
    quote,
    why_it_matters: cleanText(value.why_it_matters, 180),
    time_label: cleanText(value.time_label, 40),
  }
}

function normalizeVoiceCoachPayload(value: unknown, fallback: any) {
  const payload = recordFrom(value)
  return {
    scenario: cleanText(payload.scenario, 120) || fallback.scenario || "",
    customer_focus: listFrom(payload.customer_focus, fallback.customer_focus || [], 6),
    sales_opportunities: listFrom(payload.sales_opportunities, fallback.sales_opportunities || [], 6),
    staff_misses: listFrom(payload.staff_misses, fallback.staff_misses || [], 6),
    practice_goal: cleanText(payload.practice_goal, 240) || fallback.practice_goal || "",
    opening_script: cleanText(payload.opening_script, 300) || fallback.opening_script || "",
  }
}

function normalizeEvidenceTimelineItem(value: any, index: number) {
  const quote = cleanText(value.quote, 80)
  const type = oneOf(value.type, ["concern", "opportunity", "risk", "coaching"], "concern")
  if (!quote && !cleanText(value.related_card_id, 80)) return null
  return {
    id: cleanText(value.id, 80) || `evidence-${index + 1}`,
    time_label: cleanText(value.time_label, 40),
    type,
    quote,
    related_card_id: cleanText(value.related_card_id, 80),
  }
}

function enforceBusinessQualityGate(minutes: any) {
  const recording = recordFrom(minutes.recording)
  const canGenerate = booleanValue(recording.can_generate_business_minutes, true)
  const mode = oneOf(recording.business_minutes_mode, ["formal", "basic", "transcript_only"], "basic")
  const asrQuality = oneOf(recording.asr_quality, ["good", "partial", "poor"], "partial")
  if (canGenerate && mode !== "transcript_only" && asrQuality !== "poor") return minutes

  const reason = cleanText(recording.quality_reason, 240)
    || listFrom(recording.quality_warnings, [], 1)[0]
    || "当前录音不适合生成正式经营纪要。"
  const warnings = Array.from(new Set([
    ...listFrom(recording.quality_warnings, [], 5),
    reason,
  ])).slice(0, 5)

  return {
    ...minutes,
    recording: {
      ...minutes.recording,
      asr_quality: asrQuality === "good" ? "partial" : asrQuality,
      can_generate_business_minutes: false,
      business_minutes_mode: "transcript_only",
      quality_reason: reason,
      quality_warnings: warnings,
    },
    executive_summary: {
      ...minutes.executive_summary,
      one_line: reason,
      service_outcome: "当前只建议复核原音和转写，不生成销售机会或员工评价。",
    },
    todos: [{
      owner: "manager",
      priority: "low",
      title: "先复核原音和转写",
      detail: reason,
      due_hint: "复盘前",
      evidence: "",
    }],
    sales_opportunities: [],
    risk_warnings: [],
    manager_brief: {
      ...minutes.manager_brief,
      priority: "low",
      opportunity_one_line: "",
      conversion_opportunity: "",
      risk_one_line: reason,
      main_risk: reason,
      recommended_owner: "manager",
      intervention_needed: false,
      next_action: "先复核原音和转写，再决定是否进入员工复盘或店长跟进。",
    },
    customer_profile_update_suggestions: {
      new_concerns: [],
      new_preferences: [],
      project_interests: [],
      commitments: [],
      follow_up_suggestions: [],
      risk_notes: warnings,
    },
    staff_review: {
      ...minutes.staff_review,
      misses: [],
      missed_sales_signals: [],
      coaching_tips: [],
      next_script: "",
    },
    manager_review: {
      ...minutes.manager_review,
      deal_signals: [],
      risk_warnings: warnings,
    },
    knowledge_assets: {
      ...minutes.knowledge_assets,
      customer_profile_updates: [],
    },
    voice_coach_payload: {
      ...minutes.voice_coach_payload,
      customer_focus: [],
      sales_opportunities: [],
      staff_misses: [],
      practice_goal: "先复核原音和转写，再决定是否进入正式训练。",
      opening_script: "",
    },
  }
}

function normalizeServiceMinutesV2(value: unknown, fallback: any) {
  const root = recordFrom(recordFrom(value).service_minutes_v2 || value)
  const recording = recordFrom(root.recording)
  const summary = recordFrom(root.executive_summary)
  const staffReview = recordFrom(root.staff_review)
  const manager = recordFrom(root.manager_review)
  const assets = recordFrom(root.knowledge_assets)
  const fallbackAudioEvidence = recordFrom(fallback.audio_evidence || fallback.recording?.audio_evidence)
  const audioEvidence = {
    ...fallbackAudioEvidence,
    ...recordFrom(root.audio_evidence),
    ...recordFrom(recording.audio_evidence),
  }

  const normalized = {
    version: "service_minutes_v2",
    title: cleanText(root.title, 80) || fallback.title,
    recording: {
      theme: cleanText(recording.theme, 160) || fallback.recording.theme,
      started_at: cleanText(recording.started_at, 80) || fallback.recording.started_at,
      ended_at: cleanText(recording.ended_at, 80) || fallback.recording.ended_at,
      duration_seconds: Math.max(0, Math.round(numberValue(recording.duration_seconds, fallback.recording.duration_seconds))),
      segment_count: Math.max(0, Math.round(numberValue(recording.segment_count, fallback.recording.segment_count))),
      asr_quality: oneOf(recording.asr_quality, ["good", "partial", "poor"], fallback.recording.asr_quality),
      quality_warnings: listFrom(recording.quality_warnings, fallback.recording.quality_warnings, 5),
      can_generate_business_minutes: booleanValue(recording.can_generate_business_minutes, Boolean(fallback.recording.can_generate_business_minutes)),
      business_minutes_mode: oneOf(recording.business_minutes_mode, ["formal", "basic", "transcript_only"], fallback.recording.business_minutes_mode || "basic"),
      quality_reason: cleanText(recording.quality_reason, 240) || fallback.recording.quality_reason || "",
      audio_saved: booleanValue(recording.audio_saved, Boolean(fallback.recording.audio_saved)),
      playback_available: booleanValue(recording.playback_available, Boolean(fallback.recording.playback_available)),
      signed_url_required: booleanValue(recording.signed_url_required, Boolean(fallback.recording.signed_url_required ?? true)),
      audio_evidence: {
        saved: booleanValue(audioEvidence.saved, Boolean(fallbackAudioEvidence.saved)),
        status_label: cleanText(audioEvidence.status_label, 80) || fallbackAudioEvidence.status_label || "",
        playback_available: booleanValue(audioEvidence.playback_available, Boolean(fallbackAudioEvidence.playback_available)),
        signed_url_required: booleanValue(audioEvidence.signed_url_required, Boolean(fallbackAudioEvidence.signed_url_required ?? true)),
        segment_count: Math.max(0, Math.round(numberValue(audioEvidence.segment_count, numberValue(fallbackAudioEvidence.segment_count, 0)))),
        first_segment_id: cleanText(audioEvidence.first_segment_id, 160) || fallbackAudioEvidence.first_segment_id || "",
        segments: Array.isArray(audioEvidence.segments) ? audioEvidence.segments.slice(0, 12) : (Array.isArray(fallbackAudioEvidence.segments) ? fallbackAudioEvidence.segments.slice(0, 12) : []),
      },
    },
    executive_summary: {
      one_line: cleanText(summary.one_line, 500) || fallback.executive_summary.one_line,
      service_outcome: cleanText(summary.service_outcome, 500) || fallback.executive_summary.service_outcome,
      customer_state: cleanText(summary.customer_state, 240) || fallback.executive_summary.customer_state,
      staff_state: cleanText(summary.staff_state, 240) || fallback.executive_summary.staff_state,
    },
    todos: listRecordFrom(root.todos, normalizeTodo, fallback.todos, 5),
    customer_concerns: listRecordFrom(root.customer_concerns, normalizeConcern, fallback.customer_concerns, 6),
    sales_opportunities: listRecordFrom(root.sales_opportunities, normalizeSalesOpportunity, fallback.sales_opportunities, 5),
    risk_warnings: listRecordFrom(root.risk_warnings, normalizeRiskWarning, fallback.risk_warnings || [], 5),
    staff_review: {
      highlights: listFrom(staffReview.highlights, fallback.staff_review.highlights, 5),
      misses: listFrom(staffReview.misses, fallback.staff_review.misses, 5),
      missed_sales_signals: listFrom(staffReview.missed_sales_signals, fallback.staff_review.missed_sales_signals, 5),
      coaching_tips: listFrom(staffReview.coaching_tips, fallback.staff_review.coaching_tips, 5),
      next_script: cleanText(staffReview.next_script, 400) || fallback.staff_review.next_script,
    },
    manager_brief: normalizeManagerBrief(root.manager_brief, fallback.manager_brief || {}),
    customer_profile_update_suggestions: normalizeProfileUpdateSuggestions(
      root.customer_profile_update_suggestions,
      fallback.customer_profile_update_suggestions || {},
    ),
    smart_chapters: listRecordFrom(root.smart_chapters, normalizeChapter, fallback.smart_chapters, 10),
    key_decisions: listRecordFrom(root.key_decisions, normalizeDecision, fallback.key_decisions, 5),
    manager_review: {
      summary: cleanText(manager.summary, 600) || fallback.manager_review.summary,
      deal_signals: listFrom(manager.deal_signals, fallback.manager_review.deal_signals, 6),
      professional_questions: listFrom(manager.professional_questions, fallback.manager_review.professional_questions, 6),
      intervention_points: listFrom(manager.intervention_points, fallback.manager_review.intervention_points, 5),
      training_topics: listFrom(manager.training_topics, fallback.manager_review.training_topics, 5),
      risk_warnings: listFrom(manager.risk_warnings, fallback.manager_review.risk_warnings, 5),
    },
    knowledge_assets: {
      customer_profile_updates: listFrom(assets.customer_profile_updates, fallback.knowledge_assets.customer_profile_updates, 6),
      knowledge_base_candidates: listFrom(assets.knowledge_base_candidates, fallback.knowledge_assets.knowledge_base_candidates, 6),
      content_material_candidates: listFrom(assets.content_material_candidates, fallback.knowledge_assets.content_material_candidates, 6),
    },
    audio_evidence: {
      saved: booleanValue(audioEvidence.saved, Boolean(fallbackAudioEvidence.saved)),
      status_label: cleanText(audioEvidence.status_label, 80) || fallbackAudioEvidence.status_label || "",
      playback_available: booleanValue(audioEvidence.playback_available, Boolean(fallbackAudioEvidence.playback_available)),
      signed_url_required: booleanValue(audioEvidence.signed_url_required, Boolean(fallbackAudioEvidence.signed_url_required ?? true)),
      segment_count: Math.max(0, Math.round(numberValue(audioEvidence.segment_count, numberValue(fallbackAudioEvidence.segment_count, 0)))),
      first_segment_id: cleanText(audioEvidence.first_segment_id, 160) || fallbackAudioEvidence.first_segment_id || "",
      segments: Array.isArray(audioEvidence.segments) ? audioEvidence.segments.slice(0, 12) : (Array.isArray(fallbackAudioEvidence.segments) ? fallbackAudioEvidence.segments.slice(0, 12) : []),
    },
    voice_coach_payload: normalizeVoiceCoachPayload(root.voice_coach_payload, fallback.voice_coach_payload || {}),
    evidence_timeline: listRecordFrom(root.evidence_timeline, normalizeEvidenceTimelineItem, fallback.evidence_timeline || [], 12),
    quote_moments: listRecordFrom(root.quote_moments, normalizeQuote, fallback.quote_moments, 5),
  }

  const warnings = Array.from(new Set([
    ...normalized.recording.quality_warnings,
    ...normalized.manager_review.risk_warnings,
  ])).slice(0, 5)
  normalized.recording.quality_warnings = warnings
  normalized.manager_review.risk_warnings = warnings
  return enforceBusinessQualityGate(normalized)
}

function deriveLegacyResultFromServiceMinutesV2(serviceMinutes: any, fallbackEmployee: any, fallbackManager: any, fallbackOperations: any) {
  const staffTodo = (serviceMinutes.todos || []).find((todo: any) => todo.owner === "staff") || serviceMinutes.todos?.[0] || {}
  const manager = serviceMinutes.manager_review || {}
  const assets = serviceMinutes.knowledge_assets || {}
  const salesSignals = listFrom((serviceMinutes.sales_opportunities || []).map((item: any) => item.signal), [], 6)
  const missedSalesSignals = listFrom(serviceMinutes.staff_review?.missed_sales_signals, [], 5)
  const profileSuggestions = serviceMinutes.customer_profile_update_suggestions || {}
  const flattenedProfileSuggestions = [
    ...listFrom(profileSuggestions.new_concerns, [], 6),
    ...listFrom(profileSuggestions.new_preferences, [], 6),
    ...listFrom(profileSuggestions.project_interests, [], 6),
    ...listFrom(profileSuggestions.commitments, [], 6),
    ...listFrom(profileSuggestions.follow_up_suggestions, [], 6),
    ...listFrom(profileSuggestions.risk_notes, [], 6),
  ].slice(0, 8)
  return {
    employee_feedback: {
      summary: cleanText(serviceMinutes.executive_summary?.one_line, 500) || fallbackEmployee.summary,
      customer_concerns: listFrom(
        (serviceMinutes.customer_concerns || []).map((item: any) => item.concern),
        fallbackEmployee.customer_concerns,
      ),
      staff_highlights: listFrom(serviceMinutes.staff_review?.highlights, fallbackEmployee.staff_highlights),
      next_follow_up: cleanText(staffTodo.title || staffTodo.detail, 500) || fallbackEmployee.next_follow_up,
      coaching_tip: cleanText(serviceMinutes.staff_review?.next_script, 500)
        || listFrom(serviceMinutes.staff_review?.coaching_tips, [], 1)[0]
        || fallbackEmployee.coaching_tip,
    },
    manager_review: {
      conversation_summary: cleanText(manager.summary, 600) || cleanText(serviceMinutes.executive_summary?.service_outcome, 600) || fallbackManager.conversation_summary,
      deal_signals: listFrom(manager.deal_signals, salesSignals.length ? salesSignals : fallbackManager.deal_signals),
      professional_questions: listFrom(manager.professional_questions, fallbackManager.professional_questions),
      manager_intervention: listFrom(manager.intervention_points, fallbackManager.manager_intervention),
      staff_improvement: listFrom(
        [
          ...listFrom(serviceMinutes.staff_review?.misses, [], 5),
          ...missedSalesSignals.map((signal) => `未接住成交信号：${signal}`),
        ],
        fallbackManager.staff_improvement,
      ),
      training_topics: listFrom(serviceMinutes.manager_brief?.training_topics, listFrom(manager.training_topics, fallbackManager.training_topics)),
    },
    operations: {
      customer_profile_suggestions: listFrom(
        [
          ...flattenedProfileSuggestions,
          ...listFrom(assets.customer_profile_updates, [], 6),
        ],
        fallbackOperations.customer_profile_suggestions,
      ),
      knowledge_base_candidates: listFrom(assets.knowledge_base_candidates, fallbackOperations.knowledge_base_candidates),
      xhs_material_candidates: listFrom(assets.content_material_candidates, fallbackOperations.xhs_material_candidates),
      quality_warnings: listFrom(serviceMinutes.recording?.quality_warnings, fallbackOperations.quality_warnings),
    },
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
  if (!isBailianAsrConfigured()) {
    const { data } = await admin
      .from("service_record_segments")
      .update({
        asr_status: "failed",
        asr_json: {
          ...(isRecord(segment.asr_json) ? segment.asr_json : {}),
          provider: "bailian",
          error: "bailian_api_key_missing",
          failed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment.id)
      .select("*")
      .maybeSingle()
    return data || segment
  }
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
    const audioUrl = await createSignedAudioUrlForBailian({
      storagePath,
      storageBucket: segment.storage_bucket,
      metadata: isRecord(segment.metadata) ? segment.metadata : {},
    })
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
  const maxWaitMs = envNumber("SERVICE_RECORD_ASR_MAX_WAIT_MS", 30 * 60 * 1000, 60 * 1000, 12 * 60 * 60 * 1000)
  const nowMs = Date.now()
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
    const asrJson = isRecord(segment.asr_json) ? segment.asr_json : {}
    if (!isBailianAsrConfigured()) {
      const { data } = await admin
        .from("service_record_segments")
        .update({
          asr_status: "failed",
          asr_json: {
            ...asrJson,
            provider: cleanText(asrJson.provider, 40) || "bailian",
            task_id: taskId || null,
            error: "bailian_api_key_missing",
            failed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment.id)
        .select("*")
        .maybeSingle()
      if (data) updated.push(data)
      continue
    }
    const waitStartedAt =
      timestampMs(asrJson.submitted_at) ||
      timestampMs(segment.uploaded_at) ||
      timestampMs(segment.updated_at) ||
      0
    if (waitStartedAt && nowMs - waitStartedAt > maxWaitMs) {
      const { data } = await admin
        .from("service_record_segments")
        .update({
          asr_status: "failed",
          asr_json: {
            ...asrJson,
            provider: cleanText(asrJson.provider, 40) || "bailian",
            task_id: taskId || null,
            error: "asr_timeout",
            failed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment.id)
        .select("*")
        .maybeSingle()
      if (data) updated.push(data)
      continue
    }
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
  const transcript = transcriptTextOf(segments)
  let nextStatus = hasOpenAsr ? "processing" : "completed"
  const now = new Date().toISOString()
  const fallbackEmployeeFeedback = buildEmployeeFeedback(session, segments, markers, counts)
  const fallbackManagerReview = buildManagerReview(markers, counts)
  const fallbackOperations = buildOperations(session, counts)
  let serviceMinutesV2: any = buildServiceMinutesV2Fallback(
    session,
    segments,
    markers,
    counts,
    fallbackEmployeeFeedback,
    fallbackManagerReview,
    fallbackOperations,
  )
  let employeeFeedback = fallbackEmployeeFeedback
  let managerReview = fallbackManagerReview
  let operations = fallbackOperations
  let llm = {
    provider: getServiceRecordDeepSeekKey() ? "deepseek" : "local",
    model: getServiceRecordDeepSeekKey() ? getServiceRecordDeepSeekModel() : "",
    used: false,
    source: "service_record_processing_v1",
    chunk_count: transcriptChunksOf(session, segments, 12).length,
    transcript_chars: transcript.length,
    reason: hasOpenAsr ? "asr_still_open" : "deepseek_api_key_missing",
  }
  let smartMinutesPendingReason = ""

  if (!hasOpenAsr && (transcript || markers.length) && getServiceRecordDeepSeekKey()) {
    const deepSeekResult = await generateDeepSeekServiceRecordV2Result(
      session,
      segments,
      markers,
      counts,
      serviceMinutesV2,
    )
    if (deepSeekResult) {
      serviceMinutesV2 = deepSeekResult.service_minutes_v2
      const legacy = deriveLegacyResultFromServiceMinutesV2(
        serviceMinutesV2,
        fallbackEmployeeFeedback,
        fallbackManagerReview,
        fallbackOperations,
      )
      employeeFeedback = legacy.employee_feedback
      managerReview = legacy.manager_review
      operations = legacy.operations
      llm = {
        provider: deepSeekResult.meta.provider,
        model: deepSeekResult.meta.model,
        used: deepSeekResult.meta.used,
        source: deepSeekResult.meta.source,
        chunk_count: deepSeekResult.meta.chunk_count,
        transcript_chars: deepSeekResult.meta.transcript_chars,
        reason: deepSeekResult.meta.error || (deepSeekResult.meta.used ? "deepseek_completed" : "deepseek_fallback"),
      }
      if (!deepSeekResult.meta.used) {
        smartMinutesPendingReason = deepSeekResult.meta.error
          ? `智能整理失败，系统会继续重试：${deepSeekResult.meta.error}`
          : "智能整理未完成，系统会继续重试。"
      }
    }
  } else {
    const legacy = deriveLegacyResultFromServiceMinutesV2(
      serviceMinutesV2,
      fallbackEmployeeFeedback,
      fallbackManagerReview,
      fallbackOperations,
    )
    employeeFeedback = legacy.employee_feedback
    managerReview = legacy.manager_review
    operations = legacy.operations
  }

  if (smartMinutesPendingReason && !opts.allowFallbackCompletion) {
    nextStatus = "processing"
    serviceMinutesV2 = markServiceMinutesV2PendingSmartReview(serviceMinutesV2, smartMinutesPendingReason)
    const legacy = deriveLegacyResultFromServiceMinutesV2(
      serviceMinutesV2,
      fallbackEmployeeFeedback,
      fallbackManagerReview,
      fallbackOperations,
    )
    employeeFeedback = legacy.employee_feedback
    managerReview = legacy.manager_review
    operations = legacy.operations
    llm = {
      ...llm,
      used: false,
      reason: smartMinutesPendingReason,
    }
  }

  const noteMarkdown = buildServiceRecordNoteMarkdown(session, segments, markers, employeeFeedback)
  const resultJson = {
    source: llm.used ? llm.source : "service_record_processing_v1",
    generated_at: now,
    status: nextStatus,
    asr: counts,
    llm,
    marker_count: markers.length,
    has_note: Boolean(noteMarkdown),
    service_minutes_v2: serviceMinutesV2,
    employee_feedback: employeeFeedback,
    manager_review: managerReview,
    operations,
  }

  const { data, error } = await admin
    .from("service_record_sessions")
    .update({
      status: nextStatus,
      processing_started_at: session.processing_started_at || now,
      completed_at: nextStatus === "completed" ? now : null,
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
