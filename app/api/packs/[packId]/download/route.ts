import { NextRequest, NextResponse } from "next/server"

import { readPackFileForDownload } from "@/lib/packs/packs.server"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { getCreditCostForPackFileDownload, normalizePlan } from "@/lib/pricing/rules"
import { consumeCredits, ensureTrialCreditsIfNeeded, getClientIp, hashIp } from "@/lib/pricing/profile.server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params

  const url = new URL(request.url)
  const relativePath = url.searchParams.get("file")

  if (!relativePath) {
    return NextResponse.json({ error: "缺少 file 参数" }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }

  try {
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
    const creditsUnlimited = Boolean(userProfile?.credits_unlimited) || currentPlan === "vip"

    const cost = getCreditCostForPackFileDownload(packId, currentPlan)

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
      }

      const consumed = await consumeCredits({
        supabase,
        userId: user.id,
        currentBalance: creditsBalance,
        amount: cost,
        stepId: `download:pack:${packId}`,
      })
      creditsBalance = consumed.credits_balance
    }

    const { content, normalizedRequested } = await readPackFileForDownload(packId, relativePath)

    const fileName = normalizedRequested.split(/[/\\]/).pop() || "prompt.md"
    const isMarkdown = fileName.toLowerCase().endsWith(".md")

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": isMarkdown ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-cache",
        "X-Credits-Cost": String(cost),
        "X-Credits-Remaining": creditsUnlimited ? "inf" : String(creditsBalance),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_credits") {
      const meta = (error as unknown as { meta?: { required?: number; balance?: number } }).meta
      return NextResponse.json(
        {
          error: `积分不足：本次需消耗 ${meta?.required ?? 0}，当前剩余 ${meta?.balance ?? 0}。`,
          code: "insufficient_credits",
          required: meta?.required ?? 0,
          balance: meta?.balance ?? 0,
        },
        { status: 402 }
      )
    }

    const message = error instanceof Error ? error.message : "下载失败"
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
