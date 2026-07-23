import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"

export const runtime = "nodejs"

const WECHAT_OPEN_APP_ID =
  process.env.WECHAT_OPEN_APP_ID || process.env.WECHAT_APP_APPID || process.env.WECHAT_APP_ID || ""
const WECHAT_OPEN_APP_SECRET =
  process.env.WECHAT_OPEN_APP_SECRET || process.env.WECHAT_APP_SECRET || process.env.WECHAT_OPEN_SECRET || ""
const WECHAT_OPEN_PLATFORM_SCOPE_ID =
  process.env.WECHAT_OPEN_PLATFORM_SCOPE_ID || ""
const WECHAT_LOGIN_SECRET = process.env.WECHAT_LOGIN_SECRET || ""
const DEFAULT_WECHAT_NICKNAME = "WeChat App User"
const AUTH_USER_LOOKUP_PAGE_SIZE = 200
const AUTH_USER_LOOKUP_MAX_PAGES = 500

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

type AdminAuthUser = {
  id: string
  email?: string | null
  app_metadata?: unknown
  user_metadata?: unknown
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

function metadataRecord(meta: unknown) {
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? { ...(meta as Record<string, unknown>) }
    : {}
}

function publicUserMetadata(meta: unknown) {
  const publicMetadata = metadataRecord(meta)
  delete publicMetadata.auth_source
  delete publicMetadata.wechat_open_app_id
  delete publicMetadata.wechat_app_openid
  delete publicMetadata.wechat_unionid
  delete publicMetadata.wechat_union_issuer
  return publicMetadata
}

function isMissingSyntheticLogin(error: unknown) {
  const record = metadataRecord(error)
  const code = metadataText(record, "code")
  const message = metadataText(record, "message")
  return (
    code === "invalid_credentials" ||
    /invalid login credentials/i.test(message)
  )
}

async function findAdminUserByEmail(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  email: string,
): Promise<
  | { status: "absent" }
  | { status: "found"; user: AdminAuthUser }
  | { status: "unavailable" }
> {
  const normalizedEmail = email.trim().toLowerCase()
  let page = 1
  for (let attempt = 0; attempt < AUTH_USER_LOOKUP_MAX_PAGES; attempt += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_USER_LOOKUP_PAGE_SIZE,
    })
    if (error) return { status: "unavailable" }
    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    )
    if (match) return { status: "found", user: match }
    if (data.nextPage === null) return { status: "absent" }
    if (
      !Number.isInteger(data.nextPage) ||
      Number(data.nextPage) <= page
    ) {
      return { status: "unavailable" }
    }
    page = Number(data.nextPage)
  }
  return { status: "unavailable" }
}

function isTrustedLegacyUnionUser(
  user: {
    app_metadata?: unknown
  },
  args: {
    appId: string
    issuer: string
    unionid: string
  },
) {
  const metadata = metadataRecord(user.app_metadata)
  return (
    metadataText(metadata, "auth_source") === "wechat_open_app" &&
    metadataText(metadata, "wechat_open_app_id") === args.appId &&
    metadataText(metadata, "wechat_unionid") === args.unionid &&
    metadataText(metadata, "wechat_union_issuer") === args.issuer
  )
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
  const scopedIdentityKey =
    unionid && WECHAT_OPEN_PLATFORM_SCOPE_ID
      ? `union_${WECHAT_OPEN_PLATFORM_SCOPE_ID}_${unionid}`
      : `openid_${WECHAT_OPEN_APP_ID}_${openid}`
  const email = buildWechatEmail(scopedIdentityKey)
  const password = buildWechatPassword(scopedIdentityKey)
  const legacyUnionIdentityKey =
    unionid && WECHAT_OPEN_PLATFORM_SCOPE_ID
      ? `union_${unionid}`
      : null
  const trustedWechatIdentityMetadata = {
    auth_source: "wechat_open_app",
    wechat_open_app_id: WECHAT_OPEN_APP_ID,
    wechat_app_openid: openid,
    wechat_unionid: unionid || null,
    ...(unionid && WECHAT_OPEN_PLATFORM_SCOPE_ID
      ? { wechat_union_issuer: WECHAT_OPEN_PLATFORM_SCOPE_ID }
      : {}),
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch {
    return NextResponse.json({ error: "supabase_admin_env_missing" }, { status: 500 })
  }

  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "supabase_env_missing" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let migratingLegacyUnionPrincipal = false
  let adminMigratedUser: AdminAuthUser | null = null

  const scopedSignIn = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  let sessionData = scopedSignIn.data
  let signInError = scopedSignIn.error

  if (!sessionData?.session && !isMissingSyntheticLogin(signInError)) {
    return NextResponse.json(
      { error: "scoped_identity_lookup_failed" },
      { status: 500 },
    )
  }

  if (
    !sessionData?.session &&
    legacyUnionIdentityKey &&
    isMissingSyntheticLogin(signInError)
  ) {
    const legacyEmail = buildWechatEmail(legacyUnionIdentityKey)
    const legacyPassword = buildWechatPassword(legacyUnionIdentityKey)
    const legacySignIn = await supabase.auth.signInWithPassword({
      email: legacyEmail,
      password: legacyPassword,
    })
    if (legacySignIn.data?.session) {
      if (
        !isTrustedLegacyUnionUser(legacySignIn.data.session.user, {
          appId: WECHAT_OPEN_APP_ID,
          issuer: WECHAT_OPEN_PLATFORM_SCOPE_ID,
          unionid,
        })
      ) {
        return NextResponse.json(
          { error: "legacy_identity_review_required" },
          { status: 409 },
        )
      }
      sessionData = legacySignIn.data
      signInError = null
      migratingLegacyUnionPrincipal = true
    } else if (!isMissingSyntheticLogin(legacySignIn.error)) {
      return NextResponse.json(
        { error: "legacy_identity_lookup_failed" },
        { status: 500 },
      )
    } else {
      const legacyLookup = await findAdminUserByEmail(admin, legacyEmail)
      if (legacyLookup.status === "unavailable") {
        return NextResponse.json(
          { error: "legacy_identity_lookup_failed" },
          { status: 500 },
        )
      }
      if (legacyLookup.status === "found") {
        if (
          !isTrustedLegacyUnionUser(legacyLookup.user, {
            appId: WECHAT_OPEN_APP_ID,
            issuer: WECHAT_OPEN_PLATFORM_SCOPE_ID,
            unionid,
          })
        ) {
          return NextResponse.json(
            { error: "legacy_identity_review_required" },
            { status: 409 },
          )
        }
        const legacyNickname =
          metadataText(legacyLookup.user.user_metadata, "nickname")
        const nextLegacyNickname =
          nickname || legacyNickname || DEFAULT_WECHAT_NICKNAME
        const migratedLegacyUser = await admin.auth.admin.updateUserById(
          legacyLookup.user.id,
          {
            email,
            password,
            app_metadata: {
              ...metadataRecord(legacyLookup.user.app_metadata),
              ...trustedWechatIdentityMetadata,
            },
            user_metadata: {
              ...publicUserMetadata(legacyLookup.user.user_metadata),
              nickname: nextLegacyNickname,
              ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
            },
          },
        )
        if (migratedLegacyUser.error || !migratedLegacyUser.data?.user) {
          return NextResponse.json(
            { error: "trusted_identity_metadata_update_failed" },
            { status: 500 },
          )
        }
        const migratedSignIn = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (migratedSignIn.error || !migratedSignIn.data?.session) {
          return NextResponse.json(
            { error: "legacy_identity_migration_sign_in_failed" },
            { status: 500 },
          )
        }
        sessionData = migratedSignIn.data
        signInError = null
        adminMigratedUser = migratedLegacyUser.data.user
      }
    }
  }

  let createErrorMessage = ""
  if (!sessionData?.session) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nickname: nickname || DEFAULT_WECHAT_NICKNAME,
        avatar_url: avatarUrl || null,
      },
      app_metadata: trustedWechatIdentityMetadata,
    })
    if (created.error) {
      createErrorMessage =
        metadataText(created.error, "message") || "create_failed"
    }
    const createdSignIn = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    sessionData = createdSignIn.data
    signInError = createdSignIn.error
  }

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
    ...publicUserMetadata(user.user_metadata),
    nickname: nextNickname,
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  }
  const nextAppMetadata = {
    ...metadataRecord(user.app_metadata),
    ...trustedWechatIdentityMetadata,
  }

  let responseUser = adminMigratedUser
  if (!responseUser) {
    const {
      data: updatedUserData,
      error: updatedUserError,
    } = await admin.auth.admin.updateUserById(user.id, {
      ...(migratingLegacyUnionPrincipal ? { email, password } : {}),
      app_metadata: nextAppMetadata,
      user_metadata: nextUserMetadata,
    })
    if (updatedUserError || !updatedUserData?.user) {
      return NextResponse.json(
        { error: "trusted_identity_metadata_update_failed" },
        { status: 500 },
      )
    }
    responseUser = updatedUserData.user
  }

  const { error: profileUpsertError } = await admin
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
  if (profileUpsertError) {
    return NextResponse.json(
      { error: "profile_upsert_failed" },
      { status: 500 },
    )
  }

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
