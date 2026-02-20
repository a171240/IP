import fs from "node:fs"
import path from "node:path"

import { createClient } from "@supabase/supabase-js"

import { ingestDouyinProfileToSources } from "@/lib/content-ingest/service"

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const text = fs.readFileSync(filePath, "utf8")
  const env: Record<string, string> = {}

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
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

function getEnv(name: string, fileEnv: Record<string, string>): string {
  return process.env[name] || fileEnv[name] || ""
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

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (profileError || !profile?.id) {
    throw new Error(profileError?.message || "profile_not_found")
  }

  const user = {
    id: String(profile.id),
    email: (profile.email as string | null) ?? null,
    user_metadata: {},
  } as any

  const targetProfileUrl = process.env.INGEST_FAIL_PROFILE_URL || "https://www.douyin.com/user/test_profile"

  try {
    await ingestDouyinProfileToSources({
      supabase: admin as any,
      user,
      profile_url: targetProfileUrl,
      limit: 20,
    })

    console.log(
      JSON.stringify(
        {
          ok: true,
          note: "unexpected_success",
        },
        null,
        2
      )
    )
  } catch (error) {
    const err = error as { code?: string; message?: string }

    console.log("=== ingest-profile failure response ===")
    console.log(
      JSON.stringify(
        {
          ok: false,
          error_code: err.code || "extract_failed",
          message: err.message || "主页导入失败",
        },
        null,
        2
      )
    )
  }

  const { data: rows, error: rowsError } = await admin
    .from("content_sources")
    .select("id,created_at,source_mode,platform,source_url,status,error_code,batch_id,sort_index,title")
    .eq("user_id", profile.id)
    .eq("source_mode", "douyin_profile")
    .eq("source_url", targetProfileUrl)
    .order("created_at", { ascending: false })
    .limit(3)

  if (rowsError) {
    throw new Error(rowsError.message || "query_failed")
  }

  console.log("=== content_sources failed rows ===")
  console.log(JSON.stringify(rows || [], null, 2))
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
