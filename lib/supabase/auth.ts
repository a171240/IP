import { getSupabaseClient } from './client'
import type { User, Session } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string | null
  nickname: string | null
  avatar_url: string | null
  plan: 'free' | 'basic' | 'pro' | 'vip'
  credits_balance: number
  credits_unlimited: boolean
  trial_granted_at: string | null
  trial_source: string | null
  created_at: string
  updated_at: string
}

/**
 * 邮箱密码注册
 */
export async function signUp(email: string, password: string, nickname?: string) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nickname: nickname || email.split('@')[0]
      }
    }
  })

  return { data, error }
}

/**
 * 邮箱密码登录
 */
export async function signIn(email: string, password: string) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  return { data, error }
}

/**
 * 退出登录
 */
export async function signOut() {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

/**
 * 获取当前用户
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * 获取当前会话
 */
export async function getSession(): Promise<Session | null> {
  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function ensureSessionFromUrl(): Promise<Session | null> {
  if (typeof window === "undefined") return null

  const supabase = getSupabaseClient()
  let session: Session | null = null

  try {
    const hash = window.location.hash ? window.location.hash.slice(1) : ""
    if (hash) {
      const params = new URLSearchParams(hash)
      const accessToken = params.get("access_token")
      const refreshToken = params.get("refresh_token")
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!error) {
          session = data.session ?? session
        }
      }
    }
  } catch {
    // ignore hash parsing errors
  }

  try {
    const search = window.location.search
    if (search) {
      const params = new URLSearchParams(search)
      const code = params.get("code")
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          session = data.session ?? session
        }
      }
    }
  } catch {
    // ignore search parsing errors
  }

  return session
}

/**
 * 获取用户档案
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Error getting profile:', error)
    return null
  }

  return data
}

/**
 * 更新用户档案
 */
export async function updateProfile(updates: Partial<Pick<Profile, 'nickname' | 'avatar_url'>>) {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { data: null, error: new Error('User not authenticated') }
  }

  const { data, error } = await supabase.rpc('update_profile_public', {
    p_nickname: updates.nickname ?? null,
    p_avatar_url: updates.avatar_url ?? null,
  })

  const row = Array.isArray(data) ? data[0] : data
  return { data: (row as Profile | null) ?? null, error }
}

/**
 * 监听认证状态变化
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  const supabase = getSupabaseClient()

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(session?.user || null)
    }
  )

  return subscription
}

/**
 * 发送密码重置邮件
 */
export async function resetPassword(email: string) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`
  })

  return { data, error }
}

/**
 * 更新密码
 */
export async function updatePassword(newPassword: string) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  })

  return { data, error }
}

/**
 * 检查用户是否已登录
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return !!user
}

/**
 * 获取用户会员等级
 */
export async function getUserPlan(): Promise<'free' | 'basic' | 'pro' | 'vip'> {
  const profile = await getProfile()
  return profile?.plan || 'free'
}
