import { createHmac } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import {
  appAuthConfigurationErrorResponse,
  appAuthRequiredResponse,
  resolveAliyunRdsAppAuthUser,
} from "@/lib/aliyun-rds/app-auth.server"
import {
  AliyunRdsConfigurationError,
  isAliyunRdsRuntimeUnavailableError,
} from "@/lib/aliyun-rds/postgres.server"
import {
  getAliyunRdsAppAccountContext,
  type AppAccountContext,
} from "@/lib/aliyun-rds/repositories/account-profile.server"

export const runtime = "nodejs"

const ASSET_SIGN_READ_TTL_SECONDS = 300
const CUSTOMER_KNOWLEDGE_PREFIX = "customer-knowledge"
const PROVIDER = "aliyun_oss"
const VISIBILITY = "signed_url"

type AssetSignReadPayload = {
  asset_ref?: unknown
  company_id?: unknown
  store_id?: unknown
}

type AssetSignReadScope = {
  companyId: string
  storeId: string
}

type AssetSignReadCredentials = {
  accessKeyId: string
  accessKeySecret: string
  bucket: string
  securityToken: string
}

class AssetSignReadConfigurationError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = "AssetSignReadConfigurationError"
    this.code = code
  }
}

function jsonError(status: number, error: string, code = error, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, code, ...(extra || {}) }, { status })
}

function cleanText(value: unknown, max = 180) {
  const text = String(value || "").trim()
  return text.length > max ? text.slice(0, max) : text
}

function readTextEnv(...names: string[]) {
  for (const name of names) {
    const value = cleanText(process.env[name], 1000)
    if (value) return value
  }
  return ""
}

function requireConfig(code: string, value: string) {
  if (!value) throw new AssetSignReadConfigurationError(code)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

async function readJsonBody(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function isSafeTenantPathSegment(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
}

function expectedTenantObjectPrefix(companyId: string, storeId: string) {
  return `${CUSTOMER_KNOWLEDGE_PREFIX}/${companyId}/${storeId}/`
}

function isSafeRelativeObjectKey(value: string) {
  if (!value || value.length > 720) return false
  if (value.startsWith("/") || value.endsWith("/")) return false
  if (value.includes("\\") || value.includes("//")) return false
  if (/[\u0000-\u001f\u007f\s]/.test(value)) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9._~@+=/-]*$/.test(value)) return false

  return value.split("/").every((part) => part && part !== "." && part !== "..")
}

function resolveAssetReadScope(
  ctx: AppAccountContext,
  payload: AssetSignReadPayload,
): AssetSignReadScope | { error: NextResponse } {
  const requestedCompanyId = cleanText(payload.company_id, 80)
  const requestedStoreId = cleanText(payload.store_id, 80)

  if (!ctx.isPlatformAdmin && requestedCompanyId && requestedCompanyId !== ctx.companyId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  const companyId = ctx.isPlatformAdmin && requestedCompanyId ? requestedCompanyId : ctx.companyId
  const storeId = requestedStoreId || ctx.storeId

  if (!companyId || !storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (!ctx.isPlatformAdmin && ctx.storeId && requestedStoreId && requestedStoreId !== ctx.storeId) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (!isSafeTenantPathSegment(companyId) || !isSafeTenantPathSegment(storeId)) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }

  return { companyId, storeId }
}

function resolveTenantScopedObjectKey(
  assetRef: unknown,
  scope: AssetSignReadScope,
): { assetRef: string; objectKey: string } | { error: NextResponse } {
  const assetRefText = cleanText(assetRef, 520)
  if (!assetRefText) {
    return { error: jsonError(400, "asset_ref_required", "asset_ref_required") }
  }
  if (/^https?:\/\//i.test(assetRefText)) {
    return { error: jsonError(400, "invalid_asset_ref", "invalid_asset_ref") }
  }

  const expectedPrefix = expectedTenantObjectPrefix(scope.companyId, scope.storeId)
  const objectKey = assetRefText.startsWith(`${CUSTOMER_KNOWLEDGE_PREFIX}/`)
    ? assetRefText
    : `${expectedPrefix}${assetRefText}`

  if (!objectKey.startsWith(expectedPrefix)) {
    return { error: jsonError(403, "tenant_scope_denied", "tenant_scope_denied") }
  }
  if (!isSafeRelativeObjectKey(objectKey) || objectKey === expectedPrefix) {
    return { error: jsonError(400, "invalid_asset_ref", "invalid_asset_ref") }
  }

  return { assetRef: assetRefText, objectKey }
}

function readAssetSignReadCredentials(): AssetSignReadCredentials {
  const accessKeyId = requireConfig(
    "aliyun_oss_credentials_missing",
    readTextEnv("ALIYUN_OSS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID"),
  )
  const accessKeySecret = requireConfig(
    "aliyun_oss_credentials_missing",
    readTextEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
  )
  const bucket = requireConfig(
    "aliyun_oss_bucket_missing",
    readTextEnv("ALIYUN_OSS_BUCKET", "SERVICE_RECORD_OSS_BUCKET"),
  )
  const securityToken = readTextEnv(
    "ALIYUN_OSS_SECURITY_TOKEN",
    "ALIBABA_CLOUD_SECURITY_TOKEN",
    "SERVICE_RECORD_OSS_SECURITY_TOKEN",
  )

  return { accessKeyId, accessKeySecret, bucket, securityToken }
}

function readAssetSignReadEndpoint(credentials: AssetSignReadCredentials) {
  const rawEndpoint = requireConfig(
    "asset_read_endpoint_not_configured",
    readTextEnv("APP_ASSET_SIGN_READ_BASE_URL", "APP_ASSET_READ_BASE_URL", "APP_ASSET_BASE_URL"),
  )

  let url: URL
  try {
    url = new URL(rawEndpoint)
  } catch {
    throw new AssetSignReadConfigurationError("asset_read_endpoint_invalid")
  }

  if (url.protocol !== "https:") {
    throw new AssetSignReadConfigurationError("asset_read_endpoint_must_use_https")
  }
  if (url.hostname.toLowerCase().startsWith(`${credentials.bucket.toLowerCase()}.`)) {
    throw new AssetSignReadConfigurationError("asset_read_endpoint_exposes_private_bucket")
  }

  return url.toString().replace(/\/+$/g, "")
}

function hmacSha1Base64(secret: string, value: string) {
  return createHmac("sha1", secret).update(value).digest("base64")
}

function ossPathEncode(objectKey: string) {
  return objectKey.split("/").map((part) => encodeURIComponent(part)).join("/")
}

function createAssetReadSignedUrl(objectKey: string) {
  const credentials = readAssetSignReadCredentials()
  const endpoint = readAssetSignReadEndpoint(credentials)
  const expires = Math.floor(Date.now() / 1000) + ASSET_SIGN_READ_TTL_SECONDS
  const canonicalResource = `/${credentials.bucket}/${objectKey}`
  const stringToSign = `GET\n\n\n${expires}\n${canonicalResource}`
  const signature = hmacSha1Base64(credentials.accessKeySecret, stringToSign)
  const params = new URLSearchParams({
    OSSAccessKeyId: credentials.accessKeyId,
    Expires: String(expires),
    Signature: signature,
  })
  if (credentials.securityToken) params.set("security-token", credentials.securityToken)

  return {
    expiresAt: new Date(expires * 1000).toISOString(),
    signedUrl: `${endpoint}/${ossPathEncode(objectKey)}?${params.toString()}`,
  }
}

function assetSignReadErrorResponse(error: unknown, fallbackCode: string) {
  const appAuthError = appAuthConfigurationErrorResponse(error)
  if (appAuthError) return appAuthError

  if (error instanceof AssetSignReadConfigurationError) {
    return jsonError(503, error.code, error.code)
  }
  if (error instanceof AliyunRdsConfigurationError) {
    return jsonError(503, "DATABASE_URL_CN is required", "rds_not_configured")
  }
  if (isAliyunRdsRuntimeUnavailableError(error)) {
    return jsonError(503, "Aliyun RDS is not reachable", "rds_unavailable")
  }
  return jsonError(500, error instanceof Error ? error.message : fallbackCode, fallbackCode)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAliyunRdsAppAuthUser(request)
    if (!auth) return appAuthRequiredResponse()

    const payload = await readJsonBody(request)
    if (!isRecord(payload)) {
      return jsonError(400, "invalid_payload", "invalid_payload")
    }

    const ctx = await getAliyunRdsAppAccountContext(auth.user)
    const scope = resolveAssetReadScope(ctx, payload)
    if ("error" in scope) return scope.error

    const asset = resolveTenantScopedObjectKey(payload.asset_ref, scope)
    if ("error" in asset) return asset.error

    const signed = createAssetReadSignedUrl(asset.objectKey)

    return NextResponse.json({
      ok: true,
      asset_ref: asset.assetRef,
      provider: PROVIDER,
      visibility: VISIBILITY,
      signed_url: signed.signedUrl,
      expires_at: signed.expiresAt,
      metadata: {
        company_id: scope.companyId,
        expires_in_seconds: ASSET_SIGN_READ_TTL_SECONDS,
        object_key_scope: CUSTOMER_KNOWLEDGE_PREFIX,
        signed_action: "get_customer_knowledge_asset",
        store_id: scope.storeId,
        tenant_scope: "store",
      },
    })
  } catch (error) {
    return assetSignReadErrorResponse(error, "asset_sign_read_failed")
  }
}
