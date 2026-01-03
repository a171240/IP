"use client"
import * as React from "react"
import { Home, Users, BookOpen, Layers, Settings, ChevronRight, Zap, LogOut, User, Bot } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { ThemeToggle } from "@/components/ui/theme-toggle"

// ============================================
// PREMIUM GLASS CARD COMPONENT
// Theme-aware with light/dark support
// ============================================
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

      ${selected
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
      ${hover && !selected ? `
        cursor-pointer
        hover:bg-gradient-to-br hover:from-purple-500/10 hover:to-transparent
        dark:hover:border-purple-500/40 hover:border-purple-400/40
        dark:hover:shadow-[0_0_25px_rgba(168,85,247,0.12)] hover:shadow-[0_4px_20px_rgba(124,58,237,0.08)]
      ` : ""}
      ${hover && selected ? "cursor-pointer" : ""}
      ${glow ? `
        dark:shadow-[0_0_60px_-15px_rgba(168,85,247,0.3),inset_0_0_30px_rgba(168,85,247,0.08)]
        shadow-[0_0_60px_-15px_rgba(124,58,237,0.2),inset_0_0_30px_rgba(124,58,237,0.05)]
      ` : ""}
      ${className}
    `}
    >
      {children}
    </div>
  )
})
// ============================================
// PREMIUM GLOW BUTTON COMPONENT
// Theme-aware with light/dark support
// ============================================
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
      ${primary
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

// ============================================
// NAVIGATION CONFIG
// ============================================
export const navItems = [
  { id: "home", icon: Home, label: "首页", href: "/dashboard" },
  { id: "quick-start", icon: Zap, label: "快速体验", href: "/dashboard/quick-start" },
  { id: "agents", icon: Bot, label: "智能体库", href: "/dashboard/profiles" },
  { id: "content", icon: BookOpen, label: "报告库", href: "/dashboard/reports" },
  { id: "layers", icon: Layers, label: "内容工坊", href: "/dashboard/workflow" },
  { id: "settings", icon: Settings, label: "设置", href: "/dashboard/settings" },
]

// ============================================
// PREMIUM NAVIGATION COMPONENT
// Theme-aware with light/dark support
// ============================================
export const Navigation = () => {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, signOut } = useAuth()
  const mainNavItems = navItems.filter((item) => item.id !== "settings")
  const settingsItem = navItems.find((item) => item.id === "settings")

  const handleSignOut = async () => {
    await signOut()
    router.push("/auth/login")
  }

  // Dynamic active state detection based on current path
  const isItemActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard"
    }
    return pathname.startsWith(href)
  }

  return (
    <>
      <nav className="fixed left-0 top-0 bottom-0 w-[84px] hidden md:flex flex-col items-center dark:bg-zinc-950/80 bg-white/80 backdrop-blur-none md:backdrop-blur-xl border-r dark:border-white/10 border-black/[0.08] py-6 z-50 transition-colors duration-300">
      {/* Logo */}
      <Link href="/" className="mb-8">
        <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-105 transition-all duration-200 select-none">
          IP
        </div>
      </Link>

      {/* Nav Items */}
      <div className="flex-1 flex flex-col items-center gap-1.5 w-full px-2">
        {mainNavItems.map((item) => {
          const isActive = isItemActive(item.href)
          return (
            <Link key={item.id} href={item.href} className="w-full">
              <div
                className={`
                  group relative w-full aspect-square rounded-xl
                  flex items-center justify-center
                  transition-all duration-300 ease-out
                  ${isActive
                    ? `
                      bg-gradient-to-br from-purple-500/15 to-purple-900/10
                      dark:text-purple-400 text-purple-600
                      border-l-[3px] border-purple-500
                      dark:shadow-[0_0_30px_rgba(168,85,247,0.2),inset_0_0_20px_rgba(168,85,247,0.1)]
                      shadow-[0_0_20px_rgba(124,58,237,0.15)]
                    `
                    : `
                      dark:text-zinc-500 text-zinc-400
                      border-l-[3px] border-transparent
                      dark:hover:text-purple-300 hover:text-purple-600
                      hover:bg-purple-500/10
                      dark:hover:border-purple-500/50 hover:border-purple-400/50
                      dark:hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_15px_rgba(124,58,237,0.1)]
                    `
                  }
                `}
              >
                <item.icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />

                {/* Tooltip */}
                <span className="
                  absolute left-full ml-3 px-3 py-1.5
                  dark:bg-zinc-900/95 bg-white
                  dark:text-white text-zinc-800
                  text-xs font-medium
                  rounded-lg border dark:border-purple-500/30 border-purple-300
                  dark:shadow-[0_0_20px_rgba(168,85,247,0.2)] shadow-lg
                  opacity-0 group-hover:opacity-100
                  pointer-events-none
                  transition-opacity duration-150
                  whitespace-nowrap
                  z-50
                ">
                  {item.label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Settings - Bottom */}
      {settingsItem && (
        <div className="px-2 w-full">
          <Link href={settingsItem.href} className="w-full">
            <div
              className={`
                group relative w-full aspect-square rounded-xl
                flex items-center justify-center
                transition-all duration-300 ease-out
                ${isItemActive(settingsItem.href)
                  ? `
                    bg-gradient-to-br from-purple-500/15 to-purple-900/10
                    dark:text-purple-400 text-purple-600
                    border-l-[3px] border-purple-500
                    dark:shadow-[0_0_30px_rgba(168,85,247,0.2),inset_0_0_20px_rgba(168,85,247,0.1)]
                    shadow-[0_0_20px_rgba(124,58,237,0.15)]
                  `
                  : `
                    dark:text-zinc-500 text-zinc-400
                    border-l-[3px] border-transparent
                    dark:hover:text-purple-300 hover:text-purple-600
                    hover:bg-purple-500/10
                    dark:hover:border-purple-500/50 hover:border-purple-400/50
                    dark:hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_15px_rgba(124,58,237,0.1)]
                  `
                }
              `}
            >
              <settingsItem.icon size={22} strokeWidth={isItemActive(settingsItem.href) ? 2.25 : 1.75} />

              <span className="
                absolute left-full ml-3 px-3 py-1.5
                dark:bg-zinc-900/95 bg-white
                dark:text-white text-zinc-800
                text-xs font-medium
                rounded-lg border dark:border-purple-500/30 border-purple-300
                dark:shadow-[0_0_20px_rgba(168,85,247,0.2)] shadow-lg
                opacity-0 group-hover:opacity-100
                pointer-events-none
                transition-opacity duration-150
                whitespace-nowrap
                z-50
              ">
                {settingsItem.label}
              </span>
            </div>
          </Link>
        </div>
      )}

      {/* User Avatar & Logout */}
      {user && (
        <div className="px-2 w-full mt-2 space-y-1.5">
          {/* User Avatar */}
          <div className="group relative w-full aspect-square rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-purple-900/10 border dark:border-purple-500/30 border-purple-300/50">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.nickname || "用户"}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center dark:text-purple-300 text-purple-600 text-sm font-medium">
                {profile?.nickname?.[0] || user.email?.[0]?.toUpperCase() || <User size={16} />}
              </div>
            )}

            <span className="
              absolute left-full ml-3 px-3 py-1.5
              dark:bg-zinc-900/95 bg-white
              dark:text-white text-zinc-800
              text-xs font-medium
              rounded-lg border dark:border-purple-500/30 border-purple-300
              dark:shadow-[0_0_20px_rgba(168,85,247,0.2)] shadow-lg
              opacity-0 group-hover:opacity-100
              pointer-events-none
              transition-opacity duration-150
              whitespace-nowrap
              z-50
            ">
              {profile?.nickname || user.email?.split("@")[0] || "用户"}
            </span>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleSignOut}
            className="
              group relative w-full aspect-square rounded-xl
              flex items-center justify-center
              transition-all duration-300 ease-out
              dark:text-zinc-500 text-zinc-400
              border-l-[3px] border-transparent
              dark:hover:text-red-400 hover:text-red-500
              hover:bg-red-500/10
              dark:hover:border-red-500/50 hover:border-red-400/50
            "
          >
            <LogOut size={20} strokeWidth={1.75} />

            <span className="
              absolute left-full ml-3 px-3 py-1.5
              dark:bg-zinc-900/95 bg-white
              dark:text-white text-zinc-800
              text-xs font-medium
              rounded-lg border dark:border-red-500/30 border-red-300
              dark:shadow-[0_0_20px_rgba(239,68,68,0.2)] shadow-lg
              opacity-0 group-hover:opacity-100
              pointer-events-none
              transition-opacity duration-150
              whitespace-nowrap
              z-50
            ">
              退出登录
            </span>
          </button>
        </div>
      )}
    </nav>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden dark:bg-zinc-950/85 bg-white/90 backdrop-blur-xl border-t dark:border-white/10 border-black/[0.08]">
        <div className="mx-auto max-w-lg px-2 pt-2 pb-[calc(var(--safe-area-bottom)+0.5rem)]">
          <div className="grid grid-cols-6 gap-1">
            {navItems.map((item) => {
              const isActive = isItemActive(item.href)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`
                    flex flex-col items-center justify-center gap-1 rounded-xl py-2
                    text-[9px] sm:text-[10px] font-medium leading-tight
                    transition-colors duration-150
                    ${isActive
                      ? "dark:text-purple-400 text-purple-700 bg-purple-500/10"
                      : "dark:text-zinc-400 text-zinc-500 hover:bg-purple-500/10 hover:dark:text-purple-300 hover:text-purple-700"
                    }
                  `}
                >
                  <item.icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
                  <span className="leading-none">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
    </>
  )
}

// ============================================
// PREMIUM HEADER COMPONENT
// Theme-aware with ThemeToggle in top-right
// ============================================
export const Header = ({
  breadcrumbs,
}: {
  breadcrumbs: Array<{ label: string; href?: string }>
}) => {
  return (
    <header className="h-[calc(3.25rem+var(--safe-area-top))] sm:h-[calc(3.5rem+var(--safe-area-top))] pt-[var(--safe-area-top)] flex items-center justify-between px-3 sm:px-6 dark:bg-zinc-950/80 bg-white/80 backdrop-blur-none md:backdrop-blur-xl border-b dark:border-white/10 border-black/[0.08] sticky top-0 z-40 transition-colors duration-300">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-hidden pr-2">
        {breadcrumbs.map((item, index) => (
          <div key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
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

      {/* Right side: Theme Toggle + Status Indicator */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:flex">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="hidden sm:inline text-[11px] text-emerald-400 font-medium tracking-wide">在线</span>
        </div>
      </div>
    </header>
  )
}

// ============================================
// BACKGROUND COMPONENT
// Theme-aware with different orb colors
// ============================================
export const ObsidianBackground = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden transition-colors duration-500">
    {/* Gradient Orbs - different opacity for light/dark */}
    <div className="absolute top-[-30%] left-[-15%] w-[50%] h-[50%] dark:bg-purple-900/15 bg-purple-400/10 rounded-full blur-[150px]" />
    <div className="absolute bottom-[-30%] right-[-15%] w-[50%] h-[50%] dark:bg-violet-900/15 bg-violet-400/10 rounded-full blur-[150px]" />

    {/* Subtle noise texture */}
    <div
      className="absolute inset-0 dark:opacity-[0.02] opacity-[0.015]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }}
    />
  </div>
)

// ============================================
// PREMIUM INPUT COMPONENT
// Theme-aware with light/dark support
// ============================================
export const PremiumInput = ({
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  rightElement,
}: {
  label: string
  icon: React.ElementType
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  rightElement?: React.ReactNode
}) => (
  <div className="space-y-2 group">
    <label className="block text-[11px] font-semibold dark:text-zinc-400 text-zinc-500 uppercase tracking-wider group-focus-within:text-purple-400 transition-colors duration-300">
      {label}
    </label>
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] dark:text-zinc-500 text-zinc-400 group-focus-within:text-purple-400 transition-colors duration-300" />
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="
          w-full
          dark:bg-zinc-900/50 bg-white
          border dark:border-white/10 border-black/10
          rounded-xl
          dark:text-white text-zinc-900
          text-sm
          pl-11 pr-11 py-3.5
          dark:placeholder:text-zinc-500 placeholder:text-zinc-400
          dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] shadow-sm
          transition-all duration-300 ease-out
          focus:outline-none
          focus:bg-gradient-to-br focus:from-purple-500/10 focus:to-transparent
          dark:focus:border-purple-500/50 focus:border-purple-400
          dark:focus:shadow-[0_0_20px_rgba(168,85,247,0.15),inset_0_0_15px_rgba(168,85,247,0.05)] focus:shadow-[0_0_15px_rgba(124,58,237,0.1)]
        "
      />
      {rightElement}
    </div>
  </div>
)

// ============================================
// METRIC CARD COMPONENT (for dashboard stats)
// Theme-aware with light/dark support
// ============================================
export const MetricCard = ({
  label,
  value,
  change,
  icon: Icon,
  color = "purple",
}: {
  label: string
  value: string
  change?: string
  icon: React.ElementType
  color?: "purple" | "emerald" | "amber" | "blue"
}) => {
  const colorStyles = {
    purple: {
      icon: "dark:text-purple-400 text-purple-600",
      bg: "bg-purple-500/15",
      border: "dark:border-purple-500/30 border-purple-400/30",
      badge: "bg-purple-500/15 dark:text-purple-400 text-purple-600 dark:border-purple-500/30 border-purple-400/30"
    },
    emerald: {
      icon: "dark:text-emerald-400 text-emerald-600",
      bg: "bg-emerald-500/15",
      border: "dark:border-emerald-500/30 border-emerald-400/30",
      badge: "bg-emerald-500/15 dark:text-emerald-400 text-emerald-600 dark:border-emerald-500/30 border-emerald-400/30"
    },
    amber: {
      icon: "dark:text-amber-400 text-amber-600",
      bg: "bg-amber-500/15",
      border: "dark:border-amber-500/30 border-amber-400/30",
      badge: "bg-amber-500/15 dark:text-amber-400 text-amber-600 dark:border-amber-500/30 border-amber-400/30"
    },
    blue: {
      icon: "dark:text-blue-400 text-blue-600",
      bg: "bg-blue-500/15",
      border: "dark:border-blue-500/30 border-blue-400/30",
      badge: "bg-blue-500/15 dark:text-blue-400 text-blue-600 dark:border-blue-500/30 border-blue-400/30"
    },
  }

  const styles = colorStyles[color]

  return (
    <GlassCard hover className="p-5">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl ${styles.bg} ${styles.border} border flex items-center justify-center`}>
          <Icon size={18} className={styles.icon} />
        </div>
        {change && (
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${styles.badge}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold dark:text-white text-zinc-900 tracking-tight mb-1">{value}</p>
      <p className="text-xs dark:text-zinc-500 text-zinc-500 uppercase tracking-wider font-medium">{label}</p>
    </GlassCard>
  )
}
