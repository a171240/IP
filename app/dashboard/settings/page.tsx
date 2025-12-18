"use client"

import { useState } from "react"
import Link from "next/link"
import { User, Bell, Shield, CreditCard, Palette, Globe, Save, ChevronRight } from "lucide-react"
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import { useAuth } from "@/contexts/auth-context"

// Settings sections
const settingsSections = [
  { id: "profile", label: "个人资料", icon: User },
  { id: "notifications", label: "通知设置", icon: Bell },
  { id: "security", label: "安全与隐私", icon: Shield },
  { id: "billing", label: "订阅与账单", icon: CreditCard },
  { id: "appearance", label: "外观设置", icon: Palette },
  { id: "language", label: "语言与地区", icon: Globe },
]


const planLabels: Record<string, string> = {
  free: "体验版",
  basic: "Plus",
  pro: "Pro",
  vip: "企业版",
}
// Input component for settings
const SettingsInput = ({
  label,
  value,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  type?: string
  placeholder?: string
}) => (
  <div>
    <label className="block text-sm dark:text-zinc-400 text-zinc-500 mb-1.5">{label}</label>
    <input
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      className="w-full px-4 py-3 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-zinc-200 text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 transition-colors"
    />
  </div>
)

// Toggle component
const SettingsToggle = ({
  label,
  description,
  defaultChecked = false,
}: { label: string; description: string; defaultChecked?: boolean }) => {
  const [enabled, setEnabled] = useState(defaultChecked)

  return (
    <div className="flex items-center justify-between p-4 rounded-xl dark:bg-white/[0.02] bg-black/[0.02] border dark:border-white/5 border-black/5">
      <div>
        <p className="dark:text-white text-zinc-900 font-medium">{label}</p>
        <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-purple-500" : "dark:bg-zinc-700 bg-zinc-300"}`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "left-7" : "left-1"}`}
        />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const { profile } = useAuth()
  const currentPlan = profile?.plan || "free"
  const currentPlanLabel = planLabels[currentPlan] || currentPlan
  const [activeSection, setActiveSection] = useState("profile")

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "设置" }]} />

      <main className="p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold dark:text-white text-zinc-900 mb-1">设置</h1>
          <p className="dark:text-zinc-400 text-zinc-500 text-sm">管理您的账户和应用偏好设置</p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <GlassCard className="lg:col-span-1 p-2">
            <nav className="space-y-1">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                    activeSection === section.id
                      ? "dark:bg-white/10 bg-purple-500/10 dark:text-white text-zinc-900"
                      : "text-zinc-500 dark:hover:text-white hover:text-zinc-900 dark:hover:bg-white/5 hover:bg-black/5"
                  }`}
                >
                  <section.icon size={18} />
                  <span className="text-sm font-medium">{section.label}</span>
                  {activeSection === section.id && <ChevronRight size={14} className="ml-auto" />}
                </button>
              ))}
            </nav>
          </GlassCard>

          {/* Settings Content */}
          <div className="lg:col-span-3 space-y-6">
            {activeSection === "profile" && (
              <>
                <GlassCard className="p-6">
                  <h2 className="text-lg font-bold dark:text-white text-zinc-900 mb-6">个人资料</h2>
                  <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                      U
                    </div>
                    <div>
                      <GlowButton className="mb-2">更换头像</GlowButton>
                      <p className="text-xs dark:text-zinc-400 text-zinc-500">支持 JPG、PNG 格式，最大 2MB</p>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <SettingsInput label="用户名" value="user_demo" />
                    <SettingsInput label="邮箱" value="demo@example.com" type="email" />
                    <SettingsInput label="显示名称" value="Demo User" />
                    <SettingsInput label="职位" value="内容创作者" />
                  </div>
                </GlassCard>
                <div className="flex justify-end">
                  <GlowButton primary>
                    <Save size={16} className="mr-2" />
                    保存更改
                  </GlowButton>
                </div>
              </>
            )}

            {activeSection === "notifications" && (
              <GlassCard className="p-6">
                <h2 className="text-lg font-bold dark:text-white text-zinc-900 mb-6">通知设置</h2>
                <div className="space-y-3">
                  <SettingsToggle label="邮件通知" description="接收重要更新和报告通知" defaultChecked />
                  <SettingsToggle label="浏览器推送" description="在桌面接收实时通知" />
                  <SettingsToggle label="周报摘要" description="每周接收内容表现总结" defaultChecked />
                  <SettingsToggle label="产品更新" description="接收新功能和改进通知" defaultChecked />
                </div>
              </GlassCard>
            )}

            {activeSection === "security" && (
              <GlassCard className="p-6">
                <h2 className="text-lg font-bold dark:text-white text-zinc-900 mb-6">安全与隐私</h2>
                <div className="space-y-4">
                  <SettingsInput label="当前密码" value="" type="password" placeholder="输入当前密码" />
                  <SettingsInput label="新密码" value="" type="password" placeholder="输入新密码" />
                  <SettingsInput label="确认新密码" value="" type="password" placeholder="再次输入新密码" />
                </div>
                <div className="mt-6 pt-6 border-t dark:border-white/5 border-black/5">
                  <SettingsToggle label="双因素认证" description="使用验证器应用增强账户安全" />
                </div>
              </GlassCard>
            )}

            {activeSection === "billing" && (
              <GlassCard className="p-6">
                <h2 className="text-lg font-bold dark:text-white text-zinc-900 mb-6">订阅与账单</h2>

                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-indigo-400 font-bold text-lg">{currentPlanLabel}</p>
                      <p className="text-sm dark:text-zinc-400 text-zinc-500">当前账号计划。升级后可解锁更多工作流步骤与交付能力。</p>
                    </div>
                    <Link href="/pricing">
                      <GlowButton>查看定价</GlowButton>
                    </Link>
                  </div>
                </div>

                <div className="text-xs dark:text-zinc-400 text-zinc-500 space-y-1">
                  <p>提示：当前版本暂未开放自助支付/发票/账单管理能力。</p>
                  <p>如需升级开通，请联系管理员为账号开通对应计划。</p>
                </div>
              </GlassCard>
            )}

            {activeSection === "appearance" && (
              <GlassCard className="p-6">
                <h2 className="text-lg font-bold dark:text-white text-zinc-900 mb-6">外观设置</h2>
                <div className="space-y-3">
                  <SettingsToggle label="深色模式" description="始终使用深色主题（Obsidian）" defaultChecked />
                  <SettingsToggle label="减少动画" description="减少界面动画效果" />
                  <SettingsToggle label="紧凑模式" description="减少界面元素间距" />
                </div>
              </GlassCard>
            )}

            {activeSection === "language" && (
              <GlassCard className="p-6">
                <h2 className="text-lg font-bold dark:text-white text-zinc-900 mb-6">语言与地区</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-zinc-500 mb-1.5">界面语言</label>
                    <select className="w-full px-4 py-3 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-zinc-200 text-zinc-900 focus:outline-none focus:border-purple-500/50 transition-colors appearance-none">
                      <option>简体中文</option>
                      <option>English</option>
                      <option>日本語</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-500 mb-1.5">时区</label>
                    <select className="w-full px-4 py-3 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-zinc-200 text-zinc-900 focus:outline-none focus:border-purple-500/50 transition-colors appearance-none">
                      <option>Asia/Shanghai (UTC+8)</option>
                      <option>America/New_York (UTC-5)</option>
                      <option>Europe/London (UTC+0)</option>
                    </select>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
