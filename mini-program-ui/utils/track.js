const { IP_FACTORY_BASE_URL } = require("./config")
const { getDeviceId } = require("./device")
const { getAccessToken, getUser } = require("./auth")

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

  const send = (url) =>
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
        // Some deployments may protect /api/track from devtools; fallback to /api/mp/track.
        if (res.statusCode === 403 || res.statusCode === 404 || res.statusCode === 405) {
          if (url.includes("/api/track")) {
            send(`${IP_FACTORY_BASE_URL}/api/mp/track`)
          } else if (url.includes("/api/mp/track")) {
            send(`${IP_FACTORY_BASE_URL}/api/track`)
          }
        }
      },
      fail() {},
    })

  // Prefer /api/mp/* routes first.
  send(`${IP_FACTORY_BASE_URL}/api/mp/track`)
}

module.exports = { track }
