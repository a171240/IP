import "server-only"

import { jsonrepair } from "jsonrepair"

import {
  privateCopyLlmOutputSchema,
  type PrivateCopyCustomerProfile,
  type PrivateCopyGenerateRequest,
  type PrivateCopyResult,
} from "@/lib/private-copy/types"
import { assessPrivateCopyRisk, sanitizePrivateCopyText } from "@/lib/private-copy/guardrails"

function compactText(value: unknown, max = 180) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 5)
      .join("、")
      .slice(0, max)
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 5)
      .join("、")
      .slice(0, max)
  }
  return String(value || "").trim().slice(0, max)
}

function safeJsonParse(text: string): unknown {
  const trimmed = String(text || "").trim()
  if (!trimmed) return null

  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
    trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      try {
        return JSON.parse(jsonrepair(candidate))
      } catch {
        // try next candidate
      }
    }
  }

  return null
}

function customerProfileText(profile: PrivateCopyCustomerProfile | null) {
  if (!profile) return "未选择顾客档案。不要编造顾客姓名、消费历史、皮肤状态或反馈。"
  return [
    profile.name ? `姓名/称呼：${profile.name}` : "",
    profile.age_label ? `年龄阶段：${profile.age_label}` : "",
    profile.occupation ? `职业：${profile.occupation}` : "",
    profile.communication_style ? `沟通风格：${profile.communication_style}` : "",
    compactText(profile.personality_tags) ? `性格标签：${compactText(profile.personality_tags)}` : "",
    compactText(profile.core_concerns) ? `核心顾虑：${compactText(profile.core_concerns)}` : "",
    compactText(profile.trust_triggers) ? `信任触发：${compactText(profile.trust_triggers)}` : "",
    profile.past_experience ? `过往体验：${profile.past_experience}` : "",
    profile.notes ? `备注：${profile.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function moduleInstruction(module: PrivateCopyGenerateRequest["module"]) {
  if (module === "moment_post") {
    return "生成朋友圈文案。适合日常提醒、护理科普、项目认知，不编活动、不编案例、不写疗效承诺。"
  }
  if (module === "invitation") {
    return "生成微信邀约话术。语气轻，不催促，不强压，给顾客保留选择余地。"
  }
  if (module === "follow_up") {
    return "生成护理后回访话术。先关心状态，再给注意事项，最后保留反馈入口。"
  }
  return "生成朋友圈公开评论回复。不要报价，不暴露顾客隐私，不公开邀约；如需承接，给私聊建议。"
}

function buildPrompt(request: PrivateCopyGenerateRequest, customerProfile: PrivateCopyCustomerProfile | null, regenerate: boolean) {
  return [
    "你是美业门店的私域文案助手，帮美容师写能直接复制发送的微信/朋友圈话术。",
    "",
    "硬性规则：",
    "- 只基于用户输入和顾客档案写，不编活动、不编案例、不编价格、不编效果。",
    "- 禁止医疗化承诺，禁止根治/包好/永久/百分百/立刻见效。",
    "- 公开评论回复不能写价格、联系方式、隐私、强邀约。",
    "- 输出必须自然、短、像真人微信，不要营销腔。",
    "- 返回严格 JSON，不要 markdown。",
    "",
    `模块：${request.module}`,
    `任务：${moduleInstruction(request.module)}`,
    `渠道：${request.channel || "未指定"}`,
    `场景：${request.scene || "未指定"}`,
    `是否换一版：${regenerate ? "是" : "否"}`,
    "",
    "用户输入：",
    JSON.stringify(request.input, null, 2),
    "",
    "顾客档案：",
    customerProfileText(customerProfile),
    "",
    "请返回 JSON：",
    JSON.stringify({
      outputs: [
        {
          title: "自然版",
          text: "完整话术正文",
          sendTiming: "什么时候发，可为空",
          privateMessageSuggestion: "如需要私聊承接，写一句建议；否则为空",
          riskNotes: ["需要人工确认的风险点，可为空数组"],
        },
      ],
      usageTips: ["复制前如何微调"],
      risk: { level: "low", flags: [] },
    }),
    "",
    "outputs 必须给 3 个版本：自然版、专业版、简短版。",
  ].join("\n")
}

async function callDeepSeekJson(prompt: string) {
  const apiKey = (process.env.DEEPSEEK_PRIVATE_COPY_API_KEY || process.env.DEEPSEEK_API_KEY || "").trim()
  const baseUrl = (
    process.env.DEEPSEEK_PRIVATE_COPY_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com"
  ).trim()
  const model = (
    process.env.DEEPSEEK_PRIVATE_COPY_MODEL ||
    process.env.DEEPSEEK_PRO_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek-chat"
  ).trim()

  if (!apiKey || apiKey === "your-api-key-here") throw new Error("DEEPSEEK_API_KEY missing")

  async function request(payload: Record<string, unknown>) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
    return { ok: res.ok, status: res.status, text: await res.text().catch(() => "") }
  }

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: "你只输出合法 JSON。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.65,
    max_tokens: 1800,
    stream: false,
    response_format: { type: "json_object" },
  }

  let res = await request(payload)
  if (!res.ok && res.status === 400 && /response_format|json_object/i.test(res.text)) {
    const fallback = { ...payload }
    delete fallback.response_format
    res = await request(fallback)
  }
  if (!res.ok) throw new Error(`DeepSeek private copy error: ${res.status} ${res.text.slice(0, 180)}`)

  const root = safeJsonParse(res.text) as Record<string, unknown> | null
  const choices = Array.isArray(root?.choices) ? root.choices : []
  const first = choices[0] as Record<string, unknown> | undefined
  const message = first?.message as Record<string, unknown> | undefined
  const content = typeof message?.content === "string" ? message.content : ""
  const parsed = safeJsonParse(content)
  if (!parsed) throw new Error("private_copy_json_missing")

  return { parsed, model }
}

export async function generatePrivateCopy(opts: {
  request: PrivateCopyGenerateRequest
  customerProfile: PrivateCopyCustomerProfile | null
  regenerate: boolean
}): Promise<PrivateCopyResult> {
  const prompt = buildPrompt(opts.request, opts.customerProfile, opts.regenerate)
  const { parsed, model } = await callDeepSeekJson(prompt)
  const output = privateCopyLlmOutputSchema.parse(parsed)

  const outputs = output.outputs.map((item, index) => ({
    id: `v${index + 1}`,
    title: item.title,
    text: sanitizePrivateCopyText(item.text),
    sendTiming: item.sendTiming || undefined,
    privateMessageSuggestion: item.privateMessageSuggestion
      ? sanitizePrivateCopyText(item.privateMessageSuggestion)
      : undefined,
    riskNotes: item.riskNotes || [],
  }))
  const guardrailRisk = assessPrivateCopyRisk(outputs)
  const risk =
    guardrailRisk.level === "low" && output.risk.level !== "low"
      ? output.risk
      : guardrailRisk

  return {
    outputs,
    usageTips: output.usageTips,
    risk,
    model,
  }
}
