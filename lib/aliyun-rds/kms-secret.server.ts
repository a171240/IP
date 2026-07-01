import "server-only"

import crypto from "crypto"
import { readFile } from "fs/promises"

type AliyunAccessCredentialSource = "env" | "oidc"
type AliyunAccessCredential = {
  accessKeyId: string
  accessKeySecret: string
  securityToken?: string
  expiration?: string
  source: AliyunAccessCredentialSource
}

const ALIYUN_STS_ASSUME_ROLE_WITH_OIDC_VERSION = "2015-04-01"
const ALIYUN_KMS_API_VERSION = "2016-01-20"
const CACHE_EARLY_REFRESH_MS = 5 * 60 * 1000
const DEFAULT_KMS_ENDPOINT = "https://kms.cn-hangzhou.aliyuncs.com/"

let aliyunOidcCredentialCache: {
  key: string
  credential: AliyunAccessCredential
  expiresAtMs: number
} | null = null

let aliyunKmsSecretCache: {
  secretName: string
  versionStage: string
  value: string
  loadedAtMs: number
} | null = null

export function isAliyunKmsSecretDatabaseUrlConfigured(): boolean {
  return Boolean(getAliyunKmsDatabaseUrlSecretName() && hasAliyunCredentialSource())
}

export async function getAliyunKmsDatabaseUrlSecretValue(): Promise<string> {
  const secretName = getAliyunKmsDatabaseUrlSecretName()
  if (!secretName) throw new Error("aliyun_kms_database_url_secret_name_missing")
  return getAliyunKmsSecretValue(secretName, getAliyunKmsDatabaseUrlSecretVersionStage())
}

async function getAliyunKmsSecretValue(secretName: string, versionStage: string): Promise<string> {
  const now = Date.now()
  if (
    aliyunKmsSecretCache &&
    aliyunKmsSecretCache.secretName === secretName &&
    aliyunKmsSecretCache.versionStage === versionStage &&
    now - aliyunKmsSecretCache.loadedAtMs < 10 * 60 * 1000
  ) {
    return aliyunKmsSecretCache.value
  }

  const credential = await getAliyunAccessCredential()
  const params: Record<string, string> = {
    Action: "GetSecretValue",
    Version: ALIYUN_KMS_API_VERSION,
    SecretName: secretName,
    VersionStage: versionStage,
  }
  const response = await fetchAliyunRpcJson(getAliyunKmsEndpoint(), params, credential, getAliyunKmsTimeoutMs())
  const secretData = text(response.SecretData, 10000)
  if (!secretData) throw new Error("aliyun_kms_secret_data_missing")

  aliyunKmsSecretCache = {
    secretName,
    versionStage,
    value: secretData,
    loadedAtMs: now,
  }
  return secretData
}

async function getAliyunAccessCredential(): Promise<AliyunAccessCredential> {
  const accessKeyId = envText("ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIYUN_KMS_ACCESS_KEY_ID")
  const accessKeySecret = envText("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "ALIYUN_KMS_ACCESS_KEY_SECRET")
  if (accessKeyId && accessKeySecret) {
    return {
      accessKeyId,
      accessKeySecret,
      securityToken: envText("ALIBABA_CLOUD_SECURITY_TOKEN", "ALIYUN_KMS_SECURITY_TOKEN") || undefined,
      source: "env",
    }
  }

  const roleArn = envText("ALIBABA_CLOUD_ROLE_ARN", "ALIYUN_KMS_ROLE_ARN")
  const oidcProviderArn = envText("ALIBABA_CLOUD_OIDC_PROVIDER_ARN", "ALIYUN_KMS_OIDC_PROVIDER_ARN")
  const oidcTokenFile = envText("ALIBABA_CLOUD_OIDC_TOKEN_FILE", "ALIYUN_KMS_OIDC_TOKEN_FILE")
  if (!roleArn || !oidcProviderArn || !oidcTokenFile) throw new Error("aliyun_kms_oidc_credentials_missing")
  return getAliyunOidcCredential({
    roleArn,
    oidcProviderArn,
    oidcTokenFile,
    roleSessionName: envText("ALIBABA_CLOUD_ROLE_SESSION_NAME", "ALIYUN_KMS_ROLE_SESSION_NAME") || "meiye-kms-session",
    stsEndpoint: envText("ALIBABA_CLOUD_STS_ENDPOINT", "ALIYUN_KMS_STS_ENDPOINT") || "https://sts.cn-hangzhou.aliyuncs.com/",
  })
}

async function getAliyunOidcCredential(opts: {
  roleArn: string
  oidcProviderArn: string
  oidcTokenFile: string
  roleSessionName: string
  stsEndpoint: string
}): Promise<AliyunAccessCredential> {
  const cacheKey = `${opts.roleArn}|${opts.oidcProviderArn}|${opts.oidcTokenFile}|${opts.roleSessionName}`
  const now = Date.now()
  if (
    aliyunOidcCredentialCache &&
    aliyunOidcCredentialCache.key === cacheKey &&
    aliyunOidcCredentialCache.expiresAtMs - CACHE_EARLY_REFRESH_MS > now
  ) {
    return aliyunOidcCredentialCache.credential
  }

  const oidcToken = text(await readFile(opts.oidcTokenFile, "utf8"), 20000)
  if (!oidcToken) throw new Error("aliyun_kms_oidc_token_missing")

  const params = new URLSearchParams({
    Action: "AssumeRoleWithOIDC",
    Version: ALIYUN_STS_ASSUME_ROLE_WITH_OIDC_VERSION,
    RoleArn: opts.roleArn,
    OIDCProviderArn: opts.oidcProviderArn,
    OIDCToken: oidcToken,
    RoleSessionName: opts.roleSessionName,
  })
  const body = await fetchWithTimeout(opts.stsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  }, getAliyunKmsTimeoutMs())
  const json = JSON.parse(body) as Record<string, unknown>
  const code = text(json.Code, 80)
  if (code && code !== "Success") throw new Error(`aliyun_kms_oidc_credentials_failed:${code}`)

  const credentials = objectRecord(json.Credentials)
  const accessKeyId = text(credentials.AccessKeyId, 200)
  const accessKeySecret = text(credentials.AccessKeySecret, 200)
  const securityToken = text(credentials.SecurityToken, 4000)
  const expiration = text(credentials.Expiration, 80)
  if (!accessKeyId || !accessKeySecret || !securityToken) throw new Error("aliyun_kms_oidc_credentials_invalid")

  const credential = {
    accessKeyId,
    accessKeySecret,
    securityToken,
    expiration,
    source: "oidc" as const,
  }
  const expiresAtMs = Date.parse(expiration)
  aliyunOidcCredentialCache = {
    key: cacheKey,
    credential,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 30 * 60 * 1000,
  }
  return credential
}

async function fetchAliyunRpcJson(
  endpoint: string,
  actionParams: Record<string, string>,
  credential: AliyunAccessCredential,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const params: Record<string, string> = {
    Format: "JSON",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString(),
    AccessKeyId: credential.accessKeyId,
    ...actionParams,
  }
  if (credential.securityToken) params.SecurityToken = credential.securityToken

  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&")
  const stringToSign = `GET&%2F&${percentEncode(canonical)}`
  const signature = crypto.createHmac("sha1", `${credential.accessKeySecret}&`).update(stringToSign).digest("base64")
  const url = `${endpoint.replace(/\/?$/, "/")}?${canonical}&Signature=${percentEncode(signature)}`
  const body = await fetchWithTimeout(url, { method: "GET" }, timeoutMs)
  const json = JSON.parse(body) as Record<string, unknown>
  const code = text(json.Code, 120)
  if (code) throw new Error(`aliyun_kms_rpc_failed:${code}`)
  return json
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const body = await res.text().catch(() => "")
    if (!res.ok) throw new Error(`aliyun_kms_http_${res.status}`)
    return body
  } catch (error: unknown) {
    if (isAbortError(error)) throw new Error("aliyun_kms_timeout")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError",
  )
}

function hasAliyunCredentialSource() {
  return Boolean(
    (envText("ALIBABA_CLOUD_ACCESS_KEY_ID", "ALIYUN_KMS_ACCESS_KEY_ID") &&
      envText("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "ALIYUN_KMS_ACCESS_KEY_SECRET")) ||
      (
        envText("ALIBABA_CLOUD_ROLE_ARN", "ALIYUN_KMS_ROLE_ARN") &&
        envText("ALIBABA_CLOUD_OIDC_PROVIDER_ARN", "ALIYUN_KMS_OIDC_PROVIDER_ARN") &&
        envText("ALIBABA_CLOUD_OIDC_TOKEN_FILE", "ALIYUN_KMS_OIDC_TOKEN_FILE")
      ),
  )
}

function getAliyunKmsDatabaseUrlSecretName() {
  return envText(
    "DATABASE_URL_CN_SECRET_NAME",
    "ALIYUN_RDS_DATABASE_URL_CN_SECRET_NAME",
    "ALIYUN_KMS_DATABASE_URL_CN_SECRET_NAME",
  )
}

function getAliyunKmsDatabaseUrlSecretVersionStage() {
  return envText("DATABASE_URL_CN_SECRET_VERSION_STAGE", "ALIYUN_KMS_SECRET_VERSION_STAGE") || "ACSCurrent"
}

function getAliyunKmsEndpoint() {
  return envText("ALIYUN_KMS_ENDPOINT", "ALIBABA_CLOUD_KMS_ENDPOINT") || DEFAULT_KMS_ENDPOINT
}

function getAliyunKmsTimeoutMs() {
  const n = Number(envText("ALIYUN_KMS_TIMEOUT_MS") || 5000)
  if (!Number.isFinite(n)) return 5000
  return Math.max(100, Math.min(30000, Math.round(n)))
}

function envText(...names: string[]) {
  for (const name of names) {
    const value = text(process.env[name], 5000)
    if (value && !value.startsWith("TODO_")) return value
  }
  return ""
}

function text(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength)
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~")
}
