"use client"

import { useEffect, useMemo, useState } from "react"
import { GlowButton } from "@/components/ui/obsidian-primitives"

type CodeRow = {
  code: string
  status: string
  plan: string
  duration_days: number
  created_at: string
  used_at: string | null
  used_by: string | null
  expires_at: string | null
  batch: string | null
}

type Summary = {
  unused: number
  used: number
  disabled: number
  expired: number
  total: number
}

const STATUS_LABELS: Record<string, string> = {
  unused: "未使用",
  used: "已使用",
  disabled: "已作废",
  expired: "已过期",
}

function formatDate(value: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-CN")
}

function formatStatus(status: string, expiresAt: string | null) {
  if (expiresAt) {
    const expires = new Date(expiresAt)
    if (!Number.isNaN(expires.getTime()) && expires < new Date()) {
      return "expired"
    }
  }
  return status || "unused"
}

export default function AdminRedemptionCodesClient() {
  const [rows, setRows] = useState<CodeRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [batchFilter, setBatchFilter] = useState("")
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(100)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const [createCount, setCreateCount] = useState(20)
  const [createPlan, setCreatePlan] = useState("trial_pro")
  const [createDuration, setCreateDuration] = useState(7)
  const [createBatch, setCreateBatch] = useState("")
  const [createExpiresAt, setCreateExpiresAt] = useState("")
  const [creating, setCreating] = useState(false)
  const [createdCodes, setCreatedCodes] = useState<string[]>([])

  const hasRows = useMemo(() => rows.length > 0, [rows.length])

  const fetchList = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("status", statusFilter)
      if (batchFilter) params.set("batch", batchFilter)
      if (query) params.set("query", query)
      params.set("limit", String(limit))
      params.set("offset", "0")
      params.set("includeSummary", "1")
      const response = await fetch(`/api/admin/redemption-codes?${params.toString()}`)
      const data = (await response.json()) as {
        ok: boolean
        rows?: CodeRow[]
        summary?: Summary
        error?: string
      }

      if (!response.ok || !data.ok) {
        setError("加载失败，请稍后重试。")
        return
      }

      setRows(data.rows || [])
      setSummary(data.summary || null)
    } catch {
      setError("网络异常，请稍后重试。")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  const handleAction = async (code: string, action: "disable" | "restore") => {
    setActionBusy(code)
    setError(null)
    try {
      const response = await fetch("/api/admin/redemption-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code }),
      })
      const data = (await response.json()) as { ok: boolean; error?: string }
      if (!response.ok || !data.ok) {
        setError(action === "disable" ? "作废失败" : "恢复失败")
        return
      }
      await fetchList()
    } catch {
      setError("网络异常，请稍后重试。")
    } finally {
      setActionBusy(null)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    setCreatedCodes([])
    try {
      const response = await fetch("/api/admin/redemption-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          count: createCount,
          plan: createPlan,
          duration_days: createDuration,
          batch: createBatch || undefined,
          expires_at: createExpiresAt || undefined,
        }),
      })
      const data = (await response.json()) as { ok: boolean; rows?: Array<{ code: string }>; error?: string }
      if (!response.ok || !data.ok) {
        setError("生成失败，请稍后重试。")
        return
      }
      const codes = (data.rows || []).map((row) => row.code)
      setCreatedCodes(codes)
      await fetchList()
    } catch {
      setError("网络异常，请稍后重试。")
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setError("复制失败，请手动复制。")
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("status", statusFilter)
      if (batchFilter) params.set("batch", batchFilter)
      if (query) params.set("query", query)
      params.set("limit", String(Math.min(limit, 5000)))
      params.set("format", "csv")

      const response = await fetch(`/api/admin/redemption-codes?${params.toString()}`)
      if (!response.ok) {
        setError("导出失败，请稍后重试。")
        return
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `redemption_codes_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError("导出失败，请稍后重试。")
    } finally {
      setExporting(false)
    }
  }

  const summaryItems = summary
    ? [
        { label: "未使用", value: summary.unused },
        { label: "已使用", value: summary.used },
        { label: "已作废", value: summary.disabled },
        { label: "已过期", value: summary.expired },
        { label: "总量", value: summary.total },
      ]
    : []

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {summaryItems.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <p className="text-xs text-zinc-400">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[140px]">
            <label className="block text-xs text-zinc-400 mb-2">状态</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            >
              <option value="all">全部</option>
              <option value="unused">未使用</option>
              <option value="used">已使用</option>
              <option value="disabled">已作废</option>
              <option value="expired">已过期</option>
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs text-zinc-400 mb-2">批次</label>
            <input
              value={batchFilter}
              onChange={(event) => setBatchFilter(event.target.value)}
              placeholder="例如 dakebao_20260122"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs text-zinc-400 mb-2">兑换码检索</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="支持模糊搜索"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="min-w-[120px]">
            <label className="block text-xs text-zinc-400 mb-2">数量</label>
            <input
              type="number"
              min={10}
              max={500}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <GlowButton primary onClick={fetchList} disabled={loading}>
            {loading ? "加载中..." : "查询"}
          </GlowButton>
          <GlowButton onClick={handleExport} disabled={exporting}>
            {exporting ? "导出中..." : "导出 CSV"}
          </GlowButton>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">生成兑换码</h2>
          <p className="text-xs text-zinc-400 mt-1">支持批量生成，默认 7 天 trial_pro。</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs text-zinc-400 mb-2">数量</label>
            <input
              type="number"
              min={1}
              max={500}
              value={createCount}
              onChange={(event) => setCreateCount(Number(event.target.value))}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">方案</label>
            <input
              value={createPlan}
              onChange={(event) => setCreatePlan(event.target.value)}
              placeholder="trial_pro"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">有效天数</label>
            <input
              type="number"
              min={1}
              max={365}
              value={createDuration}
              onChange={(event) => setCreateDuration(Number(event.target.value))}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">批次标识</label>
            <input
              value={createBatch}
              onChange={(event) => setCreateBatch(event.target.value)}
              placeholder="可选"
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-2">过期时间</label>
            <input
              type="datetime-local"
              value={createExpiresAt}
              onChange={(event) => setCreateExpiresAt(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <GlowButton primary onClick={handleCreate} disabled={creating}>
            {creating ? "生成中..." : "生成兑换码"}
          </GlowButton>
          {createdCodes.length ? (
            <GlowButton onClick={() => handleCopy(createdCodes.join("\n"))}>复制本次结果</GlowButton>
          ) : null}
        </div>
        {createdCodes.length ? (
          <textarea
            readOnly
            value={createdCodes.join("\n")}
            className="w-full min-h-[140px] rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-200"
          />
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-950/60 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase text-zinc-500 border-b border-white/5">
            <tr>
              <th className="px-4 py-3 text-left font-medium">兑换码</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
              <th className="px-4 py-3 text-left font-medium">方案</th>
              <th className="px-4 py-3 text-left font-medium">天数</th>
              <th className="px-4 py-3 text-left font-medium">批次</th>
              <th className="px-4 py-3 text-left font-medium">创建时间</th>
              <th className="px-4 py-3 text-left font-medium">使用时间</th>
              <th className="px-4 py-3 text-left font-medium">过期时间</th>
              <th className="px-4 py-3 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!hasRows ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-zinc-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const status = formatStatus(row.status, row.expires_at)
                const label = STATUS_LABELS[status] || row.status
                return (
                  <tr key={row.code}>
                    <td className="px-4 py-3 text-zinc-200 font-mono text-xs">{row.code}</td>
                    <td className="px-4 py-3 text-zinc-300">{label}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.plan}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.duration_days}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.batch || "-"}</td>
                    <td className="px-4 py-3 text-zinc-400">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3 text-zinc-400">{formatDate(row.used_at)}</td>
                    <td className="px-4 py-3 text-zinc-400">{formatDate(row.expires_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <GlowButton className="px-3 py-2 text-xs" onClick={() => handleCopy(row.code)}>
                          复制
                        </GlowButton>
                        {row.status === "unused" ? (
                          <GlowButton
                            className="px-3 py-2 text-xs"
                            disabled={actionBusy === row.code}
                            onClick={() => handleAction(row.code, "disable")}
                          >
                            作废
                          </GlowButton>
                        ) : null}
                        {row.status === "disabled" ? (
                          <GlowButton
                            className="px-3 py-2 text-xs"
                            disabled={actionBusy === row.code}
                            onClick={() => handleAction(row.code, "restore")}
                          >
                            恢复
                          </GlowButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
