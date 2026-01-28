import ActivateClient from "./activate-client"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type ActivateSearchParams = Record<string, string | string[] | undefined>

type ActivatePageProps = {
  searchParams?: ActivateSearchParams | Promise<ActivateSearchParams>
}

function getParam(searchParams: ActivateSearchParams | undefined, key: string): string | undefined {
  const value = searchParams?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const resolvedParams = await Promise.resolve(searchParams)
  const utm = {
    utm_source: getParam(resolvedParams, "utm_source"),
    utm_medium: getParam(resolvedParams, "utm_medium"),
    utm_campaign: getParam(resolvedParams, "utm_campaign"),
    utm_content: getParam(resolvedParams, "utm_content"),
    utm_term: getParam(resolvedParams, "utm_term"),
  }

  let userInfo: { id?: string; email?: string } | null = null
  let isPro = false
  let proExpiresAt: string | null = null

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      userInfo = { id: user.id, email: user.email ?? undefined }

      const { data: entitlements } = await supabase
        .from("entitlements")
        .select("plan, pro_expires_at")
        .eq("user_id", user.id)
        .limit(1)

      const entitlement = entitlements?.[0]
      proExpiresAt = entitlement?.pro_expires_at ?? null
      const now = new Date()
      if (proExpiresAt) {
        const expiry = new Date(proExpiresAt)
        if (expiry > now) {
          isPro = true
        }
      }
      if (entitlement?.plan && ["pro", "vip", "trial_pro"].includes(entitlement.plan)) {
        if (proExpiresAt ? new Date(proExpiresAt) > now : entitlement.plan !== "trial_pro") {
          isPro = true
        }
      }
    }
  } catch {
    userInfo = null
  }

  return <ActivateClient utm={utm} user={userInfo} isPro={isPro} proExpiresAt={proExpiresAt} />
}
