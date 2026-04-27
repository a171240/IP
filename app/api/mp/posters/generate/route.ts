import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { generateGptImage2 } from "@/lib/posters/gpt-image-2.server"
import {
  buildFreeImagePrompt,
  getDefaultPosterNegativePrompt,
  getMissingRequiredFields,
  getPosterTemplate,
  renderPosterTemplate,
  type PosterOverlay,
} from "@/lib/posters/templates"
import { refundCredits } from "@/lib/pricing/profile.server"
import { chargeCredits, resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
import { getXhsAssetsBucket, uploadRemoteAssetToPath, uploadTextAsset } from "@/lib/xhs/assets.server"

export const runtime = "nodejs"

const bodySchema = z.object({
  mode: z.enum(["template", "free"]),
  templateId: z.string().trim().max(40).optional().default(""),
  fields: z.record(z.string(), z.string().max(200)).optional().default({}),
  prompt: z.string().trim().max(4000).optional().default(""),
  size: z
    .enum(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])
    .optional(),
  resolution: z.enum(["1k", "2k", "4k"]).optional(),
})

type PosterRequest = z.infer<typeof bodySchema>
type PosterSize = NonNullable<PosterRequest["size"]>
type PosterResolution = NonNullable<PosterRequest["resolution"]>

function canvasForSize(size: PosterSize): PosterOverlay["canvas"] {
  if (size === "3:4") return { width: 900, height: 1200, size }
  if (size === "9:16") return { width: 900, height: 1600, size }
  if (size === "1:1") return { width: 1000, height: 1000, size }
  if (size === "16:9") return { width: 1600, height: 900, size }
  return { width: 900, height: 1125, size }
}

function metadataPath(posterId: string) {
  return `posters/index/${posterId}.json`
}

function posterImagePath(userId: string, posterId: string) {
  return `posters/${userId}/${posterId}/image`
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const input = parsed.data

  let charged: Awaited<ReturnType<typeof chargeCredits>> | null = null
  let prompt = ""
  let negativePrompt = getDefaultPosterNegativePrompt()
  let overlay: PosterOverlay = { canvas: canvasForSize(input.size || "4:5"), slots: [] }
  let templateId = ""
  let size: PosterSize = input.size || "4:5"
  let resolution: PosterResolution = input.resolution || "2k"
  const warnings: string[] = []

  try {
    if (input.mode === "template") {
      const template = getPosterTemplate(input.templateId)
      if (!template) return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 })

      const missing = getMissingRequiredFields(template, input.fields)
      if (missing.length) {
        return NextResponse.json({ ok: false, error: "missing_fields", fields: missing }, { status: 400 })
      }

      templateId = template.id
      size = input.size || template.defaultSize
      resolution = input.resolution || template.defaultResolution
      const rendered = renderPosterTemplate(template, input.fields, size)
      prompt = rendered.prompt
      negativePrompt = rendered.negativePrompt
      overlay = rendered.overlay
      warnings.push("模型会直接生成完整海报，请重点核对标题、价格、日期和地址。")
      warnings.push("如果中文有错字，使用“文字更严格版”重新生成。")
    } else {
      if (!input.prompt.trim()) return NextResponse.json({ ok: false, error: "prompt_required" }, { status: 400 })
      prompt = buildFreeImagePrompt(input.prompt)
      negativePrompt = getDefaultPosterNegativePrompt()
      overlay = { canvas: canvasForSize(size), slots: [] }
      warnings.push("自由生图不会自动校验商业海报文字，请生成后人工核对。")
    }

    charged = await chargeCredits({
      request,
      ctx: billing.ctx,
      requiredPlan: "basic",
      allowCreditsOverride: true,
      baseCost: 4,
      stepId: "poster:generate",
    })
    if (!charged.ok) return charged.error

    await trackServerEvent({
      request,
      event: "poster_generate_submit",
      props: {
        source: "mp",
        mode: input.mode,
        templateId,
        size,
        resolution,
        cost: charged.cost,
        plan: billing.ctx.plan,
        planOk: charged.planOk,
      },
    })

    const generated = await generateGptImage2({ prompt, negativePrompt, size, resolution })
    const posterId = randomUUID()
    const bucket = getXhsAssetsBucket()
    const uploaded = await uploadRemoteAssetToPath({
      bucket,
      path: posterImagePath(billing.ctx.userId, posterId),
      url: generated.imageUrl,
    })

    await uploadTextAsset({
      bucket,
      path: metadataPath(posterId),
      text: JSON.stringify(
        {
          posterId,
          userId: billing.ctx.userId,
          mode: input.mode,
          templateId,
          bucket,
          path: uploaded.path,
          contentType: uploaded.contentType,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      ),
    })

    await trackServerEvent({
      request,
      event: "poster_generate_success",
      props: { source: "mp", mode: input.mode, templateId, size, resolution, cost: charged.cost },
    })

    const res = NextResponse.json({
      ok: true,
      posterId,
      status: "completed",
      imageUrl: `/api/mp/posters/images/${posterId}`,
      prompt,
      negativePrompt,
      warnings,
      overlay,
    })
    res.headers.set("X-Credits-Cost", String(charged.cost))
    res.headers.set("X-Credits-Remaining", charged.unlimited ? "unlimited" : String(charged.remaining))
    res.headers.set("X-Credits-Unlimited", charged.unlimited ? "1" : "0")
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : "poster_generate_failed"
    if (charged?.ok && charged.cost > 0 && !charged.unlimited) {
      try {
        await refundCredits({
          userId: billing.ctx.userId,
          amount: charged.cost,
          stepId: "poster:generate",
          reason: "poster_generate_failed",
          metadata: { error: message.slice(0, 200) },
        })
      } catch {
        // Keep the original generation error; refund failure is logged separately via server logs.
      }
    }
    await trackServerEvent({
      request,
      event: "poster_generate_fail",
      props: { source: "mp", mode: input.mode, templateId, error: message.slice(0, 200) },
    })
    return NextResponse.json({ ok: false, error: message }, { status: message === "image_task_timeout" ? 504 : 502 })
  }
}
