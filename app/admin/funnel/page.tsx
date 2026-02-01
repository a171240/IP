import Link from "next/link"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"

const FUNNEL_STEPS = [
  { event: "cta_click", label: "购买入口" },
  { event: "redeem_success", label: "兑换成功" },
  { event: "diagnosis_complete", label: "诊断完成" },
  { event: "delivery_pack_generate_success", label: "生成PDF成功" },
  { event: "workshop_enter", label: "进入内容工坊" },
  { event: "redeem_renew_success", label: "续费成功" },
]

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

type AdminFunnelPageProps = {
  searchParams?: Promise<{ days?: string }> | { days?: string }
}

export default async function AdminFunnelPage({ searchParams }: AdminFunnelPageProps) {
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
          <p className="text-sm text-zinc-400">需要管理员权限才能查看漏斗看板。</p>
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

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase admin env missing"
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-rose-400">
        {message}
      </div>
    )
  }

  const parsedDays = Number(resolvedSearchParams?.days || 7)
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 90) : 7
  const endAt = new Date()
  const startAt = new Date()
  startAt.setDate(endAt.getDate() - days + 1)
  startAt.setHours(0, 0, 0, 0)

  const counts = await Promise.all(
    FUNNEL_STEPS.map(async (step) => {
      const { count } = await admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event", step.event)
        .gte("created_at", startAt.toISOString())
        .lte("created_at", endAt.toISOString())
      return count || 0
    })
  )

  const rows = FUNNEL_STEPS.map((step, index) => {
    const count = counts[index] || 0
    const prev = index > 0 ? counts[index - 1] || 0 : null
    const rate = prev && prev > 0 ? (count / prev) * 100 : null
    return { ...step, count, rate }
  })

  return (
    <div className="relative min-h-screen bg-[#030304] text-zinc-200 px-6 py-10">
      <ObsidianBackgroundLite />
      <div className="relative z-10 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">漏斗看板</h1>
          <p className="text-sm text-zinc-400 mt-2">
            统计区间：过去 {days} 天（事件总次数）。
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            {[7, 14, 30].map((value) => (
              <Link
                key={value}
                href={`/admin/funnel?days=${value}`}
                className={`px-3 py-1 rounded-full border ${
                  value === days ? "border-emerald-500/40 text-emerald-300" : "border-white/10"
                }`}
              >
                近 {value} 天
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-zinc-500 border-b border-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-medium">阶段</th>
                <th className="px-4 py-3 text-left font-medium">事件名</th>
                <th className="px-4 py-3 text-left font-medium">数量</th>
                <th className="px-4 py-3 text-left font-medium">转化率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) => (
                <tr key={row.event}>
                  <td className="px-4 py-3 text-zinc-200">{row.label}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{row.event}</td>
                  <td className="px-4 py-3 text-zinc-200">{row.count}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {row.rate === null ? "-" : `${row.rate.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
