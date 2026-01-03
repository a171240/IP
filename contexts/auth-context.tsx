"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { User } from "@supabase/supabase-js"
import { getSupabaseClient, onAuthStateChange, signOut as authSignOut, getProfile } from "@/lib/supabase"
import type { Profile } from "@/lib/supabase"
import { withTimeout, withRetry } from "@/lib/utils/timeout"

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // 获取用户档案（带超时和重试）
  const fetchProfile = async () => {
    try {
      const profileData = await withRetry(
        () => getProfile(),
        {
          retries: 2,
          timeout: 10000,
          onRetry: (attempt, error) => {
            console.warn(`获取用户档案失败，正在重试 (${attempt}/2)...`, error.message)
          }
        }
      )
      setProfile(profileData)
    } catch (error) {
      console.error('获取用户档案失败:', error)
      // 即使获取档案失败，也不影响认证状态
      setProfile(null)
    }
  }

  // 初始化用户状态
  useEffect(() => {
    let active = true

    const initAuth = async () => {
      const supabase = getSupabaseClient()
      let sessionUserId: string | null = null

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!active) return
        const sessionUser = session?.user ?? null
        sessionUserId = sessionUser?.id ?? null
        setUser(sessionUser)

        if (sessionUser) {
          // 异步获取档案，不阻塞认证流程
          fetchProfile()
        } else {
          setProfile(null)
        }
      } catch (error) {
        if (!active) return
        console.error('认证初始化失败:', error)
        setUser(null)
        setProfile(null)
      } finally {
        // 先基于本地会话解锁 UI，再后台校验
        if (active) setLoading(false)
      }

      // 后台校验用户状态，避免首屏被网络阻塞
      try {
        const { data: { user } } = await withTimeout(
          supabase.auth.getUser(),
          4000,
          '认证检查超时，请检查网络连接'
        )
        if (!active) return
        const verifiedUserId = user?.id ?? null
        if (verifiedUserId !== sessionUserId) {
          setUser(user)
          if (user) {
            fetchProfile()
          } else {
            setProfile(null)
          }
        }
      } catch (error) {
        if (!active) return
        console.warn('认证校验失败:', error)
      }
    }

    initAuth()

    // 监听认证状态变化
    const subscription = onAuthStateChange(async (user) => {
      setUser(user)
      if (user) {
        // 异步获取档案，不阻塞状态更新
        fetchProfile()
      } else {
        setProfile(null)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // 登出
  const signOut = async () => {
    await authSignOut()
    setUser(null)
    setProfile(null)
  }

  // 刷新档案
  const refreshProfile = async () => {
    if (user) {
      await fetchProfile()
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
