import { NextRequest, NextResponse } from "next/server"

import { listPromptFiles, readPromptFile } from "@/lib/prompts/prompts.server"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { getCreditCostForPromptDownload, getPromptPreviewMaxChars, normalizePlan } from "@/lib/pricing/rules"
import { consumeCredits, ensureTrialCreditsIfNeeded, getClientIp, hashIp } from "@/lib/pricing/profile.server"

type CreditsProfile = {
  plan?: string | null
  credits_balance?: number | null
  credits_unlimited?: boolean | null
  trial_granted_at?: string | null
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...(extra || {}) }, { status })
}

function isProfilesSchemaMissing(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()

  const hasMissingRelation = m.includes("relation") && m.includes("does not exist") && m.includes("profiles")
  const hasMissingColumn =
    (m.includes("column") || m.includes("undefined_column")) &&
    m.includes("does not exist") &&
    (m.includes("credits_balance") ||
      m.includes("credits_unlimited") ||
      m.includes("trial_granted_at") ||
      m.includes("plan"))

  return hasMissingRelation || hasMissingColumn
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const dir = url.searchParams.get("dir")
    const file = url.searchParams.get("file")
    const download = url.searchParams.get("download") === "1"

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError(500, "Supabase not configured. Check .env.local.")
    }

    const supabase = await createServerSupabaseClientForRequest(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return jsonError(401, "请先登录")
    }

    if (dir) {
      const files = await listPromptFiles(dir)
      return NextResponse.json({ dir, files })
    }

    if (!file) {
      return jsonError(400, "Missing `file` or `dir`")
    }

    const { content, fileName } = await readPromptFile(file)

    let creditsAvailable = true
    let currentPlan = normalizePlan("free")
    let creditsBalance = 0
    let creditsUnlimited = false
    let trialGrantedAt: string | null = null

    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("plan, credits_balance, credits_unlimited, trial_granted_at")
        .eq("id", user.id)
        .single()

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
            if (isProfilesSchemaMissing(createError?.message)) {
              creditsAvailable = false
            } else {
              return jsonError(500, createError?.message || "profile create failed")
            }
          } else {
            currentPlan = normalizePlan(created.plan)
            creditsBalance = Number(created.credits_balance || 0)
            creditsUnlimited = Boolean(created.credits_unlimited) || currentPlan === "vip"
            trialGrantedAt = (created.trial_granted_at as string | null) ?? null
          }
        } else if (isProfilesSchemaMissing(profileError?.message)) {
          creditsAvailable = false
        } else {
          return jsonError(500, profileError?.message || "profile not found")
        }
      } else {
        currentPlan = normalizePlan(profile.plan)
        creditsBalance = Number((profile as CreditsProfile).credits_balance || 0)
        creditsUnlimited = Boolean((profile as CreditsProfile).credits_unlimited) || currentPlan === "vip"
        trialGrantedAt = ((profile as CreditsProfile).trial_granted_at as string | null) ?? null
      }
    } catch (e) {
      console.warn("profiles read failed, credit logic disabled:", e instanceof Error ? e.message : e)
      creditsAvailable = false
    }

    if (download) {
      let cost = 0

      try {
        cost = getCreditCostForPromptDownload(file, currentPlan)

        if (creditsAvailable && !creditsUnlimited && cost > 0) {
          const deviceId = request.headers.get("x-device-id") || ""
          const ip = getClientIp(request)
          const ipHash = ip ? hashIp(ip) : null

          if (!trialGrantedAt && creditsBalance <= 0 && deviceId.trim().length >= 8) {
            const updated = await ensureTrialCreditsIfNeeded({
              supabase,
              userId: user.id,
              profile: {
                plan: currentPlan,
                credits_balance: creditsBalance,
                credits_unlimited: creditsUnlimited,
                trial_granted_at: trialGrantedAt,
              },
              deviceId,
              ipHash,
            })
            creditsBalance = updated.credits_balance
            creditsUnlimited = updated.credits_unlimited
            trialGrantedAt = updated.trial_granted_at
          }

          const consumed = await consumeCredits({
            supabase,
            userId: user.id,
            currentBalance: creditsBalance,
            amount: cost,
            stepId: `download:prompt:${file}`,
          })
          creditsBalance = consumed.credits_balance
        } else if (!creditsAvailable) {
          cost = 0
        }
      } catch (e) {
        if (e instanceof Error && e.message === "insufficient_credits") {
          const meta = (e as unknown as { meta?: { required?: number; balance?: number } }).meta
          return jsonError(
            402,
            `积分不足：本次需消耗 ${meta?.required ?? 0}，当前余额 ${meta?.balance ?? 0}。`,
            {
            code: "insufficient_credits",
            required: meta?.required ?? 0,
            balance: meta?.balance ?? 0,
            }
          )
        }

        if (e instanceof Error && isProfilesSchemaMissing(e.message)) {
          creditsAvailable = false
          cost = 0
        } else {
          console.warn("prompt download credit check failed, skipping:", e instanceof Error ? e.message : e)
          cost = 0
        }
      }

      const body = new Uint8Array(content)
      return new Response(body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename=\"${encodeURIComponent(fileName)}\"`,
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
      const meta = (error as unknown as { meta?: { required?: number; balance?: number } }).meta
      return jsonError(402, `\u79ef\u5206\u4e0d\u8db3\uff1a\u672c\u6b21\u9700\u6d88\u8017 ${meta?.required ?? 0}\uff0c\u5f53\u524d\u4f59\u989d ${meta?.balance ?? 0}\u3002`, {
        code: "insufficient_credits",
        required: meta?.required ?? 0,
        balance: meta?.balance ?? 0,
      })
    }

    const message = error instanceof Error ? error.message : "Unknown error"
    if (message === "Invalid prompts path" || message === "File type not allowed") {
      return jsonError(400, message)
    }
    if (message.includes("ENOENT") || message.toLowerCase().includes("no such file")) {
      return jsonError(404, "鎻愮ず璇嶆枃浠朵笉瀛樺湪")
    }

    console.error("/api/prompts error:", error)
    return jsonError(500, message)
  }
}




