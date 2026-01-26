import "server-only"

import crypto, { X509Certificate } from "node:crypto"

export type WechatpayOrderParams = {
  outTradeNo: string
  description: string
  amountTotal: number
  currency?: string
  notifyUrl: string
}

type PlatformVerifyConfig =
  | {
      mode: "cert"
      id: string
      certPem: string
    }
  | {
      mode: "pubkey"
      id: string
      publicKeyPem: string
    }

type WechatpayEnv = {
  appId: string
  mchId: string
  merchantSerialNo: string
  merchantPrivateKeyPem: string
  apiV3Key: string
  platformVerify: PlatformVerifyConfig
}

function normalizePem(input: string): string {
  const trimmed = input.trim()
  if (trimmed.includes("\\n") && !trimmed.includes("\n")) {
    return trimmed.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n")
  }
  return trimmed
}

function getWechatpayEnv(): WechatpayEnv {
  const appId = process.env.WECHATPAY_APPID
  const mchId = process.env.WECHATPAY_MCHID
  const merchantSerialNo = process.env.WECHATPAY_SERIAL_NO
  const merchantPrivateKeyPem = process.env.WECHATPAY_PRIVATE_KEY
  const apiV3Key = process.env.WECHATPAY_API_V3_KEY

  const platformSerialNo = process.env.WECHATPAY_PLATFORM_SERIAL_NO
  const platformCertPem = process.env.WECHATPAY_PLATFORM_CERT_PEM

  const platformPublicKeyId = process.env.WECHATPAY_PLATFORM_PUBLIC_KEY_ID
  const platformPublicKeyPem = process.env.WECHATPAY_PLATFORM_PUBLIC_KEY_PEM

  const missing = [
    !appId && "WECHATPAY_APPID",
    !mchId && "WECHATPAY_MCHID",
    !merchantSerialNo && "WECHATPAY_SERIAL_NO",
    !merchantPrivateKeyPem && "WECHATPAY_PRIVATE_KEY",
    !apiV3Key && "WECHATPAY_API_V3_KEY",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Wechatpay env missing: ${missing.join(", ")}`)
  }

  let platformVerify: PlatformVerifyConfig | null = null

  if (platformPublicKeyId && platformPublicKeyPem) {
    platformVerify = {
      mode: "pubkey",
      id: platformPublicKeyId,
      publicKeyPem: normalizePem(platformPublicKeyPem),
    }
  } else if (platformSerialNo && platformCertPem) {
    platformVerify = {
      mode: "cert",
      id: platformSerialNo,
      certPem: normalizePem(platformCertPem),
    }
  }

  if (!platformVerify) {
    throw new Error(
      "Wechatpay env missing platform verifier: set WECHATPAY_PLATFORM_PUBLIC_KEY_ID + WECHATPAY_PLATFORM_PUBLIC_KEY_PEM (recommended) OR WECHATPAY_PLATFORM_SERIAL_NO + WECHATPAY_PLATFORM_CERT_PEM"
    )
  }

  return {
    appId: appId!,
    mchId: mchId!,
    merchantSerialNo: merchantSerialNo!,
    merchantPrivateKeyPem: normalizePem(merchantPrivateKeyPem!),
    apiV3Key: apiV3Key!,
    platformVerify,
  }
}

function randomNonce(length = 16): string {
  return crypto.randomBytes(length).toString("hex")
}

function signMessage(privateKeyPem: string, message: string): string {
  const sign = crypto.createSign("RSA-SHA256")
  sign.update(message)
  sign.end()
  return sign.sign(privateKeyPem, "base64")
}

function buildAuthorizationHeader(opts: {
  env: WechatpayEnv
  method: string
  pathWithQuery: string
  bodyString: string
  nonce: string
  timestamp: number
}): string {
  const { env, method, pathWithQuery, bodyString, nonce, timestamp } = opts
  const message = `${method}\n${pathWithQuery}\n${timestamp}\n${nonce}\n${bodyString}\n`
  const signature = signMessage(env.merchantPrivateKeyPem, message)
  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid=\"${env.mchId}\",` +
    `nonce_str=\"${nonce}\",` +
    `timestamp=\"${timestamp}\",` +
    `serial_no=\"${env.merchantSerialNo}\",` +
    `signature=\"${signature}\"`
  )
}

export async function wechatpayCreateNativeOrder(params: WechatpayOrderParams): Promise<{ codeUrl: string }> {
  const env = getWechatpayEnv()

  const body = {
    appid: env.appId,
    mchid: env.mchId,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: params.notifyUrl,
    amount: {
      total: params.amountTotal,
      currency: params.currency || "CNY",
    },
  }

  const bodyString = JSON.stringify(body)
  const pathWithQuery = "/v3/pay/transactions/native"
  const nonce = randomNonce()
  const timestamp = Math.floor(Date.now() / 1000)

  const authorization = buildAuthorizationHeader({
    env,
    method: "POST",
    pathWithQuery,
    bodyString,
    nonce,
    timestamp,
  })

  const res = await fetch(`https://api.mch.weixin.qq.com${pathWithQuery}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
      // When using public key mode, Wechatpay-Serial should be public key ID.
      "Wechatpay-Serial": env.platformVerify.id,
    },
    body: bodyString,
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Wechatpay create native order failed: ${res.status} ${text}`)
  }

  const data = JSON.parse(text) as { code_url?: string }
  if (!data?.code_url) {
    throw new Error("Wechatpay response missing code_url")
  }

  return { codeUrl: data.code_url }
}

export async function wechatpayQueryByOutTradeNo(outTradeNo: string): Promise<{
  trade_state: string
  transaction_id?: string
  success_time?: string
}> {
  const env = getWechatpayEnv()
  const encoded = encodeURIComponent(outTradeNo)
  const pathWithQuery = `/v3/pay/transactions/out-trade-no/${encoded}?mchid=${env.mchId}`

  const nonce = randomNonce()
  const timestamp = Math.floor(Date.now() / 1000)
  const authorization = buildAuthorizationHeader({
    env,
    method: "GET",
    pathWithQuery,
    bodyString: "",
    nonce,
    timestamp,
  })

  const res = await fetch(`https://api.mch.weixin.qq.com${pathWithQuery}`, {
    method: "GET",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      "Wechatpay-Serial": env.platformVerify.id,
    },
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Wechatpay query failed: ${res.status} ${text}`)
  }

  return JSON.parse(text) as { trade_state: string; transaction_id?: string; success_time?: string }
}

export function verifyWechatpayCallbackSignature(opts: { headers: Headers; bodyText: string }): boolean {
  const env = getWechatpayEnv()

  const signature = opts.headers.get("wechatpay-signature")
  const timestamp = opts.headers.get("wechatpay-timestamp")
  const nonce = opts.headers.get("wechatpay-nonce")
  const serial = opts.headers.get("wechatpay-serial")

  if (!signature || !timestamp || !nonce || !serial) return false
  if (serial !== env.platformVerify.id) return false

  const message = `${timestamp}\n${nonce}\n${opts.bodyText}\n`
  const verify = crypto.createVerify("RSA-SHA256")
  verify.update(message)
  verify.end()

  if (env.platformVerify.mode === "cert") {
    const cert = new X509Certificate(env.platformVerify.certPem)
    return verify.verify(cert.publicKey, signature, "base64")
  }

  return verify.verify(env.platformVerify.publicKeyPem, signature, "base64")
}

export function decryptWechatpayResource(resource: {
  ciphertext: string
  nonce: string
  associated_data?: string
}): Record<string, unknown> {
  const env = getWechatpayEnv()

  const key = Buffer.from(env.apiV3Key, "utf8")
  const data = Buffer.from(resource.ciphertext, "base64")
  const authTag = data.subarray(data.length - 16)
  const cipherText = data.subarray(0, data.length - 16)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, resource.nonce)
  decipher.setAuthTag(authTag)
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, "utf8"))
  }

  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()])
  return JSON.parse(plain.toString("utf8")) as Record<string, unknown>
}
