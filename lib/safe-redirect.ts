export type SafeRedirectResult = {
  pathname: string
  search: string
  href: string
}

const DEFAULT_REDIRECT = "/dashboard"
const BASE_ORIGIN = "http://localhost"

export function safeRedirect(
  input: unknown,
  fallback: string = DEFAULT_REDIRECT
): SafeRedirectResult {
  const fallbackResult = buildFallback(fallback)
  if (typeof input !== "string") return fallbackResult

  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return fallbackResult
  if (trimmed.startsWith("//")) return fallbackResult
  if (trimmed.includes("://")) return fallbackResult

  try {
    const url = new URL(trimmed, BASE_ORIGIN)
    const pathname = url.pathname
    if (pathname === "/auth" || pathname.startsWith("/auth/")) {
      return fallbackResult
    }

    return buildResult(pathname, url.search)
  } catch {
    return fallbackResult
  }
}

function buildFallback(fallback: string): SafeRedirectResult {
  try {
    const url = new URL(fallback, BASE_ORIGIN)
    return buildResult(url.pathname, url.search)
  } catch {
    return buildResult(DEFAULT_REDIRECT, "")
  }
}

function buildResult(pathname: string, search: string): SafeRedirectResult {
  return { pathname, search, href: `${pathname}${search}` }
}
