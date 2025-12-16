"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Mail, Lock, Eye, EyeOff, Loader2, Sparkles } from "lucide-react"
import { signIn } from "@/lib/supabase"

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get("redirect")
  const redirectTo = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") && !redirectParam.startsWith("/auth")
    ? redirectParam
    : "/dashboard"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const { data, error } = await signIn(email, password)

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("邮箱或密码错误")
        } else if (error.message.includes("Email not confirmed")) {
          setError("请先验证您的邮箱")
        } else {
          setError(error.message)
        }
        return
      }

      if (data.user) {
        router.push(redirectTo)
      }
    } catch (err) {
      setError("登录失败，请稍后重试")
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
          <h1 className="text-2xl font-bold text-white mb-2">欢迎回来</h1>
          <p className="text-zinc-500">登录您的 IP内容工厂 账号</p>
        </div>

        {/* 登录表单 */}
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleLogin} className="space-y-5">
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
                  placeholder="••••••••"
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
            </div>

            {/* 忘记密码 */}
            <div className="flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                忘记密码？
              </Link>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium hover:from-purple-500 hover:to-purple-400 transition-all shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录中...
                </>
              ) : (
                "登录"
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

          {/* 注册链接 */}
          <p className="text-center text-zinc-500">
            还没有账号？{" "}
            <Link
              href={redirectParam ? `/auth/register?redirect=${encodeURIComponent(redirectParam)}` : "/auth/register"}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
            >
              立即注册
            </Link>
          </p>
        </div>

        {/* 底部说明 */}
        <p className="text-center text-zinc-600 text-sm mt-6">
          登录即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  )
}
