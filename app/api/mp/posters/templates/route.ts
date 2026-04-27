import { NextResponse } from "next/server"

import { getPublicPosterTemplates } from "@/lib/posters/templates"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    ok: true,
    templates: getPublicPosterTemplates(),
  })
}
