import Link from "next/link"
import AdminRedemptionCodesClient from "./admin-client"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"

function parseAdminList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isAdminUser(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false
  const adminEmails = parseAdminList(process.env.ADMIN_EMAILS)
  const adminUserIds = parseAdminList(process.env.ADMIN_USER_IDS)
  const email = user.email?.toLowerCase()

  if (email && adminEmails.includes(email)) return true
  if (user.id && adminUserIds.includes(user.id.toLowerCase())) return true
  return false
}

export default async function AdminRedemptionCodesPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="relative min-h-screen bg-[#030304] text-zinc-200 flex items-center justify-center px-6">
        <ObsidianBackgroundLite />
        <div className="relative z-10 max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold text-white">请先登录管理员账号</h1>
          <p className="text-sm text-zinc-400">需要管理员权限才能管理兑换码。</p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold"
          >
            去登录
          </Link>
        </div>
      </div>
    )
  }

  if (!isAdminUser(user)) {
    return (
      <div className="relative min-h-screen bg-[#030304] text-zinc-200 flex items-center justify-center px-6">
        <ObsidianBackgroundLite />
        <div className="relative z-10 max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold text-white">无权限访问</h1>
          <p className="text-sm text-zinc-400">请使用管理员账号或配置 ADMIN_EMAILS/ADMIN_USER_IDS。</p>
          <Link href="/" className="text-sm text-purple-300 hover:text-purple-200">
            返回首页
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#030304] text-zinc-200 px-6 py-10">
      <ObsidianBackgroundLite />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">兑换码管理</h1>
          <p className="text-sm text-zinc-400 mt-2">生成、作废与导出体验卡兑换码。</p>
        </div>
        <AdminRedemptionCodesClient />
      </div>
    </div>
  )
}
