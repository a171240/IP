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

function parseEnvSet(key: string) {
  return new Set(
    readTextEnv(key)
      .split(/[,\s]+/)
      .map(value => value.trim())
      .filter(Boolean),
  )
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
