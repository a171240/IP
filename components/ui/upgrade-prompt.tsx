"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, Crown, Sparkles, X, Zap } from "lucide-react"
import { GlassCard, GlowButton } from "./obsidian-primitives"

type PlanId = "free" | "basic" | "pro" | "vip"

const PLAN_LABELS: Record<PlanId, string> = {
  free: "体验版",
  basic: "Plus",
  pro: "Pro",
  vip: "企业版",
}

const PLAN_FEATURES: Record<PlanId, string> = {
  free: "P1–P2 研究定位 + 积分体验智能体",
  basic: "P3–P5 人设构建 + 100+专属智能体",
  pro: "P6–P10 内容生产 + 全部智能体 + 下载",
  vip: "全功能 + 定制服务 + 积分不限量",
}

export function CreditsLowWarning({
  balance,
  onViewPricing,
}: {
  balance: number
  onViewPricing?: () => void
}) {
  if (balance > 10) return null

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
      <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-200">
          剩余积分：<span className="font-semibold">{balance}</span>
          <span className="text-amber-400/80 ml-2">积分即将耗尽</span>
        </p>
      </div>
      <Link href="/pricing">
        <button
          onClick={onViewPricing}
          className="text-xs text-amber-400 hover:text-amber-300 whitespace-nowrap flex items-center gap-1"
        >
          查看套餐
          <ArrowRight size={12} />
        </button>
      </Link>
    </div>
  )
}

export function UpgradePromptAfterGeneration({
  currentPlan,
  currentStepId,
  onDismiss,
}: {
  currentPlan: PlanId
  currentStepId: string
  onDismiss?: () => void
}) {
  const getUpgradeInfo = () => {
    if (currentPlan === "vip") return null

    if (currentPlan === "free" && (currentStepId === "P1" || currentStepId === "P2")) {
      return {
        targetPlan: "basic" as PlanId,
        title: "解锁定位与人设 + 100+专属智能体",
        description: "升级Plus可解锁 P3–P5 人设构建 + 实体营销全家桶（13模块100+智能体）+ 46行业选题生成器，价值超￥3000。",
        highlight: "￥199/月",
      }
    }

    if (
      currentPlan === "basic" &&
      (currentStepId === "P3" || currentStepId === "P4" || currentStepId === "P5" || currentStepId === "IP传记")
    ) {
      return {
        targetPlan: "pro" as PlanId,
        title: "解锁全部80+智能体 + 下载权限",
        description: "升级Pro可解锁 P6–P10 内容生产循环 + 赛博IP人设模板 + 内容矩阵规划包，并支持资源下载。",
        highlight: "￥599/月",
      }
    }

    return null
  }

  const upgradeInfo = getUpgradeInfo()
  if (!upgradeInfo) return null

  return (
    <GlassCard className="p-4 border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <Sparkles size={16} className="text-purple-400" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">{upgradeInfo.title}</h4>
            <p className="text-xs text-purple-400">{upgradeInfo.highlight}</p>
          </div>
        </div>
        {onDismiss ? (
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-400">
            <X size={14} />
          </button>
        ) : null}
      </div>
      <p className="text-xs text-zinc-400 mt-3 leading-relaxed">{upgradeInfo.description}</p>
      <div className="flex gap-2 mt-4">
        <Link href="/pricing" className="flex-1">
          <GlowButton primary className="w-full text-xs py-2">
            了解套餐
            <ArrowRight size={12} />
          </GlowButton>
        </Link>
      </div>
    </GlassCard>
  )
}

export function InsufficientCreditsModal({
  required,
  balance,
  onClose,
}: {
  required: number
  balance: number
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <GlassCard className="w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Zap size={24} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">积分不足</h3>
            <p className="text-sm text-zinc-400">无法完成本次操作</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-zinc-400">本次需要</span>
            <span className="text-lg font-semibold text-white">{required} 积分</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-zinc-400">当前剩余</span>
            <span className="text-lg font-semibold text-amber-400">{balance} 积分</span>
          </div>
        </div>

        <p className="text-xs text-zinc-500 mb-4">升级套餐可获得更多积分，或补充积分（内测期人工开通）。</p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            稍后再试
          </button>
          <Link href="/pricing" className="flex-1">
            <GlowButton primary className="w-full">
              查看套餐
            </GlowButton>
          </Link>
        </div>
      </GlassCard>
    </div>
  )
}

export function PlanRequiredModal({
  requiredPlan,
  currentPlan,
  stepTitle,
  creditCost,
  balance,
  onUseCredits,
  onClose,
}: {
  requiredPlan: PlanId
  currentPlan: PlanId
  stepTitle: string
  creditCost?: number
  balance?: number
  onUseCredits?: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <GlassCard className="w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <Crown size={24} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">需要升级套餐</h3>
            <p className="text-sm text-zinc-400">解锁更多能力</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 mb-4">
          <p className="text-sm text-zinc-300 mb-3">
            <span className="text-white font-medium">{stepTitle}</span> 需要「{PLAN_LABELS[requiredPlan]}」才可使用
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-zinc-700/50 text-zinc-400">当前：{PLAN_LABELS[currentPlan]}</span>
            <ArrowRight size={12} className="text-zinc-600" />
            <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">需要：{PLAN_LABELS[requiredPlan]}</span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 mb-4">
          <p className="text-xs text-purple-300">
            <span className="font-medium">{PLAN_LABELS[requiredPlan]}</span> 包含：{PLAN_FEATURES[requiredPlan]}
          </p>
        </div>

        {typeof creditCost === "number" ? (
          <div className="text-xs text-zinc-500 mb-4">
            或使用积分按次解锁：<span className="text-amber-400 font-medium">{creditCost}</span> 积分
            {typeof balance === "number" ? <span>（当前 {balance}）</span> : null}
          </div>
        ) : null}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            返回
          </button>

          {onUseCredits && typeof creditCost === "number" ? (
            <GlowButton primary className="flex-1" onClick={onUseCredits}>
              使用 {creditCost} 积分继续
            </GlowButton>
          ) : null}

          <Link href="/pricing" className="flex-1">
            <GlowButton primary className="w-full">
              查看套餐对比
            </GlowButton>
          </Link>
        </div>
      </GlassCard>
    </div>
  )
}
