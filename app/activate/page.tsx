import ActivateClient from "./activate-client"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type ActivatePageProps = {
  searchParams?: Record<string, string | string[] | undefined>
}

function getParam(
  searchParams: ActivatePageProps["searchParams"],
  key: string
): string | undefined {
  const value = searchParams?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const utm = {
    utm_source: getParam(searchParams, "utm_source"),
    utm_medium: getParam(searchParams, "utm_medium"),
    utm_campaign: getParam(searchParams, "utm_campaign"),
    utm_content: getParam(searchParams, "utm_content"),
    utm_term: getParam(searchParams, "utm_term"),
  }

  let userInfo: { id?: string; email?: string } | null = null
  let activationStatus: string | null = null
  let isPro = false

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
      const proExpiresAt = entitlement?.pro_expires_at ? new Date(entitlement.pro_expires_at) : null
      const now = new Date()
      if (proExpiresAt && proExpiresAt > now) {
        isPro = true
      }
      if (entitlement?.plan && ["pro", "vip", "trial_pro"].includes(entitlement.plan)) {
        if (proExpiresAt ? proExpiresAt > now : entitlement.plan !== "trial_pro") {
          isPro = true
        }
      }

      const { data: activations } = await supabase
        .from("activation_requests")
        .select("status")
        .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`)
        .order("created_at", { ascending: false })
        .limit(1)

      activationStatus = activations?.[0]?.status ?? null
    }
  } catch {
    userInfo = null
  }

  return <ActivateClient utm={utm} user={userInfo} activationStatus={activationStatus} isPro={isPro} />
}
