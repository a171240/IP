"use client"

import { useEffect, useMemo, useState } from "react"

import { Download, FileText, Loader2, Play, XCircle } from "lucide-react"

import { GlowButton } from "@/components/ui/obsidian"
import { InsufficientCreditsModal } from "@/components/ui/upgrade-prompt"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { AgentConfig } from "@/lib/agents/config"
import { getOrCreateDeviceId } from "@/lib/device"

type PromptFileEntry = {
  relativePath: string
  fileName: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      msg = body?.error || msg
    } catch {}
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export function PromptPreviewSheet({
  open,
  onOpenChange,
  agent,
  onRunAgent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  agent: AgentConfig | null
  onRunAgent: (agentId: string, promptFile?: string) => void
}) {
  const [files, setFiles] = useState<PromptFileEntry[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [previewTruncated, setPreviewTruncated] = useState(false)
  const [downloadCost, setDownloadCost] = useState<number | null>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [showInsufficientCredits, setShowInsufficientCredits] = useState(false)
  const [insufficientCreditsData, setInsufficientCreditsData] = useState<{ required: number; balance: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const promptTarget = useMemo(() => {
    if (!agent) return null
    if (agent.promptFile) return { kind: "file" as const, value: agent.promptFile }
    if (agent.isCollection && agent.collectionPath) return { kind: "dir" as const, value: agent.collectionPath }
    return null
  }, [agent])

  useEffect(() => {
    if (!open) return
    setFiles(null)
    setSelectedFile(null)
    setContent("")
    setPreviewTruncated(false)
    setDownloadCost(null)
    setPlan(null)
    setError(null)
  }, [open, agent?.id])

  useEffect(() => {
    if (!open || !promptTarget) return

    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        if (promptTarget.kind === "file") {
          setSelectedFile(promptTarget.value)
          const data = await fetchJson<{ file: string; content: string; truncated?: boolean; download_cost?: number; plan?: string }>(
            `/api/prompts?file=${encodeURIComponent(promptTarget.value)}`
          )
          setContent(data.content || "")
          setPreviewTruncated(Boolean(data.truncated))
          setDownloadCost(typeof data.download_cost === "number" ? data.download_cost : null)
          setPlan(typeof data.plan === "string" ? data.plan : null)
          return
        }

        const data = await fetchJson<{ dir: string; files: PromptFileEntry[] }>(
          `/api/prompts?dir=${encodeURIComponent(promptTarget.value)}`
        )
        setFiles(data.files || [])
        const first = data.files?.[0]?.relativePath
        if (first) setSelectedFile(first)
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [open, promptTarget])

  useEffect(() => {
    if (!open || !selectedFile) return
    if (promptTarget?.kind === "file") return

    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchJson<{ file: string; content: string; truncated?: boolean; download_cost?: number; plan?: string }>(
          `/api/prompts?file=${encodeURIComponent(selectedFile)}`
        )
        setContent(data.content || "")
        setPreviewTruncated(Boolean(data.truncated))
        setDownloadCost(typeof data.download_cost === "number" ? data.download_cost : null)
        setPlan(typeof data.plan === "string" ? data.plan : null)
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载失败")
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [open, selectedFile, promptTarget])
  const downloadHref = selectedFile ? `/api/prompts?file=${encodeURIComponent(selectedFile)}&download=1` : null

  const handleDownload = async () => {
    if (!downloadHref || !selectedFile) return
    try {
      setDownloadLoading(true)
      setError(null)
      const deviceId = getOrCreateDeviceId()
      const res = await fetch(downloadHref, { cache: 'no-store', headers: deviceId ? { 'x-device-id': deviceId } : undefined })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if (res.status === 402 && body?.code === 'insufficient_credits') {
          setInsufficientCreditsData({ required: body?.required || 1, balance: body?.balance || 0 })
          setShowInsufficientCredits(true)
          return
        }
        throw new Error(body?.error || `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = selectedFile.split('/').pop() || 'prompt.md'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '发生错误')
    } finally {
      setDownloadLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {agent?.name || "提示词"}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap gap-3">
            {downloadHref ? (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadLoading}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
              >
                {downloadLoading ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                {"下载智能体（提示词）"}
              </button>
            ) : null}
            {previewTruncated ? <span className="text-xs text-amber-300">预览已截断</span> : null}
            {typeof downloadCost === "number" ? (
              <span className="text-xs text-zinc-500">下载消耗 {downloadCost} 积分</span>
            ) : null}
            {plan ? <span className="text-xs text-zinc-500">计划：{plan}</span> : null}
          </SheetDescription>
        </SheetHeader>

        {agent?.isCollection && files?.length ? (
          <div className="px-4">
            <div className="flex flex-wrap gap-2">
              {files.slice(0, 50).map((f) => (
                <button
                  key={f.relativePath}
                  onClick={() => setSelectedFile(f.relativePath)}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                    selectedFile === f.relativePath
                      ? "border-purple-500/40 bg-purple-500/10 text-purple-200"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                  title={f.relativePath}
                >
                  {f.fileName}
                </button>
              ))}
            </div>
            {files.length > 50 ? (
              <div className="text-xs text-zinc-500 mt-2">{"仅展示前 50 个文件"}</div>
            ) : null}
          </div>
        ) : null}

        <div className="px-4 pb-4">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 flex items-start gap-2">
              <XCircle className="size-4 mt-0.5" />
              <div className="min-w-0">{error}</div>
            </div>
          ) : null}

          <ScrollArea className="h-[60vh] rounded-xl border border-white/10 bg-black/20">
            <pre className="p-4 text-xs leading-relaxed whitespace-pre-wrap break-words text-zinc-200">
              {loading ? "加载中..." : content || "暂无内容"}
            </pre>
          </ScrollArea>
        </div>

        <SheetFooter>
          <div className="w-full space-y-2">
            <div className="text-xs text-zinc-500">
              {"引导：请尽量提供 背景 / 目标 / 已有素材 / 输出格式。如你缺少信息，我会先问你 3 个关键问题再开始输出。"}
            </div>
            <GlowButton
              primary
              disabled={!agent || (agent?.isCollection && !selectedFile)}
              onClick={() => agent && onRunAgent(agent.id, agent.promptFile || selectedFile || undefined)}
              className="w-full"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {"开始调用智能体"}
            </GlowButton>
          </div>
        </SheetFooter>
      </SheetContent>
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
    </Sheet>
  )
}
