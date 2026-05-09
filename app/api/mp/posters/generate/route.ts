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
import {
  chargeMpAiPoints,
  refundMpAiPoints,
  resolveMpAiBillingContext,
  setMpAiPointHeaders,
  type MpAiBillingContext,
  type MpAiChargeResult,
} from "@/lib/mp/ai-points.server"
import { trackServerEvent } from "@/lib/xhs/proxy.server"
import { downloadAsset, getXhsAssetsBucket, uploadRemoteAssetToPath, uploadTextAsset } from "@/lib/xhs/assets.server"
import type { PosterAssetRef } from "@/lib/posters/intake"

export const runtime = "nodejs"
export const maxDuration = 300

const BASIC_POSTER_RESOLUTION = "1k" as const

const assetRefSchema = z.object({
  kind: z.enum(["style", "logo", "store", "product", "people"]),
  bucket: z.string().trim().min(1).max(80),
  path: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(80),
})

const bodySchema = z.object({
  mode: z.enum(["template", "free"]),
  templateId: z.string().trim().max(40).optional().default(""),
  fields: z.record(z.string(), z.string().max(200)).optional().default({}),
  prompt: z.string().trim().max(4000).optional().default(""),
  sessionId: z.string().trim().max(80).optional().default(""),
  briefId: z.string().trim().max(80).optional().default(""),
  action_code: z
    .enum(["poster.generate.image", "poster.rewrite.text", "poster.regenerate.image"])
    .optional()
    .default("poster.generate.image"),
  assetRefs: z.array(assetRefSchema).max(5).optional().default([]),
  size: z
    .enum(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21"])
    .optional(),
  resolution: z.enum(["1k"]).optional(),
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

function assetPromptBlock(assetRefs: PosterAssetRef[]) {
  if (!assetRefs.length) return ""

  const labels: Record<PosterAssetRef["kind"], string> = {
    style: "风格/版式参考",
    logo: "Logo/门头",
    store: "门店环境",
    product: "产品或服务图",
    people: "人物或案例图",
  }

  return [
    "",
    "参考素材使用规则：",
    ...assetRefs.map((ref, index) => `- 参考图 ${index + 1} 是${labels[ref.kind]}素材。`),
    assetRefs.some((ref) => ref.kind === "style")
      ? "- 风格/版式参考图只用于学习构图、配色、字体气质、留白比例和高级感；不要照抄其中的文字、Logo、人物、产品、价格或具体版面内容。"
      : "",
    assetRefs.some((ref) => ref.kind === "logo")
      ? "- Logo/门头素材必须在海报中可识别地出现，但允许按海报风格自然融入。"
      : "",
    "- 产品、门店、人物素材用于保持真实感和行业匹配，不要生成无关行业元素。",
    "- 不要添加真实平台 logo、二维码、电话、网址或未经提供的联系方式。",
  ]
    .filter(Boolean)
    .join("\n")
}

async function assetRefsToImageUrls(opts: {
  bucket: string
  userId: string
  assetRefs: PosterAssetRef[]
}) {
  const imageUrls: string[] = []
  const safePrefix = `posters/assets/${opts.userId}/`

  for (const ref of opts.assetRefs.slice(0, 5)) {
    if (ref.bucket !== opts.bucket) continue
    if (!ref.path.startsWith(safePrefix)) continue
    if (!ref.contentType.startsWith("image/")) continue

    const asset = await downloadAsset({ bucket: opts.bucket, path: ref.path })
    const contentType = asset.contentType || ref.contentType || "image/jpeg"
    if (!contentType.startsWith("image/")) continue
    const base64 = Buffer.from(asset.arrayBuffer).toString("base64")
    imageUrls.push(`data:${contentType};base64,${base64}`)
  }

  return imageUrls
}

async function persistPosterHistory(opts: {
  billing: MpAiBillingContext
  posterId: string
  templateId: string
  mode: string
  bucket: string
  path: string
  contentType: string
  size: string
  resolution: string
}) {
  try {
    await opts.billing.supabase.from("poster_generations").insert({
      id: opts.posterId,
      user_id: opts.billing.userId,
      mode: opts.mode,
      template_id: opts.templateId || null,
      image_bucket: opts.bucket,
      image_path: opts.path,
      content_type: opts.contentType,
      size: opts.size,
      resolution: opts.resolution,
    })
  } catch {
    // Database migration may not be applied yet; storage metadata remains the fallback.
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const billing = await resolveMpAiBillingContext(request)
  if (!billing.ok) return billing.error

  const input = parsed.data

  let charged: Extract<MpAiChargeResult, { ok: true }> | null = null
  let prompt = ""
  let negativePrompt = getDefaultPosterNegativePrompt()
  let overlay: PosterOverlay = { canvas: canvasForSize(input.size || "4:5"), slots: [] }
  let templateId = ""
  let size: PosterSize = input.size || "4:5"
  let resolution: PosterResolution = BASIC_POSTER_RESOLUTION
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
      resolution = BASIC_POSTER_RESOLUTION
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

    const validAssetRefs = input.assetRefs as PosterAssetRef[]
    if (validAssetRefs.length) {
      prompt = [prompt, assetPromptBlock(validAssetRefs)].filter(Boolean).join("\n")
    }

    const charge = await chargeMpAiPoints({
      request,
      ctx: billing.ctx,
      actionCode: input.action_code,
      businessObjectType: "poster_generation",
      metadata: {
        mode: input.mode,
        template_id: templateId || null,
        size,
        resolution,
      },
    })
    if (!charge.ok) return charge.error
    charged = charge

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
        actionCode: charged.actionCode,
        plan: billing.ctx.plan,
      },
    })

    const bucket = getXhsAssetsBucket()
    const imageUrls = validAssetRefs.length
      ? await assetRefsToImageUrls({ bucket, userId: billing.ctx.userId, assetRefs: validAssetRefs })
      : []
    const generated = await generateGptImage2({ prompt, negativePrompt, size, resolution, imageUrls })
    const posterId = randomUUID()
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
          sessionId: input.sessionId || null,
          briefId: input.briefId || null,
          bucket,
          path: uploaded.path,
          contentType: uploaded.contentType,
          size,
          resolution,
          assetRefs: validAssetRefs.map((ref) => ({ kind: ref.kind, path: ref.path })),
          createdAt: new Date().toISOString(),
        },
        null,
        2
      ),
    })

    await persistPosterHistory({
      billing: billing.ctx,
      posterId,
      templateId,
      mode: input.mode,
      bucket,
      path: uploaded.path,
      contentType: uploaded.contentType,
      size,
      resolution,
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
    setMpAiPointHeaders(res, charged)
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : "poster_generate_failed"
    if (charged?.ok && charged.cost > 0 && !charged.unlimited) {
      try {
        await refundMpAiPoints({
          ctx: billing.ctx,
          charge: charged,
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
