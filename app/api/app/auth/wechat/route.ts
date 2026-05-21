import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const WECHAT_OPEN_APP_ID =
  process.env.WECHAT_OPEN_APP_ID || process.env.WECHAT_APP_APPID || process.env.WECHAT_APP_ID || ""
const WECHAT_OPEN_APP_SECRET =
  process.env.WECHAT_OPEN_APP_SECRET || process.env.WECHAT_APP_SECRET || process.env.WECHAT_OPEN_SECRET || ""
const WECHAT_LOGIN_SECRET = process.env.WECHAT_LOGIN_SECRET || ""
const DEFAULT_WECHAT_NICKNAME = "WeChat App User"

type WechatOpenTokenResponse = {
  errcode?: number
  errmsg?: string
  access_token?: string
  expires_in?: number
  refresh_token?: string
  openid?: string
  scope?: string
  unionid?: string
}

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

function cleanText(value: unknown, max = 160) {
  const text = typeof value === "string" ? value.trim() : ""
  return text.length > max ? text.slice(0, max) : text
}

function buildWechatEmail(identityKey: string) {
  const safe = identityKey.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `wxapp_${safe}@ipgongchang.xin`
}

function buildWechatPassword(identityKey: string) {
  return createHmac("sha256", WECHAT_LOGIN_SECRET).update(identityKey).digest("hex")
}

function metadataText(meta: unknown, key: string) {
  if (!meta || typeof meta !== "object") return ""
  const value = (meta as Record<string, unknown>)[key]
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const code = cleanText((body as { code?: unknown }).code, 512)
  const nickname = cleanText((body as { nickname?: unknown }).nickname, 80)
  const avatarUrl = cleanText((body as { avatar_url?: unknown }).avatar_url, 500)

  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 })
  }
  if (!WECHAT_OPEN_APP_ID || !WECHAT_OPEN_APP_SECRET) {
    return NextResponse.json({ error: "wechat_open_app_env_missing" }, { status: 500 })
  }
  if (!WECHAT_LOGIN_SECRET) {
    return NextResponse.json({ error: "wechat_login_secret_missing" }, { status: 500 })
  }

  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token")
  url.searchParams.set("appid", WECHAT_OPEN_APP_ID)
  url.searchParams.set("secret", WECHAT_OPEN_APP_SECRET)
  url.searchParams.set("code", code)
  url.searchParams.set("grant_type", "authorization_code")

  const wechatRes = await fetch(url.toString(), { method: "GET" })
  if (!wechatRes.ok) {
    return NextResponse.json({ error: "wechat_request_failed" }, { status: 502 })
  }

  const wechatData = (await wechatRes.json().catch(() => null)) as WechatOpenTokenResponse | null
  if (!wechatData || wechatData.errcode || !wechatData.openid) {
    return NextResponse.json(
      { error: "wechat_login_failed", message: wechatData?.errmsg || "missing_openid" },
      { status: 400 }
    )
  }

  const openid = wechatData.openid
  const unionid = wechatData.unionid || ""
  const identityKey = unionid ? `union_${unionid}` : `openid_${openid}`
  const email = buildWechatEmail(identityKey)
  const password = buildWechatPassword(identityKey)

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch {
    return NextResponse.json({ error: "supabase_admin_env_missing" }, { status: 500 })
  }

  let createErrorMessage = ""
  await admin.auth.admin
    .createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nickname: nickname || DEFAULT_WECHAT_NICKNAME,
        avatar_url: avatarUrl || null,
        auth_source: "wechat_open_app",
        wechat_app_openid: openid,
        wechat_unionid: unionid || null,
      },
    })
    .then(({ error }) => {
      if (error) {
        const message =
          typeof error === "object" && error && "message" in error ? String((error as { message?: string }).message || "") : ""
        createErrorMessage = message || "create_failed"
      }
    })

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !sessionData.session) {
    if (createErrorMessage) {
      return NextResponse.json(
        { error: "user_create_failed", message: createErrorMessage },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: "sign_in_failed", message: signInError?.message || "missing_session" },
      { status: 500 }
    )
  }

  const user = sessionData.session.user
  const existingNickname = metadataText(user.user_metadata, "nickname")
  const nextNickname = nickname || existingNickname || DEFAULT_WECHAT_NICKNAME
  const nextUserMetadata = {
    ...(user.user_metadata || {}),
    nickname: nextNickname,
    auth_source: "wechat_open_app",
    wechat_app_openid: openid,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    ...(unionid ? { wechat_unionid: unionid } : {}),
  }

  const { data: updatedUserData } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: nextUserMetadata,
  })
  const responseUser = updatedUserData?.user || { ...user, user_metadata: nextUserMetadata }

  await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email,
        nickname: nextNickname,
        avatar_url: avatarUrl || null,
      },
      { onConflict: "id" }
    )

  return NextResponse.json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
    user: responseUser,
    auth: {
      provider: "wechat_open_app",
      openid,
      unionid: unionid || null,
    },
  })
}
