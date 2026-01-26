'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QUESTIONS } from '@/lib/diagnosis/questions'
import { calculateScore } from '@/lib/diagnosis/scoring'
import { GlassCard, GlowButton, Header } from '@/components/ui/obsidian'
import { ArrowLeft, ArrowRight, Activity, RefreshCw, Check } from 'lucide-react'

// localStorage key for progress persistence
const STORAGE_KEY = 'diagnosis_progress'

export default function QuizPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [customIndustry, setCustomIndustry] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // 从 localStorage 恢复进度
  useEffect(() => {
    setIsHydrated(true)
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const { step, answers: savedAnswers, customIndustry: savedCustomIndustry } = JSON.parse(saved)
        setCurrentStep(step)
        setAnswers(savedAnswers)
        if (savedCustomIndustry) setCustomIndustry(savedCustomIndustry)
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // 保存进度到 localStorage
  useEffect(() => {
    if (isHydrated && Object.keys(answers).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        step: currentStep,
        answers,
        customIndustry
      }))
    }
  }, [currentStep, answers, customIndustry, isHydrated])

  const currentQuestion = QUESTIONS[currentStep]
  const progress = ((currentStep + 1) / QUESTIONS.length) * 100
  const currentAnswer = answers[currentQuestion.id]

  const handleAnswer = (value: string | string[]) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }))
  }

  const handleOptionClick = (optionValue: string) => {
    if (currentQuestion.type === 'multiple') {
      const current = (currentAnswer as string[]) || []
      if (current.includes(optionValue)) {
        handleAnswer(current.filter(v => v !== optionValue))
      } else {
        handleAnswer([...current, optionValue])
      }
    } else {
      handleAnswer(optionValue)
    }
  }

  const handleNext = () => {
    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const result = calculateScore(answers)

      // 如果选择了"其他行业"，使用自定义行业名称
      const industryValue = answers.industry === 'other' && customIndustry.trim()
        ? customIndustry.trim()
        : answers.industry

      const response = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          scores: result.dimensions,
          totalScore: result.total,
          level: result.level,
          recommendations: result.recommendations,
          actionPlan: result.actionPlan,
          industry: industryValue
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save diagnosis')
      }

      const data = await response.json()
      localStorage.removeItem(STORAGE_KEY)
      router.push(`/diagnosis/result/${data.id}`)
    } catch (error) {
      console.error('Failed to submit diagnosis:', error)
      alert('提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 检查是否是行业选择题
  const isIndustryQuestion = currentQuestion.id === 'industry'
  const isOtherSelected = currentAnswer === 'other'

  // 对于行业选择题，如果选了"其他"且没有填写自定义行业，则视为未回答
  const isAnswered = currentQuestion.type === 'multiple'
    ? (currentAnswer as string[])?.length > 0
    : isIndustryQuestion && isOtherSelected
      ? !!customIndustry.trim()
      : !!currentAnswer

  // 防止 hydration 不匹配
  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2 dark:text-zinc-400 text-zinc-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[
        { label: "主页", href: "/" },
        { label: "内容交付系统诊断", href: "/diagnosis" },
        { label: "问卷" }
      ]} />

      <main className="p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* 进度条 */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="dark:text-zinc-400 text-zinc-500">诊断进度</span>
              </div>
              <span className="dark:text-white text-zinc-900 font-medium">
                {currentStep + 1} / {QUESTIONS.length}
              </span>
            </div>
            <div className="h-2 rounded-full dark:bg-zinc-800 bg-zinc-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* 进度激励文案 */}
            <div className="mt-2 text-center">
              {progress >= 50 && progress < 75 && (
                <span className="text-xs text-emerald-400">
                  已经过半，加油！
                </span>
              )}
              {progress >= 75 && progress < 100 && (
                <span className="text-xs text-emerald-400">
                  马上就能看到你的专属报告了
                </span>
              )}
              {progress < 50 && currentStep > 0 && (
                <span className="text-xs dark:text-zinc-500 text-zinc-400">
                  还剩 {QUESTIONS.length - currentStep - 1} 题
                </span>
              )}
            </div>
          </GlassCard>

          {/* 问题卡片 */}
          <GlassCard className="p-6">
            <div className="mb-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                  {currentStep + 1}
                </span>
                <div>
                  <h2 className="text-lg font-semibold dark:text-white text-zinc-900">
                    {currentQuestion.question}
                  </h2>
                  {currentQuestion.description && (
                    <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-1">
                      {currentQuestion.description}
                    </p>
                  )}
                </div>
              </div>

              {currentQuestion.type === 'multiple' && (
                <p className="text-xs dark:text-zinc-500 text-zinc-400 mb-4">
                  可多选
                </p>
              )}
            </div>

            {/* 选项列表 */}
            <div className="space-y-3">
              {currentQuestion.options.map((option) => {
                const isSelected = currentQuestion.type === 'multiple'
                  ? (currentAnswer as string[])?.includes(option.value)
                  : currentAnswer === option.value

                return (
                  <button
                    key={option.value}
                    onClick={() => handleOptionClick(option.value)}
                    className={`w-full p-4 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'dark:bg-emerald-500/10 bg-emerald-50 border-emerald-500/50 dark:border-emerald-500/30'
                        : 'dark:bg-zinc-900/40 bg-zinc-50 dark:border-white/5 border-black/5 hover:dark:border-white/10 hover:border-black/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${
                        isSelected
                          ? 'dark:text-emerald-400 text-emerald-600'
                          : 'dark:text-white text-zinc-900'
                      }`}>
                        {option.label}
                      </span>
                      {isSelected && (
                        <Check className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 自定义行业输入框 */}
            {isIndustryQuestion && isOtherSelected && (
              <div className="mt-4 p-4 rounded-xl dark:bg-zinc-900/60 bg-zinc-100 border dark:border-emerald-500/20 border-emerald-500/30">
                <label className="block text-sm font-medium dark:text-zinc-300 text-zinc-700 mb-2">
                  请输入你的行业：
                </label>
                <input
                  type="text"
                  placeholder="例如：宠物服务、法律咨询、旅游..."
                  value={customIndustry}
                  onChange={(e) => setCustomIndustry(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg dark:bg-zinc-800 bg-white border dark:border-white/10 border-black/10 dark:text-white text-zinc-900 placeholder:dark:text-zinc-500 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            )}
          </GlassCard>

          {/* 导航按钮 */}
          <div className="flex items-center justify-between gap-4">
            <GlowButton
              onClick={handlePrev}
              disabled={currentStep === 0}
              className={currentStep === 0 ? 'opacity-50 cursor-not-allowed' : ''}
            >
              <ArrowLeft className="w-4 h-4" />
              上一题
            </GlowButton>

            {currentStep === QUESTIONS.length - 1 ? (
              <GlowButton
                primary
                onClick={handleSubmit}
                disabled={!isAnswered || isSubmitting}
                className={!isAnswered ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    提交中...
                  </>
                ) : (
                  <>
                    生成报告
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </GlowButton>
            ) : (
              <GlowButton
                primary
                onClick={handleNext}
                disabled={!isAnswered}
                className={!isAnswered ? 'opacity-50 cursor-not-allowed' : ''}
              >
                下一题
                <ArrowRight className="w-4 h-4" />
              </GlowButton>
            )}
          </div>

          {/* 提示 */}
          <p className="text-center text-xs dark:text-zinc-500 text-zinc-400">
            进度自动保存，可随时返回继续
          </p>
        </div>
      </main>
    </div>
  )
}
