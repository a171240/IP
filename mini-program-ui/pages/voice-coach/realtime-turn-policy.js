function shouldUseRealtimeTransport(audioSeconds, minRealtimeSeconds) {
  const duration = Number(audioSeconds || 0)
  const threshold = Math.max(0, Number(minRealtimeSeconds || 0))
  if (!Number.isFinite(duration) || duration <= 0) return true
  if (!threshold) return true
  return duration >= threshold
}

function shouldSkipEnsureEventsPolling(options = {}) {
  const realtimeMode = Boolean(options.realtimeMode)
  const realtimeConnecting = Boolean(options.realtimeConnecting)
  const httpFallbackTurnActive = Boolean(options.httpFallbackTurnActive)
  return Boolean((realtimeMode || realtimeConnecting) && !httpFallbackTurnActive)
}

function shouldBlockRecordingForHttpFallback(httpFallbackTurnActive) {
  return Boolean(httpFallbackTurnActive)
}

function canAutoPlayTurn(lastPlayedAt, now = Date.now(), cooldownMs = 1500) {
  const lastAt = Number(lastPlayedAt || 0)
  const currentAt = Number(now || 0) || Date.now()
  const cooldown = Math.max(0, Number(cooldownMs || 0))
  if (!lastAt || !cooldown) return true
  return currentAt - lastAt >= cooldown
}

function resolveCustomerTurnIndex(explicitTurnIndex, beauticianTurnIndex) {
  const hasExplicitTurnIndex =
    explicitTurnIndex !== null && explicitTurnIndex !== undefined && String(explicitTurnIndex).trim() !== ""
  const customerIndex = hasExplicitTurnIndex ? Number(explicitTurnIndex) : NaN
  if (Number.isFinite(customerIndex)) return customerIndex
  const hasBeauticianTurnIndex =
    beauticianTurnIndex !== null && beauticianTurnIndex !== undefined && String(beauticianTurnIndex).trim() !== ""
  const beauticianIndex = hasBeauticianTurnIndex ? Number(beauticianTurnIndex) : NaN
  if (!Number.isFinite(beauticianIndex)) return null
  return beauticianIndex + 1
}

function shouldAutoPlayLatestCustomerTurn(options = {}) {
  const turnId = String(options.turnId || "")
  const role = String(options.role || "")
  const latestCustomerTurnId = String(options.latestCustomerTurnId || "")
  const turnIndex = Number(options.turnIndex)
  const latestBeauticianTurnIndex = Number(options.latestBeauticianTurnIndex)
  if (!turnId) return false
  if (role && role !== "customer") return false
  if (latestCustomerTurnId && latestCustomerTurnId !== turnId) return false
  if (
    Number.isFinite(turnIndex) &&
    Number.isFinite(latestBeauticianTurnIndex) &&
    latestBeauticianTurnIndex >= turnIndex + 1
  ) {
    return false
  }
  return canAutoPlayTurn(options.lastPlayedAt, options.now, options.cooldownMs)
}

module.exports = {
  shouldUseRealtimeTransport,
  shouldSkipEnsureEventsPolling,
  shouldBlockRecordingForHttpFallback,
  canAutoPlayTurn,
  resolveCustomerTurnIndex,
  shouldAutoPlayLatestCustomerTurn,
}
