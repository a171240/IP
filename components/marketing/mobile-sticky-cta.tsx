"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Zap } from "lucide-react"
import { GlowButton } from "@/components/ui/obsidian-primitives"

type MobileStickyCtaProps = {
  targetId?: string
}

export function MobileStickyCta({ targetId = "final-cta" }: MobileStickyCtaProps) {
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHidden(entry.isIntersecting)
      },
      { threshold: 0.2 }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [targetId])

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 md:hidden transition-transform duration-200 ${
        isHidden ? "translate-y-full pointer-events-none" : "translate-y-0"
      }`}
      aria-hidden={isHidden}
    >
      <div className="bg-[#030304]/95 border-t border-white/10 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <Link href="/diagnosis" className="flex-1">
            <GlowButton primary className="w-full py-3 text-sm">
              <Zap size={16} />
              免费诊断
              <ArrowRight size={14} />
            </GlowButton>
          </Link>
          <Link
            href="/demo"
            className="px-4 py-3 text-sm text-zinc-300 hover:text-white border border-white/10 rounded-xl transition-colors text-center"
          >
            预约演示
          </Link>
        </div>
      </div>
    </div>
  )
}
