import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"

import { uploadBufferAsset } from "@/lib/xhs/assets.server"
import { getXhsAssetsBucket } from "@/lib/xhs/assets.server"
import { resolveBillingContext, trackServerEvent } from "@/lib/xhs/proxy.server"
import type { PosterAssetKind } from "@/lib/posters/intake"

export const runtime = "nodejs"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_KINDS = new Set<PosterAssetKind>(["logo", "store", "product", "people"])
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"])

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)
}

function pickExt(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

export async function POST(request: NextRequest) {
  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: "invalid_form_data" }, { status: 400 })

  const rawKind = String(form.get("kind") || "").trim()
  const kind = rawKind as PosterAssetKind
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ ok: false, error: "invalid_asset_kind" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "unsupported_image_type" }, { status: 400 })
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "image_too_large", maxBytes: MAX_IMAGE_BYTES }, { status: 400 })
  }

  const sessionId = safeId(String(form.get("sessionId") || "")) || randomUUID()
  const ext = pickExt(file.type)
  const bucket = getXhsAssetsBucket()
  const path = `posters/assets/${billing.ctx.userId}/${sessionId}/${kind}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const uploaded = await uploadBufferAsset({
    bucket,
    path,
    buffer,
    contentType: file.type,
  })

  await trackServerEvent({
    request,
    event: "poster_asset_upload",
    props: { source: "mp", kind, contentType: file.type, bytes: file.size },
  })

  return NextResponse.json({
    ok: true,
    sessionId,
    assetRef: {
      kind,
      bucket: uploaded.bucket,
      path: uploaded.path,
      contentType: uploaded.contentType,
    },
  })
}
