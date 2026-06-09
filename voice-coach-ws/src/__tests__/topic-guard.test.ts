import { describe, expect, it } from "vitest"

import {
  buildDialoguePolicy,
  buildTopicLock,
  normalizeCustomerReplyByPolicy,
  validateCustomerReplyTopic,
} from "../shared/topic-guard.js"

describe("topic guard", () => {
  it("extracts the selected service from session context", () => {
    const lock = buildTopicLock("场景卡：示例项目·胶原抗衰启动，新品推广训练，项目 胶原抗衰护理")

    expect(lock?.serviceName).toBe("胶原抗衰护理")
    expect(lock?.promptText).toContain("当前唯一训练项目：胶原抗衰护理")
  })

  it("derives a topic lock from training-context-only prompt text", () => {
    const lock = buildTopicLock(
      [
        "训练任务：抗衰紧致护理；把补水、胶原、紧致讲成一条线；通用知识库",
        "顾客开场原话：我这个年龄需要抗衰吗？和普通补水有什么区别？做几次有效？",
      ].join("\n"),
    )

    expect(lock?.serviceName).toBe("胶原抗衰护理")
    expect(lock?.fallbackCustomerText).toContain("胶原抗衰护理")
  })

  it("rejects unrelated chest-care drift for a collagen anti-aging session", () => {
    const lock = buildTopicLock("场景卡：示例项目·胶原抗衰启动，新品推广训练，项目 胶原抗衰护理")

    const result = validateCustomerReplyTopic("那这种过敏会不会影响胸部护理的效果？", lock)

    expect(result.ok).toBe(false)
    expect(result.offendingTerms).toContain("胸")
  })

  it("allows the term when chest care is the selected service", () => {
    const lock = buildTopicLock("场景卡：胸部护理启动，到店顾客训练，项目 胸部护理")

    const result = validateCustomerReplyTopic("那胸部护理前需要先评估哪些风险？", lock)

    expect(result.ok).toBe(true)
  })

  it("rejects using the customer display name as an addressee", () => {
    const lock = buildTopicLock("顾客显示名：徐老师（仅用于后台识别和报告展示，不进入顾客对美容师的称呼）\n当前训练项目：胶原抗衰护理")

    const result = validateCustomerReplyTopic("徐老师您好，我想先了解一下安全性。", lock)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe("customer_name_as_addressee")
  })

  it("builds a next-turn policy from the active service and concern axis", () => {
    const policy = buildDialoguePolicy({
      sessionContextText: "顾客显示名：徐老师（仅用于后台识别和报告展示，不进入顾客对美容师的称呼）\n当前训练项目：胶原抗衰护理\n核心顾虑：安全性",
      history: [{ role: "customer", text: "我想看检测报告和成分依据。", emotion: "worried" }],
      beauticianText: "检测报告都是齐全的。",
    })

    expect(policy?.serviceName).toBe("胶原抗衰护理")
    expect(policy?.axisLabel).toBe("证据验证")
    expect(policy?.nextMove).toContain("检测报告")
  })

  it("normalizes accidental customer-name addressing back to the policy fallback", () => {
    const policy = buildDialoguePolicy({
      sessionContextText: "顾客显示名：徐老师（仅用于后台识别和报告展示，不进入顾客对美容师的称呼）\n当前训练项目：胶原抗衰护理",
      history: [],
      beauticianText: "",
    })

    const normalized = normalizeCustomerReplyByPolicy("徐老师您好，我担心安全性。", policy)

    expect(normalized).toBe("我担心安全性。")
    expect(normalizeCustomerReplyByPolicy("徐老师，我想问有没有检测报告？", policy)).toBe("我想问有没有检测报告？")
    expect(normalizeCustomerReplyByPolicy("徐老师老师，我想确认适不适合敏感肌。", policy)).toBe("我想确认适不适合敏感肌。")
  })

  it("rotates away from safety after repeated safety turns", () => {
    const policy = buildDialoguePolicy({
      sessionContextText: "当前训练项目：胶原抗衰护理\n核心顾虑：安全性",
      history: [
        { role: "customer", text: "我还是担心安全。", emotion: "worried" },
        { role: "beautician", text: "我们会先评估。" },
        { role: "customer", text: "那有没有风险？", emotion: "worried" },
      ],
      beauticianText: "很安全，放心。",
    })

    expect(policy?.axis).not.toBe("safety")
    expect(policy?.nextMove).not.toContain("安全性要求具体评估标准")
  })

  it("moves to a concrete next-step decision after repeated vague safety-loop replies", () => {
    const policy = buildDialoguePolicy({
      sessionContextText: "当前训练项目：胶原抗衰护理\n核心顾虑：敏感肌、安全性、适用边界",
      history: [
        { role: "customer", text: "我有点敏感，做完会不会更红？", emotion: "worried" },
        { role: "beautician", text: "放心，我们很专业。" },
        { role: "customer", text: "那哪些情况不适合做，要先避开？", emotion: "worried" },
        { role: "beautician", text: "一般都没问题的。" },
        { role: "customer", text: "有没有检测报告或者数据能证明？", emotion: "skeptical" },
      ],
      beauticianText: "做，适合做，非常适合做，成分都标清楚的。",
    })

    expect(policy?.axis).toBe("advance")
    expect(policy?.axisLabel).toBe("推进决策")
    expect(policy?.nextMove).toContain("下一步怎么安排")
    expect(policy?.fallbackCustomerText).toContain("先做皮肤检测")
  })
})
