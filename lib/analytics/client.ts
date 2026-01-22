"use client"

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const

type UtmKey = (typeof UTM_KEYS)[number]
type UtmValues = Partial<Record<UtmKey, string>>

function readCookieValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function getStoredUtm(): UtmValues {
  const utm: UtmValues = {}

  UTM_KEYS.forEach((key) => {
    const cookieValue = readCookieValue(key)
    if (cookieValue) {
      utm[key] = cookieValue
      return
    }
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem(key)
        if (stored) utm[key] = stored
      } catch {
        // Ignore storage read failures.
      }
    }
  })

  return utm
}

export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return

  const payload = {
    event,
    props,
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    utm: getStoredUtm(),
  }

  const body = JSON.stringify(payload)

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" })
    navigator.sendBeacon("/api/track", blob)
    return
  }

  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {})
}
