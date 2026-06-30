import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()
  } catch (error) {
    const appAuthError = appAuthConfigurationErrorResponse(error)
    if (appAuthError) return appAuthError
    throw error
  }

  return NextResponse.json({ ok: true })
}
