import RedeemClient from "./redeem-client"
import { createServerSupabaseClient } from "@/lib/supabase/server"

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
  const utm = {
    utm_source: getParam(resolvedParams, "utm_source"),
    utm_medium: getParam(resolvedParams, "utm_medium"),
    utm_campaign: getParam(resolvedParams, "utm_campaign"),
    utm_content: getParam(resolvedParams, "utm_content"),
    utm_term: getParam(resolvedParams, "utm_term"),
  }

  let userInfo: { id?: string; email?: string } | null = null
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      userInfo = { id: user.id, email: user.email ?? undefined }
    }
  } catch {
    userInfo = null
  }

  return <RedeemClient utm={utm} user={userInfo} />
}
