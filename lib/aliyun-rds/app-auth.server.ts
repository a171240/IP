import "server-only"

import { createHash, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import type { AppAuthUser } from "@/lib/aliyun-rds/repositories/account-profile.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"

export type AliyunRdsAppAuthSource = "aliyun_test_login" | "supabase"

export type AliyunRdsAppAuth = {
  source: AliyunRdsAppAuthSource
  user: AppAuthUser
}

type SupabaseAuthUser = {
  id?: unknown
  email?: string | null
  user_metadata?: unknown
}

type ConfiguredTestLoginUser = Record<string, unknown>

export class AliyunRdsAppAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AliyunRdsAppAuthConfigurationError"
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function appAuthRequiredResponse() {
  return NextResponse.json(
    { ok: false, error: "请先登录", code: "auth_required" },
    { status: 401 },
  )
}

export function appAuthConfigurationErrorResponse(error: unknown) {
  if (!(error instanceof AliyunRdsAppAuthConfigurationError)) return null
  return NextResponse.json(
    { ok: false, error: error.message, code: "app_auth_not_configured" },
    { status: 503 },
  )
}

export async function resolveAliyunRdsAppAuthUser(
  request: NextRequest,
): Promise<AliyunRdsAppAuth | null> {
  const bearerToken = getBearerToken(request)
  if (bearerToken) {
    const testLoginUser = resolveConfiguredTestLoginUser(request, bearerToken)
    if (testLoginUser) return { source: "aliyun_test_login", user: testLoginUser }
  }

  const supabaseUser = await resolveSupabaseUser(request)
  if (!supabaseUser) return null

  return {
    source: "supabase",
    user: {
      id: String(supabaseUser.id || ""),
      email: supabaseUser.email ?? null,
      user_metadata: supabaseUser.user_metadata || {},
    },
  }
}

function resolveConfiguredTestLoginUser(request: NextRequest, token: string): AppAuthUser | null {
  if (!isTruthy(readTextEnv("APP_TEST_LOGIN_ENABLED"))) return null

  const multiUser = resolveConfiguredTestLoginUsersJsonUser(request, token)
  if (multiUser) return multiUser

  if (!requestDeviceAllowed(request)) return null
  if (!testTokenMatches(token)) return null

  const userId = readTextEnv("APP_TEST_LOGIN_USER_ID")
  if (!UUID_PATTERN.test(userId)) {
    throw new AliyunRdsAppAuthConfigurationError("APP_TEST_LOGIN_USER_ID must be a UUID")
  }

  const email = readTextEnv("APP_TEST_LOGIN_EMAIL") || "app-test-user@ipgongchang.xin"
  const nickname = readTextEnv("APP_TEST_LOGIN_NICKNAME") || "美业话镜测试账号"
  const metadata = compactRecord({
    nickname,
    auth_source: "aliyun_test_login",
    account_role: readTextEnv("APP_TEST_LOGIN_ACCOUNT_ROLE"),
    company_id: readTextEnv("APP_TEST_LOGIN_COMPANY_ID"),
    company_name: readTextEnv("APP_TEST_LOGIN_COMPANY_NAME"),
    store_id: readTextEnv("APP_TEST_LOGIN_STORE_ID"),
    store_name: readTextEnv("APP_TEST_LOGIN_STORE_NAME"),
    service_plan_label: readTextEnv("APP_TEST_LOGIN_SERVICE_PLAN_LABEL"),
  })

  return { id: userId, email, user_metadata: metadata }
}

function resolveConfiguredTestLoginUsersJsonUser(request: NextRequest, token: string): AppAuthUser | null {
  const users = parseConfiguredTestLoginUsersJson()
  if (!users.length) return null

  for (const user of users) {
    if (!configuredTestLoginUserTokenMatches(user, token)) continue
    if (!configuredTestLoginUserDeviceAllowed(request, user)) return null
    return buildConfiguredTestLoginJsonUser(user)
  }

  return null
}

async function resolveSupabaseUser(request: NextRequest): Promise<SupabaseAuthUser | null> {
  try {
    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user || null
  } catch (error) {
    if (isAliyunProductionCnRuntime()) return null
    throw error
  }
}

function getBearerToken(request: NextRequest): string {
  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ""
}

function requestDeviceAllowed(request: NextRequest) {
  const allowList = parseEnvSet("APP_TEST_LOGIN_DEVICE_IDS")
  return requestDeviceAllowedBySet(request, allowList)
}

function requestDeviceAllowedBySet(request: NextRequest, allowList: Set<string>) {
  if (!allowList.size) return false
  if (allowList.has("*")) return true
  const deviceId = String(request.headers.get("x-device-id") || "").trim()
  return Boolean(deviceId && allowList.has(deviceId))
}

function testTokenMatches(token: string) {
  const configuredToken = readTextEnv("APP_TEST_LOGIN_TOKEN")
  if (configuredToken && safeEqual(token, configuredToken)) return true

  const configuredHash = readTextEnv("APP_TEST_LOGIN_TOKEN_SHA256").replace(/^sha256:/i, "")
  if (!configuredHash) return false
  return safeEqual(sha256(token), configuredHash.toLowerCase())
}

function parseConfiguredTestLoginUsersJson(): ConfiguredTestLoginUser[] {
  const raw = readTextEnv("APP_TEST_LOGIN_USERS_JSON")
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AliyunRdsAppAuthConfigurationError("APP_TEST_LOGIN_USERS_JSON must be valid JSON")
  }

  if (!Array.isArray(parsed)) {
    throw new AliyunRdsAppAuthConfigurationError("APP_TEST_LOGIN_USERS_JSON must be a JSON array")
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new AliyunRdsAppAuthConfigurationError(`APP_TEST_LOGIN_USERS_JSON[${index}] must be an object`)
    }
    return item as ConfiguredTestLoginUser
  })
}

function configuredTestLoginUserTokenMatches(user: ConfiguredTestLoginUser, token: string) {
  const configuredHash = recordText(user, "token_sha256", "tokenSha256").replace(/^sha256:/i, "").toLowerCase()
  if (!configuredHash) {
    throw new AliyunRdsAppAuthConfigurationError("APP_TEST_LOGIN_USERS_JSON entries require token_sha256")
  }
  if (!/^[a-f0-9]{64}$/.test(configuredHash)) {
    throw new AliyunRdsAppAuthConfigurationError("APP_TEST_LOGIN_USERS_JSON token_sha256 must be a sha256 hex digest")
  }
  return safeEqual(sha256(token), configuredHash)
}

function configuredTestLoginUserDeviceAllowed(request: NextRequest, user: ConfiguredTestLoginUser) {
  const userDeviceIds = recordText(user, "device_ids", "deviceIds")
  if (userDeviceIds) return requestDeviceAllowedBySet(request, parseTextSet(userDeviceIds))
  return requestDeviceAllowed(request)
}

function buildConfiguredTestLoginJsonUser(user: ConfiguredTestLoginUser): AppAuthUser {
  const userId = recordText(user, "user_id", "userId")
  if (!UUID_PATTERN.test(userId)) {
    throw new AliyunRdsAppAuthConfigurationError("APP_TEST_LOGIN_USERS_JSON user_id must be a UUID")
  }

  const email = recordText(user, "email") || `app-test-${userId}@ipgongchang.xin`
  const nickname = recordText(user, "nickname", "name") || "美业话镜测试账号"
  const metadata = compactRecord({
    nickname,
    auth_source: "aliyun_test_login",
    account_role: recordText(user, "account_role", "accountRole"),
    company_id: recordText(user, "company_id", "companyId"),
    company_name: recordText(user, "company_name", "companyName"),
    store_id: recordText(user, "store_id", "storeId"),
    store_name: recordText(user, "store_name", "storeName"),
    service_plan_label: recordText(user, "service_plan_label", "servicePlanLabel"),
  })

  return { id: userId, email, user_metadata: metadata }
}

function parseEnvSet(key: string) {
  return parseTextSet(readTextEnv(key))
}

function parseTextSet(value: string) {
  return new Set(
    value
      .split(/[,\s]+/)
      .map(value => value.trim())
      .filter(Boolean),
  )
}

function recordText(record: ConfiguredTestLoginUser, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") return value.trim()
  }
  return ""
}

function isAliyunProductionCnRuntime() {
  return process.env.APP_ENV === "production-cn" || process.env.APP_REGION === "cn-hangzhou"
}

function readTextEnv(key: string) {
  return String(process.env[key] || "").trim()
}

function isTruthy(value: string) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function compactRecord(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value))
}
