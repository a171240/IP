import type { GeneratePrivateCopyInput, PrivateCopyChannel, PrivateCopyModule } from "./schema"

const MODULE_LABELS: Record<PrivateCopyModule, string> = {
  moment_post: "发朋友圈",
  invitation: "个性邀约",
  follow_up: "回访微信",
  moment_reply: "朋友圈回复",
}

const CHANNEL_LABELS: Record<PrivateCopyChannel, string> = {
  wechat: "微信私聊",
  moments: "微信朋友圈",
  comment: "朋友圈评论区",
}

const VARIANT_RULES: Record<PrivateCopyModule, string[]> = {
  moment_post: ["日常真实版", "专业提醒版", "轻互动版"],
  invitation: ["温柔关怀版", "专业建议版", "直接约时间版"],
  follow_up: ["状态关怀版", "护理提醒版", "复约铺垫版"],
  moment_reply: ["简短赞美版", "轻共情版", "转私聊建议"],
}

export function buildPrivateCopyMessages(opts: {
  input: GeneratePrivateCopyInput
  channel: PrivateCopyChannel
  storeProfile?: Record<string, unknown> | null
  customerProfile?: Record<string, unknown> | null
}) {
  const { input, channel, storeProfile, customerProfile } = opts
  const moduleLabel = MODULE_LABELS[input.module]
  const channelLabel = CHANNEL_LABELS[channel]
  const variantRules = VARIANT_RULES[input.module]

  const system = [
    "你是美业门店的私域文案助手。你的任务不是写广告，而是写门店员工可以复制到微信里的朋友圈、私聊邀约、项目后回访和朋友圈评论回复。",
    "",
    "必须遵守：",
    "- 只使用用户输入里明确提供的信息。",
    "- 不得虚构顾客反馈、案例、门店现场、活动、优惠、空档、花茶或检测。",
    "- 不要写“没有压力”“不推销”这类解释性句子。",
    "- 默认用“补水护理”，不要默认使用“水光”“深层缺水”等偏医美词。",
    "- 不承诺效果，不制造焦虑，不写医疗判断。",
    "- 文案短、口语、具体，像微信里真实发出去的话。",
    "- 顾客档案只能帮助判断语气、顾虑和信任点；没有明确写出的项目、时间、反馈和效果，不得自行补充。",
    "- 朋友圈回复是公开场景，不能暴露顾客项目、皮肤问题、身份信息，也不能公开推销。",
    "- 朋友圈正文默认面向一类顾客，不能写单个顾客姓名或可识别经历。",
    "- 所有内容都是微信场景，不要写短信、退订、群发、模板审核。",
    "",
    "返回严格 JSON，不要返回 Markdown。",
  ].join("\n")

  const user = [
    `模块：${moduleLabel}`,
    `渠道：${channelLabel}`,
    `场景：${input.scene || "未指定"}`,
    `需要的 3 个版本：${variantRules.join("、")}`,
    "",
    "门店档案（仅作为补充，不得虚构未给信息）：",
    JSON.stringify(storeProfile || {}, null, 2),
    "",
    "顾客档案（只用于邀约、回访和私聊承接；公开场景不得暴露身份和隐私）：",
    JSON.stringify(customerProfile || {}, null, 2),
    "",
    "用户输入：",
    JSON.stringify(input.input, null, 2),
    "",
    "输出 JSON 格式：",
    JSON.stringify(
      {
        outputs: [
          {
            id: "warm",
            title: variantRules[0],
            text: "可复制的微信文案",
            variant: "warm",
            sendTiming: "可选",
            secondFollowUp: "可选",
            imageSuggestions: ["可选"],
            privateMessageSuggestion: "可选",
            whyThisWorks: "简短说明",
            riskNotes: [],
          },
          {
            id: "professional",
            title: variantRules[1],
            text: "可复制的微信文案",
            variant: "professional",
            riskNotes: [],
          },
          {
            id: input.module === "moment_reply" ? "private_follow" : "direct",
            title: variantRules[2],
            text: "可复制的微信文案",
            variant: input.module === "moment_reply" ? "private_follow" : "direct",
            riskNotes: [],
          },
        ],
        usageTips: ["复制前按顾客真实情况删掉不适合的句子"],
      },
      null,
      2
    ),
    "",
    "额外限制：",
    "- outputs 必须正好 3 条。",
    "- text 不能带标题前缀、序号或 Markdown。",
    "- 私聊文案 45-90 字；朋友圈正文 80-130 字；朋友圈回复 1-2 句话。",
    "- 邀约只能使用用户输入的 availableTimes，用户没填时间就不要编具体时间。",
    "- 朋友圈回复不能写预约、价格、疗程、到店邀请；需要承接时写 privateMessageSuggestion。",
  ].join("\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}
