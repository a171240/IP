import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const REQUIRED_RUNTIME_GROUPS = {
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
  aliyunOss: [
    ["ALIYUN_OSS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID"],
    ["ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"],
    ["ALIYUN_OSS_BUCKET", "SERVICE_RECORD_OSS_BUCKET"],
  ],
  bailianAsr: [["DASHSCOPE_API_KEY", "BAILIAN_API_KEY", "ALIBABA_CLOUD_BAILIAN_API_KEY"]],
  serviceRecordSummary: [["SERVICE_RECORD_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"]],
  volcSpeech: [["VOLC_SPEECH_APP_ID"], ["VOLC_SPEECH_ACCESS_TOKEN"]],
} as const

function isReadyEnvValue(value: unknown) {
  const text = String(value || "").trim()
  return Boolean(text && text !== "\"\"" && text !== "''" && !text.startsWith("TODO_"))
}

function hasAnyEnv(names: readonly string[]) {
  return names.some((name) => isReadyEnvValue(process.env[name]))
}

function groupReady(groups: readonly (readonly string[])[]) {
  return groups.every((group) => hasAnyEnv(group))
}

export async function GET(request: NextRequest) {
  const strict = request.nextUrl.searchParams.get("strict") === "1"
  const checks = Object.fromEntries(
    Object.entries(REQUIRED_RUNTIME_GROUPS).map(([key, groups]) => [
      key,
      groupReady(groups),
    ]),
  )
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
      checks,
      missing,
    },
    { status: strict && !ok ? 503 : 200 },
  )
}
