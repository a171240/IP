let cachedBuildId = ""

function normalizeSegment(input) {
  return String(input || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
}

function getClientBuild() {
  if (cachedBuildId) return cachedBuildId

  try {
    const override = normalizeSegment(wx.getStorageSync("mp_client_build"))
    if (override) {
      cachedBuildId = override
      return cachedBuildId
    }
  } catch (_err) {}

  try {
    if (typeof wx.getAccountInfoSync === "function") {
      const info = wx.getAccountInfoSync() || {}
      const mp = info.miniProgram || {}
      const version = normalizeSegment(mp.version)
      const envVersion = normalizeSegment(mp.envVersion)
      const appId = normalizeSegment(mp.appId)
      const chunks = ["mp", appId || "unknown", version || "0", envVersion || "dev"]
      cachedBuildId = chunks.join("-")
      return cachedBuildId
    }
  } catch (_err) {}

  cachedBuildId = "mp-unknown-dev"
  return cachedBuildId
}

module.exports = {
  getClientBuild,
}
