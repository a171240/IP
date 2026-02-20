import type { IngestErrorCode } from "@/lib/content-ingest/types"

const ERROR_STATUS_MAP: Record<IngestErrorCode, number> = {
  unsupported_platform: 400,
  invalid_link: 400,
  extract_failed: 502,
  private_or_deleted_content: 404,
}

export class IngestError extends Error {
  readonly code: IngestErrorCode
  readonly status: number

  constructor(code: IngestErrorCode, message: string, status?: number) {
    super(message)
    this.name = "IngestError"
    this.code = code
    this.status = status ?? ERROR_STATUS_MAP[code]
  }
}

export function isIngestError(error: unknown): error is IngestError {
  return error instanceof IngestError
}

export function toIngestError(error: unknown, fallbackCode: IngestErrorCode, fallbackMessage: string): IngestError {
  if (error instanceof IngestError) return error
  if (error instanceof Error) return new IngestError(fallbackCode, error.message)
  return new IngestError(fallbackCode, fallbackMessage)
}
