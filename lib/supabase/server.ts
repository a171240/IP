import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"

function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_URL ||
    process.env.IPgongchang_SUPABASE_URL ||
    ""
  )
}

function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    process.env.IPgongchang_SUPABASE_ANON_KEY ||
    process.env.IPgongchang_SUPABASE_PUBLISHABLE_KEY ||
    ""
  )
}

// Compat: if you only configured IPgongchang_* vars in Vercel, map them to the standard names.
const resolvedUrl = getSupabaseUrl()
const resolvedAnonKey = getSupabaseAnonKey()
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && resolvedUrl) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = resolvedUrl
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && resolvedAnonKey) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = resolvedAnonKey
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  const url = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or keep your existing NEXT_PUBLIC_IPgongchang_SUPABASE_URL + NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY)"
    )
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  })
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization")
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

export async function createServerSupabaseClientForRequest(request: NextRequest) {
  const token = getBearerToken(request)
  if (!token) {
    return createServerSupabaseClient()
  }

  const url = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (or keep your existing NEXT_PUBLIC_IPgongchang_SUPABASE_URL + NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY)"
    )
  }

  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
}

// Back-compat alias for older imports
export async function createClient() {
  return createServerSupabaseClient()
}






