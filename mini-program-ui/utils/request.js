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
          message: res.data?.error || res.errMsg || "Request failed",
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
          message: res.data?.error || res.errMsg || "Request failed",
          data: res.data,
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
}
