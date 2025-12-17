import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from './client'

// 类型定义
export interface Message {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: string
}

export interface Conversation {
  id: string
  user_id: string
  project_id?: string
  step_id: string
  step_title?: string
  messages: Message[]
  status: 'in_progress' | 'completed' | 'archived'
  created_at: string
  updated_at: string
}

export interface Report {
  id: string
  user_id: string
  project_id?: string
  conversation_id?: string
  step_id: string
  title: string
  content: string
  summary?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ReportPreview {
  id: string
  step_id: string
  title: string
  summary?: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}



export interface ReportListItem {
  id: string
  step_id: string
  title: string
  summary?: string
  created_at: string
  updated_at: string
}

export interface KnowledgeDoc {
  id: string
  user_id: string
  project_id?: string
  doc_type: string
  title: string
  content: string
  generated_by: string
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WorkflowProgress {
  id: string
  user_id: string
  project_id?: string
  step_id: string
  status: 'pending' | 'in_progress' | 'completed'
  completed_at?: string
  created_at: string
  updated_at: string
}
async function resolveUserId(supabase: SupabaseClient, userId?: string): Promise<string | null> {
  if (userId) return userId
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}



// ============================================
// 对话相关操作
// ============================================

/**
 * 创建新对话
 */
export async function createConversation(
  stepId: string,
  stepTitle: string,
  projectId?: string,
  userId?: string
): Promise<Conversation | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) {
    console.error('User not authenticated')
    return null
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: resolvedUserId,
      project_id: projectId,
      step_id: stepId,
      step_title: stepTitle,
      messages: [],
      status: 'in_progress'
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating conversation:', error)
    return null
  }

  return data
}

/**
 * 获取对话
 */
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (error) {
    console.error('Error getting conversation:', error)
    return null
  }

  return data
}

/**
 * 获取用户某个步骤的最新对话
 */
export async function getLatestConversation(
  stepId: string,
  projectId?: string,
  userId?: string
): Promise<Conversation | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return null

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('user_id', resolvedUserId)
    .eq('step_id', stepId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query.single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error getting latest conversation:', error)
    return null
  }

  return data || null
}

/**
 * 更新对话消息
 */
export async function updateConversationMessages(
  conversationId: string,
  messages: Message[]
): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('conversations')
    .update({ messages })
    .eq('id', conversationId)

  if (error) {
    console.error('Error updating conversation:', error)
    return false
  }

  return true
}

/**
 * 完成对话
 */
export async function completeConversation(conversationId: string): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('conversations')
    .update({ status: 'completed' })
    .eq('id', conversationId)

  if (error) {
    console.error('Error completing conversation:', error)
    return false
  }

  return true
}

/**
 * 更新对话状态（用于继续历史对话）
 */
export async function setConversationStatus(
  conversationId: string,
  status: Conversation['status']
): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('conversations')
    .update({ status })
    .eq('id', conversationId)

  if (error) {
    console.error('Error updating conversation status:', error)
    return false
  }

  return true
}

/**
 * 获取用户所有对话
 */
export async function getUserConversations(projectId?: string): Promise<Conversation[]> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting user conversations:', error)
    return []
  }

  return data || []
}


/**
 * Get all conversations for a step (latest first)
 */
export async function getStepConversations(
  stepId: string,
  projectId?: string,
  userId?: string
): Promise<Conversation[]> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return []

  let query = supabase
    .from('conversations')
    .select('*')
    .eq('user_id', resolvedUserId)
    .eq('step_id', stepId)
    .order('updated_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting step conversations:', error)
    return []
  }

  return data || []
}

/**
 * Delete a report (owner only)
 */
export async function deleteReport(reportId: string): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    console.error('User not authenticated')
    return false
  }

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', reportId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error deleting report:', error)
    return false
  }

  return true
}

// ============================================
// 报告相关操作
// ============================================

/**
 * 保存报告
 */
export async function saveReport(
  stepId: string,
  title: string,
  content: string,
  conversationId?: string,
  projectId?: string,
  summary?: string,
  metadata?: Record<string, unknown>,
  userId?: string
): Promise<Report | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) {
    console.error('User not authenticated')
    return null
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: resolvedUserId,
      project_id: projectId,
      conversation_id: conversationId,
      step_id: stepId,
      title,
      content,
      summary,
      metadata: metadata || {}
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving report:', error)
    return null
  }

  return data
}

/**
 * 获取报告
 */
export async function getReport(reportId: string): Promise<Report | null> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error) {
    console.error('Error getting report:', error)
    return null
  }

  return data
}

/**
 * Get latest report for a conversation (created_at desc)
 */
export async function getLatestReportByConversation(conversationId: string, userId?: string): Promise<Report | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return null

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', resolvedUserId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('Error getting latest report by conversation:', error)
    return null
  }

  return (data && data[0]) || null
}

export async function getLatestReport(stepId: string, projectId?: string, userId?: string): Promise<Report | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return null

  let query = supabase
    .from('reports')
    .select('*')
    .eq('user_id', resolvedUserId)
    .eq('step_id', stepId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting latest report:', error)
    return null
  }

  return (data && data[0]) || null
}

export async function getUserReports(projectId?: string, userId?: string): Promise<Report[]> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return []

  let query = supabase
    .from('reports')
    .select('*')
    .eq('user_id', resolvedUserId)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting user reports:', error)
    return []
  }

  return data || []
}


/**
 * ??????????? content??? payload?
 */
export async function getUserReportList(projectId?: string, userId?: string): Promise<ReportListItem[]> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return []

  let query = supabase
    .from('reports')
    .select('id, step_id, title, summary, created_at, updated_at')
    .eq('user_id', resolvedUserId)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting user report list:', error)
    return []
  }

  return (data as ReportListItem[]) || []
}

/**
 * 获取用户最近报告预览（只带元数据，减少 payload）
 */
export async function getUserReportsPreview(
  projectId?: string,
  limit = 5,
  userId?: string
): Promise<ReportPreview[]> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return []

  let query = supabase
    .from('reports')
    .select('id, step_id, title, summary, metadata, created_at, updated_at')
    .eq('user_id', resolvedUserId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting user report previews:', error)
    return []
  }

  return (data as ReportPreview[]) || []
}

/**
 * 获取用户报告总数（用于 Dashboard 中展示）
 */
export async function getUserReportCount(
  projectId?: string,
  userId?: string
): Promise<number> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return 0

  let query = supabase
    .from('reports')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', resolvedUserId)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { count, error } = await query

  if (error) {
    console.error('Error counting user reports:', error)
    return 0
  }

  return count || 0
}

// ============================================
// 知识库文档相关操作
// ============================================

/**
 * 保存知识库文档
 */
export async function saveKnowledgeDoc(
  docType: string,
  title: string,
  content: string,
  generatedBy: string,
  projectId?: string,
  userId?: string
): Promise<KnowledgeDoc | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) {
    console.error('User not authenticated')
    return null
  }

  // 先将同类型的旧文档设为非激活
  await supabase
    .from('knowledge_docs')
    .update({ is_active: false })
    .eq('user_id', resolvedUserId)
    .eq('doc_type', docType)
    .eq('project_id', projectId || null)

  // 获取最新版本号
  const { data: latestDoc } = await supabase
    .from('knowledge_docs')
    .select('version')
    .eq('user_id', resolvedUserId)
    .eq('doc_type', docType)
    .eq('project_id', projectId || null)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const newVersion = (latestDoc?.version || 0) + 1

  const { data, error } = await supabase
    .from('knowledge_docs')
    .insert({
      user_id: resolvedUserId,
      project_id: projectId,
      doc_type: docType,
      title,
      content,
      generated_by: generatedBy,
      version: newVersion,
      is_active: true
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving knowledge doc:', error)
    return null
  }

  return data
}

/**
 * 获取激活的知识库文档
 */
export async function getActiveKnowledgeDoc(
  docType: string,
  projectId?: string,
  userId?: string
): Promise<KnowledgeDoc | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return null

  let query = supabase
    .from('knowledge_docs')
    .select('*')
    .eq('user_id', resolvedUserId)
    .eq('doc_type', docType)
    .eq('is_active', true)

  if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    query = query.is('project_id', null)
  }

  const { data, error } = await query.single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error getting knowledge doc:', error)
    return null
  }

  return data || null
}

export async function getUserKnowledgeDocs(projectId?: string): Promise<KnowledgeDoc[]> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return []

  let query = supabase
    .from('knowledge_docs')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting user knowledge docs:', error)
    return []
  }

  return data || []
}

// ============================================
// 工作流进度相关操作
// ============================================

/**
 * 更新步骤进度
 */
export async function updateStepProgress(
  stepId: string,
  status: 'pending' | 'in_progress' | 'completed',
  projectId?: string,
  userId?: string
): Promise<WorkflowProgress | null> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) {
    console.error('User not authenticated')
    return null
  }

  // 先查找是否存在该记录
  let query = supabase
    .from('workflow_progress')
    .select('*')
    .eq('user_id', resolvedUserId)
    .eq('step_id', stepId)

  // 处理 project_id 为 null 的情况
  if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    query = query.is('project_id', null)
  }

  const { data: existing } = await query.single()

  // 若已有 completed 且 status 不是 completed，则保持旧记录
  if (existing && existing.status === 'completed' && status !== 'completed') {
    return existing as WorkflowProgress
  }

  const updateData = {
    status,
    ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {})
  }

  let result
  if (existing) {
    // 更新已有记录
    const { data, error } = await supabase
      .from('workflow_progress')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating step progress:', error)
      return null
    }
    result = data
  } else {
    // 插入新记录
    const { data, error } = await supabase
      .from('workflow_progress')
      .insert({
        user_id: resolvedUserId,
        project_id: projectId || null,
        step_id: stepId,
        ...updateData
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting step progress:', error)
      return null
    }
    result = data
  }

  return result
}

export async function getUserProgress(projectId?: string, userId?: string): Promise<WorkflowProgress[]> {
  const supabase = getSupabaseClient()
  const resolvedUserId = await resolveUserId(supabase, userId)

  if (!resolvedUserId) return []

  let query = supabase
    .from('workflow_progress')
    .select('*')
    .eq('user_id', resolvedUserId)

  if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    query = query.is('project_id', null)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error getting user progress:', error)
    return []
  }

  return data || []
}

export async function getCompletedSteps(projectId?: string, userId?: string): Promise<string[]> {
  const progress = await getUserProgress(projectId, userId)
  return progress
    .filter(p => p.status === 'completed')
    .map(p => p.step_id)
}
