import "server-only"

import crypto from "crypto"

import { cleanText, integerValue, pathSafe } from "@/lib/aliyun-rds/repositories/service-records.server"

type PostPolicyFieldMap = Record<string, string>

function envText(...names: string[]) {
  for (const name of names) {
    const value = cleanText(process.env[name], 1000)
    if (value) return value
  }
  return ""
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function requireEnv(name: string, value: string) {
  if (!value) throw new Error(`${name.toLowerCase()}_missing`)
  return value
}

function hmacSha1Base64(secret: string, value: string) {
  return crypto.createHmac("sha1", secret).update(value).digest("base64")
}

function normalizeEndpoint(endpoint: string, bucket: string, region: string) {
  const custom = endpoint.trim().replace(/\/+$/g, "")
  if (custom) return custom
  return `https://${bucket}.${region}.aliyuncs.com`
}

function ossPathEncode(objectKey: string) {
  return objectKey.split("/").map((part) => encodeURIComponent(part)).join("/")
}

function getAliyunOssAccessKeyId() {
  return envText("ALIYUN_OSS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID")
}

function getAliyunOssAccessKeySecret() {
  return envText("ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET")
}

function getAliyunOssSecurityToken() {
  return envText("ALIYUN_OSS_SECURITY_TOKEN", "ALIBABA_CLOUD_SECURITY_TOKEN", "SERVICE_RECORD_OSS_SECURITY_TOKEN")
}

export function isAliyunRdsServiceRecordOssConfigured() {
  return Boolean(getAliyunOssAccessKeyId() && getAliyunOssAccessKeySecret() && getAliyunRdsServiceRecordOssBucket())
}

export function getAliyunRdsServiceRecordOssBucket() {
  return envText("ALIYUN_OSS_BUCKET", "SERVICE_RECORD_OSS_BUCKET")
}

export function getAliyunRdsServiceRecordOssRegion() {
  return envText("ALIYUN_OSS_REGION", "SERVICE_RECORD_OSS_REGION") || "oss-cn-hangzhou"
}

export function getAliyunRdsServiceRecordOssEndpoint() {
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunRdsServiceRecordOssBucket())
  const region = getAliyunRdsServiceRecordOssRegion()
  return normalizeEndpoint(envText("ALIYUN_OSS_ENDPOINT", "SERVICE_RECORD_OSS_ENDPOINT"), bucket, region)
}

export function getAliyunRdsServiceRecordOssPrefix() {
  return pathSafe(envText("SERVICE_RECORD_OSS_PREFIX") || "service-records")
}

export function getAliyunRdsServiceRecordOssMaxDirectUploadBytes() {
  return envNumber("SERVICE_RECORD_OSS_MAX_UPLOAD_BYTES", 2 * 1024 * 1024 * 1024, 1024, 2 * 1024 * 1024 * 1024)
}

export function isAliyunRdsServiceRecordOssBucket(bucket: unknown) {
  const expected = getAliyunRdsServiceRecordOssBucket()
  return Boolean(expected && cleanText(bucket, 200) === expected)
}

export function buildAliyunRdsServiceRecordOssObjectKey(opts: {
  session: { company_id?: unknown; store_id?: unknown; id?: unknown }
  clientSegmentId: string
  ext: string
}) {
  const ext = pathSafe(opts.ext || "m4a").toLowerCase()
  return [
    getAliyunRdsServiceRecordOssPrefix(),
    pathSafe(opts.session?.company_id || "no-company"),
    pathSafe(opts.session?.store_id || "no-store"),
    pathSafe(opts.session?.id),
    `${pathSafe(opts.clientSegmentId)}.${ext}`,
  ].join("/")
}

export function createAliyunRdsServiceRecordOssPostPolicy(opts: {
  objectKey: string
  contentType: string
  maxBytes?: number
  expiresSeconds?: number
}) {
  const accessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID", getAliyunOssAccessKeyId())
  const accessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", getAliyunOssAccessKeySecret())
  const securityToken = getAliyunOssSecurityToken()
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunRdsServiceRecordOssBucket())
  const endpoint = getAliyunRdsServiceRecordOssEndpoint()
  const maxBytes = integerValue(opts.maxBytes, getAliyunRdsServiceRecordOssMaxDirectUploadBytes())
  const expiresSeconds = envNumber("SERVICE_RECORD_OSS_UPLOAD_POLICY_SECONDS", opts.expiresSeconds || 15 * 60, 60, 60 * 60)
  const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString()
  const contentType = cleanText(opts.contentType, 120) || "audio/ogg"
  const conditions: Array<Array<string | number>> = [
    ["eq", "$key", opts.objectKey],
    ["eq", "$success_action_status", "200"],
    ["content-length-range", 1, maxBytes],
    ["eq", "$Content-Type", contentType],
  ]
  if (securityToken) conditions.push(["eq", "$x-oss-security-token", securityToken])

  const policy = {
    expiration: expiresAt,
    conditions,
  }
  const policyBase64 = Buffer.from(JSON.stringify(policy), "utf8").toString("base64")
  const signature = hmacSha1Base64(accessKeySecret, policyBase64)
  const fields: PostPolicyFieldMap = {
    key: opts.objectKey,
    policy: policyBase64,
    OSSAccessKeyId: accessKeyId,
    Signature: signature,
    success_action_status: "200",
    "Content-Type": contentType,
  }
  if (securityToken) fields["x-oss-security-token"] = securityToken

  return {
    provider: "aliyun_oss" as const,
    bucket,
    url: endpoint,
    objectKey: opts.objectKey,
    expiresAt,
    fields,
    maxBytes,
    contentType,
  }
}

export function createAliyunRdsServiceRecordOssSignedGetUrl(objectKey: string, expiresSeconds?: number) {
  const accessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID", getAliyunOssAccessKeyId())
  const accessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", getAliyunOssAccessKeySecret())
  const securityToken = getAliyunOssSecurityToken()
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunRdsServiceRecordOssBucket())
  const endpoint = getAliyunRdsServiceRecordOssEndpoint()
  const ttl = envNumber("BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS", expiresSeconds || 6 * 60 * 60, 600, 48 * 60 * 60)
  const expires = Math.floor(Date.now() / 1000) + ttl
  const canonicalResource = `/${bucket}/${objectKey}`
  const stringToSign = `GET\n\n\n${expires}\n${canonicalResource}`
  const signature = hmacSha1Base64(accessKeySecret, stringToSign)
  const params = new URLSearchParams({
    OSSAccessKeyId: accessKeyId,
    Expires: String(expires),
    Signature: signature,
  })
  if (securityToken) params.set("security-token", securityToken)
  return `${endpoint}/${ossPathEncode(objectKey)}?${params.toString()}`
}

export async function uploadAliyunRdsServiceRecordOssObject(opts: {
  objectKey: string
  data: Buffer
  contentType: string
}) {
  const accessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID", getAliyunOssAccessKeyId())
  const accessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", getAliyunOssAccessKeySecret())
  const securityToken = getAliyunOssSecurityToken()
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunRdsServiceRecordOssBucket())
  const endpoint = getAliyunRdsServiceRecordOssEndpoint()
  const contentType = cleanText(opts.contentType, 120) || "application/octet-stream"
  const date = new Date().toUTCString()
  const ossHeaders = securityToken ? `x-oss-security-token:${securityToken}\n` : ""
  const canonicalResource = `/${bucket}/${opts.objectKey}`
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${ossHeaders}${canonicalResource}`
  const signature = hmacSha1Base64(accessKeySecret, stringToSign)
  const headers: Record<string, string> = {
    Authorization: `OSS ${accessKeyId}:${signature}`,
    "Content-Type": contentType,
    Date: date,
  }
  if (securityToken) headers["x-oss-security-token"] = securityToken

  const body = opts.data.buffer.slice(opts.data.byteOffset, opts.data.byteOffset + opts.data.byteLength) as ArrayBuffer
  const res = await fetch(`${endpoint}/${ossPathEncode(opts.objectKey)}`, {
    method: "PUT",
    headers,
    body,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`aliyun_oss_put_failed:${res.status}${body ? `:${cleanText(body, 200)}` : ""}`)
  }
}
