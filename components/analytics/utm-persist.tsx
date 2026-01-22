"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function persistUtmFromLocation() {
  if (typeof window === "undefined") return

  const params = new URLSearchParams(window.location.search)
  let hasUtm = false

  UTM_KEYS.forEach((key) => {
    const value = params.get(key)
    if (!value) return

    hasUtm = true
    const encoded = encodeURIComponent(value)
    document.cookie = `${key}=${encoded}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`
    try {
      localStorage.setItem(key, value)
    } catch {
      // Ignore storage write failures.
    }
  })

  if (!hasUtm) return
}

export function UtmPersist() {
  const pathname = usePathname()

  useEffect(() => {
    persistUtmFromLocation()
  }, [pathname])

  return null
}
