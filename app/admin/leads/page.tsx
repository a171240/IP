import Link from "next/link"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"

type LeadRow = {
  id: string
  created_at: string
  team_size: string
  current_status: string
  contact: string
  industry: string | null
  source: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  landing_path: string | null
}

const TEAM_SIZE_LABELS: Record<string, string> = {
  "1-3": "1-3人",
  "4-8": "4-8人",
  "9-20": "9-20人",
  "20+": "20人以上",
}

const STATUS_LABELS: Record<string, string> = {
  "no-sop": "缺少SOP",
  "multi-project": "口径难统一",
  "low-conversion": "转化不稳",
  "need-scale": "准备规模化",
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

type AdminLeadsPageProps = {
  searchParams?: Promise<{ days?: string; limit?: string }> | { days?: string; limit?: string }
}

export default async function AdminLeadsPage({ searchParams }: AdminLeadsPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
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
          <p className="text-sm text-zinc-400">需要管理员权限才能查看预约线索。</p>
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

  let leads: LeadRow[] = []
  let loadError: string | null = null

  const parsedDays = Number(resolvedSearchParams?.days || 7)
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 90) : 7
  const parsedLimit = Number(resolvedSearchParams?.limit || 200)
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 20), 500) : 200
  const endAt = new Date()
  const startAt = new Date()
  startAt.setDate(endAt.getDate() - days + 1)
  startAt.setHours(0, 0, 0, 0)

  try {
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from("leads")
      .select(
        "id, created_at, team_size, current_status, contact, industry, source, utm_source, utm_medium, utm_campaign, landing_path"
      )
      .gte("created_at", startAt.toISOString())
      .lte("created_at", endAt.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      loadError = error.message || "加载失败"
    } else {
      leads = (data || []) as LeadRow[]
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "加载失败"
  }

  return (
    <div className="relative min-h-screen bg-[#030304] text-zinc-200 px-6 py-10">
      <ObsidianBackgroundLite />
      <div className="relative z-10 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">预约线索</h1>
          <p className="text-sm text-zinc-400 mt-2">统计区间：过去 {days} 天（最多展示 {limit} 条）。</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            {[7, 14, 30].map((value) => (
              <Link
                key={value}
                href={`/admin/leads?days=${value}`}
                className={`px-3 py-1 rounded-full border ${
                  value === days ? "border-emerald-500/40 text-emerald-300" : "border-white/10"
                }`}
              >
                近 {value} 天
              </Link>
            ))}
          </div>
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {loadError}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-zinc-500 border-b border-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-medium">时间</th>
                <th className="px-4 py-3 text-left font-medium">团队规模</th>
                <th className="px-4 py-3 text-left font-medium">现状</th>
                <th className="px-4 py-3 text-left font-medium">行业</th>
                <th className="px-4 py-3 text-left font-medium">联系方式</th>
                <th className="px-4 py-3 text-left font-medium">来源</th>
                <th className="px-4 py-3 text-left font-medium">UTM</th>
                <th className="px-4 py-3 text-left font-medium">落地页</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {leads.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500" colSpan={8}>
                    暂无线索
                  </td>
                </tr>
              ) : (
                leads.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-zinc-200">
                      {new Date(row.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-zinc-200">
                      {TEAM_SIZE_LABELS[row.team_size] || row.team_size}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {STATUS_LABELS[row.current_status] || row.current_status}
                    </td>
                    <td className="px-4 py-3 text-zinc-200">{row.industry || "-"}</td>
                    <td className="px-4 py-3 text-zinc-200 select-all">{row.contact}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.source || "-"}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {row.utm_campaign || row.utm_source || "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{row.landing_path || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
