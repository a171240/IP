import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config } from "../config.js"

function assertConfigured(value: string, name: string): string {
  if (!value) {
    throw new Error(`${name}_missing`)
  }
  return value
}

let adminClient: SupabaseClient | null = null

/**
 * Create a cached Supabase admin client for server-side persistence.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = assertConfigured(config.supabase.url, "NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = assertConfigured(config.supabase.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY")
  adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}

/**
 * Reset the cached admin client. Useful for tests.
 */
export function resetAdminSupabaseClient(): void {
  adminClient = null
}
