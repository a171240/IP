"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // 避免服务端渲染时的 hydration 问题
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className="
          relative w-9 h-9 rounded-lg
          flex items-center justify-center
          bg-surface/50 border border-border
          transition-all duration-200
        "
        aria-label="切换主题"
      >
        <div className="w-4 h-4" />
      </button>
    )
  }

  const isDark = resolvedTheme === "dark"

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative w-9 h-9 rounded-lg
        flex items-center justify-center
        transition-all duration-300 ease-out
        overflow-hidden group
        ${isDark
          ? `
            bg-zinc-900/50 border border-white/10
            hover:bg-purple-500/10 hover:border-purple-500/40
            hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]
          `
          : `
            bg-white border border-black/10
            hover:bg-violet-50 hover:border-violet-300
            shadow-sm hover:shadow-md
          `
        }
      `}
      aria-label={isDark ? "切换到亮色模式" : "切换到暗色模式"}
    >
      {/* Sun Icon */}
      <Sun
        size={16}
        className={`
          absolute transition-all duration-300 ease-out
          ${isDark
            ? "opacity-0 rotate-90 scale-0 text-amber-400"
            : "opacity-100 rotate-0 scale-100 text-amber-500"
          }
        `}
      />

      {/* Moon Icon */}
      <Moon
        size={16}
        className={`
          absolute transition-all duration-300 ease-out
          ${isDark
            ? "opacity-100 rotate-0 scale-100 text-purple-400"
            : "opacity-0 -rotate-90 scale-0 text-slate-700"
          }
        `}
      />
    </button>
  )
}

// 带下拉菜单的主题切换组件（可选使用）
export function ThemeToggleDropdown() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  const isDark = resolvedTheme === "dark"

  const options = [
    { value: "light", label: "亮色", icon: Sun },
    { value: "dark", label: "暗色", icon: Moon },
    { value: "system", label: "跟随系统", icon: null },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative w-9 h-9 rounded-lg
          flex items-center justify-center
          transition-all duration-200
          ${isDark
            ? "bg-zinc-900/50 border border-white/10 hover:bg-purple-500/10 hover:border-purple-500/40"
            : "bg-white border border-black/10 hover:bg-violet-50 shadow-sm"
          }
        `}
        aria-label="切换主题"
      >
        {isDark ? (
          <Moon size={16} className="text-purple-400" />
        ) : (
          <Sun size={16} className="text-amber-500" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Menu */}
          <div className={`
            absolute right-0 mt-2 w-36 rounded-xl z-50
            border shadow-lg
            animate-fade-in
            ${isDark
              ? "bg-zinc-900/95 border-white/10 backdrop-blur-xl"
              : "bg-white border-black/10"
            }
          `}>
            {options.map((option) => {
              const isActive = theme === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value)
                    setIsOpen(false)
                  }}
                  className={`
                    w-full px-3 py-2 text-sm text-left
                    flex items-center gap-2
                    first:rounded-t-xl last:rounded-b-xl
                    transition-colors duration-150
                    ${isActive
                      ? isDark
                        ? "bg-purple-500/15 text-purple-400"
                        : "bg-violet-50 text-violet-700"
                      : isDark
                        ? "text-zinc-300 hover:bg-white/5"
                        : "text-zinc-700 hover:bg-zinc-50"
                    }
                  `}
                >
                  {option.icon && <option.icon size={14} />}
                  {!option.icon && <span className="w-[14px]" />}
                  {option.label}
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current" />
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
