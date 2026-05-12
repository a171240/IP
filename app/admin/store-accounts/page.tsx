import Link from "next/link"

import StoreAccountsClient from "./store-accounts-client"
import { getAdminSession } from "@/lib/admin/auth.server"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"

export default async function AdminStoreAccountsPage() {
  const { user, isAdmin } = await getAdminSession()

  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#050505] px-6 text-zinc-200">
        <ObsidianBackgroundLite />
        <div className="relative z-10 max-w-md text-center">
          <p className="text-sm font-medium text-amber-200">管理后台</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">请先登录管理员账号</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">客户和门店开通只在后端 Web 管理，不放到小程序应用端。</p>
          <Link
            href="/auth/login"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-amber-200 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-100"
          >
            去登录
          </Link>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#050505] px-6 text-zinc-200">
        <ObsidianBackgroundLite />
        <div className="relative z-10 max-w-md text-center">
          <p className="text-sm font-medium text-rose-200">无权访问</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">当前账号不是管理员</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">请使用配置在 ADMIN_EMAILS 或 ADMIN_USER_IDS 里的管理员账号。</p>
          <Link href="/" className="mt-6 inline-flex text-sm font-medium text-amber-200 hover:text-amber-100">
            返回首页
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#060606] px-6 py-8 text-zinc-100">
      <ObsidianBackgroundLite />
      <main className="relative z-10 mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-amber-200">内部运营后台</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">客户与门店开通</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              在这里创建客户主体和门店，生成负责人绑定二维码；小程序只保留负责人绑定、员工加入和门店工作台。
            </p>
          </div>
          <div className="rounded-md border border-amber-200/25 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
            当前登录：{user.email || user.id}
          </div>
        </header>

        <StoreAccountsClient />
      </main>
    </div>
  )
}
