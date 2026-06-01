import "server-only"

import { createHash } from "node:crypto"

import { buildPrivateCopyMessages } from "./prompts"
import { runPrivateCopyGuardrails } from "./guardrails"
import {
  PRIVATE_COPY_PROMPT_VERSION,
  defaultChannelForModule,
  generatePrivateCopySchema,
  privateCopyChannelSchema,
  privateCopyLooseResultSchema,
  privateCopyResultSchema,
  privateCopyVariantSchema,
  type GeneratePrivateCopyInput,
  type PrivateCopyChannel,
  type PrivateCopyLooseOutput,
  type PrivateCopyModule,
  type PrivateCopyOutput,
} from "./schema"
import { callPrivateCopyDeepSeekJson } from "./llm.server"

const DEFAULT_SCENE: Record<PrivateCopyModule, string> = {
  moment_post: "general_moment",
  invitation: "wechat_invitation",
  follow_up: "follow_up",
  moment_reply: "comment_reply",
}

type OutputDefault = { id: string; title: string; variant: NonNullable<PrivateCopyOutput["variant"]> }
type NormalizablePrivateCopyOutput = Partial<PrivateCopyLooseOutput> & Record<string, unknown>

const OUTPUT_DEFAULTS: Record<PrivateCopyModule, OutputDefault[]> = {
  moment_post: [
    { id: "daily", title: "日常真实版", variant: "warm" },
    { id: "professional", title: "专业提醒版", variant: "professional" },
    { id: "interactive", title: "轻互动版", variant: "interactive" },
  ],
  invitation: [
    { id: "warm", title: "温柔关怀版", variant: "warm" },
    { id: "professional", title: "专业建议版", variant: "professional" },
    { id: "direct", title: "直接约时间版", variant: "direct" },
  ],
  follow_up: [
    { id: "warm", title: "状态关怀版", variant: "warm" },
    { id: "professional", title: "护理提醒版", variant: "professional" },
    { id: "rebook", title: "复约铺垫版", variant: "direct" },
  ],
  moment_reply: [
    { id: "short_praise", title: "简短赞美版", variant: "warm" },
    { id: "empathy", title: "轻共情版", variant: "interactive" },
    { id: "private_follow", title: "转私聊建议", variant: "private_follow" },
  ],
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function clippedText(value: unknown, max: number) {
  const text = cleanText(value)
  return text.length > max ? text.slice(0, max) : text
}

function stringList(value: unknown, maxItemLength: number, maxItems: number) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => clippedText(item, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function optionalTextProp(value: unknown, max: number) {
  const text = clippedText(value, max)
  return text ? text : undefined
}

export function normalizePrivateCopyInput(raw: unknown) {
  const parsed = generatePrivateCopySchema.parse(raw)
  const channel = parsed.channel || defaultChannelForModule(parsed.module)
  const storeProfileId = parsed.store_profile_id || parsed.storeProfileId || undefined
  const customerProfileId = parsed.customer_profile_id || parsed.customerProfileId || undefined
  const draftId = parsed.draft_id || parsed.draftId || undefined
  const variantOf = parsed.variant_of || parsed.variantOf || undefined
  return {
    ...parsed,
    scene: parsed.scene || DEFAULT_SCENE[parsed.module],
    channel,
    store_profile_id: storeProfileId,
    customer_profile_id: customerProfileId,
    draft_id: draftId,
    variant_of: variantOf,
  }
}

export function validatePrivateCopyInput(input: GeneratePrivateCopyInput) {
  const data = input.input
  if (input.module === "moment_post" && cleanText(data.topic).length < 4) {
    return "请补充朋友圈主题"
  }
  if (input.module === "invitation") {
    if (!cleanText(data.customerRelation)) return "请选择顾客关系"
    if (cleanText(data.invitePurpose).length < 4) return "请补充邀约目的"
    if (!cleanText(data.projectName)) return "请填写邀约项目"
  }
  if (input.module === "follow_up") {
    if (!cleanText(data.projectName)) return "请填写项目名称"
    if (!cleanText(data.finishedAt)) return "请填写完成时间"
  }
  if (input.module === "moment_reply") {
    if (cleanText(data.commentText).length < 2) return "请填写顾客评论或朋友圈内容"
    if (!cleanText(data.replyGoal)) return "请选择回复目标"
  }
  return ""
}

export function hashPrivateCopyInput(input: GeneratePrivateCopyInput) {
  const stable = JSON.stringify({
    module: input.module,
    scene: input.scene || DEFAULT_SCENE[input.module],
    channel: input.channel || defaultChannelForModule(input.module),
    store_profile_id: input.store_profile_id || "",
    customer_profile_id: input.customer_profile_id || "",
    input: input.input,
  })
  return createHash("sha256").update(stable).digest("hex")
}

function normalizeOutputs(opts: {
  input: GeneratePrivateCopyInput
  module: PrivateCopyModule
  channel: PrivateCopyChannel
  outputs: PrivateCopyLooseOutput[]
}) {
  const defaults = OUTPUT_DEFAULTS[opts.module]
  const prepared: NormalizablePrivateCopyOutput[] = opts.outputs.slice(0, 3)
  while (prepared.length < 3) {
    const fallback = defaults[prepared.length] ?? defaults[defaults.length - 1]!
    prepared.push({
      id: fallback.id,
      title: fallback.title,
      text: fallbackTextForOutput(opts.input, fallback.title),
      variant: fallback.variant,
      riskNotes: ["模型返回版本不足，已补齐朴素版本，复制前请按真实情况微调。"],
    })
  }

  const usedIds = new Set<string>()
  return prepared.map((output, index) => {
    const fallback = defaults[index] ?? defaults[defaults.length - 1]!
    const requestedId = clippedText(output.id, 40) || fallback.id
    const id = usedIds.has(requestedId) ? fallback.id || `${requestedId}_${index + 1}` : requestedId
    usedIds.add(id)
    const channel = privateCopyChannelSchema.safeParse(output.channel).success ? (output.channel as PrivateCopyChannel) : opts.channel
    const variant = privateCopyVariantSchema.safeParse(output.variant).success ? output.variant : fallback.variant
    const imageSuggestions = stringList(output.imageSuggestions, 80, 5)
    const riskNotes = stringList(output.riskNotes, 120, 5)
    const sendTiming = optionalTextProp(output.sendTiming, 80)
    const secondFollowUp = optionalTextProp(output.secondFollowUp, 300)
    const privateMessageSuggestion = optionalTextProp(output.privateMessageSuggestion, 300)
    const whyThisWorks = optionalTextProp(output.whyThisWorks, 300)

    return {
      id,
      title: clippedText(output.title, 40) || fallback.title,
      text: clippedText(output.text, 900) || fallbackTextForOutput(opts.input, fallback.title),
      channel,
      variant,
      ...(sendTiming ? { sendTiming } : {}),
      ...(secondFollowUp ? { secondFollowUp } : {}),
      ...(imageSuggestions.length ? { imageSuggestions } : {}),
      ...(privateMessageSuggestion ? { privateMessageSuggestion } : {}),
      ...(whyThisWorks ? { whyThisWorks } : {}),
      riskNotes,
    }
  })
}

function fallbackTextForOutput(input: GeneratePrivateCopyInput, title: string) {
  const data = input.input
  if (input.module === "invitation") {
    const project = cleanText(data.projectName) || "护理"
    const purpose = cleanText(data.invitePurpose) || "看看近期状态"
    const times = Array.isArray(data.availableTimes) && data.availableTimes.length ? `你填的时间我看到了：${data.availableTimes.join("、")}。` : ""
    return `想和你约一下${project}，主要是${purpose}。${times}你方便的时候回我，我按你的实际情况来安排。`
  }

  if (input.module === "follow_up") {
    const project = cleanText(data.projectName) || "护理"
    const careTips = Array.isArray(data.careTips) && data.careTips.length ? `这几天可以注意：${data.careTips.join("、")}。` : ""
    return `你上次做完${project}后，可以先留意这两天的状态。${careTips}如果哪里不确定，直接发我，我按你的真实情况帮你看。`
  }

  if (input.module === "moment_reply") {
    const privateFollow = data.privateFollow ? "细节我就不在评论区展开了，晚点私信你。" : "谢谢你愿意反馈呀，后面有变化也可以继续和我说。"
    return title.includes("私聊") || title.includes("转私聊") ? privateFollow : "谢谢你愿意反馈呀，看到你这么说我也很开心。"
  }

  const topic = cleanText(data.topic) || cleanText(data.projectName) || "今天的护理提醒"
  return `今天想分享一个小提醒：${topic}。每个人状态不一样，护理前把真实情况说清楚，再按当下状态来调整会更合适。`
}

function coerceLlmResult(data: unknown) {
  if (Array.isArray(data)) return { outputs: data }
  if (!data || typeof data !== "object") return data

  const record = data as Record<string, unknown>
  if (Array.isArray(record.outputs)) return record

  for (const key of ["result", "data"]) {
    const nested = record[key]
    if (nested && typeof nested === "object" && Array.isArray((nested as Record<string, unknown>).outputs)) {
      return { ...record, ...(nested as Record<string, unknown>) }
    }
  }

  for (const key of ["variants", "copies", "items", "drafts"]) {
    if (Array.isArray(record[key])) return { ...record, outputs: record[key] }
  }

  return data
}

export async function generatePrivateCopyContent(opts: {
  input: GeneratePrivateCopyInput
  storeProfile?: Record<string, unknown> | null
  customerProfile?: Record<string, unknown> | null
}) {
  const channel = opts.input.channel || defaultChannelForModule(opts.input.module)
  const messages = buildPrivateCopyMessages({
    input: opts.input,
    channel,
    storeProfile: opts.storeProfile,
    customerProfile: opts.customerProfile,
  })
  const llm = await callPrivateCopyDeepSeekJson(messages)
  const parsed = privateCopyLooseResultSchema.parse(coerceLlmResult(llm.data))
  const outputs = normalizeOutputs({
    input: opts.input,
    module: opts.input.module,
    channel,
    outputs: parsed.outputs,
  })
  const normalized = privateCopyResultSchema.parse({
    outputs,
    usageTips: stringList(parsed.usageTips, 120, 5),
  })
  const guardrails = runPrivateCopyGuardrails({ module: opts.input.module, outputs: normalized.outputs })

  return {
    result: {
      module: opts.input.module,
      scene: opts.input.scene || DEFAULT_SCENE[opts.input.module],
      channel,
      outputs: guardrails.outputs,
      usageTips: normalized.usageTips,
      risk: guardrails.risk,
    },
    model: {
      provider: "deepseek" as const,
      name: llm.modelName,
      fallback_used: llm.fallbackUsed,
      latency_ms: llm.latencyMs,
    },
    usageTokens: llm.usageTokens,
    promptVersion: PRIVATE_COPY_PROMPT_VERSION,
  }
}
