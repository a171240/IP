import { redirect } from "next/navigation"

type RedeemSearchParams = Record<string, string | string[] | undefined>

type RedeemPageProps = {
  searchParams?: RedeemSearchParams | Promise<RedeemSearchParams>
}

function getParam(searchParams: RedeemSearchParams | undefined, key: string): string | undefined {
  const value = searchParams?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function RedeemPage({ searchParams }: RedeemPageProps) {
  const resolvedParams = await Promise.resolve(searchParams)
  const params = new URLSearchParams()
  const code = getParam(resolvedParams, "code")
  const email = getParam(resolvedParams, "email")
  const utm_source = getParam(resolvedParams, "utm_source")
  const utm_medium = getParam(resolvedParams, "utm_medium")
  const utm_campaign = getParam(resolvedParams, "utm_campaign")
  const utm_content = getParam(resolvedParams, "utm_content")
  const utm_term = getParam(resolvedParams, "utm_term")

  if (code) params.set("code", code)
  if (email) params.set("email", email)
  if (utm_source) params.set("utm_source", utm_source)
  if (utm_medium) params.set("utm_medium", utm_medium)
  if (utm_campaign) params.set("utm_campaign", utm_campaign)
  if (utm_content) params.set("utm_content", utm_content)
  if (utm_term) params.set("utm_term", utm_term)

  const query = params.toString()
  redirect(query ? `/activate?${query}` : "/activate")
}
