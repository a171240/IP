import type { User } from "@supabase/supabase-js"
import { createAdminSupabaseClient } from "./db/supabase.js"

export type VoiceCoachAuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string }

/**
 * Verify a Supabase JWT using the server-side client.
 */
export async function verifySupabaseJwt(token: string | undefined | null): Promise<VoiceCoachAuthResult> {
  const accessToken = String(token || "").trim()
  if (!accessToken) {
    return { ok: false, status: 401, error: "token_missing" }
  }

  try {
    const supabase = createAdminSupabaseClient()
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) {
      return { ok: false, status: 401, error: "token_invalid" }
    }
    return { ok: true, user: data.user }
  } catch (error) {
    console.warn("[voice-coach-ws] token_verification_failed", error)
    return { ok: false, status: 500, error: "token_verification_failed" }
  }
}

/**
 * Read voice coach auth parameters from a websocket request URL.
 */
export function parseVoiceCoachHandshakeUrl(input: string | URL): { sessionId: string; token: string } {
  const url = input instanceof URL ? input : new URL(input)
  return {
    sessionId: url.searchParams.get("session_id") || "",
    token: url.searchParams.get("token") || "",
  }
}
