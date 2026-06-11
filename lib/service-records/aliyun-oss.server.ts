import "server-only"

import crypto from "crypto"

import { cleanText, integerValue, pathSafe } from "@/lib/service-records/server"

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

export function isAliyunOssConfigured() {
  return Boolean(getAliyunOssAccessKeyId() && getAliyunOssAccessKeySecret() && getAliyunOssBucket())
}

export function getAliyunOssAccessKeyId() {
  return envText("ALIYUN_OSS_ACCESS_KEY_ID", "ALIBABA_CLOUD_ACCESS_KEY_ID")
}

export function getAliyunOssAccessKeySecret() {
  return envText("ALIYUN_OSS_ACCESS_KEY_SECRET", "ALIBABA_CLOUD_ACCESS_KEY_SECRET")
}

export function getAliyunOssBucket() {
  return envText("ALIYUN_OSS_BUCKET", "SERVICE_RECORD_OSS_BUCKET")
}

export function getAliyunOssRegion() {
  return envText("ALIYUN_OSS_REGION", "SERVICE_RECORD_OSS_REGION") || "oss-cn-hangzhou"
}

export function getAliyunOssEndpoint() {
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunOssBucket())
  const region = getAliyunOssRegion()
  return normalizeEndpoint(envText("ALIYUN_OSS_ENDPOINT", "SERVICE_RECORD_OSS_ENDPOINT"), bucket, region)
}

export function getServiceRecordOssPrefix() {
  return pathSafe(envText("SERVICE_RECORD_OSS_PREFIX") || "service-records")
}

export function getAliyunOssMaxDirectUploadBytes() {
  return envNumber("SERVICE_RECORD_OSS_MAX_UPLOAD_BYTES", 2 * 1024 * 1024 * 1024, 1024, 2 * 1024 * 1024 * 1024)
}

export function isAliyunOssStorageBucket(bucket: unknown) {
  const expected = getAliyunOssBucket()
  return Boolean(expected && cleanText(bucket, 200) === expected)
}

export function buildServiceRecordOssObjectKey(opts: {
  session: any
  clientSegmentId: string
  ext: string
}) {
  const ext = pathSafe(opts.ext || "ogg").toLowerCase()
  return [
    getServiceRecordOssPrefix(),
    pathSafe(opts.session?.company_id || "no-company"),
    pathSafe(opts.session?.store_id || "no-store"),
    pathSafe(opts.session?.id),
    `${pathSafe(opts.clientSegmentId)}.${ext}`,
  ].join("/")
}

export function createAliyunOssPostPolicy(opts: {
  objectKey: string
  contentType: string
  maxBytes?: number
  expiresSeconds?: number
}) {
  const accessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID", getAliyunOssAccessKeyId())
  const accessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", getAliyunOssAccessKeySecret())
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunOssBucket())
  const endpoint = getAliyunOssEndpoint()
  const maxBytes = integerValue(opts.maxBytes, getAliyunOssMaxDirectUploadBytes())
  const expiresSeconds = envNumber("SERVICE_RECORD_OSS_UPLOAD_POLICY_SECONDS", opts.expiresSeconds || 15 * 60, 60, 60 * 60)
  const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString()
  const contentType = cleanText(opts.contentType, 120) || "audio/ogg"

  const policy = {
    expiration: expiresAt,
    conditions: [
      ["eq", "$key", opts.objectKey],
      ["eq", "$success_action_status", "200"],
      ["content-length-range", 1, maxBytes],
      ["eq", "$Content-Type", contentType],
    ],
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

export function createAliyunOssSignedGetUrl(objectKey: string, expiresSeconds?: number) {
  const accessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID", getAliyunOssAccessKeyId())
  const accessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", getAliyunOssAccessKeySecret())
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunOssBucket())
  const endpoint = getAliyunOssEndpoint()
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
  return `${endpoint}/${ossPathEncode(objectKey)}?${params.toString()}`
}
