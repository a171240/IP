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

  wx.request({
    url: `${IP_FACTORY_BASE_URL}/api/track`,
    method: "POST",
    data: payload,
    header: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceId ? { "x-device-id": deviceId } : {}),
    },
    success() {},
    fail() {},
  })
}

module.exports = { track }

