"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
  X
} from "lucide-react"

import { GlassCard, GlowButton } from "./obsidian"

interface ReportCanvasProps {
  isOpen: boolean
  onClose: () => void
  title: string
  stepId: string
  initialContent?: string
  streamingContent?: string
  isGenerating?: boolean
  onSave: (content: string) => Promise<void>
  onRegenerate?: () => void
  onOptimize?: (content: string, instruction: string) => Promise<string>
}

export function ReportCanvas({
  isOpen,
  onClose,
  title,
  stepId,
  initialContent = "",
  streamingContent = "",
  isGenerating = false,
  onSave,
  onRegenerate,
  onOptimize
}: ReportCanvasProps) {
  const contentToShow = useMemo(() => streamingContent || initialContent || "", [streamingContent, initialContent])

  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [showOptimizeInput, setShowOptimizeInput] = useState(false)
  const [optimizeInstruction, setOptimizeInstruction] = useState("")
  const [isOptimizing, setIsOptimizing] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewContent, setHasNewContent] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    setIsSaved(false)
    setIsCopied(false)
    setHasNewContent(false)
    setIsPinnedToBottom(true)

    // Open 时强制同步一次内容；后续更新由下面的 effect 负责
    setText(contentToShow)
  }, [isOpen, contentToShow])

  useEffect(() => {
    if (!isOpen) return
    if (isEditing) return

    // 非编辑态下，始终跟随最新内容
    setText(contentToShow)
  }, [contentToShow, isEditing, isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (!isGenerating) return
    if (!contentRef.current) return

    if (isPinnedToBottom) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    } else if (contentToShow) {
      setHasNewContent(true)
    }
  }, [contentToShow, isGenerating, isPinnedToBottom, isOpen])

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    if (!isEditing) return
    textareaRef.current?.focus()
  }, [isOpen, isEditing])

  const updatePinnedState = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const threshold = 40
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom <= threshold
    setIsPinnedToBottom(atBottom)
    if (atBottom) setHasNewContent(false)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = contentRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const toggleEdit = useCallback(() => {
    setIsEditing((v) => !v)
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }, [text])

  const handleDownload = useCallback(() => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${title.replace(/[《》]/g, "")}_${new Date().toISOString().split("T")[0]}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [text, title])

  const handleSave = useCallback(async () => {
    if (!text.trim()) return
    setIsSaving(true)
    try {
      await onSave(text)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 1500)
    } catch (error) {
      console.error("Save failed:", error)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, text])

  const handleOptimize = useCallback(async () => {
    if (!onOptimize) return
    const instruction = optimizeInstruction.trim()
    if (!instruction) return

    setIsOptimizing(true)
    try {
      const next = await onOptimize(text, instruction)
      setText(next)
      setIsEditing(true)
      setShowOptimizeInput(false)
      setOptimizeInstruction("")
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.scrollTop = textareaRef.current.scrollHeight
      }, 0)
    } catch (error) {
      console.error("Optimize failed:", error)
    } finally {
      setIsOptimizing(false)
    }
  }, [onOptimize, optimizeInstruction, text])

  if (!isOpen) return null

  const modal = (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${isFullscreen ? "" : "p-6"}`}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <GlassCard
        className={`relative flex flex-col ${
          isFullscreen ? "w-screen h-svh rounded-none" : "w-[min(1100px,calc(100vw-48px))] h-[min(90vh,900px)] rounded-2xl"
        } bg-zinc-950 text-zinc-100 border border-white/10`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
              <FileText size={20} className="text-purple-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">{title}</h2>
              <p className="text-xs text-zinc-400">
                {isGenerating ? (
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Loader2 size={12} className="animate-spin" />
                    正在生成报告...
                  </span>
                ) : isEditing ? (
                  <span className="text-blue-400">编辑模式</span>
                ) : (
                  <span className="text-emerald-400">预览模式</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleEdit}
              disabled={isGenerating}
              className={`p-2 rounded-lg transition-colors ${
                isEditing
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "hover:bg-white/5 text-zinc-400 hover:text-white"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isEditing ? "切换到预览" : "切换到编辑"}
            >
              {isEditing ? <Eye size={18} /> : <Edit3 size={18} />}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!text || isGenerating}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="复制"
            >
              {isCopied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={!text || isGenerating}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="下载 Markdown"
            >
              <Download size={18} />
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div ref={contentRef} onScroll={updatePinnedState} className="absolute inset-0 overflow-y-auto p-6 pb-16">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-full min-h-[400px] p-4 bg-zinc-950/60 border border-white/10 rounded-xl text-zinc-100 text-sm leading-relaxed font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                placeholder="在此编辑报告..."
              />
            ) : text ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-white">
                {text}
                {isGenerating && <span className="inline-block w-2 h-4 ml-1 bg-purple-400 animate-pulse" />}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                <Loader2 size={32} className="animate-spin mb-4 text-purple-400" />
                <p>暂无内容</p>
              </div>
            )}
          </div>

          {!isPinnedToBottom && (
            <button
              type="button"
              onClick={() => {
                setHasNewContent(false)
                setIsPinnedToBottom(true)
                scrollToBottom("smooth")
              }}
              className="absolute bottom-4 right-6 px-3 py-2 rounded-xl border border-white/10 bg-zinc-900/60 text-sm text-white shadow-lg backdrop-blur hover:bg-zinc-900/80 transition-colors"
            >
              {hasNewContent ? "有新内容 · 滚动到底部" : "滚动到底部"}
            </button>
          )}
        </div>

        {showOptimizeInput && (
          <div className="px-6 pb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={optimizeInstruction}
                onChange={(e) => setOptimizeInstruction(e.target.value)}
                placeholder="告诉 AI 你想如何优化…"
                className="flex-1 px-4 py-2 bg-zinc-950/60 border border-white/10 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleOptimize()
                  }
                }}
              />
              <button
                type="button"
                onClick={handleOptimize}
                disabled={!optimizeInstruction.trim() || isOptimizing}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    优化中
                  </>
                ) : (
                  <>
                    <Wand2 size={14} />
                    优化
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOptimizeInput(false)
                  setOptimizeInstruction("")
                }}
                className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white"
                title="取消"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-sm text-zinc-300 hover:text-white hover:border-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                重新生成
              </button>
            )}

            {onOptimize && (
              <button
                type="button"
                onClick={() => setShowOptimizeInput((v) => !v)}
                disabled={isGenerating || !text}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-sm text-zinc-300 hover:text-white hover:border-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={14} />
                AI 优化
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500" title={`stepId: ${stepId}`}>{text.length} 字符</span>
            <GlowButton primary onClick={handleSave} disabled={isSaving || isGenerating || !text.trim()}>
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  {isSaved ? <Check size={14} /> : <Save size={14} />}
                  {isSaved ? "已保存" : "保存报告"}
                </>
              )}
            </GlowButton>
          </div>
        </div>
      </GlassCard>
    </div>
  )

  return createPortal(modal, document.body)
}


