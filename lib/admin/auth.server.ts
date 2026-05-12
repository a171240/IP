import "server-only"

import { NextResponse } from "next/server"

import { createServerSupabaseClient } from "@/lib/supabase/server"

type AdminUser = {
  id?: string
  email?: string | null
}

function parseAdminList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminUser(user: AdminUser | null): boolean {
  if (!user) return false
  const adminEmails = parseAdminList(process.env.ADMIN_EMAILS)
  const adminUserIds = parseAdminList(process.env.ADMIN_USER_IDS)
  const email = user.email?.toLowerCase()

  if (email && adminEmails.includes(email)) return true
  if (user.id && adminUserIds.includes(user.id.toLowerCase())) return true
  return false
}

export async function getAdminSession() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    user,
    isAdmin: isAdminUser(user),
  }
}

export async function requireAdminUser() {
  const session = await getAdminSession()

  if (!session.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }),
    }
  }

  if (!session.isAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true as const,
    user: session.user,
  }
}
