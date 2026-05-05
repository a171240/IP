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
  const root =
    payload && typeof payload === "object" && "data" in payload && (payload as { data?: unknown }).data
      ? (payload as { data?: unknown }).data
      : payload
  if (!root || typeof root !== "object") return ""
  const choices = (root as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices.length) return ""
  const first = choices[0] as { message?: { content?: unknown } }
  return typeof first?.message?.content === "string" ? first.message.content : ""
}

function asAssistantMessage(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 220) : ""
}

type PosterIntakeLlmProvider = {
  name: "deepseek" | "apimart"
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

const POSTER_INTAKE_SYSTEM_PROMPT =
  "你是本地生活海报问诊助手。只输出一个 JSON 对象，不输出解释，不输出 Markdown，不输出数组，不生成多个方案。字段仅限 storeName, cityArea, industry, shopType, posterGoal, campaignTitle, projectName, headline, subline, audience, sellingPoints, offerText, dateRange, cta, constraints, templateId, stylePreset, assistantMessage。templateId 必须是 P01-P12 之一。事实字段如价格、日期、店名必须按用户原文保留；用户没说的事实填空字符串，严禁编造。assistantMessage 用自然口语，最多 60 个中文字符；缺信息时只追问最关键 1-3 项；信息足够时让用户核对标题、权益、时间或素材，不要每次重复同一句。"

function cleanEnv(value: string | undefined) {
  const text = String(value || "").trim()
  return text && text !== "your-api-key-here" ? text : ""
}

function getPosterIntakeLlmProviders(): PosterIntakeLlmProvider[] {
  const providers: PosterIntakeLlmProvider[] = []

  const deepseekApiKey = cleanEnv(process.env.POSTER_INTAKE_DEEPSEEK_API_KEY) || cleanEnv(process.env.DEEPSEEK_API_KEY)
  if (deepseekApiKey) {
    const deepseekBaseUrl = cleanEnv(process.env.POSTER_INTAKE_DEEPSEEK_BASE_URL) || cleanEnv(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com/v1"
    providers.push({
      name: "deepseek",
      apiKey: deepseekApiKey,
      baseUrl: deepseekBaseUrl,
      model: cleanEnv(process.env.POSTER_INTAKE_DEEPSEEK_MODEL) || cleanEnv(process.env.DEEPSEEK_MODEL) || "deepseek-chat",
      timeoutMs: Number(process.env.POSTER_INTAKE_DEEPSEEK_TIMEOUT_MS || process.env.DEEPSEEK_TIMEOUT_MS || 15000),
    })
  }

  return providers
}

function buildLlmMessages(opts: {
  message: string
  answers: PosterIntakeAnswers
  profile: StoreProfileForPoster | null
}) {
  return [
    {
      role: "system",
      content: POSTER_INTAKE_SYSTEM_PROMPT,
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
  ]
}

function joinedSourceText(opts: {
  message: string
  answers: PosterIntakeAnswers
  profile: StoreProfileForPoster | null
}) {
  return [
    opts.message,
    ...Object.values(opts.answers),
    opts.profile?.name,
    opts.profile?.city,
    opts.profile?.district,
    opts.profile?.landmark,
    opts.profile?.shop_type,
    opts.profile?.main_offer_name,
  ]
    .filter(Boolean)
    .join(" ")
}

function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, "").replace(/[到至~—-]/g, "")
}

function isGroundedPosterLlmResult(
  result: { answers: PosterIntakeAnswers; assistantMessage: string },
  opts: {
    message: string
    answers: PosterIntakeAnswers
    profile: StoreProfileForPoster | null
  },
) {
  const source = joinedSourceText(opts)
  const { answers } = result

  if (answers.storeName && !source.includes(answers.storeName)) return false
  if (answers.dateRange && !normalizeComparableText(source).includes(normalizeComparableText(answers.dateRange))) return false
  if (
    answers.offerText &&
    !source.includes(answers.offerText) &&
    !/祝福|不做促销|不卖东西|权益/.test(answers.offerText)
  ) {
    return false
  }

  return true
}

function alignLlmAnswersWithMessage(message: string, answers: PosterIntakeAnswers): PosterIntakeAnswers {
  const text = message.trim()
  if (!text) return answers
  const next = { ...answers }

  if (/朋友圈|转发|私域|社群|分享/.test(text) || (/祝福|节日快乐|不卖东西|不做促销/.test(text) && /老客|老顾客|会员/.test(text))) {
    next.templateId = "P12"
    next.stylePreset ||= "朋友圈轻分享"
  }

  return next
}

function messageMentionsMissingField(message: string, missingField: string) {
  const checks = [
    {
      field: /\u4eba\u7fa4|\u5bf9\u8c61/,
      message: /\u4eba\u7fa4|\u5bf9\u8c61|\u7ed9\u8c01|\u53d1\u7ed9|\u8c01\u770b|\u987e\u5ba2|\u5ba2\u6237|\u4f1a\u5458|\u7c89\u4e1d|\u53d7\u4f17/,
    },
    {
      field: /\u76ee\u6807|\u7528\u9014/,
      message: /\u76ee\u6807|\u7528\u9014|\u60f3\u8ba9|\u5e0c\u671b|\u4f5c\u7528|\u53d1\u6765\u505a/,
    },
    {
      field: /\u6807\u9898|\u4e3b\u9898/,
      message: /\u6807\u9898|\u4e3b\u9898|\u6807\u8bed|\u6587\u6848/,
    },
    {
      field: /\u6743\u76ca|\u4f18\u60e0|\u4ef7\u683c/,
      message: /\u6743\u76ca|\u4f18\u60e0|\u4ef7\u683c|\u6298\u6263|\u6d3b\u52a8|\u5957\u9910|\u5356\u70b9/,
    },
    {
      field: /\u65f6\u95f4|\u65e5\u671f/,
      message: /\u65f6\u95f4|\u65e5\u671f|\u54ea\u5929|\u4ec0\u4e48\u65f6\u5019|\u51e0\u53f7|\u671f\u95f4/,
    },
    {
      field: /\u5e97\u540d|\u95e8\u5e97/,
      message: /\u5e97\u540d|\u95e8\u5e97|\u54ea\u5bb6\u5e97|\u54c1\u724c/,
    },
    {
      field: /\u7d20\u6750|\u4e0a\u4f20/,
      message: /\u7d20\u6750|\u56fe\u7247|\u7167\u7247|\u4e0a\u4f20|\u6587\u6863/,
    },
  ]
  const hit = checks.find((check) => check.field.test(missingField))
  return hit ? hit.message.test(message) : message.includes(missingField)
}

function selectAssistantMessage(opts: {
  llmAssistantMessage: string
  brief: ReturnType<typeof buildPosterBrief>
  missingFields: string[]
  recommendation: ReturnType<typeof recommendPosterTemplate>
}) {
  const fallback = buildAssistantMessage(opts.brief, opts.missingFields, opts.recommendation)
  const message = opts.llmAssistantMessage.trim()
  if (!message) return fallback

  if (opts.missingFields.length) {
    const asksForSpecificMissing = opts.missingFields.some((field) => messageMentionsMissingField(message, field))
    const asksForConfirmation = /\u786e\u8ba4|\u6838\u5bf9|\u51c6\u786e|\u6ca1\u95ee\u9898|\u53ef\u4ee5\u751f\u6210|\u8fd9\u4e2a\u65b9\u5411|\u8fd9\u6837\u884c/.test(message)
    if (!asksForSpecificMissing || asksForConfirmation) return fallback

    const asksForMissing = /还差|缺|补|告诉|谁|人群|对象|适合|发给|给谁|素材|上传|需要|什么|哪|几|多少|[?？]/.test(message)
    const soundsReady = /信息已够|信息够|够了|确认后|核对|可以生成|这样行吗/.test(message)
    if (!asksForMissing || soundsReady) return fallback
  }

  return message
}

async function callProviderBriefLlm(
  provider: PosterIntakeLlmProvider,
  opts: {
    message: string
    answers: PosterIntakeAnswers
    profile: StoreProfileForPoster | null
  },
): Promise<{ answers: PosterIntakeAnswers; assistantMessage: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(3000, provider.timeoutMs || 10000))

  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        stream: false,
        temperature: 0.2,
        max_tokens: 900,
        messages: buildLlmMessages(opts),
      }),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } | string; message?: string } | null)?.error
      const detail = typeof msg === "string" ? msg : msg?.message || json?.message || `llm_http_${res.status}`
      throw new Error(String(detail))
    }

    const content = extractMessageContent(json)
    const parsed = safeJsonParseObject(content)
    if (!parsed) return null
    return {
      answers: coercePosterAnswers(parsed),
      assistantMessage: asAssistantMessage(parsed.assistantMessage),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function callBriefLlm(opts: {
  message: string
  answers: PosterIntakeAnswers
  profile: StoreProfileForPoster | null
}): Promise<{ answers: PosterIntakeAnswers; assistantMessage: string } | null> {
  for (const provider of getPosterIntakeLlmProviders()) {
    try {
      const result = await callProviderBriefLlm(provider, opts)
      if (
        result &&
        (result.assistantMessage || Object.keys(result.answers).length) &&
        isGroundedPosterLlmResult(result, opts)
      ) {
        return result
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn("poster_intake_llm_failed", {
        provider: provider.name,
        message: message.slice(0, 180),
      })
    }
  }

  return null
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
  let llmAssistantMessage = ""

  if (input.message.trim()) {
    const llmResult = await callBriefLlm({
      message: input.message,
      answers,
      profile: storeProfile,
    })
    if (llmResult) {
      const llmAnswers = alignLlmAnswersWithMessage(input.message, llmResult.answers)
      brief = buildPosterBrief({ profile: storeProfile, answers, message: input.message, llmAnswers })
      recommendation = recommendPosterTemplate({ ...answers, ...llmAnswers, ...brief })
      llmAssistantMessage = llmResult.assistantMessage
    }
  }

  const missingFields = getPosterMissingFields(brief)
  const readyToConfirm = missingFields.length === 0
  const fields = buildPosterFieldsFromBrief(recommendation.templateId, { ...brief, stylePreset: recommendation.stylePreset })
  const assistantMessage = selectAssistantMessage({ llmAssistantMessage, brief, missingFields, recommendation })

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
