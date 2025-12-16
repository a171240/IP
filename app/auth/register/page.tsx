"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Mail, Lock, Eye, EyeOff, Loader2, Sparkles, User, Check } from "lucide-react"
// Check 图标仍用于密码匹配显示
import { signUp } from "@/lib/supabase"

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <RegisterPageInner />
    </Suspense>
  )
}

function RegisterPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")
  const redirectTo = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") && !redirectParam.startsWith("/auth")
    ? redirectParam
    : "/dashboard"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [nickname, setNickname] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // 密码强度检查
  const passwordChecks = {
    length: password.length >= 6,
    hasNumber: /\d/.test(password),
    hasLetter: /[a-zA-Z]/.test(password),
  }
  const passwordStrength = Object.values(passwordChecks).filter(Boolean).length

  const handleRegister = async (e: React.FormEvent) => {
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
      const { data, error } = await signUp(email, password, nickname)

      if (error) {
        if (error.message.includes("already registered")) {
          setError("该邮箱已被注册")
        } else {
          setError(error.message)
        }
        return
      }

      if (data.user) {
        // 注册成功，直接跳转到 dashboard
        router.push(redirectTo)
      }
    } catch (err) {
      setError("注册失败，请稍后重试")
      console.error(err)
    } finally {
      setLoading(false)
    }
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
          <h1 className="text-2xl font-bold text-white mb-2">创建账号</h1>
          <p className="text-zinc-500">开启您的 IP 内容创作之旅</p>
        </div>

        {/* 注册表单 */}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleRegister} className="space-y-5">
            {/* 昵称输入 */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                昵称 <span className="text-zinc-600">(可选)</span>
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="您的昵称"
                  className="w-full pl-12 pr-4 py-3 bg-zinc-900/50 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                />
              </div>
            </div>

            {/* 邮箱输入 */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                邮箱地址
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-12 pr-4 py-3 bg-zinc-900/50 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                  required
                />
              </div>
            </div>

            {/* 密码输入 */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                密码
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
                确认密码
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
                      <Check className="w-5 h-5 text-emerald-500" />
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

            {/* 注册按钮 */}
            <button
              type="submit"
              disabled={loading || (confirmPassword !== "" && confirmPassword !== password)}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium hover:from-purple-500 hover:to-purple-400 transition-all shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  注册中...
                </>
              ) : (
                "创建账号"
              )}
            </button>
          </form>

          {/* 分割线 */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-zinc-900/50 text-zinc-500">或者</span>
            </div>
          </div>

          {/* 登录链接 */}
          <p className="text-center text-zinc-500">
            已有账号？{" "}
            <Link
              href={redirectParam ? `/auth/login?redirect=${encodeURIComponent(redirectParam)}` : "/auth/login"}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              立即登录
            </Link>
          </p>
        </div>

        {/* 底部说明 */}
        <p className="text-center text-zinc-600 text-sm mt-6">
          注册即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  )
}
