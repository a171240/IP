import "server-only"

import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"
import type { AppAccountContext } from "@/lib/aliyun-rds/repositories/account-profile.server"

export type AppComplianceRequestKind = "account_deletion" | "personal_data_deletion"

export type AppComplianceRequestPayload = {
  confirmText?: unknown
  reason?: unknown
}

type AppComplianceRequestRow = {
  id: string
  kind: AppComplianceRequestKind | string | null
  status: string | null
  requested_at: string | null
}

const EXPECTED_COMPLETION = "15 个工作日内"
const CONTACT_CHANNEL = "应用内消息"
const MAX_REASON_LENGTH = 1000
const MAX_CONFIRM_TEXT_LENGTH = 120

export async function createAliyunRdsAppComplianceRequest({
  ctx,
  kind,
  payload,
}: {
  ctx: AppAccountContext
  kind: AppComplianceRequestKind
  payload: AppComplianceRequestPayload
}) {
  const reason = cleanText(payload.reason, MAX_REASON_LENGTH) || null
  const confirmText = cleanText(payload.confirmText, MAX_CONFIRM_TEXT_LENGTH) || null
  const requestedAt = new Date().toISOString()
  const result = await queryAliyunRds<AppComplianceRequestRow>(
    `
      insert into public.app_compliance_requests (
        company_id, store_id, membership_id, user_id, kind, status, reason,
        confirm_text, requested_at, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, 'received', $6, $7, $8, $8, $8)
      returning id, kind, status, requested_at
    `,
    [
      ctx.companyId,
      ctx.storeId,
      ctx.membershipId,
      ctx.userId,
      kind,
      reason,
      confirmText,
      requestedAt,
    ],
  )

  const request = result.rows[0]
  if (!request) throw new Error("account_compliance_request_create_failed")
  return toPublicComplianceRequest(request)
}

export function accountComplianceRequestSchemaMissing(error: unknown) {
  const code = String((error as { code?: unknown })?.code || "")
  const message = String((error as { message?: unknown })?.message || "")
  return (
    (code === "42P01" || code === "42703" || /does not exist|column .* does not exist/i.test(message)) &&
    /app_compliance_requests/i.test(message)
  )
}

function toPublicComplianceRequest(row: AppComplianceRequestRow) {
  return {
    id: String(row.id || ""),
    kind: row.kind || "",
    status: row.status || "received",
    requested_at: row.requested_at || null,
    expected_completion: EXPECTED_COMPLETION,
    contact_channel: CONTACT_CHANNEL,
  }
}

function cleanText(value: unknown, max: number) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}
