import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 验证环境变量
  if (!url || !key) {
    console.error('Supabase 配置缺失:', {
      url: url ? '已配置' : '未配置',
      key: key ? '已配置' : '未配置'
    })
    throw new Error('Supabase 环境变量未配置，请检查 .env.local 文件')
  }

  // 验证 URL 格式
  try {
    new URL(url)
  } catch {
    console.error('Supabase URL 格式无效:', url)
    throw new Error('Supabase URL 格式无效')
  }

  return createBrowserClient(url, key)
}

// 导出单例客户端，用于客户端组件
let supabaseClient: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!supabaseClient) {
    try {
      supabaseClient = createClient()
    } catch (error) {
      console.error('创建 Supabase 客户端失败:', error)
      throw error
    }
  }
  return supabaseClient
}

// 重置客户端（用于测试或重新连接）
export function resetSupabaseClient() {
  supabaseClient = null
}
