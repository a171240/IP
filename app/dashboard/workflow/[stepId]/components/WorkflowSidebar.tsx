"use client"

import Link from "next/link"
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles
} from "lucide-react"

import { GlassCard } from "@/components/ui/obsidian"
import { CreditsLowWarning, UpgradePromptAfterGeneration } from "@/components/ui/upgrade-prompt"
import type { Profile, Conversation } from "@/lib/supabase"
import type { WorkflowStepConfig } from "@/lib/workflow/types"
import { deriveConversationTopic, formatRelativeTime } from "../utils"

export function WorkflowSidebar({
  step,
  profile,
  generatedDoc,
  canGenerateReport,
  isGeneratingReport,
  isCopied,
  isSaved,
  showUpgradePrompt,
  onToggleUpgradePrompt,
  onGenerateReport,
  onOpenCanvas,
  onCopy,
  onDownload,
  onSaveAndContinue,
  stepConversations,
  currentConversationId,
  isLoading,
  onSelectConversation,
  onRestartConversation
}: {
  step: WorkflowStepConfig
  profile: Profile | null
  generatedDoc: string | null
  canGenerateReport: boolean
  isGeneratingReport: boolean
  isCopied: boolean
  isSaved: boolean
  showUpgradePrompt: boolean
  onToggleUpgradePrompt: (open: boolean) => void
  onGenerateReport: () => void
  onOpenCanvas: () => void
  onCopy: () => void
  onDownload: () => void
  onSaveAndContinue: () => void
  stepConversations: Conversation[]
  currentConversationId: string | null
  isLoading: boolean
  onSelectConversation: (c: Conversation) => void | Promise<void>
  onRestartConversation: () => void
}) {
  const currentPlan = (profile?.plan || "free") as "free" | "basic" | "pro" | "vip"

  return (
    <div className="w-80 border-l dark:border-white/5 border-black/5 p-4 space-y-4 hidden lg:block overflow-y-auto">
      {profile && !profile.credits_unlimited && (
        <CreditsLowWarning balance={profile.credits_balance || 0} />
      )}

      <GlassCard
        glow={!!generatedDoc}
        className={`p-4 ${
          generatedDoc
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent"
            : "border-zinc-500/20 bg-gradient-to-br from-zinc-500/5 to-transparent"
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              generatedDoc
                ? "bg-emerald-500/20 border border-emerald-500/30"
                : "bg-zinc-500/20 border border-zinc-500/30"
            }`}
          >
            {generatedDoc ? (
              <CheckCircle2 size={18} className="text-emerald-400" />
            ) : (
              <FileText size={18} className="text-zinc-400" />
            )}
          </div>
          <div>
            <h3 className="text-base font-medium dark:text-white text-zinc-900">
              {generatedDoc ? "已生成报告" : step.output}
            </h3>
            <p className={`text-xs ${generatedDoc ? "text-emerald-400" : "text-zinc-500"}`}>
              {generatedDoc ? "报告已就绪，可在画布中查看" : "等待 AI 生成报告…"}
            </p>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-lg dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/5 border-black/5 min-h-[80px] max-h-32 overflow-hidden relative">
          {generatedDoc ? (
            <>
              <p className="text-xs dark:text-zinc-400 text-zinc-600 line-clamp-4 whitespace-pre-wrap">
                {generatedDoc.slice(0, 300)}...
              </p>
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t dark:from-zinc-900/90 from-zinc-100/90 to-transparent" />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-2">
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">正在准备内容，请稍候…</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={onOpenCanvas}
            disabled={!generatedDoc}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              generatedDoc
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:opacity-90 shadow-lg shadow-emerald-500/20"
                : "bg-zinc-700/30 text-zinc-500 cursor-not-allowed"
            }`}
          >
            <Eye size={16} />
            重新开始对话
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onCopy}
              disabled={!generatedDoc}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                generatedDoc
                  ? "dark:bg-zinc-800/50 bg-zinc-200 dark:border-white/10 border-black/10 text-zinc-400 hover:text-white"
                  : "bg-zinc-800/20 border-zinc-700/30 text-zinc-600 cursor-not-allowed"
              }`}
            >
              {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {isCopied ? "已复制" : "复制"}
            </button>

            <button
              onClick={onDownload}
              disabled={!generatedDoc}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                generatedDoc
                  ? "dark:bg-zinc-800/50 bg-zinc-200 dark:border-white/10 border-black/10 text-zinc-400 hover:text-white"
                  : "bg-zinc-800/20 border-zinc-700/30 text-zinc-600 cursor-not-allowed"
              }`}
            >
              <Download size={14} />
              下载
            </button>
          </div>

          <button
            onClick={onSaveAndContinue}
            disabled={isSaved || !generatedDoc}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              generatedDoc
                ? "bg-purple-500/10 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50"
                : "bg-zinc-800/20 border border-zinc-700/30 text-zinc-600 cursor-not-allowed"
            }`}
          >
            {isSaved ? (
              <>
                <Check size={14} />
                已保存，返回中...
              </>
            ) : (
              <>
                <Save size={14} />
                保存并返回
              </>
            )}
          </button>
        </div>
      </GlassCard>

      {generatedDoc && profile && showUpgradePrompt && (
        <UpgradePromptAfterGeneration
          currentPlan={currentPlan}
          currentStepId={step.id}
          onDismiss={() => onToggleUpgradePrompt(false)}
        />
      )}

      {canGenerateReport && !generatedDoc && (
        <GlassCard glow className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-amber-400" />
            <h3 className="text-base font-medium dark:text-white text-zinc-900">一键生成报告</h3>
          </div>
          <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-4">
            保存并返回保存并返回重新开始对话
          </p>
          <button
            onClick={onGenerateReport}
            disabled={isGeneratingReport}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isGeneratingReport ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                保存并返回
              </>
            )}
          </button>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} className="text-purple-400" />
          <h3 className="text-base font-medium dark:text-white text-zinc-900">历史记录</h3>
        </div>

        {stepConversations.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无历史记录</p>
        ) : (
          <div className="space-y-2">
            {stepConversations.slice(0, 5).map((c) => {
              const statusLabel =
                c.status === "in_progress" ? "进行中" : c.status === "completed" ? "已完成" : "未知"
              const statusClass =
                c.status === "in_progress"
                  ? "text-emerald-400"
                  : c.status === "completed"
                    ? "text-blue-400"
                    : "text-zinc-500"
              const updated = formatRelativeTime(c.updated_at || c.created_at)
              const msgCount = Array.isArray(c.messages) ? c.messages.length : 0
              const topic = deriveConversationTopic(c, step.title)
              const isCurrent = currentConversationId === c.id

              return (
                <button
                  key={c.id}
                  onClick={() => onSelectConversation(c)}
                  disabled={isLoading}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                    isCurrent
                      ? "dark:bg-purple-500/10 bg-purple-50 border-purple-500/30 ring-1 ring-purple-500/20"
                      : "dark:bg-zinc-900/30 bg-zinc-100 border-black/5 dark:border-white/5 hover:dark:bg-zinc-800/50 hover:bg-zinc-200 cursor-pointer"
                  } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium dark:text-white text-zinc-900 truncate">{topic}</span>
                    <span className={`text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {updated} · {msgCount} 条消息
                    {isCurrent && <span className="ml-2 text-purple-400">当前</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </GlassCard>

      <button
        onClick={onRestartConversation}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border dark:border-amber-500/30 border-amber-400/30 dark:bg-amber-500/5 bg-amber-50 text-amber-500 text-sm dark:hover:bg-amber-500/10 hover:bg-amber-100 transition-colors"
      >
        <RefreshCw size={14} />
        重新开始对话
      </button>

      <Link href="/dashboard/workflow">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border dark:border-white/10 border-black/10 text-zinc-500 text-sm dark:hover:text-white hover:text-zinc-900 dark:hover:border-white/20 hover:border-black/20 transition-colors">
          <ArrowLeft size={14} />
          返回步骤列表
        </button>
      </Link>
    </div>
  )
}
