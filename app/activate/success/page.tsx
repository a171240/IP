import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import ActivateSuccessClient from "./activate-success-client"

export const runtime = "nodejs"

export default async function ActivateSuccessPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/login?redirect=${encodeURIComponent("/activate/success")}`)
  }

  let isPro = false
  let proExpiresAt: string | null = null

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

  return (
    <ActivateSuccessClient
      user={{ id: user.id, email: user.email ?? undefined }}
      isPro={isPro}
      proExpiresAt={proExpiresAt}
    />
  )
}
