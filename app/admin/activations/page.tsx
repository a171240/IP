import Link from "next/link"
import AdminActivationsClient from "./admin-client"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"

type ActivationRow = {
  id: string
  created_at: string
  email: string
  user_id: string | null
  platform: string
  order_tail: string
  note: string | null
  source: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  landing_path: string | null
}

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

export default async function AdminActivationsPage() {
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
          <p className="text-sm text-zinc-400">需要管理员权限才能查看激活申请列表。</p>
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

  let pending: ActivationRow[] = []
  let loadError: string | null = null

  try {
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from("activation_requests")
      .select(
        "id, created_at, email, user_id, platform, order_tail, note, source, utm_source, utm_medium, utm_campaign, landing_path"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) {
      loadError = error.message || "加载失败"
    } else {
      pending = (data || []) as ActivationRow[]
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "加载失败"
  }

  return (
    <div className="relative min-h-screen bg-[#030304] text-zinc-200 px-6 py-10">
      <ObsidianBackgroundLite />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">体验卡激活审批</h1>
          <p className="text-sm text-zinc-400 mt-2">待处理的激活申请会显示在下方列表。</p>
        </div>
        <AdminActivationsClient initialRows={pending} loadError={loadError} />
      </div>
    </div>
  )
}
