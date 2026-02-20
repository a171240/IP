import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import { ingestDouyinProfileToSources } from "@/lib/content-ingest/service"

type EnvMap = Record<string, string>

type BatchRunResult = {
  request: {
    profile_url: string
    limit: number
  }
  response:
    | {
        ok: true
        batch_id: string
        items_count: number
        script_pack_len: number
      }
    | {
        ok: false
        error_code: string
        message: string
      }
}

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
    const value = trimmed.slice(eq + 1).trim()
    env[key] = value
  }

  return env
}

function unwrapEnvValue(value: string): string {
  const trimmed = String(value || "").trim()
  if (!trimmed) return ""
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function getEnv(name: string, fileEnv: EnvMap): string {
  return process.env[name] || fileEnv[name] || ""
}

function parseQaUrls(fileEnv: EnvMap): string[] {
  const sampleSizeRaw = Number(unwrapEnvValue(getEnv("INGEST_PROFILE_QA_SAMPLE_SIZE", fileEnv)) || "20")
  const sampleSize = Number.isFinite(sampleSizeRaw) ? Math.max(1, Math.min(100, sampleSizeRaw)) : 20
  const configured = unwrapEnvValue(getEnv("INGEST_PROFILE_QA_URLS", fileEnv))
  if (configured) {
    const urls = configured
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (urls.length > 0) return urls.slice(0, sampleSize)
  }

  const defaults = [
    "https://www.douyin.com/user/test_profile?modal_id=7153921902181301518",
    "https://www.douyin.com/user/test_profile?aweme_id=7153921902181301518",
    "https://www.douyin.com/user/test_profile?item_id=7153921902181301518",
    "https://www.douyin.com/user/test_profile?group_id=7153921902181301518",
    "https://www.douyin.com/user/test_profile",
    "https://www.douyin.com/user/test_profile_2",
    "https://www.douyin.com/user/test_profile_3",
    "https://www.douyin.com/user/test_profile_4",
    "https://www.douyin.com/user/test_profile_5",
    "https://www.douyin.com/user/test_profile_6",
    "https://www.douyin.com/user/test_profile_7",
    "https://www.douyin.com/user/test_profile_8",
    "https://www.douyin.com/user/test_profile_9",
    "https://www.douyin.com/user/test_profile_10",
    "https://www.douyin.com/user/test_profile_11",
    "https://www.douyin.com/user/test_profile_12",
    "https://www.douyin.com/user/test_profile_13",
    "https://www.douyin.com/user/test_profile_14",
    "https://www.douyin.com/user/test_profile_15",
    "https://www.douyin.com/user/test_profile_16",
  ]

  return defaults.slice(0, sampleSize)
}

async function run() {
  const cwd = process.cwd()
  const envFile = loadEnvFile(path.join(cwd, ".env.local"))

  const supabaseUrl =
    unwrapEnvValue(getEnv("NEXT_PUBLIC_SUPABASE_URL", envFile)) ||
    unwrapEnvValue(getEnv("IPgongchang_SUPABASE_URL", envFile))
  const serviceRoleKey =
    unwrapEnvValue(getEnv("SUPABASE_SERVICE_ROLE_KEY", envFile)) ||
    unwrapEnvValue(getEnv("IPgongchang_SUPABASE_SERVICE_ROLE_KEY", envFile))

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_env_missing")
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const explicitUserId = unwrapEnvValue(getEnv("INGEST_SMOKE_USER_ID", envFile))

  let userId = explicitUserId
  let userEmail: string | null = null

  if (!userId) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("id,email")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !profile?.id) {
      throw new Error(error?.message || "profile_not_found")
    }

    userId = String(profile.id)
    userEmail = (profile.email as string | null) ?? null
  }

  if (!userEmail) {
    const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle()
    userEmail = (data?.email as string | null) ?? null
  }

  const user = {
    id: userId,
    email: userEmail,
    user_metadata: {},
  } as any

  const qaUrls = parseQaUrls(envFile)
  const batchRuns: BatchRunResult[] = []
  const successfulBatchIds: string[] = []

  for (const profileUrl of qaUrls) {
    try {
      const result = await ingestDouyinProfileToSources({
        supabase: admin as any,
        user,
        profile_url: profileUrl,
        limit: 20,
      })

      batchRuns.push({
        request: { profile_url: profileUrl, limit: 20 },
        response: {
          ok: true,
          batch_id: result.batch_id,
          items_count: result.items.length,
          script_pack_len: result.analysis.script_pack.length,
        },
      })
      successfulBatchIds.push(result.batch_id)
    } catch (error) {
      batchRuns.push({
        request: { profile_url: profileUrl, limit: 20 },
        response: {
          ok: false,
          error_code: (error as { code?: string })?.code || "extract_failed",
          message: (error as { message?: string })?.message || "ingest_failed",
        },
      })
    }
  }

  const failureProbes = [
    {
      profile_url: "https://www.douyin.com/video/7153921902181301518",
      limit: 20,
    },
    {
      profile_url: "https://www.xiaohongshu.com/explore/6412f918000000001203e260",
      limit: 20,
    },
    {
      profile_url: "not-a-valid-url",
      limit: 20,
    },
  ]

  const failureProbeResults: Array<{
    request: { profile_url: string; limit: number }
    response: { ok: false; error_code: string; message: string }
  }> = []

  for (const probe of failureProbes) {
    try {
      await ingestDouyinProfileToSources({
        supabase: admin as any,
        user,
        profile_url: probe.profile_url,
        limit: probe.limit,
      })
      failureProbeResults.push({
        request: probe,
        response: {
          ok: false,
          error_code: "extract_failed",
          message: "unexpected_success",
        },
      })
    } catch (error) {
      failureProbeResults.push({
        request: probe,
        response: {
          ok: false,
          error_code: (error as { code?: string })?.code || "extract_failed",
          message: (error as { message?: string })?.message || "ingest_failed",
        },
      })
    }
  }

  const { data: batchRows, error: batchRowsError } = successfulBatchIds.length
    ? await admin
        .from("content_sources")
        .select("id,batch_id,status,error_code,source_url")
        .eq("user_id", userId)
        .eq("source_mode", "douyin_profile")
        .in("batch_id", successfulBatchIds)
    : { data: [], error: null }

  if (batchRowsError) {
    throw new Error(batchRowsError.message || "batch_rows_query_failed")
  }

  const batchStats = new Map<
    string,
    {
      ready: number
      failed: number
    }
  >()

  for (const row of (batchRows as Array<{ batch_id: string; status: string }> | null) || []) {
    const key = String(row.batch_id || "")
    if (!key) continue
    const current = batchStats.get(key) || { ready: 0, failed: 0 }
    if (row.status === "ready") current.ready += 1
    if (row.status === "failed") current.failed += 1
    batchStats.set(key, current)
  }

  const okRuns = batchRuns.filter((run) => run.response.ok)
  const batchSuccessRate = Number(((okRuns.length / qaUrls.length) * 100).toFixed(1))

  const totalReadyItems = Array.from(batchStats.values()).reduce((sum, item) => sum + item.ready, 0)
  const totalFailedItems = Array.from(batchStats.values()).reduce((sum, item) => sum + item.failed, 0)
  const totalItems = totalReadyItems + totalFailedItems
  const itemReadyRate = totalItems > 0 ? Number(((totalReadyItems / totalItems) * 100).toFixed(1)) : 0

  const errorCodeDist: Record<string, number> = {}
  for (const row of (batchRows as Array<{ status: string; error_code: string | null }> | null) || []) {
    if (row.status !== "failed") continue
    const code = row.error_code || "extract_failed"
    errorCodeDist[code] = (errorCodeDist[code] || 0) + 1
  }
  for (const run of batchRuns) {
    if (run.response.ok) continue
    const code = run.response.error_code || "extract_failed"
    errorCodeDist[code] = (errorCodeDist[code] || 0) + 1
  }
  for (const probe of failureProbeResults) {
    const code = probe.response.error_code || "extract_failed"
    errorCodeDist[code] = (errorCodeDist[code] || 0) + 1
  }

  const successSample = batchRuns.find((run) => {
    if (!run.response.ok) return false
    const stat = batchStats.get(run.response.batch_id)
    return (stat?.ready || 0) > 0
  })
  const degradedSample = batchRuns.find((run) => {
    if (!run.response.ok) return false
    const stat = batchStats.get(run.response.batch_id)
    return (stat?.ready || 0) === 0
  })

  const failureSample = failureProbeResults[0] || null

  const { data: readyRows, error: readyError } = await admin
    .from("content_sources")
    .select("id,created_at,source_mode,status,error_code,batch_id,source_url,title")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(5)

  if (readyError) {
    throw new Error(readyError.message || "ready_rows_query_failed")
  }

  const { data: failedRows, error: failedError } = await admin
    .from("content_sources")
    .select("id,created_at,source_mode,status,error_code,batch_id,source_url,title")
    .eq("user_id", userId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(5)

  if (failedError) {
    throw new Error(failedError.message || "failed_rows_query_failed")
  }

  console.log("=== ingest-profile-qa summary ===")
  console.log(
    JSON.stringify(
      {
        sample_count: qaUrls.length,
        batch_success_rate: `${batchSuccessRate}%`,
        item_ready_rate: `${itemReadyRate}%`,
        ready_items: totalReadyItems,
        failed_items: totalFailedItems,
        error_code_distribution: errorCodeDist,
        batch_runs: batchRuns,
        api_samples: {
          success: successSample || null,
          degraded: degradedSample || null,
          failed: failureSample,
        },
        failure_probes: failureProbeResults,
        db_evidence: {
          ready_rows: readyRows || [],
          failed_rows: failedRows || [],
        },
      },
      null,
      2
    )
  )
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
