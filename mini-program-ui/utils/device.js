const DEVICE_ID_KEY = "device_id"

function getDeviceId() {
  const cached = wx.getStorageSync(DEVICE_ID_KEY)
  if (cached) return cached

  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const deviceId = `mp_${seed}`
  wx.setStorageSync(DEVICE_ID_KEY, deviceId)
  return deviceId
}

module.exports = {
  getDeviceId,
}
