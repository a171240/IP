import { NextRequest, NextResponse } from "next/server"

import { isAppVoiceCoachProductionRepositoryModeConfigured } from "@/lib/aliyun-rds/app-voice-coach-runtime-config.server"
import { isAliyunRdsConfigured } from "@/lib/aliyun-rds/postgres.server"
import { isAliyunRdsServiceRecordOssConfigured } from "@/lib/aliyun-rds/service-record-oss.server"

export const runtime = "nodejs"

const LEGACY_REQUIRED_RUNTIME_GROUPS = {
  supabase: [
    ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_IPgongchang_SUPABASE_URL", "IPgongchang_SUPABASE_URL"],
    [
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_IPgongchang_SUPABASE_ANON_KEY",
      "IPgongchang_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_IPgongchang_SUPABASE_PUBLISHABLE_KEY",
      "IPgongchang_SUPABASE_PUBLISHABLE_KEY",
    ],
    ["SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SERVICE_ROLE_KEY", "IPgongchang_SUPABASE_SECRET_KEY"],
  ],
  appWechatLogin: [
    ["WECHAT_LOGIN_SECRET"],
    ["WECHAT_OPEN_APP_ID", "WECHAT_APP_APPID", "WECHAT_APP_ID"],
    ["WECHAT_OPEN_APP_SECRET", "WECHAT_APP_SECRET", "WECHAT_OPEN_SECRET"],
  ],
  legalLinks: [["PRIVACY_POLICY_URL"], ["TERMS_URL"]],
  aliyunOss: [
    ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID"],
    ["ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
    ["ALIYUN_OSS_BUCKET", "SERVICE_RECORD_OSS_BUCKET"],
  ],
  bailianAsr: [["DASHSCOPE_API_KEY", "BAILIAN_API_KEY", "ALIBABA_CLOUD_BAILIAN_API_KEY"]],
  serviceRecordSummary: [["SERVICE_RECORD_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"]],
  volcSpeech: [["VOLC_SPEECH_APP_ID"], ["VOLC_SPEECH_ACCESS_TOKEN"]],
} as const

const ALIYUN_REQUIRED_RUNTIME_GROUPS = {
  bailianAsr: [["DASHSCOPE_API_KEY", "BAILIAN_API_KEY", "ALIBABA_CLOUD_BAILIAN_API_KEY"]],
  serviceRecordSummary: [["SERVICE_RECORD_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"]],
  volcSpeech: [["VOLC_SPEECH_APP_ID"], ["VOLC_SPEECH_ACCESS_TOKEN"]],
} as const

const LEGAL_LINK_KEYS = ["PRIVACY_POLICY_URL", "TERMS_URL"] as const
const DISALLOWED_LEGAL_HOSTS = new Set([
  "ip.ipgongchang.xin",
  "ipnrgc.com",
  "www.ipnrgc.com",
])

function isReadyEnvValue(value: unknown) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''" && !text.startsWith("TODO_"))
}

function isReadyLegalUrl(value: unknown) {
  if (!isReadyEnvValue(value)) return false
  let parsed: URL
  try {
    parsed = new URL(String(value).trim())
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return false
  if (parsed.hostname.endsWith(".localhost")) return false
  if (parsed.hostname.includes("example.")) return false
  if (parsed.hostname.endsWith(".vercel.app")) return false
  if (DISALLOWED_LEGAL_HOSTS.has(parsed.hostname)) return false
  return true
}

function hasAnyEnv(names: readonly string[]) {
  return names.some((name) => isReadyEnvValue(process.env[name]))
}

function groupReady(groups: readonly (readonly string[])[]) {
  return groups.every((group) => hasAnyEnv(group))
}

function runtimeGroupReady(key: string, groups: readonly (readonly string[])[]) {
  if (key === "legalLinks") {
    return LEGAL_LINK_KEYS.every((name) => isReadyLegalUrl(process.env[name]))
  }
  return groupReady(groups)
}

function isAliyunProductionCnRuntime() {
  return process.env.APP_ENV === "production-cn" || process.env.APP_REGION === "cn-hangzhou"
}

function getWechatOpenAppReviewStatus() {
  return String(process.env.WECHAT_OPEN_APP_REVIEW_STATUS || "deferred").trim() || "deferred"
}

function getAliyunRuntimeChecks() {
  return {
    aliyunRds: isAliyunRdsConfigured(),
    voiceCoachTextRepository: isAppVoiceCoachProductionRepositoryModeConfigured(),
    legalLinks: LEGAL_LINK_KEYS.every((name) => isReadyLegalUrl(process.env[name])),
    aliyunOssRuntime: isAliyunRdsServiceRecordOssConfigured(),
    ...Object.fromEntries(
      Object.entries(ALIYUN_REQUIRED_RUNTIME_GROUPS).map(([key, groups]) => [
        key,
        groupReady(groups),
      ]),
    ),
  }
}

function getLegacyRuntimeChecks() {
  return Object.fromEntries(
    Object.entries(LEGACY_REQUIRED_RUNTIME_GROUPS).map(([key, groups]) => [
      key,
      runtimeGroupReady(key, groups),
    ]),
  )
}

export async function GET(request: NextRequest) {
  const strict = request.nextUrl.searchParams.get("strict") === "1"
  const productionCn = isAliyunProductionCnRuntime()
  const checks = productionCn ? getAliyunRuntimeChecks() : getLegacyRuntimeChecks()
  const missing = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([key]) => key)
  const ok = missing.length === 0

  return NextResponse.json(
    {
      ok,
      service: "meiye-huajing-app-api",
      env: process.env.APP_ENV || process.env.NODE_ENV || "unknown",
      region: process.env.APP_REGION || process.env.ALIYUN_REGION || "",
      mode: productionCn ? "aliyun-production-cn" : "legacy",
      checks,
      missing,
      deferred: productionCn
        ? {
            supabase: "not_required_for_aliyun_production_cn",
            appWechatLogin: getWechatOpenAppReviewStatus(),
          }
        : {},
    },
    { status: strict && !ok ? 503 : 200 },
  )
}
