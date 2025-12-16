"use client"

import type React from "react"
import { useState } from "react"
import { Home, Users, BookOpen, Layers, Settings, Eye, EyeOff, Mail, Lock, Command, Sparkles } from "lucide-react"

const GlobalStyles = () => (
  <style>{`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fade-in 0.5s ease-out forwards;
    }
    @keyframes pulse-glow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 0.8; }
    }
    .animate-pulse-glow {
      animation: pulse-glow 3s ease-in-out infinite;
    }
  `}</style>
)

// Navigation Component - Obsidian Floating Island Style
const Navigation = () => {
  const navItems = [
    { id: "home", icon: Home, label: "首页" },
    { id: "users", icon: Users, label: "档案" },
    { id: "content", icon: BookOpen, label: "报告" },
    { id: "layers", icon: Layers, label: "工坊" },
  ]

  return (
    <nav className="fixed left-6 top-6 bottom-6 w-20 flex flex-col items-center bg-zinc-950/80 backdrop-blur-2xl border border-white/5 rounded-[2rem] py-8 z-50 shadow-2xl shadow-black/50">
      {/* Logo */}
      <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold mb-10 shadow-lg shadow-indigo-900/50 select-none">
        IP
      </div>

      {/* Nav Items */}
      <div className="flex-1 flex flex-col space-y-4 w-full px-2">
        {navItems.map((item, index) => (
          <button
            key={item.id}
            className="group relative w-full aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 text-zinc-600 hover:text-zinc-400 hover:bg-white/5 cursor-not-allowed opacity-50"
            disabled
          >
            <item.icon size={20} strokeWidth={2} />
            {/* Tooltip */}
            <span className="absolute left-full ml-4 px-3 py-1.5 bg-zinc-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 shadow-xl z-50">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Settings */}
      <div className="mt-auto flex flex-col items-center space-y-4">
        <button className="text-zinc-600 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5">
          <Settings size={20} />
        </button>
      </div>
    </nav>
  )
}

// Glass Card Component
const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`relative bg-zinc-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden ${className}`}
  >
    {children}
  </div>
)

// Glow Button Component
const GlowButton = ({
  children,
  primary = false,
  className = "",
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode
  primary?: boolean
  className?: string
  type?: "button" | "submit"
  disabled?: boolean
}) => (
  <button
    type={type}
    disabled={disabled}
    className={`relative px-6 py-3.5 rounded-xl font-bold transition-all duration-300 overflow-hidden group w-full flex items-center justify-center
      ${
        primary
          ? "bg-white text-black hover:scale-[1.02] shadow-[0_0_30px_rgba(255,255,255,0.15)]"
          : "bg-zinc-800/80 text-white border border-white/5 hover:bg-zinc-700/80 hover:border-white/10"
      } 
      ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      ${className}`}
  >
    {primary && (
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-20 blur-xl transition-opacity" />
    )}
    <span className="relative">{children}</span>
  </button>
)

const InputField = ({
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  rightElement,
}: {
  label: string
  icon: React.ElementType
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  rightElement?: React.ReactNode
}) => (
  <div className="space-y-2 group">
    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-focus-within:text-indigo-400 transition-colors">
      {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-black/20 border border-white/10 rounded-xl text-zinc-200 pl-12 pr-12 py-3.5 text-sm font-mono focus:outline-none focus:border-indigo-500/50 focus:bg-white/5 transition-all placeholder:text-zinc-700"
      />
      {rightElement}
    </div>
  </div>
)

// Login Page Component
export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <div className="min-h-screen bg-black text-zinc-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-hidden">
      <GlobalStyles />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]" />
        {/* Centered glow for login card */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px] animate-pulse-glow" />
        {/* Noise texture */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150" />
      </div>

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="min-h-screen flex items-center justify-center pl-32 pr-8">
        <div className="relative w-full max-w-md animate-fade-in">
          <div className="absolute -inset-6 bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-indigo-600/20 rounded-[2.5rem] blur-3xl opacity-60 animate-pulse-glow" />

          {/* Login Card */}
          <GlassCard className="relative p-10 shadow-2xl shadow-black/50">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-6 shadow-lg shadow-indigo-900/50">
                IP
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">欢迎回来</h1>
              <p className="text-zinc-500 text-sm">
                登录 <span className="text-indigo-500">IP内容工厂</span>
              </p>
            </div>

            {/* Form */}
            <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
              {/* Email Input */}
              <InputField
                label="邮箱地址"
                icon={Mail}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />

              {/* Password Input */}
              <InputField
                label="密码"
                icon={Lock}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {/* Forgot Password */}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
                >
                  忘记密码？
                </button>
              </div>

              {/* Login Button */}
              <GlowButton primary type="submit">
                <Sparkles size={16} className="mr-2" />
                登录系统
              </GlowButton>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-zinc-900/80 px-4 text-[10px] text-zinc-600 uppercase tracking-wider font-mono">
                    或者
                  </span>
                </div>
              </div>

              {/* Google Sign In */}
              <GlowButton>
                <span className="flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  使用 Google 登录
                </span>
              </GlowButton>

              <div className="flex items-center justify-center gap-2 pt-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/50 border border-white/5">
                  <Command size={10} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500 font-mono">K</span>
                </div>
                <span className="text-[10px] text-zinc-600">快速登录</span>
              </div>
            </form>

            {/* Sign Up Link */}
            <p className="text-center mt-8 text-sm text-zinc-500">
              还没有账户？{" "}
              <button className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">立即注册</button>
            </p>
          </GlassCard>

          <div className="flex justify-center mt-6">
            <span className="px-3 py-1.5 rounded-full bg-zinc-900/50 border border-white/5 text-[10px] text-zinc-500 font-mono">
              v2.1.0 · Obsidian Theme
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
