"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

const LAST_RESULT_KEY = "latestDiagnosisId"
const LAST_PACK_KEY = "latestDeliveryPackId"

export default function DiagnosisRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const force = searchParams?.get("force")
  const shouldSkip = force === "1" || force === "true"

  useEffect(() => {
    if (shouldSkip) return
    if (typeof window === "undefined") return
    const latestPack = window.localStorage.getItem(LAST_PACK_KEY)
    if (latestPack) {
      router.replace(`/delivery-pack/${latestPack}`)
      return
    }
    const stored = window.localStorage.getItem(LAST_RESULT_KEY)
    if (stored) {
      router.replace(`/diagnosis/result/${stored}`)
    }
  }, [router, shouldSkip])

  return null
}
