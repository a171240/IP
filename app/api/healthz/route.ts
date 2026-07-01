import { type NextRequest } from "next/server"

import { GET as appHealthGet } from "@/app/api/app/health/route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return appHealthGet(request)
}
