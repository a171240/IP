"use client"

import type React from "react"
import Link, { type LinkProps } from "next/link"
import { track } from "@/lib/analytics/client"

type TrackedLinkProps = LinkProps & {
  eventName: string
  eventProps?: Record<string, unknown>
  className?: string
  children: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}

export function TrackedLink({
  eventName,
  eventProps,
  onClick,
  ...props
}: TrackedLinkProps) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event)
        track(eventName, eventProps)
      }}
    />
  )
}
