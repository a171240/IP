"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Download,
  Gift,
  Layers,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap
} from "lucide-react"
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import { useAuth } from "@/contexts/auth-context"
import { saveReport } from "@/lib/supabase"
import { getOrCreateDeviceId } from "@/lib/device"
import { CYBER_IP_PROFILES } from "@/lib/cyber-ip-profiles"
import { MARKETING_METRICS } from "@/lib/marketing/content"

// 智能体类型定义
type AgentType = "quick-script" | "reverse-thinking" | "industry-emotion" | "ip-style"

type GenerationContext = {
  agentId: AgentType
  agentName: string
  stepId: string
  industry?: string
  city?: string
  audience?: string
  cyberIpId?: string
  topic?: string
}

interface AgentConfig {
  id: AgentType
  name: string
  description: string
  icon: typeof Zap
  color: string
  inputs: InputField[]
  badge?: string
}

interface InputField {
  id: string
  label: string
  type: "text" | "select" | "textarea"
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
  helper?: string
}

const QUICK_START_RESUME_KEY = "quickStartResume"
type PendingAction = "copy" | "download" | "save"

const planLabels: Record<string, string> = {
  free: "体验版",
  basic: "Plus",
  pro: "Pro",
  vip: "企业版",
}

// 预设行业列表
const industries = [
  { value: "餐饮", label: "餐饮行业" },
  { value: "教育培训", label: "教育培训" },
  { value: "电商零售", label: "电商零售" },
  { value: "房产中介", label: "房产中介" },
  { value: "健身美容", label: "健身美容" },
  { value: "法律咨询", label: "法律咨询" },
  { value: "财务税务", label: "财务税务" },
  { value: "医疗健康", label: "医疗健康" },
  { value: "汽车服务", label: "汽车服务" },
  { value: "家装建材", label: "家装建材" },
  { value: "婚庆摄影", label: "婚庆摄影" },
  { value: "宠物服务", label: "宠物服务" },
  { value: "旅游酒店", label: "旅游酒店" },
  { value: "IT互联网", label: "IT互联网" },
  { value: "金融保险", label: "金融保险" },
  { value: "其他", label: "其他行业" },
]

// 预设城市列表
const cities = [
  { value: "北京", label: "北京" },
  { value: "上海", label: "上海" },
  { value: "广州", label: "广州" },
  { value: "深圳", label: "深圳" },
  { value: "杭州", label: "杭州" },
  { value: "成都", label: "成都" },
  { value: "重庆", label: "重庆" },
  { value: "武汉", label: "武汉" },
  { value: "西安", label: "西安" },
  { value: "南京", label: "南京" },
  { value: "苏州", label: "苏州" },
  { value: "郑州", label: "郑州" },
  { value: "长沙", label: "长沙" },
  { value: "东莞", label: "东莞" },
  { value: "青岛", label: "青岛" },
  { value: "其他", label: "其他城市" },
]

// 风格标签（避免复刻具体真人，仅做表达特征参考）
const cyberIpOptions = CYBER_IP_PROFILES.map((profile) => ({
  value: profile.id,
  label: profile.name,
}))

const getCyberIpProfile = (cyberIpId: string) => {
  return CYBER_IP_PROFILES.find((profile) => profile.id === cyberIpId) || null
}

const agents: AgentConfig[] = [
  {
    id: "quick-script",
    name: "脚本交付包",
    description: "10个选题 + 1条可交付口播脚本（含钩子/分镜/引导）",
    icon: Zap,
    color: "from-yellow-500 to-orange-500",
    badge: "推荐",
    inputs: [
      { id: "industry", label: "选择行业", type: "select", options: industries, required: true },
      {
        id: "audience",
        label: "目标受众",
        type: "text",
        placeholder: "如：3km内上班族，午餐外卖，想省钱又吃好",
        helper: "写清楚人群 + 场景 + 需求，输出会更像你的业务",
        required: true,
      },
    ],
  },
  {
    id: "reverse-thinking",
    name: "反向观点脚本",
    description: "生成5个反常识话题，并输出最强1条完整脚本",
    icon: TrendingUp,
    color: "from-purple-500 to-pink-500",
    inputs: [
      { id: "industry", label: "选择行业", type: "select", options: industries, required: true },
      { id: "city", label: "选择城市", type: "select", options: cities, required: true },
    ],
  },
  {
    id: "industry-emotion",
    name: "情绪选题库",
    description: "基于行业特点，生成正反情绪选题与表达切口",
    icon: Lightbulb,
    color: "from-cyan-500 to-blue-500",
    inputs: [{ id: "industry", label: "选择行业", type: "select", options: industries, required: true }],
  },
  {
    id: "ip-style",
    name: "赛博IP复刻写作",
    description: "选择一个赛博IP（风格基因），生成同款语气的短视频口播脚本",
    icon: Users,
    color: "from-rose-500 to-red-500",
    inputs: [
      {
        id: "cyberIpId",
        label: "选择赛博IP",
        type: "select",
        options: cyberIpOptions,
        required: true,
        helper: "虚拟赛博IP风格参考（不冒充真人）",
      },
      { id: "industry", label: "选择行业", type: "select", options: industries, required: true },
      {
        id: "topic",
        label: "想写什么（主题/观点）",
        type: "textarea",
        placeholder: "例如：餐饮老板怎么用短视频做同城引流？\n再例如：家长如何在高考填报里少走弯路？",
        required: true,
      },
    ],
  },
]

function QuickStartPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()

  const [selectedAgent, setSelectedAgent] = useState<AgentType>("quick-script")
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [usageCount, setUsageCount] = useState(0)

  const [generationContext, setGenerationContext] = useState<GenerationContext | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const resultRef = useRef<HTMLDivElement>(null)
  const suppressReset = useRef(false)
  const prefillApplied = useRef(false)

  const currentPlan = profile?.plan || "free"
  const planLabel = planLabels[currentPlan] || currentPlan

  const currentAgent = useMemo(() => agents.find((a) => a.id === selectedAgent)!, [selectedAgent])

  const ensureAuthed = (action: PendingAction) => {
    if (user) return true

    try {
      sessionStorage.setItem(
        QUICK_START_RESUME_KEY,
        JSON.stringify({
          action,
          result,
          generationContext,
          selectedAgent,
          formData,
          customInputs,
        })
      )
    } catch {
      // ignore storage errors
    }

    const redirectTo = `${pathname}?resume=1`
    router.push(`/auth/login?redirect=${encodeURIComponent(redirectTo)}`)
    return false
  }

  const handleDownload = () => {
    if (!result) return

    const date = new Date().toISOString().slice(0, 10)
    const blob = new Blob([result], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `快速体验_${date}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  // 读取使用次数（仅本地统计，用于提示用户复用）
  useEffect(() => {
    const count = localStorage.getItem("quickStartUsageCount")
    if (count) setUsageCount(parseInt(count))
  }, [])

  // Resume a pending action after login (copy/download/save).
  useEffect(() => {
    if (!user) return
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    if (params.get("resume") !== "1") return

    try {
      const raw = sessionStorage.getItem(QUICK_START_RESUME_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        action?: PendingAction
        result?: string
        generationContext?: GenerationContext | null
        selectedAgent?: AgentType
        formData?: Record<string, string>
        customInputs?: Record<string, string>
      }

      if (parsed.selectedAgent) setSelectedAgent(parsed.selectedAgent)
      if (parsed.formData) setFormData(parsed.formData)
      if (parsed.customInputs) setCustomInputs(parsed.customInputs)
      if (parsed.generationContext) setGenerationContext(parsed.generationContext)
      if (parsed.result) setResult(parsed.result)

      if (parsed.action) setPendingAction(parsed.action)
      sessionStorage.removeItem(QUICK_START_RESUME_KEY)
    } catch {
      // ignore resume errors
    }
  }, [user])

  // 切换智能体时清空表单
  useEffect(() => {
    if (suppressReset.current) {
      suppressReset.current = false
      return
    }
    setFormData({})
    setCustomInputs({})
    setResult("")
    setCopied(false)
    setGenerationContext(null)
    setIsSaved(false)
    setSaveError(null)
  }, [selectedAgent])

  // URL 预填（从诊断页直达时减少填写成本）
  useEffect(() => {
    if (prefillApplied.current) return
    if (!searchParams) return

    const agentParam = searchParams.get("agent")
    const industryParam = searchParams.get("industry")
    const audienceParam = searchParams.get("audience")
    const cityParam = searchParams.get("city")

    if (!agentParam && !industryParam && !audienceParam && !cityParam) return

    const nextFormData: Record<string, string> = {}
    const nextCustomInputs: Record<string, string> = {}

    if (industryParam) {
      const isKnownIndustry = industries.some((item) => item.value === industryParam)
      if (isKnownIndustry) {
        nextFormData.industry = industryParam
      } else {
        nextFormData.industry = "其他"
        nextCustomInputs.industry = industryParam
      }
    }

    if (audienceParam) nextFormData.audience = audienceParam
    if (cityParam) nextFormData.city = cityParam

    if (Object.keys(nextCustomInputs).length > 0) {
      setCustomInputs((prev) => ({ ...prev, ...nextCustomInputs }))
    }
    if (Object.keys(nextFormData).length > 0) {
      setFormData((prev) => ({ ...prev, ...nextFormData }))
    }

    if (agentParam) {
      const isAgentParam = agents.some((agent) => agent.id === agentParam)
      if (isAgentParam && agentParam !== selectedAgent) {
        suppressReset.current = true
        setSelectedAgent(agentParam as AgentType)
      }
    }

    prefillApplied.current = true
  }, [searchParams, selectedAgent])

  const handleInputChange = (fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }))
    if (value !== "其他") {
      setCustomInputs((prev) => {
        const newInputs = { ...prev }
        delete newInputs[fieldId]
        return newInputs
      })
    }
  }

  const handleCustomInputChange = (fieldId: string, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [fieldId]: value }))
  }

  const getFieldValue = (fieldId: string) => {
    if (formData[fieldId] === "其他") {
      return customInputs[fieldId] || ""
    }
    return formData[fieldId] || ""
  }

  const isFormValid = () => {
    return currentAgent.inputs.every((input) => {
      if (!input.required) return true
      const value = formData[input.id]
      if (!value || !value.trim()) return false
      if (value === "其他") {
        return !!(customInputs[input.id] && customInputs[input.id].trim())
      }
      return true
    })
  }

  const buildUserPrompt = () => {
    const industry = getFieldValue("industry")
    const city = getFieldValue("city")
    const audience = getFieldValue("audience")
    const cyberIpId = getFieldValue("cyberIpId")
    const topic = getFieldValue("topic")

    switch (selectedAgent) {
      case "quick-script":
        return `行业：${industry}\n目标受众：${audience}\n\n请输出一份“可交付脚本包”（Markdown）：\n- 10个选题（标题 + 一句话钩子 + 适合的4X4类型）\n- 选题1脚本交付包：标题备选、3秒钩子、分镜表（镜头|画面|口播|字幕|时长）、口播全文、置顶评论、行动引导（轻/中/强）、复用变体（3条）。\n约束：不要虚构具体数据/案例；不要做保证性承诺。`

      case "reverse-thinking":
        return `行业：${industry}\n城市：${city}\n\n请输出：\n- 5个反向观点话题（标题 + 反常识观点一句话 + 争议点 + 共鸣点 + 风险提示）\n- 对话题1输出完整脚本交付包：开场质疑、反向论证、扎心总结、评论区引导（3条）、标题备选（3个）。\n约束：表达犀利但不攻击具体个人/群体，不要编造数据。`

      case "industry-emotion":
        return `行业：${industry}\n\n请输出：\n- 正向情绪选题5个 + 反向情绪选题5个（每个给：标题 + 情绪触发点 + 适合人群/场景 + 表达切口）\n- 给出“如何把这些选题纳入4X4配比”的建议（起号期/增长期/稳定期）。\n约束：不要引用或编造具体实时热点数据。`

      case "ip-style": {
        const profile = getCyberIpProfile(cyberIpId)
        const tags = profile?.tags?.length ? `\n标签：${profile.tags.join("、")}` : ""
        const signature = profile?.signature?.length ? `\n口头禅：${profile.signature.join(" / ")}` : ""

        return `赛博IP：${profile?.name || cyberIpId}\n类型：${profile?.type || ""}\n对抗强度：${profile?.intensity || ""}\n擅长领域：${profile?.domains || ""}\n表达节奏：${profile?.rhythm || ""}${tags}${signature}\n\n行业：${industry}\n主题：${topic}\n\n请用该赛博IP的表达特征，输出一条短视频口播脚本交付包（Markdown）：\n- 标题备选（3个）\n- 3秒钩子（2个）\n- 口播全文\n- 分镜表（镜头|画面|口播|字幕|时长）\n- 结尾行动引导（2个）\n\n约束：\n- 只使用“赛博IP”作为风格代号，不要去掉“赛博”二字；不要冒充/影射真人。\n- 不虚构具体数据/案例，不做保证性承诺。`
      }

      default:
        return ""
    }
  }

  const handleFillExample = () => {
    setCustomInputs({})

    switch (selectedAgent) {
      case "quick-script":
        setFormData({
          industry: "餐饮",
          audience: "3km内上班族，午餐外卖，想省钱又吃好",
        })
        return

      case "reverse-thinking":
        setFormData({ industry: "健身美容", city: "成都" })
        return

      case "industry-emotion":
        setFormData({ industry: "教育培训" })
        return

      case "ip-style":
        setFormData({ cyberIpId: "cyber-fangqi", industry: "电商零售", topic: "电商老板如何用短视频在 30 天内跑通同城引流？" })
        return

      default:
        return
    }
  }

  const handleGenerate = async () => {
    if (!isFormValid() || isGenerating) return

    setIsGenerating(true)
    setResult("")
    setCopied(false)
    setIsSaved(false)
    setSaveError(null)

    const industry = getFieldValue("industry")
    const city = getFieldValue("city")
    const audience = getFieldValue("audience")
    const cyberIpId = getFieldValue("cyberIpId")
    const topic = getFieldValue("topic")

    const stepId = `quick-${selectedAgent}`
    setGenerationContext({
      agentId: selectedAgent,
      agentName: currentAgent.name,
      stepId,
      industry,
      city,
      audience,
      cyberIpId,
      topic,
    })

    try {
      const deviceId = getOrCreateDeviceId()
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(deviceId ? { "x-device-id": deviceId } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: buildUserPrompt() }],
          stepId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const message = (errorData as any)?.error || "\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5"
        setResult(message)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("无法读取响应")

      const decoder = new TextDecoder()
      let fullContent = ""
      let sseBuffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        sseBuffer += text

        const lines = sseBuffer.split("\n")
        sseBuffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue

          const data = line.slice(6).trim()
          if (!data || data === "[DONE]") continue

          try {
            const json = JSON.parse(data)
            if (json.content) {
              fullContent += json.content
              setResult(fullContent)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      const newCount = usageCount + 1
      setUsageCount(newCount)
      localStorage.setItem("quickStartUsageCount", newCount.toString())

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 120)
    } catch (error) {
      console.error("Generation error:", error)
      setResult("生成失败，请稍后重试")
    } finally {
      setIsGenerating(false)
      await refreshProfile()
    }
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error("复制失败")
    }
  }

  const handleSaveToReports = async () => {
    if (!result || isSaving || isSaved) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const context = generationContext
      const titleParts = [context?.industry, context?.city].filter(Boolean) as string[]
      const titleSuffix = titleParts.length > 0 ? ` · ${titleParts.join(" · ")}` : ""

      const report = await saveReport(
        context?.stepId || `quick-${selectedAgent}`,
        `快速体验：${context?.agentName || currentAgent.name}${titleSuffix}`,
        result,
        undefined,
        undefined,
        undefined,
        {
          source: "quick-start",
          agentId: context?.agentId || selectedAgent,
          inputs: {
            industry: context?.industry,
            city: context?.city,
            audience: context?.audience,
            cyberIpId: context?.cyberIpId,
            topic: context?.topic,
          },
        }, profile?.id
      )

      if (!report) throw new Error("保存失败")
      setIsSaved(true)
    } catch (error) {
      console.error("Save report error:", error)
      setSaveError("保存失败，请稍后重试")
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (!user) return
    if (!pendingAction) return
    if (!result) return

    if (pendingAction === "save") {
      handleSaveToReports()
    }

    setPendingAction(null)
  }, [user, pendingAction, result])

  const showUpgrade = !authLoading && currentPlan === "free"
  const homeHref = user ? "/dashboard" : "/"

  return (
    <div className="min-h-[100dvh]">
      <Header breadcrumbs={[{ label: "主页", href: homeHref }, { label: "快速体验" }]} />

      <main className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Hero */}
          <GlassCard className="p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-purple-600/10 to-transparent rounded-full blur-3xl" />
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold dark:text-white text-zinc-900">快速体验：一份可交付脚本包</h1>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold">
                    体验版
                  </span>
                </div>

                <p className="text-sm dark:text-zinc-400 text-zinc-500 max-w-2xl leading-relaxed">
                  只填少量信息，快速生成“选题 + 脚本 + 分镜 + 评论引导”的交付草案。生成后可一键保存到“报告”，方便复用、交付与复盘。
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                  <span className="px-2 py-1 rounded-lg dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                    标题备选
                  </span>
                  <span className="px-2 py-1 rounded-lg dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                    3秒钩子
                  </span>
                  <span className="px-2 py-1 rounded-lg dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                    分镜表
                  </span>
                  <span className="px-2 py-1 rounded-lg dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                    置顶评论
                  </span>
                  <span className="px-2 py-1 rounded-lg dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                    行动引导
                  </span>
                </div>
              </div>

              <div className="w-full lg:w-[280px] space-y-3">
                <div className="p-4 rounded-2xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] dark:text-zinc-400 text-zinc-500">当前方案</p>
                      <p className="text-sm font-semibold dark:text-white text-zinc-900">{planLabel}</p>
                    </div>
                    {usageCount > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] dark:text-zinc-400 text-zinc-500">本地体验次数</p>
                        <p className="text-sm font-semibold text-purple-400">{usageCount}</p>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] dark:text-zinc-400 text-zinc-500 leading-relaxed">
                    体验次数仅保存在本地浏览器，用于提醒你复用和沉淀。
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[10px] dark:text-zinc-400 text-zinc-500">剩余积分</p>
                    <p className="text-sm font-semibold dark:text-white text-zinc-900">
                      {profile?.credits_unlimited ? "\u221e" : (typeof profile?.credits_balance === 'number' ? profile.credits_balance : '--')}
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] dark:text-zinc-400 text-zinc-500 leading-relaxed">
                    不同步骤会消耗不同积分；同设备新用户会获得一次试用积分。
                  </p>
                </div>

                <GlowButton primary className="w-full" onClick={() => router.push("/dashboard/workflow/P1")}>
                  <Layers className="w-4 h-4" />
                  进入工坊从 P1 开始
                  <ArrowRight className="w-4 h-4" />
                </GlowButton>

                <GlowButton className="w-full" onClick={() => router.push("/pricing")}>
                  查看定价
                  <ArrowRight className="w-4 h-4" />
                </GlowButton>
              </div>
            </div>
          </GlassCard>

          {/* Quick Diagnosis entry */}
          <GlassCard className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold dark:text-white text-zinc-900">快速诊断：IP健康诊断</h2>
                  <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-1">
                    8道题快速定位你的内容瓶颈，生成综合评分与可执行改进建议。
                  </p>
                </div>
              </div>

              <Link href="/diagnosis" className="shrink-0">
                <GlowButton primary className="w-full sm:w-auto">
                  开始诊断
                  <ArrowRight className="w-4 h-4" />
                </GlowButton>
              </Link>
            </div>
          </GlassCard>

          {/* Choose + Form */}
          <div className="grid lg:grid-cols-5 gap-6">
            <GlassCard className="lg:col-span-2 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-medium dark:text-white text-zinc-900">选择交付物</h2>
                </div>
                <span className="text-[10px] dark:text-zinc-400 text-zinc-500">推荐先跑通“脚本交付包”</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
                {agents.map((agent) => (
                  <GlassCard
                    key={agent.id}
                    hover
                    selected={selectedAgent === agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className="p-4 cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.color} flex items-center justify-center flex-shrink-0`}
                      >
                        <agent.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold dark:text-white text-zinc-900">{agent.name}</h3>
                          {agent.badge && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold">
                              {agent.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1 leading-relaxed">{agent.description}</p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="lg:col-span-3 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-medium dark:text-white text-zinc-900">{currentAgent.name} · 输入信息</h2>
                  <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1">
                    填得越具体，输出越像“可直接交付给同事”的版本。
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <GlowButton className="text-xs py-2 px-3" onClick={handleFillExample}>
                    一键填充示例
                  </GlowButton>
                  <GlowButton
                    className="text-xs py-2 px-3"
                    onClick={() => {
                      setFormData({})
                      setCustomInputs({})
                      setResult("")
                      setCopied(false)
                      setGenerationContext(null)
                      setIsSaved(false)
                      setSaveError(null)
                    }}
                  >
                    清空
                  </GlowButton>
                </div>
              </div>

              <div className="space-y-4">
                {currentAgent.inputs.map((input) => (
                  <div key={input.id}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium dark:text-white text-zinc-900">
                        {input.label}
                        {input.required && <span className="text-red-400 ml-1">*</span>}
                      </label>
                      {input.helper && <span className="text-[10px] text-zinc-500">{input.helper}</span>}
                    </div>

                    {input.type === "select" ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <select
                            value={formData[input.id] || ""}
                            onChange={(e) => handleInputChange(input.id, e.target.value)}
                            className="w-full dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl px-4 py-3 dark:text-white text-zinc-900 appearance-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
                          >
                            <option value="">请选择...</option>
                            {input.options?.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                        </div>

                        {formData[input.id] === "其他" && (
                          <input
                            type="text"
                            value={customInputs[input.id] || ""}
                            onChange={(e) => handleCustomInputChange(input.id, e.target.value)}
                            placeholder={
                              input.id === "industry"
                                ? "请输入你的行业，如：母婴用品、宠物医疗..."
                                : "请输入你的城市..."
                            }
                            className="w-full dark:bg-zinc-900/50 bg-zinc-100 border border-purple-500/30 rounded-xl px-4 py-3 dark:text-white text-zinc-900 placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
                            autoFocus
                          />
                        )}

                        {/* IP 样式介绍卡片 */}
                        {selectedAgent === "ip-style" && input.id === "cyberIpId" && formData.cyberIpId && (
                          (() => {
                            const profile = getCyberIpProfile(formData.cyberIpId)
                            if (!profile) return null
                            return (
                              <div className="mt-3 p-4 rounded-2xl dark:bg-zinc-900/40 bg-zinc-50 border dark:border-white/5 border-black/5">
                                <p className="text-[11px] font-semibold dark:text-white text-zinc-900">{profile.name} · 类型介绍</p>
                                <div className="mt-2 space-y-1 text-[11px] dark:text-zinc-300 text-zinc-600">
                                  <div><span className="text-zinc-500">类型：</span>{profile.type}</div>
                                  <div><span className="text-zinc-500">对抗强度：</span>{profile.intensity}</div>
                                  <div><span className="text-zinc-500">擅长领域：</span>{profile.domains}</div>
                                  <div><span className="text-zinc-500">表达节奏：</span>{profile.rhythm}</div>
                                  {profile.tags?.length ? (
                                    <div><span className="text-zinc-500">标签：</span>{profile.tags.join("、")}</div>
                                  ) : null}
                                  {profile.signature?.length ? (
                                    <div><span className="text-zinc-500">口头禅：</span>{profile.signature.join(" / ")}</div>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })()
                        )}
                      </div>
                    ) : input.type === "textarea" ? (
                      <textarea
                        value={formData[input.id] || ""}
                        onChange={(e) => handleInputChange(input.id, e.target.value)}
                        placeholder={input.placeholder}
                        rows={3}
                        className="w-full dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl px-4 py-3 dark:text-white text-zinc-900 placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={formData[input.id] || ""}
                        onChange={(e) => handleInputChange(input.id, e.target.value)}
                        placeholder={input.placeholder}
                        className="w-full dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl px-4 py-3 dark:text-white text-zinc-900 placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
                      />
                    )}
                  </div>
                ))}

                <GlowButton
                  primary
                  onClick={handleGenerate}
                  disabled={!isFormValid() || isGenerating}
                  className="w-full mt-2"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      AI 正在创作中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      立即生成
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </GlowButton>

                <p className="text-[10px] dark:text-zinc-400 text-zinc-500 leading-relaxed">
                  生成结果为草案，建议结合实际合规与业务细节二次调整。
                </p>
              </div>
            </GlassCard>
          </div>

          {/* Result */}
          {(result || isGenerating) && (
            <GlassCard ref={resultRef} className="p-6" glow={!!result && !isGenerating}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold dark:text-white text-zinc-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    生成结果
                  </h2>
                  <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1">
                    建议先保存到“报告”，再进入工坊做体系化沉淀。
                  </p>
                </div>

                {result && !isGenerating && (
                  <div className="flex items-center gap-2">
                    <GlowButton onClick={handleGenerate} className="text-xs py-2 px-3">
                      <RefreshCw className="w-3 h-3" />
                      重新生成
                    </GlowButton>
                    <GlowButton
                      onClick={() => {
                        if (!ensureAuthed("download")) return
                        handleDownload()
                      }}
                      className="text-xs py-2 px-3"
                    >
                      <Download className="w-3 h-3" />
                      下载
                    </GlowButton>
                    <GlowButton
                      onClick={() => {
                        if (!ensureAuthed("copy")) return
                        handleCopy()
                      }}
                      className="text-xs py-2 px-3"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3" />
                          已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          复制
                        </>
                      )}
                    </GlowButton>
                  </div>
                )}
              </div>

              {/* Next actions (visible after auto-scroll) */}
              {result && !isGenerating && (
                <div className="grid md:grid-cols-3 gap-3 mb-5">
                  <GlowButton
                    primary
                    className="w-full"
                    onClick={() => {
                      if (isSaved) {
                        router.push("/dashboard/reports")
                        return
                      }
                      if (!ensureAuthed("save")) return
                      handleSaveToReports()
                    }}
                    disabled={isSaving}
                  >
                    {isSaved ? (
                      <>
                        <Check className="w-4 h-4" />
                        已保存到报告
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-4 h-4" />
                        {isSaving ? "保存中..." : "保存到报告"}
                      </>
                    )}
                  </GlowButton>

                  <GlowButton className="w-full" onClick={() => router.push("/dashboard/workflow/P1")}>
                    <Layers className="w-4 h-4" />
                    去工坊完善定位（P1）
                    <ArrowRight className="w-4 h-4" />
                  </GlowButton>

                  {showUpgrade ? (
                    <GlowButton className="w-full" onClick={() => router.push("/pricing")}>
                      <Crown className="w-4 h-4 text-yellow-400" />
                      升级解锁批量产出
                      <ArrowRight className="w-4 h-4" />
                    </GlowButton>
                  ) : (
                    <GlowButton className="w-full" onClick={() => router.push("/dashboard/workflow")}>
                      进入工坊
                      <ArrowRight className="w-4 h-4" />
                    </GlowButton>
                  )}
                </div>
              )}

              {saveError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {saveError}
                </div>
              )}

              <div className="dark:bg-zinc-950/50 bg-zinc-100 rounded-xl p-4 border dark:border-white/5 border-black/5">
                {isGenerating && !result && (
                  <div className="flex items-center gap-3 text-zinc-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    AI 正在思考创意...
                  </div>
                )}

                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap dark:text-zinc-300 text-zinc-800 font-sans text-sm leading-relaxed">
                    {result || ""}
                  </pre>
                </div>
              </div>

              {/* Upgrade block (kept compact, directly under result) */}
              {result && !isGenerating && showUpgrade && (
                <div className="mt-5 p-5 rounded-2xl bg-gradient-to-br from-purple-950/30 to-zinc-900/50 border border-purple-500/20">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="w-4 h-4 text-yellow-400" />
                        <h3 className="text-sm font-semibold dark:text-white text-zinc-900">新用户体验计划：7天Pro体验</h3>
                      </div>
                      <p className="text-xs dark:text-zinc-400 text-zinc-500 leading-relaxed">
                        体验版让你"先跑通一条"，Pro帮你解锁全部{MARKETING_METRICS.workflowTemplates}个智能体模板 + 批量产出 + 资源下载。
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="flex items-baseline gap-2 justify-end">
                        <span className="text-2xl font-bold dark:text-white text-zinc-900">￥9.9</span>
                        <span className="text-xs text-zinc-500 line-through">￥599</span>
                      </div>
                      <p className="text-[10px] text-zinc-500">体验 7 天Pro</p>
                    </div>
                  </div>

                  <div className="mt-4 grid md:grid-cols-2 gap-3">
                    <GlowButton primary className="w-full" onClick={() => router.push("/pricing")}>
                      <Crown className="w-4 h-4" />
                      立即升级
                      <ArrowRight className="w-4 h-4" />
                    </GlowButton>
                    <GlowButton className="w-full" onClick={() => router.push("/dashboard/workflow")}>
                      先看看完整工作流
                      <ArrowRight className="w-4 h-4" />
                    </GlowButton>
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* Hint */}
          {!result && !isGenerating && (
            <div className="text-center py-6">
              <p className="text-zinc-500 text-sm">选择交付物 → 填写信息 → 点击生成 → 保存到报告 → 进入工坊体系化沉淀</p>
              <p className="mt-2 text-[10px] text-zinc-600">
                体验版更适合"先跑通一条"，想解锁全部智能体和下载权限，建议升级Plus/Pro。
              </p>
              <div className="mt-4 flex items-center justify-center gap-3 text-xs text-zinc-500">
                <Link href="/dashboard/workflow" className="hover:text-purple-300 transition-colors">
                  进入工坊
                </Link>
                <span className="text-zinc-700">·</span>
                <Link href="/pricing" className="hover:text-purple-300 transition-colors">
                  查看定价
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function QuickStartPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center text-zinc-500">
          加载中...
        </div>
      }
    >
      <QuickStartPageContent />
    </Suspense>
  )
}
