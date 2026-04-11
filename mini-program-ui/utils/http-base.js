const { API_BASE_URLS, IP_FACTORY_BASE_URL } = require("./config")

const STORAGE_KEY = "preferred_http_base_url"

let cachedPreferredBaseUrl = ""

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "")
}

function getConfiguredHttpBaseUrls() {
  const unique = new Set()
  const ordered = []

  ;(Array.isArray(API_BASE_URLS) && API_BASE_URLS.length ? API_BASE_URLS : [IP_FACTORY_BASE_URL]).forEach((url) => {
    const normalized = normalizeBaseUrl(url)
    if (!normalized || unique.has(normalized)) return
    unique.add(normalized)
    ordered.push(normalized)
  })

  return ordered
}

function readStoredPreferredBaseUrl() {
  if (cachedPreferredBaseUrl) return cachedPreferredBaseUrl

  try {
    cachedPreferredBaseUrl = normalizeBaseUrl(wx.getStorageSync(STORAGE_KEY))
  } catch (_) {
    cachedPreferredBaseUrl = ""
  }

  return cachedPreferredBaseUrl
}

function isConfiguredHttpBaseUrl(url) {
  const normalized = normalizeBaseUrl(url)
  if (!normalized) return false
  return getConfiguredHttpBaseUrls().includes(normalized)
}

function rememberWorkingHttpBaseUrl(url) {
  const normalized = normalizeBaseUrl(url)
  if (!normalized || !isConfiguredHttpBaseUrl(normalized)) return

  cachedPreferredBaseUrl = normalized

  try {
    wx.setStorageSync(STORAGE_KEY, normalized)
  } catch (_) {}
}

function getPreferredHttpBaseUrl(defaultBaseUrl = IP_FACTORY_BASE_URL) {
  const configured = getConfiguredHttpBaseUrls()
  const stored = readStoredPreferredBaseUrl()

  if (stored && configured.includes(stored)) {
    return stored
  }

  const normalizedDefault = normalizeBaseUrl(defaultBaseUrl)
  if (normalizedDefault && configured.includes(normalizedDefault)) {
    return normalizedDefault
  }

  return configured[0] || normalizedDefault
}

function getHttpBaseUrlCandidates(defaultBaseUrl = IP_FACTORY_BASE_URL) {
  const preferred = getPreferredHttpBaseUrl(defaultBaseUrl)
  const normalizedDefault = normalizeBaseUrl(defaultBaseUrl)
  const candidates = [preferred, normalizedDefault, ...getConfiguredHttpBaseUrls()]
  const unique = new Set()
  const ordered = []

  candidates.forEach((url) => {
    const normalized = normalizeBaseUrl(url)
    if (!normalized || unique.has(normalized)) return
    unique.add(normalized)
    ordered.push(normalized)
  })

  return ordered
}

function buildAbsoluteApiUrl(pathOrUrl, defaultBaseUrl = IP_FACTORY_BASE_URL) {
  const value = String(pathOrUrl || "").trim()
  if (!value) return ""
  if (/^https?:\/\//i.test(value)) return value

  const baseUrl = getPreferredHttpBaseUrl(defaultBaseUrl)
  if (!baseUrl) return value

  if (value.startsWith("/")) return `${baseUrl}${value}`
  return `${baseUrl}/${value}`
}

module.exports = {
  buildAbsoluteApiUrl,
  getConfiguredHttpBaseUrls,
  getHttpBaseUrlCandidates,
  getPreferredHttpBaseUrl,
  isConfiguredHttpBaseUrl,
  normalizeBaseUrl,
  rememberWorkingHttpBaseUrl,
}
