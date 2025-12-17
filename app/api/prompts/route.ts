import { NextRequest, NextResponse } from "next/server"

import { listPromptFiles, readPromptFile } from "@/lib/prompts/prompts.server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import {
  getCreditCostForPromptDownload,
  getPromptPreviewMaxChars,
  normalizePlan,
} from "@/lib/pricing/rules"
import { consumeCredits, ensureTrialCreditsIfNeeded, getClientIp, hashIp } from "@/lib/pricing/profile.server"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const dir = url.searchParams.get("dir")
  const file = url.searchParams.get("file")
  const download = url.searchParams.get("download") === "1"

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
    if (dir) {
      const files = await listPromptFiles(dir)
      return NextResponse.json({ dir, files })
    }

    if (!file) {
      return NextResponse.json({ error: "Missing `file` or `dir`" }, { status: 400 })
    }

    const { content, fileName } = await readPromptFile(file)

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan, credits_balance, credits_unlimited, trial_granted_at")
      .eq("id", user.id)
      .single()

    let userProfile = profile
    if (profileError || !profile) {
      if (profileError?.code === "PGRST116") {
        const { data: created, error: createError } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email,
            nickname: user.email?.split("@")[0] || "User",
            plan: "free",
            credits_balance: 30,
            credits_unlimited: false,
          })
          .select("plan, credits_balance, credits_unlimited, trial_granted_at")
          .single()

        if (createError || !created) {
          return NextResponse.json({ error: createError?.message || "profile create failed" }, { status: 500 })
        }
        userProfile = created
      } else {
        return NextResponse.json({ error: profileError?.message || "profile not found" }, { status: 500 })
      }
    }

    const currentPlan = normalizePlan(userProfile?.plan)
    let creditsBalance = Number(userProfile?.credits_balance || 0)
    let creditsUnlimited = Boolean(userProfile?.credits_unlimited) || currentPlan === "vip"

    if (download) {
      const cost = getCreditCostForPromptDownload(file, currentPlan)

      if (!creditsUnlimited && cost > 0) {
        const deviceId = request.headers.get("x-device-id") || ""
        const ip = getClientIp(request)
        const ipHash = ip ? hashIp(ip) : null

        if (!userProfile?.trial_granted_at && creditsBalance <= 0 && deviceId.trim().length >= 8) {
          const updated = await ensureTrialCreditsIfNeeded({
            supabase,
            userId: user.id,
            profile: {
              plan: currentPlan,
              credits_balance: creditsBalance,
              credits_unlimited: creditsUnlimited,
              trial_granted_at: (userProfile?.trial_granted_at as string | null) ?? null,
            },
            deviceId,
            ipHash,
          })
          creditsBalance = updated.credits_balance
          creditsUnlimited = updated.credits_unlimited
        }

        const consumed = await consumeCredits({
          supabase,
          userId: user.id,
          currentBalance: creditsBalance,
          amount: cost,
          stepId: `download:prompt:${file}`,
        })
        creditsBalance = consumed.credits_balance
      }

      const body = new Uint8Array(content)
      return new Response(body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
          "Cache-Control": "no-cache",
          "X-Credits-Cost": String(cost),
          "X-Credits-Remaining": creditsUnlimited ? "inf" : String(creditsBalance),
        },
      })
    }

    const fullText = content.toString("utf8")
    const maxChars = getPromptPreviewMaxChars(file)
    const truncated = fullText.length > maxChars
    const preview = truncated ? fullText.slice(0, maxChars) : fullText

    return NextResponse.json({
      file,
      content: preview,
      truncated,
      preview_chars: maxChars,
      download_cost: getCreditCostForPromptDownload(file, currentPlan),
      plan: currentPlan,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_credits") {
      // consumeCredits ?? meta ??? required/balance
      const meta = (error as unknown as { meta?: { required?: number; balance?: number } }).meta
      return NextResponse.json(
        {
          error: `?????????? ${meta?.required ?? 0}????? ${meta?.balance ?? 0}?`,
          code: "insufficient_credits",
          required: meta?.required ?? 0,
          balance: meta?.balance ?? 0,
        },
        { status: 402 }
      )
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 })
  }
}
