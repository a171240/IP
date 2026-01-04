import Link from "next/link"
import { ChevronRight } from "lucide-react"

type Breadcrumb = {
  label: string
  href?: string
}

export function MarketingHeader({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  return (
    <header className="h-[calc(3.25rem+var(--safe-area-top))] sm:h-[calc(3.5rem+var(--safe-area-top))] pt-[var(--safe-area-top)] flex items-center justify-between px-3 sm:px-6 dark:bg-zinc-950/80 bg-white/80 backdrop-blur-none md:backdrop-blur-xl border-b dark:border-white/10 border-black/[0.08] sticky top-0 z-40 transition-colors duration-300">
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-hidden pr-2">
        {breadcrumbs.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex items-center gap-1.5 whitespace-nowrap">
            {index > 0 && <ChevronRight size={14} className="dark:text-zinc-600 text-zinc-400" />}
            {item.href ? (
              <Link
                href={item.href}
                className="text-xs sm:text-sm dark:text-zinc-500 text-zinc-500 dark:hover:text-zinc-300 hover:text-zinc-700 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-xs sm:text-sm dark:text-white text-zinc-900 font-medium">{item.label}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="hidden sm:inline text-[11px] text-emerald-400 font-medium tracking-wide">在线</span>
      </div>
    </header>
  )
}
