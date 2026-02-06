const { IP_FACTORY_BASE_URL, REQUEST_TIMEOUT } = require("./config")
const { getAccessToken } = require("./auth")
const { getDeviceId } = require("./device")

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
  const { baseUrl, url, method = "GET", data, header } = opts
  const normalizedBase = baseUrl.replace(/\/$/, "")

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

        if (res.statusCode === 401) {
          wx.removeStorageSync("auth_access_token")
          wx.removeStorageSync("auth_refresh_token")
          wx.removeStorageSync("auth_user")
          const pages = getCurrentPages()
          const current = pages[pages.length - 1]
          if (current && current.route !== "pages/login/index") {
            wx.navigateTo({ url: "/pages/login/index" })
          }
        }

        reject({
          statusCode: res.statusCode,
          message: extractErrorMessage(res.data, res.errMsg || "Request failed"),
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
  const { baseUrl, url, method = "GET", data, header } = opts
  const normalizedBase = baseUrl.replace(/\/$/, "")

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

        if (res.statusCode === 401) {
          wx.removeStorageSync("auth_access_token")
          wx.removeStorageSync("auth_refresh_token")
          wx.removeStorageSync("auth_user")
          const pages = getCurrentPages()
          const current = pages[pages.length - 1]
          if (current && current.route !== "pages/login/index") {
            wx.navigateTo({ url: "/pages/login/index" })
          }
        }

        reject({
          statusCode: res.statusCode,
          message: extractErrorMessage(normalizedData, res.errMsg || "Request failed"),
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
  const { baseUrl, url, method = "GET", data, header } = opts
  const normalizedBase = baseUrl.replace(/\/$/, "")

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

        if (res.statusCode === 401) {
          wx.removeStorageSync("auth_access_token")
          wx.removeStorageSync("auth_refresh_token")
          wx.removeStorageSync("auth_user")
          const pages = getCurrentPages()
          const current = pages[pages.length - 1]
          if (current && current.route !== "pages/login/index") {
            wx.navigateTo({ url: "/pages/login/index" })
          }
        }

        reject({
          statusCode: res.statusCode,
          message: extractErrorMessage(normalizedData, res.errMsg || "Request failed"),
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
