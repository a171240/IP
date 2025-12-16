export const DEVICE_ID_STORAGE_KEY = 'ipcf_device_id'

export function getOrCreateDeviceId(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (existing && existing.trim().length >= 8) return existing

    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated)

    // Also set a cookie for 1 year (helps server-side debugging if needed)
    try {
      document.cookie = `${DEVICE_ID_STORAGE_KEY}=${encodeURIComponent(generated)}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {
      // ignore
    }

    return generated
  } catch {
    return null
  }
}
