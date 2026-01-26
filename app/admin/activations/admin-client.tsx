"use client"

import { useMemo, useState } from "react"
import { GlowButton } from "@/components/ui/obsidian-primitives"
import { track } from "@/lib/analytics/client"

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

export default function AdminActivationsClient({
  initialRows,
  loadError,
}: {
  initialRows: ActivationRow[]
  loadError: string | null
}) {
  const [rows, setRows] = useState<ActivationRow[]>(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasRows = useMemo(() => rows.length > 0, [rows.length])

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch("/api/admin/activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      })

      const data = (await response.json()) as { ok: boolean; error?: string }

      if (!response.ok || !data.ok) {
        if (data.error === "missing_user_id") {
          setError("该申请未绑定用户，请提醒用户先注册/登录。")
        } else {
          setError("处理失败，请稍后重试。")
        }
        return
      }

      if (action === "approve") {
        track("activation_approved", { activation_id: id })
      }

      setRows((prev) => prev.filter((row) => row.id !== id))
    } catch {
      setError("网络异常，请稍后重试。")
    } finally {
      setBusyId(null)
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 text-sm text-rose-400">
        {loadError}
      </div>
    )
  }

  if (!hasRows) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 text-sm text-zinc-400">
        当前暂无待处理的激活申请。
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950/60">
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase text-zinc-500 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 text-left font-medium">提交时间</th>
              <th className="px-4 py-3 text-left font-medium">邮箱</th>
              <th className="px-4 py-3 text-left font-medium">平台</th>
              <th className="px-4 py-3 text-left font-medium">订单尾号</th>
              <th className="px-4 py-3 text-left font-medium">备注</th>
              <th className="px-4 py-3 text-left font-medium">来源</th>
              <th className="px-4 py-3 text-left font-medium">UTM</th>
              <th className="px-4 py-3 text-left font-medium">落地页</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString("zh-CN")}
                </td>
                <td className="px-4 py-3 text-zinc-200">{row.email}</td>
                <td className="px-4 py-3 text-zinc-300">{row.platform}</td>
                <td className="px-4 py-3 text-zinc-300">{row.order_tail}</td>
                <td className="px-4 py-3 text-zinc-400">{row.note || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{row.source || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {[row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(" / ") || "-"}
                </td>
                <td className="px-4 py-3 text-zinc-400">{row.landing_path || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <GlowButton
                      primary
                      className="px-3 py-2 text-xs"
                      disabled={busyId === row.id}
                      onClick={() => handleAction(row.id, "approve")}
                    >
                      通过
                    </GlowButton>
                    <GlowButton
                      className="px-3 py-2 text-xs"
                      disabled={busyId === row.id}
                      onClick={() => handleAction(row.id, "reject")}
                    >
                      拒绝
                    </GlowButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}