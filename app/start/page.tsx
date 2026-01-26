import StartClient from "./start-client"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export default async function StartPage() {
  let userInfo: { id: string; email?: string } | null = null
  let remainingDays = 0
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
      const proExpiresAt = entitlement?.pro_expires_at ?? null

      const { data: profiles } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .limit(1)

      const plan = profiles?.[0]?.plan as string | undefined
      const now = new Date()

      if (proExpiresAt) {
        const expiry = new Date(proExpiresAt)
        if (expiry > now) {
          remainingDays = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          isPro = true
        }
      }

      if (plan === "pro" || plan === "vip" || plan === "trial_pro") {
        isPro = true
      }
    }
  } catch {
    userInfo = null
  }

  return (
    <StartClient
      user={userInfo}
      remainingDays={remainingDays}
      isPro={isPro}
    />
  )
}
