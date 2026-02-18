const { IP_FACTORY_BASE_URL, REQUEST_TIMEOUT } = require("./config")
const { getAccessToken, loginSilent } = require("./auth")
const { getDeviceId } = require("./device")

let silentLoginPromise = null

function shouldAttachAuth(baseUrl) {
  if (!baseUrl) return false
  const normalized = baseUrl.replace(/\/$/, "")
  const target = IP_FACTORY_BASE_URL.replace(/\/$/, "")
  return normalized === target
}

function buildHeaders(baseUrl, extraHeaders) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders,
  }

  if (shouldAttachAuth(baseUrl)) {
    const token = getAccessToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const deviceId = getDeviceId()
    if (deviceId) {
      headers["x-device-id"] = deviceId
    }
  }

  return headers
}

function clearAuthAndRedirect() {
  wx.removeStorageSync("auth_access_token")
  wx.removeStorageSync("auth_refresh_token")
  wx.removeStorageSync("auth_user")
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  if (current && current.route !== "pages/login/index") {
    wx.navigateTo({ url: "/pages/login/index" })
  }
}

function trySilentLoginOnce() {
  if (silentLoginPromise) return silentLoginPromise
  silentLoginPromise = loginSilent()
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      silentLoginPromise = null
    })
  return silentLoginPromise
}

function extractErrorMessage(data, fallback) {
  if (!data) return fallback

  // JSON body (normal APIs)
  if (typeof data === "object") {
    return data.error || data.message || fallback
  }

  // Text body: try to parse JSON error, otherwise return truncated text.
  if (typeof data === "string") {
    const trimmed = data.trim()
    if (trimmed) {
      const lower = trimmed.slice(0, 64).toLowerCase()
      // If the backend returns a Next.js/HTML error page (404/500/WAF), do not show raw HTML in toasts.
      if (lower.startsWith("<!doctype html") || lower.startsWith("<html")) {
        return fallback
      }

      try {
        const parsed = JSON.parse(trimmed)
        if (parsed && typeof parsed === "object") {
          return parsed.error || parsed.message || fallback
        }
      } catch (_) {
        // ignore
      }

      return trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed
    }
  }

  return fallback
}

function looksLikeHtml(data) {
  if (typeof data !== "string") return false
  const trimmed = data.trim()
  if (!trimmed) return false
  const lower = trimmed.slice(0, 64).toLowerCase()
  return lower.startsWith("<!doctype html") || lower.startsWith("<html")
}

function normalizeTextResponseData(data) {
  if (typeof data !== "string") return data
  const trimmed = data.trim()
  if (!trimmed) return data

  try {
    const parsed = JSON.parse(trimmed)
    return parsed
  } catch (_) {
    return data
  }
}

function request(opts) {
  const { baseUrl, url, method = "GET", data, header, __retried401 } = opts
  const normalizedBase = baseUrl.replace(/\/$/, "")
  const canRetry401 = !__retried401 && shouldAttachAuth(normalizedBase)

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${normalizedBase}${url}`,
      method,
      data,
      header: buildHeaders(normalizedBase, header),
      timeout: REQUEST_TIMEOUT,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        if (res.statusCode === 401 && canRetry401) {
          trySilentLoginOnce().then((ok) => {
            if (ok) {
              request({ ...opts, __retried401: true }).then(resolve).catch(reject)
              return
            }
            clearAuthAndRedirect()
            reject({
              statusCode: 401,
              message: "登录已过期，请重新登录",
              data: res.data,
            })
          })
          return
        }

        if (res.statusCode === 401) {
          clearAuthAndRedirect()
        }

        const isHtml = looksLikeHtml(res.data)
        const fallback =
          res.statusCode === 404 && isHtml
            ? "接口不存在（后端未部署最新版），请更新后端后重试"
            : res.errMsg || "Request failed"

        reject({
          statusCode: res.statusCode,
          message: extractErrorMessage(res.data, fallback),
          data: res.data,
        })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function requestText(opts) {
  const { baseUrl, url, method = "GET", data, header, __retried401 } = opts
  const normalizedBase = baseUrl.replace(/\/$/, "")
  const canRetry401 = !__retried401 && shouldAttachAuth(normalizedBase)

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${normalizedBase}${url}`,
      method,
      data,
      header: buildHeaders(normalizedBase, header),
      responseType: "text",
      timeout: REQUEST_TIMEOUT,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        const normalizedData = normalizeTextResponseData(res.data)

        if (res.statusCode === 401 && canRetry401) {
          trySilentLoginOnce().then((ok) => {
            if (ok) {
              requestText({ ...opts, __retried401: true }).then(resolve).catch(reject)
              return
            }
            clearAuthAndRedirect()
            reject({
              statusCode: 401,
              message: "登录已过期，请重新登录",
              data: normalizedData,
            })
          })
          return
        }

        if (res.statusCode === 401) {
          clearAuthAndRedirect()
        }

        const isHtml = looksLikeHtml(res.data)
        const fallback =
          res.statusCode === 404 && isHtml
            ? "接口不存在（后端未部署最新版），请更新后端后重试"
            : res.errMsg || "Request failed"

        reject({
          statusCode: res.statusCode,
          message: extractErrorMessage(normalizedData, fallback),
          data: normalizedData,
        })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

function requestTextWithMeta(opts) {
  const { baseUrl, url, method = "GET", data, header, __retried401 } = opts
  const normalizedBase = baseUrl.replace(/\/$/, "")
  const canRetry401 = !__retried401 && shouldAttachAuth(normalizedBase)

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${normalizedBase}${url}`,
      method,
      data,
      header: buildHeaders(normalizedBase, header),
      responseType: "text",
      timeout: REQUEST_TIMEOUT,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ data: res.data, headers: res.header || {}, statusCode: res.statusCode })
          return
        }

        const normalizedData = normalizeTextResponseData(res.data)

        if (res.statusCode === 401 && canRetry401) {
          trySilentLoginOnce().then((ok) => {
            if (ok) {
              requestTextWithMeta({ ...opts, __retried401: true }).then(resolve).catch(reject)
              return
            }
            clearAuthAndRedirect()
            reject({
              statusCode: 401,
              message: "登录已过期，请重新登录",
              data: normalizedData,
              headers: res.header || {},
            })
          })
          return
        }

        if (res.statusCode === 401) {
          clearAuthAndRedirect()
        }

        const isHtml = looksLikeHtml(res.data)
        const fallback =
          res.statusCode === 404 && isHtml
            ? "接口不存在（后端未部署最新版），请更新后端后重试"
            : res.errMsg || "Request failed"

        reject({
          statusCode: res.statusCode,
          message: extractErrorMessage(normalizedData, fallback),
          data: normalizedData,
          headers: res.header || {},
        })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

module.exports = {
  request,
  requestText,
  requestTextWithMeta,
}
