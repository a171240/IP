import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const WECHAT_APP_ID = process.env.WECHAT_MINI_APPID || process.env.WX_MINI_APPID || ""
const WECHAT_APP_SECRET = process.env.WECHAT_MINI_SECRET || process.env.WX_MINI_SECRET || ""
const WECHAT_LOGIN_SECRET = process.env.WECHAT_LOGIN_SECRET || ""

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

function buildWechatEmail(openid: string) {
  return `wx_${openid}@ipgongchang.xin`
}

function buildWechatPassword(openid: string) {
  return createHmac("sha256", WECHAT_LOGIN_SECRET).update(openid).digest("hex")
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const code = typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : ""
  const nickname = typeof (body as { nickname?: unknown }).nickname === "string" ? (body as { nickname: string }).nickname : ""
  const avatarUrl = typeof (body as { avatar_url?: unknown }).avatar_url === "string" ? (body as { avatar_url: string }).avatar_url : ""

  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 })
  }

  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    return NextResponse.json({ error: "wechat_env_missing" }, { status: 500 })
  }

  if (!WECHAT_LOGIN_SECRET) {
    return NextResponse.json({ error: "wechat_login_secret_missing" }, { status: 500 })
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session")
  url.searchParams.set("appid", WECHAT_APP_ID)
  url.searchParams.set("secret", WECHAT_APP_SECRET)
  url.searchParams.set("js_code", code)
  url.searchParams.set("grant_type", "authorization_code")

  const wechatRes = await fetch(url.toString(), { method: "GET" })
  if (!wechatRes.ok) {
    return NextResponse.json({ error: "wechat_request_failed" }, { status: 502 })
  }

  const wechatData = (await wechatRes.json().catch(() => null)) as
    | { errcode?: number; errmsg?: string; openid?: string; unionid?: string }
    | null

  if (!wechatData || wechatData.errcode || !wechatData.openid) {
    return NextResponse.json(
      { error: "wechat_login_failed", message: wechatData?.errmsg || "missing_openid" },
      { status: 400 }
    )
  }

  const openid = wechatData.openid
  const unionid = wechatData.unionid || ""
  const email = buildWechatEmail(openid)
  const password = buildWechatPassword(openid)

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
        nickname: nickname || "WeChat User",
        avatar_url: avatarUrl || null,
        wechat_openid: openid,
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
  if (nickname || avatarUrl || unionid) {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata || {}),
        ...(nickname ? { nickname } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        ...(unionid ? { wechat_unionid: unionid } : {}),
      },
    })
  }

  if (nickname || avatarUrl) {
    await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email,
          nickname: nickname || "WeChat User",
          avatar_url: avatarUrl || null,
        },
        { onConflict: "id" }
      )
  }

  return NextResponse.json({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
    user: sessionData.session.user,
  })
}
