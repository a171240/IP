"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Lock, Eye, EyeOff, Loader2, Sparkles, CheckCircle, ArrowLeft } from "lucide-react"
import { updatePassword, getSession } from "@/lib/supabase"

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <ResetPasswordPageInner />
    </Suspense>
  )
}

function ResetPasswordPageInner() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  // 密码强度检查
  const passwordChecks = {
    length: password.length >= 6,
    hasNumber: /\d/.test(password),
    hasLetter: /[a-zA-Z]/.test(password),
  }
  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length

  // 检查用户是否通过邮件链接进入（有有效的会话）
  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getSession()
        if (session) {
          setHasSession(true)
        } else {
          setError("无效或已过期的重置链接。请重新申请密码重置。")
        }
      } catch (err) {
        console.error("Session check error:", err)
        setError("验证失败，请重新申请密码重置。")
      } finally {
        setChecking(false)
      }
    }
    checkSession()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // 验证密码
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }

    if (password.length < 6) {
      setError("密码至少需要6个字符")
      return
    }

    setLoading(true)

    try {
      const { error } = await updatePassword(password)

      if (error) {
        setError(error.message)
        return
      }

      setSuccess(true)
      // 3秒后跳转到登录页
      setTimeout(() => {
        router.push("/auth/login")
      }, 3000)
    } catch (err) {
      setError("重置密码失败，请稍后重试")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* 背景效果 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">重置密码</h1>
          <p className="text-zinc-500">请输入您的新密码</p>
        </div>

        {/* 表单 */}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          {success ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">密码重置成功</h2>
              <p className="text-zinc-400 mb-6">
                您的密码已成功更新，正在跳转到登录页面...
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
              >
                立即登录
              </Link>
            </div>
          ) : !hasSession ? (
            <div className="text-center py-4">
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
                {error}
              </div>
              <Link
                href="/auth/forgot-password"
                className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                重新申请密码重置
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 新密码输入 */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  新密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少6个字符"
                    className="w-full pl-12 pr-12 py-3 bg-zinc-900/50 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {/* 密码强度指示器 */}
                {password && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            passwordStrength >= level
                              ? passwordStrength === 1
                                ? "bg-red-500"
                                : passwordStrength === 2
                                ? "bg-yellow-500"
                                : "bg-emerald-500"
                              : "bg-zinc-800"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={passwordChecks.length ? "text-emerald-400" : "text-zinc-600"}>
                        {passwordChecks.length ? "✓" : "○"} 至少6位
                      </span>
                      <span className={passwordChecks.hasLetter ? "text-emerald-400" : "text-zinc-600"}>
                        {passwordChecks.hasLetter ? "✓" : "○"} 包含字母
                      </span>
                      <span className={passwordChecks.hasNumber ? "text-emerald-400" : "text-zinc-600"}>
                        {passwordChecks.hasNumber ? "✓" : "○"} 包含数字
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 确认密码 */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  确认新密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className={`w-full pl-12 pr-4 py-3 bg-zinc-900/50 border rounded-xl text-white placeholder-zinc-600 focus:outline-none transition-all ${
                      confirmPassword && confirmPassword !== password
                        ? "border-red-500/50 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50"
                        : confirmPassword && confirmPassword === password
                        ? "border-emerald-500/50 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                        : "border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50"
                    }`}
                    required
                  />
                  {confirmPassword && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2">
                      {confirmPassword === password ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <span className="text-red-500 text-sm">不匹配</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={loading || (confirmPassword !== "" && confirmPassword !== password)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium hover:from-purple-500 hover:to-purple-400 transition-all shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    重置中...
                  </>
                ) : (
                  "重置密码"
                )}
              </button>

              {/* 返回登录 */}
              <div className="text-center pt-2">
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-400 transition-colors text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回登录
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
