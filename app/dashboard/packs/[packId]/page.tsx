import Link from "next/link"
import { notFound } from "next/navigation"

import { Header, GlassCard, GlowButton } from "@/components/ui/obsidian"
import { solutionPacksConfig } from "@/lib/agents/config"
import { listPackFiles } from "@/lib/packs/packs.server"

export default async function PackDetailPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params

  const pack = solutionPacksConfig.find((p) => p.id === packId)
  if (!pack) return notFound()

  const sourcePath = (pack as unknown as { sourcePath?: string }).sourcePath
  if (!sourcePath) return notFound()

  let files: { relativePath: string; fileName: string }[] = []
  let listError: string | null = null
  try {
    const result = await listPackFiles(packId)
    files = result.files
  } catch (e) {
    listError = e instanceof Error ? e.message : "加载失败"
  }

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: "首页", href: "/dashboard" },
          { label: "智能体库", href: "/dashboard/profiles" },
          { label: "解决方案包", href: "/dashboard/profiles?tab=packs" },
          { label: pack.name },
        ]}
      />

      <main className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-medium dark:text-white text-zinc-900 tracking-tight">{pack.name}</h1>
          <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-2">{pack.description}</p>
          <p className="text-xs dark:text-zinc-500 text-zinc-500 mt-2">来源：提示词/{sourcePath}</p>
        </div>

        <GlassCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm dark:text-white text-zinc-900 font-medium">文件列表</div>
            <div className="text-xs dark:text-zinc-400 text-zinc-500">共 {files.length} 个</div>
          </div>
        </GlassCard>

        <div className="grid gap-2">
          {listError ? (
            <GlassCard className="p-4 border border-red-500/30 bg-red-500/10">
              <div className="text-sm text-red-200">{listError}</div>
            </GlassCard>
          ) : null}

          {files.map((f) => (
            <GlassCard key={f.relativePath} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm dark:text-white text-zinc-900 truncate">{f.fileName}</div>
                  <div className="text-xs dark:text-zinc-500 text-zinc-500 truncate">{f.relativePath}</div>
                </div>
                <Link
                  href={`/api/packs/${encodeURIComponent(packId)}/download?file=${encodeURIComponent(f.relativePath)}`}
                  prefetch={false}
                >
                  <GlowButton className="text-xs">下载</GlowButton>
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      </main>
    </div>
  )
}
