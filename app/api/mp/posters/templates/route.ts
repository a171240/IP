import { NextResponse } from "next/server"

import { getTemplateLayoutMap, listPublicPosterLayoutPresets } from "@/lib/posters/layout-presets"
import { getPublicPosterTemplates } from "@/lib/posters/templates"
import { getTemplateVisualStyleMap, listPublicPosterVisualStylePresets } from "@/lib/posters/visual-style-presets"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    ok: true,
    templates: getPublicPosterTemplates(),
    layoutPresets: listPublicPosterLayoutPresets(),
    templateLayoutMap: getTemplateLayoutMap(),
    visualStylePresets: listPublicPosterVisualStylePresets(),
    templateVisualStyleMap: getTemplateVisualStyleMap(),
  })
}
