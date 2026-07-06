import "server-only"

import { queryAliyunRds } from "@/lib/aliyun-rds/postgres.server"
import type { AliyunRdsAppAuthSource } from "@/lib/aliyun-rds/app-auth.server"

export type AppAuthTokenRevocationInput = {
  tokenHash: string
  source: AliyunRdsAppAuthSource
  userId: string
  deviceId?: string | null
  revokedAt?: Date
  expiresAt?: Date | null
}

export type AppAuthTokenRevocationCheck = {
  tokenHash: string
  source?: AliyunRdsAppAuthSource
  userId?: string | null
}

type RevokedTokenRow = {
  token_hash: string
}

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function revokeAliyunRdsAppAuthToken(input: AppAuthTokenRevocationInput) {
  const tokenHash = requireSha256TokenHash(input.tokenHash)
  const source = requireAuthSource(input.source)
  const userId = requireUserId(input.userId)
  const deviceId = cleanOptionalText(input.deviceId, 120)
  const revokedAt = isoTimestamp(input.revokedAt || new Date(), "revoked_at")
  const expiresAt = input.expiresAt ? isoTimestamp(input.expiresAt, "expires_at") : null

  await queryAliyunRds(
    `
      insert into public.app_auth_token_revocations (
        token_hash,
        auth_source,
        user_id,
        device_id,
        revoked_at,
        expires_at
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (token_hash) do update set
        auth_source = excluded.auth_source,
        user_id = excluded.user_id,
        device_id = excluded.device_id,
        revoked_at = excluded.revoked_at,
        expires_at = excluded.expires_at
    `,
    [tokenHash, source, userId, deviceId, revokedAt, expiresAt],
  )

  return { ok: true }
}

export async function isAliyunRdsAppAuthTokenRevoked(input: AppAuthTokenRevocationCheck) {
  const tokenHash = requireSha256TokenHash(input.tokenHash)
  const source = input.source ? requireAuthSource(input.source) : null
  const userId = input.userId ? requireUserId(input.userId) : null

  const result = await queryAliyunRds<RevokedTokenRow>(
    `
      select token_hash
      from public.app_auth_token_revocations
      where token_hash = $1
        and ($2::text is null or auth_source = $2)
        and ($3::uuid is null or user_id = $3)
        and (expires_at is null or expires_at > now())
      limit 1
    `,
    [tokenHash, source, userId],
  )

  return Boolean(result.rowCount)
}

function requireSha256TokenHash(value: string) {
  const tokenHash = String(value || "").trim().toLowerCase()
  if (!SHA256_HEX_PATTERN.test(tokenHash)) {
    throw new Error("app_auth_revocation_sha256_token_hash_required")
  }
  return tokenHash
}

function requireAuthSource(value: AliyunRdsAppAuthSource) {
  if (value !== "aliyun_test_login" && value !== "supabase") {
    throw new Error(`app_auth_revocation_source_invalid:${String(value || "")}`)
  }
  return value
}

function requireUserId(value: string) {
  const userId = String(value || "").trim()
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("app_auth_revocation_user_id_invalid")
  }
  return userId
}

function cleanOptionalText(value: string | null | undefined, maxLength: number) {
  const text = String(value || "").trim()
  if (!text) return null
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function isoTimestamp(value: Date, label: string) {
  const time = value.getTime()
  if (!Number.isFinite(time)) throw new Error(`app_auth_revocation_${label}_invalid`)
  return value.toISOString()
}
