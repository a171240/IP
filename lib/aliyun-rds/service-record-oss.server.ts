import "server-only"

import crypto from "crypto"
import { readFile } from "fs/promises"

import { cleanText, integerValue, pathSafe } from "@/lib/aliyun-rds/repositories/service-records.server"

type PostPolicyFieldMap = Record<string, string>
type AliyunOssAccessCredentialSource = "env" | "metadata" | "oidc"
type AliyunOssAccessCredential = {
  accessKeyId: string
  accessKeySecret: string
  securityToken?: string
  expiration?: string
  source: AliyunOssAccessCredentialSource
}

const ALIYUN_METADATA_BASE_URL = "http://100.100.100.200/latest"
const ALIYUN_METADATA_TOKEN_PATH = "/api/token"
const ALIYUN_METADATA_ROLE_PATH_PREFIX = "/meta-data/ram/security-credentials"
const ALIYUN_STS_ASSUME_ROLE_WITH_OIDC_VERSION = "2015-04-01"
const METADATA_CACHE_EARLY_REFRESH_MS = 5 * 60 * 1000

let aliyunOssMetadataCredentialCache: {
  roleName: string
  credential: AliyunOssAccessCredential
  expiresAtMs: number
} | null = null

function envText(...names: string[]) {
  for (const name of names) {
    const value = cleanText(process.env[name], 5000)
    if (value) return value
  }
  return ""
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name] || fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function envBoolean(name: string, fallback: boolean) {
  const value = cleanText(process.env[name], 20).toLowerCase()
  if (!value) return fallback
  return value === "1" || value === "true" || value === "yes" || value === "on"
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

function getAliyunOssRuntimeRoleName() {
  return envText("ALIYUN_OSS_RAM_ROLE_NAME", "SERVICE_RECORD_OSS_RAM_ROLE_NAME", "ALIBABA_CLOUD_ECS_METADATA")
}

function getAliyunOssOidcRoleArn() {
  return envText("ALIYUN_OSS_ROLE_ARN", "SERVICE_RECORD_OSS_ROLE_ARN", "ALIBABA_CLOUD_ROLE_ARN")
}

function getAliyunOssOidcProviderArn() {
  return envText("ALIYUN_OSS_OIDC_PROVIDER_ARN", "SERVICE_RECORD_OSS_OIDC_PROVIDER_ARN", "ALIBABA_CLOUD_OIDC_PROVIDER_ARN")
}

function getAliyunOssOidcTokenFile() {
  return envText("ALIYUN_OSS_OIDC_TOKEN_FILE", "SERVICE_RECORD_OSS_OIDC_TOKEN_FILE", "ALIBABA_CLOUD_OIDC_TOKEN_FILE")
}

function getAliyunOssOidcRoleSessionName() {
  return envText("ALIYUN_OSS_ROLE_SESSION_NAME", "SERVICE_RECORD_OSS_ROLE_SESSION_NAME", "ALIBABA_CLOUD_ROLE_SESSION_NAME") || "meiye-oss-session"
}

function getAliyunOssStsEndpoint() {
  return envText("ALIYUN_OSS_STS_ENDPOINT", "ALIBABA_CLOUD_STS_ENDPOINT") || "https://sts.cn-hangzhou.aliyuncs.com/"
}

export function isAliyunRdsServiceRecordOssConfigured() {
  const bucket = getAliyunRdsServiceRecordOssBucket()
  const envCredentialsReady = getAliyunOssAccessKeyId() && getAliyunOssAccessKeySecret()
  const oidcReady = getAliyunOssOidcRoleArn() && getAliyunOssOidcProviderArn() && getAliyunOssOidcTokenFile()
  return Boolean(bucket && (envCredentialsReady || oidcReady || getAliyunOssRuntimeRoleName()))
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

async function getAliyunOssAccessCredential(): Promise<AliyunOssAccessCredential> {
  const accessKeyId = getAliyunOssAccessKeyId()
  const accessKeySecret = getAliyunOssAccessKeySecret()
  if (accessKeyId && accessKeySecret) {
    return {
      accessKeyId,
      accessKeySecret,
      securityToken: getAliyunOssSecurityToken() || undefined,
      source: "env",
    }
  }

  const oidcRoleArn = getAliyunOssOidcRoleArn()
  const oidcProviderArn = getAliyunOssOidcProviderArn()
  const oidcTokenFile = getAliyunOssOidcTokenFile()
  if (oidcRoleArn && oidcProviderArn && oidcTokenFile) {
    return getAliyunOssOidcCredential({
      roleArn: oidcRoleArn,
      oidcProviderArn,
      oidcTokenFile,
      roleSessionName: getAliyunOssOidcRoleSessionName(),
      stsEndpoint: getAliyunOssStsEndpoint(),
    })
  }

  const roleName = getAliyunOssRuntimeRoleName()
  if (!roleName) throw new Error("aliyun_oss_credentials_missing")
  return getAliyunOssMetadataCredential(roleName)
}

async function getAliyunOssOidcCredential(opts: {
  roleArn: string
  oidcProviderArn: string
  oidcTokenFile: string
  roleSessionName: string
  stsEndpoint: string
}): Promise<AliyunOssAccessCredential> {
  const oidcToken = cleanText(await readFile(opts.oidcTokenFile, "utf8"), 20000)
  if (!oidcToken) throw new Error("aliyun_oss_oidc_token_missing")

  const params = new URLSearchParams({
    Action: "AssumeRoleWithOIDC",
    Version: ALIYUN_STS_ASSUME_ROLE_WITH_OIDC_VERSION,
    RoleArn: opts.roleArn,
    OIDCProviderArn: opts.oidcProviderArn,
    OIDCToken: oidcToken,
    RoleSessionName: opts.roleSessionName,
  })
  const body = await fetchAliyunStsText(opts.stsEndpoint, params)
  const json = JSON.parse(body) as Record<string, any>
  const code = cleanText(json.Code, 80)
  if (code && code !== "Success") throw new Error(`aliyun_oss_oidc_credentials_failed:${code}`)

  const credentials = json.Credentials || {}
  const accessKeyId = cleanText(credentials.AccessKeyId, 200)
  const accessKeySecret = cleanText(credentials.AccessKeySecret, 200)
  const securityToken = cleanText(credentials.SecurityToken, 4000)
  const expiration = cleanText(credentials.Expiration, 80)
  if (!accessKeyId || !accessKeySecret || !securityToken) throw new Error("aliyun_oss_oidc_credentials_invalid")

  return {
    accessKeyId,
    accessKeySecret,
    securityToken,
    expiration,
    source: "oidc",
  }
}

async function getAliyunOssMetadataCredential(roleName: string): Promise<AliyunOssAccessCredential> {
  const now = Date.now()
  if (
    aliyunOssMetadataCredentialCache &&
    aliyunOssMetadataCredentialCache.roleName === roleName &&
    aliyunOssMetadataCredentialCache.expiresAtMs - METADATA_CACHE_EARLY_REFRESH_MS > now
  ) {
    return aliyunOssMetadataCredentialCache.credential
  }

  const token = await fetchAliyunMetadataToken().catch(() => "")
  const allowImdsV1 = envBoolean("ALIYUN_OSS_METADATA_ALLOW_IMDS_V1", false)
  if (!token && !allowImdsV1) throw new Error("aliyun_oss_metadata_token_missing")

  const body = await fetchAliyunMetadataText(`${ALIYUN_METADATA_ROLE_PATH_PREFIX}/${encodeURIComponent(roleName)}`, token || undefined)
  const json = JSON.parse(body) as Record<string, unknown>
  const code = cleanText(json.Code, 80)
  if (code && code !== "Success") throw new Error(`aliyun_oss_metadata_credentials_failed:${code}`)

  const accessKeyId = cleanText(json.AccessKeyId, 200)
  const accessKeySecret = cleanText(json.AccessKeySecret, 200)
  const securityToken = cleanText(json.SecurityToken, 4000)
  const expiration = cleanText(json.Expiration, 80)
  if (!accessKeyId || !accessKeySecret || !securityToken) throw new Error("aliyun_oss_metadata_credentials_invalid")

  const expiresAtMs = Date.parse(expiration)
  const credential: AliyunOssAccessCredential = {
    accessKeyId,
    accessKeySecret,
    securityToken,
    expiration,
    source: "metadata",
  }
  aliyunOssMetadataCredentialCache = {
    roleName,
    credential,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 30 * 60 * 1000,
  }
  return credential
}

async function fetchAliyunMetadataToken() {
  const timeoutMs = envNumber("ALIYUN_OSS_METADATA_TIMEOUT_MS", 1500, 100, 10000)
  return fetchWithTimeout(`${ALIYUN_METADATA_BASE_URL}${ALIYUN_METADATA_TOKEN_PATH}`, {
    method: "PUT",
    headers: {
      "X-aliyun-ecs-metadata-token-ttl-seconds": "21600",
    },
  }, timeoutMs)
}

async function fetchAliyunMetadataText(path: string, token?: string) {
  const timeoutMs = envNumber("ALIYUN_OSS_METADATA_TIMEOUT_MS", 1500, 100, 10000)
  const headers: Record<string, string> = {}
  if (token) headers["X-aliyun-ecs-metadata-token"] = token
  return fetchWithTimeout(`${ALIYUN_METADATA_BASE_URL}${path}`, { method: "GET", headers }, timeoutMs)
}

async function fetchAliyunStsText(endpoint: string, params: URLSearchParams) {
  const timeoutMs = envNumber("ALIYUN_OSS_STS_TIMEOUT_MS", 5000, 100, 30000)
  return fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  }, timeoutMs)
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const body = await res.text().catch(() => "")
    if (!res.ok) throw new Error(`aliyun_metadata_http_${res.status}`)
    return body
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("aliyun_metadata_timeout")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function createAliyunRdsServiceRecordOssPostPolicy(opts: {
  objectKey: string
  contentType: string
  maxBytes?: number
  expiresSeconds?: number
}) {
  const credential = await getAliyunOssAccessCredential()
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
  if (credential.securityToken) conditions.push(["eq", "$x-oss-security-token", credential.securityToken])

  const policy = {
    expiration: expiresAt,
    conditions,
  }
  const policyBase64 = Buffer.from(JSON.stringify(policy), "utf8").toString("base64")
  const signature = hmacSha1Base64(credential.accessKeySecret, policyBase64)
  const fields: PostPolicyFieldMap = {
    key: opts.objectKey,
    policy: policyBase64,
    OSSAccessKeyId: credential.accessKeyId,
    Signature: signature,
    success_action_status: "200",
    "Content-Type": contentType,
  }
  if (credential.securityToken) fields["x-oss-security-token"] = credential.securityToken

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

export async function createAliyunRdsServiceRecordOssSignedGetUrl(objectKey: string, expiresSeconds?: number) {
  const credential = await getAliyunOssAccessCredential()
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunRdsServiceRecordOssBucket())
  const endpoint = getAliyunRdsServiceRecordOssEndpoint()
  const ttl = envNumber("BAILIAN_ASR_AUDIO_URL_EXPIRES_SECONDS", expiresSeconds || 6 * 60 * 60, 600, 48 * 60 * 60)
  const expires = Math.floor(Date.now() / 1000) + ttl
  const canonicalResource = `/${bucket}/${objectKey}`
  const stringToSign = `GET\n\n\n${expires}\n${canonicalResource}`
  const signature = hmacSha1Base64(credential.accessKeySecret, stringToSign)
  const params = new URLSearchParams({
    OSSAccessKeyId: credential.accessKeyId,
    Expires: String(expires),
    Signature: signature,
  })
  if (credential.securityToken) params.set("security-token", credential.securityToken)
  return `${endpoint}/${ossPathEncode(objectKey)}?${params.toString()}`
}

export async function uploadAliyunRdsServiceRecordOssObject(opts: {
  objectKey: string
  data: Buffer
  contentType: string
}) {
  const credential = await getAliyunOssAccessCredential()
  const bucket = requireEnv("ALIYUN_OSS_BUCKET", getAliyunRdsServiceRecordOssBucket())
  const endpoint = getAliyunRdsServiceRecordOssEndpoint()
  const contentType = cleanText(opts.contentType, 120) || "application/octet-stream"
  const date = new Date().toUTCString()
  const ossHeaders = credential.securityToken ? `x-oss-security-token:${credential.securityToken}\n` : ""
  const canonicalResource = `/${bucket}/${opts.objectKey}`
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${ossHeaders}${canonicalResource}`
  const signature = hmacSha1Base64(credential.accessKeySecret, stringToSign)
  const headers: Record<string, string> = {
    Authorization: `OSS ${credential.accessKeyId}:${signature}`,
    "Content-Type": contentType,
    Date: date,
  }
  if (credential.securityToken) headers["x-oss-security-token"] = credential.securityToken

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
