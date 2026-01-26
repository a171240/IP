import { NextRequest } from "next/server"
import { handleActivationPost } from "@/lib/activation/handler"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleActivationPost(request)
}
