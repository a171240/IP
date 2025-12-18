"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ArrowDown, FolderOpen, Loader2, Paperclip, Search, Send, X } from "lucide-react"

import { GlassCard, GlowButton } from "@/components/ui/obsidian"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InsufficientCreditsModal, PlanRequiredModal } from "@/components/ui/upgrade-prompt"
import { getReport, getUserReportList, type ReportListItem } from "@/lib/supabase"
import { getOrCreateDeviceId } from "@/lib/device"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  reasoning?: string
}

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function readTextFile(file: File): Promise<string> {
  const maxBytes = 2 * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error("文件过大，请控制在 2MB 以内")
  }
  return await file.text()
}

export default function AgentChatClient({
  agentId,
  agentName,
  agentDescription,
  promptFile,
}: {
  agentId: string
  agentName: string
  agentDescription: string
  promptFile?: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditsHint, setCreditsHint] = useState<string | null>(null)
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false)
  const [insufficientCreditsData, setInsufficientCreditsData] = useState<{ required: number; balance: number } | null>(null)
  const [showPlanRequired, setShowPlanRequired] = useState(false)
  const [planRequiredData, setPlanRequiredData] = useState<{ requiredPlan: "free" | "basic" | "pro" | "vip"; currentPlan: "free" | "basic" | "pro" | "vip"; creditCost?: number; balance?: number } | null>(null)
  const [showReasoning, setShowReasoning] = useState(true)
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [reportQuery, setReportQuery] = useState("")
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [reportLoadingId, setReportLoadingId] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)

  const promptFileLabel = useMemo(() => {
    if (!promptFile) return null
    const last = promptFile.split("/").pop() || promptFile
    return last
  }, [promptFile])

  const updatePinnedState = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const threshold = 80
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom <= threshold
    setIsPinnedToBottom(atBottom)
    if (atBottom) setHasNewMessages(false)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => updatePinnedState()
    el.addEventListener("scroll", onScroll, { passive: true })
    updatePinnedState()
    return () => el.removeEventListener("scroll", onScroll)
  }, [updatePinnedState])

  useEffect(() => {
    if (isPinnedToBottom) {
      scrollToBottom("auto")
    } else if (messages.length > 0) {
      setHasNewMessages(true)
    }
  }, [messages, isPinnedToBottom, scrollToBottom])

  const canSend = useMemo(() => !isLoading && input.trim().length > 0, [isLoading, input])

  const send = useCallback(async (opts?: { allowCreditsOverride?: boolean }) => {
    const content = input.trim()
    if (!content || isLoading) return

    setError(null)
    setCreditsHint(null)

    const userMsg: ChatMessage = { id: uuid(), role: "user", content }
    const assistantId = uuid()
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "" }

    setInput("")
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsLoading(true)

    try {
      const deviceId = getOrCreateDeviceId()
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(deviceId ? { "x-device-id": deviceId } : {}) },
        body: JSON.stringify({
          ...(opts?.allowCreditsOverride ? { allowCreditsOverride: true } : {}),
          stepId: `agent:${agentId}`,
          agentId,
          promptFile,
          context: attachment
            ? {
                inline_reports: [
                  {
                    step_id: "attachment",
                    title: `附件：${attachment.name}`,
                    content: attachment.content,
                  },
                ],
              }
            : undefined,
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      if (!resp.ok || !resp.body) {
        const payload = await resp.json().catch(() => null)

        if (resp.status === 402 && payload?.code === 'insufficient_credits') {
          setInsufficientCreditsData({ required: payload?.required || 1, balance: payload?.balance || 0 })
          setShowInsufficientCredits(true)
          setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id))
          setInput(content)
          setIsLoading(false)
          return
        }

        if (resp.status === 403 && payload?.code === 'plan_required') {
          setPlanRequiredData({
            requiredPlan: payload?.required_plan || 'basic',
            currentPlan: payload?.current_plan || 'free',
            creditCost: typeof payload?.credit_cost === 'number' ? payload.credit_cost : undefined,
            balance: typeof payload?.balance === 'number' ? payload.balance : undefined,
          })
          setShowPlanRequired(true)
          setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id))
          setInput(content)
          setIsLoading(false)
          return
        }

        throw new Error(payload?.error || `?????${resp.status}?`)
      }

      const remaining = resp.headers.get("X-Credits-Remaining")
      const cost = resp.headers.get("X-Credits-Cost")
      if (remaining || cost) {
        setCreditsHint(`本次消耗：${cost || "?"} 积分 · 剩余：${remaining || "?"}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        for (const part of parts) {
          const line = part
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"))

          if (!line) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") {
            break
          }

          try {
            const json = JSON.parse(data) as { content?: string; reasoning?: string }

            if (json.reasoning) {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, reasoning: (m.reasoning || "") + json.reasoning } : m))
              )
            }

            if (json.content) {
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + json.content } : m)))
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "请求失败"
      setError(msg)
      setMessages((prev) => prev.filter((m) => m.id !== assistantId))
    } finally {
      setIsLoading(false)
    }
  }, [agentId, attachment, input, isLoading, messages, promptFile])

  const openImport = async () => {
    setImportOpen(true)
    if (reports.length > 0) return
    try {
      setReportLoading(true)
      setReportError(null)
      const list = await getUserReportList()
      setReports(list)
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "文档加载失败")
    } finally {
      setReportLoading(false)
    }
  }

  const filteredReports = useMemo(() => {
    const q = reportQuery.trim().toLowerCase()
    if (!q) return reports
    return reports.filter((r) => {
      const t = (r.title || "").toLowerCase()
      const s = (r.summary || "").toLowerCase()
      const step = (r.step_id || "").toLowerCase()
      return t.includes(q) || s.includes(q) || step.includes(q)
    })
  }, [reportQuery, reports])

  return (
    <main className="p-6 lg:p-8">
      <div className="max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-medium dark:text-white text-zinc-900 tracking-tight">{agentName}</h1>
          <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-2">{agentDescription}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              <input type="checkbox" checked={showReasoning} onChange={(e) => setShowReasoning(e.target.checked)} />
              {"展示思考过程"}
            </label>
            {promptFileLabel ? (
              <span className="text-xs text-zinc-500">{"当前提示词："}{promptFileLabel}</span>
            ) : null}
            <span className="text-xs text-zinc-500">{"调用将消耗积分"}</span>
          </div>
        </div>

        {creditsHint ? (
          <GlassCard className="p-3 mb-3">
            <div className="text-xs dark:text-zinc-300 text-zinc-600">{creditsHint}</div>
          </GlassCard>
        ) : null}

        {error ? (
          <GlassCard className="p-3 mb-3 border border-red-500/30">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle size={16} />
              <span className="break-all">{error}</span>
            </div>
          </GlassCard>
        ) : null}

        <GlassCard className="p-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm dark:text-white text-zinc-900 font-medium">
              <Paperclip size={16} />
              {"附加资料（可选）"}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const content = await readTextFile(file)
                    setAttachment({ name: file.name, content })
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "附件读取失败")
                  } finally {
                    e.target.value = ""
                  }
                }}
              />

              <GlowButton className="text-xs" onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={14} />
                {"上传文件"}
              </GlowButton>

              <GlowButton className="text-xs" onClick={openImport}>
                <FolderOpen size={14} />
                {"从文档导入"}
              </GlowButton>
            </div>
          </div>

          {attachment ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500 truncate">{"已附加："}{attachment.name}</div>
              <button
                className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
                onClick={() => setAttachment(null)}
              >
                <X className="size-3" />
                {"移除"}
              </button>
            </div>
          ) : (
            <div className="mt-2 text-xs text-zinc-500">
              {"支持 txt / md；也可从「报告」页面导入已生成的文档内容。"}
            </div>
          )}

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{"从文档导入"}</DialogTitle>
                <DialogDescription>
                  {"选择一个已生成的报告，作为附加资料发送给智能体。"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={reportQuery}
                    onChange={(e) => setReportQuery(e.target.value)}
                    placeholder="搜索文档标题..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 text-sm"
                  />
                </div>

                {reportLoading ? (
                  <div className="text-sm text-zinc-500 flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {"正在加载..."}
                  </div>
                ) : null}

                {reportError ? <div className="text-sm text-red-400">{reportError}</div> : null}

                <div className="max-h-[55vh] overflow-y-auto space-y-2">
                  {filteredReports.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                      disabled={!!reportLoadingId}
                      onClick={async () => {
                        try {
                          setReportLoadingId(r.id)
                          setReportError(null)
                          const full = await getReport(r.id)
                          if (!full?.content) {
                            setReportError("文档内容为空")
                            return
                          }
                          const name = (full.title || r.title || "报告").trim()
                          setAttachment({ name: `${name}.md`, content: full.content })
                          setImportOpen(false)
                        } catch (e) {
                          setReportError(e instanceof Error ? e.message : "导入失败")
                        } finally {
                          setReportLoadingId(null)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium dark:text-white text-zinc-900 truncate">{r.title || "无标题"}</div>
                          {r.summary ? <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{r.summary}</div> : null}
                        </div>
                        {reportLoadingId === r.id ? <Loader2 className="size-4 animate-spin text-zinc-400" /> : null}
                      </div>
                    </button>
                  ))}

                  {!reportLoading && !reportError && filteredReports.length === 0 ? (
                    <div className="text-sm text-zinc-500">{"没有找到文档"}</div>
                  ) : null}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </GlassCard>

        <GlassCard className="p-4">
          <div ref={containerRef} className="h-[65vh] overflow-y-auto pr-2 space-y-3" onScroll={updatePinnedState}>
            {messages.length === 0 ? (
              <div className="text-sm dark:text-zinc-400 text-zinc-500 space-y-2">
                <div>
                  {"可以直接描述你的背景、目标、限制条件；如果信息不够，我会先问你 3 个关键问题再输出。"}
                </div>
                <div className="text-xs text-zinc-500">{"示例："}</div>
                <ul className="text-xs text-zinc-500 list-disc pl-5 space-y-1">
                  <li>{"“我是做XX行业的门店，目标是XX，现状是XX，请给我一份可执行方案。”"}</li>
                  <li>{"“这是逐字稿/文案（已上传或粘贴），请按该智能体的流程输出。”"}</li>
                  <li>{"“请按表格输出：步骤、话术、注意事项、风险点。”"}</li>
                </ul>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[92%] rounded-2xl px-4 py-2 bg-purple-500/15 border border-purple-500/30 text-zinc-100"
                        : "max-w-[92%] rounded-2xl px-4 py-2 dark:bg-zinc-900/60 bg-white/80 border dark:border-white/10 border-black/10 dark:text-zinc-100 text-zinc-900"
                    }
                  >
                    {m.role === "assistant" && showReasoning && m.reasoning ? (
                      <details className="mb-2" open>
                        <summary className="cursor-pointer text-xs text-amber-500/80">{"思考过程"}</summary>
                        <div className="mt-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5">
                          <div className="text-xs text-amber-200/70 whitespace-pre-wrap">{m.reasoning}</div>
                        </div>
                      </details>
                    ) : null}
                    {isLoading && m.role === "assistant" && !m.content && !m.reasoning ? (
  <div className="flex items-center gap-2 text-sm text-zinc-500">
    <Loader2 className="size-4 animate-spin" />
    {"思考中..."}
  </div>
) : null}
<div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {!isPinnedToBottom && hasNewMessages ? (
            <div className="mt-3">
              <GlowButton className="text-xs" onClick={() => scrollToBottom("smooth")}>
                <ArrowDown size={14} />
                {"新消息"}
              </GlowButton>
            </div>
          ) : null}

          <div className="mt-4 flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="输入你的问题..."
              className="flex-1 resize-none w-full px-4 py-3 rounded-xl dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 dark:text-white text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <GlowButton disabled={!canSend} onClick={send} className="h-[46px]">
              <Send size={16} />
              {"发送"}
            </GlowButton>
          </div>
          <div className="mt-2 text-xs dark:text-zinc-500 text-zinc-500">Ctrl/⌘ + Enter {"发送"}</div>
        </GlassCard>
      </div>

      {showInsufficientCredits && insufficientCreditsData ? (
        <InsufficientCreditsModal
          required={insufficientCreditsData.required}
          balance={insufficientCreditsData.balance}
          onClose={() => {
            setShowInsufficientCredits(false)
            setInsufficientCreditsData(null)
          }}
        />
      ) : null}

      {showPlanRequired && planRequiredData ? (
        <PlanRequiredModal
          requiredPlan={planRequiredData.requiredPlan}
          currentPlan={planRequiredData.currentPlan}
          stepTitle={agentName}
          creditCost={planRequiredData.creditCost}
          balance={planRequiredData.balance}
          onUseCredits={planRequiredData.creditCost != null ? () => {
            setShowPlanRequired(false)
            setPlanRequiredData(null)
            void send({ allowCreditsOverride: true })
          } : undefined}
          onClose={() => {
            setShowPlanRequired(false)
            setPlanRequiredData(null)
          }}
        />
      ) : null}

    </main>
  )
}

