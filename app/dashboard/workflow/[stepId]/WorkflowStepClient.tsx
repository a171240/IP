"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowDown,
  Send,
  Sparkles,
  FileText,
  Target,
  User,
  Lightbulb,
  Clock,
  BarChart3,
  BookOpen,
  Layers,
  PenTool,
  MessageSquare,
  RefreshCw,
  ChevronRight,
  Copy,
  Download,
  CheckCircle2,
  Loader2,
  Bot,
  UserCircle,
  Info,
  Zap,
  Eye,
  Save,
  Database,
  AlertCircle,
  Check
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { GlassCard, Header, GlowButton } from "@/components/ui/obsidian"
import { ReportCanvas } from "@/components/ui/report-canvas"
import { useAuth } from "@/contexts/auth-context"
import {
  CreditsLowWarning,
  UpgradePromptAfterGeneration,
  InsufficientCreditsModal,
  PlanRequiredModal
} from "@/components/ui/upgrade-prompt"
import type { WorkflowIconId, WorkflowStepConfig } from "@/lib/workflow/types"
import {
  createConversation,
  getLatestConversation,
  updateConversationMessages,
  completeConversation,
  setConversationStatus,
  saveReport,
  getLatestReport,
  getLatestReportByConversation,
  getUserReportsPreview,
  getStepConversations,
  updateStepProgress,
  type Message as DbMessage,
  type Conversation,
  type ReportPreview
} from "@/lib/supabase"
import { getOrCreateDeviceId } from "@/lib/device"
import { agentsConfig } from "@/lib/agents/config"
import {
  type Message,
  stepDependencies,
  reportTitles,
  detectReportInContent,
  formatRelativeTime,
  deriveConversationTopic,
  generateInitialPromptWithReports,
  messagesToDbFormat
} from "./utils"

type OnboardingContext = {
  platform_label?: string
  industry_label?: string
  offer_desc?: string
  target_audience?: string
  tone_label?: string
  price_range_label?: string
  day?: number
  topic?: string
}

const ONBOARDING_STORAGE_KEY = "workshop_onboarding"

// 图标映射
const workflowIconMap: Record<WorkflowIconId, LucideIcon> = {
  Target,
  BarChart3,
  Sparkles,
  BookOpen,
  User,
  Lightbulb,
  Layers,
  FileText,
  MessageSquare,
  PenTool,
  RefreshCw
}

// 颜色变体
const colorVariants: Record<string, { bg: string; border: string; text: string; light: string }> = {
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", light: "bg-purple-500/5" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", light: "bg-blue-500/5" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", light: "bg-emerald-500/5" },
}

function buildOnboardingPrompt(stepId: string, onboarding: OnboardingContext) {
  const details = [
    onboarding.platform_label ? `平台：${onboarding.platform_label}` : null,
    onboarding.industry_label ? `行业：${onboarding.industry_label}` : null,
    onboarding.offer_desc ? `卖什么：${onboarding.offer_desc}` : null,
    onboarding.target_audience ? `卖给谁：${onboarding.target_audience}` : null,
    onboarding.tone_label ? `口吻：${onboarding.tone_label}` : null,
    onboarding.price_range_label ? `客单价：${onboarding.price_range_label}` : null,
  ].filter(Boolean)

  if (!details.length) return null

  if (stepId === "P7") {
    return [
      "请基于以下信息生成 7 天内容日历，并给出 10-20 个备选选题。",
      ...details,
      "输出格式：Day1~Day7，每天包含 标题/类型(引流/建信/转化)/一句话钩子/CTA。随后给出备选选题清单。",
    ].join("\n")
  }

  if (stepId === "P8") {
    const dayLabel = onboarding.day ? `第${onboarding.day}天` : "Day1"
    const topicLine = onboarding.topic ? `选题提示：${onboarding.topic}` : null
    return [
      "请基于以下信息生成一条可直接发布的短视频脚本。",
      ...details,
      `日历选择：${dayLabel}`,
      topicLine,
      "输出结构：0-3秒钩子 / 正文分点 / 结尾CTA / 置顶评论。",
    ]
      .filter(Boolean)
      .join("\n")
  }

  return null
}

export default function WorkflowStepClient({ stepId, step }: { stepId: string; step: WorkflowStepConfig }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const onboardingFlag = searchParams?.get("onboarding") === "1"
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()

  // 基础状态
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [generatedDoc, setGeneratedDoc] = useState<string | null>(null)
  const [conversationProgress, setConversationProgress] = useState(0)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [canGenerateReport, setCanGenerateReport] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [stepConversations, setStepConversations] = useState<Conversation[]>([])
  const [isInitializing, setIsInitializing] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced')
  const [previousReports, setPreviousReports] = useState<Record<string, string>>({})
  const [isCanvasOpen, setIsCanvasOpen] = useState(false)
  const [canvasStreamContent, setCanvasStreamContent] = useState("")
  const [onboardingContext, setOnboardingContext] = useState<OnboardingContext | null>(null)

  // P8智能体选择
  const P8_AGENT_IDS = useMemo(() => ([
    "deep-resonance", "golden-sentence", "weird-question",
    "life-story", "promo-hook", "product-display",
  ]), [])

  const p8Agents = useMemo(() => {
    const byId = new Map(agentsConfig.map(a => [a.id, a]))
    return P8_AGENT_IDS.map(id => byId.get(id)).filter(Boolean) as typeof agentsConfig
  }, [P8_AGENT_IDS])

  const [selectedP8AgentId, setSelectedP8AgentId] = useState<string | null>(null)

  const selectedP8Agent = useMemo(() => {
    if (!selectedP8AgentId) return null
    return agentsConfig.find(a => a.id === selectedP8AgentId) || null
  }, [selectedP8AgentId])

  // 升级弹窗状态
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false)
  const [insufficientCreditsData, setInsufficientCreditsData] = useState<{ required: number; balance: number } | null>(null)
  const [showPlanRequired, setShowPlanRequired] = useState(false)
  const [planRequiredData, setPlanRequiredData] = useState<{ requiredPlan: "free" | "basic" | "pro" | "vip"; currentPlan: "free" | "basic" | "pro" | "vip"; creditCost?: number; balance?: number } | null>(null)
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(true)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const initKeyRef = useRef<string | null>(null)
  const streamContentRef = useRef("")
  const streamReasoningRef = useRef("")
  const rafIdRef = useRef<number | null>(null)
  const onboardingSentRef = useRef(false)

  // Chat scroll: pin/unpin
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)

  const updatePinnedState = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return

    const threshold = 80
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom <= threshold
    setIsPinnedToBottom(atBottom)
    if (atBottom) setHasNewMessages(false)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  // P8智能体本地存储
  useEffect(() => {
    if (step?.id !== "P8") return
    try {
      const saved = window.localStorage.getItem("p8:selectedAgentId")
      if (saved) setSelectedP8AgentId(saved)
    } catch { /* ignore */ }
  }, [step?.id])

  useEffect(() => {
    if (step?.id !== "P8") return
    try {
      if (selectedP8AgentId) window.localStorage.setItem("p8:selectedAgentId", selectedP8AgentId)
      else window.localStorage.removeItem("p8:selectedAgentId")
    } catch { /* ignore */ }
  }, [step?.id, selectedP8AgentId])

  useEffect(() => {
    if (!onboardingFlag) return
    try {
      const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as OnboardingContext
      setOnboardingContext(parsed)
    } catch {
      // ignore onboarding parse errors
    }
  }, [onboardingFlag])

  useEffect(() => {
    if (step?.id !== "P8") return
    if (!onboardingFlag) return
    if (selectedP8AgentId) return
    if (p8Agents.length > 0) {
      setSelectedP8AgentId(p8Agents[0].id)
    }
  }, [step?.id, onboardingFlag, p8Agents, selectedP8AgentId])

  // 合并报告
  const combinedReports = useMemo(() => ({
    ...previousReports
  }), [previousReports])

  // 缺失报告
  const derivedMissingReports = step ? (stepDependencies[step.id] || []).filter(dep => !combinedReports[dep]) : []

  // 更新历史对话列表
  const upsertStepConversation = useCallback((conversation: Conversation) => {
    setStepConversations((prev) => {
      const existingIndex = prev.findIndex((c) => c.id === conversation.id)
      const next = existingIndex === -1
        ? [conversation, ...prev]
        : prev.map((c) => (c.id === conversation.id ? { ...c, ...conversation } : c))

      return next.sort((a, b) => {
        const aTime = new Date(a.updated_at || a.created_at).getTime()
        const bTime = new Date(b.updated_at || b.created_at).getTime()
        return bTime - aTime
      })
    })
  }, [])

  // 保存到数据库
  const saveToDatabase = useCallback(async (msgs: Message[]) => {
    if (!currentConversation || !user) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setSyncStatus('syncing')

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const dbMessages = messagesToDbFormat(msgs)
        const success = await updateConversationMessages(currentConversation.id, dbMessages)
        if (success) {
          setSyncStatus('synced')
          upsertStepConversation({
            ...currentConversation,
            messages: dbMessages,
            updated_at: new Date().toISOString()
          })
        } else {
          setSyncStatus('error')
        }
      } catch (error) {
        console.error('Save to database failed:', error)
        setSyncStatus('error')
      }
    }, 500)
  }, [currentConversation, user, upsertStepConversation])

  // 加载前置报告
  const loadPreviousReports = async (stepId: string): Promise<{ reports: Record<string, string>; missing: string[] }> => {
    const dependencies = stepDependencies[stepId] || []
    const reports: Record<string, string> = {}

    if (user && dependencies.length > 0) {
      const results = await Promise.allSettled(
        dependencies.map((depStepId) => getLatestReport(depStepId, undefined, user.id))
      )

      for (let i = 0; i < dependencies.length; i++) {
        const depStepId = dependencies[i]
        const res = results[i]
        if (res.status === 'fulfilled' && res.value?.content) {
          reports[depStepId] = res.value.content
        }
      }
    }

    const missing = dependencies.filter((depStepId) => !reports[depStepId])
    return { reports, missing }
  }

  // 加载历史对话
  const reloadStepConversations = useCallback(async () => {
    if (!step || !user) return
    try {
      const convos = await getStepConversations(step.id, undefined, user?.id)
      setStepConversations(convos)
    } catch (error) {
      console.error('Failed to load conversation history:', error)
    }
  }, [step, user])

  useEffect(() => {
    reloadStepConversations()
  }, [reloadStepConversations])

  // 初始化对话
  useEffect(() => {
    const initConversation = async () => {
      if (!step || authLoading) return

      const initKey = `${step.id}:${user?.id ?? "guest"}`
      if (initKeyRef.current === initKey) return
      initKeyRef.current = initKey
      setIsInitializing(true)

      try {
        const [{ reports }, existingConversation] = await Promise.all([
          loadPreviousReports(step.id),
          user ? getLatestConversation(step.id, undefined, user?.id) : Promise.resolve(null)
        ])
        setPreviousReports(reports)

        if (existingConversation && existingConversation.status === 'in_progress') {
          setCurrentConversation(existingConversation)

          const msgs: Message[] = [{
            id: "initial",
            role: "assistant",
            content: generateInitialPromptWithReports(step.initialPrompt, reports),
            timestamp: new Date()
          }]
          existingConversation.messages.forEach((m, idx) => {
            msgs.push({
              id: `db-${idx}`,
              role: m.role,
              content: m.content,
              reasoning: m.reasoning,
              timestamp: new Date(m.timestamp)
            })
          })
          setMessages(msgs)

          const userMsgCount = existingConversation.messages.filter(m => m.role === 'user').length
          const totalRounds = step.id === 'P1' ? 8 : step.id === 'IP传记' ? 15 : 6
          const progress = Math.min(Math.round((userMsgCount / totalRounds) * 100), 100)
          setConversationProgress(progress)

          const minRounds = step.id === 'IP传记' ? 10 : 5
          if (userMsgCount >= minRounds && userMsgCount >= Math.floor(totalRounds * 0.8)) {
            setCanGenerateReport(true)
          }

          const existingReport = await getLatestReport(step.id, undefined, user?.id)
          if (existingReport) {
            setGeneratedDoc(existingReport.content)
            setConversationProgress(100)
          }
        } else {
          let newConversation: Conversation | null = null
          if (user) {
            newConversation = await createConversation(step.id, step.title, undefined, user?.id)
            if (newConversation) {
              setCurrentConversation(newConversation)
              upsertStepConversation(newConversation)
              await updateStepProgress(step.id, 'in_progress', undefined, user?.id)
            }
          }

          const initialPrompt = generateInitialPromptWithReports(step.initialPrompt, reports)
          setMessages([{
            id: "initial",
            role: "assistant",
            content: initialPrompt,
            timestamp: new Date()
          }])
        }
      } catch (error) {
        console.error('Failed to initialize conversation:', error)
        setMessages([{
          id: "initial",
          role: "assistant",
          content: generateInitialPromptWithReports(step.initialPrompt, combinedReports),
          timestamp: new Date()
        }])
      } finally {
        setIsInitializing(false)
      }
    }

    initConversation()
  }, [step, user, authLoading])

  // 自动滚动到底部
  useEffect(() => {
    if (isPinnedToBottom) {
      scrollToBottom("auto")
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
    } else if (messages.length > 1) {
      setHasNewMessages(true)
    }
  }, [messages, isPinnedToBottom, scrollToBottom])

  

  // 计时器
  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isLoading) {
      setElapsedTime(0)
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isLoading])

  // 清理
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (saveTimeoutRef.current != null) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [])

  // 发送消息
  const handleSend = async (opts?: { allowCreditsOverride?: boolean; overrideContent?: string }) => {
    if (step.id === 'P8' && !selectedP8AgentId) {
      alert('请先选择一个脚本创作智能体')
      return
    }

    const userContent = (opts?.overrideContent ?? inputValue).trim()
    if (!userContent || isLoading || !currentConversation) return

    let activeConversation = currentConversation
    if (activeConversation.status !== 'in_progress') {
      const ok = await setConversationStatus(activeConversation.id, 'in_progress')
      if (!ok) {
        alert('无法继续该历史对话，请稍后重试')
        return
      }

      activeConversation = { ...activeConversation, status: 'in_progress', updated_at: new Date().toISOString() }
      setCurrentConversation(activeConversation)
      upsertStepConversation(activeConversation)
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userContent,
      timestamp: new Date()
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInputValue("")
    setIsLoading(true)

    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date()
    }
    setMessages(prev => [...prev, assistantMessage])

    try {
      const messagesForApi = newMessages
        .filter(m => m.id !== "initial")
        .map(m => ({ role: m.role, content: m.content }))

      const deviceId = getOrCreateDeviceId()

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(deviceId ? { 'x-device-id': deviceId } : {})
        },
        body: JSON.stringify({
          messages: messagesForApi,
          stepId: step.id,
          ...(step.id === "P8" && selectedP8AgentId ? { agentId: selectedP8AgentId } : {}),
          ...(opts?.allowCreditsOverride ? { allowCreditsOverride: true } : {}),
        })
      })

      if (!response.ok) {
        const errorData = await response.json()

        if (response.status === 402 && errorData.code === 'insufficient_credits') {
          setInsufficientCreditsData({
            required: errorData.required || 1,
            balance: errorData.balance || 0
          })
          setShowInsufficientCredits(true)
          setMessages(prev => prev.filter(m => m.id !== assistantMessageId))
          setIsLoading(false)
          refreshProfile()
          return
        }

        if (response.status === 403 && errorData.code === 'plan_required') {
          setPlanRequiredData({
            requiredPlan: errorData.required_plan || 'basic',
            currentPlan: errorData.current_plan || 'free',
            creditCost: typeof errorData.credit_cost === 'number' ? errorData.credit_cost : undefined,
            balance: typeof errorData.balance === 'number' ? errorData.balance : undefined,
          })
          setShowPlanRequired(true)
          setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId && m.id !== userMessage.id))
          setInputValue(userContent)
          setIsLoading(false)
          return
        }


        throw new Error(errorData.error || '请求失败')
      }

      // 流式读取响应
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      streamContentRef.current = ""
      streamReasoningRef.current = ""
      let sseBuffer = ""
      let hasStartedContent = false

      const flushUpdate = () => {
        setMessages(prev => {
          const updated = [...prev]
          const lastIndex = updated.length - 1
          if (updated[lastIndex]?.id === assistantMessageId) {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: streamContentRef.current,
              reasoning: streamReasoningRef.current
            }
          }
          return updated
        })
      }

      const startRenderLoop = () => {
        const render = () => {
          flushUpdate()
          rafIdRef.current = requestAnimationFrame(render)
        }
        rafIdRef.current = requestAnimationFrame(render)
      }

      const stopRenderLoop = () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
      }

      if (reader) {
        setIsThinking(true)
        startRenderLoop()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const text = decoder.decode(value, { stream: true })
            sseBuffer += text

            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop() || ""

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                if (!data) continue

                try {
                  const json = JSON.parse(data)
                  if (json.reasoning) {
                    streamReasoningRef.current += json.reasoning
                  }
                  if (json.content) {
                    if (!hasStartedContent) {
                      hasStartedContent = true
                      setIsThinking(false)
                    }
                    streamContentRef.current += json.content
                  }
                } catch { /* ignore */ }
              }
            }
          }
        } finally {
          stopRenderLoop()
        }

        flushUpdate()
        setIsThinking(false)
      }

      const fullContent = streamContentRef.current

      // 报告检测
      const reportDetection = detectReportInContent(fullContent, step.id)
      if (reportDetection.isReport && reportDetection.reportContent) {
        // 使用函数式更新，追加新内容到已有报告
        setGeneratedDoc(prevDoc => {
          const newContent = reportDetection.reportContent
          const timestamp = `*报告生成时间: ${new Date().toLocaleString()}*`

          if (prevDoc) {
            // 移除旧的时间戳和分隔线，追加新内容
            const cleanedPrev = prevDoc.replace(/\n\n---\n\*报告生成时间:.*\*$/, '')
            return `${cleanedPrev}\n\n---\n\n**【续】**\n\n${newContent}\n\n---\n${timestamp}`
          } else {
            return `# ${step.output}\n\n${newContent}\n\n---\n${timestamp}`
          }
        })
        setConversationProgress(100)
        setCanGenerateReport(true)
      } else {
        const userMessageCount = newMessages.filter(m => m.role === 'user').length
        const totalRounds = step.id === 'P1' ? 8 : step.id === 'IP传记' ? 15 : 6
        const progress = Math.min(Math.round((userMessageCount / totalRounds) * 100), 95)
        setConversationProgress(progress)

        if (reportDetection.confidence >= 50) {
          setCanGenerateReport(true)
        }
      }

      // 保存到数据库
      const finalMessages = [...newMessages, {
        id: assistantMessageId,
        role: "assistant" as const,
        content: fullContent,
        reasoning: streamReasoningRef.current,
        timestamp: new Date()
      }]
      saveToDatabase(finalMessages)

    } catch (error) {
      console.error('Chat error:', error)
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setMessages(prev => {
        const updated = [...prev]
        const lastIndex = updated.length - 1
        if (updated[lastIndex]?.id === assistantMessageId) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: `抱歉，出现了一些问题：${error instanceof Error ? error.message : '未知错误'}\n\n请检查 API 配置或稍后重试。`
          }
        }
        return updated
      })
    } finally {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setIsLoading(false)
      setIsThinking(false)
    }
  }

  useEffect(() => {
    onboardingSentRef.current = false
  }, [step?.id, onboardingFlag])

  useEffect(() => {
    if (!onboardingFlag) return
    if (!step || !currentConversation) return
    if (isInitializing || isLoading) return
    if (!onboardingContext) return
    if (!["P7", "P8"].includes(step.id)) return
    if (onboardingSentRef.current) return
    if (messages.some((message) => message.role === "user")) return
    const prompt = buildOnboardingPrompt(step.id, onboardingContext)
    if (!prompt) return
    onboardingSentRef.current = true
    void handleSend({ overrideContent: prompt })
  }, [
    onboardingFlag,
    step,
    currentConversation,
    isInitializing,
    isLoading,
    onboardingContext,
    messages,
    handleSend,
  ])

  // 键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 生成报告
  const handleGenerateReport = async () => {
    if (isGeneratingReport) return

    setIsGeneratingReport(true)
    setCanvasStreamContent("")

    try {
      const messagesForApi = messages
        .filter(m => m.id !== "initial")
        .map(m => ({ role: m.role, content: m.content }))

      const deviceId = getOrCreateDeviceId()

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(deviceId ? { 'x-device-id': deviceId } : {})
        },
        body: JSON.stringify({
          messages: messagesForApi,
          stepId: step.id,
          ...(step.id === "P8" && selectedP8AgentId ? { agentId: selectedP8AgentId } : {}),
          mode: 'report',
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '请求失败')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      let sseBuffer = ""
      let fullContent = ""

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value, { stream: true })
          sseBuffer += text

          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              if (!data) continue

              try {
                const json = JSON.parse(data)
                if (json.content) {
                  fullContent += json.content
                  setCanvasStreamContent(fullContent)
                }
              } catch { /* ignore */ }
            }
          }
        }
      }

      if (fullContent) {
        const formattedReport = `# ${step.output}\n\n${fullContent}\n\n---\n*报告生成时间: ${new Date().toLocaleString()}*`
        setGeneratedDoc(formattedReport)
        setCanvasStreamContent(formattedReport)
        setConversationProgress(100)
      }

    } catch (error) {
      console.error('Report generation error:', error)
      setCanvasStreamContent(`报告生成失败：${error instanceof Error ? error.message : '未知错误'}\n\n请稍后重试。`)
    } finally {
      setIsGeneratingReport(false)
    }
  }

  // 保存报告
  const handleSaveReport = async (content: string) => {
    if (!user) return

    try {
      setGeneratedDoc(content)

      await saveReport(
        step.id,
        step.output,
        content,
        currentConversation?.id,
        undefined,
        undefined,
        { generatedAt: new Date().toISOString() }, user?.id
      )

      if (currentConversation) {
        await completeConversation(currentConversation.id)
        upsertStepConversation({ ...currentConversation, status: 'completed', updated_at: new Date().toISOString() })
      }

      await updateStepProgress(step.id, 'completed', undefined, user?.id)

      const savedReports = JSON.parse(localStorage.getItem('ip-reports') || '{}')
      savedReports[step.id] = {
        content,
        timestamp: new Date().toISOString(),
        title: step.output
      }
      localStorage.setItem('ip-reports', JSON.stringify(savedReports))

      setIsSaved(true)
      setIsCanvasOpen(false)

      setTimeout(() => {
        router.push('/dashboard/workflow')
      }, 500)

    } catch (error) {
      console.error('Failed to save report:', error)
      throw error
    }
  }

  // AI优化报告
  const handleOptimizeReport = async (content: string, instruction: string): Promise<string> => {
    try {
      const deviceId = getOrCreateDeviceId()
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(deviceId ? { 'x-device-id': deviceId } : {})
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `请根据以下指示优化这份报告：\n\n优化指示：${instruction}\n\n原报告内容：\n${content}` }
          ],
          stepId: step.id,
          mode: 'optimize'
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const message = (errorData as any)?.error || '优化失败'
        throw new Error(message)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      let sseBuffer = ""
      let optimizedContent = ""

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value, { stream: true })
          sseBuffer += text

          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() || ""

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              if (!data) continue

              try {
                const json = JSON.parse(data)
                if (json.content) {
                  optimizedContent += json.content
                }
              } catch { /* ignore */ }
            }
          }
        }
      }

      return optimizedContent || content
    } catch (error) {
      console.error('Optimize error:', error)
      throw error
    }
  }

  // 下载报告
  const handleDownload = () => {
    if (!generatedDoc) return

    const blob = new Blob([generatedDoc], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${step.output.replace(/[《》]/g, '')}_${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // 复制报告
  const handleCopy = async () => {
    if (!generatedDoc) return

    try {
      await navigator.clipboard.writeText(generatedDoc)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }

  // 保存并返回
  const handleSaveAndContinue = async () => {
    if (!generatedDoc) return

    if (isSaved) {
      router.push('/dashboard/workflow')
      return
    }

    setIsSaved(true)

    try {
      if (user) {
        await saveReport(
          step.id,
          step.output,
          generatedDoc,
          currentConversation?.id,
          undefined,
          undefined,
          { generatedAt: new Date().toISOString() }, user?.id
        )

        if (currentConversation) {
          await completeConversation(currentConversation.id)
          upsertStepConversation({ ...currentConversation, status: 'completed', updated_at: new Date().toISOString() })
        }

        await updateStepProgress(step.id, 'completed', undefined, user?.id)
      }

      const savedReports = JSON.parse(localStorage.getItem('ip-reports') || '{}')
      savedReports[step.id] = {
        content: generatedDoc,
        timestamp: new Date().toISOString(),
        title: step.output
      }
      localStorage.setItem('ip-reports', JSON.stringify(savedReports))

    } catch (error) {
      console.error('Failed to save report:', error)
    }

    setTimeout(() => {
      router.push('/dashboard/workflow')
    }, 1000)
  }

  // 重新开始对话
  const handleRestartConversation = async () => {
    if (!window.confirm('确定要重新开始对话吗？当前对话记录将被保存，但会开始新的对话流程。')) {
      return
    }

    try {
      if (currentConversation) {
        await completeConversation(currentConversation.id)
        upsertStepConversation({ ...currentConversation, status: 'completed', updated_at: new Date().toISOString() })
      }

      const newConversation = await createConversation(step.id, step.title, undefined, user?.id)
      if (newConversation) {
        setCurrentConversation(newConversation)
        upsertStepConversation(newConversation)
      }

      reloadStepConversations()

      setMessages([{
        id: "initial",
        role: "assistant",
        content: generateInitialPromptWithReports(step.initialPrompt, combinedReports),
        timestamp: new Date()
      }])
      setGeneratedDoc(null)
      setConversationProgress(0)
      setCanGenerateReport(false)
      setIsSaved(false)
      setCanvasStreamContent("")
      setInputValue("")

    } catch (error) {
      console.error('Failed to restart conversation:', error)
      alert('重新开始对话失败，请刷新页面重试')
    }
  }

  // 步骤不存在
  if (!step) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <GlassCard className="p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Info size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-semibold dark:text-white text-zinc-900 mb-2">步骤不存在</h2>
          <p className="dark:text-zinc-400 text-zinc-500 mb-6">请返回工作流页面选择正确的步骤</p>
          <Link href="/dashboard/workflow">
            <GlowButton primary>
              <ArrowLeft size={16} />
              返回工作流
            </GlowButton>
          </Link>
        </GlassCard>
      </div>
    )
  }

  // 加载中
  if (isInitializing || authLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <Header breadcrumbs={[
          { label: "首页", href: "/dashboard" },
          { label: "内容工坊", href: "/dashboard/workflow" },
          { label: step?.title || "加载中..." }
        ]} />
        <div className="flex-1 flex items-center justify-center">
          <GlassCard className="p-8 text-center">
            <Loader2 size={32} className="animate-spin text-purple-400 mx-auto mb-4" />
            <h2 className="text-lg font-medium dark:text-white text-zinc-900 mb-2">正在加载对话...</h2>
            <p className="text-sm dark:text-zinc-400 text-zinc-500">
              {user ? "正在从云端恢复你的对话记录" : "正在初始化..."}
            </p>
          </GlassCard>
        </div>
      </div>
    )
  }

  const colors = colorVariants[step.phaseColor]
  const StepIcon = workflowIconMap[step.icon]

  return (
    <div className="h-[calc(100dvh-(4.5rem+var(--safe-area-bottom)))] md:h-[100dvh] flex flex-col overflow-hidden">
      <Header breadcrumbs={[
        { label: "首页", href: "/dashboard" },
        { label: "内容工坊", href: "/dashboard/workflow" },
        { label: step.title }
      ]} />

      <main className="flex-1 flex overflow-hidden">
        {/* 左侧：对话区域 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* 步骤信息条 */}
          <div className={`shrink-0 px-4 sm:px-6 py-2.5 sm:py-3 ${colors.light} border-b border-white/5`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                  <StepIcon size={16} className={colors.text} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                      {step.phaseName} · {step.id}
                    </span>
                  </div>
                  <h1 className="text-sm sm:text-base font-medium dark:text-white text-zinc-900">{step.title}</h1>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {user && (
                  <div className="flex items-center gap-1.5">
                    {syncStatus === 'syncing' && (
                      <>
                        <Loader2 size={12} className="animate-spin text-blue-400" />
                        <span className="hidden sm:inline text-xs text-blue-400">同步中</span>
                      </>
                    )}
                    {syncStatus === 'synced' && (
                      <>
                        <Database size={12} className="text-emerald-400" />
                        <span className="hidden sm:inline text-xs text-emerald-400">已同步</span>
                      </>
                    )}
                    {syncStatus === 'error' && (
                      <>
                        <Database size={12} className="text-red-400" />
                        <span className="hidden sm:inline text-xs text-red-400">同步失败</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 消息列表 */}
          <div ref={messagesContainerRef} onScroll={updatePinnedState} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 relative">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                  message.role === "assistant"
                    ? `${colors.bg} ${colors.border} border`
                    : "dark:bg-zinc-800 bg-zinc-200 border dark:border-white/10 border-black/10"
                }`}>
                  {message.role === "assistant" ? (
                    <Bot size={16} className={colors.text} />
                  ) : (
                    <UserCircle size={16} className="text-zinc-400" />
                  )}
                </div>

                <div className={`max-w-[92%] sm:max-w-[80%] ${message.role === "user" ? "text-right" : ""}`}>
                  {message.role === "assistant" && message.reasoning && step.id !== 'IP传记' && (
                    <details className="mb-2 group" open>
                      <summary className="cursor-pointer text-xs sm:text-sm dark:text-amber-500/70 text-amber-600 flex items-center gap-1 py-1">
                        <Lightbulb size={14} />
                        <span>思考过程</span>
                        <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="mt-2 px-3 py-2 dark:bg-amber-500/5 bg-amber-50 border dark:border-amber-500/20 border-amber-200 rounded-lg">
                        <p className="text-xs sm:text-sm dark:text-amber-200/60 text-amber-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                          {message.reasoning}
                        </p>
                      </div>
                    </details>
                  )}
                  <div className={`inline-block px-4 py-3 rounded-2xl ${
                    message.role === "assistant"
                      ? "dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/5 border-black/5 text-left"
                      : `${colors.bg} ${colors.border} border`
                  }`}>
                    <p className="text-sm sm:text-base dark:text-zinc-300 text-zinc-700 whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 px-2">
                    <p className="text-xs text-zinc-600">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    {message.role === "assistant" && message.content && (
                      <>
                        <button
                          onClick={() => {
                            setGeneratedDoc(message.content)
                            setCanvasStreamContent(message.content)
                            setIsCanvasOpen(true)
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md dark:bg-purple-500/10 bg-purple-50 dark:text-purple-400 text-purple-600 hover:bg-purple-100 transition-colors border dark:border-purple-500/20 border-purple-200"
                          title="发送到画布（覆盖）"
                        >
                          <FileText size={12} />
                          <span className="hidden sm:inline">发送到画布</span>
                        </button>
                        {generatedDoc && (
                          <button
                            onClick={() => {
                              const timestamp = `*追加时间: ${new Date().toLocaleString()}*`
                              const appendedContent = `${generatedDoc}\n\n---\n\n**【续】**\n\n${message.content}\n\n---\n${timestamp}`
                              setGeneratedDoc(appendedContent)
                              setCanvasStreamContent(appendedContent)
                              setIsCanvasOpen(true)
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md dark:bg-emerald-500/10 bg-emerald-50 dark:text-emerald-400 text-emerald-600 hover:bg-emerald-100 transition-colors border dark:border-emerald-500/20 border-emerald-200"
                            title="追加到画布"
                          >
                            <Layers size={12} />
                            <span className="hidden sm:inline">+追加</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && !messages[messages.length - 1]?.content && (
              <div className="flex gap-3">
                <div className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center`}>
                  <Bot size={16} className={colors.text} />
                </div>
                <div className={`rounded-2xl px-4 py-3 ${
                  isThinking
                    ? "bg-amber-500/5 border border-amber-500/20"
                    : "dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/5 border-black/5"
                }`}>
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className={`animate-spin ${isThinking ? "text-amber-500" : "text-zinc-500"}`} />
                    <span className={`text-sm sm:text-base ${isThinking ? "text-amber-400" : "text-zinc-500"}`}>
                      {isThinking ? "正在深度思考..." : "正在生成回复..."}
                    </span>
                    <span className="text-xs sm:text-sm text-zinc-600 ml-2">
                      {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isPinnedToBottom && hasNewMessages && (
              <div className="sticky bottom-4 flex justify-end pointer-events-none">
                <button
                  onClick={() => scrollToBottom("smooth")}
                  className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full text-sm dark:bg-zinc-900/80 bg-white/90 border dark:border-white/10 border-black/10 dark:text-white text-zinc-900 shadow-lg"
                  title="Jump to latest"
                >
                  <ArrowDown size={16} className="text-purple-400" />
                  <span>New messages</span>
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div className="shrink-0 p-3 sm:p-4 border-t border-white/5 dark:bg-zinc-950/90 bg-white/90 backdrop-blur-sm">
            {step.id === "P8" && (
              <div className="mb-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <span className="text-xs dark:text-zinc-400 text-zinc-600 whitespace-nowrap">选择智能体</span>
                  <select
                    value={selectedP8AgentId ?? ""}
                    onChange={(e) => setSelectedP8AgentId(e.target.value ? e.target.value : null)}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 rounded-lg border dark:bg-zinc-900/50 bg-white dark:border-white/10 border-black/10 text-sm dark:text-white text-zinc-900 focus:outline-none"
                  >
                    <option value="">请选择（P8 必选）</option>
                    {p8Agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedP8Agent && (
                  <div className="mt-1 text-xs dark:text-zinc-600 text-zinc-500">{selectedP8Agent.description}</div>
                )}
              </div>
            )}
            <div className="flex gap-2 sm:gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!currentConversation || isLoading || (step.id === "P8" && !selectedP8AgentId)}
                  placeholder={currentConversation && currentConversation.status !== "in_progress" ? "继续此历史对话（发送时会自动恢复为可写）" : "输入你的回答..."}
                  rows={1}
                  className="w-full px-4 py-3 dark:bg-zinc-900/50 bg-white border dark:border-white/10 border-black/10 rounded-xl text-sm sm:text-base dark:text-white text-zinc-900 dark:placeholder:text-zinc-600 placeholder:text-zinc-400 focus:outline-none dark:focus:border-purple-500/50 focus:border-purple-400 resize-none"
                  style={{ minHeight: "48px", maxHeight: "120px" }}
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isLoading || !currentConversation || (step.id === "P8" && !selectedP8AgentId)}
                className={`px-4 rounded-xl transition-all ${
                  inputValue.trim() && !isLoading
                    ? `${colors.bg} ${colors.border} border ${colors.text} hover:bg-opacity-80`
                    : "dark:bg-zinc-900/30 bg-zinc-100 border dark:border-white/5 border-black/5 dark:text-zinc-600 text-zinc-400 cursor-not-allowed"
                }`}
              >
                <Send size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-xs dark:text-zinc-600 text-zinc-400 hidden sm:inline">Enter 发送 · Shift+Enter 换行</span>
              <span className="text-xs dark:text-zinc-600 text-zinc-400 hidden sm:inline">预计时间: {step.estimatedTime}</span>
            </div>
          </div>
        </div>

        {/* 右侧：信息面板 */}
        <div className="w-80 border-l dark:border-white/5 border-black/5 p-4 space-y-4 hidden lg:block overflow-y-auto">
          {/* 积分余额低提醒 */}
          {profile && !profile.credits_unlimited && (
            <CreditsLowWarning balance={profile.credits_balance || 0} />
          )}

          {/* 报告面板 */}
          <GlassCard
            glow={!!generatedDoc}
            className={`p-4 ${generatedDoc
              ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent'
              : 'border-zinc-500/20 bg-gradient-to-br from-zinc-500/5 to-transparent'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${generatedDoc
                ? 'bg-emerald-500/20 border border-emerald-500/30'
                : 'bg-zinc-500/20 border border-zinc-500/30'
              }`}>
                {generatedDoc ? (
                  <CheckCircle2 size={18} className="text-emerald-400" />
                ) : (
                  <FileText size={18} className="text-zinc-400" />
                )}
              </div>
              <div>
                <h3 className="text-base font-medium dark:text-white text-zinc-900">
                  {generatedDoc ? '报告已就绪' : step.output}
                </h3>
                <p className={`text-xs ${generatedDoc ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {generatedDoc ? '自动检测到报告内容' : '等待AI生成报告...'}
                </p>
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/5 border-black/5 min-h-[80px] max-h-32 overflow-hidden relative">
              {generatedDoc ? (
                <>
                  <p className="text-xs dark:text-zinc-400 text-zinc-600 line-clamp-4 whitespace-pre-wrap">
                    {generatedDoc.slice(0, 300)}...
                  </p>
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t dark:from-zinc-900/90 from-zinc-100/90 to-transparent"></div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-2">
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">对话进行中，报告将自动生成</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  if (generatedDoc) {
                    setCanvasStreamContent(generatedDoc)
                  }
                  setIsCanvasOpen(true)
                }}
                disabled={!generatedDoc}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${generatedDoc
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 shadow-lg shadow-emerald-500/20'
                  : 'bg-zinc-700/30 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <Eye size={16} />
                在画布中查看
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!generatedDoc}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${generatedDoc
                    ? 'dark:bg-zinc-800/50 bg-zinc-200 dark:border-white/10 border-black/10 text-zinc-400 hover:text-white'
                    : 'bg-zinc-800/20 border-zinc-700/30 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {isCopied ? '已复制' : '复制'}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!generatedDoc}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${generatedDoc
                    ? 'dark:bg-zinc-800/50 bg-zinc-200 dark:border-white/10 border-black/10 text-zinc-400 hover:text-white'
                    : 'bg-zinc-800/20 border-zinc-700/30 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  <Download size={14} />
                  下载
                </button>
              </div>
              <button
                onClick={handleSaveAndContinue}
                disabled={isSaved || !generatedDoc}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${generatedDoc
                  ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50'
                  : 'bg-zinc-800/20 border border-zinc-700/30 text-zinc-600 cursor-not-allowed'
                }`}
              >
                {isSaved ? (
                  <>
                    <Check size={14} />
                    已保存，正在跳转...
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    保存并返回工作流
                  </>
                )}
              </button>
            </div>
          </GlassCard>

          {/* 升级引导 */}
          {generatedDoc && profile && showUpgradePrompt && (
            <UpgradePromptAfterGeneration
              currentPlan={(profile.plan || 'free') as "free" | "basic" | "pro" | "vip"}
              currentStepId={step.id}
              onDismiss={() => setShowUpgradePrompt(false)}
            />
          )}

          {/* 步骤信息 */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info size={16} className={colors.text} />
              <h3 className="text-base font-medium dark:text-white text-zinc-900">步骤说明</h3>
            </div>
            <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-4 leading-relaxed">{step.description}</p>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText size={14} className="text-zinc-500" />
                <span className="text-zinc-500">输出:</span>
                <span className={colors.text}>{step.output}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-zinc-500" />
                <span className="text-zinc-500">预计:</span>
                <span className="text-zinc-400">{step.estimatedTime}</span>
              </div>
            </div>
          </GlassCard>

          {/* 功能特性 */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-amber-400" />
              <h3 className="text-base font-medium dark:text-white text-zinc-900">包含功能</h3>
            </div>
            <div className="space-y-2">
              {step.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-sm text-zinc-400">{feature}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* 前置报告状态 */}
          {(stepDependencies[step.id]?.length > 0) && (
            <GlassCard className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={16} className="text-blue-400" />
                <h3 className="text-base font-medium dark:text-white text-zinc-900">前置报告</h3>
              </div>
              <div className="space-y-2">
                {stepDependencies[step.id].map((depStepId) => {
                  const isLoaded = Boolean(combinedReports[depStepId])
                  const title = reportTitles[depStepId] || depStepId
                  return (
                    <div key={depStepId} className="flex items-center gap-2">
                      {isLoaded ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : (
                        <AlertCircle size={14} className="text-amber-500" />
                      )}
                      <span className={`text-sm ${isLoaded ? "text-emerald-400" : "text-amber-400"}`}>
                        {title}
                      </span>
                      <span className="text-xs text-zinc-600 ml-auto font-semibold">
                        {isLoaded ? "已有" : "缺失"}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className={`text-xs ${derivedMissingReports.length > 0 ? "text-amber-500/80" : "text-emerald-500/80"}`}>
                {derivedMissingReports.length > 0
                  ? `提示：${derivedMissingReports.length} 个前置报告缺失，建议完成相关步骤`
                  : "✓ 所有前置报告已自动加载，可继续生成概念"}
              </p>
            </GlassCard>
          )}

          {/* 生成报告按钮 */}
          {canGenerateReport && !generatedDoc && (
            <GlassCard glow className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-amber-400" />
                <h3 className="text-base font-medium dark:text-white text-zinc-900">信息收集完成</h3>
              </div>
              <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-4">
                已收集足够信息，点击下方按钮在画布中生成报告
              </p>
              <button
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isGeneratingReport ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    画布生成中...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    打开画布生成报告
                  </>
                )}
              </button>
            </GlassCard>
          )}

          {/* 历史对话 */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Database size={16} className="text-purple-400" />
              <h3 className="text-base font-medium dark:text-white text-zinc-900">历史对话</h3>
            </div>
            {stepConversations.length === 0 ? (
              <p className="text-sm text-zinc-500">暂无历史对话</p>
            ) : (
              <div className="space-y-2">
                {stepConversations.slice(0, 5).map((c) => {
                  const statusLabel = c.status === 'in_progress' ? '进行中' : c.status === 'completed' ? '已完成' : '已归档'
                  const statusClass = c.status === 'in_progress'
                    ? 'text-emerald-400'
                    : c.status === 'completed'
                      ? 'text-blue-400'
                      : 'text-zinc-500'
                  const updated = formatRelativeTime(c.updated_at || c.created_at)
                  const msgCount = Array.isArray(c.messages) ? c.messages.length : 0
                  const topic = deriveConversationTopic(c, step?.title || "")
                  const isCurrentConversation = currentConversation?.id === c.id

                  return (
                    <button
                      key={c.id}
                      onClick={async () => {
                        if (isCurrentConversation) return

                        // 加载选中的历史对话
                        setCurrentConversation(c)

                        // 恢复消息列表
                        const msgs: Message[] = [{
                          id: "initial",
                          role: "assistant",
                          content: generateInitialPromptWithReports(step.initialPrompt, previousReports),
                          timestamp: new Date()
                        }]
                        c.messages.forEach((m, idx) => {
                          msgs.push({
                            id: `db-${idx}`,
                            role: m.role,
                            content: m.content,
                            reasoning: m.reasoning,
                            timestamp: new Date(m.timestamp)
                          })
                        })
                        setMessages(msgs)

                        // 更新进度
                        const userMsgCount = c.messages.filter(m => m.role === 'user').length
                        const totalRounds = step.id === 'P1' ? 8 : step.id === 'IP传记' ? 15 : 6
                        const progress = Math.min(Math.round((userMsgCount / totalRounds) * 100), 100)
                        setConversationProgress(progress)

                        // 检查是否可以生成报告
                        const minRounds = step.id === 'IP传记' ? 10 : 5
                        if (userMsgCount >= minRounds && userMsgCount >= Math.floor(totalRounds * 0.8)) {
                          setCanGenerateReport(true)
                        } else {
                          setCanGenerateReport(false)
                        }

                        // 尝试加载该对话关联的报告
                        const fallbackReportFromMessages = (() => {
                          const reversed = Array.isArray(c.messages) ? [...c.messages].reverse() : []
                          for (const m of reversed) {
                            if (m.role !== 'assistant') continue
                            const content = typeof m.content === 'string' ? m.content : ''
                            if (!content) continue
                            const detection = detectReportInContent(content, step.id)
                            if (detection.isReport && detection.reportContent) {
                              const trimmed = detection.reportContent.trim()
                              if (trimmed.startsWith('#')) return trimmed
                              return `# ${step.output}\n\n${trimmed}`
                            }
                          }
                          return null
                        })()

                        try {
                          const existingReport = await getLatestReportByConversation(c.id, user?.id)
                          const reportContent = existingReport?.content || fallbackReportFromMessages

                          if (reportContent) {
                            setGeneratedDoc(reportContent)
                            setCanvasStreamContent(reportContent)
                            setConversationProgress(100)
                            setCanGenerateReport(true)
                          } else {
                            setGeneratedDoc(null)
                            setCanvasStreamContent("")
                          }
                        } catch {
                          setGeneratedDoc(fallbackReportFromMessages)
                          setCanvasStreamContent(fallbackReportFromMessages || "")
                        }

                        // Reset other state
                        setIsSaved(false)
                      }}
                      disabled={isLoading}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                        isCurrentConversation
                          ? 'dark:bg-purple-500/10 bg-purple-50 border-purple-500/30 ring-1 ring-purple-500/20'
                          : 'dark:bg-zinc-900/30 bg-zinc-100 border-black/5 dark:border-white/5 hover:dark:bg-zinc-800/50 hover:bg-zinc-200 cursor-pointer'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium dark:text-white text-zinc-900 truncate">{topic}</span>
                        <span className={`text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {updated} · {msgCount} 条消息
                        {isCurrentConversation && <span className="ml-2 text-purple-400">当前</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </GlassCard>

          {/* 重新开始对话按钮 */}
          {messages.length > 1 && (
            <button
              onClick={handleRestartConversation}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border dark:border-amber-500/30 border-amber-400/30 dark:bg-amber-500/5 bg-amber-50 text-amber-500 text-sm dark:hover:bg-amber-500/10 hover:bg-amber-100 transition-colors"
            >
              <RefreshCw size={14} />
              重新开始对话
            </button>
          )}

          {/* 返回按钮 */}
          <Link href="/dashboard/workflow">
            <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border dark:border-white/10 border-black/10 text-zinc-500 text-sm dark:hover:text-white hover:text-zinc-900 dark:hover:border-white/20 hover:border-black/20 transition-colors">
              <ArrowLeft size={14} />
              返回工作流
            </button>
          </Link>
        </div>
      </main>

      {/* 报告画布模式 */}
      <ReportCanvas
        isOpen={isCanvasOpen}
        onClose={() => setIsCanvasOpen(false)}
        title={step.output}
        stepId={step.id}
        initialContent={generatedDoc || ""}
        isGenerating={isGeneratingReport}
        streamingContent={canvasStreamContent}
        onSave={handleSaveReport}
        onRegenerate={handleGenerateReport}
        onOptimize={handleOptimizeReport}
      />

      {/* 积分不足弹窗 */}
      {showInsufficientCredits && insufficientCreditsData && (
        <InsufficientCreditsModal
          required={insufficientCreditsData.required}
          balance={insufficientCreditsData.balance}
          onClose={() => {
            setShowInsufficientCredits(false)
            setInsufficientCreditsData(null)
          }}
        />
      )}

      {/* 套餐不足弹窗 */}
      {showPlanRequired && planRequiredData && (
        <PlanRequiredModal
          requiredPlan={planRequiredData.requiredPlan}
          currentPlan={planRequiredData.currentPlan}
          stepTitle={step.title}
          creditCost={planRequiredData.creditCost}
          balance={planRequiredData.balance}
          onUseCredits={planRequiredData.creditCost != null ? () => {
            setShowPlanRequired(false)
            setPlanRequiredData(null)
            void handleSend({ allowCreditsOverride: true })
          } : undefined}
          onClose={() => {
            setShowPlanRequired(false)
            setPlanRequiredData(null)
          }}
        />
      )}
    </div>
  )
}
