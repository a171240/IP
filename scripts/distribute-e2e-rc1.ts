import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

type EnvMap = Record<string, string>

type ApiResult = {
  status: number
  data: unknown
}

const args = new Set(process.argv.slice(2))
const baseUrl = process.env.RC1_DISTRIBUTE_E2E_BASE_URL || process.env.DISTRIBUTE_SMOKE_BASE_URL || "http://localhost:3000"
const outputPath = process.env.RC1_DISTRIBUTE_E2E_OUTPUT || "/tmp/distribute_e2e_rc1_output.json"
const keepUser =
  args.has("--keep-user") ||
  args.has("--skip-cleanup") ||
  process.env.RC1_DISTRIBUTE_E2E_KEEP_USER === "1" ||
  process.env.DISTRIBUTE_SMOKE_KEEP_USER === "1"

function loadEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) return {}
  const text = fs.readFileSync(filePath, "utf8")
  const env: EnvMap = {}

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }

  return env
}

function unwrap(value: string): string {
  const text = String(value || "").trim()
  if (!text) return ""
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1)
  }
  return text
}

function resolveEnv() {
  const envFile = loadEnvFile(path.join(process.cwd(), ".env.local"))
  const merged: EnvMap = {
    ...envFile,
    ...Object.fromEntries(Object.entries(process.env).map(([key, value]) => [key, value || ""])),
  }

  const supabaseUrl =
    unwrap(merged.NEXT_PUBLIC_SUPABASE_URL) ||
    unwrap(merged.NEXT_PUBLIC_IPgongchang_SUPABASE_URL) ||
    unwrap(merged.IPgongchang_SUPABASE_URL)
  const supabaseAnonKey =
    unwrap(merged.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    unwrap(merged.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY) ||
    unwrap(merged.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY) ||
    unwrap(merged.IPgongchang_SUPABASE_ANON_KEY) ||
    unwrap(merged.IPgongchang_SUPABASE_PUBLISHABLE_KEY)
  const supabaseServiceKey =
    unwrap(merged.SUPABASE_SERVICE_ROLE_KEY) ||
    unwrap(merged.IPgongchang_SUPABASE_SERVICE_ROLE_KEY) ||
    unwrap(merged.IPgongchang_SUPABASE_SECRET_KEY)

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceKey,
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function toShanghaiIso(plusMinutes: number) {
  const now = new Date(Date.now() + plusMinutes * 60 * 1000)
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000
  const shanghai = new Date(utcMs + 8 * 60 * 60 * 1000)
  const yyyy = shanghai.getUTCFullYear()
  const mm = String(shanghai.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(shanghai.getUTCDate()).padStart(2, "0")
  const hh = String(shanghai.getUTCHours()).padStart(2, "0")
  const min = String(shanghai.getUTCMinutes()).padStart(2, "0")
  const sec = String(shanghai.getUTCSeconds()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}+08:00`
}

async function parseApiResponse(response: Response): Promise<ApiResult> {
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }
  return {
    status: response.status,
    data,
  }
}

async function callApi(opts: {
  path: string
  token: string
  method?: string
  body?: unknown
}): Promise<ApiResult> {
  const response = await fetch(`${baseUrl}${opts.path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  return parseApiResponse(response)
}

async function main() {
  const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = resolveEnv()
  assert(supabaseUrl && supabaseAnonKey && supabaseServiceKey, "supabase_env_missing")

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const email = `qa.distribute.e2e.${Date.now()}@example.com`
  const password = "TestPass1234"

  let userId: string | null = null
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: "distribute-e2e-rc1" },
  })

  if (createError) {
    throw new Error(`create_user_failed:${createError.message}`)
  }
  if (created.user?.id) {
    userId = created.user.id
  }
  assert(userId, "create_user_missing_id")

  await adminClient.from("profiles").upsert({
    id: userId,
    email,
    nickname: "distribute-e2e-rc1",
    plan: "pro",
    credits_balance: 999,
    credits_unlimited: true,
  })

  const { data: signInData, error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    throw new Error(`sign_in_failed:${signInError.message}`)
  }
  const accessToken = signInData.session?.access_token
  assert(accessToken, "missing_access_token")

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const connectionRows = [
    {
      user_id: userId,
      platform: "xiaohongshu",
      status: "connected",
      account_id: "xhs_qa",
      account_name: "XHS QA",
      access_token: "token_xhs",
      expires_at: expiresAt,
      meta: { api_enabled: true, assistant_enabled: true },
      updated_at: new Date().toISOString(),
    },
    {
      user_id: userId,
      platform: "douyin",
      status: "connected",
      account_id: "dy_qa",
      account_name: "DY QA",
      access_token: "token_dy",
      expires_at: expiresAt,
      meta: { api_enabled: true, assistant_enabled: true },
      updated_at: new Date().toISOString(),
    },
    {
      user_id: userId,
      platform: "video_account",
      status: "connected",
      account_id: "va_qa",
      account_name: "VA QA",
      access_token: "token_va",
      expires_at: expiresAt,
      meta: { api_enabled: true, assistant_enabled: true },
      updated_at: new Date().toISOString(),
    },
  ]

  {
    const { error } = await adminClient.from("platform_connections").insert(connectionRows)
    if (error) {
      throw new Error(`platform_connections_insert_failed:${error.message}`)
    }
  }

  const sourceInsert = await adminClient
    .from("content_sources")
    .insert({
      user_id: userId,
      source_mode: "single_link",
      platform: "douyin",
      source_url: "https://www.douyin.com/video/0000000000000000000",
      status: "ready",
      batch_id: null,
      sort_index: 0,
      title: "E2E source",
      text_content: "e2e seed source for rewrite",
      images: [],
      video_url: null,
      author: "qa",
      meta: {},
      raw_payload: { seed: true },
      error_code: null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (sourceInsert.error || !sourceInsert.data?.id) {
    throw new Error(`content_source_insert_failed:${sourceInsert.error?.message || "unknown"}`)
  }
  const sourceId = sourceInsert.data.id as string

  // Step 1 in content-studio chain: rewrite generation API.
  const rewriteApi = await callApi({
    path: "/api/mp/content/rewrite",
    token: accessToken,
    method: "POST",
    body: {
      source_id: sourceId,
      target: "douyin_video",
      tone: "professional",
      constraints: { avoid_risk_words: true },
    },
  })

  const rewriteApiData = toJsonObject(rewriteApi.data)
  let rewriteId = String(rewriteApiData.rewrite_id || "").trim()
  let rewriteMode: "api" | "seeded" = "api"

  if (!(rewriteApi.status === 200 && rewriteApiData.ok === true && rewriteId)) {
    rewriteMode = "seeded"
    const rewriteInsert = await adminClient
      .from("content_rewrites")
      .insert({
        user_id: userId,
        source_id: sourceId,
        target: "douyin_video",
        tone: "professional",
        constraints: { avoid_risk_words: true },
        result_title: "E2E rewrite title",
        result_body: "e2e rewrite body",
        result_script: "e2e rewrite script",
        result_tags: ["qa", "e2e"],
        cover_prompts: ["e2e cover"],
        compliance_risk_level: "safe",
        compliance_flags: [],
        status: "done",
        error_code: null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (rewriteInsert.error || !rewriteInsert.data?.id) {
      throw new Error(`content_rewrite_insert_failed:${rewriteInsert.error?.message || "unknown"}`)
    }
    rewriteId = rewriteInsert.data.id as string
  }

  // Prepare avatar profile with assets for video job creation.
  const avatarInsert = await adminClient
    .from("store_profiles")
    .insert({
      user_id: userId,
      name: "E2E Avatar",
      city: "Shanghai",
      district: "Pudong",
      landmark: "Lujiazui",
      shop_type: "beauty",
      boss_drive_video_path: "s3://mock/avatar-drive.mp4",
      boss_portrait_path: "s3://mock/avatar-portrait.jpg",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (avatarInsert.error || !avatarInsert.data?.id) {
    throw new Error(`avatar_profile_insert_failed:${avatarInsert.error?.message || "unknown"}`)
  }
  const avatarProfileId = avatarInsert.data.id as string

  // Step 2 in content-studio chain: video job create API.
  const videoCreate = await callApi({
    path: "/api/mp/video/jobs",
    token: accessToken,
    method: "POST",
    body: {
      rewrite_id: rewriteId,
      duration_profile: "15_25s",
      avatar_profile_id: avatarProfileId,
      product_assets: [],
    },
  })
  const videoCreateData = toJsonObject(videoCreate.data)
  assert(videoCreate.status === 200, "video_create_status_not_200")
  assert(videoCreateData.ok === true, "video_create_ok_false")

  const videoJobId = String(videoCreateData.job_id || "")
  assert(videoJobId, "video_job_id_missing")

  // Step 3 in video-jobs chain: video job query API.
  const videoQuery = await callApi({
    path: `/api/mp/video/jobs/${encodeURIComponent(videoJobId)}`,
    token: accessToken,
  })
  const videoQueryData = toJsonObject(videoQuery.data)
  assert(videoQuery.status === 200, "video_query_status_not_200")
  assert(videoQueryData.ok === true, "video_query_ok_false")

  // Scenario A: immediate distribute using video job as content_id.
  const immediate = await callApi({
    path: "/api/mp/distribute",
    token: accessToken,
    method: "POST",
    body: {
      content_id: videoJobId,
      platforms: ["xiaohongshu", "douyin"],
      mode: "immediate",
    },
  })

  const immediateData = toJsonObject(immediate.data)
  assert(immediate.status === 200, "immediate_status_not_200")
  assert(immediateData.ok === true, "immediate_ok_false")
  const immediateJobId = String(immediateData.job_id || "")
  assert(immediateJobId, "immediate_job_id_missing")

  // Scenario B: scheduled distribute(+08:00) using rewrite as content_id.
  const scheduleAt = toShanghaiIso(30)
  const scheduled = await callApi({
    path: "/api/mp/distribute",
    token: accessToken,
    method: "POST",
    body: {
      content_id: rewriteId,
      platforms: ["xiaohongshu"],
      mode: "scheduled",
      schedule_at: scheduleAt,
    },
  })
  const scheduledData = toJsonObject(scheduled.data)
  assert(scheduled.status === 200, "scheduled_status_not_200")
  assert(scheduledData.ok === true, "scheduled_ok_false")
  const scheduledJobId = String(scheduledData.job_id || "")
  assert(scheduledJobId, "scheduled_job_id_missing")

  // Scenario C: force API failure, then assistant fallback.
  {
    const { error } = await adminClient
      .from("platform_connections")
      .update({
        meta: {
          api_enabled: true,
          assistant_enabled: true,
          force_api_fail: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("platform", "video_account")
    if (error) {
      throw new Error(`platform_connection_update_failed:${error.message}`)
    }
  }

  const fallback = await callApi({
    path: "/api/mp/distribute",
    token: accessToken,
    method: "POST",
    body: {
      content_id: rewriteId,
      platforms: ["video_account"],
      mode: "immediate",
    },
  })
  const fallbackData = toJsonObject(fallback.data)
  assert(fallback.status === 200, "fallback_status_not_200")
  assert(fallbackData.ok === true, "fallback_ok_false")
  const fallbackJobId = String(fallbackData.job_id || "")
  assert(fallbackJobId, "fallback_job_id_missing")

  // Scenario D: invalid content_id should fail and not create job row.
  const invalidContentId = randomUUID()
  const invalidContentResponse = await callApi({
    path: "/api/mp/distribute",
    token: accessToken,
    method: "POST",
    body: {
      content_id: invalidContentId,
      platforms: ["xiaohongshu"],
      mode: "immediate",
    },
  })

  const invalidData = toJsonObject(invalidContentResponse.data)
  assert(invalidContentResponse.status >= 400, "invalid_content_id_should_fail")
  assert(invalidData.ok === false, "invalid_content_id_ok_should_be_false")
  assert(typeof invalidData.error_code === "string", "invalid_content_id_error_code_missing")
  assert(typeof invalidData.message === "string", "invalid_content_id_message_missing")
  assert(invalidData.details && typeof invalidData.details === "object", "invalid_content_id_details_missing")

  const immediateQuery = await callApi({
    path: `/api/mp/distribute/jobs/${encodeURIComponent(immediateJobId)}`,
    token: accessToken,
  })
  const scheduledQuery = await callApi({
    path: `/api/mp/distribute/jobs/${encodeURIComponent(scheduledJobId)}`,
    token: accessToken,
  })
  const fallbackQuery = await callApi({
    path: `/api/mp/distribute/jobs/${encodeURIComponent(fallbackJobId)}`,
    token: accessToken,
  })

  const jobIds = [immediateJobId, scheduledJobId, fallbackJobId]

  const jobsRes = await adminClient
    .from("distribution_jobs")
    .select("id,user_id,content_id,content_type,mode,schedule_at,status,error,created_at")
    .eq("user_id", userId)
    .in("id", jobIds)
    .order("created_at", { ascending: true })
  if (jobsRes.error) {
    throw new Error(`distribution_jobs_query_failed:${jobsRes.error.message}`)
  }

  const tasksRes = await adminClient
    .from("distribution_tasks")
    .select("id,job_id,platform,mode,status,publish_url,error,action_payload,retry_count,created_at")
    .eq("user_id", userId)
    .in("job_id", jobIds)
    .order("created_at", { ascending: true })
  if (tasksRes.error) {
    throw new Error(`distribution_tasks_query_failed:${tasksRes.error.message}`)
  }

  const invalidJobCountRes = await adminClient
    .from("distribution_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("content_id", invalidContentId)
  if (invalidJobCountRes.error) {
    throw new Error(`invalid_content_id_count_failed:${invalidJobCountRes.error.message}`)
  }

  const contentStudioJs = fs.readFileSync(path.join(process.cwd(), "mini-program-ui/pages/content-studio/index.js"), "utf8")
  const videoJobsJs = fs.readFileSync(path.join(process.cwd(), "mini-program-ui/pages/video-jobs/index.js"), "utf8")
  const videoJobsWxml = fs.readFileSync(path.join(process.cwd(), "mini-program-ui/pages/video-jobs/index.wxml"), "utf8")

  const pageChainChecks = {
    rewrite_endpoint: contentStudioJs.includes("/api/mp/content/rewrite"),
    video_create_endpoint: contentStudioJs.includes("/api/mp/video/jobs"),
    distribute_endpoint: contentStudioJs.includes("/api/mp/distribute"),
    to_video_jobs: contentStudioJs.includes("/pages/video-jobs/index"),
    video_jobs_query: videoJobsJs.includes("/api/mp/video/jobs/"),
    distribute_jobs_query: videoJobsJs.includes("/api/mp/distribute/jobs/"),
    retry_endpoint: videoJobsJs.includes("/api/mp/distribute"),
    back_to_content_studio: videoJobsJs.includes("/pages/content-studio/index"),
  }

  const progressFormulaGuard = videoJobsJs.includes("raw <= 1 ? raw * 100 : raw")
  const wxmlWidthGuard = videoJobsWxml.includes('style="width: {{videoJob ? videoJob.progress : 0}}%;"')
  const wxmlTextGuard = videoJobsWxml.includes("{{videoJob ? videoJob.progress : 0}}%")
  const rawProgress = 0.42
  const mappedPercent = (() => {
    const raw = Number(rawProgress || 0)
    const percent = raw <= 1 ? raw * 100 : raw
    return Math.max(0, Math.min(100, Math.round(percent)))
  })()

  const screenshots = {
    content_studio: {
      path: "/tmp/content-studio-qa.png",
      exists: fs.existsSync("/tmp/content-studio-qa.png"),
    },
    video_jobs: {
      path: "/tmp/video-jobs-qa.png",
      exists: fs.existsSync("/tmp/video-jobs-qa.png"),
    },
  }

  const output = {
    base_url: baseUrl,
    timestamp: new Date().toISOString(),
    user: {
      id: userId,
      email,
    },
    chain: {
      source_id: sourceId,
      rewrite_mode: rewriteMode,
      rewrite_id: rewriteId,
      avatar_profile_id: avatarProfileId,
      video_job_id: videoJobId,
    },
    rewrite_api: rewriteApi,
    video_create: videoCreate,
    video_job_query: videoQuery,
    immediate,
    scheduled,
    fallback,
    invalid_content_id: {
      request_content_id: invalidContentId,
      response: invalidContentResponse,
    },
    immediate_query: immediateQuery,
    scheduled_query: scheduledQuery,
    fallback_query: fallbackQuery,
    db_evidence: {
      distribution_jobs: jobsRes.data || [],
      distribution_tasks: tasksRes.data || [],
      invalid_content_id_job_count: invalidJobCountRes.count || 0,
    },
    error_contract_checks: {
      ok_field: invalidData.ok === false,
      error_code_field: typeof invalidData.error_code === "string",
      message_field: typeof invalidData.message === "string",
      details_field: invalidData.details && typeof invalidData.details === "object",
    },
    page_chain_checks: pageChainChecks,
    video_progress_mapping: {
      input: rawProgress,
      displayed_percent: mappedPercent,
      formula_guard: progressFormulaGuard,
      width_guard: wxmlWidthGuard,
      text_guard: wxmlTextGuard,
    },
    screenshots,
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(JSON.stringify(output, null, 2))

  if (!keepUser) {
    await adminClient.from("distribution_tasks").delete().eq("user_id", userId)
    await adminClient.from("distribution_jobs").delete().eq("user_id", userId)
    await adminClient.from("video_render_jobs").delete().eq("user_id", userId)
    await adminClient.from("content_rewrites").delete().eq("user_id", userId)
    await adminClient.from("content_sources").delete().eq("user_id", userId)
    await adminClient.from("platform_connections").delete().eq("user_id", userId)
    await adminClient.from("store_profiles").delete().eq("user_id", userId)
    await adminClient.from("profiles").delete().eq("id", userId)
    await adminClient.auth.admin.deleteUser(userId)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
