import { NextResponse } from "next/server"

import {
  getPosterTemplateLayoutMap,
  getPosterTemplateVisualStyleMap,
  getPublicPosterLayoutPresets,
  getPublicPosterTemplates,
  getPublicPosterVisualStylePresets,
} from "@/lib/posters/templates"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    ok: true,
    templates: getPublicPosterTemplates(),
    layoutPresets: getPublicPosterLayoutPresets(),
    templateLayoutMap: getPosterTemplateLayoutMap(),
    visualStylePresets: getPublicPosterVisualStylePresets(),
    templateVisualStyleMap: getPosterTemplateVisualStyleMap(),
  })
}
