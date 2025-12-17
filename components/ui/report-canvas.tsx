"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  X,
  Save,
  Download,
  Copy,
  Check,
  Edit3,
  Eye,
  Loader2,
  Sparkles,
  RefreshCw,
  FileText,
  Maximize2,
  Minimize2,
  Wand2
} from "lucide-react"
import { GlassCard, GlowButton } from "./obsidian"

interface ReportCanvasProps {
  isOpen: boolean
  onClose: () => void
  title: string
  stepId: string
  initialContent?: string
  isGenerating?: boolean
  streamingContent?: string
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
  isGenerating = false,
  streamingContent = "",
  onSave,
  onRegenerate,
  onOptimize
}: ReportCanvasProps) {
  const [content, setContent] = useState(initialContent)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizeInstruction, setOptimizeInstruction] = useState("")
  const [showOptimizeInput, setShowOptimizeInput] = useState(false)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewContent, setHasNewContent] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // 核心逻辑：当画布打开/关闭或内容变化时，同步显示内容
  useEffect(() => {
    // 画布关闭时不做任何处理
    if (!isOpen) return

    // 画布打开时，确定要显示的内容
    // 优先级：streamingContent > initialContent
    const contentToShow = streamingContent || initialContent || ""
    setContent(contentToShow)
    if (isGenerating && !isPinnedToBottom && contentToShow) {
      setHasNewContent(true)
    }
  }, [isOpen, streamingContent, initialContent, isGenerating, isPinnedToBottom])

  // 当 isOpen 变为 true 时，强制同步一次内容（处理 React 批处理问题）
  const prevIsOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // 从关闭到打开的转换
      const contentToShow = streamingContent || initialContent || ""
      setContent(contentToShow)
    }
    prevIsOpenRef.current = isOpen
  }, [isOpen, streamingContent, initialContent])

  // 自动跟随到底部（仅在用户位于底部时）
  useEffect(() => {
    if (!isGenerating || !isPinnedToBottom) return
    if (!contentRef.current) return
    contentRef.current.scrollTop = contentRef.current.scrollHeight
  }, [content, isGenerating, isPinnedToBottom])

  // 复制内容
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
    }
  }

  // 下载为 Markdown
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.replace(/[《》]/g, '')}_${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // 保存报告
  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave(content)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    } catch (error) {
      console.error('Save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // 优化报告
  const handleOptimize = async () => {
    if (!optimizeInstruction.trim() || !onOptimize) return

    setIsOptimizing(true)
    try {
      const optimizedContent = await onOptimize(content, optimizeInstruction)
      setContent(optimizedContent)
      setOptimizeInstruction("")
      setShowOptimizeInput(false)
    } catch (error) {
      console.error('Optimize failed:', error)
    } finally {
      setIsOptimizing(false)
    }
  }

  // 切换编辑模式
  const toggleEdit = () => {
    setIsEditing(!isEditing)
    if (!isEditing && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }

  const updatePinnedState = useCallback(() => {
    const el = contentRef.current
    if (!el) return

    const threshold = 80
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
  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? '' : 'p-6'}`}>
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 画布主体 */}
      <GlassCard className={`relative flex flex-col ${
        isFullscreen
          ? 'w-full h-full rounded-none'
          : 'w-full max-w-5xl max-h-[90vh] rounded-2xl'
      }`}>
        {/* 头部工具栏 */}
        <div className="flex items-center justify-between p-4 border-b dark:border-white/10 border-black/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30 flex items-center justify-center">
              <FileText size={20} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold dark:text-white text-zinc-900">{title}</h2>
              <p className="text-xs dark:text-zinc-400 text-zinc-500">
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
            {/* 编辑/预览切换 */}
            <button
              onClick={toggleEdit}
              disabled={isGenerating}
              className={`p-2 rounded-lg transition-colors ${
                isEditing
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'hover:bg-white/5 text-zinc-400 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isEditing ? "切换到预览" : "切换到编辑"}
            >
              {isEditing ? <Eye size={18} /> : <Edit3 size={18} />}
            </button>

            {/* 复制 */}
            <button
              onClick={handleCopy}
              disabled={!content || isGenerating}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="复制到剪贴板"
            >
              {isCopied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
            </button>

            {/* 下载 */}
            <button
              onClick={handleDownload}
              disabled={!content || isGenerating}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="下载为 Markdown"
            >
              <Download size={18} />
            </button>

            {/* 全屏切换 */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>

            {/* 关闭 */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div
            ref={contentRef}
            onScroll={updatePinnedState}
            className="absolute inset-0 overflow-y-auto p-6"
          >
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full min-h-[400px] p-4 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-zinc-300 text-zinc-700 text-sm leading-relaxed font-mono resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                placeholder="报告内容..."
              />
            ) : (
              <div className="max-w-none">
                {content ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-zinc-900 dark:text-zinc-100">
                    {content}
                    {isGenerating && (
                      <span className="inline-block w-2 h-4 ml-1 bg-purple-400 animate-pulse" />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Loader2 size={32} className="animate-spin mb-4 text-purple-400" />
                    <p>等待报告生成...</p>
                  </div>
                )}
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
              {hasNewContent ? "有新内容 · 回到底部" : "回到底部"}
            </button>
          )}
        </div>
        {/* AI 优化输入框 */}
        {showOptimizeInput && (
          <div className="px-6 pb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={optimizeInstruction}
                onChange={(e) => setOptimizeInstruction(e.target.value)}
                placeholder="告诉 AI 如何优化报告，例如：补充更多案例、语言更专业、增加数据支撑..."
                className="flex-1 px-4 py-2 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl text-sm dark:text-white text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleOptimize()
                  }
                }}
              />
              <button
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
                onClick={() => {
                  setShowOptimizeInput(false)
                  setOptimizeInstruction("")
                }}
                className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between p-4 border-t dark:border-white/10 border-black/10">
          <div className="flex items-center gap-2">
            {/* 重新生成 */}
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-white/10 border-black/10 text-sm text-zinc-400 hover:text-white hover:border-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
                重新生成
              </button>
            )}

            {/* AI 优化 */}
            {onOptimize && (
              <button
                onClick={() => setShowOptimizeInput(!showOptimizeInput)}
                disabled={isGenerating || !content}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-white/10 border-black/10 text-sm text-zinc-400 hover:text-white hover:border-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={14} />
                AI 优化
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* 字数统计 */}
            <span className="text-xs text-zinc-500">
              {content.length} 字
            </span>

            {/* 保存并返回 */}
            <GlowButton
              primary
              onClick={handleSave}
              disabled={isSaving || isGenerating || !content}
            >
              {isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  保存中...
                </>
              ) : isSaved ? (
                <>
                  <Check size={14} />
                  已保存
                </>
              ) : (
                <>
                  <Save size={14} />
                  保存并返回工作流
                </>
              )}
            </GlowButton>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
