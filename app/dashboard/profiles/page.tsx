"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Target,
  BookOpen,
  Layers,
  PenTool,
  ChevronDown,
  ChevronRight,
  Download,
  ArrowRight,
  Video,
  Sparkles,
  Mic,
  ShieldCheck,
  Copy,
  Quote,
  Heart,
  Megaphone,
  Package,
  Building,
  Flame,
  RotateCcw,
  Factory,
  Stethoscope,
  Handshake,
  BarChart3,
  Users,
  MessageCircle,
  MessageSquare,
  MessageSquareMore,
  ClipboardCheck,
  Bot,
  BotMessageSquare,
  Type,
  Zap,
  TrendingUp,
  Lightbulb,
  Store,
  Presentation,
  Play,
  ExternalLink,
  Compass,
  LayoutGrid,
  FileEdit,
  RefreshCw,
  Newspaper,
  Grid3X3,
  BookHeart,
  FileText,
  Film,
  Briefcase,
  Podcast,
  HelpCircle,
  FileSearch,
  Mic2,
  LayoutPanelLeft,
  SquareSplitHorizontal,
  UtensilsCrossed,
  Image,
  UserPlus,
  GraduationCap,
  HeartHandshake,
  Shield,
  Palette,
  LayoutDashboard,
  Grid2X2,
  Share2,
  Music,
  FileType,
  Scissors,
  ShieldAlert,
  Moon,
  KeyRound,
  AlignLeft,
  Eye,
} from "lucide-react"
import { GlassCard, GlowButton, Header } from "@/components/ui/obsidian"
import {
  quickAccessConfig,
  agentsConfig,
  solutionPacksConfig,
  sceneConfig,
  getAgentsByScene,
  getTotalAgentCount,
  type AgentScene,
  type AgentConfig,
} from "@/lib/agents/config"

// 图标映射
const iconMap: Record<string, React.ElementType> = {
  Target,
  BookOpen,
  Layers,
  PenTool,
  Video,
  Sparkles,
  Mic,
  ShieldCheck,
  Copy,
  Quote,
  Heart,
  Megaphone,
  Package,
  Building,
  Flame,
  RotateCcw,
  Factory,
  Stethoscope,
  Handshake,
  BarChart3,
  Users,
  MessageCircle,
  MessageSquare,
  MessageSquareMore,
  ClipboardCheck,
  Bot,
  BotMessageSquare,
  Type,
  Zap,
  TrendingUp,
  Lightbulb,
  Search,
  Store,
  Presentation,
  Compass,
  LayoutGrid,
  FileEdit,
  RefreshCw,
  Newspaper,
  Grid3X3,
  BookHeart,
  FileText,
  Film,
  Briefcase,
  Podcast,
  HelpCircle,
  FileSearch,
  Mic2,
  LayoutPanelLeft,
  SquareSplitHorizontal,
  UtensilsCrossed,
  Image,
  UserPlus,
  GraduationCap,
  HeartHandshake,
  Shield,
  Palette,
  LayoutDashboard,
  Grid2X2,
  Share2,
  Music,
  FileType,
  Scissors,
  ShieldAlert,
  Moon,
  KeyRound,
  AlignLeft,
  Eye,
}

// 场景颜色映射
const sceneColorMap: Record<AgentScene, { bg: string; border: string; text: string; gradient: string }> = {
  workflow: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-400",
    gradient: "from-violet-500/20 to-violet-900/10",
  },
  research: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-400",
    gradient: "from-purple-500/20 to-purple-900/10",
  },
  creation: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    gradient: "from-emerald-500/20 to-emerald-900/10",
  },
  topic: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    gradient: "from-blue-500/20 to-blue-900/10",
  },
  marketing: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    gradient: "from-amber-500/20 to-amber-900/10",
  },
  efficiency: {
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    text: "text-zinc-400",
    gradient: "from-zinc-500/20 to-zinc-900/10",
  },
}

// 解决方案包颜色
const packColorMap: Record<string, { bg: string; border: string; text: string }> = {
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
  pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400" },
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400" },
}

// 场景显示顺序
const sceneOrder: AgentScene[] = ["workflow", "research", "creation", "topic", "marketing", "efficiency"]

export default function AgentsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"agents" | "packs">("agents")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedScenes, setExpandedScenes] = useState<Set<AgentScene>>(new Set(["workflow", "research"]))

  const agentsByScene = getAgentsByScene()
  const totalAgentCount = getTotalAgentCount()

  // 切换场景展开状态
  const toggleScene = (scene: AgentScene) => {
    const newExpanded = new Set(expandedScenes)
    if (newExpanded.has(scene)) {
      newExpanded.delete(scene)
    } else {
      newExpanded.add(scene)
    }
    setExpandedScenes(newExpanded)
  }

  // 搜索过滤
  const filterAgents = (agents: AgentConfig[]) => {
    if (!searchQuery) return agents
    const query = searchQuery.toLowerCase()
    return agents.filter(
      agent =>
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query)
    )
  }

  // 跳转到工作流步骤
  const goToWorkflow = (stepId: string) => {
    router.push(`/dashboard/workflow/${encodeURIComponent(stepId)}`)
  }

  // 处理智能体点击
  const handleAgentClick = (agent: AgentConfig) => {
    if (agent.workflowStepId) {
      goToWorkflow(agent.workflowStepId)
    } else if (agent.isCollection) {
      // TODO: 打开集合选择Modal或跳转
      console.log("Open collection:", agent.id)
    } else {
      // TODO: 跳转到独立智能体页面
      console.log("Open agent:", agent.id)
    }
  }

  // 下载解决方案包
  const handleDownload = async (packId: string) => {
    window.open(`/api/download/${packId}`, "_blank")
  }

  // 获取图标组件
  const getIcon = (iconName: string) => {
    return iconMap[iconName] || Lightbulb
  }

  return (
    <div className="min-h-screen">
      <Header breadcrumbs={[{ label: "首页", href: "/dashboard" }, { label: "智能体" }]} />

      <main className="p-6 lg:p-8">
        {/* 页面标题 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-medium dark:text-white text-zinc-900 tracking-tight mb-2">
              智能体库
            </h1>
            <p className="dark:text-zinc-400 text-zinc-500 text-sm">
              {totalAgentCount}+ AI智能体，覆盖内容创作全流程
            </p>
          </div>
        </div>

        {/* 快捷入口 */}
        <div className="mb-8">
          <h2 className="text-sm font-medium dark:text-white text-zinc-900 mb-4 flex items-center gap-2">
            <Play size={16} className="text-purple-400" />
            快捷工作流
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quickAccessConfig.map((item) => {
              const Icon = getIcon(item.icon)
              return (
                <GlassCard
                  key={item.id}
                  hover
                  className="p-4 cursor-pointer group"
                  onClick={() => item.workflowStepId && goToWorkflow(item.workflowStepId)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/30 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon size={18} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium dark:text-white text-zinc-900 mb-0.5 group-hover:text-purple-400 transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-xs dark:text-zinc-400 text-zinc-500 line-clamp-1">
                        {item.description}
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-zinc-600 group-hover:text-purple-400 transition-colors mt-1" />
                  </div>
                </GlassCard>
              )
            })}
          </div>
        </div>

        {/* 搜索和Tab */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1 group">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-purple-400 transition-colors"
            />
            <input
              type="text"
              placeholder="搜索智能体..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl dark:text-white text-zinc-900 placeholder:text-zinc-500 transition-all focus:outline-none focus:border-purple-500/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.15)]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 dark:bg-zinc-900/50 bg-zinc-100 border dark:border-white/10 border-black/10 rounded-xl">
            <button
              onClick={() => setActiveTab("agents")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "agents"
                  ? "bg-gradient-to-br from-purple-500/20 to-purple-900/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                  : "text-zinc-500 hover:text-purple-300"
              }`}
            >
              智能体库
            </button>
            <button
              onClick={() => setActiveTab("packs")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "packs"
                  ? "bg-gradient-to-br from-purple-500/20 to-purple-900/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                  : "text-zinc-500 hover:text-purple-300"
              }`}
            >
              解决方案包
            </button>
          </div>
        </div>

        {/* 智能体库 Tab */}
        {activeTab === "agents" && (
          <div className="space-y-4">
            {sceneOrder.map((scene) => {
              const agents = filterAgents(agentsByScene[scene] || [])
              if (agents.length === 0 && searchQuery) return null

              const config = sceneConfig[scene]
              const colors = sceneColorMap[scene]
              const isExpanded = expandedScenes.has(scene)
              const SceneIcon = getIcon(config.icon)

              return (
                <GlassCard key={scene} className="overflow-hidden">
                  {/* 场景标题 */}
                  <button
                    onClick={() => toggleScene(scene)}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center`}>
                        <SceneIcon size={18} className={colors.text} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-medium dark:text-white text-zinc-900">
                          {config.name}
                        </h3>
                        <p className="text-xs dark:text-zinc-400 text-zinc-500">
                          {agents.length} 个智能体
                        </p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown size={18} className="text-zinc-500" />
                    ) : (
                      <ChevronRight size={18} className="text-zinc-500" />
                    )}
                  </button>

                  {/* 智能体列表 */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {agents.map((agent) => {
                          const AgentIcon = getIcon(agent.icon)
                          return (
                            <div
                              key={agent.id}
                              onClick={() => handleAgentClick(agent)}
                              className={`p-4 rounded-xl bg-gradient-to-br ${colors.gradient} border ${colors.border} cursor-pointer group hover:scale-[1.02] transition-all`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-9 h-9 rounded-lg ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
                                  <AgentIcon size={16} className={colors.text} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-medium dark:text-white text-zinc-900 truncate group-hover:text-purple-400 transition-colors">
                                      {agent.name}
                                    </h4>
                                    {agent.isCollection && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-400">
                                        {agent.collectionCount}个
                                      </span>
                                    )}
                                    {agent.workflowStepId && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                        工作流
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs dark:text-zinc-400 text-zinc-500 mt-1 line-clamp-2">
                                    {agent.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </GlassCard>
              )
            })}
          </div>
        )}

        {/* 解决方案包 Tab */}
        {activeTab === "packs" && (
          <div className="grid md:grid-cols-2 gap-4">
            {solutionPacksConfig.map((pack) => {
              const colors = packColorMap[pack.color] || packColorMap.indigo
              const PackIcon = getIcon(pack.icon)

              return (
                <GlassCard key={pack.id} className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl ${colors.bg} border ${colors.border} flex items-center justify-center shrink-0`}>
                      <PackIcon size={24} className={colors.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-medium dark:text-white text-zinc-900">
                          {pack.name}
                        </h3>
                        {pack.memberOnly && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            会员
                          </span>
                        )}
                      </div>
                      <p className="text-sm dark:text-zinc-400 text-zinc-500 mb-3">
                        {pack.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {pack.modules.slice(0, 5).map((module) => (
                          <span
                            key={module}
                            className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400"
                          >
                            {module}
                          </span>
                        ))}
                        {pack.modules.length > 5 && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400">
                            +{pack.modules.length - 5}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs dark:text-zinc-400 text-zinc-500">
                          共 {pack.moduleCount} 个模块
                        </span>
                        {pack.downloadable && (
                          <GlowButton
                            onClick={() => handleDownload(pack.id)}
                            className="text-xs"
                          >
                            <Download size={14} />
                            下载 .md
                          </GlowButton>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
