"use client"

import { useEffect } from "react"
import { track } from "@/lib/analytics/client"

type PageViewProps = {
  eventName: string
  eventProps?: Record<string, unknown>
}

export function PageView({ eventName, eventProps }: PageViewProps) {
  useEffect(() => {
    track(eventName, eventProps)
  }, [eventName, eventProps])

  return null
}
