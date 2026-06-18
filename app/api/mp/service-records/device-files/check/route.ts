import { NextRequest, NextResponse } from "next/server"

import {
  cleanText,
  integerValue,
  isRecord,
  jsonError,
  resolveServiceRecordAuth,
} from "@/lib/service-records/server"
import {
  findReusableServiceRecordSegment,
  findReusableServiceRecordSegmentBySourceMeta,
  reusableSegmentHasAudio,
  sourceFileMetadataFromPayload,
} from "@/lib/service-records/segments.server"

export const runtime = "nodejs"

function sourceKeyPart(value: unknown, fallback = "unknown") {
  const text = cleanText(value, 160) || fallback
  return text.replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 120) || fallback
}

function fallbackSourceFileKey(file: Record<string, unknown>) {
  return [
    "l12",
    sourceKeyPart(file.device_name || "L12"),
    sourceKeyPart(file.device_file_name),
    String(integerValue(file.device_file_time, 0)),
    String(integerValue(file.device_file_size, 0)),
  ].join(":")
}

export async function POST(request: NextRequest) {
  const auth = await resolveServiceRecordAuth(request)
  if (!auth.ok) return auth.error
  const { admin, ctx } = auth.value
  const scope = {
    company_id: ctx.companyId || null,
    store_id: ctx.storeId || null,
    user_id: ctx.userId || "",
  }

  const body = await request.json().catch(() => null)
  const payload = isRecord(body) ? body : {}
  const files = Array.isArray(payload.files) ? payload.files.slice(0, 80) : []

  const checked = []
  for (const raw of files) {
    const file = isRecord(raw) ? raw : {}
    const withFallbackKey = {
      ...file,
      source_file_key: cleanText(file.source_file_key, 360) || fallbackSourceFileKey(file),
    }
    const sourceMeta = sourceFileMetadataFromPayload(withFallbackKey)
    let reusable = sourceMeta.source_file_key
      ? await findReusableServiceRecordSegment(admin, scope, String(sourceMeta.source_file_key))
      : null
    if (!reusableSegmentHasAudio(reusable)) {
      reusable = await findReusableServiceRecordSegmentBySourceMeta(admin, scope, sourceMeta)
    }
    const alreadyUploaded = reusableSegmentHasAudio(reusable)
    checked.push({
      source_file_key: sourceMeta.source_file_key || "",
      device_id: sourceMeta.device_id || "",
      device_name: sourceMeta.device_name || "",
      device_file_name: sourceMeta.device_file_name || "",
      device_file_time: sourceMeta.device_file_time || 0,
      device_file_size: sourceMeta.device_file_size || 0,
      already_uploaded: alreadyUploaded,
      status: alreadyUploaded ? "uploaded" : "new",
      segment_id: alreadyUploaded ? reusable.id : "",
      session_id: alreadyUploaded ? reusable.session_id : "",
      object_key: alreadyUploaded ? reusable.storage_path : "",
      asr_status: alreadyUploaded ? reusable.asr_status || "" : "",
    })
  }

  return NextResponse.json({
    ok: true,
    files: checked,
  })
}
