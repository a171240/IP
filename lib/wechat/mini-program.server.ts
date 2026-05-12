import "server-only"

type WechatMiniConfig = {
  appId: string
  appSecret: string
}

type WxaCodeOptions = {
  scene: string
  page: string
  width?: number
  envVersion?: "release" | "trial" | "develop"
  checkPath?: boolean
}

function firstText(...values: Array<string | undefined>) {
  for (const value of values) {
    const text = String(value || "").trim()
    if (text) return text
  }
  return ""
}

function requireText(value: string, message: string) {
  if (!value) throw new Error(message)
  return value
}

export function getWechatMiniConfig(): WechatMiniConfig {
  return {
    appId: requireText(firstText(process.env.WECHAT_MINI_APPID, process.env.WX_MINI_APPID), "缺少 WECHAT_MINI_APPID"),
    appSecret: requireText(firstText(process.env.WECHAT_MINI_SECRET, process.env.WX_MINI_SECRET), "缺少 WECHAT_MINI_SECRET"),
  }
}

export async function getWechatMiniAccessToken(config = getWechatMiniConfig()) {
  const globalStore = globalThis as typeof globalThis & {
    __wechatMiniProgramAccessToken?: { token: string; expiresAt: number }
  }
  const cached = globalStore.__wechatMiniProgramAccessToken
  if (cached?.token && cached.expiresAt > Date.now() + 60_000) return cached.token

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token")
  url.searchParams.set("grant_type", "client_credential")
  url.searchParams.set("appid", config.appId)
  url.searchParams.set("secret", config.appSecret)

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" })
  if (!res.ok) throw new Error(`微信 access_token 获取失败: ${res.status}`)

  const data = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string }
    | null
  if (!data?.access_token) throw new Error(data?.errmsg || "微信 access_token 缺失")

  globalStore.__wechatMiniProgramAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000,
  }
  return data.access_token
}

export async function createMiniProgramCode(options: WxaCodeOptions) {
  const accessToken = await getWechatMiniAccessToken()
  const url = new URL("https://api.weixin.qq.com/wxa/getwxacodeunlimit")
  url.searchParams.set("access_token", accessToken)

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene: options.scene,
      page: options.page,
      width: Math.max(280, Math.min(1280, Math.round(Number(options.width || 430)))),
      check_path: options.checkPath ?? false,
      env_version: options.envVersion || "release",
    }),
    cache: "no-store",
  })

  const contentType = res.headers.get("content-type") || "image/png"
  const bytes = Buffer.from(await res.arrayBuffer())
  if (contentType.includes("application/json") || contentType.includes("text/")) {
    const data = JSON.parse(bytes.toString("utf8") || "{}") as { errcode?: number; errmsg?: string }
    throw new Error(data.errmsg || `微信小程序码生成失败: ${data.errcode || res.status}`)
  }
  if (!res.ok) throw new Error(`微信小程序码生成失败: ${res.status}`)

  return { bytes, contentType }
}
