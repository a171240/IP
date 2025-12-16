"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Database,
  Download,
  FileText,
  FolderOpen,
  Grid,
  Layers,
  List,
  Loader2,
  PenTool,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  Users,
  X
} from "lucide-react"
import Link from "next/link"

import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import { useAuth } from "@/contexts/auth-context"
import {
  deleteReport,
  getReport,
  getUserReportList,
  type Report,
  type ReportListItem
} from "@/lib/supabase"

type ContentType = "all" | "P1" | "P2" | "P3" | "IP传记" | "P4" | "P5" | "P6"

type StepConfig = {
  icon: React.ElementType
  color: string
  bg: string
  border: string
  label: string
  phase: string
}

const stepConfig: Record<string, StepConfig> = {
  P1: {
    icon: Target,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    label: "行业目标分析",
    phase: "研究定位"
  },
  P2: {
    icon: Layers,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    label: "行业认知深度",
    phase: "研究定位"
  },
  P3: {
    icon: Sparkles,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    label: "情绪价值分析",
    phase: "研究定位"
  },
  "IP传记": {
    icon: FileText,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    label: "IP传记",
    phase: "研究定位"
  },
  P4: {
    icon: Users,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    label: "IP概念生成",
    phase: "人设构建"
  },
  P5: {
    icon: PenTool,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    label: "IP类型定位",
    phase: "人设构建"
  },
  P6: {
    icon: Database,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    label: "4X4内容规划",
    phase: "人设构建"
  }
}

const filterOptions: Array<{ value: ContentType; label: string }> = [
  { value: "all", label: "全部报告" },
  { value: "P1", label: "行业目标分析" },
  { value: "P2", label: "行业认知深度" },
  { value: "P3", label: "情绪价值分析" },
  { value: "IP传记", label: "IP传记" },
  { value: "P4", label: "IP概念生成" },
  { value: "P5", label: "IP类型定位" },
  { value: "P6", label: "4X4内容规划" }
]

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (hours < 1) return "刚刚"
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString("zh-CN")
}

function downloadMarkdown(opts: { title: string; content: string; createdAt: string }) {
  const safeTitle = opts.title
    .replace(/[\u300a\u300b]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()

  const fileName = `${safeTitle || "report"}_${new Date(opts.createdAt).toISOString().split("T")[0]}.md`
  const blob = new Blob([opts.content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ReportsPage() {
  const { user, loading: authLoading } = useAuth()

  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<ContentType>("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const [reports, setReports] = useState<ReportListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selectedReportMeta, setSelectedReportMeta] = useState<ReportListItem | null>(null)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [selectedReportError, setSelectedReportError] = useState<string | null>(null)
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null)

  const reportCacheRef = useRef<Map<string, Report>>(new Map())

  const [isCopied, setIsCopied] = useState(false)

  const [reportPendingDelete, setReportPendingDelete] = useState<ReportListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 150)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const loadReports = async () => {
      if (!user || authLoading) return

      setIsLoading(true)
      try {
        const userReports = await getUserReportList(undefined, user.id)
        setReports(userReports)
      } catch (error) {
        console.error("Failed to load reports:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadReports()
  }, [user, authLoading])

  const ensureReportLoaded = async (reportId: string) => {
    const cached = reportCacheRef.current.get(reportId)
    if (cached) return cached

    setLoadingReportId(reportId)
    try {
      const full = await getReport(reportId)
      if (full) reportCacheRef.current.set(reportId, full)
      return full
    } finally {
      setLoadingReportId((prev) => (prev === reportId ? null : prev))
    }
  }

  useEffect(() => {
    if (!selectedReportMeta) return

    let cancelled = false
    setSelectedReport(null)
    setSelectedReportError(null)

    ;(async () => {
      const full = await ensureReportLoaded(selectedReportMeta.id)
      if (cancelled) return
      if (!full) {
        setSelectedReportError("无法加载报告内容")
        return
      }
      setSelectedReport(full)
    })()

    return () => {
      cancelled = true
    }
  }, [selectedReportMeta?.id])

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return reports.filter((report) => {
      const matchesFilter = activeFilter === "all" || report.step_id === activeFilter
      if (!matchesFilter) return false
      if (!q) return true

      const haystack = `${report.title} ${(report.summary ?? "")} `.toLowerCase()
      return haystack.includes(q)
    })
  }, [reports, activeFilter, searchQuery])

  const phaseStats = useMemo(() => {
    const researchSteps = new Set(["P1", "P2", "P3", "IP传记"])
    const personaSteps = new Set(["P4", "P5", "P6"])

    let research = 0
    let persona = 0

    for (const report of reports) {
      if (researchSteps.has(report.step_id)) research += 1
      if (personaSteps.has(report.step_id)) persona += 1
    }

    return {
      research,
      persona,
      total: reports.length
    }
  }, [reports])

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error("Copy failed:", error)
    }
  }

  const handleCopyById = async (reportId: string) => {
    const full = await ensureReportLoaded(reportId)
    if (!full) return
    await handleCopy(full.content)
  }

  const handleDownloadByMeta = async (report: ReportListItem) => {
    const full = await ensureReportLoaded(report.id)
    if (!full) return
    downloadMarkdown({ title: full.title, content: full.content, createdAt: full.created_at })
  }

  const handleOpenReport = (report: ReportListItem) => {
    setSelectedReportMeta(report)
  }

  const handleCloseReport = () => {
    setSelectedReportMeta(null)
    setSelectedReport(null)
    setSelectedReportError(null)
  }

  const handleDeleteRequest = (report: ReportListItem) => {
    setDeleteError(null)
    setReportPendingDelete(report)
  }

  const handleCancelDelete = () => {
    if (isDeleting) return
    setReportPendingDelete(null)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    if (!reportPendingDelete) return

    setIsDeleting(true)
    setDeleteError(null)
    try {
      const ok = await deleteReport(reportPendingDelete.id)
      if (!ok) {
        setDeleteError("删除失败，请重试")
        return
      }

      reportCacheRef.current.delete(reportPendingDelete.id)
      setReports((prev) => prev.filter((r) => r.id !== reportPendingDelete.id))

      if (selectedReportMeta?.id === reportPendingDelete.id) {
        handleCloseReport()
      }

      setReportPendingDelete(null)
    } catch (error) {
      console.error("Delete report failed:", error)
      setDeleteError("删除失败，请重试")
    } finally {
      setIsDeleting(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen">
        <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "报告库" }]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <GlassCard className="p-8 text-center">
            <Loader2 size={32} className="animate-spin text-purple-400 mx-auto mb-4" />
            <h2 className="text-lg font-medium dark:text-white text-zinc-900 mb-2">加载报告中...</h2>
            <p className="text-sm dark:text-zinc-400 text-zinc-500">请稍候</p>
          </GlassCard>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "报告库" }]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <GlassCard className="p-8 text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <FileText size={28} className="text-purple-400" />
            </div>
            <h2 className="text-xl font-semibold dark:text-white text-zinc-900 mb-2">请先登录</h2>
            <p className="dark:text-zinc-400 text-zinc-500 mb-6">登录后即可查看您的报告</p>
            <Link href="/auth/login">
              <GlowButton primary>去登录</GlowButton>
            </Link>
          </GlassCard>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "报告库" }]} />

      <main className="p-6 lg:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-medium dark:text-white text-zinc-900 tracking-tight mb-2">报告库</h1>
            <p className="dark:text-zinc-400 text-zinc-500 text-sm">查看和管理所有已生成的报告</p>
          </div>
          <Link href="/dashboard/workflow">
            <GlowButton primary>
              <Plus size={16} />
              创建新报告
            </GlowButton>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Target size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold dark:text-white text-zinc-900">{phaseStats.research}</p>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">研究定位报告</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Users size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold dark:text-white text-zinc-900">{phaseStats.persona}</p>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">人设构建报告</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <FileText size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold dark:text-white text-zinc-900">{phaseStats.total}</p>
                <p className="text-xs dark:text-zinc-400 text-zinc-500">报告总数</p>
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-purple-400 transition-colors duration-300"
              />
              <input
                type="text"
                placeholder="搜索标题/内容..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-12 pr-4 py-3 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-white text-zinc-900 placeholder:text-zinc-500 transition-all duration-300 ease-out focus:outline-none focus:bg-gradient-to-br focus:from-purple-500/10 focus:to-transparent focus:border-purple-500/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.15),inset_0_0_15px_rgba(168,85,247,0.05)]"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setActiveFilter(option.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-300 ease-out ${
                    activeFilter === option.value
                      ? "bg-gradient-to-br from-purple-500/15 to-purple-900/10 text-purple-400 border border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                      : "dark:bg-zinc-900/50 bg-zinc-100 text-zinc-500 border dark:border-white/10 border-black/10 hover:text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/40 hover:shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  viewMode === "grid"
                    ? "bg-gradient-to-br from-purple-500/20 to-purple-900/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                    : "text-zinc-500 hover:text-purple-300 hover:bg-purple-500/10"
                }`}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  viewMode === "list"
                    ? "bg-gradient-to-br from-purple-500/20 to-purple-900/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                    : "text-zinc-500 hover:text-purple-300 hover:bg-purple-500/10"
                }`}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </GlassCard>

        {filteredReports.length > 0 ? (
          <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
            {filteredReports.map((report) => {
              const config = stepConfig[report.step_id] || {
                icon: FileText,
                color: "text-zinc-400",
                bg: "bg-zinc-500/10",
                border: "border-zinc-500/20",
                label: report.step_id,
                phase: "其他"
              }
              const Icon = config.icon
              const preview = (report.summary ?? "").trim() || "暂无摘要信息"

              if (viewMode === "grid") {
                return (
                  <GlassCard
                    key={report.id}
                    hover
                    onClick={() => handleOpenReport(report)}
                    className="p-5 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-11 h-11 rounded-xl ${config.bg} ${config.border} border flex items-center justify-center`}>
                        <Icon size={20} className={config.color} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded dark:bg-zinc-800 bg-zinc-200 text-zinc-400">
                          {report.step_id}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
                          {config.phase}
                        </span>
                      </div>
                    </div>

                    <h3 className="dark:text-white text-zinc-900 font-medium mb-2 dark:group-hover:text-purple-100 group-hover:text-purple-600 transition-colors">
                      {report.title}
                    </h3>
                    <p className="text-xs dark:text-zinc-400 text-zinc-500 leading-relaxed line-clamp-2 mb-4">
                      {preview}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t dark:border-white/5 border-black/5">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <Clock size={12} />
                        <span>{formatRelativeDate(report.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleCopyById(report.id)
                          }}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-purple-400 transition-colors"
                          title={loadingReportId === report.id ? "加载中..." : "复制"}
                        >
                          {loadingReportId === report.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDownloadByMeta(report)
                          }}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-purple-400 transition-colors"
                          title={loadingReportId === report.id ? "加载中..." : "下载"}
                        >
                          {loadingReportId === report.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Download size={14} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteRequest(report)
                          }}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                )
              }

              return (
                <GlassCard
                  key={report.id}
                  hover
                  onClick={() => handleOpenReport(report)}
                  className="p-4 cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl ${config.bg} ${config.border} border flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon size={22} className={config.color} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <h3 className="dark:text-white text-zinc-900 font-medium truncate dark:group-hover:text-purple-100 group-hover:text-purple-600 transition-colors">
                          {report.title}
                        </h3>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded dark:bg-zinc-800 bg-zinc-200 text-zinc-400">
                          {report.step_id}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.bg} ${config.color} ${config.border}`}
                        >
                          {config.phase}
                        </span>
                      </div>
                      <p className="text-xs dark:text-zinc-400 text-zinc-500 truncate mt-1">{preview}</p>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <Clock size={12} />
                        <span>{formatRelativeDate(report.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleCopyById(report.id)
                          }}
                          className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-purple-400 transition-colors"
                          title={loadingReportId === report.id ? "加载中..." : "复制"}
                        >
                          {loadingReportId === report.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDownloadByMeta(report)
                          }}
                          className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-purple-400 transition-colors"
                          title={loadingReportId === report.id ? "加载中..." : "下载"}
                        >
                          {loadingReportId === report.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Download size={16} />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteRequest(report)
                          }}
                          className="p-2 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-colors"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        ) : (
          <GlassCard className="p-12">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 flex items-center justify-center mx-auto mb-6">
                <FolderOpen size={36} className="text-zinc-600" />
              </div>
              <h3 className="text-lg font-medium dark:text-white text-zinc-900 mb-2">
                {searchQuery ? "没有找到匹配的报告" : "还没有报告"}
              </h3>
              <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-6">
                {searchQuery ? "试试其他搜索关键词" : "开始使用工作流生成您的第一份报告"}
              </p>
              <Link href="/dashboard/workflow">
                <GlowButton primary>
                  <Sparkles size={16} />
                  开始创建报告
                </GlowButton>
              </Link>
            </div>
          </GlassCard>
        )}
      </main>

      {reportPendingDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <GlassCard className="w-full max-w-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={22} className="text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium dark:text-white text-zinc-900">确认删除此报告？</h3>
                <p className="text-sm dark:text-zinc-400 text-zinc-500 mt-1 break-words">{reportPendingDelete.title}</p>

                {deleteError && <p className="text-sm text-red-400 mt-3">{deleteError}</p>}

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={handleCancelDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 rounded-xl text-sm font-medium dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <GlowButton primary onClick={handleConfirmDelete} disabled={isDeleting}>
                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    删除
                  </GlowButton>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {selectedReportMeta && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <GlassCard className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b dark:border-white/5 border-black/5">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg ${stepConfig[selectedReportMeta.step_id]?.bg || "bg-zinc-500/10"} ${
                    stepConfig[selectedReportMeta.step_id]?.border || "border-zinc-500/20"
                  } border flex items-center justify-center`}
                >
                  {(() => {
                    const Icon = stepConfig[selectedReportMeta.step_id]?.icon || FileText
                    return (
                      <Icon
                        size={16}
                        className={stepConfig[selectedReportMeta.step_id]?.color || "text-zinc-400"}
                      />
                    )
                  })()}
                </div>
                <div>
                  <h2 className="text-base font-medium dark:text-white text-zinc-900">{selectedReportMeta.title}</h2>
                  <p className="text-xs dark:text-zinc-400 text-zinc-500">{formatRelativeDate(selectedReportMeta.created_at)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!selectedReport) return
                    void handleCopy(selectedReport.content)
                  }}
                  disabled={!selectedReport || loadingReportId === selectedReportMeta.id}
                  className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                  title="复制"
                >
                  {isCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>
                <button
                  onClick={() => {
                    if (!selectedReport) return
                    downloadMarkdown({
                      title: selectedReport.title,
                      content: selectedReport.content,
                      createdAt: selectedReport.created_at
                    })
                  }}
                  disabled={!selectedReport || loadingReportId === selectedReportMeta.id}
                  className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                  title="下载 Markdown"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => handleDeleteRequest(selectedReportMeta)}
                  className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-red-400 transition-colors"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={handleCloseReport}
                  className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {selectedReportError ? (
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 text-red-400">
                    <AlertCircle size={18} />
                    <p className="text-sm">{selectedReportError}</p>
                  </div>
                </GlassCard>
              ) : !selectedReport ? (
                <div className="flex items-center justify-center p-10">
                  <div className="flex items-center gap-3 text-zinc-400">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm">正在加载报告内容...</span>
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm dark:text-zinc-300 text-zinc-700 leading-relaxed font-sans">
                    {selectedReport.content}
                  </pre>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
