const { IP_FACTORY_BASE_URL } = require("./config")
const { getDeviceId } = require("./device")
const { getAccessToken, getUser } = require("./auth")
const { getHttpBaseUrlCandidates, rememberWorkingHttpBaseUrl } = require("./http-base")

const RETRYABLE_STATUS_CODES = [403, 404, 405]
const DISABLE_TTL_MS = 60 * 1000

let trackingDisabledUntil = 0

function isTrackingTemporarilyDisabled() {
  return trackingDisabledUntil > Date.now()
}

function disableTrackingTemporarily() {
  trackingDisabledUntil = Date.now() + DISABLE_TTL_MS
}

function markTrackSuccess(url) {
  const matchedBaseUrl = url.replace(/\/api\/(?:mp\/)?track$/, "")
  rememberWorkingHttpBaseUrl(matchedBaseUrl)
  trackingDisabledUntil = 0
}

function currentPath() {
  try {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    return current?.route ? `/${current.route}` : "/mp"
  } catch (_) {
    return "/mp"
  }
}

function track(event, props = {}, options = {}) {
  if (!event) return
  if (isTrackingTemporarilyDisabled()) return

  const token = getAccessToken()
  const user = getUser()
  const deviceId = getDeviceId()

  const payload = {
    event,
    path: options.path || currentPath(),
    props: {
      source: "mp",
      deviceId,
      userId: user?.id || null,
      ...props,
    },
  }

  const urls = []
  getHttpBaseUrlCandidates(IP_FACTORY_BASE_URL).forEach((baseUrl) => {
    urls.push(`${baseUrl}/api/mp/track`)
    urls.push(`${baseUrl}/api/track`)
  })
  const uniqueUrls = [...new Set(urls)]

  const send = (index) => {
    const url = uniqueUrls[index]
    if (!url) {
      disableTrackingTemporarily()
      return
    }

    wx.request({
      url,
      method: "POST",
      data: payload,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceId ? { "x-device-id": deviceId } : {}),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          markTrackSuccess(url)
          return
        }

        if (RETRYABLE_STATUS_CODES.includes(res.statusCode) && index < uniqueUrls.length - 1) {
          send(index + 1)
          return
        }

        disableTrackingTemporarily()
      },
      fail() {
        if (index < uniqueUrls.length - 1) {
          send(index + 1)
          return
        }

        disableTrackingTemporarily()
      },
    })
  }

  send(0)
}

module.exports = { track }
