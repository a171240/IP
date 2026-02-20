import "server-only"

import { NextRequest } from "next/server"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { getClientIp } from "@/lib/pricing/profile.server"
import type { DistributeRequestInput, DistributionPlatformId, DistributionTaskMode } from "@/lib/types/content-pipeline"

export const DISTRIBUTION_ERROR_CODES = [
  "platform_not_connected",
  "platform_api_denied",
  "assistant_fallback_required",
  "insufficient_credits",
  "plan_required",
] as const

export type DistributionErrorCode = (typeof DISTRIBUTION_ERROR_CODES)[number]
type RequestSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClientForRequest>>

type DistributionJobRow = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  content_id: string
  content_type: "rewrite" | "video"
  mode: "immediate" | "scheduled"
  schedule_at: string | null
  status: "queued" | "running" | "done" | "failed"
  error: string | null
}

type DistributionTaskRow = {
  id: string
  created_at: string
  updated_at: string
  job_id: string
  user_id: string
  platform: DistributionPlatformId
  mode: DistributionTaskMode
  status: "queued" | "submitted" | "done" | "failed"
  publish_url: string | null
  action_payload: Record<string, unknown> | null
  error: string | null
  retry_count: number | null
}

type PlatformConnectionRow = {
  platform: DistributionPlatformId
  status: "disconnected" | "connected" | "expired"
  account_id: string | null
  account_name: string | null
  access_token: string | null
  expires_at: string | null
  meta: Record<string, unknown> | null
}

type SubmitDistributionJobParams = {
  request: NextRequest
  supabase: RequestSupabaseClient
  userId: string
  input: DistributeRequestInput
}

type GetDistributionJobParams = {
  supabase: RequestSupabaseClient
  userId: string
  jobId: string
}

type DistributionTaskView = {
  id: string
  platform: DistributionPlatformId
  mode: DistributionTaskMode
  status: "queued" | "submitted" | "done" | "failed"
  publish_url: string | null
  action_payload: Record<string, unknown> | null
  error: string | null
  retry_count: number
  updated_at: string
}

type DistributionJobView = {
  id: string
  content_id: string
  content_type: "rewrite" | "video"
  mode: "immediate" | "scheduled"
  schedule_at: string | null
  status: "queued" | "running" | "done" | "failed"
  error: string | null
  created_at: string
  updated_at: string
}

type SubmitDistributionResult = {
  job: DistributionJobView
  tasks: DistributionTaskView[]
}

class DistributionError extends Error {
  readonly code: DistributionErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(opts: {
    code: DistributionErrorCode
    status: number
    message: string
    details?: Record<string, unknown>
  }) {
    super(opts.message)
    this.name = "DistributionError"
    this.code = opts.code
    this.status = opts.status
    this.details = opts.details
  }
}

function isDistributionErrorCode(value: unknown): value is DistributionErrorCode {
  return typeof value === "string" && DISTRIBUTION_ERROR_CODES.includes(value as DistributionErrorCode)
}

function dedupePlatforms(platforms: DistributionPlatformId[]) {
  return Array.from(new Set(platforms))
}

function formatShanghaiDateTime(date: Date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value
    return acc
  }, {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`
}

function normalizeScheduleAt(mode: "immediate" | "scheduled", scheduleAt: string | undefined) {
  if (mode === "immediate") return null

  const raw = String(scheduleAt || "").trim()
  if (!raw) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 400,
      message: "schedule_at required when mode=scheduled",
    })
  }

  const localWallClockMatch = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)(?:Z|[+-]\d{2}:\d{2})$/)
  if (localWallClockMatch) {
    const timeWithSecond = localWallClockMatch[2].includes(":")
      ? localWallClockMatch[2].split(".")[0]
      : `${localWallClockMatch[2]}:00`
    const normalizedTime = timeWithSecond.split(":").length === 2 ? `${timeWithSecond}:00` : timeWithSecond
    return `${localWallClockMatch[1]}T${normalizedTime}+08:00`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 400,
      message: "schedule_at invalid",
    })
  }
  return formatShanghaiDateTime(parsed)
}

function toObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
}

function readForcedCode(meta: Record<string, unknown>) {
  const forced = meta.force_error || meta.mock_error || meta.error_code
  if (isDistributionErrorCode(forced)) return forced
  return null
}

function summarizeTaskStatus(tasks: DistributionTaskRow[]) {
  if (!tasks.length) return "queued" as const
  if (tasks.some((task) => task.status === "failed")) return "failed" as const
  if (tasks.every((task) => task.status === "done")) return "done" as const
  if (tasks.some((task) => task.status === "submitted" || task.status === "done")) return "running" as const
  return "queued" as const
}

function mapTaskRow(task: DistributionTaskRow): DistributionTaskView {
  return {
    id: task.id,
    platform: task.platform,
    mode: task.mode,
    status: task.status,
    publish_url: task.publish_url || null,
    action_payload: toObject(task.action_payload),
    error: task.error || null,
    retry_count: Number(task.retry_count || 0),
    updated_at: task.updated_at,
  }
}

function mapJobRow(job: DistributionJobRow): DistributionJobView {
  return {
    id: job.id,
    content_id: job.content_id,
    content_type: job.content_type,
    mode: job.mode,
    schedule_at: job.schedule_at,
    status: job.status,
    error: job.error || null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  }
}

export function normalizeDistributionError(error: unknown): DistributionError {
  if (error instanceof DistributionError) return error
  if (error instanceof Error && isDistributionErrorCode((error as { code?: unknown }).code)) {
    return new DistributionError({
      code: (error as { code: DistributionErrorCode }).code,
      status: Number((error as { status?: unknown }).status || 500),
      message: error.message || "distribution_failed",
    })
  }

  return new DistributionError({
    code: "platform_api_denied",
    status: 500,
    message: error instanceof Error ? error.message : "distribution_failed",
  })
}

async function trackDistributionEvent(opts: {
  request: NextRequest
  event: string
  props?: Record<string, unknown>
}) {
  const { request, event, props } = opts
  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch {
    return
  }

  const ipAddress = getClientIp(request) || "unknown"
  const referrer = request.headers.get("referer") || request.headers.get("referrer")
  const userAgent = request.headers.get("user-agent")

  await admin.from("analytics_events").insert({
    event,
    path: "/mp/distribute",
    referrer,
    user_agent: userAgent,
    ip_address: ipAddress,
    props: props ?? null,
  })
}

async function resolveContentType(opts: {
  supabase: RequestSupabaseClient
  userId: string
  contentId: string
}): Promise<"rewrite" | "video"> {
  const { supabase, userId, contentId } = opts

  const { data: videoJob } = await supabase
    .from("video_render_jobs")
    .select("id")
    .eq("id", contentId)
    .eq("user_id", userId)
    .maybeSingle()
  if (videoJob?.id) return "video"

  const { data: rewrite } = await supabase
    .from("content_rewrites")
    .select("id")
    .eq("id", contentId)
    .eq("user_id", userId)
    .maybeSingle()
  if (rewrite?.id) return "rewrite"

  throw new DistributionError({
    code: "platform_api_denied",
    status: 400,
    message: "content_id_not_found",
    details: { content_id: contentId },
  })
}

async function ensureConnectedPlatforms(opts: {
  supabase: RequestSupabaseClient
  userId: string
  platforms: DistributionPlatformId[]
}): Promise<Map<DistributionPlatformId, PlatformConnectionRow>> {
  const { supabase, userId, platforms } = opts

  const { data, error } = await supabase
    .from("platform_connections")
    .select("platform, status, account_id, account_name, access_token, expires_at, meta")
    .eq("user_id", userId)
    .in("platform", platforms)

  if (error) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: error.message || "platform_connections_query_failed",
    })
  }

  const byPlatform = new Map<DistributionPlatformId, PlatformConnectionRow>()
  for (const row of (data || []) as PlatformConnectionRow[]) {
    byPlatform.set(row.platform, row)
  }

  const notConnected = platforms.filter((platform) => {
    const row = byPlatform.get(platform)
    if (!row) return true
    const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false
    return row.status !== "connected" || expired
  })

  if (notConnected.length) {
    throw new DistributionError({
      code: "platform_not_connected",
      status: 409,
      message: "platform_not_connected",
      details: { platforms: notConnected },
    })
  }

  return byPlatform
}

async function createDistributionJob(opts: {
  supabase: RequestSupabaseClient
  userId: string
  contentId: string
  contentType: "rewrite" | "video"
  mode: "immediate" | "scheduled"
  scheduleAt: string | null
}) {
  const now = new Date().toISOString()
  const { data, error } = await opts.supabase
    .from("distribution_jobs")
    .insert({
      user_id: opts.userId,
      content_id: opts.contentId,
      content_type: opts.contentType,
      mode: opts.mode,
      schedule_at: opts.scheduleAt,
      status: opts.mode === "scheduled" ? "queued" : "running",
      error: null,
      updated_at: now,
    })
    .select("*")
    .single()

  if (error || !data) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: error?.message || "distribution_job_insert_failed",
    })
  }

  return data as DistributionJobRow
}

async function createDistributionTasks(opts: {
  supabase: RequestSupabaseClient
  userId: string
  jobId: string
  contentId: string
  contentType: "rewrite" | "video"
  publishMode: "immediate" | "scheduled"
  scheduleAt: string | null
  platforms: DistributionPlatformId[]
}) {
  const now = new Date().toISOString()
  const rows = opts.platforms.map((platform) => ({
    user_id: opts.userId,
    job_id: opts.jobId,
    platform,
    mode: "api",
    status: "queued",
    publish_url: null,
    action_payload: {
      content_id: opts.contentId,
      content_type: opts.contentType,
      publish_mode: opts.publishMode,
      schedule_at: opts.scheduleAt,
      requested_at: now,
      route: "api",
    },
    error: null,
    retry_count: 0,
    updated_at: now,
  }))

  const { data, error } = await opts.supabase.from("distribution_tasks").insert(rows).select("*")
  if (error || !data) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: error?.message || "distribution_task_insert_failed",
    })
  }

  return (data as DistributionTaskRow[]).sort(
    (a, b) => opts.platforms.indexOf(a.platform) - opts.platforms.indexOf(b.platform)
  )
}

type DirectPublishResult =
  | {
      ok: true
      publishUrl: string
      actionPayload: Record<string, unknown>
    }
  | {
      ok: false
      code: DistributionErrorCode
      message: string
      actionPayload: Record<string, unknown>
    }

function attemptDirectPublish(opts: {
  task: DistributionTaskRow
  connection: PlatformConnectionRow
  scheduleAt: string | null
}): DirectPublishResult {
  const meta = toObject(opts.connection.meta)
  const forcedCode = readForcedCode(meta)
  if (forcedCode) {
    return {
      ok: false,
      code: forcedCode,
      message: String(meta.force_message || forcedCode),
      actionPayload: {
        route: "api",
        forced_code: forcedCode,
      },
    }
  }

  const apiEnabled = meta.api_enabled !== false
  const tokenReady = Boolean(opts.connection.access_token)

  if (!apiEnabled || !tokenReady) {
    return {
      ok: false,
      code: "platform_api_denied",
      message: "platform_api_denied",
      actionPayload: {
        route: "api",
        reason: !apiEnabled ? "api_disabled" : "access_token_missing",
      },
    }
  }

  if (meta.force_api_fail === true) {
    return {
      ok: false,
      code: "platform_api_denied",
      message: "platform_api_denied",
      actionPayload: {
        route: "api",
        reason: "force_api_fail",
      },
    }
  }

  const publishUrl =
    typeof meta.mock_publish_url === "string" && meta.mock_publish_url.trim()
      ? meta.mock_publish_url.trim()
      : `https://publish.ipgongchang.xin/${opts.task.platform}/${opts.task.job_id}`

  return {
    ok: true,
    publishUrl,
    actionPayload: {
      route: "api",
      provider: "native_direct_api",
      submitted_at: new Date().toISOString(),
      schedule_at: opts.scheduleAt,
      account_id: opts.connection.account_id || null,
      account_name: opts.connection.account_name || null,
    },
  }
}

type AssistantFallbackResult =
  | {
      ok: true
      actionPayload: Record<string, unknown>
    }
  | {
      ok: false
      code: DistributionErrorCode
      message: string
      actionPayload: Record<string, unknown>
    }

function attemptAssistantFallback(opts: {
  task: DistributionTaskRow
  connection: PlatformConnectionRow
  directErrorCode: DistributionErrorCode
  directErrorMessage: string
}): AssistantFallbackResult {
  const meta = toObject(opts.connection.meta)

  if (meta.assistant_enabled === false) {
    return {
      ok: false,
      code: "assistant_fallback_required" as const,
      message: "assistant_fallback_required",
      actionPayload: {
        route: "assistant",
        reason: "assistant_disabled",
        from: "api",
        from_error_code: opts.directErrorCode,
      },
    }
  }

  const forcedCode = readForcedCode({
    ...meta,
    force_error: meta.assistant_force_error || meta.force_error,
  })
  if (forcedCode) {
    return {
      ok: false,
      code: forcedCode,
      message: String(meta.assistant_force_message || meta.force_message || forcedCode),
      actionPayload: {
        route: "assistant",
        forced_code: forcedCode,
        from: "api",
        from_error_code: opts.directErrorCode,
      },
    }
  }

  const ticket =
    typeof meta.assistant_ticket_prefix === "string" && meta.assistant_ticket_prefix.trim()
      ? `${meta.assistant_ticket_prefix.trim()}_${opts.task.id.slice(0, 8)}`
      : `assistant_${opts.task.id.slice(0, 8)}`

  return {
    ok: true,
    actionPayload: {
      route: "assistant",
      from: "api",
      from_error_code: opts.directErrorCode,
      from_error_message: opts.directErrorMessage,
      assistant_ticket: ticket,
      submitted_at: new Date().toISOString(),
      next_action: "assistant_followup_required",
    },
  } as const
}

async function updateTaskRow(opts: {
  supabase: RequestSupabaseClient
  userId: string
  taskId: string
  patch: Record<string, unknown>
}) {
  const { data, error } = await opts.supabase
    .from("distribution_tasks")
    .update(opts.patch)
    .eq("id", opts.taskId)
    .eq("user_id", opts.userId)
    .select("*")
    .single()

  if (error || !data) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: error?.message || "distribution_task_update_failed",
    })
  }

  return data as DistributionTaskRow
}

async function updateJobRow(opts: {
  supabase: RequestSupabaseClient
  userId: string
  jobId: string
  patch: Record<string, unknown>
}) {
  const { data, error } = await opts.supabase
    .from("distribution_jobs")
    .update(opts.patch)
    .eq("id", opts.jobId)
    .eq("user_id", opts.userId)
    .select("*")
    .single()

  if (error || !data) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: error?.message || "distribution_job_update_failed",
    })
  }

  return data as DistributionJobRow
}

async function runImmediateDispatch(opts: {
  request: NextRequest
  supabase: RequestSupabaseClient
  userId: string
  job: DistributionJobRow
  tasks: DistributionTaskRow[]
  connections: Map<DistributionPlatformId, PlatformConnectionRow>
  scheduleAt: string | null
}) {
  const nextTasks: DistributionTaskRow[] = []
  for (const task of opts.tasks) {
    const connection = opts.connections.get(task.platform)
    if (!connection) {
      const failedTask = await updateTaskRow({
        supabase: opts.supabase,
        userId: opts.userId,
        taskId: task.id,
        patch: {
          mode: "assistant",
          status: "failed",
          error: "platform_not_connected",
          action_payload: {
            route: "assistant",
            reason: "platform_not_connected",
          },
          updated_at: new Date().toISOString(),
        },
      })
      nextTasks.push(failedTask)
      continue
    }

    const direct = attemptDirectPublish({ task, connection, scheduleAt: opts.scheduleAt })
    if (direct.ok) {
      const succeededTask = await updateTaskRow({
        supabase: opts.supabase,
        userId: opts.userId,
        taskId: task.id,
        patch: {
          mode: "api",
          status: "done",
          publish_url: direct.publishUrl,
          error: null,
          action_payload: direct.actionPayload,
          updated_at: new Date().toISOString(),
        },
      })
      nextTasks.push(succeededTask)
      continue
    }

    if (direct.code !== "platform_api_denied") {
      const failedTask = await updateTaskRow({
        supabase: opts.supabase,
        userId: opts.userId,
        taskId: task.id,
        patch: {
          mode: "api",
          status: "failed",
          publish_url: null,
          error: direct.code,
          action_payload: {
            ...direct.actionPayload,
            message: direct.message,
          },
          updated_at: new Date().toISOString(),
        },
      })
      nextTasks.push(failedTask)
      continue
    }

    const fallback = attemptAssistantFallback({
      task,
      connection,
      directErrorCode: direct.code,
      directErrorMessage: direct.message,
    })

    if (fallback.ok) {
      const fallbackTask = await updateTaskRow({
        supabase: opts.supabase,
        userId: opts.userId,
        taskId: task.id,
        patch: {
          mode: "assistant",
          status: "submitted",
          publish_url: null,
          error: null,
          action_payload: fallback.actionPayload,
          updated_at: new Date().toISOString(),
        },
      })

      await trackDistributionEvent({
        request: opts.request,
        event: "distribute_task_assistant_fallback",
        props: {
          job_id: opts.job.id,
          task_id: task.id,
          platform: task.platform,
          from_mode: "api",
          to_mode: "assistant",
        },
      })
      nextTasks.push(fallbackTask)
      continue
    }

    const failedTask = await updateTaskRow({
      supabase: opts.supabase,
      userId: opts.userId,
      taskId: task.id,
      patch: {
        mode: "assistant",
        status: "failed",
        publish_url: null,
        error: fallback.code,
        action_payload: fallback.actionPayload,
        updated_at: new Date().toISOString(),
      },
    })
    nextTasks.push(failedTask)
  }

  const summarizedStatus = summarizeTaskStatus(nextTasks)
  const firstTaskError = nextTasks.find((task) => task.status === "failed")?.error || null
  const updatedJob = await updateJobRow({
    supabase: opts.supabase,
    userId: opts.userId,
    jobId: opts.job.id,
    patch: {
      status: summarizedStatus,
      error: firstTaskError,
      updated_at: new Date().toISOString(),
    },
  })

  return {
    job: updatedJob,
    tasks: nextTasks,
  }
}

export async function submitDistributionJob(opts: SubmitDistributionJobParams): Promise<SubmitDistributionResult> {
  const platforms = dedupePlatforms(opts.input.platforms)
  const scheduleAt = normalizeScheduleAt(opts.input.mode, opts.input.schedule_at)

  const connections = await ensureConnectedPlatforms({
    supabase: opts.supabase,
    userId: opts.userId,
    platforms,
  })

  const contentType = await resolveContentType({
    supabase: opts.supabase,
    userId: opts.userId,
    contentId: opts.input.content_id,
  })

  const job = await createDistributionJob({
    supabase: opts.supabase,
    userId: opts.userId,
    contentId: opts.input.content_id,
    contentType,
    mode: opts.input.mode,
    scheduleAt,
  })

  const createdTasks = await createDistributionTasks({
    supabase: opts.supabase,
    userId: opts.userId,
    jobId: job.id,
    contentId: opts.input.content_id,
    contentType,
    publishMode: opts.input.mode,
    scheduleAt,
    platforms,
  })

  if (opts.input.mode === "scheduled") {
    return {
      job: mapJobRow(job),
      tasks: createdTasks.map(mapTaskRow),
    }
  }

  const processed = await runImmediateDispatch({
    request: opts.request,
    supabase: opts.supabase,
    userId: opts.userId,
    job,
    tasks: createdTasks,
    connections,
    scheduleAt,
  })

  return {
    job: mapJobRow(processed.job),
    tasks: processed.tasks.map(mapTaskRow),
  }
}

export async function getDistributionJob(opts: GetDistributionJobParams) {
  const { data: jobData, error: jobError } = await opts.supabase
    .from("distribution_jobs")
    .select("*")
    .eq("id", opts.jobId)
    .eq("user_id", opts.userId)
    .maybeSingle()

  if (jobError) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: jobError.message || "distribution_job_query_failed",
    })
  }
  if (!jobData) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 404,
      message: "job_not_found",
    })
  }

  const job = jobData as DistributionJobRow

  const { data: taskData, error: taskError } = await opts.supabase
    .from("distribution_tasks")
    .select("*")
    .eq("job_id", job.id)
    .eq("user_id", opts.userId)
    .order("created_at", { ascending: true })

  if (taskError) {
    throw new DistributionError({
      code: "platform_api_denied",
      status: 500,
      message: taskError.message || "distribution_tasks_query_failed",
    })
  }

  const tasks = (taskData || []) as DistributionTaskRow[]
  const summarizedStatus = summarizeTaskStatus(tasks)
  let nextJob = job
  if (summarizedStatus !== job.status) {
    nextJob = await updateJobRow({
      supabase: opts.supabase,
      userId: opts.userId,
      jobId: job.id,
      patch: {
        status: summarizedStatus,
        error: tasks.find((task) => task.status === "failed")?.error || null,
        updated_at: new Date().toISOString(),
      },
    })
  }

  return {
    job: mapJobRow(nextJob),
    tasks: tasks.map(mapTaskRow),
  }
}

export async function trackDistributeSubmit(opts: {
  request: NextRequest
  userId: string
  input: DistributeRequestInput
}) {
  await trackDistributionEvent({
    request: opts.request,
    event: "distribute_submit",
    props: {
      user_id: opts.userId,
      content_id: opts.input.content_id,
      mode: opts.input.mode,
      platforms: opts.input.platforms,
      schedule_at: opts.input.schedule_at || null,
    },
  })
}

export async function trackDistributeSuccess(opts: {
  request: NextRequest
  userId: string
  result: SubmitDistributionResult
}) {
  await trackDistributionEvent({
    request: opts.request,
    event: "distribute_success",
    props: {
      user_id: opts.userId,
      job_id: opts.result.job.id,
      status: opts.result.job.status,
      tasks: opts.result.tasks.map((task) => ({
        platform: task.platform,
        mode: task.mode,
        status: task.status,
      })),
    },
  })
}

export async function trackDistributeFail(opts: {
  request: NextRequest
  userId: string | null
  code: DistributionErrorCode
  message: string
  details?: Record<string, unknown>
}) {
  await trackDistributionEvent({
    request: opts.request,
    event: "distribute_fail",
    props: {
      user_id: opts.userId,
      code: opts.code,
      message: opts.message,
      ...(opts.details || {}),
    },
  })
}
