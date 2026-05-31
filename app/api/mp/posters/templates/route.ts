import { NextResponse } from "next/server"

import { getTemplateLayoutMap, listPublicPosterLayoutPresets } from "@/lib/posters/layout-presets"
import { getPublicPosterTemplates } from "@/lib/posters/templates"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    ok: true,
    templates: getPublicPosterTemplates(),
    layoutPresets: listPublicPosterLayoutPresets(),
    templateLayoutMap: getTemplateLayoutMap(),
  })
}
