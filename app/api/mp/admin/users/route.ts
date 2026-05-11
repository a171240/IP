import { NextRequest, NextResponse } from "next/server"

import {
  accountContextPayload,
  getMpAccountRoleLabel,
  requirePlatformAdminContext,
} from "@/lib/mp/account-context.server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const PROFILE_SELECT =
  "id, email, nickname, avatar_url, account_role, company_id, company_name, store_id, store_name, created_at, updated_at"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AdminProfileRow = {
  id: string
  email?: string | null
  nickname?: string | null
  avatar_url?: string | null
  account_role?: string | null
  company_id?: string | null
  company_name?: string | null
  store_id?: string | null
  store_name?: string | null
  created_at?: string | null
  updated_at?: string | null
}

function cleanText(value: unknown, max = 120) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function cleanSearchTerm(value: unknown) {
  return cleanText(value, 80)
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanLimit(value: unknown) {
  const parsed = Number(value || 10)
  if (!Number.isFinite(parsed)) return 10
  return Math.min(20, Math.max(1, Math.floor(parsed)))
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function compactId(value: unknown) {
  const text = String(value || "").trim()
  if (text.length <= 12) return text
  return `${text.slice(0, 8)}...${text.slice(-4)}`
}

function mapProfile(row: AdminProfileRow) {
  const displayName = firstText(row.nickname, row.email, compactId(row.id), "User")
  const role = firstText(row.account_role, "staff")

  return {
    id: row.id,
    email: row.email || null,
    nickname: row.nickname || null,
    display_name: displayName,
    avatar_url: row.avatar_url || null,
    avatar_initial: displayName.slice(0, 1).toUpperCase(),
    account_role: role,
    account_role_label: getMpAccountRoleLabel(role),
    company_id: row.company_id || null,
    company_name: row.company_name || null,
    store_id: row.store_id || null,
    store_name: row.store_name || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

export async function GET(request: NextRequest) {
  const auth = await requirePlatformAdminContext(request)
  if (!auth.ok) return auth.error

  const searchParams = new URL(request.url).searchParams
  const rawQuery = cleanText(searchParams.get("q"), 80)
  const query = cleanSearchTerm(rawQuery)
  const limit = cleanLimit(searchParams.get("limit"))

  const admin = createAdminSupabaseClient()
  let profilesQuery = admin.from("profiles").select(PROFILE_SELECT).limit(limit)

  if (UUID_RE.test(rawQuery)) {
    profilesQuery = profilesQuery.eq("id", rawQuery)
  } else if (query) {
    profilesQuery = profilesQuery.or(`email.ilike.%${query}%,nickname.ilike.%${query}%`)
  } else {
    profilesQuery = profilesQuery.order("updated_at", { ascending: false, nullsFirst: false })
  }

  const { data, error } = await profilesQuery
  if (error) return jsonError(500, error.message, "users_query_failed")

  return NextResponse.json({
    ok: true,
    context: accountContextPayload(auth.ctx),
    users: ((data || []) as AdminProfileRow[]).map(mapProfile),
  })
}
