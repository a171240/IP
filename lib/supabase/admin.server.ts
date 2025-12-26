import "server-only"

import { createClient } from "@supabase/supabase-js"

function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    process.env.IPgongchang_SUPABASE_URL ||
    ""
  )
}

function getSupabaseServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.IPgongchang_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.IPgongchang_SUPABASE_SECRET_KEY ||
    ""
  )
}

// Compat: map legacy IPgongchang_* vars to standard names so other modules can read them.
const resolvedUrl = getSupabaseUrl()
const resolvedServiceKey = getSupabaseServiceRoleKey()
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && resolvedUrl) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = resolvedUrl
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && resolvedServiceKey) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = resolvedServiceKey
}

export function createAdminSupabaseClient() {
  const url = getSupabaseUrl()
  const serviceRoleKey = getSupabaseServiceRoleKey()

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin env missing: set SUPABASE_SERVICE_ROLE_KEY (or keep IPgongchang_SUPABASE_SERVICE_ROLE_KEY)"
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
