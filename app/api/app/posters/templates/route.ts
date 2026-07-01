import { NextRequest, NextResponse } from "next/server"

import {
  appContentContextPayload,
  appContentWorkflowErrorResponse,
  resolveAppContentWorkflowContext,
} from "@/lib/aliyun-rds/repositories/app-content-workflows.server"
import {
  getPosterTemplateLayoutMap,
  getPosterTemplateVisualStyleMap,
  getPublicPosterLayoutPresets,
  getPublicPosterTemplates,
  getPublicPosterVisualStylePresets,
} from "@/lib/posters/templates"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAppContentWorkflowContext(request)
    if ("error" in resolved) return resolved.error

    return NextResponse.json({
      ok: true,
      status: "ready",
      context: appContentContextPayload(resolved.ctx, resolved.scope),
      templates: getPublicPosterTemplates(),
      layoutPresets: getPublicPosterLayoutPresets(),
      templateLayoutMap: getPosterTemplateLayoutMap(),
      visualStylePresets: getPublicPosterVisualStylePresets(),
      templateVisualStyleMap: getPosterTemplateVisualStyleMap(),
    })
  } catch (error) {
    return appContentWorkflowErrorResponse(error, "app_poster_templates_failed")
  }
}
