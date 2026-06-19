import "server-only"

import type { MpAccountContext } from "@/lib/mp/account-context.server"
import type { VoiceCoachSessionCreateInput } from "@/lib/voice-coach/session-context"
import {
  getTrainingTask,
  listKnowledgeSpaces,
  resolveActiveKnowledgeSpace,
  resolveTrainingPack,
} from "@/lib/voice-coach/training.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

type RequestSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>

function cleanText(value: unknown, max = 300): string {
  const text = String(value || "").trim()
  if (!text) return ""
  return text.length > max ? text.slice(0, max) : text
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function mergeVoiceCoachTrainingContext(
  base: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> | null {
  const merged = {
    ...normalizeObject(base),
    ...extra,
  }
  const compact = Object.entries(merged).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0
    if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0
    return cleanText(value, 500) !== ""
  })
  return compact.length ? Object.fromEntries(compact) : null
}

export async function resolveVoiceCoachTrainingContextForSession(args: {
  supabase: RequestSupabaseClient
  accountContext: MpAccountContext | null
  parsedData: VoiceCoachSessionCreateInput
}): Promise<Record<string, unknown> | null> {
  const payloadContext = normalizeObject(args.parsedData.training_context)
  const preview = normalizeObject(args.parsedData.training_task_preview)
  const requestedTaskId = cleanText(
    args.parsedData.training_task_id || payloadContext.task_id || payloadContext.training_task_id,
    160,
  )
  const requestedPackId = cleanText(
    args.parsedData.training_pack_id || payloadContext.pack_id || payloadContext.training_pack_id,
    160,
  )
  const requestedKnowledgeSpaceId = cleanText(
    args.parsedData.training_knowledge_space_id ||
      payloadContext.knowledge_space_id ||
      payloadContext.training_knowledge_space_id,
    160,
  )
  const requestedMode = cleanText(payloadContext.training_pack_mode || payloadContext.trainingPackMode, 80)

  let serverContext: Record<string, unknown> = {}
  if (requestedTaskId || requestedKnowledgeSpaceId || requestedMode) {
    try {
      const spaces = await listKnowledgeSpaces({
        supabase: args.supabase,
        ctx: args.accountContext,
        activeKnowledgeSpaceId: requestedKnowledgeSpaceId,
      })
      const space = resolveActiveKnowledgeSpace(spaces, requestedKnowledgeSpaceId, requestedMode)
      if (space) {
        const pack = await resolveTrainingPack({ supabase: args.supabase, space })
        const task = pack ? getTrainingTask(pack, requestedTaskId) : null
        serverContext =
          mergeVoiceCoachTrainingContext(task?.training_context || null, {
            task_id: task?.task_id || requestedTaskId,
            pack_id: pack?.pack_id || requestedPackId,
            brand_code: pack?.brand_code || args.parsedData.training_brand_code || "",
            knowledge_space_id: space.id || requestedKnowledgeSpaceId,
            knowledge_space_name: space.display_name || "",
            pack_title: pack?.title || "",
            training_pack_mode: pack?.training_pack_mode || requestedMode,
            title: task?.title || preview.title || "",
            focus: task?.focus || preview.focus || "",
            customer_line: task?.customer_line || preview.customer_line || "",
          }) || {}
      }
    } catch {
      serverContext = {}
    }
  }

  return mergeVoiceCoachTrainingContext(serverContext, {
    ...payloadContext,
    task_id: requestedTaskId || payloadContext.task_id || payloadContext.training_task_id || "",
    pack_id: requestedPackId || payloadContext.pack_id || payloadContext.training_pack_id || "",
    brand_code: args.parsedData.training_brand_code || payloadContext.brand_code || payloadContext.training_brand_code || "",
    knowledge_space_id:
      requestedKnowledgeSpaceId || payloadContext.knowledge_space_id || payloadContext.training_knowledge_space_id || "",
    title: payloadContext.title || payloadContext.task_title || preview.title || "",
    focus: payloadContext.focus || preview.focus || "",
    customer_line: payloadContext.customer_line || payloadContext.customerLine || preview.customer_line || "",
  })
}
