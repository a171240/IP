"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Header, GlassCard, GlowButton } from "@/components/ui/obsidian"
import { QUESTIONS, INDUSTRY_LABELS } from "@/lib/diagnosis/questions"

type OnboardingPayload = {
  platform?: string
  platform_label?: string
  industry?: string
  industry_label?: string
  offer_desc?: string
  target_audience?: string
  tone?: string
  tone_label?: string
  price_range?: string
  price_range_label?: string
  current_problem?: string[]
  day?: number
  topic?: string
}

const PLATFORM_OPTIONS = QUESTIONS.find((q) => q.id === "platform")?.options ?? []
const INDUSTRY_OPTIONS = QUESTIONS.find((q) => q.id === "industry")?.options ?? []
const TONE_OPTIONS = QUESTIONS.find((q) => q.id === "tone")?.options ?? []
const PRICE_OPTIONS = QUESTIONS.find((q) => q.id === "price_range")?.options ?? []

const PROBLEM_LABELS: Record<string, string> = {
  topic_system_missing: "选题体系缺失",
  calendar_blocked: "排产卡住",
  script_slow: "脚本产出慢",
  qc_missing: "质检标准缺失",
  conversion_unclear: "转化链路不清",
  archive_weak: "素材沉淀弱",
}

function resolveLabel(options: Array<{ value: string; label: string }>, value: string | undefined) {
  if (!value) return ""
  return options.find((opt) => opt.value === value)?.label || value
}

export default function WorkshopOnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  const [platform, setPlatform] = useState("")
  const [industry, setIndustry] = useState("")
  const [industryText, setIndustryText] = useState("")
  const [offerDesc, setOfferDesc] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [tone, setTone] = useState("")
  const [priceRange, setPriceRange] = useState("")
  const [currentProblem, setCurrentProblem] = useState<string[]>([])

  const [selectedDay, setSelectedDay] = useState(1)
  const [topicHint, setTopicHint] = useState("")

  useEffect(() => {
    try {
      const savedOnboarding = localStorage.getItem("workshop_onboarding")
      if (savedOnboarding) {
        const parsed = JSON.parse(savedOnboarding) as OnboardingPayload
        setPlatform(parsed.platform || "")
        setIndustry(parsed.industry || "")
        setIndustryText(parsed.industry_label && parsed.industry === "other" ? parsed.industry_label : "")
        setOfferDesc(parsed.offer_desc || "")
        setTargetAudience(parsed.target_audience || "")
        setTone(parsed.tone || "")
        setPriceRange(parsed.price_range || "")
        setCurrentProblem(parsed.current_problem || [])
        setSelectedDay(parsed.day || 1)
        setTopicHint(parsed.topic || "")
        return
      }

      const saved = localStorage.getItem("latestDiagnosisAnswers")
      if (!saved) return
      const parsed = JSON.parse(saved) as {
        answers?: Record<string, string | string[]>
        customIndustry?: string
      }
      const answers = parsed.answers || {}
      setPlatform(String(answers.platform || ""))
      setIndustry(String(answers.industry || ""))
      if (answers.industry === "other") {
        setIndustryText(String(parsed.customIndustry || ""))
      }
      setOfferDesc(String(answers.offer_desc || ""))
      setTargetAudience(String(answers.target_audience || ""))
      setTone(String(answers.tone || ""))
      setPriceRange(String(answers.price_range || ""))
      setCurrentProblem(Array.isArray(answers.current_problem) ? answers.current_problem.map(String) : [])
    } catch {
      // ignore parse errors
    }
  }, [])

  const isStep1Valid = useMemo(() => {
    if (!platform) return false
    if (!industry) return false
    if (industry === "other" && !industryText.trim()) return false
    if (!offerDesc.trim()) return false
    if (!targetAudience.trim()) return false
    return true
  }, [platform, industry, industryText, offerDesc, targetAudience])

  const onboardingPayload: OnboardingPayload = useMemo(
    () => ({
      platform,
      platform_label: resolveLabel(PLATFORM_OPTIONS, platform),
      industry,
      industry_label:
        industry === "other"
          ? industryText.trim()
          : INDUSTRY_LABELS[industry] || resolveLabel(INDUSTRY_OPTIONS, industry),
      offer_desc: offerDesc.trim(),
      target_audience: targetAudience.trim(),
      tone,
      tone_label: resolveLabel(TONE_OPTIONS, tone),
      price_range: priceRange,
      price_range_label: resolveLabel(PRICE_OPTIONS, priceRange),
      current_problem: currentProblem,
      day: selectedDay,
      topic: topicHint.trim(),
    }),
    [
      platform,
      industry,
      industryText,
      offerDesc,
      targetAudience,
      tone,
      priceRange,
      currentProblem,
      selectedDay,
      topicHint,
    ]
  )

  const persistOnboarding = () => {
    try {
      localStorage.setItem("workshop_onboarding", JSON.stringify(onboardingPayload))
    } catch {
      // ignore storage errors
    }
  }

  const handleGoToP7 = () => {
    persistOnboarding()
    router.push("/dashboard/workflow/P7?onboarding=1")
  }

  const handleGoToP8 = () => {
    persistOnboarding()
    localStorage.setItem("workshop_onboarding_done", "1")
    router.push("/dashboard/workflow/P8?onboarding=1")
  }

  const problemLabels = currentProblem.map((key) => PROBLEM_LABELS[key] || key).filter(Boolean)

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: "仪表盘", href: "/dashboard" },
          { label: "内容工坊", href: "/dashboard/workflow" },
          { label: "新手引导" },
        ]}
      />

      <main className="p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <GlassCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">内容工坊新手引导</h1>
                <p className="text-sm text-zinc-400 mt-2">3 步跑通：信息确认 → 7 天日历 → 脚本生成。</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className={`px-3 py-1 rounded-full ${step >= 1 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800"}`}>1</span>
                <span className={`px-3 py-1 rounded-full ${step >= 2 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800"}`}>2</span>
                <span className={`px-3 py-1 rounded-full ${step >= 3 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800"}`}>3</span>
              </div>
            </div>
          </GlassCard>

          {step === 1 ? (
            <GlassCard className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 1 · 确认关键信息</h2>
                <p className="text-sm text-zinc-400 mt-2">系统会从诊断结果自动带入，可按需调整。</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">主战平台</label>
                  <select
                    value={platform}
                    onChange={(event) => setPlatform(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
                  >
                    <option value="">请选择平台</option>
                    {PLATFORM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-2">行业/赛道</label>
                  <select
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
                  >
                    <option value="">请选择行业</option>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {industry === "other" ? (
                    <input
                      value={industryText}
                      onChange={(event) => setIndustryText(event.target.value)}
                      placeholder="填写你的行业"
                      className="mt-3 w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">一句话说明你卖什么</label>
                  <input
                    value={offerDesc}
                    onChange={(event) => setOfferDesc(event.target.value)}
                    placeholder="例如：为餐饮连锁做小红书代运营"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">你主要卖给谁</label>
                  <input
                    value={targetAudience}
                    onChange={(event) => setTargetAudience(event.target.value)}
                    placeholder="例如：25-35岁通勤白领"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <GlowButton primary onClick={() => { persistOnboarding(); setStep(2) }} disabled={!isStep1Valid}>
                  下一步：生成7天日历
                </GlowButton>
                <GlowButton
                  onClick={() => {
                    persistOnboarding()
                    localStorage.setItem("workshop_onboarding_done", "1")
                    router.push("/dashboard/workflow")
                  }}
                >
                  跳过引导
                </GlowButton>
              </div>
            </GlassCard>
          ) : null}

          {step === 2 ? (
            <GlassCard className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 2 · 一键生成 7 天日历</h2>
                <p className="text-sm text-zinc-400 mt-2">系统会用你的信息直接生成 7 天内容日历。</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-sm text-zinc-300 space-y-2">
                <div>平台：{onboardingPayload.platform_label || "-"}</div>
                <div>行业：{onboardingPayload.industry_label || "-"}</div>
                <div>卖什么：{onboardingPayload.offer_desc || "-"}</div>
                <div>卖给谁：{onboardingPayload.target_audience || "-"}</div>
                <div>脚本口吻：{onboardingPayload.tone_label || "-"}</div>
                <div>客单价：{onboardingPayload.price_range_label || "-"}</div>
                {problemLabels.length ? <div>主要卡点：{problemLabels.join(" / ")}</div> : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <GlowButton primary onClick={handleGoToP7}>
                  一键生成7天日历
                </GlowButton>
                <GlowButton onClick={() => setStep(3)}>我已生成，下一步</GlowButton>
                <GlowButton onClick={() => setStep(1)}>返回修改</GlowButton>
              </div>
            </GlassCard>
          ) : null}

          {step === 3 ? (
            <GlassCard className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Step 3 · 选一天生成脚本</h2>
                <p className="text-sm text-zinc-400 mt-2">选择日历中的一天，立即生成脚本。</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">选择日期</label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 7 }, (_, index) => index + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        className={`px-3 py-2 rounded-lg text-xs border ${
                          selectedDay === day
                            ? "border-emerald-500/50 text-emerald-300 bg-emerald-500/10"
                            : "border-white/10 text-zinc-300"
                        }`}
                      >
                        Day {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-2">选题提示（可选）</label>
                  <input
                    value={topicHint}
                    onChange={(event) => setTopicHint(event.target.value)}
                    placeholder="例如：3步搭建交付节奏"
                    className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <GlowButton primary onClick={handleGoToP8}>
                  一键生成脚本
                </GlowButton>
                <GlowButton onClick={() => setStep(2)}>返回上一步</GlowButton>
              </div>
            </GlassCard>
          ) : null}
        </div>
      </main>
    </div>
  )
}
