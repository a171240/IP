import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  buildAssistantMessage,
  buildPosterBrief,
  buildPosterFieldsFromBrief,
  coercePosterAnswers,
  getPosterMissingFields,
  recommendPosterTemplate,
  safeJsonParseObject,
  shouldUseLlmFallback,
  type PosterIntakeAnswers,
  type StoreProfileForPoster,
} from "@/lib/posters/intake"
import { resolveBillingContext, trackServerEvent, type BillingContext } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

const bodySchema = z.object({
  sessionId: z.string().trim().max(80).optional(),
  message: z.string().trim().max(1200).optional().default(""),
  store_profile_id: z.string().uuid().optional(),
  answers: z.any().optional(),
  asset_refs: z.array(z.any()).max(4).optional().default([]),
})

async function loadStoreProfile(opts: {
  billing: BillingContext
  storeProfileId: string
}): Promise<StoreProfileForPoster | null> {
  const { billing, storeProfileId } = opts
  const { data, error } = await billing.supabase
    .from("store_profiles")
    .select("id, name, city, district, landmark, shop_type, main_offer_name, promises")
    .eq("id", storeProfileId)
    .eq("user_id", billing.userId)
    .maybeSingle()

  if (error || !data) return null
  return data as StoreProfileForPoster
}

function extractMessageContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices.length) return ""
  const first = choices[0] as { message?: { content?: unknown } }
  return typeof first?.message?.content === "string" ? first.message.content : ""
}

async function callBriefLlm(opts: {
  message: string
  answers: PosterIntakeAnswers
  profile: StoreProfileForPoster | null
}): Promise<PosterIntakeAnswers | null> {
  const apiKey =
    (process.env.APIMART_QUICK_API_KEY && process.env.APIMART_QUICK_API_KEY !== "your-api-key-here"
      ? process.env.APIMART_QUICK_API_KEY
      : process.env.APIMART_API_KEY) || ""
  if (!apiKey || apiKey === "your-api-key-here") return null

  const baseUrl =
    (process.env.APIMART_QUICK_BASE_URL && process.env.APIMART_QUICK_BASE_URL.trim()
      ? process.env.APIMART_QUICK_BASE_URL
      : process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1").replace(/\/$/, "")
  const model = (process.env.APIMART_QUICK_MODEL || process.env.APIMART_MODEL || "kimi-k2-thinking").trim()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "你是本地生活商业海报问诊助手。只输出 JSON，不输出解释。字段仅限 storeName, cityArea, industry, shopType, posterGoal, campaignTitle, projectName, headline, subline, audience, sellingPoints, offerText, dateRange, cta, constraints, templateId, stylePreset。templateId 必须是 P01-P12 之一。事实字段如价格、日期、店名必须按用户原文保留。",
          },
          {
            role: "user",
            content: JSON.stringify({
              message: opts.message,
              currentAnswers: opts.answers,
              storeProfile: opts.profile,
              templateMap: {
                P01: "新客首单",
                P02: "节日活动",
                P03: "爆款项目/产品/套餐",
                P04: "品牌形象",
                P05: "会员招募",
                P06: "开业宣传",
                P07: "本地探店",
                P08: "避坑攻略",
                P09: "知识科普卡",
                P10: "价目菜单",
                P11: "门店电子屏",
                P12: "朋友圈转发",
              },
            }),
          },
        ],
      }),
    })

    if (!res.ok) return null
    const json = await res.json().catch(() => null)
    const content = extractMessageContent(json)
    const parsed = safeJsonParseObject(content)
    return parsed ? coercePosterAnswers(parsed) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 })
  }

  const billing = await resolveBillingContext(request)
  if (!billing.ok) return billing.error

  const input = parsed.data
  const sessionId = input.sessionId?.trim() || randomUUID()
  const answers = coercePosterAnswers(input.answers)
  const storeProfile = input.store_profile_id
    ? await loadStoreProfile({ billing: billing.ctx, storeProfileId: input.store_profile_id })
    : null

  let brief = buildPosterBrief({ profile: storeProfile, answers, message: input.message })
  let recommendation = recommendPosterTemplate({ ...answers, ...brief })

  if (shouldUseLlmFallback({ ...answers, ...brief }, input.message, recommendation)) {
    const llmAnswers = await callBriefLlm({ message: input.message, answers: { ...answers, ...brief }, profile: storeProfile })
    if (llmAnswers) {
      brief = buildPosterBrief({ profile: storeProfile, answers, message: input.message, llmAnswers })
      recommendation = recommendPosterTemplate({ ...answers, ...llmAnswers, ...brief })
    }
  }

  const missingFields = getPosterMissingFields(brief)
  const readyToConfirm = missingFields.length === 0
  const fields = buildPosterFieldsFromBrief(recommendation.templateId, { ...brief, stylePreset: recommendation.stylePreset })
  const assistantMessage = buildAssistantMessage(brief, missingFields, recommendation)

  await trackServerEvent({
    request,
    event: "poster_intake_step",
    props: {
      source: "mp",
      readyToConfirm,
      templateId: recommendation.templateId,
      assetCount: input.asset_refs.length,
      missingCount: missingFields.length,
    },
  })

  return NextResponse.json({
    ok: true,
    sessionId,
    assistantMessage,
    stage: readyToConfirm ? "confirm" : "collecting",
    missingFields,
    readyToConfirm,
    brief,
    recommendation,
    fields,
  })
}
