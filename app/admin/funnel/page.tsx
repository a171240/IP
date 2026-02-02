import Link from "next/link"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminSupabaseClient } from "@/lib/supabase/admin.server"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"

const EVENT_STEPS = [
  { event: "activate_view", label: "激活页曝光", aliases: [] },
  { event: "activate_submit", label: "激活提交", aliases: [] },
  { event: "activate_success", label: "激活成功", aliases: [] },
  { event: "diagnosis_start", label: "诊断开始", aliases: [] },
  { event: "diagnosis_complete", label: "诊断完成", aliases: [] },
  { event: "pack_generate_start", label: "交付包生成开始", aliases: ["delivery_pack_generate_start"] },
  { event: "pack_generate_success", label: "交付包生成成功", aliases: ["delivery_pack_generate_success"] },
  { event: "pack_view", label: "查看交付包", aliases: ["delivery_pack_view"] },
  { event: "pack_download", label: "下载交付包", aliases: ["delivery_pack_download"] },
  { event: "workshop_open", label: "打开内容工坊", aliases: ["workshop_enter"] },
  { event: "first_generation_success", label: "首次生成成功", aliases: [] },
  { event: "upgrade_click", label: "点击升级", aliases: [] },
  { event: "redeem_success", label: "兑换成功", aliases: [] },
]

const CONVERSION_STEPS = [
  {
    label: "激活提交率",
    numerator: "activate_submit",
    denominator: "activate_view",
  },
  {
    label: "激活后生成成功率",
    numerator: "pack_generate_success",
    denominator: "activate_success",
  },
  {
    label: "首产出率",
    numerator: "first_generation_success",
    denominator: "pack_view",
  },
  {
    label: "升级点击兑付率",
    numerator: "redeem_success",
    denominator: "upgrade_click",
  },
]

const TREND_EVENTS = [
  { event: "activate_view", label: "激活页曝光", aliases: [] },
  { event: "activate_submit", label: "激活提交", aliases: [] },
  { event: "activate_success", label: "激活成功", aliases: [] },
  {
    event: "pack_generate_success",
    label: "交付包生成成功",
    aliases: ["delivery_pack_generate_success"],
  },
  { event: "pack_view", label: "查看交付包", aliases: ["delivery_pack_view"] },
  { event: "pack_download", label: "下载交付包", aliases: ["delivery_pack_download"] },
  { event: "first_generation_success", label: "首次生成成功", aliases: [] },
  { event: "upgrade_click", label: "点击升级", aliases: [] },
  { event: "redeem_success", label: "兑换成功", aliases: [] },
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

  const trendDays = Array.from({ length: days }, (_, index) => {
    const date = new Date(startAt)
    date.setDate(startAt.getDate() + index)
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }),
    }
  })
  const labelStep = days <= 10 ? 1 : days <= 20 ? 2 : 5

  const counts = await Promise.all(
    EVENT_STEPS.map(async (step) => {
      const eventsToCount = [step.event, ...(step.aliases || [])]
      const { count } = await admin
        .from("analytics_events")
        .select("id", { count: "exact", head: true })
        .in("event", eventsToCount)
        .gte("created_at", startAt.toISOString())
        .lte("created_at", endAt.toISOString())
      return count || 0
    })
  )

  const rows = EVENT_STEPS.map((step, index) => {
    const count = counts[index] || 0
    return { ...step, count }
  })

  const countMap = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.event] = row.count
    return acc
  }, {})

  const conversionRows = CONVERSION_STEPS.map((step) => {
    const numerator = countMap[step.numerator] || 0
    const denominator = countMap[step.denominator] || 0
    const rate = denominator > 0 ? (numerator / denominator) * 100 : null
    return { ...step, numerator, denominator, rate }
  })

  const trendEventNames = TREND_EVENTS.flatMap((item) => [item.event, ...(item.aliases || [])])
  const trendAliasMap = TREND_EVENTS.reduce<Record<string, string>>((acc, item) => {
    acc[item.event] = item.event
    item.aliases?.forEach((alias) => {
      acc[alias] = item.event
    })
    return acc
  }, {})
  const { data: trendEvents } = await admin
    .from("analytics_events")
    .select("event, created_at")
    .in("event", trendEventNames)
    .gte("created_at", startAt.toISOString())
    .lte("created_at", endAt.toISOString())

  const trendMatrix = trendEventNames.reduce<Record<string, Record<string, number>>>((acc, event) => {
    acc[event] = trendDays.reduce<Record<string, number>>((dayAcc, day) => {
      dayAcc[day.key] = 0
      return dayAcc
    }, {})
    return acc
  }, {})

  if (trendEvents) {
    trendEvents.forEach((item) => {
      const key = new Date(item.created_at).toISOString().slice(0, 10)
      const canonical = trendAliasMap[item.event] || item.event
      if (trendMatrix[canonical] && key in trendMatrix[canonical]) {
        trendMatrix[canonical][key] += 1
      }
    })
  }

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
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">每日趋势</h2>
            <p className="text-xs text-zinc-500 mt-1">近 {days} 天关键事件走势。</p>
          </div>
          <div className="p-6 space-y-6">
            {TREND_EVENTS.map((item) => {
              const dayCounts = trendDays.map((day) => trendMatrix[item.event]?.[day.key] || 0)
              const maxCount = Math.max(1, ...dayCounts)
              return (
                <div key={item.event} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-zinc-300">
                    <span>{item.label}</span>
                    <span className="text-xs text-zinc-500">{item.event}</span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {dayCounts.map((count, index) => {
                      const height = Math.round((count / maxCount) * 100)
                      const barHeight = count === 0 ? 2 : Math.max(6, height)
                      return (
                        <div key={`${item.event}-${trendDays[index].key}`} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full rounded-sm bg-gradient-to-t from-emerald-500/70 to-emerald-200/60"
                            style={{ height: `${barHeight}%` }}
                            title={`${trendDays[index].label}：${count}`}
                          />
                          <div className="text-[10px] text-zinc-600">
                            {index % labelStep === 0 || index === dayCounts.length - 1 ? trendDays[index].label : ""}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-zinc-500 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">阶段</th>
                  <th className="px-4 py-3 text-left font-medium">事件名</th>
                  <th className="px-4 py-3 text-left font-medium">数量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => (
                  <tr key={row.event}>
                    <td className="px-4 py-3 text-zinc-200">{row.label}</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{row.event}</td>
                    <td className="px-4 py-3 text-zinc-200">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-zinc-500 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">关键转化</th>
                  <th className="px-4 py-3 text-left font-medium">比例</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {conversionRows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3 text-zinc-200">
                      <div className="text-sm">{row.label}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {row.numerator} / {row.denominator}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-200">
                      {row.rate === null ? "-" : `${row.rate.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
