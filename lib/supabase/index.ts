// Supabase 客户端 (仅浏览器端)
export { createClient, getSupabaseClient } from './client'
// 注意: createServerSupabaseClient 需要直接从 './server' 导入，仅在服务器组件中使用

// 认证相关
export {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  getSession,
  ensureSessionFromUrl,
  getProfile,
  updateProfile,
  onAuthStateChange,
  resetPassword,
  updatePassword,
  isAuthenticated,
  getUserPlan
} from './auth'
export type { Profile } from './auth'

// 数据库操作
export {
  // 对话
  createConversation,
  getConversation,
  getLatestConversation,
  updateConversationMessages,
  completeConversation,
  setConversationStatus,
  getUserConversations,
  getStepConversations,
  // 报告
  saveReport,
  getReport,
  getLatestReportByConversation,
  getLatestReport,
  getUserReports,
  getUserReportList,
  getUserReportsPreview,
  getUserReportCount,
  deleteReport,
  // 知识库
  saveKnowledgeDoc,
  getActiveKnowledgeDoc,
  getUserKnowledgeDocs,
  // 工作流进度
  updateStepProgress,
  getUserProgress,
  getCompletedSteps
} from './database'
export type {
  Message,
  Conversation,
  Report,
  KnowledgeDoc,
  WorkflowProgress,
  ReportPreview,
  ReportListItem
} from './database'
