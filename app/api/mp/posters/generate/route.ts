import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  generateGptImage2,
  imageGenerationErrorStatus,
  publicImageGenerationErrorMessage,
} from "@/lib/posters/gpt-image-2.server"
import {
  buildFreeImagePrompt,
  getDefaultPosterLayoutPresetId,
  getDefaultPosterNegativePrompt,
  getDefaultPosterVisualStylePresetId,
  getMissingRequiredFields,
  getPosterLayoutPreset,
  getPosterTemplate,
  getPosterVisualStylePreset,
  renderPosterTemplate,
  type PosterQrState,
  type PosterOverlay,
} from "@/lib/posters/templates"
import { sanitizePosterTemplateFields } from "@/lib/posters/intake"
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
  kind: z.enum(["style", "logo", "store", "product", "people", "qr"]),
  bucket: z.string().trim().min(1).max(80),
  path: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(80),
})
const qrAssetRefSchema = assetRefSchema.refine((ref) => ref.kind === "qr", {
  message: "qrAssetRef_must_be_qr",
})

const fieldSourceSchema = z.object({
  value: z.string().trim().max(240).optional(),
  source: z.string().trim().max(80).optional(),
  visible: z.boolean().optional(),
  confidence: z.string().trim().max(40).optional(),
}).passthrough()

const qrStateSchema = z.object({
  hasQr: z.boolean().optional(),
  source: z.string().trim().max(80).optional(),
  reserveArea: z.boolean().optional(),
  compositeRequired: z.boolean().optional(),
}).passthrough()

const bodySchema = z.object({
  mode: z.enum(["template", "free"]),
  templateId: z.string().trim().max(40).optional().default(""),
  fields: z.record(z.string(), z.string().max(200)).optional().default({}),
  prompt: z.string().trim().max(4000).optional().default(""),
  posterPlan: z.any().optional(),
  visibleCopy: z.any().optional(),
  hiddenContext: z.any().optional(),
  sessionId: z.string().trim().max(80).optional().default(""),
  briefId: z.string().trim().max(80).optional().default(""),
  intakeReady: z.boolean().optional().default(false),
  intakeMissingFields: z.array(z.string().trim().max(80)).max(20).optional().default([]),
  action_code: z
    .enum(["poster.generate.image", "poster.rewrite.text", "poster.regenerate.image"])
    .optional()
    .default("poster.generate.image"),
  layoutPresetId: z.string().trim().max(80).optional().default(""),
  visualStylePresetId: z.string().trim().max(80).optional().default(""),
  fieldSources: z.record(z.string(), fieldSourceSchema).optional().default({}),
  qrState: qrStateSchema.optional().default({}),
  qrAssetRef: qrAssetRefSchema.optional(),
  allowMissingFields: z.boolean().optional().default(false),
  layoutReferenceMode: z.enum(["prompt-only", "image-reference", "none"]).optional().default("prompt-only"),
  assetRefs: z.array(assetRefSchema).max(6).optional().default([]),
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
    qr: "二维码",
  }

  const promptRefs = assetRefs.filter((ref) => ref.kind !== "qr")
  if (!promptRefs.length) return ""

  return [
    "",
    "参考素材使用规则：",
    ...promptRefs.map((ref, index) => `- 参考图 ${index + 1} 是${labels[ref.kind]}素材。`),
    promptRefs.some((ref) => ref.kind === "style")
      ? "- 风格/版式参考图只用于学习构图、配色、字体气质、留白比例和高级感；不要照抄其中的文字、Logo、人物、产品、价格或具体版面内容。"
      : "",
    promptRefs.some((ref) => ref.kind === "logo")
      ? "- Logo/门头素材必须在海报中可识别地出现，但允许按海报风格自然融入。"
      : "",
    "- 产品、门店、人物素材用于保持真实感和行业匹配，不要生成无关行业元素。",
    "- 不要添加真实平台 logo、二维码、电话、网址或未经提供的联系方式。",
  ]
    .filter(Boolean)
    .join("\n")
}

function qrCompositePromptBlock(qrState: PosterQrState) {
  if (!qrState.hasQr) return ""
  return [
    "",
    "二维码后合成规则：",
    "- 用户已上传二维码。二维码由小程序在保存时后合成，模型不要绘制、仿造、生成或扭曲二维码。",
    "- 在底部 CTA 附近或右下区域预留一块干净浅色可读空间，不要让人物、产品、主标题或价格压住这块区域。",
  ].join("\n")
}

function metadataObject(value: unknown, maxLength = 8000) {
  if (!value || typeof value !== "object") return null
  try {
    const text = JSON.stringify(value)
    if (text.length > maxLength) return { truncated: true }
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

async function assetRefsToImageUrls(opts: {
  bucket: string
  userId: string
  assetRefs: PosterAssetRef[]
}) {
  const imageUrls: string[] = []
  const safePrefix = `posters/assets/${opts.userId}/`

  for (const ref of opts.assetRefs.slice(0, 6)) {
    if (ref.kind === "qr") continue
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

function normalizeQrState(input: unknown, assetRefs: PosterAssetRef[], qrAssetRef?: PosterAssetRef): PosterQrState {
  const raw = input && typeof input === "object" ? input as PosterQrState : {}
  const hasQr = !!raw.hasQr || !!qrAssetRef || assetRefs.some((ref) => ref.kind === "qr")
  return {
    hasQr,
    source: String(raw.source || (hasQr ? "uploaded_asset" : "missing")).trim(),
    reserveArea: !!raw.reserveArea || hasQr,
    compositeRequired: !!raw.compositeRequired || hasQr,
  }
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
  let renderedFields: Record<string, string> = {}
  let fieldSafety: ReturnType<typeof sanitizePosterTemplateFields> | null = null
  let layoutPreset: ReturnType<typeof getPosterLayoutPreset> = null
  let visualStylePreset: ReturnType<typeof getPosterVisualStylePreset> = null
  let missingRequiredFields: string[] = []

  try {
    const validAssetRefs = input.assetRefs as PosterAssetRef[]
    const inputQrAssetRef = input.qrAssetRef as PosterAssetRef | undefined
    const qrAssetRef = inputQrAssetRef || validAssetRefs.find((ref) => ref.kind === "qr")
    const qrState = normalizeQrState(input.qrState, validAssetRefs, qrAssetRef)

    if (input.mode === "template") {
      const template = getPosterTemplate(input.templateId)
      if (!template) return NextResponse.json({ ok: false, error: "template_not_found" }, { status: 404 })

      const intakeMissingFields = input.intakeMissingFields.filter(Boolean)
      if (!input.intakeReady && intakeMissingFields.length && !input.allowMissingFields) {
        return NextResponse.json(
          { ok: false, error: "intake_not_ready", fields: intakeMissingFields },
          { status: 400 },
        )
      }

      missingRequiredFields = getMissingRequiredFields(template, input.fields)
      if (missingRequiredFields.length && !input.allowMissingFields) {
        return NextResponse.json({ ok: false, error: "missing_fields", fields: missingRequiredFields }, { status: 400 })
      }

      templateId = template.id
      size = input.size || template.defaultSize
      resolution = BASIC_POSTER_RESOLUTION
      fieldSafety = sanitizePosterTemplateFields(template.id, input.fields)
      layoutPreset =
        getPosterLayoutPreset(input.layoutPresetId || fieldSafety.fields._layoutPresetId || "") ||
        getPosterLayoutPreset(getDefaultPosterLayoutPresetId(template.id))
      visualStylePreset =
        getPosterVisualStylePreset(input.visualStylePresetId || fieldSafety.fields._visualStylePresetId || "") ||
        getPosterVisualStylePreset(getDefaultPosterVisualStylePresetId(template.id))
      renderedFields = {
        ...fieldSafety.fields,
        ...(layoutPreset
          ? {
              _layoutPresetId: layoutPreset.id,
              _layoutName: layoutPreset.name,
              _layoutPresetVersion: layoutPreset.version,
            }
          : {}),
        ...(visualStylePreset
          ? {
              _visualStylePresetId: visualStylePreset.id,
              _visualStyleName: visualStylePreset.name,
            }
          : {}),
      }
      const rendered = renderPosterTemplate(template, renderedFields, size, {
        layoutPresetId: layoutPreset?.id,
        visualStylePresetId: visualStylePreset?.id,
        qrState,
      })
      prompt = rendered.prompt
      negativePrompt = rendered.negativePrompt
      overlay = rendered.overlay
      warnings.push("模型会直接生成完整海报，请重点核对标题、价格、日期和地址。")
      warnings.push("如果中文有错字，使用“文字更严格版”重新生成。")
      if (missingRequiredFields.length) {
        warnings.push("部分必填信息缺失，已按模板默认值补齐，请核对。")
      }
      if (fieldSafety.sanitizedFields.length) {
        warnings.push("已自动移除不会印在海报上的用户指令文字。")
      }
    } else {
      if (!input.prompt.trim()) return NextResponse.json({ ok: false, error: "prompt_required" }, { status: 400 })
      prompt = [buildFreeImagePrompt(input.prompt), qrCompositePromptBlock(qrState)].filter(Boolean).join("\n")
      negativePrompt = getDefaultPosterNegativePrompt()
      overlay = { canvas: canvasForSize(size), slots: [] }
      warnings.push("自由生图不会自动校验商业海报文字，请生成后人工核对。")
    }

    const modelAssetRefs = validAssetRefs.filter((ref) => ref.kind !== "qr")
    if (modelAssetRefs.length) {
      prompt = [prompt, assetPromptBlock(modelAssetRefs)].filter(Boolean).join("\n")
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
        sanitized_count: fieldSafety?.sanitizedFields.length || 0,
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
    const imageUrls = modelAssetRefs.length
      ? await assetRefsToImageUrls({ bucket, userId: billing.ctx.userId, assetRefs: modelAssetRefs })
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
          fields: renderedFields,
          fieldSources: metadataObject(input.fieldSources),
          requestAudit: {
            rawFieldKeys: Object.keys(input.fields || {}).filter((key) => !key.startsWith("_")).sort(),
            missingRequiredFields,
            allowMissingFields: input.allowMissingFields,
            intakeReady: input.intakeReady,
            intakeMissingFields: input.intakeMissingFields,
            fieldSourceKeys: Object.keys(input.fieldSources || {}).sort(),
          },
          layoutPresetId: layoutPreset?.id || null,
          layoutPreset: layoutPreset ? {
            id: layoutPreset.id,
            name: layoutPreset.name,
            shortName: layoutPreset.shortName,
            description: layoutPreset.description,
            textDensity: layoutPreset.textDensity,
            directTextRisk: layoutPreset.directTextRisk,
            version: layoutPreset.version,
          } : null,
          visualStylePresetId: visualStylePreset?.id || null,
          visualStylePreset: visualStylePreset ? {
            id: visualStylePreset.id,
            name: visualStylePreset.name,
            shortName: visualStylePreset.shortName,
            description: visualStylePreset.description,
            textDensity: visualStylePreset.textDensity,
            directTextRisk: visualStylePreset.directTextRisk,
          } : null,
          qrState,
          qrAssetRef: qrAssetRef
            ? {
                kind: qrAssetRef.kind,
                bucket: qrAssetRef.bucket,
                path: qrAssetRef.path,
                contentType: qrAssetRef.contentType,
              }
            : null,
          layoutReferenceMode: input.layoutReferenceMode,
          posterPlan: metadataObject(input.posterPlan),
          visibleCopy: metadataObject(input.visibleCopy) || metadataObject(input.posterPlan?.visibleCopy),
          hiddenContext: metadataObject(input.hiddenContext) || metadataObject(input.posterPlan?.hiddenContext),
          prompt,
          negativePrompt,
          assetRefs: validAssetRefs.map((ref) => ({
            kind: ref.kind,
            bucket: ref.bucket,
            path: ref.path,
            contentType: ref.contentType,
          })),
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
      fields: renderedFields,
      fieldSources: input.fieldSources,
      missingRequiredFields,
      layoutPreset,
      visualStylePreset,
      visualStylePresetId: visualStylePreset?.id || "",
      qrState,
      qrAssetRef: qrAssetRef || null,
      safety: fieldSafety
        ? {
            sanitizedFields: fieldSafety.sanitizedFields,
            visibleCopyWarnings: fieldSafety.warnings,
          }
        : null,
    })
    setMpAiPointHeaders(res, charged)
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : "poster_generate_failed"
    const publicMessage = publicImageGenerationErrorMessage(error)
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
    return NextResponse.json({ ok: false, error: publicMessage }, { status: imageGenerationErrorStatus(error) })
  }
}
