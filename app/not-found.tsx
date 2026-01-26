import Link from "next/link"
import { ArrowRight, Home, Zap } from "lucide-react"
import { ObsidianBackgroundLite } from "@/components/ui/obsidian-background-lite"
import { GlowButton } from "@/components/ui/obsidian-primitives"

export default function NotFound() {
  return (
    <div className="relative min-h-[100dvh] bg-[#030304] text-zinc-200 font-sans flex items-center justify-center px-4 sm:px-6">
      <ObsidianBackgroundLite />

      <div className="relative max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-400 mb-6">
          404 · 页面不存在
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-tight">页面不存在</h1>
        <p className="text-sm sm:text-base text-zinc-500 mb-10">
          你访问的页面已被移动或不存在，可以返回首页或继续体验免费诊断与预约演示。
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/">
            <GlowButton className="px-6 py-3 text-sm">
              <Home size={16} />
              返回首页
            </GlowButton>
          </Link>
          <Link href="/diagnosis">
            <GlowButton primary className="px-6 py-3 text-sm">
              <Zap size={16} />
              去免费诊断
              <ArrowRight size={14} />
            </GlowButton>
          </Link>
          <Link
            href="/demo"
            className="px-6 py-3 text-sm text-zinc-300 hover:text-white border border-white/10 rounded-xl transition-colors"
          >
            去预约演示
          </Link>
        </div>
      </div>
    </div>
  )
}
