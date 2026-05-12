"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  Ban,
  Building2,
  Copy,
  Download,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  Store,
  UserCheck,
} from "lucide-react"

type Stats = {
  company_count: number
  store_count: number
  owner_bound_store_count: number
  active_invite_count: number
  session_count: number
  ai_points_spent: number
}

type CompanyRow = {
  id: string
  name: string
  status: string
  owner_display_name: string
  created_at: string | null
  store_count: number
  member_count: number
  session_count: number
  ai_points_spent: number
}

type StoreRow = {
  id: string
  company_id: string
  company_name: string
  name: string
  status: string
  created_at: string | null
  owner_count: number
  owner_names: string[]
  staff_count: number
  member_count: number
  session_count: number
  practice_seconds: number
  avg_score: number | null
  ai_points_spent: number
  latest_owner_invite: null | {
    id: string
    status: string
    status_label: string
    max_uses: number
    used_count: number
    expires_at: string
    created_at: string | null
  }
}

type InviteRow = {
  id: string
  company_id: string
  company_name: string
  store_id: string | null
  store_name: string
  role_label: string
  max_uses: number
  used_count: number
  expires_at: string
  created_at: string | null
  status: string
  status_label: string
  note: string
}

type Payload = {
  ok: boolean
  stats: Stats
  companies: CompanyRow[]
  stores: StoreRow[]
  invites: InviteRow[]
  error?: string
}

type CreatedInvite = {
  token: string
  path: string
  qrcode_url: string
  invite: {
    id: string
    company_name: string
    store_name: string
    role_label: string
    expires_at: string
    max_uses: number
    used_count: number
  }
}

const API_URL = "/api/admin/mp/store-accounts"
const EMPTY_COMPANIES: CompanyRow[] = []
const EMPTY_STORES: StoreRow[] = []
const EMPTY_INVITES: InviteRow[] = []

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatSeconds(value: number) {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  return `${hours} 小时`
}

function statusClass(status: string) {
  if (status === "active") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
  if (status === "used") return "border-sky-400/30 bg-sky-400/10 text-sky-200"
  if (status === "expired") return "border-zinc-400/25 bg-zinc-400/10 text-zinc-300"
  if (status === "revoked") return "border-rose-400/30 bg-rose-400/10 text-rose-200"
  return "border-white/10 bg-white/5 text-zinc-300"
}

function shortId(value: string) {
  if (!value) return ""
  if (value.length <= 12) return value
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

export default function StoreAccountsClient() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState("")
  const [storeName, setStoreName] = useState("")
  const [storeCompanyId, setStoreCompanyId] = useState("")
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null)

  const companies = payload?.companies ?? EMPTY_COMPANIES
  const stores = payload?.stores ?? EMPTY_STORES
  const invites = payload?.invites ?? EMPTY_INVITES

  const selectedCompanyName = useMemo(
    () => companies.find((company) => company.id === storeCompanyId)?.name || "",
    [companies, storeCompanyId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(API_URL, { cache: "no-store" })
      const data = (await response.json()) as Payload
      if (!response.ok || !data.ok) throw new Error(data.error || "加载失败")
      setPayload(data)
      if (!storeCompanyId && data.companies?.[0]?.id) setStoreCompanyId(data.companies[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [storeCompanyId])

  useEffect(() => {
    load()
  }, [load])

  async function postAction(body: Record<string, unknown>) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) throw new Error(data?.error || "操作失败")
    return data
  }

  async function handleCreateCompany() {
    const name = companyName.trim()
    if (!name) {
      setError("请填写客户名称")
      return
    }

    setBusy("company")
    setError(null)
    setNotice(null)
    try {
      const data = await postAction({ action: "create_company", name })
      setCompanyName("")
      setStoreCompanyId(data.company?.id || storeCompanyId)
      setNotice(`${data.company?.name || name} 已创建`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "客户创建失败")
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateStore() {
    const name = storeName.trim()
    if (!storeCompanyId) {
      setError("请先选择客户主体")
      return
    }
    if (!name) {
      setError("请填写门店名称")
      return
    }

    setBusy("store")
    setError(null)
    setNotice(null)
    try {
      const data = await postAction({ action: "create_store", company_id: storeCompanyId, name })
      setStoreName("")
      setNotice(`${selectedCompanyName || "客户"} / ${data.store?.name || name} 已创建`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "门店创建失败")
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateOwnerInvite(store: StoreRow) {
    setBusy(`invite:${store.id}`)
    setError(null)
    setNotice(null)
    try {
      const data = (await postAction({
        action: "create_owner_invite",
        store_id: store.id,
        note: "负责人绑定入口",
      })) as CreatedInvite & { ok: boolean }
      setCreatedInvite({
        token: data.token,
        path: data.path,
        qrcode_url: data.qrcode_url,
        invite: data.invite,
      })
      setNotice(`${store.name} 的负责人绑定入口已生成`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "入口生成失败")
    } finally {
      setBusy(null)
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setBusy(`revoke:${inviteId}`)
    setError(null)
    setNotice(null)
    try {
      await postAction({ action: "revoke_invite", invite_id: inviteId })
      setNotice("绑定入口已撤销")
      if (createdInvite?.invite.id === inviteId) setCreatedInvite(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败")
    } finally {
      setBusy(null)
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`${label}已复制`)
    } catch {
      setError("复制失败，请手动复制")
    }
  }

  function downloadQr(invite: CreatedInvite) {
    const link = document.createElement("a")
    link.href = invite.qrcode_url
    link.download = `${invite.invite.store_name || "store"}-owner-qrcode.png`
    link.target = "_blank"
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const statItems = payload
    ? [
        { label: "客户主体", value: payload.stats.company_count, icon: Building2 },
        { label: "门店", value: payload.stats.store_count, icon: Store },
        { label: "已绑定负责人", value: payload.stats.owner_bound_store_count, icon: UserCheck },
        { label: "有效入口", value: payload.stats.active_invite_count, icon: QrCode },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-400">
          第一阶段只做开通与绑定。AI 点数仍按个人扣费，这里先按门店统计消耗。
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 transition hover:bg-white/10 disabled:opacity-60"
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          刷新
        </button>
      </div>

      {error ? <div className="rounded-md border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 md:grid-cols-4">
        {statItems.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-md border border-white/10 bg-zinc-950/70 p-4">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-sm">{item.label}</span>
                <Icon className="size-4 text-amber-200" />
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{item.value}</div>
            </div>
          )
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-zinc-950/70 p-5">
            <div className="flex items-center gap-2 text-white">
              <Building2 className="size-5 text-amber-200" />
              <h2 className="font-semibold">新建客户主体</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">客户主体用于归属多个门店；单店客户也先建一个主体。</p>
            <label className="mt-5 block text-xs font-medium text-zinc-400">客户名称</label>
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="例如：杭州西湖美业"
              className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-200/60"
            />
            <button
              type="button"
              onClick={handleCreateCompany}
              disabled={busy === "company"}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-200 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-100 disabled:opacity-60"
            >
              {busy === "company" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              创建客户
            </button>
          </div>

          <div className="rounded-md border border-white/10 bg-zinc-950/70 p-5">
            <div className="flex items-center gap-2 text-white">
              <Store className="size-5 text-amber-200" />
              <h2 className="font-semibold">新建门店</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">门店创建后，在右侧列表生成负责人绑定入口。</p>
            <label className="mt-5 block text-xs font-medium text-zinc-400">所属客户主体</label>
            <select
              value={storeCompanyId}
              onChange={(event) => setStoreCompanyId(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition focus:border-amber-200/60"
            >
              <option value="">请选择客户</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-xs font-medium text-zinc-400">门店名称</label>
            <input
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              placeholder="例如：西湖银泰店"
              className="mt-2 h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-200/60"
            />
            <button
              type="button"
              onClick={handleCreateStore}
              disabled={busy === "store" || !companies.length}
              className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
            >
              {busy === "store" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              创建门店
            </button>
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-zinc-950/70">
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-white">门店列表</h2>
              <p className="mt-1 text-sm text-zinc-400">生成负责人入口后，发二维码给店长扫码绑定。</p>
            </div>
            <div className="text-sm text-zinc-500">{loading ? "加载中..." : `${stores.length} 个门店`}</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">门店</th>
                  <th className="px-5 py-3 font-medium">负责人</th>
                  <th className="px-5 py-3 font-medium">员工/训练</th>
                  <th className="px-5 py-3 font-medium">入口状态</th>
                  <th className="px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {stores.map((store) => (
                  <tr key={store.id} className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">{store.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{store.company_name || "未归属客户"} · {shortId(store.id)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-zinc-200">{store.owner_count ? store.owner_names.join("、") : "未绑定"}</div>
                      <div className="mt-1 text-xs text-zinc-500">{store.owner_count} 个负责人</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-zinc-200">{store.member_count} 人 · {store.session_count} 次</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {formatSeconds(store.practice_seconds)} · {store.avg_score == null ? "暂无均分" : `${store.avg_score} 分`} · {store.ai_points_spent} 点
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {store.latest_owner_invite ? (
                        <div className="space-y-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusClass(store.latest_owner_invite.status)}`}>
                            {store.latest_owner_invite.status_label}
                          </span>
                          <div className="text-xs text-zinc-500">
                            {store.latest_owner_invite.used_count}/{store.latest_owner_invite.max_uses} · 到期 {formatDate(store.latest_owner_invite.expires_at)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-500">未生成</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleCreateOwnerInvite(store)}
                          disabled={busy === `invite:${store.id}`}
                          className="inline-flex h-9 items-center gap-2 rounded-md bg-amber-200 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-amber-100 disabled:opacity-60"
                        >
                          {busy === `invite:${store.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <QrCode className="size-3.5" />}
                          负责人入口
                        </button>
                        {store.latest_owner_invite?.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(store.latest_owner_invite!.id)}
                            disabled={busy === `revoke:${store.latest_owner_invite.id}`}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
                          >
                            <Ban className="size-3.5" />
                            撤销
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!stores.length && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-500">
                      还没有门店。先创建客户主体，再创建门店。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {createdInvite ? (
        <section className="grid gap-4 rounded-md border border-amber-200/25 bg-amber-200/10 p-5 lg:grid-cols-[220px_1fr]">
          <div className="rounded-md border border-white/10 bg-white p-3">
            <Image
              src={createdInvite.qrcode_url}
              alt="负责人绑定二维码"
              width={220}
              height={220}
              unoptimized
              className="aspect-square w-full object-contain"
            />
          </div>
          <div className="flex flex-col justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-amber-100">负责人绑定入口</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{createdInvite.invite.store_name}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                发给门店负责人。对方扫码后进入小程序，确认“绑定为门店负责人”，随后可以邀请员工加入。
              </p>
              <div className="mt-4 rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs text-zinc-300">
                {createdInvite.path}
              </div>
              <p className="mt-2 text-xs text-zinc-500">有效期到 {formatDate(createdInvite.invite.expires_at)}，仅限 1 人绑定。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyText(createdInvite.path, "小程序路径")}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
              >
                <Copy className="size-4" />
                复制路径
              </button>
              <button
                type="button"
                onClick={() => copyText(createdInvite.qrcode_url, "二维码地址")}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
              >
                <Copy className="size-4" />
                复制二维码地址
              </button>
              <button
                type="button"
                onClick={() => downloadQr(createdInvite)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 px-4 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
              >
                <Download className="size-4" />
                下载二维码
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-white/10 bg-zinc-950/70">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="font-semibold text-white">最近负责人入口</h2>
          <p className="mt-1 text-sm text-zinc-400">历史入口不保存明文 token，因此只能查看状态和撤销，不能重新展示二维码。</p>
        </div>
        <div className="divide-y divide-white/10">
          {invites.slice(0, 10).map((invite) => (
            <div key={invite.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{invite.store_name || "未归属门店"}</span>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusClass(invite.status)}`}>{invite.status_label}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {invite.company_name || "未归属客户"} · {invite.used_count}/{invite.max_uses} · 创建 {formatDate(invite.created_at)} · 到期 {formatDate(invite.expires_at)}
                </div>
              </div>
              {invite.status === "active" ? (
                <button
                  type="button"
                  onClick={() => handleRevokeInvite(invite.id)}
                  disabled={busy === `revoke:${invite.id}`}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-60"
                >
                  <Ban className="size-3.5" />
                  撤销入口
                </button>
              ) : null}
            </div>
          ))}
          {!invites.length && !loading ? <div className="px-5 py-8 text-sm text-zinc-500">还没有生成过负责人入口。</div> : null}
        </div>
      </section>
    </div>
  )
}
