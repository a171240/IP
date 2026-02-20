import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import { ingestDouyinProfileToSources, ingestSingleLinkToSource } from "@/lib/content-ingest/service"

type EnvMap = Record<string, string>

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

function getEnv(name: string, fileEnv: EnvMap): string {
  return process.env[name] || fileEnv[name] || ""
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

async function resolveXhsSampleUrl(): Promise<string> {
  const homepage = await fetch("https://www.xiaohongshu.com/explore", {
    headers: { "user-agent": "Mozilla/5.0" },
  })

  const html = await homepage.text()
  const match = html.match(/\/explore\/([a-z0-9]{24})\?xsec_token=([A-Za-z0-9_\-=%]+)[^"'\s]*/i)
  if (!match) {
    throw new Error("xhs_sample_not_found")
  }

  const id = match[1]
  const token = match[2]
  return `https://www.xiaohongshu.com/explore/${id}?xsec_token=${token}&xsec_source=pc_web`
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

  const explicitUserId = process.env.INGEST_SMOKE_USER_ID || envFile.INGEST_SMOKE_USER_ID || ""
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

  const douyinUrl =
    process.env.INGEST_SMOKE_DOUYIN_URL ||
    envFile.INGEST_SMOKE_DOUYIN_URL ||
    "https://www.douyin.com/video/7153921902181301518"

  const xhsUrl = process.env.INGEST_SMOKE_XHS_URL || envFile.INGEST_SMOKE_XHS_URL || (await resolveXhsSampleUrl())
  const invalidDouyinUrl =
    process.env.INGEST_SMOKE_INVALID_URL || envFile.INGEST_SMOKE_INVALID_URL || "https://www.douyin.com/user/test123"
  const profileUrl =
    process.env.INGEST_SMOKE_PROFILE_URL || envFile.INGEST_SMOKE_PROFILE_URL || "https://www.douyin.com/user/test_profile"

  const singleDouyin = await ingestSingleLinkToSource({
    supabase: admin as any,
    user,
    url: douyinUrl,
  })

  const singleXhs = await ingestSingleLinkToSource({
    supabase: admin as any,
    user,
    url: xhsUrl,
  })

  let invalidResult: { ok: false; error_code: string; message: string }
  try {
    await ingestSingleLinkToSource({
      supabase: admin as any,
      user,
      url: invalidDouyinUrl,
    })
    invalidResult = { ok: false, error_code: "extract_failed", message: "unexpected_success" }
  } catch (error) {
    invalidResult = {
      ok: false,
      error_code: (error as { code?: string })?.code || "extract_failed",
      message: (error as { message?: string })?.message || "ingest_failed",
    }
  }

  const profileResult = await ingestDouyinProfileToSources({
    supabase: admin as any,
    user,
    profile_url: profileUrl,
    limit: 20,
  })

  let profileInvalidResult: { ok: false; error_code: string; message: string }
  try {
    await ingestDouyinProfileToSources({
      supabase: admin as any,
      user,
      profile_url: xhsUrl,
      limit: 20,
    })
    profileInvalidResult = { ok: false, error_code: "extract_failed", message: "unexpected_success" }
  } catch (error) {
    profileInvalidResult = {
      ok: false,
      error_code: (error as { code?: string })?.code || "extract_failed",
      message: (error as { message?: string })?.message || "ingest_failed",
    }
  }

  const { data: rows, error: queryError } = await admin
    .from("content_sources")
    .select("id,created_at,source_mode,platform,source_url,status,title,error_code,batch_id,sort_index")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12)

  if (queryError) {
    throw new Error(queryError.message || "content_sources_query_failed")
  }

  console.log("=== ingest single douyin ===")
  console.log(
    JSON.stringify(
      {
        ok: true,
        source_id: singleDouyin.source_id,
        platform: singleDouyin.platform,
        extracted: singleDouyin.extracted,
      },
      null,
      2
    )
  )

  console.log("=== ingest single xiaohongshu ===")
  console.log(
    JSON.stringify(
      {
        ok: true,
        source_id: singleXhs.source_id,
        platform: singleXhs.platform,
        extracted: singleXhs.extracted,
      },
      null,
      2
    )
  )

  console.log("=== ingest single invalid ===")
  console.log(JSON.stringify(invalidResult, null, 2))

  console.log("=== ingest profile ===")
  console.log(
    JSON.stringify(
      {
        ok: true,
        batch_id: profileResult.batch_id,
        items: profileResult.items,
        analysis: profileResult.analysis,
      },
      null,
      2
    )
  )

  console.log("=== ingest profile invalid ===")
  console.log(JSON.stringify(profileInvalidResult, null, 2))

  console.log("=== content_sources latest ===")
  console.table(rows || [])
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
