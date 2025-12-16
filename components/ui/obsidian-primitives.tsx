"use client"
import * as React from "react"

type GlassCardProps = {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: boolean
  selected?: boolean
  onClick?: () => void
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { children, className = "", hover = false, glow = false, selected = false, onClick },
  ref
) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`
      relative
      backdrop-blur-none md:backdrop-blur-xl
      border
      rounded-2xl
      transition-all duration-300 ease-out

      /* Base background - theme aware */
      dark:bg-zinc-900/50 bg-white/80

      ${
        selected
          ? `
          bg-gradient-to-br from-purple-500/10 to-purple-900/5
          dark:border-purple-500/50 border-purple-400/50
          dark:shadow-[0_0_30px_rgba(168,85,247,0.15),inset_0_0_20px_rgba(168,85,247,0.05)]
          shadow-[0_0_30px_rgba(124,58,237,0.1),inset_0_0_20px_rgba(124,58,237,0.03)]
        `
          : `
          dark:border-white/10 border-black/[0.08]
          dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] shadow-[0_1px_3px_rgba(0,0,0,0.05),inset_0_1px_0_0_rgba(255,255,255,0.5)]
        `
      }
      ${
        hover && !selected
          ? `
        cursor-pointer
        hover:bg-gradient-to-br hover:from-purple-500/10 hover:to-transparent
        dark:hover:border-purple-500/40 hover:border-purple-400/40
        dark:hover:shadow-[0_0_25px_rgba(168,85,247,0.12)] hover:shadow-[0_4px_20px_rgba(124,58,237,0.08)]
      `
          : ""
      }
      ${hover && selected ? "cursor-pointer" : ""}
      ${
        glow
          ? `
        dark:shadow-[0_0_60px_-15px_rgba(168,85,247,0.3),inset_0_0_30px_rgba(168,85,247,0.08)]
        shadow-[0_0_60px_-15px_rgba(124,58,237,0.2),inset_0_0_30px_rgba(124,58,237,0.05)]
      `
          : ""
      }
      ${className}
    `}
    >
      {children}
    </div>
  )
})

export const GlowButton = ({
  children,
  primary = false,
  className = "",
  type = "button",
  disabled = false,
  onClick,
}: {
  children: React.ReactNode
  primary?: boolean
  className?: string
  type?: "button" | "submit"
  disabled?: boolean
  onClick?: () => void
}) => (
  <button
    type={type}
    disabled={disabled}
    onClick={onClick}
    className={`
      relative px-5 py-3 rounded-xl font-semibold text-sm
      transition-all duration-200 ease-out
      overflow-hidden group
      flex items-center justify-center gap-2
      ${
        primary
          ? `
          bg-gradient-to-r from-purple-500 to-purple-600 text-white
          shadow-[0_0_0_1px_rgba(147,51,234,0.3),0_4px_16px_-4px_rgba(147,51,234,0.4)]
          hover:from-purple-400 hover:to-purple-500
          hover:shadow-[0_0_0_1px_rgba(147,51,234,0.5),0_0_30px_-4px_rgba(147,51,234,0.6)]
          active:scale-[0.98] active:shadow-[0_0_0_1px_rgba(147,51,234,0.6),0_0_40px_-4px_rgba(147,51,234,0.7)]
        `
          : `
          dark:bg-zinc-900/50 bg-white
          dark:text-white text-zinc-800
          border dark:border-white/10 border-black/10
          dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] shadow-sm
          dark:hover:bg-purple-600/20 hover:bg-purple-50
          dark:hover:border-purple-500/40 hover:border-purple-400
          dark:hover:text-purple-100 hover:text-purple-700
          dark:hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_0_20px_-4px_rgba(147,51,234,0.4)] hover:shadow-md
          active:scale-[0.98]
        `
      }
      ${disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}
      ${className}
    `}
  >
    {primary && (
      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    )}
    <span className="relative flex items-center gap-2">{children}</span>
  </button>
)
