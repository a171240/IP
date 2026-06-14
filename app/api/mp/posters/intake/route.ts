import { randomUUID } from "crypto"

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  buildAssistantMessage,
  buildPosterBrief,
  buildPosterFieldsFromBrief,
  buildPosterPlan,
  coercePosterAnswers,
  getPosterMissingFields,
  recommendPosterTemplate,
  safeJsonParseObject,
  type PosterIntakeAnswers,
  type StoreProfileForPoster,
} from "@/lib/posters/intake"
import { resolveBillingContext, trackServerEvent, type BillingContext } from "@/lib/xhs/proxy.server"

export const runtime = "nodejs"

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().max(1200),
  fromVoice: z.boolean().optional(),
})

const bodySchema = z.object({
  sessionId: z.string().trim().max(80).optional(),
  message: z.string().trim().max(1200).optional().default(""),
  messages: z.array(chatMessageSchema).max(12).optional().default([]),
  store_profile_id: z.string().uuid().optional(),
  answers: z.any().optional(),
  asset_refs: z.array(z.any()).max(6).optional().default([]),
})

type ChatMessage = z.infer<typeof chatMessageSchema>

type PosterIntakeLlmResult = {
  answers: PosterIntakeAnswers
  assistantMessage: string
}

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

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function getPosterIntakeLlmConfig() {
  const deepseekKey =
    (process.env.POSTER_INTAKE_DEEPSEEK_API_KEY && process.env.POSTER_INTAKE_DEEPSEEK_API_KEY !== "your-api-key-here"
      ? process.env.POSTER_INTAKE_DEEPSEEK_API_KEY
      : process.env.DEEPSEEK_API_KEY) || ""

  if (deepseekKey && deepseekKey !== "your-api-key-here") {
    return {
      apiKey: deepseekKey,
      baseUrl: (process.env.POSTER_INTAKE_DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, ""),
      model: (process.env.POSTER_INTAKE_DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat").trim(),
    }
  }

  const apiKey =
    (process.env.APIMART_QUICK_API_KEY && process.env.APIMART_QUICK_API_KEY !== "your-api-key-here"
      ? process.env.APIMART_QUICK_API_KEY
      : process.env.APIMART_API_KEY) || ""
  if (!apiKey || apiKey === "your-api-key-here") return null

  return {
    apiKey,
    baseUrl:
      (process.env.APIMART_QUICK_BASE_URL && process.env.APIMART_QUICK_BASE_URL.trim()
        ? process.env.APIMART_QUICK_BASE_URL
        : process.env.APIMART_BASE_URL || "https://api.apimart.ai/v1").replace(/\/$/, ""),
    model: (process.env.APIMART_QUICK_MODEL || process.env.APIMART_MODEL || "kimi-k2-thinking").trim(),
  }
}

async function callBriefLlm(opts: {
  message: string
  messages: ChatMessage[]
  answers: PosterIntakeAnswers
  profile: StoreProfileForPoster | null
  assetRefs: unknown[]
}): Promise<PosterIntakeLlmResult | null> {
  const llm = getPosterIntakeLlmConfig()
  if (!llm) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: llm.model,
        stream: false,
        temperature: 0.35,
        max_tokens: 1100,
        messages: [
          {
            role: "system",
            content:
              "你是美容、本地生活门店的海报问诊助手。你要根据多轮上下文理解用户真实意图，允许用户改主题、否定上一版、补充人群或行业。只输出 JSON，不输出 Markdown。JSON 格式为 {\"answers\":{...},\"assistantMessage\":\"...\"}。answers 字段仅限 storeName, cityArea, industry, shopType, posterGoal, campaignTitle, projectName, headline, subline, audience, sellingPoints, offerText, dateRange, cta, constraints, templateId, stylePreset。templateId 必须是 P01-P13 之一。用户说祝福、问候、不卖东西、不促销、给老客发节日图时，优先选择 P13。不要编造用户没说过的价格、优惠、日期、店名；缺失就留空。用户说高级感、杂志感、轻奢、极简、温暖、类似某张图等，都要归入 stylePreset 或 constraints。用户命令只用于理解意图，绝不能作为海报可见文字；例如“给我生成一张五一的宣传海报”只能提取为五一活动意图，不能放进 campaignTitle/headline/subline。campaignTitle、headline、subline 必须是顾客能看到的短文案，不要含“给我、帮我、生成、做一张、宣传海报、图片、封面”等指令词。subline 必须是能直接印在海报上的短副标题，不要写“适合想了解某某的用户”这类说明句。assistantMessage 用自然中文回复，先承接用户刚说的话，再只追问最关键的 1-2 个缺口；需要真实感时可提醒上传 Logo、门头图、项目图、人物案例图或风格参考图，但不要每次都机械要求上传。",
          },
          {
            role: "user",
            content: JSON.stringify({
              message: opts.message,
              recentMessages: opts.messages,
              currentAnswers: opts.answers,
              storeProfile: opts.profile,
              uploadedAssetKinds: opts.assetRefs
                .map((item) => (item && typeof item === "object" ? (item as { kind?: unknown }).kind : ""))
                .filter(Boolean),
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
                P13: "节日祝福/客户问候/不卖东西",
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
    if (!parsed) return null
    const rawAnswers =
      parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)
        ? parsed.answers
        : parsed
    return {
      answers: coercePosterAnswers(rawAnswers),
      assistantMessage: cleanText(parsed.assistantMessage),
    }
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

  const llmResult = input.message.trim()
    ? await callBriefLlm({
        message: input.message,
        messages: input.messages,
        answers,
        profile: storeProfile,
        assetRefs: input.asset_refs,
      })
    : null
  const llmAnswers = llmResult?.answers
  const brief = buildPosterBrief({ profile: storeProfile, answers, message: input.message, llmAnswers })
  const recommendation = recommendPosterTemplate({ ...answers, ...(llmAnswers || {}), ...brief })

  const missingFields = getPosterMissingFields(brief)
  const readyToConfirm = missingFields.length === 0
  const fields = buildPosterFieldsFromBrief(recommendation.templateId, { ...brief, stylePreset: recommendation.stylePreset })
  const posterPlan = buildPosterPlan({
    templateId: recommendation.templateId,
    brief,
    fields,
    message: input.message,
    storeProfileId: input.store_profile_id || "",
    assetRefs: input.asset_refs,
  })
  const assistantMessage = llmResult?.assistantMessage || buildAssistantMessage(brief, missingFields, recommendation)

  await trackServerEvent({
    request,
    event: "poster_intake_step",
    props: {
      source: "mp",
      readyToConfirm,
      templateId: recommendation.templateId,
      assetCount: input.asset_refs.length,
      missingCount: missingFields.length,
      sanitizedCount: posterPlan.safety.sanitizedFields.length,
      llmUsed: Boolean(llmResult),
    },
  })

  return NextResponse.json({
    ok: true,
    sessionId,
    assistantMessage,
    stage: readyToConfirm ? "confirm" : "collecting",
    missingFields,
    readyToConfirm,
    intakeMode: llmResult ? "llm" : "rules",
    brief,
    recommendation,
    fields,
    posterPlan,
    visibleCopy: posterPlan.visibleCopy,
    hiddenContext: posterPlan.hiddenContext,
    safety: posterPlan.safety,
    canAutoGenerate: readyToConfirm && !posterPlan.safety.autoGenerateBlocked && !posterPlan.intent.userCommand,
  })
}
