import { NextResponse } from "next/server"

import { IngestError, isIngestError } from "@/lib/content-ingest/errors"
import type { IngestErrorCode } from "@/lib/content-ingest/types"

export function ingestFailure(error_code: IngestErrorCode, message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error_code,
      message,
    },
    { status }
  )
}

export function ingestFailureFromUnknown(error: unknown, fallbackCode: IngestErrorCode = "extract_failed") {
  const ingestError = isIngestError(error)
    ? error
    : new IngestError(
        fallbackCode,
        error instanceof Error && error.message ? error.message : "内容导入失败"
      )

  return ingestFailure(ingestError.code, ingestError.message, ingestError.status)
}
