import { createBrowserClient } from "@supabase/ssr"

function getSupabaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    process.env.IPgongchang_SUPABASE_URL

  if (!url) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL (or NEXT_PUBLIC_IPgongchang_SUPABASE_URL)")
  }

  return url
}

function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY

  if (!key) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY)")
  }

  return key
}

export function createClient() {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()

  try {
    new URL(url)
  } catch {
    throw new Error("Supabase URL format invalid")
  }

  return createBrowserClient(url, key)
}

let supabaseClient: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient()
  }
  return supabaseClient
}

export function resetSupabaseClient() {
  supabaseClient = null
}
